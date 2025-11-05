import { GlobalResources, OnePasswordItem } from "../../components/globals.ts";
import { OnePasswordItem as OPItem } from "../../dynamic/1password/OnePasswordItem.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "../backups/ProxmoxBackupServer.ts";
import { ComponentResource, ComponentResourceOptions, Input, interpolate, Output, output } from "@pulumi/pulumi";
import { B2Backend, RcloneBackend, RcloneOperation } from "../../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { addUptimeGatus, copyFileToRemote } from "@components/helpers.ts";
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

export function createRcloneBucketBackend(item: Output<OnePasswordItem | OPItem>, prefix?: string): Output<B2Backend> {
  return output(item).apply(item => ({
    type: "b2",
    bucket: item.fields.bucket.value!,
    applicationKeyId: item.fields.username.value!,
    applicationKey: item.fields.credential.value!,
    prefix,
  } as B2Backend)  );
}

export type BackupTask = {
  jobName: string;
  source: Input<RcloneBackend>;
  destination: Input<RcloneBackend>;
  rclone: RcloneOperation;
};

export class BackupJobManager extends ComponentResource {
  clusterKey: Input<string>;
  globals: GlobalResources;
  private readonly cronJobs: BackupTask[] = [];
  connection: types.input.remote.ConnectionArgs;
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
    this.clusterKey = args.cluster.cluster.key;
    this.globals = args.globals;
  }

  public createBackupJob(args: BackupTask) {
    this.cronJobs.push(args);
  }

  public createCronJobs() {
    const generator = createCronExpressionGenerator();
    const localJobs = output(
      this.cronJobs.map((job) => {
        const sourceConfig = output(job.source).apply((a) => getRcloneConfigSection(`${job.jobName}-src`, a));
        const destinationConfig = output(job.destination).apply((a) => getRcloneConfigSection(`${job.jobName}-dst`, a));
        const command = interpolate`/usr/bin/rclone ${job.rclone} ${toRcloneString(`${job.jobName}-src`, job.source)} ${toRcloneString(
          `${job.jobName}-dst`,
          job.destination
        )} --progress --delete-after >> /app/logs/${job.jobName}.log 2>&1`;
        const expression = interpolate`# ── Sync ${job.jobName} ─────────────────────
${generator.next().value} ${command}`;

        return output({ configs: [sourceConfig, destinationConfig], expression, command, definition: job });
      })
    );

    const configs = localJobs.apply((jobs) =>
      jobs
        .map((j) => j.configs)
        .flat()
        .join("\n\n")
    );
    const expressions = localJobs.apply((jobs) => jobs.map((j) => j.expression).join("\n\n"));
    const commands = localJobs.apply((jobs) =>
      jobs
        .map((j) => [
          `echo ======================================================`,
          `echo Starting ${j.definition.jobName}...`,
          j.command,
          `echo Finished ${j.definition.jobName}...`,
          `echo ======================================================`,
        ])
        .flat()
        .join("\n")
    );

    return output(this.clusterKey).apply((clusterKey) => {
      return [
        this.cronJobs,
        [
        copyFileToRemote(`${clusterKey}-rclone-backup-jobs.conf`, {
          content: configs,
          remotePath: `/opt/stacks/jobs/rclone/rclone.conf`,
          connection: this.connection,
          dependsOn: [],
          parent: this,
        }),
        copyFileToRemote(`${clusterKey}-rclone-cron-expressions.conf`, {
          content: expressions,
          remotePath: `/opt/stacks/jobs/cron-expressions.conf`,
          connection: this.connection,
          dependsOn: [],
          parent: this,
        }),
        copyFileToRemote(`${clusterKey}-rclone-script.sh`, {
          content: commands,
          remotePath: `/opt/stacks/jobs/run.sh`,
          connection: this.connection,
          dependsOn: [],
          parent: this,
      })]] as const;
    });
  }
}

function getRcloneConfigSection(name: string, backend: RcloneBackend): string {
  switch (backend.type) {
    case "local":
      return `[${name}]
type = local
path = ${backend.path}`;
    case "s3":
      return `[${name}]
type = s3
provider = Minio
endpoint = ${backend.endpoint}
access_key_id = ${backend.accessKeyId}
secret_access_key = ${backend.secretAccessKey}
use_multipart_uploads = false`;
    case "b2":
      return `[${name}]
type = b2
account = ${backend.applicationKeyId}
key = ${backend.applicationKey}
hard_delete = true`;
    default:
      throw new Error(`Unsupported RcloneBackend type: ${(backend as any).type}`);
  }
}

function toRcloneString(name: string, backend: Input<RcloneBackend>): Output<string> {
  return output(backend).apply((b) => {
    switch (b.type) {
      case "local":
        return interpolate`${b.path}`;
      case "s3":
        return interpolate`${name}:${b.bucket}/${b.prefix ?? ""}`;
      case "b2":
        return interpolate`${name}:${b.bucket}/${b.prefix ?? ""}`;
      default:
        throw new Error(`Unsupported RcloneBackend type: ${(backend as any).type}`);
    }
  });
}
