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

    const systemConfig = new proxmox.storage.File(
      `${name}-system`,
      {
        datastoreId: "local",
        contentType: "snippets",
        nodeName: args.host.name,
        sourceRaw: {
          data: output(readFile("./scripts/dockge-cloud-init.yaml", "utf-8")),
          fileName: `${name}-system-cloud-config.yaml`,
        },
        fileMode: "0644",
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

    const userdata = new proxmox.storage.File(
      `${name}-user-data`,
      {
        contentType: "snippets",
        datastoreId: "local",
        nodeName: args.host.name,
        sourceRaw: {
          data: interpolate`#cloud-config
password: Password123!
package_update: true
package_upgrade: true`,
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
          data: interpolate`{}`,
          fileName: `${name}-network-config.yaml`,
        },
      },
      mergeOptions(cro, { provider: args.host.pveProvider })
    );

    const userConfig = new proxmox.storage.File(
      `${name}-cloud-config`,
      {
        contentType: "snippets",
        datastoreId: "local",
        nodeName: args.host.name,
        sourceRaw: {
          data: interpolate`#cloud-config
allow_userdata: false
hostname: ${name}
timezone: America/New_York
users:
  - default
  - name: docker
    groups:
      - sudo
    shell: /bin/bash
    ssh_authorized_keys: [${all([args.sshPublicKeys, this.privateKey.publicKeyOpenssh.apply((z) => [z])]).apply((keys) =>
      keys
        .flatMap((z) => z)
        .map((key) => `"${key}"`)
        .join(",")
    )}]
    sudo: ALL=(ALL) NOPASSWD:ALL

runcmd:
  - tailscale up --auth-key=${args.globals.tailscaleAuthKey.key} --hostname ${name}
  - tailscale set --accept-dns --accept-routes --auto-update --advertise-exit-node --ssh=true`,
          fileName: `${name}-userdata-cloud-config.yaml`,
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

    // using pct and remote.command, lets run cloud-init
    const copyCloudInitToLxc = new remote.Command(
      `${name}-copy-to-lxc`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`
# ${fileHash(ignorednsFile)})}
# ${fileHash(systemConfig)}
# ${fileHash(userConfig)}
# ${fileHash(metadata)}
# ${fileHash(userdata)}
# ${fileHash(networkconfig)}}
pct push ${this.container.vmId} /var/lib/vz/snippets/${ignorednsFile.fileName} /etc/.pve-ignore.resolv.conf && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${systemConfig.fileName} /etc/cloud/cloud.cfg.d/01-system.cfg && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${userConfig.fileName} /etc/cloud/cloud.cfg.d/99-user.cfg && \\
pct exec ${this.container.vmId} -- mkdir -p /var/lib/cloud/instances/${name} && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${metadata.fileName} /var/lib/cloud/instances/${name}/meta-data.txt && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${userdata.fileName} /var/lib/cloud/instances/${name}/user-data.txt && \\
pct push ${this.container.vmId} /var/lib/vz/snippets/${networkconfig.fileName} /var/lib/cloud/instances/${name}/network-config.json && \\
pct exec ${this.container.vmId} -- cloud-init schema --system
`,
      },
      mergeOptions(cro, { dependsOn: [] })
    );

    //     // using pct and remote.command, lets run cloud-init
    //     const cloudInit = new remote.Command(
    //       `${name}-cloud-init`,
    //       {
    //         connection: args.host.remoteConnection,
    //         create: interpolate`
    // pct exec ${this.container.vmId} -- cloud-init clean;
    // pct exec ${this.container.vmId} -- cloud-init --all-stages`,
    //       },
    //       mergeOptions(cro, { dependsOn: [copyCloudInitToLxc] })
    //     );

    // using pct and remote.command, lets run cloud-init
    const cloudInitWait = new remote.Command(
      `${name}-cloud-init-wait`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`
# ${fileHash(ignorednsFile)})}
# ${fileHash(systemConfig)}
# ${fileHash(userConfig)}
# ${fileHash(metadata)}
# ${fileHash(userdata)}
# ${fileHash(networkconfig)}
pct reboot ${this.container.vmId};
pct exec ${this.container.vmId} -- cloud-init status --long --wait`,
      },
      mergeOptions(cro, { dependsOn: [copyCloudInitToLxc] })
    );

    const ipAddress = new remote.Command(
      `${name}-get-ip`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${this.container.vmId} -- ip route get 1 | awk '{print $(NF-2); exit}'`,
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
