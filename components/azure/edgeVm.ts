/**
 * The shape of a netbird-edge VM on Azure (#3001, docs/plans/netbird-mirror.md
 * §E). Pure, with no Pulumi imports, so `node --test` covers it.
 *
 * The subscription is a Visual Studio one with its spending limit on: past the
 * monthly credit Azure stops the VMs rather than billing. Everything here is
 * sized so two of them fit the Enterprise credit (AZURE_EDGE_MONTHLY_USD).
 */

/** Arm (Ampere Altra), 2 vCPU / 4 GiB, burstable. B2pts v2 has 1 GiB, too little for NetBird + Traefik. */
export const AZURE_EDGE_VM_SIZE = "Standard_B2pls_v2";

/** Ubuntu 24.04 LTS for Arm64. `latest` is read at create; later images never replace the VM. */
export const AZURE_EDGE_IMAGE = { publisher: "Canonical", offer: "ubuntu-24_04-lts", sku: "server-arm64", version: "latest" } as const;

/** GiB. Billed as one E4 (32 GiB) Standard SSD, the smallest tier that holds the image. */
export const AZURE_EDGE_OS_DISK_GB = 30;
export const AZURE_EDGE_OS_DISK_TYPE = "StandardSSD_LRS";

/**
 * The regions the hosts run in, and their address space. Each host gets its own
 * VNet: the hosts never talk to each other directly (backups go to Garage over
 * the tailnet), and the ranges stay outside the home LAN (10.10/16), NetBird's
 * overlay (10.100/16) and OCI's VCN (10.250/16).
 */
export const AZURE_EDGE_REGIONS = {
  eastus2: { short: "eus2", vnetCidr: "10.251.0.0/16", subnetCidr: "10.251.1.0/24" },
  centralus: { short: "cus", vnetCidr: "10.252.0.0/16", subnetCidr: "10.252.1.0/24" },
} as const;
export type AzureEdgeRegion = keyof typeof AZURE_EDGE_REGIONS;

/**
 * Pay-as-you-go list prices, USD, from prices.azure.com on 2026-11-03 (730
 * hours a month). Kept here so the PR's cost note and the code agree; Azure's
 * own cost view is the truth.
 */
export const AZURE_EDGE_MONTHLY_USD = {
  vm: { eastus2: 0.0336 * 730, centralus: 0.038 * 730 },
  standardStaticIpv4: 0.005 * 730,
  e4StandardSsd: 2.4,
} as const;

export interface NsgRule {
  name: string;
  priority: number;
  direction: "Inbound";
  access: "Allow";
  protocol: "Tcp" | "Udp";
  sourceAddressPrefix: "Internet";
  sourcePortRange: "*";
  destinationAddressPrefix: "*";
  destinationPortRange: string;
}

/**
 * One inbound Allow per public port, from the Internet service tag. Nothing
 * else: Azure's default rules deny every other inbound from the Internet, so
 * there is no public 22 (admin is over Tailscale, which needs no inbound port).
 */
export function nsgInboundRules(ports: { tcp: readonly number[]; udp: readonly number[] }): NsgRule[] {
  const rules: NsgRule[] = [];
  let priority = 100;
  for (const [protocol, list] of [
    ["Tcp", ports.tcp],
    ["Udp", ports.udp],
  ] as const) {
    for (const port of list) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Port ${port} is not a TCP/UDP port`);
      if (port === 22) throw new Error("Port 22 is never public on a netbird-edge VM: admin is over Tailscale");
      rules.push({
        name: `allow-${protocol.toLowerCase()}-${port}`,
        priority,
        direction: "Inbound",
        access: "Allow",
        protocol,
        sourceAddressPrefix: "Internet",
        sourcePortRange: "*",
        destinationAddressPrefix: "*",
        destinationPortRange: `${port}`,
      });
      priority += 10;
    }
  }
  return rules;
}

/** Monthly list cost of `hosts` VMs, each with a Standard static IPv4 and an E4 disk. Egress past 100 GB a month is extra. */
export function azureEdgeMonthlyCost(regions: readonly AzureEdgeRegion[]): number {
  const total = regions.reduce((sum, region) => sum + AZURE_EDGE_MONTHLY_USD.vm[region] + AZURE_EDGE_MONTHLY_USD.standardStaticIpv4 + AZURE_EDGE_MONTHLY_USD.e4StandardSsd, 0);
  return Math.round(total * 100) / 100;
}
