import { FullItem } from "@1password/connect";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import type { BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { all, ComponentResource, type ComponentResourceOptions, type Input, jsonStringify, log, type Output, output } from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance, baoSlug } from "./bao.ts";
import type { GlobalResources } from "./globals.ts";
export interface PreSyncArgs {
  /** SFTP hostname of the host whose data should be staged before the backup */
  sftpHost: string;
  /** Absolute path on the remote host to sync from (e.g. "/opt/stacks-data/") */
  sourcePath: string;
  /** SFTP port — defaults to 2022 (rclone-sftp entrypoint) */
  sftpPort?: number;
  exclude?: string[];
}

export interface BackupPlanItem {
  source: "celestia" | "skystar" | "luna" | "volsync";
  name: string;
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
    // tag:backup-plan rule in scripts/op-to-bao/mapping.ts). The 1Password
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
          customMetadata: baoProvenance({
            source_title: title,
            source_tags: "backup-plan",
            contains_secrets: "true",
            concealed_fields: "plan",
          }),
        },
        { parent: this, provider: this.globals.baoProvider },
      );
    } else {
      log.warn(`No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the backup-plan dual-write for '${title}'. 1Password stays authoritative; the inventory path stays stale until a credentialed run.`, this);
    }

    return item;
  }
}
