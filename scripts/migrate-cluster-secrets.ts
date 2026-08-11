#!/usr/bin/env -S npx tsx
/**
 * One-time: move the cluster definitions' CREDENTIAL fields into OpenBao.
 *
 * Phase 8 turns the cluster definitions into checked-in code
 * (`components/store/clusters.ts`), but two of their fields are real secrets
 * and cannot go in git: `secret` (the kubernetes clusters' shared substitution
 * key) and `arcane_token`. Those move to `secrets/clusters/<key>/cluster`.
 *
 * `op-to-bao` deliberately skipped this family — its classifier routes anything
 * tagged `cluster-definition` to `clusters/_inventory/…` and marks it
 * `skip: true` as inventory. That was the right call for the definition as a
 * whole and the wrong one for these two fields, which is why this exists
 * separately rather than as a mapping.yaml edit.
 *
 *   --plan    report what would be written (default; no writes)
 *   --apply   write
 *
 * Values are never printed, only field names and lengths.
 *
 * NOT idempotent-by-overwrite: --apply uses CAS 0, so it creates and refuses to
 * clobber an existing path. Re-running after a real rotation is therefore a
 * deliberate act, not an accident.
 *
 * Leaves `clusters/_inventory/cluster-alpha-site` alone. That path was migrated
 * separately because `dynacat-env` reads it through ESO, so it is a live
 * consumer contract, not a leftover.
 */

import { BaoClient, baoProvenance } from "@components/bao.ts";
import { OPClient } from "@components/op.ts";
import { CLUSTER_SECRET_FIELDS, CLUSTERS, clusterBySourceTitle, clusterSecretPath } from "@components/store/clusters.ts";

const apply = process.argv.includes("--apply");
const op = new OPClient();
const bao = new BaoClient();

let written = 0;
let failed = 0;

for (const [key, field] of Object.entries(CLUSTER_SECRET_FIELDS)) {
  const cluster = CLUSTERS.find(c => c.key === key);
  if (!cluster) {
    console.log(`FAIL  ${key}: no entry in CLUSTERS`);
    failed++;
    continue;
  }

  const item = await op.getItemByTitle(cluster.sourceTitle);
  const value = item.fields?.[field]?.value;
  if (!value) {
    console.log(`FAIL  ${key}: '${cluster.sourceTitle}' has no ${field}`);
    failed++;
    continue;
  }

  const path = clusterSecretPath(key);
  const existing = await bao.read("secrets", path);
  if (existing) {
    // Report rather than diff-and-skip: comparing would mean holding both
    // values, and the point of CAS 0 is that this script never decides an
    // existing secret is stale.
    console.log(`SKIP  ${path} already exists (v${existing.metadata.version}) — not overwriting`);
    continue;
  }

  console.log(`${apply ? "WRITE" : "PLAN "} ${path}  ${field}=<${String(value).length} chars>  from '${cluster.sourceTitle}'`);
  if (!apply) continue;

  try {
    await bao.write("secrets", path, { [field]: value }, 0);
    await bao.writeCustomMetadata("secrets", path, {
      ...Object.fromEntries(Object.entries(baoProvenance()).map(([k, v]) => [k, String(v)])),
      source: "scripts/migrate-cluster-secrets.ts",
      source_title: cluster.sourceTitle,
      source_uuid: item.id,
      concealed_fields: field,
      contains_secrets: "true",
    });
    written++;
  } catch (error) {
    console.log(`FAIL  ${path}: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

// Every title a stack passes to getCluster() must resolve, or the read falls
// through to 1Password at runtime instead of failing here where it is visible.
for (const title of ["Cluster: Celestia", "Cluster: Alpha Site", "Cluster: Luna", "Cluster: Skystar", "Cluster: Stargate Command", "Cluster: Equestria"]) {
  if (!clusterBySourceTitle(title)) {
    console.log(`FAIL  '${title}' has no CLUSTERS entry`);
    failed++;
  }
}

console.log(`\n${apply ? `${written} written` : "plan only — pass --apply to write"}, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
