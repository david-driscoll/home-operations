/**
 * node --test components/netbird/appRedirectUris.test.ts
 *
 * The NetBird app names' OAuth redirect URIs, derived from each definition's
 * tailnet ones (docs/plans/netbird-mirror.md §N).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withNetbirdRedirectUris } from "./appRedirectUris.ts";

const TAILNET = "tail-example.ts.net";
const ROOT = "example.test";

describe("withNetbirdRedirectUris", () => {
  it("adds the <host>.app twin right after each tailnet URI, path and query kept", () => {
    const uris = [{ url: "https://sonarr.example.test/signin-oidc" }, { url: "https://sonarr.tail-example.ts.net/signin-oidc?x=1" }];
    assert.deepEqual(withNetbirdRedirectUris(uris, TAILNET, ROOT), [...uris, { url: "https://sonarr.nb.example.test/signin-oidc?x=1" }]);
  });

  it("keeps a port and the URI's matching mode", () => {
    assert.deepEqual(withNetbirdRedirectUris([{ url: "https://git.tail-example.ts.net:8443/cb", matching_mode: "strict" }], TAILNET, ROOT).at(-1), {
      url: "https://git.nb.example.test:8443/cb",
      matching_mode: "strict",
    });
  });

  it("leaves root-domain URIs, regex URIs and deeper tailnet names alone", () => {
    const uris = [{ url: "https://a.example.test/cb" }, { url: "https://b\\.tail-example\\.ts\\.net/.*", matching_mode: "regex" }, { url: "https://x.y.tail-example.ts.net/cb" }, { url: "not a url" }];
    assert.deepEqual(withNetbirdRedirectUris(uris, TAILNET, ROOT), uris);
  });

  it("does not repeat a twin a definition already lists", () => {
    const uris = [{ url: "https://romm.tail-example.ts.net/cb" }, { url: "https://romm.nb.example.test/cb" }];
    assert.deepEqual(withNetbirdRedirectUris(uris, TAILNET, ROOT), uris);
  });

  it("matches the tailnet case-insensitively", () => {
    assert.equal(withNetbirdRedirectUris([{ url: "https://Home.TAIL-example.ts.net/auth" }], TAILNET, ROOT).at(-1)?.url, "https://Home.nb.example.test/auth");
  });
});
