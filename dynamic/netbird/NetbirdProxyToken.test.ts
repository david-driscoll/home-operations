/**
 * node --test dynamic/netbird/NetbirdProxyToken.test.ts
 *
 * The plain token is returned exactly once, so a response without it must
 * fail the create rather than store an empty NB_PROXY_TOKEN in OpenBao.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProxyTokenCreated } from "./NetbirdProxyToken.ts";

describe("parseProxyTokenCreated", () => {
  it("keeps the id and the one-time plain token", () => {
    assert.deepEqual(parseProxyTokenCreated({ id: "t1", name: "nbidp", plain_token: "nbx_abc", revoked: false }), { id: "t1", plain_token: "nbx_abc" });
  });

  it("fails on a response without the plain token", () => {
    assert.throws(() => parseProxyTokenCreated({ id: "t1", name: "nbidp" }), /plain_token/);
    assert.throws(() => parseProxyTokenCreated(null), /plain_token/);
  });
});
