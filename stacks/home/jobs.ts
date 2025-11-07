import { ClusterDefinition, GlobalResources, OnePasswordItem } from "../../components/globals.ts";
import { OnePasswordItem as OPItem } from "../../dynamic/1password/OnePasswordItem.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "../backups/ProxmoxBackupServer.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, Output, output, Unwrap } from "@pulumi/pulumi";
import { B2Backend, RcloneBackend, RcloneOperation } from "../../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { addExternalGatus, addUptimeGatus, BackupTask, copyFileToRemote } from "@components/helpers.ts";
import { kebabCase } from "moderndash";
import { DockgeLxc } from "./DockgeLxc.ts";

function* createCronExpressionGenerator() {
  let currentMinute = 60 * 11; // Start at 11am (660 minutes)

  while (true) {
    const hour = Math.floor(currentMinute / 60);
    const minute = currentMinute % 60;

    // Generate cron expression: minute hour * * *
    yield `${minute} ${hour % 24} * * *`;

    currentMinute += 20;

    // Reset to next day if we've gone past 23:59
    if (hour >= 24) {
      currentMinute = currentMinute % (24 * 60);
    }
  }
}

export class BackupJobManager extends ComponentResource {
  cluster: Output<ClusterDefinition>;
  globals: GlobalResources;
  connection: types.input.remote.ConnectionArgs;
  jobs: Unwrap<BackupTask>[] = [];
  constructor(
    name: string,
    args: {
      cluster: DockgeLxc;
      globals: GlobalResources;
    },
    opts?: ComponentResourceOptions
  ) {
    super("home:backups:BackupJobManager", name, {}, opts);
    this.connection = args.cluster.remoteConnection;
    this.cluster = args.cluster.cluster;
    this.globals = args.globals;
  }

  public createBackupJob(args: BackupTask) {
    return all([args, this.cluster.key]).apply(([args, clusterKey]) => {
      this.jobs.push(args);
      return copyFileToRemote(`${clusterKey}-backup-job-${kebabCase(args.name)}`, {
        content: jsonStringify(args),
        parent: this,
        connection: this.connection,
        remotePath: interpolate`/opt/stacks/backups/jobs/${kebabCase(args.name)}.json`,
        dependsOn: [],
      });
    });
  }

  public createUptime() {
    return this.cluster.key.apply((clusterKey) => {
      return addExternalGatus(
        `${clusterKey}-backup-jobs`,
        this.globals,
        all([this.jobs, this.cluster.title]).apply(([jobs, clusterTitle]) =>
          jobs.map((job) => ({
            enabled: true,
            name: job.name,
            group: `${clusterTitle}: Jobs`,
            token: kebabCase(job.name),
            heartbeat: {
              interval: "30h",
            },
          }))
        )
      );
    });
  }
}
