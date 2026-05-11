import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { createClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { ProxmoxBackupServerLxc } from "../../components/ProxmoxBackupServerLxc.ts";
import * as tls from "@pulumi/tls";
import { AuthentikOutputs } from "@components/authentik.ts";
import { Tailscale } from "@components/constants.ts";
import { exportNodeStateToOnePassword } from "@components/tailscale.ts";

const globals = new GlobalResources({}, {});

const op = new OPClient();
const vmRange = { start: 400, end: 499 };
function getRandomVmId(name: string, clusterKey: pulumi.Input<string>) {
  return new random.RandomInteger(`${name}-vm-id`, {
    min: vmRange.start,
    max: vmRange.end,
    keepers: { clusterId: clusterKey },
  }).result;
}

const outputs = new AuthentikOutputs(await op.getItemByTitle("Authentik Outputs"));
const sftpClientKey = pulumi.output(op.getItemByTitle("Rclone SFTP Key"));
const mainProxmoxCredentials = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const dockgeCredential = pulumi.output(op.getItemByTitle("Dockge Credential"));
const cluster = pulumi.output(op.getItemByTitle("Cluster: Luna")).apply(createClusterDefinition);
const dockgeId = new random.RandomInteger("luna-dockge-id", { min: vmRange.start, max: vmRange.start + 50, keepers: { clusterId: cluster.key } });
const pbsId = new random.RandomInteger("luna-pbs-id", { min: vmRange.start + 51, max: vmRange.end, seed: dockgeId.result.apply((z) => z.toString()), keepers: { clusterId: cluster.key } });

const host = new ProxmoxHost("luna", {
  globals: globals,
  authentikOutputs: outputs,
  tailscaleIpAddress: "100.111.10.104",
  proxmox: mainProxmoxCredentials,
  remote: true,
  cluster: cluster,
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: vmRange,
});

const tailscaleServices: string[] = [];

const dockgeRuntime = new DockgeLxc("luna-dockge", {
  globals,
  credential: dockgeCredential,
  host: host,
  vmId: dockgeId.result,
  cluster: cluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  registerTailscaleService(service) {
    tailscaleServices.push(`svc:${service}`);
  },
});
dockgeRuntime.addHostMount("/data");
dockgeRuntime.deployStacks({ dependsOn: [] });

const pbs = new ProxmoxBackupServerLxc("luna-pbs", {
  globals,
  outputs,
  host: host,
  vmId: pbsId.result,
  tailscaleArgs: { acceptDns: true, acceptRoutes: false, ssh: true },
  cluster: cluster,
  dockge: dockgeRuntime,
  dependsOn: [],
  tags: ['backup-destination']
});
pbs.addHostMount("/data");

host.addUptimeGatus();

exportNodeStateToOnePassword(
  [
    {
      name: host.tailscaleName,
      ip: host.tailscaleIpAddress,
      nodeType: "proxmox",
    },
    {
      name: dockgeRuntime.tailscaleName,
      ip: dockgeRuntime.tailscaleIpAddress,
      internalIp: dockgeRuntime.ipAddress,
      nodeType: "dockge",
    },
    {
      name: pbs.tailscaleName,
      ip: pbs.tailscaleIpAddress,
      nodeType: "pbs",
    },
  ],
  tailscaleServices,
  { parent: host },
);

export const luna = {
  proxmox: getProxmoxProperties(host),
  dockge: getDockageProperties(dockgeRuntime),
  backup: host.backupVolumes!,
};
