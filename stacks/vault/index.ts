/**
 * Per-cluster plumbing that has to be produced OUTSIDE the cluster it feeds:
 * a GitHub App installation token, and the GitHub push webhooks that wake
 * Flux.
 *
 * Moved here from david-driscoll/vault on 2026-08-22. The Pulumi project name
 * and backend are unchanged on purpose — see Pulumi.yaml.
 *
 * Tailscale auth keys used to be minted here too
 * (KubernetesTailscaleAuthKeyComponent) -- moved into stacks/unifi-network
 * alongside this repo's other Tailscale-owning Pulumi code (ACLs, DNS,
 * tailnet egress, the MCP API token minter). Took the
 * `enableSecretMutable: true` provider option with it: that flag exists
 * SPECIFICALLY for that component's in-place Secret rewrites
 * (pulumi-kubernetes#1568 -- see its own file's comment), and nothing left
 * in this stack writes a mutable Secret, so the provider here is back to
 * the plain default.
 */

import { GlobalResources } from "@components/globals.ts";
import kubernetes from "@pulumi/kubernetes";
import { KubernetesFluxWebhooksComponent } from "./KubernetesFluxWebhooks.ts";

const globals = new GlobalResources({}, {});
globals.store.getKubernetesClusters().apply(clusters => {
  for (const cluster of clusters) {
    const provider = new kubernetes.Provider(`${cluster.key}-provider`, { kubeconfig: cluster.kubeConfig });

    // The GitHub App installation token used to be minted here. It is now
    // kubernetes/apps/kube-system/secrets/github-app-token: an ESO
    // GithubAccessToken generator on a 30m refresh.
    //
    // An installation token lives ONE HOUR. Minting it during a Pulumi run
    // meant it was expired between runs -- verified, the live github-token
    // returned 401 and its Secret had last been written months earlier.

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
