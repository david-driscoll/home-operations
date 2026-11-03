/**
 * node --test stacks/netbird/sites.test.ts
 *
 * Which gateway hosts route which site LAN (#2887). A host listed under two
 * sites would advertise a LAN it is not on; overlapping CIDRs would make two
 * sites race for the same addresses.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routedSites, siteProblems } from "./sites.ts";

describe("siteProblems", () => {
  it("accepts the estate today: every gateway on the home LAN", () => {
    assert.deepEqual(siteProblems({ home: { cidrs: ["10.10.0.0/16"], gateways: ["alpha-site", "celestia"] }, ocracoke: { cidrs: ["192.168.1.0/24"], gateways: [] } }, ["alpha-site", "celestia"]), []);
  });

  it("rejects a host routing two sites", () => {
    const problems = siteProblems({ home: { cidrs: ["10.10.0.0/16"], gateways: ["skystar"] }, ocracoke: { cidrs: ["192.168.1.0/24"], gateways: ["skystar"] } }, ["skystar"]);
    assert.match(problems.join(), /skystar routes both home and ocracoke/);
  });

  it("rejects a gateway with no setup key", () => {
    assert.match(siteProblems({ home: { cidrs: ["10.10.0.0/16"], gateways: ["nowhere"] } }, ["celestia"]).join(), /nowhere has no gateway setup key/);
  });

  it("rejects overlapping site CIDRs", () => {
    const problems = siteProblems({ home: { cidrs: ["10.10.0.0/16"], gateways: [] }, lab: { cidrs: ["10.10.5.0/24"], gateways: [] } }, []);
    assert.match(problems.join(), /home 10\.10\.0\.0\/16 overlaps lab 10\.10\.5\.0\/24/);
  });
});

describe("routedSites", () => {
  it("skips a site nobody is routing, rather than creating a router with no peers", () => {
    assert.deepEqual(
      routedSites({ home: { cidrs: ["10.10.0.0/16"], gateways: ["celestia"] }, ocracoke: { cidrs: ["192.168.1.0/24"], gateways: [] } }).map(([name]) => name),
      ["home"],
    );
  });
});
