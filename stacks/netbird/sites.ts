/**
 * Which gateways route which site LAN for NetBird clients (#2887, D53,
 * docs/plans/netbird-mirror.md §G). Pure, so `node --test` covers the rules.
 *
 * Gateways are grouped per Dockge SITE STACK (`gateway-<site stack>`): the
 * Pulumi stack that deploys the hosts (stacks/home, stacks/gulf-of-mexico,
 * stacks/ocracoke). Each host keeps its own setup key, `gateway-<cluster key>`,
 * which places its peer in its stack's group. Which stack routes which site
 * LAN is decided here, not by the setup keys: moving a stack is a one-line edit.
 */

/** Each Dockge site stack and the cluster keys of the hosts it deploys, each running a netbird-gateway container. */
export const GATEWAY_SITE_STACKS: Record<string, string[]> = {
  // stacks/home: Cluster: Celestia and Cluster: Alpha Site.
  home: ["alpha-site", "celestia"],
  // stacks/gulf-of-mexico: Cluster: Luna.
  "gulf-of-mexico": ["luna"],
  // stacks/ocracoke: Cluster: Skystar.
  ocracoke: ["skystar"],
};

/** The NetBird group a site stack's gateway peers sit in. */
export const gatewayGroupName = (siteStack: string): string => `gateway-${siteStack}`;

/** The name a gateway peer enrols with (NB_HOSTNAME in docker/_common/netbird-gateway/.env), and its setup key's. */
export const gatewayPeerName = (host: string): string => `gateway-${host}`;

/** Every gateway host, by cluster key, in site-stack order. */
export function gatewayHosts(siteStacks: Record<string, string[]>): string[] {
  return Object.values(siteStacks).flat();
}

/** The site stack that deploys `host`, or undefined. */
export function siteStackOf(siteStacks: Record<string, string[]>, host: string): string | undefined {
  return Object.entries(siteStacks).find(([, hosts]) => hosts.includes(host))?.[0];
}

export interface Site {
  /** LAN prefixes this site's gateways route. */
  cidrs: string[];
  /** Site stacks (GATEWAY_SITE_STACKS keys) whose gateway group routes them. */
  gatewayStacks: string[];
}

/**
 * Where each site stack's gateways physically are today. Every gateway host
 * is on the home LAN: luna (`lunaIsRemote = false` in stacks/gulf-of-mexico)
 * and skystar (`skystarOnHomeLan = true` in stacks/ocracoke) too, so the home
 * LAN is routed by all three groups. When one moves, move its stack here.
 * gulf-of-mexico's LAN is not recorded in this repo, so it gets a site once
 * luna goes back there.
 */
export const SITES: Record<string, Site> = {
  home: { cidrs: ["10.10.0.0/16"], gatewayStacks: ["home", "gulf-of-mexico", "ocracoke"] },
  ocracoke: { cidrs: ["192.168.1.0/24"], gatewayStacks: [] },
};

function toRange(cidr: string): [number, number] {
  const [address, bits] = cidr.split("/");
  const value = address.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(bits));
  const start = value - (value % size);
  return [start, start + size - 1];
}

/** Every reason `sites` and `siteStacks` cannot be applied. Empty means they are consistent. */
export function siteProblems(sites: Record<string, Site>, siteStacks: Record<string, string[]>): string[] {
  const problems: string[] = [];
  const stackOfHost = new Map<string, string>();
  for (const [stack, hosts] of Object.entries(siteStacks)) {
    if (hosts.length === 0) problems.push(`site stack ${stack} has no gateway hosts`);
    for (const host of hosts) {
      const other = stackOfHost.get(host);
      if (other) problems.push(`${host} is in both site stacks ${other} and ${stack}`);
      else stackOfHost.set(host, stack);
    }
  }
  const owner = new Map<string, string>();
  for (const [name, site] of Object.entries(sites)) {
    for (const stack of site.gatewayStacks) {
      if (!(stack in siteStacks)) problems.push(`${stack} is not a gateway site stack (add it to GATEWAY_SITE_STACKS)`);
      const other = owner.get(stack);
      if (other) problems.push(`${stack} routes both ${other} and ${name}`);
      else owner.set(stack, name);
    }
  }
  const prefixes = Object.entries(sites).flatMap(([name, site]) => site.cidrs.map(cidr => ({ name, cidr, range: toRange(cidr) })));
  for (let i = 0; i < prefixes.length; i++) {
    for (let j = i + 1; j < prefixes.length; j++) {
      const [a, b] = [prefixes[i], prefixes[j]];
      if (a.range[0] <= b.range[1] && b.range[0] <= a.range[1]) problems.push(`${a.name} ${a.cidr} overlaps ${b.name} ${b.cidr}`);
    }
  }
  return problems;
}

/** Sites with at least one gateway stack: the only ones that get a Network and router. */
export function routedSites(sites: Record<string, Site>): [string, Site][] {
  return Object.entries(sites).filter(([, site]) => site.gatewayStacks.length > 0);
}

/** The fields of a GET /api/peers entry gatewayGroupPeers reads. */
export interface LiveGatewayPeer {
  id: string;
  name: string;
  groups?: { name: string }[];
}

/**
 * The peer ids a site stack's gateway group should hold: the ids it already
 * holds live, in their live order, then every enrolled gateway peer of the
 * stack's hosts that is missing. Setup keys add a newly enrolled peer to the
 * group outside Pulumi, so the declared list must never drop a live member,
 * or the next update (or a refresh) would take that peer out again. A gateway
 * peer is a peer named `gateway-<host>` in the `gateways` group, which only
 * the gateway setup keys place peers in; a host with none enrolled is left
 * out and joins through its key.
 */
export function gatewayGroupPeers(hosts: readonly string[], peers: readonly LiveGatewayPeer[], liveMembers: readonly string[], gatewaysGroup = "gateways"): string[] {
  const names = new Set(hosts.map(gatewayPeerName));
  const enrolled = peers.filter(peer => names.has(peer.name) && (peer.groups ?? []).some(group => group.name === gatewaysGroup)).map(peer => peer.id);
  return [...new Set([...liveMembers, ...enrolled])];
}
