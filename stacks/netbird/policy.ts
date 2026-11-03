/**
 * The client-access policy (#2888, docs/plans/netbird-mirror.md §J): which
 * NetBird users and devices reach what, on which ports.
 *
 * Pure, so `node --test` evaluates it. It is hand-written, and each rule names
 * the Tailscale user grants it mirrors (`mirrors`). policyDrift.ts checks that
 * every user-facing Tailscale grant is either mirrored here or listed in
 * TAILSCALE_ONLY with a reason.
 *
 * Sources are names: the Authentik groups (JWT-synced, so they exist only once
 * someone in them has logged in) and the device groups stacks/netbird creates.
 * Destinations are resource or peer groups:
 *
 *   home-web     the addresses member-home-subnet-access allows: the cluster's
 *                LAN IPs, every exported host's internalIp, the Authentik VIP
 *   home-dns     Technitium's LAN IPs
 *   home-media   the cluster's LAN IPs (Jellyfin and the rest sit behind its Gateway)
 *   lan-home     the whole home LAN (admins only)
 *   gateways     the gateway peers themselves, for exit nodes
 *   equestria-entry  the cluster's two /32s via the in-cluster routers (#2889)
 */

export type Protocol = "tcp" | "udp" | "icmp" | "all";

export interface AccessRule {
  name: string;
  description: string;
  sources: string[];
  destination: string;
  protocol: Protocol;
  /** Omitted: every port. */
  ports?: number[];
  /** The Tailscale grants (by name, or `src -> dst` when unnamed) this rule carries over. */
  mirrors: string[];
}

/** The Authentik groups that may log in at all (kubernetes/apps/pulumi/netbird-edge/definition.yaml). */
export const USER_GROUPS = ["admins", "family", "friends", "media-managers"];

/** Tailscale.ports.web, as ports: 80/443 plus 8443 and 7687, each on TCP and UDP (HTTP/3). */
const WEB_PORTS = [80, 443, 8443, 7687];

export const ACCESS_RULES: AccessRule[] = [
  {
    name: "users-web-tcp",
    description: "Web endpoints: the cluster's Gateways, the Dockge/Proxmox hosts' web ports, the Authentik VIP",
    sources: USER_GROUPS,
    destination: "home-web",
    protocol: "tcp",
    ports: WEB_PORTS,
    mirrors: ["default-apps-access", "member-home-subnet-access", "member-dockge-web", "member-cluster-web", "member-idp"],
  },
  {
    name: "users-web-udp",
    description: "The same endpoints over HTTP/3",
    sources: USER_GROUPS,
    destination: "home-web",
    protocol: "udp",
    ports: WEB_PORTS,
    mirrors: ["member-home-subnet-access"],
  },
  {
    name: "dns-udp",
    description: "Technitium over the LAN",
    sources: [...USER_GROUPS, "apple-tv"],
    destination: "home-dns",
    protocol: "udp",
    ports: [53],
    mirrors: ["default-dns"],
  },
  {
    name: "dns-tcp",
    description: "Technitium over the LAN (TCP fallback)",
    sources: [...USER_GROUPS, "apple-tv"],
    destination: "home-dns",
    protocol: "tcp",
    ports: [53],
    mirrors: ["default-dns"],
  },
  {
    name: "apple-tv-media",
    description: "Jellyfin and the other media apps, HTTPS through the cluster's Gateway",
    sources: ["apple-tv"],
    destination: "home-media",
    protocol: "tcp",
    ports: [443],
    mirrors: [],
  },
  {
    name: "users-exit-nodes",
    description: "Connects users to the gateways so their exit-node routes sync; the routes' own ACL carries the traffic",
    sources: USER_GROUPS,
    destination: "gateways",
    protocol: "icmp",
    mirrors: ["member-exit-node"],
  },
  {
    name: "users-equestria",
    description: "The same apps through the in-cluster routers (#2889), when the home gateways are down",
    sources: USER_GROUPS,
    destination: "equestria-entry",
    protocol: "tcp",
    ports: [80, 443],
    mirrors: [],
  },
  {
    name: "apple-tv-equestria",
    description: "Media through the in-cluster routers (#2889)",
    sources: ["apple-tv"],
    destination: "equestria-entry",
    protocol: "tcp",
    ports: [443],
    mirrors: [],
  },
  {
    name: "admins-lan",
    description: "Everything on the LAN",
    sources: ["admins"],
    destination: "lan-home",
    protocol: "all",
    mirrors: ["admins-home-subnet-access", "garage-admin", "autogroups.admin -> tag.proxmox, tag.backups, tag.dockge, tag.dns"],
  },
];

/** Whether `rules` let a peer in group `source` reach `destination` on `protocol`/`port` (port is ignored for ICMP). */
export function allows(rules: AccessRule[], source: string, destination: string, protocol: "tcp" | "udp" | "icmp", port: number): boolean {
  return rules.some(
    rule => rule.sources.includes(source) && rule.destination === destination && (rule.protocol === "all" || rule.protocol === protocol) && (protocol === "icmp" || rule.ports === undefined || rule.ports.includes(port)),
  );
}

/**
 * The home LAN's specific endpoints, as `address -> resource groups`. One
 * NetBird resource per address, carrying every group it belongs to.
 */
export function homeResourceGroups(args: { clusterIps: string[]; hostIps: string[]; authentikVip: string; dnsIps: string[] }): Record<string, string[]> {
  const groups: Record<string, Set<string>> = {};
  const add = (ip: string, group: string) => (groups[ip] ??= new Set()).add(group);
  for (const ip of args.clusterIps) {
    add(ip, "home-web");
    add(ip, "home-media");
  }
  for (const ip of [...args.hostIps, args.authentikVip]) add(ip, "home-web");
  for (const ip of args.dnsIps) add(ip, "home-dns");
  return Object.fromEntries(Object.entries(groups).map(([ip, set]) => [ip, [...set].sort()]));
}

export interface LiveGroup {
  id: string;
  name: string;
  /** `jwt` for groups JWT sync created, `api` for ones made through the API, `integration` otherwise. */
  issued?: string;
}

/**
 * Map Authentik group names to the live groups JWT sync created.
 *
 * A group exists only once one of its members has logged in. A same-named
 * group made through the API is a conflict: sync silently skips it, so its id
 * would grant nobody.
 */
export function resolveGroups(live: LiveGroup[], names: string[]): { ids: Record<string, string>; missing: string[]; conflicts: string[] } {
  const ids: Record<string, string> = {};
  const missing: string[] = [];
  const conflicts: string[] = [];
  for (const name of names) {
    const match = live.find(group => group.name === name && group.issued === "jwt");
    if (match) ids[name] = match.id;
    else if (live.some(group => group.name === name)) conflicts.push(name);
    else missing.push(name);
  }
  return { ids, missing, conflicts };
}
