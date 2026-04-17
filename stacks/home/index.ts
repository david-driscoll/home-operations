import * as pulumi from "@pulumi/pulumi";
import * as pbs from "@pulumi/pbs";
import * as random from "@pulumi/random";
import * as firewall from "@pulumi/terrifi";
import { ClusterDefinition, createClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getProxmoxProperties, ProxmoxHost } from "./ProxmoxHost.js";
import { DockgeLxc, getDockageProperties } from "./DockgeLxc.ts";
import { ProxmoxBackupServerLxc, getProxmoxBackupServerLxcProperties } from "./ProxmoxBackupServerLxc.ts";
import { TruenasVm } from "./TruenasVm.ts";
import * as minio from "@pulumi/minio";
// import * as b2 from "@pulumi/b2";
import { updateTailscaleAcls } from "./tailscale.ts";
import { getDeviceOutput } from "@pulumi/tailscale";
import { configureAdGuard } from "./adguard.ts";
import { gatusDnsRecords } from "./StandardDns.ts";
import { addUptimeGatus, awaitOutput } from "@components/helpers.ts";
import { OnePasswordItem } from "@openapi/aliases.js";
import * as tls from "@pulumi/tls";
import { endpoint } from "@muhlba91/pulumi-proxmoxve/config/vars.js";
import { CategoryEnum, OnePasswordItem as OPI, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { createBackupJobs } from "./backups.ts";
import { TailscaleAclManager } from "./tailscale/manager.ts";
import { TailscaleService } from "@openapi/tailscale-grants.js";
import { AuthentikOutputs } from "@components/authentik.ts";
import { remote } from "@pulumi/command";
import { Tailscale } from "@components/constants.ts";

const globals = new GlobalResources({}, {});
// Generate SFTP server host key and a single client key (authorized key)
const sftpClientKey = new tls.PrivateKey("rclone-sftp-client", { algorithm: "ED25519" });
// Export for client usage (e.g., rclone-jobs)
export const sftpClientPublicKey = tls.getPublicKeyOutput({ privateKeyPem: sftpClientKey.privateKeyPem }).publicKeyOpenssh;

const op = new OPClient();

const outputs = new AuthentikOutputs(await op.getItemByTitle("Authentik Outputs"));
const mainProxmoxCredentials = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const alphaSiteProxmoxCredentials = pulumi.output(op.getItemByTitle("Alpha Site Proxmox ApiKey"));
const dockgeCredential = pulumi.output(op.getItemByTitle("Dockge Credential"));
const celestiaCluster = pulumi.output(op.getItemByTitle("Cluster: Celestia")).apply(createClusterDefinition);
const lunaCluster = pulumi.output(op.getItemByTitle("Cluster: Luna")).apply(createClusterDefinition);
const alphaSiteCluster = pulumi.output(op.getItemByTitle("Cluster: Alpha Site")).apply(createClusterDefinition);
const equestriaCluster = pulumi.output(op.getItemByTitle("Cluster: Equestria")).apply(createClusterDefinition);
const sgcCluster = pulumi.output(op.getItemByTitle("Cluster: Stargate Command")).apply(createClusterDefinition);

const minioBucket = new minio.S3Bucket(
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
  internalIpAddress: "10.10.10.100",
  tailscaleIpAddress: "100.111.10.100",
  macAddress: "58:47:ca:7b:a9:9d",
  proxmox: mainProxmoxCredentials,
  remote: false,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [],
});
const spikeVm = new TruenasVm("spike", {
  credential: globals.truenasCredential.apply((z) => z.title!),
  globals: globals,
  host: twilightSparkleHost,
  ipAddress: pulumi.output("10.10.10.10"),
  tailscaleIpAddress: "100.111.10.10",
  macAddress: "bc:24:11:7c:e5:c5",
});

const celestiaHost = new ProxmoxHost("celestia", {
  globals: globals,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  macAddress: "c8:ff:bf:03:cc:4c",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: false,
  cluster: celestiaCluster,
  peerRelay: true,
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
});
const celestiaBackupMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/backup/");
const celestiaDataMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/data/");

const lunaHost = new ProxmoxHost("luna", {
  globals: globals,
  tailscaleIpAddress: "100.111.10.104",
  macAddress: "c8:ff:bf:03:c9:1e",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: true,
  cluster: lunaCluster,
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
});
const lunaBackupMount = lunaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/backup/");
const lunaDataMount = lunaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/data/");

const alphaSiteHost = new ProxmoxHost("alpha-site", {
  globals: globals,
  internalIpAddress: "10.10.10.200",
  tailscaleIpAddress: "100.111.10.200",
  macAddress: "e4:5f:01:90:36:22",
  proxmox: alphaSiteProxmoxCredentials,
  installTailscale: false,
  remote: false,
  cluster: alphaSiteCluster,
  shortName: "as",
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
});

const tailscaleServices: TailscaleService[] = [];
const registerTailscaleService = (service: string) => tailscaleServices.push(`svc:${service}` as TailscaleService);

const celestiaDockgeRuntime = new DockgeLxc("celestia-dockge", {
  globals,
  credential: dockgeCredential,
  host: celestiaHost,
  vmId: 300,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  registerTailscaleService,
});
celestiaDockgeRuntime.addHostMount("/data");
celestiaDockgeRuntime.addHostMount(`/mnt/pve/${celestiaBackupMount}`, "/spike/backup");
celestiaDockgeRuntime.addHostMount(`/mnt/pve/${celestiaDataMount}`, "/spike/data");

const lunaDockgeRuntime = new DockgeLxc("luna-dockge", {
  globals,
  credential: dockgeCredential,
  host: lunaHost,
  vmId: 400,
  cluster: lunaCluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  registerTailscaleService,
});
lunaDockgeRuntime.addHostMount("/data");
lunaDockgeRuntime.addHostMount(`/mnt/pve/${lunaBackupMount}`, "/spike/backup");
lunaDockgeRuntime.addHostMount(`/mnt/pve/${lunaDataMount}`, "/spike/data");

// const celestiaPbs = new ProxmoxBackupServerLxc("celestia-pbs", {
//   globals,
//   outputs,
//   host: celestiaHost,
//   vmId: 301,
//   tailscaleArgs: { acceptDns: true, acceptRoutes: false, ssh: true },
//   cluster: celestiaCluster,
//   dockge: celestiaDockgeRuntime,
// });

// const lunaPbs = new ProxmoxBackupServerLxc("luna-pbs", {
//   globals,
//   outputs,
//   host: lunaHost,
//   vmId: 401,
//   tailscaleArgs: { acceptDns: true, acceptRoutes: false, ssh: true },
//   cluster: lunaCluster,
//   dockge: lunaDockgeRuntime,
// });

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
  registerTailscaleService,
});

function getTailscaleIp(name: string) {
  return getDeviceOutput({ hostname: name }, { provider: globals.tailscaleProvider })
    .apply((ip) => {
      pulumi.log.info(`Got Tailscale IP for ${name}: ${ip.addresses.join(", ")}`);
      return ip;
    })
    .apply((z) => z.addresses[0]);
}

const primaryDns = getTailscaleIp("adguard-home");
const secondaryDns = alphaSiteDockgeRuntime.tailscaleIpAddress;
const unifiDns = "100.111.0.1";

updateTailscaleAcls({
  globals,
  services: tailscaleServices,
  hosts: [
    ["idp", getTailscaleIp("idp")],
    ["primary-dns", primaryDns],
    ["secondary-dns", secondaryDns],
    ["unifi-dns", unifiDns],
    [alphaSiteHost.tailscaleName, alphaSiteHost.tailscaleIpAddress],
    [alphaSiteDockgeRuntime.tailscaleName, alphaSiteDockgeRuntime.tailscaleIpAddress],
    [celestiaHost.tailscaleName, celestiaHost.tailscaleIpAddress],
    [celestiaDockgeRuntime.tailscaleName, celestiaDockgeRuntime.tailscaleIpAddress],
    [lunaHost.tailscaleName, lunaHost.tailscaleIpAddress],
    [lunaDockgeRuntime.tailscaleName, lunaDockgeRuntime.tailscaleIpAddress],
    [spikeVm.tailscaleName, spikeVm.tailscaleIpAddress],
    [twilightSparkleHost.tailscaleName, twilightSparkleHost.tailscaleIpAddress],
  ],
  internalIps: [spikeVm.ipAddress, celestiaDockgeRuntime.ipAddress, lunaDockgeRuntime.ipAddress, alphaSiteDockgeRuntime.ipAddress /*, celestiaPbs.ipAddress, lunaPbs.ipAddress*/],
  tests: {
    dockgeDevices: [alphaSiteDockgeRuntime.tailscaleName, celestiaDockgeRuntime.tailscaleName, lunaDockgeRuntime.tailscaleName],
    proxmoxDevices: [alphaSiteHost.tailscaleName, celestiaHost.tailscaleName, lunaHost.tailscaleName, twilightSparkleHost.tailscaleName],
    taggedDevices: [alphaSiteDockgeRuntime.tailscaleName, celestiaHost.tailscaleName, twilightSparkleHost.tailscaleName],
    kubernetesDevices: ["sgc", "equestria"],
  },
  dnsServers: [primaryDns, secondaryDns, unifiDns],
});

// const users = await tailscale.
// console.log(users);

celestiaDockgeRuntime.deployStacks({ dependsOn: [] });
lunaDockgeRuntime.deployStacks({ dependsOn: [] });
alphaSiteDockgeRuntime.deployStacks({ dependsOn: [] });
// createBackupJobs({ celestiaDockgeRuntime, lunaDockgeRuntime, globals });

const externalEndpoints = pulumi.all([celestiaDockgeRuntime.createBackupUptime(), lunaDockgeRuntime.createBackupUptime(), alphaSiteDockgeRuntime.createBackupUptime()]).apply((stacks) =>
  stacks.reduce(
    (prev, curr) => ({
      endpoints: [...prev.endpoints, ...curr.endpoints],
      "external-endpoints": [...prev["external-endpoints"], ...curr["external-endpoints"]],
    }),
    { endpoints: [], "external-endpoints": [] },
  ),
);

const dnsParent = new pulumi.ComponentResource("custom:home:StandardDnsParent", "standard-dns", {});
pulumi.all([externalEndpoints, gatusDnsRecords]).apply(async ([other, endpoints]) => {
  return addUptimeGatus(
    `dns`,
    globals,
    {
      endpoints: [...endpoints, ...other.endpoints],
      "external-endpoints": [...other["external-endpoints"]],
    },
    dnsParent,
  );
});

// TODO: add code to ensure tailscale ips is set for all important services

export const alphaSite = { proxmox: getProxmoxProperties(alphaSiteHost), backup: alphaSiteHost.backupVolumes! };
export const twilightSparkle = { proxmox: getProxmoxProperties(twilightSparkleHost) };
export const celestia = {
  proxmox: getProxmoxProperties(celestiaHost),
  dockge: getDockageProperties(celestiaDockgeRuntime),
  backup: celestiaHost.backupVolumes!,
};
export const luna = {
  proxmox: getProxmoxProperties(lunaHost),
  dockge: getDockageProperties(lunaDockgeRuntime),
  backup: lunaHost.backupVolumes!,
};
