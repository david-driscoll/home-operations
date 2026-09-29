import type { GlobalResources } from "@components/globals.ts";
import { addUptimeGatus } from "@components/helpers.ts";
import type { KubernetesClusterDefinition } from "@components/store/interfaces.ts";
import * as k8s from "@kubernetes/client-node";
import type { GatusDefinition } from "@openapi/application-definition.js";
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

    // The Funnel hostname from kubernetes/apps/flux-system/flux-webhook-funnel:
    // flux-${CLUSTER_CNAME}-webhook.${TAILSCALE_DOMAIN}, public through
    // Tailscale Funnel and Traefik's `funnel` door. It was the Cloudflare
    // tunnel's flux-<key>-webhook.<root domain> until step 3 of
    // docs/plans/cloudflare-tunnel-to-funnel.md; that name keeps routing until
    // step 8a, so a revert here is safe until then.
    // cluster.key corresponds to CLUSTER_CNAME in the cluster secrets
    const webhookHost = interpolate`flux-${args.cluster.key}-webhook.${args.globals.tailscaleDomain}`;
    const webhookUrl = interpolate`https://${webhookHost}${webhookPath}`;

    // Probed from alpha-site through a public resolver, so it takes the Funnel
    // relays rather than MagicDNS. `/hook/` alone is on the route but is no
    // receiver path: the receiver answers it with an EMPTY-body 404, while
    // tailscaled's own 404 (a wrong FUNNEL_PATH, a dead proxy) says "404 page
    // not found" -- hence the body condition. It is also the only steady
    // untrusted request through the door, so it is what keeps
    // cs_appsec_reqs_total moving (plan §G).
    addUptimeGatus(
      name,
      args.globals,
      {
        endpoints: webhookHost.apply((host): GatusDefinition[] => [
          {
            name: `flux-${args.cluster.key}-webhook (funnel)`,
            group: "Funnel",
            url: `https://${host}/hook/`,
            interval: "5m",
            client: { "dns-resolver": "tcp://9.9.9.9:53" },
            conditions: ["[CONNECTED] == true", "[STATUS] == 404", "[BODY] != pat(*page not found*)", "[CERTIFICATE_EXPIRATION] > 72h"],
            // addUptimeGatus adds only `interval`; alerts have to be explicit.
            alerts: [{ type: "pushover", enabled: true, "minimum-reminder-interval": "2h" }],
          },
        ]),
      },
      this,
    );

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
