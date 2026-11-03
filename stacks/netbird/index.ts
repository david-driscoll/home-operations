/**
 * The self-hosted NetBird account (#2885, docs/plans/netbird-mirror.md §I).
 *
 * stacks/netbird-edge runs the server and bootstrapped its owner; this stack
 * drives the account through the owner's PAT:
 *
 *   1. account settings, the overlay range first, before anything can enrol;
 *   2. the built-in allow-all `Default` policy removed;
 *   3. Authentik as the login connector, with JWT group sync;
 *   4. device groups and the setup keys that place peers in them;
 *   5. site LANs routed through the gateway containers, and each gateway an
 *      exit node (#2887);
 *   6. Technitium as every peer's nameserver;
 *   7. a service user whose PAT the in-cluster operator uses (#2889);
 *   8. the `equestria` network the operator's routing peers serve (#2889);
 *   9. the client-access policy (#2888, policy.ts);
 *  10. nbidp: the private reverse proxy's token, and the private service in
 *      front of Dex (#2891, nbidp.ts).
 *
 * User groups (admins, family, friends, media-managers) are NOT created here:
 * JWT group sync creates them from Authentik's `groups` claim on first login,
 * and a same-named group made through the API would collide with it. Policies
 * that name them (#2888) look them up instead.
 */
import * as netbird from "@pulumi/netbird";
import * as pulumi from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance, oidcBaoPath } from "components/bao.ts";
import { authentikVip, dns } from "components/constants.ts";
import { rootDomain } from "components/domains.ts";
import { GlobalResources } from "components/globals.ts";
import { NBIDP_BAO, nbidpHost } from "components/netbird/nbidp.ts";
import { NetbirdDefaultPolicyRemoval } from "dynamic/netbird/NetbirdDefaultPolicyRemoval.ts";
import { NetbirdPrivateService } from "dynamic/netbird/NetbirdPrivateService.ts";
import { NetbirdProxyToken } from "dynamic/netbird/NetbirdProxyToken.ts";
import { type LiveCluster, type LiveService, privateServiceAccessGroups, privateServiceReady, privateServiceRequest } from "./nbidp.ts";
import { ACCESS_RULES, type LiveGroup, resolveGroups, USER_GROUPS } from "./policy.ts";
import { routedSites, SITES, siteProblems } from "./sites.ts";

export { USER_GROUPS };

/** NetBird's overlay. Clear of Tailscale's 100.64/10 on dual-mesh desktops and of the 10.10/16 LAN. */
const NETWORK_RANGE = "10.100.0.0/16";
const DAY = 24 * 60 * 60;

const globals = new GlobalResources({}, {});
const provider = globals.netbirdProvider;
const owner = globals.netbirdOwner;
const opts = { provider };

// ── 1. Account ───────────────────────────────────────────────────────────
// Before any setup key or login connector exists, so no peer can ever take an
// address from the default range.
const settings = new netbird.AccountSettings(
  "account",
  {
    networkRange: NETWORK_RANGE,
    dnsDomain: `nb.${rootDomain()}`,
    // Client devices re-authenticate through Authentik monthly. Setup-key
    // peers (gateways, routers, Apple TVs) never expire.
    peerLoginExpirationEnabled: true,
    peerLoginExpiration: 30 * DAY,
    jwtGroupsEnabled: true,
    jwtGroupsClaimName: "groups",
    jwtAllowGroups: USER_GROUPS,
    // A user's groups also follow onto the peers they register.
    groupsPropagationEnabled: true,
    regularUsersViewBlocked: true,
    routingPeerDnsResolutionEnabled: true,
  },
  opts,
);

// ── 2. No allow-all ──────────────────────────────────────────────────────
const defaultPolicyRemoval = new NetbirdDefaultPolicyRemoval("default-policy", { managementUrl: owner.url, token: owner.personal_access_token }, { dependsOn: [settings] });

// ── 3. Login ─────────────────────────────────────────────────────────────
// The OAuth2 client stacks/system created from
// kubernetes/apps/pulumi/netbird-edge/definition.yaml. Its callback is the
// embedded Dex's `<issuer>/callback`.
const authentik = globals.store.getSecretByPath<{ client_id: string; client_secret: string; issuer: string }>(oidcBaoPath("equestria", "netbird"));
new netbird.IdentityProvider(
  "authentik",
  { type: "oidc", name: "Authentik", issuer: authentik.issuer, clientId: authentik.client_id, clientSecret: authentik.client_secret },
  { ...opts, dependsOn: [settings, defaultPolicyRemoval] },
);

// ── 4. Device groups and setup keys ──────────────────────────────────────
const group = (name: string) => new netbird.Group(name, { name }, { ...opts, dependsOn: [defaultPolicyRemoval] });
const groups = {
  gateways: group("gateways"),
  k8sRouters: group("k8s-routers"),
  appleTv: group("apple-tv"),
};

/**
 * The Dockge hosts that run a gateway container (#2887), by cluster key. Keyed
 * per HOST, not per site: hosts move between sites (luna and skystar are both
 * on the home LAN today), and a peer keeps the groups its setup key gave it.
 * Which host routes which site is decided by the Network routers instead.
 */
export const GATEWAY_HOSTS = ["alpha-site", "celestia", "luna", "skystar"];

const setupKey = (name: string, autoGroup: netbird.Group, extra: Partial<netbird.SetupKeyArgs> = {}) =>
  new netbird.SetupKey(name, { name, type: "reusable", autoGroups: [autoGroup.id], expirySeconds: 0, usageLimit: 0, ...extra }, { ...opts, dependsOn: [defaultPolicyRemoval] });

const gatewayHostGroups = Object.fromEntries(GATEWAY_HOSTS.map(host => [host, group(`gateway-${host}`)]));

const setupKeys = {
  // Read by docker/_common/netbird-gateway/.env as `#/gateway-${CLUSTER_KEY}`.
  ...Object.fromEntries(GATEWAY_HOSTS.map(host => [`gateway-${host}`, setupKey(`gateway-${host}`, groups.gateways, { autoGroups: [groups.gateways.id, gatewayHostGroups[host].id] }).key])),
  // Router pods come and go; ephemeral peers are cleaned up when they do.
  k8s_router: setupKey("k8s-router", groups.k8sRouters, { ephemeral: true }).key,
  // TVs have no user to log in with SSO, so they enrol by key (#2886).
  apple_tv: setupKey("apple-tv", groups.appleTv).key,
};

// ── 5. Site LANs and exit nodes (#2887) ─────────────────────────────────
// NetBird's built-in group of every peer.
const all = netbird.getGroupOutput({ name: "All" }, { provider });
const problems = siteProblems(SITES, GATEWAY_HOSTS);
if (problems.length > 0) throw new Error(`stacks/netbird/sites.ts is inconsistent:\n  - ${problems.join("\n  - ")}`);

// One resource group per site LAN: what #2888's policies grant users access to.
export const siteResourceGroups: Record<string, netbird.Group> = {};
for (const [site, config] of routedSites(SITES)) {
  const network = new netbird.Network(`lan-${site}`, { name: `lan-${site}`, description: `The ${site} LAN, via its gateway containers` }, { ...opts, dependsOn: [defaultPolicyRemoval] });
  const resourceGroup = (siteResourceGroups[site] = group(`lan-${site}`));
  for (const cidr of config.cidrs) {
    new netbird.NetworkResource(`lan-${site}-${cidr.replace(/[./]/g, "-")}`, { networkId: network.id, name: cidr, address: cidr, groups: [resourceGroup.id], enabled: true }, opts);
  }
  // Equal metrics: each client picks the lowest-latency gateway, and the
  // others take over when it goes. Masquerade, so LAN services see the
  // gateway host and need no return route to 10.100.0.0/16.
  new netbird.NetworkRouter(`lan-${site}`, { networkId: network.id, peerGroups: config.gateways.map(host => gatewayHostGroups[host].id), masquerade: true, metric: 9999, enabled: true }, opts);
}

// Every gateway is an exit node a client can pick (never applied by default).
// Exit nodes are still legacy network routes in NetBird.
for (const host of GATEWAY_HOSTS) {
  new netbird.Route(
    `exit-${host}`,
    {
      networkId: `exit-${host}`,
      description: `Exit through ${host}`,
      network: "0.0.0.0/0",
      peerGroups: [gatewayHostGroups[host].id],
      groups: [all.id],
      masquerade: true,
      skipAutoApply: true,
      enabled: true,
    },
    { ...opts, dependsOn: [defaultPolicyRemoval] },
  );
}

// ── 6. DNS ───────────────────────────────────────────────────────────────
// Technitium's LAN addresses, reached through the gateways' routes (#2887),
// so clients keep resolving the existing <root domain> names. Every peer
// gets them.
new netbird.NameserverGroup(
  "technitium",
  {
    name: "Technitium",
    description: "Estate DNS over the LAN routes (stacks/netbird)",
    nameservers: dns.internalIps.slice(0, 3).map(ip => ({ ip, nsType: "udp", port: 53 })),
    groups: [all.id],
    primary: true,
    enabled: true,
  },
  { ...opts, dependsOn: [settings] },
);

// ── 7. Service user ──────────────────────────────────────────────────────
// For machines: the operator's routers (#2889) and anything else that should
// not hold the owner's break-glass PAT.
const serviceUser = new netbird.User("automation", { name: "automation", isServiceUser: true, role: "admin" }, opts);
const serviceToken = new netbird.Token("automation", { userId: serviceUser.id, name: "automation", expirationDays: 365 }, { ...opts, additionalSecretOutputs: ["token"] });

if (!globals.baoDualWriteEnabled) {
  throw new Error("stacks/netbird needs OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID): it writes the setup keys and the service PAT there.");
}
const bao = { provider: globals.baoProvider };
baoKvSecret(
  "netbird-setup-keys",
  {
    mount: "secrets",
    path: "third-party-tokens/netbird/setup-keys",
    data: setupKeys,
    concealedFields: Object.keys(setupKeys),
    customMetadata: baoProvenance({ source: "stacks/netbird" }),
  },
  bao,
);
baoKvSecret(
  "netbird-automation",
  {
    mount: "secrets",
    path: "third-party-tokens/netbird/automation",
    data: { url: owner.url, user_id: serviceUser.id, personal_access_token: serviceToken.token, expires: serviceToken.expirationDate },
    concealedFields: ["personal_access_token"],
    customMetadata: baoProvenance({ source: "stacks/netbird" }),
  },
  bao,
);

// ── 8. Equestria entry ───────────────────────────────────────────────────
// The second way into the cluster (#2889, plan §G): the routing peers that
// kubernetes/apps/netbird-system/router runs through the NetBird operator.
// They enrol with the `k8s-router` key above, so they sit in `k8s-routers`,
// and this network's router names that group. Everything NetBird-side lives
// here, and the operator only runs pods: its own NetworkResource can publish
// nothing but a Service's ClusterIP (operator v0.9.0; IP targets are
// netbirdio/kubernetes-operator#305), and clients reach the cluster on the
// Gateway's LoadBalancer IP and the Authentik VIP.
//
// Exactly two /32s, nothing else. Clients get them as host routes, which win
// over the home gateways' site-LAN routes (#2887) by prefix length, so these
// two addresses go through the cluster whenever a router pod is connected.

/**
 * The `internal` Traefik Gateway's LoadBalancer IP. Its only home is SOPS
 * (`INTERNAL_IP` in kubernetes/flux/meta/cluster-secrets.sops.yaml); the Stack
 * CR passes it in as a literal Flux substitutes (kubernetes/apps/pulumi/netbird).
 * Fails closed like rootDomain(): an empty address must never reach NetBird.
 */
function internalGatewayIp(): string {
  const value = process.env.INTERNAL_IP?.trim();
  if (!value) throw new Error("INTERNAL_IP is not set. In the Stack it comes from envRefs (Flux substitutes it from cluster-secrets); locally, export it.");
  return value;
}

// The operator will not reconcile a NetworkRouter until a DNS zone with this
// name exists (its dnsZoneRef). No records are written: there are no
// operator NetworkResources. Must match networkrouter.yaml's dnsZoneRef.name.
const routerZoneName = "equestria.netbird.internal";
new netbird.DnsZone("equestria-routers", { name: routerZoneName, domain: routerZoneName, enabled: true, enableSearchDomain: false, distributionGroups: [groups.k8sRouters.id] }, { ...opts, dependsOn: [settings] });

const equestria = new netbird.Network("equestria", { name: "equestria", description: "Equestria internal Gateway + Authentik VIP, via the in-cluster routers (stacks/netbird, #2889)" }, opts);
new netbird.NetworkRouter("equestria", { networkId: equestria.id, peerGroups: [groups.k8sRouters.id], masquerade: true, metric: 100, enabled: true }, opts);

/** What #2888's client-access policy names as its destination. */
const equestriaEntry = group("equestria-entry");
const entryResource = (name: string, address: string) => new netbird.NetworkResource(name, { networkId: equestria.id, name, address, groups: [equestriaEntry.id], enabled: true }, opts);
entryResource("equestria-internal-gateway", `${internalGatewayIp()}/32`);
entryResource("authentik-vip", `${authentikVip}/32`);

// ── 9. Client-access policy (#2888) ───────────────────────────────────────
// policy.ts says who reaches what by NAME. Device groups are this stack's own;
// Authentik groups exist only once JWT sync has seen a member log in, so they
// are looked up live and a rule waits (with a warning) until its group exists.
// The operator re-runs this stack, so a rule appears on the first run after.
const deviceGroupIds: Record<string, pulumi.Output<string>> = { "apple-tv": groups.appleTv.id, gateways: groups.gateways.id, "k8s-routers": groups.k8sRouters.id };
const userGroupNames = [...new Set(ACCESS_RULES.flatMap(rule => rule.sources))].filter(name => !(name in deviceGroupIds));

pulumi.all([owner.url, owner.personal_access_token]).apply(async ([url, token]) => {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/groups`, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`NetBird GET /api/groups: HTTP ${response.status}`);
  const { ids, missing, conflicts } = resolveGroups((await response.json()) as LiveGroup[], userGroupNames, []);
  if (missing.length > 0) pulumi.log.warn(`NetBird groups not created yet (nobody in them has logged in): ${missing.join(", ")}. Their rules wait.`);
  if (conflicts.length > 0) pulumi.log.error(`NetBird groups ${conflicts.join(", ")} exist but were not made by JWT sync, so sync never adds users to them. Delete them in NetBird.`);

  for (const rule of ACCESS_RULES) {
    const sources = rule.sources.map(name => deviceGroupIds[name] ?? ids[name]).filter(id => id !== undefined);
    if (sources.length === 0) continue;
    const destination = rule.destination === "equestria-entry" ? equestriaEntry : siteResourceGroups[rule.destination.replace(/^lan-/, "")];
    if (!destination) throw new Error(`policy.ts rule ${rule.name} targets ${rule.destination}, which neither sites.ts nor the Equestria entry provides`);
    new netbird.Policy(
      `client-${rule.name}`,
      {
        name: `client-${rule.name}`,
        description: rule.description,
        enabled: true,
        rules: [
          {
            name: rule.name,
            action: "accept",
            bidirectional: false,
            protocol: rule.protocol,
            ports: rule.ports?.map(String),
            sources,
            destinations: [destination.id],
            enabled: true,
          },
        ],
      },
      { ...opts, dependsOn: [defaultPolicyRemoval] },
    );
  }
});

// ── 10. nbidp (#2891) ─────────────────────────────────────────────────────
// Passwordless "log in with NetBird" in Authentik (plan §K). The NetBird
// reverse proxy runs in Equestria in private mode
// (kubernetes/apps/netbird-system/nbidp) and needs two things from here:
//
//   - a token to register with management as a bring-your-own proxy. Account
//     scoped: it can serve this account's services and nothing else. Its
//     cluster address is NB_PROXY_DOMAIN, `nbidp.<root domain>`;
//   - the private service: `nbidp.<root domain>` to Dex, NetBird-only, open to
//     the four Authentik groups and nothing else (nbidp.ts says why).
//
// Management only accepts the service once that proxy is connected (it
// derives the service's cluster from the live proxies), so on the run that
// mints the token the service waits, like a policy whose group does not exist
// yet. The next run after the proxy comes up declares it.
const nbidpProxyToken = new NetbirdProxyToken("nbidp-proxy", { managementUrl: owner.url, token: owner.personal_access_token, name: "nbidp-equestria" }, { dependsOn: [settings] });
baoKvSecret(
  "netbird-nbidp-proxy",
  {
    mount: "secrets",
    path: NBIDP_BAO.proxyToken,
    // Read by kubernetes/apps/netbird-system/nbidp/externalsecret.yaml.
    data: { proxy_token: nbidpProxyToken.plainToken, token_id: nbidpProxyToken.tokenId },
    concealedFields: ["proxy_token"],
    customMetadata: baoProvenance({ source: "stacks/netbird" }),
  },
  bao,
);

const nbidpDomain = nbidpHost();
pulumi.all([owner.url, owner.personal_access_token]).apply(async ([url, token]) => {
  const [liveGroups, clusters, services] = await Promise.all([
    netbirdGet<LiveGroup[]>(url, token, "/api/groups"),
    netbirdGet<LiveCluster[]>(url, token, "/api/reverse-proxies/clusters"),
    netbirdGet<LiveService[]>(url, token, "/api/reverse-proxies/services"),
  ]);
  if (!privateServiceReady(clusters, services, nbidpDomain)) {
    pulumi.log.warn(`nbidp: no private proxy online for ${nbidpDomain} yet (kubernetes/apps/netbird-system/nbidp). The private service waits for it.`);
    return;
  }
  const access = privateServiceAccessGroups(liveGroups);
  if (access.conflicts.length > 0) pulumi.log.error(`nbidp: groups ${access.conflicts.join(", ")} were not made by JWT sync, so they are left out of the private service.`);
  if (access.ids.length === 0) {
    pulumi.log.warn("nbidp: none of the Authentik groups exists in NetBird yet (nobody in them has logged in). The private service waits.");
    return;
  }
  new NetbirdPrivateService("nbidp", { managementUrl: url, token, request: privateServiceRequest({ host: nbidpDomain, accessGroupIds: access.ids }) }, { dependsOn: [defaultPolicyRemoval, nbidpProxyToken] });
});

/** GET a NetBird API path with the owner's PAT. */
async function netbirdGet<T>(url: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${url.replace(/\/+$/, "")}${path}`, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`NetBird GET ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export const networkRange = settings.networkRange;
export const deviceGroups = pulumi.output(Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.id])));
export const gatewayGroups = pulumi.output(Object.fromEntries(Object.entries(gatewayHostGroups).map(([key, value]) => [key, value.id])));
/** The Equestria entry's destination group (#2889), which policy.ts's `equestria-entry` rules target. */
export const equestriaEntryGroup = equestriaEntry.id;
