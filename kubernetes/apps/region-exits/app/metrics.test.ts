// biome-ignore-all lint/style/useTemplate: as picker.ts, which ships as a ConfigMap read by Flux envsubst.
/**
 * node --test kubernetes/apps/region-exits/app/metrics.test.ts
 *
 * What a region exit's /metrics says for a given status: the series the
 * PrometheusRule (prometheusrule.yaml) alerts on.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderMetrics } from "./metrics.ts";
import type { Status } from "./picker.ts";

const healthy: Status = {
  name: "spitfire",
  region: { country: "USA", city: "Dallas TX" },
  tunnel: { up: true, status: "running" },
  egress: { country: "United States", city: "Dallas", ip: "198.51.100.7" },
  // Unreadable conntrack, so the samples below need not repeat the gauge.
  activeClients: null,
  overlays: { tailscale: true, netbird: true },
};

/** The sample lines only, without HELP and TYPE. */
const samples = (text: string) => text.split("\n").filter(line => line !== "" && !line.startsWith("#"));

describe("renderMetrics", () => {
  it("reports a healthy region exit, every series labelled with its name", () => {
    assert.deepEqual(samples(renderMetrics(healthy)), [
      'region_exit_tunnel_up{region_exit="spitfire"} 1',
      'region_exit_region_info{region_exit="spitfire",country="USA",city="Dallas TX"} 1',
      'region_exit_egress_info{region_exit="spitfire",country="United States",city="Dallas"} 1',
      'region_exit_egress_country_match{region_exit="spitfire"} 1',
      'region_exit_overlay_connected{region_exit="spitfire",overlay="tailscale"} 1',
      'region_exit_overlay_connected{region_exit="spitfire",overlay="netbird"} 1',
    ]);
  });

  it("declares each metric once as a gauge, and ends with a newline", () => {
    const text = renderMetrics(healthy);
    assert.match(text, /# TYPE region_exit_tunnel_up gauge\n/);
    assert.match(text, /# HELP region_exit_overlay_connected /);
    assert.equal(text.match(/# TYPE region_exit_overlay_connected gauge/g)?.length, 1);
    assert.ok(text.endsWith("\n"));
  });

  it("matches Mullvad's short names to the country the egress lookup reports", () => {
    const uk: Status = { ...healthy, region: { country: "UK", city: null }, egress: { country: "United Kingdom", city: "London", ip: "198.51.100.8" } };
    assert.ok(samples(renderMetrics(uk)).includes('region_exit_egress_country_match{region_exit="spitfire"} 1'));
    const japan: Status = { ...healthy, region: { country: "Japan", city: null }, egress: { country: "Japan", city: "Tokyo", ip: "198.51.100.9" } };
    assert.ok(samples(renderMetrics(japan)).includes('region_exit_egress_country_match{region_exit="spitfire"} 1'));
  });

  it("says the egress does not match when traffic leaves from another country", () => {
    const wrong: Status = { ...healthy, egress: { country: "Germany", city: "Frankfurt", ip: "198.51.100.10" } };
    assert.ok(samples(renderMetrics(wrong)).includes('region_exit_egress_country_match{region_exit="spitfire"} 0'));
  });

  it("drops the egress series, and the match, while gluetun has no public IP; the tunnel says why", () => {
    const down: Status = { ...healthy, tunnel: { up: false, status: "stopping" }, egress: null };
    assert.deepEqual(samples(renderMetrics(down)), [
      'region_exit_tunnel_up{region_exit="spitfire"} 0',
      'region_exit_region_info{region_exit="spitfire",country="USA",city="Dallas TX"} 1',
      'region_exit_overlay_connected{region_exit="spitfire",overlay="tailscale"} 1',
      'region_exit_overlay_connected{region_exit="spitfire",overlay="netbird"} 1',
    ]);
  });

  it("reports each overlay on its own, so one being offline names that one", () => {
    const lines = samples(renderMetrics({ ...healthy, overlays: { tailscale: false, netbird: true } }));
    assert.ok(lines.includes('region_exit_overlay_connected{region_exit="spitfire",overlay="tailscale"} 0'));
    assert.ok(lines.includes('region_exit_overlay_connected{region_exit="spitfire",overlay="netbird"} 1'));
  });

  it("leaves out the city when none is picked, and escapes label values", () => {
    const odd: Status = { ...healthy, name: 'a"b', region: { country: "C\\D", city: null }, egress: null };
    const lines = samples(renderMetrics(odd));
    assert.ok(lines.includes('region_exit_tunnel_up{region_exit="a\\"b"} 1'));
    assert.ok(lines.includes('region_exit_region_info{region_exit="a\\"b",country="C\\\\D",city=""} 1'));
  });

  it("reports active clients, including none, and leaves the gauge out when conntrack cannot be read", () => {
    assert.ok(samples(renderMetrics({ ...healthy, activeClients: 3 })).includes('region_exit_active_clients{region_exit="spitfire"} 3'));
    assert.ok(samples(renderMetrics({ ...healthy, activeClients: 0 })).includes('region_exit_active_clients{region_exit="spitfire"} 0'));
    assert.ok(!samples(renderMetrics(healthy)).some(line => line.startsWith("region_exit_active_clients")));
  });
});
