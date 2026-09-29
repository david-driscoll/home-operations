/**
 * npx tsx --test components/tailscale/policyGuards.test.ts
 *
 * assertGrantPath is what stops stacks/unifi-network from writing a tailnet
 * policy that cuts the cluster off from the garage-s3 VIP -- the path Pulumi
 * state is reached through. The cases are the ways that path could be lost
 * without anyone deleting the grant by name.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertGrantPath, missingGrantPorts } from "./policyGuards.ts";

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
