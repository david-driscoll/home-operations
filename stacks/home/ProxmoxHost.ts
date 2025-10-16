import { ComponentResource, ComponentResourceOptions, Input, Output, mergeOptions, interpolate, output, asset } from "@pulumi/pulumi";
import { Provider as ProxmoxVEProvider } from "@muhlba91/pulumi-proxmoxve";
import { getDeviceOutput, DeviceTags, DeviceKey, GetDeviceResult } from "@pulumi/tailscale";
import { remote, types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { tailscale } from "../../components/tailscale.js";
import { OPClient } from "../../components/op.ts";
import { getHostnames } from "./helper.ts";
import { createDnsSection } from "./StandardDns.ts";
import { StandardDns } from "./StandardDns.ts";
import { TruenasVm } from "./TruenasVm.ts";
import { getTailscaleDevice, getTailscaleSection } from "@components/helpers.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";

export type OPClientItem = pulumi.Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface ProxmoxHostArgs {
  title?: Input<string>;
  globals: GlobalResources;
  proxmox: Input<OPClientItem>;
  tailscaleIpAddress: string;
  macAddress: string;
  isProxmoxBackupServer: boolean;
  remote: boolean;
  internalIpAddress?: string;
  installTailscale?: boolean;
  truenas?: TruenasVm;
  cluster: Input<ClusterDefinition>;
  shortName?: string;
}

export class ProxmoxHost extends ComponentResource {
  public readonly name: string;
  public readonly internalIpAddress: string;
  public readonly tailscaleIpAddress: string;
  public readonly macAddress: string;
  public readonly device: Output<GetDeviceResult>;
  public readonly pveProvider: ProxmoxVEProvider;
  public readonly backupVolumes?: Output<pulumi.UnwrappedObject<{ longhorn: string; volsync: string }>>;
  public readonly tailscaleHostname: Output<string>;
  public readonly hostname: Output<string>;
  public readonly arch: Output<string>;
  public readonly remote: boolean;
  public readonly dns: StandardDns;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly title: Output<string>;
  public readonly shortName?: string;

  constructor(name: string, args: ProxmoxHostArgs, opts?: ComponentResourceOptions) {
    super("home:proxmox:ProxmoxHost", name, opts);

    this.name = name;
    const cluster = output(args.cluster);
    this.title = output(args.title ?? cluster.title);
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
    this.shortName = args.shortName;

    const { hostname, tailscaleHostname } = getHostnames(name, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;

    const cro = { parent: this };
    args.installTailscale ??= true;

    const apiCredential = output(args.proxmox);
    this.arch = apiCredential.apply((z) => z.fields?.arch?.value!);

    this.dns = new StandardDns(name, { hostname: this.hostname, ipAddress: output(this.internalIpAddress), type: "A" }, args.globals, cro);

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
      cro,
    );

    if (args.truenas) {
      this.backupVolumes = pulumi.output(args.truenas.addClusterBackup(name, this));
    }

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.internalIpAddress,
      user: args.globals.proxmoxCredential.apply((z) => z.fields?.username?.value!),
      password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
    });

    if (args.installTailscale) {
      const snippetsCommand = new remote.Command(
        `${name}-snippets`,
        {
          connection,
          create: `pvesm set local --content images,rootdir,vztmpl,backup,iso,snippets`,
        },
        cro,
      );
      // Configure SSH environment

      const configureSshEnv = new remote.Command(
        `${name}-configure-ssh-env`,
        {
          connection: connection,
          create: interpolate`mkdir -p /etc/ssh/sshd_config.d/ && echo 'AcceptEnv TS_AUTHKEY' > /etc/ssh/sshd_config.d/99-tailscale.conf && systemctl restart sshd`,
        },
        cro,
      );

      // Install Tailscale
      const installTailscale = new remote.Command(
        `${name}-install-tailscale`,
        {
          connection: connection,
          create: "curl -fsSL https://tailscale.com/install.sh | sh",
        },
        mergeOptions(cro, { dependsOn: [configureSshEnv] }),
      );

      // Install jq
      const installJq = new remote.Command(
        `${name}-install-jq`,
        {
          connection: connection,
          create: "apt-get install -y jq",
        },
        mergeOptions(cro, { dependsOn: [installTailscale] }),
      );

      const tailscaleArgs = interpolate`--hostname=${name} --accept-dns --accept-routes --advertise-exit-node --ssh --accept-risk=lose-ssh`;

      // Set Tailscale configuration
      const tailscaleUp = new remote.Command(
        `${name}-tailscale-up`,
        {
          connection: connection,
          create: interpolate`tailscale up ${tailscaleArgs} --reset`,
          environment: { TS_AUTHKEY: args.globals.tailscaleAuthKey.key },
        },
        mergeOptions(cro, { dependsOn: [installTailscale] }),
      );

      // Set Tailscale configuration
      const tailscaleSet = new remote.Command(
        `${name}-tailscale-set`,
        {
          connection: connection,
          create: interpolate`tailscale set ${tailscaleArgs} --auto-update`,
          environment: { TS_AUTHKEY: args.globals.tailscaleAuthKey.key },
        },
        mergeOptions(cro, { dependsOn: [tailscaleUp, installTailscale] }),
      );

      // Copy Tailscale cron script
      const tailscaleCron = new remote.CopyToRemote(
        `${name}-tailscale-cron`,
        {
          connection: connection,
          remotePath: "/etc/cron.weekly/tailscale",
          source: new asset.FileAsset(args.isProxmoxBackupServer ? "scripts/tailscale-pbs.sh" : "scripts/tailscale.sh"),
        },
        mergeOptions(cro, { dependsOn: [installJq, tailscaleSet] }),
      );

      // Set executable permissions and run cron script
      const tailscaleSetCert = new remote.Command(
        `${name}-install-set`,
        {
          connection: connection,
          create: "chmod 755 /etc/cron.weekly/tailscale && /etc/cron.weekly/tailscale",
        },
        mergeOptions(cro, { dependsOn: [tailscaleCron] }),
      );
    }

    // Get Tailscale device
    this.device = getDeviceOutput({ hostname: name }, { provider: args.globals.tailscaleProvider, parent: this }).apply(async (result) => {
      try {
        await tailscale.paths["/device/{deviceId}/ip"].post({ deviceId: result.nodeId }, { ipv4: args.tailscaleIpAddress });
      } catch (e) {
        pulumi.log.error(`Error setting IP address for device ${args.tailscaleIpAddress}: ${e}`, this);
      }
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
        },
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
        },
      );
    }

    const proxmoxInfo = new OnePasswordItem(
      `${this.name}-proxmox`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: pulumi.interpolate`ProxmoxHost: ${this.title}`,
        tags: ["proxmox", "host"],
        sections: {
          tailscale: getTailscaleSection(this.device),
          dns: createDnsSection(this.dns),
          ssh: {
            fields: {
              hostname: { type: TypeEnum.String, value: this.tailscaleHostname },
              username: { type: TypeEnum.String, value: args.globals.proxmoxCredential.apply((z) => z.fields?.username?.value!) },
              password: { type: TypeEnum.Concealed, value: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!) },
            },
          },
        },
        fields: {
          hostname: { type: TypeEnum.String, value: this.hostname },
          ipAddress: { type: TypeEnum.String, value: this.internalIpAddress },
          tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
        },
      },
      cro,
    );

    // Note: The commented-out Hosts resource would need to be implemented
    // if you have a custom Hosts resource or provider for managing /etc/hosts
  }
}

export function getProxmoxProperties(instance: ProxmoxHost) {
  return {
    tailscale: getTailscaleDevice(instance.device),
    name: instance.name,
    hostname: instance.hostname,
    ipAddress: instance.internalIpAddress,
    macAddress: instance.macAddress,
    remoteConnection: instance.remoteConnection!,
  };
}
