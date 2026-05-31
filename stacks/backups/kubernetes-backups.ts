import * as pulumi from "@pulumi/pulumi";
import * as pk8s from "@pulumi/kubernetes";
import { KubernetesClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import * as kubernetes from "@kubernetes/client-node";
import { awaitOutput } from "@components/helpers.ts";
import { from, map, mergeMap, lastValueFrom, toArray, concatMap, tap } from "rxjs";
import { BackrestRepository } from "@openapi/backrest.js";
import { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";

const op = new OPClient();

export async function kubernetesBackups(planManager: BackupPlanOrchestrator, clusterDefinition: KubernetesClusterDefinition) {
  const crdCredential = pulumi.output(op.getItemByTitle(`${clusterDefinition.key}-definition-crds`));
  const kubeConfigJson = await awaitOutput(generateKubeConfig(crdCredential));

  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(kubeConfigJson);

  const coreApi = kubeConfig.makeApiClient(kubernetes.CoreV1Api);

  // TODO: clear out old keys that are no longer used
  const namespaceList = await coreApi.listNamespace();
  const namespaceNames = namespaceList.items.map((ns) => ns.metadata!.name!);

  pulumi.log.info(`Found namespaces: ${namespaceNames.join(", ")}`, planManager);

  const volsyncBackupJobs = pulumi
    .output(
      lastValueFrom(
        from(namespaceNames).pipe(
          concatMap((ns) =>
            from(
              coreApi.listNamespacedSecret({
                namespace: ns,
                labelSelector: "volsync=true",
              }),
            ),
          ),
          tap((result) => pulumi.log.info(`Found ${result.items.length} secrets in namespace ${result.items[0]?.metadata?.namespace}`, planManager)),
          map((result) => result.items.map((s) => s.data?.RESTIC_REPOSITORY).filter((z): z is string => !!z)),
          mergeMap((lists) => from(lists)),
          map((item) => Buffer.from(item, "base64").toString("utf-8").split("/").pop()!),
          toArray(),
        ),
      ),
    )
    .apply((jobs) => Array.from(new Set(jobs)))
    .apply((jobs) => {
      pulumi.log.info(`Found VolSync backup jobs: ${jobs.join(", ")}`, planManager);
      return jobs;
    });

  return volsyncBackupJobs.apply((jobs) =>
    pulumi.all(
      jobs.map((job) => {
        pulumi.log.info(`Creating backup job for VolSync job ${job} in celestia`, planManager);
        return planManager.addBackupPlan(
          pulumi.output({
            // name: "pgdump",
            // title: "Postgres Dumps",
            // path: "/spike/data/pgdump/",
            // repository: "pgdump",
            name: pulumi.interpolate`${clusterDefinition.key}-volsync-${job}`,
            title: `${clusterDefinition.title} VolSync :: ${job}`,
            repository: `${clusterDefinition.key}-volsync-${job}`,
            path: `/spike/backup/${clusterDefinition.key}/volsync/${job}`,
          }),
        );
      }),
    ),
  );
}

function generateKubeConfig(credential: pulumi.Output<ReturnType<OPClient["mapItem"]>>) {
  return pulumi.interpolate`{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "certificate-authority-data": "${credential.fields.certificate.apply((z) => Buffer.from(z.value!, "utf8").toString("base64"))}",
        "server": "https://${credential.fields.cluster_api.value}:6443"
      },
      "name": "${credential.fields.cluster.value}"
    }
  ],
  "contexts": [
    {
      "context": {
        "cluster": "${credential.fields.cluster.value}",
        "user": "${credential.fields.sa.value}"
      },
      "name": "${credential.fields.cluster.value}"
    }
  ],
  "current-context": "${credential.fields.cluster.value}",
  "users": [
    {
      "name": "${credential.fields.sa.value}",
      "user": {
        "token": "${credential.fields.token.value}"
      }
    }
  ]
}`;
}
