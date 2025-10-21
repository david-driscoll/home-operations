import * as tailscale from "@pulumi/tailscale";
import * as pulumi from "@pulumi/pulumi";
import { TailscalePolicyFile } from "@openapi/tailscale-grants.js";
import * as parser from "jsonc-parser";
import { Tailscale } from "@components/constants.ts";
import { GlobalResources } from "@components/globals.ts";

export async function updateTailscaleAcls(args: { globals: GlobalResources; hosts: { [key: string]: pulumi.Input<string> }; dnsServers: pulumi.Input<string>[] }) {
  const currentAcl = await tailscale.getAcl({ provider: args.globals.tailscaleProvider });

  let json = pulumi.output(currentAcl.hujson);
  json = Object.entries(Tailscale.tagOwners).reduce((acc, [key, value]) => applyAllEdits(acc, ["tagOwners", key], value), json);
  json = Object.entries(Tailscale.autoApprovers).reduce((acc, [key, value]) => applyAllEdits(acc, ["autoApprovers", key], value), json);
  json = Object.entries(args.hosts).reduce((acc, [key, value]) => applyAllEdits(acc, ["hosts", key], value), json);

  new tailscale.Acl(
    "acl",
    {
      acl: json,
      overwriteExistingContent: true,
    },
    { provider: args.globals.tailscaleProvider }
  );

  new tailscale.DnsNameservers("dns-nameservers", { nameservers: args.dnsServers }, { provider: args.globals.tailscaleProvider });
  new tailscale.DnsSearchPaths("dns-search-paths", { searchPaths: [args.globals.searchDomain] }, { provider: args.globals.tailscaleProvider });
}

function applyAllEdits(json: pulumi.Output<string>, path: string[], value: pulumi.Input<any>): pulumi.Output<string> {
  return pulumi.all([json, value]).apply(([innerJson, innerValue]) => {
    const result = parser.modify(innerJson, path, innerValue, { formattingOptions: { insertSpaces: true } });
    // console.log(result);
    return parser.applyEdits(innerJson, result);
  });
}
