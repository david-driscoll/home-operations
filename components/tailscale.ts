import { OPClient } from "./op.ts";
import { readFile } from "fs/promises";
import type { paths } from "../types/tailscale.ts";
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
import { copyFileToRemote } from "./helpers.ts";

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

export function installTailscaleLxc({
  connection,
  name,
  parent,
  tailscaleName,
  vmId,
  globals,
  dependsOn,
  args = { acceptDns: true, acceptRoutes: true, ssh: true },
}: {
  connection: types.input.remote.ConnectionArgs;
  globals: GlobalResources;
  name: string;
  tailscaleName: pulumi.Input<string>;
  parent: pulumi.Resource;
  dependsOn?: pulumi.Resource[];
  vmId: pulumi.Input<number>;
  args?: {
    acceptDns?: boolean;
    acceptRoutes?: boolean;
    ssh?: boolean;
    advertiseExitNode?: boolean;
  };
}) {
  dependsOn = dependsOn ?? [];
  const authKey = copyFileToRemote(`${name}-authkey`, {
    content: globals.tailscaleAuthKey.key,
    remotePath: "/tmp/authkey",
    connection: connection,
    parent,
  });
  const ensureRunning = new remote.Command(
    `${name}-ensure-running`,
    {
      connection,
      create: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1; then if ! pct status ${vmId} | grep -q running; then pct start ${vmId} && sleep 5; else echo "CT ${vmId} already running"; fi; else echo "Skipping start until CT ${vmId} exists"; fi`,
      update: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1; then if ! pct status ${vmId} | grep -q running; then pct start ${vmId} && sleep 5; else echo "CT ${vmId} already running"; fi; else echo "Skipping start until CT ${vmId} exists"; fi`,
    },
    { parent, dependsOn: [authKey, ...dependsOn] },
  );
  const copyAuthKey = new remote.Command(
    `${name}-copy-authkey`,
    {
      connection,
      create: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then pct push ${vmId} /tmp/authkey /tmp/authkey; else echo "Skipping authkey copy until CT ${vmId} is running"; fi`,
      update: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then pct push ${vmId} /tmp/authkey /tmp/authkey; else echo "Skipping authkey copy until CT ${vmId} is running"; fi`,
    },
    { parent, dependsOn: [ensureRunning] },
  );
  const tailscaleArgs = pulumi.interpolate`--auth-key=file:/tmp/authkey --hostname=${tailscaleName} ${args.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${args.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
    args.ssh ? "--ssh" : "--ssh=false"
  } ${args.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} --accept-risk=lose-ssh`;

  const installTailscale = new remote.Command(
    `${name}-tailscale-install`,
    {
      connection,
      create: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then TERM=xterm CT_ID=${vmId} bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/tools/addon/add-tailscale-lxc.sh)"; else echo "Skipping Tailscale install until CT ${vmId} is running"; fi`,
      update: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then TERM=xterm CT_ID=${vmId} bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/tools/addon/add-tailscale-lxc.sh)"; else echo "Skipping Tailscale install until CT ${vmId} is running"; fi`,
    },
    { parent, dependsOn: [copyAuthKey] },
  );

  // Set Tailscale configuration
  const tailscaleUp = new remote.Command(
    `${name}-tailscale-up`,
    {
      connection,
      create: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then pct exec ${vmId} -- tailscale up ${tailscaleArgs} --reset; else echo "Skipping Tailscale up until CT ${vmId} is running"; fi`,
      update: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then pct exec ${vmId} -- tailscale up ${tailscaleArgs} --reset; else echo "Skipping Tailscale up until CT ${vmId} is running"; fi`,
      triggers: [installTailscale.id],
    },
    { parent, dependsOn: [installTailscale] },
  );

  const tailscaleSet = new remote.Command(
    `${name}-tailscale-set`,
    {
      connection,
      create: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then pct exec ${vmId} -- tailscale set --auto-update; else echo "Skipping Tailscale set until CT ${vmId} is running"; fi`,
      update: pulumi.interpolate`if pct config ${vmId} >/dev/null 2>&1 && pct status ${vmId} | grep -q running; then pct exec ${vmId} -- tailscale set --auto-update; else echo "Skipping Tailscale set until CT ${vmId} is running"; fi`,
      triggers: [installTailscale.id, tailscaleUp.id],
    },
    { parent, dependsOn: [tailscaleUp, installTailscale] },
  );
  return tailscaleSet;
}

export function updateTailscaleProxmox({
  connection,
  name,
  parent,
  tailscaleName,
  globals,
  dependsOn,
  args = { acceptDns: false, acceptRoutes: true, ssh: true },
}: {
  connection: types.input.remote.ConnectionArgs;
  globals: GlobalResources;
  name: string;
  tailscaleName: pulumi.Input<string>;
  parent: pulumi.Resource;
  dependsOn?: pulumi.Resource[];
  args?: {
    acceptDns?: pulumi.Input<boolean>;
    acceptRoutes?: pulumi.Input<boolean>;
    ssh?: pulumi.Input<boolean>;
    advertiseExitNode?: pulumi.Input<boolean>;
    relayServerPort?: pulumi.Input<number>;
  };
}) {
  const tailscaleArgs = pulumi.interpolate`--hostname=${tailscaleName} ${args.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${args.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
    args.ssh ? "--ssh" : "--ssh=false"
  } ${args.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"} ${args.relayServerPort ? `--relay-server-port=${args.relayServerPort}` : ""} --accept-risk=lose-ssh`;

  // Set Tailscale configuration
  const tailscaleUp = new remote.Command(
    `${name}-tailscale-set`,
    {
      connection,
      create: pulumi.interpolate`tailscale set ${tailscaleArgs} --auto-update`,
      triggers: [],
      // environment: { TS_AUTHKEY: globals.tailscaleAuthKey.key },
    },
    { parent, dependsOn: dependsOn ?? [] },
  );

  return tailscaleUp;
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
