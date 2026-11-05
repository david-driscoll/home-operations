/**
 * node --test components/authentik/proxyHostTwins.test.ts
 *
 * The hidden forward-auth twins (docs/plans/netbird-mirror.md D45).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outpostProxyProviders, proxyHostTwins, twinSlug } from "./proxyHostTwins.ts";

const TAILNET = "tail-example.ts.net";
const ROOT = "example.test";
const NETBIRD = { tailnet: TAILNET, root: ROOT };

describe("proxyHostTwins", () => {
  it("gives nothing to an app with no tailnet name", () => {
    assert.deepEqual(proxyHostTwins("https://lidarr.example.test", undefined, NETBIRD), []);
  });

  it("gives only the tailnet twin without netbirdApps (the Dockge hosts)", () => {
    assert.deepEqual(proxyHostTwins("https://backrest.example.test", "https://backrest-luna.tail-example.ts.net", undefined), [{ variant: "tailnet", externalHost: "https://backrest-luna.tail-example.ts.net" }]);
  });

  it("adds the NetBird twin on the same label as the tailnet name, not the primary's", () => {
    // immich-style: the tailnet label differs from the root-domain one.
    assert.deepEqual(proxyHostTwins("https://immich.example.test", "https://photos.tail-example.ts.net", NETBIRD), [
      { variant: "tailnet", externalHost: "https://photos.tail-example.ts.net" },
      { variant: "app", externalHost: "https://photos.app.example.test" },
    ]);
  });

  it("matches the tailnet suffix case-insensitively", () => {
    assert.equal(proxyHostTwins("https://a.example.test", "https://Lidarr.TAIL-example.ts.net", NETBIRD).at(-1)?.externalHost, "https://Lidarr.app.example.test");
  });

  it("gives no NetBird twin to a name more than one label under the tailnet", () => {
    assert.deepEqual(
      proxyHostTwins("https://a.example.test", "https://x.y.tail-example.ts.net", NETBIRD).map(t => t.variant),
      ["tailnet"],
    );
  });

  it("drops a twin whose host is the primary's", () => {
    assert.deepEqual(proxyHostTwins("https://lidarr.tail-example.ts.net/", "https://lidarr.tail-example.ts.net", undefined), []);
  });
});

describe("twinSlug", () => {
  it("suffixes the primary slug with the variant", () => {
    assert.equal(twinSlug("equestria-lidarr-horse", "tailnet"), "equestria-lidarr-horse-tailnet");
    assert.equal(twinSlug("equestria-lidarr-horse", "app"), "equestria-lidarr-horse-app");
  });
});

describe("outpostProxyProviders", () => {
  it("collects primaries and twins of proxy apps only", () => {
    const apps = [
      { isProxy: true, provider: "lidarr", twins: [{ provider: "lidarr-tailnet" }, { provider: "lidarr-app" }] },
      { isProxy: true, provider: "thanos", twins: [] },
      { isProxy: false, provider: "sonarr-oauth" },
      { isProxy: false },
    ] as const;
    assert.deepEqual(outpostProxyProviders(apps), ["lidarr", "lidarr-tailnet", "lidarr-app", "thanos"]);
  });
});
