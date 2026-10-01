/**
 * Example usage of the TrueNAS JSON-RPC API client in a Pulumi context
 *
 * This example demonstrates how to integrate the new namespace-based JSON-RPC API client
 * with your existing Pulumi infrastructure code.
 */

import type { TrueNASClient } from "./truenas-client.js";
import {
  type CloudCredential,
  CloudCredentialCreateRequest,
  type CloudCredentialInput,
  CloudCredentialQueryRequest,
  CloudCredentialUpdateRequest,
  CloudSyncCreateRequest,
  CloudSyncDeleteRequest,
  CloudSyncQueryRequest,
  type CloudSyncTask,
  type CloudSyncTaskInput,
  CloudSyncUpdateRequest,
  type CronSchedule,
  type Dataset,
  DatasetCreateRequest,
  DatasetQueryRequest,
  DatasetUpdateRequest,
  type Job,
  JobQueryRequest,
  NFSCreateRequest,
  NFSQueryRequest,
  type NFSShare,
  NFSUpdateRequest,
  type NfsShareInput,
  type Pool,
  PoolQueryRequest,
  SMBCreateRequest,
  SMBQueryRequest,
  type SMBShare,
  SMBUpdateRequest,
  type SnapshotTask,
  SnapshotTaskCreateRequest,
  type SnapshotTaskInput,
  SnapshotTaskQueryRequest,
  SnapshotTaskUpdateRequest,
  SystemInfoRequest,
} from "./truenas-types.js";

// ── Matchers ────────────────────────────────────────────────────────────────
// The ensure/reconcile methods below write only when one of these says the
// existing object differs. That is not tidiness: stacks/system resyncs every
// five minutes, every `cloudsync.update` restarts cron on TrueNAS, and a
// credential update re-validates against the remote. Unconditional writes
// would be hundreds a day for no change. Each matcher compares only the fields
// the caller sets, because TrueNAS fills in defaults for the rest.

/** Cron fields compared as values: "00" and "0" are the same minute. */
function sameCronField(a: unknown, b: unknown): boolean {
  const normalise = (value: unknown) => (typeof value === "string" && /^\d+$/.test(value) ? String(Number(value)) : String(value ?? ""));
  return normalise(a) === normalise(b);
}

function sameSchedule(existing: Partial<CronSchedule> | undefined, desired: CronSchedule): boolean {
  return (["minute", "hour", "dom", "month", "dow"] as const).every(field => sameCronField(existing?.[field], desired[field]));
}

function sameValue(a: unknown, b: unknown): boolean {
  return Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a ?? []) === JSON.stringify(b ?? []) : a === b;
}

/**
 * Whether a credential already holds every provider field `desired` sets.
 * Secret fields come back in the clear to a caller holding the cloud-sync write
 * role (middlewared main.py, 25.04), and this one must hold it to create them,
 * so a rotated key is a difference like any other.
 */
export function cloudCredentialMatches(existing: CloudCredential, desired: CloudCredentialInput): boolean {
  const provider = existing.provider as unknown as Record<string, unknown>;
  return existing.name === desired.name && Object.entries(desired.provider).every(([field, value]) => value === undefined || sameValue(provider[field], value));
}

/** Whether an NFS share already matches every field `desired` sets. */
export function nfsShareMatches(existing: NFSShare, desired: NfsShareInput): boolean {
  const fields = existing as unknown as Record<string, unknown>;
  return Object.entries(desired).every(([field, value]) => value === undefined || sameValue(fields[field], value));
}

/** Whether a Cloud Sync task already matches every field `desired` sets. */
export function cloudSyncTaskMatches(existing: CloudSyncTask, desired: CloudSyncTaskInput): boolean {
  const optional = ["pre_script", "post_script", "include", "exclude", "args", "enabled", "transfers"] as const;
  return (
    existing.description === desired.description &&
    existing.path === desired.path &&
    existing.credentials?.id === desired.credentials &&
    existing.attributes?.bucket === desired.attributes.bucket &&
    existing.attributes?.folder === desired.attributes.folder &&
    sameSchedule(existing.schedule, desired.schedule) &&
    existing.direction === desired.direction &&
    existing.transfer_mode === desired.transfer_mode &&
    optional.every(field => desired[field] === undefined || sameValue(existing[field], desired[field]))
  );
}

/** Whether a periodic snapshot task already matches every field `desired` sets. */
export function snapshotTaskMatches(existing: SnapshotTask, desired: SnapshotTaskInput): boolean {
  const optional = ["enabled", "exclude", "allow_empty"] as const;
  return (
    existing.dataset === desired.dataset &&
    existing.naming_schema === desired.naming_schema &&
    existing.recursive === desired.recursive &&
    existing.lifetime_value === desired.lifetime_value &&
    existing.lifetime_unit === desired.lifetime_unit &&
    sameSchedule(existing.schedule, desired.schedule) &&
    optional.every(field => desired[field] === undefined || sameValue(existing[field], desired[field]))
  );
}

/**
 * TrueNAS Resource Manager for Pulumi
 *
 * This class provides higher-level abstractions for managing TrueNAS
 * resources that can be used in Pulumi dynamic providers.
 */
export class TrueNASResourceManager {
  constructor(private client: TrueNASClient) {
    this.client = client;
  }

  /**
   * Ensure a dataset exists with the specified configuration
   */
  async ensureDataset(
    name: string,
    config: {
      type: "FILESYSTEM" | "VOLUME";
      volsize?: number;
      volblocksize?: "512" | "1K" | "2K" | "4K" | "8K" | "16K" | "32K" | "64K" | "128K";
      sparse?: boolean;
      force_size?: boolean;
      compression?:
        | "OFF"
        | "LZ4"
        | "GZIP"
        | "GZIP-1"
        | "GZIP-9"
        | "ZSTD"
        | "ZSTD-FAST"
        | "ZLE"
        | "LZJB"
        | "ZSTD-1"
        | "ZSTD-2"
        | "ZSTD-3"
        | "ZSTD-4"
        | "ZSTD-5"
        | "ZSTD-6"
        | "ZSTD-7"
        | "ZSTD-8"
        | "ZSTD-9"
        | "ZSTD-10"
        | "ZSTD-11"
        | "ZSTD-12"
        | "ZSTD-13"
        | "ZSTD-14"
        | "ZSTD-15"
        | "ZSTD-16"
        | "ZSTD-17"
        | "ZSTD-18"
        | "ZSTD-19"
        | "ZSTD-FAST-1"
        | "ZSTD-FAST-2"
        | "ZSTD-FAST-3"
        | "ZSTD-FAST-4"
        | "ZSTD-FAST-5"
        | "ZSTD-FAST-6"
        | "ZSTD-FAST-7"
        | "ZSTD-FAST-8"
        | "ZSTD-FAST-9"
        | "ZSTD-FAST-10"
        | "ZSTD-FAST-20"
        | "ZSTD-FAST-30"
        | "ZSTD-FAST-40"
        | "ZSTD-FAST-50"
        | "ZSTD-FAST-60"
        | "ZSTD-FAST-70"
        | "ZSTD-FAST-80"
        | "ZSTD-FAST-90"
        | "ZSTD-FAST-100"
        | "ZSTD-FAST-500"
        | "ZSTD-FAST-1000";
      quota?: number;
      quota_warning?: number;
      quota_critical?: number;
      refquota?: number;
      refquota_warning?: number;
      refquota_critical?: number;
      reservation?: number;
      refreservation?: number;
      special_small_block_size?: number;
      copies?: number;
      snapdir?: "VISIBLE" | "HIDDEN";
      deduplication?: "ON" | "OFF" | "VERIFY";
      checksum?: "ON" | "OFF" | "FLETCHER2" | "FLETCHER4" | "SHA256" | "SHA512" | "SKEIN";
      recordsize?: string;
      casesensitivity?: "SENSITIVE" | "INSENSITIVE" | "MIXED";
      aclmode?: "PASSTHROUGH" | "RESTRICTED";
      acltype?: "NOACL" | "NFS4ACL" | "POSIXACL";
      share_type?: "GENERIC" | "SMB";
      xattrs?: "ON" | "SA";
      atime?: "ON" | "OFF";
      exec?: "ON" | "OFF";
      readonly?: "ON" | "OFF";
      comments?: string;
      managedby?: string;
      sync?: "STANDARD" | "ALWAYS" | "DISABLED";
    },
  ): Promise<Dataset> {
    const connection = await this.client.connection;
    try {
      // Check if dataset already exists
      const existing = await connection.sendRequest(DatasetQueryRequest, [["name", "=", name]], {});
      return await connection.sendRequest(DatasetUpdateRequest, existing[0].id, {
        ...config,
        name: undefined,
        type: undefined,
      });
    } catch (_error) {
      return await connection.sendRequest(DatasetCreateRequest, {
        name,
        ...config,
      });
    }
  }

  /**
   * Ensure an NFS share exists with the specified configuration.
   *
   * An existing share is written only when it differs (nfsShareMatches), so a
   * caller that runs every five minutes (stacks/system) costs one query.
   */
  async ensureNFSShare(path: string, config: NfsShareInput): Promise<{ share: NFSShare; changed: boolean }> {
    const connection = await this.client.connection;
    const shares = (await connection.sendRequest(NFSQueryRequest, [["path", "=", path]], {})) as NFSShare[];

    const existing = shares[0];
    if (existing && nfsShareMatches(existing, config)) {
      return { share: existing, changed: false };
    }
    if (existing) {
      return { share: await connection.sendRequest(NFSUpdateRequest, existing.id, { ...config, path }), changed: true };
    }
    return { share: await connection.sendRequest(NFSCreateRequest, { ...config, path }), changed: true };
  }

  /**
   * Ensure an SMB share exists with the specified configuration
   */
  async ensureSMBShare(
    name: string,
    _path: string,
    config: {
      comment?: string;
      readonly?: boolean;
      browsable?: boolean;
      guestok?: boolean;
      enabled?: boolean;
      timemachine?: boolean;
      timemachine_quota?: number;
    },
  ): Promise<SMBShare> {
    const connection = await this.client.connection;
    const shares = (await connection.sendRequest(SMBQueryRequest, [["name", "=", name]], {})) as SMBShare[];

    if (shares.length > 0) {
      const share = shares[0];
      return await connection.sendRequest(SMBUpdateRequest, share.id, config);
    } else {
      return await connection.sendRequest(SMBCreateRequest, config);
    }
  }

  /**
   * Create a filesystem dataset if it does not exist. Unlike ensureDataset it
   * never writes to one that does, so it is free to call on every run.
   */
  async ensureDatasetExists(name: string): Promise<{ created: boolean }> {
    const connection = await this.client.connection;
    const [existing] = await connection.sendRequest(DatasetQueryRequest, [["name", "=", name]], {});
    if (existing) return { created: false };
    await connection.sendRequest(DatasetCreateRequest, { name, type: "FILESYSTEM" });
    return { created: true };
  }

  /**
   * Ensure a cloud credential with this name exists and holds this provider.
   * It is written only when it differs (cloudCredentialMatches), so a rotated
   * key reaches TrueNAS on the next run and an unchanged one costs a query.
   */
  async ensureCloudCredential(input: CloudCredentialInput): Promise<{ credential: CloudCredential; changed: boolean }> {
    const connection = await this.client.connection;
    const [existing] = await connection.sendRequest(CloudCredentialQueryRequest, [["name", "=", input.name]], {});
    if (existing && cloudCredentialMatches(existing, input)) {
      return { credential: existing, changed: false };
    }
    const credential = existing ? await connection.sendRequest(CloudCredentialUpdateRequest, existing.id, input) : await connection.sendRequest(CloudCredentialCreateRequest, input);
    return { credential, changed: true };
  }

  /**
   * Make the Cloud Sync tasks whose description starts with `prefix` exactly
   * `tasks`. Each is created, or updated when it differs (cloudSyncTaskMatches),
   * by its description. A managed task no longer listed is deleted, so dropping
   * one from the list stops it instead of leaving it to run forever; deleting a
   * task leaves its dataset alone. Deletions happen only after every listed
   * task was written, and tasks without the prefix are never touched.
   */
  async reconcileCloudSyncTasks(prefix: string, tasks: readonly CloudSyncTaskInput[]): Promise<{ written: string[]; deleted: string[] }> {
    const unprefixed = tasks.filter(task => !task.description.startsWith(prefix));
    if (unprefixed.length > 0) {
      throw new Error(`Cloud Sync tasks must be described '${prefix}…' to be managed: ${unprefixed.map(task => task.description).join(", ")}`);
    }

    const connection = await this.client.connection;
    const managed = (await connection.sendRequest(CloudSyncQueryRequest, [], {})).filter(task => task.description.startsWith(prefix));

    const written: string[] = [];
    for (const task of tasks) {
      const existing = managed.find(candidate => candidate.description === task.description);
      if (existing && cloudSyncTaskMatches(existing, task)) continue;
      if (existing) {
        await connection.sendRequest(CloudSyncUpdateRequest, existing.id, task);
      } else {
        await connection.sendRequest(CloudSyncCreateRequest, task);
      }
      written.push(task.description);
    }

    const wanted = new Set(tasks.map(task => task.description));
    const deleted: string[] = [];
    for (const task of managed) {
      if (wanted.has(task.description)) continue;
      await connection.sendRequest(CloudSyncDeleteRequest, task.id);
      deleted.push(task.description);
    }
    return { written, deleted };
  }

  /**
   * Ensure a periodic snapshot task exists for this dataset and naming schema,
   * written only when it differs (snapshotTaskMatches). The pair identifies the
   * task because retention is per naming schema: two tasks on one dataset keep
   * their snapshots apart only if their schemas differ.
   */
  async ensureSnapshotTask(input: SnapshotTaskInput): Promise<{ task: SnapshotTask; changed: boolean }> {
    const connection = await this.client.connection;
    const [existing] = await connection.sendRequest(
      SnapshotTaskQueryRequest,
      [
        ["dataset", "=", input.dataset],
        ["naming_schema", "=", input.naming_schema],
      ],
      {},
    );
    if (existing && snapshotTaskMatches(existing, input)) {
      return { task: existing, changed: false };
    }
    const task = existing ? await connection.sendRequest(SnapshotTaskUpdateRequest, existing.id, input) : await connection.sendRequest(SnapshotTaskCreateRequest, input);
    return { task, changed: true };
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<{
    version: string;
    uptime: string;
    pools: Array<{ name: string; status: string; healthy: boolean }>;
    alerts: any[];
  }> {
    const connection = await this.client.connection;
    const [systemInfo, pools] = await Promise.all([connection.sendRequest(SystemInfoRequest), connection.sendRequest(PoolQueryRequest, [], {}) as Promise<Pool[]>]);

    return {
      version: systemInfo.version,
      uptime: systemInfo.uptime,
      pools: pools.map((pool: Pool) => ({
        name: pool.name,
        status: pool.status,
        healthy: pool.healthy,
      })),
      alerts: [], // Could be extended to fetch alerts
    };
  }

  /**
   * List all datasets with their usage information
   */
  async getDatasetUsage(): Promise<
    Array<{
      name: string;
      pool: string;
      type: string;
      used: string;
      available: string;
      mountpoint: string | null;
      encrypted: boolean;
    }>
  > {
    const connection = await this.client.connection;
    const datasets = (await connection.sendRequest(DatasetQueryRequest, [], {})) as Dataset[];

    return datasets.map((dataset: Dataset) => ({
      name: dataset.name,
      pool: dataset.pool,
      type: dataset.type,
      used: dataset.properties.used?.value || "0",
      available: dataset.properties.available?.value || "0",
      mountpoint: dataset.mountpoint,
      encrypted: dataset.encrypted,
    }));
  }

  /**
   * Monitor jobs and wait for completion
   */
  async waitForJob(jobId: number, timeoutMs: number = 300000): Promise<any> {
    const connection = await this.client.connection;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const jobs = (await connection.sendRequest(JobQueryRequest, [["id", "=", jobId]], {})) as Job[];
      const job = jobs[0] as Job;

      if (job.state === "SUCCESS") {
        return job.result;
      } else if (job.state === "FAILED") {
        throw new Error(`Job ${jobId} failed: ${job.error}`);
      }

      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
  }
}

export default TrueNASResourceManager;
