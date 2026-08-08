/**
 * npx tsx --test scripts/op-to-bao/bao-paths.test.ts
 *
 * Covers the pure Phase 8a path-derivation logic — no Pulumi engine and no
 * network, in the same style as mapping.test.ts. The BaoClient wire behaviour
 * is already covered there against a stub server.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baoSlug, oidcBaoPath, pbsBaoPath } from "@components/bao.ts";
import { CategoryEnum } from "@components/op.ts";
import { classify, slug as mappingSlug } from "./mapping.ts";

type Item = Parameters<typeof classify>[0];

function item(over: Partial<Item> = {}): Item {
  return {
    id: "abcdefghijklmnopqrstuvwxyz",
    title: "Some Item",
    category: CategoryEnum.Login,
    urls: [],
    tags: [],
    sections: {},
    fields: {},
    files: {},
    ...over,
  } as Item;
}

describe("baoSlug", () => {
  it("stays byte-identical to the op-to-bao slug rule", () => {
    // A divergence here silently splits one credential across two OpenBao
    // paths — the migration writes with mapping.slug, the stacks with baoSlug.
    for (const input of ["Cloudflare (driscoll.tech)", "Cluster: Alpha Site", "Github Actions Runner (david-driscoll)", "Proxmox Backup Server LXC: Luna", "Luna PBS backup user", "  ...Weird!!  ", "already-a-slug"]) {
      assert.equal(baoSlug(input), mappingSlug(input), `diverged on ${JSON.stringify(input)}`);
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

  it("agrees with the op-to-bao classifier for the generated title family", () => {
    // The dual-write (this function) and the migration classifier must land
    // on the same path for the same credential.
    for (const [clusterKey, app] of [
      ["equestria", "headlamp"],
      ["sgc", "grafana"],
      ["luna", "immich"],
    ] as const) {
      const c = classify(item({ title: `${clusterKey}-${app}-oidc-credentials` }));
      assert.equal(oidcBaoPath(clusterKey, app), c.path);
    }
  });

  it("handles dashed cluster keys the title regex cannot", () => {
    // classify() parses the title with /^(.+?)-(.+)-oidc-credentials$/, whose
    // non-greedy first group splits `alpha-site-...` at the wrong dash, so the
    // classifier falls through to shared/. The dual-write takes clusterKey as
    // its own argument and derives the correct canonical path regardless.
    assert.equal(oidcBaoPath("alpha-site", "dockge"), "clusters/alpha-site/apps/dockge/oidc");
    const c = classify(item({ title: "alpha-site-dockge-oidc-credentials" }));
    assert.notEqual(c.path, "clusters/alpha-site/apps/dockge/oidc"); // documents the known divergence
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

  it("agrees with the op-to-bao tag:pbs rule", () => {
    const title = "Proxmox Backup Server LXC: Celestia";
    const c = classify(item({ title, tags: ["pbs", "lxc", "backup"] }));
    assert.equal(pbsBaoPath(title), c.path);
  });
});
