import { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import { dockerHostDirectory, hostHasActiveStack, listStackBackupTargets } from "@components/dockerStackBackups.ts";
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

// Gatus group for the garage-sync loops (docker/_common/garage) that mirror
// each node's dumps into its postgres-<cluster> bucket. Same load-bearing
// token contract as the group above: docker/_common/garage/.env restates
// toGatusKey(this, <dockge name>) as GARAGE_SYNC_UPTIME_TOKEN, so changing
// either side orphans every push and the endpoints go permanently red.
const DOCKGE_GARAGE_SYNC_GROUP = "Dockge Garage Postgres Sync";

// Gatus group for the garage-mirror loop that copies /data/staging/garage/
// (the backrest pre-sync tree for every annotated in-cluster GarageBucket —
// garage-system AND forgejo-garage) into the geo cluster's garage-mirror
// bucket. Same token contract (GARAGE_MIRROR_UPTIME_TOKEN in the garage
// stack's .env); registered for celestia alone because the service idles by
// design everywhere else — see the garage-mirror comment in
// docker/_common/garage/compose.yaml.
const DOCKGE_GARAGE_MIRROR_GROUP = "Dockge Garage Bucket Mirror";

const globals = new GlobalResources({}, {});
const dockgeDetails = globals.store.getDockgeInstances();

const backupPlanOrchestrator = new BackupPlanOrchestrator("backup-plan-orchestrator", globals);

// One backrest plan per STACK, not per host.
//
// The old shape was a single plan per dockge host whose pre-sync pulled the
// whole of /opt/stacks-data/ in one rclone run under ON_ERROR_FATAL. That made
// every stack a single point of failure for every other stack on the same host
// -- one file being appended to mid-copy aborted the sync and took the entire
// host's snapshot with it -- and made "restore forgejo" mean unpacking a
// snapshot of the whole machine. It also meant a single green/red heartbeat
// per host, so a stack whose data had silently stopped changing looked exactly
// like a healthy one.
//
// Now each qualifying stack gets its own repo, its own plan, its own pre-sync,
// and its own Gatus heartbeat. `listStackBackupTargets` decides what qualifies
// from the repo working tree -- see components/dockerStackBackups.ts for the
// rule and for why three stacks are opted out of it by hand.
const dockgeInstances = dockgeDetails.apply(details =>
  details.flatMap(detail => {
    const hostDir = dockerHostDirectory(detail.name);
    const targets = listStackBackupTargets(hostDir);
    // A host that resolves to zero stacks is never a legitimate state -- every
    // dockge host runs traefik and technitium at minimum. Far more likely is a
    // renamed/emptied docker/<host>/ directory, which would otherwise show up
    // as that host quietly dropping out of the backup inventory.
    if (targets.length === 0) {
      throw new Error(
        `docker/${hostDir}/ resolved to no backup-eligible stacks for dockge instance '${detail.name}'. Every dockge host should have at least traefik and technitium; an empty result means the directory or the stacks-data rule is wrong, not that the host has nothing to back up.`,
      );
    }

    return targets.map(target =>
      backupPlanOrchestrator.addBackupPlan(
        pulumi.output({
          source: "celestia",
          // IDENTITY, not a label: this is the restic repo id, the plan id, the
          // /data/backup/<name>/ directory, the staging directory, and the
          // Gatus token. It is also deliberately DISTINCT from the retired
          // host-level ids ("celestia-dockge"), whose repos stay on disk as a
          // frozen archive -- see RETIRED_BACKREST_PLANS.
          name: `${detail.name}-${target.stack}`,
          // Display only; nothing derives from it. The `??` is not decorative:
          // the OpenBao dockge item carries no `title` field even though the
          // type declares one, so this is undefined on every real read.
          title: `${detail.title ?? detail.name}: ${target.stack}`,
          // Staging deliberately reuses the host-level tree the old whole-host
          // sync already populated, one subdirectory per stack. The layout is
          // identical, so the first per-stack run is a near no-op diff instead
          // of re-downloading the entire estate over SFTP. Directories left
          // behind by stacks that no longer qualify are dead weight, not a
          // correctness problem -- nothing snapshots them any more.
          path: `/data/staging/${detail.name}/${target.stack}/`,
          repository: `${detail.name}-${target.stack}`,
          preSync: {
            sftpHost: detail.hostname,
            sftpPort: 2022,
            // rclone-sftp serves /opt/stacks-data/ as /data/stacks/, rooted at
            // /stacks/ for the client.
            sourcePath: `/stacks/${target.stack}/`,
            exclude: target.excludes,
          },
        }),
      ),
    );
  }),
);

// Each host's `postgres` plan above snapshots that host's dumps/ directory, but
// restic cannot tell a fresh dump from a fortnight-old one -- it copies
// whatever is on disk and reports success either way. So a node whose
// postgres-backup loop has been failing, or whose postgres is unreachable,
// keeps producing green backups of increasingly stale dumps. These heartbeats close that hole: backup.sh pushes
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

// The garage-sync heartbeats. A green backrest snapshot of a dumps directory
// says nothing about whether the GARAGE mirror of it is still being taken —
// exactly the blind spot the postgres-dump group closes for restic — so the
// sync loop reports each cycle here and Gatus pages when nothing arrives. Only
// hosts that actually deploy the garage stack are registered: an endpoint for
// alpha-site (docker/alpha-site/garage/.ignore) would be red by construction.
addUptimeGatus("dockge-garage-sync", globals, {
  endpoints: [],
  "external-endpoints": dockgeDetails.apply(details =>
    details
      .filter(detail => hostHasActiveStack(dockerHostDirectory(detail.name), "garage"))
      .map(
        detail =>
          ({
            enabled: true,
            name: detail.name,
            token: toGatusKey(DOCKGE_GARAGE_SYNC_GROUP, detail.name),
            group: DOCKGE_GARAGE_SYNC_GROUP,
            // Cycles run every GARAGE_SYNC_INTERVAL_SECONDS (6h), clock
            // starting at container start; two missed cycles plus an hour of
            // drift is the page threshold. A FAILING cycle still pushes
            // (success=false) and alerts immediately — this window only covers
            // the loop being dead or the host being gone.
            heartbeat: { interval: "13h" },
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

// The in-cluster-Garage mirror heartbeat. One endpoint, celestia only: the
// mirror is live exactly where stacks/system delivers mirror.env, which is
// exactly where backrest's staging tree lives. The other nodes' mirror
// containers idle healthy and never push, so an endpoint for them would be
// red by construction.
addUptimeGatus("dockge-garage-mirror", globals, {
  endpoints: [],
  "external-endpoints": dockgeDetails.apply(details =>
    details
      .filter(detail => detail.name === "celestia-dockge" && hostHasActiveStack(dockerHostDirectory(detail.name), "garage"))
      .map(
        detail =>
          ({
            enabled: true,
            name: detail.name,
            token: toGatusKey(DOCKGE_GARAGE_MIRROR_GROUP, detail.name),
            group: DOCKGE_GARAGE_MIRROR_GROUP,
            // Same cadence and reasoning as the sync group above: 6h cycles,
            // two missed cycles plus drift before the dead-man pages, failed
            // cycles push success=false and alert immediately regardless.
            heartbeat: { interval: "13h" },
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
