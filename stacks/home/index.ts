import type { AuthentikOutputs } from "@components/authentik.ts";
import { BackupPlanDirector } from "@components/BackupPlanDirector.ts";
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
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
import { ProxmoxBackupServerLxc } from "../../components/ProxmoxBackupServerLxc.ts";
import { getProxmoxProperties, ProxmoxHost } from "../../components/ProxmoxHost.ts";
import { createGatusDnsUptime, StandardDns } from "../../components/StandardDns.ts";
import { TruenasVm } from "../../components/TruenasVm.ts";

const globals = new GlobalResources({}, {});
const monitor = new TailscaleMonitor(globals);
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
// `protect: true` + `retainOnDelete: true` guard this bucket against the
// failure mode that `deleteBeforeReplace: true` enabled twice elsewhere in
// this repo — see components/StandardDns.ts and project memory
// (standarddns-cloudflare-import-outage, standarddns-unifi-import-armed-
// deletes) for what happens when a bad replace plan can delete-then-adopt
// an `import:` resource without a human in the loop. Don't drop `protect`
// here without reading those first. See docs/cluster-consolidation/05-import-audit.md.
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

// Versioning on the state-archive bucket: cheap protection against a bad
// `pulumi stack export`/backend write clobbering a prior good one.
// Additive-only — does not touch the import: behavior above.
const _minioBucketVersioning = new minio.S3BucketVersioning(
  `home-operations-minio-bucket-versioning`,
  {
    bucket: _minioBucket.bucket,
    versioningConfiguration: {
      status: "Enabled",
    },
  },
  {
    provider: globals.truenasMinioProvider,
    protect: true,
  },
);

clusterWideDns(globals);

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

// The OpenBao twin of the item above.
//
// This one was missing, and it is the Phase 8 "frozen twin" bug live: TWO
// ExternalSecrets read `clusters/equestria/apps/thanos/s3` (equestria observability/thanos
// and SGC observability/prometheus-proxy), but the only producer wrote
// 1Password. What they were reading is the one-time op-to-bao copy from
// 2026-08-08, version 1, never refreshed — so the day this Minio credential
// rotates, Pulumi updates 1Password, OpenBao keeps the stale value, and Thanos
// starts failing against object storage with a credential nothing shows as
// wrong. A one-time seed is a freeze, not a source.
//
// Key names must match the 1Password item exactly: both consumers `extract`
// the whole path and rewrite every key to `minio_<key>`.
if (globals.baoDualWriteEnabled) {
  baoKvSecret(
    "thanos-minio-secret-bao",
    {
      mount: "secrets",
      path: "clusters/equestria/apps/thanos/s3",
      data: {
        username: globals.truenasMinioProvider.minioUser,
        password: globals.truenasMinioProvider.minioPassword,
        bucket: thanosStorage.bucket,
        endpoint: globals.truenasMinioProvider.minioServer,
      },
      concealedFields: ["password"],
      customMetadata: baoProvenance({ source_title: "Thanos S3 Storage" }),
    },
    { provider: globals.baoProvider },
  );
} else {
  pulumi.log.warn(
    "No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the OpenBao dual-write for Thanos S3 Storage. The clusters/equestria/apps/thanos/s3 path its ExternalSecrets read stays frozen until a credentialed run.",
  );
}

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
  // This host runs authentik itself, so it uses the server's embedded outpost
  // rather than the authentik-outpost sidecar, which is suppressed by
  // docker/alpha-site/authentik-outpost/.ignore. Step 4 of section 4 in
  // docs/cluster-consolidation/07-authentik-to-alpha-site.md.
  //
  // No embeddedOutpostName: the live server calls it exactly "authentik Embedded
  // Outpost", the default in DockgeLxc — checked against the API rather than
  // assumed, which closes open question 6 in that document.
  useEmbeddedOutpost: true,
  // The forwardAuth target moves from the sidecar's service name to the authentik
  // server container on this host. Inert today — nothing here routes through that
  // middleware — but it has to be right before this host answers for SSO.
  authentikForwardAuthHost: "authentik-server",
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

// No OpenBaoClusterAuth here any more. This held `openbao-sgc-auth`, the
// per-cluster kubernetes auth mount for SGC's ESO — one mount per cluster,
// because a single `kubernetes` mount pins one API server and rejects every
// other cluster's ServiceAccount tokens.
//
// SGC was decommissioned and its nodes wiped on 2026-08-17, which took
// https://10.10.209.201:6443 with it. The resource then failed every refresh
// with `configured Kubernetes cluster is unreachable`, wedging this whole
// stack at UpdateFailed — removing it is step 2 of Phase 2 in
// docs/cluster-consolidation/22-decommission-sgc.md.
//
// equestria's equivalent is deliberately absent too: it still belongs to the
// bootstrap script and would need `pulumi import` to adopt. See
// components/openbao/clusterAuth.ts.
//
// Still outstanding from Phase 2: the `kubernetes-sgc` mount and the `eso-sgc`
// policy/role are `retainOnDelete`, so Pulumi never reaches them — they need
// hand-deletion (step 4).

function clusterWideDns(globals: GlobalResources) {
  StandardDns.create(
    "spike-a",
    {
      type: "A",
      hostname: pulumi.interpolate`spike.${globals.searchDomain}`,
      ipAddress: `10.10.10.10`,
    },
    globals,
    { parent: globals },
  );

  StandardDns.create(
    "spikespike-cname",
    {
      type: "CNAME",
      hostname: pulumi.interpolate`truenas.${globals.searchDomain}`,
      record: pulumi.interpolate`spike.${globals.searchDomain}`,
    },
    globals,
    { parent: globals },
  );

  StandardDns.create(
    "discord-a",
    {
      type: "A",
      hostname: pulumi.interpolate`discord.${globals.searchDomain}`,
      ipAddress: `10.10.0.1`,
    },
    globals,
    { parent: globals },
  );

  StandardDns.create(
    "discord-cname",
    {
      type: "CNAME",
      hostname: pulumi.interpolate`unifi.${globals.searchDomain}`,
      record: pulumi.interpolate`discord.${globals.searchDomain}`,
    },
    globals,
    { parent: globals },
  );

  StandardDns.create(
    "automation-a",
    {
      type: "A",
      hostname: pulumi.interpolate`replicator.${globals.searchDomain}`,
      ipAddress: `10.10.206.203`,
    },
    globals,
    { parent: globals },
  );
}
