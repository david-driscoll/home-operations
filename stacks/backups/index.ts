import { GlobalResources, OnePasswordItem } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "./ProxmoxBackupServer.ts";
import { interpolate } from "@pulumi/pulumi";
import { RcloneBackend, RcloneOperation } from "../../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { copyFileToRemote } from "@components/helpers.ts";

const globals = new GlobalResources({}, {});
const op = new OPClient();

const celestiaDockge = await op.getItemByTitle("DockgeLxc: Celestia");
const lunaDockge = await op.getItemByTitle("DockgeLxc: Luna");

const celestiaConnection: types.input.remote.ConnectionArgs = {
  host: celestiaDockge.sections.ssh.fields.hostname.value!,
  user: 'root',
};

function createBackupJob(
  cluster: OnePasswordItem,
  args: {
    connection: types.input.remote.ConnectionArgs;
    jobName: string;
    source: RcloneBackend;
    destination: RcloneBackend;
    rclone: RcloneOperation; // e.g., "sync" (default in current flows)
  }
) {
  const file = copyFileToRemote(
    `${cluster.title}-backup-${args.jobName}.sh`,
    {
      connection: args.connection,
      remotePath: interpolate`/opt/stacks/dockge/jobs/tasks/${args.jobName}.sh`,
      content: `#!/bin/bash
rclone ${args.rclone} ${toRcloneString(args.source)} ${toRcloneString(args.destination)} --verbose --log-file=/var/log/rclone-${args.jobName}.log
`,
    }
  );
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