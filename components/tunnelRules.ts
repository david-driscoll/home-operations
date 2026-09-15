/**
 * What the Cloudflare tunnel may forward, derived from the HTTPRoutes attached to
 * the `external` Gateway -- hostname AND path, not hostname alone.
 *
 * Pure: no Pulumi, no Kubernetes client, no network. `stacks/vault/externalHostnames.ts`
 * does the listing and hands the routes here; `components/CloudflareTunnel.ts` turns
 * the result into ingress rules. Tested by `components/tunnelRules.test.ts`.
 *
 * ## Why paths, and why this is NOT the security boundary
 *
 * A tunnel ingress rule used to be one hostname, whole. For a hostname that is
 * published only for part of its paths -- postiz, where only `/uploads/` is
 * public -- that let every other path through to the origin. On 2026-09-15 that
 * exposed postiz's login and open registration to the internet, because the
 * origin (Traefik) served the external AND internal Gateways on one entrypoint,
 * so a tunneled `/` matched the INTERNAL route.
 *
 * The boundary is the dedicated Traefik entrypoint the tunnel now targets (see
 * `kubernetes/apps/network/traefik/values.yaml`, entrypoint `tunnel`): only routes
 * attached to the external Gateway are bound to it, whatever path arrives.
 *
 * Paths are the second layer, and they cannot be the first: cloudflared matches
 * the rule against the request path, while Traefik routes on the CLEANED path.
 * Measured against this Traefik: `/uploads/../api/` and `/uploads/%2e%2e/api/`
 * both reach `/api/`. That is why a restricted hostname also gets a deny rule for
 * `..` segments (see `buildIngressRules`), and why neither replaces the entrypoint.
 *
 * ## Regex dialect
 *
 * cloudflared compiles `path` with Go's `regexp` (RE2) and matches it against the
 * decoded `URL.Path`, unanchored. Everything emitted here is anchored, and uses
 * only syntax RE2 and JavaScript agree on -- no lookaround -- so the unit tests,
 * which run in JavaScript, are testing the same language cloudflared runs.
 */

/** A hostname the tunnel serves, optionally restricted to a path regex. */
export interface TunnelRule {
  hostname: string;
  /** Anchored RE2 regex. Absent = every path on the hostname. */
  path?: string;
}

/** One cloudflared ingress entry, before origin settings are attached. */
export interface TunnelIngressEntry {
  hostname?: string;
  path?: string;
  /** `origin` = forward to the origin service; anything else is a literal cloudflared service. */
  service: "origin" | string;
}

export interface HttpRouteLike {
  metadata?: { name?: string; namespace?: string };
  spec?: {
    parentRefs?: { name?: string; namespace?: string; kind?: string; group?: string; sectionName?: string }[];
    hostnames?: string[];
    rules?: { matches?: { path?: { type?: string; value?: string } }[] }[];
  };
}

export const EXTERNAL_GATEWAY_NAME = "external";
export const EXTERNAL_GATEWAY_NAMESPACE = "network";

/**
 * Status a request for a restricted hostname gets when its path contains a `..`
 * segment. Same code as the catch-all, deliberately: from outside, a blocked
 * traversal is indistinguishable from a path that is simply not served.
 */
export const TRAVERSAL_DENY_SERVICE = "http_status:404";

/**
 * A `..` path segment, in the decoded path cloudflared matches against, so
 * `%2e%2e` is caught as well as a literal `..`.
 */
export const TRAVERSAL_PATH = "(^|/)\\.\\.(/|$)";

export function isAttachedToExternalGateway(route: HttpRouteLike): boolean {
  return (route.spec?.parentRefs ?? []).some(
    ref =>
      ref.name === EXTERNAL_GATEWAY_NAME &&
      // A parentRef with no namespace means the route's own namespace, per the
      // Gateway API spec. Defaulting it to `network` would match a route in any
      // namespace that happened to name a local Gateway "external".
      (ref.namespace ?? route.metadata?.namespace) === EXTERNAL_GATEWAY_NAMESPACE &&
      // `kind` defaults to Gateway when absent.
      (ref.kind ?? "Gateway") === "Gateway",
  );
}

/** RE2 metacharacters escaped; `/` and `-` need no escaping and are left alone. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The regex fragment (unanchored) one Gateway API path match publishes, or
 * `null` when it publishes every path on the hostname.
 *
 * Gateway API semantics, not string semantics:
 * - absent path, absent type, and `PathPrefix /` all mean "everything";
 * - `PathPrefix /abc` matches `/abc` and `/abc/...` but NOT `/abcd`, and a
 *   trailing slash on the value is ignored (`/abc/` also matches `/abc`);
 * - `Exact` matches the one path.
 */
export function pathFragment(match: { path?: { type?: string; value?: string } } | undefined, where: string): string | null {
  const path = match?.path;
  if (!path) return null;
  const type = path.type ?? "PathPrefix";
  const value = path.value ?? "/";

  switch (type) {
    case "PathPrefix": {
      const trimmed = value.replace(/\/+$/, "");
      if (trimmed === "") return null;
      return `${escapeRegex(trimmed)}(/|$)`;
    }
    case "Exact":
      return `${escapeRegex(value)}$`;
    default:
      // RegularExpression is implementation-specific in Gateway API, and a
      // guessed translation that came out BROADER than Traefik's would publish
      // paths nobody asked to publish. Refuse rather than guess.
      throw new Error(`${where}: path match type "${type}" cannot be expressed as a tunnel rule. Use PathPrefix or Exact on routes attached to the external Gateway.`);
  }
}

/**
 * Every hostname published through the external Gateway, with the paths it is
 * published for. Sorted by hostname; one rule per hostname.
 *
 * Several routes may claim one hostname for different paths -- Gateway API allows
 * it -- so their paths are merged. If ANY rule on ANY of those routes publishes
 * the whole hostname, the merged rule does too.
 */
export function deriveTunnelRules(routes: HttpRouteLike[]): TunnelRule[] {
  // hostname -> set of fragments, or null once any route publishes it whole.
  const byHost = new Map<string, Set<string> | null>();

  for (const route of routes) {
    if (!isAttachedToExternalGateway(route)) continue;
    const where = `HTTPRoute ${route.metadata?.namespace ?? "?"}/${route.metadata?.name ?? "?"}`;

    // A route rule with no matches matches every request.
    const fragments: (string | null)[] = [];
    for (const rule of route.spec?.rules ?? [{}]) {
      const matches = rule.matches ?? [];
      if (matches.length === 0) {
        fragments.push(null);
        continue;
      }
      for (const match of matches) fragments.push(pathFragment(match, where));
    }
    if (fragments.length === 0) fragments.push(null);

    // A route with no hostnames matches every hostname the Gateway listens on.
    // A tunnel rule cannot express that, and inventing a wildcard would route
    // names nobody asked to publish. Skipped rather than guessed.
    for (const rawHostname of route.spec?.hostnames ?? []) {
      const hostname = rawHostname.trim();
      if (hostname === "") continue;

      const existing = byHost.has(hostname) ? byHost.get(hostname) : new Set<string>();
      if (existing === null || fragments.includes(null)) {
        byHost.set(hostname, null);
        continue;
      }
      for (const fragment of fragments) existing?.add(fragment as string);
      byHost.set(hostname, existing ?? new Set<string>());
    }
  }

  return [...byHost.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hostname, fragments]) => {
      if (fragments === null || fragments.size === 0) return { hostname };
      const alternatives = [...fragments].sort();
      return { hostname, path: `^(${alternatives.join("|")})` };
    });
}

/**
 * The ordered cloudflared ingress list: for each restricted hostname a
 * traversal deny, then the serving rule; then the catch-all LAST, which
 * Cloudflare requires. cloudflared matches top-down, so the deny must precede the
 * rule it protects.
 *
 * Throws on an empty or duplicated hostname list -- see the guards in
 * `CloudflareTunnelComponent` for why those are refused rather than written.
 */
export function buildIngressEntries(rules: TunnelRule[], catchAllService: string): TunnelIngressEntry[] {
  const cleaned = rules.map(rule => ({ ...rule, hostname: rule.hostname.trim() })).filter(rule => rule.hostname.length > 0);
  if (cleaned.length === 0) {
    throw new Error("no tunnel rules");
  }
  const hostnames = cleaned.map(rule => rule.hostname);
  const duplicates = [...new Set(hostnames.filter((hostname, index) => hostnames.indexOf(hostname) !== index))];
  if (duplicates.length > 0) {
    throw new Error(`duplicate hostnames ${duplicates.join(", ")}`);
  }

  const entries: TunnelIngressEntry[] = [];
  for (const rule of [...cleaned].sort((a, b) => a.hostname.localeCompare(b.hostname))) {
    if (rule.path) {
      entries.push({ hostname: rule.hostname, path: TRAVERSAL_PATH, service: TRAVERSAL_DENY_SERVICE });
      entries.push({ hostname: rule.hostname, path: rule.path, service: "origin" });
    } else {
      entries.push({ hostname: rule.hostname, service: "origin" });
    }
  }
  entries.push({ service: catchAllService });
  return entries;
}
