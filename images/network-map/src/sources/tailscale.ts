/**
 * Tailscale: the tailnet's devices, their tags and routes, and the policy
 * file's grants and ACLs as REACHES.
 *
 *   POST https://api.tailscale.com/api/v2/oauth/token        client_credentials -> a ~1h access token
 *   GET  /api/v2/tailnet/<tailnet>/devices?fields=all        devices, tags, advertised/enabled routes
 *   GET  /api/v2/tailnet/<tailnet>/acl  (Accept: application/hujson)  the policy file as written
 *
 * The token is minted here, every run, from the OAuth client
 * (`third-party-tokens/tailscale/pulumi-oauth`), rather than read from the
 * 1h token at `third-party-tokens/tailscale/api-key`: that one is re-minted
 * only by a stacks/unifi-network run and reaches a pod through an
 * ExternalSecret refresh, so a stalled Stack or a late refresh hands the job
 * an expired token. Minting here depends on nothing but the client.
 *
 * Not reported by the API (schema.md): device owner, online state, split
 * DNS, Tailscale Service VIPs. `svc:` and `ipset:` selectors are counted as
 * unresolved rather than drawn.
 */
import { createHash } from "node:crypto";
import type { ApiClient } from "../http.ts";
import { parseHujson } from "../hujson.ts";
import { emptyResult, type PlainNode, type ReachObservation, type ReachTarget, type SourceResult, TAILNET_NETWORK_ID } from "../model.ts";
import { normalizeHostname, normalizeIp, parseCidr, toIso, uniq } from "../normalize.ts";

export interface TailscaleDevice {
  id?: string;
  nodeId: string;
  name: string;
  hostname: string;
  addresses?: string[];
  os?: string;
  tags?: string[];
  created?: string;
  lastSeen?: string;
  advertisedRoutes?: string[];
  enabledRoutes?: string[];
  connectedToControl?: boolean;
  authorized?: boolean;
}

export interface TailscaleGrant {
  src?: string[];
  dst?: string[];
  ip?: string[];
  app?: Record<string, unknown>;
}

export interface TailscaleAcl {
  action?: string;
  src?: string[];
  dst?: string[];
  proto?: string;
}

export interface TailscalePolicy {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
  grants?: TailscaleGrant[];
  acls?: TailscaleAcl[];
}

const EXIT_ROUTES = new Set(["0.0.0.0/0", "::/0"]);
export const tailscaleGroupKey = (selector: string) => `tailscale:${selector}`;
export const tailscaleRouteKey = (cidr: string) => `tailscale:${cidr}`;

/** A short, stable id for a policy entry: grants have no id of their own, and an index moves when one is inserted above. */
export function policyEntryId(kind: "grant" | "acl", entry: unknown): string {
  return `tailscale:${kind}:${createHash("sha256").update(JSON.stringify(entry)).digest("hex").slice(0, 12)}`;
}

/** The schema's Group kind for a selector. */
function groupKind(selector: string): string {
  if (selector.startsWith("tag:")) return "tag";
  if (selector === "autogroup:self") return "self";
  if (selector.startsWith("group:") || selector.includes("@") || selector.startsWith("autogroup:member") || selector.startsWith("autogroup:admin") || selector.startsWith("autogroup:owner")) return "user";
  return "device";
}

/** One selector -> where its edge goes, or undefined when it cannot be drawn (`svc:`, `ipset:`). */
export function resolveSelector(selector: string, hosts: Record<string, string>): ReachTarget | undefined {
  const s = selector.trim();
  if (s.startsWith("svc:") || s.startsWith("ipset:")) return undefined;
  if (s === "*" || s.startsWith("tag:") || s.startsWith("group:") || s.startsWith("autogroup:") || s.includes("@")) return { group: tailscaleGroupKey(s) };
  const aliased = hosts[s];
  const cidr = parseCidr(aliased ?? s);
  return cidr ? { cidr: cidr.cidr } : undefined;
}

/** `tag:web:443,80` -> [`tag:web`, [`443`, `80`]]; an IPv6 literal in brackets is kept whole. */
export function splitAclDestination(dst: string): { selector: string; ports: string[] } {
  const at = dst.lastIndexOf(":");
  if (at <= 0) return { selector: dst, ports: ["*"] };
  return {
    selector: dst.slice(0, at).replace(/^\[(.*)\]$/, "$1"),
    ports: dst
      .slice(at + 1)
      .split(",")
      .filter(Boolean),
  };
}

export interface PolicyReach {
  policies: PlainNode[];
  groups: PlainNode[];
  reaches: ReachObservation[];
  unresolved: string[];
}

/**
 * The policy file -> Policy nodes and REACHES edges. Each grant (and legacy
 * ACL rule) is one Policy, and each (src, dst) pair one REACHES `{via, ports}`.
 * A grant with only `app` capabilities and no `ip` grants no network reach and
 * is skipped.
 */
export function policyToReach(policy: TailscalePolicy): PolicyReach {
  const hosts = policy.hosts ?? {};
  const out: PolicyReach = { policies: [], groups: [], reaches: [], unresolved: [] };
  const groups = new Map<string, PlainNode>();
  const addGroup = (selector: string) => {
    const key = tailscaleGroupKey(selector);
    if (!groups.has(key)) groups.set(key, { key, props: { system: "tailscale", name: selector, kind: groupKind(selector), members: policy.groups?.[selector] } });
    return key;
  };
  for (const name of Object.keys(policy.groups ?? {})) addGroup(name);
  for (const name of Object.keys(policy.tagOwners ?? {})) addGroup(name);

  const emit = (via: string, srcs: string[], dsts: { selector: string; ports: string[] }[]) => {
    for (const src of srcs) {
      const from = resolveSelector(src, hosts);
      if (!from || !("group" in from)) {
        // A source has to be a group-like thing for a REACHES edge; an IP source is noted.
        out.unresolved.push(src);
        continue;
      }
      addGroup(src);
      for (const dst of dsts) {
        const to = resolveSelector(dst.selector, hosts);
        if (!to) {
          out.unresolved.push(dst.selector);
          continue;
        }
        if ("group" in to) addGroup(dst.selector);
        out.reaches.push({ from: from.group, to, via, ports: dst.ports });
      }
    }
  };

  for (const grant of policy.grants ?? []) {
    if (!grant.ip || grant.ip.length === 0) continue;
    const via = policyEntryId("grant", grant);
    const ports = uniq(grant.ip);
    out.policies.push({ key: via, props: { system: "tailscale", name: `grant ${(grant.src ?? []).join(",")} -> ${(grant.dst ?? []).join(",")}`, action: "accept", ports } });
    emit(
      via,
      grant.src ?? [],
      (grant.dst ?? []).map(selector => ({ selector, ports })),
    );
  }
  for (const acl of policy.acls ?? []) {
    if ((acl.action ?? "accept") !== "accept") continue;
    const via = policyEntryId("acl", acl);
    const dsts = (acl.dst ?? []).map(splitAclDestination).map(d => ({ ...d, ports: acl.proto ? d.ports.map(p => `${acl.proto}:${p}`) : d.ports }));
    out.policies.push({ key: via, props: { system: "tailscale", name: `acl ${(acl.src ?? []).join(",")} -> ${(acl.dst ?? []).join(",")}`, action: "accept", ports: uniq(dsts.flatMap(d => d.ports)) } });
    emit(via, acl.src ?? [], dsts);
  }
  out.groups = [...groups.values()];
  out.unresolved = uniq(out.unresolved);
  return out;
}

export function parseTailscaleDevices(devices: TailscaleDevice[]): SourceResult {
  const result = emptyResult("tailscale");
  result.networks.push({ key: TAILNET_NETWORK_ID, props: { name: "tailnet", kind: "tailnet", cidr: "100.64.0.0/10" } });
  const routes = new Map<string, PlainNode>();
  for (const d of devices) {
    const fqdn = d.name.toLowerCase().replace(/\.$/, "");
    const ips = uniq((d.addresses ?? []).map(normalizeIp));
    const enabled = new Set((d.enabledRoutes ?? []).map(r => parseCidr(r)?.cidr));
    const advertises = uniq((d.advertisedRoutes ?? []).map(r => parseCidr(r)?.cidr)).map(cidr => {
      const routeId = tailscaleRouteKey(cidr);
      if (!routes.has(routeId)) routes.set(routeId, { key: routeId, props: { system: "tailscale", cidr, exit: EXIT_ROUTES.has(cidr) } });
      return { routeId, approved: enabled.has(cidr) };
    });
    const tags = d.tags ?? [];
    for (const tag of tags) {
      const key = tailscaleGroupKey(tag);
      if (!result.groups.some(g => g.key === key)) result.groups.push({ key, props: { system: "tailscale", name: tag, kind: "tag" } });
    }
    const lastSeen = toIso(d.lastSeen);
    const firstSeen = toIso(d.created);
    result.machines.push({
      source: "tailscale",
      key: `tailscale:${d.nodeId}`,
      name: d.hostname || fqdn,
      kind: "client",
      os: d.os,
      firstSeen,
      lastSeen,
      hostnames: uniq([normalizeHostname(d.hostname), normalizeHostname(fqdn)]),
      tailnetFqdns: [fqdn],
      interfaces: [
        {
          network: { networkId: TAILNET_NETWORK_ID },
          ips,
          hostname: normalizeHostname(fqdn),
          online: d.connectedToControl,
          firstSeen,
          lastSeen,
          groups: tags.map(tailscaleGroupKey),
          advertises,
        },
      ],
    });
  }
  result.routes = [...routes.values()];
  return result;
}

export interface TailscaleOptions {
  tailnet: string;
}

export async function collectTailscale(client: ApiClient, options: TailscaleOptions): Promise<SourceResult & { unresolved: string[] }> {
  const tailnet = encodeURIComponent(options.tailnet);
  const [devices, policyText] = await Promise.all([
    client.getJson<{ devices: TailscaleDevice[] }>(`/api/v2/tailnet/${tailnet}/devices?fields=all`),
    client.getText(`/api/v2/tailnet/${tailnet}/acl`, "application/hujson"),
  ]);
  const result = parseTailscaleDevices(devices.devices ?? []);
  const reach = policyToReach(parseHujson<TailscalePolicy>(policyText));
  result.policies.push(...reach.policies);
  for (const g of reach.groups) if (!result.groups.some(x => x.key === g.key)) result.groups.push(g);
  result.reaches.push(...reach.reaches);
  return { ...result, unresolved: reach.unresolved };
}

/** The OAuth client_credentials exchange. `fetchImpl` is injectable for tests. */
export async function mintTailscaleToken(clientId: string, clientSecret: string, scopes: string | undefined, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
  if (scopes) body.set("scope", scopes);
  const response = await fetchImpl("https://api.tailscale.com/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Tailscale token exchange: HTTP ${response.status}`);
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Tailscale token exchange returned no access_token");
  return token.access_token;
}
