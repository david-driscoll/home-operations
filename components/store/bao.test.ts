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
import { assertClustersFound, assertNotDirectory, BaoStore, backupPlanKeys, parseClusterDetails, resolveBaoPath, shapeItem, tailscaleExportKeys } from "./bao.ts";
import { shapeBackupPlans, shapeTailscaleExports } from "./index.ts";

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

  it("keeps cluster-definition titles off OpenBao — they are checked-in code", () => {
    assert.equal(resolveBaoPath("Cluster: Alpha Site").path, undefined);
  });

  it("serves Authentik Outputs from the _inventory path its producer dual-writes", () => {
    // The gate for this entry is that the authentik stack has RUN since #717
    // merged — verified live 2026-08-11 before the route landed. A consumer
    // switched before that read an empty object rather than an error (§G-8).
    assert.equal(resolveBaoPath("Authentik Outputs").path, "clusters/_inventory/authentik-outputs");
  });

  it("routes the inventory families to their reserved _inventory paths, never shared/", () => {
    assert.equal(resolveBaoPath("Backup Plan").path, "clusters/_inventory/backup-plan");
    assert.equal(resolveBaoPath("Equestria Backup Plan").path, "clusters/_inventory/equestria-backup-plan");
    // A multi-word cluster title still slugs into one reserved path — this
    // read `Stargate Command Backup Plan` until SGC's teardown; the rule it
    // pins is the slug, not the cluster.
    assert.equal(resolveBaoPath("Alpha Site Backup Plan").path, "clusters/_inventory/alpha-site-backup-plan");
    assert.equal(resolveBaoPath("Tailscale Export - home-operations").path, "clusters/_inventory/tailscale-export-home-operations");
    // A title merely containing the words is not the family.
    assert.equal(resolveBaoPath("Backup Plan Review Notes").path, "shared/backup-plan-review-notes");
  });

  it("does not slug a UUID-addressed item into a UUID-shaped path", () => {
    // `shared/soz3lyvs6k24e5gh3udqp4sngi` is a path that cannot exist; saying
    // so beats a 404 from somewhere deep in an apply().
    const r = resolveBaoPath("soz3lyvs6k24e5gh3udqp4sngi");
    assert.equal(r.path, undefined);
    assert.match(r.reason ?? "", /addressed by UUID/);
  });
});

describe("tailscaleExportKeys", () => {
  const complete = ["tailscale-export-gulf-of-mexico", "tailscale-export-home-operations", "tailscale-export-ocracoke"];

  it("selects only the tailscale-export keys from an _inventory LIST", () => {
    // The prefix also holds authentik-outputs and (later) the backup plans;
    // neither is a tailscale export.
    assert.deepEqual(tailscaleExportKeys(["authentik-outputs", ...complete]), complete);
  });

  it("refuses an EMPTY inventory rather than returning []", () => {
    // [] here would flow into stacks/unifi-network as "the estate has no
    // nodes" and start removing live ACL grants — the §G-8 failure, silent.
    assert.throws(() => tailscaleExportKeys(["authentik-outputs"]), /incomplete .* missing tailscale-export-gulf-of-mexico, tailscale-export-home-operations, tailscale-export-ocracoke/);
  });

  it("refuses a TORN inventory, naming the stack that has not run", () => {
    assert.throws(() => tailscaleExportKeys(complete.filter(k => k !== "tailscale-export-ocracoke")), /missing tailscale-export-ocracoke/);
  });

  it("includes exports beyond the known set — the list is a floor, not a ceiling", () => {
    assert.deepEqual(tailscaleExportKeys([...complete, "tailscale-export-new-stack"]), [...complete, "tailscale-export-new-stack"]);
  });
});

describe("shapeTailscaleExports", () => {
  // One shaping function serves both stores; these pin the behaviors the
  // unifi-network consumers depend on.
  const item = (name: string, hosts: Record<string, unknown>, services?: string) => ({ name, ...(services === undefined ? {} : { services }), ...hosts });

  it("splits node objects from flat fields and sorts at both levels", () => {
    const shaped = shapeTailscaleExports([
      item("ocracoke", { zebra: { externalIp: "100.1.1.2", internalIp: "10.0.0.2", mac: "bb", nodeType: "dockge" }, alpha: { externalIp: "100.1.1.1", internalIp: "10.0.0.1", mac: "aa", nodeType: "proxmox" } }),
      item("gulf-of-mexico", {}, '["svc:llm"]'),
    ]);
    assert.deepEqual(
      shaped.map(z => z.name),
      ["gulf-of-mexico", "ocracoke"],
    );
    assert.deepEqual(
      shaped[1].hosts.map(h => h.name),
      ["alpha", "zebra"],
    );
    assert.deepEqual(shaped[0].services, ["svc:llm"]);
    assert.deepEqual(shaped[1].services, []);
  });

  it("tolerates the pre-rename `ip` key", () => {
    const shaped = shapeTailscaleExports([item("home-operations", { node: { ip: "100.1.1.3", internalIp: "10.0.0.3", mac: "cc", nodeType: "pbs" } })]);
    assert.equal(shaped[0].hosts[0].externalIp, "100.1.1.3");
  });
});

describe("backupPlanKeys", () => {
  const complete = ["backup-plan", "equestria-backup-plan"];

  it("selects the bare key and the -backup-plan suffixed keys, nothing else", () => {
    assert.deepEqual(backupPlanKeys(["authentik-outputs", "tailscale-export-ocracoke", ...complete]), complete);
  });

  it("refuses an empty or torn inventory, naming what is missing", () => {
    // A smaller list here quietly shrinks what the directors back up — a
    // failure with no symptom until a restore is needed.
    assert.throws(() => backupPlanKeys([]), /missing backup-plan, equestria-backup-plan/);
    assert.throws(() => backupPlanKeys(complete.filter(k => k !== "equestria-backup-plan")), /missing equestria-backup-plan/);
  });

  it("includes plans beyond the known set — a floor, not a ceiling", () => {
    assert.deepEqual(backupPlanKeys([...complete, "luna-backup-plan"]), [...complete, "luna-backup-plan"]);
  });

  it("does not demand a retired cluster's plan — SGC's key may be absent", () => {
    // The teardown fuse: `pulumi destroy --stack sgc` removes
    // `stargate-command-backup-plan` from the _inventory LIST. While it was
    // in BACKUP_PLAN_KEYS that made this throw for every consumer, taking
    // stacks/home, stacks/ocracoke and stacks/gulf-of-mexico down with it.
    assert.doesNotThrow(() => backupPlanKeys(complete));
    // …and while the key is still there (before the destroy), it is still read.
    assert.deepEqual(backupPlanKeys([...complete, "stargate-command-backup-plan"]), [...complete, "stargate-command-backup-plan"]);
  });
});

describe("shapeBackupPlans", () => {
  it("flattens every item's plans into one list", () => {
    const shaped = shapeBackupPlans<{ name: string }>([{ plan: JSON.stringify({ plans: [{ name: "a" }, { name: "b" }] }) }, { plan: JSON.stringify({ plans: [{ name: "c" }] }) }]);
    assert.deepEqual(
      shaped.map(p => p.name),
      ["a", "b", "c"],
    );
  });
});

describe("parseClusterDetails", () => {
  const good = {
    key: "equestria",
    title: "Equestria",
    type: "kubernetes",
    location: "home",
    rootDomain: "equestria.driscoll.tech",
    authentikDomain: "canterlot.driscoll.tech",
    icon: "https://example.invalid/i.png",
    favicon: "https://example.invalid/f.png",
    background: "https://example.invalid/b.jpg",
    secretField: "secret",
  };
  const meta = { source_title: "Cluster: Equestria" };

  it("parses a published definition and takes meta.title from custom_metadata", () => {
    const c = parseClusterDetails("equestria", good, meta);
    assert.equal(c.key, "equestria");
    assert.equal(c.sourceTitle, "Cluster: Equestria");
    assert.equal(c.secretField, "secret");
    assert.equal(c.rootDomain, "equestria.driscoll.tech");
  });

  it("maps the 'none' sentinel to null rather than carrying it through", () => {
    // KV values are strings: null does not round-trip and "" is
    // indistinguishable from a real field name.
    assert.equal(parseClusterDetails("celestia", { ...good, key: "celestia", secretField: "none" }, {}).secretField, null);
  });

  it("rejects a key that disagrees with its path", () => {
    // clusterSecretPath derives from the path key, so a mismatch would read
    // ANOTHER cluster's credential.
    assert.throws(() => parseClusterDetails("luna", good, meta), /'key' is 'equestria' but the path says 'luna'/);
  });

  it("rejects a missing or empty required field rather than rendering undefined into a URL", () => {
    for (const field of ["title", "type", "rootDomain", "authentikDomain", "icon", "favicon", "background"]) {
      assert.throws(() => parseClusterDetails("equestria", { ...good, [field]: "" }, meta), new RegExp(`'${field}' must be a non-empty string`), field);
      const { [field]: _dropped, ...missing } = good as Record<string, unknown>;
      assert.throws(() => parseClusterDetails("equestria", missing, meta), new RegExp(`'${field}' must be a non-empty string`), `${field} (absent)`);
    }
  });

  it("rejects an unrecognised secretField instead of silently merging nothing", () => {
    assert.throws(() => parseClusterDetails("equestria", { ...good, secretField: "token" }, meta), /must be 'none', 'secret' or 'arcane_token'/);
    assert.throws(() => parseClusterDetails("equestria", { ...good, secretField: "" }, meta), /must be 'none', 'secret' or 'arcane_token'/);
  });

  it("does not leak the sentinel into the object stacks consume", () => {
    const c = parseClusterDetails("celestia", { ...good, key: "celestia", secretField: "none" }, {}) as Record<string, unknown>;
    assert.equal(c.secretField, null);
    assert.notEqual(c.secretField, "none");
  });
});

describe("BaoStore cluster reads", () => {
  function stub(paths: Record<string, any>, listing: string[]) {
    return {
      read: async (_m: string, path: string) => paths[path],
      list: async (_m: string, prefix: string) =>
        prefix === "clusters"
          ? listing
          : Object.keys(paths)
              .filter(p => p.startsWith(`${prefix}/`))
              .map(p => p.slice(prefix.length + 1))
              .sort(),
    } as unknown as ConstructorParameters<typeof BaoStore>[0];
  }
  const details = (key: string, extra: Record<string, unknown> = {}) => ({
    data: {
      key,
      title: key,
      type: "dockge",
      location: "home",
      rootDomain: `${key}.driscoll.tech`,
      authentikDomain: "a.driscoll.tech",
      icon: "https://i",
      favicon: "https://f",
      background: "https://b",
      secretField: "none",
      ...extra,
    },
    metadata: { version: 1, created_time: "", custom_metadata: { source_title: `Cluster: ${key}` } },
  });

  it("skips _inventory and any directory with no details path", async () => {
    // `twilight-sparkle` has app credentials but no definition; `_inventory`
    // is not a cluster at all. A directory listing proves nothing.
    const store = new BaoStore(stub({ "clusters/celestia/details": details("celestia"), "clusters/luna/details": details("luna") }, ["_inventory/", "celestia/", "luna/", "twilight-sparkle/"]));
    const got = await new Promise<any[]>(res => store.getAllClusters().apply(v => (res(v as any[]), v)));
    assert.deepEqual(
      got.map(c => c.key),
      ["celestia", "luna"],
    );
  });

  it("refuses an EMPTY set rather than reporting an estate with no clusters", () => {
    // Consumers turn this list into DNS records, ACL grants and backup plans:
    // "no clusters" reads as "remove everything". If this fires in anger,
    // stacks/system has not run.
    assert.throws(() => assertClustersFound([]), /stacks\/system publishes them from \/clusters and has not run/);
    assert.equal(assertClustersFound([{ key: "celestia", sourceTitle: "Cluster: Celestia", secretField: null }]).length, 1);
  });

  it("resolves a cluster by its source title", async () => {
    const store = new BaoStore(stub({ "clusters/celestia/details": details("celestia") }, ["celestia/"]));
    const got = await new Promise<any>(res => store.getCluster("Cluster: celestia").apply(v => (res(v), v)));
    assert.equal(got.key, "celestia");
    assert.deepEqual(got.meta.tags, ["cluster-definition"]);
  });
});
