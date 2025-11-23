import { OPClient } from "./op.ts";
import { readFile } from "fs/promises";
import type { Client } from "../types/tailscale.ts";
import { OpenAPIClientAxios } from "openapi-client-axios";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { GlobalResources } from "./globals.ts";
import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tailscaleCredential = await new OPClient().getItemByTitle("Tailscale Terraform OAuth Client");
const specFilename = path.join(__dirname, "tailscale.json");
const spec = await readFile(specFilename, "utf-8");

export const client = new OpenAPIClientAxios({
  definition: JSON.parse(spec),
  axiosConfigDefaults: {
    params: { tailnet: "-" },
    headers: {},
  },
});
export const tailscale = await client.init<Client>();

await axios
  .post(
    "https://api.tailscale.com/api/v2/oauth/token",
    axios.toFormData({
      client_id: tailscaleCredential.fields["username"].value!,
      client_secret: tailscaleCredential.fields["credential"].value!,
      grant_type: "client_credentials",
    })
  )
  .then((response) => {
    tailscale.defaults.headers["Authorization"] = `Bearer ${response.data.access_token}`;
  });

export function installTailscale({
  connection,
  name,
  parent,
  tailscaleName,
  globals,
  args = { acceptDns: true, acceptRoutes: true, ssh: true },
}: {
  connection: types.input.remote.ConnectionArgs;
  globals: GlobalResources;
  name: string;
  tailscaleName: pulumi.Output<string>;
  parent: pulumi.Resource;
  args?: {
    acceptDns?: boolean;
    acceptRoutes?: boolean;
    ssh?: boolean;
    advertiseExitNode?: boolean;
  };
}) {
  // const sshConfig = new remote.Command(
  //   `${name}-ssh-config`,
  //   {
  //     connection,
  //     create: pulumi.interpolate`mkdir -p /etc/ssh/sshd_config.d/ && echo 'AcceptEnv TS_AUTHKEY' > /etc/ssh/sshd_config.d/99-tailscale.conf && systemctl restart sshd`,
  //   },
  //   { parent, dependsOn: [] }
  // );

  const installTailscale = new remote.Command(
    `${name}-tailscale-install`,
    {
      connection,
      create: pulumi.interpolate`curl -fsSL https://tailscale.com/install.sh | sh`,
    },
    { parent, dependsOn: [] }
  );

  const tailscaleArgs = pulumi.interpolate`--hostname=${tailscaleName} ${args.acceptDns ? "--accept-dns" : "--accept-dns=false"} ${args.acceptRoutes ? "--accept-routes" : "--accept-routes=false"} ${
    args.ssh ? "--ssh" : "--ssh=false"
  } ${args.advertiseExitNode ? "--advertise-exit-node" : "--advertise-exit-node=false"}   --accept-risk=lose-ssh`;

  // Set Tailscale configuration
  const tailscaleUp = new remote.Command(
    `${name}-tailscale-up`,
    {
      connection,
      create: pulumi.interpolate`tailscale up ${tailscaleArgs} --reset`,
      triggers: [installTailscale.id],
      environment: { TS_AUTHKEY: globals.tailscaleAuthKey.key },
    },
    { parent, dependsOn: [installTailscale] }
  );

  const tailscaleSet = new remote.Command(
    `${name}-tailscale-set`,
    {
      connection,
      create: pulumi.interpolate`tailscale set ${tailscaleArgs} --auto-update `,
      triggers: [installTailscale.id, tailscaleUp.id],
      environment: { TS_AUTHKEY: globals.tailscaleAuthKey.key },
    },
    { parent, dependsOn: [tailscaleUp, installTailscale] }
  );
  return tailscaleSet;
}
