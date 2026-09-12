/**
 * Which hostnames the Cloudflare tunnel should serve, read from the cluster
 * rather than listed here.
 *
 * Publishing a service externally in Equestria means exactly one thing: an
 * HTTPRoute whose `parentRefs` name the `external` Gateway in the `network`
 * namespace (`kubernetes/apps/network/traefik/external-gateway.yaml`). There is
 * no second mechanism — `kubernetes/components/ingress/external/` patches
 * `Ingress` for the same purpose but is referenced by no app, so it contributes
 * nothing to scan for. That makes the Gateway's attached routes the complete and
 * authoritative answer, which is why this derives rather than duplicating a list
 * that would go stale the first time someone added a route.
 *
 * Verified against live state on 2026-09-12: the Gateway reported
 * `attachedRoutes: 1` on both listeners, the one route was
 * `kubernetes/apps/flux-system/flux-instance/httproute.yaml`, and its hostname
 * was byte-for-byte the single hostname in the tunnel's hand-maintained config.
 *
 * ## Why the raw client and not the Pulumi provider
 *
 * The Pulumi Kubernetes provider can only `.get()` a named resource; it has no
 * generic list invoke, and there is no way to ask it "every HTTPRoute in the
 * cluster". `stacks/vault/KubernetesFluxWebhooks.ts` already reaches for
 * `@kubernetes/client-node` for the same reason, and this uses the same
 * kubeconfig-from-the-cluster-definition route so both fail the same way when
 * the API server is unreachable.
 *
 * An unreachable API server yields an empty list, which is indistinguishable
 * from "nothing is published". That is NOT resolved here — it is resolved in
 * `CloudflareTunnelComponent`, which refuses to write an empty ingress list. Do
 * not add a `?? []` anywhere in this file; returning an empty array quietly is
 * precisely the failure that guard exists to catch.
 */

import type { KubernetesClusterDefinition } from "@components/store/interfaces.ts";
import * as k8s from "@kubernetes/client-node";
import { type Output, output } from "@pulumi/pulumi";

/** The Gateway that means "published to the internet through the tunnel". */
const EXTERNAL_GATEWAY_NAME = "external";
const EXTERNAL_GATEWAY_NAMESPACE = "network";

interface HttpRouteLike {
  metadata?: { name?: string; namespace?: string };
  spec?: {
    parentRefs?: { name?: string; namespace?: string; kind?: string; group?: string }[];
    hostnames?: string[];
  };
}

/**
 * Every hostname published through the external Gateway, sorted and
 * de-duplicated.
 */
export function discoverExternalHostnames(cluster: KubernetesClusterDefinition & { kubeConfig: string }): Output<string[]> {
  const kubeConfig = new k8s.KubeConfig();
  kubeConfig.loadFromString(cluster.kubeConfig);
  const customObjectApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);

  const routes = customObjectApi.listCustomObjectForAllNamespaces({
    group: "gateway.networking.k8s.io",
    version: "v1",
    // `resourcePlural`, not `plural`: this is the all-namespaces variant, and
    // client-node names the field differently here than on the namespaced one.
    resourcePlural: "httproutes",
  }) as Promise<{ items?: HttpRouteLike[] }>;

  return output(routes).apply(list => {
    const hostnames = new Set<string>();

    for (const route of list.items ?? []) {
      const attachedToExternal = (route.spec?.parentRefs ?? []).some(
        ref =>
          ref.name === EXTERNAL_GATEWAY_NAME &&
          // A parentRef with no namespace means the route's own namespace, per
          // the Gateway API spec. Defaulting it to `network` instead would match
          // a route in any namespace that happened to name a local Gateway
          // "external", and publish it to the internet.
          (ref.namespace ?? route.metadata?.namespace) === EXTERNAL_GATEWAY_NAMESPACE &&
          // `kind` defaults to Gateway when absent; anything else that is
          // explicitly not a Gateway is not ours.
          (ref.kind ?? "Gateway") === "Gateway",
      );
      if (!attachedToExternal) continue;

      // A route with no hostnames matches every hostname the Gateway listens on.
      // A tunnel ingress rule cannot express that, and inventing a wildcard rule
      // would route names nobody asked to publish. Skipped rather than guessed.
      for (const hostname of route.spec?.hostnames ?? []) {
        const trimmed = hostname.trim();
        if (trimmed.length > 0) hostnames.add(trimmed);
      }
    }

    return [...hostnames].sort();
  });
}
