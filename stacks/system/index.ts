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
import { GlobalResources } from "@components/globals.ts";
import { CLUSTERS } from "@components/store/clusters.ts";
import { discoverForgejoTargets, ForgejoConfigurationComponent } from "./forgejo-renovate.ts";
import { PostgresRotationComponent } from "./postgres-rotation.ts";

const globals = new GlobalResources({}, {});

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
    { provider: globals.baoProvider },
  );
}

export const clusters = CLUSTERS.map(c => c.key);

// OpenBao's PostgreSQL database secrets engine (phase 3b of
// docs/postgres-credentials/PLAN.md). A no-op until ENGINE_ENABLED is flipped
// there, which must wait for the widened `pulumi` policy -- so this cannot
// break the stack every other stack depends on.
new PostgresRotationComponent({ globals });

// The Forgejo identity Renovate runs as -- the bot account, its token, and the
// repository grants that decide what Renovate manages. Unlike everything else
// in this stack it talks to something other than OpenBao, which is a new way
// for a stack every other stack reads to go red; forgejo-renovate.ts explains
// the trade and carries its own kill switch.
//
// The grant lists are resolved HERE, with `await`, rather than inside the
// component: the Team/TeamMember/Collaborator resources are built by looping
// over them, and a resource created inside an `.apply()` does not appear in
// `pulumi preview`. discoverForgejoTargets explains what that cost this estate
// last time.
const forgejoTargets = await discoverForgejoTargets(globals);
new ForgejoConfigurationComponent({ globals, targets: forgejoTargets });
