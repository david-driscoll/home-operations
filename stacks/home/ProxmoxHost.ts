import { ComponentResource, ComponentResourceOptions, CustomResourceOptions, Input, Output, mergeOptions, interpolate, output, asset } from "@pulumi/pulumi";
import { Provider as ProxmoxVEProvider } from "@muhlba91/pulumi-proxmoxve";
import { Provider as ProxmoxProvider } from "@pulumi/proxmox";
import { DnsRecord as CloudflareDnsRecord } from "@pulumi/cloudflare";
import { DnsRecord as UnifiDnsRecord } from "@pulumi/unifi";
import { getDevice, DeviceTags, DeviceKey, GetDeviceResult } from "@pulumi/tailscale";
import { remote, local, types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "./globals.js";
import { tailscale } from "../../components/tailscale.js";
import { OPClient } from "../../components/op.js";

export type OnePasswordItem = pulumi.Unwrap<ReturnType<(OPClient)["getItemByTitle"]>>;

export interface ProxmoxHostArgs {
  globals: GlobalResources;
  proxmox: Input<OnePasswordItem>;
  internalIpAddress: string;
  tailscaleIpAddress: string;
  macAddress: string;
  isBackupServer: boolean;
  installTailscale?: boolean;
}

export class ProxmoxHost extends ComponentResource {
  public readonly device: Output<GetDeviceResult>;
  public readonly unifiDns: UnifiDnsRecord;
  public readonly cloudflareDns: CloudflareDnsRecord;
  public readonly pveProvider: ProxmoxVEProvider;
  public readonly lxcProvider: ProxmoxProvider;

  constructor(name: string, args: ProxmoxHostArgs, opts?: ComponentResourceOptions) {
    super("home:proxmox:ProxmoxHost", name, opts);

    const cro: CustomResourceOptions = { parent: this };
    args.installTailscale ??= true;

    const apiCredential = output(args.proxmox);

    const endpoint = apiCredential.apply((z) => {
      const endpointValue = z.fields?.endpoint?.value;
      if (!endpointValue) {
        throw new Error("endpoint is required");
      }
      return endpointValue;
    });

    // Create ProxmoxVE Provider
    this.pveProvider = new ProxmoxVEProvider(
      `${name}-pve-provider`,
      {
        randomVmIds: true,
        randomVmIdStart: 1000,
        randomVmIdEnd: 1999,
        endpoint: endpoint,
        apiToken: interpolate`${apiCredential.apply((z) => z.fields["username"].value)}=${apiCredential.apply((z) => z.fields["credential"].value)}`,
        ssh: {
          username: "root",
          password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
        },
      },
      cro
    );

    // Create Proxmox LXC Provider
    this.lxcProvider = new ProxmoxProvider(
      `${name}-lxc-provider`,
      {
        pmApiUrl: endpoint,
        pmApiTokenId: apiCredential.apply((z) => z.fields["username"].value!),
        pmApiTokenSecret: apiCredential.apply((z) => z.fields["credential"].value!),
      },
      cro
    );

    const hostname = interpolate`${name}.host.driscoll.tech`;
    const tailscaleHostname = interpolate`${name}.${args.globals.tailscaleDomain}`;

    // Create Cloudflare DNS record
    this.cloudflareDns = new CloudflareDnsRecord(
      name,
      {
        name: hostname,
        zoneId: args.globals.cloudflareCredential.apply((z) => z.fields?.zoneId?.value!),
        content: args.internalIpAddress,
        type: "A",
        ttl: 1,
      },
      mergeOptions(cro, {
        provider: args.globals.cloudflareProvider,
        deleteBeforeReplace: true,
      })
    );

    // Create Unifi DNS record
    this.unifiDns = new UnifiDnsRecord(
      name,
      {
        name: hostname,
        type: "A",
        record: args.internalIpAddress,
        ttl: 0,
      },
      mergeOptions(cro, {
        provider: args.globals.unifiProvider,
        deleteBeforeReplace: true,
      })
    );

    const connection: types.input.remote.ConnectionArgs = {
      host: args.internalIpAddress,
      user: args.globals.proxmoxCredential.apply((z) => z.fields?.username?.value!),
      password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
    };

    if (args.installTailscale) {
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
          source: new asset.FileAsset(args.isBackupServer ? "scripts/tailscale-pbs.sh" : "scripts/tailscale.sh"),
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
    this.device = output(
      getDevice(
        {
          hostname: name,
        },
        {
          provider: args.globals.tailscaleProvider,
          parent: this,
        }
      ).then(async (result) => {
        await tailscale.paths["/device/{deviceId}/ip"].post(
          {
            deviceId: result.id,
          },
          {
            ipv4: args.tailscaleIpAddress,
          }
        );
        return result;
      })
    );

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
