#!/usr/bin/env -S npx tsx
/**
 * Copy or move a secret (or a whole subtree) between OpenBao KV v2 paths.
 *
 * The path scheme in PLAN.md §A is not frozen — `hosts/dockge/<slug>` became
 * that only after `hosts/<slug>` proved ambiguous, and re-homing a secret so
 * far has meant a hand-run curl pair with no verification between the write
 * and the delete. This is that operation with the two properties the manual
 * version lacks: the destination is never clobbered by accident, and the
 * source is destroyed only after the destination has been read back and
 * compared.
 *
 *   npx tsx scripts/bao-move.ts <src> <dst>                # plan a copy
 *   npx tsx scripts/bao-move.ts <src> <dst> --apply        # copy
 *   npx tsx scripts/bao-move.ts <src> <dst> --move --apply # copy, verify, destroy source
 *   npx tsx scripts/bao-move.ts <srcPrefix>/ <dstPrefix>/ --recursive --move --apply
 *
 * Options:
 *   --apply             perform writes (default is plan only, no mutation)
 *   --move              destroy the source after the copy verifies (default: leave it)
 *   --recursive, -r     treat the arguments as prefixes and walk the subtree
 *   --overwrite         allow writing a destination that already exists
 *   --mount <name>      KV v2 mount to read from (default: secrets)
 *   --dest-mount <name> KV v2 mount to write to (default: same as --mount)
 *   --no-metadata       do not copy custom_metadata to the destination
 *
 * Values are never printed — only key names, value lengths, and versions.
 *
 * What this does NOT do: update consumers. A path is a contract with `vals`
 * templates, ExternalSecrets, and `BaoStore` call sites; grep for the old path
 * and land those edits before `--move`, or use plain `--copy` semantics
 * (the default), cut consumers over, then delete the source in a second pass.
 */

import { BaoClient, type KvReadResult } from "@components/bao.ts";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function flag(...names: string[]): boolean {
  return names.some(n => argv.includes(n));
}

function option(name: string, fallback: string): string {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) die(`${name} needs a value`);
  return value;
}

function die(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

const apply = flag("--apply");
const move = flag("--move");
const recursive = flag("--recursive", "-r");
const overwrite = flag("--overwrite");
const copyMetadata = !flag("--no-metadata");
const srcMount = option("--mount", "secrets");
const dstMount = option("--dest-mount", srcMount);

// Everything that is not a flag and not a flag's value is positional.
const consumed = new Set<number>();
for (const name of ["--mount", "--dest-mount"]) {
  const i = argv.indexOf(name);
  if (i !== -1) {
    consumed.add(i);
    consumed.add(i + 1);
  }
}
const positional = argv.filter((a, i) => !consumed.has(i) && !a.startsWith("-"));

if (positional.length !== 2 || flag("--help", "-h")) {
  console.error("usage: bao-move.ts <src> <dst> [--apply] [--move] [--recursive] [--overwrite] [--mount secrets] [--dest-mount secrets] [--no-metadata]");
  process.exit(positional.length === 2 ? 0 : 2);
}

/** No leading or trailing slashes: `list` and `data` paths are joined by hand. */
const clean = (p: string) => p.replace(/^\/+|\/+$/g, "");
const src = clean(positional[0]!);
const dst = clean(positional[1]!);

if (!src || !dst) die("both <src> and <dst> must be non-empty");
if (srcMount === dstMount && src === dst) die("source and destination are the same path");
if (srcMount === dstMount && recursive && (`${dst}/`.startsWith(`${src}/`) || `${src}/`.startsWith(`${dst}/`))) {
  // A recursive walk into its own destination either re-copies what it just
  // wrote or, with --move, destroys a source it has already consumed.
  die(`recursive ${src} and ${dst} overlap — one is a prefix of the other`);
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

const bao = new BaoClient();

/**
 * Every leaf secret under a prefix, relative to it.
 *
 * KV v2 LIST marks subdirectories with a trailing slash, and a path can be
 * both a secret and a directory (`a/b` alongside `a/b/c`) — so a key can come
 * back twice, once each way, and both are real.
 */
async function leaves(mount: string, prefix: string): Promise<string[]> {
  // The prefix node itself, when it is both a secret and a directory. LIST
  // reports it from the level above, never from inside, so a walk that only
  // recurses would move every child and silently leave the parent behind.
  const found: string[] = (await bao.read(mount, prefix)) ? [""] : [];
  const walk = async (rel: string): Promise<void> => {
    const here = rel ? `${prefix}/${rel}` : prefix;
    for (const key of await bao.list(mount, here)) {
      if (key.endsWith("/")) await walk(rel ? `${rel}/${key.slice(0, -1)}` : key.slice(0, -1));
      else found.push(rel ? `${rel}/${key}` : key);
    }
  };
  await walk("");
  return found;
}

/** Stable JSON, so the verify comparison does not depend on key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/** Key names and sizes only — a secret's shape is safe to print, its values are not. */
function shape(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => (typeof v === "string" ? `${k}=<${v.length} chars>` : v && typeof v === "object" ? `${k}={${Object.keys(v as object).length} keys}` : `${k}=<${typeof v}>`))
    .join(" ");
}

const paths = recursive ? await leaves(srcMount, src) : [""];
if (recursive && paths.length === 0) die(`no secrets at or under ${srcMount}/${src}`);

let copied = 0;
let skipped = 0;
let destroyed = 0;
let failed = 0;

for (const rel of paths) {
  const from = rel ? `${src}/${rel}` : src;
  const to = rel ? `${dst}/${rel}` : dst;
  const label = `${srcMount}/${from} -> ${dstMount}/${to}`;

  try {
    const source: KvReadResult | undefined = await bao.read(srcMount, from);
    if (!source) {
      // In non-recursive mode this is usually a prefix typed without -r; say so
      // rather than reporting a bare 404 the caller has to interpret.
      const children = recursive ? [] : await bao.list(srcMount, from);
      console.log(`FAIL  ${label}: no secret at ${srcMount}/${from}${children.length ? ` (it is a prefix with ${children.length} children — pass --recursive)` : ""}`);
      failed++;
      continue;
    }

    const existing = await bao.read(dstMount, to);
    const identical = existing !== undefined && canonical(existing.data) === canonical(source.data);
    if (existing && !identical && !overwrite) {
      console.log(`SKIP  ${label}: destination exists (v${existing.metadata.version}) with different data — pass --overwrite to replace`);
      skipped++;
      continue;
    }
    if (identical) {
      // Already copied on an earlier run — no --overwrite needed to say so.
      // Falling through rather than skipping is what makes --move resumable
      // after an interruption between the write and the destroy.
      console.log(`SAME  ${label}: destination already matches (v${existing.metadata.version})`);
    } else {
      // CAS is what makes this safe to re-run: 0 creates only if absent, and
      // the read version updates only if nothing changed underneath.
      console.log(`${apply ? "COPY " : "PLAN "} ${label}  ${shape(source.data)}`);
      if (apply) {
        await bao.write(dstMount, to, source.data, existing ? existing.metadata.version : 0);
        if (copyMetadata) {
          const provenance = { ...(source.metadata.custom_metadata ?? {}) };
          // Preserve the source's labels and record the re-home on top, within
          // OpenBao's 64-key cap.
          if (Object.keys(provenance).length <= 62) {
            provenance.moved_from = `${srcMount}/${from}`;
            provenance.moved_at = new Date().toISOString();
          }
          if (Object.keys(provenance).length > 0) await bao.writeCustomMetadata(dstMount, to, provenance);
        }
      }
    }
    copied++;

    if (!move) continue;

    if (!apply) {
      console.log(`PLAN  destroy ${srcMount}/${from} (all ${source.metadata.version} version(s) + metadata)`);
      continue;
    }

    // Read the destination back before deleting anything. The write above
    // returned 204 with no body, so this is the only evidence the data landed
    // — and a delete is the one step here that cannot be undone.
    const written = await bao.read(dstMount, to);
    if (!written || canonical(written.data) !== canonical(source.data)) {
      console.log(`FAIL  ${label}: destination did not verify — source left in place`);
      failed++;
      continue;
    }
    await bao.destroy(srcMount, from);
    console.log(`DEL   ${srcMount}/${from} destroyed`);
    destroyed++;
  } catch (error) {
    console.log(`FAIL  ${label}: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

const verb = move ? "moved" : "copied";
console.log(`\n${apply ? `${copied} ${verb}, ${destroyed} source(s) destroyed` : `plan only — pass --apply to write; ${copied} would be ${verb}`}, ${skipped} skipped, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
