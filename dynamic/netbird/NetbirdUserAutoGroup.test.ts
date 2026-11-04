/**
 * node --test dynamic/netbird/NetbirdUserAutoGroup.test.ts
 *
 * The update that adds or removes one auto group. Dropping another group, or
 * resetting the role, would silently move a person out of their access.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoGroupUpdate } from "./NetbirdUserAutoGroup.ts";

const user = { id: "u-1", role: "admin", auto_groups: ["g-admins"], is_blocked: false };

describe("autoGroupUpdate", () => {
  it("adds the group and keeps the rest of the user as it was", () => {
    assert.deepEqual(autoGroupUpdate(user, "g-self", true), { role: "admin", auto_groups: ["g-admins", "g-self"], is_blocked: false });
  });

  it("removes only its own group", () => {
    assert.deepEqual(autoGroupUpdate({ ...user, auto_groups: ["g-admins", "g-self"] }, "g-self", false), { role: "admin", auto_groups: ["g-admins"], is_blocked: false });
  });

  it("sends nothing when the user already matches", () => {
    assert.equal(autoGroupUpdate({ ...user, auto_groups: ["g-admins", "g-self"] }, "g-self", true), undefined);
    assert.equal(autoGroupUpdate(user, "g-self", false), undefined);
  });

  it("treats missing fields as empty and unblocked", () => {
    assert.deepEqual(autoGroupUpdate({ id: "u-2", role: "user", auto_groups: null, is_blocked: null }, "g-self", true), { role: "user", auto_groups: ["g-self"], is_blocked: false });
  });

  it("keeps a blocked user blocked", () => {
    assert.equal(autoGroupUpdate({ ...user, is_blocked: true }, "g-self", true)?.is_blocked, true);
  });
});
