import * as pulumi from "@pulumi/pulumi";
import * as pbs from "@pulumi/pbs";
import * as random from "@pulumi/random";
import { ClusterDefinition, createClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { TruenasVm } from "../../components/TruenasVm.ts";
import * as minio from "@pulumi/minio";
import * as b2 from "@pulumi/b2";
import { updateTailscaleAcls } from "../../components/tailscale.ts";
import { gatusDnsRecords } from "../../components/StandardDns.ts";
import { addUptimeGatus, awaitOutput } from "@components/helpers.ts";
import { OnePasswordItem } from "@openapi/aliases.js";
import * as tls from "@pulumi/tls";
import { NodeSSH } from "node-ssh";
import { endpoint } from "@muhlba91/pulumi-proxmoxve/config/vars.js";
import { CategoryEnum, OnePasswordItem as OPI, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { createBackupJobs } from "../../components/createBackupJobs.ts";
import { TailscaleService } from "@openapi/tailscale-grants.js";

const globals = new GlobalResources({}, {});
// Generate SFTP server host key and a single client key (authorized key)
const sftpClientKey = new tls.PrivateKey("rclone-sftp-client", { algorithm: "ED25519" });
// Export for client usage (e.g., rclone-jobs)
export const sftpClientPublicKey = tls.getPublicKeyOutput({ privateKeyPem: sftpClientKey.privateKeyPem }).publicKeyOpenssh;

const op = new OPClient();

const mainProxmoxCredentials = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const dockgeCredential = pulumi.output(op.getItemByTitle("Dockge Credential"));
const lunaCluster = pulumi.output(op.getItemByTitle("Cluster: Luna")).apply(createClusterDefinition);

const lunaHost = new ProxmoxHost("luna", {
  globals: globals,
  isProxmoxBackupServer: true,
  tailscaleIpAddress: "100.111.10.104",
  macAddress: "c8:ff:bf:03:c9:1e",
  proxmox: mainProxmoxCredentials,
  enableClusterBackup: true,
  remote: true,
  cluster: lunaCluster,
  tailscaleArgs: { acceptRoutes: false },
});

const tailscaleServices: TailscaleService[] = [];
const registerTailscaleService = (service: string) => tailscaleServices.push(`svc:${service}` as TailscaleService);

const lunaDockgeRuntime = new DockgeLxc("luna-dockge", {
  globals,
  credential: dockgeCredential,
  host: lunaHost,
  vmId: 400,
  cluster: lunaCluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  registerTailscaleService,
});

try {
  const tailscaleManager = await updateTailscaleAcls({
    globals,
    services: tailscaleServices,
    hosts: {
      luna: lunaHost.tailscaleIpAddress,
      [await awaitOutput(lunaDockgeRuntime.tailscaleName)]: lunaDockgeRuntime.tailscaleIpAddress,
    },
    internalIps: [lunaDockgeRuntime.ipAddress],
    tests: {
      dockgeDevices: [lunaDockgeRuntime.tailscaleName],
      proxmoxDevices: [lunaHost.tailscaleName],
      taggedDevices: [],
    },
  });
} catch (error) {
  console.error("Error updating Tailscale ACLs:", error);
}

// TODO: add code to ensure tailscale ips is set for all important services

export const luna = { proxmox: getProxmoxProperties(lunaHost), dockge: getDockageProperties(lunaDockgeRuntime), backup: lunaHost.backupVolumes! };
// const users = await tailscale.
// console.log(users);

lunaDockgeRuntime.deployStacks({ dependsOn: [] });

await createBackupJobs({
  celestiaDockgeRuntime,
  lunaDockgeRuntime,
  alphaSiteDockgeRuntime,
  celestiaHost,
  lunaHost,
  alphaSiteHost,
  globals,
});

const externalEndpoints = pulumi.all([lunaDockgeRuntime.createBackupUptime()]).apply((stacks) =>
  stacks.reduce(
    (prev, curr) => ({
      endpoints: [...prev.endpoints, ...curr.endpoints],
      "external-endpoints": [...prev["external-endpoints"], ...curr["external-endpoints"]],
    }),
    { endpoints: [], "external-endpoints": [] }
  )
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
    dnsParent
  );
});
