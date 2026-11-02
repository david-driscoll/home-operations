import type { AuthentikOutputs } from "@components/authentik.ts";
import { BackupPlanDirector } from "@components/BackupPlanDirector.ts";
import { Tailscale } from "@components/constants.ts";
import { awaitOutput } from "@components/helpers.ts";
import { createGatusDnsUptime } from "@components/StandardDns.ts";
import type { CredentialDefinition, PasswordDefinition, SshKeyDefinition } from "@components/store/index.ts";
import { TailscaleMonitor } from "@components/tailscale.ts";
import * as random from "@pulumi/random";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { GlobalResources } from "../../components/globals.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";

const globals = new GlobalResources({}, {});
const monitor = new TailscaleMonitor(globals);
const backupDirector = new BackupPlanDirector("backup-plan-director", {
  globals,
});

const vmRange = { start: 500, end: 599 };

const outputs = globals.store.getSecretByTitle<AuthentikOutputs>("Authentik Outputs");
const sftpClientKey = globals.store.getSecretByTitle<SshKeyDefinition>("Rclone SFTP Key");
const mainProxmoxCredentials = globals.store.getSecretByTitle<CredentialDefinition & { arch: string }>("Proxmox ApiKey");
const dockgeCredential = globals.store.getSecretByTitle<PasswordDefinition>("Dockge Credential");
const cluster = globals.store.getCluster("Cluster: Skystar");
const dockgeId = new random.RandomInteger("skystar-dockge-id", {
  min: vmRange.start,
  max: vmRange.start + 50,
  keepers: { clusterId: cluster.key },
});

const host = new ProxmoxHost("skystar", {
  globals: globals,
  authentikOutputs: outputs,
  tailscaleIpAddress: "100.111.10.105",
  proxmox: mainProxmoxCredentials,
  remote: true,
  cluster: cluster,
  tailscaleArgs: {
    acceptDns: true,
    acceptRoutes: true,
    advertiseExitNode: true,
  },
  peerRelay: true,
  tailscaleSubnetRoutes: [Tailscale.subnets.ocracoke],
  vmIdRange: vmRange,
});

const dockgeRuntime = new DockgeLxc("skystar-dockge", {
  globals,
  credential: dockgeCredential,
  host: host,
  vmId: dockgeId.result,
  cluster: cluster,
  tailscaleArgs: {
    acceptDns: true,
    acceptRoutes: host.remote,
  },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  monitor,
});
dockgeRuntime.addHostMount("/data");

await awaitOutput(
  dockgeRuntime.deployStacks({
    dependsOn: [],
    variables: {
      PROXMOX_BLACKBOX_TARGETS: `["https://${host.tailscaleIpAddress}:8006"]`,
      PROXMOX_PVE_TARGETS: `["${host.tailscaleIpAddress}:8006"]`,
      DNS_CLUSTER_IS_PRIMARY: "false",
    },
  }),
);
await awaitOutput(host.addUptimeGatus());

await awaitOutput(createGatusDnsUptime(globals, { parent: host }));
await awaitOutput(backupDirector.createPlans({ dockge: dockgeRuntime, localRepos: true, cluster }, [dockgeRuntime]));

monitor.exportNodeStateToOnePassword(
  [
    {
      name: host.tailscaleName,
      externalIp: host.tailscaleIpAddress,
      internalIp: host.localIpAddress,
      mac: host.macAddress,
      nodeType: "proxmox",
    },
    {
      name: dockgeRuntime.tailscaleName,
      externalIp: dockgeRuntime.tailscaleIpAddress,
      internalIp: dockgeRuntime.localIpAddress,
      mac: dockgeRuntime.macAddress,
      nodeType: "dockge",
    },
  ],
  { parent: host },
);

export const skystar = {
  proxmox: getProxmoxProperties(host),
  dockge: getDockageProperties(dockgeRuntime),
  backup: host.backupVolumes!,
};
