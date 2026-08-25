/**
 * Declarative postgres tenancy for Dockge nodes — the parsing/validation/
 * rendering half of the `x-postgres` convention. The Pulumi side (password
 * minting, OpenBao writes, file delivery) lives in DockgeLxc; everything in
 * this module is pure and synchronous so it can be unit-tested without a
 * Pulumi runtime.
 *
 * ## The convention
 *
 * An app stack that wants a database on its node's shared Postgres declares
 * it in its own compose.yaml, beside the services that will use it:
 *
 *     x-postgres:
 *       database: itsaplan     # optional — defaults to the stack name with
 *                              #   dashes folded to underscores
 *       ensure: present        # optional — present (default) | absent
 *       passwordVersion: 1     # optional — bump to rotate the password
 *
 * `x-` top-level keys are legal compose that docker ignores (the estate
 * already uses `x-dockge`). DockgeLxc collects every stack's block per node,
 * plus host-level entries from docker/<node>/postgres/databases.yaml (the
 * place for tombstones whose stack no longer exists — celestia's forgejo
 * shape), and renders the postgres stack's .env-local from the union:
 * `PGAPP_<NAME>_PASSWORD=…` for present, `PGDROP_<NAME>=1` for absent, which
 * is exactly the declaration format provision.sh reconciles on every stack
 * start.
 *
 * Lifecycle, mirroring CloudNativePG's Database CRD semantics:
 *   - `ensure: present` — role + database exist, password reconciled.
 *   - `ensure: absent`  — database and role are DROPPED on next deploy. The
 *     declaration is a tombstone: leave it until the drop has happened, then
 *     delete it.
 *   - declaration removed entirely — RETAIN. Nothing is dropped, the role and
 *     database are orphaned intact. To actually remove data, go through
 *     `ensure: absent` first.
 *
 * ## Why validation here is strict
 *
 * Unknown keys are a hard error, not a skip. The estate has been bitten by
 * silently-dropped misspellings before (Longhorn defaultSettings), and a typo
 * like `passwordversion:` that parsed cleanly would mean "never rotates" with
 * zero signal. Same for identifier constraints: provision.sh SKIPs invalid
 * names at container runtime where nobody is watching; failing the Pulumi run
 * puts the error in front of the human who made the edit.
 */

import type { Output } from "@pulumi/pulumi";
import * as yaml from "yaml";

export interface PostgresTenantDeclaration {
  /**
   * Stack that declared it, or null for host-level databases.yaml entries.
   * Only used for error messages and OpenBao path derivation — the database
   * name is the identity.
   */
  stack: string | null;
  /** The login role AND database name — one identifier for both, as provision.sh defines the convention. */
  database: string;
  ensure: "present" | "absent";
  /** Bump to rotate: feeds RandomPassword `keepers`, so a change mints a new password. */
  passwordVersion: number;
}

/**
 * What DockgeLxc's collection pass hands back to createStack: the generated
 * .env-local content for the postgres stack (null when the node runs no
 * postgres stack), and each declaring stack's credential for `${PGAPP_*}`
 * substitution into its own files.
 */
export interface PostgresTenantResources {
  envLocal: Output<string> | null;
  byStack: Map<string, { database: string; password: Output<string> }>;
}

/**
 * Never provisionable, never droppable. provision.sh refuses these too
 * (defense in depth for a hand-edited environment) — this copy exists to fail
 * the Pulumi run instead of the container.
 */
export const POSTGRES_RESERVED_DATABASES = ["postgres", "template0", "template1"] as const;

/**
 * Mirrors provision.sh's `[a-z0-9_]` constraint exactly — everything
 * downstream (env var round-trip, %I quoting, backup filenames) relies on it.
 * 63 bytes is Postgres's NAMEDATALEN-1 identifier limit.
 */
const IDENTIFIER = /^[a-z0-9_]{1,63}$/;

const STACK_KEYS = new Set(["database", "ensure", "passwordVersion"]);
const HOST_ENTRY_KEYS = STACK_KEYS;

/** Stack name → default database name: dashes fold to underscores (stack names allow dashes, identifiers do not). */
export function defaultDatabaseName(stackName: string): string {
  return stackName.toLowerCase().replace(/-/g, "_");
}

function validateShape(raw: Record<string, unknown>, allowed: Set<string>, where: string): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new Error(
        `${where}: unknown key '${key}' — allowed keys are ${[...allowed].join(", ")}. ` +
          `Unknown keys are an error on purpose: a silently-ignored typo here would mean a password that never rotates or a database that never drops.`,
      );
    }
  }
}

function normalize(raw: Record<string, unknown>, stack: string | null, fallbackDatabase: string | undefined, where: string): PostgresTenantDeclaration {
  const database = raw.database ?? fallbackDatabase;
  if (typeof database !== "string" || database.length === 0) {
    throw new Error(`${where}: 'database' must be a non-empty string (host-level entries cannot default it — there is no stack name to derive from).`);
  }
  if (!IDENTIFIER.test(database)) {
    throw new Error(`${where}: database '${database}' is not a valid identifier — must match [a-z0-9_], at most 63 characters. ` + `For a stack named with dashes, the default already folds them to underscores.`);
  }
  if ((POSTGRES_RESERVED_DATABASES as readonly string[]).includes(database)) {
    throw new Error(`${where}: database '${database}' is a system database and can never be declared.`);
  }

  const ensure = raw.ensure ?? "present";
  if (ensure !== "present" && ensure !== "absent") {
    throw new Error(`${where}: ensure must be 'present' or 'absent', got '${String(ensure)}'.`);
  }

  const passwordVersion = raw.passwordVersion ?? 1;
  if (typeof passwordVersion !== "number" || !Number.isInteger(passwordVersion) || passwordVersion < 1) {
    throw new Error(`${where}: passwordVersion must be a positive integer, got '${String(passwordVersion)}'.`);
  }

  return { stack, database, ensure, passwordVersion };
}

/**
 * Extract the `x-postgres` block from a stack's compose.yaml, if present.
 *
 * Takes the RAW on-disk compose text, before any of DockgeLxc's `${…}`
 * substitutions — the block must therefore be literal values, never
 * substitution tokens, and yaml.parse handles the untouched `${TIMEZONE}`
 * strings elsewhere in the file as plain strings.
 */
export function parseStackPostgresDeclaration(stackName: string, composeText: string): PostgresTenantDeclaration | null {
  let parsed: unknown;
  try {
    parsed = yaml.parse(composeText);
  } catch (error) {
    throw new Error(`stack '${stackName}': compose.yaml did not parse while looking for x-postgres: ${String(error)}`);
  }
  const block = (parsed as Record<string, unknown> | null)?.["x-postgres"];
  if (block === undefined || block === null) {
    return null;
  }
  const where = `stack '${stackName}' x-postgres`;
  if (typeof block !== "object" || Array.isArray(block)) {
    throw new Error(`${where}: must be a mapping ({ database, ensure, passwordVersion }), got ${Array.isArray(block) ? "a list" : typeof block}.`);
  }
  validateShape(block as Record<string, unknown>, STACK_KEYS, where);
  return normalize(block as Record<string, unknown>, stackName, defaultDatabaseName(stackName), where);
}

/**
 * Parse docker/<node>/postgres/databases.yaml — host-level declarations for
 * databases with no stack to carry an x-postgres block. Shape:
 *
 *     databases:
 *       - database: forgejo
 *         ensure: absent
 *
 * An empty or missing `databases:` list is fine and means nothing declared.
 */
export function parseDatabasesFile(text: string, sourceLabel: string): PostgresTenantDeclaration[] {
  let parsed: unknown;
  try {
    parsed = yaml.parse(text);
  } catch (error) {
    throw new Error(`${sourceLabel}: did not parse: ${String(error)}`);
  }
  if (parsed === null || parsed === undefined) {
    return [];
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel}: top level must be a mapping with a 'databases' list.`);
  }
  validateShape(parsed as Record<string, unknown>, new Set(["databases"]), sourceLabel);
  const list = (parsed as Record<string, unknown>).databases ?? [];
  if (!Array.isArray(list)) {
    throw new Error(`${sourceLabel}: 'databases' must be a list.`);
  }
  return list.map((entry, index) => {
    const where = `${sourceLabel} databases[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${where}: must be a mapping ({ database, ensure, passwordVersion }).`);
    }
    validateShape(entry as Record<string, unknown>, HOST_ENTRY_KEYS, where);
    return normalize(entry as Record<string, unknown>, null, undefined, where);
  });
}

/**
 * Cross-declaration validation for one node. Throws on:
 *   - the same database declared twice (two stacks, or a stack plus a
 *     host-level entry) — there is no merge rule that isn't a guess;
 * and returns the declarations unchanged so callers can chain.
 */
export function validatePostgresTenants(declarations: PostgresTenantDeclaration[], nodeName: string): PostgresTenantDeclaration[] {
  const byDatabase = new Map<string, PostgresTenantDeclaration>();
  for (const decl of declarations) {
    const existing = byDatabase.get(decl.database);
    if (existing) {
      const describe = (d: PostgresTenantDeclaration) => (d.stack ? `stack '${d.stack}'` : "databases.yaml");
      throw new Error(
        `node '${nodeName}': database '${decl.database}' is declared by both ${describe(existing)} and ${describe(decl)} — ` + `one database has one owner; pick a different 'database:' name for one of them.`,
      );
    }
    byDatabase.set(decl.database, decl);
  }
  return declarations;
}

/**
 * Render the postgres stack's generated .env-local from resolved
 * declarations. Passwords arrive as plain strings — the caller unwraps its
 * Pulumi Outputs and MUST mark the rendered result secret.
 *
 * Deterministic: sorted by database name, so the file's bytes (and therefore
 * the copy resource's trigger) depend only on the declared set, never on
 * collection order.
 */
export function renderPostgresEnvLocal(entries: { database: string; ensure: "present" | "absent"; password?: string }[]): string {
  const lines: string[] = [
    "# GENERATED by Pulumi (components/DockgeLxc.ts) from x-postgres blocks and",
    "# databases.yaml — do not edit on the node; the next deploy overwrites it.",
    "# Format: docker/_common/postgres/provision.sh.",
  ];
  const sorted = [...entries].sort((a, b) => (a.database < b.database ? -1 : a.database > b.database ? 1 : 0));
  for (const entry of sorted) {
    const upper = entry.database.toUpperCase();
    if (entry.ensure === "absent") {
      lines.push(`PGDROP_${upper}=1`);
      continue;
    }
    if (!entry.password) {
      throw new Error(`render: database '${entry.database}' is ensure: present but has no password — the caller must mint one.`);
    }
    // The minting side generates alphanumeric-only passwords precisely so this
    // file needs no quoting; compose env_file parsing and POSIX `printenv`
    // then agree on the bytes. Guard it here so a future change to the
    // generator cannot silently produce a password that shell-splits.
    if (!/^[A-Za-z0-9]+$/.test(entry.password)) {
      throw new Error(`render: password for '${entry.database}' contains characters outside [A-Za-z0-9] — mint alphanumeric passwords (RandomPassword special: false) or add quoting semantics deliberately.`);
    }
    lines.push(`PGAPP_${upper}_PASSWORD=${entry.password}`);
  }
  return `${lines.join("\n")}\n`;
}
