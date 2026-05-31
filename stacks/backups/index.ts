import { BackupPlanManager, PbsDetails } from "./BackupPlanManager.ts";
import { createClusterDefinition, GlobalResources, KubernetesClusterDefinition } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import * as pulumi from "@pulumi/pulumi";
import { kubernetesBackups } from "./kubernetes-backups.ts";

const globals = new GlobalResources({}, {});
const op = new OPClient();

const backupDetails = pulumi
  .output(op.findItemsByTag("pbs"))
  .apply((items) => pulumi.all(items.map(getBackupServerDetails)))
  .apply((items) => {
    const source = items.find((item) => item.tags?.includes("backup-source"))!;
    const destinations = items.filter((item) => item.tags?.includes("backup-destination"));
    return { source, destinations };
  });

const dockgeDetails = pulumi.output(op.findItemsByTag("dockge")).apply((items) => pulumi.all(items.map(getDockgeServerDetails)));

const backupPlanManager = new BackupPlanManager("backup-plan-manager", {
  globals,
  source: backupDetails.source,
  destinations: backupDetails.destinations,
});

const sgcCluster = pulumi.output(op.getItemByTitle("Cluster: Stargate Command")).apply((c) => createClusterDefinition(c) as KubernetesClusterDefinition);
const equestriaCluster = pulumi.output(op.getItemByTitle("Cluster: Equestria")).apply((c) => createClusterDefinition(c) as KubernetesClusterDefinition);

sgcCluster.apply((cluster) => kubernetesBackups(backupPlanManager, cluster));
equestriaCluster.apply((cluster) => kubernetesBackups(backupPlanManager, cluster));

dockgeDetails.apply((details) => {
  return details.map((detail) => {
    // Pre-sync: rclone pulls /opt/stacks-data/ from the dockge host into the backrest
    // container's staging dir before restic snapshots it.  The old createBackupJob
    // call is replaced by the preSync param on createBackrestPlan.
    return backupPlanManager.createBackrestPlan(detail.name, {
      title: detail.title,
      path: pulumi.interpolate`/data/staging/${detail.name}/`,
      repository: detail.name,
      preSync: {
        sftpHost: detail.hostname,
        // rclone-sftp serves /data/ as root; /opt/stacks-data/ is mounted at /data/stacks/
        sourcePath: "/stacks/",
        // rclone-sftp listens on port 2022 (traefik sftp entrypoint)
        sftpPort: 2022,
      },
      planConfig: {
        schedule: {
          cron: "0 3 * * *",
          clock: "CLOCK_LOCAL",
        },
      },
    });
  });
});

backupPlanManager.createBackrestPlan("immich", {
  title: "Immich",
  path: "/spike/data/immich/",
  repository: "immich",
  planConfig: {
    excludes: ["/spike/data/immich/backups", "/spike/data/immich/encoded-video"],
  },
});

backupPlanManager.createBackrestPlan("pgdump", {
  title: "Postgres Dumps",
  path: "/spike/data/pgdump/",
  repository: "pgdump",
});

async function getBackupServerDetails(item: ReturnType<OPClient["mapItem"]>): Promise<PbsDetails> {
  try {
    const dockgeItem = await op.getItemByTitle(item.fields.dockge.value!);
    return {
      backupServerConnection: {
        host: item.sections.ssh.fields.hostname.value!,
        user: item.sections.ssh.fields.username.value!,
      },
      dockgeConnection: {
        host: dockgeItem.sections.ssh.fields.hostname.value!,
        user: "root",
      },
      cluster: createClusterDefinition(await op.getItemByTitle(item.fields.cluster.value!)),
      tags: item.tags,
      title: item.title,
      publicKey: item.sections.backrest.fields.publicKey.value!,
      privateKey: item.sections.backrest.fields.privateKey.value!,
      privateKeyId: item.sections.backrest.fields.privateKeyId.value!,
      // SSH port on the dockge HOST that destinations use for rclone SFTP pull.
      sshPort: parseInt(dockgeItem.sections.ssh?.fields?.port?.value ?? "2022") || 2022,
    };
  } catch (error) {
    pulumi.log.error(`Error getting backup server details: ${error}`);
    pulumi.log.error(`Item details: ${JSON.stringify(item)}`);

    throw error;
  }
}

async function getDockgeServerDetails(item: ReturnType<OPClient["mapItem"]>) {
  try {
    return {
      name: item.fields.name.value!,
      hostname: item.sections.ssh.fields.hostname.value!,
      tags: item.tags,
      title: item.title,
    };
  } catch (error) {
    pulumi.log.error(`Error getting backup server details: ${error}`);
    pulumi.log.error(`Item details: ${JSON.stringify(item)}`);

    throw error;
  }
}

backupPlanManager.finalize();
