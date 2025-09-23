/**
 * TrueNAS JSON-RPC API Type Definitions
 * Generated for TrueNAS v25.04.2
 */

// Base JSON-RPC types
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params: any[];
}

export interface JsonRpcResponse<T = any> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string | null;
  data?: {
    error: number;
    errname: string;
    reason: string;
    trace?: {
      class: string;
      frames: any[];
      formatted: string;
      repr: string;
    } | null;
    extra: any[];
    py_exception: string;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: any;
}

// Collection update notification types
export interface CollectionUpdateNotification {
  jsonrpc: "2.0";
  method: "collection_update";
  params: {
    msg: string;
    collection: string;
    id: any;
    fields: {
      id: string;
      state: string;
      progress: {
        percent: number;
        description: string;
      };
      result: any;
      exc_info: {
        type: string;
        extra: any[] | null;
        repr: string;
      };
      error: string;
      exception: string;
    };
    extra: object;
  };
}

export interface NotifyUnsubscribedNotification {
  jsonrpc: "2.0";
  method: "notify_unsubscribed";
  params: {
    collection: string;
    error: JsonRpcError["data"];
  };
}

// System types
export interface SystemInfo {
  version: string;
  buildtime: string;
  hostname: string;
  physmem: number;
  model: string;
  cores: number;
  physical_cores: number;
  loadavg: number[];
  uptime: string;
  uptime_seconds: number;
  system_serial: string;
  license?: any;
  boottime: string;
  datetime: string;
  birthday: string;
  timezone: string;
  system_manufacturer: string;
  system_product: string;
  system_product_version: string;
  ecc_memory: boolean;
}

// Pool types
export interface Pool {
  id: number;
  name: string;
  guid: string;
  encrypt: number;
  encryptkey: string;
  encryptkey_path: string | null;
  status: string;
  path: string;
  scan: PoolScan;
  topology: PoolTopology;
  healthy: boolean;
  warning: boolean;
  status_detail: string | null;
  size: number;
  allocated: number;
  free: number;
  freeing: number;
  fragmentation: string;
  size_str: string;
  allocated_str: string;
  free_str: string;
  freeing_str: string;
  autotrim: PoolAutoTrim;
}

export interface PoolScan {
  function: string;
  state: string;
  start_time: string | null;
  end_time: string | null;
  percentage: number | null;
  bytes_to_process: number | null;
  bytes_processed: number | null;
  bytes_issued: number | null;
  pause: string | null;
  errors: number;
}

export interface PoolTopology {
  data: PoolVdev[];
  cache: PoolVdev[];
  log: PoolVdev[];
  spare: PoolVdev[];
  special: PoolVdev[];
  dedup: PoolVdev[];
}

export interface PoolVdev {
  name: string;
  type: string;
  path: string | null;
  guid: string;
  status: string;
  stats: PoolVdevStats;
  children: PoolVdev[];
  device: string | null;
  disk: string | null;
  unavail_disk: any | null;
}

export interface PoolVdevStats {
  timestamp: number;
  read_errors: number;
  write_errors: number;
  checksum_errors: number;
  ops: number[];
  bytes: number[];
  size: number;
  allocated: number;
  fragmentation: number;
}

export interface PoolAutoTrim {
  parsed: boolean;
  rawvalue: string;
  value: string;
  source: string;
}

// Dataset types
export interface Dataset {
  id: string;
  name: string;
  pool: string;
  type: string;
  children: Dataset[];
  encrypted: boolean;
  encryption_root: string | null;
  key_loaded: boolean;
  locked: boolean;
  mountpoint: string | null;
  quota: DatasetQuota;
  reservation: DatasetQuota;
  properties: Record<string, DatasetProperty>;
}

export interface DatasetProperty {
  value: string;
  rawvalue: string;
  source: string;
  parsed: any;
}

export interface DatasetQuota {
  value: number | null;
  parsed: number | null;
  rawvalue: string;
  source: string;
}

// Disk types
export interface Disk {
  identifier: string;
  name: string;
  subsystem: string;
  number: number;
  serial: string;
  lunid: string | null;
  size: number;
  description: string;
  transfermode: string;
  hddstandby: string;
  advpowermgmt: string;
  acousticlevel: string;
  smartoptions: string;
  expiretime: number | null;
  critical: number | null;
  difference: number | null;
  informational: number | null;
  model: string;
  rotationrate: number | null;
  type: string;
  zfs_guid: string | null;
  bus: string;
  devname: string;
  enclosure: DiskEnclosure | null;
  pool: string | null;
  passwd: string;
  smarttest: DiskSmartTest[];
  togglesmart: boolean;
  smartoptions_db: any[];
  supports_smart: boolean | null;
  pool_info: any | null;
}

export interface DiskEnclosure {
  id: string;
  name: string;
  model: string;
  controller: boolean;
  dmi: string;
  status: string[];
  vendor: string;
  product: string;
  revision: string;
  bsg: string;
  sg: string;
  pci: string;
  rackmount: boolean;
  top_loaded: boolean;
  front_slots: number;
  rear_slots: number;
  internal_slots: number;
  elements: any[];
}

export interface DiskSmartTest {
  num: number;
  description: string;
  status: string;
  status_verbose: string;
  remaining: number;
  lifetime: number;
  lba_of_first_error: string;
}

// User types
export interface User {
  id: number;
  uid: number;
  username: string;
  unixhash: string;
  smbhash: string;
  home: string;
  shell: string;
  full_name: string;
  builtin: boolean;
  email: string;
  password_disabled: boolean;
  locked: boolean;
  sudo: boolean;
  sudo_nopasswd: boolean;
  sudo_commands: string[];
  microsoft_account: boolean;
  attributes: Record<string, any>;
  groups: number[];
  sshpubkey: string;
  local: boolean;
  id_type_both: boolean;
  nt_name: string;
  sid: string;
}

// Group types
export interface Group {
  id: number;
  gid: number;
  name: string;
  builtin: boolean;
  sudo: boolean;
  sudo_nopasswd: boolean;
  sudo_commands: string[];
  users: number[];
  local: boolean;
  id_type_both: boolean;
  nt_name: string;
  sid: string;
}

// Sharing types
export interface NFSShare {
  id: number;
  path: string;
  comment: string;
  networks: string[];
  hosts: string[];
  ro: boolean;
  maproot_user: string | null;
  maproot_group: string | null;
  mapall_user: string | null;
  mapall_group: string | null;
  security: string[];
  enabled: boolean;
  locked: boolean;
}

export interface SMBShare {
  id: number;
  name: string;
  path: string;
  comment: string;
  enabled: boolean;
  acl: boolean;
  ro: boolean;
  browsable: boolean;
  recyclebin: boolean;
  guestok: boolean;
  abe: boolean;
  hostsallow: string[];
  hostsdeny: string[];
  home: boolean;
  timemachine: boolean;
  timemachine_quota: number;
  shadowcopy: boolean;
  fsrvp: boolean;
  durablehandle: boolean;
  streams: boolean;
  purpose: string;
  auxsmbconf: string;
  locked: boolean;
}

// Application types
export interface App {
  id: string;
  name: string;
  state: string;
  version: string;
  upgrade_available: boolean;
  upgrade_version: string | null;
  chart_metadata: AppChartMetadata;
  container_images: Record<string, AppContainerImage>;
  active_workloads: Record<string, any>;
  resources: AppResources;
  used_ports: AppPort[];
  notes: string;
}

export interface AppChartMetadata {
  name: string;
  version: string;
  description: string;
  home: string;
  icon: string;
  keywords: string[];
  maintainers: AppMaintainer[];
  sources: string[];
  annotations: Record<string, string>;
}

export interface AppMaintainer {
  name: string;
  email: string;
  url: string;
}

export interface AppContainerImage {
  id: string;
  update_available: boolean;
}

export interface AppResources {
  cpu_usage: number;
  memory_usage: number;
  storage_usage: number;
  network_usage: AppNetworkUsage;
}

export interface AppNetworkUsage {
  incoming: number;
  outgoing: number;
}

export interface AppPort {
  port: number;
  protocol: string;
  host_port: number;
}

// VM types
export interface VirtualMachine {
  id: number;
  name: string;
  description: string;
  vcpus: number;
  memory: number;
  autostart: boolean;
  time: string;
  grub_config: string | null;
  bootloader: string;
  cores: number;
  threads: number;
  hyperv_enlightenments: boolean;
  shutdown_timeout: number;
  arch_type: string | null;
  machine_type: string | null;
  uuid: string;
  command_line_args: string;
  enabled: boolean;
  status: VMStatus;
  devices: VMDevice[];
  display_available: boolean;
}

export interface VMStatus {
  state: string;
  pid: number | null;
  domain_state: string;
}

export interface VMDevice {
  id: number;
  dtype: string;
  order: number;
  vm: number;
  attributes: Record<string, any>;
}

// Auth types
export interface AuthSession {
  username: string;
  authenticated: boolean;
  credentials: string;
  privilege: any;
}

// Job types
export interface Job {
  id: number;
  method: string;
  arguments: any[];
  state: string;
  progress: JobProgress;
  result: any;
  error: string | null;
  exception: string | null;
  exc_info: JobExceptionInfo | null;
  time_started: string;
  time_finished: string | null;
}

export interface JobProgress {
  percent: number;
  description: string;
  extra: any;
}

export interface JobExceptionInfo {
  type: string;
  extra: any[] | null;
  repr: string;
}

// Query types
export interface QueryOptions {
  relationships?: boolean;
  extend?: string;
  extend_context?: string;
  prefix?: string;
  extra?: Record<string, any>;
  order_by?: string[];
  select?: string[];
  count?: boolean;
  get?: boolean;
  offset?: number;
  limit?: number;
  force_sql_filters?: boolean;
}

export interface QueryFilter {
  field: string;
  operator: string;
  value: any;
  list?: boolean;
}

// API method types - these represent the main method groups
export type SystemMethods = {
  "system.info": () => Promise<SystemInfo>;
  "system.version": () => Promise<string>;
  "system.reboot": (delay?: number) => Promise<void>;
  "system.shutdown": (delay?: number) => Promise<void>;
  "system.time": () => Promise<string>;
  "system.timezone": () => Promise<string>;
  "system.hostname": () => Promise<string>;
};

export type PoolMethods = {
  "pool.query": (filters?: QueryFilter[], options?: QueryOptions) => Promise<Pool[]>;
  "pool.get_instance": (id: number) => Promise<Pool>;
  "pool.create": (pool_data: any) => Promise<Pool>;
  "pool.update": (id: number, pool_data: any) => Promise<Pool>;
  "pool.delete": (id: number, options?: any) => Promise<boolean>;
  "pool.export": (id: number, options?: any) => Promise<boolean>;
  "pool.import": (pool_data: any) => Promise<Pool>;
};

export type DatasetMethods = {
  "pool.dataset.query": (filters?: QueryFilter[], options?: QueryOptions) => Promise<Dataset[]>;
  "pool.dataset.get_instance": (id: string) => Promise<Dataset>;
  "pool.dataset.create": (dataset_data: any) => Promise<Dataset>;
  "pool.dataset.update": (id: string, dataset_data: any) => Promise<Dataset>;
  "pool.dataset.delete": (id: string, options?: any) => Promise<boolean>;
};

export type UserMethods = {
  "user.query": (filters?: QueryFilter[], options?: QueryOptions) => Promise<User[]>;
  "user.get_instance": (id: number) => Promise<User>;
  "user.create": (user_data: any) => Promise<User>;
  "user.update": (id: number, user_data: any) => Promise<User>;
  "user.delete": (id: number) => Promise<boolean>;
};

export type GroupMethods = {
  "group.query": (filters?: QueryFilter[], options?: QueryOptions) => Promise<Group[]>;
  "group.get_instance": (id: number) => Promise<Group>;
  "group.create": (group_data: any) => Promise<Group>;
  "group.update": (id: number, group_data: any) => Promise<Group>;
  "group.delete": (id: number) => Promise<boolean>;
};

export type SharingMethods = {
  "sharing.nfs.query": (filters?: QueryFilter[], options?: QueryOptions) => Promise<NFSShare[]>;
  "sharing.nfs.create": (share_data: any) => Promise<NFSShare>;
  "sharing.nfs.update": (id: number, share_data: any) => Promise<NFSShare>;
  "sharing.nfs.delete": (id: number) => Promise<boolean>;
  "sharing.smb.query": (filters?: QueryFilter[], options?: QueryOptions) => Promise<SMBShare[]>;
  "sharing.smb.create": (share_data: any) => Promise<SMBShare>;
  "sharing.smb.update": (id: number, share_data: any) => Promise<SMBShare>;
  "sharing.smb.delete": (id: number) => Promise<boolean>;
};

export type AuthMethods = {
  "auth.login": (username: string, password: string) => Promise<string>;
  "auth.login_with_api_key": (api_key: string) => Promise<boolean>;
  "auth.logout": () => Promise<boolean>;
  "auth.me": () => Promise<AuthSession>;
  "auth.check_user": (username: string, password: string) => Promise<boolean>;
};

export type CoreMethods = {
  "core.subscribe": (name: string) => Promise<void>;
  "core.unsubscribe": (name: string) => Promise<void>;
  "core.get_jobs": (filters?: QueryFilter[], options?: QueryOptions) => Promise<Job[]>;
  "core.get_job": (id: number) => Promise<Job>;
  "core.job_abort": (id: number) => Promise<boolean>;
};

// Combined API interface
export interface TrueNASAPI extends SystemMethods, PoolMethods, DatasetMethods, UserMethods, GroupMethods, SharingMethods, AuthMethods, CoreMethods {
  // Generic method caller
  [method: string]: (...args: any[]) => Promise<any>;
}

// Error codes
export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOO_MANY_CONCURRENT_CALLS: -32000,
  METHOD_CALL_ERROR: -32001,
} as const;

export type JsonRpcErrorCode = (typeof JsonRpcErrorCodes)[keyof typeof JsonRpcErrorCodes];
