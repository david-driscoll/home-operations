import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { AuthentikApplicationManager } from "@components/authentik.ts";
import { GlobalResources, KubernetesClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { base64encodeOutput } from "@pulumi/std";
import * as kubernetes from "@kubernetes/client-node";
import { awaitOutput } from "@components/helpers.ts";

const op = new OPClient();

export async function kubernetesApplications(globals: GlobalResources, clusterDefinition: KubernetesClusterDefinition, applicationManager: AuthentikApplicationManager) {
  const crdCredential = pulumi.output(op.getItemByTitle(`${clusterDefinition.name}-definition-crds`));
  const kubeConfigJson = await awaitOutput(generateKubeConfig(crdCredential));

  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(kubeConfigJson);

  const client = kubeConfig.makeApiClient(kubernetes.CoreV1Api);

  const namespaces = await client.listNamespace({});
  console.log(namespaces);

  const serviceConnection = new authentik.ServiceConnectionKubernetes(
    clusterDefinition.name,
    {
      name: clusterDefinition.name,
      kubeconfig: kubeConfigJson,
      verifySsl: true,
    }
  );

  return { serviceConnectionId: serviceConnection.serviceConnectionKubernetesId };
}

function generateKubeConfig(credential: pulumi.Output<ReturnType<OPClient["mapItem"]>>) {
  return pulumi.interpolate`{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "certificate-authority-data": "${credential.fields.certificate.value!.apply((z) => base64encodeOutput({ input: z! }).result)}",
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
