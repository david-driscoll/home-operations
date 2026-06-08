import { GlobalResources } from "./globals.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, log, Output, output, Resource, Unwrap, UnwrappedArray, UnwrappedObject } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { addBackupJobs, addUptimeGatus, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { ExternalEndpoint } from "@openapi/application-definition.js";
import { NodeSSH } from "node-ssh";
import { BackrestConfig, BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { BackupPlanItem } from "./BackupPlanOrchestrator.ts";
import { ProxmoxBackupServerLxc } from "./ProxmoxBackupServerLxc.ts";
import { ClusterDefinition, ProxmoxBackupServerLxcDefinition, SshKeyDefinition } from "./store/interfaces.ts";
import { DockgeLxc } from "./DockgeLxc.ts";

interface Connection {
  connection: Unwrap<types.input.remote.ConnectionArgs>;
  cluster: ClusterDefinition;
}

export class BackupPlanDirector extends ComponentResource {
  private readonly plans: Output<BackupPlanItem[]>;
  private readonly globals: GlobalResources;
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
    this.uptimeUrl = output(args.globals.searchDomain).apply((domain) => `https://uptime.${domain}`);
    this.plans = args.globals.store.getBackupPlans<BackupPlanItem>().apply((z) => z.flatMap((x) => x.plans));
    this.volsyncPassword = this.globals.store.getSecretByTitle<{ credential: string }>("Volsync Password").apply((z) => z.credential);
  }

  public createPlans(
    source: Input<{
      dockge: DockgeLxc;
      pbs: ProxmoxBackupServerLxc;
      cluster: Input<ClusterDefinition>;
    }>,
    depends: Input<Resource[]>,
  ) {
    return all([source, this.globals.store.proxmoxBackupServers(), this.plans, this.uptimeUrl, this.volsyncPassword]).apply(([source, backupServers, plans, uptimeUrl, volsyncPassword]) => {
      return output({ connection: source.dockge.remoteConnection, cluster: source.cluster }).apply((c) => this._createPlans(source, c, backupServers, plans, uptimeUrl, volsyncPassword, depends));
    });
  }

  public _createPlans(
    source: UnwrappedObject<{ dockge: DockgeLxc; pbs: ProxmoxBackupServerLxc; cluster: ClusterDefinition }>,
    dockgeConnection: Unwrap<Connection>,
    backupServers: UnwrappedArray<ProxmoxBackupServerLxcDefinition>,
    plans: UnwrappedArray<BackupPlanItem>,
    uptimeUrl: string,
    volsyncPassword: string,
    depends: Input<Resource[]>,
  ) {
    const clusterKey = source.cluster.key;
    const sourceGroupTitle = `Backups: ${source.cluster.title}`;
    const destinationGroupTitle = `Copy: ${source.cluster.title}`;
    const volsyncGroupTitle = `VolSync: ${source.cluster.title}`;
    const sourcePlans = plans.filter((p) => p.source === clusterKey && p.source !== "volsync");
    const destinationPlans = plans.filter((p) => p.source !== clusterKey && p.source !== "volsync");
    const volsyncPlans = plans.filter((p) => p.source === "volsync");

    const destinationJobTasks = destinationPlans.map((plan) => {
      const planServer = backupServers.find((s) => s.cluster.key === plan.source);
      const copyToken = toGatusKey(destinationGroupTitle, plan.name);
      return {
        name: plan.name,
        schedule: "0 4 * * *",
        sourceType: "sftp" as const,
        source: `${planServer!.dockge.ssh.hostname}/backup/${plan.name}/`,
        destinationType: "local" as const,
        destination: `/data/backup/${plan.name}/`,
        token: copyToken,
      };
    });

    const volsyncJobTasks = volsyncPlans.map((plan) => {
      const planServer = backupServers.find((s) => s.cluster.key === plan.source);
      const copyToken = toGatusKey(volsyncGroupTitle, plan.name);
      return {
        name: plan.name,
        schedule: "0 4 * * *",
        sourceType: "sftp" as const,
        source: `${planServer!.dockge.ssh.hostname}/backup/${plan.name}/`,
        destinationType: "local" as const,
        destination: `/data/backup/${plan.name}/`,
        token: copyToken,
      };
    });

    const copyJobs = addBackupJobs(`copy-${clusterKey}`, dockgeConnection.connection, destinationJobTasks.concat(volsyncJobTasks), this, depends);

    const backrestItems = [
      ...sourcePlans.map((plan) => this._createSourceBackrestPlan(dockgeConnection, plan, uptimeUrl, volsyncPassword)),
      // setup for celestia?
      // ...volsyncPlans.map((plan) => this._createRepository(plan, volsyncPassword)),
    ].reduce(
      (acc, { plan, repo }) => {
        if (plan) acc.plans.push(plan);
        if (repo) acc.repos.push(repo);
        return acc;
      },
      { plans: [] as BackrestPlan[], repos: [] as BackrestRepository[] },
    );

    const uptime = addUptimeGatus(
      `backups-${source.cluster.key}`,
      this.globals,
      {
        endpoints: [],
        "external-endpoints": [
          ...sourcePlans.map((plan) => makeEndpoint(sourceGroupTitle, plan.name)),
          ...destinationPlans.map((plan) => makeEndpoint(destinationGroupTitle, plan.name)),
          ...volsyncPlans.map((plan) => makeEndpoint(volsyncGroupTitle, plan.name)),
        ],
      },
      this,
    );

    const allDeps = all([depends, uptime, copyJobs]).apply((d) => d.flat());

    return output(this.updateBackrestConfiguration(dockgeConnection, allDeps, backrestItems));
  }

  private _createSourceBackrestPlan(detail: Unwrap<Connection>, plan: BackupPlanItem, uptimeUrl: string, password: string) {
    const sourceGroup = `Backups: ${detail.cluster.title}`;
    const sourceToken = toGatusKey(sourceGroup, plan.name);

    const hooks: BackrestPlan["hooks"] = [];

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
            "--sftp-user=sftp",
            "--sftp-key-file=/opt/stacks-data/backrest/ssh/id_ed25519",
            "--sftp-shell-type=none",
            "--log-level INFO",
            "--delete-excluded",
            // "--ignore-errors",
            ...(plan.preSync.exclude?.map((e) => `--exclude '${e}'`) ?? []),
          ].join(" "),
        },
        onError: "ON_ERROR_FATAL",
      });
    }

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
      prunePolicy: { schedule: { maxFrequencyDays: 30, clock: "CLOCK_LAST_RUN_TIME" }, maxUnusedPercent: 10 },
      checkPolicy: { schedule: { maxFrequencyDays: 7, clock: "CLOCK_LAST_RUN_TIME" }, readDataSubsetPercent: 10 },
      commandPrefix: { ioNice: "IO_BEST_EFFORT_LOW", cpuNice: "CPU_LOW" },
      password,
      ...plan.repositoryConfig,
      id: plan.name,
      uri: `/data/backup/${plan.name}/`,
      autoUnlock: true,
    };

    const backrestPlan: BackrestPlan = {
      retention: {
        policyTimeBucketed: { daily: 7, weekly: 4, monthly: 3, keepLastN: 10 },
      },
      skipIfUnchanged: true,
      schedule: { clock: "CLOCK_LAST_RUN_TIME", maxFrequencyDays: 1 },
      ...plan.planConfig,
      id: plan.name,
      repo: plan.name,
      paths: [plan.path],
      hooks,
    };

    return { plan: backrestPlan, repo: backrestRepo };
  }

  private _createRepository(plan: BackupPlanItem, password: string) {
    const backrestRepo: BackrestRepository = {
      prunePolicy: { schedule: { maxFrequencyDays: 30, clock: "CLOCK_LAST_RUN_TIME" }, maxUnusedPercent: 10 },
      checkPolicy: { schedule: { maxFrequencyDays: 7, clock: "CLOCK_LAST_RUN_TIME" }, readDataSubsetPercent: 10 },
      commandPrefix: { ioNice: "IO_BEST_EFFORT_LOW", cpuNice: "CPU_LOW" },
      password,
      ...plan.repositoryConfig,
      id: plan.name,
      uri: `/data/backup/${plan.name}/`,
      autoUnlock: true,
    };

    return { plan: null, repo: backrestRepo };
  }
  async updateBackrestConfiguration(details: Unwrap<Connection>, depends: Input<Resource[]>, items: { repos: BackrestRepository[]; plans: BackrestPlan[] }) {
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

    if (!updatedConfig.version) updatedConfig.version = 6;
    if (!updatedConfig.modno) updatedConfig.modno = 1;
    updatedConfig.instance = details.cluster.key;
    if (!updatedConfig.auth) updatedConfig.auth = { disabled: true };

    delete updatedConfig.multihost;
    delete updatedConfig.sync;

    updatedConfig.repos = updatedConfig.repos || [];
    updatedConfig.plans = updatedConfig.plans || [];

    updateRepos(updatedConfig, items.repos);
    updatePlans(updatedConfig, items.plans);

    updatedConfig.repos = updatedConfig.repos.filter((z) => !z.id.includes("-volsync-"));
    updatedConfig.plans = updatedConfig.plans.filter((z) => !z.id.includes("-volsync-"));

    const configOutput = jsonStringify(updatedConfig);

    const backrestConfig = copyFileToRemote("backrest-config.json", {
      content: configOutput,
      connection: details.connection,
      remotePath: "/opt/stacks-data/backrest/config/config.json",
      triggers: [configOutput],
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
      updatedConfig.repos.push({ ...repo, autoInitialize: true });
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
