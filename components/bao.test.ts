/**
 * npx tsx --test components/bao.test.ts
 *
 * The pure path-derivation helpers — no Pulumi engine, no network.
 *
 * These assertions used to live in `scripts/op-to-bao/bao-paths.test.ts`, where
 * most of them existed to prove `baoSlug` stayed byte-identical to the
 * migration script's own `slug()`. That script is gone (its mapping engine was
 * deleted in ee5238c4, after the migration completed), so the parity half of
 * that file was testing a contract with nothing on the other side of it. What
 * survives is the half that never needed a second implementation: these four
 * functions still derive paths for live dual-writes, and they now live next to
 * what they test.
 *
 * ## Why these are worth testing at all
 *
 * Each one is HALF of a round trip, and the two halves are written in different
 * files by different components:
 *
 *   dockgeBaoPath   written by DockgeLxc, read back by BaoStore.getDockgeInstances
 *                   (LIST hosts/dockge)
 *   pbsBaoPath      written by ProxmoxBackupServerLxc, read back by
 *                   BaoStore.proxmoxBackupServers (LIST hosts/pbs)
 *   oidcBaoPath     written by the authentik component, read by ExternalSecrets
 *                   and Dockge `.env` templates that spell the path by hand
 *
 * A change to the slug rule moves the write side only. The read side is a LIST
 * of a prefix, so it does not 404 — it silently returns a smaller set, and a
 * smaller set of Dockge hosts or PBS servers reads as an estate that shrank.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baoSlug, dockgeBaoPath, oidcBaoPath, pbsBaoPath } from "./bao.ts";

describe("baoSlug", () => {
  it("lowercases, collapses non-alphanumerics, and trims", () => {
    assert.equal(baoSlug("Cloudflare (driscoll.tech)"), "cloudflare-driscoll-tech");
    assert.equal(baoSlug("Cluster: Alpha Site"), "cluster-alpha-site");
    assert.equal(baoSlug("Github Actions Runner (david-driscoll)"), "github-actions-runner-david-driscoll");
    assert.equal(baoSlug("  ...Weird!!  "), "weird");
    assert.equal(baoSlug("already-a-slug"), "already-a-slug");
  });

  it("is idempotent", () => {
    // Every caller derives a path from a title, and some of those paths get
    // re-derived from a stored `meta.title` on the way back — so slugging a
    // slug has to be a no-op or the round trip lands somewhere else.
    for (const input of ["Cloudflare (driscoll.tech)", "Luna PBS backup user", "  ...Weird!!  "]) {
      assert.equal(baoSlug(baoSlug(input)), baoSlug(input), `not idempotent for ${JSON.stringify(input)}`);
    }
  });

  it("never emits a leading or trailing dash", () => {
    // A trailing dash would make `hosts/dockge/<slug>` collide with the
    // directory marker KV v2 LIST uses, and `assertNotDirectory` would reject
    // the entry rather than read it.
    for (const input of ["!leading", "trailing!", "!!both!!", "...", "-"]) {
      const slug = baoSlug(input);
      assert.ok(!slug.startsWith("-") && !slug.endsWith("-"), `${JSON.stringify(input)} -> ${JSON.stringify(slug)}`);
    }
  });
});

describe("oidcBaoPath", () => {
  it("derives the canonical per-app oidc path", () => {
    assert.equal(oidcBaoPath("equestria", "headlamp"), "clusters/equestria/apps/headlamp/oidc");
    assert.equal(oidcBaoPath("sgc", "immich"), "clusters/sgc/apps/immich/oidc");
  });

  it("slugs the app name the same way titles are slugged", () => {
    assert.equal(oidcBaoPath("celestia", "Open WebUI"), "clusters/celestia/apps/open-webui/oidc");
  });

  it("takes the cluster key as its own argument, so dashed keys cannot mis-split", () => {
    // This is the whole reason the function takes two arguments instead of
    // parsing `<cluster>-<app>-oidc-credentials`. A non-greedy first group
    // splits `alpha-site-dockge-...` at the first dash and yields cluster
    // `alpha`, app `site-dockge`. `resolveBaoPath` solves the same ambiguity on
    // the read side by matching against the known cluster keys longest-first —
    // see its own test in store/bao.test.ts.
    assert.equal(oidcBaoPath("alpha-site", "dockge"), "clusters/alpha-site/apps/dockge/oidc");
  });

  it("matches the path Dockge .env templates spell by hand", () => {
    // docker/_common/technitium/.env and friends interpolate
    // `secrets/clusters/${CLUSTER_KEY}/apps/${APP}/oidc`. Those are strings in
    // a .env file, so nothing type-checks them against this function.
    assert.equal(oidcBaoPath("celestia", "forgejo"), "clusters/celestia/apps/forgejo/oidc");
    assert.equal(oidcBaoPath("alpha-site", "technitium"), "clusters/alpha-site/apps/technitium/oidc");
  });
});

describe("pbsBaoPath", () => {
  it("derives hosts/pbs/<slug(title)> for generated PBS items", () => {
    assert.equal(pbsBaoPath("Proxmox Backup Server LXC: Luna"), "hosts/pbs/proxmox-backup-server-lxc-luna");
    assert.equal(pbsBaoPath("Proxmox Backup Server LXC: Alpha Site"), "hosts/pbs/proxmox-backup-server-lxc-alpha-site");
  });

  it("covers the case-insensitive hand-created family too", () => {
    assert.equal(pbsBaoPath("Luna PBS backup user"), "hosts/pbs/luna-pbs-backup-user");
  });

  it("stays under the prefix proxmoxBackupServers lists", () => {
    // BaoStore.proxmoxBackupServers does LIST hosts/pbs and reads each child.
    // A path outside that prefix is not an error there — the server simply
    // never appears.
    assert.ok(pbsBaoPath("Proxmox Backup Server LXC: Celestia").startsWith("hosts/pbs/"));
  });
});

describe("dockgeBaoPath", () => {
  it("derives hosts/dockge/<slug(title)> for the title DockgeLxc writes", () => {
    // DockgeLxc composes `DockgeLxc: ${title}` before calling this, and
    // BaoStore.proxmoxBackupServers re-derives the same path from a PBS item's
    // `dockge` field to inline the host. Both sides go through this function.
    assert.equal(dockgeBaoPath("DockgeLxc: Celestia"), "hosts/dockge/dockgelxc-celestia");
    assert.equal(dockgeBaoPath("DockgeLxc: Alpha Site"), "hosts/dockge/dockgelxc-alpha-site");
  });

  it("stays under the prefix getDockgeInstances lists", () => {
    assert.ok(dockgeBaoPath("DockgeLxc: Luna").startsWith("hosts/dockge/"));
  });
});
