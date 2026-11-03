/**
 * node --test components/netbird/tokens.test.ts
 *
 * Which NetBird PAT Pulumi drives the API with, and when a token is due for
 * rotation. The choice is what keeps stacks/netbird free of a chicken-and-egg:
 * the run that creates the automation user cannot depend on its token.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseToken, EXPIRY_WARNING_DAYS, expiresAtSeconds, expiringTokens, MIN_REMAINING_MS } from "./tokens.ts";

const now = new Date("2026-11-03T12:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

describe("chooseToken", () => {
  const owner = { source: "owner", token: { personal_access_token: "nbp_owner" } };

  it("uses the owner PAT while the automation path does not exist yet (the first run)", () => {
    const choice = chooseToken([{ source: "automation", token: undefined }, owner], now);
    assert.equal(choice.source, "owner");
    assert.equal(choice.token, "nbp_owner");
    assert.deepEqual(choice.skipped, [{ source: "automation", reason: "absent", detail: "not in OpenBao yet" }]);
  });

  it("prefers the automation PAT once it exists", () => {
    const choice = chooseToken([{ source: "automation", token: { personal_access_token: "nbp_auto", expires: inDays(200) } }, owner], now);
    assert.equal(choice.source, "automation");
    assert.equal(choice.token, "nbp_auto");
    assert.deepEqual(choice.skipped, []);
  });

  it("skips an expired automation PAT, so a lapsed token cannot lock Pulumi out of rotating it", () => {
    const choice = chooseToken([{ source: "automation", token: { personal_access_token: "nbp_auto", expires: inDays(-1) } }, owner], now);
    assert.equal(choice.source, "owner");
    assert.equal(choice.skipped[0].reason, "expired");
  });

  it("skips a PAT inside the last hour too: it would lapse mid-run", () => {
    const expires = new Date(now.getTime() + MIN_REMAINING_MS / 2).toISOString();
    const choice = chooseToken([{ source: "automation", token: { personal_access_token: "nbp_auto", expires } }, owner], now);
    assert.equal(choice.source, "owner");
  });

  it("treats an unreadable or missing expiry as usable: unknown is not evidence of expiry", () => {
    assert.equal(chooseToken([{ source: "automation", token: { personal_access_token: "nbp_auto", expires: "soon" } }, owner], now).source, "automation");
    assert.equal(chooseToken([{ source: "automation", token: { personal_access_token: "nbp_auto" } }, owner], now).source, "automation");
  });

  it("skips a present path with an empty PAT", () => {
    const choice = chooseToken([{ source: "automation", token: { personal_access_token: "  " } }, owner], now);
    assert.equal(choice.source, "owner");
    assert.equal(choice.skipped[0].reason, "empty");
  });

  it("walks the whole chain: automation, then the rotated owner PAT, then the setup PAT", () => {
    const choice = chooseToken([{ source: "automation", token: undefined }, { source: "owner-pat", token: { personal_access_token: "nbp_rotated", expires: inDays(300) } }, owner], now);
    assert.equal(choice.source, "owner-pat");
  });

  it("fails loudly, naming every candidate, when nothing is usable", () => {
    assert.throws(
      () =>
        chooseToken(
          [
            { source: "automation", token: { personal_access_token: "a", expires: inDays(-3) } },
            { source: "owner", token: undefined },
          ],
          now,
        ),
      /automation: expired .*owner: not in OpenBao yet/s,
    );
  });
});

describe("expiresAtSeconds", () => {
  it("is the epoch second of an RFC 3339 date", () => {
    assert.equal(expiresAtSeconds("2027-11-03T12:00:00Z"), Date.UTC(2027, 10, 3, 12) / 1000);
    assert.equal(expiresAtSeconds("2027-11-03T12:00:00.987654321Z"), Date.UTC(2027, 10, 3, 12) / 1000);
  });

  it("is 0 when absent or unreadable, which the alert reads as already expired", () => {
    assert.equal(expiresAtSeconds(undefined), 0);
    assert.equal(expiresAtSeconds(""), 0);
    assert.equal(expiresAtSeconds("never"), 0);
  });
});

describe("expiringTokens", () => {
  const seconds = (days: number) => Math.floor((now.getTime() + days * 86_400_000) / 1000);

  it("names the tokens inside the warning window, soonest first", () => {
    assert.deepEqual(expiringTokens({ automation: seconds(10), owner: seconds(EXPIRY_WARNING_DAYS - 1), spare: seconds(EXPIRY_WARNING_DAYS + 1) }, now), [
      { name: "automation", daysLeft: 10 },
      { name: "owner", daysLeft: EXPIRY_WARNING_DAYS - 1 },
    ]);
  });

  it("counts an expired or unknown token as negative days, so it is reported", () => {
    assert.deepEqual(expiringTokens({ owner: 0 }, now)[0].name, "owner");
    assert.ok(expiringTokens({ owner: seconds(-2) }, now)[0].daysLeft < 0);
  });

  it("is empty when every token has more than the window left", () => {
    assert.deepEqual(expiringTokens({ automation: seconds(365), owner: seconds(31) }, now), []);
  });
});
