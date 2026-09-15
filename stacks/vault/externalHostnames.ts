/**
 * Which hostnames -- and which paths on them -- the Cloudflare tunnel should
 * serve, read from the cluster rather than listed here.
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
import { deriveTunnelRules, type HttpRouteLike, type TunnelRule } from "@components/tunnelRules.ts";
import * as k8s from "@kubernetes/client-node";
import { type Output, output } from "@pulumi/pulumi";

/**
 * Every hostname published through the external Gateway, each with the paths it
 * is published for. The Gateway API path semantics, the merge rules for several
 * routes on one hostname, and why a path is a second layer rather than the
 * boundary all live in components/tunnelRules.ts, where they are unit-tested.
 *
 * Paths used to be dropped here, which made a hostname published for one path
 * reachable on every path: on 2026-09-15 that put postiz's login and open
 * registration on the internet through a route that matched only /uploads/.
 */
export function discoverExternalRules(cluster: KubernetesClusterDefinition & { kubeConfig: string }): Output<TunnelRule[]> {
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

  // Attachment, hostname and path handling -- including the parentRef namespace
  // default and skipping hostname-less routes -- is deriveTunnelRules'. An empty
  // result still reaches CloudflareTunnelComponent, which refuses it.
  return output(routes).apply(list => deriveTunnelRules(list.items ?? []));
}
