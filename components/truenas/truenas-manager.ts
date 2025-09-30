/**
 * Example usage of the TrueNAS JSON-RPC API client in a Pulumi context
 *
 * This example demonstrates how to integrate the new namespace-based JSON-RPC API client
 * with your existing Pulumi infrastructure code.
 */

import { TrueNASClient } from "./truenas-client.js";
import {
  DatasetCreateRequest,
  DatasetQueryRequest,
  DatasetUpdateRequest,
  NFSQueryRequest,
  NFSUpdateRequest,
  NFSCreateRequest,
  SMBQueryRequest,
  SMBUpdateRequest,
  SMBCreateRequest,
  SystemInfoRequest,
  PoolQueryRequest,
  JobQueryRequest,
  type Dataset,
  type NFSShare,
  type SMBShare,
  type SystemInfo,
  type Pool,
  type Job,
} from "./truenas-types.js";

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
    }
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
    } catch (error) {
      return await connection.sendRequest(DatasetCreateRequest, {
        name,
        ...config,
      });
    }
  }

  /**
   * Ensure an NFS share exists with the specified configuration
   */
  async ensureNFSShare(
    path: string,
    config: {
    comment?: string;
    networks?: string[];
    hosts?: string[];
    alldirs?: boolean;
    quiet?: boolean;
    ro?: boolean;
    maproot_user?: string;
    maproot_group?: string;
    mapall_user?: string;
    mapall_group?: string;
    security?: string[];
    enabled?: boolean;
  }): Promise<NFSShare> {
    const connection = await this.client.connection;
    const shares = (await connection.sendRequest(NFSQueryRequest, [["path", "=", path]], {})) as NFSShare[];

    if (shares.length > 0) {
      const share = shares[0];
      return await connection.sendRequest(NFSUpdateRequest, share.id, { ...config, path });
    } else {
      return await connection.sendRequest(NFSCreateRequest, { ...config, path });
    }
  }

  /**
   * Ensure an SMB share exists with the specified configuration
   */
  async ensureSMBShare(
    name: string,
    path: string,
    config: {
      comment?: string;
      readonly?: boolean;
      browsable?: boolean;
      guestok?: boolean;
      enabled?: boolean;
      timemachine?: boolean;
      timemachine_quota?: number;
    }
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
  }
}

export default TrueNASResourceManager;
