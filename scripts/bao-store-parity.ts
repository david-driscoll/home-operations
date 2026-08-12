#!/usr/bin/env -S npx tsx

/**
 * Phase 8 read-parity check: does `BaoStore` hand a stack the same object
 * `VaultStore` does?
 *
 * `op-to-bao --verify` already compares the two stores' DATA field by field.
 * This is a different question and the one that actually gates flipping
 * `BAO_STORE_READS`: the value can be identical and the *object* still differ —
 * a missing key, a field the 1Password Operator invented (`website`), or, worst
 * of all, a field that lost its `secret()` marker and would land in Pulumi
 * state in the clear. None of those show up in a `pulumi preview` diff.
 *
 * Every title here is one this repo names literally through
 * `globals.store.getSecretByTitle`. Keep the list in step with those call sites;
 * a credential that is not listed is not covered.
 *
 *   mise exec -- op run --no-masking -- npx tsx scripts/bao-store-parity.ts
 *
 * Env: CONNECT_HOST / CONNECT_TOKEN (1Password), plus BAO_ADDR and either
 * BAO_TOKEN or BAO_ROLE_ID/BAO_SECRET_ID — `eval "$(bootstrap/openbao/pulumi-env.sh)"`
 * in the vault repo exports the latter three.
 *
 * Exits non-zero on any mismatch, so it can gate a cutover in CI.
 */

import { BaoStore } from "@components/store/bao.ts";
import { VaultStore } from "@components/store/index.ts";
import { isSecret, type Output } from "@pulumi/pulumi";

/** Titles read via `getSecretByTitle` somewhere in stacks/ or components/. */
const TITLES = [
  "Alpha Site Proxmox ApiKey",
  "Cloudflare (driscoll.tech)",
  "Dockge Credential",
  "Eris Truenas Credentials",
  "Proxmox",
  "Proxmox ApiKey",
  "Rclone SFTP Key",
  "Tailscale Terraform OAuth Client",
  "Technitium ApiKey",
  "Unifi Api Key Eris Cluster",
  "Volsync Password",
  "minio root user",
];

const resolve = <T>(o: Output<T>): Promise<T> => new Promise(res => o.apply(v => (res(v), v)));

/**
 * `meta` is deliberately excluded from the value comparison.
 *
 * OpenBao has no notion of a 1Password category or item URL, so `meta.category`
 * and `meta.urls` do not exist on the OpenBao side by design — only
 * `meta.title` is consumed anywhere in this repo, and it is checked separately.
 */
function fields(item: Record<string, unknown>): Record<string, unknown> {
  const { meta: _meta, ...rest } = item;
  return rest;
}

/**
 * Deep key-sorted serialization. NOT `JSON.stringify(x, sortedKeys)` — a
 * replacer ARRAY filters properties at EVERY nesting depth, so any key that
 * exists only inside a section object (`ssh.username`, `backrest.privateKey`)
 * would be dropped from BOTH serializations and section-level drift would
 * compare equal. That bug shipped in the Phase 8 version of this file and
 * silently hollowed out the getDockgeInstances check until the Phase 9 port
 * review caught it (vault repo, docs/openbao-migration/STATUS.md).
 */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

function canonical(item: Record<string, unknown>): string {
  return JSON.stringify(stable(fields(item)));
}

let failures = 0;
const op = new VaultStore();
const bao = new BaoStore();

for (const title of TITLES) {
  try {
    const opItem = op.getSecretByTitle<Record<string, unknown>>(title);
    const baoItem = bao.getSecretByTitle<Record<string, unknown>>(title);
    const [a, b] = await Promise.all([resolve(opItem), resolve(baoItem)]);
    const [aSecret, bSecret] = await Promise.all([isSecret(opItem), isSecret(baoItem)]);

    const keysA = Object.keys(fields(a)).sort();
    const keysB = Object.keys(fields(b)).sort();
    const valuesMatch = canonical(a) === canonical(b);
    const secrecyMatches = aSecret === bSecret;
    const titleMatches = (a.meta as { title: string }).title === (b.meta as { title: string }).title;

    if (valuesMatch && secrecyMatches && titleMatches) {
      console.log(`OK    ${title}`);
      continue;
    }
    failures++;
    console.log(`DIFF  ${title}`);
    // Never print values — this runs with both stores open. Keys and flags are
    // enough to identify every failure mode this check exists for.
    if (!valuesMatch) {
      console.log(`        1Password keys: ${keysA.join(", ")}`);
      console.log(`        OpenBao   keys: ${keysB.join(", ")}`);
      const shared = keysA.filter(k => keysB.includes(k));
      const differing = shared.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      if (differing.length > 0) console.log(`        differing values in: ${differing.join(", ")}`);
    }
    if (!secrecyMatches) console.log(`        SECRET MARKER: 1Password=${aSecret} OpenBao=${bSecret}`);
    if (!titleMatches) console.log(`        meta.title: 1Password=${JSON.stringify(a.meta)} OpenBao=${JSON.stringify(b.meta)}`);
  } catch (error) {
    failures++;
    console.log(`FAIL  ${title}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// `getDockgeInstances` is the other overridden read, and it is the one where
// the two stores could disagree on the SET rather than on a value: 1Password
// finds items by tag, OpenBao by the `hosts/dockge/` path prefix, and an item
// tagged after the migration exists in one and not the other.
try {
  const [opItems, baoItems] = await Promise.all([resolve(op.getDockgeInstances()), resolve(bao.getDockgeInstances())]);
  const key = (items: readonly Record<string, unknown>[]) =>
    items
      .map(i => (i.meta as { title: string }).title)
      .sort()
      .join(", ");
  const byTitle = (items: readonly Record<string, unknown>[]) => new Map(items.map(i => [(i.meta as { title: string }).title, i]));
  const opByTitle = byTitle(opItems);
  const baoByTitle = byTitle(baoItems);

  if (key(opItems) !== key(baoItems)) {
    failures++;
    console.log("DIFF  getDockgeInstances (different sets)");
    console.log(`        tag:dockge        ${key(opItems)}`);
    console.log(`        hosts/dockge/     ${key(baoItems)}`);
  } else {
    const drifted = [...opByTitle].filter(([title, a]) => canonical(a) !== canonical(baoByTitle.get(title) as Record<string, unknown>));
    if (drifted.length > 0) {
      failures++;
      console.log("DIFF  getDockgeInstances");
      for (const [title, a] of drifted) {
        const b = baoByTitle.get(title) as Record<string, unknown>;
        console.log(`        ${title}`);
        console.log(`          1Password keys: ${Object.keys(fields(a)).sort().join(", ")}`);
        console.log(`          OpenBao   keys: ${Object.keys(fields(b)).sort().join(", ")}`);
      }
    } else {
      console.log(`OK    getDockgeInstances (${opItems.length})`);
    }
  }
} catch (error) {
  failures++;
  console.log(`FAIL  getDockgeInstances: ${error instanceof Error ? error.message : String(error)}`);
}

// Cluster definitions moved from 1Password items to checked-in code plus a
// credential read. That is the biggest shape change in Phase 8, so compare the
// whole set field by field — `meta.title` included, because it names Gatus
// groups and is written into PBS items.
try {
  const [opClusters, baoClusters] = await Promise.all([resolve(op.getAllClusters()), resolve(bao.getAllClusters())]);
  const byTitle = (items: readonly Record<string, unknown>[]) => new Map(items.map(i => [(i.meta as { title: string }).title, i]));
  const opBy = byTitle(opClusters as unknown as Record<string, unknown>[]);
  const baoBy = byTitle(baoClusters as unknown as Record<string, unknown>[]);

  const missing = [...opBy.keys()].filter(t => !baoBy.has(t));
  const extra = [...baoBy.keys()].filter(t => !opBy.has(t));
  if (missing.length || extra.length) {
    failures++;
    console.log(`DIFF  getAllClusters (set): missing=${missing.join(", ") || "none"} extra=${extra.join(", ") || "none"}`);
  }

  for (const [title, a] of opBy) {
    const b = baoBy.get(title);
    if (!b) continue;
    // `notesPlain` is intentionally dropped: it is human commentary and no code
    // reads it. Everything else must survive the move byte for byte.
    const drop = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "notesPlain" && k !== "meta"));
    const keysA = Object.keys(drop(a)).sort();
    const keysB = Object.keys(drop(b)).sort();
    const differing = keysA.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    const metaSame = JSON.stringify((a.meta as { title: string }).title) === JSON.stringify((b.meta as { title: string }).title);
    if (differing.length === 0 && keysA.join() === keysB.join() && metaSame) {
      console.log(`OK    ${title}`);
    } else {
      failures++;
      console.log(`DIFF  ${title}`);
      if (keysA.join() !== keysB.join()) {
        console.log(`        1Password keys: ${keysA.join(", ")}`);
        console.log(`        code+OpenBao  : ${keysB.join(", ")}`);
      }
      // Name the fields, never the values — `secret` and `arcane_token` are here.
      if (differing.length) console.log(`        differing: ${differing.join(", ")}`);
      if (!metaSame) console.log(`        meta.title differs`);
    }
  }
} catch (error) {
  failures++;
  console.log(`FAIL  getAllClusters: ${error instanceof Error ? error.message : String(error)}`);
}

// Cross-stack inventory: `Authentik Outputs` is produced by the authentik
// stack (dual-write, #717) and read back through the _inventory path. The two
// sides are compared section by section rather than through the generic TITLES
// loop because the 1Password item carries a `notesPlain` field the KV path
// deliberately does not — it is human commentary, `AuthentikOutputs` does not
// declare it, and no code reads it.
try {
  const title = "Authentik Outputs";
  const [a, b] = await Promise.all([resolve(op.getSecretByTitle<Record<string, unknown>>(title)), resolve(bao.getSecretByTitle<Record<string, unknown>>(title))]);
  const drop = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "notesPlain" && k !== "notePlain" && k !== "meta"));
  const keysA = Object.keys(drop(a)).sort();
  const keysB = Object.keys(drop(b)).sort();
  const differing = keysA.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  const titleMatches = (a.meta as { title: string }).title === (b.meta as { title: string }).title;
  if (keysA.join() === keysB.join() && differing.length === 0 && titleMatches) {
    console.log(`OK    ${title} (inventory)`);
  } else {
    failures++;
    console.log(`DIFF  ${title} (inventory)`);
    if (keysA.join() !== keysB.join()) {
      console.log(`        1Password keys: ${keysA.join(", ")}`);
      console.log(`        OpenBao   keys: ${keysB.join(", ")}`);
    }
    // These are Authentik object IDs, not credentials, but stay consistent
    // with the rest of this script: name the sections, never print values.
    if (differing.length) console.log(`        differing sections: ${differing.join(", ")}`);
    if (!titleMatches) console.log(`        meta.title differs`);
  }
} catch (error) {
  failures++;
  console.log(`FAIL  Authentik Outputs (inventory): ${error instanceof Error ? error.message : String(error)}`);
}

// Tailscale exports: produced by three stacks, consumed by unifi-network's ACL
// and DHCP generation — the read where a wrong SET quietly removes live
// config. Both stores shape through the same function, so what is compared
// here is the data each store found. This section FAILS until every producing
// stack has run its dual-write; that failing is the §G-8 gate doing its job —
// do not flip BAO_STORE_READS while it is red.
try {
  const [a, b] = await Promise.all([resolve(op.getTailscaleExports()), resolve(bao.getTailscaleExports())]);
  const aJson = JSON.stringify(a);
  const bJson = JSON.stringify(b);
  if (aJson === bJson) {
    console.log(`OK    getTailscaleExports (${a.length} stacks, ${a.reduce((n, e) => n + e.hosts.length, 0)} hosts)`);
  } else {
    failures++;
    console.log("DIFF  getTailscaleExports");
    console.log(`        tag:tailscale-export   ${a.map(e => `${e.name}(${e.hosts.length})`).join(", ")}`);
    console.log(`        _inventory/            ${b.map(e => `${e.name}(${e.hosts.length})`).join(", ")}`);
    // IPs and MACs are addressing, not credentials, but stay consistent with
    // the rest of this script: name the hosts, never print field values.
    for (const exp of a) {
      const other = b.find(e => e.name === exp.name);
      if (!other) continue;
      const drifted = exp.hosts.filter(h => JSON.stringify(h) !== JSON.stringify(other.hosts.find(o => o.name === h.name)));
      if (drifted.length || JSON.stringify(exp.services) !== JSON.stringify(other.services)) {
        console.log(`        ${exp.name}: differing hosts: ${drifted.map(h => h.name).join(", ") || "none"}${JSON.stringify(exp.services) !== JSON.stringify(other.services) ? "; services differ" : ""}`);
      }
    }
  }
} catch (error) {
  failures++;
  console.log(`FAIL  getTailscaleExports: ${error instanceof Error ? error.message : String(error)}`);
}

// Backup plans: produced by stacks/backups and both applications stacks,
// consumed by the three BackupPlanDirectors. A wrong SET here silently shrinks
// what gets backed up. Same gate semantics as getTailscaleExports: this
// section FAILS until every producing stack has run its dual-write — do not
// flip BAO_STORE_READS while it is red.
try {
  const [a, b] = await Promise.all([resolve(op.getBackupPlans<{ source: string; name: string }>()), resolve(bao.getBackupPlans<{ source: string; name: string }>())]);
  const key = (plans: { source: string; name: string }[]) =>
    plans
      .map(p => `${p.source}/${p.name}`)
      .sort()
      .join(", ");
  if (JSON.stringify([...a].sort((x, y) => `${x.source}/${x.name}`.localeCompare(`${y.source}/${y.name}`))) === JSON.stringify([...b].sort((x, y) => `${x.source}/${x.name}`.localeCompare(`${y.source}/${y.name}`)))) {
    console.log(`OK    getBackupPlans (${a.length} plans)`);
  } else {
    failures++;
    console.log("DIFF  getBackupPlans");
    console.log(`        tag:backup-plan   ${key(a)}`);
    console.log(`        _inventory/       ${key(b)}`);
  }
} catch (error) {
  failures++;
  console.log(`FAIL  getBackupPlans: ${error instanceof Error ? error.message : String(error)}`);
}

process.exit(failures === 0 ? 0 : 1);
