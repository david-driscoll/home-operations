import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";
import { assignTailscaleAcls } from "./acl-manager.ts";
import { KubernetesTailscaleAuthKeyComponent } from "./KubernetesTailscaleAuthKey.ts";
import { configureLocalDns } from "./local-dns.ts";
import { createTailnetEgressServices, discoverServerKinds } from "./tailnet-egress.ts";
import { configureTailscaleApiToken } from "./tailscale-api-token.ts";
import { createTailscaleAttDropFirewallRule } from "./tailscale-drop-firewall-rule.ts";
import { configureTechnitiumZones } from "./technitium-zone.ts";

const globals = new GlobalResources({}, {});
createTailscaleAttDropFirewallRule(globals);
assignTailscaleAcls(globals);
configureLocalDns(globals);
configureTechnitiumZones(globals);
// Re-mints on every run of this stack (every 5 minutes,
// kubernetes/apps/pulumi/unifi-network/stack.yaml's resyncFrequencySeconds)
// -- see tailscale-api-token.ts's own header for why THIS stack, not
// stacks/vault or stacks/system.
await configureTailscaleApiToken(globals);

// Per-cluster Tailscale auth keys (app + DNS), one Kubernetes Secret each in
// tailscale-system -- moved in from stacks/vault, which used to own every
// piece of Tailscale-adjacent Pulumi code that didn't already live here.
// See KubernetesTailscaleAuthKey.ts's own header for the enableSecretMutable
// provider option below: that component rewrites its Secrets in place on
// every TailnetKey rotation, and the provider's default immutable-Secret
// behavior would plan a REPLACE (a window where the Secret does not exist)
// for every one of those.
globals.store.getKubernetesClusters().apply(clusters => {
  for (const cluster of clusters) {
    const provider = new k8s.Provider(`${cluster.key}-tailscale-authkey-provider`, {
      kubeconfig: cluster.kubeConfig,
      enableSecretMutable: true,
    });
    new KubernetesTailscaleAuthKeyComponent(cluster.key, {
      cluster,
      kubernetes: provider,
      globals,
      credentials: globals.tailscaleCredential,
    });
  }
});

// The tailnet egress Services, in the cluster, derived from the same device list
// and the same port constants the ACL above is built from. See tailnet-egress.ts
// for what is deliberately NOT here (the seal path and the kube-apiserver hop,
// which stay hand-maintained in git so a bare-metal recovery needs only SOPS).
const egressParent = new pulumi.ComponentResource("custom:tailscale:TailnetEgress", "tailnet-egress", {});
globals.store.getKubernetesClusters().apply(clusters => {
  const equestria = clusters.find(cluster => cluster.key === "equestria");
  if (!equestria) {
    // Not an error worth failing the whole stack for -- the ACL and DNS work
    // above is independent of any cluster being reachable.
    pulumi.log.warn("No `equestria` cluster in the store — skipping the tailnet egress Services.", egressParent);
    return;
  }

  const provider = new k8s.Provider(`${equestria.key}-provider`, { kubeconfig: equestria.kubeConfig }, { parent: egressParent });

  return discoverServerKinds(globals).apply(serverKinds => createTailnetEgressServices({ globals, serverKinds }, { parent: egressParent, provider }));
});
