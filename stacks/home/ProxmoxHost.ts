import { ComponentResource, ComponentResourceOptions, CustomResourceOptions, Input, Output, mergeOptions, interpolate, output, asset } from "@pulumi/pulumi";
import { download, Provider as ProxmoxVEProvider } from "@muhlba91/pulumi-proxmoxve";
import proxmox from "@muhlba91/pulumi-proxmoxve";
import { DnsRecord as CloudflareDnsRecord } from "@pulumi/cloudflare";
import { DnsRecord as UnifiDnsRecord } from "@pulumi/unifi";
import { getDeviceOutput, DeviceTags, DeviceKey, DeviceAuthorization, GetDeviceResult, get4Via6 } from "@pulumi/tailscale";
import { remote, local, types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "./globals.js";
import { tailscale } from "../../components/tailscale.js";
import { OPClient } from "../../components/op.js";
import { ITruenasVm } from "./truenas/index.ts";
import { createDnsRecord, getHostnames } from "./helper.ts";

export type OnePasswordItem = pulumi.Unwrap<ReturnType<OPClient["getItemByTitle"]>>;

export interface ProxmoxHostArgs {
  globals: GlobalResources;
  proxmox: Input<OnePasswordItem>;
  tailscaleIpAddress: string;
  macAddress: string;
  isProxmoxBackupServer: boolean;
  remote: boolean;
  internalIpAddress?: string;
  installTailscale?: boolean;
  truenas?: ITruenasVm;
}

export class ProxmoxHost extends ComponentResource {
  public readonly name: Output<string>;
  public readonly internalIpAddress: string;
  public readonly tailscaleIpAddress: string;
  public readonly macAddress: string;
  public readonly device: Output<GetDeviceResult>;
  public readonly pveProvider: ProxmoxVEProvider;
  public readonly backupVolumes: Output<pulumi.UnwrappedObject<{ longhorn: string; volsync: string }> | undefined>;
  public readonly tailscaleHostname: Output<string>;
  public readonly hostname: Output<string>;
  public readonly arch: Output<string>;
  public readonly remote: boolean;
  public readonly dns: ReturnType<typeof createDnsRecord>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;

  constructor(name: string, args: ProxmoxHostArgs, opts?: ComponentResourceOptions) {
    super("home:proxmox:ProxmoxHost", name, opts);

    this.name = output(name);
    if (args.remote) {
      this.internalIpAddress = args.tailscaleIpAddress;
    } else {
      if (args.internalIpAddress === undefined) {
        throw new Error("internalIpAddress must be provided for non-remote Proxmox hosts");
      }
      this.internalIpAddress = args.internalIpAddress;
    }
    this.tailscaleIpAddress = args.tailscaleIpAddress;
    this.macAddress = args.macAddress;
    this.remote = args.remote;

    const { hostname, tailscaleHostname } = getHostnames(name, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;

    const cro = { parent: this };
    args.installTailscale ??= true;

    const apiCredential = output(args.proxmox);
    this.arch = apiCredential.apply((z) => z.fields?.arch?.value!);

    this.dns = createDnsRecord(name, this.hostname, output(this.internalIpAddress), args.globals, cro);

    // Create ProxmoxVE Provider
    this.pveProvider = new ProxmoxVEProvider(
      `${name}-pve-provider`,
      {
        randomVmIds: true,
        randomVmIdStart: 1000,
        randomVmIdEnd: 1999,
        endpoint: interpolate`https://${this.tailscaleHostname}:8006/`,
        apiToken: interpolate`${apiCredential.apply((z) => z.fields["username"].value)}=${apiCredential.apply((z) => z.fields["credential"].value)}`,
        ssh: {
          username: "root",
          password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
        },
      },
      cro
    );

    this.backupVolumes = pulumi.output(args.truenas?.addClusterBackup(name));

    const connection: types.input.remote.ConnectionArgs = this.remoteConnection = {
      host: this.internalIpAddress,
      user: args.globals.proxmoxCredential.apply((z) => z.fields?.username?.value!),
      password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
    };

    if (args.installTailscale) {
      const snippetsCommand = new remote.Command(
        `${name}-snippets`,
        {
          connection,
          create: `pvesm set local --content images,rootdir,vztmpl,backup,iso,snippets`,
        },
        cro
      );
      // Configure SSH environment

      const configureSshEnv = new remote.Command(
        `${name}-configure-ssh-env`,
        {
          connection: connection,
          create: "mkdir -p /etc/ssh/ssh_config.d && echo 'AcceptEnv TS_AUTHKEY' > /etc/ssh/ssh_config.d/99-tailscale.conf",
        },
        cro
      );

      // Install Tailscale
      const installTailscale = new remote.Command(
        `${name}-install-tailscale`,
        {
          connection: connection,
          create: "curl -fsSL https://tailscale.com/install.sh | sh",
        },
        mergeOptions(cro, { dependsOn: [configureSshEnv] })
      );

      // Install jq
      const installJq = new remote.Command(
        `${name}-install-jq`,
        {
          connection: connection,
          create: "apt-get install -y jq",
        },
        mergeOptions(cro, { dependsOn: [installTailscale] })
      );

      // Set Tailscale configuration
      const tailscaleSet = new remote.Command(
        `${name}-tailscale-set`,
        {
          connection: connection,
          create: interpolate`TS_AUTHKEY=${args.globals.tailscaleAuthKey.key} tailscale set --hostname ${name} --accept-dns --accept-routes --auto-update --advertise-exit-node --ssh=true`,
        },
        mergeOptions(cro, { dependsOn: [installTailscale] })
      );

      // Copy Tailscale cron script
      const tailscaleCron = new remote.CopyToRemote(
        `${name}-tailscale-cron`,
        {
          connection: connection,
          remotePath: "/etc/cron.weekly/tailscale",
          source: new asset.FileAsset(args.isProxmoxBackupServer ? "scripts/tailscale-pbs.sh" : "scripts/tailscale.sh"),
        },
        mergeOptions(cro, { dependsOn: [installJq, tailscaleSet] })
      );

      // Set executable permissions and run cron script
      const tailscaleSetCert = new remote.Command(
        `${name}-install-set`,
        {
          connection: connection,
          create: "chmod 755 /etc/cron.weekly/tailscale && /etc/cron.weekly/tailscale",
        },
        mergeOptions(cro, { dependsOn: [tailscaleCron] })
      );
    }

    // Get Tailscale device
    this.device = getDeviceOutput({ hostname: name }, { provider: args.globals.tailscaleProvider, parent: this }).apply(async (result) => {
      await tailscale.paths["/device/{deviceId}/ip"].post({ deviceId: result.id }, { ipv4: args.tailscaleIpAddress });
      return result;
    });

    if (args.installTailscale) {
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
    }

    // Note: The commented-out Hosts resource would need to be implemented
    // if you have a custom Hosts resource or provider for managing /etc/hosts
  }
}
