import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, log, Output, output, Unwrap, UnwrappedArray, UnwrappedObject } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { addUptimeGatus, BackupTask, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { kebabCase } from "moderndash";
import { DockgeLxc } from "../../components/DockgeLxc.ts";
import { ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { NodeSSH } from "node-ssh";
import { BackrestConfig, BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { CopyToRemote } from "@pulumi/command/remote/index.js";

export interface PbsDetails {
  backupServerConnection: types.input.remote.ConnectionArgs;
  dockgeConnection: types.input.remote.ConnectionArgs;
  publicKey: string;
  privateKey: string;
  privateKeyId: string;
  cluster: ClusterDefinition;
  tags: string[];
  title: string;
  /** SSH port on the dockge HOST used by destinations for rclone SFTP pull. Defaults to 2022. */
  sshPort?: number;
}

export interface PreSyncArgs {
  /** SFTP hostname of the host whose data should be staged before the backup */
  sftpHost: string;
  /** Absolute path on the remote host to sync from (e.g. "/opt/stacks-data/") */
  sourcePath: string;
  /** SFTP port — defaults to 2022 (rclone-sftp entrypoint) */
  sftpPort?: number;
}

export class BackupPlanManager extends ComponentResource {
  plans: Map<string, BackrestPlan> = new Map();
  repos: Map<string, BackrestRepository> = new Map();
  globals: GlobalResources;
  ssh?: NodeSSH;
  volsyncPassword?: string;
  source: Output<PbsDetails>;
  destinations: Output<PbsDetails[]>;
  jobs: Output<{ task: Omit<BackupTask, "token">; detail: PbsDetails }[]> = output([]);
  private depends: Output<CopyToRemote[]> = output([]);
  private uptimeUrl: Output<string>;

  constructor(
    name: string,
    args: {
      source: Input<PbsDetails>;
      destinations: Input<PbsDetails[]>;
      globals: GlobalResources;
    },
    opts?: ComponentResourceOptions,
  ) {
    super("home:backups:BackupPlanManager", name, {}, opts);
    this.globals = args.globals;
    this.source = output(args.source);
    this.destinations = output(args.destinations);
    this.uptimeUrl = output(args.globals.searchDomain).apply((domain) => `http://uptime.${domain}:9595`);
  }

  public createBackrestPlan(
    name: string,
    args: {
      title: Input<string>;
      planConfig?: Input<Omit<BackrestPlan, "id" | "repo" | "paths">>;
      repositoryConfig?: Input<Omit<BackrestRepository, "guid" | "uri" | "id" | "password" | "autoUnlock" | "autoInitialize">>;
      path: Input<string>;
      repository?: Input<string>;
      /** Stage data via rclone SFTP before restic snapshots the path */
      preSync?: PreSyncArgs;
    },
  ) {
    return all([this.source, this.destinations, output(this.getVolsyncPassword()), output(args), this.uptimeUrl]).apply(
      ([source, destinations, password, { planConfig, repositoryConfig, path, repository = name, title, preSync }, uptimeUrl]) => {
        const sourceGroup = `Backups: ${source.cluster.title}`;
        const sourceToken = toGatusKey(sourceGroup, name);

        const hooks: BackrestPlan["hooks"] = [];

        // Pre-sync hook: pull staging data via rclone SFTP before restic snapshots it.
        // Runs inside the backrest container, so `path` is the container-local destination.
        // `preSync.sourcePath` is the absolute path on the SFTP host's filesystem.
        if (preSync) {
          hooks.push({
            conditions: ["CONDITION_SNAPSHOT_START"],
            actionCommand: {
              command: [
                "rclone sync",
                `:sftp:${preSync.sourcePath}`,
                path,
                `--sftp-host=${preSync.sftpHost}`,
                `--sftp-port=${preSync.sftpPort ?? 2022}`,
                "--sftp-user=nobody",
                "--sftp-key-file=/opt/stacks-data/backrest/ssh/id_ed25519",
                "--sftp-known-hosts-file=/opt/stacks-data/backrest/ssh/known_hosts",
              ].join(" "),
            },
            onError: "ON_ERROR_FATAL",
          });
        }

        // Uptime heartbeat hooks — report plan outcome to Gatus external endpoint
        hooks.push({
          conditions: ["CONDITION_SNAPSHOT_SUCCESS"],
          actionCommand: {
            command: `curl -sf -X POST -H "Authorization: Bearer ${sourceToken}" "${uptimeUrl}/api/v1/endpoints/${sourceToken}/external?success=true" || true`,
          },
          onError: "ON_ERROR_IGNORE",
        });
        hooks.push({
          conditions: ["CONDITION_SNAPSHOT_ERROR"],
          actionCommand: {
            command: `curl -sf -X POST -H "Authorization: Bearer ${sourceToken}" "${uptimeUrl}/api/v1/endpoints/${sourceToken}/external?success=false" || true`,
          },
          onError: "ON_ERROR_IGNORE",
        });

        this.repos.set(name, {
          prunePolicy: {
            schedule: {
              maxFrequencyDays: 30,
              clock: "CLOCK_LAST_RUN_TIME",
            },
            maxUnusedPercent: 10,
          },
          checkPolicy: {
            schedule: {
              maxFrequencyDays: 7,
              clock: "CLOCK_LAST_RUN_TIME",
            },
            readDataSubsetPercent: 10,
          },
          commandPrefix: {
            ioNice: "IO_BEST_EFFORT_LOW",
            cpuNice: "CPU_LOW",
          },
          ...repositoryConfig,
          id: name,
          uri: `/data/backup/${repository}/`,
          password,
          autoUnlock: true,
        });

        this.plans.set(name, {
          retention: {
            policyTimeBucketed: {
              daily: 7,
              weekly: 4,
              monthly: 3,
              keepLastN: 10,
            },
          },
          skipIfUnchanged: true,
          schedule: {
            clock: "CLOCK_LAST_RUN_TIME",
            maxFrequencyDays: 1,
          },
          ...planConfig,
          id: name,
          repo: name,
          paths: [path],
          hooks,
        });
      },
    );
  }

  public createBackupJob(details: Input<PbsDetails | PbsDetails[]>, args: Omit<BackupTask, "token">) {
    const d = output(details).apply((z) => (Array.isArray(z) ? z : [z]));
    this.jobs = all([d, this.jobs, args]).apply(([details, jobs, task]) => jobs.concat(...details.map((detail) => ({ detail, task: { ...task, name: `${task.name} to ${detail.cluster.title}` } }))));
    const result = all([args, d])
      .apply(([job, details]) => {
        return details.map(({ cluster, dockgeConnection: connection }) => {
          const groupName = `Jobs: ${cluster.title}`;
          const token = toGatusKey(groupName, job.name);

          return copyFileToRemote(`backup-job-${token}`, {
            content: jsonStringify({ ...job, token }, undefined, 2),
            parent: this,
            connection: connection,
            remotePath: interpolate`/opt/stacks-data/backups/jobs/${token}.json`,
            withRemoveCommand: true,
          });
        });
      })
      .apply((z) => all(z).apply((x) => x));

    this.depends = all([this.depends, result]).apply(([d, r]) => [...d, ...r]);

    return result;
  }

  private async getVolsyncPassword(): Promise<string> {
    if (this.volsyncPassword) {
      return this.volsyncPassword;
    }

    const opClient = new OPClient();
    const volsyncItem = await opClient.getItemByTitle("Volsync Password");
    if (!volsyncItem) {
      throw new Error("Volsync password item not found in 1Password");
    }
    return (this.volsyncPassword = volsyncItem.fields.credential.value!);
  }

  private createUptime(source: UnwrappedObject<PbsDetails>, destinations: UnwrappedArray<PbsDetails>) {
    const makeEndpoint = (groupName: string, planId: string): ExternalEndpoint =>
      ({
        enabled: true,
        name: planId,
        token: toGatusKey(groupName, planId),
        group: groupName,
        heartbeat: { interval: "25h" },
        alerts: [
          {
            type: "pushover",
            enabled: true,
            "success-threshold": 1,
            "failure-threshold": 1,
            "minimum-reminder-interval": "24h",
          },
        ],
      }) as ExternalEndpoint;

    // Source: one external endpoint per plan
    const sourceGroup = `Backups: ${source.cluster.title}`;
    addUptimeGatus(
      `backups-${source.cluster.key}`,
      this.globals,
      { endpoints: [], "external-endpoints": [...this.plans.keys()].map((id) => makeEndpoint(sourceGroup, id)) },
      this,
    );

    // Destinations: one replication endpoint per plan
    for (const dest of destinations) {
      const destGroup = `Replicate: ${dest.cluster.title}`;
      addUptimeGatus(
        `backups-${dest.cluster.key}`,
        this.globals,
        { endpoints: [], "external-endpoints": [...this.plans.keys()].map((id) => makeEndpoint(destGroup, id)) },
        this,
      );
    }
  }

  /**
   * Build pull plans for a destination: one plan per source plan.
   *
   * Each pull plan:
   *  - Uses CONDITION_SNAPSHOT_START to rclone-sync the source's restic repo via SFTP
   *    into the matching local repo path on the destination.
   *  - Snapshots a tiny health-marker file so backrest has something to track.
   *  - Reports success/failure to Gatus.
   *
   * Path translation for rclone:
   *   rclone-sftp serves /data/ as its root, so the SFTP-visible backup path strips /data:
   *     source repo URI   = /data/backup/<repoId>/  (container/host path on source)
   *     SFTP-visible path = /backup/<repoId>/        (as seen through rclone-sftp)
   *     destination path  = /data/backup/<repoId>/   (container path on destination, same as URI)
   */
  private buildPullPlans(source: UnwrappedObject<PbsDetails>, destination: UnwrappedObject<PbsDetails>, uptimeUrl: string): Map<string, BackrestPlan> {
    const pullPlans = new Map<string, BackrestPlan>();
    const destGroup = `Replicate: ${destination.cluster.title}`;
    const sourceHost = source.dockgeConnection.host as string;
    const sshPort = source.sshPort ?? 2022;

    for (const [planId, plan] of this.plans.entries()) {
      const repo = this.repos.get(plan.repo ?? planId);
      // Derive sync path from the repo URI so that if `repository` overrides `name`,
      // both the SFTP source path and the local destination path stay consistent.
      const repoPath = repo?.uri ?? `/data/backup/${planId}/`;
      // rclone-sftp serves /data/ as root; strip leading /data to get SFTP-visible path.
      const sftpPath = repoPath.startsWith("/data/") ? repoPath.slice("/data".length) : repoPath;
      const destToken = toGatusKey(destGroup, planId);

      const rcloneCmd = [
        `rclone sync :sftp:${sftpPath} ${repoPath}`,
        `--sftp-host=${sourceHost}`,
        `--sftp-port=${sshPort}`,
        "--sftp-user=nobody",
        "--sftp-key-file=/opt/stacks-data/backrest/ssh/id_ed25519",
        "--sftp-known-hosts-file=/opt/stacks-data/backrest/ssh/known_hosts",
      ].join(" ");

      pullPlans.set(planId, {
        id: planId,
        repo: planId,
        paths: ["/data/backup/.pull-health/"],
        schedule: { cron: "0 4 * * *", clock: "CLOCK_LOCAL" },
        // policyKeepLastN is safe here: backrest filters forget by --path, so source
        // snapshots (different paths) are not pruned by this plan's retention.
        retention: { policyKeepLastN: 3 },
        hooks: [
          {
            conditions: ["CONDITION_SNAPSHOT_START"],
            actionCommand: {
              command: `${rcloneCmd} && mkdir -p /data/backup/.pull-health && date -Iseconds > /data/backup/.pull-health/${planId}`,
            },
            onError: "ON_ERROR_FATAL",
          },
          {
            conditions: ["CONDITION_SNAPSHOT_SUCCESS"],
            actionCommand: {
              command: `curl -sf -X POST -H "Authorization: Bearer ${destToken}" "${uptimeUrl}/api/v1/endpoints/${destToken}/external?success=true" || true`,
            },
            onError: "ON_ERROR_IGNORE",
          },
          {
            conditions: ["CONDITION_SNAPSHOT_ERROR"],
            actionCommand: {
              command: `curl -sf -X POST -H "Authorization: Bearer ${destToken}" "${uptimeUrl}/api/v1/endpoints/${destToken}/external?success=false" || true`,
            },
            onError: "ON_ERROR_IGNORE",
          },
        ],
      });
    }

    return pullPlans;
  }

  public finalize() {
    all([this.source, this.destinations, this.uptimeUrl]).apply(async ([source, destinations, uptimeUrl]) => {
      // Source: provision repo dirs, write repos + plans
      await updateBackrestConfiguration(source, destinations, async (ssh, updatedConfig) => {
        await provisionRepoDirs(ssh, this.repos);
        updateRepos(updatedConfig, this.repos);
        updatePlans(updatedConfig, this.plans);
      });

      // Destinations: provision repo dirs, write repos + pull plans
      for (const destination of destinations) {
        const pullPlans = this.buildPullPlans(source, destination, uptimeUrl);

        await updateBackrestConfiguration(destination, [source, ...destinations.filter((d) => d !== destination)], async (ssh, updatedConfig) => {
          await provisionRepoDirs(ssh, this.repos);
          // Provision the pull-health marker dir
          const healthResult = await ssh.execCommand(`mkdir -p "/data/backup/.pull-health" && chown 65534:65534 "/data/backup/.pull-health"`);
          if (healthResult.code !== 0) {
            log.warn(`Failed to provision pull-health dir: ${healthResult.stderr}`);
          }
          updateRepos(updatedConfig, this.repos);
          updatePlans(updatedConfig, pullPlans);
        });
      }

      this.createUptime(source, destinations);
    });
  }
}

async function updateBackrestConfiguration(
  details: UnwrappedObject<PbsDetails>,
  peers: UnwrappedArray<PbsDetails>,
  func: (ssh: NodeSSH, updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }) => Promise<void>,
) {
  const connection = details.dockgeConnection;
  const ssh = new NodeSSH();
  await ssh.connect({
    host: connection.host,
    username: connection.user,
  });

  const currentConfig = (await ssh.execCommand("cat /opt/stacks-data/backrest/config/config.json")).stdout;
  let updatedConfig: BackrestConfig = { repos: [], plans: [], version: 2, modno: 1, instance: `${details.cluster.title}`, auth: { disabled: true }, multihost: {} };
  try {
    updatedConfig = JSON.parse(currentConfig) as BackrestConfig;
  } catch (e) {
    log.warn(`Could not read existing backrest config, starting with empty config: ${e}`);
    log.warn(`Current config content: ${currentConfig}`);
  }

  if (!updatedConfig.version) {
    updatedConfig.version = 6;
  }
  if (!updatedConfig.modno) {
    updatedConfig.modno = 1;
  }
  if (!updatedConfig.instance) {
    updatedConfig.instance = details.cluster.key;
  }
  if (!updatedConfig.auth) {
    updatedConfig.auth = { disabled: true };
  }

  delete updatedConfig.multihost;
  delete updatedConfig.sync;

  // updatedConfig.multihost = {
  // identity: {
  //   keyId: details.privateKeyId,
  //   ed25519priv: details.privateKey,
  //   ed25519pub: details.publicKey,
  // },
  // authorizedClients: peers.map((peer) => ({
  //   instanceId: peer.cluster.key,
  //   keyId: peer.privateKeyId,
  //   keyIdVerified: true,
  //   ed25519pub: peer.publicKey,
  //   instanceUrl: `https://${peer.backupServerConnection.host}`,
  //   permissions: [
  //     {
  //       type: "PERMISSION_READ_CONFIG",
  //       scopes: ["*"],
  //     },
  //     {
  //       type: "PERMISSION_READ_OPERATIONS",
  //       scopes: ["*"],
  //     },
  //   ],
  // })),
  // knownHosts: peers.map((peer) => ({
  //   instanceId: peer.cluster.key,
  //   keyId: peer.privateKeyId,
  //   keyIdVerified: true,
  //   ed25519pub: peer.publicKey,
  //   instanceUrl: `https://${peer.backupServerConnection.host}`,
  //   permissions: [
  //     {
  //       type: "PERMISSION_READ_CONFIG",
  //       scopes: ["*"],
  //     },
  //     {
  //       type: "PERMISSION_READ_OPERATIONS",
  //       scopes: ["*"],
  //     },
  //   ],
  // })),
  // };

  updatedConfig.repos = updatedConfig.repos || [];
  updatedConfig.plans = updatedConfig.plans || [];

  await func(ssh, updatedConfig);

  const newConfig = JSON.stringify(updatedConfig);
  if (currentConfig.trim() === newConfig.trim()) {
    ssh.dispose();
    return;
  }

  const writeResult = await ssh.execCommand(`echo ${Buffer.from(newConfig).toString("base64")} | base64 -d > /opt/stacks-data/backrest/config/config.json`);
  if (writeResult.code !== 0) {
    ssh.dispose();
    throw new Error(`Failed to write backrest config: ${writeResult.stderr}`);
  }
  const restartResult = await ssh.execCommand(`docker compose -f compose.yaml up -d && docker compose -f compose.yaml start`, { cwd: `/opt/stacks/backrest/` });
  if (restartResult.code !== 0) {
    log.warn(`backrest restart returned non-zero: ${restartResult.stderr}`);
  }

  ssh.dispose();
}
function updateRepos(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, repos: Map<string, BackrestRepository>) {
  for (const repo of repos.values()) {
    const jobIndex = updatedConfig.repos.findIndex((r) => r.id === repo.id);
    if (jobIndex >= 0) {
      // Never change autoInitialize on existing repos — backrest will fail to start if it tries
      // to re-initialize an already-initialized restic repository.
      updatedConfig.repos[jobIndex] = {
        ...updatedConfig.repos[jobIndex],
        uri: repo.uri,
        password: repo.password,
        env: repo.env,
        flags: repo.flags,
        prunePolicy: repo.prunePolicy,
        checkPolicy: repo.checkPolicy,
        hooks: repo.hooks,
        commandPrefix: repo.commandPrefix,
        autoUnlock: repo.autoUnlock,
      };
    } else {
      // New repo: always initialize so backrest can manage it
      updatedConfig.repos.push({
        ...repo,
        autoInitialize: true,
      });
    }
  }
}
function updatePlans(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, plans: Map<string, BackrestPlan>) {
  for (const plan of plans.values()) {
    const jobIndex = updatedConfig.plans.findIndex((r) => r.id === plan.id);
    if (jobIndex >= 0) {
      updatedConfig.plans[jobIndex] = {
        ...updatedConfig.plans[jobIndex],
        paths: plan.paths,
        excludes: plan.excludes,
        iexcludes: plan.iexcludes,
        schedule: plan.schedule,
        retention: plan.retention,
        hooks: plan.hooks,
        backupFlags: plan.backupFlags,
        skipIfUnchanged: plan.skipIfUnchanged,
        repo: plan.repo,
      };
    } else {
      updatedConfig.plans.push(plan);
    }
  }
}

/**
 * Provision local-path restic repo directories on the host.
 *
 * Repo URIs now use /data/backup/<planId>/ which is the same on both
 * host and container (mount: /data/backup:/data/backup), so no path
 * translation is required.
 */
async function provisionRepoDirs(ssh: NodeSSH, repos: Map<string, BackrestRepository>) {
  for (const repo of repos.values()) {
    if (!repo.uri?.startsWith("/data/backup/")) continue;
    // Use numeric UID/GID 65534 (nobody:nogroup) — avoids name resolution issues in LXC namespaces
    const result = await ssh.execCommand(`mkdir -p "${repo.uri}" && chown 65534:65534 "${repo.uri}"`);
    if (result.code !== 0) {
      log.warn(`provisionRepoDirs: failed for ${repo.uri}: ${result.stderr}`);
    }
  }
}
