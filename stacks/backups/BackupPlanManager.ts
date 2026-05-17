import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, log, Output, output, Unwrap, UnwrappedObject } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { addUptimeGatus, BackupTask, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { kebabCase } from "moderndash";
import { DockgeLxc } from "../../components/DockgeLxc.ts";
import { ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { NodeSSH } from "node-ssh";
import { BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import * as minio from "@pulumi/minio";
import { CopyToRemote } from "@pulumi/command/remote/index.js";

export interface PbsDetails {
  backupServerConnection: types.input.remote.ConnectionArgs;
  dockgeConnection: types.input.remote.ConnectionArgs;
  cluster: ClusterDefinition;
  tags: string[];
  title: string;
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
  }

  public createBackrestPlan(
    name: string,
    args: {
      title: Input<string>;
      planConfig?: Input<Omit<BackrestPlan, "id" | "repo" | "paths">>;
      repositoryConfig?: Input<Omit<BackrestRepository, "guid" | "uri" | "id" | "password" | "autoUnlock" | "autoInitialize">>;
      path: Input<string>;
      repository?: Input<string>;
      //   backblazeSecret?: Input<string>;
    },
  ) {
    return all([this.source, this.destinations, output(this.getVolsyncPassword()), output(args)]).apply(
      ([source, destinations, password, { planConfig, repositoryConfig, path, repository = name, title }]) => {
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
          uri: `/backup/${repository}/`,
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
        });

        // TODO: Google Drive?
        // if (backblazeSecret) {
        //   this.localBackup.createBackupJob({
        //     name: interpolate`Backblaze ${title}`,
        //     schedule: "0 10 */3 * *",
        //     sourceType: "local",
        //     source: `/data/backup/${repository}/`,
        //     destinationType: "b2",
        //     destination: interpolate`${repository}`,
        //     destinationSecret: backblazeSecret,
        //   });
        // }

        const jobs = [];
        jobs.push(
          this.createBackupJob(source, {
            name: interpolate`Backup ${title}`,
            schedule: "0 15 * * *",
            sourceType: "local",
            source: path,
            destinationType: "local",
            destination: interpolate`/data/backup/${repository}/`,
          }),
        );
        jobs.push(
          this.createBackupJob(destinations, {
            name: interpolate`Replicate ${title}`,
            schedule: "0 3 * * *",
            sourceType: "sftp",
            source: interpolate`${source.dockgeConnection.host}/${repository}`,
            destinationType: "local",
            destination: interpolate`/data/backup/${repository}/`,
          }),
        );

        return all(jobs).apply((z) => z.flat());
      },
    );
  }

  public createMinioBucketBackupJob({
    title,
    bucket,
    // backblazeSecret,
    globals,
    restoreBucket: restoreBucket,
  }: {
    title: Input<string>;
    bucket: Input<string>;
    globals: GlobalResources;
    backblazeSecret?: Input<string>;
    restoreBucket?: Input<string>;
  }) {
    const jobs: Output<CopyToRemote[]>[] = [];
    jobs.push(
      this.createBackupJob(this.source, {
        name: interpolate`Backup ${title}`,
        schedule: "0 10 * * *",
        sourceType: "local",
        source: interpolate`/spike/data/minio/${bucket}/`,
        destinationType: "local",
        destination: interpolate`/data/backup/spike/${bucket}/`,
      }),
    );

    jobs.push(
      this.createBackupJob(this.destinations, {
        name: interpolate`Replicate ${title}`,
        schedule: "0 3 * * *",
        sourceType: "sftp",
        source: interpolate`${this.source.dockgeConnection.host}/spike/${bucket}/`,
        destinationType: "local",
        destination: interpolate`/data/backup/spike/${bucket}/`,
      }),
    );

    // if (backblazeSecret) {
    //   source.createBackupJob({
    //     name: pulumi.interpolate`Replicate ${title} to B2`,
    //     schedule: "0 8 */4 * *",
    //     sourceType: "local",
    //     source: pulumi.interpolate`/spike/data/minio/${bucket}/`,
    //     destinationType: "b2",
    //     destination: pulumi.interpolate`/`,
    //     destinationSecret: backblazeSecret,
    //   });
    // }

    if (restoreBucket) {
      return all([bucket, restoreBucket]).apply(([bucket, restoreBucket]) => {
        const minioBucket = new minio.S3Bucket(
          `${restoreBucket}-minio-bucket`,
          {
            acl: "private",
            bucket: interpolate`${restoreBucket}`,
          },
          {
            provider: globals.truenasMinioProvider,
            protect: true,
            retainOnDelete: true,
            import: restoreBucket,
          },
        );

        jobs.push(
          this.createBackupJob(this.source, {
            name: interpolate`Sync ${bucket} from ${restoreBucket}`,
            schedule: "*/10 * * * *",
            sourceType: "s3",
            source: interpolate`${bucket}/`,
            sourceSecret: globals.truenasMinioCredential.title!,
            destinationType: "s3",
            destination: interpolate`${minioBucket.bucket}/`,
            destinationSecret: globals.truenasMinioCredential.title!,
          }),
        );

        jobs.push(
          this.createBackupJob(this.destinations, {
            name: interpolate`Replicate ${bucket} from ${restoreBucket}`,
            schedule: "0 3 * * *",
            sourceType: "s3",
            source: interpolate`${minioBucket.bucket}/`,
            sourceSecret: globals.truenasMinioCredential.title!,
            destinationType: "local",
            destination: interpolate`/data/backup/spike/${minioBucket.bucket}/`,
            destinationSecret: globals.truenasMinioCredential.title!,
          }),
        );

        return all(jobs).apply((z) => z.flat());
      });
    }
    return all(jobs).apply((z) => z.flat());
  }

  public createBackupJob(details: Input<PbsDetails | PbsDetails[]>, args: Omit<BackupTask, "token">) {
    const d = output(details).apply((z) => (Array.isArray(z) ? z : [z]));
    this.jobs = all([d, this.jobs, args]).apply(([details, jobs, task]) => jobs.concat(...details.map((detail) => ({ detail, task: { ...task, name: `${task.name} to ${detail.cluster.title}` } }))));
    const result = all([args, d])
      .apply(([job, details]) => {
        return details.map(({ cluster, dockgeConnection: connection }, index) => {
          const groupName = `Jobs: ${cluster.title}`;
          const token = toGatusKey(groupName, job.name);

          return copyFileToRemote(`backup-job-${token}`, {
            content: jsonStringify({ ...job, token }, undefined, 2),
            parent: this,
            connection: connection,
            remotePath: interpolate`/opt/stacks/backups/jobs/${token}.json`,
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

  private createUptime({ cluster }: PbsDetails) {
    return all([this.jobs]).apply(([jobs]) => {
      const groupName = `Jobs: ${cluster.title}`;
      return addUptimeGatus(
        `backup-jobs-${cluster.key}`,
        this.globals,
        {
          endpoints: [],
          "external-endpoints": jobs.map(
            (job) =>
              ({
                enabled: true,
                name: `${job.task.name} to ${cluster.title}`,
                token: toGatusKey(groupName, job.task.name),
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
              }) as ExternalEndpoint,
          ),
        },
        this,
      );
    });
  }

  public finalize() {
    all([this.source, this.destinations]).apply(async ([source, destinations]) => {
      await updateBackrestConfiguration(source.dockgeConnection, async (ssh, updatedConfig) => {
        await updateRepos(updatedConfig, this.repos);
        await updatePlans(updatedConfig, this.plans);
      });
      this.createUptime(source);
      for (const destination of destinations) {
        await updateBackrestConfiguration(destination.dockgeConnection, async (ssh, updatedConfig) => await updateRepos(updatedConfig, this.repos));
        this.createUptime(destination);
      }
    });
  }
}

async function updateBackrestConfiguration(
  connection: UnwrappedObject<PbsDetails["dockgeConnection"]>,
  func: (ssh: NodeSSH, updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }) => Promise<void>,
) {
  const ssh = new NodeSSH();
  await ssh.connect({
    host: connection.host,
    username: connection.user,
  });

  const currentConfig = (await ssh.execCommand("cat /opt/stacks/backrest/config/config.json")).stdout;
  let updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] } = { repos: [], plans: [] };
  try {
    updatedConfig = JSON.parse(currentConfig) as { repos: BackrestRepository[]; plans: BackrestPlan[] };
  } catch (e) {
    log.warn(`Could not read existing backrest config, starting with empty config: ${e}`);
    log.warn(`Current config content: ${currentConfig}`);
  }
  updatedConfig.repos = updatedConfig.repos || [];
  updatedConfig.plans = updatedConfig.plans || [];

  await func(ssh, updatedConfig);

  const newConfig = JSON.stringify(updatedConfig);
  if (currentConfig.trim() === newConfig.trim()) {
    ssh.dispose();
    return;
  }

  await ssh.execCommand(`echo '${newConfig}' > /opt/stacks/backrest/config/config.json`);
  await ssh.execCommand(`docker compose -f compose.yaml up -d && docker compose -f compose.yaml start`, { cwd: `/opt/stacks/backrest/` });

  ssh.dispose();
}
function updateRepos(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, repos: Map<string, BackrestRepository>) {
  for (const repo of repos.values()) {
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
