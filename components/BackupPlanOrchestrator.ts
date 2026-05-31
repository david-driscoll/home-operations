import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { OPClient } from "./op.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, log, Output, output, Unwrap, UnwrappedArray, UnwrappedObject } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { addUptimeGatus, BackupTask, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { NodeSSH } from "node-ssh";
import { BackrestConfig, BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { CopyToRemote } from "@pulumi/command/remote/index.js";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
export interface PreSyncArgs {
  /** SFTP hostname of the host whose data should be staged before the backup */
  sftpHost: string;
  /** Absolute path on the remote host to sync from (e.g. "/opt/stacks-data/") */
  sourcePath: string;
  /** SFTP port — defaults to 2022 (rclone-sftp entrypoint) */
  sftpPort?: number;
}

export interface BackupPlanItem {
  name: string;
  title: string;
  planConfig?: Omit<BackrestPlan, "id" | "repo" | "paths">;
  repositoryConfig?: Omit<BackrestRepository, "guid" | "uri" | "id" | "password" | "autoUnlock" | "autoInitialize">;
  path: string;
  repository?: string;
  preSync?: PreSyncArgs;
}

export class BackupPlanOrchestrator extends ComponentResource {
  plans: Output<BackupPlanItem[]> = output([]);

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
            value: jsonStringify({ plans: this.plans }, undefined, 2),
          },
        },
      },
      { parent: this },
    );
  }
}
