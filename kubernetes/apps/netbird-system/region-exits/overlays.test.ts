// biome-ignore-all lint/style/useTemplate: as overlays.ts, which ships as a ConfigMap read by Flux envsubst.
/**
 * node --test kubernetes/apps/netbird-system/region-exits/overlays.test.ts
 *
 * A region exit's availability (docs/plans/region-exits.md §D4): one verdict
 * from the tunnel and the two overlays, which /status and /metrics report and
 * the region picker app shows. How the overlays are read is covered through the
 * handler in picker.test.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { availabilityOf } from "./overlays.ts";

describe("availabilityOf", () => {
  it("is online with the tunnel up and both overlays connected", () => {
    assert.deepEqual(availabilityOf(true, { tailscale: true, netbird: true }), { state: "online" });
  });

  it("is degraded, offline on NetBird, while only Tailscale is connected (as after a restart, §F)", () => {
    assert.deepEqual(availabilityOf(true, { tailscale: true, netbird: false }), { state: "degraded", offlineOn: "netbird" });
  });

  it("is degraded, offline on Tailscale, while only NetBird is connected", () => {
    assert.deepEqual(availabilityOf(true, { tailscale: false, netbird: true }), { state: "degraded", offlineOn: "tailscale" });
  });

  it("is offline on both overlays when neither is connected", () => {
    assert.deepEqual(availabilityOf(true, { tailscale: false, netbird: false }), { state: "offline", reason: "overlays" });
  });

  it("is offline for the tunnel whenever it is down, whatever the overlays say: nothing leaves", () => {
    assert.deepEqual(availabilityOf(false, { tailscale: true, netbird: true }), { state: "offline", reason: "tunnel" });
    assert.deepEqual(availabilityOf(false, { tailscale: true, netbird: false }), { state: "offline", reason: "tunnel" });
    assert.deepEqual(availabilityOf(false, { tailscale: false, netbird: false }), { state: "offline", reason: "tunnel" });
  });
});
