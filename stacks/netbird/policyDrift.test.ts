/**
 * node --test stacks/netbird/policyDrift.test.ts
 *
 * The drift guard (#2888): a user-facing Tailscale grant added without a
 * NetBird twin or a reasoned exemption fails here, in CI.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ACCESS_RULES } from "./policy.ts";
import { driftProblems, TAILSCALE_ONLY, userFacingGrants } from "./policyDrift.ts";

const fixture = `
  manager.setGrant(
    "member-web",
    { src: [autogroups.member, ...tagged], dst: [tag.apps], ip: [...ports.web] },
    { accept: [] },
  );
  manager.setGrant({ src: [autogroups.admin], dst: [tag.proxmox], ip: ports.ssh }, { accept: [] });
  manager.setGrant("tag-to-tag", { src: [tag.backups], dst: [tag.proxmox], ip: ports.ssh }, { accept: [] });
  manager.setGrant("family-drive", { src: [groups.friendsAndFamily], dst: [tag.sharedDrive], app: {} }, { accept: [] });
`;

describe("userFacingGrants", () => {
  it("keeps grants whose src is a user, a group or an autogroup role, keyed by name or src -> dst", () => {
    assert.deepEqual(userFacingGrants(fixture), ["member-web", "autogroups.admin -> tag.proxmox", "family-drive"]);
  });
});

describe("driftProblems", () => {
  it("flags a grant neither mirrored nor exempted", () => {
    assert.deepEqual(driftProblems(["member-web", "brand-new-grant"], [{ mirrors: ["member-web"] }], {}), [
      "Tailscale grant `brand-new-grant` has no NetBird twin in stacks/netbird/policy.ts and no TAILSCALE_ONLY entry",
    ]);
  });

  it("flags a mirror or exemption that no longer matches any grant", () => {
    assert.match(driftProblems([], [{ mirrors: ["gone"] }], { alsoGone: "reason" }).join("\n"), /`gone`.*no longer exists[\s\S]*`alsoGone`.*no longer exists/);
  });
});

describe("the live policies", () => {
  it("every user-facing grant in stacks/unifi-network/acl-manager.ts is mirrored or exempted", () => {
    const source = readFileSync(new URL("../unifi-network/acl-manager.ts", import.meta.url), "utf8");
    assert.deepEqual(driftProblems(userFacingGrants(source), ACCESS_RULES, TAILSCALE_ONLY), []);
  });
});
