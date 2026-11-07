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
import * as parser from "jsonc-parser";
import { assertExitNodeAccess, assertGrantPath, canUseExitNode, missingGrantPorts, ordinaryExitNodeTags, pruneUndefinedTags } from "./policyGuards.ts";

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
  const familyUser = ["autogroup:member", "group:family"];
  const friendUser = ["autogroup:member", "group:fnf"];
  const otherMember = ["autogroup:member"];
  const memberExit = { src: ["autogroup:member"], dst: ["autogroup:internet"], ip: ["*"], via: ["tag:exit-node"] };
  const regionExit = { src: ["group:family", "autogroup:admin"], dst: ["autogroup:internet"], ip: ["*"], via: ["tag:region-exit"] };

  it("lets a grant without via use any exit node", () => {
    const open = { src: ["autogroup:member"], dst: ["autogroup:internet"], ip: ["*"] };
    assert.equal(canUseExitNode(policy([open]), otherMember, ["tag:region-exit"]), true);
  });

  it("limits a via grant to exit nodes carrying one of its tags", () => {
    assert.equal(canUseExitNode(policy([memberExit]), otherMember, ["tag:exit-node", "tag:proxmox"]), true);
    assert.equal(canUseExitNode(policy([memberExit]), otherMember, ["tag:region-exit"]), false);
  });

  it("unions grants, so family reach both kinds and friends and other members only one", () => {
    const both = policy([memberExit, regionExit]);
    assert.equal(canUseExitNode(both, familyUser, ["tag:region-exit"]), true);
    assert.equal(canUseExitNode(both, familyUser, ["tag:exit-node"]), true);
    assert.equal(canUseExitNode(both, friendUser, ["tag:region-exit"]), false);
    assert.equal(canUseExitNode(both, friendUser, ["tag:exit-node"]), true);
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
  const regionExit = { src: ["group:family"], dst: ["autogroup:internet"], ip: ["*"], via: ["tag:region-exit"] };

  it("returns quietly when access matches what is expected", () => {
    assertExitNodeAccess(policy([regionExit]), "family", ["group:family"], ["tag:region-exit"], true, "why.");
    assertExitNodeAccess(policy([regionExit]), "other members", ["autogroup:member"], ["tag:region-exit"], false, "why.");
  });

  it("throws, naming who and which exit node, when access is missing or leaks", () => {
    assert.throws(() => assertExitNodeAccess(policy([]), "family", ["group:family"], ["tag:region-exit"], true, "why."), /family can no longer use an exit node tagged tag:region-exit\. why\. Refusing/);
    assert.throws(() => assertExitNodeAccess(policy([regionExit]), "family", ["group:family"], ["tag:region-exit"], false, "why."), /family can use an exit node tagged tag:region-exit\. why\. Refusing/);
  });
});

// The `via` of every ordinary internet grant: the tags autoApprovers.exitNode
// approves, minus tag:region-exit, led by tag:exit-node itself.
describe("ordinaryExitNodeTags", () => {
  it("keeps the approved tags, drops the excluded ones and leads with the exit-node tag", () => {
    assert.deepEqual(ordinaryExitNodeTags("tag:exit-node", ["tag:proxmox", "tag:region-exit", "tag:equestria"], ["tag:region-exit"]), ["tag:exit-node", "tag:proxmox", "tag:equestria"]);
  });

  it("ignores approvers that are not tags, and duplicates", () => {
    assert.deepEqual(ordinaryExitNodeTags("tag:exit-node", ["autogroup:admin", "tag:exit-node", "tag:proxmox", "tag:proxmox"], []), ["tag:exit-node", "tag:proxmox"]);
  });

  it("keeps a tagged host's internet grant off the region exits once it carries that via", () => {
    const via = ordinaryExitNodeTags("tag:exit-node", ["tag:proxmox", "tag:region-exit"], ["tag:region-exit"]);
    const proxmoxInternet = { src: ["tag:proxmox"], dst: ["autogroup:internet"], ip: ["*"], via };
    assert.equal(canUseExitNode(policy([proxmoxInternet]), ["tag:proxmox"], ["tag:region-exit"]), false);
    assert.equal(canUseExitNode(policy([proxmoxInternet]), ["tag:proxmox"], ["tag:exit-node"]), true);
  });
});

describe("pruneUndefinedTags", () => {
  // The shape tag:sgc left behind: tagOwners rebuilt without it, every
  // approver list and `via` still carried over from the live policy.
  const retired = (extra: object = {}) =>
    `{
  // HuJSON, as the live policy is
  "tagOwners": { "tag:equestria": [], "tag:proxmox": [], "tag:exit-node": [] },
  "autoApprovers": {
    "exitNode": ["tag:proxmox", "tag:sgc", "tag:equestria"],
    "routes": {
      "10.10.0.0/16": ["tag:equestria", "tag:sgc", "group:admins"],
      "10.209.0.0/16": ["tag:sgc"],
    },
    "services": { "svc:loki": ["tag:sgc", "tag:equestria"], "svc:gone": ["tag:sgc"] },
  },
  "grants": [{ "src": ["autogroup:member"], "dst": ["autogroup:internet"], "ip": ["*"], "via": ["tag:exit-node", "tag:sgc"] }],
  ${Object.entries(extra)
    .map(([k, v]) => `"${k}": ${JSON.stringify(v)},`)
    .join("\n")}
}`;
  const parse = (json: string) => parser.parse(json, [], { allowTrailingComma: true });

  it("drops a retired tag from every approver list and via", () => {
    const pruned = parse(pruneUndefinedTags(retired()));
    assert.deepEqual(pruned.autoApprovers.exitNode, ["tag:proxmox", "tag:equestria"]);
    assert.deepEqual(pruned.autoApprovers.routes["10.10.0.0/16"], ["tag:equestria", "group:admins"]);
    assert.deepEqual(pruned.autoApprovers.services["svc:loki"], ["tag:equestria"]);
    assert.deepEqual(pruned.grants[0].via, ["tag:exit-node"]);
  });

  it("removes a route or service that nothing approves any more", () => {
    const pruned = parse(pruneUndefinedTags(retired()));
    assert.equal("10.209.0.0/16" in pruned.autoApprovers.routes, false);
    assert.equal("svc:gone" in pruned.autoApprovers.services, false);
  });

  it("keeps groups, users and autogroups, which are not tags", () => {
    const pruned = parse(pruneUndefinedTags(retired()));
    assert.ok(pruned.autoApprovers.routes["10.10.0.0/16"].includes("group:admins"));
  });

  it("leaves a policy whose tags are all defined byte-for-byte unchanged", () => {
    const clean = `{
  "tagOwners": { "tag:equestria": [] },
  "autoApprovers": { "exitNode": ["tag:equestria"], "routes": { "10.10.0.0/16": ["tag:equestria"] } },
}`;
    assert.equal(pruneUndefinedTags(clean), clean);
  });

  it("leaves a policy with no tagOwners alone instead of pruning every tag", () => {
    const noOwners = `{ "autoApprovers": { "exitNode": ["tag:equestria"] } }`;
    assert.equal(pruneUndefinedTags(noOwners), noOwners);
  });

  it("refuses to empty a via, which would open every exit node", () => {
    const onlyRetired = `{
  "tagOwners": { "tag:equestria": [] },
  "grants": [{ "src": ["autogroup:member"], "dst": ["autogroup:internet"], "ip": ["*"], "via": ["tag:sgc"] }],
}`;
    assert.throws(() => pruneUndefinedTags(onlyRetired), /open every exit node/);
  });
});
