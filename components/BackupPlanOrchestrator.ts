import { all, ComponentResource, ComponentResourceOptions, Input, jsonStringify, Output, output } from "@pulumi/pulumi";
import {} from "@pulumi/pbs";
import { BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
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

  constructor(name: string, opts?: ComponentResourceOptions) {
    super("home:backups:BackupPlanOrchestrator", name, {}, opts);
  }

  public addBackupPlan(plan: Input<BackupPlanItem>) {
    this.plans = all([this.plans, plan]).apply(([plans, newPlan]) => [...plans, newPlan]);
  }

  public savePlan(title: string) {
    return new OnePasswordItem(
      `backup-plan`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: title,
        tags: ["backup-plan"],
        fields: {
          plan: {
            type: TypeEnum.Concealed,
            value: jsonStringify({ plans: this.plans }),
          },
        },
      },
      { parent: this },
    );
  }
}
