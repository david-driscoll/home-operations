/**
 * node --test images/network-map/src/homelable/graph.test.ts
 *
 * Drift by key: a declared App pairs with the observed App of its key, or of
 * its `deployedAs` (the ks's APP, when the definition is named otherwise).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMapGraph, type MapNode } from "./graph.ts";

const app = (id: string, layer: MapNode["layer"], props: MapNode["props"]): MapNode => ({ id, labels: ["App"], layer, props });

describe("buildMapGraph drift by key", () => {
  it("pairs a declared App's deployedAs with the observed App of that key, both ways", () => {
    const graph = buildMapGraph([app("d:thanos-q", "declared", { appId: "thanos-query-observability", deployedAs: "thanos" }), app("o:thanos", "observed", { appId: "thanos" })], []);
    assert.equal(graph.drift("d:thanos-q"), undefined);
    assert.equal(graph.drift("o:thanos"), undefined);
  });

  it("still flags each side when neither key matches", () => {
    const graph = buildMapGraph([app("d:setup", "declared", { appId: "setup-guide", deployedAs: "git-pages" }), app("o:other", "observed", { appId: "other" })], []);
    assert.equal(graph.drift("d:setup"), "unobserved");
    assert.equal(graph.drift("o:other"), "undeclared");
  });

  it("ignores deployedAs on an observed App", () => {
    const graph = buildMapGraph([app("d:a", "declared", { appId: "a" }), app("o:b", "observed", { appId: "b", deployedAs: "a" })], []);
    assert.equal(graph.drift("d:a"), "unobserved");
    assert.equal(graph.drift("o:b"), "undeclared");
  });
});
