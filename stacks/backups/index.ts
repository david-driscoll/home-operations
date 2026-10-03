import { type BackupPlanItem, BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import { backrestGarageBucket, backrestGarageEndpoint } from "@components/backrestGarage.ts";
import { dockerHostDirectory, hostHasActiveStack, listStackBackupTargets, resticExcludesFor, STACKS_DATA_ROOT } from "@components/dockerStackBackups.ts";
import { GARAGE_COPY_BUCKETS, TRUENAS_GARAGE_COPY_GROUP } from "@components/garageTruenasCopy.ts";
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

// Gatus group for the off-site copy of the Pulumi state: the loop in
// docker/alpha-site/garage-backup that mirrors the main cluster's
// `pulumi-state` bucket into alpha-site's standalone Garage. Same token
// contract (BACKUP_UPTIME_TOKEN in that stack's .env).
const PULUMI_STATE_OFFSITE_GROUP = "Pulumi State Offsite Backup";

const globals = new GlobalResources({}, {});
const dockgeDetails = globals.store.getDockgeInstances();

const backupPlanOrchestrator = new BackupPlanOrchestrator("backup-plan-orchestrator", globals);

// Every Dockge host's own backrest snapshots its stacks in place
// (docs/plans/host-owned-backups.md, phase 1). The key is the docker/<host>/
// directory, which is also the cluster key BackupPlanDirector matches `source`
// against. A host missing from this list fails the run below. The SFTP pull
// that used to stage the other hosts' stacks on celestia is gone.
//
// Rolled out one host at a time. celestia went first because its repos already
// lived on celestia: only the snapshot path changed, and the plan ids, repo ids
// and Gatus tokens stayed as they were. luna's repos live on celestia too, but
// luna holds a copy-job mirror of each one at the same path, and its backrest
// takes that over; BackupPlanDirector then copies them the other way, from luna
// to celestia. alpha-site has no /data for local repos, so it went straight to
// Garage (phase 2, step 7): see GARAGE_BACKED_HOSTS.
//
// skystar is listed although it is offline, so that it comes back the same way
// (David, 2026-10-01). It has no hosts/dockge record while the ocracoke Stack
// is disabled, so today it emits no plans at all. Its old repos on celestia,
// and luna's copies of them, stay on disk as a frozen archive, as alpha-site's
// did.
const HOST_OWNED_BACKUP_HOSTS: ReadonlySet<BackupPlanItem["source"]> = new Set(["celestia", "luna", "alpha-site", "skystar"]);

function isHostOwned(hostDir: string): hostDir is BackupPlanItem["source"] {
  return (HOST_OWNED_BACKUP_HOSTS as ReadonlySet<string>).has(hostDir);
}

// Host-owned hosts whose repos live in the geo Garage rather than in
// /data/backup on the host (docs/plans/host-owned-backups.md §C2), in the
// host's own `backrest-<host>` bucket. alpha-site first, because it has no
// /data at all. skystar goes the same way when it is back, which is what lets
// the SFTP pull go now rather than at its cutover. celestia and luna follow in
// phase 4. The key reaches the host as a file from stacks/system
// (components/backrestGarage.ts), so nothing secret is in the plan, and the
// copy tier leaves these repos alone: Garage replicates them, and TrueNAS
// pulls the bucket (components/garageTruenasCopy.ts; skystar's bucket joins
// that list when skystar's first night is green).
//
// The repos start fresh. A host's old ones stay on celestia (and luna's copies
// of them) as a frozen archive, the way the host-level plans were retired;
// nothing prunes them any more, so delete them by hand once the new repos hold
// a retention window of their own.
const GARAGE_BACKED_HOSTS: ReadonlySet<string> = new Set(["alpha-site", "skystar"]);

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
// Now each qualifying stack gets its own repo, its own plan and its own Gatus
// heartbeat, read in place on its own host. `listStackBackupTargets` decides what qualifies
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

    // No fallback any more. A host that is not host-owned used to be pulled
    // over SFTP into celestia's staging tree. That path is gone, so a new
    // Docker host has to be added to HOST_OWNED_BACKUP_HOSTS, and to
    // GARAGE_BACKED_HOSTS if it has no /data for local repos. Failing here
    // beats a host whose stacks quietly stop being backed up.
    if (!isHostOwned(hostDir)) {
      throw new Error(
        `docker/${hostDir}/ is not in HOST_OWNED_BACKUP_HOSTS (stacks/backups), so nothing would back up its stacks: every Docker host backs up its own now (docs/plans/host-owned-backups.md). Add it there, and to GARAGE_BACKED_HOSTS if it has no /data for local repos.`,
      );
    }

    return targets.map(target =>
      backupPlanOrchestrator.addBackupPlan(
        pulumi.output({
          source: hostDir,
          // The same identity the old pulled plans had, so a host's backrest
          // kept appending to the same repo when it took its stacks over: the
          // history carried over, and the first snapshot on the new path read
          // the tree once from local disk and uploaded little. On luna that repo
          // was the copy-job mirror already at /data/backup/<name>/, which
          // backrest adopted as it was: its auto-init is a no-op once
          // `restic cat config` succeeds.
          name: `${detail.name}-${target.stack}`,
          title: `${detail.title ?? detail.name}: ${target.stack}`,
          // The stack's own directory, read in place. The backrest container
          // mounts /opt/stacks-data read-only at the same path and runs with
          // DAC_READ_SEARCH (docker/_common/backrest/compose.yaml), so the
          // 0700 app directories that were the reason rclone-sftp runs as
          // uid 0 are readable here too.
          path: `${STACKS_DATA_ROOT}/${target.stack}/`,
          repository: `${detail.name}-${target.stack}`,
          // Always set, even when empty: BackupPlanDirector merges plans into
          // config.json key by key, so an omitted `excludes` would leave the
          // last run's list in place.
          planConfig: { excludes: resticExcludesFor(target) },
          garage: GARAGE_BACKED_HOSTS.has(hostDir)
            ? {
                endpoint: pulumi.output(globals.tailscaleDomain).apply(domain => backrestGarageEndpoint(hostDir, domain)),
                bucket: backrestGarageBucket(hostDir),
              }
            : undefined,
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

// The off-site Pulumi state copy's heartbeat. Registered only where the
// garage-backup stack is deployed (alpha-site). Cycles are hourly, so two missed
// cycles plus an hour of drift is the dead-man threshold; a failing cycle --
// including a source that is empty or unreachable, which the loop refuses to
// mirror -- pushes success=false with a reason and pages immediately.
addUptimeGatus("pulumi-state-offsite-backup", globals, {
  endpoints: [],
  "external-endpoints": dockgeDetails.apply(details =>
    details
      .filter(detail => hostHasActiveStack(dockerHostDirectory(detail.name), "garage-backup"))
      .map(
        detail =>
          ({
            enabled: true,
            name: detail.name,
            token: toGatusKey(PULUMI_STATE_OFFSITE_GROUP, detail.name),
            group: PULUMI_STATE_OFFSITE_GROUP,
            heartbeat: { interval: "3h" },
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

// The TrueNAS copy of the geo Garage (components/garageTruenasCopy.ts): one
// heartbeat per pulled bucket, pushed by that bucket's Cloud Sync task on
// spike. TrueNAS runs the push only after a pull succeeds, so a failing pull
// is silence, and the 25-hour window is what pages. The tokens come from the
// same group name and bucket on both sides; renaming either orphans the push.
addUptimeGatus("truenas-garage-copy", globals, {
  endpoints: [],
  "external-endpoints": GARAGE_COPY_BUCKETS.map(
    ({ bucket }) =>
      ({
        enabled: true,
        name: bucket,
        token: toGatusKey(TRUENAS_GARAGE_COPY_GROUP, bucket),
        group: TRUENAS_GARAGE_COPY_GROUP,
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

// Every stack's Pulumi state: the dockge Garage cluster's `pulumi-state`
// bucket (bootstrap/RUNBOOK.md). Garage has no object versioning, so THIS is
// what provides point-in-time copies -- rclone mirrors the bucket into
// backrest's staging tree and restic snapshots it, copied to the other PBS
// hosts nightly. (The pre-Garage copy on the TrueNAS Minio, and its plan,
// were retired once the rollback window closed.) The off-site copy on alpha-site (docker/alpha-site/
// garage-backup) is a separate, independent path.
//
// Staged OUTSIDE /data/staging/garage/: that tree is what garage-mirror copies
// back into the same Garage cluster, which would be a copy of the bucket into
// its own cluster. history/ and backups/ are excluded -- full checkpoint copies
// (one per update, and one per checkpoint save), regenerated constantly and
// pruned by kubernetes/apps/pulumi/history-pruner anyway. backups/ alone is
// most of the bucket's bytes.
//
// Read-only key, so a backup can never write the state it protects.
const pulumiStateReader = globals.store.getSecretByPath<{ username: string; password: string }>("apps/pulumi/state-s3-reader");
backupPlanOrchestrator.addBackupPlan(
  pulumi.all([pulumiStateReader, globals.tailscaleDomain]).apply(([reader, tailnet]) => ({
    source: "celestia" as const,
    name: "pulumi-state",
    title: "Pulumi state",
    path: "/data/staging/pulumi-state/",
    repository: "pulumi-state",
    preSync: {
      type: "s3" as const,
      endpoint: `http://dockge-celestia.${tailnet}:3900`,
      bucket: "pulumi-state",
      region: "garage",
      accessKeyId: reader.username,
      secretAccessKey: reader.password,
      exclude: ["*/.pulumi/history/**", "*/.pulumi/backups/**", "*/.pulumi/locks/**"],
    },
  })),
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
