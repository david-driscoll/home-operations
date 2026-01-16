import { ComponentResource, ComponentResourceOptions, Input, Output, mergeOptions, interpolate, output, asset } from "@pulumi/pulumi";
import { Provider as ProxmoxVEProvider } from "@muhlba91/pulumi-proxmoxve";
import { getDeviceOutput, DeviceTags, DeviceKey, GetDeviceResult } from "@pulumi/tailscale";
import { remote, types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { getTailscaleClient, installTailscale } from "./tailscale.ts";
import { OPClient } from "./op.ts";
import { getHostnames } from "./hostname-helpers.ts";
import { createDnsSection, StandardDns } from "./StandardDns.ts";
import { addClusterBackup, TruenasVm } from "./TruenasVm.ts";
import { getTailscaleDevice, getTailscaleSection, writeTempFile } from "@components/helpers.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { Purrl } from "@pulumiverse/purrl";
import { Logging } from "@pulumi/command/remote/index.js";
import { TailscaleIp } from "@openapi/tailscale-grants.js";

export type OPClientItem = pulumi.Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface ProxmoxHostArgs {
  title?: Input<string>;
  globals: GlobalResources;
  proxmox: Input<OPClientItem>;
  tailscaleIpAddress: TailscaleIp;
  macAddress: string;
  isProxmoxBackupServer: boolean;
  remote: boolean;
  internalIpAddress?: TailscaleIp;
  installTailscale?: boolean;
  cluster: Input<ClusterDefinition>;
  shortName?: string;
  enableClusterBackup: boolean;
  tailscaleArgs?: Parameters<typeof installTailscale>[0]["args"];
}

export class ProxmoxHost extends ComponentResource {
  public readonly name: string;
  public readonly internalIpAddress: TailscaleIp;
  public readonly tailscaleIpAddress: TailscaleIp;
  public readonly macAddress: string;
  public readonly pveProvider: ProxmoxVEProvider;
  public readonly backupVolumes?: Output<pulumi.Unwrap<ReturnType<typeof addClusterBackup>>>;
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleName: Output<string>;
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
    this.tailscaleName = output(name);

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
      cro
    );

    if (args.enableClusterBackup) {
      this.backupVolumes = pulumi.output(addClusterBackup(name, { globals: args.globals, parent: this }));
    }

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.tailscaleHostname,
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
        cro
      );

      const configureSshEnv = new remote.Command(
        `${name}-configure-ssh-env`,
        {
          connection: connection,
          create: interpolate`mkdir -p /etc/ssh/sshd_config.d/ && echo 'AcceptEnv TS_AUTHKEY' > /etc/ssh/sshd_config.d/99-tailscale.conf && systemctl restart sshd`,
        },
        cro
      );

      // Install jq
      const installJq = new remote.Command(
        `${name}-install-jq`,
        {
          connection: connection,
          create: "apt-get install -y jq",
        },
        mergeOptions(cro, { dependsOn: [configureSshEnv] })
      );

      // TODO: make work at somepoint
      // const script = new Purrl(`${name}-alloy-script`, {
      //   name: "install-alloystack.sh",
      //   url: "https://raw.githubusercontent.com/IT-BAER/alloy-aio/main/alloy_setup.sh",
      //   method: "GET",
      //   responseCodes: ["200"],
      // });

      // const filePath = writeTempFile(`${name}-alloystack-script`, script.response);

      // const alloyScriptOnServer = new remote.CopyToRemote(`${name}-copy-alloystack-script`, {
      //   connection: connection,
      //   remotePath: "/tmp/install-alloystack.sh",
      //   source: filePath.apply((path) => new asset.FileAsset(path)),
      // });

      // const installAlloyStack = new remote.Command(
      //   `${name}-install-alloystack`,
      //   {
      //     connection: connection,
      //     create: interpolate`chmod +x /tmp/install-alloystack.sh && /tmp/install-alloystack.sh --loki-url "http://loki.${args.globals.tailscaleDomain}:3100/loki/api/v1/push" --prometheus-url "http://thanos-receive.${args.globals.tailscaleDomain}:19291/api/v1/receive"`,
      //     logging: Logging.StdoutAndStderr,
      //   },
      //   mergeOptions(cro, { dependsOn: [alloyScriptOnServer] })
      // );

      const tailscaleSet = installTailscale({
        connection,
        name,
        parent: this,
        tailscaleName: this.tailscaleHostname,
        globals: args.globals,
        args: { acceptDns: true, acceptRoutes: true, ssh: true, advertiseExitNode: true, ...args.tailscaleArgs },
      });
      // Configure SSH environment

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

      // Get Tailscale device
      const device = getDeviceOutput({ hostname: this.tailscaleHostname }, { provider: args.globals.tailscaleProvider, parent: this }).apply(async (result) => {
        try {
          const client = await getTailscaleClient();
          await client.paths["/device/{deviceId}/ip"].post({ deviceId: result.nodeId }, { ipv4: args.tailscaleIpAddress });
        } catch (e) {
          pulumi.log.error(`Error setting IP address for device ${args.tailscaleIpAddress}: ${e}`, this);
        }
        return result;
      });
      // Create device tags
      const deviceTags = new DeviceTags(
        `${name}-tags`,
        {
          tags: ["tag:proxmox", "tag:exit-node"],
          deviceId: device.apply((z) => z.id),
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
          deviceId: device.apply((z) => z.id),
        },
        {
          provider: args.globals.tailscaleProvider,
          parent: this,
        }
      );
    }

    const proxmoxInfo = new OnePasswordItem(
      `${this.name}-proxmox`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: pulumi.interpolate`ProxmoxHost: ${this.title}`,
        tags: ["proxmox", "host"],
        sections: {
          tailscale: getTailscaleSection(this),
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
      cro
    );

    // Note: The commented-out Hosts resource would need to be implemented
    // if you have a custom Hosts resource or provider for managing /etc/hosts
  }
}

export function getProxmoxProperties(instance: ProxmoxHost) {
  return {
    tailscale: {
      ipAddress: instance.tailscaleIpAddress,
      hostname: instance.tailscaleHostname,
    },
    name: instance.name,
    hostname: instance.hostname,
    ipAddress: instance.internalIpAddress,
    macAddress: instance.macAddress,
    remoteConnection: instance.remoteConnection!,
  };
}
