/**
 * The GitHub push webhooks that wake Flux on equestria.
 *
 * This was `stacks/vault` (project `applications`, stack `vault`) until it
 * shrank to this one component and was folded in here. Its state was moved
 * with `pulumi state move`, not recreated, so every name below is spelled the
 * way that stack spelled it: the component is `equestria-flux-webhooks`, its
 * children `equestria-flux-webhooks-webhook-<repo>` and
 * `gatus-equestria-flux-webhooks-<hash>`. Those names ARE the URNs the moved
 * state is keyed on. Rename one and Pulumi plans a delete plus a create; for a
 * webhook that means a new hook id on GitHub and a window with no pushes
 * reaching Flux.
 *
 * The cluster comes from `/clusters/equestria.yaml`, not from
 * `globals.store.getKubernetesClusters()` as it did in the vault stack. That
 * call reads `clusters/<key>/details`, which THIS stack publishes -- the
 * self-read index.ts's header forbids. applications.ts does the same.
 *
 * Unlike the rest of this stack it reads equestria's API at run time (the
 * Receiver's webhook path and the token Secret), through the tailnet
 * kubeproxy. It does that with the Kubernetes client, not a Pulumi provider,
 * so nothing here is a Kubernetes resource.
 */

import * as k8s from "@kubernetes/client-node";
import type { GatusDefinition } from "@openapi/application-definition.js";
import * as github from "@pulumi/github";
import { ComponentResource, type ComponentResourceOptions, interpolate, output } from "@pulumi/pulumi";
import type { GlobalResources } from "components/globals.ts";
import { addUptimeGatus, awaitOutput } from "components/helpers.ts";
import { generateTailscaleKubeConfig } from "components/store/index.ts";
import type { KubernetesClusterDefinition } from "components/store/interfaces.ts";
import { equestriaDefinition } from "./applications.ts";

/**
 * The repositories whose pushes wake equestria's Flux. `vault` was in this
 * list until that repo was retired; dropping a repo DELETES its webhook, which
 * has to happen BEFORE the repo is archived, because GitHub rejects hook
 * changes on an archived repo and the stack would stall on the delete forever.
 */
const FLUX_WEBHOOK_REPOS = ["equestria-cluster", "home-operations"];

export async function configureFluxWebhooks(globals: GlobalResources) {
  const definition = equestriaDefinition();
  const kubeConfig = await awaitOutput(generateTailscaleKubeConfig(definition.key, globals.tailscaleDomain));
  return new KubernetesFluxWebhooksComponent(`${definition.key}-flux-webhooks`, {
    cluster: { ...definition, kubeConfig },
    globals,
    repos: FLUX_WEBHOOK_REPOS,
  });
}

export interface KubernetesFluxWebhooksArgs {
  cluster: KubernetesClusterDefinition & { kubeConfig: string };
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
