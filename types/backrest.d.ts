export interface BackrestRepository {
  id: string;
  uri: string;
  guid?: string;
  password?: string;
  env?: string[];
  flags?: string[];
  prunePolicy?: PrunePolicy;
  checkPolicy?: CheckPolicy;
  hooks?: Hook[];
  autoUnlock?: boolean;
  autoInitialize?: boolean;
  commandPrefix?: CommandPrefix;
}

export interface CheckPolicy {
  schedule: Schedule;
  structureOnly?: boolean;
  readDataSubsetPercent?: number;
}

export interface Schedule {
  // oneof schedule
  disabled?: boolean;
  cron?: string;
  maxFrequencyDays?: number;
  maxFrequencyHours?: number;

  // clock enum
  clock?: "CLOCK_DEFAULT" | "CLOCK_LOCAL" | "CLOCK_UTC" | "CLOCK_LAST_RUN_TIME";
}

export interface CommandPrefix {
  ioNice?: IONiceLevel | string;
  cpuNice?: CPUNiceLevel | string;
}

export interface PrunePolicy {
  schedule?: Schedule;
  maxUnusedBytes?: number;
  maxUnusedPercent?: number;
}
export interface BackrestPlan {
  id: string;
  repo: string;
  paths?: string[];
  excludes?: string[];
  iexcludes?: string[];
  schedule?: Schedule | string; // allow cron as string for convenience
  retention?: Retention;
  hooks?: Hook[];
  backupFlags?: string[];
  skipIfUnchanged?: boolean;
}

export interface Retention {
  policyKeepLastN?: number;
  policyTimeBucketed?: PolicyTimeBucketed;
  policyKeepAll?: boolean;
}

export interface PolicyTimeBucketed {
  hourly?: number;
  daily?: number;
  weekly?: number;
  monthly?: number;
  yearly?: number;
  keepLastN?: number;
}

// removed duplicate Schedule - defined above

export type IONiceLevel = "IO_DEFAULT" | "IO_BEST_EFFORT_LOW" | "IO_BEST_EFFORT_HIGH" | "IO_IDLE";
export type CPUNiceLevel = "CPU_DEFAULT" | "CPU_HIGH" | "CPU_LOW";

export interface BackrestConfig {
  modno?: number;
  version?: number;
  instance?: string;
  repos?: BackrestRepository[];
  plans?: BackrestPlan[];
  auth?: Auth;
  multihost?: Multihost;
}

export interface PrivateKey {
  keyId?: string;
  ed25519priv?: string;
  ed25519pub?: string;
}

export interface Multihost {
  identity?: PrivateKey;
  knownHosts?: MultihostPeer[];
  authorizedClients?: MultihostPeer[];
}

export interface MultihostPeer {
  instanceId?: string;
  keyId?: string;
  keyIdVerified?: boolean;
  permissions?: Permission[];
  instanceUrl?: string;
}

export interface Permission {
  type?: "PERMISSION_UNKNOWN" | "PERMISSION_READ_OPERATIONS" | "PERMISSION_READ_CONFIG" | "PERMISSION_READ_WRITE_CONFIG";
  scopes?: string[];
}

export interface Hook {
  conditions?: HookCondition[];
  onError?: HookOnError | string;
  actionCommand?: HookCommand;
  actionWebhook?: HookWebhook;
  actionDiscord?: HookDiscord;
  actionGotify?: HookGotify;
  actionSlack?: HookSlack;
  actionShoutrrr?: HookShoutrrr;
  actionHealthchecks?: HookHealthchecks;
  actionTelegram?: HookTelegram;
}

export type HookCondition =
  | "CONDITION_UNKNOWN"
  | "CONDITION_ANY_ERROR"
  | "CONDITION_SNAPSHOT_START"
  | "CONDITION_SNAPSHOT_END"
  | "CONDITION_SNAPSHOT_ERROR"
  | "CONDITION_SNAPSHOT_WARNING"
  | "CONDITION_SNAPSHOT_SUCCESS"
  | "CONDITION_SNAPSHOT_SKIPPED"
  | "CONDITION_PRUNE_START"
  | "CONDITION_PRUNE_ERROR"
  | "CONDITION_PRUNE_SUCCESS"
  | "CONDITION_CHECK_START"
  | "CONDITION_CHECK_ERROR"
  | "CONDITION_CHECK_SUCCESS"
  | "CONDITION_FORGET_START"
  | "CONDITION_FORGET_ERROR"
  | "CONDITION_FORGET_SUCCESS";

export type HookOnError = "ON_ERROR_IGNORE" | "ON_ERROR_CANCEL" | "ON_ERROR_FATAL" | "ON_ERROR_RETRY_1MINUTE" | "ON_ERROR_RETRY_10MINUTES" | "ON_ERROR_RETRY_EXPONENTIAL_BACKOFF";

export interface HookCommand {
  command?: string;
}

export interface HookWebhook {
  webhookUrl?: string;
  method?: "UNKNOWN" | "GET" | "POST";
  template?: string;
}

export interface HookDiscord {
  webhookUrl?: string;
  template?: string;
}

export interface HookGotify {
  baseUrl?: string;
  token?: string;
  template?: string;
  titleTemplate?: string;
  priority?: number;
}

export interface HookSlack {
  webhookUrl?: string;
  template?: string;
}

export interface HookShoutrrr {
  shoutrrrUrl?: string;
  template?: string;
}

export interface HookHealthchecks {
  webhookUrl?: string;
  template?: string;
}

export interface HookTelegram {
  botToken?: string;
  chatId?: string;
  template?: string;
}

export interface Auth {
  disabled?: boolean;
  users?: User[];
}

export interface User {
  name?: string;
  passwordBcrypt?: string;
}
