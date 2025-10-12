import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getProxmoxProperties, ProxmoxHost } from "./ProxmoxHost.js";
import { DockgeLxc, getDockageProperties } from "./DockgeLxc.ts";
import { TruenasVm } from "./TruenasVm.ts";
import { GetDeviceResult } from "@pulumi/tailscale";

const globals = new GlobalResources({}, {});
const op = new OPClient();

const mainProxmoxCredentials = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const alphaSiteProxmoxCredentials = pulumi.output(op.getItemByTitle("Alpha Site Proxmox ApiKey"));
const celestiaCluster = pulumi.output(op.getItemByTitle("Cluster: Celestia"));
const lunaCluster = pulumi.output(op.getItemByTitle("Cluster: Luna"));
const equestriaCluster = pulumi.output(op.getItemByTitle("Cluster: Equestria"));
const sgcCluster = pulumi.output(op.getItemByTitle("Cluster: Stargate Command"));
const gateway = "10.10.0.1";

var twilightSparkleHost = new ProxmoxHost("twilight-sparkle", {
  title: "Twilight Sparkle",
  globals: globals,
  isProxmoxBackupServer: false,
  internalIpAddress: "10.10.10.100",
  tailscaleIpAddress: "100.111.10.100",
  macAddress: "58:47:ca:7b:a9:9d",
  proxmox: mainProxmoxCredentials,
  remote: false,
});

const spikeVm = new TruenasVm({
  credential: globals.truenasCredential.apply((z) => z.title!),
  globals: globals,
  host: twilightSparkleHost,
});

var celestiaHost = new ProxmoxHost("celestia", {
  title: celestiaCluster.fields.title.value!,
  globals: globals,
  isProxmoxBackupServer: true,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  macAddress: "c8:ff:bf:03:cc:4c",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: false,
});

var lunaHost = new ProxmoxHost("luna", {
  title: lunaCluster.fields.title.value!,
  globals: globals,
  isProxmoxBackupServer: true,
  tailscaleIpAddress: "100.111.10.104",
  macAddress: "c8:ff:bf:03:c9:1e",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: true,
});

var alphaSiteHost = new ProxmoxHost("alpha-site", {
  title: "Alpha Site",
  globals: globals,
  isProxmoxBackupServer: false,
  internalIpAddress: "10.10.10.200",
  tailscaleIpAddress: "100.111.10.200",
  macAddress: "e4:5f:01:90:36:22",
  proxmox: alphaSiteProxmoxCredentials,
  installTailscale: false,
  remote: false,
});

var celestiaDockgeRuntime = new DockgeLxc("celestia-dockge", {
  globals,
  host: celestiaHost,
  vmId: 300,
});

var lunaDockgeRuntime = new DockgeLxc("luna-dockge", {
  globals,
  host: lunaHost,
  vmId: 400,
});

export const alphaSite = { proxmox: getProxmoxProperties(alphaSiteHost) };
export const twilightSparkle = { proxmox: getProxmoxProperties(twilightSparkleHost) };
export const celestia = { proxmox: getProxmoxProperties(celestiaHost), dockge: getDockageProperties(celestiaDockgeRuntime), backup: celestiaHost.backupVolumes! };
export const luna = { proxmox: getProxmoxProperties(lunaHost), dockge: getDockageProperties(lunaDockgeRuntime), backup: lunaHost.backupVolumes! };
