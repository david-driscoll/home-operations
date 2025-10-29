import * as tailscale from "@pulumi/tailscale";
import * as pulumi from "@pulumi/pulumi";
import { TailscaleAutoApprovers, TailscalePolicyFile, TailscaleSelector, TailscaleTagOwners } from "@openapi/tailscale-grants.js";
import * as parser from "jsonc-parser";
import { GlobalResources } from "@components/globals.ts";

const tags = {
  sgc: "tag:sgc" as TailscaleSelector,
  equestria: "tag:equestria" as TailscaleSelector,
  operator: "tag:operator" as TailscaleSelector,
  proxmox: "tag:proxmox" as TailscaleSelector,
  dockge: "tag:dockge" as TailscaleSelector,
  apps: "tag:apps" as TailscaleSelector,
  egress: "tag:egress" as TailscaleSelector,
  ingress: "tag:ingress" as TailscaleSelector,
  ssh: "tag:ssh" as TailscaleSelector,
};

const tagOwners: TailscaleTagOwners = {
  [tags.proxmox]: [tags.proxmox],
  [tags.operator]: [tags.operator],
  [tags.sgc]: [tags.operator],
  [tags.equestria]: [tags.operator],
  [tags.ingress]: [tags.operator],
  [tags.egress]: [tags.operator],
  [tags.apps]: [tags.operator, tags.proxmox, tags.dockge, tags.ingress],
  // Devices that really don't need much network access, except to things like plex.
  "tag:media-device": [],
  "tag:exit-node": [tags.operator, tags.proxmox],
  "tag:recorder": [tags.operator],
  [tags.dockge]: [tags.proxmox],
  "tag:automation-agent": [],
  [tags.ssh]: [tags.operator],
};

const autoApprovers: TailscaleAutoApprovers = {
  exitNode: [tags.operator, tags.proxmox, tags.sgc, tags.equestria, tags.dockge],

  // todo:
  routes: {
    "10.10.0.0/16": [tags.sgc, tags.equestria],
    "10.196.0.0/16": [tags.equestria],
    "10.206.0.0/16": [tags.equestria],
    "10.199.0.0/16": [tags.sgc],
    "10.209.0.0/16": [tags.sgc],
  },

  services: {
    // "tag:ingress": [tags.apps, tags.sgc, tags.equestria, tags.operator],
    // "tag:egress": [tags.apps, tags.sgc, tags.equestria, tags.operator],
    // "tag:ssh": [tags.sgc, tags.equestria, tags.operator],
    "tag:apps": [tags.sgc, tags.equestria, tags.operator, tags.ingress],
  },
};

export async function updateTailscaleAcls(args: { globals: GlobalResources; hosts: { [key: string]: pulumi.Input<string> }; dnsServers: pulumi.Input<string>[] }) {
  const tailscaleParent = new pulumi.ComponentResource("custom:tailscale:TailscaleAcls", "tailscale-acls", {});
  const cro = { parent: tailscaleParent, provider: args.globals.tailscaleProvider };
  const currentAcl = await tailscale.getAcl({ provider: args.globals.tailscaleProvider });

  let json = pulumi.output(currentAcl.hujson);
  json = Object.entries(tagOwners).reduce((acc, [key, value]) => applyAllEdits(acc, ["tagOwners", key], value), json);
  json = Object.entries(autoApprovers).reduce((acc, [key, value]) => applyAllEdits(acc, ["autoApprovers", key], value), json);
  json = Object.entries(args.hosts).reduce((acc, [key, value]) => applyAllEdits(acc, ["hosts", key], value), json);

  new tailscale.Acl(
    "acl",
    {
      acl: json,
      overwriteExistingContent: true,
    },
    cro
  );

  new tailscale.DnsNameservers("dns-nameservers", { nameservers: args.dnsServers }, cro);
  // new tailscale.DnsSearchPaths("dns-search-paths", { searchPaths: [args.globals.searchDomain] }, { provider: args.globals.tailscaleProvider });
}

function applyAllEdits(json: pulumi.Output<string>, path: string[], value: pulumi.Input<any>): pulumi.Output<string> {
  return pulumi.all([json, value]).apply(([innerJson, innerValue]) => {
    const result = parser.modify(innerJson, path, innerValue, { formattingOptions: { insertSpaces: true } });
    // console.log(result);
    return parser.applyEdits(innerJson, result);
  });
}
