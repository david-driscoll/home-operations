/**
 * Relay health checks (D47, docs/plans/netbird-mirror.md "Monitoring").
 *
 * Two kinds:
 *   - The Azure relays (`relay-eus2`, `relay-cus`) have public names, so
 *     Gatus on alpha-site checks them directly: `tls://<relay>:443`,
 *     handshake plus certificate expiry (relayTlsEndpoint).
 *   - The home relay (`relay-home.<root domain>`, #3051) has a private name
 *     that resolves to the home WAN address. Gatus at home could only reach it
 *     by hairpin NAT, which proves nothing about the WAN path. So each Azure
 *     host probes it from outside: a systemd timer looks the name up live,
 *     does a verified TLS connect (chain and name, SNI = the relay's name) to
 *     the address it got and, only when that works, pushes a Gatus
 *     external-endpoint heartbeat, the mechanism the NetBird backup uses
 *     (backup.ts). A probe that cannot resolve or connect pushes nothing, so
 *     the heartbeat goes stale and Gatus pages. A certificate inside
 *     RELAY_CERT_MIN_DAYS pushes an explicit failure.
 *
 *     The lookup: the hosts run `--accept-dns=false` and the name is private,
 *     so every run asks the Technitium nodes directly over the tailnet
 *     (`dig @<dns-<cluster> tailnet IP>`, one after another until one
 *     answers). The node list is read at deploy time (dnsResolvers); a home
 *     WAN address change is picked up on the next probe, not the next deploy.
 *
 * Pure, so `node --test` covers it (relayProbe.test.ts).
 */
import type { Alert, ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";

/** The Gatus group every relay check is listed under (and the heartbeat tokens are derived from). */
export const RELAY_GATUS_GROUP = "NetBird Relays";
export const RELAY_PROBE_INTERVAL_MINUTES = 5;
/** Three missed probes. */
export const RELAY_PROBE_STALE_AFTER_MINUTES = 15;
/** Let's Encrypt renews at 30 days left; a week left means renewal has been failing for three. */
export const RELAY_CERT_MIN_DAYS = 7;
export const RELAY_PROBE_DIR = "/opt/netbird/relay-probe";

const pushover = (reminder: string): Alert => ({ type: "pushover", enabled: true, "success-threshold": 1, "failure-threshold": 2, "minimum-reminder-interval": reminder }) as Alert;

/** Gatus TLS check for a public relay: it answers a handshake on 443 with a certificate that is not about to expire. */
export function relayTlsEndpoint(domain: string): GatusDefinition {
  return {
    name: domain.split(".")[0],
    group: RELAY_GATUS_GROUP,
    url: `tls://${shellWord(domain, "relay domain")}:443`,
    interval: "2m",
    conditions: ["[CONNECTED] == true", `[CERTIFICATE_EXPIRATION] > ${RELAY_CERT_MIN_DAYS * 24}h`],
    alerts: [pushover("6h")],
  };
}

/** The Gatus external endpoint one host's home-relay probe pushes to. */
export function relayProbeHeartbeat(args: { name: string; token: string }): ExternalEndpoint {
  return {
    enabled: true,
    name: args.name,
    group: RELAY_GATUS_GROUP,
    token: args.token,
    heartbeat: { interval: `${RELAY_PROBE_STALE_AFTER_MINUTES}m` },
    alerts: [{ ...pushover("6h"), "failure-threshold": 1 } as Alert],
  };
}

/** Per-resolver `dig` budget: one try, two seconds. A handful of dead nodes still fits the unit's timeout. */
export const RELAY_PROBE_DNS_TIMEOUT_SECONDS = 2;

export interface RelayProbeScriptArgs {
  /** The relay's name: SNI, the certificate's name, and what the probe resolves. */
  name: string;
  /**
   * Technitium nodes to ask for the name's A record, in order (their tailnet
   * IPv4 addresses; dnsResolvers). The first that answers wins. At least one.
   */
  resolvers: string[];
  heartbeat: { url: string; token: string };
}

/** A tag:dns device as components/tailscale.ts getDnsMachines returns it. */
export interface DnsMachine {
  key: string;
  ip: string;
}

/**
 * The resolvers a probe asks, from the tag:dns devices: IPv4 only, no
 * duplicates, in cluster-key order. Offline nodes stay in (the script falls
 * through to the next), so a node blipping does not rewrite the script.
 */
export function dnsResolvers(machines: readonly DnsMachine[]): string[] {
  const ordered = [...machines].sort((a, b) => a.key.localeCompare(b.key));
  return [...new Set(ordered.map(machine => machine.ip).filter(ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)))];
}

export function relayProbePaths(dir: string = RELAY_PROBE_DIR) {
  return { dir, script: `${dir}/netbird-relay-probe.sh` };
}

/** netbird-relay-probe.sh, run by the timer. Uses only curl, openssl and dig (bind9-dnsutils is in the cloud-init packages). */
export function renderRelayProbeScript(args: RelayProbeScriptArgs): string {
  const name = shellWord(args.name, "relay name");
  if (args.resolvers.length === 0) throw new Error("relay probe: no resolvers to look the relay's name up with");
  const resolvers = args.resolvers.map(resolver => shellWord(resolver, "resolver")).join(" ");
  const url = shellWord(args.heartbeat.url.replace(/\/+$/, ""), "heartbeat url");
  const token = shellWord(args.heartbeat.token, "heartbeat token");
  return `#!/usr/bin/env bash
# Rendered by components/netbird/relayProbe.ts (Pulumi). Edits on the VM are overwritten.
set -uo pipefail
name=${name}
resolvers="${resolvers}"
min_seconds=${RELAY_CERT_MIN_DAYS * 86400}

report() {
  local query="success=$1"
  [ "$1" = true ] || query="$query&error=$2"
  curl -sS -o /dev/null --max-time 15 -X POST -H "Authorization: Bearer ${token}" \\
    "${url}/api/v1/endpoints/${token}/external?$query" \\
    || echo "netbird-relay-probe: WARN: could not report success=$1 to Gatus" >&2
}

# Live lookup, every run: ask each Technitium node over the tailnet until one
# gives an A record. The host's own resolver cannot see the private name.
address=
for resolver in $resolvers; do
  address=$(dig +short +time=${RELAY_PROBE_DNS_TIMEOUT_SECONDS} +tries=1 "@$resolver" "$name" A 2>/dev/null | grep -E '^[0-9]+(.[0-9]+){3}$' | head -n 1)
  [ -n "$address" ] && break
  echo "netbird-relay-probe: $resolver gave no A record for $name" >&2
done
if [ -z "$address" ]; then
  echo "netbird-relay-probe: no resolver ($resolvers) answered for $name; not reporting" >&2
  exit 1
fi

# Verified TLS: the chain, and the name via SNI. Any HTTP answer is fine; a
# failed connect or handshake is not, and reports nothing, so the heartbeat
# goes stale.
if ! curl -sS -o /dev/null --max-time 15 --connect-to "$name:443:$address:443" "https://$name/"; then
  echo "netbird-relay-probe: no verified TLS from $name at $address:443; not reporting" >&2
  exit 1
fi

if ! openssl s_client -connect "$address:443" -servername "$name" </dev/null 2>/dev/null | openssl x509 -noout -checkend "$min_seconds" >/dev/null; then
  echo "netbird-relay-probe: the certificate on $name expires within ${RELAY_CERT_MIN_DAYS} days" >&2
  report false certificate-expires-soon
  exit 1
fi

report true
echo "netbird-relay-probe: $name at $address (via $resolver) ok"
`;
}

/** The systemd service and timer that run the probe every RELAY_PROBE_INTERVAL_MINUTES. */
export function renderRelayProbeUnits(dir: string = RELAY_PROBE_DIR): { service: string; timer: string } {
  const paths = relayProbePaths(dir);
  return {
    service: `# Rendered by components/netbird/relayProbe.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Probe the NetBird home relay over the internet and report to Gatus
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=${paths.script}
TimeoutStartSec=2min
`,
    timer: `# Rendered by components/netbird/relayProbe.ts (Pulumi). Edits on the VM are overwritten.
[Unit]
Description=Probe the NetBird home relay every ${RELAY_PROBE_INTERVAL_MINUTES} minutes

[Timer]
OnCalendar=*:0/${RELAY_PROBE_INTERVAL_MINUTES}
Persistent=true
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
`,
  };
}

/** A value baked into the script. Only these characters, so no quoting can go wrong. */
function shellWord(value: string, what: string): string {
  if (!/^[A-Za-z0-9_./:@-]+$/.test(value)) throw new Error(`${what} '${value}' has characters the rendered script does not quote`);
  return value;
}
