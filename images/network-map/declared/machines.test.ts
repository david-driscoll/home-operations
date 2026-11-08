/**
 * node --test images/network-map/declared/machines.test.ts
 *
 * Reading the site stacks' constructor literals, TOPF's nodes, and the
 * Machines, HOSTED_ON and advertised routes they become.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { addMachines, dockgeHosts, parseStackSource, parseTopf, readMachineSources } from "./machines.ts";
import { DeclaredPlan } from "./plan.ts";

const source = `
import { Tailscale } from "components/constants.ts";
const mac = computeIt();
const celestiaHost = new ProxmoxHost("celestia", {
  globals: globals,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  remote: false,
  tailscaleArgs: { advertiseExitNode: true, acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: { start: 302, end: 399 },
});
const spike = new TruenasVm("spike", { host: celestiaHost, ipAddress: pulumi.output("10.10.10.10") });
new TalosVm("milky-way", { host: celestiaHost, vmId: 210, macAddress: "BC:24:11:20:91:10", cores: 2 * 2 });
const runtime = new DockgeLxc("celestia-dockge", { host: celestiaHost, vmId: dockgeId.result, macAddress: mac });
const other = new Unrelated("x", { host: celestiaHost });
`;

const scope = { Tailscale: { subnets: { home: "10.10.0.0/16" } } };

describe("parseStackSource", () => {
  it("reads each machine constructor's literal args, resolving constants, references and pulumi.output", () => {
    const resources = parseStackSource(source, scope, "stacks/home/index.ts");
    assert.deepEqual(
      resources.map(r => [r.className, r.name]),
      [
        ["ProxmoxHost", "celestia"],
        ["TruenasVm", "spike"],
        ["TalosVm", "milky-way"],
        ["DockgeLxc", "celestia-dockge"],
      ],
    );
    const [host, spike, talos, lxc] = resources;
    assert.equal(host.variable, "stacks/home/index.ts#celestiaHost");
    assert.deepEqual(host.args.tailscaleSubnetRoutes, ["10.10.0.0/16"]);
    assert.deepEqual(host.args.tailscaleArgs, { advertiseExitNode: true, acceptRoutes: false });
    assert.equal(host.args.globals, undefined, "an identifier that is not a constructed resource is dropped");
    assert.equal(spike.args.ipAddress, "10.10.10.10");
    assert.deepEqual(talos.args.host, { ref: "stacks/home/index.ts#celestiaHost" });
    assert.equal(talos.args.cores, undefined, "a computed value is dropped");
    assert.equal(lxc.args.vmId, undefined);
    assert.equal(lxc.args.macAddress, undefined);
  });

  it("qualifies variables by file, so two stacks' `host` stay apart", () => {
    const a = parseStackSource('const host = new ProxmoxHost("luna", {});\nnew DockgeLxc("luna-dockge", { host: host });', {}, "a.ts");
    const b = parseStackSource('const host = new ProxmoxHost("skystar", { shortName: "sky" });\nnew DockgeLxc("skystar-dockge", { host });', {}, "b.ts");
    assert.deepEqual(dockgeHosts([...a, ...b]), [
      { name: "luna-dockge", hostName: "luna", shortName: "luna" },
      { name: "skystar-dockge", hostName: "skystar", shortName: "sky" },
    ]);
  });
});

describe("parseTopf", () => {
  it("reads host, ip, role and data.mac, lowercased, through YAML merges", () => {
    const nodes = parseTopf(`clusterName: equestria
nodes:
  - host: milky-way
    ip: 10.10.209.10
    role: control-plane
    data: &cp_data
      mac: "BC:24:11:20:91:10"
      labels: {a: b}
  - host: pegasus
    ip: 10.10.209.12
    role: control-plane
    data:
      <<: *cp_data
      mac: "e0:51:d8:19:d2:b2"
  - host: othalla
    role: control-plane
    data: *cp_data
  - host: worker
    role: worker
`);
    assert.deepEqual(nodes, [
      { hostname: "milky-way", ipAddress: "10.10.209.10", controlPlane: true, macs: ["bc:24:11:20:91:10"] },
      { hostname: "pegasus", ipAddress: "10.10.209.12", controlPlane: true, macs: ["e0:51:d8:19:d2:b2"] },
      { hostname: "othalla", ipAddress: undefined, controlPlane: true, macs: ["bc:24:11:20:91:10"] },
      { hostname: "worker", ipAddress: undefined, controlPlane: false, macs: [] },
    ]);
  });

  it("refuses a `nodes` that is not a list", () => {
    assert.throws(() => parseTopf("nodes: {a: 1}\n"), /not a list/);
  });
});

describe("readMachineSources", () => {
  it("turns every missing source into a problem instead of throwing", async () => {
    const problems: string[] = [];
    const empty = await mkdtemp(join(tmpdir(), "nm-machines-"));
    try {
      const read = await readMachineSources(empty, {}, problems);
      assert.deepEqual(read, { resources: [], talos: [], clusters: [] });
      assert.deepEqual(problems, [
        "stacks/home/index.ts: not found; skipped",
        "stacks/gulf-of-mexico/index.ts: not found; skipped",
        "stacks/ocracoke/index.ts: not found; skipped",
        "talos/topf.yaml: not found; skipped",
        "clusters/: not found; skipped",
      ]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe("addMachines", () => {
  it("makes one Machine per hostname, merging a TalosVm with its Talos node, with HOSTED_ON and advertised routes", () => {
    const plan = new DeclaredPlan();
    addMachines(plan, {
      resources: parseStackSource(source, scope, "stacks/home/index.ts"),
      talos: [{ hostname: "milky-way", ipAddress: "10.10.209.10", controlPlane: true, macs: ["bc:24:11:20:91:10"] }],
      clusters: [{ key: "celestia", type: "dockge", location: "home" }],
    });
    const { nodes, rels, problems } = plan.finish();
    assert.deepEqual(problems, []);
    const machines = Object.fromEntries(nodes.filter(n => n.label === "Machine").map(n => [n.key, n.props]));
    assert.deepEqual(Object.keys(machines).sort(), ["repo:celestia", "repo:celestia-dockge", "repo:milky-way", "repo:spike"]);
    assert.deepEqual(machines["repo:celestia"].ips, ["10.10.10.103", "100.111.10.103"]);
    assert.equal(machines["repo:celestia"].kind, "physical");
    assert.equal(machines["repo:celestia-dockge"].cluster, "celestia");
    // The VM is Equestria's, not its host's cluster.
    assert.equal(machines["repo:milky-way"].cluster, "equestria");
    assert.equal(machines["repo:milky-way"].kind, "vm");
    assert.equal(machines["repo:milky-way"].role, "control-plane");
    assert.deepEqual(machines["repo:milky-way"].macs, ["bc:24:11:20:91:10"]);
    assert.deepEqual(
      rels
        .filter(r => r.type === "HOSTED_ON")
        .map(r => `${r.from.key}>${r.to.key}`)
        .sort(),
      ["repo:celestia-dockge>repo:celestia", "repo:milky-way>repo:celestia", "repo:spike>repo:celestia"],
    );
    const routes = nodes.filter(n => n.label === "Route");
    assert.deepEqual(
      routes.map(r => [r.key, r.props.exit]),
      [
        ["tailscale:10.10.0.0/16", false],
        ["tailscale:0.0.0.0/0", true],
        ["tailscale:::/0", true],
      ],
    );
    assert.deepEqual(routes[0].props.advertisedBy, ["celestia"]);
  });
});
