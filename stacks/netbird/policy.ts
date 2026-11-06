/**
 * The client-access policy (#2888, docs/plans/netbird-mirror.md §J): which
 * NetBird users and devices reach what, on which ports.
 *
 * Pure, so `node --test` evaluates it. It is hand-written, and each rule names
 * the Tailscale user grants it mirrors (`mirrors`). policyDrift.ts checks that
 * every user-facing Tailscale grant is either mirrored here or listed in
 * TAILSCALE_ONLY with a reason.
 *
 * Sources are names of groups stacks/netbird creates: the four user groups
 * (USER_GROUPS, which invites place people in) and the device groups setup
 * keys place peers in (DEVICE_GROUPS). Destinations are resource or peer groups:
 *
 *   home-web     the addresses member-home-subnet-access allows: the cluster's
 *                LAN IPs, every exported host's internalIp, the Authentik VIP
 *   home-dns     every Technitium node's LAN IP (the fallback path, via the gateways)
 *   dns-servers  the Technitium nodes' NetBird sidecars, a peer group (dns.ts)
 *   home-media   the cluster's LAN IPs (Jellyfin and the rest sit behind its Gateway)
 *   lan-home     the whole home LAN (admins only)
 *   gateways     the gateway peers themselves, for exit nodes
 *   k8s-routers  the in-cluster routing peers, which also serve `exit-home`
 *   exit-internet  the `exit-*` routes' access-control group. It has no peers:
 *                NetBird lets traffic through a route with access-control
 *                groups only for policies whose DESTINATION is one of them
 *                (management getPeerRoutesFirewallRules, v0.82.0), so this
 *                group exists to be that destination and nothing else
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

/**
 * The user groups. stacks/netbird creates them as ordinary API groups, and an
 * invite (`mise run netbird:invite`) puts its person in exactly one, as the
 * user's auto group: every peer that person registers joins it. Same names as
 * the Authentik groups they used to come from, so the rules below read the same.
 */
export const USER_GROUPS = ["admins", "family", "friends", "media-managers"];

/** The device groups stacks/netbird creates for setup-key peers, which rules may also name as sources. */
export const DEVICE_GROUPS = ["apple-tv", "dns-servers", "gateways", "k8s-routers"];

/** Tailscale.ports.dns less 443: Do53 and DoT/DoQ. DoH is each host's Traefik, outside the Technitium netns the sidecars share. */
const DNS_PORTS = [53, 853];

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
    name: "dns-servers-udp",
    description: "Technitium over the overlay, on each node's NetBird sidecar (Do53, DoQ)",
    sources: [...USER_GROUPS, "apple-tv"],
    destination: "dns-servers",
    protocol: "udp",
    ports: DNS_PORTS,
    mirrors: ["default-dns"],
  },
  {
    name: "dns-servers-tcp",
    description: "Technitium over the overlay, on each node's NetBird sidecar (Do53 over TCP, DoT)",
    sources: [...USER_GROUPS, "apple-tv"],
    destination: "dns-servers",
    protocol: "tcp",
    ports: DNS_PORTS,
    mirrors: ["default-dns"],
  },
  {
    name: "apple-tv-media",
    description: "Jellyfin and the other media apps through the cluster's Gateway: HTTPS, and HTTP for the short-name redirect",
    sources: ["apple-tv"],
    destination: "home-media",
    protocol: "tcp",
    // 80 only reaches Traefik's redirects: a short name to its app route
    // (docs/plans/short-names.md C5), anything else to HTTPS.
    ports: [80, 443],
    mirrors: [],
  },
  {
    name: "users-exit-nodes",
    description: "Connects users to the gateways so their exit-node routes sync; users-internet carries the traffic",
    sources: USER_GROUPS,
    destination: "gateways",
    protocol: "icmp",
    mirrors: ["member-exit-node"],
  },
  {
    name: "users-internet",
    description: "The internet through an exit node: the exit-* routes' access-control group, which is what their routing peers forward for",
    sources: USER_GROUPS,
    destination: "exit-internet",
    protocol: "all",
    mirrors: ["member-exit-node"],
  },
  {
    name: "users-exit-equestria",
    description: "Connects users to the in-cluster routers so exit-home's routes through them sync; users-internet carries the traffic",
    sources: USER_GROUPS,
    destination: "k8s-routers",
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
    // The same as apple-tv-media, so a down home gateway changes nothing.
    ports: [80, 443],
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

/**
 * The rule sources that name no group in `created`, as `rule: source`. Empty
 * when every source resolves; stacks/netbird refuses to run otherwise, since a
 * source it cannot resolve would silently grant nobody.
 */
export function unresolvedSources(rules: AccessRule[], created: string[]): string[] {
  return rules.flatMap(rule => rule.sources.filter(source => !created.includes(source)).map(source => `${rule.name}: ${source}`));
}
