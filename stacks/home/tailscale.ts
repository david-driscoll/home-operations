import * as tailscale from "@pulumi/tailscale";
import * as pulumi from "@pulumi/pulumi";
import { TailscaleAutoApprovers, TailscaleGrant, TailscalePolicyFile, TailscaleSelector, TailscaleTagOwners } from "@openapi/tailscale-grants.js";
import * as parser from "jsonc-parser";
import { GlobalResources } from "@components/globals.ts";
import { Groups, Roles } from "@components/constants.ts";

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
  metrics: "tag:metrics" as TailscaleSelector,
};

const tagOwners: TailscaleTagOwners = {
  [tags.proxmox]: [tags.proxmox],
  [tags.operator]: [tags.operator],
  [tags.sgc]: [tags.operator],
  [tags.equestria]: [tags.operator],
  [tags.ingress]: [tags.operator],
  [tags.egress]: [tags.operator],
  [tags.apps]: [tags.operator, tags.proxmox, tags.dockge, tags.ingress],
  [tags.metrics]: [tags.operator, tags.proxmox, tags.dockge, tags.ingress],
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
    "tag:apps": [tags.sgc, tags.equestria, tags.operator, tags.ingress, tags.dockge],
  },
};

class TailscaleAclManager {
  policy: Required<TailscalePolicyFile>;
  tree: parser.Node;
  acls: pulumi.Output<string>;
  constructor(acls: string, hosts: { [key: string]: pulumi.Input<string> }) {
    this.policy = {
      autoApprovers: {},
      tagOwners: {},
      groups: {},
      hosts: {},
      grants: [],
      ssh: [],
      tests: [],
      nodeAttrs: [],
      postures: {},
      sshTests: [],
      ...(parser.parse(acls) as TailscalePolicyFile),
    };
    this.tree = parser.parseTree(acls)!;
    this.acls = pulumi.output(acls);
    this.acls = Object.entries(tagOwners).reduce((acc, [key, value]) => applyAllEdits(acc, ["tagOwners", key], value), this.acls);
    this.acls = Object.entries(autoApprovers).reduce((acc, [key, value]) => applyAllEdits(acc, ["autoApprovers", key], value), this.acls);
    this.acls = Object.entries(hosts).reduce((acc, [key, value]) => applyAllEdits(acc, ["hosts", key], value), this.acls);
    // parser.findNodeAtLocation
  }

  public getGrant(name: string) {
    // grants
    const index = this.policy.grants.findIndex((g) => g.app?.["driscoll.dev/name"]?.[0] === name);
    if (index === -1) {
      return null;
    }
    // const node = parser.findNodeAtLocation(this.tree, ["grants", index]);
    return this.policy.grants[index];
  }

  public setGrant(name: string, grant: pulumi.Input<TailscaleGrant>) {
    const index = this.policy.grants.findIndex((g) => g.app?.["driscoll.dev/name"]?.[0] === name);
    this.acls = pulumi.all([grant, this.acls]).apply(([grant, acls]) => {
      grant.app ??= {};
      grant.app["driscoll.dev/name"] = [name];
      return index === -1
        ? parser.applyEdits(acls, parser.modify(acls, ["grants", this.policy.grants.length], grant, { formattingOptions: { insertSpaces: true } }))
        : parser.applyEdits(acls, parser.modify(acls, ["grants", index], grant, { formattingOptions: { insertSpaces: true } }));
    });
  }

  public getJson() {
    return this.acls;
  }
}

export async function updateTailscaleAcls(args: {
  globals: GlobalResources;
  hosts: {
    idp: pulumi.Input<string>;
    "primary-dns": pulumi.Input<string>;
    "secondary-dns": pulumi.Input<string>;
    "unifi-dns": pulumi.Input<string>;
    [key: string]: pulumi.Input<string>;
  };
  dnsServers: pulumi.Input<string>[];
}) {
  const tailscaleParent = new pulumi.ComponentResource("custom:tailscale:TailscaleAcls", "tailscale-acls", {});
  const cro = { parent: tailscaleParent, provider: args.globals.tailscaleProvider };
  const currentAcl = await tailscale.getAcl({ provider: args.globals.tailscaleProvider });

  const defaultAccess: TailscaleSelector[] = ["tag:apps", "primary-dns", "secondary-dns", "unifi-dns"];

  const manager = new TailscaleAclManager(currentAcl.hujson, args.hosts);

  manager.setGrant("member-internal-access", {
    src: ["autogroup:member"],
    dst: ["autogroup:internet", "tag:exit-node", ...defaultAccess],
    ip: ["*"],
  });
  manager.setGrant("member-drive-access", {
    src: ["autogroup:member"],
    dst: ["autogroup:self"],
    app: {
      "tailscale.com/cap/drive": [
        {
          access: "rw",
          shares: ["*"],
        },
      ],
    },
  });
  manager.setGrant("media-device-access", {
    src: ["tag:media-device"],
    dst: defaultAccess,
    ip: ["*"],
  });
  manager.setGrant("idp-access", {
    src: ["*"],
    dst: ["idp"],
    ip: ["tcp:443"],
  });
  manager.setGrant("media-device-access-old", {
    src: ["group:family", "group:friends", "tag:media-device", "tag:exit-node", "tag:egress", "tag:proxmox"],
    dst: ["tag:ingress", "tag:sgc", "tag:equestria", "tag:dockge", "tag:apps", "idp", "primary-dns", "unifi-dns"],
    ip: ["*"],
  });
  manager.setGrant("ssh-access", {
    src: ["group:admins"],
    dst: ["tag:proxmox", "tag:dockge", "tag:sgc", "tag:equestria", "tag:ingress"],
    ip: ["*"],
  });
  manager.setGrant("dockge-internal-access", {
    src: ["tag:ssh", "tag:proxmox"],
    dst: ["tag:proxmox", "tag:dockge"],
    ip: ["*"],
  });
  manager.setGrant("dockge-access", {
    src: ["tag:dockge"],
    dst: ["tag:dockge"],
    ip: ["*"],
  });
  manager.setGrant("sgc-equestria-access", {
    src: ["tag:ssh", "tag:egress", "tag:sgc", "tag:equestria", "tag:dockge", "tag:exit-node"],
    dst: ["tag:ingress", "tag:dockge", "tag:sgc", "tag:equestria"],
    ip: ["tcp:*"],
  });
  manager.setGrant("tsidp-access", {
    src: ["group:admins"],
    dst: ["*"],
    app: {
      "tailscale.com/cap/tsidp": [
        {
          allow_admin_ui: true,
          allow_dcr: true,

          extraClaims: {
            entitlements: ["admins"],
            groups: ["admins"],
          },

          includeInUserInfo: true,
        },
      ],
    },
  });
  manager.setGrant("member-golink-defaults", {
    src: ["autogroup:member"],
    app: {
      "tailscale.com/cap/golink": [{ admin: true }],
    },
  });
  manager.setGrant("egress-tsidp-access", {
    src: ["tag:egress"],
    dst: ["*"],
    app: {
      "tailscale.com/cap/tsidp": [
        {
          allow_admin_ui: true,
          allow_dcr: true,
        },
      ],
    },
  });
  createGroupGrants(manager);
  // manager.setGrant("internet-access", {
  //   src: ["tag:sgc", "tag:equestria", "tag:proxmox", "tag:egress", "tag:ssh"],

  //   dst: ["autogroup:internet"],
  //   ip: ["*"],
  // });
  new tailscale.Acl(
    "acl",
    {
      acl: currentAcl.hujson, // temp
      overwriteExistingContent: true,
    },
    cro
  );

  new tailscale.DnsNameservers("dns-nameservers", { nameservers: args.dnsServers }, cro);
  // new tailscale.DnsSearchPaths("dns-search-paths", { searchPaths: [args.globals.searchDomain] }, { provider: args.globals.tailscaleProvider });
}

function createGroupGrants(manager: TailscaleAclManager) {
  for (const role of Object.values(Roles)) {
    manager.setGrant(`tsidp-${role}-access`, {
      src: [`group:${role}`],
      dst: ["*"],

      app: {
        "tailscale.com/cap/tsidp": [
          {
            includeInUserInfo: true,

            extraClaims: {
              groups: [role],
              entitlements: [role],
            },
          },
        ],
      },
    });
  }
}

function applyAllEdits(json: pulumi.Output<string>, path: string[], value: pulumi.Input<any>): pulumi.Output<string> {
  return pulumi.all([json, value]).apply(([innerJson, innerValue]) => {
    const result = parser.modify(innerJson, path, innerValue, { formattingOptions: { insertSpaces: true } });
    // console.log(result);
    return parser.applyEdits(innerJson, result);
  });
}
