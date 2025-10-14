import * as proxmox from "@muhlba91/pulumi-proxmoxve";
import { DnsRecord as CloudflareDnsRecord, Tunnel } from "@pulumi/cloudflare";
import {} from "@pulumi/tailscale";
import { DnsRecord as UnifiDnsRecord, User, getUserOutput } from "@pulumi/unifi";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { all, asset, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, log, mergeOptions, Output, output, runtime } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { PrivateKey } from "@pulumi/tls";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { createDnsRecord, createDnsSection, getContainerHostnames } from "./helper.ts";
import { CT } from "@muhlba91/pulumi-proxmoxve/types/input.js";
import { DeviceKey, DeviceTags, getDevice, getDeviceOutput, GetDeviceResult } from "@pulumi/tailscale";
import { tailscale } from "@components/tailscale.ts";
import { getUser } from "sdks/unifi/getUser.ts";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { md5 } from "@pulumi/std";
import { md5Output } from "@pulumi/std/md5.js";
import { getContainerOutput } from "@muhlba91/pulumi-proxmoxve/getContainer.js";
import { basename, dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { getTailscaleDevice, getTailscaleSection } from "@components/helpers.ts";
import { fileURLToPath } from "node:url";
import { OPClient } from "@components/op.ts";
import { stderr, stdout } from "node:process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dockerPath = resolve(__dirname, "../../docker");

export interface DockgeLxcArgs {
  globals: GlobalResources;
  host: ProxmoxHost;
  vmId: number;
  cluster: Input<ClusterDefinition>;
}
export class DockgeLxc extends ComponentResource {
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleIpAddress: Output<string>;
  public readonly hostname: Output<string>;
  public readonly device: Output<GetDeviceResult>;
  public readonly dns: ReturnType<typeof createDnsRecord>;
  public readonly ipAddress: Output<string>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly dockgeDns: ReturnType<typeof createDnsRecord>;
  public readonly internalDns: ReturnType<typeof createDnsRecord>;
  public readonly stacks: Output<string[]>;
  constructor(name: string, args: DockgeLxcArgs) {
    super("home:dockge:DockgeLxc", name, {}, { parent: args.host });

    const cro = { parent: this };

    const tailscaleIpParts = args.host.tailscaleIpAddress.split(".");
    const ipAddressResource = new remote.Command(
      `${name}-get-ip-address`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- ip -4 addr show dev eth0 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | head -n1`,
      },
      mergeOptions(cro, { dependsOn: [] }),
    );
    this.tailscaleIpAddress = output(`${tailscaleIpParts[0]}.${tailscaleIpParts[1]}.${args.host.tailscaleIpAddress[args.host.tailscaleIpAddress.length - 1]}0.100`);
    const ipAddress = (this.ipAddress = args.host.remote ? ipAddressResource.stdout : this.tailscaleIpAddress);

    const { hostname, tailscaleHostname, tailscaleName } = getContainerHostnames("dockge", args.host, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;
    const sshConfig = new remote.Command(
      `${name}-ssh-config`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- mkdir -p /etc/ssh/sshd_config.d/ && echo 'AcceptEnv TS_AUTHKEY' > /etc/ssh/sshd_config.d/99-tailscale.conf && systemctl restart sshd`,
      },
      mergeOptions(cro, { dependsOn: [] }),
    );

    const installTailscale = new remote.Command(
      `${name}-tailscale-install`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- curl -fsSL https://tailscale.com/install.sh | sh`,
      },
      mergeOptions(cro, { dependsOn: [ipAddressResource] }),
    );

    const tailscaleArgs = interpolate`--hostname=${tailscaleName} --accept-dns --accept-routes --ssh --accept-risk=lose-ssh`;

    // Set Tailscale configuration
    const tailscaleUp = new remote.Command(
      `${name}-tailscale-up`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} --keep-env -- tailscale up ${tailscaleArgs} --reset`,
        environment: { TS_AUTHKEY: args.globals.tailscaleAuthKey.key },
      },
      mergeOptions(cro, { dependsOn: [installTailscale] }),
    );

    const tailscaleSet = new remote.Command(
      `${name}-tailscale-set`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} --keep-env -- tailscale set ${tailscaleArgs} --auto-update `,
        environment: { TS_AUTHKEY: args.globals.tailscaleAuthKey.key },
      },
      mergeOptions(cro, { dependsOn: [tailscaleUp, sshConfig, installTailscale] }),
    );

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.tailscaleHostname,
      user: args.globals.proxmoxCredential.apply((z) => z.fields?.username?.value!),
      password: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!),
    });

    function replaceVariable(key: RegExp, value: Input<string>) {
      return (input: Input<string>) => all([value, input]).apply(([v, i]) => i.replace(key, v));
    }

    this.dns = createDnsRecord(name, this.hostname, ipAddress, args.globals, mergeOptions(cro, { dependsOn: [] }));
    this.internalDns = createDnsRecord(`${name}-internal`, interpolate`internal.${this.hostname}`, ipAddress, args.globals, mergeOptions(cro, { dependsOn: [] }));
    this.dockgeDns = createDnsRecord(`${name}-dockge`, interpolate`dockge.${this.hostname}`, ipAddress, args.globals, mergeOptions(cro, { dependsOn: [] }));

    // Get Tailscale device - this will need to be done after the hook script runs
    // and Tailscale is configured. For now, we'll comment this out as it requires
    // manual Tailscale configuration after container creation.

    this.device = all([this.tailscaleIpAddress, getDeviceOutput({ name: tailscaleHostname }, { provider: args.globals.tailscaleProvider, parent: this, dependsOn: [tailscaleSet] })]).apply(
      async ([tailscaleIpAddress, result]) => {
        await tailscale.paths["/device/{deviceId}/ip"].post({ deviceId: result.nodeId }, { ipv4: tailscaleIpAddress });
        return result;
      },
    );

    // // Create device tags
    const deviceTags = new DeviceTags(
      `${name}-tags`,
      {
        tags: ["tag:dockge"],
        deviceId: this.device.apply((z) => z.id),
      },
      {
        provider: args.globals.tailscaleProvider,
        parent: this,
        retainOnDelete: true,
        dependsOn: [tailscaleSet],
      },
    );

    // // Create device key
    const deviceKey = new DeviceKey(
      `${name}-key`,
      {
        keyExpiryDisabled: true,
        deviceId: this.device.apply((z) => z.id),
      },
      {
        provider: args.globals.tailscaleProvider,
        parent: this,
        dependsOn: [tailscaleSet],
      },
    );

    const op = new OPClient();
    const authentikToken = output(op.getItemByTitle("Authentik Token"));

    const replacements = [
      replaceVariable(/\$\{host\}/g, output(args.host.name)),
      replaceVariable(/\$\{hostname\}/g, hostname),
      replaceVariable(/\$\{tailscaleIpAddress\}/g, this.tailscaleIpAddress),
      replaceVariable(/\$\{ipAddress\}/g, this.ipAddress),
      replaceVariable(/\$\{tailscaleHostname\}/g, tailscaleHostname),
      replaceVariable(
        /\$\{cloudflareApiToken\}/g,
        args.globals.cloudflareCredential.apply((c) => c.fields["credential"].value!),
      ),
      replaceVariable(/\$\{tailscaleAuthKey\}/g, args.globals.tailscaleAuthKey.key),
      replaceVariable(/\$\{CLUSTER_TITLE\}/g, args.host.title),
      replaceVariable(/\$\{CLUSTER_DOMAIN\}/g, output(args.cluster).rootDomain),
    ];

    this.stacks = output(readdir(resolve(dockerPath, "_common")).then((files) => files.map((f) => createStack(resolve(dockerPath, "_common", f), replacements))))
      .apply((z) => {
        const hostStacks = output(readdir(resolve(dockerPath, args.host.name)).then((files) => files.map((f) => createStack(resolve(dockerPath, args.host.name, f), replacements))));
        return all([z, hostStacks]).apply(([a, b]) => [...a, ...b]);
      })
      .apply((z) => {
        z.forEach((s) => console.log(`Loaded docker stack ${s.name} from ${s.path}`));
        return z.map((z) => z.name);
      });

    async function createStack(path: string, replacements: ((input: Output<string>) => Output<string>)[]) {
      const stackName = basename(path);
      const files = await readdir(path);
      const fileAssets = output(
        files.map(async (file) => {
          const content = await readFile(resolve(path, file), "utf-8");
          const items = replacements.reduce((p, r) => r(p), output(content));

          return items.apply(async (content) => {
            mkdirSync(`./.tmp/`, { recursive: true });
            const tempFilePath = `./.tmp/${args.host.name}-${stackName}-${file}`;
            await writeFile(tempFilePath, content);
            return {
              id: md5Output({ input: content }).result,
              remotePath: interpolate`/opt/stacks/${stackName}/${file}`,
              source: new asset.FileAsset(tempFilePath),
            };
          });
        }),
      );

      const mkdir = new remote.Command(
        `${args.host.name}-${stackName}-mkdir`,
        {
          connection: connection,
          create: interpolate`mkdir -p /opt/stacks/${stackName}/`,
        },
        mergeOptions(cro, { dependsOn: [tailscaleSet] }),
      );

      const copyFiles = fileAssets.apply((assets) => {
        return assets.map(
          (item) =>
            new remote.CopyToRemote(
              `${args.host.name}-${item.id}-copy-file`,
              {
                connection: connection,
                remotePath: item.remotePath,
                source: item.source,
              },
              mergeOptions(cro, { dependsOn: [mkdir] }),
            ),
        );
      });

      const compose = new remote.Command(
        `${args.host.name}-${stackName}-compose`,
        {
          connection: connection,
          triggers: copyFiles.apply((z) => z.map((f) => f.id)),
          create: interpolate`cd /opt/stacks/${stackName} && docker compose -f compose.yaml up -d`,
        },
        mergeOptions(cro, { dependsOn: copyFiles }),
      );

      return { name: stackName, path, compose };
    }

    const dockgeInfo = new OnePasswordItem(`${args.host.name}-dockge`, {
      category: FullItem.CategoryEnum.SecureNote,
      title: interpolate`DockgeLxc: ${args.host.title}`,
      tags: ["dockge", "lxc"],
      sections: {
        tailscale: getTailscaleSection(this.device),
        dns: createDnsSection(this.dns),
        internalDns: createDnsSection(this.internalDns),
        dockgeDns: createDnsSection(this.dockgeDns),
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
        ipAddress: { type: TypeEnum.String, value: this.ipAddress },
        tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
      },
    });
  }
}

export function getDockageProperties(instance: DockgeLxc) {
  return output({
    hostname: instance.hostname,
    ipAddress: instance.ipAddress,
    dns: instance.dns,
    dockgeDns: instance.dockgeDns,
    internalDns: instance.internalDns,
    remoteConnection: instance.remoteConnection!,
  });
}
