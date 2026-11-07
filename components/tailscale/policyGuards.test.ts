/**
 * node --test components/tailscale/policyGuards.test.ts
 *
 * assertGrantPath is what stops stacks/unifi-network from writing a tailnet
 * policy that cuts the cluster off from the garage-s3 VIP -- the path Pulumi
 * state is reached through. The cases are the ways that path could be lost
 * without anyone deleting the grant by name.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertExitNodeAccess, assertGrantPath, canUseExitNode, missingGrantPorts } from "./policyGuards.ts";

const policy = (grants: object[]) => `{
  // HuJSON, as the live policy is
  "grants": ${JSON.stringify(grants)},
}`;

const vip = { src: ["tag:egress"], dst: ["tag:dockge"], ip: ["tcp:443"] };

describe("missingGrantPorts", () => {
  it("passes when a grant opens the path", () => {
    assert.deepEqual(missingGrantPorts(policy([vip]), "tag:egress", "tag:dockge", ["tcp:443"]), []);
  });

  it("passes when the path is part of a wider grant", () => {
    const wide = { src: ["autogroup:member", "tag:egress"], dst: ["tag:apps", "tag:dockge"], ip: ["tcp:80", "tcp:443"] };
    assert.deepEqual(missingGrantPorts(policy([wide]), "tag:egress", "tag:dockge", ["tcp:443"]), []);
  });

  it("treats ip * as every port", () => {
    assert.deepEqual(missingGrantPorts(policy([{ ...vip, ip: ["*"] }]), "tag:egress", "tag:dockge", ["tcp:443"]), []);
  });

  it("flags a policy with no such grant", () => {
    assert.deepEqual(missingGrantPorts(policy([]), "tag:egress", "tag:dockge", ["tcp:443"]), ["tcp:443"]);
  });

  it("flags the grant narrowed to another port", () => {
    assert.deepEqual(missingGrantPorts(policy([{ ...vip, ip: ["tcp:3900"] }]), "tag:egress", "tag:dockge", ["tcp:443"]), ["tcp:443"]);
  });

  it("flags the grant moved to another source or destination", () => {
    const wrong = [
      { ...vip, src: ["tag:ingress"] },
      { ...vip, dst: ["tag:apps"] },
    ];
    assert.deepEqual(missingGrantPorts(policy(wrong), "tag:egress", "tag:dockge", ["tcp:443"]), ["tcp:443"]);
  });

  it("tolerates a policy with no grants section", () => {
    assert.deepEqual(missingGrantPorts("{}", "tag:egress", "tag:dockge", ["tcp:443"]), ["tcp:443"]);
  });
});

describe("assertGrantPath", () => {
  it("returns quietly when the path is granted", () => {
    assertGrantPath(policy([vip]), "tag:egress", "tag:dockge", ["tcp:443"], "state lives there.");
  });

  it("throws, naming the path and the reason, when it is not", () => {
    assert.throws(() => assertGrantPath(policy([]), "tag:egress", "tag:dockge", ["tcp:443"], "state lives there."), /tag:egress -> tag:dockge tcp:443\. state lives there\. Refusing/);
  });
});

// Exit-node use is a grant to autogroup:internet. `via` narrows it to exit nodes
// carrying one of the listed tags; with no `via` any exit node will do. Grants
// are a union, so one grant without `via` reopens every exit node.
describe("canUseExitNode", () => {
  const fnfUser = ["autogroup:member", "group:fnf"];
  const otherMember = ["autogroup:member"];
  const memberExit = { src: ["autogroup:member"], dst: ["autogroup:internet"], ip: ["*"], via: ["tag:exit-node"] };
  const regionExit = { src: ["group:fnf", "autogroup:admin"], dst: ["autogroup:internet"], ip: ["*"], via: ["tag:region-exit"] };

  it("lets a grant without via use any exit node", () => {
    const open = { src: ["autogroup:member"], dst: ["autogroup:internet"], ip: ["*"] };
    assert.equal(canUseExitNode(policy([open]), otherMember, ["tag:region-exit"]), true);
  });

  it("limits a via grant to exit nodes carrying one of its tags", () => {
    assert.equal(canUseExitNode(policy([memberExit]), otherMember, ["tag:exit-node", "tag:proxmox"]), true);
    assert.equal(canUseExitNode(policy([memberExit]), otherMember, ["tag:region-exit"]), false);
  });

  it("unions grants, so friends and family reach both kinds and other members only one", () => {
    const both = policy([memberExit, regionExit]);
    assert.equal(canUseExitNode(both, fnfUser, ["tag:region-exit"]), true);
    assert.equal(canUseExitNode(both, fnfUser, ["tag:exit-node"]), true);
    assert.equal(canUseExitNode(both, otherMember, ["tag:region-exit"]), false);
  });

  it("ignores grants to anything but autogroup:internet", () => {
    const toTag = { src: ["autogroup:member"], dst: ["tag:region-exit"], ip: ["*"] };
    assert.equal(canUseExitNode(policy([toTag]), otherMember, ["tag:region-exit"]), false);
  });

  it("treats an empty via as no restriction, as Tailscale does", () => {
    assert.equal(canUseExitNode(policy([{ ...memberExit, via: [] }]), otherMember, ["tag:region-exit"]), true);
  });
});

describe("assertExitNodeAccess", () => {
  const regionExit = { src: ["group:fnf"], dst: ["autogroup:internet"], ip: ["*"], via: ["tag:region-exit"] };

  it("returns quietly when access matches what is expected", () => {
    assertExitNodeAccess(policy([regionExit]), "friends and family", ["group:fnf"], ["tag:region-exit"], true, "why.");
    assertExitNodeAccess(policy([regionExit]), "other members", ["autogroup:member"], ["tag:region-exit"], false, "why.");
  });

  it("throws, naming who and which exit node, when access is missing or leaks", () => {
    assert.throws(
      () => assertExitNodeAccess(policy([]), "friends and family", ["group:fnf"], ["tag:region-exit"], true, "why."),
      /friends and family can no longer use an exit node tagged tag:region-exit\. why\. Refusing/,
    );
    assert.throws(
      () => assertExitNodeAccess(policy([regionExit]), "friends and family", ["group:fnf"], ["tag:region-exit"], false, "why."),
      /friends and family can use an exit node tagged tag:region-exit\. why\. Refusing/,
    );
  });
});
