import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { AuthentikApplicationManager } from "@components/authentik.ts";
import { GlobalResources, KubernetesClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { base64encodeOutput } from "@pulumi/std";
import * as kubernetes from "@kubernetes/client-node";
import { awaitOutput } from "@components/helpers.ts";
import { from, map, mergeMap, lastValueFrom, toArray } from "rxjs";
import { ApplicationDefinitionSchema } from "@openapi/application-definition.js";

const op = new OPClient();

export async function kubernetesApplications(globals: GlobalResources, clusterDefinition: KubernetesClusterDefinition, applicationManager: AuthentikApplicationManager) {
  const crdCredential = pulumi.output(op.getItemByTitle(`${clusterDefinition.key}-definition-crds`));
  const kubeConfigJson = await awaitOutput(generateKubeConfig(crdCredential));

  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(kubeConfigJson);

  const coreApi = kubeConfig.makeApiClient(kubernetes.CoreV1Api);
  const customObjectApi = kubeConfig.makeApiClient(kubernetes.CustomObjectsApi);
  const namespaceList = await coreApi.listNamespace();
  const namespaceNames = namespaceList.items.map((ns) => ns.metadata!.name!);

  pulumi.log.info(`Found namespaces: ${namespaceNames.join(", ")}`);

  const applications = await lastValueFrom(
    from(namespaceNames).pipe(
      mergeMap((ns) =>
        from(
          customObjectApi.listNamespacedCustomObject({
            group: "driscoll.dev",
            version: "v1",
            namespace: ns,
            plural: "applicationdefinitions",
          }),
        ),
      ),
      map((res) => res as { items: ApplicationDefinitionSchema[] }),
      mergeMap((res) => from(res.items)),
      toArray(),
    ),
  );
  for (const app of applications) {
    applicationManager.createApplication(app);
  }
  const serviceConnection = new authentik.ServiceConnectionKubernetes(clusterDefinition.key, {
    name: clusterDefinition.key,
    kubeconfig: kubeConfigJson,
    verifySsl: true,
  });

  return { serviceConnectionId: serviceConnection.serviceConnectionKubernetesId };
}

function generateKubeConfig(credential: pulumi.Output<ReturnType<OPClient["mapItem"]>>) {
  return pulumi.interpolate`{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "certificate-authority-data": "${credential.fields.certificate.apply((z) => base64encodeOutput({ input: z.value! }).result)}",
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
