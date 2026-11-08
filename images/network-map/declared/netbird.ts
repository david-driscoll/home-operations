/**
 * What stacks/netbird declares, read from its pure modules (policy.ts,
 * sites.ts: no Pulumi at runtime, so they import as they are):
 *
 *   USER_GROUPS, DEVICE_GROUPS   Group `netbird:<name>` (kind user / device)
 *   ACCESS_RULES                 Policy `netbird:client-<rule>`, named as the
 *                                stack names it, with `policyName` for the
 *                                DECLARES join (../src/declares.ts), and one
 *                                REACHES per source group to the destination
 *                                group. Ports in the observed layer's format
 *                                (../src/sources/netbird.ts rulePorts)
 *   SITES                        per routed site, Network `site-lan:<site>`
 *                                and a Route `netbird:<cidr>` ROUTES_TO it
 *   GATEWAY_SITE_STACKS          Group `netbird:gateway-<stack>`, and a
 *                                container Machine `gateway-<host>` per host,
 *                                HOSTED_ON the host's Dockge LXC, MEMBER_OF
 *                                `netbird:gateways` and its stack's group
 *
 * Plus the overlay itself, Network `netbird:netbird`.
 */
import type { AccessRule } from "../../../stacks/netbird/policy.ts";
import type { Site } from "../../../stacks/netbird/sites.ts";
import { NETBIRD_NETWORK_ID } from "../src/model.ts";
import { netbirdGroupKey, netbirdRouteKey, rulePorts } from "../src/sources/netbird.ts";
import type { DockgeHost } from "./machines.ts";
import { type DeclaredPlan, machineKey } from "./plan.ts";

export interface NetbirdDeclarations {
  userGroups: readonly string[];
  deviceGroups: readonly string[];
  rules: readonly AccessRule[];
  sites: Record<string, Site>;
  siteStacks: Record<string, string[]>;
  /** sites.ts's naming: `gateway-<site stack>` for a group, `gateway-<host>` for a peer. */
  gatewayGroupName: (siteStack: string) => string;
  gatewayPeerName: (host: string) => string;
}

/**
 * The modules as they are in the checkout. Imported when called, not at load,
 * so a renamed or broken module is a problem ./load.ts reports, not a crash.
 */
export async function readNetbird(): Promise<NetbirdDeclarations> {
  const policy = await import("../../../stacks/netbird/policy.ts");
  const sites = await import("../../../stacks/netbird/sites.ts");
  return {
    userGroups: policy.USER_GROUPS,
    deviceGroups: policy.DEVICE_GROUPS,
    rules: policy.ACCESS_RULES,
    sites: sites.SITES,
    siteStacks: sites.GATEWAY_SITE_STACKS,
    gatewayGroupName: sites.gatewayGroupName,
    gatewayPeerName: sites.gatewayPeerName,
  };
}

/** The policy name stacks/netbird gives a rule (`client-<rule>`, stacks/netbird/index.ts section 9). */
export const clientPolicyName = (rule: string) => `client-${rule}`;

const group = (plan: DeclaredPlan, name: string, kind: string) => plan.node("Group", netbirdGroupKey(name), { system: "netbird", name, kind });

export function addNetbird(plan: DeclaredPlan, decl: NetbirdDeclarations, dockgeHosts: DockgeHost[]): void {
  plan.node("Network", NETBIRD_NETWORK_ID, { name: "netbird", kind: "netbird" });
  for (const name of decl.userGroups) group(plan, name, "user");
  for (const name of decl.deviceGroups) group(plan, name, "device");

  for (const rule of decl.rules) {
    const policyName = clientPolicyName(rule.name);
    const via = `netbird:${policyName}`;
    const ports = rulePorts({ id: rule.name, protocol: rule.protocol, ports: rule.protocol === "icmp" ? undefined : rule.ports?.map(String) });
    plan.node("Policy", via, { system: "netbird", name: policyName, policyName, description: rule.description, action: "accept", ports, mirrors: rule.mirrors });
    // A destination is a resource or peer group the stack creates; only the
    // user and device groups are declared above, so the rest appear here.
    group(plan, rule.destination, "device");
    for (const source of rule.sources) {
      if (!plan.has("Group", netbirdGroupKey(source))) group(plan, source, "device");
      plan.rel("REACHES", { label: "Group", key: netbirdGroupKey(source) }, { label: "Group", key: netbirdGroupKey(rule.destination) }, { via, ports }, via);
    }
  }

  // Only sites with a gateway stack get a network (sites.ts routedSites).
  for (const [site, config] of Object.entries(decl.sites).filter(([, s]) => s.gatewayStacks.length > 0)) {
    const networkId = `site-lan:${site}`;
    plan.node("Network", networkId, { name: site, kind: "site-lan", cidr: config.cidrs.length === 1 ? config.cidrs[0] : undefined, cidrs: config.cidrs });
    group(plan, `lan-${site}`, "device");
    for (const cidr of config.cidrs) {
      plan.node("Route", netbirdRouteKey(cidr), { system: "netbird", cidr, exit: false, site, routedBy: config.gatewayStacks.map(decl.gatewayGroupName) });
      plan.rel("ROUTES_TO", { label: "Route", key: netbirdRouteKey(cidr) }, { label: "Network", key: networkId });
    }
  }

  const lxcOf = new Map(dockgeHosts.map(h => [h.hostName, h.name]));
  group(plan, "gateways", "device");
  for (const [stack, hosts] of Object.entries(decl.siteStacks)) {
    group(plan, decl.gatewayGroupName(stack), "device");
    for (const host of hosts) {
      const name = decl.gatewayPeerName(host);
      const key = machineKey(name);
      plan.node("Machine", key, { name, hostname: name, kind: "container", declaredAs: "netbird-gateway", cluster: host, siteStack: stack });
      for (const g of ["gateways", decl.gatewayGroupName(stack)]) plan.rel("MEMBER_OF", { label: "Machine", key }, { label: "Group", key: netbirdGroupKey(g) });
      const lxc = lxcOf.get(host);
      if (lxc) plan.rel("HOSTED_ON", { label: "Machine", key }, { label: "Machine", key: machineKey(lxc) });
      else plan.problems.push(`netbird gateway ${name}: no Dockge LXC for ${host} in the site stacks`);
    }
  }
}
