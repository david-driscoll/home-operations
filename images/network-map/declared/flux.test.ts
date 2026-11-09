/**
 * node --test images/network-map/declared/flux.test.ts
 *
 * Which files under kubernetes/apps Flux applies: listed by an applied
 * kustomization.yaml, or reached by the generated root kustomization.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { disabledReason } from "./apps.ts";
import { fluxApplies, indexKustomizations, kustomizationResources } from "./flux.ts";

const index = indexKustomizations([
  // A namespace directory: the generated root takes it whole.
  { dir: "kubernetes/apps/equestria", text: "resources:\n  - ./home\n  # - ./games\n" },
  { dir: "kubernetes/apps/equestria/home", text: "resources:\n  - ./immich/ks.yaml\n  # - ./karakeep/ks.yaml\n" },
  { dir: "kubernetes/apps/equestria/games", text: "resources:\n  - ./retrom/ks.yaml\n" },
  // An app's own kustomization: lists its manifests, never its ks.yaml.
  { dir: "kubernetes/apps/equestria/home/immich", text: "resources:\n  - ./helmrelease.yaml\n" },
  { dir: "kubernetes/apps/equestria/home/karakeep", text: "resources:\n  - ./helmrelease.yaml\n" },
  { dir: "kubernetes/apps/database", text: "resources:\n  - ./postgres\n" },
  { dir: "kubernetes/apps/database/postgres", text: "resources:\n  - ./app/ks.yaml\n  - https://example.test/remote.yaml\n" },
  { dir: "kubernetes/apps/database/postgres/app", text: "resources:\n  - ./helmrelease.yaml\n" },
]);

describe("kustomizationResources", () => {
  it("resolves entries against the directory, ignores comments and remote URLs", () => {
    assert.deepEqual(kustomizationResources("kubernetes/apps/database/postgres", "resources:\n  - ./app/ks.yaml\n  # - ./old/ks.yaml\n  - ../x/\n  - https://example.test/r.yaml\n"), [
      "kubernetes/apps/database/postgres/app/ks.yaml",
      "kubernetes/apps/database/x",
    ]);
    assert.deepEqual(kustomizationResources("d", "kind: Kustomization\n"), []);
  });
});

describe("fluxApplies", () => {
  it("applies a ks.yaml listed by its parent, whose namespace directory the root generator takes", () => {
    assert.equal(fluxApplies("kubernetes/apps/equestria/home/immich/ks.yaml", index), true);
  });

  it("does not apply a ks.yaml commented out of its parent", () => {
    assert.equal(fluxApplies("kubernetes/apps/equestria/home/karakeep/ks.yaml", index), false);
  });

  it("does not apply a listed ks.yaml whose parent directory is itself commented out", () => {
    assert.equal(fluxApplies("kubernetes/apps/equestria/games/retrom/ks.yaml", index), false);
  });

  it("follows a directory resource two levels down", () => {
    assert.equal(fluxApplies("kubernetes/apps/database/postgres/app/ks.yaml", index), true);
  });

  it("lets the generator reach a file only where no directory on the way has a kustomization.yaml", () => {
    assert.equal(fluxApplies("kubernetes/apps/loose/thing/ks.yaml", index), true);
    assert.equal(fluxApplies("kubernetes/apps/equestria/home/unlisted/ks.yaml", index), false);
    assert.equal(fluxApplies("kubernetes/other/ks.yaml", index), false);
  });
});

describe("disabledReason", () => {
  const ks = (suspend: boolean) => `apiVersion: kustomize.toolkit.fluxcd.io/v1\nkind: Kustomization\nmetadata: { name: a }\nspec:\n  path: ./kubernetes/apps/equestria/home/immich\n  suspend: ${suspend}\n`;
  it("is undefined for a deployed app, and for one with no ks.yaml", () => {
    assert.equal(disabledReason({ dir: "kubernetes/apps/equestria/home/immich", ksText: ks(false) }, index), undefined);
    assert.equal(disabledReason({ dir: "kubernetes/apps/equestria/home/karakeep" }, index), undefined);
  });
  it("names an unapplied or suspended ks.yaml", () => {
    assert.match(disabledReason({ dir: "kubernetes/apps/equestria/home/karakeep", ksText: ks(false) }, index) ?? "", /karakeep\/ks.yaml is not applied by Flux/);
    assert.match(disabledReason({ dir: "kubernetes/apps/equestria/home/immich", ksText: ks(true) }, index) ?? "", /is suspended$/);
  });
});
