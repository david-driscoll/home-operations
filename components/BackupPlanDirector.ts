import { GlobalResources } from "./globals.ts";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, log, Output, output, Resource, Unwrap, UnwrappedArray, UnwrappedObject } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { addUptimeGatus, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
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
  private readonly sftpKey: Output<SshKeyDefinition>;

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
    this.plans = args.globals.store.getBackupPlans<BackupPlanItem>().apply((z) => z.flatMap((x) => x.plans));
    this.volsyncPassword = this.globals.store.getSecretByTitle<{ credential: string }>("Volsync Password").apply((z) => z.credential);
    this.sftpKey = this.globals.store.getSecretByTitle<SshKeyDefinition>("Rclone SFTP Key");
  }

  public createPlans(
    source: Input<{
      dockge: DockgeLxc;
      pbs: ProxmoxBackupServerLxc;
      cluster: Input<ClusterDefinition>;
    }>,
    depends: Input<Resource[]>,
  ) {
    return all([source, this.globals.store.proxmoxBackupServers(), this.plans, this.uptimeUrl, this.volsyncPassword, this.sftpKey]).apply(
      ([source, backupServers, plans, uptimeUrl, volsyncPassword, sftpKey]) => {
        return output({ connection: source.dockge.remoteConnection, cluster: source.cluster })
          .apply(c => this._createPlans(source, c, backupServers, plans, uptimeUrl, volsyncPassword, sftpKey, depends));
      },
    );
  }

  public _createPlans(
    source: UnwrappedObject<{ dockge: DockgeLxc; pbs: ProxmoxBackupServerLxc; cluster: ClusterDefinition }>,
    dockgeConnection: Unwrap<Connection>,
    backupServers: UnwrappedArray<ProxmoxBackupServerLxcDefinition>,
    plans: UnwrappedArray<BackupPlanItem>,
    uptimeUrl: string,
    volsyncPassword: string,
    sftpKey: SshKeyDefinition,
    depends: Input<Resource[]>,
  ) {
    const clusterKey = source.cluster.key;
    const sourceGroupTitle = `Backups: ${source.cluster.title}`;
    const destinationGroupTitle = `Copy: ${source.cluster.title}`;
    const sourcePlans = plans.filter((p) => p.source === clusterKey);
    const destinationPlans = plans.filter((p) => p.source !== clusterKey);

    // Set up sftpKey on source PBS for outbound rclone connections to remote dockge rclone-sftp servers
    const keySetup = new remote.Command(
      `${clusterKey}-pbs-key-setup`,
      {
        connection: source.pbs.remoteConnection,
        create: `mkdir -p /etc/backup/ssh && chmod 700 /etc/backup/ssh`,
      },
      { parent: this, dependsOn: depends },
    );

    const privateKeyFile = copyFileToRemote(`${clusterKey}-pbs-private-key`, {
      content: sftpKey["private key"],
      remotePath: "/etc/backup/ssh/id_ed25519",
      connection: source.pbs.remoteConnection,
      parent: this,
      dependsOn: output(depends).apply((d) => [keySetup, ...d]),
    });

    const chmodKey = privateKeyFile.apply(
      (f) =>
        new remote.Command(
          `${clusterKey}-pbs-key-chmod`,
          {
            connection: source.pbs.remoteConnection,
            create: "chmod 600 /etc/backup/ssh/id_ed25519",
            triggers: [sftpKey["private key"]],
          },
          { parent: this, dependsOn: [f] },
        ),
    );

    // Allow inbound access from holders of the shared sftpKey
    const authorizedKey = new remote.Command(
      `${clusterKey}-pbs-authorized-key`,
      {
        connection: source.pbs.remoteConnection,
        create: `mkdir -p /root/.ssh && echo "${sftpKey["public key"]}" | tee -a /root/.ssh/authorized_keys && sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys`,
      },
      { parent: this, dependsOn: depends },
    );

    // rclone config for pulling from other clusters' dockge rclone-sftp servers
    const otherServers = backupServers.filter((s) => s.cluster.key !== clusterKey);
    const rcloneConfigContent = otherServers
      .map(
        (server) => `[${server.cluster.key}]
type = sftp
host = ${server.dockge.ssh.hostname}
port = 2022
user = root
key_file = /etc/backup/ssh/id_ed25519
shell_type = none
`,
      )
      .join("\n");

    const rcloneConfig = copyFileToRemote(`${clusterKey}-pbs-rclone-config`, {
      content: rcloneConfigContent,
      remotePath: "/etc/backup/rclone.conf",
      connection: source.pbs.remoteConnection,
      parent: this,
      dependsOn: output(depends).apply((d) => [keySetup, ...d]),
    });

    const resticPassword = copyFileToRemote(`${clusterKey}-pbs-restic-password`, {
      content: volsyncPassword,
      remotePath: "/etc/backup/restic-password",
      connection: source.pbs.remoteConnection,
      parent: this,
      dependsOn: output(depends).apply((d) => [keySetup, ...d]),
    });

    const perPlanResources: Input<Resource>[] = [];

    for (const plan of destinationPlans) {
      const planSource = plan.source; // rclone remote name = source cluster key
      const copyToken = toGatusKey(destinationGroupTitle, plan.name);

      const initRepo = new remote.Command(
        `${clusterKey}-pbs-restic-init-${plan.name}`,
        {
          connection: source.pbs.remoteConnection,
          create: `RESTIC_PASSWORD_FILE="/etc/backup/restic-password" restic -r /data/backup/${plan.name}/ init 2>/dev/null || true`,
        },
        { parent: this, dependsOn: output(depends).apply((d) => [resticPassword, keySetup, ...d]) },
      );

      const copyScript = `#!/bin/bash
set -euo pipefail
TOKEN="${copyToken}"
UPTIME_URL="${uptimeUrl}"
report() { curl -sf -X POST -H "Authorization: Bearer $TOKEN" "$UPTIME_URL/api/v1/endpoints/$TOKEN/external?success=$1" || true; }
trap 'report false' ERR
export RESTIC_PASSWORD_FILE="/etc/backup/restic-password"
export RCLONE_CONFIG=/etc/backup/rclone.conf
restic -r rclone:${planSource}:/data/backup/${plan.name}/ copy --to /data/backup/${plan.name}/
report true
`;

      const baseDeps = output(depends).apply((d) => [keySetup, rcloneConfig, initRepo, chmodKey, authorizedKey, ...d]);

      const copyScriptFile = copyFileToRemote(`${clusterKey}-pbs-copy-script-${plan.name}`, {
        content: copyScript,
        remotePath: `/usr/local/bin/backup-copy-${plan.name}.sh`,
        connection: source.pbs.remoteConnection,
        parent: this,
        dependsOn: baseDeps,
        withRemoveCommand: true,
      });
      const copyServiceFile = copyFileToRemote(`${clusterKey}-pbs-copy-svc-${plan.name}`, {
        content: `[Unit]
Description=Restic copy: ${plan.name}
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup-copy-${plan.name}.sh
StandardOutput=journal
StandardError=journal
`,
        remotePath: `/etc/systemd/system/backup-copy-${plan.name}.service`,
        connection: source.pbs.remoteConnection,
        parent: this,
        dependsOn: baseDeps,
        withRemoveCommand: true,
      });
      const copyTimerFile = copyFileToRemote(`${clusterKey}-pbs-copy-timer-${plan.name}`, {
        content: `[Unit]
Description=Restic copy timer: ${plan.name}

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
`,
        remotePath: `/etc/systemd/system/backup-copy-${plan.name}.timer`,
        connection: source.pbs.remoteConnection,
        parent: this,
        dependsOn: baseDeps,
        withRemoveCommand: true,
      });

      const enable = all([copyScriptFile, copyServiceFile, copyTimerFile]).apply(
        (files) =>
          new remote.Command(
            `${clusterKey}-pbs-systemd-enable-${plan.name}`,
            {
              connection: source.pbs.remoteConnection,
              create: [`chmod 755 /usr/local/bin/backup-copy-${plan.name}.sh`, `systemctl daemon-reload`, `systemctl enable --now backup-copy-${plan.name}.timer`].join(" && "),
              triggers: [copyScript],
            },
            { parent: this, dependsOn: files },
          ),
      );

      perPlanResources.push(enable);
    }

    const backrestItems = [
      ...sourcePlans.map((plan) => this._createSourceBackrestPlan(dockgeConnection, plan, uptimeUrl, volsyncPassword)),
      ...destinationPlans.map((plan) => this._createDestinationRepository(plan, volsyncPassword)),
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
        "external-endpoints": [...sourcePlans.map((plan) => makeEndpoint(sourceGroupTitle, plan.name)), ...destinationPlans.map((plan) => makeEndpoint(destinationGroupTitle, plan.name))],
      },
      this,
    );

    const allDeps = all([depends, uptime, ...perPlanResources]).apply((d) => d.flat());

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
            "--sftp-user=nobody",
            "--sftp-key-file=/opt/stacks-data/backrest/ssh/id_ed25519",
            "--sftp-known-hosts-file=/opt/stacks-data/backrest/ssh/known_hosts",
            "--sftp-shell-type=none",
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

  private _createDestinationRepository(plan: BackupPlanItem, password: string) {
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