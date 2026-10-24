/**
 * The SSH key paseo signs its git commits with. paseo commits as David
 * (kubernetes/apps/agents/paseo/helmrelease.yaml, `GIT_CONFIG_*`), and GitHub
 * shows a commit as Verified only when the key that signed it is a *signing*
 * key on the account owning the committer email. So the public half goes on
 * David's GitHub account BY HAND -- the estate's GitHub App cannot add keys to
 * a user -- under Settings -> SSH and GPG keys -> New SSH key -> Key type
 * "Signing Key". Read it with:
 *
 *   bao kv get -field=public_key secrets/clusters/equestria/apps/paseo/commit-signing
 *
 * Read by the `paseo-commit-signing` ExternalSecret in
 * kubernetes/apps/agents/paseo, which also renders the git config that turns
 * signing on. The field names are load-bearing there: `private_key` and
 * `public_key`.
 *
 * Its own key, not Forgejo's (./forgejo-signing.ts) or claude-code's: it grants
 * nothing but a Verified badge on GitHub, so revoking it there costs nothing
 * else. To rotate: `pulumi up --replace` the `tls.PrivateKey`, then swap the
 * key on GitHub. Commits signed with a key that is removed from GitHub stop
 * showing as Verified.
 */
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import type { GlobalResources } from "@components/globals.ts";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";

export function configurePaseoCommitSigning(globals: GlobalResources): void {
  // ed25519, unencrypted: git runs `ssh-keygen -Y sign` non-interactively.
  const key = new tls.PrivateKey("paseo-commit-signing-key", { algorithm: "ED25519" });

  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn("No OpenBao credentials — skipping paseo's commit-signing key (clusters/equestria/apps/paseo/commit-signing).");
    return;
  }

  baoKvSecret(
    "paseo-commit-signing-bao",
    {
      mount: "secrets",
      path: "clusters/equestria/apps/paseo/commit-signing",
      data: {
        // OpenSSH refuses a private key file without its trailing newline
        // ("invalid format"), and the ExternalSecret copies this verbatim.
        private_key: key.privateKeyOpenssh.apply(k => (k.endsWith("\n") ? k : `${k}\n`)),
        public_key: key.publicKeyOpenssh,
      },
      concealedFields: ["private_key"],
      customMetadata: baoProvenance({
        source_title: "paseo commit-signing key",
        source_tags: "paseo,signing,github",
      }),
    },
    { provider: globals.baoProvider },
  );
}
