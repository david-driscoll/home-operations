import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FullItem } from "@1password/connect";
import { baoKvSecret, baoProvenance, baoSlug } from "@components/bao.ts";
import { OnePasswordItem, type OnePasswordItemSectionInput } from "@dynamic/1password/OnePasswordItem.ts";
import type { TailscaleCidr } from "@openapi/tailscale-grants.js";
import { remote, type types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { DeviceTags, getDevice, getDeviceOutput, TailnetKey } from "@pulumi/tailscale";
import * as unifi from "@pulumiverse/unifi";
import createClient, { type Client } from "openapi-fetch";
import { ClientCredentials } from "simple-oauth2";
import type { paths } from "../types/tailscale.ts";
import type { GlobalResources } from "./globals.ts";
import { awaitOutput, copyFileToRemote } from "./helpers.ts";

/**
 * Tailscale node state exported by individual stacks to 1Password
 */
export interface TailscaleNodeState {
  deviceId: string;
  name: string;
  hostname: string;
  ip: string;
  tags: string[];
}

/**
 * 1Password export format for Tailscale node state
 * This wraps TailscaleNodeState with metadata for 1Password item structure
 */
export interface TailscaleNodeExport {
  stackName: string;
  nodes: TailscaleNodeState[];
}

export async function getTailscaleClient(globals: GlobalResources): Promise<Client<paths>> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const tailscaleCredential = await awaitOutput(globals.store.getSecretByTitle<{ username: string; credential: string }>("Tailscale Terraform OAuth Client"));
  const oauth = new ClientCredentials({
    client: {
      id: tailscaleCredential.username,
      secret: tailscaleCredential.credential,
    },
    auth: {
      tokenHost: "https://api.tailscale.com/api/v2/",
      tokenPath: "oauth/token",
    },
  });

  const token = await oauth.getToken({});
  const client = createClient<paths>({
    baseUrl: "https://api.tailscale.com/api/v2/",
    headers: { Authorization: `Bearer ${token.token.access_token}` },
  });

  return client;
}

export interface NodeInfo {
  name: pulumi.Input<string>;
  /** Tailscale IP of the node */
  externalIp: pulumi.Input<string>;
  /** LAN IP (e.g., 10.10.x.x) — used for subnet access grants and DHCP reservations */
  internalIp: pulumi.Input<string>;
  /** LAN NIC MAC address (lowercase) — used for UniFi DHCP reservations */
  mac: pulumi.Input<string>;
  /** Device role — used to categorize nodes for ACL test cases */
  nodeType?: "proxmox" | "dockge" | "pbs" | "truenas";
}

export function getTailscaleIp(name: pulumi.Input<string>, globals: GlobalResources): pulumi.Output<string> {
  if (pulumi.runtime.isDryRun()) {
    return pulumi.output(pulumi.unknown) as pulumi.Output<string>;
  }

  return getDeviceOutput({ name: pulumi.interpolate`${name}.${globals.tailscaleDomain}` }, { provider: globals.tailscaleProvider })
    .apply(ip => {
      pulumi.log.info(`Got Tailscale IP for ${ip.name}: ${ip.addresses.join(", ")}`, globals);
      return ip;
    })
    .apply(z => z.addresses[0]);
}

export class TailscaleMonitor {
  private readonly services: string[] = [];
  /**
   * `globals` is here for `baoProvider`/`baoDualWriteEnabled` only — the
   * monitor itself needs nothing else from it. Threading it through the
   * construction sites is what PLAN §G-8 costs: the export is cross-stack
   * inventory, and the producing side owns the OpenBao write.
   */
  constructor(private readonly globals: GlobalResources) {}
  public addService(name: string) {
    this.services.push(name);
  }

  public exportNodeStateToOnePassword(nodeState: NodeInfo[], cro: pulumi.ResourceOptions) {
    const _hostsSection: OnePasswordItemSectionInput = {
      fields: Object.fromEntries(nodeState.map(z => [z.name, { value: z.externalIp }] as const)),
    };

    const stack = pulumi.runtime.getStack();
    const title = `Tailscale Export - ${stack}`;
    const item = new OnePasswordItem(
      `${stack}-tailnet`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: title,
        tags: ["tailscale-export"],
        sections: pulumi.output(nodeState).apply(nodes =>
          Object.fromEntries(
            nodes
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(
                z =>
                  [
                    z.name,
                    {
                      fields: {
                        externalIp: { value: z.externalIp },
                        internalIp: { value: z.internalIp },
                        mac: { value: z.mac },
                        nodeType: { value: z.nodeType ?? "unknown" },
                      },
                    },
                  ] as const,
              ),
          ),
        ),
        fields: {
          name: { value: stack },
          services: { value: pulumi.jsonStringify(this.services) },
        },
      },
      cro,
    );

    // Phase 8 dual-write (openbao-migration PLAN §G-8): the export also lands
    // at its reserved inventory path (`clusters/_inventory/<slug(title)>`, the
    // path the migration reserved for the tag:tailscale-export family) with the
    // exact
    // field shape of the OnePasswordItem above — `name`/`services` flat, one
    // nested object per node. 1Password stays authoritative until Phase 11 —
    // written ALONGSIDE the item, never instead of it; rollback is a plain
    // `git revert`. `BaoStore.getTailscaleExports` refuses to serve consumers
    // until every producing stack has run this once.
    if (this.globals.baoDualWriteEnabled) {
      baoKvSecret(
        `${stack}-tailnet-bao`,
        {
          mount: "secrets",
          path: `clusters/_inventory/${baoSlug(title)}`,
          data: pulumi.output(nodeState).apply(nodes => ({
            name: stack,
            services: pulumi.jsonStringify(this.services),
            ...Object.fromEntries(
              [...nodes]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(
                  z =>
                    [
                      z.name,
                      {
                        externalIp: z.externalIp,
                        internalIp: z.internalIp,
                        mac: z.mac,
                        nodeType: z.nodeType ?? "unknown",
                      },
                    ] as const,
                ),
            ),
          })),
          // Addressing, not credentials: node names, IPs, MACs, node types.
          // Declared empty deliberately rather than omitted.
          concealedFields: [],
          customMetadata: baoProvenance({ source_title: title, source_tags: "tailscale-export" }),
        },
        pulumi.mergeOptions(cro, { provider: this.globals.baoProvider }) as pulumi.CustomResourceOptions,
      );
    } else {
      pulumi.log.warn(
        `No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the tailscale-export dual-write for ${stack}. 1Password stays authoritative; the inventory path stays stale until a credentialed run.`,
      );
    }

    return item;
  }
}

/**
 * Installs Tailscale on an LXC container using community-scripts.
 *
 * This function:
 * 1. Runs add-tailscale-lxc.sh (configures LXC, installs Tailscale)
 * 2. Copies auth key and runs `tailscale up` with provided args
 * 3. Configures Tailscale settings with `tailscale set`
 */
export function installTailscaleLxc(options: {
  connection: types.input.remote.ConnectionArgs;
  globals: GlobalResources;
  name: pulumi.Input<string>;
  ipAddress?: pulumi.Input<string>;
  parent: pulumi.Resource;
  dependsOn?: pulumi.Resource[];
  vmId: pulumi.Input<number>;
  installTailscale: boolean;
  // Some ARM64 Proxmox builds (e.g. jiangcuo) have mknod stubbed out, making
  // the pct devN passthrough mechanism unusable. Set legacyTun to fall back to
  // raw lxc.mount.entry + lxc.cgroup2.devices.allow instead of --dev2.
  legacyTun?: boolean;
  args: {
    advertiseTags: string[];
    acceptDns?: pulumi.Input<boolean>;
    acceptRoutes?: pulumi.Input<boolean>;
    ssh?: pulumi.Input<boolean>;
    advertiseExitNode?: pulumi.Input<boolean>;
    relayServerPort?: pulumi.Input<number>;
  };
}) {
  const deviceInfo = pulumi.all([options.name, options.ipAddress, options.args, pulumi.output(getTailscaleClient(options.globals))]).apply(async ([name, ipAddress, args, client]) => {
    const dependsOn = options.dependsOn ?? [];

    if (pulumi.runtime.isDryRun()) {
      return pulumi.unknown as ReturnType<typeof updateTailscaleDeviceInfo>;
    }

    const tunCreate = options.legacyTun
      ? pulumi.interpolate`grep -q 'lxc.mount.entry: /dev/net/tun' /etc/pve/lxc/${options.vmId}.conf || echo 'lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file' >> /etc/pve/lxc/${options.vmId}.conf; grep -q 'lxc.cgroup2.devices.allow: c 10:200 rwm' /etc/pve/lxc/${options.vmId}.conf || echo 'lxc.cgroup2.devices.allow: c 10:200 rwm' >> /etc/pve/lxc/${options.vmId}.conf`
      : pulumi.interpolate`pct set ${options.vmId} --dev2 /dev/net/tun`;

    const lxcConfig = new remote.Command(
      `${name}-lxc-tun`,
      {
        connection: options.connection,
        create: tunCreate,
      },
      { parent: options.parent, dependsOn: dependsOn },
    );

    const tailscaleArgs = pulumi.interpolate`--hostname=${name} --report-posture ${options.args.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${options.args.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
      options.args.ssh ? "--ssh" : "--ssh=false"
    } ${options.args.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} --accept-risk=lose-ssh`;

    const tailscaleAuthkey = new TailnetKey(
      `${name}-authkey`,
      {
        reusable: true,
        preauthorized: true,
        ephemeral: false,
        // expiry: Math.floor(60 * 60), // 1 hour in seconds
        recreateIfInvalid: "always",
        tags: args.advertiseTags,
        description: "Proxmox Management Key",
      },
      {
        parent: options.parent,
        dependsOn: dependsOn,
        provider: options.globals.tailscaleProvider,
      },
    );

    if (options.installTailscale) {
      const installTailscale = new remote.Command(
        `${name}-tailscale-install`,
        {
          connection: options.connection,
          create: pulumi.interpolate`pct exec ${options.vmId} -- sh -lc 'curl -fsSL https://tailscale.com/install.sh | sh'`,
          triggers: [lxcConfig.create, options.vmId],
        },
        { parent: options.parent, dependsOn: [lxcConfig] },
      );

      // restart lxc
      const restartLxc = new remote.Command(
        `${name}-restart-lxc`,
        {
          connection: options.connection,
          create: pulumi.interpolate`pct reboot ${options.vmId}`,
          update: "echo 0",
          triggers: [lxcConfig.create, installTailscale.create],
        },
        { parent: options.parent, dependsOn: [installTailscale] },
      );
      dependsOn.push(installTailscale, restartLxc);

      // Step 2: Copy auth key to container
      const authKey = copyFileToRemote(`${name}-authkey`, {
        content: tailscaleAuthkey.key,
        remotePath: pulumi.interpolate`/tmp/${name}-authkey`,
        connection: options.connection,
        parent: options.parent,
        dependsOn: [...dependsOn],
        triggers: [lxcConfig.create, restartLxc.create, tailscaleAuthkey.key, tailscaleArgs],
      });

      const copyAuthKey = new remote.Command(
        `${name}-copy-authkey`,
        {
          connection: options.connection,
          create: pulumi.interpolate`pct push ${options.vmId} /tmp/${name}-authkey /tmp/${name}-authkey`,
          triggers: [lxcConfig.create, authKey.id, tailscaleAuthkey.key, tailscaleArgs],
        },
        { parent: options.parent, dependsOn: [...dependsOn] },
      );
      dependsOn.push(copyAuthKey);

      // Step 4: Run tailscale up with auth key
      const tailscaleUp = new remote.Command(
        `${name}-tailscale-up-lxc`,
        {
          connection: options.connection,
          create: pulumi.interpolate`pct exec ${options.vmId} -- tailscale up --auth-key=file:/tmp/${name}-authkey ${tailscaleArgs} --reset`,
          triggers: [lxcConfig.create, copyAuthKey.id, tailscaleAuthkey.key],
        },
        { parent: options.parent, dependsOn: [...dependsOn] },
      );
      dependsOn.push(tailscaleUp);
    }

    // Step 5: Configure tailscale settings
    const tailscaleSet = new remote.Command(
      `${name}-tailscale-set-lxc`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct exec ${options.vmId} -- tailscale set ${options.args.relayServerPort ? pulumi.interpolate`--relay-server-port=${options.args.relayServerPort}` : ""} ${tailscaleArgs} --auto-update`,
        triggers: [lxcConfig.create, tailscaleAuthkey.key],
      },
      { parent: options.parent, dependsOn: [...dependsOn] },
    );
    if (pulumi.runtime.isDryRun()) {
      return pulumi.output(pulumi.unknown) as ReturnType<typeof updateTailscaleDeviceInfo>;
    }

    return tailscaleSet.stdout.apply(() => updateTailscaleDeviceInfo(tailscaleSet.id, name, ipAddress, args.advertiseTags, client, options.globals, options.parent, dependsOn)).apply(z => z);
  });

  return deviceInfo;
}

function updateTailscaleDeviceInfo(
  waitsFor: pulumi.Output<string>,
  name: string,
  ipAddress: string | undefined,
  tags: pulumi.Input<string[]>,
  client: Client<paths>,
  globals: GlobalResources,
  parent: pulumi.Resource,
  dependsOn: pulumi.Resource[],
) {
  return pulumi.all([globals.tailscaleDomain, waitsFor]).apply(async ([tailscaleDomain, _]) => {
    const deviceInfo = await getDevice({ name: `${name}.${tailscaleDomain}` }, { provider: globals.tailscaleProvider, parent: parent });
    if (!deviceInfo) {
      throw new Error(`Device with name ${name}.${tailscaleDomain} not found in Tailscale API`);
    }
    // const deviceInfo = deviceInfos.devices[0];

    if (ipAddress) {
      await client.POST("/device/{deviceId}/ip", {
        params: { path: { deviceId: deviceInfo.nodeId } },
        body: { ipv4: ipAddress },
      });
    }
    await client.POST("/device/{deviceId}/key", {
      params: { path: { deviceId: deviceInfo.nodeId } },
      body: { keyExpiryDisabled: true },
    });

    const resource = new DeviceTags(
      `${name}-device-tags`,
      {
        deviceId: deviceInfo.nodeId!,
        tags: tags,
      },
      {
        parent: parent,
        provider: globals.tailscaleProvider,
        dependsOn: dependsOn,
        retainOnDelete: true,
      },
    );

    const tailscaleForwardingConfig = copyFileToRemote(`${name}-tailscale-forwarding-config`, {
      connection: { host: `${name}.${tailscaleDomain}`, user: "root" },
      remotePath: "/etc/sysctl.d/99-tailscale.conf",
      content: `net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
`,
      parent: parent,
    });

    const _tailscaleForwarding = new remote.Command(
      `${name}-tailscale-forwarding`,
      {
        connection: { host: `${name}.${tailscaleDomain}`, user: "root" },
        create: "sysctl -p /etc/sysctl.d/99-tailscale.conf",
        triggers: [tailscaleForwardingConfig.id],
      },
      { parent: parent, dependsOn: [resource, tailscaleForwardingConfig] },
    );

    // Containers behind a docker bridge (MTU 1500) negotiate MSS 1460, but forwarded
    // traffic leaves via tailscale0 (MTU 1280); without clamping, full-size return
    // segments are black-holed and TLS handshakes to remote-site services stall.
    const mssClampUnit = copyFileToRemote(`${name}-tailscale-mss-clamp-unit`, {
      connection: { host: `${name}.${tailscaleDomain}`, user: "root" },
      remotePath: "/etc/systemd/system/tailscale-mss-clamp.service",
      content: `[Unit]
Description=Clamp TCP MSS to PMTU for traffic forwarded into tailscale0
After=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'iptables -t mangle -C FORWARD -o tailscale0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || iptables -t mangle -A FORWARD -o tailscale0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu'
ExecStart=/bin/sh -c 'ip6tables -t mangle -C FORWARD -o tailscale0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || ip6tables -t mangle -A FORWARD -o tailscale0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu'

[Install]
WantedBy=multi-user.target
`,
      parent: parent,
    });

    const _mssClamp = new remote.Command(
      `${name}-tailscale-mss-clamp`,
      {
        connection: { host: `${name}.${tailscaleDomain}`, user: "root" },
        create: "systemctl daemon-reload && systemctl enable --now tailscale-mss-clamp.service",
        triggers: [mssClampUnit.id],
      },
      { parent: parent, dependsOn: [resource, mssClampUnit] },
    );

    return { resource, deviceInfo };
  });
}

export function updateTailscaleProxmox(options: {
  connection: types.input.remote.ConnectionArgs;
  globals: GlobalResources;
  name: pulumi.Input<string>;
  ipAddress: pulumi.Input<string>;
  parent: pulumi.Resource;
  dependsOn?: pulumi.Resource[];
  args: {
    advertiseTags: string[];
    advertiseRoutes: TailscaleCidr[];
    acceptDns?: pulumi.Input<boolean>;
    acceptRoutes?: pulumi.Input<boolean>;
    ssh?: pulumi.Input<boolean>;
    advertiseExitNode?: pulumi.Input<boolean>;
    relayServerPort?: pulumi.Input<number>;
    exitNodeAllowLanAccess?: pulumi.Input<boolean>;
  };
}) {
  const deviceInfo = pulumi.all([options.name, options.ipAddress, options.args, pulumi.output(getTailscaleClient(options.globals))]).apply(async ([name, ipAddress, args, client]) => {
    const dependsOn = options.dependsOn ?? [];

    const tailscaleArgs = pulumi.interpolate`--hostname=${name} --report-posture ${args.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${args.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
      args.ssh ? "--ssh" : "--ssh=false"
    } ${args.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} ${args.exitNodeAllowLanAccess ? "--exit-node-allow-lan-access" : "--exit-node-allow-lan-access=false"} --accept-risk=lose-ssh --advertise-routes="${args.advertiseRoutes.join(",")}"`;

    const tailscaleSet = new remote.Command(
      `${name}-tailscale-set`,
      {
        connection: options.connection,
        create: pulumi.interpolate`tailscale set ${args.relayServerPort ? pulumi.interpolate`--relay-server-port=${args.relayServerPort}` : ""} ${tailscaleArgs} --auto-update `,
        triggers: [],
      },
      { parent: options.parent, dependsOn: [] },
    );

    if (pulumi.runtime.isDryRun()) {
      return pulumi.output(pulumi.unknown) as ReturnType<typeof updateTailscaleDeviceInfo>;
    }

    return tailscaleSet.stdout.apply(() => updateTailscaleDeviceInfo(tailscaleSet.id, name, ipAddress, args.advertiseTags, client, options.globals, options.parent, dependsOn)).apply(z => z);
  });

  return deviceInfo;
}

export function createPeerRelayRule(fwdIp: pulumi.Input<string>, globals: GlobalResources) {
  return pulumi.output(fwdIp).apply(ip => {
    const ipDash = ip.replace(/\./g, "-");
    const relayPort = new random.RandomInteger(`tailscale-relay-port-${ipDash}`, { min: 40000, max: 60000 });
    const _portForward = new unifi.port.Forward(
      `tailscale-port-forward-${ipDash}`,
      {
        dstPort: relayPort.result.apply(p => p.toString()),
        portForwardInterface: "wan",
        protocol: "tcp_udp",
        srcIp: "any",
        fwdIp: fwdIp,
        fwdPort: relayPort.result.apply(p => p.toString()),
      },
      { provider: globals.unifiProvider, dependsOn: [relayPort] },
    );
    return relayPort;
  });
}

export interface ManagedAuthKeyArgs {
  /** Becomes `${appName}-authkey`'s Pulumi resource name and the OpenBao path's slug. */
  appName: string;
  /** `clusters/<clusterKey>/apps/<appName>/tailscale-authkey` -- same shape as `oidcBaoPath`/`postgresBaoPath` in components/bao.ts. */
  clusterKey: string;
  /** ACL tags the resulting node registers under. Must already exist in the tailnet policy (sdks/tailscale/acl.ts) -- an unknown tag fails the key creation outright. */
  tags: pulumi.Input<string>[];
  description: string;
  /** Default true: a `tailscale/tailscale` sidecar with `TS_AUTH_ONCE=true` re-registers the same node on restart rather than minting a new one, so the key needs to survive being used more than once. */
  reusable?: boolean;
  /** Default false -- an ephemeral node is removed from the tailnet as soon as it disconnects, which is wrong for anything meant to be reachable (`ssh <name>`) between restarts. */
  ephemeral?: boolean;
}

/**
 * Mints a Tailscale auth key via the Pulumi `tailscale` provider and writes
 * it into OpenBao at the path an app's own `ExternalSecret` reads --
 * `clusters/<clusterKey>/apps/<appName>/tailscale-authkey`, key `key`. The
 * "helper" `stacks/system/tailscale-authkeys.ts` calls this once per
 * consumer; add a new one there, not by hand-writing a `TailnetKey` at the
 * call site.
 *
 * Deliberately narrow: this is for the "a pod IS a tailnet node" shape
 * (agentboard's SSH sidecar, technitium's, ...), where the key is consumed
 * once at container start and never rotates on its own. It is NOT the
 * `installTailscaleLxc` pattern above (a Proxmox host tailscale bootstraps
 * over `pct exec`, not a Kubernetes Secret) and NOT a substitute for
 * `GlobalResources.tailscaleProvider`'s own OAuth client credential, which
 * this reuses rather than replaces.
 *
 * Guarded the same way `TailscaleMonitor.export`'s inventory dual-write is:
 * a run with no OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID +
 * BAO_SECRET_ID -- see `GlobalResources.baoDualWriteEnabled`) skips the
 * write and warns rather than failing the whole stack, because a plan
 * preview should not require write access to succeed.
 */
export function createManagedAuthKey(globals: GlobalResources, args: ManagedAuthKeyArgs, opts: pulumi.CustomResourceOptions = {}) {
  const key = new TailnetKey(
    `${args.appName}-authkey`,
    {
      reusable: args.reusable ?? true,
      preauthorized: true,
      ephemeral: args.ephemeral ?? false,
      recreateIfInvalid: "always",
      tags: args.tags,
      description: args.description,
    },
    pulumi.mergeOptions(opts, { provider: globals.tailscaleProvider }),
  );

  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn(`No OpenBao credentials -- skipping the tailscale-authkey write for ${args.appName}. The Secret at its existing OpenBao path (if any) is left untouched.`);
    return key;
  }

  baoKvSecret(
    `${args.appName}-authkey-bao`,
    {
      mount: "secrets",
      path: `clusters/${args.clusterKey}/apps/${baoSlug(args.appName)}/tailscale-authkey`,
      data: { key: key.key },
      concealedFields: ["key"],
      customMetadata: baoProvenance({ source: "createManagedAuthKey" }),
    },
    pulumi.mergeOptions(opts, { provider: globals.baoProvider, dependsOn: [key] }) as pulumi.CustomResourceOptions,
  );

  return key;
}
