/**
 * Cluster definitions — Phase 8 of the 1Password→OpenBao migration.
 *
 * These were six 1Password items tagged `cluster-definition`, read through
 * `findItemsByTag`. They are not credentials and nothing generates them: they
 * are hand-maintained configuration — a key, a couple of domains, and some
 * image URLs — that happened to live in a secret store because that is where
 * the tag lookup worked.
 *
 * PLAN §G wanted them in Pulumi stack outputs behind a `StackReference`. That
 * is not possible: every stack in this repo has its own DIY backend
 * (`s3://home-operations/<stack>`), so `stacks/unifi-network` cannot reference
 * `stacks/home`. Estate decision 2026-08-10: since no stack PRODUCES a cluster
 * definition, there is no cross-stack channel to build — the definitions are
 * just config, reviewable in git and diffable in a PR, which is strictly better
 * than either store.
 *
 * One YAML file per cluster in `/clusters` at the repo root, named for its
 * `key`. Adding a cluster is adding a file, and the diff for a domain change is
 * one line rather than a hunk in the middle of a TypeScript array. They sit at
 * the root because they are estate configuration someone edits deliberately,
 * not an implementation detail of the store that happens to read them.
 *
 * ## Nothing in those files is secret
 *
 * `secret` (the kubernetes clusters' shared substitution key) and
 * `arcane_token` are real credentials and stay in a secret store, read from
 * `secrets/clusters/<key>/cluster`. The YAML names WHICH field a cluster has
 * (`secretField`) and never its value. If you are about to add a field whose
 * value is sensitive, it belongs at that path instead.
 *
 * ## `title` vs `sourceTitle`
 *
 * Both exist and they differ. `title` is the display name (`Celestia`);
 * `sourceTitle` is the 1Password item title (`Cluster: Celestia`), surfaced as
 * `meta.title`, and is what `ProxmoxBackupServerLxc` writes into its `cluster`
 * field and what names a Gatus group. Changing either is a user-visible
 * rename, so both are written out rather than derived from one another.
 *
 * ## Validation is not optional here
 *
 * As TypeScript literals these were typechecked. YAML is not, and a mistyped
 * key would surface as `undefined` deep inside a provider call — or worse,
 * silently render an empty string into a URL. `loadClusters()` therefore
 * validates every field and fails loudly at module load, which is the moment
 * a human is looking at the error.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "yaml";
import type { ClusterDefinition } from "./interfaces.ts";

// Repo root, not next to this file: these are estate configuration a human
// edits, not internals of the store implementation. `components/store/` is
// two levels down.
const CLUSTERS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "clusters");

/** The credential field a cluster owns, or null when it has none. */
export type ClusterSecretField = "secret" | "arcane_token";

/** The 1Password item title, retained because consumers read `meta.title`. */
export type ClusterEntry = ClusterDefinition & {
  readonly sourceTitle: string;
  readonly secretField: ClusterSecretField | null;
};

const CLUSTER_TYPES = ["dockge", "kubernetes"] as const;
const LOCATIONS = ["home", "remote"] as const;
const SECRET_FIELDS: readonly ClusterSecretField[] = ["secret", "arcane_token"];

/** Fields every cluster must declare. `secretField` is checked separately — it is nullable. */
const REQUIRED = ["sourceTitle", "key", "title", "type", "location", "rootDomain", "authentikDomain", "icon", "favicon", "background"] as const;

/**
 * Exported for its tests: this is the whole of what the TypeScript compiler
 * used to do for this data.
 */
export function parseCluster(file: string, raw: unknown): ClusterEntry {
  const where = `clusters/${file}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${where}: expected a YAML mapping`);
  const doc = raw as Record<string, unknown>;

  for (const field of REQUIRED) {
    const value = doc[field];
    if (typeof value !== "string" || value === "") throw new Error(`${where}: '${field}' must be a non-empty string`);
  }

  // An unknown key is almost always a typo for a real one, and silently
  // ignoring it is how a cluster ends up with a default nobody chose.
  const known = new Set<string>([...REQUIRED, "secretField"]);
  const unknown = Object.keys(doc).filter(k => !known.has(k));
  if (unknown.length > 0) throw new Error(`${where}: unknown field(s) ${unknown.join(", ")} — remove them or add them to REQUIRED`);

  const key = doc.key as string;
  // The filename is how `clusterSecretPath` and the OpenBao layout line up, so
  // a mismatch would read another cluster's credential.
  if (file !== `${key}.yaml`) throw new Error(`${where}: 'key' is '${key}' but the file is named '${file}' — they must match`);

  const type = doc.type as string;
  if (!CLUSTER_TYPES.includes(type as (typeof CLUSTER_TYPES)[number])) throw new Error(`${where}: 'type' must be one of ${CLUSTER_TYPES.join(" | ")}, got '${type}'`);

  const location = doc.location as string;
  if (!LOCATIONS.includes(location as (typeof LOCATIONS)[number])) throw new Error(`${where}: 'location' must be one of ${LOCATIONS.join(" | ")}, got '${location}'`);

  // Explicit rather than optional: a cluster added without deciding about its
  // credential should fail here, not quietly read nothing. `null` is the way
  // to say "this one genuinely has none" (celestia).
  if (!("secretField" in doc)) throw new Error(`${where}: 'secretField' is required — use 'null' if this cluster has no credential`);
  const secretField = doc.secretField;
  if (secretField !== null && !SECRET_FIELDS.includes(secretField as ClusterSecretField)) {
    throw new Error(`${where}: 'secretField' must be null or one of ${SECRET_FIELDS.join(" | ")}, got ${JSON.stringify(secretField)}`);
  }

  return {
    ...(doc as unknown as ClusterDefinition),
    secretField: secretField as ClusterSecretField | null,
    // The kubernetes definitions carry a `secret` field in their type. The
    // value is spread in from OpenBao by the caller; this placeholder only
    // satisfies the shape, and is always overwritten.
    ...(type === "kubernetes" ? { secret: "" } : {}),
  } as ClusterEntry;
}

function loadClusters(): readonly ClusterEntry[] {
  const files = readdirSync(CLUSTERS_DIR)
    .filter(f => f.endsWith(".yaml"))
    // Sorted by filename, which the key check pins to the cluster key. Several
    // callers derive Pulumi inputs from `getAllClusters()`, and an unstable
    // order means spurious diffs — the same class of churn as the
    // trigger-ordering bug in DockgeLxc.
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) throw new Error(`no cluster definitions found in ${CLUSTERS_DIR}`);

  const clusters = files.map(file => parseCluster(file, yaml.parse(readFileSync(join(CLUSTERS_DIR, file), "utf8"))));

  const titles = new Set<string>();
  for (const c of clusters) {
    // Duplicate sourceTitles would make clusterBySourceTitle() silently return
    // whichever sorted first.
    if (titles.has(c.sourceTitle)) throw new Error(`duplicate sourceTitle '${c.sourceTitle}' across cluster definitions`);
    titles.add(c.sourceTitle);
  }
  return clusters;
}

export const CLUSTERS: readonly ClusterEntry[] = loadClusters();

/**
 * Which clusters carry a credential field, and which one.
 *
 * Derived from the YAML rather than maintained alongside it — the decision
 * lives with the cluster it belongs to.
 */
export const CLUSTER_SECRET_FIELDS: Readonly<Record<string, ClusterSecretField>> = Object.fromEntries(CLUSTERS.filter(c => c.secretField !== null).map(c => [c.key, c.secretField as ClusterSecretField]));

/**
 * Where a cluster's credential lives in the `secrets` mount.
 *
 * Named for the CONSUMER, not for a generic per-cluster bucket, matching the
 * `clusters/<key>/apps/<app>/oidc` paths Phase 8a already writes:
 *
 *   arcane_token  ->  clusters/<key>/arcane-agent   the arcane-agent's token
 *   secret        ->  clusters/<key>/cluster        the cluster-wide Flux
 *                                                   substitution key, which
 *                                                   belongs to no single app
 *
 * A single `clusters/<key>/cluster` holding both would mean a consumer that
 * only needs the arcane token has to be granted the substitution key too, and
 * the ACL cannot separate them once they share a path.
 */
export function clusterSecretPath(key: string, field: ClusterSecretField): string {
  return field === "arcane_token" ? `clusters/${key}/arcane-agent` : `clusters/${key}/cluster`;
}

/** Look up by the 1Password item title callers still pass (`Cluster: Luna`). */
export function clusterBySourceTitle(title: string): ClusterEntry | undefined {
  return CLUSTERS.find(c => c.sourceTitle === title);
}
