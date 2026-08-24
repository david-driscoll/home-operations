import { addBackupJobs, addUptimeGatus, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import type { ExternalEndpoint } from "@openapi/application-definition.js";
import type { BackrestConfig, BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { remote } from "@pulumi/command";
import { all, ComponentResource, type ComponentResourceOptions, type Input, interpolate, jsonStringify, log, type Output, output, type Resource, type Unwrap, type UnwrappedArray } from "@pulumi/pulumi";
import { NodeSSH } from "node-ssh";
import type { BackupPlanItem, S3PreSyncArgs } from "./BackupPlanOrchestrator.ts";
import type { DockgeLxc } from "./DockgeLxc.ts";
import type { GlobalResources } from "./globals.ts";
import type { ProxmoxBackupServerLxc } from "./ProxmoxBackupServerLxc.ts";
import type { ClusterDefinition, ProxmoxBackupServerLxcDefinition } from "./store/interfaces.ts";

/**
 * Plan ids that must be REMOVED from every backrest config, while their repos
 * are left exactly as they are.
 *
 * These are the four host-level dockge plans that per-stack plans replaced.
 * `updateBackrestConfiguration` merges rather than replaces -- it has no notion
 * of a plan going away -- so simply ceasing to emit them would leave them in
 * config.json, still running their whole-host ON_ERROR_FATAL pre-sync into a
 * staging tree nothing else maintains, still pushing to Gatus tokens whose
 * endpoints no longer exist. Removing the PLAN stops the work; leaving the REPO
 * keeps every existing snapshot restorable, since a restic history cannot be
 * carried across a rename (`BackupPlanItem.name` is the repo id).
 *
 * The repos keep their own prune/check schedules and will go on tidying
 * themselves. That is harmless. Delete these ids -- and the
 * /data/backup/<id>/ directories -- by hand once the archive has aged out.
 */
export const RETIRED_BACKREST_PLANS: readonly string[] = ["celestia-dockge", "alpha-site-dockge", "luna-dockge", "skystar-dockge"];

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
    this.uptimeUrl = output(args.globals.searchDomain).apply(domain => `https://uptime.${domain}`);
    this.volsyncPassword = this.globals.store.getSecretByTitle<{ credential: string }>("Volsync Password").apply(z => z.credential);
  }

  public createPlans(
    source: {
      dockge: DockgeLxc;
      pbs: ProxmoxBackupServerLxc;
      cluster: Input<ClusterDefinition>;
    },
    depends: Input<Resource[]>,
  ) {
    return all([source.cluster, source.dockge.remoteConnection, this.globals.store.proxmoxBackupServers(), this.globals.store.getBackupPlans<BackupPlanItem>(), this.uptimeUrl, this.volsyncPassword]).apply(
      ([cluster, dockgeConnection, backupServers, plans, uptimeUrl, volsyncPassword]) =>
        output(this._createPlans(source.dockge, source.pbs, cluster, dockgeConnection, backupServers, plans, uptimeUrl, volsyncPassword, depends)),
    );
  }

  public _createPlans(
    _dockge: DockgeLxc,
    _pbs: ProxmoxBackupServerLxc,
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
    const destinationGroupTitle = `Backups: ${cluster.title}`;
    const volsyncGroupTitle = `VolSync: ${cluster.title}`;
    const sourcePlans = plans.filter(p => p.source === clusterKey && p.source !== "volsync");
    const destinationPlans = plans.filter(p => p.source !== clusterKey && p.source !== "volsync");
    const volsyncPlans = plans.filter(p => p.source === "volsync");

    const destinationJobTasks = destinationPlans.map(plan => {
      const planServer = backupServers.find(s => s.cluster.key === plan.source);
      const copyToken = toGatusKey(destinationGroupTitle, plan.name);
      return {
        name: plan.name,
        schedule: "0 4 * * *",
        sourceType: "sftp" as const,
        source: `${planServer?.dockge.ssh.hostname}/backup/${plan.name}/`,
        destinationType: "local" as const,
        destination: `/data/backup/${plan.name}/`,
        token: copyToken,
      };
    });

    const celestiaServer = backupServers.find(s => s.cluster.key === "celestia");
    const volsyncJobTasks = volsyncPlans.map(plan => {
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
        source: `${celestiaServer?.dockge.ssh.hostname}/backup/${plan.name}/`,
        destinationType: "local" as const,
        destination: `/data/backup/${plan.name}/`,
        token: copyToken,
      };
    });

    const copyJobs = addBackupJobs(`copy-${clusterKey}`, dockgeConnection, [...destinationJobTasks, ...volsyncJobTasks], this, depends);

    const backrestItems = [
      ...sourcePlans.map(plan => this._createSourceBackrestPlan(dockgeConnection, cluster, plan, uptimeUrl, volsyncPassword)),
      // setup for celestia?
      // ...volsyncPlans.map((plan) => this._createRepository(plan, volsyncPassword)),
      ...volsyncPlans.map(plan => ({
        repo: {
          id: plan.name,
          uri: `/data/backup/${plan.name}/`,
          password: volsyncPassword,
          checkPolicy: {
            schedule: { maxFrequencyDays: 7, clock: "CLOCK_LAST_RUN_TIME" },
            readDataSubsetPercent: 10,
          },
          commandPrefix: { ioNice: "IO_BEST_EFFORT_LOW", cpuNice: "CPU_LOW" },
        } as BackrestRepository,
        plan: null as unknown as BackrestPlan,
      })),
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
          ...sourcePlans.map(plan => makeEndpoint(sourceGroupTitle, plan.name)),
          ...destinationPlans.map(plan => makeEndpoint(destinationGroupTitle, plan.name)),
          ...volsyncPlans.map(plan => makeEndpoint(volsyncGroupTitle, plan.name)),
        ],
      },
      this,
    );

    const allDeps = all([depends, uptime, copyJobs]).apply(d => d.flat());

    // Only the plans this host actually RUNS need an rclone remote. A
    // destination host copies finished repos over SFTP and never touches the
    // bucket, so shipping it these credentials would be gratuitous spread.
    const rcloneConfig = renderRcloneConfig(sourcePlans);

    return output(this.updateBackrestConfiguration(dockgeConnection, cluster, allDeps, backrestItems, rcloneConfig));
  }

  private _createSourceBackrestPlan(_detail: Unwrap<DockgeLxc["remoteConnection"]>, cluster: ClusterDefinition, plan: BackupPlanItem, uptimeUrl: string, password: string) {
    const sourceGroup = `Backups: ${cluster.title}`;
    const sourceToken = toGatusKey(sourceGroup, plan.name);

    const hooks: BackrestPlan["hooks"] = [];

    if (plan.preSync) {
      hooks.push({
        conditions: ["CONDITION_SNAPSHOT_START"],
        actionCommand: {
          command: preSyncCommand(plan),
        },
        onError: "ON_ERROR_FATAL",
      });
    }

    // CONDITION_SNAPSHOT_SKIPPED counts as success. `skipIfUnchanged` means a
    // plan whose data did not move produces no snapshot at all, and at
    // per-stack granularity that is the NORMAL outcome for the many stacks
    // holding static config -- at host granularity something always changed, so
    // this never came up. Without it those heartbeats would expire at 25h and
    // page for a backup that ran perfectly.
    hooks.push({
      conditions: ["CONDITION_SNAPSHOT_SUCCESS", "CONDITION_SNAPSHOT_SKIPPED"],
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
        schedule: { maxFrequencyDays: 30, clock: "CLOCK_LAST_RUN_TIME" },
        maxUnusedPercent: 10,
      },
      checkPolicy: {
        schedule: { maxFrequencyDays: 7, clock: "CLOCK_LAST_RUN_TIME" },
        readDataSubsetPercent: 10,
      },
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
    rcloneConfig?: string,
  ) {
    let updatedConfig: BackrestConfig = {
      repos: [],
      plans: [],
      version: 6,
      modno: 1,
      instance: cluster.key,
      auth: { disabled: true },
      multihost: {},
    };

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
    removeRetiredPlans(updatedConfig, cluster.key);

    const configOutput = jsonStringify(updatedConfig);

    const backrestConfig = copyFileToRemote("backrest-config.json", {
      content: configOutput,
      connection: connection,
      remotePath: "/opt/stacks-data/backrest/config/config.json",
      triggers: [configOutput],
      dependsOn: depends,
      parent: this,
    });

    // The S3 credentials for every bucket-backed plan, in one file, written
    // ALONGSIDE config.json rather than into it.
    //
    // Two reasons it is not inlined into the hook command the way the SFTP key
    // path is. First, config.json is read back and merged on every run and is
    // shown in full in backrest's own UI; access keys do not belong in a string
    // that gets echoed around. Second, rotating a key becomes one file write
    // rather than a rewrite of every plan that uses it.
    //
    // `garage.conf`, NOT `rclone.conf`: compose.yaml already bind-mounts
    // ./rclone as the container's rclone config directory, and rclone.conf
    // there is rclone's own default name. Writing to that name would silently
    // replace whatever a human had put there. A distinct name cannot.
    //
    // The path sits under /opt/stacks-data/ for the same reason the SFTP key
    // does: that tree is bind-mounted read-only into the container, so the
    // absolute path is identical inside and out. See DockgeLxc.ts.
    const rcloneDeps: Input<Resource>[] = [];
    if (rcloneConfig) {
      const rcloneFile = copyFileToRemote("backrest-rclone-garage.conf", {
        content: rcloneConfig,
        connection: connection,
        remotePath: RCLONE_CONFIG_PATH,
        triggers: [rcloneConfig],
        dependsOn: depends,
        parent: this,
      });
      rcloneDeps.push(rcloneFile);

      // copyFileToRemote leaves the file world-readable. These are live S3
      // credentials, and 65534 is the uid the backrest container runs as.
      rcloneDeps.push(
        new remote.Command(
          `backrest-rclone-garage-perms`,
          {
            connection: connection,
            triggers: [rcloneConfig],
            create: `chmod 600 ${RCLONE_CONFIG_PATH} && chown 65534:65534 ${RCLONE_CONFIG_PATH}`,
          },
          { parent: this, dependsOn: [rcloneFile] },
        ),
      );
    }

    const compose = new remote.Command(
      `backrest-restart`,
      {
        connection: connection,
        triggers: [...items.repos.map(z => z.uri), ...items.plans.map(z => z.repo), ...(rcloneConfig ? [rcloneConfig] : [])],
        create: interpolate`cd /opt/stacks/backrest && docker compose -f compose.yaml build && docker compose -f compose.yaml up -d && docker compose -f compose.yaml restart`,
      },
      {
        parent: this,
        dependsOn: output(depends).apply(x => [...x, backrestConfig, ...rcloneDeps]),
      },
    );

    return compose;
  }
}

function updateRepos(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, repos: BackrestRepository[]) {
  for (const repo of repos) {
    const jobIndex = updatedConfig.repos.findIndex(r => r.id === repo.id);
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

/**
 * Drops retired plans from the config and leaves their repos untouched. See
 * RETIRED_BACKREST_PLANS for why the two are treated differently.
 */
function removeRetiredPlans(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, clusterKey: string) {
  const before = updatedConfig.plans.length;
  updatedConfig.plans = updatedConfig.plans.filter(p => !RETIRED_BACKREST_PLANS.includes(p.id ?? ""));
  const removed = before - updatedConfig.plans.length;
  if (removed > 0) {
    log.info(`Removed ${removed} retired backrest plan(s) from ${clusterKey}; their repos stay on disk as a frozen archive.`);
  }
}

function updatePlans(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, plans: BackrestPlan[]) {
  for (const plan of plans) {
    const jobIndex = updatedConfig.plans.findIndex(r => r.id === plan.id);
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

/**
 * Where the generated rclone remotes live on a backrest host.
 *
 * Identical inside and outside the container: /opt/stacks-data is bind-mounted
 * read-only at the same path (docker/_common/backrest/compose.yaml), which is
 * why the existing SFTP hook can name an absolute key path and have it resolve.
 */
const RCLONE_CONFIG_PATH = "/opt/stacks-data/backrest/rclone/garage.conf";

/** Narrowing helper. An absent `type` means sftp -- see SftpPreSyncArgs for why. */
function isS3PreSync(preSync: NonNullable<BackupPlanItem["preSync"]>): preSync is S3PreSyncArgs {
  return preSync.type === "s3";
}

/**
 * rclone remote name for a plan. One remote per plan rather than one per
 * endpoint: plan ids are already unique and already the repo id, so this needs
 * no second namespace, and a stray remote is trivially traceable to its plan.
 */
function rcloneRemoteName(planName: string) {
  return `garage-${planName}`;
}

/**
 * The CONDITION_SNAPSHOT_START hook body: mirror the source onto backrest's
 * staging path so restic has a local tree to snapshot.
 */
function preSyncCommand(plan: BackupPlanItem): string {
  const preSync = plan.preSync!;

  if (isS3PreSync(preSync)) {
    // No --no-update-*modtime pair here, unlike the SFTP branch. A bucket has
    // no directory mtimes and rclone cannot carry object timestamps onto a
    // local filesystem anyway, so suppressing the updates would only defeat the
    // size+modtime comparison that makes every steady-state run cheap.
    const remoteSpec = `${rcloneRemoteName(plan.name)}:${preSync.bucket}${preSync.prefix ? `/${preSync.prefix}` : ""}`;
    return [
      "rclone sync",
      remoteSpec,
      plan.path,
      `--config ${RCLONE_CONFIG_PATH}`,
      // Same reason as the SFTP path: a file dropped from the exclude list has
      // to leave the staging tree too, or restic keeps snapshotting it forever.
      "--delete-excluded",
      "--log-level INFO",
      // Reminder, because this bit every dockge exclude once already: a bare
      // '/dir' matches FILES only. Directories need '/dir/**'.
      ...(preSync.exclude?.map(e => `--exclude '${e}'`) ?? []),
    ].join(" ");
  }

  return [
    "rclone sync",
    `:sftp:${preSync.sourcePath}`,
    plan.path,
    `--sftp-host=${preSync.sftpHost}`,
    `--sftp-port=${preSync.sftpPort ?? 2022}`,
    "--sftp-user=sftp",
    "--sftp-key-file=/opt/stacks-data/backrest/ssh/id_ed25519",
    "--sftp-shell-type=none",
    "--delete-excluded",
    "--log-level INFO",
    "--no-update-dir-modtime",
    "--no-update-modtime",
    // "--ignore-errors",
    ...(preSync.exclude?.map(e => `--exclude '${e}'`) ?? []),
  ].join(" ");
}

/**
 * Renders garage.conf, or undefined when no plan on this host needs one.
 *
 * `provider = Other` plus `force_path_style` is the Garage-compatible shape:
 * Garage speaks S3 but is not AWS, and virtual-hosted addressing would need
 * `s3Api.rootDomain` plus a wildcard certificate the internal gateway does not
 * carry.
 */
function renderRcloneConfig(plans: UnwrappedArray<BackupPlanItem>): string | undefined {
  const s3Plans = plans.filter(p => p.preSync && isS3PreSync(p.preSync)).map(p => ({ name: p.name, preSync: p.preSync as S3PreSyncArgs }));

  if (s3Plans.length === 0) return undefined;

  const sections = s3Plans
    // Sorted so an unchanged set of buckets renders byte-identical output.
    // copyFileToRemote hashes the content to decide whether to re-copy, and the
    // upstream ordering comes from a Kubernetes namespace listing, which is not
    // guaranteed stable -- without this, an unrelated reorder would rewrite the
    // file and restart backrest on every run.
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, preSync }) =>
      [
        `[${rcloneRemoteName(name)}]`,
        "type = s3",
        "provider = Other",
        `endpoint = ${preSync.endpoint}`,
        `region = ${preSync.region}`,
        `access_key_id = ${preSync.accessKeyId}`,
        `secret_access_key = ${preSync.secretAccessKey}`,
        "force_path_style = true",
        "",
      ].join("\n"),
    );

  return ["# Generated by BackupPlanDirector. Do not edit by hand -- every Pulumi run rewrites it.", "# One remote per bucket-backed backrest plan; the plan's own hook names it.", "", ...sections].join("\n");
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
