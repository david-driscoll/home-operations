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
 *   5. Technitium as every peer's nameserver;
 *   6. a service user whose PAT the in-cluster operator uses (#2889);
 *   7. the `equestria` network the operator's routing peers serve (#2889).
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
import { NetbirdDefaultPolicyRemoval } from "dynamic/netbird/NetbirdDefaultPolicyRemoval.ts";

/** Who may log in at all: the Authentik groups NetBird's ApplicationDefinition admits. */
export const USER_GROUPS = ["admins", "family", "friends", "media-managers"];
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

/** The sites a gateway container joins from (#2887). */
const GATEWAY_SITES = ["home", "ocracoke", "gulf-of-mexico"];

const setupKey = (name: string, autoGroup: netbird.Group, extra: Partial<netbird.SetupKeyArgs> = {}) =>
  new netbird.SetupKey(name, { name, type: "reusable", autoGroups: [autoGroup.id], expirySeconds: 0, usageLimit: 0, ...extra }, { ...opts, dependsOn: [defaultPolicyRemoval] });

const setupKeys = {
  ...Object.fromEntries(GATEWAY_SITES.map(site => [`gateway_${site.replaceAll("-", "_")}`, setupKey(`gateway-${site}`, groups.gateways).key])),
  // Router pods come and go; ephemeral peers are cleaned up when they do.
  k8s_router: setupKey("k8s-router", groups.k8sRouters, { ephemeral: true }).key,
  // TVs have no user to log in with SSO, so they enrol by key (#2886).
  apple_tv: setupKey("apple-tv", groups.appleTv).key,
};

// ── 5. DNS ───────────────────────────────────────────────────────────────
// Technitium's LAN addresses, reached through the gateways' routes (#2887),
// so clients keep resolving the existing <root domain> names. Every peer
// gets them.
const all = netbird.getGroupOutput({ name: "All" }, { provider });
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

// ── 6. Service user ──────────────────────────────────────────────────────
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

// ── 7. Equestria entry ───────────────────────────────────────────────────
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

export const networkRange = settings.networkRange;
export const deviceGroups = pulumi.output(Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.id])));
/** #2888: the policy granting users the Equestria entry targets this group. */
export const equestriaEntryGroup = equestriaEntry.id;
export const equestriaNetwork = equestria.id;
