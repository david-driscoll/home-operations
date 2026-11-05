/**
 * node --test stacks/netbird/selfAccess.test.ts
 *
 * The per-user `self-` groups. A resource name that changed with the user's
 * name would replace their group on a rename; two users sharing a group would
 * see each other's devices.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selfAccessPlan, userKey } from "./selfAccess.ts";

describe("selfAccessPlan", () => {
  it("gives each human user a group named after them, and leaves service users and the owner out", () => {
    const plan = selfAccessPlan([
      { id: "u-alice", name: "Alice Example", email: "alice@example.org", role: "admin" },
      { id: "u-automation", name: "automation", is_service_user: true, role: "admin" },
      { id: "u-owner", name: "Break Glass", role: "owner" },
    ]);
    assert.deepEqual(plan, [{ userId: "u-alice", resourceName: `self-${userKey("u-alice")}`, groupName: "self-alice-example" }]);
  });

  it("keys the resource on the user id, so a rename only renames the group", () => {
    const before = selfAccessPlan([{ id: "u-1", name: "Alice" }]);
    const after = selfAccessPlan([{ id: "u-1", name: "Alice B" }]);
    assert.equal(before[0].resourceName, after[0].resourceName);
    assert.notEqual(before[0].groupName, after[0].groupName);
  });

  it("falls back to the email's local part, then to the key", () => {
    const plan = selfAccessPlan([
      { id: "u-1", name: "", email: "Bob.Smith@example.org" },
      { id: "u-2", name: null, email: null },
    ]);
    assert.deepEqual(
      plan.map(entry => entry.groupName),
      ["self-bob-smith", `self-${userKey("u-2", 6)}`].sort(),
    );
  });

  it("never lets two users share a group", () => {
    const plan = selfAccessPlan([
      { id: "u-1", name: "Sam" },
      { id: "u-2", name: "sam" },
      { id: "u-3", name: "Pat" },
    ]);
    const names = plan.map(entry => entry.groupName);
    assert.equal(new Set(names).size, 3);
    assert.ok(names.includes("self-pat"));
    assert.ok(names.includes(`self-sam-${userKey("u-1", 6)}`));
    assert.ok(names.includes(`self-sam-${userKey("u-2", 6)}`));
  });

  it("uses ids that are safe as Pulumi names", () => {
    const [entry] = selfAccessPlan([{ id: "CiR+/abc==", name: "x" }]);
    assert.match(entry.resourceName, /^self-[0-9a-f]{12}$/);
  });
});
