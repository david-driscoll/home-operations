/**
 * node --test images/network-map/declared/load.test.ts
 *
 * The whole loader over this checkout, with made-up domains: it reads every
 * source without a problem, and every edge it plans has both ends.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadDeclared } from "./load.ts";

const root = new URL("../../..", import.meta.url).pathname;

describe("loadDeclared on this checkout", async () => {
  const plan = await loadDeclared(root, { root: "example.test", tailnet: "tail0.ts.net" });
  const of = (label: string) => plan.nodes.filter(n => n.label === label);

  it("reads every source without a problem", () => {
    assert.deepEqual(plan.problems, []);
  });

  it("declares apps from both Kubernetes and Docker, each Dockge host running some", () => {
    assert.ok(of("App").length > 100);
    const runsFrom = new Set(plan.rels.filter(r => r.type === "RUNS").map(r => r.from.key));
    for (const lxc of ["repo:celestia-dockge", "repo:alpha-site-dockge", "repo:luna-dockge", "repo:skystar-dockge"]) assert.ok(runsFrom.has(lxc), lxc);
  });

  it("counts the apps Flux does not deploy instead of declaring them", () => {
    const disabled = plan.disabled.map(d => d.split(":")[0].split("/").at(-1));
    for (const app of ["karakeep", "openbooks", "readarr-audio", "readarr-ebook", "retrom", "super-productivity", "supersync", "tandoor", "stremio"]) {
      assert.ok(disabled.includes(app), `${app} is disabled`);
      assert.ok(!of("App").some(a => a.key === app), `${app} is not declared`);
    }
    for (const app of ["temporal", "valkey", "toolport", "setup-guide"])
      assert.ok(
        of("App").some(a => a.key === app),
        `${app} is declared`,
      );
  });

  it("names apps under the given domains only, with no variable left in a name", () => {
    for (const app of of("App")) {
      for (const host of (app.props.hostnames as string[] | undefined) ?? []) {
        assert.doesNotMatch(host, /\$\{/, app.key);
        assert.match(host, /\.(example\.test|tail0\.ts\.net)$/, `${app.key}: ${host}`);
      }
    }
  });

  it("sources Equestria's nodes from talos/topf.yaml, milky-way's TalosVm and node as one machine", () => {
    const nodes = of("Machine").filter(m => m.props.cluster === "equestria");
    assert.deepEqual(nodes.map(m => m.key).sort(), ["repo:fluttershy", "repo:hard-hat", "repo:kerfuffle", "repo:milky-way", "repo:othalla", "repo:pegasus", "repo:shining-armor"]);
    const milkyWay = nodes.find(m => m.key === "repo:milky-way");
    assert.equal(milkyWay?.props.declaredAs, "TalosVm");
    assert.equal(milkyWay?.props.role, "control-plane");
    assert.ok(plan.rels.some(r => r.type === "HOSTED_ON" && r.from.key === "repo:milky-way" && r.to.key === "repo:celestia"));
    for (const m of nodes) assert.equal((m.props.macs as string[] | undefined)?.length, 1, m.key);
  });

  it("declares the six UniFi zones, the overlays, and the Equestria nodes", () => {
    assert.equal(of("Zone").length, 6);
    assert.ok(plan.nodes.some(n => n.key === "tailscale:tailnet"));
    assert.ok(plan.nodes.some(n => n.key === "netbird:netbird"));
    assert.ok(of("Machine").some(m => m.props.cluster === "equestria" && m.props.role === "control-plane"));
  });
});

describe("loadDeclared on a checkout with nothing in it", () => {
  it("completes, every source a problem, rather than throwing", async () => {
    const empty = await mkdtemp(join(tmpdir(), "nm-load-"));
    try {
      const plan = await loadDeclared(empty, { root: "example.test", tailnet: "tail0.ts.net" });
      assert.ok(plan.problems.some(p => p.startsWith("talos/topf.yaml: not found")));
      assert.ok(plan.problems.some(p => p.startsWith("images/network-map/declared/unifi-zones.yaml: not found")));
      assert.ok(plan.problems.some(p => p.startsWith("kubernetes/apps: no definition.yaml")));
      // The module-backed sources still load: they come from this checkout's code, not the empty root.
      assert.ok(plan.nodes.some(n => n.key === "netbird:admins"));
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
