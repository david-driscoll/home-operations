/**
 * Example usage of the TrueNAS JSON-RPC API client in a Pulumi context
 *
 * This example demonstrates how to integrate the new namespace-based JSON-RPC API client
 * with your existing Pulumi infrastructure code.
 */

import { TrueNASClient } from "./truenas-client.js";
import type { Dataset, NFSShare, SMBShare } from "./truenas-types.js";

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
      pool: string;
      compression?: string;
      quota?: string;
      reservation?: string;
      recordsize?: string;
      atime?: boolean;
      readonly?: boolean;
    }
  ): Promise<Dataset> {
    try {
      // Check if dataset already exists
      const existing = await this.client.pool.dataset.getInstance(name);

      // Update if configuration differs
      const updates: any = {};
      let needsUpdate = false;

      // Compare and prepare updates
      if (config.compression && existing.properties.compression?.value !== config.compression) {
        updates.compression = config.compression;
        needsUpdate = true;
      }

      if (needsUpdate) {
        return await this.client.pool.dataset.update(name, updates);
      }

      return existing;
    } catch (error) {
      // Dataset doesn't exist, create it
      const datasetConfig = {
        name,
        type: "FILESYSTEM",
        ...config,
      };

      return await this.client.pool.dataset.create(datasetConfig);
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
      readonly?: boolean;
      maproot_user?: string;
      maproot_group?: string;
      security?: string[];
      enabled?: boolean;
    }
  ): Promise<NFSShare> {
    const shares = await this.client.sharing.nfs.query([["path", "=", path]]);

    if (shares.length > 0) {
      const share = shares[0];

      // Check if update is needed
      const updates: any = {};
      let needsUpdate = false;

      if (config.comment !== undefined && share.comment !== config.comment) {
        updates.comment = config.comment;
        needsUpdate = true;
      }

      if (config.readonly !== undefined && share.ro !== config.readonly) {
        updates.ro = config.readonly;
        needsUpdate = true;
      }

      if (config.enabled !== undefined && share.enabled !== config.enabled) {
        updates.enabled = config.enabled;
        needsUpdate = true;
      }

      if (needsUpdate) {
        return await this.client.sharing.nfs.update(share.id, updates);
      }

      return share;
    } else {
      // Create new share
      const shareConfig = {
        path,
        comment: config.comment || "",
        networks: config.networks || [],
        hosts: config.hosts || [],
        ro: config.readonly ?? false,
        maproot_user: config.maproot_user || null,
        maproot_group: config.maproot_group || null,
        security: config.security || [],
        enabled: config.enabled ?? true,
      };

      return await this.client.sharing.nfs.create(shareConfig);
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
    const shares = await this.client.sharing.smb.query([["name", "=", name]]);

    if (shares.length > 0) {
      const share = shares[0];

      // Check if update is needed
      const updates: any = {};
      let needsUpdate = false;

      if (config.comment !== undefined && share.comment !== config.comment) {
        updates.comment = config.comment;
        needsUpdate = true;
      }

      if (config.readonly !== undefined && share.ro !== config.readonly) {
        updates.ro = config.readonly;
        needsUpdate = true;
      }

      if (config.enabled !== undefined && share.enabled !== config.enabled) {
        updates.enabled = config.enabled;
        needsUpdate = true;
      }

      if (needsUpdate) {
        return await this.client.sharing.smb.update(share.id, updates);
      }

      return share;
    } else {
      // Create new share
      const shareConfig = {
        name,
        path,
        comment: config.comment || "",
        ro: config.readonly ?? false,
        browsable: config.browsable ?? true,
        guestok: config.guestok ?? false,
        enabled: config.enabled ?? true,
        timemachine: config.timemachine ?? false,
        timemachine_quota: config.timemachine_quota || 0,
        purpose: "NO_PRESET",
      };

      return await this.client.sharing.smb.create(shareConfig);
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
    const [systemInfo, pools] = await Promise.all([this.client.system.info(), this.client.pool.query()]);

    return {
      version: systemInfo.version,
      uptime: systemInfo.uptime,
      pools: pools.map((pool) => ({
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
    const datasets = await this.client.pool.dataset.query();

    return datasets.map((dataset) => ({
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
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const job = await this.client.core.getJobs([["id", "=", jobId]]).then((jobs) => jobs[0]);

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
