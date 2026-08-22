/**
 * Per-cluster plumbing that has to be produced OUTSIDE the cluster it feeds:
 * Tailscale auth keys, a GitHub App installation token, and the GitHub push
 * webhooks that wake Flux.
 *
 * Moved here from david-driscoll/vault on 2026-08-22. The Pulumi project name
 * and backend are unchanged on purpose — see Pulumi.yaml.
 */

import { GlobalResources } from "@components/globals.ts";
import kubernetes from "@pulumi/kubernetes";
import { KubernetesFluxWebhooksComponent } from "./KubernetesFluxWebhooks.ts";
import { KubernetesGithubAppTokenComponent } from "./KubernetesGithubAppToken.ts";
import { KubernetesTailscaleAuthKeyComponent } from "./KubernetesTailscaleAuthKey.ts";

const globals = new GlobalResources({}, {});
globals.store.getKubernetesClusters().apply(clusters => {
  for (const cluster of clusters) {
    const provider = new kubernetes.Provider(`${cluster.key}-provider`, {
      kubeconfig: cluster.kubeConfig,
    });
    new KubernetesTailscaleAuthKeyComponent(cluster.key, {
      cluster,
      kubernetes: provider,
      globals,
      credentials: globals.tailscaleCredential,
    });

    new KubernetesGithubAppTokenComponent(`${cluster.key}-github`, {
      cluster,
      kubernetes: provider,
      globals,
      credentials: globals.githubCredential,
    });

    if (cluster.key === "equestria") {
      new KubernetesFluxWebhooksComponent(`${cluster.key}-flux-webhooks`, {
        cluster,
        kubernetes: provider,
        globals,
        // `vault` was in this list until the repo was retired. Dropping it
        // makes the next operator run DELETE that repo's webhook — which has
        // to happen BEFORE the repo is archived, because GitHub rejects hook
        // changes on an archived repo and the stack would stall on the
        // delete forever.
        repos: ["equestria-cluster", "home-operations"],
      });
    }
  }
});
