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
import { ACCESS_RULES, type AccessRule, DEVICE_GROUPS, USER_GROUPS } from "../../../stacks/netbird/policy.ts";
import { GATEWAY_SITE_STACKS, gatewayGroupName, gatewayPeerName, routedSites, SITES, type Site } from "../../../stacks/netbird/sites.ts";
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
}

/** The modules as they are on main. */
export const NETBIRD: NetbirdDeclarations = { userGroups: USER_GROUPS, deviceGroups: DEVICE_GROUPS, rules: ACCESS_RULES, sites: SITES, siteStacks: GATEWAY_SITE_STACKS };

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

  for (const [site, config] of routedSites(decl.sites)) {
    const networkId = `site-lan:${site}`;
    plan.node("Network", networkId, { name: site, kind: "site-lan", cidr: config.cidrs.length === 1 ? config.cidrs[0] : undefined, cidrs: config.cidrs });
    group(plan, `lan-${site}`, "device");
    for (const cidr of config.cidrs) {
      plan.node("Route", netbirdRouteKey(cidr), { system: "netbird", cidr, exit: false, site, routedBy: config.gatewayStacks.map(gatewayGroupName) });
      plan.rel("ROUTES_TO", { label: "Route", key: netbirdRouteKey(cidr) }, { label: "Network", key: networkId });
    }
  }

  const lxcOf = new Map(dockgeHosts.map(h => [h.hostName, h.name]));
  group(plan, "gateways", "device");
  for (const [stack, hosts] of Object.entries(decl.siteStacks)) {
    group(plan, gatewayGroupName(stack), "device");
    for (const host of hosts) {
      const name = gatewayPeerName(host);
      const key = machineKey(name);
      plan.node("Machine", key, { name, hostname: name, kind: "container", declaredAs: "netbird-gateway", cluster: host, siteStack: stack });
      for (const g of ["gateways", gatewayGroupName(stack)]) plan.rel("MEMBER_OF", { label: "Machine", key }, { label: "Group", key: netbirdGroupKey(g) });
      const lxc = lxcOf.get(host);
      if (lxc) plan.rel("HOSTED_ON", { label: "Machine", key }, { label: "Machine", key: machineKey(lxc) });
      else plan.problems.push(`netbird gateway ${name}: no Dockge LXC for ${host} in the site stacks`);
    }
  }
}
