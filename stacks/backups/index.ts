import { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import { GlobalResources } from "@components/globals.ts";
import { addUptimeGatus, toGatusKey } from "@components/helpers.ts";
import type { ExternalEndpoint } from "@openapi/application-definition.js";
import * as pulumi from "@pulumi/pulumi";

// Gatus group for the per-node Postgres dumps produced by
// docker/_common/postgres. `docker/_common/postgres/.env` restates
// toGatusKey(this, <dockge name>) to build POSTGRES_DUMP_UPTIME_TOKEN, so this
// string and `detail.name` below are load-bearing on both sides -- changing
// either orphans every push and every endpoint goes permanently red.
const DOCKGE_POSTGRES_DUMP_GROUP = "Dockge Postgres Dumps";

const globals = new GlobalResources({}, {});
const dockgeDetails = globals.store.getDockgeInstances();

const backupPlanOrchestrator = new BackupPlanOrchestrator("backup-plan-orchestrator", globals);

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
            // Technitium's hourly query-statistics files (1103 of them, 222 MB
            // on celestia). The current hour's .stat is being appended to for
            // the whole hour, so rclone reliably copies it mid-write and fails
            // the transfer with "corrupted on transfer: md5 hashes differ" —
            // which aborts the ON_ERROR_FATAL pre-sync hook and takes the
            // entire plan's snapshot with it. Pure telemetry for the DNS
            // dashboards; nothing is reconstructed from it.
            "/technitium/config/stats",
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

// The dockge plans above snapshot /postgres/dumps, but restic cannot tell a
// fresh dump from a fortnight-old one -- it copies whatever is on disk and
// reports success either way. So a node whose postgres-backup loop has been
// failing, or whose postgres is unreachable, keeps producing green backups of
// increasingly stale dumps. These heartbeats close that hole: backup.sh pushes
// the result of each cycle here, and Gatus pages when no push arrives inside
// 25h -- which also covers the container being stopped or never started. It is
// the docker-side equivalent of a failed CronJob in
// kubernetes/apps/database/postgres/backups.
addUptimeGatus("dockge-postgres-dumps", globals, {
  endpoints: [],
  "external-endpoints": dockgeDetails.apply(details =>
    details.map(
      detail =>
        ({
          enabled: true,
          name: detail.name,
          token: toGatusKey(DOCKGE_POSTGRES_DUMP_GROUP, detail.name),
          group: DOCKGE_POSTGRES_DUMP_GROUP,
          // Dumps run every POSTGRES_DUMP_INTERVAL_SECONDS (24h) with the
          // clock starting at container start, so the window has to absorb a
          // restart's worth of drift plus the dump itself. Same 25h the
          // backrest plans use.
          heartbeat: { interval: "25h" },
          alerts: [
            {
              type: "pushover",
              enabled: true,
              "success-threshold": 1,
              "failure-threshold": 1,
              "minimum-reminder-interval": "24h",
            },
          ],
        }) as ExternalEndpoint,
    ),
  ),
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
    name: "home-operations",
    title: "home-operations",
    path: "/spike/data/minio/home-operations/",
    repository: "home-operations",
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
