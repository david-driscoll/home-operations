import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";
import { assignTailscaleAcls } from "./acl-manager.ts";
import { configureLocalDns } from "./local-dns.ts";
import { createTailnetEgressServices, discoverServerKinds } from "./tailnet-egress.ts";
import { createTailscaleAttDropFirewallRule } from "./tailscale-drop-firewall-rule.ts";
import { configureTechnitiumZones } from "./technitium-zone.ts";

const globals = new GlobalResources({}, {});
createTailscaleAttDropFirewallRule(globals);
assignTailscaleAcls(globals);
configureLocalDns(globals);
configureTechnitiumZones(globals);

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
