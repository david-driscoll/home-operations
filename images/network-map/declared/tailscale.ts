/**
 * What components/constants.ts declares about the tailnet. The policy file
 * itself is built at run time from live inventory (stacks/unifi-network
 * acl-manager.ts), so only the constants are declared here:
 *
 *   Tailscale.tag.*        Group `tailscale:tag:<name>` (kind tag)
 *   Tailscale.groups.*     Group `tailscale:group:<name>` (kind user)
 *   Tailscale.subnets.*    Route `tailscale:<cidr>`, ROUTES_TO `site-lan:<site>`
 *                          (the keys are site names, as in stacks/netbird SITES)
 *   kubernetesClusters     Route `tailscale:<cidr>` for each cluster's pod and
 *                          service networks, Group for its tag
 *
 * Which hosts advertise the subnet and exit routes comes from the site stacks
 * (./machines.ts). Tailscale.ports names port sets, not reach: without the
 * grants that use them they have nowhere to land, so they are not declared.
 *
 * Plus the overlay itself, Network `tailscale:tailnet`.
 */
import { TAILNET_NETWORK_ID } from "../src/model.ts";
import { CGNAT_CIDR } from "../src/normalize.ts";
import { tailscaleGroupKey, tailscaleRouteKey } from "../src/sources/tailscale.ts";
import type { DeclaredPlan } from "./plan.ts";

export interface TailscaleDeclarations {
  tags: Record<string, string>;
  groups: Record<string, string>;
  subnets: Record<string, string>;
  clusters: readonly { tag: string; clusterNetwork: string; serviceNetwork: string }[];
}

/**
 * components/constants.ts as it is in the checkout, imported when called (see
 * ./netbird.ts readNetbird), plus the `Tailscale` scope ./machines.ts reads the
 * site stacks with.
 */
export async function readTailscale(): Promise<{ decl: TailscaleDeclarations; scope: { Tailscale: unknown } }> {
  const { kubernetesClusters, Tailscale } = await import("../../../components/constants.ts");
  return { decl: { tags: Tailscale.tag, groups: Tailscale.groups, subnets: Tailscale.subnets, clusters: kubernetesClusters }, scope: { Tailscale } };
}

export function addTailscale(plan: DeclaredPlan, decl: TailscaleDeclarations): void {
  plan.node("Network", TAILNET_NETWORK_ID, { name: "tailnet", kind: "tailnet", cidr: CGNAT_CIDR });
  for (const tag of Object.values(decl.tags)) plan.node("Group", tailscaleGroupKey(tag), { system: "tailscale", name: tag, kind: "tag" });
  for (const g of Object.values(decl.groups)) plan.node("Group", tailscaleGroupKey(g), { system: "tailscale", name: g, kind: "user" });
  for (const [site, cidr] of Object.entries(decl.subnets)) {
    plan.node("Route", tailscaleRouteKey(cidr), { system: "tailscale", cidr, exit: false, site });
    plan.node("Network", `site-lan:${site}`, { name: site, kind: "site-lan", cidr, cidrs: [cidr] });
    plan.rel("ROUTES_TO", { label: "Route", key: tailscaleRouteKey(cidr) }, { label: "Network", key: `site-lan:${site}` });
  }
  for (const cluster of decl.clusters) {
    const name = cluster.tag.replace(/^tag:/, "");
    plan.node("Group", tailscaleGroupKey(cluster.tag), { system: "tailscale", name: cluster.tag, kind: "tag" });
    plan.node("Route", tailscaleRouteKey(cluster.clusterNetwork), { system: "tailscale", cidr: cluster.clusterNetwork, exit: false, cluster: name, role: "k8s-pod" });
    plan.node("Route", tailscaleRouteKey(cluster.serviceNetwork), { system: "tailscale", cidr: cluster.serviceNetwork, exit: false, cluster: name, role: "k8s-svc" });
  }
}
