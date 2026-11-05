/**
 * Which Technitium addresses NetBird hands its clients as nameservers.
 *
 * Every Technitium node runs a NetBird sidecar in its network namespace
 * (docker/_common/technitium, kubernetes/apps/equestria/dns/technitium), the
 * way each already runs a Tailscale one. The sidecars enrol with the `dns`
 * setup key into the `dns-servers` peer group, so a client resolves through a
 * node's overlay address directly, away from home and with every gateway
 * down. Until a sidecar has enrolled, its node is still reachable on its LAN
 * address through the home gateways' routes (#2887), and that is the fallback.
 *
 * Pure, so `node --test` evaluates it. index.ts feeds it the live peer list
 * (GET /api/peers) and the LAN addresses it knows.
 */

/** The peer group the sidecars' setup key places them in, and the policy's destination for them. */
export const DNS_SERVER_GROUP = "dns-servers";

/**
 * Every Technitium node by cluster key, most preferred first: the cluster's
 * node (three control planes, the tier-1 volume) and then the Dockge hosts,
 * celestia first as the Technitium cluster primary.
 */
export const DNS_SERVER_ORDER = ["equestria", "celestia", "alpha-site", "luna", "skystar"];

/**
 * NetBird management rejects a nameserver group with more than three
 * nameservers (`validateNSList` in management/server/nameserver.go, v0.82.0:
 * "the list of nameservers should be 1 or 3").
 */
export const MAX_NAMESERVERS = 3;

/** The fields of a GET /api/peers entry this reads. */
export interface LivePeer {
  ip: string;
  hostname: string;
  connected: boolean;
  last_seen?: string;
  groups?: { name: string }[];
}

export interface Nameserver {
  cluster: string;
  ip: string;
  via: "overlay" | "lan";
}

/** The cluster a sidecar serves, from its hostname `dns-<cluster>` (NB_HOSTNAME); undefined for anything else. */
export function dnsPeerCluster(hostname: string, clusters: string[] = DNS_SERVER_ORDER): string | undefined {
  const match = /^dns-(.+)$/.exec(hostname.trim().toLowerCase());
  return match && clusters.includes(match[1]) ? match[1] : undefined;
}

/**
 * Each enrolled sidecar's overlay address, by cluster. Only peers in
 * `dns-servers` count, so a stray `dns-*` hostname elsewhere is ignored. When
 * a node has enrolled more than once (a lost state volume), the connected peer
 * wins, then the one seen most recently.
 */
export function enrolledDnsPeers(peers: LivePeer[], clusters: string[] = DNS_SERVER_ORDER, group: string = DNS_SERVER_GROUP): Record<string, string> {
  const best: Record<string, LivePeer> = {};
  const rank = (peer: LivePeer) => [peer.connected ? 1 : 0, Date.parse(peer.last_seen ?? "") || 0];
  for (const peer of peers) {
    if (!peer.ip || !peer.groups?.some(g => g.name === group)) continue;
    const cluster = dnsPeerCluster(peer.hostname, clusters);
    if (!cluster) continue;
    const current = best[cluster];
    if (!current) {
      best[cluster] = peer;
      continue;
    }
    const [a, b] = [rank(peer), rank(current)];
    if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) best[cluster] = peer;
  }
  return Object.fromEntries(Object.entries(best).map(([cluster, peer]) => [cluster, peer.ip]));
}

/**
 * The nameservers, at most `max`: enrolled sidecars' overlay addresses in
 * preference order first, then the remaining nodes' LAN addresses in the same
 * order. With nothing enrolled that is the LAN addresses alone, as before the
 * sidecars existed; with three enrolled it is overlay only.
 */
export function selectNameservers(args: { overlay: Record<string, string>; lan: Record<string, string>; order?: string[]; max?: number }): Nameserver[] {
  const order = args.order ?? DNS_SERVER_ORDER;
  const max = args.max ?? MAX_NAMESERVERS;
  const overlay: Nameserver[] = order.filter(cluster => args.overlay[cluster]).map(cluster => ({ cluster, ip: args.overlay[cluster], via: "overlay" }));
  const lan: Nameserver[] = order.filter(cluster => !args.overlay[cluster] && args.lan[cluster]).map(cluster => ({ cluster, ip: args.lan[cluster], via: "lan" }));
  const seen = new Set<string>();
  return [...overlay, ...lan].filter(ns => !seen.has(ns.ip) && seen.add(ns.ip)).slice(0, max);
}

/**
 * Every node's LAN address, by cluster. The Dockge hosts' come from the
 * Tailscale exports (`dockge-<host>`'s internalIp: Technitium publishes its
 * ports on the host); alpha-site's is also the one constants.ts lists, and
 * Equestria's is the Technitium VIP on the ipvlan interface. `missing` names
 * the nodes with no address, so the caller can say so.
 */
export function technitiumLanIps(args: { dockgeHosts: Record<string, string>; exportHosts: { name: string; internalIp: string }[]; fixed: Record<string, string>; isLan: (ip: string) => boolean }): {
  ips: Record<string, string>;
  missing: string[];
} {
  const ips: Record<string, string> = { ...args.fixed };
  for (const [cluster, hostName] of Object.entries(args.dockgeHosts)) {
    if (ips[cluster]) continue;
    const ip = args.exportHosts.find(host => host.name === hostName)?.internalIp;
    if (ip && args.isLan(ip)) ips[cluster] = ip;
  }
  const expected = [...new Set([...Object.keys(args.fixed), ...Object.keys(args.dockgeHosts)])];
  return { ips, missing: expected.filter(cluster => !ips[cluster]) };
}
