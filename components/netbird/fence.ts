/**
 * The DNS-lease fence (#3001, docs/plans/netbird-mirror.md §E): every NetBird
 * host runs management ONLY while `netbird.<root domain>` resolves,
 * authoritatively, to that host's own public IP. DNS is the lease; the
 * Equestria watchdog (kubernetes/apps/netbird-system/failover-watchdog) moves
 * it, and the failback runbook moves it back.
 *
 * Pure functions with no Pulumi imports, so `node --test` covers them:
 * fence.test.ts runs the rendered bash against fake `dig`, `docker` and
 * `systemctl`, so the decision is tested as the VM executes it.
 *
 * Every FENCE_INTERVAL_SECONDS, under a lock the deploy also takes:
 *
 *   lease  = the A records the zone's own nameservers answer (aa, NOERROR)
 *   mine     = exactly our IP        -> start (restore if the store is empty) / keep
 *   other    = no record is ours     -> demote (or stay standby): stop, and
 *                                       archive the store and acme.json so a later
 *                                       promotion restores the newest snapshot
 *                                       instead of this one
 *   shared   = ours among others     -> stop (a misconfigured record; never two)
 *   unknown  = no nameserver answered -> hold for FENCE_GRACE_SECONDS, then stop
 *
 * Only netbird-server and the dashboard are fenced. Traefik and the relay run
 * whatever the lease says, so a standby keeps relaying. The backup timer
 * follows management: only the lease holder uploads snapshots.
 *
 * Every stop of a running management (demote, and stop on a shared or
 * unknown lease) then restarts Traefik: the demotion drops its clients. In the
 * #2892 drill, stopping netbird-server alone left ~32 clients on the old
 * host for ~18 minutes. Their gRPC channel retries on the same TCP connection
 * to Traefik, which still answers its keepalive pings, and only a new
 * connection re-resolves the name. A Traefik restart closes those connections, so
 * clients redial and follow the lease. It also cuts this host's relay clients
 * for a moment; they reconnect to another relay. Traefik has no way to close
 * one router's connections alone, so a fenced inner Traefik was the only
 * relay-safe alternative, and it was turned down (2026-11-05).
 */
import { ACME_FILE, BACKUP_INTERVAL_MINUTES, backupPaths, NETBIRD_DATA_VOLUME, REQUIRED_STORE_FILE, STORE_FILES, TRAEFIK_ACME_VOLUME } from "./backup.ts";
import { NETBIRD_DIR } from "./server.ts";

export const FENCE_INTERVAL_SECONDS = 15;

/**
 * How long a running management survives not knowing the lease. Long enough
 * for a resolver blip; well under the watchdog's flip (WATCHDOG_FAILURES_TO_FLIP
 * minutes), so a host cut off from DNS has stopped before its standby starts.
 */
export const FENCE_GRACE_SECONDS = 120;

/** Recursive resolvers asked only for the zone's NS set. The A record itself is asked of those nameservers. */
export const FENCE_NS_RESOLVERS = ["9.9.9.9", "8.8.8.8"] as const;

/** Demoted stores kept on the host, newest first. Only for forensics: Garage has the snapshots. */
export const FENCE_ARCHIVES_KEPT = 3;

/** The services the fence starts and stops. Everything else in compose.yaml always runs. */
export const FENCED_SERVICES = ["netbird-server", "dashboard"] as const;

export function fencePaths(dir: string = NETBIRD_DIR) {
  const fence = `${dir}/fence`;
  return {
    dir: fence,
    script: `${fence}/netbird-fence.sh`,
    /** Held by the fence and by every deploy step that touches the compose project. */
    lock: `${fence}/lock`,
    /** Epoch seconds of the first lookup in a row that found no answer. */
    unresolvedSince: `${fence}/unresolved-since`,
    archive: `${backupPaths(dir).dir}/demoted`,
  };
}

/** A name or address baked into the script. Only these characters, so no quoting can go wrong. */
function word(value: string, what: string): string {
  if (!/^[A-Za-z0-9_./:-]+$/.test(value)) throw new Error(`${what} '${value}' has characters the fence script does not quote`);
  return value;
}

export interface FenceScriptArgs {
  dir?: string;
  /** The lease record, `netbird.<root domain>`. */
  domain: string;
  /** The zone it lives in, whose NS set is asked for it. */
  zone: string;
  /** This host's public IPv4: the only answer that means "ours". */
  ownIp: string;
  graceSeconds?: number;
}

export function renderFenceScript(args: FenceScriptArgs): string {
  const dir = args.dir ?? NETBIRD_DIR;
  const paths = fencePaths(dir);
  const backup = backupPaths(dir);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(args.ownIp)) throw new Error(`ownIp '${args.ownIp}' is not an IPv4 address`);
  if (!args.domain.endsWith(`.${args.zone}`)) throw new Error(`${args.domain} is not in the zone ${args.zone}`);
  const fenced = FENCED_SERVICES.join(" ");
  const stores = STORE_FILES.join(" ");
  return `#!/usr/bin/env bash
# Rendered by components/netbird/fence.ts (Pulumi). Edits on the VM are overwritten.
# Runs management only while ${word(args.domain, "domain")} answers, authoritatively, ${word(args.ownIp, "ownIp")}.
set -Euo pipefail
umask 077
dir=${word(dir, "dir")}
domain=${args.domain}
zone=${word(args.zone, "zone")}
own=${args.ownIp}
grace=${args.graceSeconds ?? FENCE_GRACE_SECONDS}
resolvers="${FENCE_NS_RESOLVERS.join(" ")}"
since_file=${paths.unresolvedSince}
archive=${paths.archive}

install -d -m 700 ${paths.dir}
exec 9>${paths.lock}
flock 9

compose() { docker compose --project-directory "$dir" -f "$dir/compose.yaml" "$@"; }
log() { echo "netbird-fence: $*"; }

# The A records the zone's own nameservers give for $domain, one per line, or
# a failure when none of them answered authoritatively. An authoritative
# NOERROR with no A record prints nothing and succeeds.
lease() {
  local ns_set="" resolver ns out
  for resolver in $resolvers; do
    ns_set=$(dig +short +time=3 +tries=2 NS "$zone" "@$resolver" 2>/dev/null | sed 's/\\.$//') || ns_set=""
    [ -z "$ns_set" ] || break
  done
  [ -n "$ns_set" ] || return 1
  for ns in $ns_set; do
    out=$(dig +norecurse +time=3 +tries=1 A "$domain" "@$ns" 2>/dev/null) || continue
    grep -q 'status: NOERROR' <<<"$out" || continue
    grep -Eq 'flags:[^;]* aa[ ;]' <<<"$out" || continue
    awk -v name="$domain." '$1 == name && $3 == "IN" && $4 == "A" { print $5 }' <<<"$out" | sort -u
    return 0
  done
  return 1
}

# mine | other | shared | unknown
lease_state() {
  local answers
  if ! answers=$(lease) || [ -z "$answers" ]; then
    echo unknown
  elif [ "$answers" = "$own" ]; then
    echo mine
  elif grep -qxF "$own" <<<"$answers"; then
    echo shared
  else
    echo other
  fi
}

# start | keep | demote | standby | stop | hold | idle, from the lease, whether
# management runs, and how long the lease has been unknown.
decide() {
  local state=$1 running=$2 unresolved=$3
  case "$state" in
    mine) [ "$running" = yes ] && echo keep || echo start ;;
    other) [ "$running" = yes ] && echo demote || echo standby ;;
    shared) [ "$running" = yes ] && echo stop || echo idle ;;
    *)
      if [ "$running" = yes ] && [ "$unresolved" -lt "$grace" ]; then
        echo hold
      elif [ "$running" = yes ]; then
        echo stop
      else
        echo idle
      fi
      ;;
  esac
}

running() { [ "$(docker inspect -f '{{.State.Running}}' netbird-server 2>/dev/null || true)" = true ]; }

timer_on() { systemctl is-enabled --quiet netbird-backup.timer 2>/dev/null || systemctl enable --now netbird-backup.timer; }
timer_off() { if systemctl is-enabled --quiet netbird-backup.timer 2>/dev/null; then systemctl disable --now netbird-backup.timer; fi; }

stop_management() {
  timer_off
  compose stop ${fenced}
}

# Clients' gRPC connections outlive the server behind Traefik; only closing
# them makes clients redial and follow the lease (see the header).
drop_clients() {
  compose restart traefik
  log "restarted traefik to drop the demoted management's clients"
}

# The store and the certificate leave the volumes, so the next promotion of
# this host restores the newest snapshot (whoever took it) and its acme.json.
archive_store() {
  local mount acme to
  mount=$(docker volume inspect -f '{{ .Mountpoint }}' ${NETBIRD_DATA_VOLUME} 2>/dev/null || true)
  [ -n "$mount" ] && [ -e "$mount/${REQUIRED_STORE_FILE}" ] || return 0
  to="$archive/$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 700 "$to"
  for db in ${stores}; do
    for f in "$mount/$db" "$mount/$db-wal" "$mount/$db-shm"; do
      if [ -e "$f" ]; then mv "$f" "$to/"; fi
    done
  done
  acme=$(docker volume inspect -f '{{ .Mountpoint }}' ${TRAEFIK_ACME_VOLUME} 2>/dev/null || true)
  if [ -n "$acme" ] && [ -e "$acme/${ACME_FILE}" ]; then mv "$acme/${ACME_FILE}" "$to/"; fi
  log "archived the demoted store to $to"
  ls -1d "$archive"/*/ 2>/dev/null | sort -r | tail -n +${FENCE_ARCHIVES_KEPT + 1} | xargs -r rm -rf
}

state=$(lease_state)
if [ "$state" = unknown ]; then
  [ -s "$since_file" ] || date +%s > "$since_file"
  unresolved=$(( $(date +%s) - $(cat "$since_file") ))
else
  rm -f "$since_file"
  unresolved=0
fi
if running; then is_running=yes; else is_running=no; fi
action=$(decide "$state" "$is_running" "$unresolved")

case "$action" in
  start)
    # The snapshot's acme.json replaces this host's: the lease holder's is the
    # newest certificate for $domain and the account that renews it.
    if ! restored=$(NETBIRD_RESTORE_ACME=replace ${backup.restoreScript}); then
      log "the restore failed; management stays stopped"
      exit 1
    fi
    printf '%s\\n' "$restored"
    # Traefik reads acme.json only when it starts.
    if grep -q "restored the Traefik ${ACME_FILE}" <<<"$restored"; then compose restart traefik; fi
    compose up -d ${fenced}
    timer_on
    ;;
  keep) timer_on ;;
  demote)
    stop_management
    archive_store
    drop_clients
    ;;
  # Also archives: a store left by a stop on an unknown lease is stale once
  # another host holds the lease.
  standby)
    timer_off
    archive_store
    ;;
  stop)
    stop_management
    drop_clients
    ;;
  hold) log "the lease has been unknown for \${unresolved}s; holding until \${grace}s" ;;
  idle) timer_off ;;
esac
log "$action ($state)"
`;
}

/** The oneshot service and the timer that runs it every FENCE_INTERVAL_SECONDS. */
export function renderFenceUnits(args: { dir?: string } = {}): { service: string; timer: string } {
  const paths = fencePaths(args.dir ?? NETBIRD_DIR);
  return {
    service: `# Rendered by components/netbird/fence.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Run NetBird management only while the DNS lease is this host's
Requires=docker.service
Wants=network-online.target
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=${paths.script}
TimeoutStartSec=10min
`,
    timer: `# Rendered by components/netbird/fence.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Check the NetBird DNS lease every ${FENCE_INTERVAL_SECONDS} seconds

[Timer]
OnBootSec=${FENCE_INTERVAL_SECONDS}s
OnUnitInactiveSec=${FENCE_INTERVAL_SECONDS}s
AccuracySec=1s

[Install]
WantedBy=timers.target
`,
  };
}

/** The fence stops management well inside the time a standby takes to be promoted. */
export function assertFenceFasterThanFlip(watchdogFlipSeconds: number, graceSeconds: number = FENCE_GRACE_SECONDS): void {
  if (graceSeconds + FENCE_INTERVAL_SECONDS >= watchdogFlipSeconds) {
    throw new Error(`The fence holds an unknown lease for ${graceSeconds}s + ${FENCE_INTERVAL_SECONDS}s, not less than the watchdog's ${watchdogFlipSeconds}s to a flip: two managements could overlap.`);
  }
}

/** Snapshots are at most this old when a standby restores one: the promotion's data loss bound. */
export const PROMOTION_LOSS_MINUTES = BACKUP_INTERVAL_MINUTES;
