/**
 * npx tsx --test components/store/refs.test.ts
 *
 * Covers ref+openbao:// resolution: syntax matching, batched reads, the
 * secret() marker, and the fail-loud contract. No network — the BaoClient is
 * a counting fake.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSecret, type Output, runtime } from "@pulumi/pulumi";
import type { BaoClient } from "../bao.ts";
import { SecretRefResolver } from "./refs.ts";

runtime.setMocks({
  newResource: args => ({ id: `${args.name}-id`, state: args.inputs }),
  call: args => args.inputs,
});


function fakeClient(paths: Record<string, Record<string, unknown>>) {
  const reads: string[] = [];
  const client = {
    read: async (mount: string, path: string) => {
      reads.push(`${mount}/${path}`);
      const data = paths[`${mount}/${path}`];
      return data ? { data, metadata: { version: 1, created_time: "", custom_metadata: null } } : undefined;
    },
  } as unknown as BaoClient;
  return { client, reads };
}

/**
 * Await an Output through its internal promise, so a rejected resolution
 * REJECTS here (assert.rejects can catch it) instead of hanging an apply
 * callback that never runs.
 */
async function settle(o: Output<string>) {
  const value = await (o as unknown as { promise(): Promise<string> }).promise();
  return { value, isSecret: await isSecret(o) };
}

describe("SecretRefResolver", () => {
  it("passes through content with no references, unmarked", async () => {
    const { client } = fakeClient({});
    const { value, isSecret } = await settle(new SecretRefResolver(() => client).resolve("PASSWORD: hunter2\n"));
    assert.equal(value, "PASSWORD: hunter2\n");
    assert.equal(isSecret, false);
  });

  it("resolves a reference and marks the whole content secret", async () => {
    const { client } = fakeClient({ "secrets/shared/pdm-root": { password: "s3cret", username: "root" } });
    const { value, isSecret } = await settle(new SecretRefResolver(() => client).resolve('PASSWORD: "ref+openbao://secrets/shared/pdm-root#/password"'));
    assert.equal(value, 'PASSWORD: "s3cret"');
    // The resolved value is a credential by construction; the containing file
    // content must not reach Pulumi state in the clear.
    assert.equal(isSecret, true);
  });

  it("reads each path once, however many fields and occurrences use it", async () => {
    const { client, reads } = fakeClient({ "secrets/shared/gatus-pushover-key": { credential: "tok", username: "usr" } });
    const resolver = new SecretRefResolver(() => client);
    const doc = ["a: ref+openbao://secrets/shared/gatus-pushover-key#/credential", "b: ref+openbao://secrets/shared/gatus-pushover-key#/username", "c: ref+openbao://secrets/shared/gatus-pushover-key#/credential"].join("\n");
    const { value } = await settle(resolver.resolve(doc));
    assert.equal(value, ["a: tok", "b: usr", "c: tok"].join("\n"));
    assert.deepEqual(reads, ["secrets/shared/gatus-pushover-key"]);
    // ...and the memo survives into the next document.
    await settle(resolver.resolve("d: ref+openbao://secrets/shared/gatus-pushover-key#/username"));
    assert.deepEqual(reads, ["secrets/shared/gatus-pushover-key"]);
  });

  // The failure contract is asserted on `resolveText`, the async core that
  // `resolve` wraps: a rejected Output fans the same rejection out through
  // the SDK's internal sibling promises, which only the real engine observes
  // — under node:test each sibling reports as unhandled activity.

  it("fails the run on a missing path, naming the reference", async () => {
    const { client } = fakeClient({});
    await assert.rejects(() => new SecretRefResolver(() => client).resolveText("x: ref+openbao://secrets/shared/nope#/password"), /ref\+openbao:\/\/secrets\/shared\/nope#\/password: secrets\/shared\/nope does not exist/);
  });

  it("fails the run on a missing field, naming what exists", async () => {
    const { client } = fakeClient({ "secrets/shared/pdm-root": { password: "x", username: "root" } });
    await assert.rejects(() => new SecretRefResolver(() => client).resolveText("x: ref+openbao://secrets/shared/pdm-root#/apikey"), /no string field 'apikey' \(fields: password, username\)/);
  });

  it("leaves op:// references for the 1Password resolver", async () => {
    // The two resolvers chain during the transition; each syntax names its
    // store by construction, so this one must never touch the other's.
    const { client, reads } = fakeClient({});
    const { value } = await settle(new SecretRefResolver(() => client).resolve('token: "op://Eris/Gatus Pushover Key/credential"'));
    assert.equal(value, 'token: "op://Eris/Gatus Pushover Key/credential"');
    assert.deepEqual(reads, []);
  });

  it("resolves a reference embedded in a URL", async () => {
    const { client } = fakeClient({ "secrets/shared/media-management-secrets": { plex_token: "PLEX" } });
    const { value } = await settle(new SecretRefResolver(() => client).resolve("url: https://plex.example/connections?X-Plex-Token=ref+openbao://secrets/shared/media-management-secrets#/plex_token"));
    assert.equal(value, "url: https://plex.example/connections?X-Plex-Token=PLEX");
  });

  it("does not build a client when nothing references OpenBao", async () => {
    const resolver = new SecretRefResolver(() => {
      throw new Error("client constructed on a stack with no references");
    });
    const { value } = await settle(resolver.resolve("plain: yaml\n"));
    assert.equal(value, "plain: yaml\n");
  });
});
