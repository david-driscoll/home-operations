import { OPClient } from "./op.ts";
import { readFile } from "fs/promises";
import type { components, paths } from "../types/tailscale.ts";
import createClient, { Client } from "openapi-fetch";
import path, { dirname } from "path";
import * as unifi from "@pulumiverse/unifi";
import * as random from "@pulumi/random";
import { fileURLToPath } from "url";
import axios from "axios";
import { GlobalResources } from "./globals.ts";
import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { ClientCredentials } from "simple-oauth2";
import { awaitOutput, copyFileToRemote } from "./helpers.ts";
import { output } from "sdks/pbs/bin/types/index.js";
import { Tailscale } from "./constants.ts";

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

/** Community-scripts add-tailscale-lxc.sh URL */
const ADD_TAILSCALE_LXC_URL = "https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/tools/addon/add-tailscale-lxc.sh";

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
  ipAddress: pulumi.Input<string>;
  parent: pulumi.Resource;
  dependsOn?: pulumi.Resource[];
  vmId: pulumi.Input<number>;
  args?: {
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

    // Step 2: Copy auth key to container
    const authKey = copyFileToRemote(`${name}-auth-key`, {
      content: options.globals.tailscaleAuthKey.key,
      remotePath: "/tmp/authkey",
      connection: options.connection,
      parent: options.parent,
    });

    const copyAuthKey = new remote.Command(
      `${name}-copy-auth-key`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct push ${options.vmId} /tmp/authkey /tmp/authkey`,
      },
      { parent: options.parent, dependsOn: [authKey] },
    );

    const installTailscale = new remote.Command(
      `${name}-tailscale-install`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct exec ${options.vmId} -- curl -fsSL https://tailscale.com/install.sh | sh`,
      },
      { parent: options.parent, dependsOn: [copyAuthKey] },
    );
    // restart lxc
    const restartLxc = new remote.Command(
      `${name}-restart-lxc`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct reboot ${options.vmId}`,
        update: "echo 0",
        triggers: [installTailscale.id],
      },
      { parent: options.parent, dependsOn: [installTailscale] },
    );

    const tailscaleArgs = pulumi.interpolate`--hostname=${name} --report-posture ${options.args?.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${options.args?.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
      options.args?.ssh ? "--ssh" : "--ssh=false"
    } ${options.args?.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} --accept-risk=lose-ssh`;

    // Step 4: Run tailscale up with auth key
    const tailscaleUp = new remote.Command(
      `${name}-tailscale-up-lxc`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct exec ${options.vmId} -- tailscale up --auth-key=file:/tmp/authkey ${tailscaleArgs} --reset`,
        triggers: [installTailscale.id, authKey.id, copyAuthKey.id],
      },
      { parent: options.parent, dependsOn: [restartLxc, copyAuthKey] },
    );

    // Step 5: Configure tailscale settings
    const tailscaleSet = new remote.Command(
      `${name}-tailscale-set-lxc`,
      {
        connection: options.connection,
        create: pulumi.interpolate`pct exec ${options.vmId} -- tailscale set ${options.args?.relayServerPort ? pulumi.interpolate`--relay-server-port=${options.args.relayServerPort}` : ""} ${tailscaleArgs} --auto-update`,
        triggers: [installTailscale.id, authKey.id, copyAuthKey.id, tailscaleUp.id],
      },
      { parent: options.parent, dependsOn: [copyAuthKey, tailscaleUp] },
    );

    if (pulumi.runtime.isDryRun()) {
      return pulumi.output(pulumi.unknown) as components["schemas"]["Device"];
    }

    await awaitOutput(tailscaleSet.id);

    const devices = await client.GET("/tailnet/{tailnet}/devices", { params: { path: { tailnet: "-" }, query: { fields: "all", hostname: options.name } } });
    const result = devices.data?.devices?.[0];
    if (!result) {
      throw new Error(`Device with hostname ${name} not found in Tailscale`);
    }
    await client.POST("/device/{deviceId}/ip", { params: { path: { deviceId: result.nodeId! } }, body: { ipv4: ipAddress } });
    await client.POST("/device/{deviceId}/key", { params: { path: { deviceId: result.nodeId! } }, body: { keyExpiryDisabled: true } });
    await client.POST("/device/{deviceId}/tags", { params: { path: { deviceId: result.nodeId! } }, body: { add: args?.advertiseTags ?? [] } });

    return result;
  });

  return deviceInfo;
}

export function updateTailscaleProxmox(options: {
  connection: types.input.remote.ConnectionArgs;
  globals: GlobalResources;
  name: pulumi.Input<string>;
  ipAddress: pulumi.Input<string>;
  parent: pulumi.Resource;
  dependsOn?: pulumi.Resource[];
  args?: {
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

    const tailscaleArgs = pulumi.interpolate`--hostname=${name} --report-posture ${args?.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${args?.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
      args?.ssh ? "--ssh" : "--ssh=false"
    } ${args?.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} --accept-risk=lose-ssh`;

    const tailscaleSet = new remote.Command(
      `${name}-tailscale-set`,
      {
        connection: options.connection,
        create: pulumi.interpolate`tailscale set ${args?.relayServerPort ? pulumi.interpolate`--relay-server-port=${args.relayServerPort}` : ""} ${tailscaleArgs} --auto-update `,
        triggers: [],
        // environment: { TS_AUTHKEY: globals.tailscaleAuthKey.key },
      },
      { parent: options.parent, dependsOn: [] },
    );

    if (pulumi.runtime.isDryRun()) {
      return pulumi.output(pulumi.unknown) as unknown as paths["/tailnet/{tailnet}/devices"]["get"]["responses"]["200"]["content"]["application/json"];
    }

    await awaitOutput(tailscaleSet.id);

    const devices = await client.GET("/tailnet/{tailnet}/devices", { params: { path: { tailnet: "-" }, query: { fields: "all", hostname: name } } });
    const result = devices.data?.devices?.[0];
    if (!result) {
      throw new Error(`Device with hostname ${name} not found in Tailscale`);
    }
    await client.POST("/device/{deviceId}/ip", { params: { path: { deviceId: result.nodeId! } }, body: { ipv4: ipAddress } });
    await client.POST("/device/{deviceId}/key", { params: { path: { deviceId: result.nodeId! } }, body: { keyExpiryDisabled: true } });
    await client.POST("/device/{deviceId}/tags", { params: { path: { deviceId: result.nodeId! } }, body: { add: args?.advertiseTags ?? [] } });

    return result;
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
        portForwardInterface: "both",
        protocol: "udp",
        srcIp: "any",
        fwdIp: fwdIp,
        fwdPort: relayPort.result.apply((p) => p.toString()),
      },
      { provider: globals.unifiProvider, dependsOn: [relayPort] },
    );
    return relayPort;
  });
}
