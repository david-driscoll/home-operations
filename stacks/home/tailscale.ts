import * as tailscale from "@pulumi/tailscale";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "@components/globals.ts";
import { Roles } from "@components/constants.ts";
import { applyAllEdits, autogroups, groups, ports, subnets, tag, TailscaleAclManager, TailscaleSshTestInputItem } from "../../components/tailscale/manager.ts";
import { awaitOutput } from "@components/helpers.ts";
import { TailscaleCidr, TailscaleIp, TailscaleIpSet, TailscaleSelector, TailscaleService, TailscaleTags } from "@openapi/tailscale-grants.js";

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
  services: pulumi.Input<TailscaleService>[];
  hosts: {
    idp: pulumi.Input<string>;
    "primary-dns": pulumi.Input<string>;
    "secondary-dns": pulumi.Input<string>;
    "unifi-dns": pulumi.Input<string>;
    [key: string]: pulumi.Input<string>;
  };
  internalIps: pulumi.Input<TailscaleIp>[];
  tests: TestsData;
  dnsServers: pulumi.Input<string>[];
}) {
  const { tests, internalIps, services } = await awaitOutput(pulumi.output(args));
  const tailscaleParent = new pulumi.ComponentResource("custom:tailscale:TailscaleAcls", "tailscale-acls", {});
  const cro = { parent: tailscaleParent, provider: args.globals.tailscaleProvider };
  const currentAcl = await tailscale.getAcl({ provider: args.globals.tailscaleProvider });
  // let aclsJson = applyAllEdits(currentAcl.hujson, ["tagOwners"], {});
  // aclsJson = applyAllEdits(aclsJson, ["grants"], []);
  // aclsJson = applyAllEdits(aclsJson, ["tests"], []);
  // aclsJson = applyAllEdits(aclsJson, ["ssh"], []);
  // aclsJson = applyAllEdits(aclsJson, ["sshTests"], []);
  // aclsJson = applyAllEdits(aclsJson, ["nodeAttrs"], []);
  // aclsJson = applyAllEdits(aclsJson, ["autoApprovers"], { exitNode: [], routes: {}, services: {} });

  const manager = new TailscaleAclManager(currentAcl.hujson, args.hosts, tests);
  const testData = manager.testData;
  Object.values(tag).forEach((t) => manager.setTagOwner(t));
  Object.values(groups).forEach((t) => manager.setGroup(t));

  const clusters: KubernetesCluster[] = [
    {
      tag: tag.sgc,
      clusterNetwork: "10.209.0.0/16",
      serviceNetwork: "10.199.0.0/16",
      kubeApiIp: "10.10.209.201",
      publicIps: ["10.199.0.10", "10.10.209.100", "10.10.209.101", "10.10.209.202"],
    },
    {
      tag: tag.equestria,
      clusterNetwork: "10.206.0.0/16",
      serviceNetwork: "10.196.0.0/16",
      kubeApiIp: "10.10.206.201",
      publicIps: ["10.196.0.10", "10.10.206.100", "10.10.206.101", "10.10.206.202"],
    },
  ];

  for (const service of services) {
    manager.setService(service, [tag.dockge, tag.proxmox, tag.operator]);
  }

  configureProxmoxAccess(manager);
  configureDockgeAccess(manager);
  configureKubernetesAccess(manager, clusters);

  createGroupGrants(manager);

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
      ip: [...ports.ssh, ...ports.proxmox, ...ports.dockgeManagement, ...ports.proxmoxManagement],
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
      dst: ["host:primary-dns", "host:secondary-dns", "host:unifi-dns"],
      ip: ports.dns,
    },
    { accept: testData.knownNormalUsers.concat(testData.taggedDevices) }
  );

  const allowedIps = clusters.flatMap((z) => z.publicIps).concat(internalIps);

  manager.setGrant(
    "member-home-subnet-access",
    {
      src: [autogroups.member, autogroups.tagged, tag.mediaDevice],
      dst: allowedIps,
      ip: ["*"],
    },
    { accept: testData.knownNormalUsers.concat(testData.taggedDevices) }
  );

  manager.setGrant(
    "admins-home-subnet-access",
    {
      src: [autogroups.admin, groups.admins],
      dst: [subnets.internal],
      ip: ["*"],
    },
    { accept: [], deny: testData.knownNormalUsers }
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
      dst: ["host:idp"],
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

  manager.setNodeAttr({
    target: ["*"],
    attr: ["drive:access"],
  });

  manager.setGrant(
    "shared-drive-access",
    {
      src: [groups.family, groups.friends],
      dst: [tag.sharedDrive],
      app: {
        "tailscale.com/cap/drive": [
          {
            access: "rw",
            shares: ["shared"],
          },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "family-drive-access",
    {
      src: [groups.family],
      dst: [tag.sharedDrive],
      app: {
        "tailscale.com/cap/drive": [
          {
            access: "ro",
            shares: ["*"],
          },
          {
            access: "rw",
            shares: ["family"],
          },
          {
            access: "rw",
            shares: ["opencloud"],
          },
          {
            access: "ro",
            shares: ["media"],
          },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "admin-drive-access",
    {
      src: [groups.admins],
      dst: [tag.sharedDrive],
      app: {
        "tailscale.com/cap/drive": [
          {
            access: "rw",
            shares: ["*"],
          },
          // {
          //   access: "rw",
          //   shares: ["backup", "media"],
          // },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setGrant(
    "media-manager-drive-access",
    {
      src: [groups.mediaManagers],
      dst: [tag.sharedDrive],
      app: {
        "tailscale.com/cap/drive": [
          {
            access: "rw",
            shares: ["media"],
          },
        ],
      },
    },
    { accept: testData.knownNormalUsers }
  );

  manager.setNodeAttr({
    target: [tag.sharedDrive],
    attr: ["drive:share", "drive:access"],
  });

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
      dst: ["*"],
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
      dst: ["*"],
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
      dst: ["*"],
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

  manager.setNodeAttr({
    target: [groups.admins],
    attr: ["drive:share", "drive:access"],
  });

  manager.setGrant(
    "tsidp-admin",
    {
      src: [autogroups.admin, groups.admins],
      dst: ["*"],
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
      dst: ["*"],
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

  return manager;
}

function configureProxmoxAccess(manager: TailscaleAclManager) {
  const testData = manager.testData;
  manager.setTagOwner(tag.proxmox, [tag.apps, tag.exitNode, tag.dockge, tag.sharedDrive]);
  manager.setExitNode(tag.proxmox);
  manager.setRoute(subnets.internal, [tag.proxmox]);

  manager.setGrant({ src: [tag.proxmox], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmox, ...ports.proxmoxManagement] }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement] }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [tag.observability], ip: ports.observability }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
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

  manager.setGrant({ src: [tag.dockge], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmox, ...ports.proxmoxManagement] }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.dockge], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement] }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [autogroups.member, autogroups.tagged], dst: [tag.dockge], ip: ports.web }, { accept: testData.knownNormalUsers.concat(testData.knownAdminUsers) });
  manager.setGrant({ src: [tag.dockge], dst: [tag.observability], ip: ports.observability }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.dockge], dst: [autogroups.internet], ip: ports.any }, { accept: [tag.dockge] });

  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.dockgeDevices.map((z) => [z, { accept: [`root`] }] as const))
  );
  manager.setSshRule({ src: [tag.dockge], dst: [tag.dockge, tag.proxmox], users: ["root"], action: "accept" }, rules);
}

interface KubernetesCluster {
  tag: TailscaleTags;
  serviceNetwork: TailscaleCidr;
  clusterNetwork: TailscaleCidr;
  publicIps: TailscaleIp[];
  kubeApiIp: TailscaleIp;
}

function configureKubernetesAccess(manager: TailscaleAclManager, clusters: KubernetesCluster[]) {
  const testData = manager.testData;
  const clusterTags = clusters.map((z) => z.tag);

  manager.setTagOwner(tag.operator, [...clusterTags, tag.ingress, tag.egress, tag.apps, tag.observability, tag.exitNode, tag.recorder, tag.management, tag.k8s, tag.sharedDrive]);
  manager.setNodeAttr({ target: [tag.operator], attr: ["funnel"] });
  manager.setTagOwner(tag.ingress, [tag.apps, tag.observability]);

  manager.setExitNode(tag.sgc);
  manager.setExitNode(tag.equestria);

  manager.setService(tag.apps, [...clusterTags, tag.operator, tag.ingress]);
  manager.setService(tag.observability, [...clusterTags, tag.operator, tag.ingress]);
  manager.setService(tag.k8s, [tag.k8s]);

  manager.setRoute(subnets.internal, clusterTags);
  for (const cluster of clusters) {
    manager.setRoute(cluster.serviceNetwork, [cluster.tag]);
    manager.setRoute(cluster.clusterNetwork, [cluster.tag]);

    manager.setGrant(
      {
        src: clusterTags.concat([tag.ingress, tag.egress, tag.operator, tag.observability, tag.management, tag.k8s]),
        dst: [cluster.serviceNetwork, cluster.clusterNetwork],
        ip: ["*"],
      },
      { accept: clusterTags, deny: testData.knownNormalUsers }
    );
  }

  manager.setGrant(
    { src: [autogroups.admin, groups.admins, tag.sgc], dst: [tag.k8s, tag.operator], ip: ports.web, app: { "tailscale.com/cap/kubernetes": [{ impersonate: { groups: ["system:masters"] } }] } },
    { accept: [groups.admins] }
  );
  manager.setGrant(
    { src: [groups.family, groups.friends], dst: [tag.k8s, tag.operator], ip: ports.web, app: { "tailscale.com/cap/kubernetes": [{ impersonate: { groups: ["tailnet-readers"] } }] } },
    { accept: [groups.family, groups.friends] }
  );
  manager.setGrant({ src: [...clusterTags, tag.egress], dst: [...clusterTags, tag.ingress], ip: ports.ssh }, { accept: [...clusterTags, tag.egress], deny: testData.knownNormalUsers });
  manager.setGrant(
    { src: [autogroups.member, autogroups.tagged, ...clusterTags, tag.egress], dst: [...clusterTags, tag.ingress], ip: ports.web },
    { accept: [...clusterTags, tag.egress, ...testData.knownNormalUsers, ...testData.knownAdminUsers] }
  );
  manager.setGrant({ src: [...clusterTags, tag.egress], dst: [tag.observability], ip: ports.observability }, { accept: [...clusterTags, tag.egress], deny: testData.knownNormalUsers });
  manager.setGrant({ src: clusterTags, dst: [autogroups.internet], ip: ports.any }, { accept: clusterTags });

  manager.setGrant({ src: [tag.management], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement] }, { accept: [tag.management], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.management], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmoxManagement] }, { accept: [tag.management], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.management], dst: [tag.dockge, tag.proxmox], ip: [...ports.ssh, ...ports.nut] }, { accept: [tag.management], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.observability], dst: [tag.observability], ip: ports.observability }, { accept: [tag.observability], deny: testData.knownNormalUsers });

  for (const cluster of clusters) {
    manager.setGrant(
      {
        src: [groups.admins, autogroups.admin],
        dst: [cluster.serviceNetwork, cluster.clusterNetwork, cluster.kubeApiIp],
        ip: ["*"],
      },
      { accept: testData.knownAdminUsers, deny: testData.knownNormalUsers }
    );
  }

  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.knownAdminUsers.map((z) => [z, { check: [`root`] }] as const))
  );
  manager.setSshRule({ src: [tag.management], dst: [tag.dockge, tag.proxmox], users: ["root"], action: "accept" }, rules);
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
