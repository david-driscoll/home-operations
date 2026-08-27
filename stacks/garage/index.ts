// Buckets, keys and credential distribution for the geo-distributed Garage
// cluster on the celestia/luna/skystar dockge hosts (docker/_common/garage).
//
// This stack is the ONLY writer of bucket/key state on that cluster — the
// Admin API is its interface (@axnic/pulumi-garage, provider constructed in
// components/globals.ts like every other provider). Hand-created buckets are
// invisible to it and will collide with a later `pulumi up`; don't.
//
// It does not — cannot — bootstrap the cluster itself: node connection and
// `garage layout assign`/`apply` are a one-shot ceremony the provider
// deliberately leaves out of scope. Run docs/garage-offsite-s3.md first; this
// stack fails against an un-laid-out cluster, loudly, which is the right
// order of operations making itself known.
import * as garage from "@axnic/pulumi-garage";
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import { copyFileToRemote } from "@components/helpers.ts";
import type { DockgeLxcDefinition } from "@components/store/index.ts";
import { remote } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";

const globals = new GlobalResources({}, {});
const provider = globals.garageProvider;

// The garage cluster membership. A layout fact, not a derivable one: every
// dockge host EXCEPT alpha-site runs a node (docker/alpha-site/garage/.ignore
// is the other half of this statement — change both together or the sync
// heartbeats and the buckets disagree about the estate).
const GARAGE_CLUSTERS = ["celestia", "luna", "skystar"] as const;

// What equestria reaches the S3 API through: the tailscale-operator egress
// Service for dockge-celestia (kubernetes/apps/tailscale-system/services,
// port declared in Update.cs), which is also a resolvable MagicDNS name for
// local tooling. Recorded in OpenBao so the postgres ExternalSecret templates
// it into the barman ObjectStore values without a second source of truth.
const equestriaEndpoint = pulumi.interpolate`http://dockge-celestia.${globals.tailscaleDomain}:3900`;

// The SigV4 region — must match s3_api.s3_region in
// docker/_common/garage/garage.toml.
const REGION = "garage";

/**
 * A backup bucket. protect + retainOnDelete for the same reason the minio
 * cnpg buckets in stacks/home carry them: destroying one discards a recovery
 * window, and no refactor should be able to do that without a human removing
 * the guard first. (Deleting a non-empty bucket fails at the Admin API anyway
 * — that is Garage's own behavior — but the guard stops the attempt from
 * wedging a deploy.)
 */
function backupBucket(name: string): garage.Bucket {
  return new garage.Bucket(name, { globalAlias: name }, { provider, protect: true, retainOnDelete: true });
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

// ── equestria: the CNPG barman-cloud archive ─────────────────────────────────
// One bucket, one rw key. kubernetes/apps/database/postgres/app reads this
// path through its ${APP}-values ExternalSecret (rewritten to garage_*) and
// templates it into the cluster chart's backups block — the ObjectStore the
// barman-cloud plugin archives WAL and base backups to.
const cnpgBucket = backupBucket("cnpg-equestria");
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

// ── dockge hosts: one bucket per postgres instance ───────────────────────────
// Each node's garage-sync mirrors its pg_dump set into postgres-<cluster>
// through its LOCAL S3 API; the key travels as a mode-600 env file the sync
// loop re-reads every cycle (docker/_common/garage/sync.sh) rather than as a
// ref+openbao reference — the reference form would deadlock the first deploy,
// because this stack cannot mint the key until the cluster those files start
// is already running. The OpenBao record below is for humans and recovery.
const dockgeInstances = globals.store.getDockgeInstances();

for (const clusterKey of GARAGE_CLUSTERS) {
  const bucketName = `postgres-${clusterKey}`;
  const bucket = backupBucket(bucketName);
  const key = readWriteKey(bucketName, bucket);

  if (globals.baoDualWriteEnabled) {
    baoKvSecret(
      `${bucketName}-garage-bao`,
      {
        mount: "secrets",
        path: `clusters/${clusterKey}/apps/postgres/garage`,
        data: {
          // The endpoint the CONSUMER uses: the garage container on the same
          // node, over dockge_default. Deliberately not a tailnet address —
          // uploading locally is the whole point of one bucket per instance.
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

  // Deliver the key to the host. sync.sh sources this file every cycle, so a
  // rotation (or the very first mint) converges on the next cycle with no
  // container restart. Same delivery shape as the backrest garage.conf in
  // components/BackupPlanDirector.ts, for the same reason: the credential
  // stays out of the rendered stack files and rotation is one file write.
  const rcloneEnv = pulumi.interpolate`# Written by stacks/garage — do not edit by hand; a rotation reruns that stack.
# Consumed by docker/_common/garage/sync.sh (sourced with set -a each cycle).
RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID=${key.accessKeyId}
RCLONE_CONFIG_GARAGE_SECRET_ACCESS_KEY=${key.secretAccessKey}
`;

  dockgeInstances.apply(instances => {
    const instance = instances.find(i => i.name === `${clusterKey}-dockge`);
    if (!instance) {
      throw new Error(`no dockge inventory item named '${clusterKey}-dockge' under secrets/hosts/dockge/ — has stacks for that site run since the host existed?`);
    }
    // The inventory item's ssh section carries the password too (concealed in
    // OpenBao); the checked-in interface only names hostname/username.
    const ssh = instance.ssh as DockgeLxcDefinition["ssh"] & { password: string };
    const connection = { host: ssh.hostname, user: ssh.username, password: pulumi.secret(ssh.password) };

    const file = copyFileToRemote(`${clusterKey}-garage-rclone-env`, {
      connection,
      remotePath: "/opt/stacks-data/garage/rclone.env",
      content: rcloneEnv,
    });

    // 600 and owned by the sync service's uid (3900, gid 70 — see the user:
    // lines in docker/_common/garage/compose.yaml): the file holds a live S3
    // credential and nothing but garage-sync should be able to read it.
    return file.apply(
      f =>
        new remote.Command(
          `${clusterKey}-garage-rclone-env-perms`,
          {
            connection,
            create: "chown 3900:70 /opt/stacks-data/garage/rclone.env && chmod 600 /opt/stacks-data/garage/rclone.env",
            triggers: [f.id],
          },
          { dependsOn: [f] },
        ),
    );
  });
}

// Never export key material: stack outputs land in the state backend and in
// `pulumi stack output` in the clear unless every value is marked; the OpenBao
// records above are the read path.
export const buckets = {
  cnpgEquestria: cnpgBucket.id,
  postgres: GARAGE_CLUSTERS.map(c => `postgres-${c}`),
};
