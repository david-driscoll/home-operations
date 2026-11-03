import * as random from "@pulumi/random";
import type { AuthentikOutputs } from "components/authentik.ts";
import { BackupPlanDirector } from "components/BackupPlanDirector.ts";
import { Tailscale } from "components/constants.ts";
import { awaitOutput } from "components/helpers.ts";
import { createGatusDnsUptime } from "components/StandardDns.ts";
import type { CredentialDefinition, PasswordDefinition, SshKeyDefinition } from "components/store/index.ts";
import { TailscaleMonitor } from "components/tailscale.ts";
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

// skystar is physically on the home LAN again. While it is, tailscale must not
// accept subnet routes: the advertised 10.10.0.0/16 lands in table 52, which is
// consulted before main, so LAN traffic leaves through tailscale0 instead of
// vmbr0 (the same failure luna hit, see stacks/gulf-of-mexico/index.ts). Flip
// this back to false when it goes off-site again. `remote` (and the cluster's
// `location: remote`) stay as they are: they also pick the dockge LXC's address
// and authentik domain, which this change deliberately leaves alone.
const skystarOnHomeLan = true;

const host = new ProxmoxHost("skystar", {
  globals: globals,
  authentikOutputs: outputs,
  tailscaleIpAddress: "100.111.10.105",
  proxmox: mainProxmoxCredentials,
  remote: true,
  cluster: cluster,
  tailscaleArgs: {
    acceptDns: true,
    acceptRoutes: !skystarOnHomeLan,
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
    acceptRoutes: !skystarOnHomeLan,
  },
  // No `publishLanIpAddress` yet (#2883): the LAN address this LXC recorded is
  // still its ocracoke one from before the move, so the record would point at
  // an address the home LAN cannot reach. Re-read `skystar-dockge-ip-address`
  // first.
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
