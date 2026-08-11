/**
 * OpenBao-backed reads for Pulumi — Phase 8 of the 1Password→OpenBao migration
 * (vault repo: docs/openbao-migration/PLAN.md §D.3, §G).
 *
 * `VaultStore` is the seam PLAN §D.3 identified: every stack reaches secrets
 * through `globals.store`, so reimplementing its reads against OpenBao covers
 * the whole repo without touching a single stack file. `BaoStore` is that
 * reimplementation.
 *
 * ## It extends rather than replaces, on purpose
 *
 * Phase 8 has four independent halves (secret reads, the `vals` resolver,
 * cross-stack inventory, retiring `dynamic/1password/`) and they cannot land
 * together. `BaoStore extends VaultStore` and overrides ONLY what OpenBao can
 * serve today; everything else keeps the inherited 1Password implementation and
 * moves over in its own commit. The alternative — a parallel class behind an
 * interface — means two code paths for every method, including the ten that are
 * not changing yet.
 *
 * Still on 1Password after this file (each is a later slice):
 *
 *   proxmoxBackupServers           its items reference dockge/cluster items by
 *                                  title; moves once those reads are proven
 *   replaceOnePasswordPlaceholders `vals` replaces it (PLAN §D.1)
 *
 * ## Field shapes carry over unchanged
 *
 * `op-to-bao` wrote 1Password fields to KV verbatim — root fields as top-level
 * keys, sections as nested objects, files as `{filename, content_b64, sha256}`.
 * So the object this hands a stack is the same object `getSecretItem` built,
 * and the interfaces with spaces in their keys (`SshKeyDefinition`'s
 * `"private key"`) still line up. That is a PULUMI-side fact only: ESO's
 * providers sanitise key names where OpenBao does not, which is the trap
 * `sgc/home-assistant-ssh` fell into (STATUS.md, Phase 7).
 *
 * ## Secrecy comes from custom_metadata, not from the value
 *
 * 1Password's Concealed field type is what `getSecretItem` marks `secret()`.
 * OpenBao has no field types, so `op-to-bao` recorded the set as
 * `custom_metadata.concealed_fields` — comma-joined, dotted for section fields
 * (`ssh.password`). A KV v2 data read returns custom_metadata inline, so this
 * costs no extra round trip. A path that lost that list would silently
 * downgrade every value to plaintext in Pulumi state, so a path marked
 * `contains_secrets: true` with no `concealed_fields` is an error here, not
 * "nothing is secret".
 */

import { all, log, type Output, output, secret } from "@pulumi/pulumi";
import { BaoClient, baoSlug } from "../bao.ts";
import { CLUSTERS, type ClusterEntry, clusterBySourceTitle, clusterSecretPath } from "./clusters.ts";
import { shapeBackupPlans, shapeTailscaleExports, VaultStore } from "./index.ts";
import type { Meta } from "./interfaces.ts";

/** The KV v2 mount every credential lives in. `docs` holds reference material. */
const SECRETS_MOUNT = "secrets";

/**
 * Where cross-stack inventory lives (PLAN §G-8) — values PRODUCED by one
 * Pulumi stack and read by others, dual-written because `StackReference`
 * cannot cross this repo's per-stack backends.
 */
const INVENTORY_PREFIX = "clusters/_inventory";

/** Key prefix of one stack's tailscale export: `tailscale-export-<stack>`. */
const TAILSCALE_EXPORT_PREFIX = "tailscale-export-";

/**
 * The stacks that call `TailscaleMonitor.exportNodeStateToOnePassword` today.
 * `getTailscaleExports` refuses a partial set — see the override for why.
 */
const TAILSCALE_EXPORT_STACKS = ["gulf-of-mexico", "home-operations", "ocracoke"];

/**
 * The plans `BackupPlanOrchestrator.savePlan` produces today: `Backup Plan`
 * from stacks/backups, `<Cluster Title> Backup Plan` from each applications
 * stack. `getBackupPlans` refuses a partial set — see the override for why.
 */
const BACKUP_PLAN_KEYS = ["backup-plan", "equestria-backup-plan", "stargate-command-backup-plan"];

/**
 * Whether stacks read secrets from OpenBao instead of 1Password.
 *
 * Explicit rather than inferred from credential presence. The Phase 8a
 * dual-write gate inferred, and an AppRole run then authenticated fine and
 * silently skipped every write while `pulumi up` reported success (STATUS.md,
 * "OIDC is live"). The same failure mode here would be worse: a silent
 * fallback means nobody can tell which store a value came from, and the two
 * agree only for as long as dual-run holds.
 */
export function baoStoreReadsEnabled(): boolean {
  const v = (process.env.BAO_STORE_READS ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** A KV path shaped like a 1Password item. */
type BaoItem = Record<string, unknown> & Meta;

export class BaoStore extends VaultStore {
  private readonly bao: BaoClient;
  /**
   * One read per path per process. Stacks ask for the same credential from
   * several components (`Tailscale Terraform OAuth Client` is read twice in
   * `globals.ts` alone), and `OPClient` memoises for the same reason.
   */
  private readonly cache = new Map<string, Output<BaoItem>>();

  constructor(bao?: BaoClient) {
    super();
    // Constructed lazily by default so building a BaoStore does not demand
    // credentials on a stack that never reads one.
    this.bao = bao ?? new BaoClient();
  }

  /**
   * Read a KV path and shape it like `getSecretItem` output. `path` is within
   * the `secrets` mount, no leading slash — e.g.
   * `shared/cloudflare-driscoll-tech`.
   */
  public getSecretByPath<T>(path: string): Output<T & Meta> {
    return this.read(path) as Output<T & Meta>;
  }

  /**
   * The 1Password title a stack still names, resolved to its OpenBao path —
   * or read from 1Password when no OpenBao path exists.
   *
   * Call sites move to `getSecretByPath` over time; this exists so they do not
   * all have to move at once. See `resolveBaoPath` for why a single default
   * rule is not enough.
   */
  public override getSecretByTitle<T>(title: string): Output<T & Meta> {
    const resolved = resolveBaoPath(title);
    if (resolved.path) return this.getSecretByPath<T>(resolved.path);
    // Warn, every time, naming the reason. These are enumerated exceptions,
    // not a blanket "try OpenBao, fall back if it 404s" — that would turn a
    // typo'd path, or a secret deleted from OpenBao, into a silent read of a
    // stale 1Password copy that nothing would ever surface.
    log.warn(`${title}: reading from 1Password — ${resolved.reason}`);
    return this.getOnePasswordItemByTitle<T>(title) as Output<T & Meta>;
  }

  /**
   * Cluster definitions come from git, their two credential fields from
   * OpenBao. Neither store is involved in the shape any more — see
   * `store/clusters.ts` for why code beat both.
   */
  public override getCluster(title: string) {
    const entry = clusterBySourceTitle(title);
    if (!entry) throw new Error(`no cluster definition titled '${title}' — add a definition under /clusters (known: ${CLUSTERS.map(c => c.sourceTitle).join(", ")})`);
    return this.hydrateCluster(entry) as ReturnType<VaultStore["getCluster"]>;
  }

  public override getAllClusters() {
    return all(CLUSTERS.map(entry => this.hydrateCluster(entry))) as ReturnType<VaultStore["getAllClusters"]>;
  }

  /**
   * Merge a checked-in definition with its credential field.
   *
   * The `secret`/`arcane_token` value is read from `clusters/<key>/cluster` and
   * spread in LAST, so the empty placeholder in `clusters.ts` can never win. A
   * cluster with no credential (celestia) reads nothing at all rather than
   * reading a path that does not exist.
   */
  private hydrateCluster(entry: ClusterEntry): Output<Record<string, unknown>> {
    const field = entry.secretField;
    // `sourceTitle` and `secretField` are loader bookkeeping, not part of the
    // definition a stack consumes — leaving either in would add a key the
    // 1Password shape never had.
    const { sourceTitle, secretField: _secretField, ...definition } = entry;
    const base = { ...definition, meta: { title: sourceTitle, tags: ["cluster-definition"] } };
    if (!field) return output(base);
    return this.getSecretByPath<Record<string, unknown>>(clusterSecretPath(entry.key, field)).apply(secretItem => ({
      ...base,
      [field]: secretItem[field],
    }));
  }

  /**
   * `tag:dockge` became the `hosts/dockge/` prefix — a KV LIST is what
   * reproduces `findItemsByTag`, which has no KV v2 equivalent.
   */
  public override getDockgeInstances() {
    return this.listUnder("hosts/dockge") as ReturnType<VaultStore["getDockgeInstances"]>;
  }

  /**
   * `tag:tailscale-export` became the `tailscale-export-*` keys under
   * `clusters/_inventory/` — one per producing stack, dual-written by
   * `TailscaleMonitor` at the paths mapping.yaml reserves.
   *
   * An incomplete set (including an empty one) is an ERROR, never a smaller
   * result — see `tailscaleExportKeys`. This feeds ACL grants and DHCP
   * reservations in `stacks/unifi-network`; a reader switched before the
   * producers ran would compute an empty estate and start REMOVING live
   * config — the exact §G-8 failure, made loud.
   */
  public override getTailscaleExports() {
    return output(this.bao.list(SECRETS_MOUNT, INVENTORY_PREFIX))
      .apply(keys =>
        all(
          tailscaleExportKeys(keys).map(key => {
            assertNotDirectory(INVENTORY_PREFIX, key);
            return this.read(`${INVENTORY_PREFIX}/${key}`);
          }),
        ),
      )
      .apply(items => shapeTailscaleExports(items)) as ReturnType<VaultStore["getTailscaleExports"]>;
  }

  /**
   * `tag:backup-plan` became the `*backup-plan` keys under
   * `clusters/_inventory/` — one per producing stack, dual-written by
   * `BackupPlanOrchestrator.savePlan`.
   *
   * Same refusal as `getTailscaleExports`, same reason: the three
   * `BackupPlanDirector`s create backrest plans from this list, so a torn
   * inventory quietly shrinks the set of things being backed up — a failure
   * with no symptom until a restore is needed. See `backupPlanKeys`.
   */
  public override getBackupPlans<T>() {
    return output(this.bao.list(SECRETS_MOUNT, INVENTORY_PREFIX))
      .apply(keys =>
        all(
          backupPlanKeys(keys).map(key => {
            assertNotDirectory(INVENTORY_PREFIX, key);
            return this.read(`${INVENTORY_PREFIX}/${key}`);
          }),
        ),
      )
      .apply(items => shapeBackupPlans<T>(items as unknown as { plan: string }[])) as ReturnType<VaultStore["getBackupPlans"]> & Output<T[]>;
  }

  private listUnder(prefix: string): Output<BaoItem[]> {
    return output(this.bao.list(SECRETS_MOUNT, prefix)).apply(keys =>
      all(
        keys.map(key => {
          assertNotDirectory(prefix, key);
          return this.read(`${prefix}/${key}`);
        }),
      ),
    ) as unknown as Output<BaoItem[]>;
  }

  private read(path: string): Output<BaoItem> {
    const cached = this.cache.get(path);
    if (cached) return cached;
    const item = output(this.bao.read(SECRETS_MOUNT, path)).apply(result => shapeItem(path, result));
    this.cache.set(path, item);
    return item;
  }
}

/** Cluster keys that prefix a generated per-app credential title. */
const CLUSTER_KEYS = ["equestria", "sgc", "celestia", "luna", "skystar", "alpha-site", "twilight-sparkle"];

/**
 * Titles whose 1Password item is deliberately NOT in OpenBao.
 *
 * Two different reasons, and they must not be conflated:
 *
 *   never   INVENTORY.md §2 forbids it. `OpenBao Alpha Site Static Unseal` is
 *           the key that unseals the thing that unseals OpenBao — putting it
 *           inside OpenBao is the circular dependency the whole seal chain
 *           exists to avoid. Its destination is SOPS, not a KV path.
 *   later   inventory, waiting on the cross-stack channel (`Authentik Outputs`
 *           is produced by the authentik stack and read by four others).
 */
const NOT_IN_OPENBAO: Record<string, string> = {
  "OpenBao Alpha Site Static Unseal": "seal-chain material; INVENTORY §2 forbids it from ever living in OpenBao",
};

/**
 * Cross-stack inventory served from `clusters/_inventory/` — the paths
 * `mapping.yaml` reserves and the PRODUCING stack dual-writes (PLAN §G-8:
 * `StackReference` cannot cross this repo's per-stack backends, so OpenBao is
 * the channel).
 *
 * An entry moves here only after its producer has BOTH merged the dual-write
 * AND run — a consumer switched first reads an empty object rather than an
 * error, which is exactly the failure §G-8 warns about. `Authentik Outputs`
 * cleared that gate on 2026-08-11: `clusters/_inventory/authentik-outputs`
 * version 1, written by the authentik stack (verified live before this entry
 * landed).
 */
const INVENTORY_IN_OPENBAO: Record<string, string> = {
  "Authentik Outputs": "clusters/_inventory/authentik-outputs",
};

/**
 * A 1Password title → its OpenBao path, or why there is not one.
 *
 * The `default` rule in `scripts/op-to-bao/mapping.ts` is `shared/<slug>`, and
 * it covers every credential this repo names as a string literal. It is NOT
 * enough on its own — a `pulumi preview` of `stacks/home` against OpenBao found
 * four more shapes, each a different reason the default is wrong:
 *
 *   `<cluster>-<app>-oidc-credentials`  generated per-app credential. Phase 4
 *       deliberately did not migrate these; Phase 8a writes them to
 *       `clusters/<key>/apps/<app>/oidc`, so the default rule looks for a path
 *       that will never exist.
 *   a bare 26-character UUID  four items are addressed by id rather than title
 *       (mapping.ts flags them `UNRESOLVED-`). Slugging a UUID yields the UUID.
 *   `Cluster: …`  cluster definitions, becoming checked-in code.
 *   the NOT_IN_OPENBAO set above.
 *
 * Splitting on the FIRST dash would mis-parse `alpha-site-technitium-…`, so the
 * cluster key is matched against the known set, longest first — the same
 * ambiguity `oidcBaoPath` avoids by taking its arguments separately.
 */
export function resolveBaoPath(title: string): { path: string; reason?: undefined } | { path?: undefined; reason: string } {
  const excluded = NOT_IN_OPENBAO[title];
  if (excluded) return { reason: excluded };

  const inventory = INVENTORY_IN_OPENBAO[title];
  if (inventory) return { path: inventory };

  // The tag-shaped inventory families (`Backup Plan`, `<Title> Backup Plan`,
  // `Tailscale Export - <stack>`). Every consumer reads these through
  // `getBackupPlans`/`getTailscaleExports` rather than by title, but a title
  // reaching this resolver must still land on the reserved _inventory path —
  // the default rule below would derive `shared/…`, a path that never exists.
  if (/(^| )Backup Plan$/.test(title) || /^Tailscale Export - .+$/.test(title)) {
    return { path: `${INVENTORY_PREFIX}/${baoSlug(title)}` };
  }

  if (title.startsWith("Cluster: ")) return { reason: "cluster definitions become checked-in code in a later Phase 8 slice" };

  // 1Password item ids are 26 lowercase base32 characters. A title that IS one
  // means the call site addresses the item by id, and no path derives from it.
  if (/^[a-z0-9]{26}$/.test(title)) return { reason: "item is addressed by UUID, which no OpenBao path derives from (mapping.ts: 'name it')" };

  const oidc = /^(.+)-oidc-credentials$/.exec(title);
  if (oidc) {
    const key = CLUSTER_KEYS.filter(k => oidc[1].startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
    if (key) return { path: `clusters/${key}/apps/${baoSlug(oidc[1].slice(key.length + 1))}/oidc` };
    return { reason: `'${title}' looks like a generated OIDC credential but names no known cluster key` };
  }

  return { path: `shared/${baoSlug(title)}` };
}

/**
 * The `tailscale-export-*` keys to read from an `_inventory` LIST — or an
 * error when the set is not complete.
 *
 * Exported for its tests. A MISSING known stack is an error rather than a
 * smaller result because two of three stacks having run is a torn inventory
 * that shapes into a plausible, incomplete estate; stacks beyond the known set
 * are included automatically, so the list is a floor, not a ceiling.
 */
export function tailscaleExportKeys(keys: string[]): string[] {
  const exports = keys.filter(key => key.startsWith(TAILSCALE_EXPORT_PREFIX));
  const missing = TAILSCALE_EXPORT_STACKS.filter(stack => !exports.includes(`${TAILSCALE_EXPORT_PREFIX}${stack}`));
  if (missing.length > 0) {
    throw new Error(
      `tailscale-export inventory is incomplete under ${SECRETS_MOUNT}/${INVENTORY_PREFIX}/ — missing ${missing.map(stack => `${TAILSCALE_EXPORT_PREFIX}${stack}`).join(", ")}. ` +
        `Each producing stack must run its dual-write before any consumer reads OpenBao (PLAN §G-8: dual-write, producer run, THEN the reader).`,
    );
  }
  return exports;
}

/**
 * The `*backup-plan` keys to read from an `_inventory` LIST — or an error
 * when the set is not complete. Same floor-not-ceiling contract as
 * `tailscaleExportKeys`; exported for its tests.
 */
export function backupPlanKeys(keys: string[]): string[] {
  const plans = keys.filter(key => key === "backup-plan" || key.endsWith("-backup-plan"));
  const missing = BACKUP_PLAN_KEYS.filter(key => !plans.includes(key));
  if (missing.length > 0) {
    throw new Error(
      `backup-plan inventory is incomplete under ${SECRETS_MOUNT}/${INVENTORY_PREFIX}/ — missing ${missing.join(", ")}. ` +
        `Each producing stack must run its dual-write before any consumer reads OpenBao (PLAN §G-8: dual-write, producer run, THEN the reader).`,
    );
  }
  return plans;
}

/**
 * A KV LIST marks a nested directory with a trailing slash.
 *
 * One appearing under a prefix this store treats as flat means the path layout
 * changed; reading it as a secret would 404 somewhere far from the cause.
 */
export function assertNotDirectory(prefix: string, key: string): void {
  if (key.endsWith("/")) throw new Error(`${SECRETS_MOUNT}/${prefix}/${key} is a directory, not a secret — the OpenBao path layout changed`);
}

/**
 * KV v2 read result → the object `getSecretItem` would have built.
 *
 * Exported for its tests: this is where a field silently loses its `secret()`
 * marker, and that is not visible in a `pulumi preview` diff.
 */
export function shapeItem(path: string, result: Awaited<ReturnType<BaoClient["read"]>>): Output<BaoItem> {
  if (!result) throw new Error(`${SECRETS_MOUNT}/${path} does not exist in OpenBao`);

  const cm = result.metadata.custom_metadata ?? {};
  const concealed = new Set((cm.concealed_fields ?? "").split(",").filter(Boolean));
  if (cm.contains_secrets === "true" && concealed.size === 0) {
    throw new Error(`${SECRETS_MOUNT}/${path} is marked contains_secrets but lists no concealed_fields — refusing to read its values as plaintext`);
  }

  const item: Record<string, unknown> = {
    meta: {
      title: cm.source_title ?? path,
      tags: (cm.source_tags ?? "").split(",").filter(Boolean),
    },
  };

  for (const [key, value] of Object.entries(result.data)) {
    // Files were flattened to {filename, content_b64, sha256} per name.
    // `getSecretItem` exposes a file as its CONTENT under its name, so decode
    // back to that rather than handing stacks the envelope.
    if (key === "files" && isRecord(value)) {
      for (const [name, file] of Object.entries(value)) {
        if (!isRecord(file) || typeof file.content_b64 !== "string") throw new Error(`${SECRETS_MOUNT}/${path}: files.${name} is not a {content_b64} envelope`);
        item[name] = secret(Buffer.from(file.content_b64, "base64").toString("utf8"));
      }
      continue;
    }
    // A nested object is a 1Password section; concealment is recorded with a
    // dotted path, so it resolves per leaf.
    if (isRecord(value)) {
      item[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, concealed.has(`${key}.${k}`) ? secret(v) : output(v)]));
      continue;
    }
    item[key] = concealed.has(key) ? secret(value) : output(value);
  }

  // `output()` deep-resolves the Outputs nested in this plain object and keeps
  // their secretness — exactly how `getSecretItem` returns its item. The cast
  // is the same one `getSecretItem` makes: unwrapping leaves TS with
  // UnwrappedObject<…> where callers want the item shape.
  return output(item) as unknown as Output<BaoItem>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
