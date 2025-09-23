import { TrueNASClient } from "./truenas-client.js";
import type { TrueNASAPI, SystemInfo, Pool, Dataset, User, Group, NFSShare, SMBShare, Job, QueryFilter, QueryOptions, AuthSession } from "./truenas-types.js";

/**
 * Typed TrueNAS Client that provides type-safe method calls
 *
 * This extends the base TrueNASClient with strongly typed methods
 * based on the TrueNAS JSON-RPC API documentation.
 */
export class TypedTrueNASClient extends TrueNASClient {
  // System methods
  async "system.info"(): Promise<SystemInfo> {
    return this.call<SystemInfo>("system.info");
  }

  async "system.version"(): Promise<string> {
    return this.call<string>("system.version");
  }

  async "system.reboot"(delay?: number): Promise<void> {
    return this.call<void>("system.reboot", delay ? [delay] : []);
  }

  async "system.shutdown"(delay?: number): Promise<void> {
    return this.call<void>("system.shutdown", delay ? [delay] : []);
  }

  async "system.time"(): Promise<string> {
    return this.call<string>("system.time");
  }

  async "system.timezone"(): Promise<string> {
    return this.call<string>("system.timezone");
  }

  async "system.hostname"(): Promise<string> {
    return this.call<string>("system.hostname");
  }

  // Pool methods
  async "pool.query"(filters?: QueryFilter[], options?: QueryOptions): Promise<Pool[]> {
    const params = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.call<Pool[]>("pool.query", params);
  }

  async "pool.get_instance"(id: number): Promise<Pool> {
    return this.call<Pool>("pool.get_instance", [id]);
  }

  async "pool.create"(pool_data: any): Promise<Pool> {
    return this.call<Pool>("pool.create", [pool_data]);
  }

  async "pool.update"(id: number, pool_data: any): Promise<Pool> {
    return this.call<Pool>("pool.update", [id, pool_data]);
  }

  async "pool.delete"(id: number, options?: any): Promise<boolean> {
    return this.call<boolean>("pool.delete", [id, options || {}]);
  }

  async "pool.export"(id: number, options?: any): Promise<boolean> {
    return this.call<boolean>("pool.export", [id, options || {}]);
  }

  async "pool.import"(pool_data: any): Promise<Pool> {
    return this.call<Pool>("pool.import", [pool_data]);
  }

  // Dataset methods
  async "pool.dataset.query"(filters?: QueryFilter[], options?: QueryOptions): Promise<Dataset[]> {
    const params = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.call<Dataset[]>("pool.dataset.query", params);
  }

  async "pool.dataset.get_instance"(id: string): Promise<Dataset> {
    return this.call<Dataset>("pool.dataset.get_instance", [id]);
  }

  async "pool.dataset.create"(dataset_data: any): Promise<Dataset> {
    return this.call<Dataset>("pool.dataset.create", [dataset_data]);
  }

  async "pool.dataset.update"(id: string, dataset_data: any): Promise<Dataset> {
    return this.call<Dataset>("pool.dataset.update", [id, dataset_data]);
  }

  async "pool.dataset.delete"(id: string, options?: any): Promise<boolean> {
    return this.call<boolean>("pool.dataset.delete", [id, options || {}]);
  }

  // User methods
  async "user.query"(filters?: QueryFilter[], options?: QueryOptions): Promise<User[]> {
    const params = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.call<User[]>("user.query", params);
  }

  async "user.get_instance"(id: number): Promise<User> {
    return this.call<User>("user.get_instance", [id]);
  }

  async "user.create"(user_data: any): Promise<User> {
    return this.call<User>("user.create", [user_data]);
  }

  async "user.update"(id: number, user_data: any): Promise<User> {
    return this.call<User>("user.update", [id, user_data]);
  }

  async "user.delete"(id: number): Promise<boolean> {
    return this.call<boolean>("user.delete", [id]);
  }

  // Group methods
  async "group.query"(filters?: QueryFilter[], options?: QueryOptions): Promise<Group[]> {
    const params = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.call<Group[]>("group.query", params);
  }

  async "group.get_instance"(id: number): Promise<Group> {
    return this.call<Group>("group.get_instance", [id]);
  }

  async "group.create"(group_data: any): Promise<Group> {
    return this.call<Group>("group.create", [group_data]);
  }

  async "group.update"(id: number, group_data: any): Promise<Group> {
    return this.call<Group>("group.update", [id, group_data]);
  }

  async "group.delete"(id: number): Promise<boolean> {
    return this.call<boolean>("group.delete", [id]);
  }

  // Sharing methods
  async "sharing.nfs.query"(filters?: QueryFilter[], options?: QueryOptions): Promise<NFSShare[]> {
    const params = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.call<NFSShare[]>("sharing.nfs.query", params);
  }

  async "sharing.nfs.create"(share_data: any): Promise<NFSShare> {
    return this.call<NFSShare>("sharing.nfs.create", [share_data]);
  }

  async "sharing.nfs.update"(id: number, share_data: any): Promise<NFSShare> {
    return this.call<NFSShare>("sharing.nfs.update", [id, share_data]);
  }

  async "sharing.nfs.delete"(id: number): Promise<boolean> {
    return this.call<boolean>("sharing.nfs.delete", [id]);
  }

  async "sharing.smb.query"(filters?: QueryFilter[], options?: QueryOptions): Promise<SMBShare[]> {
    const params = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.call<SMBShare[]>("sharing.smb.query", params);
  }

  async "sharing.smb.create"(share_data: any): Promise<SMBShare> {
    return this.call<SMBShare>("sharing.smb.create", [share_data]);
  }

  async "sharing.smb.update"(id: number, share_data: any): Promise<SMBShare> {
    return this.call<SMBShare>("sharing.smb.update", [id, share_data]);
  }

  async "sharing.smb.delete"(id: number): Promise<boolean> {
    return this.call<boolean>("sharing.smb.delete", [id]);
  }

  // Auth methods
  async "auth.login"(username: string, password: string): Promise<string> {
    return this.call<string>("auth.login", [username, password]);
  }

  async "auth.login_with_api_key"(api_key: string): Promise<boolean> {
    return this.call<boolean>("auth.login_with_api_key", [api_key]);
  }

  async "auth.logout"(): Promise<boolean> {
    return this.call<boolean>("auth.logout");
  }

  async "auth.me"(): Promise<AuthSession> {
    return this.call<AuthSession>("auth.me");
  }

  async "auth.check_user"(username: string, password: string): Promise<boolean> {
    return this.call<boolean>("auth.check_user", [username, password]);
  }

  // Core methods
  async "core.subscribe"(name: string): Promise<void> {
    return this.call<void>("core.subscribe", [name]);
  }

  async "core.unsubscribe"(name: string): Promise<void> {
    return this.call<void>("core.unsubscribe", [name]);
  }

  async "core.get_jobs"(filters?: QueryFilter[], options?: QueryOptions): Promise<Job[]> {
    const params = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.call<Job[]>("core.get_jobs", params);
  }

  async "core.get_job"(id: number): Promise<Job> {
    return this.call<Job>("core.get_job", [id]);
  }

  async "core.job_abort"(id: number): Promise<boolean> {
    return this.call<boolean>("core.job_abort", [id]);
  }

  // Convenience methods with better names
  async getSystemInfo(): Promise<SystemInfo> {
    return this["system.info"]();
  }

  async getVersion(): Promise<string> {
    return this["system.version"]();
  }

  async getPools(filters?: QueryFilter[], options?: QueryOptions): Promise<Pool[]> {
    return this["pool.query"](filters, options);
  }

  async getPool(id: number): Promise<Pool> {
    return this["pool.get_instance"](id);
  }

  async getDatasets(filters?: QueryFilter[], options?: QueryOptions): Promise<Dataset[]> {
    return this["pool.dataset.query"](filters, options);
  }

  async getDataset(id: string): Promise<Dataset> {
    return this["pool.dataset.get_instance"](id);
  }

  async getUsers(filters?: QueryFilter[], options?: QueryOptions): Promise<User[]> {
    return this["user.query"](filters, options);
  }

  async getUser(id: number): Promise<User> {
    return this["user.get_instance"](id);
  }

  async getGroups(filters?: QueryFilter[], options?: QueryOptions): Promise<Group[]> {
    return this["group.query"](filters, options);
  }

  async getGroup(id: number): Promise<Group> {
    return this["group.get_instance"](id);
  }

  async getNFSShares(filters?: QueryFilter[], options?: QueryOptions): Promise<NFSShare[]> {
    return this["sharing.nfs.query"](filters, options);
  }

  async getSMBShares(filters?: QueryFilter[], options?: QueryOptions): Promise<SMBShare[]> {
    return this["sharing.smb.query"](filters, options);
  }

  async getJobs(filters?: QueryFilter[], options?: QueryOptions): Promise<Job[]> {
    return this["core.get_jobs"](filters, options);
  }

  async getJob(id: number): Promise<Job> {
    return this["core.get_job"](id);
  }

  async getCurrentUser(): Promise<AuthSession> {
    return this["auth.me"]();
  }
}

/**
 * Factory function to create a typed TrueNAS client
 */
export function createTypedTrueNASClient(
  host: string,
  options?: {
    port?: number;
    ssl?: boolean;
    reconnectOnClose?: boolean;
    maxReconnectAttempts?: number;
  }
): TypedTrueNASClient {
  return new TypedTrueNASClient(host, options);
}

export default TypedTrueNASClient;
