import { ProxmoxHost } from "./ProxmoxHost.ts";
import { all, ComponentResource, Input, interpolate, log, mergeOptions, Output, output, Resource, Unwrap } from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { remote, types } from "@pulumi/command";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { getContainerHostnames } from "./helper.ts";
import { createDnsSection } from "./StandardDns.ts";
import { StandardDns } from "./StandardDns.ts";
import { DeviceKey, DeviceTags, getDeviceOutput, GetDeviceResult } from "@pulumi/tailscale";
import { RandomPassword, RandomString } from "@pulumi/random";
import { installTailscale, tailscale } from "@components/tailscale.ts";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { awaitOutput, BackupTask, copyFileToRemote, getTailscaleSection } from "@components/helpers.ts";
import { fileURLToPath } from "node:url";
import { OPClient } from "@components/op.ts";
import { glob } from "glob";
import * as yaml from "yaml";
import { ApplicationDefinitionSchema, ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { BackupJobManager } from "./jobs.ts";
import { Command, CopyToRemote } from "@pulumi/command/remote/index.js";
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
  sftpKey: tls.PrivateKey;
}
export class DockgeLxc extends ComponentResource {
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleIpAddress: Output<string>;
  public readonly hostname: Output<string>;
  public readonly device: Output<GetDeviceResult>;
  public readonly dns: StandardDns;
  public readonly ipAddress: Output<string>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly credential: Output<OPClientItem>;
  public readonly cluster: Output<ClusterDefinition>;
  private backupJobManager: BackupJobManager;
  shortName: string | undefined;
  constructor(name: string, private readonly args: DockgeLxcArgs) {
    super("home:dockge:DockgeLxc", name, {}, { parent: args.host });

    const cro = { parent: this };
    const cluster = output(args.cluster);
    this.cluster = cluster;
    this.shortName = args.host.shortName ?? name;

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
    const tailscaleSet = installTailscale({ connection, name, parent: this, tailscaleName, globals: args.globals, args: { acceptDns: true, acceptRoutes: false, ssh: true, ...args.tailscaleArgs } });

    this.dns = new StandardDns(name, { hostname: this.hostname, ipAddress, type: "A" }, args.globals, mergeOptions(cro, { dependsOn: [] }));

    // Seed SFTP keys into the rclone-sftp stack path on the remote host
    const sftpKeysDir = "/opt/stacks/rclone-sftp/keys";
    const jobsKeysDir = "/opt/stacks/backups/keys";

    const ensureKeysDir = new remote.Command(
      `${name}-ensure-sftp-keys-dir`,
      {
        connection: this.remoteConnection,
        create: interpolate`mkdir -p ${sftpKeysDir} ${jobsKeysDir}`,
      },
      mergeOptions(cro, { dependsOn: [] })
    );

    const keyWrites: any[] = [];

    keyWrites.push(
      copyFileToRemote(`${name}-sftp-authorized-keys`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/authorized_keys`,
        content: output(args.sftpKey.publicKeyOpenssh).apply((k) => `${k.trim()}\n`),
        parent: this,
        dependsOn: [ensureKeysDir],
      })
    );

    keyWrites.push(
      copyFileToRemote(`${name}-sftp-host-key`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/host_key`,
        content: output(args.sftpKey.privateKeyPem).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      })
    );

    // Derive server public key (OpenSSH) for clients
    const sftpHostPublicKey = tls.getPublicKeyOutput({ privateKeyPem: args.sftpKey.privateKeyPem }).publicKeyOpenssh;

    // Write client private key for rclone-jobs client
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-client-key`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/id_ed25519`,
        content: output(args.sftpKey.privateKeyPem).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      })
    );

    // Write client private key for rclone-jobs client
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-client-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/id_ed25519.pub`,
        content: output(args.sftpKey.publicKeyPem).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      })
    );

    // Write server public key for known_hosts usage by clients
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-server-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/server_host_key.pub`,
        content: output(sftpHostPublicKey).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      })
    );

    // Also generate a convenience known_hosts entry using tailscale hostname with port
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-known-hosts`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/known_hosts`,
        content: all([this.tailscaleHostname, sftpHostPublicKey]).apply(([h, k]) => `[${h}]:2022 ${k.trim()}\n`),
        parent: this,
        dependsOn: [ensureKeysDir],
      })
    );

    // Set restrictive permissions on the keys
    new remote.Command(
      `${name}-sftp-keys-perms`,
      {
        connection: this.remoteConnection,
        triggers: keyWrites.map((k) => k.id),
        create: interpolate`chmod 700 ${sftpKeysDir} ${jobsKeysDir} && chmod 600 ${sftpKeysDir}/host_key ${sftpKeysDir}/authorized_keys ${jobsKeysDir}/id_ed25519 ${jobsKeysDir}/id_ed25519.pub ${jobsKeysDir}/known_hosts ${jobsKeysDir}/server_host_key.pub || true`,
      },
      mergeOptions(cro, { dependsOn: keyWrites })
    );

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

    // Create device tags
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
        dependsOn: [tailscaleSet],
      }
    );

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

    this.backupJobManager = new BackupJobManager(`${name}-backup-job-manager`, {
      cluster: this,
      globals: this.args.globals,
    });
  }
  public createBackupJob(job: BackupTask) {
    return this.backupJobManager.createBackupJob(job);
  }

  public createBackupUptime(): Output<{ "external-endpoints": ExternalEndpoint[]; endpoints: GatusDefinition[] }> {
    return this.backupJobManager.createUptime();
  }

  public deployStacks(args: { dependsOn: Input<Resource[]> }): Output<Command[]> {
    const op = new OPClient();
    const authentikToken = output(op.getItemByTitle("Authentik Token"));
    const vaultRegex = /op\:\/\/Eris\/([\w| ]+)\/([\w| ]+)/g;

    const replacements = [
      replaceVariable(/\$\{host\}/g, output(this.args.host.shortName ?? this.args.host.name)),
      replaceVariable(/\$\{searchDomain\}/g, this.args.globals.searchDomain),
      replaceVariable(/\$\{TZ\}/g, "America/New_York"),
      replaceVariable(/\$\{TIMEZONE\}/g, "America/New_York"),
      replaceVariable(/\$\{tailscaleDomain\}/g, this.args.globals.tailscaleDomain),
      replaceVariable(/\$\{hostname\}/g, this.hostname),
      replaceVariable(/\$\{tailscaleIpAddress\}/g, this.tailscaleIpAddress),
      replaceVariable(/\$\{ipAddress\}/g, this.ipAddress),
      replaceVariable(/\$\{tailscaleHostname\}/g, this.tailscaleHostname),
      replaceVariable(/\$\{tailscaleAuthKey\}/g, this.args.globals.tailscaleAuthKey.key),
      replaceVariable(/\$\{CLUSTER_TITLE\}/g, this.cluster.title),
      replaceVariable(/\$\{CLUSTER_KEY\}/g, this.cluster.key),
      replaceVariable(/\$\{CLUSTER_DOMAIN\}/g, this.cluster.rootDomain),
      replaceVariable(/\$\{CLUSTER_AUTHENTIK_DOMAIN\}/g, this.cluster.authentikDomain),
      replaceVariable(/\$UPTIME_API_URL/g, interpolate`https://uptime.${this.args.globals.searchDomain}`),
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

    return output(readdir(resolve(dockerPath, "_common")))
      .apply((files) => files.map((f) => this.createStack(this.args.host.name, resolve(dockerPath, "_common", f), replacements, args.dependsOn)))
      .apply((z) => {
        const hostStacks = output(
          readdir(resolve(dockerPath, this.args.host.name)).then((files) =>
            files.filter((z) => z !== ".keep").map((f) => this.createStack(this.args.host.name, resolve(dockerPath, this.args.host.name, f), replacements, args.dependsOn))
          )
        );
        return all([z, hostStacks]).apply(([a, b]) => [...a, ...b]);
      })
      .apply((z) => {
        z.forEach((s) => console.log(`Loaded docker stack ${s.name} from ${s.path}`));
        return output(z.map((z) => z.compose));
      });
  }

  private async createStack(
    hostname: string,
    path: string,
    replacements: ((input: Output<string>) => Output<string>)[],
    dependsOn: Input<Resource[]>
  ): Promise<{ name: string; path: string; compose: remote.Command }> {
    const stackName = basename(path);
    const files = await glob("**/*", { cwd: path, absolute: false, nodir: true, dot: true });
    const copyFiles = [];
    const cluster = await awaitOutput(this.cluster);
    const tailscaleDomain = await awaitOutput(this.args.globals.tailscaleDomain);
    replacements = [...replacements, replaceVariable(/\$\{STACK_NAME\}/g, stackName), replaceVariable(/\$\{APP\}/g, stackName)];

    for (const file of files) {
      const content = await readFile(resolve(path, file), "utf-8");
      let replacedContent = replacements.reduce((p, r) => r(p), output(content));

      if (file.endsWith("compose.yaml")) {
        const content = await awaitOutput(replacedContent);
        const hostRegex = /Host\(`(.*?)`\)/g;
        const hosts = new Set<string>(Array.from(content.matchAll(hostRegex)).map((z) => z[1]));
        if (stackName !== "adguard") {
          for (const host of hosts) {
            if (host.indexOf(tailscaleDomain) > -1) {
              // this is a service domain
              const service = host.replace(`.${tailscaleDomain}`, "");
              console.log(`Creating Tailscale DNS entry for service ${service}`);

              new remote.Command(`${stackName}-tailscale-service-${service}`, {
                connection: this.remoteConnection,
                create: interpolate`tailscale serve --https=443 --service=svc:${service} --yes 127.0.0.1:8443`,
              });

              continue;
            }

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
                dependsOn: dependsOn,
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
            { parent: this, dependsOn: dependsOn }
          );
          const clientSecret = new RandomPassword(`${cluster.key}-${stackName}-client-secret`, { length: 32, special: true }, { parent: this, dependsOn: dependsOn });
          const [clientIdResult, clientSecretResult] = await awaitOutput(all([clientId.id, clientSecret.result]));

          oauth2.clientId = clientIdResult;
          oauth2.clientSecret = clientSecretResult;
          replacedContent = output(yaml.stringify(parsed));
        }
      }

      copyFiles.push(
        copyFileToRemote(`${hostname}-${stackName}-${file.replace(/\//g, "-")}-copy-file`, {
          connection: this.remoteConnection,
          remotePath: interpolate`/opt/stacks/${stackName}/${file}`,
          content: replacedContent,
          parent: this,
          dependsOn: dependsOn,
        })
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
