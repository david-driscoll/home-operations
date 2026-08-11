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

function canonical(item: Record<string, unknown>): string {
  return JSON.stringify(fields(item), Object.keys(fields(item)).sort());
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

const checks = TITLES.length + 1;
console.log(failures === 0 ? `\n${checks}/${checks} in parity` : `\n${failures} of ${checks} mismatched`);
process.exit(failures === 0 ? 0 : 1);
