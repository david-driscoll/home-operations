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
    this.volsyncPassword = this.globals.store.getSecretByTitle<{ credential: string }>("Volsync Password").apply((z) => z.credential);
  }

  public createPlans(
    source: {
      dockge: DockgeLxc;
      pbs: ProxmoxBackupServerLxc;
      cluster: Input<ClusterDefinition>;
    },
    depends: Input<Resource[]>,
  ) {
    return all([
      source.cluster,
      source.dockge.remoteConnection,
      this.globals.store.proxmoxBackupServers(),
      this.globals.store.getBackupPlans<BackupPlanItem>(),
      this.uptimeUrl,
      this.volsyncPassword,
    ]).apply(([cluster, dockgeConnection, backupServers, plans, uptimeUrl, volsyncPassword]) =>
      output(this._createPlans(source.dockge, source.pbs, cluster, dockgeConnection, backupServers, plans, uptimeUrl, volsyncPassword, depends)),
    );
  }

  public _createPlans(
    dockge: DockgeLxc,
    pbs: ProxmoxBackupServerLxc,
    cluster: ClusterDefinition,
    dockgeConnection: Unwrap<DockgeLxc["remoteConnection"]>,
    backupServers: UnwrappedArray<ProxmoxBackupServerLxcDefinition>,
    plans: UnwrappedArray<BackupPlanItem>,
    uptimeUrl: string,
    volsyncPassword: string,
    depends: Input<Resource[]>,
  ) {
    const clusterKey = cluster.key;
    const sourceGroupTitle = `Backups: ${cluster.title}`;
    const destinationGroupTitle = `Copy: ${cluster.title}`;
    const volsyncGroupTitle = `VolSync: ${cluster.title}`;
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

    const celestiaServer = backupServers.find((s) => s.cluster.key === "celestia");
    const volsyncJobTasks = volsyncPlans.map((plan) => {
      const copyToken = toGatusKey(volsyncGroupTitle, plan.name);
      if (clusterKey === "celestia") {
        return {
          name: plan.name,
          schedule: "0 10 * * *",
          sourceType: "local" as const,
          source: plan.path,
          destinationType: "local" as const,
          destination: `/data/backup/${plan.name}/`,
          token: copyToken,
        };
      }
      return {
        name: plan.name,
        schedule: "0 4 * * *",
        sourceType: "sftp" as const,
        source: `${celestiaServer!.dockge.ssh.hostname}/backup/${plan.name}/`,
        destinationType: "local" as const,
        destination: `/data/backup/${plan.name}/`,
        token: copyToken,
      };
    });

    const copyJobs = addBackupJobs(`copy-${clusterKey}`, dockgeConnection, [...destinationJobTasks, ...volsyncJobTasks], this, depends);

    const backrestItems = [
      ...sourcePlans.map((plan) => this._createSourceBackrestPlan(dockgeConnection, cluster, plan, uptimeUrl, volsyncPassword)),
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
      `backups-${cluster.key}`,
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

    return output(this.updateBackrestConfiguration(dockgeConnection, cluster, allDeps, backrestItems));
  }

  private _createSourceBackrestPlan(detail: Unwrap<DockgeLxc["remoteConnection"]>, cluster: ClusterDefinition, plan: BackupPlanItem, uptimeUrl: string, password: string) {
    const sourceGroup = `Backups: ${cluster.title}`;
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
            "--delete-excluded",
            "--log-level INFO",
            "--no-update-dir-modtime",
            "--no-update-modtime",
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

  async updateBackrestConfiguration(
    connection: Unwrap<DockgeLxc["remoteConnection"]>,
    cluster: ClusterDefinition,
    depends: Input<Resource[]>,
    items: { repos: BackrestRepository[]; plans: BackrestPlan[] },
  ) {
    let updatedConfig: BackrestConfig = { repos: [], plans: [], version: 6, modno: 1, instance: cluster.key, auth: { disabled: true }, multihost: {} };

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
    updatedConfig.instance = cluster.key;
    if (!updatedConfig.auth) updatedConfig.auth = { disabled: true };

    delete updatedConfig.multihost;
    delete updatedConfig.sync;

    updatedConfig.repos = updatedConfig.repos || [];
    updatedConfig.plans = updatedConfig.plans || [];

    updateRepos(updatedConfig, items.repos);
    updatePlans(updatedConfig, items.plans);

    const configOutput = jsonStringify(updatedConfig);

    const backrestConfig = copyFileToRemote("backrest-config.json", {
      content: configOutput,
      connection: connection,
      remotePath: "/opt/stacks-data/backrest/config/config.json",
      triggers: [configOutput],
      dependsOn: depends,
      parent: this,
    });

    const compose = new remote.Command(
      `backrest-restart`,
      {
        connection: connection,
        triggers: [...items.repos.map((z) => z.uri), ...items.plans.map((z) => z.repo)],
        create: interpolate`cd /opt/stacks/backrest && docker compose -f compose.yaml build && docker compose -f compose.yaml up -d && docker compose -f compose.yaml restart`,
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
        ...repo,
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
        ...plan,
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
