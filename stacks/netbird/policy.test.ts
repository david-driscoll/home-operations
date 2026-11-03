/**
 * node --test stacks/netbird/policy.test.ts
 *
 * The client-access policy (#2888): who reaches what over NetBird. Expected
 * answers come from the Tailscale user grants this mirrors
 * (stacks/unifi-network/acl-manager.ts), not from the rules themselves.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCESS_RULES, allows, homeResourceGroups, resolveGroups } from "./policy.ts";

const can = (who: string, destination: string, port: number, protocol: "tcp" | "udp" | "icmp" = "tcp") => allows(ACCESS_RULES, who, destination, protocol, port);
const USER_GROUPS = ["admins", "family", "friends", "media-managers"];

describe("client access, mirroring member-home-subnet-access", () => {
  it("lets every user group reach the web endpoints on Tailscale's web ports", () => {
    for (const group of USER_GROUPS) {
      for (const port of [80, 443, 8443, 7687]) assert.ok(can(group, "home-web", port), `${group} ${port}`);
      assert.ok(can(group, "home-web", 443, "udp"), `${group} http/3`);
    }
  });

  it("lets every user group and the Apple TVs resolve names on Technitium", () => {
    for (const group of [...USER_GROUPS, "apple-tv"]) {
      assert.ok(can(group, "home-dns", 53, "udp"), group);
      assert.ok(can(group, "home-dns", 53), group);
    }
  });

  it("gives non-admins nothing on the wider LAN: only the listed endpoints", () => {
    for (const group of ["family", "friends", "media-managers", "apple-tv"]) {
      assert.ok(!can(group, "lan-home", 443), `${group} lan 443`);
      assert.ok(!can(group, "home-web", 22), `${group} ssh`);
    }
    assert.ok(can("admins", "lan-home", 22));
    assert.ok(can("admins", "lan-home", 8006));
  });

  it("limits Apple TVs to HTTPS on the cluster's gateways (media)", () => {
    assert.ok(can("apple-tv", "home-media", 443));
    assert.ok(!can("apple-tv", "home-web", 443));
    assert.ok(!can("apple-tv", "home-media", 80));
  });

  it("connects users to the gateways for exit nodes, and nothing more (member-exit-node)", () => {
    for (const group of USER_GROUPS) assert.ok(can(group, "gateways", 0, "icmp"), group);
    assert.ok(!can("family", "gateways", 22));
    assert.ok(!can("apple-tv", "gateways", 0, "icmp"));
  });

  it("gives an unknown group nothing", () => {
    assert.ok(!can("strangers", "home-web", 443));
  });
});

describe("homeResourceGroups", () => {
  it("puts each address in one resource with every group it belongs to", () => {
    const groups = homeResourceGroups({ clusterIps: ["10.10.206.100"], hostIps: ["10.10.18.4", "10.10.10.9"], authentikVip: "10.10.255.10", dnsIps: ["10.10.10.9"] });
    assert.deepEqual(groups, {
      "10.10.206.100": ["home-media", "home-web"],
      "10.10.18.4": ["home-web"],
      "10.10.10.9": ["home-dns", "home-web"],
      "10.10.255.10": ["home-web"],
    });
  });
});

describe("resolveGroups", () => {
  const live = [
    { id: "j1", name: "family", issued: "jwt" },
    { id: "a2", name: "admins", issued: "api" },
  ];

  it("takes Authentik groups only as JWT sync made them", () => {
    assert.deepEqual(resolveGroups(live, ["family"]).ids, { family: "j1" });
  });

  it("reports a user group nobody in it has logged in with yet", () => {
    assert.deepEqual(resolveGroups(live, ["friends"]).missing, ["friends"]);
  });

  it("refuses a same-named API group: JWT sync never adds users to it", () => {
    const { ids, conflicts } = resolveGroups(live, ["admins"]);
    assert.deepEqual(ids, {});
    assert.deepEqual(conflicts, ["admins"]);
  });
});

describe("client access through the Equestria entry (#2889)", () => {
  const via = (who: string, port: number) => allows(ACCESS_RULES, who, "equestria-entry", "tcp", port);

  it("gives the same web access as the LAN path, so a down home gateway changes nothing", () => {
    for (const group of ["admins", "family", "friends", "media-managers"]) assert.ok(via(group, 443), group);
    assert.ok(via("apple-tv", 443));
  });

  it("is web only: the entry is two /32s, the Gateway and the Authentik VIP", () => {
    assert.ok(!via("admins", 22));
    assert.ok(!via("apple-tv", 80));
  });
});
