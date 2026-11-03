import * as random from "@pulumi/random";
import type { AuthentikOutputs } from "components/authentik.ts";
import { BackupPlanDirector } from "components/BackupPlanDirector.ts";
import { awaitOutput } from "components/helpers.ts";
import { createGatusDnsUptime } from "components/StandardDns.ts";
import type { CredentialDefinition, PasswordDefinition, SshKeyDefinition } from "components/store/interfaces.ts";
import { TailscaleMonitor } from "components/tailscale.ts";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { GlobalResources } from "../../components/globals.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";

const globals = new GlobalResources({}, {});
const monitor = new TailscaleMonitor(globals);
const backupDirector = new BackupPlanDirector("backup-plan-director", {
  globals,
});

const vmRange = { start: 400, end: 499 };

const outputs = globals.store.getSecretByTitle<AuthentikOutputs>("Authentik Outputs");
const sftpClientKey = globals.store.getSecretByTitle<SshKeyDefinition>("Rclone SFTP Key");
const mainProxmoxCredentials = globals.store.getSecretByTitle<CredentialDefinition & { arch: string }>("Proxmox ApiKey");
const dockgeCredential = globals.store.getSecretByTitle<PasswordDefinition>("Dockge Credential");
const cluster = globals.store.getCluster("Cluster: Luna");
const dockgeId = new random.RandomInteger("luna-dockge-id", {
  min: vmRange.start,
  max: vmRange.start + 50,
  keepers: { clusterId: cluster.key },
});

// Once luna ships to the new location, flip this to true so tailscale accepts routes from the LAN.
const lunaIsRemote = false;

const host = new ProxmoxHost("luna", {
  globals: globals,
  authentikOutputs: outputs,
  tailscaleIpAddress: "100.111.10.104",
  proxmox: mainProxmoxCredentials,
  remote: lunaIsRemote,
  cluster: cluster,
  tailscaleArgs: {
    advertiseExitNode: true,
    acceptDns: true,
    // Never on the home LAN: the advertised 10.10.0.0/16 route wins over vmbr0
    // and the tailnet ACL drops luna's NFS to the NAS (pvestatd hangs, node goes grey).
    acceptRoutes: lunaIsRemote,
  },
  tailscaleSubnetRoutes: [],
  vmIdRange: vmRange,
});

const dockgeRuntime = new DockgeLxc("luna-dockge", {
  globals,
  credential: dockgeCredential,
  host: host,
  vmId: dockgeId.result,
  cluster: cluster,
  tailscaleArgs: { acceptDns: true, acceptRoutes: host.remote },
  // App names resolve to the LAN address while luna is on the home LAN, so
  // LAN-routed clients and NetBird gateways reach them (#2883). Flipping
  // lunaIsRemote puts them back on the tailnet address: the recorded LAN
  // address would be stale off-site.
  publishLanIpAddress: !lunaIsRemote,
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

export const luna = {
  proxmox: getProxmoxProperties(host),
  dockge: getDockageProperties(dockgeRuntime),
  backup: host.backupVolumes!,
};
