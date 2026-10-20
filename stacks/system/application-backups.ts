import type { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import type { GlobalResources } from "@components/globals.ts";
import * as kubernetes from "@kubernetes/client-node";
import * as pulumi from "@pulumi/pulumi";
import type { KubernetesCluster } from "./applications.ts";

export async function kubernetesBackups(_globals: GlobalResources, planManager: BackupPlanOrchestrator, clusterDefinition: KubernetesCluster) {
  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(clusterDefinition.kubeConfig);

  const coreApi = kubeConfig.makeApiClient(kubernetes.CoreV1Api);
  const customObjectApi = kubeConfig.makeApiClient(kubernetes.CustomObjectsApi);

  // TODO: clear out old keys that are no longer used
  const namespaceList = await coreApi.listNamespace();
  const namespaceNames = namespaceList.items.map(ns => ns.metadata!.name!);

  pulumi.log.info(`Found namespaces: ${namespaceNames.join(", ")}`, planManager);

  // Registers its plans on `planManager` as a side effect; the returned array
  // is only for the log line. Awaited BEFORE the function returns so every
  // plan is on the orchestrator by the time applications.ts calls savePlan().
  const garagePlans = await garageBucketBackups(coreApi, customObjectApi, planManager, clusterDefinition, namespaceNames);
  pulumi.log.info(`Registered ${garagePlans.length} Garage bucket backup plan(s) on ${clusterDefinition.key}`, planManager);

  return garagePlans;
}

/**
 * Bucket name -> backrest plan, for every GarageBucket that opted in.
 *
 * WHY A PULUMI-SIDE DISCOVERY AND NOT A VOLSYNC COMPONENT. VolSync backs up
 * PVCs, and a Garage storage PVC holds one node's share of the replicated
 * blocks plus its LMDB metadata database. Snapshotting those volumes yields
 * something restorable only by reassembling the whole cluster with the same
 * node identities -- it is not a bucket backup, and it offers no way to restore
 * one bucket, let alone one object. Mirroring the bucket through its S3 API and
 * snapshotting THAT is the only form that does.
 *
 * Restic cannot shortcut this: its S3 support is for the repository
 * DESTINATION, not for reading a bucket as a SOURCE.
 *
 * The opt-in is an annotation on the GarageBucket rather than a list in this
 * file, so adding a backed-up bucket is one manifest in git and the Pulumi run
 * that follows picks it up. The cost is that a Pulumi run is REQUIRED: a new
 * annotated bucket is not backed up until the system stack next runs and a
 * director run pushes the plan to backrest.
 */
const BACKUP_ANNOTATION = "driscoll.dev/backup";
/** Comma-separated rclone --exclude patterns. A bare `/dir` matches FILES only; use `/dir/**`. */
const BACKUP_EXCLUDE_ANNOTATION = "driscoll.dev/backup-exclude";
const BACKUP_CREDENTIALS_LABEL = "driscoll.dev/garage-backup-credentials=true";

/**
 * True only for "this API does not exist here".
 *
 * @kubernetes/client-node surfaces the status code differently depending on
 * which layer rejected -- `code` on an ApiException, `statusCode` on some
 * transport errors -- so both are checked before falling back to the message.
 */
function isNotFound(e: unknown): boolean {
  const err = e as { code?: unknown; statusCode?: unknown; body?: { code?: unknown }; message?: unknown };
  return err?.code === 404 || err?.statusCode === 404 || err?.body?.code === 404 || (typeof err?.message === "string" && err.message.includes("404"));
}

interface GarageBucketResource {
  metadata?: { name?: string; namespace?: string; annotations?: Record<string, string> };
  spec?: { clusterRef?: { name?: string; namespace?: string }; globalAlias?: string };
  status?: { globalAlias?: string; phase?: string };
}

async function garageBucketBackups(coreApi: kubernetes.CoreV1Api, customObjectApi: kubernetes.CustomObjectsApi, planManager: BackupPlanOrchestrator, clusterDefinition: KubernetesCluster, namespaceNames: string[]) {
  let buckets: GarageBucketResource[];
  try {
    buckets = (
      (await customObjectApi.listClusterCustomObject({
        group: "garage.rajsingh.info",
        version: "v1beta1",
        plural: "garagebuckets",
      })) as { items: GarageBucketResource[] }
    ).items;
  } catch (e) {
    // ONLY a missing CRD is tolerated. The garage-operator is optional, and
    // failing on its absence would make the system stack -- which every other
    // stack depends on -- contingent on it. (This used to run once per cluster,
    // where a 404 was the normal answer on every cluster but equestria.)
    //
    // Everything else rethrows deliberately. A blanket catch here would turn an
    // auth failure or an API hiccup into "no Garage buckets found", which is
    // indistinguishable from a healthy run and would leave every opted-in
    // bucket quietly unprotected until someone needed a restore.
    if (!isNotFound(e)) throw e;
    pulumi.log.info(`No garagebuckets.garage.rajsingh.info API on ${clusterDefinition.key}; skipping Garage bucket backups`, planManager);
    return [];
  }

  const optedIn = buckets.filter(b => b.metadata?.annotations?.[BACKUP_ANNOTATION] === "true");
  if (optedIn.length === 0) {
    pulumi.log.info(`No GarageBuckets annotated ${BACKUP_ANNOTATION}=true on ${clusterDefinition.key}`, planManager);
    return [];
  }

  // One credentials Secret per Garage cluster, found by label rather than by
  // name -- see the secretTemplate in
  // kubernetes/apps/garage-system/cluster/backup-key.yaml.
  const credentialsByNamespace = new Map<string, { accessKeyId: string; secretAccessKey: string; region: string; endpoint: string }>();
  for (const ns of namespaceNames) {
    const secrets = await coreApi.listNamespacedSecret({ namespace: ns, labelSelector: BACKUP_CREDENTIALS_LABEL });
    for (const secret of secrets.items) {
      const decode = (key: string) => (secret.data?.[key] ? Buffer.from(secret.data[key], "base64").toString("utf-8") : undefined);
      // `external-endpoint` is the additionalData entry from backup-key.yaml,
      // NOT the operator's own `endpoint`. The operator writes the in-cluster
      // Service URL, which backrest -- a container on celestia -- cannot reach.
      const endpoint = decode("external-endpoint");
      const accessKeyId = decode("access-key-id");
      const secretAccessKey = decode("secret-access-key");
      const region = decode("region");
      if (!endpoint || !accessKeyId || !secretAccessKey || !region) {
        pulumi.log.warn(`Secret ${ns}/${secret.metadata?.name} carries the Garage backup-credentials label but is missing one of external-endpoint/access-key-id/secret-access-key/region; ignoring it`, planManager);
        continue;
      }
      credentialsByNamespace.set(ns, { accessKeyId, secretAccessKey, region, endpoint });
    }
  }

  return optedIn.map(bucket => {
    const namespace = bucket.metadata!.namespace!;
    // The GarageBucket may reference a cluster in another namespace; the
    // credentials live with the CLUSTER, not the bucket.
    const clusterNamespace = bucket.spec?.clusterRef?.namespace ?? namespace;
    const credentials = credentialsByNamespace.get(clusterNamespace);

    // `status.globalAlias` over `spec.globalAlias` over the object name: status
    // is what Garage actually called the bucket, and it is the only one of the
    // three that is wrong-proof. spec may be empty (it defaults from the name)
    // and the name may have been overridden.
    const bucketName = bucket.status?.globalAlias ?? bucket.spec?.globalAlias ?? bucket.metadata!.name!;

    if (!credentials) {
      // Loud, and fatal for the run. A bucket that asked to be backed up and
      // silently is not backed up is the single worst outcome this file can
      // produce -- it looks identical to a healthy one until a restore.
      throw new Error(
        `GarageBucket ${namespace}/${bucket.metadata?.name} is annotated ${BACKUP_ANNOTATION}=true but no Secret labelled ${BACKUP_CREDENTIALS_LABEL} was found in namespace '${clusterNamespace}' (its clusterRef). Deploy the backup GarageKey for that cluster, or drop the annotation.`,
      );
    }

    const exclude = bucket.metadata?.annotations?.[BACKUP_EXCLUDE_ANNOTATION]
      ?.split(",")
      .map(e => e.trim())
      .filter(Boolean);

    return planManager.addBackupPlan(
      pulumi.output({
        // `celestia`, not a new source kind. Bucket plans are ordinary
        // celestia-sourced backrest plans: the snapshot runs where the staging
        // tree is, and every other Proxmox Backup Server picks up the copy job
        // for free from the existing destinationPlans branch in
        // BackupPlanDirector.
        source: "celestia" as const,
        // IDENTITY. The restic repo id, the plan id, and the /data/backup/<name>/
        // directory all derive from this -- renaming it re-roots the history.
        // Namespace is NOT in it: a bucket's global alias is already unique
        // across the Garage cluster, and folding the namespace in would rename
        // every repo if a bucket ever moved namespaces without moving buckets.
        name: `${clusterDefinition.key}-garage-${bucketName}`,
        title: `${clusterDefinition.title} Garage: ${bucketName}`,
        repository: `${clusterDefinition.key}-garage-${bucketName}`,
        path: `/data/staging/garage/${clusterDefinition.key}/${bucketName}/`,
        preSync: {
          type: "s3" as const,
          endpoint: credentials.endpoint,
          bucket: bucketName,
          region: credentials.region,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          ...(exclude?.length ? { exclude } : {}),
        },
      }),
    );
  });
}
