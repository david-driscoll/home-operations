/**
 * The VRRP password shared by the keepalived instances that hold authentik's
 * VIP (10.10.255.10) — the equestria DaemonSet (kubernetes/apps/network/authentik-vip)
 * and the alpha-site container (docker/alpha-site/authentik-vip).
 * docs/authentik-active-active/PLAN.md, phase 6.
 *
 * What it is and is not: VRRPv2 PASS authentication is a cleartext token on the
 * wire. It stops a stray or misconfigured VRRP speaker on the LAN from joining
 * the election; it does not stop anyone who can already sniff the segment.
 * That is the right weight for it — unicast peers are the real scoping.
 *
 * Eight characters because keepalived silently TRUNCATES a longer PASS to eight.
 * A longer value would "work" until one side's config was written from a copy
 * truncated differently, and then the two sides would stop hearing each other
 * and both claim the VIP.
 */
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import type { GlobalResources } from "@components/globals.ts";
import * as pulumi from "@pulumi/pulumi";
import { RandomPassword } from "@pulumi/random";

const VRRP_PASSWORD_VERSION = "1";

export function configureAuthentikVip(globals: GlobalResources): void {
  const vrrp = new RandomPassword("authentik-vip-vrrp-password", {
    length: 8,
    special: false,
    keepers: { version: VRRP_PASSWORD_VERSION },
  });

  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn("No OpenBao credentials — skipping the authentik VIP's VRRP record (clusters/equestria/apps/authentik-vip/vrrp).");
    return;
  }

  baoKvSecret(
    "authentik-vip-vrrp-bao",
    {
      mount: "secrets",
      path: "clusters/equestria/apps/authentik-vip/vrrp",
      data: { password: vrrp.result },
      concealedFields: ["password"],
      customMetadata: baoProvenance({ source_title: "authentik VIP VRRP password" }),
    },
    { provider: globals.baoProvider },
  );
}
