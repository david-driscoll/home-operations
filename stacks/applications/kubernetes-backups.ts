import * as pulumi from "@pulumi/pulumi";
import * as pk8s from "@pulumi/kubernetes";
import { OPClient } from "../../components/op.ts";
import * as kubernetes from "@kubernetes/client-node";
import { awaitOutput } from "@components/helpers.ts";
import { from, map, mergeMap, lastValueFrom, toArray, concatMap, tap } from "rxjs";
import { BackrestRepository } from "@openapi/backrest.js";
import { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import { KubernetesClusterDefinition } from "@components/store/index.ts";
import { GlobalResources } from "@components/globals.ts";

export async function kubernetesBackups(globals: GlobalResources, planManager: BackupPlanOrchestrator, clusterDefinition: pulumi.Unwrap<ReturnType<GlobalResources["store"]["getKubernetesCluster"]>>) {
  const crdCredential = globals.store.getCluster(`${clusterDefinition.key}-definition-crds`);

  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(clusterDefinition.kubeConfig);

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

  return await awaitOutput(
    volsyncBackupJobs.apply((jobs) =>
      pulumi.all(
        jobs.map((job) => {
          return planManager.addBackupPlan(
            pulumi.output({
              source: "celestia",
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
