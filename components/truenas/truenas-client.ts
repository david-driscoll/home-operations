import { createWebSocketConnection, ConsoleLogger, listen } from "vscode-ws-jsonrpc";
import {
  type AuthLoginExParams,
  type AuthLoginExResponse,
  type SystemInfo,
  type Dataset,
  type User,
  type Group,
  type NFSShare,
  type SMBShare,
  type Pool,
  type Disk,
  type VirtualMachine,
  type App,
  type QueryFilter,
  type QueryOptions,
  type Job,
  // Authentication Request Types
  AuthLoginRequest,
  AuthLoginExRequest,
  AuthLoginWithApiKeyRequest,
  AuthLogoutRequest,
  AuthMeRequest,
  AuthCheckRequest,
  AuthTwoFactorAuthRequest,
  AuthGenerateTokenRequest,
  AuthGenerateOnetimePasswordRequest,
  AuthSessionsRequest,
  AuthTerminateSessionRequest,
  AuthTerminateOtherSessionsRequest,
  // System Request Types
  SystemInfoRequest,
  SystemVersionRequest,
  SystemRebootRequest,
  SystemShutdownRequest,
  SystemGeneralCountryChoicesRequest,
  SystemNtpServerQueryRequest,
  SystemNtpServerGetRequest,
  SystemNtpServerCreateRequest,
  SystemNtpServerUpdateRequest,
  SystemNtpServerDeleteRequest,
  SystemSecurityConfigRequest,
  SystemSecurityUpdateRequest,
  SystemSecurityInfoFipsAvailableRequest,
  SystemSecurityInfoFipsEnabledRequest,
  // Pool Management Request Types
  PoolQueryRequest,
  PoolGetRequest,
  PoolCreateRequest,
  PoolUpdateRequest,
  PoolDeleteRequest,
  PoolScrubRequest,
  PoolExportRequest,
  PoolDdtPrefetchRequest,
  PoolDdtPruneRequest,
  PoolScrubQueryRequest,
  PoolScrubGetRequest,
  PoolScrubCreateRequest,
  PoolScrubUpdateRequest,
  PoolScrubDeleteRequest,
  PoolScrubRunRequest,
  PoolScrubScrubRequest,
  PoolSnapshotTaskQueryRequest,
  PoolSnapshotTaskGetRequest,
  PoolSnapshotTaskCreateRequest,
  PoolSnapshotTaskUpdateRequest,
  PoolSnapshotTaskDeleteRequest,
  PoolSnapshotTaskRunRequest,
  PoolSnapshotTaskMaxCountRequest,
  PoolSnapshotTaskMaxTotalCountRequest,
  PoolSnapshotTaskDeleteWillChangeRetentionForRequest,
  PoolSnapshotTaskUpdateWillChangeRetentionForRequest,
  PoolResilverConfigRequest,
  PoolResilverUpdateRequest,
  // Dataset Management Request Types
  DatasetQueryRequest,
  DatasetGetRequest,
  DatasetCreateRequest,
  DatasetUpdateRequest,
  DatasetDeleteRequest,
  DatasetDetailsRequest,
  DatasetSnapshotCountRequest,
  DatasetDestroySnapshotsRequest,
  // User Management Request Types
  UserQueryRequest,
  UserGetRequest,
  UserCreateRequest,
  UserUpdateRequest,
  UserDeleteRequest,
  UserGetNextUidRequest,
  UserGetUserObjRequest,
  UserHasLocalAdministratorSetUpRequest,
  UserSetupLocalAdministratorRequest,
  UserSetPasswordRequest,
  UserShellChoicesRequest,
  UserRenew2faSecretRequest,
  UserUnset2faSecretRequest,
  // Group Management Request Types
  GroupQueryRequest,
  GroupGetRequest,
  GroupCreateRequest,
  GroupUpdateRequest,
  GroupDeleteRequest,
  GroupGetNextGidRequest,
  GroupGetGroupObjRequest,
  GroupHasPasswordEnabledUserRequest,
  // Sharing Request Types
  NFSQueryRequest,
  NFSGetRequest,
  NFSCreateRequest,
  NFSUpdateRequest,
  NFSDeleteRequest,
  SMBQueryRequest,
  SMBGetRequest,
  SMBCreateRequest,
  SMBUpdateRequest,
  SMBDeleteRequest,
  SMBGetAclRequest,
  SMBSetAclRequest,
  SMBPresetsRequest,
  // App Management Request Types
  AppQueryRequest,
  AppGetRequest,
  AppCreateRequest,
  AppUpdateRequest,
  AppDeleteRequest,
  AppStartRequest,
  AppStopRequest,
  AppRestartRequest,
  AppRedeployRequest,
  AppUpgradeRequest,
  AppRollbackRequest,
  AppRollbackVersionsRequest,
  AppAvailableRequest,
  AppAvailableSpaceRequest,
  AppCategoriesRequest,
  AppLatestRequest,
  AppSimilarRequest,
  AppConfigRequest,
  AppConvertToCustomRequest,
  AppCertificateAuthorityChoicesRequest,
  AppCertificateChoicesRequest,
  AppContainerConsoleChoicesRequest,
  AppContainerIdsRequest,
  AppGpuChoicesRequest,
  AppIpChoicesRequest,
  AppOutdatedDockerImagesRequest,
  AppPullImagesRequest,
  AppUpgradeSummaryRequest,
  AppUsedPortsRequest,
  // App Image Request Types
  AppImageQueryRequest,
  AppImageGetRequest,
  AppImageDeleteRequest,
  AppImagePullRequest,
  AppImageDockerhubRateLimitRequest,
  // App Registry Request Types
  AppRegistryQueryRequest,
  AppRegistryGetRequest,
  AppRegistryCreateRequest,
  AppRegistryUpdateRequest,
  AppRegistryDeleteRequest,
  // App IX Volume Request Types
  AppIxVolumeQueryRequest,
  AppIxVolumeExistsRequest,
  // VM Management Request Types
  VMQueryRequest,
  VMGetRequest,
  VMCreateRequest,
  VMUpdateRequest,
  VMDeleteRequest,
  VMCloneRequest,
  VMStartRequest,
  VMStopRequest,
  VMPowerOffRequest,
  VMRestartRequest,
  VMSuspendRequest,
  VMResumeRequest,
  VMStatusRequest,
  VMGetConsoleRequest,
  VMGetAvailableMemoryRequest,
  VMGetMemoryUsageRequest,
  VMGetDisplayDevicesRequest,
  VMBootloaderOptionsRequest,
  VMFlagsRequest,
  VMLogFileDownloadRequest,
  VMLogFilePathRequest,
  VMPortWizardRequest,
  VMRandomMacRequest,
  VMResolutionChoicesRequest,
  VMSupportsVirtualizationRequest,
  VMVirtualizationDetailsRequest,
  // VM Device Request Types
  VMDeviceQueryRequest,
  VMDeviceGetRequest,
  VMDeviceCreateRequest,
  VMDeviceUpdateRequest,
  VMDeviceDeleteRequest,
  VMDeviceBindChoicesRequest,
  VMDeviceDiskChoicesRequest,
  VMDevicePassthroughDeviceRequest,
  VMDevicePassthroughDeviceChoicesRequest,
  // Job Management Request Types
  JobQueryRequest,
  JobGetRequest,
  JobAbortRequest,
  // Core Request Types
  CorePingRequest,
  CoreSetOptionsRequest,
  CoreSubscribeRequest,
  CoreUnsubscribeRequest,
  // Notification Types
  CollectionUpdateNotification,
  NotifyUnsubscribedNotification,
  JobUpdateNotification,
} from "./truenas-types.js";
import { WebSocket } from "http";
import { MessageConnection, RequestType, NotificationType } from "vscode-jsonrpc";

/**
 * Base namespace class for API methods
 */
abstract class ApiNamespace {
  constructor(protected client: TrueNASClient) {
    if (this.client === undefined) {
      throw new Error("Client given? " + this.constructor.name);
    }
  }
  protected withConnection<R>(func: (connection: MessageConnection) => Promise<R>) {
    if (this.client === undefined) {
      throw new Error("Client not initialized? " + this.constructor.name);
    }
    return this.client.connection.then(func);
  }
}

/**
 * Authentication API namespace
 */
class AuthApi extends ApiNamespace {
  login(username: string, password: string, otpToken?: string): Promise<any> {
    if (otpToken) {
      // Use two-factor auth request if OTP token provided
      return this.withConnection((connection) => connection.sendRequest(AuthTwoFactorAuthRequest, username, otpToken));
    } else {
      return this.withConnection((connection) => connection.sendRequest(AuthLoginRequest, username, password));
    }
  }

  loginEx(params: AuthLoginExParams): Promise<AuthLoginExResponse> {
    return this.withConnection((connection) => connection.sendRequest(AuthLoginExRequest, params));
  }

  loginWithApiKey(apiKey: string): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(AuthLoginWithApiKeyRequest, apiKey));
  }

  logout(): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(AuthLogoutRequest));
  }

  me(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AuthMeRequest));
  }

  generateToken(): Promise<string> {
    return this.withConnection((connection) => connection.sendRequest(AuthGenerateTokenRequest));
  }

  generateOnetimePassword(): Promise<string> {
    return this.withConnection((connection) => connection.sendRequest(AuthGenerateOnetimePasswordRequest));
  }

  sessions(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AuthSessionsRequest));
  }

  terminateSession(sessionId: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AuthTerminateSessionRequest, sessionId));
  }

  terminateOtherSessions(): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AuthTerminateOtherSessionsRequest));
  }
}

/**
 * System API namespace
 */
class SystemApi extends ApiNamespace {
  info(): Promise<SystemInfo> {
    return this.withConnection((connection) => connection.sendRequest(SystemInfoRequest));
  }

  version(): Promise<string> {
    return this.withConnection((connection) => connection.sendRequest(SystemVersionRequest));
  }

  reboot(delay?: number): Promise<void> {
    return this.withConnection((connection) => (delay ? connection.sendRequest(SystemRebootRequest, { delay }) : connection.sendRequest(SystemRebootRequest, {})));
  }

  shutdown(delay?: number): Promise<void> {
    return this.withConnection((connection) => (delay ? connection.sendRequest(SystemShutdownRequest, { delay }) : connection.sendRequest(SystemShutdownRequest, {})));
  }

  get general() {
    return new SystemGeneralApi(this.client);
  }

  get ntpserver() {
    return new SystemNtpServerApi(this.client);
  }

  get security() {
    return new SystemSecurityApi(this.client);
  }
}

class SystemGeneralApi extends ApiNamespace {
  countryChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(SystemGeneralCountryChoicesRequest));
  }
}

class SystemNtpServerApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(SystemNtpServerQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(SystemNtpServerGetRequest, id));
  }

  create(data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(SystemNtpServerCreateRequest, data));
  }

  update(id: number, data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(SystemNtpServerUpdateRequest, id, data));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(SystemNtpServerDeleteRequest, id));
  }
}

class SystemSecurityApi extends ApiNamespace {
  config(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(SystemSecurityConfigRequest));
  }

  update(data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(SystemSecurityUpdateRequest, data));
  }

  get info() {
    return new SystemSecurityInfoApi(this.client);
  }
}

class SystemSecurityInfoApi extends ApiNamespace {
  fipsAvailable(): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(SystemSecurityInfoFipsAvailableRequest));
  }

  fipsEnabled(): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(SystemSecurityInfoFipsEnabledRequest));
  }
}

/**
 * User API namespace
 */
class UserApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<User[]> {
    return this.withConnection((connection) => connection.sendRequest(UserQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<User> {
    return this.withConnection((connection) => connection.sendRequest(UserGetRequest, id));
  }

  create(userData: any): Promise<User> {
    return this.withConnection((connection) => connection.sendRequest(UserCreateRequest, userData));
  }

  update(id: number, userData: any): Promise<User> {
    return this.withConnection((connection) => connection.sendRequest(UserUpdateRequest, id, userData));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(UserDeleteRequest, id, undefined));
  }

  getNextUid(): Promise<number> {
    return this.withConnection((connection) => connection.sendRequest(UserGetNextUidRequest));
  }

  getUserObj(userData: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(UserGetUserObjRequest, userData));
  }

  hasLocalAdministratorSetUp(): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(UserHasLocalAdministratorSetUpRequest));
  }

  setupLocalAdministrator(userData: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(UserSetupLocalAdministratorRequest, userData));
  }

  setPassword(id: number, password: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(UserSetPasswordRequest, id, password));
  }

  shellChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(UserShellChoicesRequest));
  }

  renew2faSecret(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(UserRenew2faSecretRequest, id));
  }

  unset2faSecret(id: number): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(UserUnset2faSecretRequest, id));
  }
}

/**
 * Group API namespace
 */
class GroupApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<Group[]> {
    return this.withConnection((connection) => connection.sendRequest(GroupQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<Group> {
    return this.withConnection((connection) => connection.sendRequest(GroupGetRequest, id));
  }

  create(groupData: any): Promise<Group> {
    return this.withConnection((connection) => connection.sendRequest(GroupCreateRequest, groupData));
  }

  update(id: number, groupData: any): Promise<Group> {
    return this.withConnection((connection) => connection.sendRequest(GroupUpdateRequest, id, groupData));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(GroupDeleteRequest, id));
  }

  getNextGid(): Promise<number> {
    return this.withConnection((connection) => connection.sendRequest(GroupGetNextGidRequest));
  }

  getGroupObj(groupData: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(GroupGetGroupObjRequest, groupData));
  }

  hasPasswordEnabledUser(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(GroupHasPasswordEnabledUserRequest, id));
  }
}

/**
 * Pool API namespace
 */
class PoolApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<Pool[]> {
    return this.withConnection((connection) => connection.sendRequest(PoolQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<Pool> {
    return this.withConnection((connection) => connection.sendRequest(PoolGetRequest, id));
  }

  create(poolData: any): Promise<Pool> {
    return this.withConnection((connection) => connection.sendRequest(PoolCreateRequest, poolData));
  }

  update(id: number, poolData: any): Promise<Pool> {
    return this.withConnection((connection) => connection.sendRequest(PoolUpdateRequest, id, poolData));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(PoolDeleteRequest, id, undefined));
  }

  export(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(PoolExportRequest, id, undefined));
  }

  ddtPrefetch(pool: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(PoolDdtPrefetchRequest, pool));
  }

  ddtPrune(pool: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(PoolDdtPruneRequest, pool));
  }

  get dataset() {
    return new PoolDatasetApi(this.client);
  }

  get scrub() {
    return new PoolScrubApi(this.client);
  }

  get snapshottask() {
    return new PoolSnapshotTaskApi(this.client);
  }

  get resilver() {
    return new PoolResilverApi(this.client);
  }
}

class PoolDatasetApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<Dataset[]> {
    const params: any[] = [];
    if (filters) params.push(filters);
    if (options) params.push(options);
    return this.withConnection((connection) => connection.sendRequest(DatasetQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: string): Promise<Dataset> {
    return this.withConnection((connection) => connection.sendRequest(DatasetGetRequest, id));
  }

  create(datasetData: any): Promise<Dataset> {
    return this.withConnection((connection) => connection.sendRequest(DatasetCreateRequest, datasetData));
  }

  update(id: string, datasetData: any): Promise<Dataset> {
    return this.withConnection((connection) => connection.sendRequest(DatasetUpdateRequest, id, datasetData));
  }

  delete(id: string, options?: any): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(DatasetDeleteRequest, id, options || {}));
  }

  details(id: string): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(DatasetDetailsRequest, id));
  }

  snapshotCount(id: string): Promise<number> {
    return this.withConnection((connection) => connection.sendRequest(DatasetSnapshotCountRequest, id));
  }

  destroySnapshots(id: string, options: any): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(DatasetDestroySnapshotsRequest, id, options));
  }
}

class PoolScrubApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(PoolScrubQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolScrubGetRequest, id));
  }

  create(data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolScrubCreateRequest, data));
  }

  update(id: number, data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolScrubUpdateRequest, id, data));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(PoolScrubDeleteRequest, id));
  }

  run(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolScrubRunRequest, id));
  }

  scrub(poolName: string): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolScrubScrubRequest, poolName));
  }
}

class PoolSnapshotTaskApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskGetRequest, id));
  }

  create(data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskCreateRequest, data));
  }

  update(id: number, data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskUpdateRequest, id, data));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskDeleteRequest, id));
  }

  run(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskRunRequest, id));
  }

  maxCount(): Promise<number> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskMaxCountRequest));
  }

  maxTotalCount(): Promise<number> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskMaxTotalCountRequest));
  }

  deleteWillChangeRetentionFor(id: number): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskDeleteWillChangeRetentionForRequest, id));
  }

  updateWillChangeRetentionFor(id: number, data: any): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(PoolSnapshotTaskUpdateWillChangeRetentionForRequest, id, data));
  }
}

class PoolResilverApi extends ApiNamespace {
  config(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolResilverConfigRequest));
  }

  update(data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(PoolResilverUpdateRequest, data));
  }
}

/**
 * Sharing API namespace
 */
class SharingApi extends ApiNamespace {
  get nfs() {
    return new SharingNfsApi(this.client);
  }

  get smb() {
    return new SharingSmbApi(this.client);
  }
}

class SharingNfsApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<NFSShare[]> {
    return this.withConnection((connection) => connection.sendRequest(NFSQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<NFSShare> {
    return this.withConnection((connection) => connection.sendRequest(NFSGetRequest, id));
  }

  create(shareData: any): Promise<NFSShare> {
    return this.withConnection((connection) => connection.sendRequest(NFSCreateRequest, shareData));
  }

  update(id: number, shareData: any): Promise<NFSShare> {
    return this.withConnection((connection) => connection.sendRequest(NFSUpdateRequest, id, shareData));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(NFSDeleteRequest, id));
  }
}

class SharingSmbApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<SMBShare[]> {
    return this.withConnection((connection) => connection.sendRequest(SMBQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<SMBShare> {
    return this.withConnection((connection) => connection.sendRequest(SMBGetRequest, id));
  }

  create(shareData: any): Promise<SMBShare> {
    return this.withConnection((connection) => connection.sendRequest(SMBCreateRequest, shareData));
  }

  update(id: number, shareData: any): Promise<SMBShare> {
    return this.withConnection((connection) => connection.sendRequest(SMBUpdateRequest, id, shareData));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(SMBDeleteRequest, id));
  }

  getacl(shareId: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(SMBGetAclRequest, shareId));
  }

  setacl(shareId: number, aclData: any): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(SMBSetAclRequest, shareId, aclData));
  }

  presets(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(SMBPresetsRequest));
  }
}

/**
 * App API namespace
 */
class AppApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<App[]> {
    return this.withConnection((connection) => connection.sendRequest(AppQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: string): Promise<App> {
    return this.withConnection((connection) => connection.sendRequest(AppGetRequest, id));
  }

  create(appData: any): Promise<App> {
    return this.withConnection((connection) => connection.sendRequest(AppCreateRequest, appData));
  }

  update(id: string, appData: any): Promise<App> {
    return this.withConnection((connection) => connection.sendRequest(AppUpdateRequest, id, appData));
  }

  delete(id: string): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(AppDeleteRequest, id));
  }

  start(id: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppStartRequest, id));
  }

  stop(id: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppStopRequest, id));
  }

  redeploy(id: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppRedeployRequest, id));
  }

  upgrade(id: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppUpgradeRequest, id));
  }

  rollback(id: string, version: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppRollbackRequest, id, version));
  }

  rollbackVersions(id: string): Promise<string[]> {
    return this.withConnection((connection) => connection.sendRequest(AppRollbackVersionsRequest, id));
  }

  available(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppAvailableRequest));
  }

  availableSpace(): Promise<number> {
    return this.withConnection((connection) => connection.sendRequest(AppAvailableSpaceRequest));
  }

  categories(): Promise<string[]> {
    return this.withConnection((connection) => connection.sendRequest(AppCategoriesRequest));
  }

  latest(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppLatestRequest));
  }

  similar(appName: string): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppSimilarRequest, appName));
  }

  config(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AppConfigRequest));
  }

  convertToCustom(id: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppConvertToCustomRequest, id));
  }

  certificateAuthorityChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(AppCertificateAuthorityChoicesRequest));
  }

  certificateChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(AppCertificateChoicesRequest));
  }

  containerConsoleChoices(id: string): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppContainerConsoleChoicesRequest, id));
  }

  containerIds(id: string): Promise<string[]> {
    return this.withConnection((connection) => connection.sendRequest(AppContainerIdsRequest, id));
  }

  gpuChoices(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppGpuChoicesRequest));
  }

  ipChoices(): Promise<string[]> {
    return this.withConnection((connection) => connection.sendRequest(AppIpChoicesRequest));
  }

  outdatedDockerImages(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppOutdatedDockerImagesRequest));
  }

  pullImages(force?: boolean): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppPullImagesRequest, force ? { force } : undefined));
  }

  upgradeSummary(id: string): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AppUpgradeSummaryRequest, id));
  }

  usedPorts(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppUsedPortsRequest));
  }

  get image() {
    return new AppImageApi(this.client);
  }

  get registry() {
    return new AppRegistryApi(this.client);
  }

  get ixVolume() {
    return new AppIxVolumeApi(this.client);
  }
}

class AppImageApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppImageQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: string): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AppImageGetRequest, id));
  }

  delete(id: string): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(AppImageDeleteRequest, id));
  }

  pull(imageName: string): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(AppImagePullRequest, imageName));
  }

  dockerhubRateLimit(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AppImageDockerhubRateLimitRequest));
  }
}

class AppRegistryApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppRegistryQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AppRegistryGetRequest, id));
  }

  create(data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AppRegistryCreateRequest, data));
  }

  update(id: number, data: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(AppRegistryUpdateRequest, id, data));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(AppRegistryDeleteRequest, id));
  }
}

class AppIxVolumeApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(AppIxVolumeQueryRequest, filters ?? [], options ?? {}));
  }

  exists(volumeName: string): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(AppIxVolumeExistsRequest, volumeName));
  }
}

/**
 * VM (Virtual Machine) API namespace
 */
class VmApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<VirtualMachine[]> {
    return this.withConnection((connection) => connection.sendRequest(VMQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<VirtualMachine> {
    return this.withConnection((connection) => connection.sendRequest(VMGetRequest, id));
  }

  create(vmData: any): Promise<VirtualMachine> {
    return this.withConnection((connection) => connection.sendRequest(VMCreateRequest, vmData));
  }

  update(id: number, vmData: any): Promise<VirtualMachine> {
    return this.withConnection((connection) => connection.sendRequest(VMUpdateRequest, id, vmData));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(VMDeleteRequest, id));
  }

  clone(id: number, name: string): Promise<VirtualMachine> {
    return this.withConnection((connection) => connection.sendRequest(VMCloneRequest, id, name));
  }

  start(id: number): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(VMStartRequest, id));
  }

  stop(id: number, force?: boolean): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(VMStopRequest, id, force ? { force } : undefined));
  }

  poweroff(id: number): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(VMPowerOffRequest, id));
  }

  restart(id: number): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(VMRestartRequest, id));
  }

  suspend(id: number): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(VMSuspendRequest, id));
  }

  resume(id: number): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(VMResumeRequest, id));
  }

  status(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMStatusRequest, id));
  }

  getConsole(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMGetConsoleRequest, id));
  }

  getAvailableMemory(): Promise<number> {
    return this.withConnection((connection) => connection.sendRequest(VMGetAvailableMemoryRequest));
  }

  getMemoryUsage(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMGetMemoryUsageRequest));
  }

  getDisplayDevices(id: number): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(VMGetDisplayDevicesRequest, id));
  }

  bootloaderOptions(): Promise<string[]> {
    return this.withConnection((connection) => connection.sendRequest(VMBootloaderOptionsRequest));
  }

  flags(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMFlagsRequest));
  }

  logFileDownload(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMLogFileDownloadRequest, id));
  }

  logFilePath(id: number): Promise<string> {
    return this.withConnection((connection) => connection.sendRequest(VMLogFilePathRequest, id));
  }

  portWizard(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMPortWizardRequest));
  }

  randomMac(): Promise<string> {
    return this.withConnection((connection) => connection.sendRequest(VMRandomMacRequest));
  }

  resolutionChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(VMResolutionChoicesRequest));
  }

  supportsVirtualization(): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(VMSupportsVirtualizationRequest));
  }

  virtualizationDetails(): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMVirtualizationDetailsRequest));
  }

  get device() {
    return new VmDeviceApi(this.client);
  }
}

class VmDeviceApi extends ApiNamespace {
  query(filters?: QueryFilter[], options?: QueryOptions): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest(VMDeviceQueryRequest, filters ?? [], options ?? {}));
  }

  getInstance(id: number): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMDeviceGetRequest, id));
  }

  create(deviceData: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMDeviceCreateRequest, deviceData));
  }

  update(id: number, deviceData: any): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMDeviceUpdateRequest, id, deviceData));
  }

  delete(id: number): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(VMDeviceDeleteRequest, id));
  }

  bindChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(VMDeviceBindChoicesRequest));
  }

  diskChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(VMDeviceDiskChoicesRequest));
  }

  passthroughDevice(device: string): Promise<any> {
    return this.withConnection((connection) => connection.sendRequest(VMDevicePassthroughDeviceRequest, device));
  }

  passthroughDeviceChoices(): Promise<Record<string, string>> {
    return this.withConnection((connection) => connection.sendRequest(VMDevicePassthroughDeviceChoicesRequest));
  }
}

/**
 * Disk API namespace
 */
class DiskApi extends ApiNamespace {
  temperatureAlerts(): Promise<any[]> {
    return this.withConnection((connection) => connection.sendRequest("disk.temperature_alerts"));
  }
}

class CoreApi extends ApiNamespace {
  ping(): Promise<string> {
    return this.withConnection((connection) => connection.sendRequest(CorePingRequest));
  }

  setOptions(options: any): Promise<void> {
    return this.withConnection((connection) => connection.sendRequest(CoreSetOptionsRequest, options));
  }

  subscribe(name: string): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(CoreSubscribeRequest, name));
  }

  unsubscribe(name: string): Promise<boolean> {
    return this.withConnection((connection) => connection.sendRequest(CoreUnsubscribeRequest, name));
  }

  getJobs(filters?: QueryFilter[], options?: QueryOptions): Promise<Job[]> {
    return this.withConnection((connection) => connection.sendRequest(JobQueryRequest, filters ?? [], options ?? {}));
  }
}

/**
 * TrueNAS JSON-RPC 2.0 WebSocket Client
 *
 * This client implements the TrueNAS JSON-RPC 2.0 API over WebSocket
 * as documented at https://api.truenas.com/v25.04.2/
 */
export class TrueNASClient {
  private authToken?: string;
  public connection: Promise<MessageConnection>;

  // API namespaces
  public readonly auth: AuthApi;
  public readonly system: SystemApi;
  public readonly user: UserApi;
  public readonly group: GroupApi;
  public readonly pool: PoolApi;
  public readonly sharing: SharingApi;
  public readonly core: CoreApi;
  public readonly app: AppApi;
  public readonly vm: VmApi;
  public readonly disk: DiskApi;
  private readonly socket: InstanceType<typeof import("http").WebSocket>;

  constructor(
    private host: string,
    private options: {
      port?: number;
      ssl?: boolean;
      reconnectOnClose?: boolean;
      maxReconnectAttempts?: number;
    } = {}
  ) {
    const protocol = this.options.ssl ? "wss" : "ws";
    const port = this.options.port || (this.options.ssl ? 443 : 80);
    const webSocket = (this.socket = new WebSocket(`${protocol}://${this.host}:${port}/api/current`));
    this.connection = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timed out"));
      }, 10000); // 10 seconds timeout
      listen({
        webSocket: webSocket as any,
        logger: new ConsoleLogger(),
        onConnection: (connection) => {
          clearTimeout(timeout);

          // Set up typed notification handlers
          connection.onNotification(CollectionUpdateNotification, (params) => {
            this.onCollectionUpdate?.(params);
          });

          connection.onNotification(NotifyUnsubscribedNotification, (params) => {
            this.onNotifyUnsubscribed?.(params);
          });

          connection.onNotification(JobUpdateNotification, (params) => {
            this.onJobUpdate?.(params);
          });

          connection.listen();
          resolve(connection);
        },
      });
    });

    // Initialize API namespaces
    this.auth = new AuthApi(this);
    this.system = new SystemApi(this);
    this.user = new UserApi(this);
    this.group = new GroupApi(this);
    this.pool = new PoolApi(this);
    this.sharing = new SharingApi(this);
    this.core = new CoreApi(this);
    this.app = new AppApi(this);
    this.vm = new VmApi(this);
    this.disk = new DiskApi(this);
  }

  /**
   * Disconnect from the TrueNAS WebSocket API
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
    }
  }

  /**
   * Authenticate with username and password
   * @param username - The username
   * @param password - The password
   * @param otpToken - Optional OTP token for two-factor authentication
   */
  async authenticate(username: string, password: string, otpToken?: string): Promise<boolean> {
    try {
      const response = await this.auth.login(username, password, otpToken);
      this.authToken = response;
      return true;
    } catch (error) {
      console.error("Authentication failed:", error);
      throw error;
    }
  }

  /**
   * Authenticate using the new v25.04.2 auth.login_ex method
   * Supports multiple authentication mechanisms including:
   * - PASSWORD_PLAIN: username/password authentication
   * - API_KEY_PLAIN: API key authentication
   * - AUTH_TOKEN_PLAIN: authentication token
   * - OTP_TOKEN: one-time password (for multi-step auth)
   */
  async authenticateEx(params: AuthLoginExParams): Promise<AuthLoginExResponse> {
    try {
      const response = await this.auth.loginEx(params);

      // Store auth token if authentication was successful
      if (response.response_type === "SUCCESS") {
        if (params.mechanism === "PASSWORD_PLAIN" || params.mechanism === "API_KEY_PLAIN" || params.mechanism === "AUTH_TOKEN_PLAIN") {
          // For successful primary authentication, we consider the session authenticated
          this.authToken = "authenticated"; // The actual token handling is done by the session
        }
      }

      return response;
    } catch (error) {
      console.error("Extended authentication failed:", error);
      throw error;
    }
  }

  /**
   * Subscribe to notifications for a specific collection
   */
  async subscribe(name: string): Promise<void> {
    await this.core.subscribe(name);
  }

  /**
   * Unsubscribe from notifications for a specific collection
   */
  async unsubscribe(name: string): Promise<void> {
    await this.core.unsubscribe(name);
  }

  /**
   * Get system information
   * @deprecated Use client.system.info() instead
   */
  getSystemInfo(): Promise<SystemInfo> {
    return this.system.info();
  }

  /**
   * Get system version
   * @deprecated Use client.system.version() instead
   */
  getVersion(): Promise<string> {
    return this.system.version();
  }

  /**
   * Check if authenticated
   */
  get isAuthenticated(): boolean {
    return !!this.authToken;
  }

  /**
   * Check connection status
   */
  get connected(): boolean {
    return this.connection !== undefined && this.socket.readyState === WebSocket.OPEN;
  }

  // Convenience methods for v25.04.2 auth.login_ex

  /**
   * Convenience method for password authentication using auth.login_ex
   * @deprecated Use client.auth.loginEx() directly
   */
  authenticateWithPasswordEx(username: string, password: string, includeUserInfo = false): Promise<AuthLoginExResponse> {
    return this.auth.loginEx({
      mechanism: "PASSWORD_PLAIN",
      username,
      password,
      login_options: { user_info: includeUserInfo },
    });
  }

  /**
   * Convenience method for API key authentication using auth.login_ex
   * @deprecated Use client.auth.loginEx() directly
   */
  authenticateWithApiKeyEx(username: string, apiKey: string, includeUserInfo = false): Promise<AuthLoginExResponse> {
    return this.auth.loginEx({
      mechanism: "API_KEY_PLAIN",
      username,
      api_key: apiKey,
      login_options: { user_info: includeUserInfo },
    });
  }

  /**
   * Convenience method for token authentication using auth.login_ex
   * @deprecated Use client.auth.loginEx() directly
   */
  authenticateWithTokenEx(token: string, includeUserInfo = false): Promise<AuthLoginExResponse> {
    return this.auth.loginEx({
      mechanism: "AUTH_TOKEN_PLAIN",
      token,
      login_options: { user_info: includeUserInfo },
    });
  }

  /**
   * Submit OTP token for multi-step authentication
   * @deprecated Use client.auth.loginEx() directly
   */
  submitOtpToken(otpToken: string, includeUserInfo = false): Promise<AuthLoginExResponse> {
    return this.auth.loginEx({
      mechanism: "OTP_TOKEN",
      otp_token: otpToken,
      login_options: { user_info: includeUserInfo },
    });
  }

  // Event handlers that can be overridden
  onCollectionUpdate?: (params: {
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
  }) => void;

  onNotifyUnsubscribed?: (params: { collection: string; error: any }) => void;

  onJobUpdate?: (params: Job) => void;

  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: any) => void;
}

export default TrueNASClient;
