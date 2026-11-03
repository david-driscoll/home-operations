/**
 * node --test dynamic/netbird/NetbirdDefaultPolicyRemoval.test.ts
 *
 * Which policies count as NetBird's built-in allow-all. A false positive
 * deletes a real policy; a false negative leaves every peer able to reach
 * every other (#2885).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { builtInDefaultPolicyIds } from "./NetbirdDefaultPolicyRemoval.ts";

const allToAll = { sources: [{ id: "g1", name: "All" }], destinations: [{ id: "g1", name: "All" }], bidirectional: true, action: "accept", protocol: "all" };

describe("builtInDefaultPolicyIds", () => {
  it("finds the allow-all policy NetBird creates with a new account", () => {
    const policies = [
      { id: "p-default", name: "Default", rules: [allToAll] },
      { id: "p-admins", name: "admins-to-lan", rules: [{ ...allToAll, sources: [{ id: "g2", name: "admins" }] }] },
    ];
    assert.deepEqual(builtInDefaultPolicyIds(policies), ["p-default"]);
  });

  it("leaves a policy merely named Default that does not open All to All", () => {
    const policies = [{ id: "p-x", name: "Default", rules: [{ ...allToAll, destinations: [{ id: "g3", name: "dns" }] }] }];
    assert.deepEqual(builtInDefaultPolicyIds(policies), []);
  });

  it("returns nothing once it is gone", () => {
    assert.deepEqual(builtInDefaultPolicyIds([]), []);
  });
});
