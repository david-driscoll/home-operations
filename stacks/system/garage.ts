/**
 * Buckets, keys and credential distribution for the geo-distributed Garage
 * cluster on the celestia/luna/skystar dockge hosts (docker/_common/garage).
 *
 * Lives in the system stack rather than a stack of its own (review decision on
 * PR #1233): it is estate configuration other things consume, exactly like the
 * cluster definitions this stack publishes. The one ordering rule it inherits
 * is the header rule in index.ts — nothing here may call `getAllClusters()` /
 * `getCluster()` / `getDockerClusters()`, because this stack WRITES what those
 * read. This module honors that: its only store reads are `getDockgeInstances`
 * (`hosts/dockge/*`, written by the site stacks) and, through
 * `globals.garageProvider`, `docker/apps/garage/admin-token` (minted by the
 * bootstrap ceremony) — neither is produced here.
 *
 * This is the ONLY writer of bucket/key state on the Garage cluster — the
 * Admin API is its interface (@axnic/pulumi-garage, provider constructed in
 * components/globals.ts like every other provider). Hand-created buckets are
 * invisible to it and will collide with a later `pulumi up`; don't.
 *
 * It does not — cannot — bootstrap the cluster itself: node connection and
 * `garage layout assign`/`apply` are a one-shot ceremony the provider
 * deliberately leaves out of scope. Run docs/garage-offsite-s3.md first; this
 * module fails against an un-laid-out cluster, loudly, which is the right
 * order of operations making itself known.
 */
import * as garage from "@axnic/pulumi-garage";
import { BACKREST_CREDENTIALS_DIR, BACKREST_CREDENTIALS_FILE, BACKREST_CREDENTIALS_PROFILE, backrestGarageBucket, backrestGarageEndpoint } from "@components/backrestGarage.ts";
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import { Tailscale } from "@components/constants.ts";
import { GARAGE_COPY_BUCKETS, GARAGE_COPY_KEYS, garageCopyEndpoint } from "@components/garageTruenasCopy.ts";
import type { GlobalResources } from "@components/globals.ts";
import { copyFileToRemote } from "@components/helpers.ts";
import type { DockgeLxcDefinition } from "@components/store/index.ts";
import { configureGarageCopy } from "@components/truenas.ts";
import { remote } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";

// The garage cluster membership. A layout fact, not a derivable one: every
// dockge host EXCEPT alpha-site runs a node (docker/alpha-site/garage/.ignore
// is the other half of this statement — change both together or the sync
// heartbeats and the buckets disagree about the estate).
//
// ⚠️ SKYSTAR STAYS IN THIS LIST EVEN THOUGH `clusters/skystar.yaml` IS
// DISABLED (2026-09-15), and removing it is not the tidy-up it looks like.
// This list is the BUCKET layout, not the set of live hosts: each entry owns a
// `postgres-<cluster>` bucket created by `backupBucket`, which carries
// `protect: true` and `retainOnDelete: true` precisely so no refactor can
// discard a recovery window. Drop an entry and `pulumi up` does not quietly
// delete the bucket — it REFUSES, and the stack fails on a protected
// resource instead of on a missing host.
//
// Retiring a site for real means deciding what happens to its dumps first,
// then removing the guard by hand, then this entry. Until someone does that,
// the bucket outlives the host and `deliverCredentialFile` skips the file
// copy with a warning.
const GARAGE_CLUSTERS = ["celestia", "luna", "skystar"] as const;

// The SigV4 region — must match s3_api.s3_region in
// docker/_common/garage/garage.toml.
const REGION = "garage";

const GiB = 1024 ** 3;

// Per-bucket hard limits. Each node's ZFS share is declared as 4T
// (garage.toml data_dir capacity + the layout ceremony's `-c 4T`), but Garage
// capacity is a placement weight, not a stop — quotas are the thing that
// actually refuses a write. Sized generously against today's data (the CNPG
// archive is single-digit GiB, a dump window is smaller still) and summing
// well under the 4T share, so hitting one means something is WRONG — retention
// stopped pruning, a runaway WAL burst — not that the estate grew.
const CNPG_BUCKET_QUOTA = 512 * GiB;
const DUMPS_BUCKET_QUOTA = 128 * GiB;
// The staging tree of the in-cluster buckets, about 1.3 MB when phase 3 of
// docs/plans/host-owned-backups.md started. Was 2 TiB until that phase raised
// VolSync's quota (below); halving it keeps every quota summed under the 4T
// share. It retires with its bucket at the end of phase 4.
const MIRROR_BUCKET_QUOTA = 1024 * GiB;

// The restic buckets of docs/plans/host-owned-backups.md §C2 (phase 2, step 2):
// 100 GiB each, a placeholder David set on 2026-10-01 without measuring the
// repos. Nothing writes to them yet, so the number is a ceiling to revisit
// rather than a sizing: check the real repo size in the change that first
// points a writer at one. Immich (phase 4) is the one likely to need more.
const RESTIC_BUCKET_QUOTA = 100 * GiB;

// VolSync's bucket, measured on 2026-10-01 before the first app moves (phase 3).
// The 62 apps' latest snapshots hold 99.5 GiB of data. The registry cache
// alone is 44.3 GiB, and Plex 13.4 GiB. The 15 repos that pruned in Loki's
// three-day window were about 0.7x their snapshot size once compressed, with
// history included, so the repos come to roughly 90-145 GiB. Twice the top of
// that range leaves room for the registry's churn, which no compression
// touches. Every quota here sums to about 2.75 TiB against the 4T share.
const VOLSYNC_BUCKET_QUOTA = 300 * GiB;

// The Docker hosts that each get a `backrest-<host>` bucket: the garage nodes,
// plus alpha-site, which has no node and writes through celestia's. Same rule
// as GARAGE_CLUSTERS for an offline site: skystar's bucket and key exist while
// it is away, and only the credential file waits for the host to come back.
const BACKREST_HOSTS = [...GARAGE_CLUSTERS, "alpha-site"] as const;

/** Whether a dotted IPv4 address is inside an IPv4 CIDR. False for anything that is not one. */
function inIpv4Cidr(address: string, cidr: string): boolean {
  const toInt = (dotted: string) => {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(dotted)) return undefined;
    const octets = dotted.split(".").map(Number);
    return octets.every(o => o <= 255) ? octets.reduce((n, o) => n * 256 + o, 0) : undefined;
  };
  const [network, prefix] = cidr.split("/");
  const ip = toInt(address);
  const net = toInt(network ?? "");
  const bits = Number(prefix);
  if (ip === undefined || net === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(ip / size) === Math.floor(net / size);
}

/**
 * Everything Garage: buckets, keys, OpenBao records, and the per-host
 * credential files. Called from index.ts after the cluster definitions have
 * been published, per the ordering note there.
 */
export function configureGarage(globals: GlobalResources) {
  const provider = globals.garageProvider;

  // The two SHARED tailnet services, created here and here only.
  //
  // Every garage host advertises both (the `Host(...)` labels in
  // docker/_common/garage/compose.yaml, turned into `tailscale serve` by
  // components/DockgeLxc.ts), which makes them VIP services: one name, three
  // advertisers, and the client reaches whichever node is up. That is what
  // takes celestia off the critical path for equestria's backups — the old
  // `dockge-celestia:3900` endpoint made one host a single point of failure for
  // the whole archive.
  //
  // They live in THIS stack rather than in DockgeLxc because a
  // `tailscale.Service` is one global object and DockgeLxc runs once per site
  // stack; three owners would fight over it. `SHARED_TAILSCALE_SERVICES` in
  // that file is the other half of this arrangement — the two lists must agree.
  //
  // NOT `deleteBeforeReplace`, unlike the per-host services: deleting a service
  // three hosts are actively advertising drops the endpoint for every consumer
  // at once, and the CNPG archive is one of them.
  for (const [name, description] of [
    ["garage-s3", "Garage S3 API (geo-replicated across celestia/luna/skystar)"],
    ["garage-admin", "Garage Admin API (bucket/key management)"],
  ] as const) {
    new tailscale.Service(
      `shared-tailscale-service-${name}`,
      {
        name: `svc:${name}`,
        ports: ["tcp:443"],
        tags: [Tailscale.tag.dockge, Tailscale.tag.apps],
        comment: description,
      },
      // protect `svc:garage-s3`: it is the endpoint Pulumi state is reached
      // through (stacks/unifi-network/tailnet-egress.ts), and this stack's own
      // state is behind it -- deleting it would strand the run doing the delete.
      { provider: globals.tailscaleProvider, protect: name === "garage-s3" },
    );
  }

  // What equestria reaches the S3 API through: the tailscale-operator egress
  // Service for dockge-celestia (kubernetes/apps/tailscale-system/services,
  // port declared in Update.cs), which is also a resolvable MagicDNS name for
  // local tooling. Recorded in OpenBao so the postgres ExternalSecret
  // templates it into the barman ObjectStore values without a second source
  // of truth.
  const equestriaEndpoint = pulumi.interpolate`http://dockge-celestia.${globals.tailscaleDomain}:3900`;

  /**
   * A backup bucket. protect + retainOnDelete for the same reason the minio
   * cnpg buckets in stacks/home carry them: destroying one discards a
   * recovery window, and no refactor should be able to do that without a
   * human removing the guard first. (Deleting a non-empty bucket fails at the
   * Admin API anyway — that is Garage's own behavior — but the guard stops
   * the attempt from wedging a deploy.)
   */
  function backupBucket(name: string, maxSize: number): garage.Bucket {
    return new garage.Bucket(name, { globalAlias: name, quotas: { maxSize } }, { provider, protect: true, retainOnDelete: true });
  }

  /** A key plus a read/write grant on exactly one bucket — least privilege per consumer. */
  function readWriteKey(name: string, bucket: garage.Bucket): garage.Key {
    const key = new garage.Key(name, { name }, { provider });
    new garage.BucketKeyPermission(
      `${name}-rw`,
      {
        bucketId: bucket.id,
        accessKeyId: key.accessKeyId,
        permissions: { read: true, write: true },
      },
      { provider },
    );
    return key;
  }

  const warnNoBao = (what: string) =>
    pulumi.log.warn(
      `No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the OpenBao record for ${what}. The key still exists in Garage, but nothing consuming that path will see it until a credentialed run.`,
    );

  /**
   * Deliver a credential file to a dockge host. The consuming loops
   * (docker/_common/garage/{sync,mirror}.sh) re-read their file every cycle,
   * so a rotation — or the very first mint — converges on the next cycle with
   * no container restart. Same delivery shape as the backrest garage.conf in
   * components/BackupPlanDirector.ts, for the same reason: the credential
   * stays out of the rendered stack files and rotation is one file write.
   *
   * `target` defaults to the garage stack's directory and uid; backrest's
   * files go to its own directory, owned by the uid it runs as.
   */
  function deliverCredentialFile(
    clusterKey: string,
    fileName: string,
    content: pulumi.Output<string>,
    instances: pulumi.Unwrap<DockgeLxcDefinition>[],
    target: { dir: string; owner: string } = { dir: "/opt/stacks-data/garage", owner: "3900:70" },
  ) {
    const instance = instances.find(i => i.name === `${clusterKey}-dockge`);
    if (!instance) {
      // WARN AND SKIP, NOT THROW — and the difference is the whole point of
      // this block.
      //
      // A missing inventory item means one of two things, and only one of them
      // is a problem:
      //
      //   1. the site stack has not run yet for a host that DOES exist — the
      //      case the original `throw` was written for. The credential simply
      //      is not mintable yet; the next credentialed run delivers it.
      //   2. the site is DISABLED or retired, and its host is gone for good —
      //      `clusters/skystar.yaml.disabled`, 2026-09-15.
      //
      // Neither is worth taking the whole stack down for, and throwing did
      // exactly that: `stacks/system` failed on every run from the moment
      // skystar was disabled, which stopped it creating
      // `database/static-roles/<app>` for EVERY new app carrying
      // `components/postgres` — a Jellyfin test instance was the one that
      // found it, stuck in CreateContainerConfigError waiting on a password
      // this stack had not minted. One retired dockge host should not be able
      // to block every future database in the estate.
      //
      // ⚠️ GARAGE_CLUSTERS IS NOT THE PLACE TO FIX THIS. Dropping a cluster
      // from that list removes its `postgres-<cluster>` bucket from the
      // program, and `backupBucket` sets `protect: true` — so Pulumi refuses
      // the delete and the stack fails a different way, on a resource holding
      // a recovery window. The bucket and key are meant to outlive the host:
      // the dumps in them stay readable from any node in the garage cluster.
      // What cannot outlive the host is the file copy, because there is no
      // longer a machine to scp it to. So the layout list stays whole and
      // delivery degrades.
      //
      // The consuming loop treats an absent file as "idle" already — that is
      // how luna/skystar know not to mirror (see the mirror.env note below) —
      // so skipping degrades to the documented no-op rather than a broken
      // host.
      pulumi.log.warn(
        `No dockge inventory item named '${clusterKey}-dockge' under secrets/hosts/dockge/ — skipping ${fileName} delivery. The bucket and key still exist in Garage; nothing on that host will use them until the site stack runs again and a credentialed run re-delivers the file. If '${clusterKey}' is retired, this warning is the expected steady state.`,
      );
      return;
    }
    // The inventory item's ssh section carries the password too (concealed in
    // OpenBao); the checked-in interface only names hostname/username.
    const ssh = instance.ssh as DockgeLxcDefinition["ssh"] & { password: string };
    const connection = { host: ssh.hostname, user: ssh.username, password: pulumi.secret(ssh.password) };

    const remotePath = `${target.dir}/${fileName}`;
    const file = copyFileToRemote(`${clusterKey}-garage-${fileName}`, {
      connection,
      remotePath,
      content,
    });

    // 600 and owned by the consuming service's uid (the garage loops run as
    // 3900, gid 70 — see the user: lines in docker/_common/garage/compose.yaml):
    // the file holds a live S3 credential and nothing but its consumer should be
    // able to read it.
    return file.apply(
      f =>
        new remote.Command(
          `${clusterKey}-garage-${fileName}-perms`,
          {
            connection,
            create: `chown ${target.owner} ${remotePath} && chmod 600 ${remotePath}`,
            triggers: [f.id],
          },
          { dependsOn: [f] },
        ),
    );
  }

  const credentialFile = (key: garage.Key, consumer: string) =>
    pulumi.interpolate`# Written by stacks/system (garage.ts) — do not edit by hand; a rotation reruns that stack.
# Consumed by docker/_common/garage/${consumer} (sourced with set -a each cycle).
RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID=${key.accessKeyId}
RCLONE_CONFIG_GARAGE_SECRET_ACCESS_KEY=${key.secretAccessKey}
`;

  /**
   * A host's backrest key as an AWS shared credentials file. A Garage-backed
   * repo names it in its env (AWS_SHARED_CREDENTIALS_FILE, AWS_PROFILE) and
   * restic's credential chain reads it, so no key lands in config.json or in
   * Backrest's UI — the rule garage.conf follows too
   * (docs/plans/host-owned-backups.md §C2).
   */
  const backrestCredentialFile = (key: garage.Key) =>
    pulumi.interpolate`# Written by stacks/system (garage.ts) — do not edit by hand; a rotation reruns that stack.
# Consumed by this host's backrest, through each Garage-backed repo's env:
# AWS_SHARED_CREDENTIALS_FILE=${BACKREST_CREDENTIALS_DIR}/${BACKREST_CREDENTIALS_FILE} and AWS_PROFILE=${BACKREST_CREDENTIALS_PROFILE}.
[${BACKREST_CREDENTIALS_PROFILE}]
aws_access_key_id = ${key.accessKeyId}
aws_secret_access_key = ${key.secretAccessKey}
`;

  /**
   * The OpenBao record of a key, in the shape every record here has. For its
   * consumer where one reads OpenBao, and for humans and recovery always.
   */
  function keyRecord(resourceName: string, args: { path: string; endpoint: pulumi.Input<string>; bucket: string; key: garage.Key; sourceTitle: string; cluster?: string }) {
    if (!globals.baoDualWriteEnabled) {
      warnNoBao(`${args.sourceTitle} (${args.path})`);
      return;
    }
    baoKvSecret(
      resourceName,
      {
        mount: "secrets",
        path: args.path,
        data: {
          endpoint: args.endpoint,
          region: REGION,
          bucket: args.bucket,
          username: args.key.accessKeyId,
          password: args.key.secretAccessKey,
        },
        concealedFields: ["password"],
        customMetadata: baoProvenance({ ...(args.cluster ? { cluster: args.cluster } : {}), source_title: args.sourceTitle }),
      },
      { provider: globals.baoProvider },
    );
  }

  // ── equestria: the CNPG barman-cloud archive ───────────────────────────────
  // One bucket, one rw key. kubernetes/apps/database/postgres/app reads this
  // path through its ${APP}-values ExternalSecret (rewritten to garage_*) and
  // templates it into the cluster chart's backups block — the ObjectStore the
  // barman-cloud plugin archives WAL and base backups to.
  const cnpgBucket = backupBucket("cnpg-equestria", CNPG_BUCKET_QUOTA);
  const cnpgKey = readWriteKey("cnpg-equestria", cnpgBucket);

  if (globals.baoDualWriteEnabled) {
    baoKvSecret(
      "cnpg-equestria-garage-bao",
      {
        mount: "secrets",
        path: "clusters/equestria/apps/postgres/garage-backup",
        data: {
          endpoint: equestriaEndpoint,
          region: REGION,
          bucket: "cnpg-equestria",
          username: cnpgKey.accessKeyId,
          password: cnpgKey.secretAccessKey,
        },
        concealedFields: ["password"],
        customMetadata: baoProvenance({ source_title: "Garage CNPG Backup Key (equestria)" }),
      },
      { provider: globals.baoProvider },
    );
  } else {
    warnNoBao("equestria's cnpg garage key (clusters/equestria/apps/postgres/garage-backup)");
  }

  // ── the in-cluster Garage mirror ───────────────────────────────────────────
  // The bucket docker/_common/garage's garage-mirror service (celestia only)
  // syncs /data/staging/garage/ into — the staging tree backrest's pre-sync
  // hooks already maintain for every GarageBucket annotated
  // `driscoll.dev/backup: "true"`, across BOTH in-cluster Garage instances
  // (garage-system and coder/forgejo-garage; the scan is
  // stacks/system/application-backups.ts garageBucketBackups). Riding
  // that tree means the mirror inherits the estate's opt-in contract and its
  // exclusion rules instead of inventing a second bucket-enumeration path.
  const mirrorBucket = backupBucket("garage-mirror", MIRROR_BUCKET_QUOTA);
  const mirrorKey = readWriteKey("garage-mirror", mirrorBucket);

  if (globals.baoDualWriteEnabled) {
    baoKvSecret(
      "garage-mirror-garage-bao",
      {
        mount: "secrets",
        path: "clusters/celestia/apps/garage/mirror",
        data: {
          endpoint: "http://garage:3900",
          region: REGION,
          bucket: "garage-mirror",
          username: mirrorKey.accessKeyId,
          password: mirrorKey.secretAccessKey,
        },
        concealedFields: ["password"],
        customMetadata: baoProvenance({ source_title: "Garage Bucket Mirror Key (celestia)" }),
      },
      { provider: globals.baoProvider },
    );
  } else {
    warnNoBao("the garage bucket mirror key (clusters/celestia/apps/garage/mirror)");
  }

  // ── dockge hosts: one bucket per postgres instance ─────────────────────────
  // Each node's garage-sync mirrors its pg_dump set into postgres-<cluster>
  // through its LOCAL S3 API; the key travels as a mode-600 env file the sync
  // loop re-reads every cycle (docker/_common/garage/sync.sh) rather than as
  // a ref+openbao reference — the reference form would deadlock the first
  // deploy, because this stack cannot mint the key until the cluster those
  // files start is already running. The OpenBao records are for humans and
  // recovery.
  const dockgeInstances = globals.store.getDockgeInstances();

  // Every bucket this module manages, by name, for the read-only grants below.
  const managedBuckets = new Map<string, garage.Bucket>([
    ["cnpg-equestria", cnpgBucket],
    ["garage-mirror", mirrorBucket],
  ]);

  for (const clusterKey of GARAGE_CLUSTERS) {
    const bucketName = `postgres-${clusterKey}`;
    const bucket = backupBucket(bucketName, DUMPS_BUCKET_QUOTA);
    managedBuckets.set(bucketName, bucket);
    const key = readWriteKey(bucketName, bucket);

    if (globals.baoDualWriteEnabled) {
      baoKvSecret(
        `${bucketName}-garage-bao`,
        {
          mount: "secrets",
          path: `clusters/${clusterKey}/apps/postgres/garage`,
          data: {
            // The endpoint the CONSUMER uses: the garage container on the
            // same node, over dockge_default. Deliberately not a tailnet
            // address — uploading locally is the whole point of one bucket
            // per instance.
            endpoint: "http://garage:3900",
            region: REGION,
            bucket: bucketName,
            username: key.accessKeyId,
            password: key.secretAccessKey,
          },
          concealedFields: ["password"],
          customMetadata: baoProvenance({
            cluster: clusterKey,
            source_title: `Garage Postgres Dump Key (${clusterKey})`,
          }),
        },
        { provider: globals.baoProvider },
      );
    } else {
      warnNoBao(`${clusterKey}'s postgres garage key (clusters/${clusterKey}/apps/postgres/garage)`);
    }

    dockgeInstances.apply(instances => deliverCredentialFile(clusterKey, "rclone.env", credentialFile(key, "sync.sh"), instances));
  }

  // The mirror credential goes to celestia ONLY — /data/staging/garage lives
  // there (backrest-on-celestia is the estate's puller), and the absence of
  // this file is exactly how the mirror service on luna/skystar knows to idle.
  dockgeInstances.apply(instances => deliverCredentialFile("celestia", "mirror.env", credentialFile(mirrorKey, "mirror.sh"), instances));

  // celestia's own node, by its per-node HTTPS name (`s3.${CLUSTER_DOMAIN}`,
  // docker/_common/garage/compose.yaml). spike pulls through it (H4). DockgeLxc
  // publishes that name as a CNAME to celestia's TAILNET address, so spike
  // reaches it over WireGuard, as tag:shared-drive under its own guarded
  // `garage-truenas-copy` grant (stacks/unifi-network/acl-manager.ts). Those
  // packets still stay on the LAN, since the two peers connect directly.
  const celestiaNodeEndpoint = pulumi.output(globals.searchDomain).apply(garageCopyEndpoint);

  // celestia's node for the cluster's restic writers: the VolSync movers and
  // the k8s pg_dump CronJob (H5). It uses the LAN address, plain HTTP on 3900,
  // because the HTTPS name above cannot serve them. No pod routes to the
  // tailnet. Measured 2026-10-01: from a pod the name resolves to celestia's
  // tailnet address and the connection times out, while the LAN address
  // answers in about a millisecond.
  //
  // Plain HTTP suits these two writers only. restic encrypts every pack before
  // it leaves the pod, and SigV4 never sends the secret key. TrueNAS pulls
  // buckets that are NOT encrypted client-side (cnpg-equestria, pulumi-state),
  // which is why it keeps the HTTPS name.
  //
  // The address is the one celestia's DockgeLxc recorded (`hostname -I` at
  // creation), and stacks/unifi-network pins it with a DHCP reservation. A
  // record off the Home subnet means celestia moved and the LAN route with it,
  // so the run fails rather than hand every mover an address it cannot reach.
  // While celestia is down, the fallback is to point these records at the
  // garage-s3 VIP, the cluster's tailnet route to any node.
  const celestiaLanEndpoint = dockgeInstances.apply(instances => {
    const celestia = instances.find(i => i.name === "celestia-dockge");
    if (!celestia) {
      throw new Error("No celestia-dockge record under hosts/dockge: the VolSync and pg_dump Garage records need celestia's LAN address. Run the home-operations stack first.");
    }
    if (!inIpv4Cidr(celestia.ipAddress, Tailscale.subnets.home)) {
      throw new Error(
        `celestia-dockge records ${celestia.ipAddress}, which is outside the Home subnet (${Tailscale.subnets.home}). The VolSync movers reach Garage over the LAN, so they need a LAN address. Point the VolSync and pg_dump records at the garage-s3 VIP instead.`,
      );
    }
    return `http://${celestia.ipAddress}:3900`;
  });

  // ── restic repositories (docs/plans/host-owned-backups.md §C2) ─────────────
  // Where the estate's restic repos move: one bucket per writer and one rw key
  // per bucket, so a leaked key exposes one writer's history and no more.
  // Created ahead of their writers (phase 2, step 2). Nothing writes to them
  // until alpha-site moves (phase 2, step 7), VolSync and the k8s pg_dump
  // (phase 3), and the other Docker hosts and Immich (phase 4).

  // VolSync: one bucket for every mover, one prefix per app. Every app's
  // backup Secret extracts this record (kubernetes/components/volsync), so
  // moving or renaming its path is a change to that component too.
  const volsyncBucket = backupBucket("volsync-equestria", VOLSYNC_BUCKET_QUOTA);
  managedBuckets.set("volsync-equestria", volsyncBucket);
  keyRecord("volsync-equestria-garage-bao", {
    path: "clusters/equestria/apps/volsync/garage",
    endpoint: celestiaLanEndpoint,
    bucket: "volsync-equestria",
    key: readWriteKey("volsync-equestria", volsyncBucket),
    sourceTitle: "Garage VolSync Key (equestria)",
  });

  // The k8s pg_dump CronJob (kubernetes/apps/database/postgres/backups), which
  // streams each dump into restic instead of writing files (§C4).
  const pgdumpBucket = backupBucket("backrest-pgdump", RESTIC_BUCKET_QUOTA);
  managedBuckets.set("backrest-pgdump", pgdumpBucket);
  keyRecord("backrest-pgdump-garage-bao", {
    path: "clusters/equestria/apps/postgres/garage-pgdump",
    endpoint: celestiaLanEndpoint,
    bucket: "backrest-pgdump",
    key: readWriteKey("backrest-pgdump", pgdumpBucket),
    sourceTitle: "Garage pg_dump Key (equestria)",
  });

  // Immich: written by celestia's backrest, which reads the library over NFS,
  // so it gets no key of its own; celestia's is granted it below. TrueNAS never
  // pulls it back: the library already lives there.
  const immichBucket = backupBucket("backrest-immich", RESTIC_BUCKET_QUOTA);
  managedBuckets.set("backrest-immich", immichBucket);

  // One bucket per Docker host, written by that host's backrest with its own
  // key, delivered as a credentials file (components/backrestGarage.ts).
  for (const host of BACKREST_HOSTS) {
    const bucketName = backrestGarageBucket(host);
    const bucket = backupBucket(bucketName, RESTIC_BUCKET_QUOTA);
    managedBuckets.set(bucketName, bucket);
    const key = readWriteKey(bucketName, bucket);

    if (host === "celestia") {
      new garage.BucketKeyPermission(
        `${bucketName}-immich-rw`,
        {
          bucketId: immichBucket.id,
          accessKeyId: key.accessKeyId,
          permissions: { read: true, write: true },
        },
        { provider },
      );
    }

    keyRecord(`${bucketName}-garage-bao`, {
      path: `clusters/${host}/apps/backrest/garage`,
      // The node on the host's own container network; alpha-site, which has
      // none, reaches celestia's over the tailnet (backrestGarageEndpoint).
      endpoint: pulumi.output(globals.tailscaleDomain).apply(domain => backrestGarageEndpoint(host, domain)),
      bucket: bucketName,
      key,
      cluster: host,
      sourceTitle: `Garage Backrest Key (${host})`,
    });

    dockgeInstances.apply(instances =>
      deliverCredentialFile(host, BACKREST_CREDENTIALS_FILE, backrestCredentialFile(key), instances, {
        dir: BACKREST_CREDENTIALS_DIR,
        owner: "0:0",
      }),
    );
  }

  // ── TrueNAS: the independent, versioned copy ───────────────────────────────
  // One key with read on every bucket spike pulls with it
  // (components/garageTruenasCopy.ts, docs/plans/host-owned-backups.md §C3).
  // Read and list only: no write, no delete, no owner rights, so a compromised
  // TrueNAS can copy these buckets and cannot change them.
  //
  // A bucket in that list that this module does not manage is a code error, so
  // it fails here, on the merge, instead of as a pull TrueNAS is refused.
  const truenasCopyKey = new garage.Key("truenas-copy", { name: "truenas-copy" }, { provider });
  const truenasCopyGrants = GARAGE_COPY_BUCKETS.filter(entry => entry.key === "truenas-copy").map(({ bucket }) => {
    const managed = managedBuckets.get(bucket);
    if (!managed) {
      throw new Error(
        `GARAGE_COPY_BUCKETS (components/garageTruenasCopy.ts) gives '${bucket}' to the truenas-copy key, but stacks/system does not manage a bucket of that name. Create it here first, or pull it with another key.`,
      );
    }
    return new garage.BucketKeyPermission(
      `truenas-copy-${bucket}-r`,
      {
        bucketId: managed.id,
        accessKeyId: truenasCopyKey.accessKeyId,
        permissions: { read: true, write: false, owner: false },
      },
      { provider },
    );
  });

  if (globals.baoDualWriteEnabled) {
    baoKvSecret(
      "truenas-copy-garage-bao",
      {
        mount: "secrets",
        path: GARAGE_COPY_KEYS["truenas-copy"],
        data: {
          endpoint: celestiaNodeEndpoint,
          region: REGION,
          username: truenasCopyKey.accessKeyId,
          password: truenasCopyKey.secretAccessKey,
        },
        concealedFields: ["password"],
        customMetadata: baoProvenance({ source_title: "Garage TrueNAS Copy Key (spike)" }),
      },
      { provider: globals.baoProvider },
    );
  } else {
    warnNoBao(`the TrueNAS copy key (${GARAGE_COPY_KEYS["truenas-copy"]})`);
  }

  // Hand both keys to spike in this same run (components/truenas.ts
  // configureGarageCopy), the way deliverCredentialFile hands the others to
  // their hosts. The record above is for humans and recovery. `pulumi-state`
  // is pulled with the ceremony's reader key, read from OpenBao: a stack that
  // cannot read OpenBao fails long before this anyway. The grants are inputs
  // too, so TrueNAS never sees the key before it can read its buckets.
  const pulumiStateReader = globals.store.getSecretByPath<{ username: string; password: string }>(GARAGE_COPY_KEYS["pulumi-state-reader"]);
  const truenasCopy = pulumi
    .all([
      truenasCopyKey.accessKeyId,
      truenasCopyKey.secretAccessKey,
      pulumiStateReader.username,
      pulumiStateReader.password,
      globals.truenasCredential.meta.title,
      globals.searchDomain,
      pulumi.all(truenasCopyGrants.map(grant => grant.id)),
    ])
    .apply(([copyKeyId, copySecret, readerKeyId, readerSecret, truenasCredentialTitle, searchDomain]) =>
      configureGarageCopy({
        globals,
        truenasCredentialTitle,
        endpoint: garageCopyEndpoint(searchDomain),
        uptimeUrl: `https://uptime.${searchDomain}`,
        keys: {
          "truenas-copy": { accessKeyId: copyKeyId, secretAccessKey: copySecret },
          "pulumi-state-reader": { accessKeyId: readerKeyId, secretAccessKey: readerSecret },
        },
      }),
    );

  return {
    buckets: {
      cnpgEquestria: cnpgBucket.id,
      garageMirror: mirrorBucket.id,
      postgres: GARAGE_CLUSTERS.map(c => `postgres-${c}`),
      restic: ["volsync-equestria", "backrest-pgdump", "backrest-immich", ...BACKREST_HOSTS.map(host => `backrest-${host}`)],
    },
    // What this run configured on spike, or why it skipped. Its inputs carry
    // the keys, so Pulumi marks it secret; the result itself holds bucket names
    // and a fixed message only, so it is shown in the clear.
    truenasCopy: pulumi.unsecret(truenasCopy),
  };
}
