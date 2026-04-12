import { ComponentResource, ComponentResourceOptions, Input, Output, mergeOptions, interpolate, output, asset, unknown, runtime } from "@pulumi/pulumi";
import { Provider as ProxmoxVEProvider } from "@muhlba91/pulumi-proxmoxve";
import { getDeviceOutput, DeviceTags, DeviceKey, GetDeviceResult } from "@pulumi/tailscale";
import { remote, types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { createPeerRelayRule, getTailscaleClient, updateTailscaleProxmox } from "../../components/tailscale.js";
import { OPClient } from "../../components/op.ts";
import { getHostnames } from "./helper.ts";
import { createDnsSection, StandardDns } from "./StandardDns.ts";
import { TruenasVm } from "./TruenasVm.ts";
import { copyFileToRemote, getTailscaleDevice, getTailscaleSection } from "@components/helpers.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { Purrl } from "@pulumiverse/purrl";
import proxmox from "@muhlba91/pulumi-proxmoxve";
import { Logging } from "@pulumi/command/remote/index.js";
import { TailscaleIp, TailscaleTags } from "@openapi/tailscale-grants.js";

export type OPClientItem = pulumi.Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface ProxmoxHostArgs {
  title?: Input<string>;
  globals: GlobalResources;
  proxmox: Input<OPClientItem>;
  tailscaleIpAddress: TailscaleIp;
  tailscaleTags?: TailscaleTags[];
  macAddress: string;
  remote: boolean;
  internalIpAddress?: TailscaleIp;
  installTailscale?: boolean;
  truenas?: TruenasVm;
  cluster: Input<ClusterDefinition>;
  shortName?: string;
  peerRelay?: boolean;
  tailscaleArgs?: Parameters<typeof updateTailscaleProxmox>[0]["args"];
}

export class ProxmoxHost extends ComponentResource {
  public readonly name: string;
  public readonly internalIpAddress: TailscaleIp;
  public readonly tailscaleIpAddress: TailscaleIp;
  public readonly macAddress: string;
  public readonly pveProvider: ProxmoxVEProvider;
  public readonly rootPveProvider: ProxmoxVEProvider;
  public readonly backupVolumes?: Output<pulumi.Unwrap<ReturnType<TruenasVm["addClusterBackup"]>>>;
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
      cro,
    );
    // Create ProxmoxVE Provider
    this.rootPveProvider = new ProxmoxVEProvider(
      `${name}-root-pve-provider`,
      {
        randomVmIds: true,
        randomVmIdStart: 1000,
        randomVmIdEnd: 1999,
        endpoint: interpolate`https://${this.tailscaleHostname}:8006/`,
        username: "root@pam",
        password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
        // apiToken: interpolate`${apiCredential.apply((z) => z.fields["username"].value)}=${apiCredential.apply((z) => z.fields["credential"].value)}`,
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
      host: this.tailscaleIpAddress,
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

      // Install jq
      const installJq = new remote.Command(
        `${name}-install-jq`,
        {
          connection: connection,
          create: "command -v jq >/dev/null 2>&1 || apt-get install -y jq",
        },
        mergeOptions(cro, { dependsOn: [] }),
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

      const tailscaleForwardingConfig = copyFileToRemote(`${name}-tailscale-forwarding-config`, {
        connection,
        remotePath: "/etc/sysctl.d/99-tailscale.conf",
        content: `net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
`,
        parent: this,
      });

      const tailscaleForwarding = new remote.Command(
        `${name}-tailscale-forwarding`,
        {
          connection,
          create: "sysctl -p /etc/sysctl.d/99-tailscale.conf",
          triggers: [tailscaleForwardingConfig.id],
        },
        mergeOptions(cro, { dependsOn: [tailscaleForwardingConfig] }),
      );

      const tailscaleSet = updateTailscaleProxmox({
        connection,
        name,
        parent: this,
        tailscaleName: this.tailscaleName,
        globals: args.globals,
        dependsOn: [tailscaleForwarding],
        args: {
          acceptDns: false,
          acceptRoutes: false,
          ssh: true,
          advertiseExitNode: true,
          relayServerPort: args.peerRelay ? createPeerRelayRule(this.internalIpAddress, args.globals).result : undefined,
          ...args.tailscaleArgs,
        },
      });
      // Configure SSH environment

      // Copy Tailscale cron script
      const tailscaleCron = new remote.CopyToRemote(
        `${name}-tailscale-cron`,
        {
          connection: connection,
          remotePath: "/etc/cron.weekly/tailscale",
          source: new asset.FileAsset("scripts/tailscale.sh"),
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

      // Get Tailscale device
      const device = runtime.isDryRun()
        ? (output(unknown) as ReturnType<typeof getDeviceOutput>)
        : getDeviceOutput(
            { hostname: this.tailscaleHostname },
            {
              provider: args.globals.tailscaleProvider,
              parent: this,
              dependsOn: [tailscaleSetCert, tailscaleSet],
            },
          ).apply(async (result) => {
            try {
              const client = await getTailscaleClient();
              await client.POST("/device/{deviceId}/ip", { params: { path: { deviceId: result.nodeId } }, body: { ipv4: args.tailscaleIpAddress } });
            } catch (e) {
              pulumi.log.warn(`Error setting IP address for device ${args.tailscaleIpAddress}: ${e}`, this);
            }
            return result;
          });
      // Create device tags
      const deviceTags = new DeviceTags(
        `${name}-tags`,
        {
          tags: ["tag:proxmox", "tag:exit-node"].concat(args.tailscaleTags ?? []),
          deviceId: device.apply((z) => z.id),
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
          deviceId: device.apply((z) => z.id),
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
      cro,
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
