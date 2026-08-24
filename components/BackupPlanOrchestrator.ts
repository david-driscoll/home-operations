import { FullItem } from "@1password/connect";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import type { BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { all, ComponentResource, type ComponentResourceOptions, type Input, jsonStringify, log, type Output, output } from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance, baoSlug } from "./bao.ts";
import type { GlobalResources } from "./globals.ts";
/**
 * Stage a remote filesystem over SFTP before the snapshot.
 *
 * `type` is OPTIONAL and defaults to "sftp" on purpose. Plans are serialized
 * into 1Password/OpenBao and read back by `BackupPlanDirector` on a later,
 * separate run, so every plan already persisted out there predates this field
 * and has no `type` at all. Making sftp the fall-through means those keep
 * rendering exactly the same rclone command they always did; requiring the
 * discriminant would have silently reclassified all of them at the first
 * director run after this shipped.
 */
export interface SftpPreSyncArgs {
  type?: "sftp";
  /** SFTP hostname of the host whose data should be staged before the backup */
  sftpHost: string;
  /** Absolute path on the remote host to sync from (e.g. "/opt/stacks-data/") */
  sourcePath: string;
  /** SFTP port — defaults to 2022 (rclone-sftp entrypoint) */
  sftpPort?: number;
  exclude?: string[];
}

/**
 * Stage the contents of an S3 bucket before the snapshot.
 *
 * This exists because restic cannot read an S3 bucket as a SOURCE — its S3
 * support is for the repository DESTINATION, which is the opposite direction.
 * So a bucket is backed up the same way a dockge host already is: rclone
 * mirrors it onto backrest's local staging tree, and restic snapshots that
 * tree. Everything downstream — repo, retention, prune/check, the Gatus
 * heartbeat, the copy jobs to the other Proxmox Backup Servers — is then the
 * mechanism that was already there.
 *
 * Credentials are NOT rendered into the hook command. They go into
 * `rclone.conf` on the backrest host (see `renderRcloneConfig`), which keeps
 * them out of config.json and makes a rotation one file write rather than a
 * rewrite of every plan.
 */
export interface S3PreSyncArgs {
  type: "s3";
  /** S3 endpoint INCLUDING scheme, reachable from the backrest host. */
  endpoint: string;
  /** Bucket to mirror. */
  bucket: string;
  /** SigV4 region. Not geographic — it just has to match what the server expects. */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional key prefix, so a plan can cover part of a bucket. No leading slash. */
  prefix?: string;
  /** rclone `--exclude` patterns. Remember a bare `/dir` matches FILES only — use `/dir/**`. */
  exclude?: string[];
}

export type PreSyncArgs = SftpPreSyncArgs | S3PreSyncArgs;

export interface BackupPlanItem {
  source: "celestia" | "skystar" | "luna" | "volsync";
  /**
   * Identity: the backrest repo id, plan id, and backup path all derive from
   * this. Must be id-safe and STABLE — renaming it re-roots the plan's restic
   * history.
   */
  name: string;
  /** Display label (Gatus, dashboards). Safe to change; nothing derives from it. */
  title?: string;
  planConfig?: Omit<BackrestPlan, "id" | "repo" | "paths">;
  repositoryConfig?: Omit<BackrestRepository, "guid" | "uri" | "id" | "autoUnlock" | "autoInitialize">;
  path: string;
  repository?: string;
  preSync?: PreSyncArgs;
}

export class BackupPlanOrchestrator extends ComponentResource {
  plans: Output<BackupPlanItem[]> = output([]);
  // sync?:; // what was this for?

  /**
   * `globals` is here for `baoProvider`/`baoDualWriteEnabled` only — the plan
   * is cross-stack inventory (PLAN §G-8), and the producing side owns the
   * OpenBao write.
   */
  constructor(
    name: string,
    private readonly globals: GlobalResources,
    opts?: ComponentResourceOptions,
  ) {
    super("home:backups:BackupPlanOrchestrator", name, {}, opts);
  }

  public addBackupPlan(plan: Input<BackupPlanItem>) {
    this.plans = all([this.plans, plan]).apply(([plans, newPlan]) => [...plans, newPlan]);
  }

  public savePlan(title: string) {
    // One expression serializes for both stores, so the OpenBao copy is
    // byte-identical to the 1Password field by construction.
    const plan = jsonStringify({ plans: this.plans });

    const item = new OnePasswordItem(
      `backup-plan`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: title,
        tags: ["backup-plan"],
        fields: {
          plan: {
            type: TypeEnum.Concealed,
            value: plan,
          },
        },
      },
      { parent: this },
    );

    // Phase 8 dual-write (openbao-migration PLAN §G-8): the plan also lands at
    // its reserved inventory path (`clusters/_inventory/<slug(title)>`, the
    // path the migration reserved for the tag:backup-plan family). The 1Password
    // field is Concealed, so `concealed_fields: plan` keeps the `secret()`
    // marker on the read side. 1Password stays authoritative until Phase 11 —
    // written ALONGSIDE the item, never instead of it; rollback is a plain
    // `git revert`. `BaoStore.getBackupPlans` refuses to serve consumers until
    // every producing stack has run this once.
    if (this.globals.baoDualWriteEnabled) {
      baoKvSecret(
        `backup-plan-bao`,
        {
          mount: "secrets",
          path: `clusters/_inventory/${baoSlug(title)}`,
          data: { plan },
          concealedFields: ["plan"],
          customMetadata: baoProvenance({
            source_title: title,
            source_tags: "backup-plan",
          }),
        },
        { parent: this, provider: this.globals.baoProvider },
      );
    } else {
      log.warn(
        `No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the backup-plan dual-write for '${title}'. 1Password stays authoritative; the inventory path stays stale until a credentialed run.`,
        this,
      );
    }

    return item;
  }
}
