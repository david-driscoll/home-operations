import { ClusterDefinition, GlobalResources, OnePasswordItem } from "./globals.ts";
import { OnePasswordItem as OPItem } from "../dynamic/1password/OnePasswordItem.ts";
import { OPClient } from "./op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "./backups/ProxmoxBackupServer.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, Output, output, Unwrap } from "@pulumi/pulumi";
import type { B2Backend, RcloneBackend, RcloneOperation } from "../types/rclone.ts";
import { remote, types } from "@pulumi/command";
import { addUptimeGatus, awaitOutput, BackupTask, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { kebabCase } from "moderndash";
import { DockgeLxc } from "./DockgeLxc.ts";
import { ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { NodeSSH } from "node-ssh";
import { BackrestPlan, BackrestRepository } from "@openapi/backrest.js";

export class BackupJobManager extends ComponentResource {
  cluster: Output<ClusterDefinition>;
  globals: GlobalResources;
  connection: types.input.remote.ConnectionArgs;
  jobs: Output<Omit<BackupTask, "token">[]> = output([]);
  constructor(
    name: string,
    args: {
      cluster: DockgeLxc;
      globals: GlobalResources;
    },
    opts?: ComponentResourceOptions
  ) {
    super("home:backups:BackupJobManager", name, {}, opts);
    this.connection = args.cluster.remoteConnection;
    this.cluster = args.cluster.cluster;
    this.globals = args.globals;
  }

  public createBackupJob(args: Omit<BackupTask, "token">) {
    this.jobs = this.jobs.apply((jobs) => [...jobs, args]);
    return all([args, this.cluster]).apply(([job, cluster]) => {
      const groupName = `Jobs: ${cluster.title}`;
      const token = toGatusKey(groupName, job.name);

      return copyFileToRemote(`${cluster.key}-backup-job-${kebabCase(job.name)}`, {
        content: jsonStringify({ ...job, token }, undefined, 2),
        parent: this,
        connection: this.connection,
        remotePath: interpolate`/opt/stacks/backups/jobs/${cluster.key}-${kebabCase(job.name)}.json`,
        dependsOn: [
          new remote.Command(
            `${cluster.key}-backup-job-${kebabCase(job.name)}-remove`,

            {
              connection: this.connection,
              delete: interpolate`rm -f /opt/stacks/backups/jobs/${cluster.key}-${kebabCase(job.name)}.json`,
            },
            { parent: this }
          ),
        ],
      });
    });
  }

  public createUptime(): Output<{ "external-endpoints": ExternalEndpoint[]; endpoints: GatusDefinition[] }> {
    return all([this.jobs, this.cluster]).apply(([jobs, cluster]) => {
      const groupName = `Jobs: ${cluster.title}`;
      return {
        endpoints: [],
        "external-endpoints": jobs.map(
          (job) =>
            ({
              enabled: true,
              name: job.name,
              token: toGatusKey(groupName, job.name),
              group: groupName,
              heartbeat: {
                interval: "25h",
              },
              alerts: [
                {
                  type: "pushover",
                  enabled: true,
                  "success-threshold": 1,
                  "failure-threshold": 1,
                  "minimum-reminder-interval": "24h",
                },
              ],
            } as ExternalEndpoint)
        ),
      };
    });
  }
}

export class BackupPlanManager extends ComponentResource {
  plans: Map<string, BackrestPlan> = new Map();
  repos: Map<string, BackrestRepository> = new Map();
  source: DockgeLxc;
  localBackup: DockgeLxc;
  remoteBackup: DockgeLxc;
  globals: GlobalResources;
  ssh?: NodeSSH;
  volsyncPassword?: string;

  constructor(
    name: string,
    args: {
      source: DockgeLxc;
      localBackup: DockgeLxc;
      remoteBackup: DockgeLxc;
      globals: GlobalResources;
    },
    opts?: ComponentResourceOptions
  ) {
    super("home:backups:BackupPlanManager", name, {}, opts);
    this.localBackup = args.localBackup;
    this.remoteBackup = args.remoteBackup;
    this.source = args.source;
    this.globals = args.globals;
  }

  public async createBackrestPlan(
    name: string,
    args: {
      title: Input<string>;
      planConfig?: Input<Omit<BackrestPlan, "id" | "repo" | "paths">>;
      repositoryConfig?: Input<Omit<BackrestRepository, "guid" | "uri" | "id" | "password" | "autoUnlock" | "autoInitialize">>;
      paths: Input<string[]>;
      repository?: Input<string>;
      backblazeSecret?: Input<string>;
    }
  ) {
    const password = await this.getVolsyncPassword();
    const { planConfig, repositoryConfig, paths, repository = name, title, backblazeSecret } = await awaitOutput(output(args));
    // check if the repository exists at the location (if the config file exists in the given directory)
    // then if the repository doesn't exist call restic init to initialize it

    const localTailscaleHostname = await awaitOutput(this.localBackup.tailscaleHostname);
    const isLocalBackupSameAsSource = await awaitOutput(
      all([this.localBackup.tailscaleHostname, this.source.tailscaleHostname]).apply(([localHostname, sourceHostname]) => localHostname === sourceHostname)
    );

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
      uri: isLocalBackupSameAsSource ? `/backup/${repository}/` : `sftp:celestia:/${repository}/`,
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
      paths: paths,
    });

    if (!isLocalBackupSameAsSource) {
    }

    if (backblazeSecret) {
      this.localBackup.createBackupJob({
        name: interpolate`Backblaze ${title}`,
        schedule: "0 10 */3 * *",
        sourceType: "local",
        source: `/data/backup/${repository}/`,
        destinationType: "b2",
        destination: interpolate`${repository}`,
        destinationSecret: backblazeSecret,
      });
    }

    this.remoteBackup.createBackupJob({
      name: interpolate`Replicate ${title}`,
      schedule: "0 3 * * *",
      sourceType: "sftp",
      source: interpolate`${this.localBackup.tailscaleHostname}/${repository}`,
      destinationType: "local",
      destination: interpolate`/data/backup/${repository}/`,
    });
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

  public async updateBackrestConfig() {
    const ssh = new NodeSSH();
    const localBackupServerHost = await awaitOutput(output(this.source.tailscaleHostname))!;
    const sourceKey = await awaitOutput(output(this.source.cluster.key))!;
    await ssh.connect({
      host: localBackupServerHost,
      username: "root",
    });

    var currentConfig = (await ssh.execCommand("cat /opt/stacks/backrest/config/config.json")).stdout;
    var updatedConfig = JSON.parse(currentConfig) as { repos: BackrestRepository[]; plans: BackrestPlan[] };
    updatedConfig.repos = updatedConfig.repos || [];
    updatedConfig.plans = updatedConfig.plans || [];

    for (const plan of this.plans.values()) {
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

    for (const repo of this.repos.values()) {
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
        updatedConfig.repos.push({
          ...repo,
          autoInitialize: true,
        });
      }
    }

    const newConfig = JSON.stringify(updatedConfig);
    if (currentConfig.trim() === newConfig.trim()) {
      ssh.dispose();
      return;
    }

    await ssh.execCommand(`echo '${newConfig}' > /opt/stacks/backrest/config/config.json`);
    await ssh.execCommand(`docker compose -f compose.yaml up -d && docker compose -f compose.yaml start`, { cwd: `/opt/stacks/backrest/` });

    ssh.dispose();
  }
}
