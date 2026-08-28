/**
 * Tailscale auth keys for pods that ARE tailnet nodes -- a
 * `tailscale/tailscale` sidecar joining the tailnet directly rather than
 * going through the tailscale-operator's ProxyGroup ingress (which has no
 * SSH story; see kubernetes/apps/agents/agentboard/helmrelease.yaml's own
 * comment on why agentboard needs one at all).
 *
 * One entry per consumer, each minted by `createManagedAuthKey`
 * (components/tailscale.ts) and written into OpenBao at
 * `clusters/<clusterKey>/apps/<appName>/tailscale-authkey` -- the exact path
 * each consumer's own ExternalSecret already reads. Nothing here is
 * discovered from the Kubernetes side the way `postgres-rotation.ts`'s app
 * list is; this list is small and hand-maintained is fine until it isn't.
 */

import { createManagedAuthKey } from "@components/tailscale.ts";
import type { GlobalResources } from "@components/globals.ts";

export function configureTailscaleAuthKeys(globals: GlobalResources) {
  createManagedAuthKey(globals, {
    appName: "agentboard",
    clusterKey: "equestria",
    // `tag:apps` -- the general-purpose tag every other Kubernetes-hosted
    // tailnet node in this estate registers under (see
    // kubernetes/apps/tailscale-system/operator/helmrelease.yaml's
    // `defaultTags`); agentboard gets no dedicated tag of its own for the
    // same reason none of those do.
    tags: ["tag:apps"],
    description: "agentboard SSH sidecar",
  });
}
