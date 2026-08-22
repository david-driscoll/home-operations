#!/usr/bin/env -S npx tsx
/**
 * Rewrite every repo reference to a moved `secrets/shared/*` path.
 *
 *   npx tsx scripts/bao-reorg/rewrite.ts            # report, change nothing
 *   npx tsx scripts/bao-reorg/rewrite.ts --apply
 *
 * Driven by the same `./plan.ts` the KV move is driven by, because a rewrite
 * that disagrees with the move is either a 404 or a stale read, and both are
 * silent until something needs the credential.
 *
 * ## What it matches
 *
 * The literal `shared/<slug>`, wherever it appears — which covers all four
 * addressing styles the estate uses:
 *
 *   key: shared/<slug>                        ExternalSecret
 *   ref+openbao://secrets/shared/<slug>#/f    vals, in .env / .toml / compose
 *   secrets/data/shared/<slug>                the KV v2 data path (replica canary)
 *   "shared/<slug>"                           a Pulumi string literal
 *
 * The trailing guard `(?![\w-])` is load-bearing: without it `shared/n8n`
 * also matches inside `shared/n8n-api-key`, which is a different secret with a
 * different destination. The leading guard is only `(?<![\w-])` — it must NOT
 * exclude `/`, or every `secrets/shared/<slug>` reference (i.e. every vals
 * reference and the replica canary) silently fails to match while the
 * `key: shared/<slug>` form still does, which looks like success.
 *
 * ## What it CANNOT do
 *
 * Pulumi call sites that address a secret by its 1Password TITLE. `shared/<x>`
 * never appears in those files — `resolveBaoPath` derives it at runtime — so
 * there is no string to replace. `verifyTitles()` lists them and the run refuses
 * to report success while any still resolve into `shared/`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { PLAN, retiredPath, rewrites } from "./plan.ts";

const apply = process.argv.includes("--apply");

/**
 * Files this must not touch.
 *
 * Everything here is a DATED RECORD rather than a live reference. The worksheet
 * states where each secret used to live; `docs/cluster-consolidation/*` quotes
 * file contents alongside the commit and timestamp that produced them
 * ("Landed 2026-08-12 18:25, commit 090d1d4d"). Rewriting either makes the
 * account disagree with the history it cites, which is worse than a stale path
 * in prose. `plan.ts` is the plan itself, for the same reason.
 */
const EXCLUDE = [/^docs\/openbao-shared-secrets-reorg\.md$/, /^docs\/cluster-consolidation\//, /^scripts\/bao-reorg\//, /^node_modules\//, /\.sops\./];

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter(f => !EXCLUDE.some(re => re.test(f)));

const map = rewrites();

/** Escape a path for use inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let changedFiles = 0;
let totalHits = 0;
const perPath = new Map<string, number>();

for (const file of files) {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // binary or unreadable — nothing to rewrite
  }
  if (!content.includes("shared/")) continue;

  let updated = content;
  const hits: string[] = [];
  for (const [from, to] of map) {
    // Longest-first is not needed thanks to the trailing guard, but the guard
    // is what makes that true — do not remove it.
    const re = new RegExp(`(?<![\\w-])${escapeRe(from)}(?![\\w-])`, "g");
    const count = (updated.match(re) ?? []).length;
    if (count === 0) continue;
    updated = updated.replace(re, to);
    hits.push(`${from} -> ${to} (${count})`);
    perPath.set(from, (perPath.get(from) ?? 0) + count);
    totalHits += count;
  }
  if (updated === content) continue;

  changedFiles++;
  console.log(`${apply ? "WRITE" : "PLAN "} ${file}`);
  for (const hit of hits) console.log(`        ${hit}`);
  if (apply) writeFileSync(file, updated);
}

// ---------------------------------------------------------------------------
// The references a regex cannot reach
// ---------------------------------------------------------------------------

/**
 * Moves and retirements with no textual hit anywhere.
 *
 * Two innocent reasons and one guilty one. Innocent: the path is addressed by
 * 1Password title through `resolveBaoPath`, or it genuinely has no consumer
 * (which is why it is being retired). Guilty: a consumer spells the path in a
 * way this regex does not see. Printing the list is how the third case gets
 * noticed instead of shipping.
 */
const untouched = PLAN.filter(e => (e.kind === "move" || e.kind === "retire") && !perPath.has(e.from));
if (untouched.length > 0) {
  console.log(`\n${untouched.length} planned path(s) with no textual reference in the repo:`);
  for (const entry of untouched) {
    const dest = entry.kind === "move" ? entry.to : retiredPath(entry.from);
    console.log(`        ${entry.from} -> ${dest}`);
  }
  console.log(`
Expected for retirements (no consumer is the point) and for the title-addressed
Pulumi reads, which resolve through components/store/bao.ts resolveBaoPath and
must be edited there by hand. Anything else in this list is a reference this
rewrite failed to see.`);
}

console.log(`\n${apply ? "rewrote" : "would rewrite"} ${totalHits} reference(s) across ${changedFiles} file(s)`);

// A leftover `shared/…` that the plan claims to have moved means a consumer is
// pointed at a path the move is about to destroy.
if (apply) {
  const stragglers: string[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const from of map.keys()) {
      if (new RegExp(`(?<![\\w-])${escapeRe(from)}(?![\\w-])`).test(content)) stragglers.push(`${file}: ${from}`);
    }
  }
  if (stragglers.length > 0) {
    console.error(`\n${stragglers.length} reference(s) survived the rewrite:`);
    for (const s of stragglers) console.error(`        ${s}`);
    process.exit(1);
  }
}
