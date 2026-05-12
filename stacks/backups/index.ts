import { BackupPlanManager } from "stacks/backups/BackupPlanManager.ts";
import { createClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import * as pulumi from "@pulumi/pulumi";

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

const backupPlanManager = new BackupPlanManager("backup-plan-manager", {
  globals,
  source: backupDetails.source,
  destinations: backupDetails.destinations,
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

backupPlanManager.createMinioBucketBackupJob({
  title: "Home Operations",
  bucket: "home-operations",
  globals,
});

backupPlanManager.createMinioBucketBackupJob({
  title: "Stargate Command Postgres",
  bucket: "stargate-command-db",
  restoreBucket: "stargate-command-db-restore",
  globals,
});

backupPlanManager.createMinioBucketBackupJob({
  title: "Equestria Postgres",
  bucket: "equestria-db",
  restoreBucket: "equestria-db-restore",
  globals,
});

backupPlanManager.finalize();

async function getBackupServerDetails(item: ReturnType<OPClient["mapItem"]>) {
  return {
    connection: {
      host: item.sections.ssh.fields.hostname.value!,
      user: item.sections.ssh.fields.username.value!,
    },
    cluster: createClusterDefinition(await op.getItemByTitle(item.fields.cluster.value!)),
    tags: item.tags,
    title: item.title,
  };
}
