/**
 * The in-cluster Forgejo's commit-signing key: one ed25519 pair the forge
 * signs the commits it writes itself with (web edits, merge and squash
 * commits). Read by the `forgejo-signing` ExternalSecret in
 * kubernetes/apps/coder/forgejo and mounted where `[repository.signing]
 * SIGNING_KEY` points; docs/runbooks/forgejo-commit-signing.md has the rest.
 *
 * The field names are load-bearing there: `private_key` and `public_key`.
 *
 * Forgejo log.Fatal()s at startup when SIGNING_KEY is configured but the file
 * is missing, so this record has to exist BEFORE the Forgejo side of the change
 * reaches the cluster. That is why it lands in a pull request of its own.
 *
 * Rotating is replacing the `tls.PrivateKey` (`pulumi up --replace` on its
 * URN). Do it only if the key is compromised: Forgejo knows exactly one
 * instance key, so every commit signed with the old one stops showing as
 * Verified.
 */

import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import type { GlobalResources } from "components/globals.ts";

export function configureForgejoSigning(globals: GlobalResources): void {
  // ed25519, unencrypted: Forgejo runs `ssh-keygen -Y sign` non-interactively.
  // The private key is in this stack's state as a secret output, the same as
  // forgejo-github-mirror's deploy key.
  const key = new tls.PrivateKey("forgejo-signing-key", { algorithm: "ED25519" });

  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn("No OpenBao credentials — skipping Forgejo's commit-signing key (clusters/equestria/apps/forgejo/signing).");
    return;
  }

  baoKvSecret(
    "forgejo-signing-bao",
    {
      mount: "secrets",
      path: "clusters/equestria/apps/forgejo/signing",
      data: {
        // OpenSSH refuses a private key file without its trailing newline
        // ("invalid format"), and the ExternalSecret copies this verbatim.
        private_key: key.privateKeyOpenssh.apply(k => (k.endsWith("\n") ? k : `${k}\n`)),
        public_key: key.publicKeyOpenssh,
      },
      concealedFields: ["private_key"],
      customMetadata: baoProvenance({
        source_title: "Forgejo commit-signing key",
        source_tags: "forgejo,signing",
      }),
    },
    { provider: globals.baoProvider },
  );
}
