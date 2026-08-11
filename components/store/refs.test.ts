/**
 * npx tsx --test components/store/refs.test.ts
 *
 * Covers ref+openbao:// resolution: syntax matching, batching into one vals
 * invocation, per-reference memoization, the secret() marker, and the
 * fail-loud contract. No network and no vals binary — the exec and the
 * BaoClient are counting fakes. The real binary is exercised by the live
 * smoke run recorded in the PR (and any `pulumi preview` of a stack with
 * references).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSecret, type Output, runtime } from "@pulumi/pulumi";
import * as yaml from "yaml";
import type { BaoClient } from "../bao.ts";
import { SecretRefResolver, type ValsExec } from "./refs.ts";

runtime.setMocks({
  newResource: args => ({ id: `${args.name}-id`, state: args.inputs }),
  call: args => args.inputs,
});

const fakeBao = { address: "http://bao.test:8200", authToken: async () => "test-token" } as unknown as BaoClient;

/**
 * A vals fake: resolves each `rN: ref` entry against `paths`, or fails the
 * whole batch like the real binary does when any reference cannot be read.
 */
function fakeVals(paths: Record<string, Record<string, string>>) {
  const calls: { refs: string[]; env: Record<string, string> }[] = [];
  const exec: ValsExec = async (doc, env) => {
    const parsed = yaml.parse(doc) as Record<string, string>;
    calls.push({ refs: Object.values(parsed), env });
    const out: Record<string, string> = {};
    for (const [key, ref] of Object.entries(parsed)) {
      const m = /^ref\+openbao:\/\/([\w-]+\/[\w./-]+)#\/([\w.-]+)$/.exec(ref);
      const value = m && paths[m[1]]?.[m[2]];
      if (!value) throw new Error(`vals eval failed (exit status 1): expand openbao refs: get string: key "${ref}" does not exist`);
      out[key] = value;
    }
    return yaml.stringify(out);
  };
  return { exec, calls };
}

const resolver = (fake: ReturnType<typeof fakeVals>) => new SecretRefResolver(fake.exec, () => fakeBao);

async function settle(o: Output<string>) {
  const value = await (o as unknown as { promise(): Promise<string> }).promise();
  return { value, isSecret: await isSecret(o) };
}

describe("SecretRefResolver", () => {
  it("passes through content with no references, unmarked, without running vals", async () => {
    const fake = fakeVals({});
    const { value, isSecret } = await settle(resolver(fake).resolve("PASSWORD: hunter2\n"));
    assert.equal(value, "PASSWORD: hunter2\n");
    assert.equal(isSecret, false);
    assert.equal(fake.calls.length, 0);
  });

  it("resolves a reference and marks the whole content secret", async () => {
    const fake = fakeVals({ "secrets/shared/pdm-root": { password: "s3cret" } });
    const { value, isSecret } = await settle(resolver(fake).resolve('PASSWORD: "ref+openbao://secrets/shared/pdm-root#/password"'));
    assert.equal(value, 'PASSWORD: "s3cret"');
    // The resolved value is a credential by construction; the containing file
    // content must not reach Pulumi state in the clear.
    assert.equal(isSecret, true);
  });

  it("hands the client's address and token to the subprocess env", async () => {
    const fake = fakeVals({ "secrets/shared/pdm-root": { password: "x" } });
    await resolver(fake).resolveText("a: ref+openbao://secrets/shared/pdm-root#/password");
    assert.equal(fake.calls[0].env.VAULT_ADDR, "http://bao.test:8200");
    assert.equal(fake.calls[0].env.VAULT_TOKEN, "test-token");
  });

  it("batches a document's references into ONE vals run, deduplicated", async () => {
    const fake = fakeVals({ "secrets/shared/gatus-pushover-key": { credential: "tok", username: "usr" } });
    const doc = ["a: ref+openbao://secrets/shared/gatus-pushover-key#/credential", "b: ref+openbao://secrets/shared/gatus-pushover-key#/username", "c: ref+openbao://secrets/shared/gatus-pushover-key#/credential"].join("\n");
    const { value } = await settle(resolver(fake).resolve(doc));
    assert.equal(value, ["a: tok", "b: usr", "c: tok"].join("\n"));
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].refs.length, 2);
  });

  it("memoizes across documents — a later file with the same reference runs nothing", async () => {
    const fake = fakeVals({ "secrets/shared/pdm-root": { password: "x" } });
    const r = resolver(fake);
    await r.resolveText("a: ref+openbao://secrets/shared/pdm-root#/password");
    await r.resolveText("b: ref+openbao://secrets/shared/pdm-root#/password");
    assert.equal(fake.calls.length, 1);
  });

  // The failure contract is asserted on `resolveText`, the async core that
  // `resolve` wraps: a rejected Output fans the same rejection out through
  // the SDK's internal sibling promises, which only the real engine observes
  // — under node:test each sibling reports as unhandled activity.

  it("fails the run when vals cannot resolve, carrying vals' own diagnosis", async () => {
    const fake = fakeVals({});
    await assert.rejects(() => resolver(fake).resolveText("x: ref+openbao://secrets/shared/nope#/password"), /does not exist/);
  });

  it("does not poison the memo on failure — a retry runs vals again", async () => {
    const fake = fakeVals({});
    const r = resolver(fake);
    await assert.rejects(() => r.resolveText("x: ref+openbao://secrets/shared/nope#/password"));
    await assert.rejects(() => r.resolveText("x: ref+openbao://secrets/shared/nope#/password"));
    assert.equal(fake.calls.length, 2);
  });

  it("leaves op:// references for the 1Password resolver", async () => {
    // The two resolvers chain during the transition; each syntax names its
    // store by construction, so this one must never touch the other's.
    const fake = fakeVals({});
    const { value } = await settle(resolver(fake).resolve('token: "op://Eris/Gatus Pushover Key/credential"'));
    assert.equal(value, 'token: "op://Eris/Gatus Pushover Key/credential"');
    assert.equal(fake.calls.length, 0);
  });

  it("resolves a reference embedded in a URL", async () => {
    const fake = fakeVals({ "secrets/shared/media-management-secrets": { plex_token: "PLEX" } });
    const { value } = await settle(resolver(fake).resolve("url: https://plex.example/connections?X-Plex-Token=ref+openbao://secrets/shared/media-management-secrets#/plex_token"));
    assert.equal(value, "url: https://plex.example/connections?X-Plex-Token=PLEX");
  });

  it("does not build a client when nothing references OpenBao", async () => {
    const fake = fakeVals({});
    const r = new SecretRefResolver(fake.exec, () => {
      throw new Error("client constructed on a stack with no references");
    });
    const { value } = await settle(r.resolve("plain: yaml\n"));
    assert.equal(value, "plain: yaml\n");
  });
});
