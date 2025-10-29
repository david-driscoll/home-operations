import * as pulumi from "@pulumi/pulumi";
import { createClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getProxmoxProperties, ProxmoxHost } from "./ProxmoxHost.js";
import { DockgeLxc, getDockageProperties } from "./DockgeLxc.ts";
import { TruenasVm } from "./TruenasVm.ts";
import * as minio from "@pulumi/minio";
import * as b2 from "@pulumi/b2";
import { updateTailscaleAcls } from "./tailscale.ts";
import { configureAdGuard } from "./adguard.ts";

const globals = new GlobalResources({}, {});
const op = new OPClient();

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
  }
);

const b2Bucket = new b2.Bucket(
  `home-operations-b2-bucket`,
  {
    bucketName: pulumi.interpolate`home-operations`,
    bucketType: "allPrivate",

    bucketInfo: {
      project: "home-operations",
      purpose: "pulumi storage",
    },
    lifecycleRules: [
      {
        fileNamePrefix: "",
        daysFromHidingToDeleting: 1,
      },
    ],
  },
  {
    provider: globals.backblazeProvider,
    protect: true,
    retainOnDelete: true,
  }
);
const twilightSparkleHost = new ProxmoxHost("twilight-sparkle", {
  title: "Twilight Sparkle",
  globals: globals,
  isProxmoxBackupServer: false,
  internalIpAddress: "10.10.10.100",
  tailscaleIpAddress: "100.111.10.100",
  macAddress: "58:47:ca:7b:a9:9d",
  proxmox: mainProxmoxCredentials,
  remote: false,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
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
  isProxmoxBackupServer: true,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  macAddress: "c8:ff:bf:03:cc:4c",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: false,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
});

const lunaHost = new ProxmoxHost("luna", {
  globals: globals,
  isProxmoxBackupServer: true,
  tailscaleIpAddress: "100.111.10.104",
  macAddress: "c8:ff:bf:03:c9:1e",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: true,
  cluster: lunaCluster,
  tailscaleArgs: { acceptRoutes: false },
});

const alphaSiteHost = new ProxmoxHost("alpha-site", {
  globals: globals,
  isProxmoxBackupServer: false,
  internalIpAddress: "10.10.10.200",
  tailscaleIpAddress: "100.111.10.200",
  macAddress: "e4:5f:01:90:36:22",
  proxmox: alphaSiteProxmoxCredentials,
  installTailscale: false,
  remote: false,
  cluster: alphaSiteCluster,
  shortName: "as",
  tailscaleArgs: { acceptRoutes: false },
});

const celestiaDockgeRuntime = new DockgeLxc("celestia-dockge", {
  globals,
  credential: dockgeCredential,
  host: celestiaHost,
  vmId: 300,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
});

const lunaDockgeRuntime = new DockgeLxc("luna-dockge", {
  globals,
  credential: dockgeCredential,
  host: lunaHost,
  vmId: 400,
  cluster: lunaCluster,
  tailscaleArgs: { acceptRoutes: false },
});

const alphaSiteDockgeRuntime = new DockgeLxc("alpha-site-dockge", {
  globals,
  credential: dockgeCredential,
  host: alphaSiteHost,
  vmId: 100,
  ipAddress: "10.10.10.9",
  tailscaleIpAddress: "100.111.10.9",
  cluster: alphaSiteCluster,
  tailscaleArgs: { acceptRoutes: false },
});

// TODO: add code to ensure tailscale ips is set for all important services

export const alphaSite = { proxmox: getProxmoxProperties(alphaSiteHost), backup: alphaSiteHost.backupVolumes! };
export const twilightSparkle = { proxmox: getProxmoxProperties(twilightSparkleHost) };
export const celestia = { proxmox: getProxmoxProperties(celestiaHost), dockge: getDockageProperties(celestiaDockgeRuntime), backup: celestiaHost.backupVolumes! };
export const luna = { proxmox: getProxmoxProperties(lunaHost), dockge: getDockageProperties(lunaDockgeRuntime), backup: lunaHost.backupVolumes! };
// const users = await tailscale.
// console.log(users);

await updateTailscaleAcls({
  globals,
  hosts: {
    idp: "100.111.209.102",
    "primary-dns": "100.111.209.201",
    "secondary-dns": alphaSiteDockgeRuntime.tailscaleIpAddress,
    "unifi-dns": "100.111.0.1",
    "alpha-site": alphaSiteHost.tailscaleIpAddress,
    "alpha-site-dockge": alphaSiteDockgeRuntime.tailscaleIpAddress,
    celestia: celestiaHost.tailscaleIpAddress,
    "celestia-dockge": celestiaDockgeRuntime.tailscaleIpAddress,
    luna: lunaHost.tailscaleIpAddress,
    "luna-dockge": lunaDockgeRuntime.tailscaleIpAddress,
    spike: spikeVm.tailscaleIpAddress,
    "twilight-sparkle": twilightSparkleHost.tailscaleIpAddress,
  },
  dnsServers: ["100.111.209.201", "100.111.0.1", alphaSiteDockgeRuntime.tailscaleIpAddress],
});

await configureAdGuard({
  clients: [{
    
  }]
})
