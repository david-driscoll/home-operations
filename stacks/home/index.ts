import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "./globals.js";
import { OPClient } from "../../components/op.js";
import { ProxmoxHost } from "./ProxmoxHost.js";
import { TruenasVm } from "./truenas/index.js";

const globals = new GlobalResources({}, {});
const op = new OPClient();

const mainProxmox = pulumi.output(op.getItemByTitle("Proxmox ApiKey"));
const alphaSiteProxmox = pulumi.output(op.getItemByTitle("Alpha Site Proxmox ApiKey"));

var twilightSparkle = new ProxmoxHost("twilight-sparkle", {
  globals: globals,
  isBackupServer: false,
  internalIpAddress: "10.10.10.100",
  tailscaleIpAddress: "100.111.10.100",
  macAddress: "58:47:ca:7b:a9:9d",
  proxmox: alphaSiteProxmox,
});
const spike = pulumi.runtime.isDryRun()
  ? { addClusterBackup:  (name: string) => pulumi.output({ longhorn: "stash/backup/" + name, volsync: "stash/backup/" + name }) }
  : new TruenasVm({
      credential: globals.truenasCredential.apply((z) => z.title!),
      globals: globals,
      host: twilightSparkle,
    });

var celestia = new ProxmoxHost("celestia", {
  globals: globals,
  isBackupServer: true,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  macAddress: "c8:ff:bf:03:cc:4c",
  proxmox: mainProxmox,
  truenas: spike
});

var luna = new ProxmoxHost("luna", {
  globals: globals,
  isBackupServer: true,
  internalIpAddress: "10.10.10.104",
  tailscaleIpAddress: "100.111.10.104",
  macAddress: "c8:ff:bf:03:c9:1e",
  proxmox: mainProxmox,
  truenas: spike
});

var alphaSite = new ProxmoxHost("alpha-site", {
  globals: globals,
  isBackupServer: false,
  internalIpAddress: "10.10.10.200",
  tailscaleIpAddress: "100.111.10.200",
  macAddress: "e4:5f:01:90:36:22",
  proxmox: alphaSiteProxmox,
  installTailscale: false,
});
