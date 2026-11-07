/**
 * node --test dynamic/technitium/TechnitiumZoneViewPermission.test.ts
 *
 * The zone-permission tables `set` replaces wholesale. Dropping another row
 * here would silently take a zone away from its admin or a group.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPermissionTable, parsePermissionTable, permissionTables, setPermissionsQuery, withoutUser, withViewOnly } from "./TechnitiumZoneViewPermission.ts";

const full = { canView: true, canModify: true, canDelete: true };
const viewOnly = { canView: true, canModify: false, canDelete: false };

const live = permissionTables({
  userPermissions: [{ username: "admin", ...full }],
  groupPermissions: [
    { name: "Administrators", ...full },
    { name: "DNS Administrators", ...full },
  ],
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
