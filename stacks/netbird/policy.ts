/**
 * The client-access policy (#2888, docs/plans/netbird-mirror.md §J): which
 * NetBird users and devices reach which site LAN, on which ports.
 *
 * Pure, so `node --test` evaluates it. It is hand-written, and each rule names
 * the Tailscale user grants it mirrors (`mirrors`). policyDrift.ts checks that
 * every user-facing Tailscale grant is either mirrored here or listed in
 * TAILSCALE_ONLY with a reason.
 *
 * Sources are names: the Authentik groups (JWT-synced, so they exist only once
 * someone in them has logged in) and the device groups stacks/netbird creates.
 * Destinations are the `lan-<site>` resource groups from sites.ts, or
 * `equestria-entry`, the cluster's own two addresses (#2889).
 */

export type Protocol = "tcp" | "udp" | "all";

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

const USERS = ["admins", "family", "friends", "media-managers"];

export const ACCESS_RULES: AccessRule[] = [
  {
    name: "users-web",
    description: "Every app behind Traefik and the Authentik VIP",
    sources: USERS,
    destination: "lan-home",
    protocol: "tcp",
    ports: [80, 443],
    mirrors: ["default-apps-access", "member-home-subnet-access", "member-dockge-web", "member-cluster-web", "member-idp"],
  },
  {
    name: "dns-udp",
    description: "Technitium over the LAN",
    sources: [...USERS, "apple-tv"],
    destination: "lan-home",
    protocol: "udp",
    ports: [53],
    mirrors: ["default-dns"],
  },
  {
    name: "dns-tcp",
    description: "Technitium over the LAN (TCP fallback)",
    sources: [...USERS, "apple-tv"],
    destination: "lan-home",
    protocol: "tcp",
    ports: [53],
    mirrors: ["default-dns"],
  },
  {
    name: "apple-tv-media",
    description: "Jellyfin and the other media apps, all HTTPS through Traefik",
    sources: ["apple-tv"],
    destination: "lan-home",
    protocol: "tcp",
    ports: [443],
    mirrors: [],
  },
  {
    name: "users-equestria",
    description: "The same apps through the in-cluster routers (#2889), when the home gateways are down",
    sources: USERS,
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

/** Whether `rules` let a peer in group `source` reach `destination` on `protocol`/`port`. */
export function allows(rules: AccessRule[], source: string, destination: string, protocol: "tcp" | "udp", port: number): boolean {
  return rules.some(rule => rule.sources.includes(source) && rule.destination === destination && (rule.protocol === "all" || rule.protocol === protocol) && (rule.ports === undefined || rule.ports.includes(port)));
}

export interface LiveGroup {
  id: string;
  name: string;
  /** `jwt` for groups JWT sync created, `api` for ones made through the API (stacks/netbird), `integration` otherwise. */
  issued?: string;
}

/**
 * Map rule source names to live group ids.
 *
 * Authentik groups only count once JWT sync has created them, i.e. once one of
 * their members has logged in. A same-named group made through the API is a
 * conflict: sync silently skips it, so its id would grant nobody.
 */
export function resolveGroups(live: LiveGroup[], names: string[], deviceGroups: string[]): { ids: Record<string, string>; missing: string[]; conflicts: string[] } {
  const ids: Record<string, string> = {};
  const missing: string[] = [];
  const conflicts: string[] = [];
  for (const name of names) {
    const wanted = deviceGroups.includes(name) ? "api" : "jwt";
    const match = live.find(group => group.name === name && group.issued === wanted);
    if (match) ids[name] = match.id;
    else if (live.some(group => group.name === name)) conflicts.push(name);
    else missing.push(name);
  }
  return { ids, missing, conflicts };
}
