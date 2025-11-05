import { GlobalResources, OnePasswordItem } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "../backups/ProxmoxBackupServer.ts";
import { Input, interpolate, output } from "@pulumi/pulumi";
import { RcloneBackend, RcloneOperation } from "../../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { addExternalGatus, addUptimeGatus, copyFileToRemote } from "@components/helpers.ts";
import { BackupTask, BackupJobManager } from "./jobs.ts";
import { kebabCase } from "moderndash";
import { DockgeLxc } from "./DockgeLxc.ts";

export function createBackupJobs({ cluster, globals, jobs }: {
  cluster: DockgeLxc;
  globals: GlobalResources;
  jobs: BackupTask[];
}) {
  return cluster.cluster.key.apply(async (clusterKey) => {
    const backupJobManager = new BackupJobManager(`${clusterKey}-backup-job-manager`, {
      cluster,
      globals,
    });

    for (const job of jobs) {
      backupJobManager.createBackupJob(job);
    }

    const createdJobs = backupJobManager.createCronJobs();

    const addedExternalGatus = addExternalGatus(
      `${clusterKey}-backup-jobs`,
      globals,
      createdJobs.apply(([jobs,]) => jobs.map((job) => ({
        enabled: true,
        name: `Backup Job: ${job.jobName}`,
        group: "Jobs",
        token: kebabCase(job.jobName),
        heartbeat: {
          interval: "30h",
        },
      })))
    );

    return createdJobs.apply(([, results]) => [...results, addedExternalGatus]);
  }).apply(z => z);
}