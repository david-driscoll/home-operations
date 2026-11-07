/**
 * node --test stacks/netbird/policy.test.ts
 *
 * The client-access policy (#2888): who reaches what over NetBird. Expected
 * answers come from the Tailscale user grants this mirrors
 * (stacks/unifi-network/acl-manager.ts), not from the rules themselves.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCESS_RULES, allows, USER_GROUPS as CREATED_USER_GROUPS, DEVICE_GROUPS, homeResourceGroups, unresolvedSources } from "./policy.ts";

const WONDERBOLTS = ["spitfire", "soarin", "fleetfoot", "misty-fly", "high-winds"];

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

  it("lets every user group and the Apple TVs reach the Technitium sidecars on Do53 and DoT/DoQ, and nothing else there", () => {
    for (const group of [...USER_GROUPS, "apple-tv"]) {
      for (const port of [53, 853]) {
        assert.ok(can(group, "dns-servers", port, "udp"), `${group} udp ${port}`);
        assert.ok(can(group, "dns-servers", port), `${group} tcp ${port}`);
      }
      assert.ok(!can(group, "dns-servers", 5380), `${group} admin UI`);
      assert.ok(!can(group, "dns-servers", 22), `${group} ssh`);
    }
    assert.ok(!can("gateways", "dns-servers", 53, "udp"));
  });

  it("gives non-admins nothing on the wider LAN: only the listed endpoints", () => {
    for (const group of ["family", "friends", "media-managers", "apple-tv"]) {
      assert.ok(!can(group, "lan-home", 443), `${group} lan 443`);
      assert.ok(!can(group, "home-web", 22), `${group} ssh`);
    }
    assert.ok(can("admins", "lan-home", 22));
    assert.ok(can("admins", "lan-home", 8006));
  });

  it("limits Apple TVs to the cluster's gateways (media), HTTPS and the HTTP redirects", () => {
    assert.ok(can("apple-tv", "home-media", 443));
    assert.ok(can("apple-tv", "home-media", 80));
    assert.ok(!can("apple-tv", "home-web", 443));
    assert.ok(!can("apple-tv", "home-web", 80));
    assert.ok(!can("apple-tv", "home-media", 8443));
  });

  it("connects users to the gateways for exit nodes, and nothing more (member-exit-node)", () => {
    for (const group of USER_GROUPS) assert.ok(can(group, "gateways", 0, "icmp"), group);
    assert.ok(!can("family", "gateways", 22));
    assert.ok(!can("apple-tv", "gateways", 0, "icmp"));
  });

  it("connects users to the in-cluster routers for exit-home, and nothing more", () => {
    for (const group of USER_GROUPS) assert.ok(can(group, "k8s-routers", 0, "icmp"), group);
    assert.ok(!can("family", "k8s-routers", 443));
    assert.ok(!can("apple-tv", "k8s-routers", 0, "icmp"));
  });

  it("lets every user group out through an exit node, and no device group (member-exit-node)", () => {
    for (const group of USER_GROUPS) {
      assert.ok(can(group, "exit-internet", 443), group);
      assert.ok(can(group, "exit-internet", 53, "udp"), group);
    }
    assert.ok(!can("apple-tv", "exit-internet", 443));
    assert.ok(!can("gateways", "exit-internet", 443));
  });

  it("lets family, friends and admins out through a region exit, and not media-managers or devices", () => {
    for (const group of ["admins", "family", "friends"]) {
      assert.ok(can(group, "region-exit-internet", 443), group);
      assert.ok(can(group, "region-exit-internet", 53, "udp"), group);
      for (const exit of WONDERBOLTS) assert.ok(can(group, `region-exit-${exit}`, 0, "icmp"), `${group} reaches ${exit}`);
    }
    for (const who of ["media-managers", "apple-tv", "gateways"]) {
      assert.ok(!can(who, "region-exit-internet", 443), who);
      for (const exit of WONDERBOLTS) assert.ok(!can(who, `region-exit-${exit}`, 0, "icmp"), `${who} ${exit}`);
    }
    for (const exit of WONDERBOLTS) assert.ok(!can("family", `region-exit-${exit}`, 22), `only ICMP to ${exit} itself`);
  });

  it("never targets a user group, which would open users' devices to each other", () => {
    for (const rule of ACCESS_RULES) assert.ok(!USER_GROUPS.includes(rule.destination), rule.name);
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

describe("rule sources", () => {
  it("are all groups stacks/netbird creates: the four user groups and the device groups", () => {
    assert.deepEqual(unresolvedSources(ACCESS_RULES, [...CREATED_USER_GROUPS, ...DEVICE_GROUPS]), []);
  });

  it("are the same four user groups the Tailscale grants were written for", () => {
    assert.deepEqual([...CREATED_USER_GROUPS].sort(), [...USER_GROUPS].sort());
  });

  it("reports a source no created group backs, which would grant nobody", () => {
    const rules = [{ ...ACCESS_RULES[0], name: "r", sources: ["admins", "strangers"] }];
    assert.deepEqual(unresolvedSources(rules, CREATED_USER_GROUPS), ["r: strangers"]);
  });
});

describe("client access through the Equestria entry (#2889)", () => {
  const via = (who: string, port: number) => allows(ACCESS_RULES, who, "equestria-entry", "tcp", port);

  it("gives the same web access as the LAN path, so a down home gateway changes nothing", () => {
    for (const group of ["admins", "family", "friends", "media-managers"]) assert.ok(via(group, 443), group);
    assert.ok(via("apple-tv", 443));
    assert.ok(via("apple-tv", 80));
  });

  it("is web only: the entry is two /32s, the Gateway and the Authentik VIP", () => {
    assert.ok(!via("admins", 22));
    assert.ok(!via("apple-tv", 22));
  });
});
