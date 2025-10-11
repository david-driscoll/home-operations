import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { ProxmoxHost } from "./ProxmoxHost.js";
import { DockgeLxc } from "./DockgeLxc.ts";
import { TruenasVm } from "./TruenasVm.ts";
import { GetDeviceResult } from "@pulumi/tailscale";

const globals = new GlobalResources({}, {});
const op = new OPClient();

const mainProxmoxCredentials = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const alphaSiteProxmoxCredentials = pulumi.output(op.getItemByTitle("Alpha Site Proxmox ApiKey"));
const gateway = "10.10.0.1";

var twilightSparkleHost = new ProxmoxHost("twilight-sparkle", {
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
  globals: globals,
  isProxmoxBackupServer: true,
  tailscaleIpAddress: "100.111.10.104",
  macAddress: "c8:ff:bf:03:c9:1e",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: true,
});

var alphaSiteHost = new ProxmoxHost("alpha-site", {
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

function getTailscaleDevice(device: pulumi.Output<GetDeviceResult>) {
  return {
    hostname: device.hostname!,
    name: device.name!,
    nodeId: device.nodeId!,
    tags: device.tags!,
    id: device.id!,
    addresses: device.addresses!,
  };
}

function getDockageProperties(instance: DockgeLxc) {
  return {
    tailscale: getTailscaleDevice(instance.device),
    hostname: instance.hostname,
    ipAddress: instance.ipAddress,
    dns: instance.dns,
    dockgeDns: instance.dockgeDns,
    internalDns: instance.internalDns,
    remoteConnection: instance.remoteConnection!,
  };
}

function getProxmoxProperties(instance: ProxmoxHost) {
  return {
    tailscale: getTailscaleDevice(instance.device),
    name: instance.name,
    hostname: instance.hostname,
    ipAddress: instance.internalIpAddress,
    macAddress: instance.macAddress,
    dns: instance.dns,
    remoteConnection: instance.remoteConnection!,
  };
}

export const alphaSite = { proxmox: getProxmoxProperties(alphaSiteHost) };
export const twilightSparkle = { proxmox: getProxmoxProperties(twilightSparkleHost) };
export const celestia = { proxmox: getProxmoxProperties(celestiaHost), dockge: getDockageProperties(celestiaDockgeRuntime), backup: celestiaHost.backupVolumes! };
export const luna = { proxmox: getProxmoxProperties(lunaHost), dockge: getDockageProperties(lunaDockgeRuntime), backup: lunaHost.backupVolumes! };
