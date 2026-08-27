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
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import type { GlobalResources } from "@components/globals.ts";
import { copyFileToRemote } from "@components/helpers.ts";
import type { DockgeLxcDefinition } from "@components/store/index.ts";
import { remote } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";

// The garage cluster membership. A layout fact, not a derivable one: every
// dockge host EXCEPT alpha-site runs a node (docker/alpha-site/garage/.ignore
// is the other half of this statement — change both together or the sync
// heartbeats and the buckets disagree about the estate).
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
const MIRROR_BUCKET_QUOTA = 2048 * GiB;

/**
 * Everything Garage: buckets, keys, OpenBao records, and the per-host
 * credential files. Called from index.ts after the cluster definitions have
 * been published, per the ordering note there.
 */
export function configureGarage(globals: GlobalResources) {
  const provider = globals.garageProvider;

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
   * Deliver a credential file to a garage host. The consuming loops
   * (docker/_common/garage/{sync,mirror}.sh) re-read their file every cycle,
   * so a rotation — or the very first mint — converges on the next cycle with
   * no container restart. Same delivery shape as the backrest garage.conf in
   * components/BackupPlanDirector.ts, for the same reason: the credential
   * stays out of the rendered stack files and rotation is one file write.
   */
  function deliverCredentialFile(clusterKey: string, fileName: string, content: pulumi.Output<string>, instances: pulumi.Unwrap<DockgeLxcDefinition>[]) {
    const instance = instances.find(i => i.name === `${clusterKey}-dockge`);
    if (!instance) {
      throw new Error(`no dockge inventory item named '${clusterKey}-dockge' under secrets/hosts/dockge/ — has stacks for that site run since the host existed?`);
    }
    // The inventory item's ssh section carries the password too (concealed in
    // OpenBao); the checked-in interface only names hostname/username.
    const ssh = instance.ssh as DockgeLxcDefinition["ssh"] & { password: string };
    const connection = { host: ssh.hostname, user: ssh.username, password: pulumi.secret(ssh.password) };

    const file = copyFileToRemote(`${clusterKey}-garage-${fileName}`, {
      connection,
      remotePath: `/opt/stacks-data/garage/${fileName}`,
      content,
    });

    // 600 and owned by the consuming service's uid (3900, gid 70 — see the
    // user: lines in docker/_common/garage/compose.yaml): the file holds a
    // live S3 credential and nothing but its loop should be able to read it.
    return file.apply(
      f =>
        new remote.Command(
          `${clusterKey}-garage-${fileName}-perms`,
          {
            connection,
            create: `chown 3900:70 /opt/stacks-data/garage/${fileName} && chmod 600 /opt/stacks-data/garage/${fileName}`,
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
  // stacks/applications/kubernetes-backups.ts garageBucketBackups). Riding
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

  for (const clusterKey of GARAGE_CLUSTERS) {
    const bucketName = `postgres-${clusterKey}`;
    const bucket = backupBucket(bucketName, DUMPS_BUCKET_QUOTA);
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

  return {
    buckets: {
      cnpgEquestria: cnpgBucket.id,
      garageMirror: mirrorBucket.id,
      postgres: GARAGE_CLUSTERS.map(c => `postgres-${c}`),
    },
  };
}
