/**
 * Who may use a region exit on Tailscale, checked on the policy about to be
 * written, as assertGrantPath checks the paths Pulumi itself depends on.
 * Pure (no Pulumi, no generated SDK), so region-exit-access.test.ts runs it.
 *
 * Tailscale's audience is group:family and admins (decided 2026-11-07,
 * docs/plans/region-exits.md §A). NetBird's is wider -- family, friends and
 * admins (stacks/netbird/regionExits.ts) -- so a friend reaches a region exit
 * only over NetBird.
 *
 * Principals are the selectors a device matches: a family user is a member in
 * group:family, a friend a member in group:fnf, any other user only a member.
 */

import { kubernetesClusters, Tailscale } from "../../components/constants.ts";
import { assertExitNodeAccess } from "../../components/tailscale/policyGuards.ts";

const { autogroups, groups, tag } = Tailscale;

export function assertRegionExitAccess(json: string): void {
  const regionExit = [tag.regionExit];
  const why = "Region exits on Tailscale are for family and admins only (docs/plans/region-exits.md §A) -- check the `region-exit` and `member-exit-node` grants.";
  assertExitNodeAccess(json, "family", [autogroups.member, groups.family], regionExit, true, why);
  assertExitNodeAccess(json, "admins", [autogroups.member, autogroups.admin], regionExit, true, why);
  assertExitNodeAccess(json, "friends (group:fnf only)", [autogroups.member, groups.friendsAndFamily], regionExit, false, why);
  assertExitNodeAccess(json, "other members", [autogroups.member], regionExit, false, why);
  assertExitNodeAccess(json, "members", [autogroups.member], [tag.exitNode], true, "Members lost the ordinary exit nodes -- restore `member-exit-node` and its `via`.");
  // No tagged host reaches a region exit: every tag's internet grant carries
  // the ordinary exit nodes as its `via`.
  for (const t of Object.values(tag).filter(t => t !== tag.regionExit)) {
    assertExitNodeAccess(json, t, [t], regionExit, false, "Only people may use a region exit -- give that tag's autogroup:internet grant `via: ordinaryExitNodes(manager)`.");
  }
  // ...and the hosts that use an ordinary exit node still can.
  for (const t of [tag.proxmox, tag.dockge, tag.backups, ...kubernetesClusters.map(c => c.tag)]) {
    assertExitNodeAccess(json, t, [t], [tag.exitNode], true, "That tag lost its internet grant -- restore it with `via: ordinaryExitNodes(manager)`.");
  }
}
