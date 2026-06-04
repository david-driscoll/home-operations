import { ProxmoxHost } from "./ProxmoxHost.ts";
import { all, ComponentResource, Input, interpolate, jsonStringify, log, mergeOptions, Output, output, Resource, Unwrap, UnwrappedObject } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { getContainerHostnames } from "./helpers.ts";
import { StandardDns } from "./StandardDns.ts";
import { installTailscaleLxc } from "@components/tailscale.ts";
import * as tailscale from "@pulumi/tailscale";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { awaitOutput, copyFileToRemote, getTailscaleSection } from "@components/helpers.ts";
import { fileURLToPath } from "node:url";
import { OPClient } from "@components/op.ts";
import { glob } from "glob";
import * as yaml from "yaml";
import { ApplicationDefinitionSchema } from "@openapi/application-definition.js";
import { unique } from "moderndash";
import { Command } from "@pulumi/command/remote/index.js";
import { TailscaleIp } from "@openapi/tailscale-grants.js";
import { runCommunityScriptLxc } from "./lxc.ts";
import { Tailscale } from "@components/constants.ts";
import * as authentik from "@pulumi/authentik";
import * as authentikApi from "@goauthentik/api/dist/esm/index.js";
import { AuthentikApplicationManager } from "./authentik.ts";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dockerPath = resolve(__dirname, "../docker");

type ApplicationReturn = Unwrap<ReturnType<AuthentikApplicationManager["createApplication"]>>;
export type OPClientItem = Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface DockgeLxcArgs {
  createDockerLxc?: boolean;
  globals: GlobalResources;
  host: ProxmoxHost;
  vmId: Input<number>;
  ipAddress?: TailscaleIp;
  tailscaleIpAddress?: TailscaleIp;
  cluster: Input<ClusterDefinition>;
  credential: Input<OPClientItem>;
  tailscaleArgs?: Partial<Parameters<typeof installTailscaleLxc>[0]["args"]>;
  legacyTun?: boolean;
  sftpKey: Input<OPClientItem>;
}
export interface ExternalServiceOpts {
  name: Input<string>;
  hostname: Input<string>;
  backend: Input<string>;
  middleware?: string[];
  certResolver?: string;
}

export class DockgeLxc extends ComponentResource {
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleIpAddress: Output<TailscaleIp>;
  public readonly hostname: Output<string>;
  public readonly device?: ReturnType<typeof installTailscaleLxc>;
  public readonly dns: Output<StandardDns>;
  public readonly ipAddress: Output<TailscaleIp>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly credential: Output<OPClientItem>;
  public readonly cluster: Output<ClusterDefinition>;
  private readonly ensureDynamicDir: Resource;
  public readonly shortName: string | undefined;
  public readonly tailscaleName: Output<string>;
  private readonly mountPoints: remote.Command[] = [];
  private readonly resources: Input<Resource>[];
  private readonly dockerParent: ComponentResource<any>;

  constructor(
    name: string,
    private readonly args: DockgeLxcArgs,
  ) {
    super("home:dockge:DockgeLxc", name, {}, { parent: args.host });

    const cro = { parent: this };
    const cluster = output(args.cluster);
    this.dockerParent = new ComponentResource("home:dockge:DockgeLxcDockerParent", `${name}-docker`, {}, cro);
    this.cluster = cluster;
    this.shortName = args.host.shortName ?? name;

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
            keyctl: 1,
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
    const deviceInfo = installTailscaleLxc({
      connection: args.host.remoteConnection,
      parent: this,
      name: tailscaleName,
      ipAddress: this.tailscaleIpAddress,
      globals: args.globals,
      installTailscale: args.createDockerLxc ?? false,
      legacyTun: args.legacyTun,
      args: {
        advertiseTags: [...(args.tailscaleArgs?.advertiseTags ?? []), Tailscale.tag.dockge, Tailscale.tag.apps],
        acceptDns: true,
        acceptRoutes: false,
        ssh: true,
        ...args.tailscaleArgs,
      },
      vmId: args.vmId,
      dependsOn: [...depends],
    });
    depends.push(deviceInfo.apply((z) => z.resource));

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

    this.ipAddress = args.ipAddress
      ? output(args.ipAddress)
      : args.host.remote
        ? this.tailscaleIpAddress
        : (new remote.Command(
            `${name}-ip-address`,
            {
              connection: args.host.remoteConnection,
              create: interpolate`pct exec ${args.vmId} -- hostname -I`,
            },
            mergeOptions(cro, { dependsOn: [setHostname] }),
          ).stdout.apply((z) => z.split(" ")[0]) as Output<TailscaleIp>);

    this.credential = output(args.credential);
    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.tailscaleHostname,
      user: this.credential.apply((z) => z.fields?.username?.value!),
      password: this.credential.apply((z) => z.fields?.password?.value!),
    });

    this.dns = this.hostname.apply((g) => {
      return StandardDns.create(name, { hostname: g, ipAddress: args.ipAddress ?? this.tailscaleIpAddress, type: "A" }, args.globals, cro);
    });

    // Seed SFTP keys into the rclone-sftp stack path on the remote host
    const sftpKeysDir = "/opt/stacks-data/rclone-sftp/keys";
    const jobsKeysDir = "/opt/stacks-data/backups/keys";
    const backrestSshDir = "/opt/stacks-data/backrest/ssh";

    const ensureKeysDir = new remote.Command(
      `${name}-ensure-sftp-keys-dir`,
      {
        connection: this.remoteConnection,
        create: interpolate`mkdir -p ${sftpKeysDir} ${jobsKeysDir} ${backrestSshDir}`,
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

    this.ensureDynamicDir = new remote.Command(
      `${name}-traefik-dynamic-dir`,
      {
        connection: this.remoteConnection,
        create: "mkdir -p /opt/stacks-data/traefik/dynamic",
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

    const keyWrites: any[] = [];

    const privateKeyPem = output(args.sftpKey).apply((k) => k.fields?.["private key"]?.value?.trim() + "\n");
    const publicKeyPem = output(args.sftpKey).apply((k) => k.fields?.["public key"]?.value?.trim() + "\n");

    // Daily trigger: changes each calendar day so Pulumi re-copies key files even if they
    // went missing on disk (Pulumi state wouldn't notice a missing file otherwise).
    const dailyTrigger = new Date().toISOString().slice(0, 10);

    keyWrites.push(
      copyFileToRemote(`${name}-sftp-authorized-keys`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/authorized_keys`,
        content: publicKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    keyWrites.push(
      copyFileToRemote(`${name}-sftp-host-key`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/host_key`,
        content: privateKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // SFTP server's public key — needed by clients to verify the server identity
    keyWrites.push(
      copyFileToRemote(`${name}-sftp-host-key-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/host_key.pub`,
        content: publicKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // Known-hosts entry for the SFTP server itself (used by local rclone config)
    keyWrites.push(
      copyFileToRemote(`${name}-sftp-known-hosts`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${sftpKeysDir}/known_hosts`,
        content: all([this.tailscaleHostname, publicKeyPem]).apply(([h, k]) => `[${h}]:2022 ${k.trim()}\n`),
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // Write client private key for rclone-jobs client
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-client-key`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/id_ed25519`,
        content: privateKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );
    keyWrites.push(
      copyFileToRemote(`${name}-backrest-client-key`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${backrestSshDir}/id_ed25519`,
        content: privateKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // Write client private key for rclone-jobs client
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-client-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/id_ed25519.pub`,
        content: publicKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );
    keyWrites.push(
      copyFileToRemote(`${name}-backrest-client-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${backrestSshDir}/id_ed25519.pub`,
        content: publicKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // Write server public key for known_hosts usage by clients
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-server-pub`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/server_host_key.pub`,
        content: publicKeyPem,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // Also generate a convenience known_hosts entry using tailscale hostname with port
    keyWrites.push(
      copyFileToRemote(`${name}-jobs-known-hosts`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${jobsKeysDir}/known_hosts`,
        content: all([this.tailscaleHostname, publicKeyPem]).apply(([h, k]) => `[${h}]:2022 ${k.trim()}\n`),
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // Also generate a convenience known_hosts entry using tailscale hostname with port
    keyWrites.push(
      copyFileToRemote(`${name}-backrest-known-hosts`, {
        connection: this.remoteConnection,
        remotePath: interpolate`${backrestSshDir}/known_hosts`,
        content: all([this.tailscaleHostname, publicKeyPem]).apply(([h, k]) => `[${h}]:2022 ${k.trim()}\n`),
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    keyWrites.push(
      copyFileToRemote(`${name}-machine-id`, {
        connection: this.remoteConnection,
        remotePath: "/etc/machine-id",
        content: interpolate`${name}`,
        parent: this.dockerParent,
        dependsOn: [ensureKeysDir],
        triggers: [dailyTrigger],
      }),
    );

    // Set restrictive permissions on the keys (re-applied whenever key files change)
    keyWrites.push(
      new remote.Command(
        `${name}-sftp-keys-perms`,
        {
          connection: this.remoteConnection,
          triggers: keyWrites.map((k) => k.id),
          create: interpolate`chmod 700 ${sftpKeysDir} ${jobsKeysDir} ${backrestSshDir} && chmod 600 ${sftpKeysDir}/host_key ${sftpKeysDir}/authorized_keys ${sftpKeysDir}/known_hosts ${jobsKeysDir}/id_ed25519 ${jobsKeysDir}/id_ed25519.pub ${jobsKeysDir}/known_hosts ${jobsKeysDir}/server_host_key.pub ${backrestSshDir}/id_ed25519 ${backrestSshDir}/id_ed25519.pub ${backrestSshDir}/known_hosts && chown -R 65534:65534 ${sftpKeysDir} || true`,
        },
        mergeOptions(cro, { dependsOn: keyWrites }),
      ),
    );

    keyWrites.push(
      new remote.Command(
        `${name}-install-tools`,
        {
          connection: this.remoteConnection,
          create: interpolate`apt-get update && apt-get install -y restic`,
        },
        mergeOptions(cro, { dependsOn: depends }),
      ),
    );

    this.tailscaleName = tailscaleName;

    const dockgeInfo = new OnePasswordItem(
      `${args.host.name}-dockge`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: interpolate`DockgeLxc: ${args.host.title}`,
        tags: ["dockge", "lxc"],
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
          name: { type: TypeEnum.String, value: name },
          hostname: { type: TypeEnum.String, value: this.hostname },
          ipAddress: { type: TypeEnum.String, value: this.ipAddress },
          tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
        },
      },
      cro,
    );

    const deleteDockerDaemon = new remote.Command(
      `${name}-delete-docker-daemon`,
      {
        connection: this.remoteConnection,
        create: interpolate`rm -f /etc/docker/daemon.json`,
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

    const stacksDirectory = new remote.Command(
      `${name}-stacks-directory`,
      {
        connection: this.remoteConnection,
        create: interpolate`mkdir -p /opt/stacks/ && mkdir -p /opt/stacks-data/`,
      },
      mergeOptions(cro, { dependsOn: depends }),
    );

    this.resources = [...depends, dockgeInfo, ...keyWrites, deleteDockerDaemon, stacksDirectory];
  }

  public registerExternalService(opts: ExternalServiceOpts, dependsOn?: Resource[]) {
    return output(opts).apply((opts) => {
      const content = output({
        http: {
          routers: {
            [`host-${opts.name}`]: {
              rule: `Host(\`${opts.hostname}\`)`,
              entryPoints: ["websecure"],
              service: `host-${opts.name}`,
              ...(opts.middleware?.length ? { middlewares: opts.middleware.map((m) => `- ${m}`).join("\n") } : {}),
              tls: {
                certResolver: opts.certResolver ?? "le",
              },
            },
            [`host-${opts.name}-tailscale`]: {
              rule: interpolate`Host(\`${opts.name}.${this.args.globals.tailscaleDomain}\`)`,
              entryPoints: ["tailscale"],
              service: `host-${opts.name}`,
              ...(opts.middleware?.length ? { middlewares: opts.middleware.map((m) => `- ${m}`).join("\n") } : {}),
            },
          },
          services: {
            [`host-${opts.name}`]: {
              loadBalancer: {
                servers: [{ url: opts.backend }],
              },
            },
          },
        },
      }).apply((z) => yaml.stringify(z));

      const dns = StandardDns.create(
        `${opts.name}-dns-service`,
        {
          hostname: opts.hostname,
          ipAddress: this.tailscaleIpAddress,
          type: "A",
        },
        this.args.globals,
        { parent: this.dockerParent },
      );

      const tailscaleService = new tailscale.Service(
        `${opts.name}-tailscale-service-${opts.backend}`,
        {
          name: `svc:${opts.name}`,
          ports: ["8443"],
          tags: [Tailscale.tag.dockge, Tailscale.tag.apps],
        },
        {
          parent: this,
          dependsOn: dependsOn,
          deleteBeforeReplace: true,
          provider: this.args.globals.tailscaleProvider,
        },
      );

      const file = copyFileToRemote(`${opts.name}-route`, {
        connection: this.remoteConnection,
        remotePath: interpolate`/opt/stacks-data/traefik/dynamic/${opts.name}.yaml`,
        content: content,
        parent: this,
        triggers: [content, opts.name, opts.backend, opts.hostname, tailscaleService],
        dependsOn: output([...this.resources, this.ensureDynamicDir, ...(dependsOn ?? [])]),
      });

      return output({ file, dns: dns, service: tailscaleService });
    });
  }

  public addHostMount(path: string, containerPath?: string) {
    const mp = new remote.Command(
      `${this.args.host.name}-dockge-${path.replace(/\//g, "-")}-mount`,
      {
        connection: this.args.host.remoteConnection,
        create: interpolate`pct set ${this.args.vmId} -mp${this.mountPoints.length} ${path},mp=${containerPath ?? path}`,
      },
      { parent: this, dependsOn: [...this.mountPoints, ...this.resources] },
    );
    this.mountPoints.push(mp);
    return mp;
  }

  public deployStacks(args: { dependsOn: Input<Resource[]>; variables?: Record<string, Input<string>> }) {
    const op = new OPClient();
    const vaultRegex = /op\:\/\/Eris\/([\w| -]+)\/([\w| -]+)/g;

    // update hostname on machine
    const createDockerNetwork = new remote.Command(
      `${this.args.host.name}-create-docker-network`,
      {
        connection: this.args.host.remoteConnection,
        create: interpolate`pct exec ${this.args.vmId} -- docker network create dockge_default || true`,
      },
      {
        parent: this,
        dependsOn: output(args.dependsOn).apply((z) => [...this.resources, ...(z ?? [])]),
      },
    );

    args.dependsOn = all([args.dependsOn, this.resources]).apply(([z, r]) => [...r, ...z, createDockerNetwork]);

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
      replaceVariable(/\$\{CLUSTER_TITLE\}/g, this.cluster.title),
      replaceVariable(/\$\{CLUSTER_KEY\}/g, this.cluster.key),
      replaceVariable(/\$\{CLUSTER_CNAME\}/g, this.cluster.key),
      replaceVariable(/\$\{CLUSTER_DOMAIN\}/g, this.cluster.rootDomain),
      replaceVariable(/\$\{CLUSTER_AUTHENTIK_DOMAIN\}/g, this.args.host.remote ? interpolate`authentik.${this.args.globals.tailscaleDomain}` :  this.cluster.authentikDomain),
      replaceVariable(/\$UPTIME_API_URL/g, interpolate`http://uptime.${this.args.globals.searchDomain}:9595`),
      ...Object.entries(args.variables ?? {}).map(([key, value]) => replaceVariable(new RegExp(`\\$\\{${key}\\}`, "g"), value)),
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

    const outpost = stacks
      .apply((stacks) =>
        output(
          stacks.map(async (stackName) => {
            const path = resolve(dockerPath, this.args.host.name, stackName);
            const files = await this.getStackFiles(stackName, resolve(dockerPath, "_common", stackName), path);
            if (!files) {
              return null;
            }
            return this.createStack(
              stackName,
              files,
              path,
              replacements,
              output(args.dependsOn).apply((z) => [...z, ...this.mountPoints]),
            );
          }),
        ),
      )
      .apply((z) => z.filter((z) => z !== null).map((z) => z!))
      .apply((z) => {
        z.forEach((s) => log.info(`Loaded docker stack ${s.name} from ${s.path}`), this);
        return output(this.createOutpost(z.flatMap((z) => z.applications)));
      });

    return outpost;
  }

  private async createOutpost(depends: ApplicationReturn[]) {
    const applicationManager = this.args.host.applicationManager;
    const proxyProviders = depends.filter((z) => z.isProxy).map((z) => z.provider);

    if (proxyProviders.length === 0) {
      return;
    }

    const outpost = new authentik.Outpost(
      this.args.host.name,
      {
        type: "proxy",
        config: jsonStringify(
          {
            authentik_host: interpolate`https://${this.cluster.authentikDomain}/`,
            authentik_host_insecure: false,
            // container_image: "ghcr.io/goauthentik/proxy:2025.8.4",
            authentik_host_browser: interpolate`https://${this.cluster.authentikDomain}/`,
            // log_level: "trace",
            object_naming_template: `authentik-outpost`,
            docker_network: "dockge_default",
          },
          undefined,
          2,
        ),
        protocolProviders: proxyProviders.map((z) => z.id.apply(parseFloat)),
      },
      { parent: applicationManager.outpostsComponent, deleteBeforeReplace: true, dependsOn: proxyProviders },
    );

    const op = new OPClient();
    const authentikToken = await op.getItemByTitle("Authentik Token");
    const clientConfig = new authentikApi.Configuration({
      accessToken: authentikToken.fields.credential.value,
      basePath: `${authentikToken.fields.url.value}/api/v3/`,
    });

    const authentikCoreApi = new authentikApi.CoreApi(clientConfig);
    const outpostId = await awaitOutput(outpost.id);
    const outpostToken = await authentikCoreApi.coreTokensViewKeyRetrieve({ identifier: `ak-outpost-${outpostId}-api` });
    const clusterKey = await awaitOutput(this.cluster.key);

    const envValues = `AUTHENTIK_TOKEN=${outpostToken.key}`;
    const environmentConfig = copyFileToRemote(`${clusterKey}-outpost-token`, {
      connection: {
        host: this.tailscaleHostname,
        user: "root",
      },
      remotePath: `/opt/stacks/authentik-outpost/.env-token`,
      content: envValues,
      parent: applicationManager.outpostsComponent,
      dependsOn: [outpost],
      triggers: [outpost.id, outpostToken.key],
    });
    return environmentConfig;
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

  private createStack(
    stackName: string,
    files: Map<string, string>,
    path: string,
    replacements: ((input: Output<string>) => Output<string>)[],
    dependsOn: Input<Resource[]>,
  ): Output<{ name: string; path: string; compose?: remote.Command; applications: ApplicationReturn[] }> {
    const copyFiles = [];
    const cluster = this.cluster;
    const tailscaleDomain = this.args.globals.tailscaleDomain;
    // Prepend stack-specific substitutions so they run BEFORE the vaultRegex resolver.
    // vaultRegex is the last item in the inherited replacements array; if APP/STACK_NAME
    // were appended after it, op:// paths like "op://Eris/${CLUSTER_KEY}-${APP}-oidc-credentials/..."
    // would still contain "${APP}" when the resolver runs and the regex would fail to match.
    replacements = [replaceVariable(/\$\{STACK_NAME\}/g, stackName), replaceVariable(/\$\{APP\}/g, stackName), ...replacements];

    let hasCompose = false;
    let hasInit = false;

    const stackParent = new remote.Command(
      `${this.shortName}-delete-${stackName}-on-remove`,
      {
        connection: this.remoteConnection,
        create: interpolate`mkdir -p /opt/stacks/${stackName}/ && mkdir -p /opt/stacks-data/${stackName}/`,
        update: interpolate`mkdir -p /opt/stacks/${stackName}/ && mkdir -p /opt/stacks-data/${stackName}/`,
        delete: interpolate`rm -rf /opt/stacks/${stackName}`,
      },
      {
        parent: this,
        dependsOn: dependsOn,
        deleteBeforeReplace: true,
      },
    );

    const definitions = Array.from(files.entries()).filter(([relativeFilePath]) => relativeFilePath === "definition.yaml");
    const others = Array.from(files.entries()).filter(([relativeFilePath]) => relativeFilePath !== "definition.yaml");

    const waitForApplications = output(definitions)
      .apply((defs) =>
        defs.map(([, absoluteFilePath]) => {
          const content = output(readFile(absoluteFilePath, "utf-8"));
          let replacedContent = replacements.reduce((p, r) => r(p), content);
          // intercept definition file and create the client id / client secret and inject that into the yaml.
          return replacedContent.apply((content) => {
            const docs = yaml.parseAllDocuments(content);
            if (!docs || "empty" in docs) {
              return [];
            }
            return docs.map((doc) => this.args.host.applicationManager.createApplication(doc.toJS() as unknown as ApplicationDefinitionSchema));
          });
        }),
      )
      .apply((z) => output(z))
      .apply((z) => z.flat().map((z) => z));

    dependsOn = all([dependsOn, waitForApplications]).apply(([a, b]) => [...a, ...b.map((z) => z.app)]);

    const triggers = [];

    for (const [relativeFilePath, absoluteFilePath] of others) {
      const content = output(readFile(absoluteFilePath, "utf-8"));
      const file = relativeFilePath;
      let replacedContent = replacements.reduce((p, r) => r(p), content);

      if (file.endsWith("init.sh")) {
        hasInit = true;
      } else if (file.endsWith("compose.yaml")) {
        hasCompose = true;
        const tailscaleServices: Resource[] = [];
        const hostRegex = /Host\(`(.*?)`\)/g;

        all([replacedContent, tailscaleDomain]).apply(([content, tailscaleDomain]) => {
          const hosts = new Set<string>(Array.from(content.matchAll(hostRegex)).map((z) => z[1]));
          for (const host of hosts) {
            if (host.indexOf(tailscaleDomain) > -1) {
              // this is a service domain
              const service = host.replace(`.${tailscaleDomain}`, "");
              log.info(`Creating Tailscale DNS entry for service ${service}`, this);

              copyFiles.push(
                new tailscale.Service(
                  `${stackName}-tailscale-service-${service}`,
                  {
                    name: `svc:${service}`,
                    ports: ["8443"],
                    tags: [Tailscale.tag.dockge, Tailscale.tag.apps],
                  },
                  {
                    parent: this,
                    dependsOn: tailscaleServices,
                    deleteBeforeReplace: true,
                    provider: this.args.globals.tailscaleProvider,
                  },
                ),
              );

              continue;
            }

            copyFiles.push(
              StandardDns.create(
                `${stackName}-dns-${host.replace(/\./g, "_")}`,
                {
                  hostname: host,
                  ipAddress: this.tailscaleIpAddress,
                  type: "CNAME",
                  record: this.hostname,
                },
                this.args.globals,
                {
                  parent: this.dockerParent,
                  // protect: stackName === "adguard",
                },
              ),
            );
          }
        });
      } else if (file === "definition.yaml") {
        continue;
      }

      copyFiles.push(
        copyFileToRemote(`${this.shortName}-${stackName}-${file.replace(/\//g, "-")}-copy-file`, {
          connection: this.remoteConnection,
          remotePath: interpolate`/opt/stacks/${stackName}/${file}`,
          content: replacedContent,
          triggers: [replacedContent, absoluteFilePath],
          parent: stackParent,
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
          `${this.shortName}-${stackName}-init`,
          {
            connection: this.remoteConnection,
            triggers: [new Date().getTime()], // always run
            create: interpolate`cd /opt/stacks/${stackName} && bash init.sh`,
          },
          {
            parent: stackParent,
            dependsOn: copyFiles,
            deleteBeforeReplace: true,
          },
        );
        composeDeps.push(initCommand);
      }

      const compose = new remote.Command(
        `${this.shortName}-${stackName}-compose`,
        {
          connection: this.remoteConnection,
          triggers: [...copyFiles.map((f) => f.id), ...copyFiles.map((f) => f.remotePath)],
          create: interpolate`cd /opt/stacks/${stackName} && docker compose -f compose.yaml build && docker compose -f compose.yaml up -d && docker compose -f compose.yaml start`,
        },
        {
          parent: stackParent,
          dependsOn: all([waitForApplications, dependsOn]).apply(([waitForApplicationsDeps, dependsOnDeps]) => [...waitForApplicationsDeps.map((z) => z.app), ...dependsOnDeps, ...composeDeps]),
          deleteBeforeReplace: true,
        },
      );

      return waitForApplications.apply((applications) => ({ name: stackName, path, compose, applications }));
    }
    return waitForApplications.apply((applications) => ({ name: stackName, path, applications }));
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
