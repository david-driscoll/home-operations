/**
 * node --test components/azure/edgeVm.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AZURE_EDGE_REGIONS, azureEdgeMonthlyCost, nsgInboundRules } from "./edgeVm.ts";

describe("nsgInboundRules", () => {
  const rules = nsgInboundRules({ tcp: [80, 443], udp: [443, 3478] });

  it("allows exactly the public ports, from the Internet", () => {
    assert.deepEqual(
      rules.map(r => `${r.protocol}/${r.destinationPortRange}`),
      ["Tcp/80", "Tcp/443", "Udp/443", "Udp/3478"],
    );
    for (const rule of rules) {
      assert.equal(rule.direction, "Inbound");
      assert.equal(rule.access, "Allow");
      assert.equal(rule.sourceAddressPrefix, "Internet");
    }
  });

  it("gives every rule a unique name and priority inside Azure's 100-4096 range", () => {
    assert.equal(new Set(rules.map(r => r.name)).size, rules.length);
    assert.equal(new Set(rules.map(r => r.priority)).size, rules.length);
    for (const rule of rules) assert.ok(rule.priority >= 100 && rule.priority <= 4096);
  });

  it("refuses a public 22 and nonsense ports", () => {
    assert.throws(() => nsgInboundRules({ tcp: [22], udp: [] }), /never public/);
    assert.throws(() => nsgInboundRules({ tcp: [0], udp: [] }), /not a TCP\/UDP port/);
    assert.throws(() => nsgInboundRules({ tcp: [], udp: [70000] }), /not a TCP\/UDP port/);
  });
});

describe("Azure edge regions", () => {
  it("keep their address space apart from each other, the home LAN, NetBird's overlay and OCI's VCN", () => {
    const taken = ["10.10.", "10.100.", "10.250."];
    const seen = new Set<string>();
    for (const region of Object.values(AZURE_EDGE_REGIONS)) {
      const prefix = `${region.vnetCidr.split(".").slice(0, 2).join(".")}.`;
      assert.ok(!taken.includes(prefix), `${region.vnetCidr} collides`);
      assert.ok(!seen.has(prefix), `${region.vnetCidr} is used twice`);
      seen.add(prefix);
      assert.ok(region.subnetCidr.startsWith(prefix), `${region.subnetCidr} is outside ${region.vnetCidr}`);
    }
  });

  it("fit two hosts inside the $150 Enterprise credit, not the $50 Professional one", () => {
    const both = azureEdgeMonthlyCost(["eastus2", "centralus"]);
    assert.ok(both < 150 && both > 50, `two hosts cost ${both}`);
  });
});
