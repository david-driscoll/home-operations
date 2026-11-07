/**
 * node --test stacks/unifi-network/region-exit-access.test.ts
 *
 * Who may use a Tailscale region exit (docs/plans/region-exits.md §A, decided
 * 2026-11-07): group:family and admins. Friends who are only in group:fnf, plain
 * members and every tag may not. NetBird keeps the wider audience (family,
 * friends and admins), see stacks/netbird/regionExits.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Tailscale } from "../../components/constants.ts";
import { assertRegionExitAccess } from "./region-exit-access.ts";

const { tag } = Tailscale;

const policy = (grants: object[]) => `{
  // HuJSON, as the live policy is
  "grants": ${JSON.stringify(grants)},
}`;

const ordinary = { via: ["tag:exit-node"], dst: ["autogroup:internet"], ip: ["*"] };
const memberExit = { ...ordinary, src: ["autogroup:member"] };
const taggedExit = { ...ordinary, src: Object.values(tag).filter(t => t !== tag.regionExit) };
const regionExit = (src: string[]) => ({ src, dst: ["autogroup:internet"], ip: ["*"], via: ["tag:region-exit"] });

describe("assertRegionExitAccess", () => {
  it("accepts a region-exit grant to group:family and admins", () => {
    assertRegionExitAccess(policy([memberExit, taggedExit, regionExit(["group:family", "autogroup:admin"])]));
  });

  it("refuses a grant that still lets friends-only users (group:fnf) in", () => {
    assert.throws(() => assertRegionExitAccess(policy([memberExit, taggedExit, regionExit(["group:fnf", "group:family", "autogroup:admin"])])), /friends.*can use an exit node tagged tag:region-exit/);
  });

  it("refuses a grant that leaves family out", () => {
    assert.throws(() => assertRegionExitAccess(policy([memberExit, taggedExit, regionExit(["autogroup:admin"])])), /family can no longer use an exit node tagged tag:region-exit/);
  });

  it("refuses a grant that leaves admins out", () => {
    assert.throws(() => assertRegionExitAccess(policy([memberExit, taggedExit, regionExit(["group:family"])])), /admins can no longer use an exit node tagged tag:region-exit/);
  });

  it("refuses a grant that opens region exits to every member", () => {
    assert.throws(() => assertRegionExitAccess(policy([memberExit, taggedExit, regionExit(["autogroup:member"])])), /can use an exit node tagged tag:region-exit/);
  });

  it("refuses a tag that reaches a region exit", () => {
    const open = { src: ["tag:k8s"], dst: ["autogroup:internet"], ip: ["*"] };
    assert.throws(() => assertRegionExitAccess(policy([memberExit, taggedExit, open, regionExit(["group:family", "autogroup:admin"])])), /tag:k8s can use an exit node tagged tag:region-exit/);
  });
});
