import { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import { GlobalResources } from "@components/globals.ts";
import * as pulumi from "@pulumi/pulumi";

const globals = new GlobalResources({}, {});
const dockgeDetails = globals.store.getDockgeInstances();

const backupPlanOrchestrator = new BackupPlanOrchestrator("backup-plan-orchestrator");

const dockgeInstances = dockgeDetails.apply(details => {
  return details.map(detail => {
    // Pre-sync: rclone pulls /opt/stacks-data/ from the dockge host into the backrest
    // container's staging dir before restic snapshots it.  The old createBackupJob
    // call is replaced by the preSync param on createBackrestPlan.
    return backupPlanOrchestrator.addBackupPlan(
      pulumi.output({
        source: "celestia",
        name: detail.name,
        title: detail.title,
        path: pulumi.interpolate`/data/staging/${detail.name}/`,
        repository: detail.name,
        preSync: {
          sftpHost: detail.hostname,
          sftpPort: 2022,
          sourcePath: "/stacks/",
          exclude: [
            // "/adguard/confdir/AdGuardHome.yaml*",
            // The shared Postgres live data directory (docker/_common/postgres).
            // A file-level copy of a running cluster is torn, not
            // crash-consistent: the data files and the WAL are captured at
            // different instants, so the snapshot can restore to nothing while
            // still looking like a successful backup. That failure is silent
            // until someone needs it. The restorable artifact is the nightly
            // pg_dump output in /postgres/dumps, which is NOT excluded and is
            // what this plan actually protects. Do not remove this line without
            // replacing it with a proper WAL-archiving setup.
            "/postgres/pgdata",
            "/authentik-outpost",
            "/backrest",
            "/autoheal",
            "/backups",
            "/docker-socket-proxy",
            "/prometheus",
            "/rclone-sftp",
            "/zot",
          ],
        },
      }),
    );
  });
});

backupPlanOrchestrator.addBackupPlan(
  pulumi.output({
    source: "celestia",
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
    source: "celestia",
    name: "pgdump",
    title: "Postgres Dumps",
    path: "/spike/data/pgdump/",
    repository: "pgdump",
  }),
);

pulumi.all([dockgeInstances]).apply(() => {
  pulumi.log.info("Finalizing backup plan manager with all backup jobs created", backupPlanOrchestrator);
  return backupPlanOrchestrator.savePlan("Backup Plan");
});
