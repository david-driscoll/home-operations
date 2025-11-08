import { ClusterDefinition, GlobalResources, OnePasswordItem } from "../../components/globals.ts";
import { OnePasswordItem as OPItem } from "../../dynamic/1password/OnePasswordItem.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "../backups/ProxmoxBackupServer.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, Output, output, Unwrap } from "@pulumi/pulumi";
import { B2Backend, RcloneBackend, RcloneOperation } from "../../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { addUptimeGatus, BackupTask, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { kebabCase } from "moderndash";
import { DockgeLxc } from "./DockgeLxc.ts";
import { ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";

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
  jobs: Output<BackupTask[]> = output([]);
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
    this.jobs = this.jobs.apply((jobs) => [...jobs, args]);
    return all([args, this.cluster]).apply(([job, cluster]) => {
      const groupName = `Jobs: ${cluster.title}`;
      const token = toGatusKey(groupName, job.name);
      return copyFileToRemote(`${cluster.key}-backup-job-${kebabCase(job.name)}`, {
        content: jsonStringify({ ...job, token }),
        parent: this,
        connection: this.connection,
        remotePath: interpolate`/opt/stacks/backups/jobs/${cluster.key}-${kebabCase(job.name)}.json`,
        dependsOn: [],
      });
    });
  }

  public createUptime(): Output<{ "external-endpoints": ExternalEndpoint[]; endpoints: GatusDefinition[] }> {
    return all([this.jobs, this.cluster]).apply(([jobs, cluster]) => {
      const groupName = `Jobs: ${cluster.title}`;
      return {
        endpoints: [],
        "external-endpoints": jobs.map(
          (job) =>
            ({
              enabled: true,
              name: job.name,
              token: toGatusKey(groupName, job.name),
              group: groupName,
              heartbeat: {
                interval: "25h",
              },
              alerts: [
                {
                  type: "pushover",
                  enabled: true,
                  "success-threshold": 1,
                  "failure-threshold": 1,
                  "minimum-reminder-interval": "24h",
                },
              ],
            } as ExternalEndpoint)
        ),
      };
    });
  }
}
