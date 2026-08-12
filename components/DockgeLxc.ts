import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FullItem } from "@1password/connect";
import { baoKvSecret, baoProvenance, dockgeBaoPath } from "@components/bao.ts";
import { Tailscale } from "@components/constants.ts";
import { awaitOutput, copyFileToRemote, getTailscaleSection } from "@components/helpers.ts";
import type { OPClient } from "@components/op.ts";
import { installTailscaleLxc, type TailscaleMonitor } from "@components/tailscale.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import * as authentikApi from "@goauthentik/api/dist/esm/index.js";
import type { ApplicationDefinitionSchema } from "@openapi/application-definition.js";
import type { TailscaleIp } from "@openapi/tailscale-grants.js";
import * as authentik from "@pulumi/authentik";
import { remote, type types } from "@pulumi/command";
import { all, ComponentResource, type Input, interpolate, jsonStringify, log, mergeOptions, type Output, output, type Resource, type Unwrap } from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import { TailnetKey } from "@pulumi/tailscale";
import { glob } from "glob";
import { unique } from "moderndash";
import * as yaml from "yaml";
import type { AuthentikApplicationManager } from "./authentik.ts";
import type { GlobalResources } from "./globals.ts";
import { getContainerHostnames } from "./helpers.ts";
import { runCommunityScriptLxc } from "./lxc.ts";
import type { ProxmoxHost } from "./ProxmoxHost.ts";
import { StandardDns } from "./StandardDns.ts";
import type { ClusterDefinition, PasswordDefinition, SshKeyDefinition } from "./store/index.ts";

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
  credential: Input<PasswordDefinition>;
  tailscaleArgs?: Partial<Parameters<typeof installTailscaleLxc>[0]["args"]>;
  legacyTun?: boolean;
  sftpKey: Input<SshKeyDefinition>;
  monitor: TailscaleMonitor;
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
  /** LAN IP of the LXC (first `hostname -I` address), regardless of remote flag */
  public readonly localIpAddress: Output<TailscaleIp>;
  /** LXC vNIC MAC (net0 hwaddr, lowercase) — for DHCP reservations */
  public readonly macAddress: Output<string>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly credential;
  public readonly cluster: Output<ClusterDefinition>;
  private readonly ensureDynamicDir: Resource;
  public readonly shortName: string | undefined;
  public readonly tailscaleName: Output<string>;
  private readonly mountPoints: remote.Command[] = [];
  private readonly resources: Input<Resource>[];
  private readonly dockerParent: ComponentResource<any>;
  private readonly monitor: TailscaleMonitor;
  private readonly name: string;

  constructor(
    name: string,
    private readonly args: DockgeLxcArgs,
  ) {
    super("home:dockge:DockgeLxc", name, {}, { parent: args.host });

    const cro = { parent: this };
    this.monitor = args.monitor;
    const cluster = output(args.cluster);
    this.dockerParent = new ComponentResource("home:dockge:DockgeLxcDockerParent", `${name}-docker`, {}, cro);
    this.cluster = cluster;
    this.shortName = args.host.shortName ?? name;
    this.name = name;

    const { hostname, tailscaleHostname, tailscaleName } = getContainerHostnames("dockge", args.host, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;

    const tailscaleIpParts = (args.tailscaleIpAddress ?? args.host.tailscaleIpAddress).split(".");
    this.tailscaleIpAddress = output(args.tailscaleIpAddress ?? (`${tailscaleIpParts[0]}.${tailscaleIpParts[1]}.${args.host.tailscaleIpAddress[args.host.tailscaleIpAddress.length - 1]}0.100` as TailscaleIp));

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
    depends.push(deviceInfo.apply(z => z.resource));

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

    // LAN-side identity of the LXC, read from the Proxmox host: the vNIC MAC from
    // `pct config` and the first address of `hostname -I`. Exported to 1Password so
    // consumers (e.g. UniFi DHCP reservations in stacks/unifi-network/local-dns.ts)
    // never need these hardcoded.
    this.localIpAddress = new remote.Command(
      `${name}-ip-address`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- hostname -I`,
      },
      mergeOptions(cro, { dependsOn: [setHostname] }),
    ).stdout.apply(z => z.split(" ")[0].trim()) as Output<TailscaleIp>;

    this.macAddress = new remote.Command(
      `${name}-mac-address`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct config ${args.vmId} | sed -n 's/^net0:.*hwaddr=\\([^,]*\\).*/\\1/p'`,
      },
      mergeOptions(cro, { dependsOn: [lxcExists] }),
    ).stdout.apply(z => z.trim().toLowerCase());

    this.ipAddress = args.ipAddress ? output(args.ipAddress) : args.host.remote ? this.tailscaleIpAddress : this.localIpAddress;

    this.credential = output(args.credential);
    const _connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.tailscaleHostname,
      user: this.credential.apply(z => z.username!),
      password: this.credential.apply(z => z.password!),
    });

    this.dns = this.hostname.apply(g => {
      return StandardDns.create(
        name,
        {
          hostname: g,
          ipAddress: args.ipAddress ?? this.tailscaleIpAddress,
          type: "A",
        },
        args.globals,
        cro,
      );
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

    const privateKeyPem = output(args.sftpKey).apply(k => `${k["private key"]?.trim()}\n`);
    const publicKeyPem = output(args.sftpKey).apply(k => `${k["public key"]?.trim()}\n`);

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
          triggers: keyWrites.map(k => k.id),
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
          create: interpolate`apt-get update && apt-get install -y jq restic rclone speedometer`,
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
              hostname: {
                type: TypeEnum.String,
                value: this.tailscaleHostname,
              },
              username: {
                type: TypeEnum.String,
                value: args.globals.proxmoxCredential.username,
              },
              password: {
                type: TypeEnum.Concealed,
                value: args.globals.proxmoxCredential.password,
              },
            },
          },
        },
        fields: {
          name: { type: TypeEnum.String, value: name },
          hostname: { type: TypeEnum.String, value: this.hostname },
          ipAddress: { type: TypeEnum.String, value: this.ipAddress },
          tailscaleIpAddress: {
            type: TypeEnum.String,
            value: this.tailscaleIpAddress,
          },
        },
      },
      cro,
    );

    // Phase 8 dual-write (openbao-migration PLAN §G): the item also lands at
    // its canonical OpenBao path (`secrets/hosts/dockge/<slug>`, the
    // tag:dockge rule in scripts/op-to-bao/mapping.ts) with the exact field
    // shape of the OnePasswordItem above. That prefix was seeded by the
    // one-time Phase 4 migration and then FROZE — found live the day the
    // 1Password write-back was fixed, when `DockgeLxc: Luna`'s new ipAddress
    // reached 1Password while BAO_STORE_READS consumers kept reading the
    // Phase 4 copy. 1Password stays authoritative until Phase 11 — written
    // ALONGSIDE the item, never instead of it; rollback is a plain
    // `git revert` of this block.
    if (args.globals.baoDualWriteEnabled) {
      baoKvSecret(
        `${args.host.name}-dockge-bao`,
        {
          mount: "secrets",
          path: output(args.host.title).apply(title => dockgeBaoPath(`DockgeLxc: ${title}`)),
          data: {
            name: name,
            hostname: this.hostname,
            ipAddress: this.ipAddress,
            tailscaleIpAddress: this.tailscaleIpAddress,
            ssh: {
              hostname: this.tailscaleHostname,
              username: args.globals.proxmoxCredential.username,
              password: args.globals.proxmoxCredential.password,
            },
            tailscale: {
              hostname: this.tailscaleHostname,
              ipAddress: this.tailscaleIpAddress,
            },
          },
          concealedFields: ["ssh.password"],
          customMetadata: baoProvenance({
            source_title: interpolate`DockgeLxc: ${args.host.title}`,
            source_tags: "dockge,lxc",
          }),
        },
        mergeOptions(cro, { provider: args.globals.baoProvider }),
      );
    } else {
      log.warn(
        `No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the OpenBao dual-write for ${args.host.name}'s dockge item. 1Password stays authoritative; the hosts/dockge/ copy stays frozen at its Phase 4 state until a credentialed run.`,
        this,
      );
    }

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
    return output(opts).apply(opts => {
      const content = output({
        http: {
          routers: {
            [`host-${opts.name}`]: {
              rule: `Host(\`${opts.hostname}\`)`,
              entryPoints: ["websecure"],
              service: `host-${opts.name}`,
              ...(opts.middleware?.length
                ? {
                    middlewares: opts.middleware.map(m => `- ${m}`).join("\n"),
                  }
                : {}),
              tls: {
                certResolver: opts.certResolver ?? "le",
              },
            },
            [`host-${opts.name}-tailscale`]: {
              rule: interpolate`Host(\`${opts.name}.${this.args.globals.tailscaleDomain}\`)`,
              entryPoints: ["tailscale"],
              service: `host-${opts.name}`,
              ...(opts.middleware?.length
                ? {
                    middlewares: opts.middleware.map(m => `- ${m}`).join("\n"),
                  }
                : {}),
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
      }).apply(z => yaml.stringify(z));

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
          comment: `External service for ${opts.name} (${opts.backend})`,
          ports: ["tcp:443"],
          tags: [Tailscale.tag.dockge, Tailscale.tag.apps],
        },
        {
          parent: this,
          dependsOn: dependsOn,
          deleteBeforeReplace: true,
          provider: this.args.globals.tailscaleProvider,
          replaceOnChanges: ["*"],
        },
      );

      const tailscaleServe = new remote.Command(
        `${opts.name}-tailscale-serve-${opts.backend}`,
        {
          connection: this.remoteConnection,
          create: interpolate`tailscale serve  --service=svc:${opts.name} --yes --https=443 127.0.0.1:8443`,
          update: interpolate`tailscale serve  --service=svc:${opts.name} --yes --https=443 127.0.0.1:8443`,
          delete: interpolate`tailscale serve clear svc:${opts.name}`,
        },
        {
          parent: this,
          dependsOn: [...(dependsOn ?? []), tailscaleService],
          deleteBeforeReplace: true,
        },
      );

      this.monitor.addService(`svc:${opts.name}`);

      const file = copyFileToRemote(`${opts.name}-route`, {
        connection: this.remoteConnection,
        remotePath: interpolate`/opt/stacks-data/traefik/dynamic/${opts.name}.yaml`,
        content: content,
        parent: this,
        triggers: [content, opts.name, opts.backend, opts.hostname, tailscaleService],
        dependsOn: output([tailscaleServe, ...this.resources, this.ensureDynamicDir, ...(dependsOn ?? [])]),
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
    // update hostname on machine
    const createDockerNetwork = new remote.Command(
      `${this.args.host.name}-create-docker-network`,
      {
        connection: this.args.host.remoteConnection,
        create: interpolate`pct exec ${this.args.vmId} -- docker network create dockge_default || true`,
      },
      {
        parent: this,
        dependsOn: output(args.dependsOn).apply(z => [...this.resources, ...(z ?? [])]),
      },
    );

    const dnsAuthkey = new TailnetKey(
      `${this.args.host.name}-dns-authkey`,
      {
        reusable: true,
        preauthorized: true,
        ephemeral: false,
        recreateIfInvalid: "always",
        tags: [Tailscale.tag.dns],
        description: interpolate`${this.cluster.title} Authkey for DNS service on ${this.args.host.name}`,
      },
      { parent: this, provider: this.args.globals.tailscaleProvider },
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
      replaceVariable(/\$\{TS_DNS_AUTHKEY\}/g, dnsAuthkey.key),
      replaceVariable(/\$\{CLUSTER_TITLE\}/g, this.cluster.title),
      replaceVariable(/\$\{CLUSTER_KEY\}/g, this.cluster.key),
      replaceVariable(/\$\{CLUSTER_CNAME\}/g, this.cluster.key),
      replaceVariable(
        /\$\{LOCATION\}/g,
        output(this.cluster.location).apply(loc => loc ?? "unknown"),
      ),
      replaceVariable(/\$\{CLUSTER_DOMAIN\}/g, this.cluster.rootDomain),
      // The cluster's icon URL. It used to be read as `op://Eris/Cluster: ${CLUSTER_TITLE}/icon`,
      // which was the only reference in docker/ pointing at a CLUSTER DEFINITION
      // rather than a credential — and those stopped living in a secret store in
      // Phase 8; they are checked-in YAML under /clusters. It is a public image
      // URL, so it belongs in a substitution alongside the other cluster fields,
      // not behind a secret lookup that can no longer resolve.
      replaceVariable(
        /\$\{CLUSTER_ICON\}/g,
        output(this.cluster.icon).apply(icon => icon ?? ""),
      ),
      replaceVariable(/\$\{CLUSTER_AUTHENTIK_DOMAIN\}/g, this.args.host.remote ? interpolate`authentik.${this.args.globals.tailscaleDomain}` : this.cluster.authentikDomain),
      replaceVariable(/\$UPTIME_API_URL/g, interpolate`https://uptime.${this.args.globals.searchDomain}`),
      ...Object.entries(args.variables ?? {}).map(([key, value]) => replaceVariable(new RegExp(`\\$\\{${key}\\}`, "g"), value)),
      // The secret-reference resolver runs last, after every ${VAR}
      // substitution above and the ${APP}/${STACK_NAME} pair prepended in
      // createStack — references are composed dynamically, so a resolver
      // running before substitution would see a syntax that matches nothing.
      // There is only one resolver now: Phase 11 converted the last 1Password
      // references, so every reference in a rendered file names OpenBao.
      (input: Input<string>, label: string) => this.args.globals.store.resolveSecretReferences(input, label),
    ];

    const stacks = all([output(readdir(resolve(dockerPath, "_common"))), output(readdir(resolve(dockerPath, this.args.host.name)))]).apply(([commonFiles, hostFiles]) =>
      unique([...hostFiles, ...commonFiles].filter(z => z !== ".keep" && !z.startsWith("."))),
    );

    const outpost = stacks
      .apply(stacks =>
        output(
          stacks.map(async stackName => {
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
              output(args.dependsOn).apply(z => [...z, ...this.mountPoints]),
            );
          }),
        ),
      )
      .apply(z => z.filter(z => z !== null).map(z => z!))
      .apply(z => {
        z.forEach(s => log.info(`Loaded docker stack ${s.name} from ${s.path}`), this);
        return output(this.createOutpost(z.flatMap(z => z.applications)));
      });

    return outpost;
  }

  private async createOutpost(depends: ApplicationReturn[]) {
    const applicationManager = this.args.host.applicationManager;
    const proxyProviders = depends.filter(z => z.isProxy).map(z => z.provider);

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
        protocolProviders: proxyProviders.map(z => z.id.apply(parseFloat)),
      },
      {
        parent: applicationManager.outpostsComponent,
        deleteBeforeReplace: true,
        dependsOn: proxyProviders,
      },
    );

    const authentikToken = await awaitOutput(
      this.args.globals.store.getSecretByTitle<{
        credential: string;
        url: string;
      }>("Authentik Token"),
    );
    const clientConfig = new authentikApi.Configuration({
      accessToken: authentikToken.credential,
      basePath: `${authentikToken.url}/api/v3/`,
    });

    const authentikCoreApi = new authentikApi.CoreApi(clientConfig);
    const outpostId = await awaitOutput(outpost.id);
    const outpostToken = await authentikCoreApi.coreTokensViewKeyRetrieve({
      identifier: `ak-outpost-${outpostId}-api`,
    });
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

  private async getStackFiles(_stackName: string, commonPath: string, path: string): Promise<Map<string, string> | null> {
    const commonFiles = await glob("**/*", {
      cwd: commonPath,
      absolute: true,
      nodir: true,
      dot: true,
    });
    const files = await glob("**/*", {
      cwd: path,
      absolute: true,
      nodir: true,
      dot: true,
    });

    if (commonFiles.some(z => z.endsWith(".ignore")) || files.some(z => z.endsWith(".ignore"))) {
      return null;
    }

    // glob() gives NO ordering guarantee — it walks directories concurrently and yields
    // entries in completion order, so a deeply nested stack (prometheus, with config/,
    // config/rules/ and config/alloy/) comes back in a different order from run to run
    // once several stacks are globbing at once. That order flows into this Map, into the
    // per-file resource list in createStack(), and finally into the compose Command's
    // positional `triggers` array — where a pure reshuffle showed up as a diff on
    // `triggers[6]`…`triggers[9]` with inputDiff:false and replaced the Command, i.e.
    // restarted a healthy Docker stack for no reason. Sort so the order is a property of
    // the file names rather than of disk timing.
    //
    // createStack() now sorts the trigger list independently as well, so this is no
    // longer the only thing standing between a concurrent directory walk and a stack
    // restart — but it is still what makes the resources get built in a sane order.
    commonFiles.sort();
    files.sort();

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
    replacements: ((input: Output<string>, label: string) => Output<string>)[],
    dependsOn: Input<Resource[]>,
  ): Output<{
    name: string;
    path: string;
    compose?: remote.Command;
    applications: ApplicationReturn[];
  }> {
    const copyFiles = [];
    // Trigger identities for this stack's compose Command, tracked separately
    // from `copyFiles` because the two need different guarantees. `copyFiles`
    // is a dependency set, where order is irrelevant; `triggers` is an ORDERED
    // array that the command provider treats as force-new, so a pure reorder —
    // same resources, same ids — is enough to replace the Command and restart
    // the stack's containers. Each entry therefore carries the Pulumi resource
    // name as a stable key and the array is sorted by it before use, so the
    // triggers depend only on WHICH resources exist, never on the order they
    // happened to be constructed in.
    const composeTriggers: { key: string; id: any }[] = [];
    const _cluster = this.cluster;
    const tailscaleDomain = this.args.globals.tailscaleDomain;
    // Prepend stack-specific substitutions so they run BEFORE the vaultRegex resolver.
    // vaultRegex is the last item in the inherited replacements array; if APP/STACK_NAME
    // were appended after it, op:// paths like "op://Eris/${CLUSTER_KEY}-${APP}-oidc-credentials/..."
    // would still contain "${APP}" when the resolver runs and the regex would fail to match.
    replacements = [replaceVariable(/\$\{STACK_NAME\}/g, stackName), replaceVariable(/\$\{APP\}/g, stackName), ...replacements];

    let hasCompose = false;
    let hasInit = false;

    // Pluggable per-stack post-deploy hook: a method named `${stackName}Init` on this class,
    // if present, is invoked once the stack's compose command has been created. This lets
    // individual stacks (e.g. technitium) override default behavior — such as generic DNS
    // record creation below — without special-casing them inline.
    const stackInitMethod = (this as unknown as Record<string, unknown>)[`${stackName}Init`];
    const hasStackInit = typeof stackInitMethod === "function";

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
      .apply(defs =>
        defs.map(([, absoluteFilePath]) => {
          const content = output(readFile(absoluteFilePath, "utf-8"));
          const replacedContent = replacements.reduce((p, r) => r(p, absoluteFilePath), content);
          // intercept definition file and create the client id / client secret and inject that into the yaml.
          return replacedContent.apply(content => {
            const docs = yaml.parseAllDocuments(content);
            if (!docs || "empty" in docs) {
              return [];
            }
            return docs.map(doc => this.args.host.applicationManager.createApplication(doc.toJS() as unknown as ApplicationDefinitionSchema));
          });
        }),
      )
      .apply(z => output(z))
      .apply(z => z.flat().map(z => z));

    dependsOn = all([dependsOn, waitForApplications]).apply(([a, b]) => [...a, ...b.map(z => z.app)]);

    const _triggers = [];

    for (const [relativeFilePath, absoluteFilePath] of others) {
      const content = output(readFile(absoluteFilePath, "utf-8"));
      const file = relativeFilePath;
      // Name the document: an unresolved reference reports WHICH file and which
      // line, instead of leaving you to grep the whole tree for a scheme.
      const replacedContent = replacements.reduce((p, r) => r(p, absoluteFilePath), content);

      if (file.endsWith("init.sh")) {
        hasInit = true;
      } else if (file.endsWith("compose.yaml")) {
        hasCompose = true;

        const stackUsers = replacedContent.apply(content => {
          try {
            const parsed = yaml.parse(content);
            return [
              ...new Set(
                Object.values((parsed?.services ?? {}) as Record<string, any>)
                  .map((svc: any) => svc?.user)
                  .filter(Boolean) as string[],
              ),
            ];
          } catch {
            return [] as string[];
          }
        });

        const chownCmd = stackUsers.apply(users => (users.length > 0 ? users.flatMap(u => [`chown -R ${u} /opt/stacks-data/${stackName}`, `chown -R ${u} /opt/stacks/${stackName}`]).join(" && ") : "true"));

        const chownName = `${this.shortName}-${stackName}-chown-stack`;
        const chownStack = new remote.Command(
          chownName,
          {
            connection: this.remoteConnection,
            create: chownCmd,
            update: chownCmd,
          },
          { parent: stackParent, dependsOn: [stackParent] },
        );
        copyFiles.push(chownStack);
        composeTriggers.push({ key: chownName, id: chownStack.id });

        const tailscaleServices: Resource[] = [];
        const hostRegex = /Host\(`(.*?)`\)/g;

        all([replacedContent, tailscaleDomain]).apply(([content, tailscaleDomain]) => {
          const hosts = new Set<string>(Array.from(content.matchAll(hostRegex)).map(z => z[1]));

          // A stack running its own tailscale sidecar (network_mode: service:tailscale) joins
          // the tailnet under a dedicated identity, not the DockgeLxc host's own address — the
          // generic CNAME-to-host record below would point clients at the wrong IP, so skip it.
          const hasTailscaleSidecar = (() => {
            try {
              const parsed = yaml.parse(content);
              return Object.values((parsed?.services ?? {}) as Record<string, any>).some((svc: any) => typeof svc?.image === "string" && svc.image.startsWith("tailscale/tailscale"));
            } catch {
              return false;
            }
          })();

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
                    ports: ["tcp:443"],
                    tags: [Tailscale.tag.dockge, Tailscale.tag.apps],
                    comment: `External service for ${service} (${host})`,
                  },
                  {
                    parent: this,
                    dependsOn: tailscaleServices,
                    deleteBeforeReplace: true,
                    provider: this.args.globals.tailscaleProvider,
                    replaceOnChanges: ["*"],
                  },
                ),
              );

              const tailscaleServe = new remote.Command(
                `${stackName}-tailscale-serve-${service}`,
                {
                  connection: this.remoteConnection,
                  create: interpolate`tailscale serve  --service=svc:${service} --yes --https=443 127.0.0.1:8443`,
                  update: interpolate`tailscale serve  --service=svc:${service} --yes --https=443 127.0.0.1:8443`,
                  delete: interpolate`tailscale serve clear svc:${service}`,
                },
                {
                  parent: this,
                  dependsOn: tailscaleServices,
                  deleteBeforeReplace: true,
                },
              );

              this.monitor.addService(`svc:${service}`);

              copyFiles.push(tailscaleServe);

              continue;
            }

            if (hasTailscaleSidecar) {
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

      const copyName = `${this.shortName}-${stackName}-${file.replace(/\//g, "-")}-copy-file`;
      const copy = copyFileToRemote(copyName, {
        connection: this.remoteConnection,
        remotePath: interpolate`/opt/stacks/${stackName}/${file}`,
        content: replacedContent,
        // The source path is a trigger because provenance matters on its own:
        // the same remotePath can be fed by docker/_common/<stack>/… or by the
        // host-specific docker/<host>/<stack>/… override, and a switch between
        // the two is a real change even when the bytes are identical.
        //
        // It must be relative to `dockerPath`, never absolute. An absolute path
        // encodes WHERE THE REPO IS CHECKED OUT, which differs per machine —
        // state written from a checkout at /share/source and a run from
        // ~/Development/... disagree on every single file, and each run replaces
        // all ~100 of them back and forth forever while `triggers[0]` (the
        // content hash) sits there unchanged, proving nothing actually differs.
        triggers: [replacedContent, relative(dockerPath, absoluteFilePath)],
        parent: stackParent,
        dependsOn: dependsOn,
      });
      copyFiles.push(copy);
      composeTriggers.push({ key: copyName, id: copy.id });
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
            triggers: [Date.now()], // always run
            create: interpolate`cd /opt/stacks/${stackName} && bash init.sh`,
          },
          {
            // Snapshot, not the live array. Pulumi reads `dependsOn` inside an
            // async prepare step, so passing `copyFiles` by reference let it
            // pick up whatever the tailscale/DNS resources built inside the
            // `.apply()` above had managed to push by then — a set that varied
            // per run and was never something to rely on. Those resources are
            // registered strictly after this point in every run, so the honest
            // dependency set is the file copies, and only those.
            parent: stackParent,
            dependsOn: [...copyFiles],
            deleteBeforeReplace: true,
          },
        );
        composeDeps.push(initCommand);
      }

      const compose = new remote.Command(
        `${this.shortName}-${stackName}-compose`,
        {
          connection: this.remoteConnection,
          // Positional: Pulumi diffs this array slot by slot, so the ORDER is load-bearing,
          // not just the contents. A pure reshuffle shows up as a diff on `triggers[n]`
          // with inputDiff:false and replaces this command, and `deleteBeforeReplace` +
          // `docker compose up -d` means that restarts a healthy stack.
          //
          // So it is built from `composeTriggers` rather than from `copyFiles` directly:
          // every entry carries its Pulumi resource name and the array is sorted by it,
          // making the order a property of WHICH resources exist rather than of when they
          // were constructed. getStackFiles() sorting its glob results is what keeps the
          // construction order sane; this is what keeps the plan from depending on it.
          //
          // Plain codepoint order, NOT localeCompare — that would make the plan depend on
          // the runner's locale.
          triggers: [...composeTriggers].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(t => t.id),
          create: interpolate`cd /opt/stacks/${stackName} && docker compose -f compose.yaml build && docker compose -f compose.yaml up -d && docker compose -f compose.yaml start`,
        },
        {
          parent: stackParent,
          dependsOn: all([waitForApplications, dependsOn]).apply(([waitForApplicationsDeps, dependsOnDeps]) => [...waitForApplicationsDeps.map(z => z.app), ...dependsOnDeps, ...composeDeps]),
          deleteBeforeReplace: true,
        },
      );

      if (hasStackInit) {
        (stackInitMethod as (this: DockgeLxc, dependsOn: Input<Resource>[]) => unknown).call(this, [compose]);
      }

      return waitForApplications.apply(applications => ({
        name: stackName,
        path,
        compose,
        applications,
      }));
    }
    return waitForApplications.apply(applications => ({
      name: stackName,
      path,
      applications,
    }));
  }
}

function replaceVariable(key: RegExp, value: Input<string>) {
  return (input: Input<string>) => all([value, input]).apply(([v, i]) => i.replace(key, v));
}

function _incrementLastOctet(ip: TailscaleIp): TailscaleIp {
  const parts = ip.split(".");
  const lastOctet = Number(parts[3]) + 1;
  return `${parts[0]}.${parts[1]}.${parts[2]}.${lastOctet}` as TailscaleIp;
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

function _tryGetService(name: string, globals: GlobalResources) {
  try {
    return tailscale.getServiceOutput({ name: `svc:${name}` }, { provider: globals.tailscaleProvider }).apply(z => (z ? z : undefined));
  } catch (_error) {
    return output(undefined);
  }
}
