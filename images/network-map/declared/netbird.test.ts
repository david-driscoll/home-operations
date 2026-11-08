/**
 * node --test images/network-map/declared/netbird.test.ts
 *
 * stacks/netbird's policy and sites, and components/constants.ts's Tailscale
 * constants, as declared nodes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCESS_RULES } from "../../../stacks/netbird/policy.ts";
import { addNetbird, clientPolicyName, NETBIRD, type NetbirdDeclarations } from "./netbird.ts";
import { DeclaredPlan } from "./plan.ts";
import { addTailscale, TAILSCALE } from "./tailscale.ts";

const decl: NetbirdDeclarations = {
  userGroups: ["admins", "family"],
  deviceGroups: ["apple-tv"],
  rules: [
    { name: "users-web-tcp", description: "web", sources: ["admins", "family"], destination: "home-web", protocol: "tcp", ports: [80, 443], mirrors: ["x"] },
    { name: "users-exit-nodes", description: "icmp", sources: ["admins"], destination: "gateways", protocol: "icmp", mirrors: [] },
    { name: "admins-lan", description: "all", sources: ["admins"], destination: "lan-home", protocol: "all", mirrors: [] },
  ],
  sites: { home: { cidrs: ["10.10.0.0/16"], gatewayStacks: ["home"] }, away: { cidrs: ["192.168.1.0/24"], gatewayStacks: [] } },
  siteStacks: { home: ["celestia", "nowhere"] },
};

describe("addNetbird", () => {
  const plan = new DeclaredPlan();
  plan.node("Machine", "repo:celestia-dockge", {});
  addNetbird(plan, decl, [{ name: "celestia-dockge", hostName: "celestia", shortName: "celestia" }]);
  const { nodes, rels, problems } = plan.finish();
  const keys = (label: string) => nodes.filter(n => n.label === label).map(n => n.key);

  it("declares the user, device, destination and gateway groups", () => {
    assert.deepEqual(keys("Group").sort(), ["netbird:admins", "netbird:apple-tv", "netbird:family", "netbird:gateway-home", "netbird:gateways", "netbird:home-web", "netbird:lan-home"]);
    assert.equal(nodes.find(n => n.key === "netbird:admins")?.props.kind, "user");
  });

  it("makes one Policy per rule, named as the stack names it, with the observed layer's port format", () => {
    const web = nodes.find(n => n.label === "Policy" && n.key === "netbird:client-users-web-tcp");
    assert.equal(web?.props.policyName, "client-users-web-tcp");
    assert.deepEqual(web?.props.ports, ["tcp:80", "tcp:443"]);
    assert.deepEqual(nodes.find(n => n.key === "netbird:client-users-exit-nodes")?.props.ports, ["icmp"]);
    assert.deepEqual(nodes.find(n => n.key === "netbird:client-admins-lan")?.props.ports, ["*"]);
  });

  it("draws REACHES from each source group to the destination, keyed by policy", () => {
    const reaches = rels.filter(r => r.type === "REACHES").map(r => `${r.from.key}>${r.to.key}@${r.mergeKey}`);
    assert.deepEqual(reaches, [
      "netbird:admins>netbird:home-web@netbird:client-users-web-tcp",
      "netbird:family>netbird:home-web@netbird:client-users-web-tcp",
      "netbird:admins>netbird:gateways@netbird:client-users-exit-nodes",
      "netbird:admins>netbird:lan-home@netbird:client-admins-lan",
    ]);
  });

  it("routes only sites with gateways, and puts a gateway Machine on each host's LXC", () => {
    assert.deepEqual(keys("Route"), ["netbird:10.10.0.0/16"]);
    assert.ok(rels.some(r => r.type === "ROUTES_TO" && r.from.key === "netbird:10.10.0.0/16" && r.to.key === "site-lan:home"));
    assert.ok(!keys("Network").includes("site-lan:away"));
    assert.ok(rels.some(r => r.type === "HOSTED_ON" && r.from.key === "repo:gateway-celestia" && r.to.key === "repo:celestia-dockge"));
    assert.deepEqual(
      rels.filter(r => r.type === "MEMBER_OF" && r.from.key === "repo:gateway-celestia").map(r => r.to.key),
      ["netbird:gateways", "netbird:gateway-home"],
    );
    // A host no site stack builds an LXC for is a problem, not a silent gap.
    assert.deepEqual(problems, ["netbird gateway gateway-nowhere: no Dockge LXC for nowhere in the site stacks"]);
  });

  it("covers every rule on main", () => {
    const real = new DeclaredPlan();
    addNetbird(real, NETBIRD, []);
    for (const rule of ACCESS_RULES) assert.ok(real.has("Policy", `netbird:${clientPolicyName(rule.name)}`), rule.name);
  });
});

describe("addTailscale", () => {
  it("declares tags, groups, subnet routes to their site LAN, and each cluster's networks", () => {
    const plan = new DeclaredPlan();
    addTailscale(plan, {
      tags: { dockge: "tag:dockge" },
      groups: { family: "group:family" },
      subnets: { home: "10.10.0.0/16" },
      clusters: [{ tag: "tag:equestria", clusterNetwork: "10.206.0.0/16", serviceNetwork: "10.196.0.0/16" }],
    });
    const { nodes, rels, problems } = plan.finish();
    assert.deepEqual(problems, []);
    const groups = Object.fromEntries(nodes.filter(n => n.label === "Group").map(n => [n.key, n.props.kind]));
    assert.deepEqual(groups, { "tailscale:tag:dockge": "tag", "tailscale:group:family": "user", "tailscale:tag:equestria": "tag" });
    assert.deepEqual(
      nodes.filter(n => n.label === "Route").map(n => n.key),
      ["tailscale:10.10.0.0/16", "tailscale:10.206.0.0/16", "tailscale:10.196.0.0/16"],
    );
    assert.ok(rels.some(r => r.type === "ROUTES_TO" && r.from.key === "tailscale:10.10.0.0/16" && r.to.key === "site-lan:home"));
    assert.ok(nodes.some(n => n.label === "Network" && n.key === "tailscale:tailnet"));
  });

  it("reads the real constants", () => {
    const plan = new DeclaredPlan();
    addTailscale(plan, TAILSCALE);
    assert.ok(plan.has("Group", "tailscale:tag:dockge"));
    assert.ok(plan.has("Route", "tailscale:10.10.0.0/16"));
  });
});
