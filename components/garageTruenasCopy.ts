/**
 * The TrueNAS copy of the geo Garage (docs/plans/host-owned-backups.md §C3):
 * which buckets spike pulls, with which read-only key, and the shape of its
 * Cloud Sync and snapshot tasks.
 *
 * WHY. Garage replicates every write to its other nodes, and with it every
 * deletion and every bad prune: it is redundancy, not history. While skystar
 * is offline its two live nodes also share a site. spike sits on neither,
 * pulls each bucket on a schedule, and keeps ZFS snapshots of the result.
 * No Garage credential can touch those snapshots, and the pulling key can only
 * read, so a compromised TrueNAS cannot damage the source either.
 *
 * Two stacks read this list, and it is the only place it is written down:
 *
 *   stacks/system   mints `truenas-copy` with read on its buckets, then hands
 *                   both keys to spike and creates its datasets and tasks, in
 *                   the same run (garage.ts → components/truenas.ts
 *                   configureGarageCopy)
 *   stacks/backups  registers one Gatus heartbeat per bucket
 *
 * Everything here is pure, so garageTruenasCopy.test.ts can check it without a
 * Pulumi runtime or a TrueNAS.
 */
import { toGatusKey } from "./helpers.ts";
import type { CloudCredentialInput, CloudSyncTaskInput, CronSchedule, SnapshotTaskInput } from "./truenas/truenas-types.ts";

/**
 * The Gatus group every pull's post-script pushes to. Load-bearing on both
 * sides: the tokens are derived from it, so renaming it orphans every push.
 */
export const TRUENAS_GARAGE_COPY_GROUP = "TrueNAS Garage Copy";

/** Every pulled bucket lands in a child of this dataset, which the snapshot tasks cover recursively. */
export const GARAGE_COPY_DATASET = "stash/backup/garage";

/**
 * The read-only keys, by the OpenBao path (`secrets` mount) of their record.
 *
 *   truenas-copy         minted for this by stacks/system (garage.ts), with
 *                        read on every bucket below that names it.
 *   pulumi-state-reader  the bootstrap ceremony's key (docs/garage-offsite-s3.md).
 *                        `pulumi-state` lives outside Pulumi, so stacks/system
 *                        has no bucket id to grant `truenas-copy` on. Backrest's
 *                        pre-sync and alpha-site's mirror read with it too.
 */
export const GARAGE_COPY_KEYS = {
  "truenas-copy": "clusters/spike/apps/garage/copy",
  "pulumi-state-reader": "apps/pulumi/state-s3-reader",
} as const;

export type GarageCopyKey = keyof typeof GARAGE_COPY_KEYS;

/**
 * Every bucket TrueNAS pulls, and the key that pulls it.
 *
 * These are the buckets already in Garage with no independent copy (§C3): the
 * CNPG archive, the Pulumi state, and each Docker host's Postgres dumps until
 * `garage-sync` retires in phase 4. skystar's is pulled although skystar is
 * offline: it holds that host's last dumps, which is reason enough. Then the
 * restic buckets, each as its first writer arrives: alpha-site's in phase 2,
 * VolSync and pgdump in phase 3, the other hosts' in phase 4.
 *
 * Never add `backrest-immich`: the library already lives on TrueNAS, so a copy
 * there would sit next to the original. Removing a bucket here deletes its
 * Cloud Sync task on the next run, and leaves its dataset and snapshots.
 */
export const GARAGE_COPY_BUCKETS: readonly { bucket: string; key: GarageCopyKey }[] = [
  { bucket: "cnpg-equestria", key: "truenas-copy" },
  { bucket: "postgres-celestia", key: "truenas-copy" },
  { bucket: "postgres-luna", key: "truenas-copy" },
  { bucket: "postgres-skystar", key: "truenas-copy" },
  { bucket: "pulumi-state", key: "pulumi-state-reader" },
  { bucket: "backrest-alpha-site", key: "truenas-copy" },
];

/**
 * Every Cloud Sync task this module manages is described with this prefix.
 * TruenasVm.addGarageCopy deletes a prefixed task whose bucket is no longer
 * listed, and never touches a task without the prefix.
 */
export const GARAGE_COPY_TASK_PREFIX = "garage-copy: ";

/** SigV4 region; must match s3_api.s3_region in docker/_common/garage/garage.toml. */
const GARAGE_REGION = "garage";

/**
 * When spike pulls, in TrueNAS's local time (the estate's TIMEZONE): after the
 * Backrest queue (01:00 local, done by mid-morning) and the copy tier (15:00
 * and 16:00 UTC), so the Garage hosts are otherwise quiet.
 */
export const GARAGE_COPY_PULL_SCHEDULE: CronSchedule = { minute: "00", hour: "13", dom: "*", month: "*", dow: "*" };

/** When the snapshots are taken: well after the pulls, so each one captures a finished pull. */
const GARAGE_COPY_SNAPSHOT_HOUR = "18";

/**
 * Where spike reaches Garage: celestia's own node, over the LAN, through the
 * per-node route (`s3.${CLUSTER_DOMAIN}` in docker/_common/garage/compose.yaml).
 * equestria and celestia share a site, the decision behind H4 and H5, so the
 * pulls never cross the tailnet. The trade-off is that they stop while celestia
 * is down.
 */
export function garageCopyEndpoint(searchDomain: string): string {
  return `https://s3.celestia.${searchDomain}`;
}

/** The TrueNAS cloud credential for one of the keys above. */
export function garageCopyCredential(args: { key: GarageCopyKey; endpoint: string; accessKeyId: string; secretAccessKey: string }): CloudCredentialInput {
  return {
    name: `garage-${args.key}`,
    provider: {
      type: "S3",
      access_key_id: args.accessKeyId,
      secret_access_key: args.secretAccessKey,
      endpoint: args.endpoint,
      // Set, so TrueNAS never asks Garage for the bucket location: with an
      // empty region it calls GetBucketLocation while validating each task.
      region: GARAGE_REGION,
      skip_region: false,
      signatures_v2: false,
    },
  };
}

/** The local path a bucket is pulled into. */
export function garageCopyPath(bucket: string): string {
  return `/mnt/${GARAGE_COPY_DATASET}/${bucket}`;
}

/**
 * The Cloud Sync task that pulls one bucket.
 *
 * PULL with SYNC: the dataset mirrors the bucket, deletions included, and the
 * snapshots are what keep a deleted or damaged object recoverable. `locks/`
 * is skipped at any depth: restic and Pulumi both keep short-lived lock files
 * there, and a copy of one is noise at best.
 *
 * The post-script is the heartbeat. TrueNAS runs it only after rclone exits 0
 * (plugins/cloud_sync.py), so a failed pull pushes nothing and Gatus pages when
 * the 25-hour window runs out. `|| true` keeps a Gatus outage from marking a
 * good pull as failed.
 */
export function garageCopyTask(args: { bucket: string; credentialsId: number; uptimeUrl: string }): CloudSyncTaskInput {
  const token = toGatusKey(TRUENAS_GARAGE_COPY_GROUP, args.bucket);
  return {
    description: `${GARAGE_COPY_TASK_PREFIX}${args.bucket}`,
    path: garageCopyPath(args.bucket),
    credentials: args.credentialsId,
    attributes: { bucket: args.bucket, folder: "" },
    schedule: GARAGE_COPY_PULL_SCHEDULE,
    direction: "PULL",
    transfer_mode: "SYNC",
    exclude: ["locks/**"],
    pre_script: "",
    post_script: `curl -sf -X POST -H "Authorization: Bearer ${token}" "${args.uptimeUrl}/api/v1/endpoints/${token}/external?success=true" || true`,
    enabled: true,
  };
}

/**
 * The four snapshot tasks on GARAGE_COPY_DATASET, decided as H3 in the plan:
 * 1 daily, 4 weekly, 4 monthly and 1 yearly. Each has its own naming schema,
 * because TrueNAS applies a task's retention only to snapshots matching its
 * schema; that is what keeps the tiers apart. Retention is by age, so "keep 4
 * weekly" is a four-week lifetime on a weekly schedule.
 *
 * The yearly snapshot pins whatever was pruned in its year, so the dataset has
 * to be sized for that (§C3).
 */
export function garageCopySnapshotTasks(): SnapshotTaskInput[] {
  const at = (schedule: Partial<CronSchedule>): CronSchedule => ({ minute: "00", hour: GARAGE_COPY_SNAPSHOT_HOUR, dom: "*", month: "*", dow: "*", ...schedule });
  const tier = (name: string, schedule: CronSchedule, lifetime_value: number, lifetime_unit: SnapshotTaskInput["lifetime_unit"]): SnapshotTaskInput => ({
    dataset: GARAGE_COPY_DATASET,
    recursive: true,
    lifetime_value,
    lifetime_unit,
    naming_schema: `garage-${name}-%Y-%m-%d_%H-%M`,
    schedule,
    enabled: true,
    exclude: [],
    allow_empty: true,
  });
  return [
    tier("daily", at({}), 1, "DAY"),
    // Sunday; TrueNAS counts dow from "1" (Monday) to "7".
    tier("weekly", at({ dow: "7" }), 4, "WEEK"),
    tier("monthly", at({ dom: "1" }), 4, "MONTH"),
    tier("yearly", at({ dom: "1", month: "1" }), 1, "YEAR"),
  ];
}
