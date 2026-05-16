import { ComponentResource, ComponentResourceOptions, Input, Output, mergeOptions, interpolate, output, asset } from "@pulumi/pulumi";
import proxmox, { Provider as ProxmoxVEProvider } from "@muhlba91/pulumi-proxmoxve";
import { remote, types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { createPeerRelayRule, updateTailscaleProxmox } from "./tailscale.ts";
import { OPClient } from "./op.ts";
import { getHostnames } from "./helpers.ts";
import { createDnsSection, StandardDns } from "./StandardDns.ts";
import * as yaml from "yaml";
import type { TruenasVm } from "./TruenasVm.ts";
import { addUptimeGatus, copyFileToRemote, getTailscaleSection } from "@components/helpers.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { TailscaleCidr, TailscaleIp, TailscaleTags } from "@openapi/tailscale-grants.js";
import { Tailscale } from "@components/constants.ts";
import { AuthentikApplicationManager, AuthentikOutputs } from "@components/authentik.ts";
import { GatusDefinition } from "@openapi/application-definition.js";

export type OPClientItem = pulumi.Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface ProxmoxHostArgs {
  title?: Input<string>;
  globals: GlobalResources;
  proxmox: Input<OPClientItem>;
  tailscaleIpAddress: TailscaleIp;
  tailscaleTags?: TailscaleTags[];
  tailscaleSubnetRoutes: TailscaleCidr[];
  remote: boolean;
  internalIpAddress?: TailscaleIp;
  installTailscale?: boolean;
  truenas?: TruenasVm;
  cluster: Input<ClusterDefinition>;
  shortName?: string;
  peerRelay?: boolean;
  tailscaleArgs?: Partial<Parameters<typeof updateTailscaleProxmox>[0]["args"]>;
  authentikOutputs: AuthentikOutputs;
  vmIdRange: { start: number; end: number };
}

export class ProxmoxHost extends ComponentResource {
  public readonly name: string;
  public readonly internalIpAddress: TailscaleIp;
  public readonly tailscaleIpAddress: TailscaleIp;
  public readonly pveProvider: ProxmoxVEProvider;
  public readonly backupVolumes?: Output<pulumi.Unwrap<ReturnType<TruenasVm["addClusterBackup"]>>>;
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleName: Output<string>;
  public readonly hostname: Output<string>;
  public readonly arch: Output<string>;
  public readonly remote: boolean;
  public readonly dns: StandardDns;
  public readonly cluster: Output<ClusterDefinition>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly title: Output<string>;
  public readonly shortName?: string;
  public readonly applicationManager: AuthentikApplicationManager;
  public readonly vmIdRange: { randomVmIds: true; randomVmIdStart: number; randomVmIdEnd: number };
  constructor(
    name: string,
    private args: ProxmoxHostArgs,
    opts?: ComponentResourceOptions,
  ) {
    super("home:proxmox:ProxmoxHost", name, opts);

    this.name = name;
    const cluster = output(args.cluster);
    this.cluster = cluster;
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

    this.vmIdRange = {
      randomVmIds: true,
      randomVmIdStart: args.vmIdRange.start,
      randomVmIdEnd: args.vmIdRange.end,
    };
    // Create ProxmoxVE Provider
    this.pveProvider = new ProxmoxVEProvider(
      `${name}-pve-provider`,
      {
        ...this.vmIdRange,
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
        cro,
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
      updateTailscaleProxmox({
        connection,
        parent: this,
        name: this.tailscaleName,
        ipAddress: this.tailscaleIpAddress,
        globals: args.globals,
        dependsOn: [],
        args: {
          ...args.tailscaleArgs,
          advertiseTags: [Tailscale.tag.proxmox, Tailscale.tag.exitNode, ...(args.peerRelay ? [Tailscale.tag.peerRelay] : [])].concat(args.tailscaleTags ?? []),
          acceptDns: false,
          acceptRoutes: false,
          ssh: true,
          advertiseExitNode: true,
          relayServerPort: args.peerRelay ? createPeerRelayRule(this.internalIpAddress, args.globals).result : undefined,
          advertiseRoutes: args.tailscaleSubnetRoutes,
          exitNodeAllowLanAccess: true,
        },
      });
      // Configure SSH environment

      // Install jq
      const installJq = new remote.Command(
        `${name}-install-jq`,
        {
          connection: connection,
          create: "command -v jq >/dev/null 2>&1 || apt-get install -y jq",
        },
        mergeOptions(cro, { dependsOn: [] }),
      );

      // Copy Tailscale cron script
      const tailscaleCron = new remote.CopyToRemote(
        `${name}-tailscale-cron`,
        {
          connection: connection,
          remotePath: "/etc/cron.weekly/tailscale",
          source: new asset.FileAsset("scripts/tailscale.sh"),
        },
        mergeOptions(cro, { dependsOn: [installJq] }),
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
    const proxmoxInfo = new OnePasswordItem(
      `${this.name}-proxmox`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: pulumi.interpolate`ProxmoxHost: ${this.title}`,
        tags: ["proxmox", "host"],
        sections: {
          tailscale: getTailscaleSection(this),
          // dns: createDnsSection(this.dns),
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

    this.applicationManager = new AuthentikApplicationManager({
      globals: args.globals,
      clusterKey: name,
      outputs: args.authentikOutputs,
      cluster: cluster,
      loadFromResource(application, kind, { name }) {
        throw new Error("Not implemented");
      },
    });
  }

  public addNfsMount(hostname: Input<string>, remotePath: string) {
    const resourceName = `${this.name}-${remotePath.substring(1).replace(/\//g, "-")}nfs`;
    return resourceName;
    // fails with provider for now, the items get created, but seems to be a serialization issue.
    // return new proxmox.storage.Nfs(
    //   resourceName,
    //   {
    //     server: hostname,
    //     export: remotePath,
    //     resourceId: resourceName,
    //     contents: ["rootdir"],
    //     options: "rw,nfsvers=4",
    //     nodes: [this.name],
    //   },
    //   {
    //     import: resourceName,
    //     parent: this,
    //     provider: this.pveProvider,
    //   },
    // );
  }
  public addUptimeGatus() {
    addUptimeGatus(
      `proxmox-${this.name}`,
      this.args.globals,
      {
        endpoints: pulumi.output(this.applicationManager.uptimeInstances).apply((instances) => instances.map((e) => yaml.parse(yaml.stringify(e, { lineWidth: 0 })) as GatusDefinition)),
      },
      this.applicationManager,
    );
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
    remoteConnection: instance.remoteConnection!,
  };
}
