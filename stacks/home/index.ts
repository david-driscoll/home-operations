import type { AuthentikOutputs } from "@components/authentik.ts";
import { BackupPlanDirector } from "@components/BackupPlanDirector.ts";
import { Tailscale } from "@components/constants.ts";
import { awaitOutput } from "@components/helpers.ts";
import type { CredentialDefinition, PasswordDefinition, SshKeyDefinition } from "@components/store/index.ts";
import { TailscaleMonitor } from "@components/tailscale.ts";
import { CategoryEnum, OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import * as minio from "@pulumi/minio";
import * as pulumi from "@pulumi/pulumi";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { GlobalResources } from "../../components/globals.ts";
import { ProxmoxBackupServerLxc } from "../../components/ProxmoxBackupServerLxc.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";
// import * as b2 from "@pulumi/b2";
import { createGatusDnsUptime } from "../../components/StandardDns.ts";
import { TruenasVm } from "../../components/TruenasVm.ts";

const globals = new GlobalResources({}, {});
const monitor = new TailscaleMonitor();
const backupDirector = new BackupPlanDirector("backup-plan-director", {
  globals,
});

const outputs = globals.store.getSecretByTitle<AuthentikOutputs>("Authentik Outputs");
const sftpClientKey = globals.store.getSecretByTitle<SshKeyDefinition>("Rclone SFTP Key");
const mainProxmoxCredentials = globals.store.getSecretByTitle<CredentialDefinition & { arch: string }>("Proxmox ApiKey");
const alphaSiteProxmoxCredentials = globals.store.getSecretByTitle<CredentialDefinition & { arch: string }>("Alpha Site Proxmox ApiKey");
const dockgeCredential = globals.store.getSecretByTitle<PasswordDefinition>("Dockge Credential");
const celestiaCluster = globals.store.getCluster("Cluster: Celestia");
const alphaSiteCluster = globals.store.getCluster("Cluster: Alpha Site");
const _minioBucket = new minio.S3Bucket(
  `home-operations-minio-bucket`,
  {
    acl: "private",
    bucket: pulumi.interpolate`home-operations`,
  },
  {
    provider: globals.truenasMinioProvider,
    protect: true,
    retainOnDelete: true,
    import: "home-operations",
  },
);

const twilightSparkleHost = new ProxmoxHost("twilight-sparkle", {
  title: "Twilight Sparkle",
  globals: globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.100",
  tailscaleIpAddress: "100.111.10.100",
  proxmox: mainProxmoxCredentials,
  remote: false,
  cluster: celestiaCluster,
  peerRelay: "unifi",
  tailscaleArgs: {
    advertiseExitNode: true,
    acceptRoutes: false,
  },
  tailscaleSubnetRoutes: [],
  vmIdRange: { start: 102, end: 199 },
});
const spikeVm = new TruenasVm("spike", {
  credential: globals.truenasCredential.meta.title,
  globals: globals,
  host: twilightSparkleHost,
  ipAddress: pulumi.output("10.10.10.10"),
  tailscaleIpAddress: "100.111.10.10",
});

const thanosStorage = new minio.S3Bucket(
  `thanos-storage`,
  {
    acl: "private",
    bucketPrefix: "thanos",
  },
  {
    provider: globals.truenasMinioProvider,
    protect: false,
    retainOnDelete: true,
  },
);

const _thanosMinioSecret = new OnePasswordItem("thanos-minio-secret", {
  title: "Thanos S3 Storage",
  category: CategoryEnum.APICredential,
  fields: {
    username: {
      type: TypeEnum.String,
      value: globals.truenasMinioProvider.minioUser,
    },
    password: {
      type: TypeEnum.Concealed,
      value: globals.truenasMinioProvider.minioPassword,
    },
    bucket: { type: TypeEnum.String, value: thanosStorage.bucket },
    endpoint: {
      type: TypeEnum.String,
      value: globals.truenasMinioProvider.minioServer,
    },
  },
});

const celestiaHost = new ProxmoxHost("celestia", {
  globals: globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: false,
  cluster: celestiaCluster,
  peerRelay: "unifi",
  tailscaleArgs: {
    advertiseExitNode: true,
    acceptRoutes: false,
  },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: { start: 302, end: 399 },
});
const celestiaBackupMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/backup/");
const celestiaDataMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/data/");

const alphaSiteHost = new ProxmoxHost("alpha-site", {
  title: "Alpha Site",
  globals: globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.200",
  tailscaleIpAddress: "100.111.10.200",
  proxmox: alphaSiteProxmoxCredentials,
  installTailscale: false,
  remote: false,
  cluster: alphaSiteCluster,
  shortName: "as",
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: { start: 101, end: 199 },
});

const celestiaDockgeRuntime = new DockgeLxc("celestia-dockge", {
  globals,
  credential: dockgeCredential,
  host: celestiaHost,
  vmId: 300,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  monitor,
});
celestiaDockgeRuntime.addHostMount("/data");
celestiaDockgeRuntime.addHostMount(`/mnt/pve/${celestiaBackupMount}`, "/spike/backup");
celestiaDockgeRuntime.addHostMount(`/mnt/pve/${celestiaDataMount}`, "/spike/data");

const alphaSiteDockgeRuntime = new DockgeLxc("alpha-site-dockge", {
  globals,
  credential: dockgeCredential,
  host: alphaSiteHost,
  vmId: 100,
  ipAddress: "10.10.10.9",
  tailscaleIpAddress: "100.111.10.9",
  cluster: alphaSiteCluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  legacyTun: true, // jiangcuo ARM64 Proxmox port stubs out mknod; dev2 passthrough is unusable
  monitor,
});

const celestiaPbs = new ProxmoxBackupServerLxc("celestia-pbs", {
  globals,
  outputs,
  host: celestiaHost,
  vmId: 301,
  tailscaleArgs: { acceptDns: true, acceptRoutes: false, ssh: true },
  cluster: celestiaCluster,
  dockge: celestiaDockgeRuntime,
  dependsOn: [],
  tags: ["backup-source"],
});
celestiaPbs.addHostMount("/data");
celestiaPbs.addHostMount(`/mnt/pve/${celestiaBackupMount}`, "/spike/backup");
celestiaPbs.addHostMount(`/mnt/pve/${celestiaDataMount}`, "/spike/data");
// celestiaPbs.addDatastore({ name: "testing", path: "/data/testing", comment: "Testing Datastore behavior" });

// Celestia monitors twilight-sparkle + itself; alpha-site monitors only itself
const celestiaPveHosts = [twilightSparkleHost, celestiaHost];
const celestiaPveVariables = {
  PROXMOX_BLACKBOX_TARGETS: `[${celestiaPveHosts.map(h => `"https://${h.tailscaleIpAddress}:8006"`).join(", ")}]`,
  PROXMOX_PVE_TARGETS: `[${celestiaPveHosts.map(h => `"${h.tailscaleIpAddress}:8006"`).join(", ")}]`,
  DNS_CLUSTER_IS_PRIMARY: "true",
};

const _alphaSitePveVariables = {
  PROXMOX_BLACKBOX_TARGETS: `["https://${alphaSiteHost.tailscaleIpAddress}:8006"]`,
  PROXMOX_PVE_TARGETS: `["${alphaSiteHost.tailscaleIpAddress}:8006"]`,
};

await awaitOutput(
  alphaSiteDockgeRuntime.deployStacks({
    dependsOn: [celestiaPbs],
    variables: celestiaPveVariables,
  }),
);
await awaitOutput(alphaSiteHost.addUptimeGatus());

await awaitOutput(
  celestiaDockgeRuntime.deployStacks({
    dependsOn: [celestiaPbs],
    variables: celestiaPveVariables,
  }),
);
await awaitOutput(celestiaHost.addUptimeGatus());

await awaitOutput(twilightSparkleHost.addUptimeGatus());
await awaitOutput(createGatusDnsUptime(globals, { parent: alphaSiteHost }));
await awaitOutput(
  backupDirector.createPlans(
    {
      dockge: celestiaDockgeRuntime,
      pbs: celestiaPbs,
      cluster: celestiaCluster,
    },
    [celestiaPbs],
  ),
);

monitor.exportNodeStateToOnePassword(
  [
    {
      name: twilightSparkleHost.tailscaleName,
      ip: twilightSparkleHost.tailscaleIpAddress,
      nodeType: "proxmox",
    },
    {
      name: celestiaHost.tailscaleName,
      ip: celestiaHost.tailscaleIpAddress,
      nodeType: "proxmox",
    },
    {
      name: alphaSiteHost.tailscaleName,
      ip: alphaSiteHost.tailscaleIpAddress,
      nodeType: "proxmox",
    },
    {
      name: celestiaDockgeRuntime.tailscaleName,
      ip: celestiaDockgeRuntime.tailscaleIpAddress,
      internalIp: celestiaDockgeRuntime.ipAddress,
      nodeType: "dockge",
    },
    {
      name: celestiaPbs.tailscaleName,
      ip: celestiaPbs.tailscaleIpAddress,
      nodeType: "pbs",
    },
    {
      name: alphaSiteDockgeRuntime.tailscaleName,
      ip: alphaSiteDockgeRuntime.tailscaleIpAddress,
      internalIp: alphaSiteDockgeRuntime.ipAddress,
      nodeType: "dockge",
    },
    {
      name: spikeVm.tailscaleName,
      ip: spikeVm.tailscaleIpAddress,
      internalIp: spikeVm.ipAddress,
      nodeType: "truenas",
    },
  ],
  { parent: alphaSiteHost },
);

export const alphaSite = {
  proxmox: getProxmoxProperties(alphaSiteHost),
  // dockge: getDockageProperties(alphaSiteDockgeRuntime),
  backup: alphaSiteHost.backupVolumes!,
};
export const twilightSparkle = {
  proxmox: getProxmoxProperties(twilightSparkleHost),
};
export const celestia = {
  proxmox: getProxmoxProperties(celestiaHost),
  dockge: getDockageProperties(celestiaDockgeRuntime),
  backup: celestiaHost.backupVolumes!,
};
