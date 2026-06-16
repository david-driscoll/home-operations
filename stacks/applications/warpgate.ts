import * as pulumi from "@pulumi/pulumi";
import * as pk8s from "@pulumi/kubernetes";
import { GlobalResources } from "@components/globals.ts";
import { awaitOutput } from "@components/helpers.ts";

const WARPGATE_NAMESPACE = "network";
const WARPGATE_CONNECTION = "warpgate";
const WARPGATE_API = "warpgate.warpgate.warp.tech/v1alpha1";

interface HttpTargetDef {
  name: string;
  url: pulumi.Input<string>;
  tlsVerify: boolean;
}

export async function createWarpgateTargets(globals: GlobalResources, provider: pk8s.Provider) {
  const d = globals.tailscaleDomain;

  const tailscaleExports = await awaitOutput(globals.store.getTailscaleExports());
  const kubernetesClusters = await awaitOutput(globals.store.getKubernetesClusters());

  const targets: HttpTargetDef[] = [
    ...tailscaleExports.flatMap((exp) =>
      exp.hosts.map((host): HttpTargetDef => {
        switch (host.nodeType) {
          case "proxmox":
            return { name: `proxmox-${host.name}`, url: pulumi.interpolate`https://${host.name}.${d}:8006`, tlsVerify: false };
          case "dockge":
            return { name: host.name, url: pulumi.interpolate`https://${host.name}.${d}`, tlsVerify: true };
          case "pbs":
            return { name: host.name, url: pulumi.interpolate`https://${host.name}.${d}:8007`, tlsVerify: false };
        }
      }),
    ),
    ...kubernetesClusters.map((cluster): HttpTargetDef => ({
      name: `k8s-${cluster.key}`,
      url: pulumi.interpolate`https://${cluster.key}-kubeproxy.${d}`,
      tlsVerify: true,
    })),
  ];

  for (const t of targets) {
    const target = new pk8s.apiextensions.CustomResource(
      `warpgate-target-${t.name}`,
      {
        apiVersion: WARPGATE_API,
        kind: "WarpgateTarget",
        metadata: {
          name: t.name,
          namespace: WARPGATE_NAMESPACE,
        },
        spec: {
          connectionRef: WARPGATE_CONNECTION,
          options: {
            http: {
              url: t.url,
              tls: {
                mode: t.tlsVerify ? "Required" : "PreferTls",
                verify: t.tlsVerify,
              },
            },
          },
        },
      },
      { provider },
    );

    new pk8s.apiextensions.CustomResource(
      `warpgate-target-role-${t.name}`,
      {
        apiVersion: WARPGATE_API,
        kind: "WarpgateTargetRole",
        metadata: {
          name: `${t.name}-admin`,
          namespace: WARPGATE_NAMESPACE,
        },
        spec: {
          connectionRef: WARPGATE_CONNECTION,
          targetRef: t.name,
          roleRef: "admin",
        },
      },
      { provider, dependsOn: [target] },
    );
  }
}
