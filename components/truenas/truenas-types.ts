/**
 * TrueNAS JSON-RPC API Type Definitions
 * Generated for TrueNAS v25.04.1
 */

import { RequestType, RequestType0, RequestType2, NotificationType, NotificationType0, ParameterStructures } from "vscode-jsonrpc";

// Collection update notification types
export const CollectionUpdateNotification = new NotificationType<{
  msg: "added" | "changed" | "removed";
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
    message_ids?: string[];
  };
  extra: object;
}>("collection_update");

export const NotifyUnsubscribedNotification = new NotificationType<{
  collection: string;
  error: any;
}>("notify_unsubscribed");

// Core System Notification Types
export const JobUpdateNotification = new NotificationType<Job>("job.status");

// Authentication Request Types
export const AuthLoginRequest = new RequestType2<string, string, any, never>("auth.login");
export const AuthLoginExRequest = new RequestType<AuthLoginExParams, AuthLoginExResponse, never>("auth.login_ex", ParameterStructures.byPosition);
export const AuthLoginWithApiKeyRequest = new RequestType<string, boolean, never>("auth.login_with_api_key", ParameterStructures.byPosition);
export const AuthLogoutRequest = new RequestType0<boolean, never>("auth.logout");
export const AuthMeRequest = new RequestType0<any, never>("auth.me");
export const AuthCheckRequest = new RequestType0<boolean, never>("auth.check");
export const AuthTwoFactorAuthRequest = new RequestType2<string, string, boolean, never>("auth.twofactor.auth");
export const AuthGenerateTokenRequest = new RequestType0<string, never>("auth.generate_token");
export const AuthGenerateOnetimePasswordRequest = new RequestType0<string, never>("auth.generate_onetime_password");
export const AuthSessionsRequest = new RequestType0<any[], never>("auth.sessions");
export const AuthTerminateSessionRequest = new RequestType<string, void, never>("auth.terminate_session", ParameterStructures.byPosition);
export const AuthTerminateOtherSessionsRequest = new RequestType0<void, never>("auth.terminate_other_sessions");

// System Information Request Types
export const SystemInfoRequest = new RequestType0<SystemInfo, never>("system.info");
export const SystemVersionRequest = new RequestType0<string, never>("system.version");
export const SystemHostIdRequest = new RequestType0<string, never>("system.host_id");
export const SystemRebootRequest = new RequestType<{ delay?: number }, void, never>("system.reboot", ParameterStructures.byPosition);
export const SystemShutdownRequest = new RequestType<{ delay?: number }, void, never>("system.shutdown", ParameterStructures.byPosition);

// System General Request Types
export const SystemGeneralCountryChoicesRequest = new RequestType0<Record<string, string>, never>("system.general.country_choices");

// System NTP Server Request Types
export const SystemNtpServerQueryRequest = new RequestType2<QueryFilterExpression<NtpServer> | undefined, QueryOptions | undefined, NtpServer[], never>("system.ntpserver.query");
export const SystemNtpServerGetRequest = new RequestType<number, any, never>("system.ntpserver.get_instance", ParameterStructures.byPosition);
export const SystemNtpServerCreateRequest = new RequestType<any, any, never>("system.ntpserver.create", ParameterStructures.byPosition);
export const SystemNtpServerUpdateRequest = new RequestType2<number, any, any, never>("system.ntpserver.update");
export const SystemNtpServerDeleteRequest = new RequestType<number, boolean, never>("system.ntpserver.delete", ParameterStructures.byPosition);

// System Security Request Types
export const SystemSecurityConfigRequest = new RequestType0<any, never>("system.security.config");
export const SystemSecurityUpdateRequest = new RequestType<any, any, never>("system.security.update", ParameterStructures.byPosition);
export const SystemSecurityInfoFipsAvailableRequest = new RequestType0<boolean, never>("system.security.info.fips_available");
export const SystemSecurityInfoFipsEnabledRequest = new RequestType0<boolean, never>("system.security.info.fips_enabled");

// Pool Management Request Types
export const PoolQueryRequest = new RequestType2<QueryFilterExpression<Pool> | undefined, QueryOptions | undefined, Pool[], never>("pool.query");
export const PoolGetRequest = new RequestType<number | string, Pool, never>("pool.get", ParameterStructures.byPosition);
export const PoolCreateRequest = new RequestType<any, Pool, never>("pool.create", ParameterStructures.byPosition);
export const PoolUpdateRequest = new RequestType2<number | string, any, Pool, never>("pool.update");
export const PoolDeleteRequest = new RequestType2<number | string, { cascade?: boolean; restart_services?: boolean } | undefined, boolean, never>("pool.delete");
export const PoolScrubRequest = new RequestType<number | string, number, never>("pool.scrub", ParameterStructures.byPosition);
export const PoolExportRequest = new RequestType2<number | string, { cascade?: boolean; restart_services?: boolean } | undefined, boolean, never>("pool.export");
export const PoolImportRequest = new RequestType2<string, any | undefined, Pool, never>("pool.import");
export const PoolUpgradeRequest = new RequestType<number | string, boolean, never>("pool.upgrade", ParameterStructures.byPosition);

// Dataset Management Request Types
export const DatasetQueryRequest = new RequestType2<QueryFilterExpression<Dataset> | undefined, QueryOptions | undefined, Dataset[], never>("pool.dataset.query");
export const DatasetGetRequest = new RequestType<string, Dataset, never>("pool.dataset.get_instance", ParameterStructures.byPosition);
export const DatasetCreateRequest = new RequestType<any, Dataset, never>("pool.dataset.create", ParameterStructures.byPosition);
export const DatasetUpdateRequest = new RequestType2<string, any, Dataset, never>("pool.dataset.update");
export const DatasetDeleteRequest = new RequestType2<string, { recursive?: boolean; force?: boolean } | undefined, boolean, never>("pool.dataset.delete");
export const DatasetMountRequest = new RequestType<string, boolean, never>("pool.dataset.mount", ParameterStructures.byPosition);
export const DatasetUnmountRequest = new RequestType2<string, { force?: boolean } | undefined, boolean, never>("pool.dataset.unmount");
export const DatasetDetailsRequest = new RequestType<string, any, never>("pool.dataset.details", ParameterStructures.byPosition);
export const DatasetSnapshotCountRequest = new RequestType<string, number, never>("pool.dataset.snapshot_count", ParameterStructures.byPosition);
export const DatasetDestroySnapshotsRequest = new RequestType2<string, any, void, never>("pool.dataset.destroy_snapshots");

// Snapshot Management Request Types
export const SnapshotQueryRequest = new RequestType2<QueryFilterExpression<Snapshot> | undefined, QueryOptions | undefined, Snapshot[], never>("pool.snapshot.query");
export const SnapshotCreateRequest = new RequestType<any, any, never>("pool.snapshot.create", ParameterStructures.byPosition);
export const SnapshotDeleteRequest = new RequestType2<string, { defer?: boolean } | undefined, boolean, never>("pool.snapshot.delete");
export const SnapshotCloneRequest = new RequestType2<string, any, Dataset, never>("pool.snapshot.clone");
export const SnapshotRollbackRequest = new RequestType2<string, { force?: boolean } | undefined, boolean, never>("pool.snapshot.rollback");

// Disk Management Request Types
export const DiskQueryRequest = new RequestType2<QueryFilterExpression<Disk> | undefined, QueryOptions | undefined, Disk[], never>("disk.query");
export const DiskGetRequest = new RequestType<string, Disk, never>("disk.get", ParameterStructures.byPosition);
export const DiskUpdateRequest = new RequestType2<string, any, Disk, never>("disk.update");
export const DiskWipeRequest = new RequestType2<string, string, number, never>("disk.wipe");
export const DiskSmartTestRequest = new RequestType2<string, string, number, never>("disk.smarttest");

// User Management Request Types
export const UserQueryRequest = new RequestType2<QueryFilterExpression | undefined, QueryOptions | undefined, User[], never>("user.query");
export const UserGetRequest = new RequestType<number, User, never>("user.get_instance", ParameterStructures.byPosition);
export const UserCreateRequest = new RequestType<any, User, never>("user.create", ParameterStructures.byPosition);
export const UserUpdateRequest = new RequestType2<number, any, User, never>("user.update");
export const UserDeleteRequest = new RequestType2<number, { delete_group?: boolean } | undefined, boolean, never>("user.delete");
export const UserGetNextUidRequest = new RequestType0<number, never>("user.get_next_uid");
export const UserGetUserObjRequest = new RequestType<any, any, never>("user.get_user_obj", ParameterStructures.byPosition);
export const UserHasLocalAdministratorSetUpRequest = new RequestType0<boolean, never>("user.has_local_administrator_set_up");
export const UserSetupLocalAdministratorRequest = new RequestType<any, any, never>("user.setup_local_administrator", ParameterStructures.byPosition);
export const UserSetPasswordRequest = new RequestType2<number, string, void, never>("user.set_password");
export const UserShellChoicesRequest = new RequestType0<Record<string, string>, never>("user.shell_choices");
export const UserRenew2faSecretRequest = new RequestType<number, any, never>("user.renew_2fa_secret", ParameterStructures.byPosition);
export const UserUnset2faSecretRequest = new RequestType<number, void, never>("user.unset_2fa_secret", ParameterStructures.byPosition);

// Group Management Request Types
export const GroupQueryRequest = new RequestType2<QueryFilterExpression<Group> | undefined, QueryOptions | undefined, Group[], never>("group.query");
export const GroupGetRequest = new RequestType<number, Group, never>("group.get_instance", ParameterStructures.byPosition);
export const GroupCreateRequest = new RequestType<any, Group, never>("group.create", ParameterStructures.byPosition);
export const GroupUpdateRequest = new RequestType2<number, any, Group, never>("group.update");
export const GroupDeleteRequest = new RequestType<number, boolean, never>("group.delete", ParameterStructures.byPosition);
export const GroupGetNextGidRequest = new RequestType0<number, never>("group.get_next_gid");
export const GroupGetGroupObjRequest = new RequestType<any, any, never>("group.get_group_obj", ParameterStructures.byPosition);
export const GroupHasPasswordEnabledUserRequest = new RequestType<number, boolean, never>("group.has_password_enabled_user", ParameterStructures.byPosition);

// Sharing Request Types
export const NFSQueryRequest = new RequestType2<QueryFilterExpression<NFSShare> | undefined, QueryOptions | undefined, NFSShare[], never>("sharing.nfs.query");
export const NFSGetRequest = new RequestType<number, NFSShare, never>("sharing.nfs.get", ParameterStructures.byPosition);
export const NFSCreateRequest = new RequestType<any, NFSShare, never>("sharing.nfs.create", ParameterStructures.byPosition);
export const NFSUpdateRequest = new RequestType2<number, any, NFSShare, never>("sharing.nfs.update");
export const NFSDeleteRequest = new RequestType<number, boolean, never>("sharing.nfs.delete", ParameterStructures.byPosition);

export const SMBQueryRequest = new RequestType2<QueryFilterExpression<SMBShare> | undefined, QueryOptions | undefined, SMBShare[], never>("sharing.smb.query");
export const SMBGetRequest = new RequestType<number, SMBShare, never>("sharing.smb.get", ParameterStructures.byPosition);
export const SMBCreateRequest = new RequestType<any, SMBShare, never>("sharing.smb.create", ParameterStructures.byPosition);
export const SMBUpdateRequest = new RequestType2<number, any, SMBShare, never>("sharing.smb.update");
export const SMBDeleteRequest = new RequestType<number, boolean, never>("sharing.smb.delete", ParameterStructures.byPosition);
export const SMBGetAclRequest = new RequestType<number, any, never>("sharing.smb.getacl", ParameterStructures.byPosition);
export const SMBSetAclRequest = new RequestType2<number, any, void, never>("sharing.smb.setacl");
export const SMBPresetsRequest = new RequestType0<any[], never>("sharing.smb.presets");

// Pool Scrub Request Types
export const PoolScrubQueryRequest = new RequestType2<QueryFilterExpression<Scrub> | undefined, QueryOptions | undefined, Scrub[], never>("pool.scrub.query");
export const PoolScrubGetRequest = new RequestType<number, Scrub, never>("pool.scrub.get_instance", ParameterStructures.byPosition);
export const PoolScrubCreateRequest = new RequestType<any, Scrub, never>("pool.scrub.create", ParameterStructures.byPosition);
export const PoolScrubUpdateRequest = new RequestType2<number, any, Scrub, never>("pool.scrub.update");
export const PoolScrubDeleteRequest = new RequestType<number, boolean, never>("pool.scrub.delete", ParameterStructures.byPosition);
export const PoolScrubRunRequest = new RequestType<number, any, never>("pool.scrub.run", ParameterStructures.byPosition);
export const PoolScrubScrubRequest = new RequestType<string, any, never>("pool.scrub.scrub", ParameterStructures.byPosition);

// Pool Snapshot Task Request Types
export const PoolSnapshotTaskQueryRequest = new RequestType2<QueryFilterExpression<Snapshot> | undefined, QueryOptions | undefined, Snapshot[], never>("pool.snapshottask.query");
export const PoolSnapshotTaskGetRequest = new RequestType<number, any, never>("pool.snapshottask.get_instance", ParameterStructures.byPosition);
export const PoolSnapshotTaskCreateRequest = new RequestType<any, any, never>("pool.snapshottask.create", ParameterStructures.byPosition);
export const PoolSnapshotTaskUpdateRequest = new RequestType2<number, any, any, never>("pool.snapshottask.update");
export const PoolSnapshotTaskDeleteRequest = new RequestType<number, boolean, never>("pool.snapshottask.delete", ParameterStructures.byPosition);
export const PoolSnapshotTaskRunRequest = new RequestType<number, any, never>("pool.snapshottask.run", ParameterStructures.byPosition);
export const PoolSnapshotTaskMaxCountRequest = new RequestType0<number, never>("pool.snapshottask.max_count");
export const PoolSnapshotTaskMaxTotalCountRequest = new RequestType0<number, never>("pool.snapshottask.max_total_count");
export const PoolSnapshotTaskDeleteWillChangeRetentionForRequest = new RequestType<number, any[], never>("pool.snapshottask.delete_will_change_retention_for", ParameterStructures.byPosition);
export const PoolSnapshotTaskUpdateWillChangeRetentionForRequest = new RequestType2<number, any, any[], never>("pool.snapshottask.update_will_change_retention_for");

// Pool Resilver Request Types
export const PoolResilverConfigRequest = new RequestType0<any, never>("pool.resilver.config");
export const PoolResilverUpdateRequest = new RequestType<any, any, never>("pool.resilver.update", ParameterStructures.byPosition);

// Additional Pool Request Types
export const PoolDdtPrefetchRequest = new RequestType<string, void, never>("pool.ddt_prefetch", ParameterStructures.byPosition);
export const PoolDdtPruneRequest = new RequestType<string, void, never>("pool.ddt_prune", ParameterStructures.byPosition);

// Application Management Request Types
export const AppQueryRequest = new RequestType2<QueryFilterExpression<App> | undefined, QueryOptions | undefined, App[], never>("app.query");
export const AppGetRequest = new RequestType<string, App, never>("app.get_instance", ParameterStructures.byPosition);
export const AppCreateRequest = new RequestType<any, App, never>("app.create", ParameterStructures.byPosition);
export const AppUpdateRequest = new RequestType2<string, any, App, never>("app.update");
export const AppDeleteRequest = new RequestType<string, boolean, never>("app.delete", ParameterStructures.byPosition);
export const AppStartRequest = new RequestType<string, void, never>("app.start", ParameterStructures.byPosition);
export const AppStopRequest = new RequestType<string, void, never>("app.stop", ParameterStructures.byPosition);
export const AppRestartRequest = new RequestType<string, void, never>("app.restart", ParameterStructures.byPosition);
export const AppRedeployRequest = new RequestType<string, void, never>("app.redeploy", ParameterStructures.byPosition);
export const AppUpgradeRequest = new RequestType<string, void, never>("app.upgrade", ParameterStructures.byPosition);
export const AppRollbackRequest = new RequestType2<string, string, void, never>("app.rollback");
export const AppRollbackVersionsRequest = new RequestType<string, string[], never>("app.rollback_versions", ParameterStructures.byPosition);
export const AppAvailableRequest = new RequestType0<any[], never>("app.available");
export const AppAvailableSpaceRequest = new RequestType0<number, never>("app.available_space");
export const AppCategoriesRequest = new RequestType0<string[], never>("app.categories");
export const AppLatestRequest = new RequestType0<any[], never>("app.latest");
export const AppSimilarRequest = new RequestType<string, any[], never>("app.similar", ParameterStructures.byPosition);
export const AppConfigRequest = new RequestType0<any, never>("app.config");
export const AppConvertToCustomRequest = new RequestType<string, void, never>("app.convert_to_custom", ParameterStructures.byPosition);
export const AppCertificateAuthorityChoicesRequest = new RequestType0<Record<string, string>, never>("app.certificate_authority_choices");
export const AppCertificateChoicesRequest = new RequestType0<Record<string, string>, never>("app.certificate_choices");
export const AppContainerConsoleChoicesRequest = new RequestType<string, any[], never>("app.container_console_choices", ParameterStructures.byPosition);
export const AppContainerIdsRequest = new RequestType<string, string[], never>("app.container_ids", ParameterStructures.byPosition);
export const AppGpuChoicesRequest = new RequestType0<any[], never>("app.gpu_choices");
export const AppIpChoicesRequest = new RequestType0<string[], never>("app.ip_choices");
export const AppOutdatedDockerImagesRequest = new RequestType0<any[], never>("app.outdated_docker_images");
export const AppPullImagesRequest = new RequestType<{ force?: boolean } | undefined, void, never>("app.pull_images", ParameterStructures.byPosition);
export const AppUpgradeSummaryRequest = new RequestType<string, any, never>("app.upgrade_summary", ParameterStructures.byPosition);
export const AppUsedPortsRequest = new RequestType0<any[], never>("app.used_ports");

// App Image Request Types
export const AppImageQueryRequest = new RequestType2<QueryFilterExpression | undefined, QueryOptions | undefined, any[], never>("app.image.query");
export const AppImageGetRequest = new RequestType<string, any, never>("app.image.get_instance", ParameterStructures.byPosition);
export const AppImageDeleteRequest = new RequestType<string, boolean, never>("app.image.delete", ParameterStructures.byPosition);
export const AppImagePullRequest = new RequestType<string, void, never>("app.image.pull", ParameterStructures.byPosition);
export const AppImageDockerhubRateLimitRequest = new RequestType0<any, never>("app.image.dockerhub_rate_limit");

// App Registry Request Types
export const AppRegistryQueryRequest = new RequestType2<QueryFilterExpression | undefined, QueryOptions | undefined, any[], never>("app.registry.query");
export const AppRegistryGetRequest = new RequestType<number, any, never>("app.registry.get_instance", ParameterStructures.byPosition);
export const AppRegistryCreateRequest = new RequestType<any, any, never>("app.registry.create", ParameterStructures.byPosition);
export const AppRegistryUpdateRequest = new RequestType2<number, any, any, never>("app.registry.update");
export const AppRegistryDeleteRequest = new RequestType<number, boolean, never>("app.registry.delete", ParameterStructures.byPosition);

// App IX Volume Request Types
export const AppIxVolumeQueryRequest = new RequestType2<QueryFilterExpression | undefined, QueryOptions | undefined, any[], never>("app.ix_volume.query");
export const AppIxVolumeExistsRequest = new RequestType<string, boolean, never>("app.ix_volume.exists", ParameterStructures.byPosition);

// Core Request Types
export const CorePingRequest = new RequestType0<string, never>("core.ping");
export const CoreSetOptionsRequest = new RequestType<any, void, never>("core.set_options", ParameterStructures.byPosition);

// Job Management Request Types
export const JobQueryRequest = new RequestType2<QueryFilterExpression<Job> | undefined, QueryOptions | undefined, Job[], never>("core.get_jobs");
export const JobGetRequest = new RequestType<number, Job, never>("core.job_info", ParameterStructures.byPosition);
export const JobAbortRequest = new RequestType<number, boolean, never>("core.job_abort", ParameterStructures.byPosition);
export const JobDownloadLogsRequest = new RequestType<number, FileDownloadJobResult, never>("core.download_job_logs", ParameterStructures.byPosition);

// Service Management Request Types
export const ServiceQueryRequest = new RequestType2<QueryFilterExpression<Service> | undefined, QueryOptions | undefined, Service[], never>("service.query");
export const ServiceStartRequest = new RequestType<string, boolean, never>("service.start", ParameterStructures.byPosition);
export const ServiceStopRequest = new RequestType<string, boolean, never>("service.stop", ParameterStructures.byPosition);
export const ServiceRestartRequest = new RequestType<string, boolean, never>("service.restart", ParameterStructures.byPosition);
export const ServiceReloadRequest = new RequestType<string, boolean, never>("service.reload", ParameterStructures.byPosition);

// Alert Management Request Types
export const AlertListRequest = new RequestType0<Alert[], never>("alert.list");
export const AlertDismissRequest = new RequestType<string, boolean, never>("alert.dismiss", ParameterStructures.byPosition);
export const AlertRestoreRequest = new RequestType<string, boolean, never>("alert.restore", ParameterStructures.byPosition);

// Network Interface Request Types
export const InterfaceQueryRequest = new RequestType2<QueryFilterExpression<NetworkInterface> | undefined, QueryOptions | undefined, NetworkInterface[], never>("interface.query");
export const InterfaceUpdateRequest = new RequestType2<string, any, any, never>("interface.update");

// Certificate Management Request Types
export const CertificateQueryRequest = new RequestType2<QueryFilterExpression<Certificate> | undefined, QueryOptions | undefined, Certificate[], never>("certificate.query");
export const CertificateCreateRequest = new RequestType<any, any, never>("certificate.create", ParameterStructures.byPosition);
export const CertificateUpdateRequest = new RequestType2<number, any, any, never>("certificate.update");
export const CertificateDeleteRequest = new RequestType<number, boolean, never>("certificate.delete", ParameterStructures.byPosition);

// Subscription and Real-time Request Types
export const CoreSubscribeRequest = new RequestType<ApiEventCollection, boolean, never>("core.subscribe", ParameterStructures.byPosition);
export const CoreUnsubscribeRequest = new RequestType<ApiEventCollection, boolean, never>("core.unsubscribe", ParameterStructures.byPosition);
export const ReportingRealtimeRequest = new RequestType<any, any, never>("reporting.realtime", ParameterStructures.byPosition);

// File Operations Request Types
export const FilesystemStatRequest = new RequestType<string, any, never>("filesystem.stat", ParameterStructures.byPosition);
export const FilesystemListdirRequest = new RequestType<{ path: string; filters?: QueryFilterExpression; options?: QueryOptions }, any[], never>("filesystem.listdir");
export const FilesystemMkdirRequest = new RequestType2<string, { mode?: string } | undefined, boolean, never>("filesystem.mkdir");
export const FilesystemChdirRequest = new RequestType<string, boolean, never>("filesystem.chdir", ParameterStructures.byPosition);
export const FilesystemUnlinkRequest = new RequestType<string, boolean, never>("filesystem.unlink", ParameterStructures.byPosition);

// Cloud Sync Request Types
export const CloudSyncQueryRequest = new RequestType2<QueryFilterExpression<CloudSync> | undefined, QueryOptions | undefined, CloudSync[], never>("cloudsync.query");
export const CloudSyncCreateRequest = new RequestType<any, any, never>("cloudsync.create", ParameterStructures.byPosition);
export const CloudSyncUpdateRequest = new RequestType2<number, any, any, never>("cloudsync.update");
export const CloudSyncDeleteRequest = new RequestType<number, boolean, never>("cloudsync.delete", ParameterStructures.byPosition);
export const CloudSyncSyncRequest = new RequestType<number, number, never>("cloudsync.sync", ParameterStructures.byPosition);

// Replication Request Types
export const ReplicationQueryRequest = new RequestType2<QueryFilterExpression<Replication> | undefined, QueryOptions | undefined, Replication[], never>("replication.query");
export const ReplicationCreateRequest = new RequestType<any, any, never>("replication.create", ParameterStructures.byPosition);
export const ReplicationUpdateRequest = new RequestType2<number, any, any, never>("replication.update");
export const ReplicationDeleteRequest = new RequestType<number, boolean, never>("replication.delete", ParameterStructures.byPosition);
export const ReplicationRunRequest = new RequestType<number, number, never>("replication.run", ParameterStructures.byPosition);

// API Event Types - Comprehensive list of subscribable events
export type ApiEventCollection =
  // ACME & Certificates
  | "acme.dns.authenticator.query"
  | "certificate.query"

  // Alerts & Notifications
  | "alert.list"
  | "alertservice.query"

  // API Keys & Authentication
  | "api_key.query"

  // Applications & Containers
  | "app.query"
  | "app.stats"
  | "app.container_log_follow"
  | "app.image.query"
  | "app.registry.query"
  | "container.query"

  // Cloud Services
  | "cloud_backup.query"
  | "cloudsync.query"
  | "cloudsync.credentials.query"

  // Core System & Jobs
  | "core.get_jobs"

  // Scheduling & Automation
  | "cronjob.query"

  // Docker & Networking
  | "docker.network.query"

  // Fibre Channel
  | "fc.fc_host.query"
  | "fcport.query"

  // Filesystem Operations
  | "filesystem.file_tail_follow"
  | "filesystem.acltemplate.query"

  // User & Group Management
  | "group.query"
  | "user.query"

  // Hardware & System
  | "initshutdownscript.query"
  | "interface.query"
  | "jbof.query"

  // iSCSI Storage
  | "iscsi.auth.query"
  | "iscsi.extent.query"
  | "iscsi.initiator.query"
  | "iscsi.portal.query"
  | "iscsi.target.query"
  | "iscsi.targetextent.query"

  // Kerberos Authentication
  | "kerberos.keytab.query"
  | "kerberos.realm.query"

  // Keychain & Credentials
  | "keychaincredential.query"

  // NVMe-oF
  | "nvmet.host.query"
  | "nvmet.host_subsys.query"
  | "nvmet.namespace.query"
  | "nvmet.port.query"
  | "nvmet.port_subsys.query"
  | "nvmet.subsys.query"

  // Storage Pools & Datasets
  | "pool.query"
  | "pool.dataset.query"
  | "pool.scrub.query"
  | "pool.snapshot.query"
  | "pool.snapshottask.query"

  // Security & Privileges
  | "privilege.query"

  // Replication & Backup
  | "replication.query"
  | "rsynctask.query"

  // Monitoring & Reporting
  | "reporting.realtime"
  | "reporting.exporters.query"

  // System Services
  | "service.query"

  // File Sharing
  | "sharing.nfs.query"
  | "sharing.smb.query"

  // Network Configuration
  | "staticroute.query"
  | "system.ntpserver.query"

  // System Configuration
  | "tunable.query"
  | "update.status"

  // Virtualization
  | "virt.instance.query"
  | "virt.instance.metrics"
  | "virt.volume.query"
  | "vm.query"
  | "vm.device.query"
  | "vmware.query";

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

// NTP Server types
export interface NtpServer {
  id: number;
  address: string;
  burst: boolean;
  iburst: boolean;
  prefer: boolean;
  minpoll: number;
  maxpoll: number;
  force: boolean;
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

// Snapshot types
export interface Snapshot {
  id: string;
  name: string;
  dataset: string;
  type: string;
  snapshot_name: string;
  properties: Record<string, DatasetProperty>;
  holds: Record<string, string>;
  retention: any;
}

// Scrub types
export interface Scrub {
  id: number;
  pool: number | string;
  pool_name: string;
  description: string;
  schedule: any;
  threshold: number;
  enabled: boolean;
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

// New v25.04.1 authentication types for auth.login_ex
export type AuthMechanism = "PASSWORD_PLAIN" | "API_KEY_PLAIN" | "AUTH_TOKEN_PLAIN" | "OTP_TOKEN";

export interface AuthLoginOptions {
  user_info?: boolean;
}

export interface PasswordPlainAuth {
  mechanism: "PASSWORD_PLAIN";
  username: string;
  password: string;
  login_options?: AuthLoginOptions;
}

export interface ApiKeyPlainAuth {
  mechanism: "API_KEY_PLAIN";
  username: string;
  api_key: string;
  login_options?: AuthLoginOptions;
}

export interface AuthTokenPlainAuth {
  mechanism: "AUTH_TOKEN_PLAIN";
  token: string;
  login_options?: AuthLoginOptions;
}

export interface OtpTokenAuth {
  mechanism: "OTP_TOKEN";
  otp_token: string;
  login_options?: AuthLoginOptions;
}

export type AuthLoginExParams = PasswordPlainAuth | ApiKeyPlainAuth | AuthTokenPlainAuth | OtpTokenAuth;

export type AuthResponseType = "SUCCESS" | "OTP_REQUIRED" | "AUTH_ERR" | "EXPIRED" | "REDIRECT";

export interface AuthSuccessResponse {
  response_type: "SUCCESS";
  user_info?: AuthSession;
}

export interface AuthOtpRequiredResponse {
  response_type: "OTP_REQUIRED";
  username: string;
}

export interface AuthErrorResponse {
  response_type: "AUTH_ERR";
}

export interface AuthExpiredResponse {
  response_type: "EXPIRED";
}

export interface AuthRedirectResponse {
  response_type: "REDIRECT";
}

export type AuthLoginExResponse = AuthSuccessResponse | AuthOtpRequiredResponse | AuthErrorResponse | AuthExpiredResponse | AuthRedirectResponse;

// Job types - Enhanced for v25.04.1
export type JobState =
  | "WAITING" // Job is queued and waiting to run
  | "RUNNING" // Job is currently executing
  | "SUCCESS" // Job completed successfully
  | "FAILED" // Job failed with an error
  | "ABORTED" // Job was manually aborted
  | "HOLD"; // Job is on hold

export interface Job {
  id: number;
  method: string;
  arguments: any[];
  logs_path?: string | null;
  logs_excerpt?: string | null;
  state: JobState;
  progress: JobProgress;
  result: any;
  error: string | null;
  exception: string | null;
  exc_info: JobExceptionInfo | null;
  time_started: string | { $date: number };
  time_finished: string | { $date: number } | null;
  message_ids?: string[]; // For tracking JSON-RPC calls that triggered this job
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

// File Upload/Download Job Types
export interface FileDownloadJobResult {
  job_id: number;
  download_url: string;
}

export interface FileUploadJobResult {
  job_id: number;
}

export type QueryFilter<T> = [field: keyof T, operator: QueryOperator, value: any];

export type QueryOperator =
  // Basic comparison operators
  | "=" // equals
  | "!=" // not equals
  | ">" // greater than
  | ">=" // greater than or equal
  | "<" // less than
  | "<=" // less than or equal

  // String operators (case-sensitive)
  | "~" // regex match
  | "^" // starts with
  | "!^" // does not start with
  | "$" // ends with
  | "!$" // does not end with

  // Case-insensitive variants (prefix with C)
  | "C=" // case-insensitive equals
  | "C!=" // case-insensitive not equals
  | "C~" // case-insensitive regex match
  | "C^" // case-insensitive starts with
  | "C!^" // case-insensitive does not start with
  | "C$" // case-insensitive ends with
  | "C!$" // case-insensitive does not end with

  // Array/list operators
  | "in" // value is in array
  | "nin" // value is not in array
  | "rin" // array contains value (reverse in)
  | "rnin"; // array does not contain value (reverse not in)

// Alternative array-based filter format [field, operator, value] as used in documentation
export type QueryFilterArray = [string, QueryOperator, any];

// Query filter with logical connectives - supports both object and array formats
export type QueryFilterExpression<T = {}> = QueryFilter<T>[]; //; | ["OR", QueryFilterExpression<T>[]] | ["AND", QueryFilterExpression<T>[]];
// | QueryFilterArray
// | ["OR", QueryFilterExpression[]]
// | ["AND", QueryFilterExpression[]] // explicit AND (default is implicit)
// | QueryFilterExpression[]; // implicit AND

// Enhanced Query Options for v25.04.1
export interface QueryOptions {
  // Data selection - keep compatible with existing code
  select?: string[]; // Fields to return

  // Pagination
  limit?: number; // Maximum number of results
  offset?: number; // Number of results to skip

  // Sorting
  order_by?: string[]; // Fields to sort by (prefix with - for DESC, nulls_first:/nulls_last: for null handling)

  // Result modification
  count?: boolean; // Return count instead of data
  get?: boolean; // Get single result (equivalent to limit: 1)

  // Advanced options (method-specific)
  relationships?: boolean; // Include related data
  extend?: string; // Extend with additional data
  extend_context?: string; // Context for extend operation
  prefix?: string; // Prefix for field names
  extra?: Record<string, any>; // Additional options
  force_sql_filters?: boolean; // Force SQL-style filtering
}

// Enhanced Query Options for v25.04.1 - supports field aliasing
export interface ExtendedQueryOptions {
  // Data selection with optional field aliasing
  select?: string[] | Array<[string, string]>; // Fields to return, optionally with aliases

  // Pagination
  limit?: number; // Maximum number of results
  offset?: number; // Number of results to skip

  // Sorting
  order_by?: string[]; // Fields to sort by (prefix with - for DESC, nulls_first:/nulls_last: for null handling)

  // Result modification
  count?: boolean; // Return count instead of data
  get?: boolean; // Get single result (equivalent to limit: 1)

  // Advanced options (method-specific)
  relationships?: boolean; // Include related data
  extend?: string; // Extend with additional data
  extend_context?: string; // Context for extend operation
  prefix?: string; // Prefix for field names
  extra?: Record<string, any>; // Additional options
  force_sql_filters?: boolean; // Force SQL-style filtering
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

// Cloud Sync types
export interface CloudSync {
  id: number;
  description: string;
  direction: string;
  path: string;
  credentials: number;
  bucket: string;
  bucket_input: string;
  folder: string;
  encryption: boolean;
  filename_encryption: boolean;
  encryption_password: string;
  encryption_salt: string;
  transfers: number | null;
  bandwidth_limit: any[];
  include: string[];
  exclude: string[];
  task_encryption: string;
  storage_class: string;
  chunk_size: string;
  fast_list: boolean;
  follow_symlinks: boolean;
  enabled: boolean;
  job: Job | null;
  locked: boolean;
}

// Replication types
export interface Replication {
  id: number;
  name: string;
  direction: "PUSH" | "PULL";
  transport: "SSH" | "SSH+NETCAT" | "LOCAL";
  ssh_credentials: number | null;
  netcat_active_side: "LOCAL" | "REMOTE" | null;
  netcat_active_side_listen_address: string | null;
  netcat_active_side_port_min: number | null;
  netcat_active_side_port_max: number | null;
  netcat_passive_side_connect_address: string | null;
  source_datasets: string[];
  target_dataset: string;
  recursive: boolean;
  exclude: string[];
  properties: boolean;
  properties_exclude: string[];
  properties_override: Record<string, any>;
  replicate: boolean;
  encryption: boolean;
  encryption_key: string | null;
  encryption_key_format: "HEX" | "PASSPHRASE" | null;
  encryption_key_location: string | null;
  periodic_snapshot_tasks: number[];
  naming_schema: string[];
  also_include_naming_schema: string[];
  auto: boolean;
  schedule: any;
  restrict_schedule: any;
  only_matching_schedule: boolean;
  allow_from_scratch: boolean;
  hold_pending_snapshots: boolean;
  retention_policy: "SOURCE" | "CUSTOM" | "NONE";
  lifetime_value: number | null;
  lifetime_unit: "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" | null;
  compression: "DISABLED" | "LZ4" | "GZIP" | "ZSTD" | null;
  speed_limit: number | null;
  large_block: boolean;
  embed: boolean;
  compressed: boolean;
  retries: number;
  logging_level: "DEFAULT" | "DEBUG" | "INFO" | "WARNING" | "ERROR" | null;
  enabled: boolean;
  state: any;
  job: Job | null;
  locked: boolean;
}

// Service types
export interface Service {
  id: number;
  service: string;
  enable: boolean;
  state: "RUNNING" | "STOPPED" | "UNKNOWN";
  pids: number[];
}

// Alert types
export interface Alert {
  id: string;
  source: string;
  klass: string;
  args: any;
  node: string;
  key: string;
  datetime: string;
  last_occurrence: string;
  dismissed: boolean;
  mail: boolean;
  text: string;
  level: "INFO" | "NOTICE" | "WARNING" | "ERROR" | "CRITICAL" | "ALERT" | "EMERGENCY";
  formatted: string;
  one_shot: boolean;
}

// Network Interface types
export interface NetworkInterface {
  id: string;
  name: string;
  type: string;
  description: string;
  mtu: number;
  state: {
    name: string;
    orig_name: string;
    description: string;
    mtu: number;
    cloned: boolean;
    flags: string[];
    nd6_flags: string[];
    capabilities: string[];
    aliases: NetworkInterfaceAlias[];
    link_state: string;
    media_type: string | null;
    media_subtype: string | null;
    active_media_type: string | null;
    active_media_subtype: string | null;
    supported_media: string[];
    media_options: string[] | null;
    link_address: string | null;
    permanent_link_address: string | null;
  };
  aliases: NetworkInterfaceAlias[];
  ipv4_dhcp: boolean;
  ipv6_auto: boolean;
  options: string;
  bridge_members: string[];
  lag_protocol: string | null;
  lag_ports: string[];
  vlan_parent_interface: string | null;
  vlan_tag: number | null;
  vlan_pcp: number | null;
  failover_critical: boolean;
  failover_group: number | null;
  failover_vhid: number | null;
  failover_aliases: NetworkInterfaceAlias[];
  failover_virtual_aliases: NetworkInterfaceAlias[];
}

export interface NetworkInterfaceAlias {
  type: "INET" | "INET6";
  address: string;
  netmask: number;
  broadcast?: string;
}

// Certificate types
export interface Certificate {
  id: number;
  type: number;
  name: string;
  certificate: string | null;
  privatekey: string | null;
  CSR: string | null;
  acme_uri: string | null;
  domains_authenticators: Record<string, string>;
  renew_days: number;
  revoked_date: string | null;
  revoked: boolean;
  expired: boolean;
  issuer: CertificateIssuer | null;
  chain_list: string[];
  country: string | null;
  state: string | null;
  city: string | null;
  organization: string | null;
  organizational_unit: string | null;
  common: string | null;
  san: string[] | null;
  email: string | null;
  DN: string | null;
  subject_name_hash: string | null;
  digest_algorithm: string | null;
  from: string | null;
  until: string | null;
  root_path: string;
  acme_directory_uri: string;
  certificate_path: string | null;
  privatekey_path: string | null;
  csr_path: string | null;
  cert_type: string;
  revoked_certs: any[];
  crl_path: string;
  signedby: CertificateAuthority | null;
}

export interface CertificateIssuer {
  name: string;
  organization: string | null;
  organizational_unit: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  email: string | null;
}

export interface CertificateAuthority {
  id: number;
  type: number;
  name: string;
  certificate: string;
  privatekey: string;
  root_path: string;
  certificate_path: string;
  privatekey_path: string;
  serial: number;
}
