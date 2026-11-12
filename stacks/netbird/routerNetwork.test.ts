/**
 * node --test stacks/netbird/routerNetwork.test.ts
 *
 * Which live network the Equestria entry's router and resources go in (#3163):
 * the one the operator's NetworkRouter CR creates, found by its name.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { OPERATOR_NETWORK_NAME, operatorNetworkId } from "./routerNetwork.ts";

describe("operatorNetworkId", () => {
  it("picks the network named after the operator's NetworkRouter", () => {
    const networks = [
      { id: "n-lan", name: "lan-home" },
      { id: "n-op", name: "equestria-routers" },
    ];
    assert.equal(operatorNetworkId(networks), "n-op");
  });

  it("refuses to guess between two networks of that name", () => {
    const networks = [
      { id: "n-op", name: "equestria-routers" },
      { id: "n-copy", name: "equestria-routers" },
    ];
    assert.throws(() => operatorNetworkId(networks), /2 networks named equestria-routers/);
  });

  it("is undefined before the operator has created its network (a fresh estate)", () => {
    assert.equal(operatorNetworkId([{ id: "n-lan", name: "lan-home" }]), undefined);
  });
});

describe("OPERATOR_NETWORK_NAME", () => {
  it("is the NetworkRouter CR's name, which the operator names its network after", () => {
    const cr = parse(readFileSync(new URL("../../kubernetes/apps/netbird-system/router/networkrouter.yaml", import.meta.url), "utf8"));
    assert.equal(cr.kind, "NetworkRouter");
    assert.equal(OPERATOR_NETWORK_NAME, cr.metadata.name);
  });
});
