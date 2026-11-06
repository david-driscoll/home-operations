/**
 * node --test dynamic/netbird/NetbirdAccountSettingsOverrides.test.ts
 *
 * PUT /api/accounts/{id} resets every settings field the body leaves out, so
 * the overlay must send back everything it read, and change only its own four.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { overlaidSettings, settingsDrift } from "./NetbirdAccountSettingsOverrides.ts";

const wanted = { ipv6EnabledGroups: ["g-all"], networkRangeV6: "fd00:1:2:3::/64", localMfaEnabled: true, peerHostnameCollisionRejected: true };

// What the provider's update leaves behind: its own fields set, ours zeroed.
const wiped = {
  network_range: "10.100.0.0/16",
  dns_domain: "nbd.example.test",
  peer_login_expiration_enabled: false,
  peer_login_expiration: 86400,
  regular_users_view_blocked: true,
  extra: { peer_approval_enabled: false },
  ipv6_enabled_groups: [],
  network_range_v6: "",
  local_mfa_enabled: false,
  peer_hostname_collision_rejected: false,
};

describe("settingsDrift", () => {
  it("names every owned field the provider reset", () => {
    assert.deepEqual(settingsDrift(wiped, wanted), ["ipv6_enabled_groups", "network_range_v6", "local_mfa_enabled", "peer_hostname_collision_rejected"]);
  });

  it("is empty once the account matches, whatever order the groups come back in", () => {
    const live = { ...wiped, ipv6_enabled_groups: ["g-b", "g-a"], network_range_v6: "fd00:1:2:3::/64", local_mfa_enabled: true, peer_hostname_collision_rejected: true };
    assert.deepEqual(settingsDrift(live, { ...wanted, ipv6EnabledGroups: ["g-a", "g-b"] }), []);
  });

  it("treats missing or null fields as off", () => {
    assert.deepEqual(settingsDrift({ ipv6_enabled_groups: null }, { ipv6EnabledGroups: [], networkRangeV6: "", localMfaEnabled: false, peerHostnameCollisionRejected: false }), []);
  });

  it("sees a group added or removed, not only an empty list", () => {
    assert.deepEqual(settingsDrift({ ...wiped, ...overlaidSettings(wiped, wanted), ipv6_enabled_groups: ["g-all", "g-extra"] }, wanted), ["ipv6_enabled_groups"]);
  });
});

describe("overlaidSettings", () => {
  const body = overlaidSettings(wiped, wanted);

  it("sets the four owned fields", () => {
    assert.deepEqual(body.ipv6_enabled_groups, ["g-all"]);
    assert.equal(body.network_range_v6, "fd00:1:2:3::/64");
    assert.equal(body.local_mfa_enabled, true);
    assert.equal(body.peer_hostname_collision_rejected, true);
  });

  it("sends every other field back exactly as read, nested ones included", () => {
    for (const key of ["network_range", "dns_domain", "peer_login_expiration_enabled", "peer_login_expiration", "regular_users_view_blocked", "extra"]) {
      assert.deepEqual(body[key], wiped[key as keyof typeof wiped], key);
    }
  });

  it("does not alias the caller's group list", () => {
    const groups = ["g-all"];
    const result = overlaidSettings(wiped, { ...wanted, ipv6EnabledGroups: groups });
    groups.push("g-late");
    assert.deepEqual(result.ipv6_enabled_groups, ["g-all"]);
  });
});
