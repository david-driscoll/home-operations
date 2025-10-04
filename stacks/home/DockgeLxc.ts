import * as proxmox from "@muhlba91/pulumi-proxmoxve";
import { DnsRecord as CloudflareDnsRecord } from "@pulumi/cloudflare";
import { DnsRecord as UnifiDnsRecord, User, getUserOutput } from "@pulumi/unifi";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { all, asset, ComponentResource, ComponentResourceOptions, Input, interpolate, mergeOptions, Output, output } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { PrivateKey } from "@pulumi/tls";
import { GlobalResources } from "./globals.ts";
import { createDnsRecord, getContainerHostnames } from "./helper.ts";
import { CT } from "@muhlba91/pulumi-proxmoxve/types/input.js";
import { DeviceKey, DeviceTags, getDeviceOutput, GetDeviceResult } from "@pulumi/tailscale";
import { tailscale } from "@components/tailscale.ts";
import { getUser } from "sdks/unifi/getUser.ts";
import { readFile } from "node:fs/promises";
import { md5 } from "@pulumi/std";
import { md5Output } from "@pulumi/std/md5.js";

function fileHash(file: proxmox.storage.File) {
  return md5Output({ input: file.sourceRaw.apply((z) => z?.data ?? file.id).apply((z) => output(z)) }).result;
}

export interface DockgeLxcArgs {
  globals: GlobalResources;
  host: ProxmoxHost;
  memory: Input<number>;
  cores: Input<number>;
  sshPublicKeys: Input<string[]>;
  datastore?: Input<string>;
}
export class DockgeLxc extends ComponentResource {
  public readonly container: proxmox.ct.Container;
  public readonly lxcTemplate: proxmox.download.File;
  public readonly privateKey: PrivateKey;
  public readonly tailscaleHostname: Output<string>;
  public readonly hostname: Output<string>;
  // public readonly device: Output<GetDeviceResult>;
  public readonly dns: ReturnType<typeof createDnsRecord>;
  constructor(name: string, args: DockgeLxcArgs) {
    super("home:dockge:DockgeLxc", name, {}, { parent: args.host });

    const cro = { parent: this };

    const parts = args.host.internalIpAddress.split(".");
    const tailscaleIpAddress = `${parts[0]}.${parts[1]}.${args.host.tailscaleIpAddress[args.host.tailscaleIpAddress.length - 1]}0.100`;

    this.privateKey = new PrivateKey(
      `${name}-private-key`,
      {
        algorithm: "RSA",
        rsaBits: 4096,
      },
      cro
    );

    const { hostname, tailscaleHostname } = getContainerHostnames("dockge", args.host, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;

    this.lxcTemplate = new proxmox.download.File(
      `${name}-template`,
      {
        nodeName: args.host.name,
        contentType: "vztmpl",
        datastoreId: args.datastore ?? "local",
        url: `https://cloud-images.ubuntu.com/noble/20251001/noble-server-cloudimg-amd64-root.tar.xz`,
        overwrite: true,
        overwriteUnmanaged: true,
      },
      mergeOptions(cro, { provider: args.host.pveProvider })
    );

    const ignorednsFile = new proxmox.storage.File(
      `${name}-ignoredns`,
      {
        datastoreId: "local",
        contentType: "snippets",
        nodeName: args.host.name,
        sourceRaw: {
          data: "",
          fileName: `ignore-resolv.conf`,
        },
        fileMode: "0644",
      },
      mergeOptions(cro, { provider: args.host.pveProvider })
    );

    const metadata = new proxmox.storage.File(
      `${name}-meta-data`,
      {
        contentType: "snippets",
        datastoreId: "local",
        nodeName: args.host.name,
        sourceRaw: {
          data: interpolate`#cloud-config
local-hostname: "${hostname}"
instance-id: "${name}"`,
          fileName: `${name}-meta-data.yaml`,
        },
      },
      mergeOptions(cro, { provider: args.host.pveProvider })
    );

    const sshKeys = all([args.sshPublicKeys, this.privateKey.publicKeyOpenssh]).apply((z) => z[0].concat([z[1]]));

    const replacements = all([sshKeys.apply((z) => z.join('", "')), args.globals.tailscaleAuthKey.key, hostname, name, output(readFile("./scripts/cloud-init.yaml", "utf-8"))]).apply((z) => ({
      sshKeys: z[0],
      tailscaleAuthKey: z[1],
      hostname: z[2],
      name: z[3],
      template: z[4],
    }));

    const configTemplate = replacements.apply((z) =>
      z.template
        .replace(/\$\{name\}/g, z.name)
        .replace(/ssh_authorized_keys: \[.*?\]/g, `ssh_authorized_keys: ["${z.sshKeys}"]`)
        .replace(/\$\{args\.globals\.tailscaleAuthKey\.key\}/g, z.tailscaleAuthKey)
    );

    const userdata = new proxmox.storage.File(
      `${name}-user-data`,
      {
        contentType: "snippets",
        datastoreId: "local",
        nodeName: args.host.name,
        sourceRaw: {
          data: configTemplate,
          fileName: `${name}-user-data.yaml`,
        },
      },
      mergeOptions(cro, { provider: args.host.pveProvider })
    );

    const networkconfig = new proxmox.storage.File(
      `${name}-network-config`,
      {
        contentType: "snippets",
        datastoreId: "local",
        nodeName: args.host.name,
        sourceRaw: {
          data: interpolate`{
  "version": 2,
  "ethernets": {
    "eth0": {
      "dhcp4": true
    }
  }
}`,
          fileName: `${name}-network-config.json`,
        },
      },
      mergeOptions(cro, { provider: args.host.pveProvider })
    );

    this.container = new proxmox.ct.Container(
      name,
      {
        nodeName: args.host.name,
        initialization: {
          hostname: name,
          ipConfigs: [
            {
              ipv4: {
                address: "dhcp",
              },
            },
          ],
          // dns: {
          //   domain: args.globals.tailscaleDomain,
          //   servers: ["100.100.100.100"],
          // },
          userAccount: {
            keys: all([args.sshPublicKeys, this.privateKey.publicKeyOpenssh]).apply((z) => z[0].concat([z[1]])),
            password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
          },
        },
        operatingSystem: {
          templateFileId: this.lxcTemplate.id,
          type: "debian",
        },
        // hookScriptFileId: tailscaleHook.id,
        memory: {
          dedicated: args.memory,
          swap: 1024,
        },
        startOnBoot: true,
        started: true,
        cpu: {
          cores: args.cores,
          architecture: args.host.arch,
        },
        disk: {
          datastoreId: args.datastore ?? "local-lvm",
          size: 32,
        },
        networkInterfaces: [
          {
            name: "eth0",
            bridge: "vmbr0",
            enabled: true,
            firewall: true,
          },
        ],
        description: "Dockge LXC Container",
        unprivileged: false,
        tags: ["dockge", "home", "services"],
        startup: {
          order: 1,
          upDelay: 10,
        },
      },
      mergeOptions(cro, { provider: args.host.pveProvider, dependsOn: [this.lxcTemplate] })
    );

    const triggers = all([fileHash(ignorednsFile), fileHash(metadata), fileHash(userdata), fileHash(networkconfig)]);

    // using pct and remote.command, lets run cloud-init
    const copyCloudInitToLxc = new remote.Command(
      `${name}-copy-to-lxc`,
      {
        connection: args.host.remoteConnection,
        triggers,
        create: interpolate`
pct push ${this.container.vmId} /var/lib/vz/snippets/${ignorednsFile.fileName} /etc/.pve-ignore.resolv.conf && \\
pct exec ${this.container.vmId} -- mkdir -p /var/lib/cloud/seed/nocloud-net/ && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${metadata.fileName} /var/lib/cloud/seed/nocloud-net/meta-data && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${userdata.fileName} /var/lib/cloud/seed/nocloud-net/user-data && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${networkconfig.fileName} /var/lib/cloud/seed/nocloud-net/network-config.json
`,
      },
      mergeOptions(cro, { dependsOn: [] })
    );

    // using pct and remote.command, lets run cloud-init
    const checkSchema = new remote.Command(
      `${name}-check-schema`,
      {
        connection: args.host.remoteConnection,
        triggers,
        create: interpolate`
pct exec ${this.container.vmId} -- cloud-init schema --system
`,
      },
      mergeOptions(cro, { dependsOn: [copyCloudInitToLxc] })
    );

    // using pct and remote.command, lets run cloud-init
    const cloudInitWait = new remote.Command(
      `${name}-cloud-init-wait`,
      {
        connection: args.host.remoteConnection,
        triggers,
        create: interpolate`
pct reboot ${this.container.vmId};
pct exec ${this.container.vmId} -- cloud-init status --long --wait`,
      },
      mergeOptions(cro, { dependsOn: [checkSchema, copyCloudInitToLxc] })
    );

    const ipAddress = new remote.Command(
      `${name}-get-ip`,
      {
        connection: args.host.remoteConnection,
        triggers,
        create: interpolate`pct exec ${this.container.vmId} -- `,
      },
      mergeOptions(cro, { dependsOn: [cloudInitWait] })
    );

    const a = all([
      output({
        stderr: ipAddress.stderr,
        stdin: ipAddress.stdin,
        stdout: ipAddress.stdout,
      }),
    ]);

    this.dns = createDnsRecord(
      name,
      this.hostname,
      a.apply((z) => {
        console.log(z);
        return z[0].stdout.trim();
      }),
      args.globals,
      mergeOptions(cro, { dependsOn: [cloudInitWait] })
    );

    // Get Tailscale device - this will need to be done after the hook script runs
    // and Tailscale is configured. For now, we'll comment this out as it requires
    // manual Tailscale configuration after container creation.
    /*
    this.device = output(
      getDevice(
        { hostname: name },
        { provider: args.globals.tailscaleProvider, parent: this }
      ).then(async (result) => {
        await tailscale.paths["/device/{deviceId}/ip"].post({ deviceId: result.id }, { ipv4: tailscaleIpAddress });
        return result;
      })
    );

    // Create device tags
    const deviceTags = new DeviceTags(
      `${name}-tags`,
      {
        tags: ["tag:proxmox", "tag:exit-node"],
        deviceId: this.device.apply((z) => z.id),
      },
      {
        provider: args.globals.tailscaleProvider,
        parent: this,
        retainOnDelete: true,
      }
    );

    // Create device key
    const deviceKey = new DeviceKey(
      `${name}-key`,
      {
        keyExpiryDisabled: true,
        deviceId: this.device.apply((z) => z.id),
      },
      {
        provider: args.globals.tailscaleProvider,
        parent: this,
      }
    );
    */
  }
}
