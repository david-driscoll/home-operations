import { OPClient } from "./op.ts";
import type { components, paths } from "../types/tailscale.ts";
import createClient, { Client } from "openapi-fetch";
import { dirname } from "path";
import * as unifi from "@pulumiverse/unifi";
import * as random from "@pulumi/random";
import { fileURLToPath } from "url";
import { GlobalResources } from "./globals.ts";
import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { ClientCredentials } from "simple-oauth2";
import { copyFileToRemote } from "./helpers.ts";
import { DeviceTags, getDevice, getDeviceOutput } from "@pulumi/tailscale";
import { TailscaleCidr } from "@openapi/tailscale-grants.js";
import { OnePasswordItem, OnePasswordItemFieldInput, OnePasswordItemSectionInput } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";

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

export async function getTailscaleClient(): Promise<Client<paths>> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const tailscaleCredential = await new OPClient().getItemByTitle("Tailscale Terraform OAuth Client");
  const oauth = new ClientCredentials({
    client: {
      id: tailscaleCredential.fields["username"].value!,
      secret: tailscaleCredential.fields["credential"].value!,
    },
    auth: {
      tokenHost: "https://api.tailscale.com/api/v2/",
      tokenPath: "oauth/token",
    },
  });

  const token = await oauth.getToken({});
  const client = createClient<paths>({ baseUrl: "https://api.tailscale.com/api/v2/", headers: { Authorization: `Bearer ${token.token.access_token}` } });

  return client;
}

export interface NodeInfo {
  name: pulumi.Input<string>;
  ip: pulumi.Input<string>;
  /** Non-Tailscale internal IP (e.g., 10.10.x.x) — used for subnet access grants */
  internalIp?: pulumi.Input<string>;
  /** Device role — used to categorize nodes for ACL test cases */
  nodeType?: "proxmox" | "dockge" | "pbs" | "truenas";
}

export function getTailscaleIp(name: pulumi.Input<string>, globals: GlobalResources): pulumi.Output<string> {
  return getDeviceOutput({ name: pulumi.interpolate`${name}.${globals.tailscaleDomain}` }, { provider: globals.tailscaleProvider })
    .apply((ip) => {
      pulumi.log.info(`Got Tailscale IP for ${ip.name}: ${ip.addresses.join(", ")}`);
      return ip;
    })
    .apply((z) => z.addresses[0]);
}

/**
 * Export Tailscale node state to a 1Password item with the 'tailscale-export' tag.
 * Resolves all Pulumi inputs before serializing to JSON so the stored value is
 * a plain JSON string (not "[object Object]").
 *
 * @param stackName  - Stack name (e.g., 'home', 'gulf-of-mexico')
 * @param nodeState  - Nodes to export (name + tailscale IP, optional internal IP + type)
 * @param services   - Tailscale service identifiers registered by this stack (e.g., 'svc:adguard-home')
 * @param cro        - Pulumi resource options (parent, provider, etc.)
 */
export function exportNodeStateToOnePassword(nodeState: NodeInfo[], services: string[], cro: pulumi.ResourceOptions) {
  const hostsSection: OnePasswordItemSectionInput = {
    fields: Object.fromEntries(nodeState.map((z) => [z.name, { value: z.ip }] as const)),
  };

  return new OnePasswordItem(
    `${pulumi.runtime.getStack()}-tailnet`,
    {
      category: FullItem.CategoryEnum.SecureNote,
      title: `Tailscale Export - ${pulumi.runtime.getStack()}`,
      tags: ["tailscale-export"],
      sections: pulumi.output(nodeState).apply((nodes) =>
        Object.fromEntries(
          nodes.map(
            (z) =>
              [
                z.name,
                {
                  fields: {
                    ip: { value: z.ip },
                    internalIp: { value: z.internalIp },
                    nodeType: { value: z.nodeType ?? "unknown" },
                  },
                },
              ] as const,
          ),
        ),
      ),
      fields: {
        name: { value: pulumi.runtime.getStack() },
        services: { value: services.join(",") },
      },
    },
    cro,
  );
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
  args: {
    advertiseTags: string[];
    acceptDns?: pulumi.Input<boolean>;
    acceptRoutes?: pulumi.Input<boolean>;
    ssh?: pulumi.Input<boolean>;
    advertiseExitNode?: pulumi.Input<boolean>;
    relayServerPort?: pulumi.Input<number>;
  };
}) {
  const deviceInfo = pulumi.all([options.name, options.ipAddress, options.args, pulumi.output(getTailscaleClient())]).apply(async ([name, ipAddress, args, client]) => {
    options.dependsOn = options.dependsOn ?? [];

    const depends = [];

    if (pulumi.runtime.isDryRun()) {
      return pulumi.unknown as ReturnType<typeof updateTailscaleDeviceInfo>;
    }

    const lxcConfig = new remote.Command(
      `${name}-lxc-tun`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct set ${options.vmId} --dev2 /dev/net/tun`,
      },
      { parent: options.parent, dependsOn: options.dependsOn },
    );

    const tailscaleArgs = pulumi.interpolate`--hostname=${name} --report-posture ${options.args.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${options.args.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
      options.args.ssh ? "--ssh" : "--ssh=false"
    } ${options.args.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} --accept-risk=lose-ssh`;

    if (options.installTailscale) {
      const installTailscale = new remote.Command(
        `${name}-tailscale-install`,
        {
          connection: options.connection,
          create: pulumi.interpolate`pct exec ${options.vmId} -- sh -lc 'curl -fsSL https://tailscale.com/install.sh | sh'`,
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
          triggers: [installTailscale.create, lxcConfig.create],
        },
        { parent: options.parent, dependsOn: [installTailscale] },
      );
      depends.push(installTailscale, restartLxc);

      // Step 2: Copy auth key to container
      const authKey = copyFileToRemote(`${name}-authkey`, {
        content: options.globals.tailscaleAuthKey.key,
        remotePath: "/tmp/authkey",
        connection: options.connection,
        parent: options.parent,
        dependsOn: options.dependsOn,
        triggers: [restartLxc.id],
      });

      const copyAuthKey = new remote.Command(
        `${name}-copy-authkey`,
        {
          connection: options.connection,
          create: pulumi.interpolate`pct push ${options.vmId} /tmp/authkey /tmp/authkey`,
          triggers: [authKey.id],
        },
        { parent: options.parent, dependsOn: [authKey, ...depends] },
      );
      depends.push(copyAuthKey);

      // Step 4: Run tailscale up with auth key
      const tailscaleUp = new remote.Command(
        `${name}-tailscale-up-lxc`,
        {
          connection: options.connection,
          create: pulumi.interpolate`pct exec ${options.vmId} -- tailscale up --auth-key=file:/tmp/authkey ${tailscaleArgs} --reset`,
        },
        { parent: options.parent, dependsOn: [...depends] },
      );
      depends.push(tailscaleUp);
    }

    // Step 5: Configure tailscale settings
    const tailscaleSet = new remote.Command(
      `${name}-tailscale-set-lxc`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct exec ${options.vmId} -- tailscale set ${options.args.relayServerPort ? pulumi.interpolate`--relay-server-port=${options.args.relayServerPort}` : ""} ${tailscaleArgs} --auto-update`,
        triggers: [],
      },
      { parent: options.parent, dependsOn: [...depends] },
    );
    depends.push(tailscaleSet);
    return updateTailscaleDeviceInfo(tailscaleSet.id, name, ipAddress, args.advertiseTags, client, options.globals, options.parent, depends);
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
      await client.POST("/device/{deviceId}/ip", { params: { path: { deviceId: deviceInfo.nodeId } }, body: { ipv4: ipAddress } });
    }
    await client.POST("/device/{deviceId}/key", { params: { path: { deviceId: deviceInfo.nodeId } }, body: { keyExpiryDisabled: true } });

    const resource = new DeviceTags(
      `${name}-device-tags`,
      {
        deviceId: deviceInfo.nodeId!,
        tags: tags,
      },
      { parent: parent, provider: globals.tailscaleProvider, dependsOn: dependsOn, retainOnDelete: true },
    );

    const tailscaleForwardingConfig = copyFileToRemote(`${name}-tailscale-forwarding-config`, {
      connection: { host: `${name}.${tailscaleDomain}`, user: "root" },
      remotePath: "/etc/sysctl.d/99-tailscale.conf",
      content: `net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
`,
      parent: parent,
    });

    const tailscaleForwarding = new remote.Command(
      `${name}-tailscale-forwarding`,
      {
        connection: { host: `${name}.${tailscaleDomain}`, user: "root" },
        create: "sysctl -p /etc/sysctl.d/99-tailscale.conf",
        triggers: [tailscaleForwardingConfig.id],
      },
      { parent: parent, dependsOn: [resource, tailscaleForwardingConfig] },
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
  const deviceInfo = pulumi.all([options.name, options.ipAddress, options.args, pulumi.output(getTailscaleClient())]).apply(async ([name, ipAddress, args, client]) => {
    options.dependsOn = options.dependsOn ?? [];

    const tailscaleArgs = pulumi.interpolate`--hostname=${name} --report-posture ${args.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${args.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
      args.ssh ? "--ssh" : "--ssh=false"
    } ${args.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} ${args.exitNodeAllowLanAccess ? "--exit-node-allow-lan-access" : "--exit-node-allow-lan-access=false"} --accept-risk=lose-ssh --advertise-routes="${args.advertiseRoutes.join(",")}"`;

    const tailscaleSet = new remote.Command(
      `${name}-tailscale-set`,
      {
        connection: options.connection,
        create: pulumi.interpolate`tailscale set ${args.relayServerPort ? pulumi.interpolate`--relay-server-port=${args.relayServerPort}` : ""} ${tailscaleArgs} --auto-update `,
        triggers: [],
        // environment: { TS_AUTHKEY: globals.tailscaleAuthKey.key },
      },
      { parent: options.parent, dependsOn: [] },
    );

    if (pulumi.runtime.isDryRun()) {
      return pulumi.output(pulumi.unknown) as unknown as paths["/tailnet/{tailnet}/devices"]["get"]["responses"]["200"]["content"]["application/json"];
    }

    return updateTailscaleDeviceInfo(tailscaleSet.id, name, ipAddress, args.advertiseTags, client, options.globals, options.parent, options.dependsOn);
  });

  return deviceInfo;
}

export function createPeerRelayRule(fwdIp: pulumi.Input<string>, globals: GlobalResources) {
  return pulumi.output(fwdIp).apply((ip) => {
    const ipDash = ip.replace(/\./g, "-");
    const relayPort = new random.RandomInteger(`tailscale-relay-port-${ipDash}`, { min: 40000, max: 60000 });
    const forwardPort = new random.RandomInteger(`tailscale-unifi-port-${ipDash}`, { min: 40000, max: 60000 });
    const portForward = new unifi.port.Forward(
      `tailscale-port-forward-${ipDash}`,
      {
        dstPort: forwardPort.result.apply((p) => p.toString()),
        portForwardInterface: "wan",
        protocol: "tcp_udp",
        srcIp: "any",
        fwdIp: fwdIp,
        fwdPort: relayPort.result.apply((p) => p.toString()),
      },
      { provider: globals.unifiProvider, dependsOn: [relayPort] },
    );
    return relayPort;
  });
}
