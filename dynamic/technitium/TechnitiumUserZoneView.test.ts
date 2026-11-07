/**
 * node --test dynamic/technitium/TechnitiumUserZoneView.test.ts
 *
 * The zone-permission tables `set` replaces wholesale, and the zone list the
 * grant walks. Dropping another row here would silently take a zone away
 * from its admin or a group; a wrong skip would leave a zone unreadable.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eligibleZoneNames, formatPermissionTable, looksLikeZoneGone, parsePermissionTable, permissionTables, setPermissionsQuery, withoutUser, withViewOnly, zonesNeedingView } from "./TechnitiumUserZoneView.ts";

const full = { canView: true, canModify: true, canDelete: true };
const viewOnly = { canView: true, canModify: false, canDelete: false };

const live = permissionTables({
  userPermissions: [{ username: "admin", ...full }],
  groupPermissions: [
    { name: "Administrators", ...full },
    { name: "DNS Administrators", ...full },
  ],
});

describe("eligibleZoneNames", () => {
  it("keeps every zone type and sorts the names", () => {
    const zones = [
      { name: "example.com", type: "Primary" },
      { name: "cluster-catalog.example.com", type: "Catalog" },
      { name: "corp.example.net", type: "Forwarder" },
      { name: "stub.example.org", type: "Stub" },
      { name: "mirror.example.org", type: "Secondary" },
      { name: "fwd.example.org", type: "SecondaryForwarder" },
      { name: "catalog.example.org", type: "SecondaryCatalog" },
    ];
    assert.deepEqual(eligibleZoneNames({ zones }), ["catalog.example.org", "cluster-catalog.example.com", "corp.example.net", "example.com", "fwd.example.org", "mirror.example.org", "stub.example.org"]);
  });

  it("skips the built-in internal zones and the root zone", () => {
    const zones = [
      { name: "", type: "Secondary" },
      { name: "0.in-addr.arpa", type: "Primary", internal: true },
      { name: "127.in-addr.arpa", type: "Primary", internal: true },
      { name: "localhost", type: "Primary", internal: true },
      { name: "10.in-addr.arpa", type: "Primary", internal: false },
      { name: "example.com", type: "Primary", internal: false },
    ];
    assert.deepEqual(eligibleZoneNames({ zones }), ["10.in-addr.arpa", "example.com"]);
  });

  it("keeps a zone the server does not flag either way", () => {
    assert.deepEqual(eligibleZoneNames({ zones: [{ name: "localhost", type: "Primary" }] }), ["localhost"]);
  });

  it("normalises case and a trailing dot, and drops duplicates", () => {
    assert.deepEqual(eligibleZoneNames({ zones: [{ name: "Example.COM." }, { name: "example.com" }, { name: "." }] }), ["example.com"]);
  });

  it("treats a missing list as no zones", () => {
    assert.deepEqual(eligibleZoneNames({}), []);
    assert.deepEqual(eligibleZoneNames({ zones: null }), []);
  });
});

describe("looksLikeZoneGone", () => {
  it("matches what the permission calls answer for a deleted zone", () => {
    assert.equal(looksLikeZoneGone("Technitium /api/zones/permissions/get (gone.example.com): error: Access was denied."), true);
    assert.equal(looksLikeZoneGone("Technitium /api/zones/permissions/set (gone.example.com): error: No permissions exists for section: Zones/gone.example.com"), true);
  });

  it("does not swallow other failures", () => {
    assert.equal(looksLikeZoneGone("Technitium /api/zones/permissions/get (example.com): invalid-token"), false);
    assert.equal(looksLikeZoneGone("Technitium /api/zones/permissions/get: HTTP 502"), false);
  });
});

describe("zonesNeedingView", () => {
  it("lists only zones whose row is missing or not exactly View", () => {
    const survey = [
      { zone: "a.example", tables: { users: [{ name: "mcp", ...viewOnly }], groups: [] } },
      { zone: "b.example", tables: { users: [{ name: "admin", ...full }], groups: [] } },
      { zone: "c.example", tables: { users: [{ name: "mcp", ...full }], groups: [] } },
    ];
    assert.deepEqual(zonesNeedingView(survey, "mcp"), ["b.example", "c.example"]);
  });

  it("is empty once every zone is covered", () => {
    assert.deepEqual(zonesNeedingView([{ zone: "a.example", tables: { users: [{ name: "MCP", ...viewOnly }], groups: [] } }], "mcp"), []);
  });
});

describe("formatPermissionTable / parsePermissionTable", () => {
  it("writes the documented name|view|modify|delete rows", () => {
    assert.equal(formatPermissionTable(live.users), "admin|true|true|true");
    assert.equal(formatPermissionTable(live.groups), "Administrators|true|true|true|DNS Administrators|true|true|true");
  });

  it("round-trips through the server's 4-field reading", () => {
    assert.deepEqual(parsePermissionTable(formatPermissionTable(live.groups)), live.groups);
  });

  it("writes an empty table as an empty string, which clears the list", () => {
    assert.equal(formatPermissionTable([]), "");
    assert.deepEqual(parsePermissionTable(""), []);
  });

  it("refuses a name that would shift every following row", () => {
    assert.throws(() => formatPermissionTable([{ name: "a|b", ...viewOnly }]), /contains '\|'/);
  });
});

describe("withViewOnly", () => {
  it("adds the user View-only after the rows already there", () => {
    assert.deepEqual(withViewOnly(live.users, "mcp"), [
      { name: "admin", ...full },
      { name: "mcp", ...viewOnly },
    ]);
  });

  it("sends nothing when the row is already View-only", () => {
    const users = [
      { name: "admin", ...full },
      { name: "mcp", ...viewOnly },
    ];
    assert.equal(withViewOnly(users, "mcp"), undefined);
    assert.equal(withViewOnly(users, "MCP"), undefined);
  });

  it("takes back a hand grant of Modify or Delete, in place", () => {
    const users = [
      { name: "mcp", ...full },
      { name: "admin", ...full },
    ];
    assert.deepEqual(withViewOnly(users, "mcp"), [
      { name: "mcp", ...viewOnly },
      { name: "admin", ...full },
    ]);
  });

  it("restores View on a row that lost it", () => {
    assert.deepEqual(withViewOnly([{ name: "mcp", canView: false, canModify: false, canDelete: false }], "mcp"), [{ name: "mcp", ...viewOnly }]);
  });
});

describe("withoutUser", () => {
  it("removes only its own row", () => {
    const users = [
      { name: "admin", ...full },
      { name: "mcp", ...viewOnly },
      { name: "ops", ...viewOnly },
    ];
    assert.deepEqual(withoutUser(users, "mcp"), [
      { name: "admin", ...full },
      { name: "ops", ...viewOnly },
    ]);
  });

  it("sends nothing when the user has no row", () => {
    assert.equal(withoutUser(live.users, "mcp"), undefined);
  });

  it("empties the table when it was the only row", () => {
    assert.deepEqual(withoutUser([{ name: "mcp", ...viewOnly }], "mcp"), []);
  });
});

describe("setPermissionsQuery", () => {
  it("re-sends every group row exactly as read", () => {
    const users = withViewOnly(live.users, "mcp");
    assert.ok(users);
    assert.deepEqual(setPermissionsQuery("example.com", { users, groups: live.groups }), {
      zone: "example.com",
      userPermissions: "admin|true|true|true|mcp|true|false|false",
      groupPermissions: "Administrators|true|true|true|DNS Administrators|true|true|true",
    });
  });

  it("keeps a custom group's partial grant", () => {
    const groups = [...live.groups, { name: "Readers", ...viewOnly }];
    assert.equal(setPermissionsQuery("example.com", { users: [], groups }).groupPermissions, "Administrators|true|true|true|DNS Administrators|true|true|true|Readers|true|false|false");
  });

  it("treats missing lists in the response as empty", () => {
    assert.deepEqual(permissionTables({ userPermissions: null }), { users: [], groups: [] });
  });
});
