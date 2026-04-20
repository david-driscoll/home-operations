import * as pulumi from "@pulumi/pulumi";
import { createClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { ProxmoxBackupServerLxc } from "../../components/ProxmoxBackupServerLxc.ts";
import * as tls from "@pulumi/tls";
import { AuthentikOutputs } from "@components/authentik.ts";
import { Tailscale } from "@components/constants.ts";
import { tag, TailscaleAclManager } from "@components/tailscale/manager.ts";
import * as tailscale from "@pulumi/tailscale";

const globals = new GlobalResources({}, {});

const op = new OPClient();

const outputs = new AuthentikOutputs(await op.getItemByTitle("Authentik Outputs"));
const sftpClientKey = pulumi.output(op.getItemByTitle("Rclone SFTP Key"));
const mainProxmoxCredentials = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const dockgeCredential = pulumi.output(op.getItemByTitle("Dockge Credential"));
const cluster = pulumi.output(op.getItemByTitle("Cluster: Skystar")).apply(createClusterDefinition);

const host = new ProxmoxHost("skystar", {
  globals: globals,
  authentikOutputs: outputs,
  tailscaleIpAddress: "100.111.10.105",
  macAddress: "xx:xx:xx:xx:xx:xx",
  proxmox: mainProxmoxCredentials,
  remote: true,
  cluster: cluster,
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
});
const tailscaleManager = TailscaleAclManager.default({ parent: host });

const dockgeRuntime = new DockgeLxc("skystar-dockge", {
  globals,
  credential: dockgeCredential,
  host: host,
  vmId: 500,
  cluster: cluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  registerTailscaleService(service) {
    tailscaleManager.apply((z) => z.setService(`svc:${service}`, [tag.dockge, tag.apps]));
  },
});
dockgeRuntime.addHostMount("/data");
dockgeRuntime.deployStacks({ dependsOn: [] });

const pbs = new ProxmoxBackupServerLxc("skystar-pbs", {
  globals,
  outputs,
  host: host,
  vmId: 501,
  tailscaleArgs: { acceptDns: true, acceptRoutes: false, ssh: true },
  cluster: cluster,
  dockge: dockgeRuntime,
  dependsOn: [],
});
pbs.addHostMount("/data");

host.addUptimeGatus();
TailscaleAclManager.applyAcl(tailscaleManager, { parent: host });

export const skystar = {
  proxmox: getProxmoxProperties(host),
  dockge: getDockageProperties(dockgeRuntime),
  backup: host.backupVolumes!,
};
