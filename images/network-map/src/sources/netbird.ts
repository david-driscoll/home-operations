/**
 * NetBird: peers, groups, routes, networks (resources and routers), and the
 * access policies as REACHES. The management API directly, not the MCP,
 * because the MCP lacks network resource addresses (schema.md).
 *
 *   GET <url>/api/peers
 *   GET <url>/api/groups
 *   GET <url>/api/policies
 *   GET <url>/api/routes
 *   GET <url>/api/networks
 *   GET <url>/api/networks/<id>/resources
 *   GET <url>/api/networks/<id>/routers
 *
 * `Authorization: Token <pat>` with the `mcp` service user's PAT
 * (`third-party-tokens/netbird/mcp`, role auditor: every write is refused
 * server-side). The URL is that path's `url` field.
 */
import type { ApiClient } from "../http.ts";
import { emptyResult, type InterfaceObservation, NETBIRD_NETWORK_ID, type PlainNode, type ReachTarget, type SourceResult } from "../model.ts";
import { isJoinableLanIp, normalizeHostname, normalizeIp, normalizeMac, parseCidr, toIso, uniq } from "../normalize.ts";

export interface NetbirdGroupRef {
  id: string;
  name: string;
  issued?: string;
}

export interface NetbirdPeer {
  id: string;
  name: string;
  ip?: string;
  dns_label?: string;
  hostname?: string;
  connected?: boolean;
  last_seen?: string;
  os?: string;
  groups?: NetbirdGroupRef[];
  /** The peer's own NICs, as its client reports them (schema.md: `network_addresses[].mac`, `net_ip`). */
  network_addresses?: { net_ip?: string; mac?: string }[];
}

export interface NetbirdResourceRef {
  id: string;
  type?: string;
}

export interface NetbirdRule {
  id: string;
  name?: string;
  enabled?: boolean;
  action?: string;
  bidirectional?: boolean;
  protocol?: string;
  ports?: string[];
  port_ranges?: { start: number; end: number }[];
  sources?: NetbirdGroupRef[] | null;
  destinations?: NetbirdGroupRef[] | null;
  sourceResource?: NetbirdResourceRef | null;
  destinationResource?: NetbirdResourceRef | null;
}

export interface NetbirdPolicy {
  id: string;
  name: string;
  enabled?: boolean;
  rules?: NetbirdRule[];
}

export interface NetbirdRoute {
  id: string;
  network?: string;
  network_id?: string;
  description?: string;
  peer?: string;
  peer_groups?: string[];
  enabled?: boolean;
  masquerade?: boolean;
}

export interface NetbirdNetwork {
  id: string;
  name: string;
  description?: string;
}

export interface NetbirdNetworkResource {
  id: string;
  name?: string;
  type?: string;
  address?: string;
  enabled?: boolean;
  groups?: NetbirdGroupRef[];
}

export interface NetbirdNetworkRouter {
  id: string;
  peer?: string;
  peer_groups?: string[];
  enabled?: boolean;
  masquerade?: boolean;
}

export interface NetbirdSnapshot {
  peers: NetbirdPeer[];
  groups: NetbirdGroupRef[];
  policies: NetbirdPolicy[];
  routes: NetbirdRoute[];
  networks: (NetbirdNetwork & { resources: NetbirdNetworkResource[]; routers: NetbirdNetworkRouter[] })[];
}

export const netbirdGroupKey = (name: string) => `netbird:${name}`;
export const netbirdRouteKey = (cidr: string) => `netbird:${cidr}`;

/** NetBird's `issued`: `jwt` groups come from the IdP (user groups); `api` and `integration` ones hold peers. */
const groupKind = (issued: string | undefined) => (issued === "jwt" ? "user" : "device");

/** A rule's ports: `tcp:443`, `tcp:8000-8100`, or `<proto>:*` when it names none. */
export function rulePorts(rule: NetbirdRule): string[] {
  const proto = rule.protocol ?? "all";
  if (proto === "all") return ["*"];
  if (proto === "icmp") return ["icmp"];
  const ports = [...(rule.ports ?? []), ...(rule.port_ranges ?? []).map(r => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))];
  return ports.length === 0 ? [`${proto}:*`] : ports.map(p => `${proto}:${p}`);
}

/** Each enabled rule of each enabled policy -> one Policy node and its REACHES edges (both ways when bidirectional). */
export function policiesToReach(policies: NetbirdPolicy[], resources: Map<string, NetbirdNetworkResource>): Pick<SourceResult, "policies" | "reaches"> & { unresolved: string[] } {
  const out: Pick<SourceResult, "policies" | "reaches"> & { unresolved: string[] } = { policies: [], reaches: [], unresolved: [] };
  for (const policy of policies) {
    if (policy.enabled === false) continue;
    for (const rule of policy.rules ?? []) {
      if (rule.enabled === false || (rule.action ?? "accept") !== "accept") continue;
      const via = `netbird:${rule.id}`;
      const ports = rulePorts(rule);
      out.policies.push({
        key: via,
        props: { system: "netbird", name: rule.name && rule.name !== policy.name ? `${policy.name}/${rule.name}` : policy.name, action: rule.action ?? "accept", ports, bidirectional: !!rule.bidirectional },
      });
      const srcGroups = (rule.sources ?? []).map(g => netbirdGroupKey(g.name));
      const dsts: ReachTarget[] = (rule.destinations ?? []).map(g => ({ group: netbirdGroupKey(g.name) }));
      if (rule.destinationResource) {
        const resource = resources.get(rule.destinationResource.id);
        const cidr = parseCidr(resource?.address)?.cidr;
        if (cidr && resource?.type !== "domain") dsts.push({ cidr });
        else out.unresolved.push(`resource:${resource?.name ?? rule.destinationResource.id}`);
      }
      if (rule.sourceResource) out.unresolved.push(`source-resource:${rule.sourceResource.id}`);
      for (const from of srcGroups) for (const to of dsts) out.reaches.push({ from, to, via, ports });
      if (rule.bidirectional) {
        for (const to of dsts) {
          if (!("group" in to)) continue;
          for (const from of srcGroups) out.reaches.push({ from: to.group, to: { group: from }, via, ports });
        }
      }
    }
  }
  out.unresolved = uniq(out.unresolved);
  return out;
}

export function parseNetbird(snapshot: NetbirdSnapshot): SourceResult & { unresolved: string[] } {
  const result = emptyResult("netbird");
  result.networks.push({ key: NETBIRD_NETWORK_ID, props: { name: "netbird", kind: "netbird" } });

  const groupNameById = new Map(snapshot.groups.map(g => [g.id, g.name]));
  for (const g of snapshot.groups) result.groups.push({ key: netbirdGroupKey(g.name), props: { system: "netbird", name: g.name, kind: groupKind(g.issued), netbirdId: g.id } });

  // Routes: the legacy routes, plus network resources served by routers. Both -> Route, advertised by the routing peer.
  const routes = new Map<string, PlainNode>();
  const advertisedBy = new Map<string, { routeId: string; approved: boolean }[]>();
  const groupMembers = new Map<string, string[]>();
  for (const peer of snapshot.peers) for (const g of peer.groups ?? []) groupMembers.set(g.id, [...(groupMembers.get(g.id) ?? []), peer.id]);
  const advertise = (cidr: string | undefined, peerId: string | undefined, peerGroups: string[] | undefined, approved: boolean, props: Record<string, string | boolean | undefined>) => {
    const range = parseCidr(cidr);
    if (!range) return;
    const routeId = netbirdRouteKey(range.cidr);
    if (!routes.has(routeId)) routes.set(routeId, { key: routeId, props: { system: "netbird", cidr: range.cidr, exit: range.cidr === "0.0.0.0/0", ...props } });
    const peers = uniq([peerId, ...(peerGroups ?? []).flatMap(g => groupMembers.get(g) ?? [])]);
    for (const p of peers) advertisedBy.set(p, [...(advertisedBy.get(p) ?? []), { routeId, approved }]);
  };
  for (const route of snapshot.routes) advertise(route.network, route.peer, route.peer_groups, route.enabled !== false, { name: route.network_id, description: route.description });
  const resources = new Map<string, NetbirdNetworkResource>();
  for (const net of snapshot.networks) {
    for (const res of asArray(net.resources)) {
      resources.set(res.id, res);
      if (res.type === "domain") continue;
      for (const router of asArray(net.routers)) advertise(res.address, router.peer, router.peer_groups, router.enabled !== false && res.enabled !== false, { name: res.name, network: net.name });
    }
  }
  result.routes = [...routes.values()];

  for (const peer of snapshot.peers) {
    const lastSeen = toIso(peer.last_seen);
    const ip = normalizeIp(peer.ip);
    const groups = (peer.groups ?? []).map(g => netbirdGroupKey(g.name ?? groupNameById.get(g.id) ?? g.id));
    const interfaces: InterfaceObservation[] = [
      {
        network: { networkId: NETBIRD_NETWORK_ID },
        ips: ip ? [ip] : [],
        hostname: normalizeHostname(peer.dns_label),
        online: peer.connected,
        lastSeen,
        groups,
        advertises: advertisedBy.get(peer.id),
      },
    ];
    // The peer's LAN NICs. Only 10/8 and 192.168/16 (isJoinableLanIp): a
    // peer in a container also reports docker0, the same 172.17.0.1 on every host.
    for (const addr of peer.network_addresses ?? []) {
      const lanIp = normalizeIp(addr.net_ip);
      if (!lanIp || !isJoinableLanIp(lanIp)) continue;
      interfaces.push({ network: { lan: true }, mac: normalizeMac(addr.mac), ips: [lanIp], lastSeen });
    }
    result.machines.push({
      source: "netbird",
      key: `netbird:${peer.id}`,
      name: peer.name,
      kind: "client",
      os: peer.os,
      status: peer.connected ? "online" : "offline",
      lastSeen,
      hostnames: uniq([normalizeHostname(peer.hostname), normalizeHostname(peer.dns_label), normalizeHostname(peer.name)]),
      interfaces,
    });
  }
  const reach = policiesToReach(snapshot.policies, resources);
  result.policies = reach.policies;
  result.reaches = reach.reaches;
  return { ...result, unresolved: reach.unresolved };
}

export async function collectNetbird(client: ApiClient): Promise<SourceResult & { unresolved: string[] }> {
  const [peers, groups, policies, routes, networks] = await Promise.all([
    client.getJson<NetbirdPeer[]>("/api/peers"),
    client.getJson<NetbirdGroupRef[]>("/api/groups"),
    client.getJson<NetbirdPolicy[]>("/api/policies"),
    client.getJson<NetbirdRoute[]>("/api/routes"),
    client.getJson<NetbirdNetwork[]>("/api/networks"),
  ]);
  const withChildren = await Promise.all(
    networks.map(async net => ({
      ...net,
      resources: asArray(await client.getJson<NetbirdNetworkResource[] | null>(`/api/networks/${encodeURIComponent(net.id)}/resources`)),
      routers: asArray(await client.getJson<NetbirdNetworkRouter[] | null>(`/api/networks/${encodeURIComponent(net.id)}/routers`)),
    })),
  );
  return parseNetbird({ peers, groups, policies, routes, networks: withChildren });
}

/**
 * A list the NetBird API may hand back as something else: a network with no
 * resources or routers (`equestria-routers` has none) answered with a
 * non-array, and iterating it failed the whole source (2026-11-08,
 * "net.resources is not iterable"). Anything that is not an array is empty.
 */
export function asArray<T>(value: T[] | null | undefined | unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
