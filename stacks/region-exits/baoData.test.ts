/**
 * node --test stacks/region-exits/baoData.test.ts
 *
 * The OpenBao payload at `third-party-tokens/mullvad/region-exits`. Its
 * property names are read by the region exits' ExternalSecret
 * (kubernetes/apps/region-exits), which spells them by hand.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REGION_EXITS, regionExitBaoData } from "./baoData.ts";

describe("regionExitBaoData", () => {
  it("writes <name>_private_key and <name>_address per region exit, and conceals only the keys", () => {
    const payload = regionExitBaoData([
      { name: "spitfire", privateKey: "priv-s", address: "10.64.1.2/32" },
      { name: "soarin", privateKey: "priv-o", address: "10.64.1.3/32" },
    ]);
    assert.deepEqual(payload.data, {
      spitfire_private_key: "priv-s",
      spitfire_address: "10.64.1.2/32",
      soarin_private_key: "priv-o",
      soarin_address: "10.64.1.3/32",
    });
    assert.deepEqual(payload.concealedFields, ["spitfire_private_key", "soarin_private_key"]);
  });

  it("starts with spitfire only (P1 of docs/plans/region-exits.md)", () => {
    assert.deepEqual([...REGION_EXITS], ["spitfire"]);
  });
});
