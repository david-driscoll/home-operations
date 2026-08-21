/**
 * npx tsx --test components/store/clusters.test.ts
 *
 * These definitions used to be TypeScript literals, so the compiler caught a
 * misspelled key or a bad enum. YAML gets neither, and a mistyped field would
 * surface as `undefined` deep inside a provider call — or render an empty
 * string into a URL and quietly produce the wrong host. Everything the
 * compiler used to do for this data is now `parseCluster`, so it is worth
 * testing directly.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLUSTER_SECRET_FIELDS, CLUSTERS, clusterBySourceTitle, clusterSecretPath, parseCluster } from "./clusters.ts";

describe("the checked-in cluster definitions", () => {
  it("loads every YAML file in /clusters", () => {
    assert.deepEqual(
      CLUSTERS.map(c => c.key),
      ["alpha-site", "celestia", "equestria", "luna", "skystar"],
    );
  });

  it("is ordered stably, because callers derive Pulumi inputs from it", () => {
    const keys = CLUSTERS.map(c => c.key);
    assert.deepEqual(
      keys,
      [...keys].sort((a, b) => `${a}.yaml`.localeCompare(`${b}.yaml`)),
    );
  });

  it("keeps sourceTitle distinct from title", () => {
    // `sourceTitle` names a Gatus group and is written into PBS items;
    // `title` is the display name. Collapsing them is a user-visible rename.
    // Was `sgc` until its definition was removed (22 phase 2 step 3);
    // `alpha-site` carries the same property — key, title and sourceTitle are
    // three different strings — which is the whole point of this assertion.
    const alphaSite = clusterBySourceTitle("Cluster: Alpha Site");
    assert.equal(alphaSite?.title, "Alpha Site");
    assert.equal(alphaSite?.key, "alpha-site");
  });

  it("resolves every title the stacks pass to getCluster", () => {
    for (const title of ["Cluster: Alpha Site", "Cluster: Celestia", "Cluster: Equestria", "Cluster: Luna", "Cluster: Skystar"]) {
      assert.ok(clusterBySourceTitle(title), `${title} has no definition`);
    }
  });

  it("derives the secret-field map from the YAML, celestia excluded", () => {
    assert.deepEqual(CLUSTER_SECRET_FIELDS, {
      "alpha-site": "arcane_token",
      equestria: "secret",
      luna: "arcane_token",
      skystar: "arcane_token",
    });
    assert.equal(CLUSTERS.find(c => c.key === "celestia")?.secretField, null);
  });

  it("never carries a credential value in the checked-in data", () => {
    // The YAML is public in a way the 1Password items were not. `secret` may
    // exist as the empty placeholder the kubernetes type requires, and must
    // never hold anything.
    for (const cluster of CLUSTERS) {
      assert.equal((cluster as { arcane_token?: string }).arcane_token, undefined, `${cluster.key} carries arcane_token`);
      const secretValue = (cluster as { secret?: string }).secret;
      assert.ok(secretValue === undefined || secretValue === "", `${cluster.key} carries a non-empty secret`);
    }
  });

  it("gives each kubernetes cluster the placeholder its type requires", () => {
    for (const cluster of CLUSTERS.filter(c => c.type === "kubernetes")) {
      assert.equal((cluster as { secret?: string }).secret, "", `${cluster.key}`);
    }
  });

  it("points each cluster at its own OpenBao path", () => {
    // Named for the consumer: the arcane-agent token and the cluster-wide Flux
    // substitution key are different secrets with different audiences, so they
    // get different paths and can be granted separately.
    assert.equal(clusterSecretPath("luna", "arcane_token"), "clusters/luna/arcane-agent");
    assert.equal(clusterSecretPath("equestria", "secret"), "clusters/equestria/cluster");
    // The filename/key check in the loader is what stops one cluster reading
    // another.s credential through these paths.
    for (const cluster of CLUSTERS) {
      if (!cluster.secretField) continue;
      assert.match(clusterSecretPath(cluster.key, cluster.secretField), new RegExp(`^clusters/${cluster.key}/`));
    }
  });

  it("has a plausible, non-empty value for every consumed field", () => {
    for (const cluster of CLUSTERS) {
      for (const field of ["title", "rootDomain", "authentikDomain", "icon", "favicon", "background"] as const) {
        const value = (cluster as unknown as Record<string, string>)[field];
        assert.ok(typeof value === "string" && value.length > 0, `${cluster.key}.${field} is empty`);
      }
      assert.match(cluster.rootDomain, /^[a-z0-9.-]+\.driscoll\.tech$/, `${cluster.key}.rootDomain`);
      assert.match(cluster.authentikDomain, /^[a-z0-9.-]+\.driscoll\.tech$/, `${cluster.key}.authentikDomain`);
      for (const field of ["icon", "favicon", "background"] as const) {
        assert.match((cluster as unknown as Record<string, string>)[field], /^https:\/\//, `${cluster.key}.${field}`);
      }
    }
  });
});

describe("parseCluster rejects what the compiler used to", () => {
  const good = {
    sourceTitle: "Cluster: Test",
    key: "test",
    title: "Test",
    type: "dockge",
    location: "home",
    domainPrefix: "test",
    authentikDomain: "canterlot.driscoll.tech",
    icon: "https://example.invalid/i.png",
    favicon: "https://example.invalid/f.png",
    background: "https://example.invalid/b.jpg",
    secretField: null,
  };

  it("accepts a well-formed definition", () => {
    assert.equal(parseCluster("test.yaml", good).key, "test");
  });

  it("rejects a missing or empty required field", () => {
    assert.throws(() => parseCluster("test.yaml", { ...good, domainPrefix: undefined }), /.domainPrefix. must be a non-empty string/);
    assert.throws(() => parseCluster("test.yaml", { ...good, title: "" }), /'title' must be a non-empty string/);
  });

  it("rejects an unknown field rather than ignoring it", () => {
    // A typo'd key is the realistic failure, and silently dropping it gives
    // the cluster a default nobody chose.
    assert.throws(() => parseCluster("test.yaml", { ...good, rootDomian: "x" }), /unknown field\(s\) rootDomian/);
  });

  it("rejects a filename that does not match the key", () => {
    // This is what stops one cluster reading another's OpenBao credential.
    assert.throws(() => parseCluster("other.yaml", good), /'key' is 'test' but the file is named 'other.yaml'/);
  });

  it("rejects an out-of-range type or location", () => {
    assert.throws(() => parseCluster("test.yaml", { ...good, type: "k8s" }), /'type' must be one of/);
    assert.throws(() => parseCluster("test.yaml", { ...good, location: "cloud" }), /'location' must be one of/);
  });

  it("requires an explicit secretField, including null", () => {
    const { secretField: _omitted, ...withoutField } = good;
    assert.throws(() => parseCluster("test.yaml", withoutField), /'secretField' is required/);
    assert.throws(() => parseCluster("test.yaml", { ...good, secretField: "token" }), /'secretField' must be null or one of/);
  });

  it("rejects a document that is not a mapping", () => {
    assert.throws(() => parseCluster("test.yaml", [good]), /expected a YAML mapping/);
    assert.throws(() => parseCluster("test.yaml", null), /expected a YAML mapping/);
  });
});

describe("error messages name the file", () => {
  it("prefixes every failure with the repo-root path a human would open", () => {
    // Regression guard: an earlier edit dropped the interpolation and every
    // error read `clusters/:` with no filename, which is useless when six
    // files can produce the same message.
    assert.throws(() => parseCluster("skystar.yaml", { key: "skystar" }), /^Error: clusters\/skystar\.yaml: /);
  });
});

describe("domainPrefix", () => {
  const good = {
    sourceTitle: "Cluster: Test",
    key: "test",
    title: "Test",
    type: "dockge",
    location: "home",
    domainPrefix: "test",
    authentikDomain: "canterlot.driscoll.tech",
    icon: "https://example.invalid/i.png",
    favicon: "https://example.invalid/f.png",
    background: "https://example.invalid/b.jpg",
    secretField: null,
  };

  it("appends the estate domain to build rootDomain", () => {
    assert.equal(parseCluster("test.yaml", good).rootDomain, "test.driscoll.tech");
  });

  it("does not leak domainPrefix into the object stacks consume", () => {
    // Stacks read `rootDomain`; an extra key here is a shape difference from
    // what the 1Password items produced.
    assert.equal((parseCluster("test.yaml", good) as Record<string, unknown>).domainPrefix, undefined);
  });

  it("rejects a prefix that still carries the suffix, and says what to use", () => {
    // The realistic mistake while doing this refactor by hand. Left alone it
    // would produce test.driscoll.tech.driscoll.tech, which looks fine in a diff.
    assert.throws(() => parseCluster("test.yaml", { ...good, domainPrefix: "test.driscoll.tech" }), /use 'test', not 'test\.driscoll\.tech'/);
  });

  it("rejects anything that is not a DNS label", () => {
    for (const bad of ["Test", "-test", "test-", "te_st", "test "]) {
      assert.throws(() => parseCluster("test.yaml", { ...good, domainPrefix: bad }), /must be a DNS label|non-empty string/, `accepted '${bad}'`);
    }
  });

  it("still produces the real clusters' domains", () => {
    assert.equal(CLUSTERS.find(c => c.key === "alpha-site")?.rootDomain, "as.driscoll.tech");
    assert.equal(CLUSTERS.find(c => c.key === "skystar")?.rootDomain, "skystar.driscoll.tech");
  });
});
