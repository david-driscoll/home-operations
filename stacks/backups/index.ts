import { GlobalResources, OnePasswordItem } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "./ProxmoxBackupServer.ts";
import { Input, interpolate, output } from "@pulumi/pulumi";
import { RcloneBackend, RcloneOperation } from "../../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { addExternalGatus, addUptimeGatus, copyFileToRemote } from "@components/helpers.ts";
import { createBackupJob, getJobs } from "./jobs.ts";
import { kebabCase } from "moderndash";

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
  jobName: "Immich sync to B2",
  rclone: "sync",
  connection: celestiaConnection,
  destination: { ...b2Bucket, prefix: "immich" },
  source: {
    type: "local",
    path: "/data/backup/immich/",
  },
});

addExternalGatus(
  "backup-jobs",
  globals,
  getJobs().map((job) => {
    return {
      enabled: true,
      name: `Backup Job: ${job}`,
      group: "Jobs",
      token: kebabCase(job),
      heartbeat: {
        interval: "30h",
      },
    };
  })
);
