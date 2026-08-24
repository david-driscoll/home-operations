/**
 * Estate configuration that other stacks — and other REPOS — read.
 *
 * Cluster definitions are checked-in YAML at `/clusters/<key>.yaml` (Phase 8:
 * nothing generates them, so a secret store was never the right home for the
 * definitions themselves). But the (since retired) vault repo needed them too,
 * and copying six files between repos under a "diff -r must come back empty"
 * convention was a maintenance trap: the copies stay in step only while
 * someone remembers, and nothing fails when they drift.
 *
 * So this stack publishes them to OpenBao at `clusters/<key>/details`, and
 * every consumer reads them from there. The YAML stays the source of truth —
 * reviewable in git, diffable in a PR — and this is the one thing that turns it
 * into something other repos can consume. One writer, many readers.
 *
 * ## It builds its own provider, and that is not an oversight
 *
 * Every other stack reaches OpenBao through `GlobalResources`. This one must
 * not: `GlobalResources` constructs a `BaoStore`, and `BaoStore` reads cluster
 * definitions from `clusters/<key>/details` — the paths THIS stack writes. A
 * producer that reads its own output cannot bootstrap: on a fresh estate, or
 * after those paths are ever lost, the run that would recreate them fails
 * because they are missing.
 *
 * It also has no business constructing the unifi, cloudflare, tailscale and
 * github providers `GlobalResources` builds eagerly. Publishing six
 * non-secret definitions should not require every credential in the estate.
 *
 * ## Nothing here is secret
 *
 * The two credential fields a cluster can own (`secret`, `arcane_token`) are
 * NOT published here. They stay at `clusters/<key>/cluster` and
 * `clusters/<key>/arcane-agent`, written by the stacks that generate them, and
 * `BaoStore` merges them on read. Putting config and credentials at one path
 * would force anything that wants the icon URL to be granted the cluster's Flux
 * substitution key as well, and an ACL cannot separate them once they share a
 * path.
 */

import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import { CLUSTERS } from "@components/store/clusters.ts";
import * as pulumi from "@pulumi/pulumi";
import { Provider as VaultProvider } from "@pulumi/vault";
import { configurePostgresRotation } from "./postgres-rotation.ts";

const token = process.env.BAO_TOKEN ?? "";
const roleId = process.env.BAO_ROLE_ID ?? "";
const secretId = process.env.BAO_SECRET_ID ?? "";
const haveApprole = roleId !== "" && secretId !== "";

// This stack exists ONLY to write. A run without credentials would report
// success having done nothing — the shape of the Phase 8a gate bug that hid
// twelve skipped writes behind a green `pulumi up`. Preview is exempt because
// it makes no API call.
if (!token && !haveApprole && !pulumi.runtime.isDryRun()) {
  throw new Error('No OpenBao credentials — this stack would write nothing while reporting success. Run it through `mise run vals-run`, `eval "$(bootstrap/openbao/pulumi-env.sh)"`, or set BAO_TOKEN.');
}

const provider = new VaultProvider("openbao", {
  address: process.env.BAO_ADDR ?? "https://bao.equestria.driscoll.tech",
  ...(token ? { token } : haveApprole ? { authLogin: { path: "auth/approle/login", parameters: { role_id: roleId, secret_id: pulumi.secret(secretId) } } } : { token: "" }),
  // The `pulumi` policy has no capability on auth/token/create, so the
  // provider's default child-token mint 403s at configure time. Same reason as
  // components/globals.ts.
  skipChildToken: true,
});

for (const entry of CLUSTERS) {
  // `sourceTitle` and `secretField` are part of what a consumer needs, not
  // loader bookkeeping to be stripped: `sourceTitle` is what `meta.title` must
  // report (it names Gatus groups and is written into PBS items), and
  // `secretField` tells the reader WHICH credential path to merge, if any.
  // Published as data so adding a cluster stays a one-file change.
  const { sourceTitle, secretField, ...definition } = entry;

  baoKvSecret(
    `cluster-details-${entry.key}`,
    {
      mount: "secrets",
      path: `clusters/${entry.key}/details`,
      data: {
        ...definition,
        sourceTitle,
        // KV values are strings; `null` does not round-trip and `""` would be
        // indistinguishable from a real field name. `none` is explicit, and
        // the reader rejects anything it does not recognise.
        secretField: secretField ?? "none",
      },
      // A key, two domains, three image URLs. Declared empty deliberately —
      // see `concealedFields` in components/bao.ts for why omitting it is not
      // an option.
      concealedFields: [],
      customMetadata: baoProvenance({
        // `shapeItem` takes `meta.title` from here, so consumers get the same
        // title the 1Password items used to carry, with no special case.
        source_title: sourceTitle,
        source_tags: "cluster-definition",
      }),
    },
    { provider },
  );
}

export const clusters = CLUSTERS.map(c => c.key);

// OpenBao's PostgreSQL database secrets engine (phase 3b of
// docs/postgres-credentials/PLAN.md). A no-op until ENGINE_ENABLED is flipped
// there, which must wait for the widened `pulumi` policy -- so this cannot
// break the stack every other stack depends on.
configurePostgresRotation(provider);
