import type { GlobalResources } from "@components/globals.ts";
import type { KubernetesClusterDefinition } from "@components/store/interfaces.ts";
import * as k8s from "@kubernetes/client-node";
import * as github from "@pulumi/github";
import type kubernetes from "@pulumi/kubernetes";
import { ComponentResource, type ComponentResourceOptions, interpolate, jsonStringify, log, output } from "@pulumi/pulumi";

export interface KubernetesFluxWebhooksArgs {
  cluster: KubernetesClusterDefinition & { kubeConfig: string };
  kubernetes: kubernetes.Provider;
  globals: GlobalResources;
  repos: string[];
  receiverName?: string;
  receiverNamespace?: string;
}

export class KubernetesFluxWebhooksComponent extends ComponentResource {
  constructor(name: string, args: KubernetesFluxWebhooksArgs, opts?: ComponentResourceOptions) {
    super("custom:flux:webhooks", name, args, opts);

    const receiverName = args.receiverName ?? "github-webhook";
    const receiverNamespace = args.receiverNamespace ?? "flux-system";

    const cro = { parent: this, provider: args.kubernetes };

    // TODO: update to use kube client to get the info
    const kubeConfig = new k8s.KubeConfig();
    kubeConfig.loadFromString(args.cluster.kubeConfig);

    const customObjectApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);
    const coreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
    const receiver = output(
      customObjectApi.getNamespacedCustomObject({ group: "notification.toolkit.fluxcd.io", version: "v1", plural: "receivers", name: receiverName, namespace: receiverNamespace }) as Promise<{
        status: { webhookPath: string };
      }>,
    );

    const tokenSecret = output(coreApi.readNamespacedSecret({ name: "github-webhook-token-secret", namespace: receiverNamespace }));

    const webhookPath = receiver.status.apply((s: any) => s?.webhookPath ?? "");
    const token = tokenSecret?.data?.apply((d: any) => Buffer.from(d?.token ?? "", "base64").toString("utf8"));

    // Hostname from httproute: flux-${CLUSTER_CNAME}-webhook.${ROOT_DOMAIN}
    // cluster.key corresponds to CLUSTER_CNAME in the cluster secrets
    const webhookUrl = interpolate`https://flux-${args.cluster.key}-webhook.${args.globals.searchDomain}${webhookPath}`;

    for (const repo of args.repos) {
      new github.RepositoryWebhook(
        `${name}-webhook-${repo}`,
        {
          repository: repo,
          configuration: {
            url: webhookUrl,
            contentType: "json",
            secret: token,
            insecureSsl: false,
          },
          events: ["push"],
          active: true,
        },
        { parent: this, provider: args.globals.githubProvider },
      );
    }
  }
}
