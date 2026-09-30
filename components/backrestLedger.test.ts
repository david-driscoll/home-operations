// npx tsx --test components/backrestLedger.test.ts
//
// Pure-function tests for the Backrest ledger -- no Pulumi runtime, no host.
// The SSH read and the ordered writes live in BackupPlanDirector and are
// exercised by deploys, not here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKREST_LEDGER_SEED, type BackrestLedger, parseBackrestLedger, planLedgerRemovals, renderBackrestLedger } from "./backrestLedger.ts";

const ledger = (plans: string[], repos: string[] = plans): BackrestLedger => ({ version: 1, plans, repos });
const config = (plans: [string, string][], repos: string[]) => ({
  plans: plans.map(([id, repo]) => ({ id, repo })),
  repos: repos.map(id => ({ id })),
});

describe("parseBackrestLedger", () => {
  it("treats an empty read as no ledger yet", () => {
    assert.deepEqual(parseBackrestLedger(""), {});
    assert.deepEqual(parseBackrestLedger("  \n"), {});
  });

  it("reads a well-formed ledger", () => {
    assert.deepEqual(parseBackrestLedger(renderBackrestLedger({ plans: ["b", "a"], repos: ["a"] })), { ledger: ledger(["a", "b"], ["a"]) });
  });

  it("reports, rather than throws, anything malformed", () => {
    assert.match(parseBackrestLedger("{not json").problem ?? "", /not valid JSON/);
    assert.match(parseBackrestLedger("[]").problem ?? "", /unsupported version/);
    assert.match(parseBackrestLedger('{"version":2,"plans":[],"repos":[]}').problem ?? "", /unsupported version 2/);
    assert.match(parseBackrestLedger('{"version":1,"plans":"a","repos":[]}').problem ?? "", /arrays of strings/);
    assert.match(parseBackrestLedger('{"version":1,"plans":[1],"repos":[]}').problem ?? "", /arrays of strings/);
  });
});

describe("renderBackrestLedger", () => {
  it("renders the same bytes whatever the input order", () => {
    const a = renderBackrestLedger({ plans: ["z", "a", "a"], repos: ["y", "b"] });
    const b = renderBackrestLedger({ plans: ["a", "z"], repos: ["b", "y", "y"] });
    assert.equal(a, b);
    assert.ok(a.endsWith("\n"));
    assert.deepEqual(JSON.parse(a), ledger(["a", "z"], ["b", "y"]));
  });
});

describe("planLedgerRemovals", () => {
  it("removes what the last run emitted and this one does not", () => {
    const removals = planLedgerRemovals({
      previous: ledger(["keep", "gone"]),
      emitted: { plans: ["keep"], repos: ["keep"] },
      config: config(
        [
          ["keep", "keep"],
          ["gone", "gone"],
        ],
        ["keep", "gone"],
      ),
      host: "celestia",
    });
    assert.deepEqual(removals, { plans: ["gone"], repos: ["gone"], keptRepos: [] });
  });

  it("never touches a plan or repo the director did not record", () => {
    const removals = planLedgerRemovals({
      previous: ledger(["managed"]),
      emitted: { plans: ["managed"], repos: ["managed"] },
      config: config(
        [
          ["managed", "managed"],
          ["hand-made", "hand-made"],
        ],
        ["managed", "hand-made"],
      ),
      host: "celestia",
    });
    assert.deepEqual(removals, { plans: [], repos: [], keptRepos: [] });
  });

  it("keeps a repo a remaining plan still points at", () => {
    const removals = planLedgerRemovals({
      previous: ledger(["moved"]),
      emitted: { plans: ["other"], repos: ["other"] },
      config: config(
        [
          ["moved", "moved"],
          ["ui-plan", "moved"],
        ],
        ["moved"],
      ),
      host: "celestia",
    });
    assert.deepEqual(removals, { plans: ["moved"], repos: [], keptRepos: [{ id: "moved", usedBy: ["ui-plan"] }] });
  });

  it("uses the seed when the host has no ledger yet", () => {
    const [seeded] = BACKREST_LEDGER_SEED.plans;
    assert.ok(seeded);
    const removals = planLedgerRemovals({
      previous: undefined,
      emitted: { plans: ["live"], repos: ["live"] },
      config: config(
        [
          ["live", "live"],
          [seeded, seeded],
          ["hand-made", "hand-made"],
        ],
        ["live", seeded, "hand-made"],
      ),
      host: "celestia",
    });
    assert.deepEqual(removals, { plans: [seeded], repos: [seeded], keptRepos: [] });
  });

  it("applies the seed even once a ledger exists, and keeps a seeded plan's repo when only the plan is seeded", () => {
    const planOnly = "skystar-dockge-neo4j";
    assert.ok(BACKREST_LEDGER_SEED.plans.includes(planOnly));
    assert.ok(!BACKREST_LEDGER_SEED.repos.includes(planOnly));
    const removals = planLedgerRemovals({
      previous: ledger(["live"]),
      emitted: { plans: ["live"], repos: ["live"] },
      config: config(
        [
          ["live", "live"],
          [planOnly, planOnly],
        ],
        ["live", planOnly],
      ),
      host: "celestia",
    });
    assert.deepEqual(removals, { plans: [planOnly], repos: [], keptRepos: [] });
  });

  it("keeps a seeded plan the inventory emits again", () => {
    const planOnly = "skystar-dockge-neo4j";
    const removals = planLedgerRemovals({
      previous: ledger(["live"]),
      emitted: { plans: ["live", planOnly], repos: ["live", planOnly] },
      config: config(
        [
          ["live", "live"],
          [planOnly, planOnly],
        ],
        ["live", planOnly],
      ),
      host: "celestia",
    });
    assert.deepEqual(removals, { plans: [], repos: [], keptRepos: [] });
  });

  it("does nothing on a host that never had the seeded leftovers", () => {
    const removals = planLedgerRemovals({
      previous: undefined,
      emitted: { plans: [], repos: ["equestria-volsync-app"] },
      config: config([], ["equestria-volsync-app"]),
      host: "luna",
    });
    assert.deepEqual(removals, { plans: [], repos: [], keptRepos: [] });
  });

  it("refuses to remove every plan when this run emitted none", () => {
    assert.throws(
      () =>
        planLedgerRemovals({
          previous: ledger(["a", "b"]),
          emitted: { plans: [], repos: ["a", "b"] },
          config: config([["a", "a"]], ["a"]),
          host: "luna",
        }),
      /emitted no plans this run.*records 2/,
    );
  });

  it("refuses to remove every repo when this run emitted none", () => {
    assert.throws(
      () =>
        planLedgerRemovals({
          previous: ledger([], ["equestria-volsync-app"]),
          emitted: { plans: [], repos: [] },
          config: config([], ["equestria-volsync-app"]),
          host: "skystar",
        }),
      /emitted no repos this run/,
    );
  });

  it("allows an empty kind that was already empty", () => {
    const removals = planLedgerRemovals({
      previous: ledger([], ["equestria-volsync-app", "equestria-volsync-gone"]),
      emitted: { plans: [], repos: ["equestria-volsync-app"] },
      config: config([], ["equestria-volsync-app", "equestria-volsync-gone"]),
      host: "skystar",
    });
    assert.deepEqual(removals, { plans: [], repos: ["equestria-volsync-gone"], keptRepos: [] });
  });
});
