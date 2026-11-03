/**
 * The self-hosted NetBird control plane's infrastructure on OCI Always Free
 * (docs/plans/netbird-mirror.md, epic #2880).
 *
 * This stack owns the tenancy's free-tier guard (quota allow-list + budget)
 * and the one A1 VM. The NetBird server, backups and the Azure fallback land
 * here in later tickets (#3000, #2884, #3001).
 */
import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";
import { TailnetKey } from "@pulumi/tailscale";
import * as tls from "@pulumi/tls";
import { Tailscale } from "components/constants.ts";
import { GlobalResources } from "components/globals.ts";
import { FREE_TIER, freeTierQuotaStatements } from "components/oci/freeTier.ts";
import { OciFreeTierInstance } from "components/oci/OciFreeTierInstance.ts";
import { netbirdEdgeCloudInit, PUBLIC_TCP_PORTS, PUBLIC_UDP_PORTS } from "./cloudInit.ts";

const config = new pulumi.Config();
// Which of Ashburn's three ADs holds the VM. Changing it moves the quota pin
// with it; try another when A1 reports "Out of host capacity".
const availabilityDomainIndex = config.getNumber("availabilityDomainIndex") ?? 0;
// Kept as an encrypted stack secret: the repo is public.
const budgetAlertEmail = config.requireSecret("budgetAlertEmail");

const hostname = "netbird-edge";
// Outside the home LAN (10.10/16) and NetBird's overlay (10.100/16).
const vcnCidr = "10.250.0.0/16";
const subnetCidr = "10.250.1.0/24";

const globals = new GlobalResources({}, {});
const provider = globals.ociProvider;
const tenancyId = globals.ociCredential.tenancy_ocid;
const opts = { provider };

const homeAd = oci.identity.getAvailabilityDomainsOutput({ compartmentId: tenancyId }, opts).availabilityDomains.apply(ads => {
  const ad = ads[availabilityDomainIndex];
  if (!ad) throw new Error(`availabilityDomainIndex ${availabilityDomainIndex} is out of range (${ads.length} ADs)`);
  return ad.name;
});

// ── Free-tier guard, tenancy-wide ────────────────────────────────────────
// Quotas block creation server-side; the budget only alerts. Both cover the
// whole tenancy, not just this stack's compartment.
new oci.limits.Quota(
  "free-tier",
  {
    compartmentId: tenancyId,
    name: "free-tier-allowlist",
    description: "Always Free allow-list, managed by stacks/netbird-edge",
    statements: homeAd.apply(freeTierQuotaStatements),
  },
  opts,
);

const budget = new oci.budget.Budget(
  "zero-spend",
  {
    compartmentId: tenancyId,
    displayName: "zero-spend",
    description: "Alerts on any spend in the Always Free tenancy",
    amount: 1,
    resetPeriod: "MONTHLY",
    targetType: "COMPARTMENT",
    targets: [tenancyId],
    processingPeriodType: "MONTH",
  },
  opts,
);
new oci.budget.Rule(
  "any-actual-spend",
  {
    budgetId: budget.id,
    displayName: "any-actual-spend",
    type: "ACTUAL",
    thresholdType: "ABSOLUTE",
    threshold: 0.01,
    recipients: budgetAlertEmail,
    message: "OCI spend is above $0 on the Always Free tenancy. Check stacks/netbird-edge.",
  },
  opts,
);
new oci.budget.Rule(
  "forecast-spend",
  {
    budgetId: budget.id,
    displayName: "forecast-spend",
    type: "FORECAST",
    thresholdType: "PERCENTAGE",
    threshold: 50,
    recipients: budgetAlertEmail,
    message: "OCI forecasts spend on the Always Free tenancy. Check stacks/netbird-edge.",
  },
  opts,
);

// ── Network ──────────────────────────────────────────────────────────────
const compartment = new oci.identity.Compartment("netbird", { compartmentId: tenancyId, name: "netbird", description: "NetBird control plane (stacks/netbird-edge)", enableDelete: true }, opts);
const compartmentId = compartment.id;

const vcn = new oci.core.Vcn("netbird", { compartmentId, cidrBlocks: [vcnCidr], displayName: "netbird", dnsLabel: "netbird" }, opts);
const internetGateway = new oci.core.InternetGateway("netbird", { compartmentId, vcnId: vcn.id, displayName: "netbird", enabled: true }, opts);
const routeTable = new oci.core.RouteTable(
  "netbird",
  {
    compartmentId,
    vcnId: vcn.id,
    displayName: "netbird",
    routeRules: [{ destination: "0.0.0.0/0", destinationType: "CIDR_BLOCK", networkEntityId: internetGateway.id }],
  },
  opts,
);

// The VCN's default security list allows 22/tcp from anywhere. Take it over
// and leave only egress plus the ICMP path-MTU messages; the NSG below is the
// one place inbound ports are opened.
new oci.core.DefaultSecurityList(
  "netbird-default",
  {
    manageDefaultResourceId: vcn.defaultSecurityListId,
    compartmentId,
    displayName: "netbird-default",
    egressSecurityRules: [{ destination: "0.0.0.0/0", protocol: "all" }],
    ingressSecurityRules: [
      { source: "0.0.0.0/0", protocol: "1", icmpOptions: { type: 3, code: 4 } },
      { source: vcnCidr, protocol: "1", icmpOptions: { type: 3 } },
    ],
  },
  opts,
);

const subnet = new oci.core.Subnet("netbird", { compartmentId, vcnId: vcn.id, cidrBlock: subnetCidr, displayName: "netbird", dnsLabel: "edge", routeTableId: routeTable.id, prohibitPublicIpOnVnic: false }, opts);

const nsg = new oci.core.NetworkSecurityGroup("netbird", { compartmentId, vcnId: vcn.id, displayName: "netbird-public" }, opts);
const PROTOCOL = { tcp: "6", udp: "17" } as const;
for (const [protocol, ports] of [
  ["tcp", PUBLIC_TCP_PORTS],
  ["udp", PUBLIC_UDP_PORTS],
] as const) {
  for (const port of ports) {
    const range = { destinationPortRange: { min: port, max: port } };
    new oci.core.NetworkSecurityGroupSecurityRule(
      `netbird-${protocol}-${port}`,
      {
        networkSecurityGroupId: nsg.id,
        direction: "INGRESS",
        protocol: PROTOCOL[protocol],
        source: "0.0.0.0/0",
        sourceType: "CIDR_BLOCK",
        description: `NetBird ${protocol}/${port}`,
        ...(protocol === "tcp" ? { tcpOptions: range } : { udpOptions: range }),
      },
      opts,
    );
  }
}

// ── The VM ───────────────────────────────────────────────────────────────
// Joins the tailnet as tag:netbird-edge (admins only; see
// configureNetbirdEdgeAccess in stacks/unifi-network/acl-manager.ts).
const tailscaleAuthKey = new TailnetKey(
  "netbird-edge-authkey",
  {
    reusable: true,
    preauthorized: true,
    ephemeral: false,
    recreateIfInvalid: "always",
    tags: [Tailscale.tag.netbirdEdge],
    description: "netbird-edge OCI VM",
  },
  { provider: globals.tailscaleProvider },
);

// Break-glass key for OCI Bastion sessions if Tailscale never comes up.
// Port 22 is not public, so the key alone opens nothing.
const breakGlassKey = new tls.PrivateKey("netbird-edge-break-glass", { algorithm: "ED25519" });

const vm = new OciFreeTierInstance(hostname, {
  compartmentId,
  availabilityDomain: homeAd,
  subnetId: subnet.id,
  nsgIds: [nsg.id],
  region: globals.ociCredential.region,
  hostname,
  sshAuthorizedKeys: breakGlassKey.publicKeyOpenssh,
  userData: netbirdEdgeCloudInit({ hostname, tailscaleAuthKey: tailscaleAuthKey.key, tailscaleTag: Tailscale.tag.netbirdEdge }),
  provider,
});

export const publicIpAddress = vm.publicIpAddress;
export const privateIpAddress = vm.privateIpAddress;
export const availabilityDomain = homeAd;
export const freeTier = FREE_TIER;
export const breakGlassPrivateKey = pulumi.secret(breakGlassKey.privateKeyOpenssh);
