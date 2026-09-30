// npx tsx --test components/dockerStackBackups.test.ts
//
// Pure-function tests for the exclude translation used by host-owned backrest
// plans. listStackBackupTargets reads the repo's docker/ tree and is exercised
// by every backups-stack run, not here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKUP_STACK_EXCLUDES, resticExcludesFor } from "./dockerStackBackups.ts";

describe("resticExcludesFor", () => {
  it("turns a directory filter into the absolute directory", () => {
    assert.deepEqual(resticExcludesFor({ stack: "postgres", excludes: ["/pgdata/**"] }), ["/opt/stacks-data/postgres/pgdata"]);
  });

  it("keeps a glob in the last segment", () => {
    assert.deepEqual(resticExcludesFor({ stack: "technitium", excludes: ["/config/stats/**", "/tailscale/tailscaled.log*"] }), [
      "/opt/stacks-data/technitium/config/stats",
      "/opt/stacks-data/technitium/tailscale/tailscaled.log*",
    ]);
  });

  it("returns nothing for a stack with no excludes", () => {
    assert.deepEqual(resticExcludesFor({ stack: "traefik", excludes: [] }), []);
  });

  it("refuses what it cannot translate faithfully", () => {
    assert.throws(() => resticExcludesFor({ stack: "x", excludes: ["pgdata/**"] }), /not rooted/);
    assert.throws(() => resticExcludesFor({ stack: "x", excludes: ["/a/**/b"] }), /cannot be translated/);
    assert.throws(() => resticExcludesFor({ stack: "x", excludes: ["/**"] }), /cannot be translated/);
  });

  it("translates every entry in BACKUP_STACK_EXCLUDES", () => {
    for (const [stack, excludes] of Object.entries(BACKUP_STACK_EXCLUDES)) {
      const translated = resticExcludesFor({ stack, excludes });
      assert.equal(translated.length, excludes.length);
      for (const pattern of translated) assert.ok(pattern.startsWith(`/opt/stacks-data/${stack}/`), pattern);
    }
  });
});
