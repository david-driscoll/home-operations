/**
 * npx tsx --test components/store/refs.test.ts
 *
 * Covers ref+openbao:// resolution: the wrapped-document contract with vals,
 * per-document memoization, the secret() marker, and the fail-loud paths. No
 * network and no vals binary — the exec and the BaoClient are fakes. The real
 * binary's behaviors this design leans on (inline expansion mid-string,
 * quote/line delimiting, block-scalar fidelity, the empty-output trap for
 * unwrapped non-YAML) were verified live and are documented in refs.ts.
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
 * A vals fake mirroring the real contract: receives the wrapped `{content}`
 * doc, expands every ref present in `refs` INSIDE the content string, and
 * fails the whole eval when a ref+openbao reference is not in the map (the
 * real binary errors on an unreadable path). Unsupported providers pass
 * through untouched, exactly like the real vals with an unconfigured backend
 * would leave nothing behind for — that is what the residue guard is for.
 */
function fakeVals(refs: Record<string, string>) {
  const calls: { content: string; env: Record<string, string> }[] = [];
  const exec: ValsExec = async (doc, env) => {
    const parsed = yaml.parse(doc) as { content: string };
    assert.equal(typeof parsed.content, "string", "resolver must wrap the document as {content: string}");
    calls.push({ content: parsed.content, env });
    let content = parsed.content;
    for (const [ref, value] of Object.entries(refs)) {
      content = content.replaceAll(ref, value);
    }
    const unresolved = content.match(/ref\+openbao:\/\/[^\s"']+/);
    if (unresolved) throw new Error(`vals eval failed (exit status 1): expand openbao refs: get string: key "${unresolved[0]}" does not exist`);
    return yaml.stringify({ content });
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
    const fake = fakeVals({ "ref+openbao://secrets/shared/pdm-root#/password": "s3cret" });
    const { value, isSecret } = await settle(resolver(fake).resolve('PASSWORD: "ref+openbao://secrets/shared/pdm-root#/password"'));
    assert.equal(value, 'PASSWORD: "s3cret"');
    // The resolved value is a credential by construction; the containing file
    // content must not reach Pulumi state in the clear.
    assert.equal(isSecret, true);
  });

  it("hands vals the ENTIRE document, refs in place, with the client's env", async () => {
    const fake = fakeVals({ "ref+openbao://secrets/shared/pdm-root#/password": "x" });
    const doc = ["# a comment survives", 'PASSWORD: "ref+openbao://secrets/shared/pdm-root#/password"', "OTHER: plain"].join("\n");
    const { value } = await settle(resolver(fake).resolve(doc));
    assert.equal(fake.calls[0].content, doc);
    assert.equal(value, ["# a comment survives", 'PASSWORD: "x"', "OTHER: plain"].join("\n"));
    assert.equal(fake.calls[0].env.VAULT_ADDR, "http://bao.test:8200");
    assert.equal(fake.calls[0].env.VAULT_TOKEN, "test-token");
  });

  it("runs vals once per distinct document, however often it recurs", async () => {
    const fake = fakeVals({ "ref+openbao://secrets/shared/pdm-root#/password": "x" });
    const r = resolver(fake);
    const doc = "a: ref+openbao://secrets/shared/pdm-root#/password";
    await r.resolveText(doc);
    await r.resolveText(doc);
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

  it("fails on a surviving reference scheme, naming the scheme and never the content", async () => {
    // An unsupported provider rides along with a resolvable openbao ref; vals
    // leaves it untouched and the residue guard must catch it.
    const fake = fakeVals({ "ref+openbao://secrets/shared/pdm-root#/password": "x" });
    const doc = ["a: ref+openbao://secrets/shared/pdm-root#/password", "b: ref+sops://bootstrap/thing.sops.yaml#/key"].join("\n");
    await assert.rejects(
      () => resolver(fake).resolveText(doc),
      (error: Error) => {
        assert.match(error.message, /unresolved secret-reference scheme/);
        assert.match(error.message, /ref\+sops:\/\//);
        assert.doesNotMatch(error.message, /bootstrap\/thing/);
        return true;
      },
    );
  });

  it("does not trip the residue guard on ref+ prose or shell globs", async () => {
    // provision.sh carries `ref+*)` and comments saying "ref+..." — scheme
    // shapes only (`ref+x://`) count as residue.
    const fake = fakeVals({ "ref+openbao://secrets/shared/pdm-root#/password": "x" });
    const doc = ['case "$pw" in op://* | ref+*) echo guarded ;; esac # catches "ref+..." literals', "PASSWORD=ref+openbao://secrets/shared/pdm-root#/password"].join("\n");
    const { value } = await settle(resolver(fake).resolve(doc));
    assert.match(value, /ref\+\*\)/);
    assert.match(value, /PASSWORD=x/);
  });

  it("leaves op:// references for the 1Password resolver", async () => {
    // The two resolvers chain during the transition; each syntax names its
    // store by construction, so this one must never touch the other's.
    const fake = fakeVals({});
    const { value } = await settle(resolver(fake).resolve('token: "op://Eris/Gatus Pushover Key/credential"'));
    assert.equal(value, 'token: "op://Eris/Gatus Pushover Key/credential"');
    assert.equal(fake.calls.length, 0);
  });

  it("fails loudly if vals returns no content for the wrapped document", async () => {
    // The real binary does exactly this for raw non-YAML input (exit 0, empty
    // stdout) — the wrapping prevents it, and this guard proves we would
    // notice rather than write out an empty file if it ever regressed.
    const exec: ValsExec = async () => "";
    const r = new SecretRefResolver(exec, () => fakeBao);
    await assert.rejects(() => r.resolveText("a: ref+openbao://secrets/shared/pdm-root#/password"), /returned no content/);
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
