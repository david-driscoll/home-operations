import type { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import type { GlobalResources } from "@components/globals.ts";
import { awaitOutput } from "@components/helpers.ts";
import * as kubernetes from "@kubernetes/client-node";
import type { ApplicationDefinitionSchema } from "@openapi/application-definition.js";
import * as pulumi from "@pulumi/pulumi";
import { concatMap, from, lastValueFrom, map, mergeMap, toArray } from "rxjs";

export async function kubernetesBackups(_globals: GlobalResources, planManager: BackupPlanOrchestrator, clusterDefinition: pulumi.Unwrap<ReturnType<GlobalResources["store"]["getKubernetesCluster"]>>) {
  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(clusterDefinition.kubeConfig);

  const coreApi = kubeConfig.makeApiClient(kubernetes.CoreV1Api);
  const customObjectApi = kubeConfig.makeApiClient(kubernetes.CustomObjectsApi);

  // TODO: clear out old keys that are no longer used
  const namespaceList = await coreApi.listNamespace();
  const namespaceNames = namespaceList.items.map(ns => ns.metadata!.name!);

  pulumi.log.info(`Found namespaces: ${namespaceNames.join(", ")}`, planManager);

  const volsyncBackupJobs = pulumi
    .output(
      lastValueFrom(
        from(namespaceNames).pipe(
          concatMap(ns =>
            from(
              coreApi.listNamespacedSecret({
                namespace: ns,
                labelSelector: "volsync=true",
              }),
            ),
          ),
          map(result => result.items.map(s => s.data?.RESTIC_REPOSITORY).filter((z): z is string => !!z)),
          mergeMap(lists => from(lists)),
          map(item => Buffer.from(item, "base64").toString("utf-8").split("/").pop()!),
          toArray(),
        ),
      ),
    )
    .apply(jobs => Array.from(new Set(jobs)))
    .apply(jobs => {
      pulumi.log.info(`Found VolSync backup jobs: ${jobs.join(", ")}`, planManager);
      return jobs;
    });

  const applications = await lastValueFrom(
    from(namespaceNames).pipe(
      concatMap(ns =>
        from(
          customObjectApi.listNamespacedCustomObject({
            group: "driscoll.dev",
            version: "v1",
            namespace: ns,
            plural: "applicationdefinitions",
          }),
        ),
      ),
      map(res => res as { items: ApplicationDefinitionSchema[] }),
      concatMap(res => from(res.items)),
      toArray(),
    ),
  );

  return await awaitOutput(
    volsyncBackupJobs.apply(jobs =>
      pulumi.all(
        jobs.map(job => {
          const relatedApp = applications.find(app => app.metadata?.namespace === clusterDefinition.key && app.spec.name === job);
          return planManager.addBackupPlan(
            pulumi.output({
              source: "volsync",
              name: pulumi.interpolate`${clusterDefinition.title} ${relatedApp?.spec.name ?? job}`,
              repository: `${clusterDefinition.key}-volsync-${job}`,
              path: `/spike/backup/${clusterDefinition.key}/volsync/${job}`,
            }),
          );
        }),
      ),
    ),
  );
}
