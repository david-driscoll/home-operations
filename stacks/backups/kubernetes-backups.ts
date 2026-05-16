import * as pulumi from "@pulumi/pulumi";
import * as pk8s from "@pulumi/kubernetes";
import { KubernetesClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import * as kubernetes from "@kubernetes/client-node";
import { awaitOutput } from "@components/helpers.ts";
import { from, map, mergeMap, lastValueFrom, toArray, concatMap } from "rxjs";
import { BackrestRepository } from "@openapi/backrest.js";
import { BackupPlanManager } from "./BackupPlanManager.ts";

const op = new OPClient();

export async function kubernetesBackups(planManager: BackupPlanManager, clusterDefinition: KubernetesClusterDefinition) {
  const crdCredential = pulumi.output(op.getItemByTitle(`${clusterDefinition.key}-definition-crds`));
  const kubeConfigJson = await awaitOutput(generateKubeConfig(crdCredential));
  const volsyncPassword = await op.getItemByTitle(`Volsync Password`).then((z) => z.fields.credential.value!);
  const provider = new pk8s.Provider(`${clusterDefinition.key}-provider`, {
    kubeconfig: kubeConfigJson,
  });

  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(kubeConfigJson);

  const coreApi = kubeConfig.makeApiClient(kubernetes.CoreV1Api);

  // TODO: clear out old keys that are no longer used
  const customObjectApi = kubeConfig.makeApiClient(kubernetes.CustomObjectsApi);
  const namespaceList = await coreApi.listNamespace();
  const namespaceNames = namespaceList.items.map((ns) => ns.metadata!.name!);

  pulumi.log.info(`Found namespaces: ${namespaceNames.join(", ")}`);

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
      pulumi.log.info(`Found VolSync backup jobs: ${jobs.join(", ")}`);
      return jobs;
    });

  const celestiaJobs = volsyncBackupJobs.apply((jobs) =>
    pulumi.all(
      jobs.map((job) => {
        return planManager.createBackupJob(planManager.source, {
          name: pulumi.interpolate`${clusterDefinition.key}-volsync-${job}`,
          schedule: "0 10 * * *", // 10 am daily
          sourceType: "local",
          source: pulumi.interpolate`/spike/backup/${clusterDefinition.key}/volsync/${job}`,
          destinationType: "local",
          destination: pulumi.interpolate`/data/backup/${clusterDefinition.key}/volsync/${job}`,
        });
      }),
    ),
  );

  const lunaJobs = volsyncBackupJobs.apply((jobs) =>
    pulumi.all(
      jobs.map((job) => {
        return planManager.createBackupJob(planManager.destinations, {
          name: pulumi.interpolate`${clusterDefinition.key}-volsync-${job}`,
          schedule: "0 3 * * *", // 3 am daily
          sourceType: "sftp",
          source: pulumi.interpolate`${planManager.source.dockgeConnection.host}/${clusterDefinition.key}/volsync/${job}`,
          destinationType: "local",
          destination: pulumi.interpolate`/data/backup/${clusterDefinition.key}/volsync/${job}`,
        });
      }),
    ),
  );

  return {};

  function getVolsyncRepo(job: string, password: string): Omit<BackrestRepository, "guid"> {
    return {
      id: `volsync-${clusterDefinition.key}-${job}`,
      uri: `/backup/${clusterDefinition.key}/volsync/${job}`,
      password: password,
      prunePolicy: {
        schedule: {
          maxFrequencyDays: 30,
          clock: "CLOCK_LAST_RUN_TIME",
        },
        maxUnusedPercent: 10,
      },
      checkPolicy: {
        schedule: {
          maxFrequencyDays: 30,
          clock: "CLOCK_LAST_RUN_TIME",
        },
        readDataSubsetPercent: 10,
      },
      autoUnlock: true,
      commandPrefix: {
        ioNice: "IO_BEST_EFFORT_LOW",
        cpuNice: "CPU_LOW",
      },
    };
  }
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
