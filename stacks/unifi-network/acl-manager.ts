/**
 * Central Tailscale ACL management for unifi-network stack.
 * Discovers all node exports from 1Password (tagged 'tailscale-export'),
 * aggregates them, and owns all ACL / DNS rules across every stack.
 */
import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import { GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { getTailscaleIp } from "../../components/tailscale.ts";
import { applyAllEdits, autogroups, groups, ports, subnets, tag, TailscaleAclManager, TailscaleSshTestInputItem } from "../../components/tailscale/manager.ts";
import { dns, Roles } from "../../components/constants.ts";
import { TailscaleCidr, TailscaleIp, TailscaleService, TailscaleTags } from "@openapi/tailscale-grants.js";

interface KubernetesCluster {
  tag: TailscaleTags;
  serviceNetwork: TailscaleCidr;
  clusterNetwork: TailscaleCidr;
  publicIps: TailscaleIp[];
  kubeApiIp: TailscaleIp;
}

export interface AggregatedNodeExport {
  stackName: string;
  nodes: Array<{ name: string; ip: string; internalIp?: string; nodeType?: string }>;
  services: string[];
}

/**
 * Discovers all Tailscale node exports from 1Password items tagged 'tailscale-export'.
 * Each source stack writes its node IPs + registered services into its own item.
 */
export function discoverNodeExports() {
  const opClient = new OPClient();

  return pulumi.output(opClient.findItemsByTag("tailscale-export")).apply((items) =>
    items.map((item) => {
      const services = item.fields?.["services"]?.value?.split(",") ?? [];
      const stackName = item.fields?.["stackName"]?.value!;
      const hosts = Object.fromEntries(
        Object.entries(item.sections ?? {}).map(([name, section]) => [
          name,
          {
            ip: section.fields?.["ip"]?.value!,
            internalIp: section.fields?.["internalIp"]?.value,
            nodeType: section.fields?.["nodeType"]?.value!,
          },
        ]),
      );

      return {
        stackName,
        hosts,
        services,
      };
    }),
  );
}

/**
 * Applies centralized Tailscale ACLs using the aggregated node data from all stacks.
 * Replaces all stack-specific ACL calls (formerly in home/tailscale.ts).
 */
export function assignTailscaleAcls(globals: GlobalResources): pulumi.Output<any> {
  const nodeExports = discoverNodeExports();
  const tailscaleParent = new pulumi.ComponentResource("custom:tailscale:CentralizedAcls", "centralized-acls", {});
  const cro = { parent: tailscaleParent, provider: globals.tailscaleProvider };

  const currentAcl = tailscale.getAclOutput({ provider: globals.tailscaleProvider });
  const primaryDns = getTailscaleIp("adguard-home", globals);
  const secondaryDns = getTailscaleIp("dockge-as", globals);
  const idpIp = getTailscaleIp("idp", globals);
  const unifiDns = "100.111.0.1";

  return pulumi.all([currentAcl.hujson, nodeExports, primaryDns, secondaryDns, idpIp]).apply(([hujson, allExports, primaryDnsIp, secondaryDnsIp, idpAddr]) => {
    // ── Build hosts map from all exported stacks ──────────────────────────
    const hosts: [string, string][] = [
      ["idp", idpAddr],
      ["primary-dns", primaryDnsIp],
      ["secondary-dns", secondaryDnsIp],
      ["unifi-dns", unifiDns],
    ];
    for (const exp of allExports) {
      for (const [name, { ip }] of Object.entries(exp.hosts)) {
        hosts.push([name, ip]);
      }
    }

    // ── Aggregate services, internalIps, and test device lists ───────────
    const services = allExports.flatMap((exp) => exp.services);
    const internalIps = allExports.flatMap((exp) =>
      Object.values(exp.hosts)
        .filter((n) => n.internalIp)
        .map((n) => n.internalIp!),
    ) as TailscaleIp[];

    const proxmoxDevices = allExports.flatMap((exp) =>
      Object.entries(exp.hosts)
        .filter(([_, n]) => n.nodeType === "proxmox")
        .map(([name, _]) => name),
    );
    const dockgeDevices = allExports.flatMap((exp) =>
      Object.entries(exp.hosts)
        .filter(([_, n]) => n.nodeType === "dockge")
        .map(([name, _]) => name),
    );
    const tests = {
      proxmoxDevices,
      dockgeDevices,
      kubernetesDevices: ["sgc", "equestria"],
      taggedDevices: [...proxmoxDevices, ...dockgeDevices],
    };

    const dnsServers = [primaryDnsIp, secondaryDnsIp, unifiDns, ...dns.internalIps];

    // ── Initialise ACL manager ────────────────────────────────────────────
    let aclsJson = applyAllEdits(hujson, ["tagOwners"], {});
    aclsJson = applyAllEdits(aclsJson, ["grants"], []);
    aclsJson = applyAllEdits(aclsJson, ["tests"], []);
    aclsJson = applyAllEdits(aclsJson, ["ssh"], []);
    aclsJson = applyAllEdits(aclsJson, ["sshTests"], []);

    const manager = new TailscaleAclManager(aclsJson, hosts, tests);
    const testData = manager.testData;
    Object.values(tag).forEach((t) => manager.setTagOwner(t));
    Object.values(groups).forEach((t) => manager.setGroup(t));

    // ── Kubernetes clusters ───────────────────────────────────────────────
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

    // ── Register Dockge services from all stacks ──────────────────────────
    for (const service of services) {
      manager.setService(service as TailscaleService, [tag.dockge, tag.apps, tag.proxmox, tag.operator]);
    }

    // ── Per-role access rules ─────────────────────────────────────────────
    configureProxmoxAccess(manager);
    configureDockgeAccess(manager);
    configurePbsAccess(manager);
    configureKubernetesAccess(manager, clusters);
    createGroupGrants(manager);

    // ── General member/admin grants ───────────────────────────────────────
    manager.setGrant(
      "default-apps-access",
      {
        src: [autogroups.tagged, autogroups.member, tag.mediaDevice],
        dst: [tag.apps, tag.dockge],
        ip: ports.web,
      },
      { accept: testData.knownNormalUsers.concat(testData.taggedDevices) },
    );

    manager.setGrant(
      "peer-relay",
      {
        src: [tag.mediaDevice, groups.friendsAndFamily, autogroups.admin],
        dst: [tag.peerRelay],
        app: { "tailscale.com/cap/relay": [] },
      },
      { accept: ["debs-apple-tv"] },
    );

    manager.setGrant(
      {
        src: [autogroups.admin],
        dst: [tag.proxmox, tag.backups, tag.dockge],
        ip: [...ports.ssh, ...ports.proxmox, ...ports.dockgeManagement, ...ports.proxmoxManagement, ...ports.proxmoxBackupServer, ...ports.nfs],
      },
      { accept: testData.knownAdminUsers },
    );

    manager.setSshRule(
      {
        src: [autogroups.admin],
        dst: [tag.proxmox, tag.backups, tag.dockge],
        users: ["root"],
        action: "check",
      },
      Object.fromEntries(manager.testData.knownAdminUsers.map((user) => [user, { check: [`root`] } as TailscaleSshTestInputItem] as const)),
    );

    manager.setGrant(
      "default-dns",
      {
        src: [autogroups.tagged, autogroups.member, tag.mediaDevice],
        dst: ["host:primary-dns", "host:secondary-dns", "host:unifi-dns"],
        ip: ports.dns,
      },
      { accept: testData.knownNormalUsers.concat(testData.taggedDevices) },
    );

    const allowedIps = clusters.flatMap((z) => z.publicIps).concat(internalIps);

    manager.setGrant(
      "member-home-subnet-access",
      {
        src: [autogroups.member, autogroups.tagged, tag.mediaDevice],
        dst: allowedIps,
        ip: ["*"],
      },
      { accept: testData.knownNormalUsers.concat(testData.taggedDevices) },
    );

    manager.setGrant(
      "admins-home-subnet-access",
      {
        src: [autogroups.admin],
        dst: [subnets.home],
        ip: ["*"],
      },
      { accept: [], deny: testData.knownNormalUsers },
    );

    manager.setGrant(
      {
        src: [autogroups.member, autogroups.tagged, tag.mediaDevice],
        dst: [tag.exitNode, autogroups.internet],
        ip: ["*"],
      },
      { accept: testData.knownNormalUsers.concat(testData.taggedDevices) },
    );

    manager.setGrant(
      {
        src: [autogroups.member, autogroups.tagged, tag.mediaDevice],
        dst: ["host:idp"],
        ip: ["tcp:443"],
      },
      { accept: testData.knownNormalUsers.concat(testData.taggedDevices) },
    );

    // ── Drive access ──────────────────────────────────────────────────────
    manager.setGrant(
      "member-drive-access",
      {
        src: [autogroups.member],
        dst: [autogroups.self],
        app: { "tailscale.com/cap/drive": [{ access: "rw", shares: ["*"] }] },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setNodeAttr({ target: ["*"], attr: ["drive:access"] });

    manager.setGrant(
      "shared-drive-access",
      {
        src: [groups.friendsAndFamily],
        dst: [tag.sharedDrive],
        app: { "tailscale.com/cap/drive": [{ access: "rw", shares: ["shared"] }] },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setGrant(
      "family-drive-access",
      {
        src: [groups.friendsAndFamily],
        dst: [tag.sharedDrive],
        app: {
          "tailscale.com/cap/drive": [
            { access: "ro", shares: ["*"] },
            { access: "rw", shares: ["family"] },
            { access: "rw", shares: ["opencloud"] },
            { access: "ro", shares: ["media"] },
          ],
        },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setGrant(
      "admin-drive-access",
      {
        src: [autogroups.admin],
        dst: [tag.sharedDrive],
        app: { "tailscale.com/cap/drive": [{ access: "rw", shares: ["*"] }] },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setGrant(
      "media-manager-drive-access",
      {
        src: [groups.mediaManagers],
        dst: [tag.sharedDrive],
        app: { "tailscale.com/cap/drive": [{ access: "rw", shares: ["media"] }] },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setNodeAttr({ target: [tag.sharedDrive], attr: ["drive:share", "drive:access"] });

    // ── App capability grants ─────────────────────────────────────────────
    manager.setGrant(
      "member-golink-defaults",
      {
        src: [autogroups.member],
        app: { "tailscale.com/cap/golink": [{ admin: true }] },
      },
      { accept: testData.knownNormalUsers },
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
              resources: ["*"],
              users: ["*"],
              extraClaims: { groups: [Roles.Users], entitlements: [Roles.Users] },
            },
          ],
        },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setGrant(
      "family-tsidp-defaults",
      {
        src: [groups.friendsAndFamily],
        dst: ["*"],
        app: { "tailscale.com/cap/tsidp": [{ extraClaims: { groups: [Roles.Family], entitlements: [Roles.Family] } }] },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setGrant(
      "friends-tsidp-defaults",
      {
        src: [groups.friendsAndFamily],
        dst: ["*"],
        app: { "tailscale.com/cap/tsidp": [{ extraClaims: { groups: [Roles.Friends], entitlements: [Roles.Friends] } }] },
      },
      { accept: testData.knownNormalUsers },
    );

    manager.setNodeAttr({ target: [autogroups.admin], attr: ["drive:share", "drive:access"] });

    manager.setGrant(
      "tsidp-admin",
      {
        src: [autogroups.admin],
        dst: ["*"],
        app: {
          "tailscale.com/cap/tsidp": [
            {
              allow_admin_ui: true,
              allow_dcr: true,
              extraClaims: { entitlements: [Roles.Admins], groups: [Roles.Admins] },
              includeInUserInfo: true,
            },
          ],
        },
      },
      { accept: [] },
    );

    manager.setGrant(
      "tsidp-egress",
      {
        src: [tag.egress],
        dst: ["*"],
        app: { "tailscale.com/cap/tsidp": [{ allow_admin_ui: true, allow_dcr: true }] },
      },
      { accept: [tag.egress] },
    );

    // ── Create ACL + DNS resources ────────────────────────────────────────
    const acl = new tailscale.Acl(
      "acl",
      {
        acl: pulumi.output(manager.getJson()),
        overwriteExistingContent: true,
      },
      cro,
    );

    new tailscale.DnsNameservers("dns-nameservers", { nameservers: dnsServers }, cro);

    return { acl, manager };
  });
}

// ── Private helpers (migrated from stacks/home/tailscale.ts) ──────────────────

function configureProxmoxAccess(manager: TailscaleAclManager) {
  const testData = manager.testData;
  manager.setTagOwner(tag.proxmox, [tag.apps, tag.exitNode, tag.dockge, tag.backups, tag.sharedDrive, tag.peerRelay, tag.mediaDevice, tag.proxmox]);
  manager.setExitNode(tag.proxmox);
  manager.setRoute(subnets.home, [tag.proxmox]);

  manager.setGrant(
    { src: [tag.proxmox], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmox, ...ports.proxmoxManagement, ...ports.nfs] },
    { accept: [tag.proxmox], deny: testData.knownNormalUsers },
  );
  manager.setGrant({ src: [tag.proxmox], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement, ...ports.nfs] }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [tag.backups], ip: [...ports.ssh, ...ports.proxmoxBackupServer, ...ports.nfs] }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [tag.observability], ip: ports.observability }, { accept: [tag.proxmox], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.proxmox], dst: [autogroups.internet], ip: ports.any }, { accept: [tag.proxmox] });

  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.proxmoxDevices.map((z) => [z, { accept: [`root`] }] as const)),
  );
  manager.setSshRule({ src: [tag.proxmox], dst: [tag.dockge, tag.proxmox], users: ["root"], action: "accept" }, rules);
}

function configureDockgeAccess(manager: TailscaleAclManager) {
  const testData = manager.testData;
  manager.setTagOwner(tag.dockge, [tag.apps]);
  manager.setService(tag.apps, [tag.dockge]);

  manager.setGrant({ src: [tag.dockge], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmox, ...ports.nfs] }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.dockge], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement, ...ports.nfs] }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [autogroups.member, autogroups.tagged], dst: [tag.dockge], ip: ports.web }, { accept: testData.knownNormalUsers.concat(testData.knownAdminUsers) });
  manager.setGrant({ src: [tag.dockge], dst: [tag.observability], ip: ports.observability }, { accept: [tag.dockge], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.dockge], dst: [autogroups.internet], ip: ports.any }, { accept: [tag.dockge] });

  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.dockgeDevices.map((z) => [z, { accept: [`root`] }] as const)),
  );
  manager.setSshRule({ src: [tag.dockge], dst: [tag.dockge, tag.proxmox], users: ["root"], action: "accept" }, rules);
}

function configurePbsAccess(manager: TailscaleAclManager) {
  const testData = manager.testData;
  manager.setTagOwner(tag.backups, [tag.apps, tag.backups]);
  manager.setService(tag.apps, [tag.backups]);

  manager.setGrant({ src: [tag.backups], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmoxBackupServer, ...ports.nfs] }, { accept: [tag.backups], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.backups], dst: [tag.backups], ip: [...ports.ssh, ...ports.proxmoxBackupServer, ...ports.nfs] }, { accept: [tag.backups], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.backups], dst: [tag.observability], ip: ports.observability }, { accept: [tag.backups], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.backups], dst: [autogroups.internet], ip: ports.any }, { accept: [tag.backups] });

  const rules = Object.fromEntries(testData.knownAdminUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const));
  manager.setSshRule({ src: [tag.backups], dst: [tag.backups, tag.proxmox], users: ["root"], action: "accept" }, rules);
}

function configureKubernetesAccess(manager: TailscaleAclManager, clusters: KubernetesCluster[]) {
  const testData = manager.testData;
  const clusterTags = clusters.map((z) => z.tag);
  const rules = Object.fromEntries(
    testData.knownNormalUsers.map((user) => [user, { deny: [`root`] } as TailscaleSshTestInputItem] as const).concat(testData.knownAdminUsers.map((z) => [z, { check: [`root`] }] as const)),
  );

  manager.setTagOwner(tag.operator, [...clusterTags, tag.ingress, tag.egress, tag.apps, tag.observability, tag.exitNode, tag.recorder, tag.management, tag.k8s, tag.sharedDrive]);
  manager.setNodeAttr({ target: [tag.operator], attr: ["funnel"] });
  manager.setTagOwner(tag.ingress, [tag.apps, tag.observability]);

  manager.setExitNode(tag.sgc);
  manager.setExitNode(tag.equestria);

  manager.setService(tag.apps, [...clusterTags, tag.operator, tag.ingress]);
  manager.setService(tag.observability, [...clusterTags, tag.operator, tag.ingress]);
  manager.setService(tag.k8s, [tag.k8s]);

  manager.setRoute(subnets.home, clusterTags);
  for (const cluster of clusters) {
    manager.setRoute(cluster.serviceNetwork, [cluster.tag]);
    manager.setRoute(cluster.clusterNetwork, [cluster.tag]);
    manager.setGrant({ src: [cluster.tag], dst: [tag.dockge, tag.proxmox, tag.backups], ip: [...ports.ssh] }, { accept: [cluster.tag], deny: testData.knownNormalUsers });
    manager.setSshRule({ src: [cluster.tag], dst: [tag.dockge, tag.proxmox, tag.backups], users: ["root"], action: "accept" }, rules);

    manager.setGrant(
      {
        src: [...clusterTags, tag.ingress, tag.egress, tag.operator, tag.observability, tag.management, tag.k8s],
        dst: [cluster.serviceNetwork, cluster.clusterNetwork],
        ip: ["*"],
      },
      { accept: clusterTags, deny: testData.knownNormalUsers },
    );
    manager.setGrant(
      {
        src: [autogroups.admin],
        dst: [cluster.serviceNetwork, cluster.clusterNetwork, cluster.kubeApiIp],
        ip: ["*"],
      },
      { accept: testData.knownAdminUsers, deny: testData.knownNormalUsers },
    );
  }

  manager.setGrant(
    {
      src: [autogroups.admin],
      dst: [tag.k8s, tag.operator],
      ip: ports.web,
      app: { "tailscale.com/cap/kubernetes": [{ impersonate: { groups: ["system:masters"] } }] },
    },
    { accept: [] },
  );
  manager.setGrant(
    { src: [groups.friendsAndFamily], dst: [tag.k8s, tag.operator], ip: ports.web, app: { "tailscale.com/cap/kubernetes": [{ impersonate: { groups: ["tailnet-readers"] } }] } },
    { accept: [groups.friendsAndFamily] },
  );
  manager.setGrant(
    { src: [...clusterTags, tag.egress], dst: [...clusterTags, tag.ingress], ip: [...ports.ssh, ...ports.nfs] },
    { accept: [...clusterTags, tag.egress], deny: testData.knownNormalUsers },
  );
  manager.setGrant(
    { src: [autogroups.member, autogroups.tagged, ...clusterTags, tag.egress], dst: [...clusterTags, tag.ingress], ip: ports.web },
    { accept: [...clusterTags, tag.egress, ...testData.knownNormalUsers, ...testData.knownAdminUsers] },
  );
  manager.setGrant({ src: [...clusterTags, tag.egress], dst: [tag.observability], ip: ports.observability }, { accept: [...clusterTags, tag.egress], deny: testData.knownNormalUsers });
  manager.setGrant({ src: clusterTags, dst: [autogroups.internet], ip: ports.any }, { accept: clusterTags });

  manager.setGrant({ src: [tag.management], dst: [tag.dockge], ip: [...ports.ssh, ...ports.dockgeManagement, ...ports.nfs] }, { accept: [tag.management], deny: testData.knownNormalUsers });
  manager.setGrant({ src: [tag.management], dst: [tag.proxmox], ip: [...ports.ssh, ...ports.proxmoxManagement, ...ports.nfs] }, { accept: [tag.management], deny: testData.knownNormalUsers });
  manager.setGrant(
    { src: [tag.management], dst: [tag.dockge, tag.proxmox, tag.backups], ip: [...ports.ssh, ...ports.nut, ...ports.nfs] },
    { accept: [tag.management], deny: testData.knownNormalUsers },
  );
  manager.setGrant({ src: [tag.observability], dst: [tag.observability], ip: ports.observability }, { accept: [tag.observability], deny: testData.knownNormalUsers });

  manager.setSshRule({ src: [tag.management], dst: [tag.dockge, tag.proxmox, tag.backups], users: ["root"], action: "accept" }, rules);
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
              extraClaims: { groups: [role], entitlements: [role] },
            },
          ],
        },
      },
      { accept: [] },
    );
  }
}
