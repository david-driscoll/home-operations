#!/usr/bin/env -S npx tsx
/**
 * Execute the `secrets/shared/*` reorganisation described in
 * `docs/openbao-shared-secrets-reorg.md` and encoded in `./plan.ts`.
 *
 *   npx tsx scripts/bao-reorg --phase 1            # plan only, no mutation
 *   npx tsx scripts/bao-reorg --phase 1 --apply
 *   npx tsx scripts/bao-reorg --verify             # post-run drift check
 *   npx tsx scripts/bao-reorg --preflight          # can the destinations be read?
 *
 * Needs the `pulumi` AppRole, so run it through `mise run vals-run`:
 *
 *   mise run vals-run -- npx tsx scripts/bao-reorg --phase 2 --apply
 *
 * ## Why phases, and why 3 is gated
 *
 * `eso-<cluster>` can read `secrets/data/shared/*` and `secrets/data/clusters/*`
 * and nothing else. Phase 3 introduces `third-party-tokens/`, `apps/` and
 * `docker/` — new TOP-LEVEL prefixes that no ESO policy grants. Running phase 3
 * before those policies are widened does not fail here (the `pulumi` AppRole
 * holds `secrets/*` and will happily write); it fails LATER, as every
 * repointed ExternalSecret flipping to SecretSyncedError. So phase 3 refuses to
 * run without `--policies-widened`, which is a human asserting the root
 * ceremony happened. See the plan module's header.
 *
 * ## What this does NOT do
 *
 * Update consumers. `./rewrite.ts` does that, from the same plan, and it must
 * land in the same change. The ordering within a phase is always: widen policy
 * (phase 3 only) -> run this -> merge the rewrite -> reconcile -> verify.
 *
 * Values are never printed — only paths, field NAMES, and versions.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BaoClient } from "@components/bao.ts";
import { type Entry, type Phase, PLAN, RETIRED_PREFIX, retiredPath, type SplitEntry } from "./plan.ts";

const MOUNT = "secrets";
const HERE = dirname(fileURLToPath(import.meta.url));
const BAO_MOVE = join(HERE, "..", "bao-move.ts");

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const has = (...names: string[]) => names.some(n => argv.includes(n));

function die(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

const apply = has("--apply");
/**
 * Write destinations, never remove sources.
 *
 * This is the mode to use BEFORE the repo change merges. A move destroys the
 * source the moment it verifies, so running the default against a cluster still
 * reconciling the old paths breaks every consumer between the move and the
 * merge. Copy first, merge, confirm every ExternalSecret is SecretSynced, then
 * re-run the same command WITHOUT --copy: `bao-move` sees the destination
 * already matches, reports SAME, and proceeds to destroy the source.
 *
 * `delete` entries are skipped here — they have no destination to copy to, so
 * there is nothing safe for them to do in this mode.
 */
const copyOnly = has("--copy");
const verifyOnly = has("--verify");
const preflightOnly = has("--preflight");
const policiesWidened = has("--policies-widened");

const phaseArg = argv[argv.indexOf("--phase") + 1];
const phase = argv.includes("--phase") ? (Number(phaseArg) as Phase) : undefined;
if (argv.includes("--phase") && ![1, 2, 3, 4].includes(phase as number)) die("--phase must be 1, 2, 3 or 4");

if (has("--help", "-h")) {
  console.log("usage: bao-reorg [--phase 1|2|3|4] [--apply] [--copy] [--policies-widened] [--verify] [--preflight]");
  process.exit(0);
}

/**
 * Lazy, so `--preflight` and `--help` work with no credentials in the
 * environment. `new BaoClient()` throws on a missing BAO_ADDR, and the whole
 * point of --preflight is to be runnable before you have gone and got a token.
 */
let _bao: BaoClient | undefined;
const bao = (): BaoClient => (_bao ??= new BaoClient());

// ---------------------------------------------------------------------------
// Preflight — the check that catches the ACL trap before it becomes an outage
// ---------------------------------------------------------------------------

/** Top-level prefix of a path: `apps/proxmox/root` -> `apps`. */
const prefixOf = (path: string) => path.split("/")[0]!;

/** The prefixes `eso-<cluster>` grants today. Anything else needs a ceremony. */
const ESO_READABLE = new Set(["shared", "clusters"]);

/**
 * Destination prefixes that need a grant, with how many paths land on each.
 *
 * `retired/` is excluded: nothing reads it — that is what makes a path retired
 * — so granting ESO access to it would widen the policy for no consumer.
 */
function newPrefixes(): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (path: string) => {
    const p = prefixOf(path);
    if (ESO_READABLE.has(p) || p === RETIRED_PREFIX) return;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  };
  for (const entry of PLAN) {
    if (entry.kind === "move") bump(entry.to);
    if (entry.kind === "split") for (const dst of Object.keys(entry.into)) bump(dst);
  }
  return new Map([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

function preflight(): void {
  const prefixes = newPrefixes();
  console.log("Destination prefixes introduced by this plan:\n");
  for (const [p, count] of prefixes) {
    console.log(`  ${p}/  — ${count} path(s), NOT covered by any eso-* policy`);
  }
  console.log(`
Add these to eso-equestria (and eso-sgc while it exists) in the vault repo's
bootstrap/openbao/equestria-init.sh write_policies(), then apply them with a
root ceremony:
`);
  for (const p of prefixes.keys()) {
    console.log(`path "secrets/data/${p}/*"     { capabilities = ["read"] }`);
    console.log(`path "secrets/metadata/${p}/*" { capabilities = ["read", "list"] }`);
  }
  console.log(`
Pulumi needs nothing: the \`pulumi\` policy already holds \`secrets/*\`. Neither
do the Dockge \`.env\` files — they are resolved by the Pulumi-side vals pass in
DockgeLxc, under that same AppRole, never on the host.`);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Delegate a copy-then-destroy to `bao-move.ts`.
 *
 * Shelling out rather than reimplementing: bao-move already does the two things
 * that make a re-home safe — it refuses to clobber a destination that exists
 * with different data, and it reads the destination back and compares before it
 * destroys the source. Duplicating that logic here would mean two copies of the
 * only code path that can lose a secret.
 */
function move(from: string, to: string): boolean {
  const args = [BAO_MOVE, from, to, "--mount", MOUNT];
  if (!copyOnly) args.push("--move");
  if (apply) args.push("--apply");
  const result = spawnSync("npx", ["tsx", ...args], { stdio: "inherit", env: process.env });
  return result.status === 0;
}

/**
 * Remove named fields from a path that has already been copied.
 *
 * Separate from the copy because `bao-move` must stay a verbatim copier — it is
 * the only code path here that can lose a secret, and "except for these fields"
 * is not a property you want in it. Running after means an interruption leaves
 * the destination with the stray field still present, which is inert.
 */
async function prune(entry: MoveEntry, fields: string[]): Promise<boolean> {
  // In plan mode the destination does not exist yet — the copy above was only
  // described. Reading the SOURCE gives the same field list and keeps a dry run
  // from reporting a failure that is really just "nothing has happened yet".
  const path = apply ? entry.to : entry.from;
  const current = await bao().read(MOUNT, path);
  if (!current) {
    console.log(`FAIL  ${MOUNT}/${path}: cannot prune, path absent`);
    return false;
  }
  const present = fields.filter(f => f in current.data);
  if (present.length === 0) {
    console.log(`SAME  ${MOUNT}/${path}: nothing to prune`);
    return true;
  }
  console.log(`${apply ? "PRUNE" : "PLAN "} ${MOUNT}/${entry.to}: drop ${present.join(", ")}`);
  if (apply) {
    const kept = Object.fromEntries(Object.entries(current.data).filter(([k]) => !present.includes(k)));
    await bao().write(MOUNT, path, kept, current.metadata.version);
  }
  return true;
}

async function destroy(from: string): Promise<boolean> {
  const existing = await bao().read(MOUNT, from);
  if (!existing) {
    console.log(`GONE  ${MOUNT}/${from} — already absent`);
    return true;
  }
  console.log(`${apply ? "DEL  " : "PLAN "} destroy ${MOUNT}/${from} (v${existing.metadata.version}, ${Object.keys(existing.data).length} field(s))`);
  if (apply) await bao().destroy(MOUNT, from);
  return true;
}

/**
 * One blob -> many single-field paths.
 *
 * The destination field name drops the app prefix the flat layout needed:
 * `prowlarr_apikey` becomes `apikey` at `.../apps/prowlarr/api-key`, because the
 * path already said "prowlarr" and the useful half of the name is the KIND of
 * credential. `plan.ts` carries both names rather than deriving one from the
 * other — a stripping rule would be right sixteen times and wrong on
 * `nzbget_restricted_password`.
 */
async function split(entry: SplitEntry): Promise<boolean> {
  const source = await bao().read(MOUNT, entry.from);
  if (!source) {
    console.log(`FAIL  ${MOUNT}/${entry.from}: no such path`);
    return false;
  }

  const fields = new Set(Object.keys(source.data));
  const mapped = new Set([...Object.values(entry.into).map(t => t.field), ...entry.drop]);
  // A field nobody claimed would be destroyed silently along with the source.
  const unclaimed = [...fields].filter(f => !mapped.has(f));
  if (unclaimed.length > 0) {
    console.log(`FAIL  ${MOUNT}/${entry.from}: ${unclaimed.length} field(s) claimed by neither into{} nor drop[]: ${unclaimed.join(", ")}`);
    return false;
  }
  const missing = [...mapped].filter(f => !fields.has(f));
  if (missing.length > 0) console.log(`WARN  ${MOUNT}/${entry.from}: plan names ${missing.length} field(s) the path does not have: ${missing.join(", ")}`);

  let ok = true;
  for (const [to, { field, as }] of Object.entries(entry.into)) {
    const value = source.data[field];
    if (value === undefined) {
      console.log(`SKIP  ${MOUNT}/${to}: source has no '${field}'`);
      continue;
    }
    const existing = await bao().read(MOUNT, to);
    if (existing && existing.data[as] === value) {
      console.log(`SAME  ${MOUNT}/${to} (from ${field}) already matches`);
      continue;
    }
    if (existing) {
      console.log(`FAIL  ${MOUNT}/${to}: exists with different data — resolve by hand`);
      ok = false;
      continue;
    }
    console.log(`${apply ? "COPY " : "PLAN "} ${MOUNT}/${entry.from}#${field} -> ${MOUNT}/${to}#${as}  <${String(value).length} chars>`);
    if (apply) {
      await bao().write(MOUNT, to, { [as]: value }, 0);
      await bao().writeCustomMetadata(MOUNT, to, {
        ...(source.metadata.custom_metadata ?? {}),
        concealed_fields: as,
        split_from: `${MOUNT}/${entry.from}#${field}`,
      });
    }
  }

  if (entry.drop.length > 0) console.log(`DROP  ${entry.drop.join(", ")} — deliberately not carried anywhere`);
  // The source is left in place. Unlike a move there is no single destination to
  // read back, and `spike-management-credentials` is rebuilt from the pieces —
  // so the blob stays until that Secret is confirmed byte-identical, then goes
  // in a second pass with `--phase 4 --drop-source`.
  console.log(`KEEP  ${MOUNT}/${entry.from} left in place — delete it once spike-management-credentials verifies`);
  return ok;
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

async function verify(): Promise<number> {
  let bad = 0;
  for (const entry of PLAN) {
    const src = await bao().read(MOUNT, entry.from);
    switch (entry.kind) {
      case "move": {
        const dst = await bao().read(MOUNT, entry.to);
        if (!dst) {
          console.log(`MISSING   ${entry.to}`);
          bad++;
        } else if (src && !copyOnly) {
          console.log(`BOTH      ${entry.from} and ${entry.to} exist — source not destroyed`);
          bad++;
        }
        break;
      }
      case "retire": {
        const dst = await bao().read(MOUNT, retiredPath(entry.from));
        if (!dst) {
          console.log(`MISSING   ${retiredPath(entry.from)}`);
          bad++;
        } else if (src && !copyOnly) {
          console.log(`BOTH      ${entry.from} and its retired/ copy exist`);
          bad++;
        }
        break;
      }
      case "delete":
        if (src && !copyOnly) {
          console.log(`PRESENT   ${entry.from} — should be destroyed`);
          bad++;
        }
        break;
      case "split":
        for (const to of Object.keys(entry.into)) {
          if (!(await bao().read(MOUNT, to))) {
            console.log(`MISSING   ${to}`);
            bad++;
          }
        }
        break;
    }
  }
  console.log(bad === 0 ? "\nplan fully applied" : `\n${bad} discrepanc${bad === 1 ? "y" : "ies"}`);
  return bad;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (preflightOnly) {
  preflight();
  process.exit(0);
}

if (verifyOnly) {
  process.exit((await verify()) === 0 ? 0 : 1);
}

if (phase === undefined) die("pass --phase 1|2|3|4 (or --verify / --preflight). There is no 'run everything': phase 3 is gated on a root ceremony.");

// The gate is about CONSUMERS, not about writes, so it does not apply to
// --copy. A copy destroys nothing and switches nothing: the new paths simply
// exist, unread, until the repo change merges. Landing the data ahead of the
// ceremony is strictly safer sequencing — when the policies do go in, there is
// nothing left to do but merge. The gate still stands for the reap pass, which
// is the one that leaves consumers with only the new spelling.
if (phase === 3 && !policiesWidened && !copyOnly) {
  console.error(`Phase 3 moves secrets to top-level prefixes no eso-* policy grants:\n`);
  preflight();
  console.error(`\nRun 'bao-reorg --preflight' for the HCL, apply it with a root ceremony,
then re-run with --policies-widened to assert it happened.

To land the DATA ahead of that ceremony, add --copy: it writes the new paths,
destroys nothing, and switches no consumer.`);
  process.exit(2);
}

const work: Entry[] = PLAN.filter(e => e.phase === phase);
console.log(`phase ${phase}: ${work.length} entr${work.length === 1 ? "y" : "ies"}${apply ? "" : " (plan only — pass --apply)"}${copyOnly ? " [--copy: sources are left in place]" : ""}\n`);

let failed = 0;
for (const entry of work) {
  switch (entry.kind) {
    case "move":
      if (!move(entry.from, entry.to)) failed++;
      else if (entry.dropFields?.length) if (!(await prune(entry, entry.dropFields))) failed++;
      break;
    case "retire":
      if (!move(entry.from, retiredPath(entry.from))) failed++;
      break;
    case "delete":
      if (copyOnly) {
        console.log(`HOLD  ${MOUNT}/${entry.from}: destroy deferred — --copy never removes anything`);
        break;
      }
      if (!(await destroy(entry.from))) failed++;
      break;
    case "split":
      if (!(await split(entry))) failed++;
      break;
  }
}

console.log(`\nphase ${phase} ${apply ? "applied" : "planned"}: ${work.length - failed} ok, ${failed} failed`);
if (copyOnly && apply) console.log("sources left in place. Merge the repo change, confirm every consumer is healthy, then re-run this without --copy to reap them.");
process.exit(failed === 0 ? 0 : 1);
