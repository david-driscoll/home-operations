/**
 * The self-hosted NetBird control plane's infrastructure on OCI Always Free
 * (docs/plans/netbird-mirror.md, epic #2880).
 *
 * This stack owns the tenancy's free-tier guard (quota allow-list + budget),
 * the one A1 VM, the NetBird combined server on it (#3000), and what makes
 * that server disposable (#2884): 15-minute backups to Garage with a restore
 * before every start, a boot-volume backup policy, and the alarms. The Azure
 * fallback lands here in #3001.
 */
import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { TailnetKey } from "@pulumi/tailscale";
import * as tls from "@pulumi/tls";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import { Tailscale } from "components/constants.ts";
import { rootDomain } from "components/domains.ts";
import { GlobalResources } from "components/globals.ts";
import { addUptimeGatus, toGatusKey } from "components/helpers.ts";
import { BACKUP_HEARTBEAT_GROUP, backupHeartbeat, NETBIRD_BACKUP_BAO_PATH, NETBIRD_BACKUP_BUCKET, resticRepository } from "components/netbird/backup.ts";
import { NetbirdServer } from "components/netbird/NetbirdServer.ts";
import { instanceAlarms } from "components/oci/alarms.ts";
import { BOOT_VOLUME_BACKUP_COPIES, bootVolumeBackupSchedule, FREE_TIER, freeTierQuotaStatements, retainedBackupCopies } from "components/oci/freeTier.ts";
import { OciFreeTierInstance } from "components/oci/OciFreeTierInstance.ts";
import { StandardDns } from "components/StandardDns.ts";
import { netbirdEdgeCloudInit, PUBLIC_TCP_PORTS, PUBLIC_UDP_PORTS } from "./cloudInit.ts";

const config = new pulumi.Config();
// Which of Ashburn's three ADs holds the VM. Changing it moves the quota pin
// with it; try another when A1 reports "Out of host capacity".
const availabilityDomainIndex = config.getNumber("availabilityDomainIndex") ?? 0;
// Kept as an encrypted stack secret: the repo is public.
const budgetAlertEmail = config.requireSecret("budgetAlertEmail");

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
new oci.limits.Quota(
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

// Break-glass key for OCI Bastion sessions if Tailscale never comes up.
// Port 22 is not public, so the key alone opens nothing.
const breakGlassKey = new tls.PrivateKey("netbird-edge-break-glass", { algorithm: "ED25519" });

const vm = new OciFreeTierInstance(hostname, {
  compartmentId,
  availabilityDomain: homeAd,
  subnetId: subnet.id,
  nsgIds: [nsg.id],
  region: globals.ociCredential.region,
  hostname,
  sshAuthorizedKeys: breakGlassKey.publicKeyOpenssh,
  userData: netbirdEdgeCloudInit({ hostname, tailscaleAuthKey: tailscaleAuthKey.key, tailscaleTag: Tailscale.tag.netbirdEdge }),
  provider,
});

// ── Boot-volume backups (#2884) ──────────────────────────────────────────
// User-defined, not OCI's Bronze/Silver/Gold, which keep more copies than the
// free 5. The quota's backup-count is the server-side stop if this ever drifts.
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

// ── NetBird server (#3000) ───────────────────────────────────────────────
const root = rootDomain();
const domain = `netbird.${root}`;
// Grey-cloud by construction (StandardDns never proxies): STUN is UDP and the
// gRPC streams must reach Traefik directly. Let's Encrypt's TLS-ALPN check
// needs this record before the server's first start.
// 60s: the Azure fallback (#3001) fails over by repointing this record.
const dnsRecord = await StandardDns.create("netbird", { hostname: domain, ipAddress: vm.publicIpAddress, type: "A", ttl: 60 }, globals, {});

// Generated once. The store key is the one that matters: lose it and the
// SQLite store's user data cannot be decrypted (bootstrap/INVENTORY.md).
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
// ciphertext. Generated once; the Azure standby (#3001) reads the same one.
const resticPassword = new random.RandomPassword("netbird-backup-restic-password", { length: 48, special: false }).result;
const heartbeatToken = toGatusKey(BACKUP_HEARTBEAT_GROUP, hostname);

// The stale-backup alarm: Gatus pages when a run reports a failure, or when no
// run has reported for 30 minutes (components/netbird/backup.ts).
addUptimeGatus("netbird-backup", globals, {
  endpoints: [],
  "external-endpoints": [backupHeartbeat({ name: hostname, group: BACKUP_HEARTBEAT_GROUP, token: heartbeatToken })],
});

const server = new NetbirdServer("netbird", {
  // Over the tailnet: the operator's pods reach the VM through the
  // `netbird-edge` egress Service (stacks/unifi-network/tailnet-egress.ts),
  // which tag:egress may SSH into as root (configureNetbirdEdgeAccess).
  // Tailscale SSH authorises by tailnet identity, so the key is never checked
  // there; it is passed for the Bastion path only.
  connection: {
    host: pulumi.interpolate`${hostname}.${globals.tailscaleDomain}`,
    user: "root",
    privateKey: breakGlassKey.privateKeyOpenssh,
  },
  domain,
  secrets: serverSecrets,
  // 365 days is the API's ceiling. #2885 replaces it with a service user's
  // token; this one stays as the owner's break-glass credential.
  setup: { ...owner, patExpireInDays: 365 },
  // Over the tailnet to the garage-s3 and uptime VIPs, which tag:netbird-edge
  // may reach on 443 (the `netbird-edge-backups` grant).
  backup: {
    repository: pulumi.secret(backupKey.apply(key => resticRepository({ endpoint: key.endpoint, bucket: key.bucket }))),
    accessKeyId: pulumi.secret(backupKey.username),
    secretAccessKey: pulumi.secret(backupKey.password),
    resticPassword,
    host: hostname,
    heartbeat: { url: pulumi.interpolate`https://uptime.${globals.tailscaleDomain}`, token: heartbeatToken },
  },
  // A replacement VM reruns every deploy step, the restore first.
  hostKey: vm.instance.id,
  dependsOn: [vm.instance, dnsRecord],
});

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
  baoKvSecret(
    "netbird-owner",
    {
      mount: "secrets",
      path: "third-party-tokens/netbird/owner",
      data: {
        url: `https://${domain}`,
        email: owner.email,
        password: owner.password,
        user_id: server.setupResult!.userId,
        personal_access_token: server.setupResult!.personalAccessToken,
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

export const publicIpAddress = vm.publicIpAddress;
export const privateIpAddress = vm.privateIpAddress;
export const availabilityDomain = homeAd;
export const freeTier = FREE_TIER;
/** `present`, `fresh` or `restored <snapshot>`: what the last deploy's pre-start restore found. */
export const restoreResult = server.restoreResult;
export const breakGlassPrivateKey = pulumi.secret(breakGlassKey.privateKeyOpenssh);
