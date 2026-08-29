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
 * ## It uses GlobalResources, and the old note here said it must not
 *
 * It did build its own provider once, for two stated reasons. The stack now
 * reaches OpenBao through `GlobalResources` like every other one, because the
 * Forgejo component needs `baoProvider` and `searchDomain` and duplicating
 * those was worse than the alternative. Both original objections were real, so
 * here is what actually became of them.
 *
 * **The bootstrap circularity is LATENT, not live — and there is a rule that
 * keeps it that way.** The old note said `GlobalResources` constructs a
 * `BaoStore`, `BaoStore` reads `clusters/<key>/details`, and a producer that
 * reads its own output cannot bootstrap. The first half is true: `this.store =
 * new BaoStore()` runs in the `GlobalResources` constructor. The second half is
 * not, as things stand. `BaoStore`'s constructor is deliberately lazy — it
 * builds a `BaoClient` and nothing else — and `_clusterDetails` is only ever
 * computed by `getAllClusters()` / `getCluster()`. The reads `GlobalResources`
 * DOES make eagerly are all `getSecretByTitle` lookups for provider
 * credentials, which touch no `clusters/` path.
 *
 * So the rule, and it is the whole reason this section still exists:
 *
 *   NEVER call `globals.store.getAllClusters()`, `getCluster()` or
 *   `getDockerClusters()` from this stack.
 *
 * Any of them turns this file into a producer that reads its own output, and
 * the failure lands on a fresh estate or after those paths are lost — the one
 * run that would recreate them, failing because they are missing. Nothing here
 * calls them today. `CLUSTERS` is read from the checked-in YAML instead, which
 * is what makes that possible.
 *
 * **The credential surface objection is now simply true, and accepted.**
 * `GlobalResources` eagerly constructs the cloudflare, unifi, unifi-firewall,
 * technitium, tailscale and minio providers and reads each of their credentials
 * from OpenBao at construction. Publishing six non-secret definitions now does
 * require most of the credentials in the estate, exactly as the old note
 * objected. That is a real cost and it is paid knowingly: this stack already
 * could not run without OpenBao, and a run that cannot reach the other
 * providers' credentials is a broken environment rather than a bootstrap
 * deadlock.
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
import { configureGarage } from "./garage.ts";
import { OpenBaoMcpComponent } from "./openbao-mcp.ts";
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

// The geo-distributed Garage cluster's buckets, keys and credential delivery
// (docker/_common/garage; docs/garage-offsite-s3.md). After the cluster
// publish loop above, per the header rule: garage.ts stays within it — its
// store reads are `hosts/dockge/*` and the admin token, never the
// `clusters/<key>/details` paths this stack produces.
export const garage = configureGarage(globals);

// OpenBao's PostgreSQL database secrets engine (phase 3b of
// docs/postgres-credentials/PLAN.md). A no-op until ENGINE_ENABLED is flipped
// there, which must wait for the widened `pulumi` policy -- so this cannot
// break the stack every other stack depends on.
new PostgresRotationComponent({ globals });

// OpenBao Kubernetes-auth Role + Policy for the toolhive-openbao MCP server
// (kubernetes/apps/agents/agent-tools-servers/openbao.yaml). ENABLED --
// the `pulumi` policy grant it needs is live -- see openbao-mcp.ts's header.
new OpenBaoMcpComponent({ globals });

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
