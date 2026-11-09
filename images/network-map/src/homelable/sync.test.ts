/**
 * node --test images/network-map/src/homelable/sync.test.ts
 *
 * The sync against an in-memory Homelable (./client.ts memoryHomelable): it
 * finds, adopts or creates its four designs, keeps each node's inventory row
 * across runs, and isolates one design's failure from the others. Then the
 * HTTP client's requests, and the env.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { httpHomelableClient, memoryHomelable } from "./client.ts";
import { loadHomelableConfig } from "./config.ts";
import { fixtureGraph, graphBuilder } from "./fixture.test.ts";
import { cleanInventory, type DesignOutcome, syncHomelable } from "./sync.ts";

describe("syncHomelable", () => {
  it("adopts the empty Network Topology design for UniFi and creates the rest", async () => {
    const hl = memoryHomelable({ designs: [{ id: "nt", name: "Network Topology", design_type: "network", node_count: 0, group_count: 0, text_count: 0 }] });
    const outcomes = await syncHomelable(fixtureGraph(), hl.client);
    assert.deepEqual(
      outcomes.map(o => [o.design, o.status, o.designId]),
      [
        ["UniFi", "ok", "nt"],
        ["Tailscale", "ok", "design-1"],
        ["NetBird", "ok", "design-2"],
        ["Apps", "ok", "design-3"],
      ],
    );
    assert.deepEqual(
      hl.designs.map(d => d.name),
      ["UniFi", "Tailscale", "NetBird", "Apps"],
    );
    assert.equal(hl.saves.length, 4);
    assert.ok(hl.calls.indexOf("loadCanvas nt") < hl.calls.indexOf("saveCanvas nt"), "reads the canvas before replacing it");
  });

  it("leaves a Network Topology someone has drawn on alone", async () => {
    const hl = memoryHomelable({ designs: [{ id: "nt", name: "Network Topology", design_type: "network", node_count: 3 }] });
    const [unifi] = await syncHomelable(fixtureGraph(), hl.client);
    assert.notEqual(unifi.designId, "nt");
    assert.equal(hl.designs.find(d => d.id === "nt")?.name, "Network Topology");
  });

  it("keeps every node's inventory row from one run to the next", async () => {
    const hl = memoryHomelable();
    await syncHomelable(fixtureGraph(), hl.client);
    const first = hl.saves.map(s => structuredClone(hl.canvases.get(s.design_id)));
    hl.saves.length = 0;
    const second = await syncHomelable(fixtureGraph(), hl.client);
    assert.ok(
      second.every(o => o.status === "ok" && !o.created),
      "the designs are found by name",
    );
    for (const [i, save] of hl.saves.entries()) {
      const before = new Map(first[i]?.nodes.map(n => [n.id, n.device_id]));
      for (const n of save.nodes) {
        if (n.type === "groupRect") assert.equal(n.device_id, null);
        else assert.equal(n.device_id, before.get(n.id), `${save.design_id}/${n.label} keeps its row`);
      }
    }
  });

  it("saves the other designs when one fails", async () => {
    const hl = memoryHomelable();
    await syncHomelable(fixtureGraph(), hl.client);
    const tailscale = hl.designs.find(d => d.name === "Tailscale")?.id;
    hl.fail.set("saveCanvas", id => id === tailscale);
    const outcomes = await syncHomelable(fixtureGraph(), hl.client);
    assert.deepEqual(
      outcomes.map(o => o.status),
      ["ok", "failed", "ok", "ok"],
    );
    assert.match(outcomes[1].error ?? "", /HTTP 500/);
  });

  it("does not save a design whose canvas it cannot read", async () => {
    const hl = memoryHomelable();
    hl.fail.set("loadCanvas", () => true);
    const outcomes = await syncHomelable(fixtureGraph(), hl.client);
    assert.ok(outcomes.every(o => o.status === "failed"));
    assert.equal(hl.saves.length, 0);
  });

  it("fails every design, and touches nothing, when the designs cannot be listed or the graph is empty", async () => {
    const down = memoryHomelable();
    down.fail.set("listDesigns", () => true);
    assert.ok((await syncHomelable(fixtureGraph(), down.client)).every(o => o.status === "failed" && /listing designs/.test(o.error ?? "")));
    const empty = memoryHomelable();
    const outcomes = await syncHomelable(graphBuilder().graph(), empty.client);
    assert.ok(outcomes.every(o => o.status === "failed" && /empty/.test(o.error ?? "")));
    assert.deepEqual(empty.calls, []);
  });
});

describe("cleanInventory", () => {
  const owned = [{ key: "managed-by", value: "network-map", icon: null, visible: false }];
  const allOk = (): DesignOutcome[] => ["UniFi", "Tailscale", "NetBird", "Apps"].map(design => ({ design, status: "ok" }) as DesignOutcome);

  it("deletes only the owned rows no design draws any more", async () => {
    const hl = memoryHomelable({
      inventory: [
        { id: "scanner-row", label: "printer", properties: [] },
        { id: "hand-row", label: "nas", properties: [{ key: "managed-by", value: "someone-else", icon: null, visible: false }] },
      ],
    });
    const first = await syncHomelable(fixtureGraph(), hl.client);
    const drawn = new Set([...hl.canvases.values()].flatMap(c => c.nodes.map(n => n.device_id)));
    // A machine leaves the map: its node goes, its row stays behind.
    const gone = [...drawn].find(Boolean) as string;
    for (const c of hl.canvases.values()) c.nodes = c.nodes.filter(n => n.device_id !== gone);
    const result = await cleanInventory(hl.client, first);
    assert.equal(result.status, "ok");
    assert.deepEqual(hl.deleted, [gone]);
    assert.ok(hl.inventory.has("scanner-row") && hl.inventory.has("hand-row"), "rows without the exact marker are never touched");
    assert.ok(
      [...drawn].filter(id => id && id !== gone).every(id => hl.inventory.has(id as string)),
      "drawn rows stay",
    );
  });

  it("does nothing unless every design saved this run", async () => {
    const hl = memoryHomelable({ inventory: [{ id: "orphan", properties: owned }] });
    const outcomes = allOk();
    outcomes[2] = { design: "NetBird", status: "failed", error: "HTTP 500" };
    const result = await cleanInventory(hl.client, outcomes);
    assert.equal(result.status, "skipped");
    assert.match(result.reason ?? "", /NetBird/);
    assert.deepEqual(hl.calls, [], "not even the inventory is read");
    assert.deepEqual((await cleanInventory(hl.client, [])).status, "skipped");
  });

  it("refuses a run that would delete more than a quarter of the owned rows", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `row-${String(i).padStart(2, "0")}`, properties: owned }));
    const hl = memoryHomelable({ inventory: rows });
    // Only 10 of 20 drawn: 10 unreferenced > max(3, 20 * 0.25 = 5).
    hl.canvases.set("d", { nodes: rows.slice(0, 10).map(r => ({ id: `n-${r.id}`, type: "server", device_id: r.id })), edges: [], viewport: {} });
    const refused = await cleanInventory(hl.client, allOk());
    assert.equal(refused.status, "refused");
    assert.deepEqual({ owned: refused.owned, unreferenced: refused.unreferenced, deleted: hl.deleted }, { owned: 20, unreferenced: 10, deleted: [] });

    // Within the cap (5 of 20), they go.
    hl.canvases.set("d", { nodes: rows.slice(0, 15).map(r => ({ id: `n-${r.id}`, type: "server", device_id: r.id })), edges: [], viewport: {} });
    const ok = await cleanInventory(hl.client, allOk());
    assert.equal(ok.status, "ok");
    assert.deepEqual(
      hl.deleted,
      rows.slice(15).map(r => r.id),
    );
  });

  it("records a refused delete and carries on; a row with no count is left alone", async () => {
    const hl = memoryHomelable({
      inventory: [
        { id: "a", properties: owned },
        { id: "b", properties: owned },
      ],
    });
    hl.fail.set("deleteInventory", id => id === "a");
    const listed = hl.client.listInventory;
    hl.client.listInventory = async () => [...(await listed()), { id: "c", properties: owned, canvas_count: null }];
    const result = await cleanInventory(hl.client, allOk());
    assert.deepEqual(hl.deleted, ["b"]);
    assert.equal(result.errors?.length, 1);
    assert.match(result.errors?.[0] ?? "", /^a: /);
  });
});

describe("httpHomelableClient", () => {
  it("sends the service key and JSON, and never puts the key in an error", async () => {
    const requests: { url: string; method?: string; headers: Record<string, string>; body?: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, method: init.method, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      if (url.endsWith("/api/v1/canvas/save")) return new Response('{"detail":"nope"}', { status: 422 });
      return new Response('[{"id":"d1","name":"UniFi","design_type":"network"}]', { status: 200 });
    }) as unknown as typeof fetch;
    const client = httpHomelableClient({ baseUrl: "http://homelable-backend.equestria.svc.cluster.local:8000/", serviceKey: "svc-secret", fetchImpl });
    assert.deepEqual(await client.listDesigns(), [{ id: "d1", name: "UniFi", design_type: "network" }]);
    assert.equal(requests[0].url, "http://homelable-backend.equestria.svc.cluster.local:8000/api/v1/designs");
    assert.equal(requests[0].headers["X-MCP-Service-Key"], "svc-secret");
    await assert.rejects(
      client.saveCanvas({ design_id: "d1", viewport: {}, custom_style: null, nodes: [], edges: [] }),
      (error: Error) => /POST \/api\/v1\/canvas\/save: HTTP 422/.test(error.message) && !error.message.includes("svc-secret"),
    );
    assert.equal(requests[1].method, "POST");
    assert.equal(requests[1].headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(requests[1].body ?? "{}").design_id, "d1");
  });

  it("lists and deletes inventory rows at 3.6.0's scan/pending endpoints", async () => {
    const requests: { url: string; method?: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, method: init.method });
      return new Response(init.method === "DELETE" ? '{"deleted":true}' : "[]", { status: 200 });
    }) as unknown as typeof fetch;
    const client = httpHomelableClient({ baseUrl: "http://backend:8000", serviceKey: "k", fetchImpl });
    await client.listInventory();
    await client.deleteInventory("row/1");
    assert.deepEqual(requests, [
      { url: "http://backend:8000/api/v1/scan/pending", method: "GET" },
      { url: "http://backend:8000/api/v1/scan/pending/row%2F1", method: "DELETE" },
    ]);
  });
});

describe("loadHomelableConfig", () => {
  it("is off unless HOMELABLE_SYNC is true", () => {
    assert.deepEqual(loadHomelableConfig({}), { enabled: false });
    assert.deepEqual(loadHomelableConfig({ HOMELABLE_SYNC: "false", HOMELABLE_URL: "http://x" }), { enabled: false });
  });
  it("reports what is missing rather than throwing", () => {
    assert.deepEqual(loadHomelableConfig({ HOMELABLE_SYNC: "true", HOMELABLE_URL: "http://x" }), { enabled: true, problem: "not configured: HOMELABLE_SERVICE_KEY not set" });
    assert.deepEqual(loadHomelableConfig({ HOMELABLE_SYNC: "TRUE", HOMELABLE_URL: "http://x", HOMELABLE_SERVICE_KEY: "k" }), { enabled: true, url: "http://x", serviceKey: "k" });
  });
});
