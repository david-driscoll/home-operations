/**
 * node --test components/netbird/backup.test.ts
 *
 * NetBird's 15-minute backups and the restore that runs before the server
 * starts (#2884). The rendered scripts are run for real under bash, against a
 * fake `docker` that records every call and answers from environment
 * variables, so the restore decision is tested as the VM will execute it.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BACKUP_INTERVAL_MINUTES,
  BACKUP_STALE_AFTER_MINUTES,
  backupHeartbeat,
  backupPaths,
  RETENTION,
  renderBackupScript,
  renderBackupUnits,
  renderResticEnv,
  renderRestoreScript,
  resticForgetArgs,
  resticRepository,
} from "./backup.ts";

// Answers the calls the scripts make, by pattern, from FAKE_* variables.
// Every call is appended to $FAKE_LOG, one line each (newlines in a script
// argument folded to spaces).
const FAKE_DOCKER = `#!/usr/bin/env bash
args="$*"
printf '%s\\n' "\${args//$'\\n'/ }" >> "$FAKE_LOG"
case "$args" in
  "inspect "*) [ -n "\${FAKE_SERVER_RUNNING:-}" ] || exit 1; echo "$FAKE_SERVER_RUNNING"; exit 0 ;;
  "volume inspect "*) [ -n "\${FAKE_VOLUME:-}" ] || { echo "no such volume" >&2; exit 1; }; echo "$FAKE_VOLUME"; exit 0 ;;
esac
case "$args" in
  *backup-sqlite*) exit "\${FAKE_SQLITE_RC:-0}" ;;
  *backup-restic*"cat config"*) exit "\${FAKE_REPO_RC:-0}" ;;
  *backup-restic*snapshots*) printf '%s\\n' "\${FAKE_LATEST:-}"; exit "\${FAKE_SNAPSHOTS_RC:-0}" ;;
  *backup-restic*" restore "*) echo "restoring snapshot"; exit "\${FAKE_RESTORE_RC:-0}" ;;
  *backup-restic*" backup "*) exit "\${FAKE_BACKUP_RC:-0}" ;;
  *) exit 0 ;;
esac
`;

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[];
  dir: string;
}

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "netbird-backup-"));
  const bin = join(root, "bin");
  const dir = join(root, "opt-netbird");
  mkdirSync(bin);
  mkdirSync(join(dir, "backup"), { recursive: true });
  writeFileSync(join(bin, "docker"), FAKE_DOCKER);
  chmodSync(join(bin, "docker"), 0o755);
  writeFileSync(join(dir, "config.yaml"), "server: {}\n");
  return { root, bin, dir };
}

/** `prepare` sets the sandbox up and may return more FAKE_* variables (paths it created). */
function run(script: (dir: string) => string, env: Record<string, string>, prepare?: (box: ReturnType<typeof sandbox>) => Record<string, string> | void): Run {
  const box = sandbox();
  env = { ...env, ...(prepare?.(box) ?? {}) };
  const path = join(box.root, "script.sh");
  writeFileSync(path, script(box.dir));
  const log = join(box.root, "calls.log");
  writeFileSync(log, "");
  const result = spawnSync("bash", [path], { encoding: "utf8", env: { PATH: `${box.bin}:/usr/bin:/bin`, FAKE_LOG: log, ...env } });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls: readFileSync(log, "utf8").split("\n").filter(Boolean), dir: box.dir };
}

const withCredentials = (box: ReturnType<typeof sandbox>) => writeFileSync(join(box.dir, "backup", "restic.env"), "RESTIC_REPOSITORY='s3:https://x/y'\n");
const volume = (box: ReturnType<typeof sandbox>, store: string | undefined) => {
  const path = join(box.root, "volume");
  mkdirSync(path);
  if (store !== undefined) writeFileSync(join(path, "store.db"), store);
  return { FAKE_VOLUME: path };
};

const restore = (dir: string) => renderRestoreScript({ dir });
const lastLine = (text: string) => text.trim().split("\n").at(-1);

describe("renderRestoreScript: restores only an empty store, and fails closed", () => {
  it("leaves a store that is already there alone, without asking the repository", () => {
    const result = run(restore, {}, box => {
      withCredentials(box);
      return volume(box, "SQLite format 3");
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lastLine(result.stdout), "netbird-restore: present");
    assert.ok(!result.calls.some(call => call.includes("backup-restic")), "no restic call for a present store");
  });

  it("restores into a volume that exists but holds no store", () => {
    for (const store of [undefined, ""]) {
      const result = run(restore, { FAKE_REPO_RC: "0", FAKE_LATEST: "4f2a9c1e" }, box => {
        withCredentials(box);
        return volume(box, store);
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(lastLine(result.stdout), "netbird-restore: restored 4f2a9c1e");
    }
  });

  it("restores the newest snapshot into an empty volume and leaves a marker", () => {
    const result = run(restore, { FAKE_REPO_RC: "0", FAKE_LATEST: "4f2a9c1e" }, withCredentials);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lastLine(result.stdout), "netbird-restore: restored 4f2a9c1e");
    const restoreCall = result.calls.find(call => call.includes(" restore "));
    assert.ok(restoreCall?.includes("4f2a9c1e"), `restore called with the snapshot id: ${restoreCall}`);
    const marker = join(result.dir, "backup", "restored-from");
    assert.ok(existsSync(marker), "marker written");
    assert.match(readFileSync(marker, "utf8"), /^4f2a9c1e /);
  });

  it("treats a missing repository as a first install", () => {
    const result = run(restore, { FAKE_REPO_RC: "10" }, withCredentials);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lastLine(result.stdout), "netbird-restore: fresh");
    assert.ok(!result.calls.some(call => call.includes(" restore ")));
    assert.ok(!existsSync(join(result.dir, "backup", "restored-from")));
  });

  it("treats a repository with no snapshots as a first install", () => {
    const result = run(restore, { FAKE_REPO_RC: "0", FAKE_LATEST: "" }, withCredentials);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lastLine(result.stdout), "netbird-restore: fresh");
    assert.ok(!result.calls.some(call => call.includes(" restore ")));
  });

  it("refuses to start on an empty store when the repository cannot be read", () => {
    for (const rc of ["1", "11", "12"]) {
      const result = run(restore, { FAKE_REPO_RC: rc }, withCredentials);
      assert.notEqual(result.status, 0, `restic exit ${rc} must fail the restore`);
      assert.match(result.stderr, /unreachable|cannot read/);
      assert.ok(!existsSync(join(result.dir, "backup", "restored-from")));
    }
  });

  it("refuses when listing snapshots fails", () => {
    const result = run(restore, { FAKE_REPO_RC: "0", FAKE_SNAPSHOTS_RC: "1" }, withCredentials);
    assert.notEqual(result.status, 0);
    assert.ok(!result.calls.some(call => call.includes(" restore ")));
  });

  it("refuses without credentials rather than guessing there is no backup", () => {
    const result = run(restore, {});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /restic\.env/);
  });

  it("fails when the restore itself fails, and leaves no marker", () => {
    const result = run(restore, { FAKE_REPO_RC: "0", FAKE_LATEST: "4f2a9c1e", FAKE_RESTORE_RC: "1" }, withCredentials);
    assert.notEqual(result.status, 0);
    assert.ok(!existsSync(join(result.dir, "backup", "restored-from")));
  });
});

const backup = (dir: string) => renderBackupScript({ dir, host: "netbird-edge", heartbeat: { url: "https://uptime.example.test", token: "netbird-backups_netbird-edge" } });

describe("renderBackupScript", () => {
  it("snapshots the store online, uploads it, applies retention, then reports success", () => {
    const result = run(backup, { FAKE_SERVER_RUNNING: "true" }, withCredentials);
    assert.equal(result.status, 0, result.stderr);
    const order = ["backup-sqlite", " backup ", " forget ", "success=true"].map(needle => result.calls.findIndex(call => call.includes(needle)));
    assert.ok(
      order.every(i => i >= 0),
      `every step ran: ${result.calls.join("\n")}`,
    );
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      "in that order",
    );
    const upload = result.calls.find(call => call.includes(" backup "))!;
    assert.match(upload, /--host netbird-edge/);
    assert.match(upload, /--tag netbird/);
    const forget = result.calls.find(call => call.includes(" forget "))!;
    for (const arg of resticForgetArgs(RETENTION)) assert.ok(forget.includes(arg), `forget carries ${arg}`);
    assert.ok(existsSync(join(result.dir, "backup", "staging", "config.yaml")), "config.yaml staged beside the databases");
  });

  it("never stops the stack: the snapshot is SQLite's online backup", () => {
    const script = backup("/opt/netbird");
    assert.match(script, /\.backup /);
    assert.doesNotMatch(script, /compose (stop|down)|docker stop/);
    assert.match(script, /PRAGMA integrity_check/);
  });

  it("initialises the repository on the first run", () => {
    const result = run(backup, { FAKE_SERVER_RUNNING: "true", FAKE_REPO_RC: "10" }, withCredentials);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.calls.some(call => / init( |$)/.test(call)));
  });

  it("reports the failing step and exits non-zero", () => {
    const result = run(backup, { FAKE_SERVER_RUNNING: "true", FAKE_BACKUP_RC: "1" }, withCredentials);
    assert.notEqual(result.status, 0);
    assert.ok(result.calls.some(call => call.includes("success=false") && call.includes("error=upload")));
    assert.ok(!result.calls.some(call => call.includes("success=true")));
  });

  it("reports a failed snapshot without uploading anything", () => {
    const result = run(backup, { FAKE_SERVER_RUNNING: "true", FAKE_SQLITE_RC: "1" }, withCredentials);
    assert.notEqual(result.status, 0);
    assert.ok(!result.calls.some(call => call.includes(" backup ")));
    assert.ok(result.calls.some(call => call.includes("error=snapshot")));
  });

  it("does nothing while the server is not running, so a fenced standby never overwrites the newest snapshot", () => {
    const result = run(backup, { FAKE_SERVER_RUNNING: "false" }, withCredentials);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.calls.some(call => call.includes("backup-restic") || call.includes("backup-sqlite")));
  });
});

describe("renderBackupUnits", () => {
  const units = renderBackupUnits({ dir: "/opt/netbird" });

  it("fires every 15 minutes and catches up after downtime", () => {
    assert.equal(BACKUP_INTERVAL_MINUTES, 15);
    assert.match(units.timer, /^OnCalendar=\*:0\/15$/m);
    assert.match(units.timer, /^Persistent=true$/m);
    assert.match(units.timer, /^WantedBy=timers\.target$/m);
  });

  it("runs the rendered script once per tick, after Docker", () => {
    assert.match(units.service, /^Type=oneshot$/m);
    assert.match(units.service, /^ExecStart=\/opt\/netbird\/backup\/netbird-backup\.sh$/m);
    assert.match(units.service, /^After=docker\.service network-online\.target$/m);
  });
});

describe("retention", () => {
  it("keeps every 15-minute snapshot for two days, then dailies and weeklies", () => {
    assert.deepEqual(resticForgetArgs(RETENTION), ["--keep-within", "48h", "--keep-daily", "14", "--keep-weekly", "8"]);
  });
});

describe("backupHeartbeat: the stale-backup alert", () => {
  const endpoint = backupHeartbeat({ name: "netbird-edge", group: "NetBird Backups", token: "netbird-backups_netbird-edge" });

  it("pages when no run has reported for 30 minutes: two missed cycles", () => {
    assert.equal(BACKUP_STALE_AFTER_MINUTES, 2 * BACKUP_INTERVAL_MINUTES);
    assert.deepEqual(endpoint.heartbeat, { interval: "30m" });
  });

  it("pages on the first failed run too", () => {
    assert.equal(endpoint.alerts?.[0]?.type, "pushover");
    assert.equal(endpoint.alerts?.[0]?.["failure-threshold"], 1);
    assert.equal(endpoint.token, "netbird-backups_netbird-edge");
  });
});

describe("renderResticEnv", () => {
  const args = { repository: "s3:https://garage-s3.example.test/netbird-backups/server", accessKeyId: "GK123", secretAccessKey: "abc/def+ghi=", password: "p4ss" };

  it("single-quotes every value, so compose reads them literally", () => {
    const env = renderResticEnv(args);
    assert.match(env, /^RESTIC_REPOSITORY='s3:https:\/\/garage-s3\.example\.test\/netbird-backups\/server'$/m);
    assert.match(env, /^AWS_SECRET_ACCESS_KEY='abc\/def\+ghi='$/m);
    assert.match(env, /^RESTIC_PASSWORD='p4ss'$/m);
  });

  it("refuses a value it cannot quote, without echoing it", () => {
    assert.throws(
      () => renderResticEnv({ ...args, password: "it's" }),
      (error: Error) => /RESTIC_PASSWORD/.test(error.message) && !error.message.includes("it's"),
    );
    assert.throws(() => renderResticEnv({ ...args, secretAccessKey: "a\nb" }), /AWS_SECRET_ACCESS_KEY/);
  });
});

describe("resticRepository / backupPaths", () => {
  it("addresses the bucket path-style under one prefix", () => {
    assert.equal(resticRepository({ endpoint: "https://garage-s3.example.test/", bucket: "netbird-backups" }), "s3:https://garage-s3.example.test/netbird-backups/server");
  });

  it("keeps everything under the server directory", () => {
    assert.deepEqual(backupPaths("/opt/netbird"), {
      dir: "/opt/netbird/backup",
      env: "/opt/netbird/backup/restic.env",
      staging: "/opt/netbird/backup/staging",
      backupScript: "/opt/netbird/backup/netbird-backup.sh",
      restoreScript: "/opt/netbird/backup/netbird-restore.sh",
      restoreMarker: "/opt/netbird/backup/restored-from",
    });
  });
});
