/**
 * NetBird's backups and the restore that runs before the server starts (#2884,
 * docs/plans/netbird-mirror.md §F).
 *
 * Pure functions with no Pulumi imports, so `node --test` covers them, scripts
 * included: backup.test.ts runs the rendered bash against a fake `docker`.
 *
 * The flow on the VM:
 *
 *   systemd timer (every 15 min) -> netbird-backup.sh
 *     backup-sqlite  `.backup` of store.db / events.db / idp.db, online, + integrity_check
 *     backup-restic  backup -> Garage (garage-s3 VIP over the tailnet), forget --prune
 *     backup-restic  wget  -> Gatus heartbeat (success, or the failing step)
 *
 *   NetbirdServer, before `docker compose up` -> netbird-restore.sh
 *     store present            -> leave it
 *     repo missing / no snaps  -> fresh (first install; /api/setup may run)
 *     newest snapshot          -> restore into the volume, write the marker
 *     repo unreadable          -> FAIL: never start on an empty store
 *
 * Both tools are pinned images in compose.yaml (profile `backup`), so Renovate
 * keeps them current and the host needs nothing beyond Docker. They run with
 * `dns: 100.100.100.100`: the VM joins the tailnet with --accept-dns=false, so
 * only MagicDNS itself answers the tailnet names.
 */
import type { Alert, ExternalEndpoint } from "@openapi/application-definition.js";
import { NETBIRD_DIR } from "./server.ts";

/** The compose project's data volume (`netbird` project, `netbird_data` volume). */
export const NETBIRD_DATA_VOLUME = "netbird_netbird_data";

/**
 * The SQLite files NetBird v0.82 keeps in its data directory: the management
 * store (management/internals/shared/db: `store.db`), the activity log
 * (management/server/activity/store: `events.db`) and the embedded Dex IdP
 * (combined/cmd/config.go: `idp.db`, which holds the local users and the
 * signing keys). The GeoLite/geonames downloads beside them are re-fetched, so
 * they are not backed up.
 */
export const STORE_FILES = ["store.db", "events.db", "idp.db"] as const;

/** The one file whose absence means "this volume holds no NetBird". */
export const REQUIRED_STORE_FILE = "store.db";

export const BACKUP_INTERVAL_MINUTES = 15;

/** Two missed runs. The Gatus heartbeat pages after this long without a report. */
export const BACKUP_STALE_AFTER_MINUTES = 30;

/** Every snapshot carries it; restore and retention only look at these. */
export const SNAPSHOT_TAG = "netbird";

/**
 * Every 15-minute snapshot for two days (so a bad edit can be walked back to
 * the minute), then one a day for two weeks and one a week for two months. The
 * repo is a few MB; restic deduplicates, so the cost is the snapshot list.
 */
export const RETENTION = { keepWithin: "48h", keepDaily: 14, keepWeekly: 8 } as const;

/** The Garage bucket stacks/system creates, and where it records the key for this stack. */
export const NETBIRD_BACKUP_BUCKET = "netbird-backups";
export const NETBIRD_BACKUP_BAO_PATH = "apps/netbird/garage-backup";

/** The Gatus group the heartbeat is registered under (and its token derived from). */
export const BACKUP_HEARTBEAT_GROUP = "NetBird Backups";

/** Garage signs as its own region and serves path-style only (components/backrestGarage.ts). */
const RESTIC_S3_OPTIONS = "-o s3.region=garage -o s3.bucket-lookup=path";

export function backupPaths(dir: string = NETBIRD_DIR) {
  const backup = `${dir}/backup`;
  return {
    dir: backup,
    /** restic's repository, password and S3 key: compose's env_file for backup-restic. */
    env: `${backup}/restic.env`,
    /** The snapshot being uploaded. compose.yaml mounts it at /staging. */
    staging: `${backup}/staging`,
    backupScript: `${backup}/netbird-backup.sh`,
    restoreScript: `${backup}/netbird-restore.sh`,
    /** Written only by a restore: "<snapshot id> <time>". NetbirdServer's setup refuses to run when it exists. */
    restoreMarker: `${backup}/restored-from`,
  };
}

/** The restic repository: one prefix in the bucket, shared by the primary and the Azure standby (#3001). */
export function resticRepository(args: { endpoint: string; bucket: string; prefix?: string }): string {
  return `s3:${args.endpoint.replace(/\/+$/, "")}/${args.bucket}/${args.prefix ?? "server"}`;
}

export function resticForgetArgs(retention: { keepWithin: string; keepDaily: number; keepWeekly: number }): string[] {
  return ["--keep-within", retention.keepWithin, "--keep-daily", `${retention.keepDaily}`, "--keep-weekly", `${retention.keepWeekly}`];
}

export interface ResticEnvArgs {
  repository: string;
  accessKeyId: string;
  secretAccessKey: string;
  password: string;
}

/**
 * `restic.env`. Single-quoted, which compose's env_file reads literally (no
 * interpolation), so base64 `+/=` survive. A value that cannot be quoted is
 * refused by name; the error never quotes the value, which is a secret.
 */
export function renderResticEnv(args: ResticEnvArgs): string {
  const vars: [string, string][] = [
    ["RESTIC_REPOSITORY", args.repository],
    ["RESTIC_PASSWORD", args.password],
    ["AWS_ACCESS_KEY_ID", args.accessKeyId],
    ["AWS_SECRET_ACCESS_KEY", args.secretAccessKey],
  ];
  const lines = vars.map(([name, value]) => {
    if (/['\n\r]/.test(value)) throw new Error(`${name} contains a quote or a newline, which restic.env cannot carry`);
    return `${name}='${value}'`;
  });
  return `# Rendered by components/netbird/backup.ts (Pulumi). Edits on the VM are overwritten.\n${lines.join("\n")}\n`;
}

/** A path or name baked into a script. Only these characters, so no quoting can go wrong. */
function shellWord(value: string, what: string): string {
  if (!/^[A-Za-z0-9_./:@-]+$/.test(value)) throw new Error(`${what} '${value}' has characters the rendered scripts do not quote`);
  return value;
}

/** What both scripts start with: strict mode and the two ways into the restic image. */
function prelude(dir: string): string {
  return `#!/usr/bin/env bash
# Rendered by components/netbird/backup.ts (Pulumi). Edits on the VM are overwritten.
set -Eeuo pipefail
umask 077
dir=${shellWord(dir, "dir")}
cd "$dir"
# The backup services are compose profile services: \`run\` starts them on
# demand and \`up\` never does.
compose() { docker compose --project-directory "$dir" -f "$dir/compose.yaml" "$@"; }
restic() { compose run --rm -T --no-deps backup-restic ${RESTIC_S3_OPTIONS} "$@"; }
# A shell in the restic image, for steps that need jq or several commands.
# The script sees $R as restic with the S3 options, and its arguments as $1...
restic_sh() {
  local script=$1
  shift
  compose run --rm -T --no-deps --entrypoint /bin/sh backup-restic -euc "set -o pipefail; R='restic ${RESTIC_S3_OPTIONS}'; $script" sh "$@"
}
`;
}

export interface BackupScriptArgs {
  dir?: string;
  /** The snapshot's host: one retention group per server, so a standby never prunes the primary's history. */
  host: string;
  /** Gatus external endpoint: every run reports, and silence past BACKUP_STALE_AFTER_MINUTES pages. */
  heartbeat?: { url: string; token: string };
}

/**
 * netbird-backup.sh, run by the timer. Never stops the stack: SQLite's online
 * backup copies a consistent snapshot while NetBird keeps writing, and every
 * copy has to pass integrity_check before it is uploaded.
 *
 * Does nothing while netbird-server is not running. That is what keeps a
 * fenced standby (#3001) from uploading its stale store as the newest
 * snapshot, and on the primary the heartbeat reports the outage.
 */
export function renderBackupScript(args: BackupScriptArgs): string {
  const dir = args.dir ?? NETBIRD_DIR;
  const paths = backupPaths(dir);
  const dbs = STORE_FILES.join(" ");
  const report = args.heartbeat
    ? `report() {
  local query="success=$1"
  [ "$1" = true ] || query="$query&error=$2"
  compose run --rm -T --no-deps --entrypoint wget backup-restic -q -T 15 -O /dev/null \\
    --header "Authorization: Bearer ${shellWord(args.heartbeat.token, "heartbeat token")}" --post-data "" \\
    "${shellWord(args.heartbeat.url.replace(/\/+$/, ""), "heartbeat url")}/api/v1/endpoints/${args.heartbeat.token}/external?$query" \\
    || echo "netbird-backup: WARN: could not report success=$1 to Gatus" >&2
}`
    : `report() { :; }`;
  return `${prelude(dir)}
host=${shellWord(args.host, "host")}
staging=${paths.staging}
stage=start

# Report every run: success, or the step that failed. A missing report is what
# the heartbeat pages on, so a failed push is only a warning.
${report}
trap 'rc=$?; trap - ERR; echo "netbird-backup: failed at $stage (exit $rc)" >&2; report false "$stage"; exit "$rc"' ERR

if [ "$(docker inspect -f '{{.State.Running}}' netbird-server 2>/dev/null || true)" != true ]; then
  echo "netbird-backup: netbird-server is not running; nothing to back up" >&2
  exit 0
fi

stage=snapshot
rm -rf "$staging"
install -d -m 700 "$staging"
compose run --rm -T --no-deps backup-sqlite /bin/sh -euc '
for db in ${dbs}; do
  src="/var/lib/netbird/$db"
  if [ ! -f "$src" ]; then
    [ "$db" != ${REQUIRED_STORE_FILE} ] || { echo "no $src: is the NetBird data volume mounted?" >&2; exit 1; }
    continue
  fi
  sqlite3 -cmd ".timeout 30000" "$src" ".backup /staging/$db"
  check=$(sqlite3 "/staging/$db" "PRAGMA integrity_check;")
  [ "$check" = ok ] || { echo "$db snapshot failed integrity_check: $check" >&2; exit 1; }
done'
cp "$dir/config.yaml" "$staging/config.yaml"

stage=repository
if restic cat config >/dev/null; then
  :
else
  rc=$?
  # 10: no repository yet. Anything else (network, key, password) is a failure.
  if [ "$rc" -ne 10 ]; then
    echo "netbird-backup: cannot read the repository (restic exit $rc)" >&2
    (exit "$rc")
  fi
  restic init
fi
restic unlock

stage=upload
restic backup --host "$host" --tag ${SNAPSHOT_TAG} /staging

stage=retention
restic forget --host "$host" --tag ${SNAPSHOT_TAG} ${resticForgetArgs(RETENTION).join(" ")} --prune

report true
echo "netbird-backup: ok"
`;
}

/**
 * netbird-restore.sh, run by NetbirdServer before `docker compose up`, and the
 * entry point a standby's promotion calls (#3001). Prints one last line:
 * `netbird-restore: present | fresh | restored <id>`.
 *
 * Fails closed. "Fresh" needs restic to say the repository does not exist, or
 * that it holds no snapshot; an unreadable repository fails the run instead,
 * because a server started on an empty store would be backed up 15 minutes
 * later as the newest snapshot.
 */
export function renderRestoreScript(args: { dir?: string } = {}): string {
  const dir = args.dir ?? NETBIRD_DIR;
  const paths = backupPaths(dir);
  const dbs = STORE_FILES.join(" ");
  return `${prelude(dir)}
trap 'echo "netbird-restore: failed (exit $?); NetBird was not started" >&2' ERR

mount=$(docker volume inspect -f '{{ .Mountpoint }}' ${NETBIRD_DATA_VOLUME} 2>/dev/null || true)
if [ -n "$mount" ] && [ -s "$mount/${REQUIRED_STORE_FILE}" ]; then
  echo "netbird-restore: present"
  exit 0
fi

if [ ! -s ${paths.env} ]; then
  echo "netbird-restore: no ${paths.env}, so whether a backup exists is unknown; refusing to start on an empty store" >&2
  exit 1
fi

if restic cat config >/dev/null; then
  :
else
  rc=$?
  if [ "$rc" -eq 10 ]; then
    echo "netbird-restore: fresh"
    exit 0
  fi
  echo "netbird-restore: the backup repository is unreachable (restic exit $rc); refusing to start on an empty store" >&2
  exit "$rc"
fi

latest=$(restic_sh '$R snapshots --json --tag ${SNAPSHOT_TAG} | jq -r "max_by(.time) | .id // empty"')
if [ -z "$latest" ]; then
  echo "netbird-restore: fresh"
  exit 0
fi

# Into the volume compose itself creates (run creates it with the project's
# labels). Stale WAL/SHM files beside an absent store would be replayed onto
# the restored one, so they go first.
restic_sh '
rm -rf /tmp/restore
$R restore "$1" --target /tmp/restore
for db in ${dbs}; do
  rm -f "/var/lib/netbird/$db" "/var/lib/netbird/$db-wal" "/var/lib/netbird/$db-shm"
  if [ -f "/tmp/restore/staging/$db" ]; then cp "/tmp/restore/staging/$db" "/var/lib/netbird/$db"; fi
done
test -s /var/lib/netbird/${REQUIRED_STORE_FILE}' "$latest"

printf '%s %s\\n' "$latest" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > ${paths.restoreMarker}
echo "netbird-restore: restored $latest"
`;
}

/** The systemd service and timer that run netbird-backup.sh every BACKUP_INTERVAL_MINUTES. */
export function renderBackupUnits(args: { dir?: string } = {}): { service: string; timer: string } {
  const paths = backupPaths(args.dir ?? NETBIRD_DIR);
  return {
    service: `# Rendered by components/netbird/backup.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Back up the NetBird store to Garage
Requires=docker.service
Wants=network-online.target
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=${paths.backupScript}
TimeoutStartSec=10min
Nice=10
`,
    timer: `# Rendered by components/netbird/backup.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Back up NetBird every ${BACKUP_INTERVAL_MINUTES} minutes

[Timer]
OnCalendar=*:0/${BACKUP_INTERVAL_MINUTES}
Persistent=true
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
`,
  };
}

/**
 * The Gatus external endpoint the backup script pushes to. Pages on the first
 * failed run, and on BACKUP_STALE_AFTER_MINUTES of silence: the VM is down,
 * the timer stopped, or the tailnet path to Gatus or Garage broke.
 */
export function backupHeartbeat(args: { name: string; group: string; token: string }): ExternalEndpoint {
  const alert: Alert = { type: "pushover", enabled: true, "success-threshold": 1, "failure-threshold": 1, "minimum-reminder-interval": "6h" } as Alert;
  return {
    enabled: true,
    name: args.name,
    group: args.group,
    token: args.token,
    heartbeat: { interval: `${BACKUP_STALE_AFTER_MINUTES}m` },
    alerts: [alert],
  };
}
