// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * NetBird health checks (D47, docs/plans/netbird-mirror.md "Monitoring").
 *
 * A CronJob every five minutes in Equestria, beside the failover watchdog and
 * deliberately NOT inside it: a bug here must never stop a failover. It reads
 * the management API with the `automation` service user's PAT (the token the
 * operator uses, kubernetes/apps/netbird-system/operator) and posts
 * Alertmanager alerts straight to /api/v2/alerts, the same way watchdog.ts
 * does, for:
 *   (a) a peer in a watched group (gateways, dns-servers) disconnected for
 *       longer than PEER_DISCONNECTED_MINUTES; a group whose every peer is;
 *   (b) a reverse-proxy custom domain (app., nbidp.) that is not validated;
 *   (c) the private proxy's cluster (ek., which serves nbidp and the app. services) offline.
 * Each alert is re-posted every run with endsAt ALERT_TTL_MINUTES ahead, so it
 * resolves on its own once a run stops posting it. A watched group or domain
 * that does not exist yet is skipped, not alerted: `dns-servers` and the
 * `nb.` domain arrive in their own PRs.
 *
 * A run that cannot read management exits non-zero, which the
 * NetbirdHealthNotRunning rule turns into an alert after 30 minutes.
 *
 * Node runs this file by stripping types. The pure part (evaluate and the
 * parsers) is what health.test.ts covers; main() is the I/O around it.
 */

/** Two missed runs and a bit: long enough that a client restart never pages. */
export const PEER_DISCONNECTED_MINUTES = 10;
/** Three runs at one every five minutes. */
export const ALERT_TTL_MINUTES = 15;

/** GET /api/peers, the fields used here. */
export interface LivePeer {
  id: string;
  name: string;
  connected: boolean;
  last_seen?: string;
  groups?: { id: string; name: string }[];
}

/** GET /api/groups, the fields used here. */
export interface LiveGroup {
  id: string;
  name: string;
}

/** GET /api/reverse-proxies/domains, the fields used here. */
export interface LiveDomain {
  domain: string;
  validated: boolean;
  type?: string;
}

/** GET /api/reverse-proxies/clusters, the fields used here. */
export interface LiveCluster {
  address: string;
  online: boolean;
}

export interface HealthConfig {
  peerGroups: string[];
  customDomains: string[];
  proxyCluster?: string;
}

/** What one run saw. A field is undefined when that read failed; its check is then skipped. */
export interface HealthObservation {
  peers?: LivePeer[];
  groups?: LiveGroup[];
  domains?: LiveDomain[];
  clusters?: LiveCluster[];
  now: Date;
}

export interface Alert {
  labels: Record<string, string>;
  annotations: { summary: string; description: string };
  startsAt: string;
  endsAt: string;
}

/** `a,b , c` -> [a, b, c]. */
export function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/** Minutes since `lastSeen`, or Infinity when the API gave none we can read. */
export function minutesSince(lastSeen: string | undefined, now: Date): number {
  const at = lastSeen ? Date.parse(lastSeen) : Number.NaN;
  return Number.isFinite(at) ? (now.getTime() - at) / 60000 : Number.POSITIVE_INFINITY;
}

/** The whole policy. Pure: the caller does the reads and posts the result. */
export function evaluate(config: HealthConfig, obs: HealthObservation, thresholdMinutes: number = PEER_DISCONNECTED_MINUTES): { alerts: Alert[]; skipped: string[] } {
  const startsAt = obs.now.toISOString();
  const endsAt = new Date(obs.now.getTime() + ALERT_TTL_MINUTES * 60000).toISOString();
  const base = { namespace: "netbird-system", job: "netbird-health" };
  const alert = (labels: Record<string, string>, summary: string, description: string): Alert => ({ labels: { ...base, ...labels }, annotations: { summary, description }, startsAt, endsAt });
  const alerts: Alert[] = [];
  const skipped: string[] = [];

  // (a) Peers. One alert per down peer (naming every watched group it is in),
  // and one per watched group whose every peer is down.
  if (obs.peers && obs.groups) {
    const existing = new Set(obs.groups.map(g => g.name));
    const watched = config.peerGroups.filter(name => {
      if (existing.has(name)) return true;
      skipped.push("group " + name + " does not exist");
      return false;
    });
    const down = (peer: LivePeer) => !peer.connected && minutesSince(peer.last_seen, obs.now) > thresholdMinutes;
    const inGroup = (peer: LivePeer, name: string) => (peer.groups ?? []).some(g => g.name === name);
    for (const peer of obs.peers) {
      const groups = watched.filter(name => inGroup(peer, name));
      if (groups.length === 0 || !down(peer)) continue;
      const since = minutesSince(peer.last_seen, obs.now);
      const ago = Number.isFinite(since) ? Math.floor(since) + " min ago (" + peer.last_seen + ")" : "at an unknown time";
      alerts.push(
        alert(
          { alertname: "NetbirdPeerDisconnected", severity: "warning", peer: peer.name, groups: groups.join(",") },
          "NetBird peer " + peer.name + " is disconnected",
          "NetBird peer " + peer.name + " (" + groups.join(", ") + ") was last seen " + ago + ". Check its container on the Dockge host or its pod, and `netbird status` inside it.",
        ),
      );
    }
    for (const name of watched) {
      const members = obs.peers.filter(peer => inGroup(peer, name));
      if (members.length > 0 && members.every(down)) {
        alerts.push(
          alert(
            { alertname: "NetbirdPeerGroupDown", severity: "critical", group: name },
            "Every NetBird peer in " + name + " is disconnected",
            "All " +
              members.length +
              " peers in the NetBird group " +
              name +
              " (" +
              members.map(p => p.name).join(", ") +
              ") have been disconnected for more than " +
              thresholdMinutes +
              " minutes, so nothing serves that role for NetBird clients.",
          ),
        );
      }
    }
  }

  // (b) Custom domains. Absent is skipped: management drops a custom domain
  // still unvalidated after 48 hours, and the owning stack re-registers it.
  if (obs.domains) {
    for (const name of config.customDomains) {
      const entry = obs.domains.find(d => d.domain === name);
      if (!entry) {
        skipped.push("domain " + name + " is not registered");
        continue;
      }
      if (!entry.validated) {
        alerts.push(
          alert(
            { alertname: "NetbirdCustomDomainUnvalidated", severity: "warning", domain: name },
            "NetBird custom domain " + name + " is not validated",
            "Management lists " +
              name +
              " as a reverse-proxy domain but has not validated it, so its services are not served. Check the public validation CNAME in Cloudflare and rerun stacks/netbird. Management drops a domain still unvalidated after 48 hours.",
          ),
        );
      }
    }
  }

  // (c) The proxy cluster. Absent counts as offline: management lists a
  // cluster only while a proxy for it is, or has been, connected.
  if (obs.clusters && config.proxyCluster) {
    const cluster = obs.clusters.find(c => c.address === config.proxyCluster);
    if (!cluster?.online) {
      alerts.push(
        alert(
          { alertname: "NetbirdProxyClusterOffline", severity: "critical", cluster: config.proxyCluster },
          "NetBird proxy cluster " + config.proxyCluster + " is offline",
          "Management " +
            (cluster ? "reports the cluster offline" : "does not list the cluster") +
            ", so no proxy serves " +
            config.proxyCluster +
            " or the app. services: NetBird login and NetBird app access are down. Check the nbidp HelmRelease in netbird-system.",
        ),
      );
    }
  }

  return { alerts, skipped };
}

// ── I/O ──────────────────────────────────────────────────────────────────

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + " is not set");
  return value;
}

/** GET a management API path. `optional`: a 404 (an older management without the endpoint) is undefined, not an error. */
async function netbird<T>(path: string, optional = false): Promise<T | undefined> {
  const response = await fetch(env("NETBIRD_URL").replace(/\/+$/, "") + path, {
    headers: { Authorization: "Token " + env("NB_API_KEY"), Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (optional && response.status === 404) return undefined;
  if (!response.ok) throw new Error("NetBird GET " + path + ": HTTP " + response.status);
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const now = new Date();
  const config: HealthConfig = {
    peerGroups: parseList(process.env.NETBIRD_PEER_GROUPS),
    customDomains: parseList(process.env.NETBIRD_CUSTOM_DOMAINS),
    proxyCluster: process.env.NETBIRD_PROXY_CLUSTER || undefined,
  };
  // Each read on its own: one failing must not blind the others.
  const errors: string[] = [];
  const read = async <T>(path: string, optional = false): Promise<T | undefined> => {
    try {
      return await netbird<T>(path, optional);
    } catch (error) {
      errors.push(String(error));
      return undefined;
    }
  };
  const [peers, groups, domains, clusters] = await Promise.all([
    read<LivePeer[]>("/api/peers"),
    read<LiveGroup[]>("/api/groups"),
    read<LiveDomain[]>("/api/reverse-proxies/domains", true),
    read<LiveCluster[]>("/api/reverse-proxies/clusters", true),
  ]);
  const { alerts, skipped } = evaluate(config, { peers, groups, domains, clusters, now });

  if (alerts.length > 0) {
    try {
      const response = await fetch(env("ALERTMANAGER_URL") + "/api/v2/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alerts), signal: AbortSignal.timeout(10000) });
      if (!response.ok) errors.push("Alertmanager refused the alerts: HTTP " + response.status);
    } catch (error) {
      errors.push("Alertmanager unreachable: " + String(error));
    }
  }
  console.log(JSON.stringify({ msg: "netbird-health", alerts: alerts.map(a => a.labels), skipped, errors }));
  if (errors.length > 0) process.exit(1);
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
