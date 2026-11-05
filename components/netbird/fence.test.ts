/**
 * node --test components/netbird/fence.test.ts
 *
 * The DNS-lease fence (#3001). The rendered script runs for real under bash,
 * against a fake `dig` (the zone's nameservers), a fake `docker` (whether
 * netbird-server runs, and the volumes) and a fake `systemctl` (the backup
 * timer), so each decision is tested as the VM executes it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { assertFenceFasterThanFlip, FENCE_GRACE_SECONDS, FENCE_INTERVAL_SECONDS, fencePaths, renderFenceScript, renderFenceUnits } from "./fence.ts";

const OWN = "203.0.113.10";
const OTHER = "198.51.100.20";
const DOMAIN = "netbird.example.test";

// dig: NS answers from FAKE_NS (or fail with FAKE_NS_RC); A answers from
// FAKE_A, space-separated, with FAKE_STATUS/FAKE_FLAGS in the header, or a
// timeout with FAKE_A_RC.
const FAKE_DIG = `#!/usr/bin/env bash
printf 'dig %s\\n' "$*" >> "$FAKE_LOG"
case " $* " in
  *" NS "*)
    [ "\${FAKE_NS_RC:-0}" = 0 ] || { echo ";; connection timed out; no servers could be reached"; exit "$FAKE_NS_RC"; }
    for ns in \${FAKE_NS:-ns1.example.test ns2.example.test}; do echo "$ns."; done
    ;;
  *" A "*)
    [ "\${FAKE_A_RC:-0}" = 0 ] || { echo ";; connection timed out; no servers could be reached"; exit "$FAKE_A_RC"; }
    echo ";; ->>HEADER<<- opcode: QUERY, status: \${FAKE_STATUS:-NOERROR}, id: 1"
    echo ";; flags: \${FAKE_FLAGS:-qr aa}; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1"
    echo ";; ANSWER SECTION:"
    for ip in \${FAKE_A:-}; do printf '%s.\\t60\\tIN\\tA\\t%s\\n' "${DOMAIN}" "$ip"; done
    ;;
esac
`;

const FAKE_DOCKER = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$FAKE_LOG"
case "$*" in
  "inspect "*) [ -n "\${FAKE_RUNNING:-}" ] && echo "$FAKE_RUNNING" ;;
  "volume inspect "*netbird_traefik_letsencrypt) echo "$FAKE_ACME_VOLUME" ;;
  "volume inspect "*netbird_data) echo "$FAKE_VOLUME" ;;
esac
exit 0
`;

const FAKE_SYSTEMCTL = `#!/usr/bin/env bash
printf 'systemctl %s\\n' "$*" >> "$FAKE_LOG"
case "$*" in
  "is-enabled "*) [ -n "\${FAKE_TIMER_ENABLED:-}" ] ;;
  *) exit 0 ;;
esac
`;

// The restore NetbirdServer installs: records how it was called.
const FAKE_RESTORE = `#!/usr/bin/env bash
printf 'restore NETBIRD_RESTORE_ACME=%s\\n' "\${NETBIRD_RESTORE_ACME:-}" >> "$FAKE_LOG"
printf '%b\\n' "\${FAKE_RESTORE_OUT:-netbird-restore: present}"
exit "\${FAKE_RESTORE_RC:-0}"
`;

interface Run {
  status: number | null;
  stdout: string;
  calls: string[];
  last: string;
  box: { root: string; dir: string; volume: string; acme: string };
}

function run(env: Record<string, string>, prepare?: (box: Run["box"]) => void, grace?: number): Run {
  const root = mkdtempSync(join(tmpdir(), "netbird-fence-"));
  const bin = join(root, "bin");
  const dir = join(root, "opt-netbird");
  const volume = join(root, "data");
  const acme = join(root, "letsencrypt");
  for (const d of [bin, join(dir, "backup"), volume, acme]) mkdirSync(d, { recursive: true });
  for (const [name, body] of [
    ["dig", FAKE_DIG],
    ["docker", FAKE_DOCKER],
    ["systemctl", FAKE_SYSTEMCTL],
    // No real lock needed in a sandbox nobody else uses.
    ["flock", "#!/usr/bin/env bash\nexit 0\n"],
  ] as const) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  writeFileSync(join(dir, "backup", "netbird-restore.sh"), FAKE_RESTORE);
  chmodSync(join(dir, "backup", "netbird-restore.sh"), 0o755);
  const box = { root, dir, volume, acme };
  prepare?.(box);
  const script = join(root, "fence.sh");
  writeFileSync(script, renderFenceScript({ dir, domain: DOMAIN, zone: "example.test", ownIp: OWN, graceSeconds: grace }));
  const log = join(root, "calls.log");
  writeFileSync(log, "");
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, FAKE_LOG: log, FAKE_VOLUME: volume, FAKE_ACME_VOLUME: acme, ...env },
  });
  const stdout = result.stdout + result.stderr;
  return { status: result.status, stdout, calls: readFileSync(log, "utf8").split("\n").filter(Boolean), last: result.stdout.trim().split("\n").at(-1) ?? "", box };
}

const composeCalls = (r: Run) => r.calls.filter(c => c.startsWith("docker compose")).map(c => c.replace(/^docker compose --project-directory \S+ -f \S+ /, ""));
const withStore = (box: Run["box"]) => {
  writeFileSync(join(box.volume, "store.db"), "store");
  writeFileSync(join(box.volume, "store.db-wal"), "wal");
  writeFileSync(join(box.acme, "acme.json"), "{}");
};

describe("the fence asks the zone's own nameservers", () => {
  it("looks up the NS set through a public resolver and the record without recursion", () => {
    const r = run({ FAKE_A: OWN });
    assert.ok(r.calls.some(c => /^dig \+short .*NS example\.test @1\.1\.1\.1$/.test(c)));
    assert.ok(r.calls.some(c => /^dig \+norecurse .*A netbird\.example\.test @ns1\.example\.test$/.test(c)));
  });

  it("falls back to the second resolver for the NS set", () => {
    // Every NS lookup fails here, so the lease is unknown; both were asked.
    const r = run({ FAKE_NS_RC: "9" });
    assert.ok(r.calls.some(c => c.endsWith("@9.9.9.9")));
    assert.ok(r.calls.some(c => c.endsWith("@8.8.8.8")));
    assert.equal(r.last, "netbird-fence: idle (unknown)");
  });

  it("ignores an answer that is not authoritative", () => {
    const r = run({ FAKE_A: OWN, FAKE_FLAGS: "qr rd ra" });
    assert.equal(r.last, "netbird-fence: idle (unknown)");
    assert.deepEqual(composeCalls(r), []);
  });

  it("ignores an answer that is not NOERROR", () => {
    const r = run({ FAKE_A: OWN, FAKE_STATUS: "SERVFAIL" });
    assert.equal(r.last, "netbird-fence: idle (unknown)");
  });
});

describe("lease is ours", () => {
  it("starts management, restoring first and taking the snapshot's acme.json", () => {
    const r = run({ FAKE_A: OWN, FAKE_RESTORE_OUT: "netbird-restore: restored the Traefik acme.json\\nnetbird-restore: restored abc123" });
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.last, "netbird-fence: start (mine)");
    assert.ok(r.calls.includes("restore NETBIRD_RESTORE_ACME=replace"));
    // Traefik reads acme.json only at start, then management comes up.
    assert.deepEqual(composeCalls(r), ["restart traefik", "up -d netbird-server dashboard"]);
    assert.ok(r.calls.includes("systemctl enable --now netbird-backup.timer"));
    // The restore runs before anything starts.
    assert.ok(r.calls.indexOf("restore NETBIRD_RESTORE_ACME=replace") < r.calls.findIndex(c => c.includes(" up -d ")));
  });

  it("does not restart Traefik when the store was already present", () => {
    const r = run({ FAKE_A: OWN });
    assert.deepEqual(composeCalls(r), ["up -d netbird-server dashboard"]);
  });

  it("never starts on a failed restore", () => {
    const r = run({ FAKE_A: OWN, FAKE_RESTORE_RC: "1", FAKE_RESTORE_OUT: "netbird-restore: the backup repository is unreachable" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /restore failed; management stays stopped/);
    assert.deepEqual(composeCalls(r), []);
    assert.ok(!r.calls.some(c => c.includes("enable --now netbird-backup.timer")));
  });

  it("keeps a running management and its backups", () => {
    const r = run({ FAKE_A: OWN, FAKE_RUNNING: "true" });
    assert.equal(r.last, "netbird-fence: keep (mine)");
    assert.deepEqual(composeCalls(r), []);
    assert.ok(!r.calls.some(c => c.startsWith("restore")));
    assert.ok(r.calls.includes("systemctl enable --now netbird-backup.timer"));
  });

  it("forgets an earlier unknown lease", () => {
    const r = run({ FAKE_A: OWN, FAKE_RUNNING: "true" }, box => {
      mkdirSync(join(box.dir, "fence"), { recursive: true });
      writeFileSync(join(box.dir, "fence", "unresolved-since"), "1\n");
    });
    assert.ok(!existsSync(join(r.box.dir, "fence", "unresolved-since")));
  });
});

describe("lease is another host's", () => {
  it("demotes a running management: backups off, stopped, store and certificate archived", () => {
    const r = run({ FAKE_A: OTHER, FAKE_RUNNING: "true", FAKE_TIMER_ENABLED: "1" }, withStore);
    assert.equal(r.last, "netbird-fence: demote (other)");
    assert.ok(r.calls.includes("systemctl disable --now netbird-backup.timer"));
    // Traefik last: its restart is what makes the clients redial and follow the lease.
    assert.deepEqual(composeCalls(r), ["stop netbird-server dashboard", "restart traefik"]);
    assert.ok(!existsSync(join(r.box.volume, "store.db")));
    assert.ok(!existsSync(join(r.box.volume, "store.db-wal")));
    assert.ok(!existsSync(join(r.box.acme, "acme.json")));
    const archived = readdirSync(join(r.box.dir, "backup", "demoted"));
    assert.equal(archived.length, 1);
    assert.deepEqual(readdirSync(join(r.box.dir, "backup", "demoted", archived[0])).sort(), ["acme.json", "store.db", "store.db-wal"]);
  });

  it("leaves an idle standby alone, and never starts it", () => {
    const r = run({ FAKE_A: OTHER });
    assert.equal(r.last, "netbird-fence: standby (other)");
    assert.deepEqual(composeCalls(r), []);
    assert.ok(!r.calls.some(c => c.startsWith("restore")));
    assert.ok(!existsSync(join(r.box.dir, "backup", "demoted")));
  });

  it("archives a stale store a stopped host still holds", () => {
    const r = run({ FAKE_A: OTHER }, withStore);
    assert.equal(r.last, "netbird-fence: standby (other)");
    assert.ok(!existsSync(join(r.box.volume, "store.db")));
  });

  it("keeps only the newest three archives", () => {
    const r = run({ FAKE_A: OTHER }, box => {
      withStore(box);
      for (const ts of ["20260101T000000Z", "20260102T000000Z", "20260103T000000Z"]) mkdirSync(join(box.dir, "backup", "demoted", ts), { recursive: true });
    });
    const archived = readdirSync(join(r.box.dir, "backup", "demoted")).sort();
    assert.equal(archived.length, 3);
    assert.ok(!archived.includes("20260101T000000Z"));
  });

  it("stops, without archiving, when the record lists this host among others", () => {
    const r = run({ FAKE_A: `${OTHER} ${OWN}`, FAKE_RUNNING: "true", FAKE_TIMER_ENABLED: "1" }, withStore);
    assert.equal(r.last, "netbird-fence: stop (shared)");
    assert.deepEqual(composeCalls(r), ["stop netbird-server dashboard", "restart traefik"]);
    assert.ok(existsSync(join(r.box.volume, "store.db")));
  });
});

describe("lease is unknown", () => {
  it("holds a running management inside the grace period", () => {
    const r = run({ FAKE_A_RC: "9", FAKE_RUNNING: "true" });
    assert.equal(r.last, "netbird-fence: hold (unknown)");
    assert.deepEqual(composeCalls(r), []);
    assert.ok(existsSync(join(r.box.dir, "fence", "unresolved-since")));
  });

  it("treats an authoritative empty answer (a record being replaced) as unknown, not as another host's", () => {
    const r = run({ FAKE_A: "", FAKE_RUNNING: "true" });
    assert.equal(r.last, "netbird-fence: hold (unknown)");
  });

  it("stops once the grace period is over", () => {
    const r = run({ FAKE_A_RC: "9", FAKE_RUNNING: "true", FAKE_TIMER_ENABLED: "1" }, box => {
      mkdirSync(join(box.dir, "fence"), { recursive: true });
      writeFileSync(join(box.dir, "fence", "unresolved-since"), `${Math.floor(Date.now() / 1000) - 600}\n`);
    });
    assert.equal(r.last, "netbird-fence: stop (unknown)");
    assert.deepEqual(composeCalls(r), ["stop netbird-server dashboard", "restart traefik"]);
    // Not archived: nobody is known to hold the lease.
    assert.ok(!existsSync(join(r.box.dir, "backup", "demoted")));
  });

  it("never starts a stopped management", () => {
    const r = run({ FAKE_A_RC: "9" });
    assert.equal(r.last, "netbird-fence: idle (unknown)");
    assert.deepEqual(composeCalls(r), []);
  });
});

describe("renderFenceScript", () => {
  it("refuses an own address that is not IPv4, and a record outside its zone", () => {
    assert.throws(() => renderFenceScript({ domain: DOMAIN, zone: "example.test", ownIp: "pending" }), /not an IPv4/);
    assert.throws(() => renderFenceScript({ domain: "netbird.other.test", zone: "example.test", ownIp: OWN }), /not in the zone/);
  });

  it("is valid bash", () => {
    const root = mkdtempSync(join(tmpdir(), "netbird-fence-syntax-"));
    const path = join(root, "fence.sh");
    writeFileSync(path, renderFenceScript({ domain: DOMAIN, zone: "example.test", ownIp: OWN }));
    assert.equal(spawnSync("bash", ["-n", path]).status, 0);
  });
});

describe("renderFenceUnits", () => {
  const units = renderFenceUnits();
  it("runs the script as a oneshot after Docker, every interval", () => {
    assert.match(units.service, /Type=oneshot/);
    assert.match(units.service, new RegExp(`ExecStart=${fencePaths().script}`));
    assert.match(units.service, /After=docker\.service/);
    assert.match(units.timer, new RegExp(`OnUnitInactiveSec=${FENCE_INTERVAL_SECONDS}s`));
    assert.match(units.timer, /WantedBy=timers\.target/);
  });
});

describe("assertFenceFasterThanFlip", () => {
  it("passes for the watchdog's five minutes and fails when the fence would still hold", () => {
    assert.doesNotThrow(() => assertFenceFasterThanFlip(5 * 60));
    assert.throws(() => assertFenceFasterThanFlip(FENCE_GRACE_SECONDS), /could overlap/);
  });
});
