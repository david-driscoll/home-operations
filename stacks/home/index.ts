import type { AuthentikOutputs } from "@components/authentik.ts";
import { BackupPlanDirector } from "@components/BackupPlanDirector.ts";
import { Tailscale } from "@components/constants.ts";
import { awaitOutput } from "@components/helpers.ts";
import type { CredentialDefinition, PasswordDefinition, SshKeyDefinition } from "@components/store/index.ts";
import { TailscaleMonitor } from "@components/tailscale.ts";
import { CategoryEnum, OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import * as minio from "@pulumi/minio";
import * as pulumi from "@pulumi/pulumi";
import { DockgeLxc, getDockageProperties } from "../../components/DockgeLxc.ts";
import { GlobalResources } from "../../components/globals.ts";
import { OpenBaoOidc } from "../../components/openbao/oidc.ts";
import { OpenBaoClusterAuth } from "../../components/openbao/clusterAuth.ts";
import { ProxmoxBackupServerLxc } from "../../components/ProxmoxBackupServerLxc.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";
import { createGatusDnsUptime } from "../../components/StandardDns.ts";
import { TruenasVm } from "../../components/TruenasVm.ts";

const globals = new GlobalResources({}, {});
const monitor = new TailscaleMonitor();
const backupDirector = new BackupPlanDirector("backup-plan-director", {
  globals,
});

const outputs = globals.store.getSecretByTitle<AuthentikOutputs>("Authentik Outputs");
const sftpClientKey = globals.store.getSecretByTitle<SshKeyDefinition>("Rclone SFTP Key");
const mainProxmoxCredentials = globals.store.getSecretByTitle<CredentialDefinition & { arch: string }>("Proxmox ApiKey");
const alphaSiteProxmoxCredentials = globals.store.getSecretByTitle<CredentialDefinition & { arch: string }>("Alpha Site Proxmox ApiKey");
const dockgeCredential = globals.store.getSecretByTitle<PasswordDefinition>("Dockge Credential");
const celestiaCluster = globals.store.getCluster("Cluster: Celestia");
const alphaSiteCluster = globals.store.getCluster("Cluster: Alpha Site");
const _minioBucket = new minio.S3Bucket(
  `home-operations-minio-bucket`,
  {
    acl: "private",
    bucket: pulumi.interpolate`home-operations`,
  },
  {
    provider: globals.truenasMinioProvider,
    protect: true,
    retainOnDelete: true,
    import: "home-operations",
  },
);

const twilightSparkleHost = new ProxmoxHost("twilight-sparkle", {
  title: "Twilight Sparkle",
  globals: globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.100",
  tailscaleIpAddress: "100.111.10.100",
  proxmox: mainProxmoxCredentials,
  remote: false,
  cluster: celestiaCluster,
  peerRelay: "unifi",
  tailscaleArgs: {
    advertiseExitNode: true,
    acceptRoutes: false,
  },
  tailscaleSubnetRoutes: [],
  vmIdRange: { start: 102, end: 199 },
});
const spikeVm = new TruenasVm("spike", {
  credential: globals.truenasCredential.meta.title,
  globals: globals,
  host: twilightSparkleHost,
  ipAddress: pulumi.output("10.10.10.10"),
  tailscaleIpAddress: "100.111.10.10",
});

// CloudNativePG barman-cloud WAL archives + base backups, one bucket per
// Kubernetes cluster. These are the PITR archive: postgres cannot recycle a WAL
// segment until barman has put it here, so if a bucket is missing the cluster's
// pg_wal grows without bound (vault#119 — the ObjectStore manifests shipped
// pointing at buckets that only ever existed on Backblaze B2, and archiving
// failed with barman GeneralErrorExit/4 wrapping a NoSuchBucket).
//
// protect + retainOnDelete: destroying one of these discards the entire
// recovery window. Never let a stack destroy take them.
const _cnpgEquestriaBackups = new minio.S3Bucket(
  `cnpg-equestria-backups`,
  {
    acl: "private",
    bucket: pulumi.interpolate`cnpg-equestria`,
  },
  {
    provider: globals.truenasMinioProvider,
    protect: true,
    retainOnDelete: true,
  },
);

const _cnpgSgcBackups = new minio.S3Bucket(
  `cnpg-sgc-backups`,
  {
    acl: "private",
    bucket: pulumi.interpolate`cnpg-sgc`,
  },
  {
    provider: globals.truenasMinioProvider,
    protect: true,
    retainOnDelete: true,
  },
);

const thanosStorage = new minio.S3Bucket(
  `thanos-storage`,
  {
    acl: "private",
    bucketPrefix: "thanos",
  },
  {
    provider: globals.truenasMinioProvider,
    protect: false,
    retainOnDelete: true,
  },
);

const _thanosMinioSecret = new OnePasswordItem("thanos-minio-secret", {
  title: "Thanos S3 Storage",
  category: CategoryEnum.APICredential,
  fields: {
    username: {
      type: TypeEnum.String,
      value: globals.truenasMinioProvider.minioUser,
    },
    password: {
      type: TypeEnum.Concealed,
      value: globals.truenasMinioProvider.minioPassword,
    },
    bucket: { type: TypeEnum.String, value: thanosStorage.bucket },
    endpoint: {
      type: TypeEnum.String,
      value: globals.truenasMinioProvider.minioServer,
    },
  },
});

const celestiaHost = new ProxmoxHost("celestia", {
  globals: globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  proxmox: mainProxmoxCredentials,
  truenas: spikeVm,
  remote: false,
  cluster: celestiaCluster,
  peerRelay: "unifi",
  tailscaleArgs: {
    advertiseExitNode: true,
    acceptRoutes: false,
  },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: { start: 302, end: 399 },
});
const celestiaBackupMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/backup/");
const celestiaDataMount = celestiaHost.addNfsMount(spikeVm.ipAddress, "/mnt/stash/data/");

const alphaSiteHost = new ProxmoxHost("alpha-site", {
  title: "Alpha Site",
  globals: globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.200",
  tailscaleIpAddress: "100.111.10.200",
  proxmox: alphaSiteProxmoxCredentials,
  installTailscale: false,
  remote: false,
  cluster: alphaSiteCluster,
  shortName: "as",
  tailscaleArgs: { acceptRoutes: false },
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: { start: 101, end: 199 },
});

const celestiaDockgeRuntime = new DockgeLxc("celestia-dockge", {
  globals,
  credential: dockgeCredential,
  host: celestiaHost,
  vmId: 300,
  cluster: celestiaCluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  monitor,
});
celestiaDockgeRuntime.addHostMount("/data");
celestiaDockgeRuntime.addHostMount(`/mnt/pve/${celestiaBackupMount}`, "/spike/backup");
celestiaDockgeRuntime.addHostMount(`/mnt/pve/${celestiaDataMount}`, "/spike/data");

const alphaSiteDockgeRuntime = new DockgeLxc("alpha-site-dockge", {
  globals,
  credential: dockgeCredential,
  host: alphaSiteHost,
  vmId: 100,
  ipAddress: "10.10.10.9",
  tailscaleIpAddress: "100.111.10.9",
  cluster: alphaSiteCluster,
  tailscaleArgs: { acceptRoutes: false },
  sftpKey: sftpClientKey,
  legacyTun: true, // jiangcuo ARM64 Proxmox port stubs out mknod; dev2 passthrough is unusable
  monitor,
});

const celestiaPbs = new ProxmoxBackupServerLxc("celestia-pbs", {
  globals,
  outputs,
  host: celestiaHost,
  vmId: 301,
  tailscaleArgs: { acceptDns: true, acceptRoutes: false, ssh: true },
  cluster: celestiaCluster,
  dockge: celestiaDockgeRuntime,
  dependsOn: [],
  tags: ["backup-source"],
});
celestiaPbs.addHostMount("/data");
celestiaPbs.addHostMount(`/mnt/pve/${celestiaBackupMount}`, "/spike/backup");
celestiaPbs.addHostMount(`/mnt/pve/${celestiaDataMount}`, "/spike/data");
// celestiaPbs.addDatastore({ name: "testing", path: "/data/testing", comment: "Testing Datastore behavior" });

// Celestia monitors twilight-sparkle + itself; alpha-site monitors only itself
const celestiaPveHosts = [twilightSparkleHost, celestiaHost];
const celestiaPveVariables = {
  PROXMOX_BLACKBOX_TARGETS: `[${celestiaPveHosts.map(h => `"https://${h.tailscaleIpAddress}:8006"`).join(", ")}]`,
  PROXMOX_PVE_TARGETS: `[${celestiaPveHosts.map(h => `"${h.tailscaleIpAddress}:8006"`).join(", ")}]`,
  DNS_CLUSTER_IS_PRIMARY: "true",
};

const alphaSitePveVariables = {
  PROXMOX_BLACKBOX_TARGETS: `["https://${alphaSiteHost.tailscaleIpAddress}:8006"]`,
  PROXMOX_PVE_TARGETS: `["${alphaSiteHost.tailscaleIpAddress}:8006"]`,
};

await awaitOutput(
  alphaSiteDockgeRuntime.deployStacks({
    dependsOn: [celestiaPbs],
    variables: alphaSitePveVariables,
  }),
);
await awaitOutput(alphaSiteHost.addUptimeGatus());

await awaitOutput(
  celestiaDockgeRuntime.deployStacks({
    dependsOn: [celestiaPbs],
    variables: celestiaPveVariables,
  }),
);
await awaitOutput(celestiaHost.addUptimeGatus());

await awaitOutput(twilightSparkleHost.addUptimeGatus());
await awaitOutput(createGatusDnsUptime(globals, { parent: alphaSiteHost }));
await awaitOutput(
  backupDirector.createPlans(
    {
      dockge: celestiaDockgeRuntime,
      pbs: celestiaPbs,
      cluster: celestiaCluster,
    },
    [celestiaPbs],
  ),
);

monitor.exportNodeStateToOnePassword(
  [
    {
      name: twilightSparkleHost.tailscaleName,
      externalIp: twilightSparkleHost.tailscaleIpAddress,
      internalIp: twilightSparkleHost.localIpAddress,
      mac: twilightSparkleHost.macAddress,
      nodeType: "proxmox",
    },
    {
      name: celestiaHost.tailscaleName,
      externalIp: celestiaHost.tailscaleIpAddress,
      internalIp: celestiaHost.localIpAddress,
      mac: celestiaHost.macAddress,
      nodeType: "proxmox",
    },
    {
      name: alphaSiteHost.tailscaleName,
      externalIp: alphaSiteHost.tailscaleIpAddress,
      internalIp: alphaSiteHost.localIpAddress,
      mac: alphaSiteHost.macAddress,
      nodeType: "proxmox",
    },
    {
      name: celestiaDockgeRuntime.tailscaleName,
      externalIp: celestiaDockgeRuntime.tailscaleIpAddress,
      internalIp: celestiaDockgeRuntime.localIpAddress,
      mac: celestiaDockgeRuntime.macAddress,
      nodeType: "dockge",
    },
    {
      name: celestiaPbs.tailscaleName,
      externalIp: celestiaPbs.tailscaleIpAddress,
      internalIp: celestiaPbs.localIpAddress,
      mac: celestiaPbs.macAddress,
      nodeType: "pbs",
    },
    {
      name: alphaSiteDockgeRuntime.tailscaleName,
      externalIp: alphaSiteDockgeRuntime.tailscaleIpAddress,
      internalIp: alphaSiteDockgeRuntime.localIpAddress,
      mac: alphaSiteDockgeRuntime.macAddress,
      nodeType: "dockge",
    },
    {
      name: spikeVm.tailscaleName,
      externalIp: spikeVm.tailscaleIpAddress,
      internalIp: spikeVm.ipAddress,
      mac: spikeVm.macAddress,
      nodeType: "truenas",
    },
  ],
  { parent: alphaSiteHost },
);

export const alphaSite = {
  proxmox: getProxmoxProperties(alphaSiteHost),
  dockge: getDockageProperties(alphaSiteDockgeRuntime),
  backup: alphaSiteHost.backupVolumes!,
};
export const twilightSparkle = {
  proxmox: getProxmoxProperties(twilightSparkleHost),
};
export const celestia = {
  proxmox: getProxmoxProperties(celestiaHost),
  dockge: getDockageProperties(celestiaDockgeRuntime),
  backup: celestiaHost.backupVolumes!,
};

// OpenBao human login (Authentik OIDC): admins -> policy `admin`,
// family -> read-only `viewer`. This is barrier state, so it cannot come from
// the HelmRelease config or an env var — see components/openbao/oidc.ts.
const _openbaoOidc = new OpenBaoOidc("openbao-oidc", { globals });

// Phase 7: SGC's ESO gets its own kubernetes auth mount. One OpenBao serves
// the estate, but one `kubernetes` mount pins a single API server and rejects
// every other cluster's ServiceAccount tokens — so it is one mount per
// cluster. equestria's equivalent still belongs to the bootstrap script and
// would need `pulumi import` to adopt; see components/openbao/clusterAuth.ts.
//
// The API server is addressed by IP on purpose: a *.driscoll.tech name
// resolves through split-horizon DNS, which would put Technitium in the login
// path for every SGC secret read. 10.10.209.201 is in the API server cert's
// SANs and reachable from an openbao pod — both verified before this landed.
const _openbaoSgcAuth = new OpenBaoClusterAuth("openbao-sgc-auth", {
  globals,
  clusterKey: "sgc",
  clusterTitle: "Cluster: Stargate Command",
  kubernetesHost: "https://10.10.209.201:6443",
});
