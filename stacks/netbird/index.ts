/**
 * The self-hosted NetBird account (#2885, docs/plans/netbird-mirror.md §I).
 *
 * stacks/netbird-edge runs the server and bootstrapped its owner; this stack
 * drives the account through `globals.netbirdApi`, which is the `automation`
 * service user's PAT (7, below) once a run has written it and the owner's
 * until then:
 *
 *   1. account settings, the overlay range first, before anything can enrol;
 *   2. the built-in allow-all `Default` policy removed;
 *   3. the user groups invites place people in;
 *   4. device groups and the setup keys that place peers in them;
 *   5. site LANs routed through the gateway containers, and each site
 *      stack's gateways an exit node (#2887, D53);
 *   6. Technitium as every peer's nameserver: each node's NetBird sidecar
 *      once it has enrolled, its LAN address until then (dns.ts);
 *   7. a service user whose PAT the in-cluster operator uses (#2889);
 *   8. the `equestria` network the operator's routing peers serve (#2889);
 *   9. the client-access policy (#2888, policy.ts);
 *  10. nbidp: the private reverse proxy's token, its custom domain, and the private service in
 *      front of Dex (#2891, nbidp.ts);
 *  11. a `self-` group and policy per person, so their own devices reach
 *      each other (selfAccess.ts);
 *  12. every tailnet app's NetBird twin, `<host>.nb.<root domain>`, on the
 *      same proxy (app-services.ts, apps.ts);
 *  13. the region exits' Mullvad devices, keys written to OpenBao for their
 *      gluetun (region-exit-devices.ts, regionExits.ts).
 *      Their NetBird half (device groups, setup keys, `region-*` routes and
 *      policies) sits in 4, 9 and policy.ts, beside the other exits.
 *
 * Login is NetBird's built-in IdP (embedded Dex, local users), not Authentik:
 * the server runs on Azure and Authentik is LAN/tailnet-only, so neither the
 * management server nor a NetBird-only phone away from home could reach it.
 * People join by invite (`mise run netbird:invite`, scripts/netbird-invite.ts),
 * which puts each of them in one of the user groups below.
 */
import * as netbird from "@pulumi/netbird";
import * as pulumi from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import { authentikVip, dns, kubernetesClusters } from "components/constants.ts";
import { rootDomain } from "components/domains.ts";
import { GlobalResources } from "components/globals.ts";
import { NBIDP_BAO, nbidpClusterAddress, nbidpHost } from "components/netbird/nbidp.ts";
import { expiresAtSeconds, expiringTokens, NETBIRD_AUTOMATION_BAO_PATH, NETBIRD_MCP_BAO_PATH, NETBIRD_OPERATOR_BAO_PATH, NETBIRD_OWNER_PAT_BAO_PATH, TOKEN_LIFETIME_DAYS } from "components/netbird/tokens.ts";
import { NetbirdAccountSettingsOverrides } from "dynamic/netbird/NetbirdAccountSettingsOverrides.ts";
import { NetbirdDefaultPolicyRemoval } from "dynamic/netbird/NetbirdDefaultPolicyRemoval.ts";
import { NetbirdPrivateService } from "dynamic/netbird/NetbirdPrivateService.ts";
import { NetbirdProxyToken } from "dynamic/netbird/NetbirdProxyToken.ts";
import { NetbirdUserAutoGroup } from "dynamic/netbird/NetbirdUserAutoGroup.ts";
import { declareAppServices } from "./app-services.ts";
import { DNS_SERVER_GROUP, enrolledDnsPeers, type LivePeer, selectNameservers, technitiumLanIps } from "./dns.ts";
import { type LiveCluster, type LiveDomain, type LiveService, liveCustomDomain, privateServiceAccessGroups, privateServiceRequest, serviceOnCluster } from "./nbidp.ts";
import { ACCESS_RULES, DEVICE_GROUPS, homeResourceGroups, USER_GROUPS, unresolvedSources } from "./policy.ts";
import { clusterCnames, declareCustomDomain, validationCname } from "./proxyDomains.ts";
import { declareRegionExitDevices } from "./region-exit-devices.ts";
import { REGION_EXIT_USER_GROUPS, REGION_EXITS, regionExitNetbird } from "./regionExits.ts";
import { type LiveUser, selfAccessPlan } from "./selfAccess.ts";
import { GATEWAY_SITE_STACKS, gatewayGroupName, gatewayGroupPeers, gatewayHosts, type LiveGatewayPeer, routedSites, SITES, siteProblems, siteStackOf } from "./sites.ts";

/** The groups invites place people in; one list, shared with the client-access policy. */
export { USER_GROUPS };

/** NetBird's overlay. Clear of Tailscale's 100.64/10 on dual-mesh desktops and of the 10.10/16 LAN. */
const NETWORK_RANGE = "10.100.0.0/16";
/**
 * The overlay's IPv6 range: the one set in the dashboard on 2026-11-04, kept
 * so peers keep their addresses. Pinned because NetBird allocates a random
 * /64 whenever the overlay comes on without one.
 */
const NETWORK_RANGE_V6 = "fdaf:5d5b:8d43:1330::/64";

const globals = new GlobalResources({}, {});
const provider = globals.netbirdProvider;
const api = globals.netbirdApi;
const owner = globals.netbirdOwner;
const opts = { provider };

// ── 1. Account ───────────────────────────────────────────────────────────
// Before any setup key or invite exists, so no peer can ever take an address
// from the default range.
const settings = new netbird.AccountSettings(
  "account",
  {
    networkRange: NETWORK_RANGE,
    // Device names, `<device>.nbd.<root domain>` (D56). `nb` belongs to the
    // app services (apps.ts APP_SUBDOMAIN), which only take it once every
    // client has this domain: while `nb` is the peer domain, clients answer
    // `*.nb` themselves.
    dnsDomain: `nbd.${rootDomain()}`,
    // No re-login, ever (David, 2026-11-03): a device stays on until its
    // peer is deleted, which is how one is removed.
    peerLoginExpirationEnabled: false,
    // Groups are NetBird's own (3, below), not claims from an IdP.
    jwtGroupsEnabled: false,
    // A user's auto groups also follow onto the peers they register, so
    // moving someone between groups moves their devices with them.
    groupsPropagationEnabled: true,
    regularUsersViewBlocked: true,
    routingPeerDnsResolutionEnabled: true,
  },
  opts,
);

// ── 2. No allow-all ──────────────────────────────────────────────────────
const defaultPolicyRemoval = new NetbirdDefaultPolicyRemoval("default-policy", api, { dependsOn: [settings] });

// ── 3. User groups ───────────────────────────────────────────────────────
// Plain API groups. An invite names one as the user's auto group, so every
// peer that person registers lands in it; the policies (9) and nbidp (10)
// use them directly. Moving someone is an edit of their auto groups in the
// dashboard (Team → Users).
const group = (name: string) => new netbird.Group(name, { name }, { ...opts, dependsOn: [defaultPolicyRemoval] });
const userGroups: Record<string, netbird.Group> = Object.fromEntries(USER_GROUPS.map(name => [name, group(name)]));
const userGroupIds = USER_GROUPS.map(name => userGroups[name].id);

// ── 4. Device groups and setup keys ──────────────────────────────────────
const groups = {
  gateways: group("gateways"),
  k8sRouters: group("k8s-routers"),
  appleTv: group("apple-tv"),
  // Every Technitium node's NetBird sidecar (6, below).
  dnsServers: group(DNS_SERVER_GROUP),
  // The exit routes' access-control group (5, below). No peers, ever.
  exitInternet: group("exit-internet"),
};

// The `region-*` routes' access-control group (docs/plans/region-exits.md
// §C2), peerless like exit-internet. The region exits' own groups and keys
// are built with setupKey below.
const regionExitInternet = group("region-exit-internet");

/**
 * The Dockge hosts that run a gateway container (#2887), by cluster key. Each
 * keeps its own setup key, `gateway-<host>`; the peers are grouped per Dockge
 * site stack instead (D53, sites.ts), one `gateway-<site stack>` group for the
 * hosts stacks/home, stacks/gulf-of-mexico and stacks/ocracoke deploy.
 */
export const GATEWAY_HOSTS = gatewayHosts(GATEWAY_SITE_STACKS);

const problems = siteProblems(SITES, GATEWAY_SITE_STACKS);
if (problems.length > 0) throw new Error(`stacks/netbird/sites.ts is inconsistent:\n  - ${problems.join("\n  - ")}`);

const setupKey = (name: string, autoGroup: netbird.Group, extra: Partial<netbird.SetupKeyArgs> = {}) =>
  new netbird.SetupKey(name, { name, type: "reusable", autoGroups: [autoGroup.id], expirySeconds: 0, usageLimit: 0, ...extra }, { ...opts, dependsOn: [defaultPolicyRemoval] });

// Each region exit's NetBird half (docs/plans/region-exits.md §C2), built once:
// the device group its netbird sidecar joins, and the setup key that joins it.
// Ephemeral, like the router pods: the sidecar's state is an emptyDir, so every
// restart enrols a fresh peer and the old one is cleaned up. Its route is
// declared in 5, its policies in 9.
const regionExitPeers = REGION_EXITS.map(name => {
  const names = regionExitNetbird(name);
  const deviceGroup = group(names.deviceGroup);
  return { name, names, deviceGroup, setupKey: setupKey(names.setupKey, deviceGroup, { ephemeral: true }).key };
});

// The live peers and groups, read on every run: a setup key's auto groups
// apply only at enrolment, so the peers enrolled before D53 sit in the old
// per-host groups, and this is how they reach the site-stack ones.
const liveGateways = pulumi.output(api).apply(async ({ managementUrl: url, token }) => {
  const [peers, liveGroups] = await Promise.all([netbirdGet<LiveGatewayPeer[]>(url, token, "/api/peers"), netbirdGet<{ name: string; peers?: { id: string }[] }[]>(url, token, "/api/groups")]);
  return { peers, liveGroups };
});

// One group per site stack. `peers` is declared, so it moves the enrolled
// gateways in; it is the live membership plus every enrolled gateway peer of
// the stack's hosts (gatewayGroupPeers), never less, so a peer a setup key
// placed since the last run is not taken out again by this one.
const gatewayStackGroups: Record<string, netbird.Group> = Object.fromEntries(
  Object.entries(GATEWAY_SITE_STACKS).map(([stack, hosts]) => {
    const name = gatewayGroupName(stack);
    // Peer ids are not secret; only the token that read them is.
    const memberIds = pulumi.unsecret(liveGateways).apply(({ peers, liveGroups }) => {
      const members = liveGroups.find(live => live.name === name)?.peers?.map(peer => peer.id) ?? [];
      const ids = gatewayGroupPeers(hosts, peers, members);
      pulumi.log.info(`${name}: ${ids.length} gateway peer(s) for ${hosts.join(", ")}`);
      return ids;
    });
    return [stack, new netbird.Group(name, { name, peers: memberIds }, { ...opts, dependsOn: [defaultPolicyRemoval] })];
  }),
);
const gatewayGroupOf = (host: string): netbird.Group => {
  const stack = siteStackOf(GATEWAY_SITE_STACKS, host);
  if (!stack) throw new Error(`${host} is in no gateway site stack`);
  return gatewayStackGroups[stack];
};

const setupKeys = {
  // Read by docker/_common/netbird-gateway/.env as `#/gateway-${CLUSTER_KEY}`.
  ...Object.fromEntries(GATEWAY_HOSTS.map(host => [`gateway-${host}`, setupKey(`gateway-${host}`, groups.gateways, { autoGroups: [groups.gateways.id, gatewayGroupOf(host).id] }).key])),
  // Router pods come and go; ephemeral peers are cleaned up when they do.
  k8s_router: setupKey("k8s-router", groups.k8sRouters, { ephemeral: true }).key,
  // TVs have no user to log in with SSO, so they enrol by key (#2886).
  apple_tv: setupKey("apple-tv", groups.appleTv).key,
  // The Technitium sidecars, all five nodes on one key. Not ephemeral: each
  // keeps its peer, and so its overlay address, across restarts. Read by
  // docker/_common/technitium and Equestria's ExternalSecret as `#/dns`.
  dns: setupKey("dns-servers", groups.dnsServers).key,
  // The region exits' netbird sidecars, read by kubernetes/apps/region-exits
  // as `region_exit_<name>`.
  ...Object.fromEntries(regionExitPeers.map(exit => [exit.names.setupKeyProperty, exit.setupKey])),
};

// ── 5. Site LANs and exit nodes (#2887) ─────────────────────────────────
// NetBird's built-in group of every peer.
const all = netbird.getGroupOutput({ name: "All" }, { provider });

// The account settings `settings` (1) cannot carry, put back after it. Every
// provider update PUTs the account with those fields missing, which NetBird
// reads as zero: the IPv6 overlay went off on the first run (2026-11-03), and
// on 2026-11-05 the range was cleared and the dashboard's MFA and
// hostname-collision settings undone (dynamic/netbird/NetbirdAccountSettingsOverrides.ts).
//
// IPv6 for every peer is what lets an exit node carry IPv6 at all: management
// adds the `::/0` half of a `0.0.0.0/0` exit only for peers with an overlay
// IPv6 address (filterAndExpandRoutes, v0.82.0). Without it a dual-stack
// client sends IPv6 straight out of its own uplink, around the exit. A peer
// that cannot take IPv6 (a v4-only container) logs "continuing v4-only" and
// carries on, and IPv6 into an exit with no IPv6 uplink is dropped, so apps
// fall back to IPv4 rather than leaking.
new NetbirdAccountSettingsOverrides(
  "account-overrides",
  {
    ...api,
    ipv6EnabledGroups: [all.id],
    networkRangeV6: NETWORK_RANGE_V6,
    // Both as set in the dashboard on 2026-11-04.
    localMfaEnabled: true,
    peerHostnameCollisionRejected: true,
  },
  { dependsOn: [settings] },
);

// One resource group per site LAN (`lan-<site>`, admins only), plus the home
// LAN's specific endpoints, the groups #2888's member rules target.
export const siteResourceGroups: Record<string, netbird.Group> = {};
const endpointGroups = { "home-web": group("home-web"), "home-dns": group("home-dns"), "home-media": group("home-media") };
let homeNetwork: netbird.Network | undefined;
for (const [site, config] of routedSites(SITES)) {
  const network = new netbird.Network(`lan-${site}`, { name: `lan-${site}`, description: `The ${site} LAN, via its gateway containers` }, { ...opts, dependsOn: [defaultPolicyRemoval] });
  if (site === "home") homeNetwork = network;
  const resourceGroup = (siteResourceGroups[site] = group(`lan-${site}`));
  for (const cidr of config.cidrs) {
    new netbird.NetworkResource(`lan-${site}-${cidr.replace(/[./]/g, "-")}`, { networkId: network.id, name: cidr, address: cidr, groups: [resourceGroup.id], enabled: true }, opts);
  }
  // Equal metrics: each client picks the lowest-latency gateway, and the
  // others take over when it goes. Masquerade, so LAN services see the
  // gateway host and need no return route to 10.100.0.0/16.
  new netbird.NetworkRouter(`lan-${site}`, { networkId: network.id, peerGroups: config.gatewayStacks.map(stack => gatewayStackGroups[stack].id), masquerade: true, metric: 9999, enabled: true }, opts);
}

/**
 * Equestria's Technitium VIP, its LAN address on the ipvlan interface. Its only
 * home is SOPS (`TECHNITIUM_VIP` in kubernetes/flux/meta/cluster-secrets.sops.yaml);
 * the Stack CR passes it in as a literal Flux substitutes, like INTERNAL_IP.
 * Fails closed: without it Equestria would silently drop out of home-dns.
 */
function technitiumVip(): string {
  const value = process.env.TECHNITIUM_VIP?.trim();
  if (!value) throw new Error("TECHNITIUM_VIP is not set. In the Stack it comes from envRefs (Flux substitutes it from cluster-secrets); locally, export it.");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) throw new Error("TECHNITIUM_VIP is not an IPv4 address; check the Stack CR's envRefs substitution.");
  return value;
}

const inHome = (ip: string) => ip.startsWith("10.10.");

// Every Technitium node's LAN address, by cluster key: the fallback path to
// it, through the gateways' routes. The Dockge hosts publish Technitium's
// ports on the host, so theirs are the hosts' exported internalIp. Alpha
// Site's export is `dockge-as` (its shortName), and its address is the one
// constants.ts already lists.
const technitiumLan = globals.store.getTailscaleExports().apply(exports => {
  const { ips, missing } = technitiumLanIps({
    dockgeHosts: Object.fromEntries(GATEWAY_HOSTS.filter(host => host !== "alpha-site").map(host => [host, `dockge-${host}`])),
    exportHosts: exports.flatMap(exp => exp.hosts),
    fixed: { equestria: technitiumVip(), "alpha-site": dns.config["Alpha Site"].ips[0] },
    isLan: inHome,
  });
  if (missing.length > 0) pulumi.log.warn(`Technitium: no LAN address in the Tailscale exports for ${missing.join(", ")}; left out of home-dns and the LAN nameserver fallback.`);
  return ips;
});

// The addresses member-home-subnet-access allows on Tailscale: every cluster
// Gateway IP on the LAN, every exported host's internalIp, the Authentik VIP;
// plus every Technitium node for DNS. One resource per address, in the home network.
if (homeNetwork) {
  const network = homeNetwork;
  pulumi.all([globals.store.getTailscaleExports(), technitiumLan]).apply(([exports, lan]) => {
    const endpoints = homeResourceGroups({
      clusterIps: kubernetesClusters.flatMap(cluster => cluster.publicIps).filter(inHome),
      hostIps: exports.flatMap(exp => exp.hosts.map(host => host.internalIp)).filter(ip => !!ip && inHome(ip)),
      authentikVip,
      dnsIps: Object.values(lan).filter(inHome),
    });
    for (const [ip, names] of Object.entries(endpoints)) {
      new netbird.NetworkResource(
        `home-endpoint-${ip.replaceAll(".", "-")}`,
        { networkId: network.id, name: ip, address: `${ip}/32`, groups: names.map(name => endpointGroups[name as keyof typeof endpointGroups].id), enabled: true },
        opts,
      );
    }
  });
}

// ── 6. DNS ───────────────────────────────────────────────────────────────
// Technitium, so clients keep resolving the existing <root domain> names.
// Every peer gets it. Each node runs a NetBird sidecar in its own network
// namespace (docker/_common/technitium, kubernetes/apps/equestria/dns/technitium)
// that enrols with the `dns` key above. Enrolled nodes are used on their
// overlay address, which works with every gateway down; the rest, and all of
// them before any has enrolled, on their LAN address through the gateways'
// routes (#2887). At most three, in dns.ts's preference order: management
// refuses more. Read live on every run, so a newly enrolled sidecar is picked
// up by the next one.
pulumi.all([pulumi.output(api), technitiumLan]).apply(async ([{ managementUrl: url, token }, lan]) => {
  const peers = await netbirdGet<LivePeer[]>(url, token, "/api/peers");
  const nameservers = selectNameservers({ overlay: enrolledDnsPeers(peers), lan });
  if (nameservers.length === 0) throw new Error("Technitium: no nameserver address at all, neither an enrolled sidecar nor a LAN address.");
  pulumi.log.info(`Technitium nameservers: ${nameservers.map(ns => `${ns.cluster} ${ns.ip} (${ns.via})`).join(", ")}`);
  const technitiumServers = nameservers.map(ns => ({ ip: ns.ip, nsType: "udp", port: 53 }));
  new netbird.NameserverGroup(
    "technitium",
    {
      name: "Technitium",
      description: "Estate DNS: the Technitium sidecars over the overlay, LAN routes as fallback (stacks/netbird)",
      nameservers: technitiumServers,
      groups: [all.id],
      primary: true,
      enabled: true,
    },
    { ...opts, dependsOn: [settings] },
  );
  // Short names (GLOSSARY.md, ADR 0003): `jellyfin` completes to the app
  // route, `jellyfin.<root domain>`, which Traefik redirects to
  // (kubernetes/apps/network/traefik/short-names.yaml). NetBird hands out a
  // search domain only from a group with match domains, so the primary group
  // above cannot carry one. This group uses the same servers, so the two can
  // never disagree, and goes to client devices only (the user groups and
  // apple-tv). Gateways, in-cluster routers and DNS sidecars are servers and
  // keep resolving as before. The client's own zones, `nbd.<root domain>`
  // (device names) and `nb.<root domain>` (app services), are more specific
  // and should still win. docs/plans/short-names.md C3 says how to check.
  new netbird.NameserverGroup(
    "technitium-search",
    {
      name: "Technitium (search domain)",
      description: "Short names: the root domain as a search domain for client devices, same servers as Technitium (stacks/netbird)",
      nameservers: technitiumServers,
      domains: [rootDomain()],
      searchDomainsEnabled: true,
      groups: [...userGroupIds, groups.appleTv.id],
      primary: false,
      enabled: true,
    },
    { ...opts, dependsOn: [settings] },
  );
});

// ── 7. Service user, and the PATs Pulumi holds ───────────────────────────
// For machines: this stack itself (globals.netbirdApi), the operator's routers
// (#2889), and anything else that should not hold the owner's break-glass PAT.
//
// Both PATs rotate by bumping their generation to the current month. The
// generation is in the Pulumi name, so a bump creates the new token, rewrites
// its OpenBao path, and deletes the old token last, at the end of the run
// (docs/plans/netbird-mirror.md, "PATs and their rotation"). Bump one at a
// time, in a run that changes nothing else: the run authenticates with the
// token it is deleting, so a delete scheduled after it would fail (the next
// run reads the new token and finishes it).
const AUTOMATION_TOKEN_GENERATION = "2026-11b";
const OWNER_TOKEN_GENERATION = "2026-11";
const MCP_TOKEN_GENERATION = "2026-11";
const OPERATOR_TOKEN_GENERATION = "2026-11";

const serviceUser = new netbird.User("automation", { name: "automation", isServiceUser: true, role: "admin" }, opts);
const serviceToken = new netbird.Token(
  `automation-${AUTOMATION_TOKEN_GENERATION}`,
  { userId: serviceUser.id, name: `automation-${AUTOMATION_TOKEN_GENERATION}`, expirationDays: TOKEN_LIFETIME_DAYS },
  { ...opts, additionalSecretOutputs: ["token"] },
);
// The NetBird MCP's (kubernetes/apps/agents/agent-tools-servers/netbird.yaml).
// Its own service user, never automation's PAT, and `auditor`: NetBird
// refuses every create, update and delete from it (management
// permissions/roles/auditor.go, v0.82.0). Everything the MCP could write is
// declared in this stack, so a write through it would only drift until the
// next run put it back (David, 2026-11-05).
const mcpUser = new netbird.User("mcp", { name: "mcp", isServiceUser: true, role: "auditor" }, opts);
const mcpToken = new netbird.Token(`mcp-${MCP_TOKEN_GENERATION}`, { userId: mcpUser.id, name: `mcp-${MCP_TOKEN_GENERATION}`, expirationDays: TOKEN_LIFETIME_DAYS }, { ...opts, additionalSecretOutputs: ["token"] });
// The NetBird operator's (kubernetes/apps/netbird-system/operator), which used
// to hold automation's PAT, so its writes read as this stack's in the audit
// log. Its own identity now, revocable on its own. Still `admin`: NetBird has
// no custom roles, and `network_admin` cannot create setup keys, which the
// operator's NetworkRouter controller does on every reconcile (operator
// v0.9.0); it would stop there and never reach the router Deployment.
const operatorUser = new netbird.User("k8s-operator", { name: "k8s-operator", isServiceUser: true, role: "admin" }, opts);
const operatorToken = new netbird.Token(
  `k8s-operator-${OPERATOR_TOKEN_GENERATION}`,
  { userId: operatorUser.id, name: `k8s-operator-${OPERATOR_TOKEN_GENERATION}`, expirationDays: TOKEN_LIFETIME_DAYS },
  { ...opts, additionalSecretOutputs: ["token"] },
);
// The owner's break-glass PAT, minted by the owner (only a user can mint its
// own), so the setup PAT stacks/netbird-edge got from /api/setup is used just
// once, by the first run. That one is never rotated and lapses on its own.
const ownerToken = new netbird.Token(
  `owner-${OWNER_TOKEN_GENERATION}`,
  { userId: owner.user_id, name: `break-glass-${OWNER_TOKEN_GENERATION}`, expirationDays: TOKEN_LIFETIME_DAYS },
  { provider: globals.netbirdOwnerProvider, additionalSecretOutputs: ["token"] },
);

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
    path: NETBIRD_AUTOMATION_BAO_PATH,
    data: { url: owner.url, user_id: serviceUser.id, personal_access_token: serviceToken.token, expires: serviceToken.expirationDate, generation: AUTOMATION_TOKEN_GENERATION },
    concealedFields: ["personal_access_token"],
    customMetadata: baoProvenance({ source: "stacks/netbird" }),
  },
  bao,
);
baoKvSecret(
  "netbird-mcp",
  {
    mount: "secrets",
    path: NETBIRD_MCP_BAO_PATH,
    data: { url: owner.url, user_id: mcpUser.id, personal_access_token: mcpToken.token, expires: mcpToken.expirationDate, generation: MCP_TOKEN_GENERATION },
    concealedFields: ["personal_access_token"],
    customMetadata: baoProvenance({ source: "stacks/netbird" }),
  },
  bao,
);
baoKvSecret(
  "netbird-k8s-operator",
  {
    mount: "secrets",
    path: NETBIRD_OPERATOR_BAO_PATH,
    data: { url: owner.url, user_id: operatorUser.id, personal_access_token: operatorToken.token, expires: operatorToken.expirationDate, generation: OPERATOR_TOKEN_GENERATION },
    concealedFields: ["personal_access_token"],
    customMetadata: baoProvenance({ source: "stacks/netbird" }),
  },
  bao,
);
baoKvSecret(
  "netbird-owner-pat",
  {
    mount: "secrets",
    path: NETBIRD_OWNER_PAT_BAO_PATH,
    data: { url: owner.url, user_id: owner.user_id, personal_access_token: ownerToken.token, expires: ownerToken.expirationDate, generation: OWNER_TOKEN_GENERATION },
    concealedFields: ["personal_access_token"],
    customMetadata: baoProvenance({ source: "stacks/netbird" }),
  },
  bao,
);

// When each PAT expires, in epoch seconds. Not secret: kube-state-metrics
// reads it off the Stack CR's status.outputs as
// kube_stack_output_token_expires_timestamp_seconds, and the
// PulumiStackTokenExpiring alert pages EXPIRY_WARNING_DAYS before either
// (kubernetes/apps/pulumi/pulumi-operator/prometheusrule.yaml).
export const tokenExpiresAtSeconds = pulumi.unsecret(
  pulumi.all({ automation: serviceToken.expirationDate, owner: ownerToken.expirationDate, mcp: mcpToken.expirationDate, k8sOperator: operatorToken.expirationDate }).apply(dates => {
    const expiry = { automation: expiresAtSeconds(dates.automation), owner: expiresAtSeconds(dates.owner), mcp: expiresAtSeconds(dates.mcp), k8sOperator: expiresAtSeconds(dates.k8sOperator) };
    for (const { name, daysLeft } of expiringTokens(expiry, new Date())) {
      pulumi.log.warn(`NetBird ${name} PAT expires in ${daysLeft} days. Rotate it: bump its generation in stacks/netbird/index.ts (docs/plans/netbird-mirror.md).`);
    }
    return expiry;
  }),
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
// policy.ts says who reaches what by NAME, and every name is a group this
// stack creates (3 and 4). Checked before anything is declared: a source
// that resolved to nothing would grant nobody.
const sourceGroupIds: Record<string, pulumi.Output<string>> = {
  ...Object.fromEntries(USER_GROUPS.map(name => [name, userGroups[name].id])),
  "apple-tv": groups.appleTv.id,
  "dns-servers": groups.dnsServers.id,
  gateways: groups.gateways.id,
  "k8s-routers": groups.k8sRouters.id,
};
const unresolved = [...unresolvedSources(ACCESS_RULES, Object.keys(sourceGroupIds)), ...DEVICE_GROUPS.filter(name => !(name in sourceGroupIds))];
if (unresolved.length > 0) throw new Error(`stacks/netbird/policy.ts names groups this stack does not create:\n  - ${unresolved.join("\n  - ")}`);

// Each site stack's gateways are one exit node the user groups can pick
// (never applied by default), `exit-<site stack>`; the client uses whichever
// of the group's peers it reaches best (D53). Exit nodes are still legacy
// routes, offered only to the user groups (`groups`).
//
// What lets their traffic OUT is the access-control group, and it is matched
// against policy DESTINATIONS, not sources: a routing peer forwards for a
// route with access-control groups only what a policy targeting one of those
// groups allows (management getPeerRoutesFirewallRules, v0.82.0), and a route
// without any gets allow-all instead. Until this was `exit-internet` it was
// the user groups themselves, which no policy targets, so every routing peer
// got no forwarding rule and dropped all exit traffic. The `users-internet`
// rule (policy.ts) is the one that targets it; a users -> users policy would
// have worked too, and opened every user's devices to every other user.
// `users-exit-nodes` only connects users to the gateway peers so the routes
// sync.
//
// `exit-home` is also served by Equestria's in-cluster routing peers
// (`k8s-routers`, kubernetes/apps/netbird-system/router; D54). They leave on
// the same home WAN, through their node's Cilium SNAT, so they are one more
// way out of the same site and keep the home exit up while the Dockge
// gateways are down. `users-exit-equestria` (policy.ts) connects users to
// them. Exit only: they are not in `gateway-home`, so they never route `lan-home`.
const EXIT_EXTRA_PEER_GROUPS: Record<string, { label: string; group: netbird.Group }[]> = {
  home: [{ label: "Equestria's routers", group: groups.k8sRouters }],
};
for (const [stack, hosts] of Object.entries(GATEWAY_SITE_STACKS)) {
  const extra = EXIT_EXTRA_PEER_GROUPS[stack] ?? [];
  new netbird.Route(
    `exit-${stack}`,
    {
      networkId: `exit-${stack}`,
      description: `Exit through the ${stack} site stack's gateways (${[...hosts, ...extra.map(e => e.label)].join(", ")})`,
      network: "0.0.0.0/0",
      peerGroups: [gatewayStackGroups[stack].id, ...extra.map(e => e.group.id)],
      groups: userGroupIds,
      accessControlGroups: [groups.exitInternet.id],
      masquerade: true,
      skipAutoApply: true,
      enabled: true,
    },
    { ...opts, dependsOn: [defaultPolicyRemoval] },
  );
}

// Each region exit is an exit node too, `region-<name>`, through its pod's
// gluetun to Mullvad (docs/plans/region-exits.md §C2, ADR 0005). Offered to
// family, friends and admins only, never applied by default. Its own
// access-control group, so users-region-internet, not users-internet, is
// what lets traffic out, and media-managers cannot use it even if handed the
// route. Never rename one in a single run: two `0.0.0.0/0` routes collide
// on create-before-delete; remove the old one first.
for (const { name, names, deviceGroup } of regionExitPeers) {
  new netbird.Route(
    names.route,
    {
      networkId: names.route,
      description: `Exit through region exit ${name}: its pod's gluetun, out of Mullvad (kubernetes/apps/region-exits)`,
      network: "0.0.0.0/0",
      peerGroups: [deviceGroup.id],
      groups: REGION_EXIT_USER_GROUPS.map(user => userGroups[user].id),
      accessControlGroups: [regionExitInternet.id],
      masquerade: true,
      skipAutoApply: true,
      enabled: true,
    },
    { ...opts, dependsOn: [defaultPolicyRemoval] },
  );
}

const destinationGroups: Record<string, netbird.Group | undefined> = {
  ...endpointGroups,
  "dns-servers": groups.dnsServers,
  gateways: groups.gateways,
  "lan-home": siteResourceGroups.home,
  "equestria-entry": equestriaEntry,
  "k8s-routers": groups.k8sRouters,
  "exit-internet": groups.exitInternet,
  ...Object.fromEntries(regionExitPeers.map(exit => [exit.names.deviceGroup, exit.deviceGroup])),
  "region-exit-internet": regionExitInternet,
};
for (const rule of ACCESS_RULES) {
  const destination = destinationGroups[rule.destination];
  if (!destination) throw new Error(`policy.ts rule ${rule.name} targets ${rule.destination}, which this stack does not create`);
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
          ports: rule.protocol === "icmp" ? undefined : rule.ports?.map(String),
          sources: rule.sources.map(name => sourceGroupIds[name]),
          destinations: [destination.id],
          enabled: true,
        },
      ],
    },
    { ...opts, dependsOn: [defaultPolicyRemoval] },
  );
}

// ── 10. nbidp (#2891) ─────────────────────────────────────────────────────
// Passwordless "log in with NetBird" in Authentik (plan §K). The NetBird
// reverse proxy runs in Equestria in private mode
// (kubernetes/apps/netbird-system/nbidp) and needs two things from here:
//
//   - a token to register with management as a bring-your-own proxy. Account
//     scoped: it can serve this account's services and nothing else. Its
//     cluster address is NB_PROXY_DOMAIN, `ek.<root domain>`
//     (nbidpClusterAddress);
//   - `nbidp.<root domain>` as a custom domain on that cluster, with the
//     public `validation.nbidp` CNAME management checks it by
//     (proxyDomains.ts). Until D38 the cluster address WAS nbidp's name; it is
//     its own now, so the proxy can serve other names under custom domains;
//   - the private service: `nbidp.<root domain>` to Dex, NetBird-only, open to
//     the four user groups and nothing else (nbidp.ts says why, and why it
//     still finds people's Authentik accounts with NetBird's built-in login).
//
// The domain and the service are always declared. Management takes a custom
// domain only for a connected cluster, and a service only under a validated
// domain, so while the proxy is down a run that has to CREATE either fails,
// and the Stack retries within a minute until it is up: nbidp is live and
// backs Authentik's passwordless login, so a missing service is an outage to
// fix, not a state to wait in. A service that exists is left alone.
//
// Management pins a service to its cluster at create. A service on another
// cluster (the old `nbidp.<root domain>` address) is deleted and re-created
// (NetbirdPrivateService replaces on a cluster change, deleting first), after
// the domain exists. nbidp is down from that delete until the new service is
// up.
// A token change is an update, not a replace (NetbirdProxyToken.diff), so
// moving from the owner's PAT to automation's keeps the minted proxy token.
const nbidpProxyToken = new NetbirdProxyToken("nbidp-proxy", { ...api, name: "nbidp-equestria" }, { dependsOn: [settings] });
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
const proxyCluster = nbidpClusterAddress();
const nbidpCnames = clusterCnames(globals, proxyCluster, [validationCname("netbird-nbidp-validation", nbidpDomain, "nbidp")]);
// The user groups' ids only: a device group added later is unknown in the
// preview that adds it, which would skip this callback and show the private
// service as a delete.
const userGroupIdsByName = Object.fromEntries(USER_GROUPS.map(name => [name, userGroups[name].id]));
pulumi.all([pulumi.output(api), pulumi.output(userGroupIdsByName)]).apply(async ([{ managementUrl: url, token }, groupIds]) => {
  const [clusters, services, domains] = await Promise.all([
    netbirdGet<LiveCluster[]>(url, token, "/api/reverse-proxies/clusters"),
    netbirdGet<LiveService[]>(url, token, "/api/reverse-proxies/services"),
    netbirdGet<LiveDomain[]>(url, token, "/api/reverse-proxies/domains"),
  ]);
  if (!clusters.some(cluster => cluster.address === proxyCluster && cluster.online && cluster.private === true))
    pulumi.log.warn(`nbidp: no private proxy online for ${proxyCluster} (kubernetes/apps/netbird-system/nbidp). Creating nbidp's domain or service fails until there is; the Stack retries.`);
  if (services.some(service => service.domain === nbidpDomain) && !serviceOnCluster(services, nbidpDomain, proxyCluster))
    pulumi.log.warn(`nbidp: the live service is on another proxy cluster; it is deleted and re-created on ${proxyCluster}. Passwordless login is down in between.`);
  const { resource: nbidpCustomDomain } = await declareCustomDomain({
    name: "nbidp-domain",
    domain: nbidpDomain,
    clusterAddress: proxyCluster,
    provider,
    managementUrl: url,
    token,
    live: liveCustomDomain(domains, nbidpDomain),
    dependsOn: [settings, nbidpProxyToken, ...nbidpCnames],
  });
  const accessGroupIds = privateServiceAccessGroups(groupIds);
  new NetbirdPrivateService(
    "nbidp",
    { managementUrl: url, token, request: privateServiceRequest({ host: nbidpDomain, clusterAddress: proxyCluster, accessGroupIds }) },
    { dependsOn: [defaultPolicyRemoval, nbidpProxyToken, nbidpCustomDomain] },
  );
});

// ── 11. Each person's own devices ──────────────────────────────────────────
// NetBird has no `autogroup:self`. Instead every human user gets a `self-`
// group in their auto groups (propagation, 1, puts their peers in it) and a
// policy from it to itself. Read live, so someone who joined since the last
// run gets theirs on this one; someone deleted drops out, and Pulumi takes
// their group and policy away.
pulumi.output(api).apply(async ({ managementUrl: url, token }) => {
  const users = await netbirdGet<LiveUser[]>(url, token, "/api/users");
  for (const entry of selfAccessPlan(users)) {
    const selfGroup = new netbird.Group(entry.resourceName, { name: entry.groupName }, { ...opts, dependsOn: [defaultPolicyRemoval] });
    new NetbirdUserAutoGroup(entry.resourceName, { managementUrl: url, token, userId: entry.userId, groupId: selfGroup.id }, { dependsOn: [settings] });
    new netbird.Policy(
      entry.resourceName,
      {
        name: entry.groupName,
        description: "One person's devices, to each other (stacks/netbird/selfAccess.ts)",
        enabled: true,
        rules: [{ name: "self", action: "accept", bidirectional: true, protocol: "all", sources: [selfGroup.id], destinations: [selfGroup.id], enabled: true }],
      },
      opts,
    );
  }
});

// ── 12. Tailnet apps on NetBird ─────────────────────────────────────────────
// An app with a tailnet name and an access_policy naming NetBird user groups
// gets `<host>.nb.<root domain>` as a private service on the same proxy,
// open to exactly those groups (app-services.ts, apps.ts;
// docs/plans/netbird-mirror.md §N).
declareAppServices({
  globals,
  api,
  provider,
  userGroupIds: Object.fromEntries(USER_GROUPS.map(name => [name, userGroups[name].id])),
  clusterAddress: proxyCluster,
  root: rootDomain(),
  dependsOn: [defaultPolicyRemoval, nbidpProxyToken],
});

// ── 13. Region exits' Mullvad devices ───────────────────────────────────────
// One Mullvad WireGuard device per region exit, its key and tunnel address
// written to OpenBao for the exit's gluetun (region-exit-devices.ts,
// regionExits.ts; docs/plans/region-exits.md §C1).
const regionExits = declareRegionExitDevices(globals);

/** GET a NetBird API path with `globals.netbirdApi`'s token. */
async function netbirdGet<T>(url: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${url.replace(/\/+$/, "")}${path}`, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`NetBird GET ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export const networkRange = settings.networkRange;
export const deviceGroups = pulumi.output(Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.id])));
/** Each site stack's gateway group id, by site stack (D53). */
export const gatewayGroups = pulumi.output(Object.fromEntries(Object.entries(gatewayStackGroups).map(([key, value]) => [key, value.id])));
/** The Equestria entry's destination group (#2889), which policy.ts's `equestria-entry` rules target. */
export const equestriaEntryGroup = equestriaEntry.id;
/** Each region exit's Mullvad device id, name and tunnel address, by region exit (§C1). */
export const regionExitDevices = regionExits;
