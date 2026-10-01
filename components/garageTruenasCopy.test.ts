// npx tsx --test components/garageTruenasCopy.test.ts
//
// Pure-function tests for the TrueNAS copy of the geo Garage -- no Pulumi
// runtime, no TrueNAS. The calls that create these on spike live in
// configureGarageCopy (components/truenas.ts) and are exercised by deploys.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GARAGE_COPY_BUCKETS,
  GARAGE_COPY_DATASET,
  GARAGE_COPY_KEYS,
  GARAGE_COPY_RCLONE_ARGS,
  GARAGE_COPY_TASK_PREFIX,
  garageCopyCredential,
  garageCopyNfsShare,
  garageCopySnapshotTasks,
  garageCopyTask,
  TRUENAS_GARAGE_COPY_GROUP,
} from "./garageTruenasCopy.ts";
import { toGatusKey } from "./helpers.ts";
import { cloudCredentialMatches, cloudSyncTaskMatches, nfsShareMatches, snapshotTaskMatches } from "./truenas/truenas-manager.ts";
import type { CloudSyncTask, NFSShare, SnapshotTask } from "./truenas/truenas-types.ts";

describe("GARAGE_COPY_BUCKETS", () => {
  it("lists each bucket once, each with a known key", () => {
    const buckets = GARAGE_COPY_BUCKETS.map(entry => entry.bucket);
    assert.equal(new Set(buckets).size, buckets.length);
    for (const { key } of GARAGE_COPY_BUCKETS) assert.ok(key in GARAGE_COPY_KEYS);
  });

  it("never pulls the Immich repo back onto TrueNAS, where the library already is", () => {
    assert.ok(!GARAGE_COPY_BUCKETS.some(entry => entry.bucket === "backrest-immich"));
  });

  it("pulls pulumi-state with its ceremony key, not truenas-copy", () => {
    assert.deepEqual(
      GARAGE_COPY_BUCKETS.find(entry => entry.bucket === "pulumi-state"),
      { bucket: "pulumi-state", key: "pulumi-state-reader" },
    );
  });

  it("exports only restic buckets, never one that is not encrypted client-side", () => {
    const exported = GARAGE_COPY_BUCKETS.filter(entry => entry.restic).map(entry => entry.bucket);
    assert.deepEqual(exported.sort(), ["backrest-alpha-site", "volsync-equestria"]);
    for (const bucket of ["cnpg-equestria", "pulumi-state", "postgres-celestia", "postgres-luna", "postgres-skystar"]) {
      assert.ok(!exported.includes(bucket), `${bucket} must never get an NFS export`);
    }
  });
});

describe("garageCopyNfsShare", () => {
  it("exports the bucket's own dataset read-only, every client mapped to apps", () => {
    assert.deepEqual(garageCopyNfsShare("volsync-equestria"), {
      path: `/mnt/${GARAGE_COPY_DATASET}/volsync-equestria`,
      config: { comment: `${GARAGE_COPY_TASK_PREFIX}volsync-equestria (read-only, restic)`, ro: true, mapall_user: "apps", mapall_group: "apps" },
    });
  });
});

describe("garageCopyTask", () => {
  const task = garageCopyTask({ bucket: "cnpg-equestria", credentialsId: 7, uptimeUrl: "https://uptime.example.test" });

  it("pulls the bucket into its own child dataset, mirroring deletions", () => {
    assert.equal(task.description, `${GARAGE_COPY_TASK_PREFIX}cnpg-equestria`);
    assert.equal(task.path, `/mnt/${GARAGE_COPY_DATASET}/cnpg-equestria`);
    assert.deepEqual(task.attributes, { bucket: "cnpg-equestria", folder: "" });
    assert.equal(task.credentials, 7);
    assert.equal(task.direction, "PULL");
    assert.equal(task.transfer_mode, "SYNC");
    assert.deepEqual(task.exclude, ["locks/**"]);
  });

  it("pushes the bucket's own Gatus token, and never fails the pull over it", () => {
    const token = toGatusKey(TRUENAS_GARAGE_COPY_GROUP, "cnpg-equestria");
    assert.equal(token, "truenas-garage-copy_cnpg-equestria");
    assert.equal(task.post_script, `curl -sf -X POST -H "Authorization: Bearer ${token}" "https://uptime.example.test/api/v1/endpoints/${token}/external?success=true" || true`);
  });

  it("asks for every object unencoded, so traefik's compress middleware never touches it", () => {
    for (const { bucket } of GARAGE_COPY_BUCKETS) {
      assert.equal(garageCopyTask({ bucket, credentialsId: 7, uptimeUrl: "https://uptime.example.test" }).args, GARAGE_COPY_RCLONE_ARGS);
    }
    assert.deepEqual(GARAGE_COPY_RCLONE_ARGS.split(" ").sort(), ["--no-gzip-encoding", "--s3-use-accept-encoding-gzip=false"]);
  });

  it("keeps rclone's size and MD5 checks: the fix is the encoding, not skipping the check", () => {
    for (const flag of ["--ignore-checksum", "--ignore-size", "--size-only", "--s3-decompress"]) {
      assert.ok(!GARAGE_COPY_RCLONE_ARGS.includes(flag), `${flag} would hide a pull that wrote the wrong bytes`);
    }
  });
});

describe("garageCopyCredential", () => {
  it("names the credential after the key and pins Garage's region", () => {
    const credential = garageCopyCredential({ key: "truenas-copy", endpoint: "https://s3.celestia.example.test", accessKeyId: "GKid", secretAccessKey: "secret" });
    assert.equal(credential.name, "garage-truenas-copy");
    assert.deepEqual(credential.provider, {
      type: "S3",
      access_key_id: "GKid",
      secret_access_key: "secret",
      endpoint: "https://s3.celestia.example.test",
      region: "garage",
      skip_region: false,
      signatures_v2: false,
    });
  });
});

describe("garageCopySnapshotTasks", () => {
  const tasks = garageCopySnapshotTasks();

  it("keeps 1 daily, 4 weekly, 4 monthly and 1 yearly (H3)", () => {
    assert.deepEqual(
      tasks.map(task => [task.naming_schema, task.lifetime_value, task.lifetime_unit]),
      [
        ["garage-daily-%Y-%m-%d_%H-%M", 1, "DAY"],
        ["garage-weekly-%Y-%m-%d_%H-%M", 4, "WEEK"],
        ["garage-monthly-%Y-%m-%d_%H-%M", 4, "MONTH"],
        ["garage-yearly-%Y-%m-%d_%H-%M", 1, "YEAR"],
      ],
    );
  });

  it("gives every tier its own naming schema, so their retention stays apart", () => {
    assert.equal(new Set(tasks.map(task => task.naming_schema)).size, tasks.length);
  });

  it("snapshots the whole copy, recursively, on the right days", () => {
    for (const task of tasks) {
      assert.equal(task.dataset, GARAGE_COPY_DATASET);
      assert.equal(task.recursive, true);
    }
    assert.deepEqual(
      tasks.map(task => [task.schedule.dom, task.schedule.month, task.schedule.dow]),
      [
        ["*", "*", "*"],
        ["*", "*", "7"],
        ["1", "*", "*"],
        ["1", "1", "*"],
      ],
    );
  });
});

// What TrueNAS hands back differs from what was sent: defaults filled in, the
// credential expanded, cron fields possibly normalised. Steady state has to
// read as "no change", or stacks/system rewrites every task every five minutes.
describe("matchers", () => {
  const desiredCredential = garageCopyCredential({ key: "truenas-copy", endpoint: "https://s3.celestia.example.test", accessKeyId: "GKid", secretAccessKey: "secret" });
  const existingCredential = { id: 3, ...desiredCredential, provider: { ...desiredCredential.provider, max_upload_parts: 10000 } };

  it("treats an unchanged credential as unchanged, and a rotated key as a change", () => {
    assert.equal(cloudCredentialMatches(existingCredential, desiredCredential), true);
    assert.equal(cloudCredentialMatches(existingCredential, { ...desiredCredential, provider: { ...desiredCredential.provider, secret_access_key: "rotated" } }), false);
    assert.equal(cloudCredentialMatches(existingCredential, { ...desiredCredential, provider: { ...desiredCredential.provider, endpoint: "https://s3.luna.example.test" } }), false);
  });

  const desiredTask = garageCopyTask({ bucket: "pulumi-state", credentialsId: 3, uptimeUrl: "https://uptime.example.test" });
  const existingTask: CloudSyncTask = {
    ...desiredTask,
    id: 11,
    credentials: existingCredential,
    attributes: { ...desiredTask.attributes, region: "", encryption: null, storage_class: "" } as CloudSyncTask["attributes"],
    schedule: { ...desiredTask.schedule, minute: "0" },
    include: [],
    transfers: null,
    locked: false,
    job: null,
  };

  it("treats an unchanged task as unchanged despite TrueNAS's defaults and a normalised cron field", () => {
    assert.equal(cloudSyncTaskMatches(existingTask, desiredTask), true);
  });

  it("sees a changed heartbeat, credential, schedule, exclude or rclone flags as a change", () => {
    assert.equal(cloudSyncTaskMatches({ ...existingTask, post_script: "" }, desiredTask), false);
    assert.equal(cloudSyncTaskMatches({ ...existingTask, credentials: { ...existingCredential, id: 4 } }, desiredTask), false);
    assert.equal(cloudSyncTaskMatches({ ...existingTask, schedule: { ...existingTask.schedule, hour: "14" } }, desiredTask), false);
    assert.equal(cloudSyncTaskMatches({ ...existingTask, exclude: [] }, desiredTask), false);
    // The tasks created before GARAGE_COPY_RCLONE_ARGS have TrueNAS's empty
    // default, so the next run rewrites them.
    assert.equal(cloudSyncTaskMatches({ ...existingTask, args: "" }, desiredTask), false);
  });

  it("treats an unchanged snapshot task as unchanged, and a changed retention as a change", () => {
    const [daily] = garageCopySnapshotTasks();
    assert.ok(daily);
    const existing: SnapshotTask = { ...daily, id: 5, schedule: { ...daily.schedule, begin: "00:00", end: "23:59" }, vmware_sync: false, state: {} };
    assert.equal(snapshotTaskMatches(existing, daily), true);
    assert.equal(snapshotTaskMatches({ ...existing, lifetime_value: 2 }, daily), false);
  });

  it("treats an unchanged NFS share as unchanged despite TrueNAS's defaults, and a writable one as a change", () => {
    const { path, config } = garageCopyNfsShare("volsync-equestria");
    const existing: NFSShare = {
      id: 9,
      path,
      comment: config.comment ?? "",
      networks: [],
      hosts: [],
      ro: true,
      maproot_user: null,
      maproot_group: null,
      mapall_user: "apps",
      mapall_group: "apps",
      security: [],
      enabled: true,
      locked: false,
    };
    assert.equal(nfsShareMatches(existing, config), true);
    assert.equal(nfsShareMatches({ ...existing, ro: false }, config), false);
    assert.equal(nfsShareMatches({ ...existing, mapall_user: "root" }, config), false);
    // TruenasVm.addClusterBackup's shares set only the mapping, so other fields never count.
    assert.equal(nfsShareMatches({ ...existing, ro: false, comment: "" }, { mapall_user: "apps", mapall_group: "apps" }), true);
  });
});
