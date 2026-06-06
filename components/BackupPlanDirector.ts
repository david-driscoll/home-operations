import { GlobalResources } from "./globals.ts";
import { OPClient } from "./op.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonParse, jsonStringify, log, Output, output, Resource, Unwrap, UnwrappedArray, UnwrappedObject } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import * as pbs from "@pulumi/pbs";
import { addUptimeGatus, BackupTask, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { NodeSSH } from "node-ssh";
import { BackrestConfig, BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { CopyToRemote } from "@pulumi/command/remote/index.js";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { BackupPlanItem } from "./BackupPlanOrchestrator.ts";
import { ProxmoxBackupServerLxc } from "./ProxmoxBackupServerLxc.ts";
import { ClusterDefinition, ProxmoxBackupServerLxcDefinition } from "./store/interfaces.ts";

interface Connection {
  connection: types.input.remote.ConnectionArgs;
  cluster: ClusterDefinition;
}

export class BackupPlanDirector extends ComponentResource {
  private readonly plans: Output<BackupPlanItem[]>;
  private readonly globals: GlobalResources;
  private readonly ssh?: NodeSSH;
  private readonly jobs: Output<{ task: Omit<BackupTask, "token">; detail: Connection }[]> = output([]);
  private readonly uptimeUrl: Output<string>;
  private readonly volsyncPassword: Output<string>;

  constructor(
    name: string,
    args: {
      globals: GlobalResources;
    },
    opts?: ComponentResourceOptions,
  ) {
    super("home:backups:BackupPlanDirector", name, {}, opts);
    this.globals = args.globals;
    this.uptimeUrl = output(args.globals.searchDomain).apply((domain) => `http://uptime.${domain}:9595`);
    this.plans = output(args.globals.store.getBackupPlans<BackupPlanItem>());
    this.volsyncPassword = this.globals.store.getSecretByTitle<{ credential: string }>("Volsync Password").apply((z) => z.credential);
  }

  public createSource(
    source: Input<{
      connection: types.input.remote.ConnectionArgs;
      pbs: ProxmoxBackupServerLxc;
      cluster: Input<ClusterDefinition>;
    }>,
    depends: Input<Resource[]>,
  ) {
    return all([source, this.globals.store.proxmoxBackupServers("backup-destination"), this.plans, this.uptimeUrl, this.volsyncPassword]).apply((values) => this._createSource(...values, depends));
  }

  public createDestination(
    destination: Input<{
      connection: types.input.remote.ConnectionArgs;
      pbs: ProxmoxBackupServerLxc;
      cluster: Input<ClusterDefinition>;
    }>,
    depends: Input<Resource[]>,
  ) {
    return all([destination, this.plans, this.uptimeUrl, this.volsyncPassword]).apply((values) => this._createDestination(...values, depends));
  }

  private _createSource(
    source: UnwrappedObject<{ connection: types.input.remote.ConnectionArgs; pbs: ProxmoxBackupServerLxc; cluster: Input<ClusterDefinition> }>,
    destinations: UnwrappedArray<UnwrappedObject<ProxmoxBackupServerLxcDefinition>>,
    plans: UnwrappedArray<BackupPlanItem>,
    uptimeUrl: string,
    password: string,
    depends: Input<Resource[]>,
  ) {
    const groupTitle = `Backups: ${source.cluster.title}`;
    // tomorow:
    // we want to update the pbs root password to be a random passsword
    // update the 1password item to have the proper urls, so it shows up automagically.
    // add the password the item
    // pull that password in here
    const remotes = this._createRemotes(source.cluster, source.pbs);

    for (const destination of destinations) {
      // const syncJob = new pbs.SyncJob("", {
      //   remote: ,
      //   remoteStore: ,
      //   syncJobId: ,
      //   comment: ,
      //   store: ,
      //   syncDirection: ,
      //   rateIn: ,
      //   rateOut: ,
      //   schedule: ,
      //   burstIn: ,
      //   burstOut: ,
      // });
    }
    const backrestItems = plans
      .map((plan) => this._createSourceBackrestPlan(groupTitle, source, plan, uptimeUrl, password))
      .reduce(
        (acc, { plan, repo }) => {
          acc.plans.push(plan);
          acc.repos.push(repo);
          return acc;
        },
        { plans: [] as BackrestPlan[], repos: [] as BackrestRepository[] },
      );
    const uptime = this.createUptime(groupTitle, source, plans);
    return output(
      this.updateBackrestConfiguration(
        source,
        all([depends, uptime]).apply(([d, u]) => [...d, u]),
        backrestItems,
      ),
    ).apply(() => output({ plans, items: backrestItems, uptime }));
  }

  private _createDestination(
    destination: UnwrappedObject<{ connection: types.input.remote.ConnectionArgs; pbs: ProxmoxBackupServerLxc; cluster: Input<ClusterDefinition> }>,
    plans: UnwrappedArray<BackupPlanItem>,
    uptimeUrl: string,
    password: string,
    depends: Input<Resource[]>,
  ) {
    const groupTitle = `Replicate: ${destination.cluster.title}`;
    const remotes = this._createRemotes(destination.cluster, destination.pbs);
    const backrestItems = plans
      .map((plan) => this._createDestinationBackrestPlan(groupTitle, destination, plan, uptimeUrl, password))
      .reduce(
        (acc, { plan, repo }) => {
          acc.plans.push(plan);
          acc.repos.push(repo);
          return acc;
        },
        { plans: [] as BackrestPlan[], repos: [] as BackrestRepository[] },
      );
    const destinationPlans = backrestItems.plans.map((plan) => {
      return new remote.Command(
        `${plan.id}-backrest-config`,
        {
          connection: destination.connection,
          create: interpolate`mkdir -p "/data/backup/.pull-health/${plan.id}" && chown 65534:65534 "/data/backup/.pull-health/${plan.id}"`,
        },
        {
          parent: this,
          dependsOn: depends,
        },
      );
    });
    const uptime = this.createUptime(groupTitle, destination, plans);
    return output(
      this.updateBackrestConfiguration(
        destination,
        all([depends, uptime]).apply(([d, u]) => [...d, ...destinationPlans, u]),
        backrestItems,
      ),
    ).apply(() => output({ plans, items: backrestItems, uptime }));
  }

  private _createRemotes(cluster: Input<ClusterDefinition>, lxc: ProxmoxBackupServerLxc) {
    all([cluster, lxc.hostname, this.globals.store.proxmoxBackupServers()])
      .apply(([cluster, hostname, destinations]) => [cluster, destinations.filter((d) => d.hostname !== hostname)] as const)
      .apply(([cluster, destinations]) =>
        destinations.map((destination) => {
          const remote = new pbs.Remote(
            `backrest-remote-${cluster.key}`,
            {
              host: destination.hostname,
              name: `backrest-remote-${cluster.key}`,
              authId: destination.username,
              password: destination.password,
              comment: `Remote for Backrest backups to ${destination.hostname}`,
            },
            { parent: this, dependsOn: [lxc], provider: lxc.provider },
          );
        }),
      );
  }

  private _createSourceBackrestPlan(groupTitle: string, detail: Connection, plan: BackupPlanItem, uptimeUrl: string, password: string) {
    const sourceGroup = `Backups: ${detail.cluster.title}`;
    const sourceToken = toGatusKey(sourceGroup, plan.name);

    const hooks: BackrestPlan["hooks"] = [];

    // Pre-sync hook: pull staging data via rclone SFTP before restic snapshots it.
    // Runs inside the backrest container, so `path` is the container-local destination.
    // `preSync.sourcePath` is the absolute path on the SFTP host's filesystem.
    if (plan.preSync) {
      hooks.push({
        conditions: ["CONDITION_SNAPSHOT_START"],
        actionCommand: {
          command: [
            "rclone sync",
            `:sftp:${plan.preSync.sourcePath}`,
            plan.path,
            `--sftp-host=${plan.preSync.sftpHost}`,
            `--sftp-port=${plan.preSync.sftpPort ?? 2022}`,
            "--sftp-user=nobody",
            "--sftp-key-file=/opt/stacks-data/backrest/ssh/id_ed25519",
            "--sftp-known-hosts-file=/opt/stacks-data/backrest/ssh/known_hosts",
            "--sftp-shell-type=none",
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

    const backrestRepo: BackrestRepository = {
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
      ...plan.repositoryConfig,
      id: plan.name,
      uri: `/data/backup/${plan.name}/`,
      password,
      autoUnlock: true,
    };

    const backrestPlan: BackrestPlan = {
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
      ...plan.planConfig,
      id: plan.name,
      repo: plan.name,
      paths: [plan.path],
      hooks,
    };

    return { plan: backrestPlan, repo: backrestRepo };
  }

  private _createDestinationBackrestPlan(groupTitle: string, detail: UnwrappedObject<Connection>, plan: BackupPlanItem, uptimeUrl: string, password: string) {
    const pullPlans = new Map<string, BackrestPlan>();

    // Derive sync path from the repo URI so that if `repository` overrides `name`,
    // both the SFTP source path and the local destination path stay consistent.
    const repoPath = `/data/backup/${plan.name}/`;
    // rclone-sftp serves /data/ as root; strip leading /data to get SFTP-visible path.
    const sftpPath = repoPath.startsWith("/data/") ? repoPath.slice("/data".length) : repoPath;
    const destToken = toGatusKey(groupTitle, plan.name);

    const rcloneCmd = [
      `rclone sync :sftp:${sftpPath} /data/backup/${plan.name}/`,
      `--sftp-host=${detail.connection.host}`,
      `--sftp-port=2022`,
      "--sftp-user=nobody",
      "--sftp-key-file=/opt/stacks-data/backrest/ssh/id_ed25519",
      "--sftp-known-hosts-file=/opt/stacks-data/backrest/ssh/known_hosts",
      "--sftp-shell-type=none",
    ].join(" ");

    const backrestRepo: BackrestRepository = {
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
      ...plan.repositoryConfig,
      id: plan.name,
      uri: `/data/backup/${plan.name}/`,
      password,
      autoUnlock: true,
    };

    const backrestPlan: BackrestPlan = {
      id: plan.name,
      repo: plan.name,
      paths: ["/data/backup/.pull-health/"],
      schedule: { cron: "0 4 * * *", clock: "CLOCK_LOCAL" },
      // policyKeepLastN is safe here: backrest filters forget by --path, so source
      // snapshots (different paths) are not pruned by this plan's retention.
      retention: { policyKeepLastN: 3 },
      hooks: [
        {
          conditions: ["CONDITION_SNAPSHOT_START"],
          actionCommand: {
            command: `${rcloneCmd} && date -Iseconds > /data/backup/.pull-health/${plan.name}/sync_finished`,
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
    };

    return { plan: backrestPlan, repo: backrestRepo };
  }

  private createUptime(groupTitle: string, detail: UnwrappedObject<Connection>, plans: BackupPlanItem[]) {
    function makeEndpoint(groupName: string, planId: string): ExternalEndpoint {
      return {
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
      } as ExternalEndpoint;
    }
    return addUptimeGatus(`backups-${detail.cluster.key}`, this.globals, { endpoints: [], "external-endpoints": [...plans].map((plan) => makeEndpoint(groupTitle, plan.name)) }, this);
  }

  async updateBackrestConfiguration(details: UnwrappedObject<Connection>, depends: Input<Resource[]>, items: { repos: BackrestRepository[]; plans: BackrestPlan[] }) {
    const connection = details.connection;
    let updatedConfig: BackrestConfig = { repos: [], plans: [], version: 6, modno: 1, instance: details.cluster.key, auth: { disabled: true }, multihost: {} };

    {
      const ssh = new NodeSSH();
      await ssh.connect({
        host: connection.host,
        username: connection.user,
      });

      const currentConfig = (await ssh.execCommand("cat /opt/stacks-data/backrest/config/config.json")).stdout;

      try {
        updatedConfig = JSON.parse(currentConfig) as BackrestConfig;
      } catch (e) {
        log.warn(`Could not read existing backrest config, starting with empty config: ${e}`);
        log.warn(`Current config content: ${currentConfig}`);
      }

      ssh.dispose();
    }

    if (!updatedConfig.version) {
      updatedConfig.version = 6;
    }
    if (!updatedConfig.modno) {
      updatedConfig.modno = 1;
    }
    updatedConfig.instance = details.cluster.key;
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

    updateRepos(updatedConfig, items.repos);
    updatePlans(updatedConfig, items.plans);

    const configOutput = jsonStringify(updatedConfig);

    const backrestConfig = copyFileToRemote("backrest-config.json", {
      content: configOutput,
      connection: details.connection,
      remotePath: "/opt/stacks-data/backrest/config/config.json",
      triggers: [...items.repos.map((z) => z.uri), ...items.plans.map((z) => z.repo)],
      dependsOn: depends,
      parent: this,
    });

    const compose = new remote.Command(
      `backrest-restart`,
      {
        connection: details.connection,
        triggers: [...items.repos.map((z) => z.uri), ...items.plans.map((z) => z.repo)],
        create: interpolate`cd /opt/stacks/backrest && docker compose -f compose.yaml build && docker compose -f compose.yaml up -d && docker compose -f compose.yaml start`,
      },
      {
        parent: this,
        dependsOn: output(depends).apply((x) => [...x, backrestConfig]),
      },
    );

    return compose;
  }
}

function updateRepos(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, repos: BackrestRepository[]) {
  for (const repo of repos) {
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
function updatePlans(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, plans: BackrestPlan[]) {
  for (const plan of plans) {
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
