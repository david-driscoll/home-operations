/**
 * node --test stacks/netbird/policy.test.ts
 *
 * The client-access policy (#2888): who reaches what over NetBird. Expected
 * answers come from the Tailscale user grants this mirrors
 * (stacks/unifi-network/acl-manager.ts), not from the rules themselves.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCESS_RULES, allows, resolveGroups } from "./policy.ts";

const can = (who: string, port: number, protocol: "tcp" | "udp" = "tcp") => allows(ACCESS_RULES, who, "lan-home", protocol, port);

describe("client access to the home LAN", () => {
  it("lets every user group open web apps and resolve names", () => {
    for (const group of ["admins", "family", "friends", "media-managers"]) {
      assert.ok(can(group, 443), `${group} 443`);
      assert.ok(can(group, 80), `${group} 80`);
      assert.ok(can(group, 53, "udp"), `${group} dns/udp`);
      assert.ok(can(group, 53), `${group} dns/tcp`);
    }
  });

  it("keeps shells and admin UIs to admins (member-home-subnet-access is web + DNS only)", () => {
    for (const group of ["family", "friends", "media-managers"]) {
      assert.ok(!can(group, 22), `${group} ssh`);
      assert.ok(!can(group, 8006), `${group} proxmox`);
    }
    assert.ok(can("admins", 22));
    assert.ok(can("admins", 8006));
  });

  it("gives Apple TVs media (HTTPS) and DNS, nothing else", () => {
    assert.ok(can("apple-tv", 443));
    assert.ok(can("apple-tv", 53, "udp"));
    assert.ok(!can("apple-tv", 80));
    assert.ok(!can("apple-tv", 22));
  });

  it("gives an unknown group nothing", () => {
    assert.ok(!can("strangers", 443));
  });
});

describe("resolveGroups", () => {
  const live = [
    { id: "j1", name: "family", issued: "jwt" },
    { id: "a1", name: "apple-tv", issued: "api" },
    { id: "a2", name: "admins", issued: "api" },
  ];

  it("takes Authentik groups only as JWT sync made them, and device groups as stacks/netbird made them", () => {
    const { ids } = resolveGroups(live, ["family", "apple-tv"], ["apple-tv"]);
    assert.deepEqual(ids, { family: "j1", "apple-tv": "a1" });
  });

  it("reports a user group nobody in it has logged in with yet", () => {
    assert.deepEqual(resolveGroups(live, ["friends"], []).missing, ["friends"]);
  });

  it("refuses a same-named API group: JWT sync never adds users to it", () => {
    const { ids, conflicts } = resolveGroups(live, ["admins"], []);
    assert.deepEqual(ids, {});
    assert.deepEqual(conflicts, ["admins"]);
  });
});
