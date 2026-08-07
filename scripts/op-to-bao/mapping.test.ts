/**
 * node --test --experimental-strip-types scripts/op-to-bao/mapping.test.ts
 *
 * Covers the pure classification/flattening logic and the KV client's wire
 * behaviour against a stub server. Neither 1Password nor OpenBao is contacted.
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { CategoryEnum, TypeEnum } from "@components/op.ts";
import { BaoClient } from "./bao.ts";
import { classify, describe as describeItem, slug, toPayload } from "./mapping.ts";

type Item = Parameters<typeof classify>[0];

function item(over: Partial<Item> = {}): Item {
  return {
    id: "abcdefghijklmnopqrstuvwxyz",
    title: "Some Item",
    category: CategoryEnum.Login,
    urls: [],
    tags: [],
    sections: {},
    fields: {},
    files: {},
    ...over,
  } as Item;
}

const concealed = (value: string) => ({ type: TypeEnum.Concealed, value });
const plain = (value: string) => ({ type: TypeEnum.String, value });

describe("slug", () => {
  it("collapses punctuation and lowercases", () => {
    assert.equal(slug("Cloudflare (driscoll.tech)"), "cloudflare-driscoll-tech");
    assert.equal(slug("Cluster: Alpha Site"), "cluster-alpha-site");
    assert.equal(slug("Github Actions Runner (david-driscoll)"), "github-actions-runner-david-driscoll");
  });

  it("does not leave leading or trailing dashes", () => {
    assert.equal(slug("  ...Weird!!  "), "weird");
  });
});

describe("classify", () => {
  it("routes generated oidc credentials without review", () => {
    const c = classify(item({ title: "equestria-headlamp-oidc-credentials" }));
    assert.equal(c.path, "clusters/equestria/apps/headlamp/oidc");
    assert.equal(c.review, false);
  });

  it("routes generated postgres credentials without review", () => {
    const c = classify(item({ title: "sgc-immich-postgres" }));
    assert.equal(c.path, "clusters/sgc/apps/immich/postgres");
    assert.equal(c.review, false);
  });

  it("does not mistake an unknown prefix for a cluster", () => {
    // `notacluster-foo-postgres` must fall through to shared/, otherwise a
    // typo'd cluster name silently invents a clusters/ tree.
    const c = classify(item({ title: "notacluster-foo-postgres" }));
    assert.equal(c.path, "shared/notacluster-foo-postgres");
    assert.equal(c.review, true);
  });

  it("gives tag-based groups a path prefix, replacing findItemsByTag", () => {
    assert.equal(classify(item({ title: "DockgeLxc: Celestia", tags: ["dockge", "lxc"] })).path, "hosts/dockge/dockgelxc-celestia");
    assert.equal(classify(item({ title: "PBS: Luna", tags: ["pbs"] })).path, "hosts/pbs/pbs-luna");
  });

  it("marks inventory tags skip so they go to Pulumi outputs instead", () => {
    const c = classify(item({ title: "Celestia Backup Plan", tags: ["backup-plan"] }));
    assert.equal(c.skip, true);
    assert.equal(c.review, true);
  });

  it("flags uuid-addressed items for naming", () => {
    const c = classify(item({ title: "7ntcze3fqqzun7huc7vyoirco4" }));
    assert.match(c.path, /UNRESOLVED/);
    assert.equal(c.review, true);
  });

  it("sends a concealed-free secure note to the docs mount", () => {
    const c = classify(item({ title: "Rebuild Notes", category: CategoryEnum.SecureNote, fields: { body: plain("how to") } }));
    assert.equal(c.mount, "docs");
    assert.equal(c.review, true);
  });

  it("keeps a secure note WITH a concealed field in secrets", () => {
    const c = classify(item({ title: "Authentik Outputs", category: CategoryEnum.SecureNote, fields: { token: concealed("t") } }));
    assert.equal(c.mount, "secrets");
  });
});

describe("toPayload", () => {
  it("keeps root fields flat and sections nested", () => {
    const { data } = toPayload(
      item({
        fields: { username: plain("admin"), credential: concealed("hunter2") },
        sections: { ssh: { id: "ssh", fields: { host: plain("h1"), key: concealed("k") }, files: {} } },
      }),
      "2026-01-01T00:00:00Z",
    );
    assert.equal(data.username, "admin");
    assert.equal(data.credential, "hunter2");
    assert.deepEqual(data.ssh, { host: "h1", key: "k" });
  });

  it("drops fields with no value rather than writing undefined", () => {
    const { data } = toPayload(item({ fields: { set: plain("x"), unset: { type: TypeEnum.String } } }), "");
    assert.ok("set" in data);
    assert.ok(!("unset" in data));
  });

  it("encodes files as base64 with a checksum, in data not metadata", () => {
    const { data } = toPayload(item({ files: { "creds.json": { name: "creds.json", size: 2, content: "{}" } } }), "");
    const files = data.files as Record<string, { content_b64: string; sha256: string; filename: string }>;
    assert.equal(files["creds.json"].content_b64, Buffer.from("{}").toString("base64"));
    assert.equal(files["creds.json"].sha256.length, 64);
  });

  it("records provenance in custom_metadata and marks secret-bearing items", () => {
    const { customMetadata } = toPayload(
      item({ title: "T", tags: ["a", "b"], fields: { pw: concealed("p") } }),
      "2026-01-01T00:00:00Z",
    );
    assert.equal(customMetadata.source_title, "T");
    assert.equal(customMetadata.source_tags, "a,b");
    assert.equal(customMetadata.concealed_fields, "pw");
    assert.equal(customMetadata.contains_secrets, "true");
  });

  it("truncates metadata values to OpenBao's 512-char ceiling", () => {
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`field_number_${i}`, concealed("x")]));
    const { customMetadata } = toPayload(item({ fields: many }), "");
    assert.ok(customMetadata.concealed_fields.length <= 512, `was ${customMetadata.concealed_fields.length}`);
  });
});

describe("describeItem", () => {
  it("reports section fields dotted, and sorts for stable diffs", () => {
    const d = describeItem(item({ fields: { b: plain("1"), a: concealed("2") }, sections: { s: { id: "s", fields: { z: concealed("3") }, files: {} } } }));
    assert.deepEqual(d.fields, ["a", "b", "s.z"]);
    assert.deepEqual(d.concealed, ["a", "s.z"]);
  });
});

describe("BaoClient", () => {
  let server: Server;
  let seen: { method: string; url: string; token: string | undefined; body: string }[] = [];
  const port = 18201;

  before(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", c => (body += c));
      req.on("end", () => {
        seen.push({ method: req.method!, url: req.url!, token: req.headers["x-vault-token"] as string, body });
        if (req.url === "/v1/secrets/data/missing") {
          res.writeHead(404).end("{}");
        } else if (req.url === "/v1/secrets/data/boom") {
          res.writeHead(403).end('{"errors":["permission denied"]}');
        } else if (req.method === "GET" && req.url?.includes("list=true")) {
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: { keys: ["c", "a", "b"] } }));
        } else if (req.method === "GET") {
          res.writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify({ data: { data: { k: "v" }, metadata: { version: 3, custom_metadata: null } } }));
        } else {
          res.writeHead(204).end();
        }
      });
    });
    await new Promise<void>(r => server.listen(port, r));
  });

  after(() => server.close());

  const client = () => new BaoClient(`http://127.0.0.1:${port}/`, "test-token");

  it("reads the KV v2 data envelope and sends the token header", async () => {
    seen = [];
    const got = await client().read("secrets", "shared/thing");
    assert.deepEqual(got?.data, { k: "v" });
    assert.equal(got?.metadata.version, 3);
    assert.equal(seen[0].url, "/v1/secrets/data/shared/thing");
    assert.equal(seen[0].token, "test-token");
  });

  it("returns undefined for a missing secret instead of throwing", async () => {
    assert.equal(await client().read("secrets", "missing"), undefined);
  });

  it("surfaces the server's error body, not just the status", async () => {
    await assert.rejects(() => client().read("secrets", "boom"), /403.*permission denied/s);
  });

  it("sends cas so a re-run cannot silently clobber", async () => {
    seen = [];
    await client().write("secrets", "p", { a: 1 }, 3);
    assert.deepEqual(JSON.parse(seen[0].body), { data: { a: 1 }, options: { cas: 3 } });
  });

  it("omits options entirely when cas is not given", async () => {
    seen = [];
    await client().write("secrets", "p", { a: 1 });
    assert.deepEqual(JSON.parse(seen[0].body), { data: { a: 1 } });
  });

  it("writes custom metadata to the metadata endpoint, not data", async () => {
    seen = [];
    await client().writeCustomMetadata("secrets", "p", { source_title: "T" });
    assert.equal(seen[0].url, "/v1/secrets/metadata/p");
    assert.deepEqual(JSON.parse(seen[0].body), { custom_metadata: { source_title: "T" } });
  });

  it("lists via GET ?list=true, not the LIST verb, and sorts the result", async () => {
    seen = [];
    assert.deepEqual(await client().list("secrets", "hosts/dockge/"), ["a", "b", "c"]);
    assert.equal(seen[0].url, "/v1/secrets/metadata/hosts/dockge?list=true");
    // LIST is not a registered HTTP method; Node's own parser rejects it, so
    // the query form is what actually survives the wire.
    assert.equal(seen[0].method, "GET");
  });
});
