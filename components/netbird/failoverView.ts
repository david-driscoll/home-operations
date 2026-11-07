/**
 * Each NetBird host's view of the others (#3161, docs/adr/0002).
 *
 * The failover watchdog in Equestria sees the lease holder only from home. A
 * dead holder and Equestria losing just its route to it look the same from
 * there, so before it flips it needs a second view from outside home. Every
 * host provides it: a systemd timer probes management at every other host,
 * the same GET the watchdog makes (FAILOVER_VIEW_HEALTH_PATH, certificate
 * verified for the lease's name), and PUTs what it saw to the NetBird backup
 * bucket in Garage as `failover-view/<host>.json`:
 *
 *     {"observer":"azure-cus","targets":{"<eus2 ip>":false}}
 *
 * Why Garage: both ends already reach it and hold its key. The hosts back up
 * there over the tailnet (the `netbird-edge-backups` grant), and Equestria
 * reaches the garage-s3 VIP through its egress. A write needs the bucket
 * key (SigV4), and freshness is Garage's own Last-Modified, so a host's
 * clock cannot make an old view look new. A probe that cannot publish exits
 * non-zero and the view goes stale, which the watchdog reads as "no view"
 * and holds.
 *
 * The key reaches curl through a config file (`-K`), never the command line.
 * The Garage VIP is a tailnet name the host's resolver cannot see
 * (--accept-dns=false), so the script asks MagicDNS and pins curl to the
 * answer, as the relay probe does (relayProbe.ts).
 *
 * Pure, so `node --test` covers it (failoverView.test.ts).
 */
import { MAGIC_DNS } from "./relayProbe.ts";

/** The objects' prefix in the bucket. The watchdog reads the same (watchdog.ts PEER_VIEW_PREFIX). */
export const FAILOVER_VIEW_PREFIX = "failover-view/";
/** What the watchdog checks too (watchdog.ts HEALTH_PATH): management's embedded IdP, up only while netbird-server runs. */
export const FAILOVER_VIEW_HEALTH_PATH = "/oauth2/.well-known/openid-configuration";
/** Well inside the watchdog's freshness window (PEER_VIEW_FRESH_MINUTES, 3). */
export const FAILOVER_VIEW_INTERVAL_SECONDS = 30;
export const FAILOVER_VIEW_DIR = "/opt/netbird/failover-view";

export function failoverViewPaths(dir: string = FAILOVER_VIEW_DIR) {
  return { dir, script: `${dir}/netbird-failover-view.sh`, curlConfig: `${dir}/s3.curlrc` };
}

export interface FailoverViewScriptArgs {
  /** This host's id, e.g. azure-cus: the object's name. */
  observer: string;
  /** The management name: SNI, the certificate's name, and the Host header. */
  lease: string;
  /** The other hosts' public addresses. At least one. */
  targets: string[];
  /** The NetBird backup bucket (NETBIRD_BACKUP_BAO_PATH). */
  s3: { endpoint: string; bucket: string };
}

/** netbird-failover-view.sh, run by the timer. Uses only curl and dig. */
export function renderFailoverViewScript(args: FailoverViewScriptArgs): string {
  const observer = word(args.observer, "observer", /^[a-z0-9-]+$/);
  const lease = word(args.lease, "lease", /^[a-z0-9.-]+$/);
  if (args.targets.length === 0) throw new Error("failover view: no other host to probe");
  const targets = args.targets.map(ip => word(ip, "target", /^\d{1,3}(\.\d{1,3}){3}$/)).join(" ");
  const endpoint = new URL(args.s3.endpoint);
  const host = word(endpoint.hostname, "S3 host", /^[a-z0-9.-]+$/);
  const port = endpoint.port || (endpoint.protocol === "http:" ? "80" : "443");
  const base = word(args.s3.endpoint.replace(/\/+$/, ""), "S3 endpoint", /^https?:\/\/[A-Za-z0-9.:-]+$/);
  const bucket = word(args.s3.bucket, "bucket", /^[a-z0-9.-]+$/);
  const paths = failoverViewPaths();
  return `#!/usr/bin/env bash
# Rendered by components/netbird/failoverView.ts (Pulumi). Edits on the VM are overwritten.
set -uo pipefail
dir=${paths.dir}
lease=${lease}
observer=${observer}
targets="${targets}"
url=${base}/${bucket}/${FAILOVER_VIEW_PREFIX}${observer}.json
garage_host=${host}

# Management at each other host, as the watchdog checks it: only a 200 with a
# certificate valid for the lease's name is healthy.
body="{\\"observer\\":\\"$observer\\",\\"targets\\":{"
sep=
for ip in $targets; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$lease:443:$ip" "https://$lease${FAILOVER_VIEW_HEALTH_PATH}")
  if [ "$code" = 200 ]; then healthy=true; else healthy=false; fi
  echo "netbird-failover-view: management at $ip answered $code"
  body="$body$sep\\"$ip\\":$healthy"
  sep=,
done
printf '%s}}' "$body" > "$dir/view.json"

# The Garage VIP is a tailnet name: ask MagicDNS and pin curl to the answer.
pin=()
garage_address=$(dig +short +time=2 +tries=1 @${MAGIC_DNS} "$garage_host" A 2>/dev/null | grep -E '^[0-9]+(\\.[0-9]+){3}$' | head -n 1)
[ -n "$garage_address" ] && pin=(--resolve "$garage_host:${port}:$garage_address")
if ! curl -sS -f -o /dev/null --max-time 15 "\${pin[@]}" -K "$dir/s3.curlrc" --aws-sigv4 aws:amz:garage:s3 \\
  -H 'x-amz-content-sha256: UNSIGNED-PAYLOAD' -H 'Content-Type: application/json' -T "$dir/view.json" "$url"; then
  echo "netbird-failover-view: could not publish to $url; the view goes stale" >&2
  exit 1
fi
`;
}

/** The curl config holding the bucket key, so it is never on a command line. */
export function renderFailoverViewCurlConfig(key: { accessKeyId: string; secretAccessKey: string }): string {
  const user = `${key.accessKeyId}:${key.secretAccessKey}`;
  if (!/^[A-Za-z0-9_+/=:.-]+$/.test(user)) throw new Error("failover view: the Garage key has characters the curl config does not quote");
  return `user = "${user}"\n`;
}

/** The systemd service and timer that run the view every FAILOVER_VIEW_INTERVAL_SECONDS. */
export function renderFailoverViewUnits(dir: string = FAILOVER_VIEW_DIR): { service: string; timer: string } {
  const paths = failoverViewPaths(dir);
  return {
    service: `# Rendered by components/netbird/failoverView.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Probe the other NetBird hosts' management and publish the view to Garage
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=${paths.script}
TimeoutStartSec=50s
`,
    timer: `# Rendered by components/netbird/failoverView.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Publish this host's view of the other NetBird hosts every ${FAILOVER_VIEW_INTERVAL_SECONDS} s

[Timer]
OnBootSec=${FAILOVER_VIEW_INTERVAL_SECONDS}s
OnUnitActiveSec=${FAILOVER_VIEW_INTERVAL_SECONDS}s
AccuracySec=1s

[Install]
WantedBy=timers.target
`,
  };
}

function word(value: string, what: string, pattern: RegExp): string {
  if (!pattern.test(value)) throw new Error(`failover view: ${what} '${value}' has characters the rendered script does not quote`);
  return value;
}
