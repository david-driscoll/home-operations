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
import { cleanInventory, type DesignOutcome, pickDesign, syncHomelable } from "./sync.ts";

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

describe("duplicate designs", () => {
  const at = (s: number) => new Date(Date.UTC(2025, 0, 1, 0, 0, s)).toISOString();
  const design = (id: string, name: string, created: number, nodes = 0) => ({ id, name, design_type: "network", node_count: nodes, group_count: 0, text_count: 0, created_at: at(created) });
  const canvasWith = (n: number) => ({ nodes: Array.from({ length: n }, (_, i) => ({ id: `x${i}`, type: "server", device_id: null })), edges: [], viewport: {} });

  it("picks the design with the most on it, then the oldest, then the lowest id", () => {
    assert.equal(pickDesign([design("b", "Apps", 2, 0), design("a", "Apps", 1, 0)]).id, "a");
    assert.equal(pickDesign([design("old", "Apps", 1, 0), design("new", "Apps", 2, 5)]).id, "new");
    assert.equal(pickDesign([design("z", "Apps", 1, 3), design("y", "Apps", 1, 3)]).id, "y");
  });

  it("saves into one and deletes the EMPTY duplicates only", async () => {
    const hl = memoryHomelable({
      designs: [design("apps-full", "Apps", 1), design("apps-empty", "Apps", 2), design("apps-drawn", "Apps", 3), design("nb-a", "NetBird", 4), design("nb-b", "NetBird", 5)],
      canvases: { "apps-full": canvasWith(10), "apps-drawn": canvasWith(2) },
    });
    const outcomes = await syncHomelable(fixtureGraph(), hl.client);
    const apps = outcomes.find(o => o.design === "Apps");
    const netbird = outcomes.find(o => o.design === "NetBird");
    assert.deepEqual({ id: apps?.designId, removed: apps?.duplicatesRemoved, kept: apps?.duplicatesKept }, { id: "apps-full", removed: ["apps-empty"], kept: ["apps-drawn"] });
    assert.deepEqual({ id: netbird?.designId, removed: netbird?.duplicatesRemoved }, { id: "nb-a", removed: ["nb-b"] });
    assert.deepEqual(hl.deletedDesigns.sort(), ["apps-empty", "nb-b"]);
    assert.ok(
      hl.designs.some(d => d.id === "apps-drawn"),
      "a design with anything on it is never deleted",
    );
  });

  it("re-checks a duplicate's canvas just before deleting it", async () => {
    const hl = memoryHomelable({ designs: [design("t1", "Tailscale", 1, 4), design("t2", "Tailscale", 2, 0)], canvases: { t1: canvasWith(4) } });
    // The list says t2 is empty, but something was drawn on it since.
    const load = hl.client.loadCanvas;
    hl.client.loadCanvas = async id => (id === "t2" ? canvasWith(1) : load(id));
    const [, ts] = await syncHomelable(fixtureGraph(), hl.client);
    assert.deepEqual({ id: ts.designId, kept: ts.duplicatesKept }, { id: "t1", kept: ["t2"] });
    assert.deepEqual(hl.deletedDesigns, []);
  });

  it("re-lists right before creating, and uses a design another run created meanwhile", async () => {
    const hl = memoryHomelable();
    // Another run creates Apps between this run's first list and its per-design check.
    let lists = 0;
    const list = hl.client.listDesigns;
    hl.client.listDesigns = async () => {
      lists += 1;
      if (lists === 2) hl.designs.push(design("theirs", "Apps", 0));
      return list();
    };
    const outcomes = await syncHomelable(fixtureGraph(), hl.client, [{ name: "Apps", project: (await import("./project-apps.ts")).projectApps }]);
    assert.deepEqual({ id: outcomes[0].designId, created: outcomes[0].created }, { id: "theirs", created: false });
    assert.ok(!hl.calls.some(c => c.startsWith("createDesign")), "nothing created");
  });

  it("two syncs started in the same second end with one design per name", async () => {
    const hl = memoryHomelable();
    const [a, b] = await Promise.all([syncHomelable(fixtureGraph(), hl.client), syncHomelable(fixtureGraph(), hl.client)]);
    // The in-memory backend interleaves the two at every await, so both did create each design...
    assert.equal(hl.calls.filter(c => c.startsWith("createDesign")).length, 8);
    assert.equal(hl.deletedDesigns.length, 4, "...and the four losers, still empty, were deleted");
    assert.deepEqual(
      a.map(o => o.designId),
      b.map(o => o.designId),
      "both saved into the same designs",
    );
    const names = hl.designs.map(d => d.name).sort();
    assert.deepEqual(names, ["Apps", "NetBird", "Tailscale", "UniFi"]);
    for (const d of hl.designs) assert.ok((hl.canvases.get(d.id)?.nodes.length ?? 0) > 0, `${d.name} is the one drawn on`);
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
