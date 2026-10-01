import * as pulumi from "@pulumi/pulumi";
import { GARAGE_COPY_BUCKETS, GARAGE_COPY_DATASET, GARAGE_COPY_TASK_PREFIX, type GarageCopyKey, garageCopyCredential, garageCopySnapshotTasks, garageCopyTask } from "./garageTruenasCopy.ts";
import type { GlobalResources } from "./globals.ts";
import { awaitOutput } from "./helpers.ts";
import { AuthLoginWithApiKeyRequest, TrueNASClient } from "./truenas/index.ts";
import TrueNASResourceManager from "./truenas/truenas-manager.ts";

// Create a simple function that doesn't capture complex objects
export async function getTruenasClient(globals: GlobalResources, credentialTitle: string) {
  const item = await awaitOutput(globals.store.getSecretByTitle<{ domain: string; credential: string }>(credentialTitle));

  // Create the new JSON-RPC client instance
  const truenasClient = new TrueNASClient(item.domain, {
    ssl: true,
    port: 443,
    reconnectOnClose: true,
    maxReconnectAttempts: 3,
  });
  const connection = await truenasClient.connection;

  // Try API key first, then fall back to username/password
  const apiKey = item.credential;
  const auth = await connection.sendRequest(AuthLoginWithApiKeyRequest, apiKey);
  if (!auth) {
    throw new Error("Failed to authenticate to TrueNAS with provided API key");
  }
  return truenasClient;
}

/**
 * Make spike's copy of the geo Garage match components/garageTruenasCopy.ts: a
 * cloud credential per read-only key, a dataset and a PULL Cloud Sync task per
 * bucket under stash/backup/garage, and the four snapshot tasks.
 *
 * Called from stacks/system (garage.ts), the stack that mints the
 * `truenas-copy` key, so one run creates the key and hands it to TrueNAS -- the
 * way deliverCredentialFile hands the other keys to their hosts. Reading it
 * back from OpenBao in another stack would race that write, because the
 * operator does not order Stacks on a commit (docs/plans/host-owned-backups.md,
 * "How a change reaches the hosts").
 *
 * Runs on `up` only, and NEVER fails the stack: stacks/system also mints every
 * app's database credentials, and a TrueNAS outage must not hold those up.
 * Anything that goes wrong is a warning in the run log and `skipped` in the
 * result, and every bucket's Gatus heartbeat ("TrueNAS Garage Copy") goes red
 * within 25 hours. Managed tasks are only deleted after every listed one was
 * written, so a failure part-way can never delete a task.
 *
 * stacks/system resyncs every five minutes, so this runs that often. Every
 * write is conditional on a difference (the matchers in truenas-manager.ts):
 * a steady-state run is one login and a handful of queries. The cadence is
 * also the retry, and it puts back a task someone edited by hand.
 */
export async function configureGarageCopy(args: {
  globals: GlobalResources;
  truenasCredentialTitle: string;
  endpoint: string;
  uptimeUrl: string;
  keys: Record<GarageCopyKey, { accessKeyId: string; secretAccessKey: string }>;
}): Promise<{ buckets: string[]; skipped?: string }> {
  if (pulumi.runtime.isDryRun()) {
    return { buckets: [], skipped: "preview" };
  }

  let client: TrueNASClient | undefined;
  try {
    client = await getTruenasClient(args.globals, args.truenasCredentialTitle);
    const manager = new TrueNASResourceManager(client);
    // stacks/system runs every five minutes, so only a run that wrote
    // something says so.
    const changes: string[] = [];

    const credentialIds = new Map<GarageCopyKey, number>();
    for (const [key, { accessKeyId, secretAccessKey }] of Object.entries(args.keys) as [GarageCopyKey, { accessKeyId: string; secretAccessKey: string }][]) {
      const { credential, changed } = await manager.ensureCloudCredential(garageCopyCredential({ key, endpoint: args.endpoint, accessKeyId, secretAccessKey }));
      credentialIds.set(key, credential.id);
      if (changed) changes.push(`credential ${credential.name}`);
    }

    for (const dataset of [GARAGE_COPY_DATASET, ...GARAGE_COPY_BUCKETS.map(({ bucket }) => `${GARAGE_COPY_DATASET}/${bucket}`)]) {
      if ((await manager.ensureDatasetExists(dataset)).created) changes.push(`dataset ${dataset}`);
    }

    const { written, deleted } = await manager.reconcileCloudSyncTasks(
      GARAGE_COPY_TASK_PREFIX,
      GARAGE_COPY_BUCKETS.map(({ bucket, key }) => {
        const credentialsId = credentialIds.get(key);
        if (credentialsId === undefined) throw new Error(`no cloud credential for key '${key}'`);
        return garageCopyTask({ bucket, credentialsId, uptimeUrl: args.uptimeUrl });
      }),
    );
    changes.push(...written.map(description => `task '${description}'`));
    if (deleted.length > 0) {
      pulumi.log.info(`Deleted ${deleted.length} TrueNAS Cloud Sync task(s) for buckets no longer copied; their datasets and snapshots stay: ${deleted.join(", ")}`);
    }

    for (const task of garageCopySnapshotTasks()) {
      if ((await manager.ensureSnapshotTask(task)).changed) changes.push(`snapshot task ${task.naming_schema}`);
    }

    if (changes.length > 0) {
      pulumi.log.info(`TrueNAS Garage copy: wrote ${changes.join(", ")}`);
    }
    return { buckets: GARAGE_COPY_BUCKETS.map(({ bucket }) => bucket) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    pulumi.log.warn(`TrueNAS Garage copy not configured this run: ${reason}. Its Gatus heartbeats ("TrueNAS Garage Copy") will go red if this persists.`);
    // The reason stays in the run log. This result is a stack output, and an
    // error from a call that carried a key has no business in the stack state.
    return { buckets: [], skipped: "failed; see the warning in this run's log" };
  } finally {
    client?.disconnect();
  }
}
