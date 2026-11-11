/**
 * The encryption key for forge-dashboard (kubernetes/apps/coder/forge-dashboard).
 * The app encrypts the forge tokens it saves from its Settings page with it, and
 * refuses to start without it. Read by the app's ExternalSecret; the field name
 * `encryption_key` is load-bearing there.
 *
 * Generated rather than hand-made so nobody has to run `bao kv put` from a
 * runbook. It must be a base64-encoded 32-byte key, which is what RandomBytes'
 * `base64` output is.
 *
 * Do not rotate it casually: a new key cannot decrypt the credentials already
 * saved in the app's database, so the Forgejo and GitHub tokens have to be
 * entered again in Settings.
 *
 * It lands in OpenBao before the Kubernetes side exists on purpose: the
 * ExternalSecret retries until it does, so a first deploy that merges ahead of
 * this stack simply waits.
 */

import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import type { GlobalResources } from "components/globals.ts";

export function configureForgeDashboard(globals: GlobalResources): void {
  const key = new random.RandomBytes("forge-dashboard-encryption-key", { length: 32 });

  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn("No OpenBao credentials — skipping forge-dashboard's encryption key (clusters/equestria/apps/forge-dashboard/credentials).");
    return;
  }

  baoKvSecret(
    "forge-dashboard-credentials",
    {
      mount: "secrets",
      path: "clusters/equestria/apps/forge-dashboard/credentials",
      data: { encryption_key: key.base64 },
      concealedFields: ["encryption_key"],
      customMetadata: baoProvenance({
        source_title: "forge-dashboard encryption key",
        source_tags: "forge-dashboard,coder",
      }),
    },
    { provider: globals.baoProvider },
  );
}
