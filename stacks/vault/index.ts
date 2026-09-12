/**
 * Per-cluster plumbing that has to be produced OUTSIDE the cluster it feeds:
 * a GitHub App installation token, the GitHub push webhooks that wake Flux,
 * and the Cloudflare tunnel the cluster publishes through.
 *
 * The tunnel joined this stack on 2026-09-12 for exactly the reason in the line
 * above. It is remotely configured, so the rules deciding which hostnames reach
 * the cluster live in Cloudflare, not in the cluster — a Flux-managed manifest
 * cannot own them, and the connector the HelmRelease deploys only consumes them.
 * See components/CloudflareTunnel.ts for what it does and does not own (notably:
 * no DNS — external-dns still owns every CNAME).
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

import { CloudflareTunnelComponent } from "@components/CloudflareTunnel.ts";
import { GlobalResources } from "@components/globals.ts";
import kubernetes from "@pulumi/kubernetes";
import { discoverExternalHostnames } from "./externalHostnames.ts";
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

      // The tunnel's identity (`name` in; `tunnelId`, `credential`, `hostname`
      // out) lives at this path, and its hostname list is whatever the cluster
      // currently attaches to the `external` Gateway. Publishing a new name is
      // an HTTPRoute plus a run of this stack -- nothing is listed here.
      new CloudflareTunnelComponent(`${cluster.key}-cloudflare-tunnel`, {
        globals,
        secretPath: "third-party-tokens/cloudflare/tunnel",
        hostnames: discoverExternalHostnames(cluster),
      });
    }
  }
});
