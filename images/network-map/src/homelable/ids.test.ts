import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homelableId, NETWORK_MAP_NAMESPACE, uuidv5 } from "./ids.ts";
import { gridPositions, packShelves, TREE_LEVEL, treeLayout, ZONE_GAP, zoneSize } from "./layout.ts";

describe("uuidv5", () => {
  it("matches the RFC 4122 test vector", () => {
    // DNS namespace, "www.example.com".
    assert.equal(uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });
  it("is stable, and namespaced per design", () => {
    assert.equal(homelableId("UniFi", "device:aa"), homelableId("UniFi", "device:aa"));
    assert.notEqual(homelableId("UniFi", "device:aa"), homelableId("Tailscale", "device:aa"));
    assert.match(homelableId("Apps", "app:observed:jellyfin"), /^[A-Za-z0-9_-]+$/);
    assert.match(NETWORK_MAP_NAMESPACE, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("layout", () => {
  it("fills a zone row by row and sizes it to fit", () => {
    const cells = gridPositions(5, 2);
    assert.equal(cells.length, 5);
    assert.deepEqual(cells[0], { x: 30, y: 70 });
    assert.equal(cells[1].y, cells[0].y);
    assert.ok(cells[2].y > cells[0].y);
    const size = zoneSize(5, 2);
    for (const c of cells) assert.ok(c.x + 180 <= size.width && c.y + 64 <= size.height);
    assert.ok(zoneSize(0).width > 0, "an empty zone still has room for its title");
  });
  it("wraps zones onto a new shelf past the maximum width", () => {
    const { positions, height } = packShelves(
      [
        { width: 1000, height: 100 },
        { width: 1000, height: 300 },
        { width: 1000, height: 50 },
      ],
      { x: 0, y: 10 },
      2200,
    );
    assert.deepEqual(positions, [
      { x: 0, y: 10 },
      { x: 1000 + ZONE_GAP, y: 10 },
      { x: 0, y: 10 + 300 + ZONE_GAP },
    ]);
    assert.equal(height, 300 + ZONE_GAP + 50);
  });
  it("centres a parent over its children and cuts cycles", () => {
    const kids: Record<string, string[]> = { root: ["a", "b"], a: ["root"], b: [] };
    const { positions } = treeLayout(["root"], id => kids[id] ?? []);
    const [root, a, b] = ["root", "a", "b"].map(id => positions.get(id));
    assert.equal(root?.y, 0);
    assert.equal(a?.y, TREE_LEVEL);
    assert.equal(root?.x, ((a?.x ?? 0) + (b?.x ?? 0)) / 2);
    assert.equal(positions.size, 3);
  });
});
