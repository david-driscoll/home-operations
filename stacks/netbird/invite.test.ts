/**
 * node --test stacks/netbird/invite.test.ts
 *
 * The pure half of `mise run netbird:invite` (scripts/netbird-invite.ts):
 * its arguments, the request it sends, the credential it picks and the link
 * it prints.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { candidatesFromEnv, findGroupId, INVITE_EXPIRES_SECONDS, inviteRequest, inviteUrl, parseInviteArgs } from "./invite.ts";

describe("parseInviteArgs", () => {
  it("takes an email, a name and one of the four user groups", () => {
    assert.deepEqual(parseInviteArgs(["pinkie@example.test", "Pinkie Pie", "family"]), { email: "pinkie@example.test", name: "Pinkie Pie", group: "family", dryRun: false });
  });

  it("takes --dry-run anywhere", () => {
    assert.equal(parseInviteArgs(["--dry-run", "a@example.test", "A", "admins"]).dryRun, true);
    assert.equal(parseInviteArgs(["a@example.test", "A", "admins", "--dry-run"]).dryRun, true);
  });

  it("refuses a group that is not a user group, naming the ones that are", () => {
    assert.throws(() => parseInviteArgs(["a@example.test", "A", "apple-tv"]), /admins, family, friends, media-managers/);
    assert.throws(() => parseInviteArgs(["a@example.test", "A", "Family"]), /not a user group/);
  });

  it("refuses something that is not an email", () => {
    assert.throws(() => parseInviteArgs(["pinkie", "Pinkie", "family"]), /email/);
    assert.throws(() => parseInviteArgs(["a b@example.test", "A", "family"]), /email/);
  });

  it("refuses the wrong number of arguments, a blank name and unknown flags", () => {
    assert.throws(() => parseInviteArgs(["a@example.test", "family"]), /usage/);
    assert.throws(() => parseInviteArgs(["a@example.test", "A", "family", "extra"]), /usage/);
    assert.throws(() => parseInviteArgs(["a@example.test", "  ", "family"]), /name/);
    assert.throws(() => parseInviteArgs(["--force", "a@example.test", "A", "family"]), /--force/);
  });

  it("trims the name and the email", () => {
    const args = parseInviteArgs([" a@example.test ", " Applejack ", "friends"]);
    assert.equal(args.email, "a@example.test");
    assert.equal(args.name, "Applejack");
  });
});

describe("findGroupId", () => {
  const live = [
    { id: "g-all", name: "All" },
    { id: "g-family", name: "family" },
  ];

  it("returns the id of the group with that exact name", () => {
    assert.equal(findGroupId(live, "family"), "g-family");
  });

  it("fails clearly when stacks/netbird has not created the group yet", () => {
    assert.throws(() => findGroupId(live, "friends"), /friends.*stacks\/netbird/);
  });

  it("refuses an ambiguous name rather than guess", () => {
    assert.throws(() => findGroupId([...live, { id: "g-family-2", name: "family" }], "family"), /2 groups/);
  });
});

describe("inviteRequest", () => {
  it("is a regular user in the one group, valid for 72 hours", () => {
    assert.deepEqual(inviteRequest({ email: "a@example.test", name: "A", groupId: "g-family" }), {
      email: "a@example.test",
      name: "A",
      role: "user",
      auto_groups: ["g-family"],
      expires_in: 259200,
    });
    assert.equal(INVITE_EXPIRES_SECONDS, 72 * 60 * 60);
  });
});

describe("inviteUrl", () => {
  it("is the dashboard's /invite page with the token, on the management host", () => {
    assert.equal(inviteUrl("https://netbird.example.test", "nbi_abc123"), "https://netbird.example.test/invite?token=nbi_abc123");
  });

  it("ignores a trailing slash and escapes the token", () => {
    assert.equal(inviteUrl("https://netbird.example.test/", "a+b/c"), "https://netbird.example.test/invite?token=a%2Bb%2Fc");
  });

  it("refuses an empty token: management returns it only when the invite is created", () => {
    assert.throws(() => inviteUrl("https://netbird.example.test", ""), /invite_token/);
  });
});

describe("candidatesFromEnv", () => {
  it("is the same order globals.netbirdApi uses: automation, owner-pat, owner", () => {
    const candidates = candidatesFromEnv({
      NETBIRD_AUTOMATION_PAT: "nbp_auto",
      NETBIRD_AUTOMATION_EXPIRES: "2027-11-01T00:00:00Z",
      NETBIRD_OWNER_PAT: "nbp_owner",
      NETBIRD_OWNER_PAT_EXPIRES: "2027-11-02T00:00:00Z",
      NETBIRD_SETUP_PAT: "nbp_setup",
    });
    assert.deepEqual(candidates, [
      { source: "automation", token: { personal_access_token: "nbp_auto", expires: "2027-11-01T00:00:00Z" } },
      { source: "owner-pat", token: { personal_access_token: "nbp_owner", expires: "2027-11-02T00:00:00Z" } },
      { source: "owner", token: { personal_access_token: "nbp_setup", expires: undefined } },
    ]);
  });

  it("reads an unset or empty variable as a path that does not exist", () => {
    const candidates = candidatesFromEnv({ NETBIRD_AUTOMATION_PAT: "", NETBIRD_SETUP_PAT: "nbp_setup" });
    assert.equal(candidates[0].token, undefined);
    assert.equal(candidates[1].token, undefined);
    assert.equal(candidates[2].token?.personal_access_token, "nbp_setup");
  });
});
