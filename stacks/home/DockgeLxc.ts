import { ProxmoxHost } from "./ProxmoxHost.ts";
import { all, asset, ComponentResource, Input, interpolate, log, mergeOptions, Output, output, Resource, runtime, unknown, Unwrap } from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { remote, types } from "@pulumi/command";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { getContainerHostnames } from "./helper.ts";
import { createDnsSection } from "./StandardDns.ts";
import { StandardDns } from "./StandardDns.ts";
import { DeviceKey, DeviceTags, getDeviceOutput, GetDeviceResult } from "@pulumi/tailscale";
import { RandomPassword, RandomString } from "@pulumi/random";
import { getTailscaleClient, installTailscaleLxc } from "@components/tailscale.ts";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { awaitOutput, BackupTask, copyFileToRemote, getTailscaleSection } from "@components/helpers.ts";
import { fileURLToPath } from "node:url";
import { OPClient } from "@components/op.ts";
import { glob } from "glob";
import * as yaml from "yaml";
import { ApplicationDefinitionSchema, ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { BackupJobManager } from "./jobs.ts";
import { unique } from "moderndash";
import { Command } from "@pulumi/command/remote/index.js";
import { TailscaleIp } from "@openapi/tailscale-grants.js";
import { runCommunityScriptLxc } from "./lxc.ts";
import { Tailscale } from "@components/constants.ts";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dockerPath = resolve(__dirname, "../../docker");

export type OPClientItem = Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface DockgeLxcArgs {
  createDockerLxc?: boolean;
  globals: GlobalResources;
  host: ProxmoxHost;
  vmId: number;
  ipAddress?: TailscaleIp;
  tailscaleIpAddress?: TailscaleIp;
  cluster: Input<ClusterDefinition>;
  credential: Input<OPClientItem>;
  tailscaleArgs?: Partial<Parameters<typeof installTailscaleLxc>[0]["args"]>;
  sftpKey: tls.PrivateKey;
  registerTailscaleService(service: string): void;
}
export interface ExternalServiceOpts {
  name: string;
  hostname: Input<string>;
  port: Input<number>;
  middleware?: string[];
  certResolver?: string;
  entrypoints?: string[];
}

export class DockgeLxc extends ComponentResource {
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleIpAddress: Output<TailscaleIp>;
  public readonly hostname: Output<string>;
  public readonly device: ReturnType<typeof installTailscaleLxc>;
  public readonly dns: StandardDns;
  public readonly ipAddress: Output<TailscaleIp>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly credential: Output<OPClientItem>;
  public readonly cluster: Output<ClusterDefinition>;
  private backupJobManager: BackupJobManager;
  private readonly ensureDynamicDir: remote.Command;
  public readonly shortName: string | undefined;
  public readonly tailscaleName: Output<string>;
  registerTailscaleService: (service: string) => void;
  constructor(
    name: string,
    private readonly args: DockgeLxcArgs,
  ) {
    super("home:dockge:DockgeLxc", name, {}, { parent: args.host });

    const cro = { parent: this };
    const cluster = output(args.cluster);
    this.cluster = cluster;
    this.shortName = args.host.shortName ?? name;
    this.registerTailscaleService = args.registerTailscaleService;

    const { hostname, tailscaleHostname, tailscaleName } = getContainerHostnames("dockge", args.host, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;

    const tailscaleIpParts = (args.tailscaleIpAddress ?? args.host.tailscaleIpAddress).split(".");
    this.tailscaleIpAddress = output(
      args.tailscaleIpAddress ?? (`${tailscaleIpParts[0]}.${tailscaleIpParts[1]}.${args.host.tailscaleIpAddress[args.host.tailscaleIpAddress.length - 1]}0.100` as TailscaleIp),
    );

    // Check if the Docker LXC container already exists on the Proxmox host
    const lxcExists = new remote.Command(
      `${name}-check-lxc-exists`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct status ${args.vmId} 2>/dev/null && echo exists || echo missing`,
      },
      mergeOptions(cro, { dependsOn: [], ignoreChanges: ["create"] }),
    );

    const depends = [];
    if (args.createDockerLxc) {
      // Create the Docker LXC container via community-scripts.
      // mode=generated skips all whiptail menus and reads var_* directly from the environment.
      // installPromptAnswers: "n" x3 skips Portainer, Portainer Agent, and Docker TCP socket prompts
      const createDockerLxc = runCommunityScriptLxc(
        `${name}-create-docker`,
        {
          connection: args.host.remoteConnection,
          script: "https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/docker.sh",
          vars: {
            ctid: args.vmId,
            hostname: name,
            unprivileged: 1,
            cpu: 4,
            ram: 8192,
            disk: 64,
            // os: "debian",
            // version: 13,
            nesting: 1,
            fuse: "yes",
            gpu: "yes",
            ipv6_method: "none",
            mount_fs: "nfs",
            ...(args.ipAddress ? { net: `${args.ipAddress}/16`, gateway: "10.10.0.1" } : {}),
          },
          // Skip optional docker-install.sh prompts: Portainer (n), Portainer Agent (n), TCP socket (n)
          installPromptAnswers: ["n", "n", "n"],
        },
        mergeOptions(cro, { dependsOn: [lxcExists] }),
      );
      depends.push(createDockerLxc);
    }

    // update hostname on machine
    const setHostname = new remote.Command(
      `${name}-set-hostname`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- hostnamectl set-hostname ${name}`,
        update: interpolate`pct exec ${args.vmId} -- hostnamectl set-hostname ${name}`,
      },
      mergeOptions(cro, {
        dependsOn: [...depends],
      }),
    );

    const ipAddress = (this.ipAddress = args.ipAddress
      ? output(args.ipAddress)
      : args.host.remote
        ? this.tailscaleIpAddress
        : (new remote.Command(
            `${name}-ip-address`,
            {
              connection: args.host.remoteConnection,
              create: interpolate`pct exec ${args.vmId} -- ip -4 addr show dev eth0 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | head -n1`,
            },
            mergeOptions(cro, { dependsOn: [setHostname] }),
          ).stdout as Output<TailscaleIp>));

    this.credential = output(args.credential);

    const deviceInfo = (this.device = installTailscaleLxc({
      connection: args.host.remoteConnection,
      parent: this,
      name: tailscaleName,
      ipAddress: this.tailscaleIpAddress,
      globals: args.globals,
      args: {
        ...args.tailscaleArgs,
        advertiseTags: (args.tailscaleArgs?.advertiseTags ?? []).concat([Tailscale.tag.dockge, Tailscale.tag.apps]),
        acceptDns: true,
        acceptRoutes: false,
        ssh: true,
      },
      vmId: args.vmId,
      dependsOn: [setHostname],
    }));

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.tailscaleHostname,
      user: this.credential.apply((z) => z.fields?.username?.value!),
      password: this.credential.apply((z) => z.fields?.password?.value!),
    });

    // const sshReady = new remote.Command(
    //   `${name}-ssh-ready`,
    //   {
    //     connection: this.remoteConnection,
    //     create: "hostname",
    //   },
    //   mergeOptions(cro, { dependsOn: [tailscaleSet] }),
    // );

    if (args.createDockerLxc) {
      // Install Dockge addon inside the container via community-scripts
      const installDockge = new remote.Command(
        `${name}-install-dockge`,
        {
          connection: args.host.remoteConnection,
          create: interpolate`pct exec ${args.vmId} -- printf "y\ny\n" | bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/tools/addon/dockge.sh)"`,
        },
        mergeOptions(cro, { dependsOn: [...depends], ignoreChanges: ["create"] }),
      );
      depends.push(installDockge);
    }

    this.dns = new StandardDns(name, { hostname: this.hostname, ipAddress, type: "A" }, args.globals, mergeOptions(cro, { dependsOn: [...depends, setHostname] }));

    // Seed SFTP keys into the rclone-sftp stack path on the remote host
    const sftpKeysDir = "/opt/stacks/rclone-sftp/keys";
    const jobsKeysDir = "/opt/stacks/backups/keys";
    const backrestSshDir = "/opt/stacks/backrest/ssh";

    const ensureKeysDir = new remote.Command(
      `${name}-ensure-sftp-keys-dir`,
      {
        connection: this.remoteConnection,
        create: interpolate`mkdir -p ${sftpKeysDir} ${jobsKeysDir}`,
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

    this.ensureDynamicDir = new remote.Command(
      `${name}-traefik-dynamic-dir`,
      {
        connection: this.remoteConnection,
        create: "mkdir -p /opt/stacks/traefik/dynamic",
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

    const keyWrites: any[] = [];

    keyWrites.push(
      copyFileToRemote(`${name}-sftp-authorized-keys`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/authorized_keys`,
        content: output(args.sftpKey.publicKeyOpenssh).apply((k) => `${k.trim()}\n`),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
    );

    keyWrites.push(
      copyFileToRemote(`${name}-sftp-host-key`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/host_key`,
        content: output(args.sftpKey.privateKeyPem).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
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
      }),
    );
    keyWrites.push(
      copyFileToRemote(`${name}-backrest-client-key`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${backrestSshDir}/id_ed25519`,
        content: output(args.sftpKey.privateKeyPem).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
    );

    // Write client private key for rclone-jobs client
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-client-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/id_ed25519.pub`,
        content: output(args.sftpKey.publicKeyPem).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
    );
    keyWrites.push(
      copyFileToRemote(`${name}-backrest-client-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${backrestSshDir}/id_ed25519.pub`,
        content: output(args.sftpKey.publicKeyPem).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
    );

    // Write server public key for known_hosts usage by clients
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-server-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/server_host_key.pub`,
        content: output(sftpHostPublicKey).apply((k) => k.trim() + "\n"),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
    );

    // Also generate a convenience known_hosts entry using tailscale hostname with port
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-known-hosts`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/known_hosts`,
        content: all([this.tailscaleHostname, sftpHostPublicKey]).apply(([h, k]) => `[${h}]:2022 ${k.trim()}\n`),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
    );

    // Also generate a convenience known_hosts entry using tailscale hostname with port
    keyWrites.push(
      copyFileToRemote(`${name}-backrest-known-hosts`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${backrestSshDir}/known_hosts`,
        content: all([this.tailscaleHostname, sftpHostPublicKey]).apply(([h, k]) => `[${h}]:2022 ${k.trim()}\n`),
        parent: this,
        dependsOn: [ensureKeysDir],
      }),
    );

    // Set restrictive permissions on the keys
    new remote.Command(
      `${name}-sftp-keys-perms`,
      {
        connection: this.remoteConnection,
        triggers: keyWrites.map((k) => k.id),
        create: interpolate`chmod 700 ${sftpKeysDir} ${jobsKeysDir} ${backrestSshDir} && chmod 600 ${sftpKeysDir}/host_key ${sftpKeysDir}/authorized_keys ${jobsKeysDir}/id_ed25519 ${jobsKeysDir}/id_ed25519.pub ${jobsKeysDir}/known_hosts ${jobsKeysDir}/server_host_key.pub ${backrestSshDir}/id_ed25519 ${backrestSshDir}/id_ed25519.pub ${backrestSshDir}/known_hosts || true`,
      },
      mergeOptions(cro, { dependsOn: keyWrites }),
    );

    new remote.Command(
      `${name}-install-tools`,
      {
        connection: this.remoteConnection,
        create: interpolate`apt-get update && apt-get install -y restic`,
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

    this.tailscaleName = this.device.apply((d) => d.name!);

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
      cro,
    );

    new remote.Command(
      `${name}-delete-docker-daemon`,
      {
        connection: this.remoteConnection,
        create: interpolate`rm -f /etc/docker/daemon.json`,
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

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

  public registerExternalService(opts: ExternalServiceOpts, dependsOn?: Resource[]): ReturnType<typeof copyFileToRemote> {
    const entrypoints = opts.entrypoints ?? ["websecure"];
    const certResolver = opts.certResolver ?? "le";
    const entrypointsYaml = entrypoints.map((ep) => `        - ${ep}`).join("\n");
    const middlewareYaml = opts.middleware?.length ? `      middlewares:\n${opts.middleware.map((m) => `        - ${m}`).join("\n")}\n` : "";

    const content = interpolate`http:
  routers:
    ${opts.name}:
      rule: "Host(\`${opts.hostname}\`)"
      entryPoints:
${entrypointsYaml}
      service: ${opts.name}
      tls:
        certResolver: ${certResolver}
${middlewareYaml}  services:
    ${opts.name}:
      loadBalancer:
        servers:
          - url: http://${this.cluster.rootDomain}:${opts.port}
`;

    return copyFileToRemote(`${opts.name}-traefik-route`, {
      connection: this.remoteConnection,
      remotePath: interpolate`/opt/stacks/traefik/dynamic/${opts.name}.yaml`,
      content: content,
      parent: this,
      dependsOn: [this.ensureDynamicDir, ...(dependsOn ?? [])],
    });
  }

  public deployStacks(args: { dependsOn: Input<Resource[]> }): Output<Command[]> {
    const op = new OPClient();
    const authentikToken = output(op.getItemByTitle("Authentik Token"));
    const vaultRegex = /op\:\/\/Eris\/([\w| ]+)\/([\w| ]+)/g;

    const replacements = [
      replaceVariable(/\$\{host\}/g, output(this.args.host.shortName ?? this.args.host.name)),
      replaceVariable(/\$\{searchDomain\}/g, this.args.globals.searchDomain),
      replaceVariable(/\$\{ROOT_DOMAIN\}/g, this.args.globals.searchDomain),
      replaceVariable(/\$\{TIMEZONE\}/g, "America/New_York"),
      replaceVariable(/\$\{tailscaleDomain\}/g, this.args.globals.tailscaleDomain),
      replaceVariable(/\$\{hostname\}/g, this.hostname),
      replaceVariable(/\$\{tailscaleIpAddress\}/g, this.tailscaleIpAddress),
      replaceVariable(/\$\{ipAddress\}/g, this.ipAddress),
      replaceVariable(/\$\{tailscaleHostname\}/g, this.tailscaleHostname),
      // replaceVariable(/\$\{tailscaleAuthKey\}/g, this.args.globals.tailscaleAuthKey.key),
      replaceVariable(/\$\{CLUSTER_TITLE\}/g, this.cluster.title),
      replaceVariable(/\$\{CLUSTER_KEY\}/g, this.cluster.key),
      replaceVariable(/\$\{CLUSTER_CNAME\}/g, this.cluster.key),
      replaceVariable(/\$\{CLUSTER_DOMAIN\}/g, this.cluster.rootDomain),
      replaceVariable(/\$\{CLUSTER_AUTHENTIK_DOMAIN\}/g, this.cluster.authentikDomain),
      replaceVariable(/\$UPTIME_API_URL/g, interpolate`http://uptime.${this.args.globals.searchDomain}:9595`),
      (input: Input<string>) => {
        return output(input).apply(async (str) => {
          const matches = str.matchAll(vaultRegex);
          const items = new Map();
          for (const [, itemTitle, fieldName] of matches) {
            if (items.has(`op://Eris/${itemTitle}/${fieldName}`)) {
              continue;
            }
            const item = await op.getItemByTitle(itemTitle);
            const fieldValue = item.fields?.[fieldName]?.value;
            if (!fieldValue) {
              console.error(`Field ${fieldName} not found in 1Password item ${itemTitle}`);
            }
            items.set(`op://Eris/${itemTitle}/${fieldName}`, fieldValue);
          }

          return str.replace(vaultRegex, (fullMatch) => {
            return items.get(fullMatch) || fullMatch;
          });
        });
      },
    ];

    const stacks = all([output(readdir(resolve(dockerPath, "_common"))), output(readdir(resolve(dockerPath, this.args.host.name)))]).apply(([commonFiles, hostFiles]) =>
      unique([...hostFiles, ...commonFiles].filter((z) => z !== ".keep")),
    );

    return stacks
      .apply((stacks) =>
        output(
          stacks.map(async (stackName) => {
            const path = resolve(dockerPath, this.args.host.name, stackName);
            const files = await this.getStackFiles(stackName, resolve(dockerPath, "_common", stackName), path);
            if (!files) {
              return null;
            }
            return this.createStack(this.args.host.name, stackName, files, path, replacements, args.dependsOn);
          }),
        ),
      )
      .apply((z) => z.filter((z) => z !== null).map((z) => z!))
      .apply((z) => {
        z.forEach((s) => log.info(`Loaded docker stack ${s.name} from ${s.path}`));
        return output(z.filter((z) => !!z.compose).map((z) => z.compose!));
      });
  }

  private async getStackFiles(stackName: string, commonPath: string, path: string): Promise<Map<string, string> | null> {
    const commonFiles = await glob("**/*", { cwd: commonPath, absolute: true, nodir: true, dot: true });
    const files = await glob("**/*", { cwd: path, absolute: true, nodir: true, dot: true });

    if (commonFiles.some((z) => z.endsWith(".ignore")) || files.some((z) => z.endsWith(".ignore"))) {
      return null;
    }

    const filesMap = new Map<string, string>();
    for (const file of files) {
      const relativePath = relative(path, file);
      filesMap.set(relativePath, file);
    }
    for (const file of commonFiles) {
      const relativePath = relative(commonPath, file);
      if (!filesMap.has(relativePath)) {
        filesMap.set(relativePath, file);
      }
    }

    return filesMap;
  }

  private async createStack(
    hostname: string,
    stackName: string,
    files: Map<string, string>,
    path: string,
    replacements: ((input: Output<string>) => Output<string>)[],
    dependsOn: Input<Resource[]>,
  ): Promise<{ name: string; path: string; compose?: remote.Command }> {
    const copyFiles = [];
    const cluster = await awaitOutput(this.cluster);
    const tailscaleDomain = await awaitOutput(this.args.globals.tailscaleDomain);
    replacements = [...replacements, replaceVariable(/\$\{STACK_NAME\}/g, stackName), replaceVariable(/\$\{APP\}/g, stackName)];

    let hasCompose = false;
    let hasInit = false;

    for (const [relativeFilePath, absoluteFilePath] of files) {
      const content = await readFile(absoluteFilePath, "utf-8");
      const file = relativeFilePath;
      let replacedContent = replacements.reduce((p, r) => r(p), output(content));

      if (file.endsWith("init.sh")) {
        hasInit = true;
      } else if (file.endsWith("compose.yaml")) {
        hasCompose = true;
        const content = await awaitOutput(replacedContent);
        const hostRegex = /Host\(`(.*?)`\)/g;
        const hosts = new Set<string>(Array.from(content.matchAll(hostRegex)).map((z) => z[1]));
        for (const host of hosts) {
          if (host.indexOf(tailscaleDomain) > -1) {
            // this is a service domain
            const service = host.replace(`.${tailscaleDomain}`, "");
            log.info(`Creating Tailscale DNS entry for service ${service}`);

            new remote.Command(`${stackName}-tailscale-service-${service}`, {
              connection: this.remoteConnection,
              create: interpolate`tailscale serve --service=svc:${service} --https=443 --yes 127.0.0.1:8443`,
              delete: interpolate`tailscale serve clear svc:${service}`,
            });

            this.registerTailscaleService(service);

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
              protect: stackName === "adguard",
            },
          );
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
            { parent: this, dependsOn: dependsOn },
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
        }),
      );
    }

    if (hasCompose) {
      // If the stack has an init.sh, run it before docker compose.
      // init.sh is designed to be idempotent and is always executed.
      const composeDeps: Input<Resource>[] = [...copyFiles];
      if (hasInit) {
        const initCommand = new remote.Command(
          `${hostname}-${stackName}-init`,
          {
            connection: this.remoteConnection,
            triggers: [new Date().getTime()], // always run
            create: interpolate`cd /opt/stacks/${stackName} && bash init.sh`,
          },
          mergeOptions({ parent: this }, { dependsOn: copyFiles, deleteBeforeReplace: true }),
        );
        composeDeps.push(initCommand);
      }

      const compose = new remote.Command(
        `${hostname}-${stackName}-compose`,
        {
          connection: this.remoteConnection,
          triggers: copyFiles.map((f) => f.id),
          create: interpolate`cd /opt/stacks/${stackName} && docker compose -f compose.yaml build && docker compose -f compose.yaml up -d && docker compose -f compose.yaml start`,
        },
        mergeOptions({ parent: this }, { dependsOn: composeDeps, deleteBeforeReplace: true }),
      );

      return { name: stackName, path, compose };
    }
    return { name: stackName, path };
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
