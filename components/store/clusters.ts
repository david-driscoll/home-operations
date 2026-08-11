/**
 * Cluster definitions — Phase 8 of the 1Password→OpenBao migration.
 *
 * These were six 1Password items tagged `cluster-definition`, read through
 * `findItemsByTag`. They are not credentials and nothing generates them: they
 * are hand-maintained configuration — a key, a couple of domains, and some
 * image URLs — that happened to live in a secret store because that is where
 * the tag lookup worked.
 *
 * PLAN §G wanted them in Pulumi stack outputs behind a `StackReference`. That
 * is not possible: every stack in this repo has its own DIY backend
 * (`s3://home-operations/<stack>`), so `stacks/unifi-network` cannot reference
 * `stacks/home`. Estate decision 2026-08-10: since no stack PRODUCES a cluster
 * definition, there is no cross-stack channel to build — the definitions are
 * just code, reviewable in git and diffable in a PR, which is strictly better
 * than either store.
 *
 * ## The two secret fields do NOT live here
 *
 * `secret` (the kubernetes clusters' shared substitution key) and
 * `arcane_token` are real credentials and stay in a secret store, read from
 * `secrets/clusters/<key>/cluster`. Everything in this file is safe to read in
 * a public diff; if you are about to add a field that is not, it belongs at
 * that path instead.
 *
 * ## `title` vs `meta.title`
 *
 * Both exist and they differ. `title` is the display name (`Celestia`);
 * `meta.title` is the 1Password item title (`Cluster: Celestia`) and is what
 * `ProxmoxBackupServerLxc` writes into its `cluster` field and what names a
 * Gatus group. Changing either is a user-visible rename, so both are pinned
 * here rather than derived from one another.
 */

import type { ClusterDefinition } from "./interfaces.ts";

/** The 1Password item title, retained because consumers read `meta.title`. */
export type ClusterEntry = ClusterDefinition & { readonly sourceTitle: string };

/**
 * Ordered by key, matching what `findItemsByTag` returned sorted — several
 * callers derive Pulumi inputs from `getAllClusters()`, and an unstable order
 * means spurious diffs.
 */
export const CLUSTERS: readonly ClusterEntry[] = [
  {
    sourceTitle: "Cluster: Alpha Site",
    type: "dockge",
    key: "alpha-site",
    title: "Alpha Site",
    rootDomain: "as.driscoll.tech",
    authentikDomain: "iris.driscoll.tech",
    icon: "https://www.candyicons.com/style-image-examples/abstract-uYcg0JhhxK7bQ54KOtzsLX9U.png",
    background: "https://images.playground.com/43f58221d361456293f38739b6c69cea.jpeg",
    favicon: "https://www.candyicons.com/style-image-examples/abstract-uYcg0JhhxK7bQ54KOtzsLX9U.png",
    location: "home",
  },
  {
    sourceTitle: "Cluster: Celestia",
    type: "dockge",
    key: "celestia",
    title: "Celestia",
    rootDomain: "celestia.driscoll.tech",
    authentikDomain: "canterlot.driscoll.tech",
    icon: "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/7be3c9c2-9f29-4df6-a6cd-b9eac6f29a9d/d77sw6q-9445f061-ef8f-4847-9d80-161062ea5ebd.png/v1/fill/w_400,h_333,strp/celestia_and_luna___favicon_works_by_agnessangel_d77sw6q-fullview.png",
    background: "https://get.wallhere.com/photo/My-Little-Pony-Princess-Celestia-1176459.jpg",
    favicon:
      "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/7be3c9c2-9f29-4df6-a6cd-b9eac6f29a9d/d77sw6q-9445f061-ef8f-4847-9d80-161062ea5ebd.png/v1/fill/w_400,h_333,strp/celestia_and_luna___favicon_works_by_agnessangel_d77sw6q-fullview.png",
    location: "home",
  },
  {
    sourceTitle: "Cluster: Equestria",
    type: "kubernetes",
    key: "equestria",
    title: "Equestria",
    rootDomain: "equestria.driscoll.tech",
    authentikDomain: "canterlot.driscoll.tech",
    icon: "https://cdn.imgbin.com/5/21/5/imgbin-equestria-royal-guards-emblem-army-others-TaRExRmRe5mJ6PtYBQxYQK0eX.jpg",
    background: "https://i.pinimg.com/originals/01/7e/aa/017eaa00416cf59928265f7f5697b8be.jpg",
    favicon: "https://vectorified.com/images/my-little-pony-icon-7.png",
    location: "home",
    // `secret` is supplied from OpenBao at read time — see clusterSecretPath().
    secret: "",
  },
  {
    sourceTitle: "Cluster: Luna",
    type: "dockge",
    key: "luna",
    title: "Luna",
    rootDomain: "luna.driscoll.tech",
    authentikDomain: "canterlot.driscoll.tech",
    icon: "https://ami.animecharactersdatabase.com/uploads/chars/1-1230888771.png",
    background: "https://img2.joyreactor.cc/pics/post/full/Princess-Luna-royal-my-little-pony-8778525.jpeg",
    favicon: "https://ami.animecharactersdatabase.com/uploads/chars/1-1230888771.png",
    location: "home",
  },
  {
    sourceTitle: "Cluster: Skystar",
    type: "dockge",
    key: "skystar",
    title: "Skystar",
    rootDomain: "skystar.driscoll.tech",
    authentikDomain: "canterlot.driscoll.tech",
    icon: "https://static.wikia.nocookie.net/mlp/images/7/77/Princess_Skystar_ID_MLPTM.png/revision/latest",
    background: "https://img2.joyreactor.cc/pics/post/full/Princess-Luna-royal-my-little-pony-8778525.jpeg",
    favicon: "https://static.wikia.nocookie.net/mlp/images/7/77/Princess_Skystar_ID_MLPTM.png/revision/latest",
    location: "remote",
  },
  {
    sourceTitle: "Cluster: Stargate Command",
    type: "kubernetes",
    key: "sgc",
    title: "Stargate Command",
    rootDomain: "sgc.driscoll.tech",
    authentikDomain: "iris.driscoll.tech",
    icon: "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg",
    background: "https://wallpapercave.com/wp/wp10853006.jpg",
    favicon: "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg",
    location: "home",
    // `secret` is supplied from OpenBao at read time — see clusterSecretPath().
    secret: "",
  },
];

/**
 * Which clusters carry a credential field, and which one.
 *
 * Kept explicit rather than inferred from the shape of `CLUSTERS`, so adding a
 * cluster without deciding about its secret is a compile-time gap rather than
 * a silently-empty field at runtime.
 */
export const CLUSTER_SECRET_FIELDS: Readonly<Record<string, "secret" | "arcane_token">> = {
  "alpha-site": "arcane_token",
  equestria: "secret",
  luna: "arcane_token",
  sgc: "secret",
  skystar: "arcane_token",
  // celestia has neither.
};

/** Where a cluster's credential fields live in the `secrets` mount. */
export function clusterSecretPath(key: string): string {
  return `clusters/${key}/cluster`;
}

/** Look up by the 1Password item title callers still pass (`Cluster: Luna`). */
export function clusterBySourceTitle(title: string): ClusterEntry | undefined {
  return CLUSTERS.find(c => c.sourceTitle === title);
}
