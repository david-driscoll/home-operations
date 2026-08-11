/**
 * npx tsx --test components/store/bao.test.ts
 *
 * Covers the Phase 8 read path: KV v2 result -> the object shape stacks
 * already consume. No Pulumi engine and no network — `shapeItem` is pure, and
 * `BaoClient`'s wire behaviour is covered in scripts/op-to-bao/mapping.test.ts
 * against a stub server.
 *
 * The point of these is the `secret()` markers. A field that loses one still
 * renders the right value, still produces a clean `pulumi preview`, and writes
 * the credential to state in the clear — there is no symptom until someone
 * runs `pulumi stack export`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSecret, runtime } from "@pulumi/pulumi";
import { assertNotDirectory, BaoStore, baoStoreReadsEnabled, resolveBaoPath, shapeItem } from "./bao.ts";

runtime.setMocks({
  newResource: args => ({ id: `${args.name}-id`, state: args.inputs }),
  call: args => args.inputs,
});

type KvResult = NonNullable<Parameters<typeof shapeItem>[1]>;

function kv(data: Record<string, unknown>, customMetadata: Record<string, string> | null = null): KvResult {
  return { data, metadata: { version: 1, created_time: "2026-08-08T15:14:48Z", custom_metadata: customMetadata } };
}

/** Resolve a shaped item to plain values plus whether it carries a secret. */
async function resolve(item: ReturnType<typeof shapeItem>) {
  const value = await new Promise<Record<string, unknown>>(res => item.apply(v => (res(v), v)));
  return { value, isSecret: await isSecret(item) };
}

/** Is this single field marked secret, independent of its siblings? */
async function fieldIsSecret(result: KvResult, key: string) {
  // Re-shape one field at a time: `output()` propagates secretness upward, so
  // a whole shaped item reports secret if ANY field is. Isolating the field is
  // the only way to prove the marker landed on the right one.
  const single = shapeItem("t", kv({ [key]: result.data[key] }, result.metadata.custom_metadata));
  return (await resolve(single)).isSecret;
}

describe("shapeItem", () => {
  it("maps root fields to top-level keys", async () => {
    const { value } = await resolve(shapeItem("shared/x", kv({ username: "u", hostname: "h" })));
    assert.equal(value.username, "u");
    assert.equal(value.hostname, "h");
  });

  it("marks only the fields listed in concealed_fields", async () => {
    const result = kv({ username: "u", credential: "c" }, { concealed_fields: "credential", contains_secrets: "true" });
    assert.equal(await fieldIsSecret(result, "credential"), true);
    assert.equal(await fieldIsSecret(result, "username"), false);
  });

  it("resolves dotted concealed paths inside a section", async () => {
    const result = kv({ ssh: { username: "root", password: "p" } }, { concealed_fields: "ssh.password", contains_secrets: "true" });
    const { value, isSecret } = await resolve(shapeItem("hosts/dockge/x", result));
    assert.deepEqual(value.ssh, { username: "root", password: "p" });
    // The section carries a concealed leaf, so the item as a whole is secret.
    assert.equal(isSecret, true);
    // ...and a section with no concealed leaf is not.
    const plain = shapeItem("t", kv({ ssh: { username: "root" } }, { concealed_fields: "ssh.password" }));
    assert.equal((await resolve(plain)).isSecret, false);
  });

  it("refuses a path marked contains_secrets with no concealed_fields", () => {
    // Losing the list would silently downgrade every value to plaintext in
    // state, which nothing else in the pipeline would notice.
    assert.throws(() => shapeItem("shared/x", kv({ credential: "c" }, { contains_secrets: "true" })), /refusing to read its values as plaintext/);
  });

  it("decodes a file to its content under the file's name, always secret", async () => {
    const files = { "key.pem": { filename: "key.pem", content_b64: Buffer.from("PRIVATE").toString("base64"), sha256: "…" } };
    const { value } = await resolve(shapeItem("shared/x", kv({ files })));
    assert.equal(value["key.pem"], "PRIVATE");
    assert.equal(await fieldIsSecret(kv({ files }), "files"), true);
  });

  it("rejects a files entry that is not a content envelope", () => {
    assert.throws(() => shapeItem("shared/x", kv({ files: { "key.pem": "raw bytes" } })), /is not a \{content_b64\} envelope/);
  });

  it("takes meta.title from source_title and meta.tags from source_tags", async () => {
    const { value } = await resolve(shapeItem("hosts/dockge/dockgelxc-celestia", kv({}, { source_title: "DockgeLxc: Celestia", source_tags: "dockge,lxc" })));
    assert.deepEqual(value.meta, { title: "DockgeLxc: Celestia", tags: ["dockge", "lxc"] });
  });

  it("falls back to the path when source_title is absent, and never invents tags", async () => {
    // Pulumi-written secrets carry `source: pulumi` provenance, not the
    // op-to-bao migration labels, so both of these are legitimately missing.
    const { value } = await resolve(shapeItem("clusters/equestria/apps/headlamp/oidc", kv({})));
    assert.deepEqual(value.meta, { title: "clusters/equestria/apps/headlamp/oidc", tags: [] });
  });

  it("throws a path-naming error when the secret is absent", () => {
    assert.throws(() => shapeItem("shared/nope", undefined), /secrets\/shared\/nope does not exist/);
  });
});

describe("BaoStore", () => {
  /** A BaoClient stand-in: no constructor credential check, no network. */
  function stubClient(paths: Record<string, KvResult>) {
    return {
      read: async (_mount: string, path: string) => paths[path],
      list: async (_mount: string, prefix: string) =>
        Object.keys(paths)
          .filter(p => p.startsWith(`${prefix}/`))
          .map(p => p.slice(prefix.length + 1))
          .sort(),
    } as unknown as ConstructorParameters<typeof BaoStore>[0];
  }

  it("resolves a 1Password title to shared/<slug>", async () => {
    const store = new BaoStore(stubClient({ "shared/cloudflare-driscoll-tech": kv({ zoneId: "z" }) }));
    const item = await new Promise<any>(res => store.getSecretByTitle<{ zoneId: string }>("Cloudflare (driscoll.tech)").apply(v => (res(v), v)));
    assert.equal(item.zoneId, "z");
  });

  it("reads a path once however many times it is asked for", async () => {
    let reads = 0;
    const client = {
      read: async (_m: string, _p: string) => {
        reads++;
        return kv({ hostname: "opossum-yo.ts.net" });
      },
    } as unknown as ConstructorParameters<typeof BaoStore>[0];
    const store = new BaoStore(client);
    store.getSecretByTitle("Tailscale Terraform OAuth Client");
    store.getSecretByTitle("Tailscale Terraform OAuth Client");
    await new Promise<any>(res => store.tailscaleDomain.apply(v => (res(v), v)));
    assert.equal(reads, 1);
  });

  it("lists hosts/dockge/ in place of tag:dockge", async () => {
    const store = new BaoStore(
      stubClient({
        "hosts/dockge/dockgelxc-celestia": kv({ name: "celestia" }, { source_title: "DockgeLxc: Celestia" }),
        "hosts/dockge/dockgelxc-luna": kv({ name: "luna" }, { source_title: "DockgeLxc: Luna" }),
        "shared/unrelated": kv({ name: "no" }),
      }),
    );
    const items = await new Promise<any[]>(res => store.getDockgeInstances().apply(v => (res(v as any[]), v)));
    assert.deepEqual(
      items.map(i => i.name),
      ["celestia", "luna"],
    );
  });

  it("rejects a nested directory under a listed prefix rather than reading it", () => {
    // LIST marks a directory with a trailing slash. Reading one as a secret
    // would 404 far from the cause, so the guard names the layout change.
    assert.throws(() => assertNotDirectory("hosts/dockge", "sub/"), /is a directory, not a secret/);
    assert.doesNotThrow(() => assertNotDirectory("hosts/dockge", "dockgelxc-celestia"));
  });
});

describe("resolveBaoPath", () => {
  it("slugs an ordinary title into shared/", () => {
    assert.equal(resolveBaoPath("Cloudflare (driscoll.tech)").path, "shared/cloudflare-driscoll-tech");
    assert.equal(resolveBaoPath("minio root user").path, "shared/minio-root-user");
  });

  it("sends a generated OIDC credential to its per-app path, not to shared/", () => {
    // Phase 4 deliberately skipped this family; Phase 8a writes it here. The
    // default rule would look for a path that will never exist.
    assert.equal(resolveBaoPath("equestria-headlamp-oidc-credentials").path, "clusters/equestria/apps/headlamp/oidc");
  });

  it("splits a dashed cluster key at the right dash", () => {
    // Splitting on the FIRST dash yields cluster `alpha`, app `site-technitium`.
    assert.equal(resolveBaoPath("alpha-site-technitium-oidc-credentials").path, "clusters/alpha-site/apps/technitium/oidc");
  });

  it("refuses to guess when an OIDC title names no known cluster", () => {
    assert.equal(resolveBaoPath("something-random-oidc-credentials").path, undefined);
    assert.match(resolveBaoPath("something-random-oidc-credentials").reason ?? "", /names no known cluster key/);
  });

  it("keeps the seal chain on 1Password, permanently", () => {
    const r = resolveBaoPath("OpenBao Alpha Site Static Unseal");
    assert.equal(r.path, undefined);
    assert.match(r.reason ?? "", /INVENTORY §2/);
  });

  it("keeps cross-stack inventory and cluster definitions on 1Password for now", () => {
    for (const title of ["Authentik Outputs", "Backup Plan", "Cluster: Alpha Site"]) {
      assert.equal(resolveBaoPath(title).path, undefined, title);
    }
  });

  it("does not slug a UUID-addressed item into a UUID-shaped path", () => {
    // `shared/soz3lyvs6k24e5gh3udqp4sngi` is a path that cannot exist; saying
    // so beats a 404 from somewhere deep in an apply().
    const r = resolveBaoPath("soz3lyvs6k24e5gh3udqp4sngi");
    assert.equal(r.path, undefined);
    assert.match(r.reason ?? "", /addressed by UUID/);
  });
});

describe("baoStoreReadsEnabled", () => {
  it("is off unless explicitly turned on", () => {
    const prior = process.env.BAO_STORE_READS;
    try {
      for (const [value, expected] of [
        [undefined, false],
        ["", false],
        ["0", false],
        ["false", false],
        ["1", true],
        ["true", true],
        ["TRUE", true],
        ["yes", true],
      ] as const) {
        if (value === undefined) delete process.env.BAO_STORE_READS;
        else process.env.BAO_STORE_READS = value;
        assert.equal(baoStoreReadsEnabled(), expected, `BAO_STORE_READS=${String(value)}`);
      }
    } finally {
      if (prior === undefined) delete process.env.BAO_STORE_READS;
      else process.env.BAO_STORE_READS = prior;
    }
  });
});
