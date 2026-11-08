/**
 * node --test images/network-map/declared/load.test.ts
 *
 * The whole loader over this checkout, with made-up domains: it reads every
 * source without a problem, and every edge it plans has both ends.
 */
import assert from "node:assert/strict";
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

  it("names apps under the given domains only, with no variable left in a name", () => {
    for (const app of of("App")) {
      for (const host of (app.props.hostnames as string[] | undefined) ?? []) {
        assert.doesNotMatch(host, /\$\{/, app.key);
        assert.match(host, /\.(example\.test|tail0\.ts\.net)$/, `${app.key}: ${host}`);
      }
    }
  });

  it("declares the six UniFi zones, the overlays, and the Equestria nodes", () => {
    assert.equal(of("Zone").length, 6);
    assert.ok(plan.nodes.some(n => n.key === "tailscale:tailnet"));
    assert.ok(plan.nodes.some(n => n.key === "netbird:netbird"));
    assert.ok(of("Machine").some(m => m.props.cluster === "equestria" && m.props.role === "control-plane"));
  });
});
