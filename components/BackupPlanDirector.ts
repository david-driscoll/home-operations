import { createHash } from "node:crypto";
import { addBackupJobs, addUptimeGatus, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import type { ExternalEndpoint } from "@openapi/application-definition.js";
import type { BackrestConfig, BackrestPlan, BackrestRepository } from "@openapi/backrest.js";
import { remote } from "@pulumi/command";
import { all, ComponentResource, type ComponentResourceOptions, type Input, interpolate, jsonStringify, log, type Output, output, type Resource, type Unwrap, type UnwrappedArray } from "@pulumi/pulumi";
import { NodeSSH } from "node-ssh";
import type { BackupPlanItem, S3PreSyncArgs } from "./BackupPlanOrchestrator.ts";
import { BACKREST_GARAGE_REPO_ENV, BACKREST_GARAGE_REPO_FLAGS, backrestGarageRepoUri } from "./backrestGarage.ts";
import { BACKREST_LEDGER_PATH, type BackrestLedger, type LedgerRemovals, parseBackrestLedger, planLedgerRemovals, renderBackrestLedger } from "./backrestLedger.ts";
import type { DockgeLxc } from "./DockgeLxc.ts";
import type { GlobalResources } from "./globals.ts";
import type { ProxmoxBackupServerLxc } from "./ProxmoxBackupServerLxc.ts";
import type { ClusterDefinition, ProxmoxBackupServerLxcDefinition } from "./store/interfaces.ts";

/**
 * Plan ids that must be REMOVED from every backrest config, while their repos
 * are left exactly as they are.
 *
 * These are the four host-level dockge plans that per-stack plans replaced.
 * When they were retired, `updateBackrestConfiguration` merged rather than
 * replaced -- it had no notion of a plan going away -- so simply ceasing to emit
 * them would have left them in config.json, still running their whole-host
 * ON_ERROR_FATAL pre-sync into a staging tree nothing else maintains, still
 * pushing to Gatus tokens whose endpoints no longer exist. Removing the PLAN
 * stops the work; leaving the REPO keeps every existing snapshot restorable,
 * since a restic history cannot be carried across a rename
 * (`BackupPlanItem.name` is the repo id).
 *
 * Plans the director stops emitting now leave through the ledger
 * (components/backrestLedger.ts), which takes the repo entry with them. This
 * list stays for these four because keeping their repos browsable, as a frozen
 * archive, is the point.
 *
 * The repos keep their own prune/check schedules and will go on tidying
 * themselves. That is harmless. Delete these ids -- and the
 * /data/backup/<id>/ directories -- by hand once the archive has aged out.
 */
export const RETIRED_BACKREST_PLANS: readonly string[] = ["celestia-dockge", "alpha-site-dockge", "luna-dockge", "skystar-dockge"];

/**
 * When every plan on a host starts: 01:00 in the host's own timezone.
 *
 * A fixed time, not `CLOCK_LAST_RUN_TIME` with `maxFrequencyDays: 1`. That
 * clock schedules the next run 24 hours after the previous one FINISHES, and
 * Backrest runs one task at a time, so every queue delay and every slow run
 * pushed the next start later. `home-operations` started at 23:15, then 01:34,
 * then 03:28 (2026-09-26 → 09-29), walking the queue around the clock while the
 * copy jobs below fire at fixed UTC times. With one fixed start the queue drains
 * in the same window every night, and the copies can be timed after it.
 *
 * CLOCK_LOCAL is the backrest container's TZ (TIMEZONE in its compose.yaml).
 * The repos' prune and check schedules keep CLOCK_LAST_RUN_TIME on purpose:
 * maintenance may drift.
 */
const BACKREST_PLAN_SCHEDULE: BackrestPlan["schedule"] = { cron: "0 1 * * *", clock: "CLOCK_LOCAL" };

/**
 * Copy-job schedules, in UTC: NCronJob's default, and the backups container
 * sets no TZ. Each one runs after what it copies, so a copy carries that day's
 * snapshot:
 *
 *   14:00  VolSync movers run (ReplicationSource `0 14 * * *`), done by ~14:20
 *   15:00  celestia copies the VolSync repos from TrueNAS into /data/backup
 *   16:00  luna and skystar copy celestia's repos, VolSync and Backrest alike
 *
 * Backrest's queue starts at 01:00 local, 05:00 or 06:00 UTC. The longest night
 * in the 2026-09-27 → 09-29 logs ran about six and a half hours, so it is done
 * well before 16:00. Before this the copies ran at 10:00 and 04:00 UTC, and a
 * VolSync snapshot waited about 38 hours to reach luna and skystar; now it is
 * about two.
 */
const VOLSYNC_LOCAL_COPY_SCHEDULE = "0 15 * * *";
const REMOTE_COPY_SCHEDULE = "0 16 * * *";

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

  /**
   * Configure one host's backrest and copy jobs from the plan inventory.
   *
   * `pbs` is optional: a host without a Proxmox Backup Server has no /data
   * (alpha-site). It takes no copies and browses no VolSync repos, and every
   * plan it runs must keep its repo in Garage.
   */
  public createPlans(
    source: {
      dockge: DockgeLxc;
      pbs?: ProxmoxBackupServerLxc;
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
    pbs: ProxmoxBackupServerLxc | undefined,
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
    // No backup server, no /data: nowhere to keep a copy or browse a VolSync repo.
    const hasLocalRepos = pbs !== undefined;
    const sourcePlans = plans.filter(p => p.source === clusterKey && p.source !== "volsync");
    // A Garage-backed repo is never copied: Garage replicates it, and TrueNAS
    // pulls the bucket (components/garageTruenasCopy.ts).
    const destinationPlans = hasLocalRepos ? plans.filter(p => p.source !== clusterKey && p.source !== "volsync" && !p.garage) : [];
    const volsyncPlans = hasLocalRepos ? plans.filter(p => p.source === "volsync") : [];

    const stranded = sourcePlans.filter(p => !p.garage);
    if (!hasLocalRepos && stranded.length > 0) {
      throw new Error(
        `${clusterKey} has no backup server, so no /data for local repos, but plan(s) ${stranded.map(p => p.name).join(", ")} keep their repo on the host. Give them a Garage repo in stacks/backups (\`garage\` on the plan).`,
      );
    }

    const destinationJobTasks = destinationPlans.map(plan => {
      const planServer = backupServers.find(s => s.cluster.key === plan.source);
      const copyToken = toGatusKey(destinationGroupTitle, plan.name);
      return {
        name: plan.name,
        schedule: REMOTE_COPY_SCHEDULE,
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
          schedule: VOLSYNC_LOCAL_COPY_SCHEDULE,
          sourceType: "local" as const,
          source: plan.path,
          destinationType: "local" as const,
          destination: `/data/backup/${plan.name}/`,
          token: copyToken,
        };
      }
      return {
        name: plan.name,
        schedule: REMOTE_COPY_SCHEDULE,
        sourceType: "sftp" as const,
        source: `${celestiaServer?.dockge.ssh.hostname}/backup/${plan.name}/`,
        destinationType: "local" as const,
        destination: `/data/backup/${plan.name}/`,
        token: copyToken,
      };
    });

    // A host with no local repos runs no copy service, so it gets no job file.
    const copyJobs = hasLocalRepos ? [addBackupJobs(`copy-${clusterKey}`, dockgeConnection, [...destinationJobTasks, ...volsyncJobTasks], this, depends)] : [];

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

    const allDeps = all([depends, uptime, ...copyJobs]).apply(d => d.flat());

    // Only the plans this host actually RUNS need an rclone remote. A
    // destination host copies finished repos over SFTP and never touches the
    // bucket, so shipping it these credentials would be gratuitous spread.
    const rcloneConfig = renderRcloneConfig(sourcePlans);

    // The Backrest repos this host receives from their own hosts. None of them
    // may be a plan or repo in this host's Backrest as well: the copy job would
    // sync over whatever it wrote (see planLedgerRemovals). VolSync repos are
    // not in this list, because the director deliberately registers them here
    // for browsing.
    const copied = destinationJobTasks.map(task => task.name);

    return output(this.updateBackrestConfiguration(dockgeConnection, cluster, allDeps, backrestItems, copied, rcloneConfig));
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
    // The failure push carries backrest's OWN error text. Without it a failing
    // plan tells you THAT it broke and nothing about WHY: diagnosing the first
    // two real failures (2026-08-23/24) took host SSH, a hand-run rclone
    // reproduction, and a dead end in backrest's zstd-compressed task-log DB --
    // while the one-line cause had been sitting in backrest the whole time. The
    // copy jobs in docker/_common/backups/Playground.cs already send `error=`;
    // this is the source side catching up.
    //
    // Mechanics, all three parts load-bearing:
    //   {{ .ShellEscape .Error }}  backrest renders the template BEFORE the
    //                              shell sees it, and restic errors contain
    //                              quotes, colons and newlines -- unescaped,
    //                              the hook itself breaks and reports nothing.
    //   --data-urlencode           the error is a query VALUE; it routinely
    //                              contains &, = and / (paths).
    //   -G with -X POST            -G moves the encoded pairs into the query
    //                              string, -X POST keeps the method Gatus wants.
    hooks.push({
      conditions: ["CONDITION_SNAPSHOT_ERROR"],
      actionCommand: {
        command: `curl -sf -X POST -G -H "Authorization: Bearer ${sourceToken}" --data-urlencode "success=false" --data-urlencode error={{ .ShellEscape .Error }} "${uptimeUrl}/api/v1/endpoints/${sourceToken}/external" || true`,
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
      uri: plan.garage ? backrestGarageRepoUri(plan.garage, plan.name) : `/data/backup/${plan.name}/`,
      // A Garage repo names the key file and its profile, never the key
      // (components/backrestGarage.ts), and runs with Garage's region and
      // path-style lookup.
      ...(plan.garage
        ? {
            env: [...(plan.repositoryConfig?.env ?? []), ...BACKREST_GARAGE_REPO_ENV],
            flags: [...(plan.repositoryConfig?.flags ?? []), ...BACKREST_GARAGE_REPO_FLAGS],
          }
        : {}),
      autoUnlock: true,
    };

    const backrestPlan: BackrestPlan = {
      retention: {
        policyTimeBucketed: { daily: 7, weekly: 4, monthly: 3, keepLastN: 10 },
      },
      skipIfUnchanged: true,
      schedule: BACKREST_PLAN_SCHEDULE,
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
    copied: readonly string[],
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
    let previousLedger: BackrestLedger | undefined;

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

      previousLedger = await readBackrestLedger(ssh, cluster.key);

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
    const emitted = { plans: items.plans.map(p => p.id), repos: items.repos.map(r => r.id) };
    const removals = planLedgerRemovals({ previous: previousLedger, emitted, config: updatedConfig, host: cluster.key, copied });
    applyLedgerRemovals(updatedConfig, removals, cluster.key, copied);
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

    // What this run emitted, for the next run to diff against
    // (components/backrestLedger.ts). Written only once config.json has been:
    // if this write fails, the next run reads the previous ledger, recomputes
    // the same removals, finds them already applied, and moves on. The reverse
    // order could record a removal that config.json never received, and the
    // leftover would then be forgotten for good.
    copyFileToRemote("backrest-ledger.json", {
      content: renderBackrestLedger(emitted),
      connection: connection,
      remotePath: BACKREST_LEDGER_PATH,
      dependsOn: [backrestConfig],
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

      // copyFileToRemote leaves the file world-readable, and these are live S3
      // credentials. 65534 is the uid backrest ran as before phase 1; it now
      // runs as uid 0 and reads the file through DAC_READ_SEARCH
      // (docker/_common/backrest/compose.yaml).
      const perms = directorResourceName(cluster.key, "backrest-rclone-garage-perms");
      rcloneDeps.push(
        new remote.Command(
          perms.name,
          {
            connection: connection,
            triggers: [rcloneConfig],
            create: `chmod 600 ${RCLONE_CONFIG_PATH} && chown 65534:65534 ${RCLONE_CONFIG_PATH}`,
          },
          { parent: this, dependsOn: [rcloneFile], aliases: perms.aliases },
        ),
      );
    }

    const restart = directorResourceName(cluster.key, "backrest-restart");
    const compose = new remote.Command(
      restart.name,
      {
        connection: connection,
        triggers: [...items.repos.map(z => z.uri), ...items.plans.map(z => z.repo), ...(rcloneConfig ? [rcloneConfig] : []), managedConfigDigest(items, updatedConfig)],
        create: interpolate`cd /opt/stacks/backrest && docker compose -f compose.yaml build && docker compose -f compose.yaml up -d && docker compose -f compose.yaml restart`,
      },
      {
        parent: this,
        dependsOn: output(depends).apply(x => [...x, backrestConfig, ...rcloneDeps]),
        aliases: restart.aliases,
      },
    );

    return compose;
  }
}

/**
 * Hosts whose director made its fixed-name Commands before the names carried
 * the host. stacks/home now runs two directors (celestia's and alpha-site's),
 * and two `backrest-restart`s in one stack would be the same resource, so every
 * name is scoped by host. These hosts keep their existing Commands through an
 * alias: a rename without one is a replace, which re-runs `create` and
 * restarts backrest for no change.
 */
const PRE_SCOPED_DIRECTOR_HOSTS: ReadonlySet<string> = new Set(["celestia", "luna", "skystar"]);

/** A director resource's name, scoped by host, and the alias that keeps an older unscoped one. */
function directorResourceName(clusterKey: string, name: string): { name: string; aliases: { name: string }[] } {
  return { name: `${clusterKey}-${name}`, aliases: PRE_SCOPED_DIRECTOR_HOSTS.has(clusterKey) ? [{ name }] : [] };
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

/**
 * The host's ledger, read over the session that just read config.json, or
 * undefined when there is none, which leaves only the seed owned.
 *
 * A missing file is the normal first-run state. Any other failure, and any
 * malformed content, is logged and treated the same way rather than failing
 * the run: see parseBackrestLedger for why falling back to the seed is the safe
 * direction.
 */
async function readBackrestLedger(ssh: NodeSSH, clusterKey: string): Promise<BackrestLedger | undefined> {
  const result = await ssh.execCommand(`cat ${BACKREST_LEDGER_PATH}`);
  if (result.code !== 0) {
    if (!/No such file/.test(result.stderr)) {
      log.warn(`Could not read ${BACKREST_LEDGER_PATH} on ${clusterKey} (${result.stderr.trim() || `exit ${result.code}`}); falling back to the seed.`);
    }
    return undefined;
  }

  const { ledger, problem } = parseBackrestLedger(result.stdout);
  if (problem) {
    log.warn(`Ignoring ${BACKREST_LEDGER_PATH} on ${clusterKey}: ${problem}. Falling back to the seed, so anything only that ledger knew about stays in config.json until removed by hand.`);
  }
  return ledger;
}

/** Applies planLedgerRemovals' result to the config, and says what it did in the run log. */
function applyLedgerRemovals(updatedConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }, removals: LedgerRemovals, clusterKey: string, copied: readonly string[]) {
  const isCopy = new Set(copied);
  const describe = (ids: string[]) => ids.map(id => (isCopy.has(id) ? `${id} (received as a copy)` : id)).join(", ");
  if (removals.plans.length > 0) {
    const drop = new Set(removals.plans);
    updatedConfig.plans = updatedConfig.plans.filter(p => !drop.has(p.id));
    log.info(`Removed ${removals.plans.length} backrest plan(s) the director does not run on ${clusterKey}: ${describe(removals.plans)}`);
  }
  if (removals.repos.length > 0) {
    const drop = new Set(removals.repos);
    updatedConfig.repos = updatedConfig.repos.filter(r => !drop.has(r.id));
    log.info(`Removed ${removals.repos.length} backrest repo(s) the director does not manage on ${clusterKey}; their data stays on disk: ${describe(removals.repos)}`);
  }
  for (const { id, usedBy } of removals.keptRepos) {
    if (isCopy.has(id)) {
      log.warn(
        `Kept backrest repo ${id} on ${clusterKey} because plan(s) ${usedBy.join(", ")} still use it, but ${clusterKey} receives this repo as a copy: the copy job syncs over whatever those plans write. Point them at another repo.`,
      );
    } else {
      log.warn(`Kept backrest repo ${id} on ${clusterKey}: the director no longer emits it, but plan(s) ${usedBy.join(", ")} still use it.`);
    }
  }
}

/**
 * A digest of what this run asks Backrest to run, for backrest-restart's
 * triggers.
 *
 * Backrest reads config.json when it starts, so a changed file does nothing
 * until the container restarts. The other triggers only move when a repo URI or
 * a plan's repo changes. A new schedule, hook or retention, or a removed plan,
 * would land on disk and sit there unused until something else restarted
 * Backrest.
 *
 * The digest covers the emitted plans and repos, sorted so an upstream reorder
 * is not a change, plus the plan and repo ids left in the final config, so a
 * removal counts once and not again on the next run. Fields Backrest writes for
 * itself (a repo's `guid` after auto-init, `modno`) are not in it, so the
 * restart stays tied to changes Pulumi made. It is a one-way hash, so the repo
 * passwords inside do not reach the stack state.
 */
function managedConfigDigest(items: { repos: BackrestRepository[]; plans: BackrestPlan[] }, finalConfig: { repos: BackrestRepository[]; plans: BackrestPlan[] }): string {
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const ids = (entries: { id: string }[]) => entries.map(e => e.id).sort((a, b) => a.localeCompare(b));
  return createHash("sha256")
    .update(
      JSON.stringify({
        plans: [...items.plans].sort(byId),
        repos: [...items.repos].sort(byId),
        present: { plans: ids(finalConfig.plans), repos: ids(finalConfig.repos) },
      }),
    )
    .digest("hex");
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
 *
 * The `mkdir -p` in front is load-bearing. `rclone sync` from an EMPTY source
 * exits 0 and never creates the destination root (verified against rclone
 * 1.75.1), so the hook "succeeds" and restic then fails the plan with
 * `path ... does not exist`. That is what equestria-garage-outline did from
 * 2026-09-18 until Outline's first upload on 2026-09-23: the bucket was
 * declared, annotated and still empty, and every nightly run went red on a
 * directory rclone had no reason to make. An empty staging tree snapshots as an
 * empty snapshot -- the correct backup of an empty source -- and
 * `skipIfUnchanged` keeps the repeats free.
 */
function preSyncCommand(plan: BackupPlanItem): string {
  return `mkdir -p '${plan.path}' && ${syncCommand(plan)}`;
}

function syncCommand(plan: BackupPlanItem): string {
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
