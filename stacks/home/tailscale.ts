import * as tailscale from "@pulumi/tailscale";
import * as pulumi from "@pulumi/pulumi";
import { TailscaleSelector, TailscaleSshUser, TailscaleTest, TailscaleTestSelector, PolicyFile } from "@openapi/tailscale-grants.js";
import { GlobalResources } from "@components/globals.ts";
import { Roles } from "@components/constants.ts";
import { applyAllEdits, autogroups, groups, ports, tag, TailscaleAclManager, TailscaleSshTestInputItem } from "./tailscale/manager.ts";
import { awaitOutput } from "@components/helpers.ts";
import * as parser from "jsonc-parser";

type TestsData = {
  taggedDevices: pulumi.Input<string>[];
  dockgeDevices: pulumi.Input<string>[];
  kubernetesDevices: pulumi.Input<string>[];
  proxmoxDevices: pulumi.Input<string>[];
};

type TestsDataPopulated = TestsData & {
  knownNormalUsers: pulumi.Input<string>[];
  knownAdminUsers: pulumi.Input<string>[];
};

export async function updateTailscaleAcls(args: {
  globals: GlobalResources;
  hosts: {
    idp: pulumi.Input<string>;
    "primary-dns": pulumi.Input<string>;
    "secondary-dns": pulumi.Input<string>;
    "unifi-dns": pulumi.Input<string>;
    [key: string]: pulumi.Input<string>;
  };
  tests: TestsData;
  dnsServers: pulumi.Input<string>[];
}) {
  const { tests } = await awaitOutput(pulumi.output(args));
  const tailscaleParent = new pulumi.ComponentResource("custom:tailscale:TailscaleAcls", "tailscale-acls", {});
  const cro = { parent: tailscaleParent, provider: args.globals.tailscaleProvider };
  const currentAcl = await tailscale.getAcl({ provider: args.globals.tailscaleProvider });
  let aclsJson = applyAllEdits(currentAcl.hujson, ["tagOwners"], {});
  aclsJson = applyAllEdits(aclsJson, ["grants"], []);
  aclsJson = applyAllEdits(aclsJson, ["tests"], []);
  aclsJson = applyAllEdits(aclsJson, ["ssh"], []);
  aclsJson = applyAllEdits(aclsJson, ["sshTests"], []);
  aclsJson = applyAllEdits(aclsJson, ["autoApprovers"], { exitNode: [], routes: {}, services: {} });

  const manager = new TailscaleAclManager(aclsJson, args.hosts, tests);
  const testData = manager.testData;
  Object.values(tag).forEach((t) => manager.setTagOwner(t));
  Object.values(groups).forEach((t) => manager.setGroup(t));

  configureProxmoxAccess(manager);
  configureDockgeAccess(manager);
  configureKubernetesAccess(manager);
  createGroupGrants(manager);

  manager.setGrant(
    "nut-exporter-access",
    {
      src: [tag.ssh],
      dst: ["alpha-site"],
      ip: ["tcp:3493", "udp:3493"],
    },
    { accept: [tag.ssh] }
  );

  manager.setGrant(
    "default-apps-access",
    {
      src: [autogroups.tagged, autogroups.member, tag.mediaDevice],
      dst: [tag.apps, tag.dockge],
      ip: ports.web,
    },
    { accept: testData.knownNormalUsers.concat(testData.taggedDevices) }
  );

  manager.setGrant(
    {
      src: [groups.admins, autogroups.admin],
      dst: [tag.proxmox, tag.dockge],
      ip: ports.ssh,
    },
    { accept: testData.knownAdminUsers }
  );

  manager.setSshRule(
    {
      src: [groups.admins, autogroups.admin],
      dst: [tag.proxmox, tag.dockge],
      users: ["root"],
      action: "check",
    },
    Object.fromEntries(manager.testData.knownAdminUsers.map((user) => [user, { check: [`root`] } as TailscaleSshTestInputItem] as const))
  );

  manager.setGrant(
    "default-dns",
    {
      src: [autogroups.tagged, autogroups.member, tag.mediaDevice],
      dst: ["primary-dns", "secondary-dns", "unifi-dns"],
      ip: ports.dns,
    },
    { accept: testData.knownNormalUsers.concat(testData.taggedDevices) }
  );

  manager.setGrant(
    {
      src: [autogroups.member, autogroups.tagged, tag.mediaDevice],
      dst: [tag.exitNode, autogroups.internet],
      ip: ["*"],
    },
    { accept: testData.knownNormalUsers.concat(testData.taggedDevices) }
  );

  manager.setGrant(
    {
      src: [autogroups.member, autogroups.tagged, tag.mediaDevice],
      dst: ["idp"],
      ip: ["tcp:443"],
    },
    { accept: testData.knownNormalUsers.concat(testData.taggedDevices) }
  );

  manager.setGrant(
    "member-drive-access",
    {
      src: [autogroups.member],
      dst: [autogroups.self],
      app: {
        "tailscale.com/cap/drive": [
          {
            access: "rw",
            shares: ["*"],
          },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "member-golink-defaults",
    {
      src: [autogroups.member],
      app: {
        "tailscale.com/cap/golink": [{ admin: true }],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "member-tsidp-defaults",
    {
      src: [autogroups.member, autogroups.tagged],
      app: {
        "tailscale.com/cap/tsidp": [
          {
            includeInUserInfo: true,

            // STS
            resources: ["*"],
            users: ["*"],

            extraClaims: {
              groups: [Roles.Users],
              entitlements: [Roles.Users],
            },
          },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "family-tsidp-defaults",
    {
      src: [groups.family],
      app: {
        "tailscale.com/cap/tsidp": [
          {
            extraClaims: {
              groups: [Roles.Family],
              entitlements: [Roles.Family],
            },
          },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "friends-tsidp-defaults",
    {
      src: [groups.friends],
      app: {
        "tailscale.com/cap/tsidp": [
          {
            extraClaims: {
              groups: [Roles.Friends],
              entitlements: [Roles.Friends],
            },
          },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "tsidp-admin",
    {
      src: [autogroups.admin, groups.admins],
      dst: ["idp"],
      app: {
        "tailscale.com/cap/tsidp": [
          {
            allow_admin_ui: true,
            allow_dcr: true,
            extraClaims: {
              entitlements: [Roles.Admins],
              groups: [Roles.Admins],
            },
            includeInUserInfo: true,
          },
        ],
      },
    },
    { accept: [groups.admins] }
  );

  manager.setGrant(
    "tsidp-egress",
    {
      src: [tag.egress],
      dst: ["idp"],
      app: {
        "tailscale.com/cap/tsidp": [
          {
            allow_admin_ui: true,
            allow_dcr: true,
          },
        ],
      },
    },
    { accept: [tag.egress] }
  );

  const json = await manager.getJson();
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

function configureProxmoxAccess(manager: TailscaleAclManager) {
  const testData = manager.testData;
  manager.setTagOwner(tag.proxmox, [tag.apps, tag.exitNode, tag.dockge]);
  manager.setExitNode(tag.proxmox);
  manager.setRoute("10.10.0.0/16", [tag.proxmox]);

  manager.setGrant({ src: [tag.proxmox], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmox] }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement] }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [tag.observability], ip: ports.any }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [autogroups.internet], ip: ports.any }, { accept: [tag.proxmox] });

  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.proxmoxDevices.map((z) => [z, { accept: [`root`] }] as const))
  );
  manager.setSshRule({ src: [tag.proxmox], dst: [tag.dockge, tag.proxmox], users: ["root"], action: "accept" }, rules);
}

function configureDockgeAccess(manager: TailscaleAclManager) {
  const testData = manager.testData;
  manager.setTagOwner(tag.dockge, [tag.apps]);
  manager.setExitNode(tag.dockge);

  manager.setService(tag.apps, [tag.dockge]);

  manager.setGrant({ src: [tag.dockge], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmox] }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.dockge], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement] }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [autogroups.member, autogroups.tagged], dst: [tag.dockge], ip: ports.web }, { accept: testData.knownNormalUsers.concat(testData.knownAdminUsers) });
  manager.setGrant({ src: [tag.dockge], dst: [tag.observability], ip: ports.any }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.dockge], dst: [autogroups.internet], ip: ports.any }, { accept: [tag.dockge] });

  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.dockgeDevices.map((z) => [z, { accept: [`root`] }] as const))
  );
  manager.setSshRule({ src: [tag.dockge], dst: [tag.dockge, tag.proxmox], users: ["root"], action: "accept" }, rules);
}

function configureKubernetesAccess(manager: TailscaleAclManager) {
  const testData = manager.testData;
  const clusterTags = [tag.sgc, tag.equestria];

  manager.setTagOwner(tag.operator, [...clusterTags, tag.ingress, tag.egress, tag.apps, tag.observability, tag.exitNode, tag.recorder, tag.ssh, tag.k8s]);
  manager.setTagOwner(tag.ingress, [tag.apps, tag.observability]);

  manager.setExitNode(tag.sgc);
  manager.setExitNode(tag.equestria);

  manager.setService(tag.apps, [...clusterTags, tag.operator, tag.ingress]);
  manager.setService(tag.observability, [...clusterTags, tag.operator, tag.ingress]);

  manager.setRoute("10.10.0.0/16", [tag.sgc, tag.equestria]);
  manager.setRoute("10.196.0.0/16", [tag.equestria]);
  manager.setRoute("10.206.0.0/16", [tag.equestria]);
  manager.setRoute("10.199.0.0/16", [tag.sgc]);
  manager.setRoute("10.209.0.0/16", [tag.sgc]);

  manager.setGrant({ src: [groups.admins], dst: [tag.k8s], ip: ports.web, app: { "tailscale.com/cap/kubernetes": [{ impersonate: { groups: ["system:masters"] } }] } }, { accept: [groups.admins] });
  manager.setGrant(
    { src: [groups.family, groups.friends], dst: [tag.k8s], ip: ports.web, app: { "tailscale.com/cap/kubernetes": [{ impersonate: { groups: ["tailnet-readers"] } }] } },
    { accept: [groups.family, groups.friends] }
  );
  manager.setGrant({ src: [...clusterTags, tag.egress], dst: [...clusterTags, tag.ingress], ip: ports.ssh }, { accept: [...clusterTags, tag.egress], deny: testData.knownNormalUsers });
  manager.setGrant(
    { src: [autogroups.member, autogroups.tagged, ...clusterTags, tag.egress], dst: [...clusterTags, tag.ingress], ip: ports.web },
    { accept: [...clusterTags, tag.egress, ...testData.knownNormalUsers, ...testData.knownAdminUsers] }
  );
  manager.setGrant({ src: [...clusterTags, tag.egress], dst: [tag.observability], ip: ports.any }, { accept: [...clusterTags, tag.egress], deny: testData.knownNormalUsers });
  manager.setGrant({ src: clusterTags, dst: [autogroups.internet], ip: ports.any }, { accept: clusterTags });

  manager.setGrant({ src: [tag.ssh], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement] }, { accept: [tag.ssh], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.ssh], dst: [tag.dockge, tag.proxmox], ip: ports.ssh }, { accept: [tag.ssh], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.observability], dst: [tag.observability], ip: ports.observability }, { accept: [tag.observability], deny: testData.knownNormalUsers });

  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.knownAdminUsers.map((z) => [z, { check: [`root`] }] as const))
  );
  manager.setSshRule({ src: [tag.ssh], dst: [tag.dockge, tag.proxmox], users: ["root"], action: "accept" }, rules);
}

function createGroupGrants(manager: TailscaleAclManager) {
  for (const role of Object.values(Roles).filter((z) => z !== Roles.Users && z !== Roles.Editors)) {
    manager.setGrant(
      `tsidp-${role}-access`,
      {
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
      },
      { accept: [] }
    );
  }
}
