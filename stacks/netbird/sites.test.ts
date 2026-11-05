/**
 * node --test stacks/netbird/sites.test.ts
 *
 * Which gateway site stacks route which site LAN (#2887, D53). A stack listed
 * under two sites would advertise a LAN it is not on; overlapping CIDRs would
 * make two sites race for the same addresses; a host in two stacks would have
 * two groups claim it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GATEWAY_SITE_STACKS, gatewayGroupPeers, gatewayHosts, routedSites, SITES, siteProblems, siteStackOf } from "./sites.ts";

const STACKS = { home: ["alpha-site", "celestia"], "gulf-of-mexico": ["luna"], ocracoke: ["skystar"] };

describe("siteProblems", () => {
  it("accepts the estate today: every gateway stack routes the home LAN", () => {
    assert.deepEqual(siteProblems(SITES, GATEWAY_SITE_STACKS), []);
    assert.deepEqual(
      routedSites(SITES).map(([name, site]) => [name, site.gatewayStacks]),
      [["home", ["home", "gulf-of-mexico", "ocracoke"]]],
    );
  });

  it("rejects a stack routing two sites", () => {
    const problems = siteProblems({ home: { cidrs: ["10.10.0.0/16"], gatewayStacks: ["ocracoke"] }, ocracoke: { cidrs: ["192.168.1.0/24"], gatewayStacks: ["ocracoke"] } }, STACKS);
    assert.match(problems.join(), /ocracoke routes both home and ocracoke/);
  });

  it("rejects a site naming a stack with no gateways", () => {
    assert.match(siteProblems({ home: { cidrs: ["10.10.0.0/16"], gatewayStacks: ["nowhere"] } }, STACKS).join(), /nowhere is not a gateway site stack/);
  });

  it("rejects a host in two site stacks, and a stack with no hosts", () => {
    const problems = siteProblems({}, { home: ["celestia"], "gulf-of-mexico": ["celestia"], ocracoke: [] }).join();
    assert.match(problems, /celestia is in both site stacks home and gulf-of-mexico/);
    assert.match(problems, /site stack ocracoke has no gateway hosts/);
  });

  it("rejects overlapping site CIDRs", () => {
    const problems = siteProblems({ home: { cidrs: ["10.10.0.0/16"], gatewayStacks: [] }, lab: { cidrs: ["10.10.5.0/24"], gatewayStacks: [] } }, STACKS);
    assert.match(problems.join(), /home 10\.10\.0\.0\/16 overlaps lab 10\.10\.5\.0\/24/);
  });
});

describe("routedSites", () => {
  it("skips a site nobody is routing, rather than creating a router with no peers", () => {
    assert.deepEqual(
      routedSites({ home: { cidrs: ["10.10.0.0/16"], gatewayStacks: ["home"] }, ocracoke: { cidrs: ["192.168.1.0/24"], gatewayStacks: [] } }).map(([name]) => name),
      ["home"],
    );
  });
});

describe("the host to site stack mapping", () => {
  it("keeps one setup key per host, each in exactly one stack", () => {
    assert.deepEqual(gatewayHosts(GATEWAY_SITE_STACKS), ["alpha-site", "celestia", "luna", "skystar"]);
    assert.equal(siteStackOf(GATEWAY_SITE_STACKS, "celestia"), "home");
    assert.equal(siteStackOf(GATEWAY_SITE_STACKS, "luna"), "gulf-of-mexico");
    assert.equal(siteStackOf(GATEWAY_SITE_STACKS, "skystar"), "ocracoke");
    assert.equal(siteStackOf(GATEWAY_SITE_STACKS, "equestria"), undefined);
  });
});

describe("gatewayGroupPeers", () => {
  const gw = (id: string, name: string, groups = ["gateways"]) => ({ id, name, groups: groups.map(group => ({ name: group })) });

  it("moves the enrolled gateway peers of the stack's hosts into its group", () => {
    const peers = [gw("p-as", "gateway-alpha-site"), gw("p-ce", "gateway-celestia"), gw("p-lu", "gateway-luna")];
    assert.deepEqual(gatewayGroupPeers(["alpha-site", "celestia"], peers, []), ["p-as", "p-ce"]);
  });

  it("leaves out a host that has not enrolled yet", () => {
    assert.deepEqual(gatewayGroupPeers(["alpha-site", "celestia"], [gw("p-ce", "gateway-celestia")], []), ["p-ce"]);
    assert.deepEqual(gatewayGroupPeers(["skystar"], [], []), []);
  });

  it("never drops a live member, so a peer its setup key just placed stays put", () => {
    assert.deepEqual(gatewayGroupPeers(["alpha-site", "celestia"], [gw("p-ce", "gateway-celestia")], ["p-new", "p-ce"]), ["p-new", "p-ce"]);
  });

  it("keeps the live order first, so an unchanged group shows no diff", () => {
    const peers = [gw("p-as", "gateway-alpha-site"), gw("p-ce", "gateway-celestia")];
    assert.deepEqual(gatewayGroupPeers(["alpha-site", "celestia"], peers, ["p-ce", "p-as"]), ["p-ce", "p-as"]);
  });

  it("ignores a device that only shares the name, outside the gateways group", () => {
    assert.deepEqual(gatewayGroupPeers(["luna"], [gw("p-phone", "gateway-luna", ["family"])], []), []);
  });
});
