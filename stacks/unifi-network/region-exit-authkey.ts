/**
 * The region exits' Tailscale auth key (docs/plans/region-exits.md §C3).
 *
 * One reusable, preauthorised key tagged tag:region-exit, in the Equestria
 * Secret `tailscale-system/tailscale-region-exit-authkey`. Reflector mirrors it
 * into the region-exits namespace (kubernetes/apps/region-exits/app/
 * tailscale-authkey.yaml), as it does tailscale-dns-authkey for Technitium.
 * It goes to tailscale-system rather than straight into region-exits so this
 * stack never depends on Flux having created that namespace first.
 *
 * The tag has to be in the tailnet policy before the key can be minted.
 * configureRegionExits (acl-manager.ts) adds it in the same run; if the key
 * is created first, the run fails on it and the next resync mints it.
 */
import * as kubernetes from "@pulumi/kubernetes";
import { TailnetKey } from "@pulumi/tailscale";
import { Tailscale } from "components/constants.ts";
import type { GlobalResources } from "components/globals.ts";

export const REGION_EXIT_AUTHKEY_SECRET = "tailscale-region-exit-authkey";

export function createRegionExitAuthKey(globals: GlobalResources, provider: kubernetes.Provider): void {
  const key = new TailnetKey(
    "region-exit-authkey",
    {
      reusable: true,
      preauthorized: true,
      ephemeral: false,
      recreateIfInvalid: "always",
      tags: [Tailscale.tag.regionExit],
      description: "Equestria region exits",
    },
    { provider: globals.tailscaleProvider },
  );

  new kubernetes.core.v1.Secret(
    "region-exit-authkey",
    {
      metadata: {
        name: REGION_EXIT_AUTHKEY_SECRET,
        namespace: "tailscale-system",
        annotations: { "reflector.v1.k8s.emberstack.com/reflection-allowed": "true" },
      },
      type: "Opaque",
      stringData: { authkey: key.key },
    },
    { provider, deleteBeforeReplace: true },
  );
}
