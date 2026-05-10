import * as pulumi from "@pulumi/pulumi";
import { createClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { ProxmoxBackupServerLxc } from "../../components/ProxmoxBackupServerLxc.ts";
import { TruenasVm } from "../../components/TruenasVm.ts";
import * as minio from "@pulumi/minio";
// import * as b2 from "@pulumi/b2";
import { gatusDnsRecords } from "../../components/StandardDns.ts";
import { addUptimeGatus } from "@components/helpers.ts";
import * as tls from "@pulumi/tls";
import { AuthentikOutputs } from "@components/authentik.ts";
import { dns, Tailscale } from "@components/constants.ts";
import { exportNodeStateToOnePassword } from "@components/tailscale.ts";
import { CategoryEnum, OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { createBackupJobs } from "../backups/backups.ts";

const globals = new GlobalResources({}, {});

const op = new OPClient();

const outputs = new AuthentikOutputs(await op.getItemByTitle("Authentik Outputs"));
const sftpClientKey = pulumi.output(op.getItemByTitle("Rclone SFTP Key"));
const mainProxmoxCredentials = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const alphaSiteProxmoxCredentials = pulumi.output(op.getItemByTitle("Alpha Site Proxmox ApiKey"));
const dockgeCredential = pulumi.output(op.getItemByTitle("Dockge Credential"));
const celestiaCluster = pulumi.output(op.getItemByTitle("Cluster: Celestia")).apply(createClusterDefinition);
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
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.100",
  tailscaleIpAddress: "100.111.10.100",
  proxmox: mainProxmoxCredentials,
  remote: false,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [],
  vmIdRange: { start: 102, end: 199 },
});
const spikeVm = new TruenasVm("spike", {
  credential: globals.truenasCredential.apply((z) => z.title!),
  globals: globals,
  host: twilightSparkleHost,
  ipAddress: pulumi.output("10.10.10.10"),
  tailscaleIpAddress: "100.111.10.10",
});

const thanosStorage = new minio.S3Bucket(
  `thanos-storage`,
  {
    acl: "private",
  },
  {
    provider: globals.truenasMinioProvider,
    protect: true,
    retainOnDelete: true,
  },
);

const thanosMinioSecret = new OnePasswordItem("thanos-minio-secret", {
  title: "Thanos S3 Storage",
  category: CategoryEnum.APICredential,
  fields: {
    username: { type: TypeEnum.String, value: globals.truenasMinioProvider.minioUser },
    password: { type: TypeEnum.Concealed, value: globals.truenasMinioProvider.minioPassword },
    bucket: { type: TypeEnum.String, value: thanosStorage.bucket },
    endpoint: { type: TypeEnum.String, value: globals.truenasMinioProvider.minioServer },
  },
});

createBackupJobs({ globals });

const celestiaHost = new ProxmoxHost("celestia", {
  globals: globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: false,
  cluster: celestiaCluster,
  peerRelay: true,
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: { start: 302, end: 399 },
});
const celestiaBackupMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/backup/");
const celestiaDataMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/data/");

const alphaSiteHost = new ProxmoxHost("alpha-site", {
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

const tailscaleServices: string[] = [];
const registerTailscaleService = (service: string) => tailscaleServices.push(`svc:${service}`);

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
  legacyTun: true, // jiangcuo ARM64 Proxmox port stubs out mknod; dev2 passthrough is unusable
});

celestiaDockgeRuntime.deployStacks({ dependsOn: [] });
alphaSiteDockgeRuntime.deployStacks({ dependsOn: [] });
// NOTE: createBackupJobs (celestia→luna) has been removed from this stack.
// Luna now lives in stacks/gulf-of-mexico. Re-wire backup jobs using a
// cross-stack reference or static connection once gulf-of-mexico is stable.

const externalEndpoints = pulumi.all([celestiaDockgeRuntime.createBackupUptime(), alphaSiteDockgeRuntime.createBackupUptime()]).apply((stacks) =>
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

const celestiaPbs = new ProxmoxBackupServerLxc("celestia-pbs", {
  globals,
  outputs,
  host: celestiaHost,
  vmId: 301,
  tailscaleArgs: { acceptDns: true, acceptRoutes: false, ssh: true },
  cluster: celestiaCluster,
  dockge: celestiaDockgeRuntime,
  dependsOn: [],
});
celestiaPbs.addHostMount("/data");
celestiaPbs.addHostMount(`/mnt/pve/${celestiaBackupMount}`, "/spike/backup");
celestiaPbs.addHostMount(`/mnt/pve/${celestiaDataMount}`, "/spike/data");

celestiaHost.addUptimeGatus();
alphaSiteHost.addUptimeGatus();
twilightSparkleHost.addUptimeGatus();

exportNodeStateToOnePassword(
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
  tailscaleServices,
  { parent: alphaSiteHost },
);

export const alphaSite = { proxmox: getProxmoxProperties(alphaSiteHost), backup: alphaSiteHost.backupVolumes! };
export const twilightSparkle = { proxmox: getProxmoxProperties(twilightSparkleHost) };
export const celestia = {
  proxmox: getProxmoxProperties(celestiaHost),
  dockge: getDockageProperties(celestiaDockgeRuntime),
  backup: celestiaHost.backupVolumes!,
};
