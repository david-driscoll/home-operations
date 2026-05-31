import { OPClient } from "../../components/op.ts";
import * as pulumi from "@pulumi/pulumi";
import { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";

const op = new OPClient();

const dockgeDetails = pulumi.output(op.findItemsByTag("dockge")).apply((items) => pulumi.all(items.map(getDockgeServerDetails)));

const backupPlanOrchestrator = new BackupPlanOrchestrator("backup-plan-orchestrator");

const dockgeInstances = dockgeDetails.apply((details) => {
  return details.map((detail) => {
    // Pre-sync: rclone pulls /opt/stacks-data/ from the dockge host into the backrest
    // container's staging dir before restic snapshots it.  The old createBackupJob
    // call is replaced by the preSync param on createBackrestPlan.
    return backupPlanOrchestrator.addBackupPlan(
      pulumi.output({
        name: detail.name,
        title: detail.title,
        path: pulumi.interpolate`/data/staging/${detail.name}/`,
        repository: detail.name,
        preSync: {
          sftpHost: detail.hostname,
          sftpPort: 2022,
          sourcePath: "/stacks/",
        },
      }),
    );
  });
});

backupPlanOrchestrator.addBackupPlan(
  pulumi.output({
    name: "immich",
    title: "Immich",
    path: "/spike/data/immich/",
    repository: "immich",
    planConfig: {
      excludes: ["/spike/data/immich/backups", "/spike/data/immich/encoded-video"],
    },
  }),
);

backupPlanOrchestrator.addBackupPlan(
  pulumi.output({
    name: "pgdump",
    title: "Postgres Dumps",
    path: "/spike/data/pgdump/",
    repository: "pgdump",
  }),
);

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

pulumi.all([dockgeInstances]).apply(() => {
  pulumi.log.info("Finalizing backup plan manager with all backup jobs created", backupPlanOrchestrator);
  return backupPlanOrchestrator.savePlan();
});
