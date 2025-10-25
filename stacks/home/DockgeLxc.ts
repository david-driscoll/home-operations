import { ProxmoxHost } from "./ProxmoxHost.ts";
import { all, asset, ComponentResource, ComponentResourceOptions, Input, interpolate, log, mergeOptions, Output, output, Unwrap, jsonStringify } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { getContainerHostnames } from "./helper.ts";
import { createDnsSection } from "./StandardDns.ts";
import { StandardDns } from "./StandardDns.ts";
import { DeviceKey, DeviceTags, getDeviceOutput, GetDeviceResult } from "@pulumi/tailscale";
import { RandomPet, RandomPassword, RandomString } from "@pulumi/random";
import { installTailscale, tailscale } from "@components/tailscale.ts";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { md5 } from "@pulumi/std";
import { basename, dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { awaitOutput, getTailscaleSection } from "@components/helpers.ts";
import { fileURLToPath } from "node:url";
import { OPClient } from "@components/op.ts";
import { glob } from "glob";
import * as yaml from "yaml";
import { ApplicationDefinitionSchema } from "@openapi/application-definition.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dockerPath = resolve(__dirname, "../../docker");

export type OPClientItem = Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface DockgeLxcArgs {
  globals: GlobalResources;
  host: ProxmoxHost;
  vmId: number;
  ipAddress?: string;
  tailscaleIpAddress?: string;
  cluster: Input<ClusterDefinition>;
  credential: Input<OPClientItem>;
  tailscaleArgs?: Parameters<typeof installTailscale>[0]["args"];
}
export class DockgeLxc extends ComponentResource {
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleIpAddress: Output<string>;
  public readonly hostname: Output<string>;
  public readonly device: Output<GetDeviceResult>;
  public readonly dns: StandardDns;
  public readonly ipAddress: Output<string>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly stacks: Output<string[]>;
  public readonly credential: Output<OPClientItem>;
  public readonly cluster: Output<ClusterDefinition>;
  constructor(name: string, private readonly args: DockgeLxcArgs) {
    super("home:dockge:DockgeLxc", name, {}, { parent: args.host });

    const cro = { parent: this };
    const cluster = output(args.cluster);
    this.cluster = cluster;

    const { hostname, tailscaleHostname, tailscaleName } = getContainerHostnames("dockge", args.host, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;

    const tailscaleIpParts = (args.tailscaleIpAddress ?? args.host.tailscaleIpAddress).split(".");
    this.tailscaleIpAddress = output(args.tailscaleIpAddress ?? `${tailscaleIpParts[0]}.${tailscaleIpParts[1]}.${args.host.tailscaleIpAddress[args.host.tailscaleIpAddress.length - 1]}0.100`);

    const ipAddress = (this.ipAddress = args.ipAddress
      ? output(args.ipAddress)
      : args.host.remote
      ? this.tailscaleIpAddress
      : new remote.Command(
          `${name}-get-ip-address`,
          {
            connection: args.host.remoteConnection,
            create: interpolate`pct exec ${args.vmId} -- ip -4 addr show dev eth0 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | head -n1`,
          },
          mergeOptions(cro, { dependsOn: [] })
        ).stdout);

    this.credential = output(args.credential);

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.tailscaleHostname,
      user: this.credential.apply((z) => z.fields?.username?.value!),
      password: this.credential.apply((z) => z.fields?.password?.value!),
    });
    const tailscaleSet = installTailscale({ connection, name, parent: this, tailscaleName, globals: args.globals, args: { acceptDns: true, acceptRoutes: true, ssh: true, ...args.tailscaleArgs } });

    this.dns = new StandardDns(name, { hostname: this.hostname, ipAddress, type: "A" }, args.globals, mergeOptions(cro, { dependsOn: [] }));

    // Get Tailscale device - this will need to be done after the hook script runs
    // and Tailscale is configured. For now, we'll comment this out as it requires
    // manual Tailscale configuration after container creation.

    this.device = all([this.tailscaleIpAddress, getDeviceOutput({ name: tailscaleHostname }, { provider: args.globals.tailscaleProvider, parent: this, dependsOn: [tailscaleSet] })]).apply(
      async ([tailscaleIpAddress, result]) => {
        try {
          await tailscale.paths["/device/{deviceId}/ip"].post({ deviceId: result.nodeId }, { ipv4: tailscaleIpAddress });
        } catch (e) {
          log.error(`Error setting IP address for device ${tailscaleIpAddress}: ${e}`, this);
        }
        return result;
      }
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
      }
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
      }
    );

    const op = new OPClient();
    const authentikToken = output(op.getItemByTitle("Authentik Token"));
    const vaultRegex = /op\:\/\/Eris\/(\w+)\/(\w+)/g;

    const replacements = [
      replaceVariable(/\$\{host\}/g, output(args.host.shortName ?? args.host.name)),
      replaceVariable(/\$\{searchDomain\}/g, args.globals.searchDomain),
      replaceVariable(/\$\{tailscaleDomain\}/g, args.globals.tailscaleDomain),
      replaceVariable(/\$\{hostname\}/g, hostname),
      replaceVariable(/\$\{tailscaleIpAddress\}/g, this.tailscaleIpAddress),
      replaceVariable(/\$\{ipAddress\}/g, this.ipAddress),
      replaceVariable(/\$\{tailscaleHostname\}/g, tailscaleHostname),
      replaceVariable(/\$\{tailscaleAuthKey\}/g, args.globals.tailscaleAuthKey.key),
      replaceVariable(/\$\{CLUSTER_TITLE\}/g, cluster.title),
      replaceVariable(/\$\{CLUSTER_KEY\}/g, cluster.key),
      replaceVariable(/\$\{CLUSTER_DOMAIN\}/g, cluster.rootDomain),
      replaceVariable(/\$\{CLUSTER_AUTHENTIK_DOMAIN\}/g, cluster.authentikDomain),
      (input: Input<string>) => {
        return output(input).apply(async (str) => {
          const matches = str.matchAll(vaultRegex);
          const items = new Map();
          for (const [, itemTitle, fieldName] of matches) {
            if (items.has(`op://Eris/${itemTitle}/${fieldName}`)) {
              continue;
            }
            const item = await op.getItemByTitle(itemTitle);
            items.set(`op://Eris/${itemTitle}/${fieldName}`, item.fields?.[fieldName].value);
          }

          return str.replace(vaultRegex, (fullMatch) => {
            return items.get(fullMatch) || fullMatch;
          });
        });
      },
    ];

    this.stacks = output(readdir(resolve(dockerPath, "_common")))
      .apply((files) => files.map((f) => this.createStack(args.host.name, resolve(dockerPath, "_common", f), replacements)))
      .apply((z) => {
        const hostStacks = output(
          readdir(resolve(dockerPath, args.host.name)).then((files) =>
            files.filter((z) => z !== ".keep").map((f) => this.createStack(args.host.name, resolve(dockerPath, args.host.name, f), replacements))
          )
        );
        return all([z, hostStacks]).apply(([a, b]) => [...a, ...b]);
      })
      .apply((z) => {
        z.forEach((s) => console.log(`Loaded docker stack ${s.name} from ${s.path} (${z.map((z) => z.name).join(", ")})`));
        return z.map((z) => z.name);
      });

    const dockgeInfo = new OnePasswordItem(
      `${args.host.name}-dockge`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: interpolate`DockgeLxc: ${args.host.title}`,
        tags: ["dockge", "lxc"],
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
          ipAddress: { type: TypeEnum.String, value: this.ipAddress },
          tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
        },
      },
      cro
    );

    new remote.Command(`${name}-delete-docker-daemon`, {
      connection: this.remoteConnection,
      create: interpolate`rm -f /etc/docker/daemon.json`,
    });
  }

  private async createStack(hostname: string, path: string, replacements: ((input: Output<string>) => Output<string>)[]) {
    const stackName = basename(path);
    const files = await glob("**/*", { cwd: path, absolute: false, nodir: true, dot: true });
    const copyFiles = [];
    const cluster = await awaitOutput(this.cluster);
    mkdirSync(`./.tmp/`, { recursive: true });

    replacements = [...replacements, replaceVariable(/\$\{STACK_NAME\}/g, stackName), replaceVariable(/\$\{APP\}/g, stackName)];

    const mkdir = new remote.Command(
      `${hostname}-${stackName}-mkdir`,
      {
        connection: this.remoteConnection,
        create: interpolate`mkdir -p /opt/stacks/${stackName}/`,
      },
      mergeOptions({ parent: this }, { dependsOn: [] })
    );

    for (const file of files) {
      const content = await readFile(resolve(path, file), "utf-8");
      let replacedContent = replacements.reduce((p, r) => r(p), output(content));
      const tempFilePath = `./.tmp/${hostname}-${stackName}-${file.replace(/\//g, "-")}`;

      if (tempFilePath.endsWith("compose.yaml")) {
        const content = await awaitOutput(replacedContent);
        const regex = /Host\(`(.*?)`\)/g;
        const hosts = new Set<string>(Array.from(content.matchAll(regex)).map((z) => z[1]));
        if (stackName !== "adguard") {
          for (const host of hosts) {
            new StandardDns(
              `${stackName}-${host.replace(/\./g, "_")}`,
              {
                hostname: interpolate`${host}`,
                ipAddress: this.ipAddress,
                type: "CNAME",
                record: this.hostname,
              },
              this.args.globals,
              {
                parent: this,
              }
            );
          }
        }
      } else if (file === "definition.yaml") {
        // intercept definition file and create the client id / client secret and inject that into the yaml.
        const parsed = yaml.parse(await awaitOutput(replacedContent)) as ApplicationDefinitionSchema;
        const oauth2 = parsed.spec.authentik?.oauth2;
        if (oauth2) {
          const clientId = new RandomString(
            `${cluster.key}-${stackName}-client-id`,
            {
              length: 16,
              upper: false,
              special: false,
            },
            { parent: this }
          );
          const clientSecret = new RandomPassword(`${cluster.key}-${stackName}-client-secret`, { length: 32, special: true }, { parent: this });
          const [clientIdResult, clientSecretResult] = await awaitOutput(all([clientId.id, clientSecret.result]));

          oauth2.clientId = clientIdResult;
          oauth2.clientSecret = clientSecretResult;
          replacedContent = output(yaml.stringify(parsed));
        }
      }

      await writeFile(tempFilePath, await awaitOutput(replacedContent));
      const remotePath = interpolate`/opt/stacks/${stackName}/${file}`;
      const fileAsset = new asset.FileAsset(tempFilePath);
      const id = (await md5({ input: content })).result;

      copyFiles.push(
        new remote.CopyToRemote(
          `${hostname}-${id}-copy-file`,
          {
            connection: this.remoteConnection,
            remotePath,
            source: fileAsset,
          },
          mergeOptions({ parent: this }, { dependsOn: [mkdir] })
        )
      );
    }

    const compose = new remote.Command(
      `${hostname}-${stackName}-compose`,
      {
        connection: this.remoteConnection,
        triggers: copyFiles.map((f) => f.id),
        create: interpolate`cd /opt/stacks/${stackName} && docker compose -f compose.yaml up -d`,
      },
      mergeOptions({ parent: this }, { dependsOn: copyFiles })
    );

    return { name: stackName, path, compose };
  }
}

function replaceVariable(key: RegExp, value: Input<string>) {
  return (input: Input<string>) => all([value, input]).apply(([v, i]) => i.replace(key, v));
}

export function getDockageProperties(instance: DockgeLxc) {
  return output({
    tailscale: {
      ipAddress: instance.tailscaleIpAddress,
      hostname: instance.tailscaleHostname,
    },
    hostname: instance.hostname,
    ipAddress: instance.ipAddress,
    remoteConnection: instance.remoteConnection!,
  });
}
