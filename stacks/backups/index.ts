import { GlobalResources, OnePasswordItem } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "./ProxmoxBackupServer.ts";
import { Input, interpolate, output } from "@pulumi/pulumi";
import { RcloneBackend, RcloneOperation } from "../../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { copyFileToRemote } from "@components/helpers.ts";

const globals = new GlobalResources({}, {});
const op = new OPClient();

const celestiaDockge = await op.getItemByTitle("DockgeLxc: Celestia");
const lunaDockge = await op.getItemByTitle("DockgeLxc: Luna");

const celestiaConnection: types.input.remote.ConnectionArgs = {
  host: celestiaDockge.sections.ssh.fields.hostname.value!,
  user: "root",
};

const b2Bucket = output(op.getItemByTitle("B2 Database Key celestia")).apply((item) => {
  return {
    type: "b2",
    bucket: item.fields.bucket.value,
    applicationKeyId: item.fields.username.value!,
    applicationKey: item.fields.credential.value!,
  } as RcloneBackend;
});

createBackupJob(celestiaDockge, {
  jobName: "immich",
  rclone: "sync",
  connection: celestiaConnection,
  destination: { ...b2Bucket, prefix: "immich" },
  source: {
    type: "local",
    path: "/data/backup/immich/",
  },
});

function createBackupJob(
  cluster: OnePasswordItem,
  args: {
    connection: types.input.remote.ConnectionArgs;
    jobName: string;
    source: Input<RcloneBackend>;
    destination: Input<RcloneBackend>;
    rclone: RcloneOperation;
  }
) {
  const sourceConfig = output(args.source).apply(getRcloneEnvironmentVariables);
  const destinationConfig = output(args.destination).apply(getRcloneEnvironmentVariables);

  return copyFileToRemote(`${cluster.title}-backup-${args.jobName}.sh`, {
    connection: args.connection,
    remotePath: interpolate`/opt/stacks/dockge/jobs/tasks/${args.jobName}.sh`,
    content: interpolate`#!/bin/bash
${sourceConfig}
${destinationConfig}
rclone ${args.rclone} ${output(args.source).apply(toRcloneString)} ${output(args.destination).apply(toRcloneString)} --verbose --log-file=/var/log/rclone-${args.jobName}.log
`,
  });
}

function getRcloneEnvironmentVariables(backend: RcloneBackend): string {
  const envVars: Record<string, string> = {};

  switch (backend.type) {
    case "local":
      // No environment variables needed for local backend
      break;
    case "s3":
      if (backend.accessKeyId) envVars.RCLONE_S3_ACCESS_KEY_ID = backend.accessKeyId;
      if (backend.secretAccessKey) envVars.RCLONE_S3_SECRET_ACCESS_KEY = backend.secretAccessKey;
      if (backend.region) envVars.RCLONE_S3_REGION = backend.region;
      if (backend.endpoint) envVars.RCLONE_S3_ENDPOINT = backend.endpoint;
      break;
    case "b2":
      if (backend.applicationKeyId) envVars.RCLONE_B2_ACCOUNT = backend.applicationKeyId;
      if (backend.applicationKey) envVars.RCLONE_B2_KEY = backend.applicationKey;
      break;
    default:
      throw new Error(`Unsupported RcloneBackend type: ${(backend as any).type}`);
  }

  return Object.entries(envVars).reduce((acc, [key, value]) => {
    acc += `export ${key}="${value}"\n`;
    return acc;
  }, ``);
}

function toRcloneString(backend: RcloneBackend) {
  switch (backend.type) {
    case "local":
      return backend.path;
    case "s3":
      return `s3:${backend.bucket}/${backend.prefix ?? ""}`;
    case "b2":
      return `b2:${backend.bucket}/${backend.prefix ?? ""}`;
    default:
      throw new Error(`Unsupported RcloneBackend type: ${(backend as any).type}`);
  }
}
