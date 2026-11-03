/**
 * The self-hosted NetBird control plane's infrastructure
 * (docs/plans/netbird-mirror.md, epic #2880).
 *
 * Two clouds. On OCI Always Free: the tenancy's free-tier guard (quota
 * allow-list + budget), its network, and the one A1 VM, which is parked
 * (`ociVm: false`) while Ashburn has no capacity. On Azure (#3001): the East US
 * 2 VM that is the primary since 2026-11-03. Then the NetBird combined server
 * (#3000) on the primary, the `netbird.<root domain>` record that points at
 * it, and what makes the server disposable (#2884): 15-minute backups to
 * Garage with a restore before every start.
 */
import * as cloudflare from "@pulumi/cloudflare";
import * as oci from "@pulumi/oci";
import type { Input, Output, Resource } from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { TailnetKey } from "@pulumi/tailscale";
import * as tls from "@pulumi/tls";
import { AzureEdgeVm } from "components/azure/AzureEdgeVm.ts";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import { Tailscale } from "components/constants.ts";
import { rootDomain } from "components/domains.ts";
import { GlobalResources } from "components/globals.ts";
import { addUptimeGatus, toGatusKey } from "components/helpers.ts";
import { BACKUP_HEARTBEAT_GROUP, backupHeartbeat, NETBIRD_BACKUP_BAO_PATH, NETBIRD_BACKUP_BUCKET, resticRepository } from "components/netbird/backup.ts";
import { NetbirdServer, type NetbirdServerArgs } from "components/netbird/NetbirdServer.ts";
import { instanceAlarms } from "components/oci/alarms.ts";
import { BOOT_VOLUME_BACKUP_COPIES, bootVolumeBackupSchedule, FREE_TIER, freeTierQuotaStatements, retainedBackupCopies } from "components/oci/freeTier.ts";
import { OciFreeTierInstance } from "components/oci/OciFreeTierInstance.ts";
import { netbirdEdgeCloudInit, PUBLIC_TCP_PORTS, PUBLIC_UDP_PORTS } from "./cloudInit.ts";

const config = new pulumi.Config();
// Which of Ashburn's three ADs holds the VM. Changing it moves the quota pin
// with it; try another when A1 reports "Out of host capacity".
const availabilityDomainIndex = config.getNumber("availabilityDomainIndex") ?? 0;
// Kept as an encrypted stack secret: the repo is public.
const budgetAlertEmail = config.requireSecret("budgetAlertEmail");
// Whether the A1 VM (and the server, its backups and alarms) exists. Off since
// 2026-11-03: Ashburn had no free-tier compute for this free-only tenancy (A1
// at every size and E2.1.Micro, all three ADs), and the create failed the whole
// stack. Until it returns the server runs on Azure (#3001); the quotas, budget,
// network, reserved secrets and backup key stay so turning this on is enough.
const ociVmEnabled = config.getBoolean("ociVm") ?? true;

const hostname = "netbird-edge";
// Outside the home LAN (10.10/16) and NetBird's overlay (10.100/16).
const vcnCidr = "10.250.0.0/16";
const subnetCidr = "10.250.1.0/24";

const globals = new GlobalResources({}, {});
const provider = globals.ociProvider;
const tenancyId = globals.ociCredential.tenancy_ocid;
const opts = { provider };

const homeAd = oci.identity.getAvailabilityDomainsOutput({ compartmentId: tenancyId }, opts).availabilityDomains.apply(ads => {
  const ad = ads[availabilityDomainIndex];
  if (!ad) throw new Error(`availabilityDomainIndex ${availabilityDomainIndex} is out of range (${ads.length} ADs)`);
  return ad.name;
});

// ── Free-tier guard, tenancy-wide ────────────────────────────────────────
// Quotas block creation server-side; the budget only alerts. Both cover the
// whole tenancy, not just this stack's compartment.
const freeTierQuota = new oci.limits.Quota(
  "free-tier",
  {
    compartmentId: tenancyId,
    name: "free-tier-allowlist",
    description: "Always Free allow-list, managed by stacks/netbird-edge",
    statements: homeAd.apply(freeTierQuotaStatements),
  },
  opts,
);

const budget = new oci.budget.Budget(
  "zero-spend",
  {
    compartmentId: tenancyId,
    displayName: "zero-spend",
    description: "Alerts on any spend in the Always Free tenancy",
    amount: 1,
    resetPeriod: "MONTHLY",
    targetType: "COMPARTMENT",
    targets: [tenancyId],
    processingPeriodType: "MONTH",
  },
  opts,
);
new oci.budget.Rule(
  "any-actual-spend",
  {
    budgetId: budget.id,
    displayName: "any-actual-spend",
    type: "ACTUAL",
    thresholdType: "ABSOLUTE",
    threshold: 0.01,
    recipients: budgetAlertEmail,
    message: "OCI spend is above $0 on the Always Free tenancy. Check stacks/netbird-edge.",
  },
  opts,
);
new oci.budget.Rule(
  "forecast-spend",
  {
    budgetId: budget.id,
    displayName: "forecast-spend",
    type: "FORECAST",
    thresholdType: "PERCENTAGE",
    threshold: 50,
    recipients: budgetAlertEmail,
    message: "OCI forecasts spend on the Always Free tenancy. Check stacks/netbird-edge.",
  },
  opts,
);

// ── Network ──────────────────────────────────────────────────────────────
const compartment = new oci.identity.Compartment("netbird", { compartmentId: tenancyId, name: "netbird", description: "NetBird control plane (stacks/netbird-edge)", enableDelete: true }, opts);
const compartmentId = compartment.id;

const vcn = new oci.core.Vcn("netbird", { compartmentId, cidrBlocks: [vcnCidr], displayName: "netbird", dnsLabel: "netbird" }, opts);
const internetGateway = new oci.core.InternetGateway("netbird", { compartmentId, vcnId: vcn.id, displayName: "netbird", enabled: true }, opts);
const routeTable = new oci.core.RouteTable(
  "netbird",
  {
    compartmentId,
    vcnId: vcn.id,
    displayName: "netbird",
    routeRules: [{ destination: "0.0.0.0/0", destinationType: "CIDR_BLOCK", networkEntityId: internetGateway.id }],
  },
  opts,
);

// The VCN's default security list allows 22/tcp from anywhere. Take it over
// and leave only egress plus the ICMP path-MTU messages; the NSG below is the
// one place inbound ports are opened.
new oci.core.DefaultSecurityList(
  "netbird-default",
  {
    manageDefaultResourceId: vcn.defaultSecurityListId,
    compartmentId,
    displayName: "netbird-default",
    egressSecurityRules: [{ destination: "0.0.0.0/0", protocol: "all" }],
    ingressSecurityRules: [
      { source: "0.0.0.0/0", protocol: "1", icmpOptions: { type: 3, code: 4 } },
      { source: vcnCidr, protocol: "1", icmpOptions: { type: 3 } },
    ],
  },
  opts,
);

const subnet = new oci.core.Subnet("netbird", { compartmentId, vcnId: vcn.id, cidrBlock: subnetCidr, displayName: "netbird", dnsLabel: "edge", routeTableId: routeTable.id, prohibitPublicIpOnVnic: false }, opts);

const nsg = new oci.core.NetworkSecurityGroup("netbird", { compartmentId, vcnId: vcn.id, displayName: "netbird-public" }, opts);
const PROTOCOL = { tcp: "6", udp: "17" } as const;
for (const [protocol, ports] of [
  ["tcp", PUBLIC_TCP_PORTS],
  ["udp", PUBLIC_UDP_PORTS],
] as const) {
  for (const port of ports) {
    const range = { destinationPortRange: { min: port, max: port } };
    new oci.core.NetworkSecurityGroupSecurityRule(
      `netbird-${protocol}-${port}`,
      {
        networkSecurityGroupId: nsg.id,
        direction: "INGRESS",
        protocol: PROTOCOL[protocol],
        source: "0.0.0.0/0",
        sourceType: "CIDR_BLOCK",
        description: `NetBird ${protocol}/${port}`,
        ...(protocol === "tcp" ? { tcpOptions: range } : { udpOptions: range }),
      },
      opts,
    );
  }
}

// ── The VM ───────────────────────────────────────────────────────────────
// Joins the tailnet as tag:netbird-edge (admins only; see
// configureNetbirdEdgeAccess in stacks/unifi-network/acl-manager.ts).
const tailscaleAuthKey = new TailnetKey(
  "netbird-edge-authkey",
  {
    reusable: true,
    preauthorized: true,
    ephemeral: false,
    recreateIfInvalid: "always",
    tags: [Tailscale.tag.netbirdEdge],
    description: "netbird-edge OCI VM",
  },
  { provider: globals.tailscaleProvider },
);

// Break-glass key for OCI Bastion sessions and the Azure VMs' admin user, if
// Tailscale never comes up.
// Port 22 is not public, so the key alone opens nothing.
const breakGlassKey = new tls.PrivateKey("netbird-edge-break-glass", { algorithm: "ED25519" });

const vm = !ociVmEnabled
  ? undefined
  : new OciFreeTierInstance(
      hostname,
      {
        compartmentId,
        availabilityDomain: homeAd,
        subnetId: subnet.id,
        nsgIds: [nsg.id],
        region: globals.ociCredential.region,
        hostname,
        sshAuthorizedKeys: breakGlassKey.publicKeyOpenssh,
        userData: netbirdEdgeCloudInit({ platform: "oci", hostname, tailscaleAuthKey: tailscaleAuthKey.key, tailscaleTag: Tailscale.tag.netbirdEdge }),
        provider,
      },
      // The quota first: on 2026-11-03 the VM create raced the quota update that
      // added the regional A1 counts (quota modified 14:38:11.9, create rejected
      // 14:38:13 against the old statements).
      { dependsOn: [freeTierQuota] },
    );

// ── Boot-volume backups (#2884) ──────────────────────────────────────────
// User-defined, not OCI's Bronze/Silver/Gold, which keep more copies than the
// free 5. The quota's backup-count is the server-side stop if this ever drifts.
if (vm) {
  const bootBackupSchedule = bootVolumeBackupSchedule();
  if (retainedBackupCopies(bootBackupSchedule) > BOOT_VOLUME_BACKUP_COPIES) {
    throw new Error(`The boot-volume backup schedule keeps ${retainedBackupCopies(bootBackupSchedule)} copies; the limit is ${BOOT_VOLUME_BACKUP_COPIES}.`);
  }
  const bootBackupPolicy = new oci.core.VolumeBackupPolicy("netbird-edge-boot", { compartmentId, displayName: "netbird-edge-boot-weekly", schedules: [bootBackupSchedule] }, opts);
  // Replaced with the VM (a new boot volume). The old volume's backups stay
  // until they expire, and share the one weekly slot, so the count holds.
  new oci.core.VolumeBackupPolicyAssignment("netbird-edge-boot", { assetId: vm.instance.bootVolumeId, policyId: bootBackupPolicy.id }, opts);

  // ── Alarms (#2884) ───────────────────────────────────────────────────────
  // OCI Monitoring on the compute agent's metrics, to an email topic. Both are
  // inside the Always Free allowance. The email subscription stays PENDING until
  // the confirmation link OCI sends is clicked. The stale-backup alarm is the
  // Gatus heartbeat below, which pages through Pushover.
  const alertTopic = new oci.ons.NotificationTopic("netbird-edge-alerts", { compartmentId, name: "netbird-edge-alerts", description: "netbird-edge VM alarms (stacks/netbird-edge)" }, opts);
  new oci.ons.Subscription("netbird-edge-alerts-email", { compartmentId, topicId: alertTopic.id, protocol: "EMAIL", endpoint: budgetAlertEmail }, opts);
  // Registered outside an apply, so they show in a preview before the VM exists;
  // only the query waits for the instance id.
  for (const key of ["stopped", "lowMemory"] as const) {
    const alarm = instanceAlarms("pending")[key];
    new oci.monitoring.Alarm(
      `netbird-edge-${key}`,
      {
        compartmentId,
        metricCompartmentId: compartmentId,
        displayName: `netbird-edge-${key}`,
        namespace: alarm.namespace,
        query: vm.instance.id.apply(id => instanceAlarms(id)[key].query),
        severity: alarm.severity,
        pendingDuration: alarm.pendingDuration,
        repeatNotificationDuration: alarm.repeatNotificationDuration,
        body: alarm.summary,
        alarmSummary: alarm.summary,
        messageFormat: "ONS_OPTIMIZED",
        destinations: [alertTopic.id],
        isEnabled: true,
      },
      opts,
    );
  }
}

// ── Azure (#3001) ────────────────────────────────────────────────────────
// The primary since 2026-11-03: Ashburn has no free-tier compute for this
// tenancy, so the server runs on the Visual Studio subscription instead
// (spending limit on). Same tailnet identity as the OCI VM, so the same grants
// apply: admins SSH/web, tag:egress SSH for the deploy, the garage-s3 and
// uptime VIPs for backups. Each hostname gets its own egress Service
// (`netbird-azure-eus2`, stacks/unifi-network/tailnet-egress.ts).
const azureTailscaleAuthKey = new TailnetKey(
  "netbird-edge-azure-authkey",
  {
    reusable: true,
    preauthorized: true,
    ephemeral: false,
    recreateIfInvalid: "always",
    tags: [Tailscale.tag.netbirdEdge],
    description: "netbird-edge Azure VMs",
  },
  { provider: globals.tailscaleProvider },
);

const azureEus2Hostname = "netbird-azure-eus2";
const azureEus2 = new AzureEdgeVm(azureEus2Hostname, {
  region: "eastus2",
  hostname: azureEus2Hostname,
  publicPorts: { tcp: PUBLIC_TCP_PORTS, udp: PUBLIC_UDP_PORTS },
  sshPublicKey: breakGlassKey.publicKeyOpenssh,
  userData: netbirdEdgeCloudInit({ platform: "azure", hostname: azureEus2Hostname, tailscaleAuthKey: azureTailscaleAuthKey.key, tailscaleTag: Tailscale.tag.netbirdEdge }),
  provider: globals.azureProvider,
});

// ── NetBird server (#3000) ───────────────────────────────────────────────
const root = rootDomain();
const domain = `netbird.${root}`;

/** A machine that can run the NetBird server. */
interface EdgeHost {
  /** The `netbird-edge:primary` value that selects it. */
  id: "oci" | "azure-eus2";
  /** Its tailnet name, and the snapshots' restic host. */
  hostname: string;
  publicIpAddress: Output<string>;
  /** Changes when the machine is replaced, so every deploy step reruns there. */
  hostKey: Input<string>;
  /** What the first SSH session waits for. */
  machine: Resource;
}
const hosts: EdgeHost[] = [
  ...(vm ? [{ id: "oci" as const, hostname, publicIpAddress: vm.publicIpAddress, hostKey: vm.instance.id, machine: vm.instance }] : []),
  { id: "azure-eus2", hostname: azureEus2Hostname, publicIpAddress: azureEus2.publicIpAddress, hostKey: azureEus2.vmId, machine: azureEus2.vm },
];

// The one host `netbird.<root domain>` points at. Until the DNS-lease fence
// lands (#3001's second half), it is also the only host that runs a server: two
// unfenced managements on one store would split it.
const primaryId = config.get("primary") ?? "azure-eus2";
const primary = hosts.find(h => h.id === primaryId);
if (!primary) throw new Error(`netbird-edge:primary is '${primaryId}', which is not one of this stack's hosts (${hosts.map(h => h.id).join(", ")}). Is ociVm off?`);

// Where `/api/setup` ran, once, ever. Not "the primary": a failback moves the
// primary, and setup must neither move with it nor run again. Only this host's
// server carries `setup`, so the owner PAT in OpenBao has exactly one writer.
const SETUP_HOST: EdgeHost["id"] = "azure-eus2";
if (primary.id !== SETUP_HOST) {
  throw new Error(`netbird-edge:primary must stay '${SETUP_HOST}' until the DNS-lease fence (#3001) can stop a second management; it is '${primary.id}'.`);
}

// Cloudflare only, grey-cloud: STUN is UDP and the gRPC streams must reach
// Traefik directly, and Let's Encrypt's TLS-ALPN check needs it before the
// server's first start. Not StandardDns: its UniFi and Technitium copies would
// keep LAN clients on a dead primary after the watchdog repoints this record
// (#3001), and the name is public anyway, so LAN DNS forwards it upstream.
// 60s: failover is a repoint of this record.
const dnsRecord = new cloudflare.DnsRecord(
  "netbird-lease",
  { zoneId: globals.cloudflareCredential.zoneId, name: domain, type: "A", content: primary.publicIpAddress, ttl: 60, proxied: false, comment: "stacks/netbird-edge: the NetBird management lease (#3001)" },
  // Same as StandardDns: the zone id arrives as a secret and reads back plain.
  { provider: globals.cloudflareProvider, ignoreChanges: ["zoneId"] },
);

// Generated once. The store key is the one that matters: lose it and the
// SQLite store's user data cannot be decrypted (bootstrap/INVENTORY.md).
// Every host gets the same: a standby restores the primary's store with them.
const base64Key = (name: string) => new random.RandomBytes(name, { length: 32 }).base64;
const serverSecrets = {
  relayAuthSecret: base64Key("netbird-relay-auth-secret"),
  datastoreEncryptionKey: base64Key("netbird-datastore-encryption-key"),
  sessionCookieEncryptionKey: base64Key("netbird-session-cookie-key"),
};
const owner = {
  email: `netbird-admin@${root}`,
  password: new random.RandomPassword("netbird-owner-password", { length: 32, special: false }).result,
  name: "NetBird break-glass admin",
};

// ── Backups (#2884) ──────────────────────────────────────────────────────
// stacks/system (garage.ts) owns the bucket and its key, being the one writer
// of Garage state, and records the key at NETBIRD_BACKUP_BAO_PATH. A preview
// before that has run shows placeholders; an update fails instead, because a
// server without backup credentials cannot tell an empty repository from an
// unreachable one, and its restore refuses to guess.
const backupKey = globals.store.tryGetSecretByPath<{ endpoint: string; bucket: string; username: string; password: string }>(NETBIRD_BACKUP_BAO_PATH).apply(key => {
  if (key) return key;
  const missing = `No secrets/${NETBIRD_BACKUP_BAO_PATH} in OpenBao: stacks/system (garage.ts) creates the '${NETBIRD_BACKUP_BUCKET}' bucket and key and records them there. Run it first.`;
  if (!pulumi.runtime.isDryRun()) throw new Error(missing);
  pulumi.log.warn(`${missing} Previewing with placeholder credentials.`);
  return { endpoint: "https://garage-s3.invalid", bucket: NETBIRD_BACKUP_BUCKET, username: "pending-stacks-system", password: "pending-stacks-system" };
});
// The repository's encryption key. The snapshots hold the store AND
// config.yaml (the store key, the relay secret), so Garage only ever sees
// ciphertext. Generated once; every host reads the same one.
const resticPassword = new random.RandomPassword("netbird-backup-restic-password", { length: 48, special: false }).result;
// One heartbeat for the service, not per host: the backup script reports only
// while netbird-server runs, so it is whichever host is active.
const heartbeatName = "netbird-server";
const heartbeatToken = toGatusKey(BACKUP_HEARTBEAT_GROUP, heartbeatName);

// The stale-backup alarm: Gatus pages when a run reports a failure, or when no
// run has reported for 30 minutes (components/netbird/backup.ts).
addUptimeGatus("netbird-backup", globals, {
  endpoints: [],
  "external-endpoints": [backupHeartbeat({ name: heartbeatName, group: BACKUP_HEARTBEAT_GROUP, token: heartbeatToken })],
});

/** The parts of NetbirdServerArgs every host shares; only the machine differs. */
function serverArgs(host: EdgeHost): NetbirdServerArgs {
  return {
    // Over the tailnet: the operator's pods reach the VM through its
    // `netbird-<server>` egress Service (stacks/unifi-network/tailnet-egress.ts),
    // which tag:egress may SSH into as root (configureNetbirdEdgeAccess).
    // Tailscale SSH authorises by tailnet identity, so the key is never checked
    // there; it is passed for the break-glass path only.
    connection: {
      host: pulumi.interpolate`${host.hostname}.${globals.tailscaleDomain}`,
      user: "root",
      privateKey: breakGlassKey.privateKeyOpenssh,
    },
    domain,
    secrets: serverSecrets,
    // 365 days is the API's ceiling. stacks/netbird replaces it with a service
    // user's token; this one stays as the owner's break-glass credential.
    setup: host.id === SETUP_HOST ? { ...owner, patExpireInDays: 365 } : undefined,
    // Over the tailnet to the garage-s3 and uptime VIPs, which tag:netbird-edge
    // may reach on 443 (the `netbird-edge-backups` grant).
    backup: {
      repository: pulumi.secret(backupKey.apply(key => resticRepository({ endpoint: key.endpoint, bucket: key.bucket }))),
      accessKeyId: pulumi.secret(backupKey.username),
      secretAccessKey: pulumi.secret(backupKey.password),
      resticPassword,
      host: host.hostname,
      heartbeat: { url: pulumi.interpolate`https://uptime.${globals.tailscaleDomain}`, token: heartbeatToken },
    },
    // A replacement VM reruns every deploy step, the restore first.
    hostKey: host.hostKey,
    dependsOn: [host.machine, dnsRecord],
  };
}

const server = new NetbirdServer(primary.hostname, serverArgs(primary));

if (globals.baoDualWriteEnabled) {
  const bao = { provider: globals.baoProvider };
  baoKvSecret(
    "netbird-server-secrets",
    {
      mount: "secrets",
      path: "apps/netbird/server",
      // resticPassword opens the backups in Garage (#2884); without it they
      // are unreadable.
      data: { ...serverSecrets, resticPassword },
      concealedFields: [...Object.keys(serverSecrets), "resticPassword"],
      customMetadata: baoProvenance({ source: "stacks/netbird-edge" }),
    },
    bao,
  );
  const setupResult = server.setupResult;
  if (!setupResult) throw new Error(`The ${SETUP_HOST} server has no setup result; the owner PAT would never reach OpenBao.`);
  baoKvSecret(
    "netbird-owner",
    {
      mount: "secrets",
      path: "third-party-tokens/netbird/owner",
      data: {
        url: `https://${domain}`,
        email: owner.email,
        password: owner.password,
        user_id: setupResult.userId,
        personal_access_token: setupResult.personalAccessToken,
      },
      concealedFields: ["password", "personal_access_token"],
      customMetadata: baoProvenance({ source: "stacks/netbird-edge" }),
    },
    bao,
  );
} else {
  // Not a warning: setup runs exactly once, so a run that skipped this would
  // leave the owner PAT in Pulumi state alone.
  throw new Error("stacks/netbird-edge needs OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID): it writes the NetBird store key and the one-time owner PAT there.");
}

/** The address `netbird.<root domain>` points at. */
export const publicIpAddress = primary.publicIpAddress;
export const primaryHost = primary.hostname;
export const hostAddresses = Object.fromEntries(hosts.map(h => [h.hostname, h.publicIpAddress]));
export const availabilityDomain = homeAd;
export const freeTier = FREE_TIER;
/** `present`, `fresh` or `restored <snapshot>`: what the last deploy's pre-start restore found. */
export const restoreResult = server.restoreResult;
export const breakGlassPrivateKey = pulumi.secret(breakGlassKey.privateKeyOpenssh);
