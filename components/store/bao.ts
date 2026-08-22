/**
 * OpenBao-backed reads for Pulumi — Phase 8 of the 1Password→OpenBao migration
 * (docs/openbao-migration/PLAN.md §D.3, §G).
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

import { all, type Output, output, secret } from "@pulumi/pulumi";
import { BaoClient, baoSlug, dockgeBaoPath } from "../bao.ts";
import { clusterSecretPath } from "./clusters.ts";
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

/** Where `stacks/system` publishes the checked-in cluster definitions. */
const CLUSTER_PREFIX = "clusters";

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
 *
 * `stargate-command-backup-plan` was listed here until SGC's teardown
 * (docs/cluster-consolidation/22-decommission-sgc.md). `pulumi destroy
 * --stack sgc` removes that `_inventory` key, and a listed-but-absent key is
 * fatal, so leaving it here would have failed `getBackupPlans` for every
 * consumer — the three `BackupPlanDirector`s in stacks/home, stacks/ocracoke
 * and stacks/gulf-of-mexico, all at once, on a stack nobody touched.
 *
 * Removing an entry is the SAFE direction and must stay that way: the list is
 * a floor, not a ceiling, so a producer that still writes its plan is still
 * read whether or not it is named here. Adding an entry is the dangerous
 * direction — it is a promise that the producing stack has already run its
 * write (PLAN §G-8).
 */
const BACKUP_PLAN_KEYS = ["backup-plan", "equestria-backup-plan"];

/**
 * `baoStoreReadsEnabled` used to live here, gating whether reads went to
 * OpenBao or 1Password. Phase 11 removed the 1Password side, so there is
 * nothing left to switch: `BaoStore` is the store. BAO_STORE_READS is inert
 * and gets removed from the Stack CRs separately, once every repo is on this.
 */

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
  /** One LIST + N reads per process; every cluster read goes through it. */
  private _clusterDetails?: Output<ClusterDetails[]>;

  constructor(bao?: BaoClient) {
    super();
    // Constructed lazily by default so building a BaoStore does not demand
    // credentials on a stack that never reads one.
    this.bao = bao ?? new BaoClient();
  }

  /**
   * Read a KV path and shape it like `getSecretItem` output. `path` is within
   * the `secrets` mount, no leading slash — e.g.
   * `third-party-tokens/cloudflare/driscoll-tech`.
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
    // These used to warn and read 1Password instead. They throw now: Pulumi no
    // longer writes 1Password, so its copies are frozen, and "fall back to the
    // other store" would mean silently authenticating with a stale credential
    // — the failure this migration keeps meeting, and the one with no symptom.
    // Every title this repo names resolves; anything reaching here is a call
    // site that needs a decision, not a fallback.
    throw new Error(`${title}: no OpenBao path — ${resolved.reason}. 1Password is no longer read; give this call site a path, or handle it as configuration.`);
  }

  /**
   * Cluster definitions come from `clusters/<key>/details`, published by
   * `stacks/system` from the checked-in YAML at `/clusters`.
   *
   * They used to be read straight off disk. That worked for home-operations
   * and forced the (since retired) vault repo to carry a byte-identical copy of six files
   * under a "diff -r must come back empty" convention — a maintenance trap,
   * because copies drift the moment someone forgets and nothing fails when
   * they do. Publishing once and reading everywhere keeps the YAML as the
   * single source and makes OpenBao the distribution.
   *
   * Credential fields are still merged from their own paths — see
   * `hydrateCluster`.
   */
  public override getCluster(title: string) {
    return this.listClusterDetails().apply(entries => {
      const match = entries.find(e => e.sourceTitle === title);
      if (!match) {
        throw new Error(`no cluster definition titled '${title}' in secrets/${CLUSTER_PREFIX}/*/details (found: ${entries.map(e => e.sourceTitle).join(", ") || "none"}) — add it under /clusters and run stacks/system`);
      }
      return this.hydrateCluster(match);
    }) as unknown as ReturnType<VaultStore["getCluster"]>;
  }

  public override getAllClusters() {
    return this.listClusterDetails().apply(entries => all(entries.map(entry => this.hydrateCluster(entry)))) as unknown as ReturnType<VaultStore["getAllClusters"]>;
  }

  /**
   * Every published cluster definition, sorted by key.
   *
   * `clusters/` also holds `_inventory/` and per-app paths for clusters with
   * no definition of their own (`twilight-sparkle` has oidc credentials but no
   * YAML), so the presence of a directory proves nothing — only a readable
   * `details` path counts. Sorted because callers derive Pulumi inputs from
   * this list, and an unstable order means spurious diffs.
   *
   * An EMPTY result is an error, never an empty estate: consumers turn this
   * list into DNS records, ACL grants and backup plans, so "no clusters" reads
   * as "remove everything". That is the §G-8 failure made loud — if it fires,
   * `stacks/system` has not run.
   */
  private listClusterDetails(): Output<ClusterDetails[]> {
    this._clusterDetails ??= output(this.bao.list(SECRETS_MOUNT, CLUSTER_PREFIX))
      .apply(keys =>
        all(
          keys
            .filter(key => key.endsWith("/") && key !== "_inventory/")
            .map(key => key.slice(0, -1))
            .sort((a, b) => a.localeCompare(b))
            .map(key =>
              output(this.bao.read(SECRETS_MOUNT, `${CLUSTER_PREFIX}/${key}/details`)).apply(result => (result ? JSON.stringify(parseClusterDetails(key, result.data, result.metadata.custom_metadata ?? {})) : "")),
            ),
        ),
      )
      .apply(serialised => {
        // Serialised through the apply boundary and parsed back: Pulumi's
        // Unwrap<> turns a union with undefined into a shape TypeScript cannot
        // narrow, and the values here are plain config with no Outputs inside.
        return assertClustersFound(serialised.filter(z => z !== "").map(z => JSON.parse(z) as ClusterDetails));
      });
    return this._clusterDetails;
  }

  /**
   * Merge a checked-in definition with its credential field.
   *
   * The `secret`/`arcane_token` value is read from `clusters/<key>/cluster` and
   * spread in LAST, so the empty placeholder in `clusters.ts` can never win. A
   * cluster with no credential (celestia) reads nothing at all rather than
   * reading a path that does not exist.
   */
  private hydrateCluster(entry: ClusterDetails): Output<unknown> {
    const { sourceTitle, secretField, key, ...definition } = entry;
    const base = { ...definition, key, meta: { title: sourceTitle, tags: ["cluster-definition"] } };
    if (!secretField) return output(base);
    // Spread in LAST, so nothing in the published definition can win over the
    // real credential.
    return this.getSecretByPath<Record<string, unknown>>(clusterSecretPath(key, secretField)).apply(secretItem => ({
      ...base,
      [secretField]: secretItem[secretField],
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

  /**
   * `tag:pbs` became the `hosts/pbs/` prefix — the last read in this repo that
   * still went to 1Password.
   *
   * The 1Password items themselves STAY and keep being written: they are how a
   * human logs into the generated LXC (estate decision 2026-08-12). This moves
   * only where PULUMI reads, so the browser-fill copy and the machine copy stop
   * being the same lookup.
   *
   * Each item cross-references two others BY TITLE — `dockge` names a
   * `DockgeLxc: <host>` item and `cluster` names a `Cluster: <name>` — and both
   * of those already moved: dockge to `hosts/dockge/<slug>`, cluster
   * definitions to checked-in YAML. So the two title fields resolve through
   * the same machinery every other read now uses, rather than through a second
   * round of 1Password lookups.
   */
  public override proxmoxBackupServers(withTag: string = "pbs") {
    if (withTag !== "pbs") throw new Error(`proxmoxBackupServers('${withTag}') — OpenBao has no tags; only the 'pbs' family has a path prefix (hosts/pbs/)`);
    return this.listUnder("hosts/pbs").apply(items =>
      all(
        items.map(item => {
          const dockgeTitle = item.dockge as string;
          const clusterTitle = item.cluster as string;
          if (typeof dockgeTitle !== "string" || typeof clusterTitle !== "string") {
            throw new Error(`${SECRETS_MOUNT}/hosts/pbs/${baoSlug(String(item.meta?.title ?? "?"))}: 'dockge' and 'cluster' must be item titles — the PBS item shape changed`);
          }
          // Same shape the 1Password path produced: the referenced items
          // inlined, not their titles. The cluster resolves through the same
          // published definitions every other read uses — one lookup
          // mechanism, so a PBS item cannot disagree with getAllClusters.
          return all([this.getSecretByPath<Record<string, unknown>>(dockgeBaoPath(dockgeTitle)), this.getCluster(clusterTitle)]).apply(([dockge, cluster]) => ({
            ...item,
            dockge,
            cluster,
          }));
        }),
      ),
    ) as unknown as ReturnType<VaultStore["proxmoxBackupServers"]>;
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
  // Kept deliberately although nothing reaches it any more: the only reference
  // was bao-transit's `.env`, and Phase 11 moved that key to a root-owned file
  // on its host. The entry stays as the machine-readable form of INVENTORY §2 —
  // if a future call site ever asks for this title, it must get a refusal that
  // names the reason, not a 404 from a path that was never allowed to exist.
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
 * Every credential this repo still names by its 1Password title.
 *
 * These are the call sites that predate `getSecretByPath` — `globals.ts` builds
 * seven providers this way, and three stacks name four more. Moving one of
 * these paths WITHOUT editing this table is the failure mode with no symptom
 * until a stack runs, because nothing in the repo contains the path string for
 * a title-addressed read; `scripts/bao-reorg/rewrite.ts` therefore cannot see
 * them and prints them as "no textual reference" instead.
 *
 * Sorted by destination prefix, which is also roughly by owner.
 */
const TITLE_PATHS: Record<string, string> = {
  // third-party-tokens/ — issued by someone else's service
  "Tailscale Terraform OAuth Client": "third-party-tokens/tailscale/pulumi-oauth",
  "Cloudflare (driscoll.tech)": "third-party-tokens/cloudflare/driscoll-tech",
  "Unifi Api Key Eris Cluster": "third-party-tokens/unifi/api-key",
  "Authentik Plex Source": "third-party-tokens/plex/authentik-source",

  // apps/ — estate infrastructure this repo operates
  "Technitium ApiKey": "apps/technitium/api-key",
  Proxmox: "apps/proxmox/root",
  "Proxmox ApiKey": "apps/proxmox/api-key",
  "Alpha Site Proxmox ApiKey": "apps/proxmox/alpha-site/api-key",
  "minio root user": "apps/minio/root",
  "Volsync Password": "apps/volsync/password",

  // docker/ — every Dockge host
  "Dockge Credential": "docker/apps/dockge/credential",
  "Rclone SFTP Key": "docker/apps/rclone/sftp",

  // clusters/ — scoped to one site
  "Eris Truenas Credentials": "clusters/spike/truenas-credentials",
  "RClone Web UI": "clusters/equestria/apps/rclone/web-ui",
  // Was `shared/authentik-token`, a stale duplicate: alpha-site's authentik has
  // written the live token to its own path since Phase 8a, and dynacat,
  // .config/mise.toml and pulumi/secrets all already read that one. Only
  // `DockgeLxc` still asked by title, so it was reading the frozen copy.
  "Authentik Token": "clusters/alpha-site/apps/authentik/token",
};

/**
 * A 1Password title → its OpenBao path, or why there is not one.
 *
 * The `default` rule USED to be `shared/<baoSlug(title)>` — the same rule
 * `op-to-bao` wrote with, so every flat `shared/` path fell out of it for free.
 * The reorganisation (`docs/openbao-shared-secrets-reorg.md`) emptied `shared/`,
 * which makes that rule actively dangerous: it still produces a well-formed
 * path, it just produces one that no longer exists, and the failure surfaces as
 * a 404 at read time rather than as "this title has no home". So the derivation
 * is gone and `TITLE_PATHS` below is exhaustive — a title with no entry is an
 * error naming itself, which is the outcome every other branch here already
 * produces.
 *
 * The four shapes that always needed special handling still do:
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

  const mapped = TITLE_PATHS[title];
  if (mapped) return { path: mapped };

  return {
    reason: `no entry in TITLE_PATHS (components/store/bao.ts). Titles no longer derive a path — 'shared/${baoSlug(title)}' would have been the old rule, and that subtree is empty. Add the title with the path it actually lives at, or give the call site getSecretByPath()`,
  };
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
 * A cluster definition as published by `stacks/system`.
 *
 * Same fields the YAML carries, plus the two the loader used to keep to
 * itself: `sourceTitle` (what `meta.title` must report — it names Gatus groups
 * and is written into PBS items) and `secretField` (which credential path to
 * merge, if any).
 */
export type ClusterDetails = {
  key: string;
  sourceTitle: string;
  secretField: "secret" | "arcane_token" | null;
  [field: string]: unknown;
};

/** The fields every published definition must carry. */
const REQUIRED_DETAILS = ["key", "title", "type", "rootDomain", "authentikDomain", "icon", "favicon", "background"] as const;

/**
 * KV data → a validated cluster definition.
 *
 * Validated rather than trusted, for the reason `parseCluster` validates the
 * YAML: these values reach provider calls and get rendered into URLs, and a
 * missing one surfaces as `undefined` somewhere far away. Exported for its
 * tests.
 *
 * The path's own key wins over a `key` field that disagrees with it — the path
 * is what `clusterSecretPath` derives from, so a mismatch would read another
 * cluster's credential.
 */
export function parseClusterDetails(key: string, data: Record<string, unknown>, customMetadata: Record<string, string>): ClusterDetails {
  const where = `${SECRETS_MOUNT}/${CLUSTER_PREFIX}/${key}/details`;
  for (const field of REQUIRED_DETAILS) {
    if (typeof data[field] !== "string" || data[field] === "") throw new Error(`${where}: '${field}' must be a non-empty string — republish with stacks/system`);
  }
  if (data.key !== key) throw new Error(`${where}: 'key' is '${String(data.key)}' but the path says '${key}' — they must match, or a cluster reads another's credential`);

  const raw = data.secretField;
  // `none` rather than null/"": KV values are strings, and an empty string is
  // indistinguishable from a real field name.
  if (raw !== "none" && raw !== "secret" && raw !== "arcane_token") {
    throw new Error(`${where}: 'secretField' must be 'none', 'secret' or 'arcane_token', got ${JSON.stringify(raw)}`);
  }
  const { secretField: _s, ...rest } = data;
  return {
    ...rest,
    key,
    sourceTitle: customMetadata.source_title ?? (data.sourceTitle as string) ?? key,
    secretField: raw === "none" ? null : raw,
  } as ClusterDetails;
}

/**
 * The published definitions, or an error when there are none.
 *
 * Exported for its tests, and separate for the same reason
 * `tailscaleExportKeys` is: an EMPTY set must never be served as a small one.
 * Consumers turn this list into DNS records, ACL grants and backup plans, so
 * "no clusters" reads as "remove everything" — the §G-8 failure, made loud.
 */
export function assertClustersFound(found: ClusterDetails[]): ClusterDetails[] {
  if (found.length === 0) {
    throw new Error(`no cluster definitions under ${SECRETS_MOUNT}/${CLUSTER_PREFIX}/*/details — stacks/system publishes them from /clusters and has not run`);
  }
  return found;
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
