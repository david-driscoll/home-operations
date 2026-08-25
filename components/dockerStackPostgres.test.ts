// npx tsx --test components/dockerStackPostgres.test.ts
//
// Pure-function tests for the x-postgres declaration pipeline — no Pulumi
// runtime, no mocks. The Output-carrying half (password minting, .env-local
// delivery) lives in DockgeLxc and is exercised by deploys, not here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultDatabaseName, parseDatabasesFile, parseStackPostgresDeclaration, renderPostgresEnvLocal, validatePostgresTenants } from "./dockerStackPostgres.ts";

describe("defaultDatabaseName", () => {
  it("folds dashes to underscores and lowercases", () => {
    assert.equal(defaultDatabaseName("authentik"), "authentik");
    assert.equal(defaultDatabaseName("llama-agent"), "llama_agent");
    assert.equal(defaultDatabaseName("UHF"), "uhf");
  });
});

describe("parseStackPostgresDeclaration", () => {
  it("returns null when there is no x-postgres block", () => {
    assert.equal(parseStackPostgresDeclaration("app", "services:\n  app:\n    image: x\n"), null);
  });

  it("tolerates unsubstituted ${...} tokens elsewhere in the file", () => {
    // The raw compose text still carries DockgeLxc's substitution tokens at
    // parse time; they are plain strings to yaml and must not interfere.
    const compose = ["services:", "  app:", "    image: x", "    environment:", "      TZ: ${TIMEZONE}", "x-postgres:", "  database: myapp", ""].join("\n");
    assert.deepEqual(parseStackPostgresDeclaration("app", compose), {
      stack: "app",
      database: "myapp",
      ensure: "present",
      passwordVersion: 1,
    });
  });

  it("defaults everything from the stack name for an empty block", () => {
    assert.deepEqual(parseStackPostgresDeclaration("llama-agent", "x-postgres: {}\n"), {
      stack: "llama-agent",
      database: "llama_agent",
      ensure: "present",
      passwordVersion: 1,
    });
  });

  it("accepts explicit ensure/passwordVersion", () => {
    const decl = parseStackPostgresDeclaration("app", "x-postgres:\n  ensure: absent\n  passwordVersion: 3\n");
    assert.deepEqual(decl, { stack: "app", database: "app", ensure: "absent", passwordVersion: 3 });
  });

  it("rejects unknown keys loudly", () => {
    // The Longhorn-defaultSettings lesson: a silently dropped misspelling
    // here would mean a password that never rotates.
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  passwordversion: 2\n"), /unknown key 'passwordversion'/);
  });

  it("rejects a non-mapping block", () => {
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres: true\n"), /must be a mapping/);
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  - database: a\n"), /must be a mapping/);
  });

  it("rejects invalid identifiers and reserved names", () => {
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  database: My-App\n"), /not a valid identifier/);
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  database: postgres\n"), /system database/);
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  database: template0\n"), /system database/);
  });

  it("rejects bad ensure and bad passwordVersion values", () => {
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  ensure: retained\n"), /ensure must be/);
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  passwordVersion: 1.5\n"), /positive integer/);
    assert.throws(() => parseStackPostgresDeclaration("app", "x-postgres:\n  passwordVersion: 0\n"), /positive integer/);
  });
});

describe("parseDatabasesFile", () => {
  it("treats an empty or comment-only file as no declarations", () => {
    assert.deepEqual(parseDatabasesFile("", "test"), []);
    assert.deepEqual(parseDatabasesFile("# nothing here\n", "test"), []);
    assert.deepEqual(parseDatabasesFile("databases: []\n", "test"), []);
  });

  it("parses tombstone entries", () => {
    const decls = parseDatabasesFile("databases:\n  - database: forgejo\n    ensure: absent\n", "test");
    assert.deepEqual(decls, [{ stack: null, database: "forgejo", ensure: "absent", passwordVersion: 1 }]);
  });

  it("requires an explicit database name — there is no stack to derive from", () => {
    assert.throws(() => parseDatabasesFile("databases:\n  - ensure: absent\n", "test"), /'database' must be a non-empty string/);
  });

  it("rejects unknown top-level keys and non-list databases", () => {
    assert.throws(() => parseDatabasesFile("database:\n  - database: a\n", "test"), /unknown key 'database'/);
    assert.throws(() => parseDatabasesFile("databases:\n  database: a\n", "test"), /must be a list/);
  });
});

describe("validatePostgresTenants", () => {
  it("passes distinct databases through unchanged", () => {
    const decls = [
      { stack: "a", database: "a", ensure: "present" as const, passwordVersion: 1 },
      { stack: "b", database: "b", ensure: "present" as const, passwordVersion: 1 },
    ];
    assert.equal(validatePostgresTenants(decls, "node"), decls);
  });

  it("rejects the same database declared twice, naming both declarers", () => {
    assert.throws(
      () =>
        validatePostgresTenants(
          [
            { stack: "a", database: "shared", ensure: "present", passwordVersion: 1 },
            { stack: null, database: "shared", ensure: "absent", passwordVersion: 1 },
          ],
          "node",
        ),
      /declared by both stack 'a' and databases\.yaml/,
    );
  });
});

describe("renderPostgresEnvLocal", () => {
  it("renders deterministically, sorted by database, dropping order dependence", () => {
    const a = renderPostgresEnvLocal([
      { database: "zulu", ensure: "present", password: "pw1" },
      { database: "alpha", ensure: "absent" },
    ]);
    const b = renderPostgresEnvLocal([
      { database: "alpha", ensure: "absent" },
      { database: "zulu", ensure: "present", password: "pw1" },
    ]);
    assert.equal(a, b);
    const lines = a
      .trimEnd()
      .split("\n")
      .filter(l => !l.startsWith("#"));
    assert.deepEqual(lines, ["PGDROP_ALPHA=1", "PGAPP_ZULU_PASSWORD=pw1"]);
    assert.ok(a.endsWith("\n"));
  });

  it("refuses a present entry with no password", () => {
    assert.throws(() => renderPostgresEnvLocal([{ database: "a", ensure: "present" }]), /has no password/);
  });

  it("refuses a password that would need quoting", () => {
    assert.throws(() => renderPostgresEnvLocal([{ database: "a", ensure: "present", password: "with space" }]), /outside \[A-Za-z0-9\]/);
    assert.throws(() => renderPostgresEnvLocal([{ database: "a", ensure: "present", password: 'q"uote' }]), /outside \[A-Za-z0-9\]/);
  });

  it("round-trips names through provision.sh's var-name convention", () => {
    // PGAPP_MY_APP_PASSWORD -> provision.sh lowercases back to my_app.
    const out = renderPostgresEnvLocal([{ database: "my_app", ensure: "present", password: "x1Y2" }]);
    assert.match(out, /^PGAPP_MY_APP_PASSWORD=x1Y2$/m);
  });
});
