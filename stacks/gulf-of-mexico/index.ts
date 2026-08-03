import type { AuthentikOutputs } from "@components/authentik.ts";
import { BackupPlanDirector } from "@components/BackupPlanDirector.ts";
import { awaitOutput } from "@components/helpers.ts";
import { createGatusDnsUptime } from "@components/StandardDns.ts";
import type { CredentialDefinition, PasswordDefinition, SshKeyDefinition } from "@components/store/interfaces.ts";
import { TailscaleMonitor } from "@components/tailscale.ts";
import * as random from "@pulumi/random";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { GlobalResources } from "../../components/globals.ts";
import { ProxmoxBackupServerLxc } from "../../components/ProxmoxBackupServerLxc.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";

const globals = new GlobalResources({}, {});
const monitor = new TailscaleMonitor();
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
const pbsId = new random.RandomInteger("luna-pbs-id", {
  min: vmRange.start + 51,
  max: vmRange.end,
  seed: dockgeId.result.apply(z => z.toString()),
  keepers: { clusterId: cluster.key },
});

const host = new ProxmoxHost("luna", {
  globals: globals,
  authentikOutputs: outputs,
  tailscaleIpAddress: "100.111.10.104",
  proxmox: mainProxmoxCredentials,
  remote: true,
  cluster: cluster,
  tailscaleArgs: {
    advertiseExitNode: true,
    acceptDns: true,
    acceptRoutes: true,
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
  // acceptRoutes MUST stay false while this LXC physically sits on the home
  // 10.10.0.0/16 LAN, even though the host is modeled `remote: true` for its
  // eventual move. With accept-routes on, tailscale's table 52 carries the
  // tailnet-advertised 10.10.0.0/16 and wins over the connected eth0 route, so
  // replies to LAN clients leave via tailscale0 — LAN-inbound blackhole (SYNs
  // arrive, no SYN-ACK; found 2026-08-03 when Home Assistant on SGC could not
  // reach the wyoming/llama-voice ports; fixed live with
  // `tailscale set --accept-routes=false`). Flip this back to `host.remote`
  // as part of the physical move, when the LXC is no longer on the subnet it
  // would be accepting.
  tailscaleArgs: { acceptDns: true, acceptRoutes: false },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  monitor,
});
dockgeRuntime.addHostMount("/data");

const pbs = new ProxmoxBackupServerLxc("luna-pbs", {
  globals,
  outputs,
  host: host,
  vmId: pbsId.result,
  tailscaleArgs: { acceptDns: true, acceptRoutes: host.remote, ssh: true },
  cluster: cluster,
  dockge: dockgeRuntime,
  dependsOn: [],
  tags: ["backup-destination"],
});
pbs.addHostMount("/data");
// pbs.addDatastore({ name: "testing", path: "/data/testing", comment: "Testing Datastore behavior" });

await awaitOutput(
  dockgeRuntime.deployStacks({
    dependsOn: [pbs],
    variables: {
      PROXMOX_BLACKBOX_TARGETS: `["https://${host.tailscaleIpAddress}:8006"]`,
      PROXMOX_PVE_TARGETS: `["${host.tailscaleIpAddress}:8006"]`,
      DNS_CLUSTER_IS_PRIMARY: "false",
    },
  }),
);
await awaitOutput(host.addUptimeGatus());

await awaitOutput(createGatusDnsUptime(globals, { parent: host }));
await awaitOutput(backupDirector.createPlans({ dockge: dockgeRuntime, pbs, cluster }, [pbs]));

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
    {
      name: pbs.tailscaleName,
      externalIp: pbs.tailscaleIpAddress,
      internalIp: pbs.localIpAddress,
      mac: pbs.macAddress,
      nodeType: "pbs",
    },
  ],
  { parent: host },
);

export const luna = {
  proxmox: getProxmoxProperties(host),
  dockge: getDockageProperties(dockgeRuntime),
  backup: host.backupVolumes!,
};
