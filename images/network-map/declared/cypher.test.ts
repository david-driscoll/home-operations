/**
 * node --test images/network-map/declared/cypher.test.ts
 *
 * The declared layer's Cypher and its parameters: batching, the MERGE keys,
 * whole-layer replacement that never touches observed, and statement order.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkStatements } from "../src/declares.ts";
import { declaredNodeStatements, declaredRelStatements, declaredSchemaStatements, declaredStaleStatements, declaredWriteStatements, loadRecordStatement } from "./cypher.ts";
import { DECLARED_LABELS, DECLARED_REL_TYPES, type DeclaredNode, type DeclaredRel } from "./plan.ts";

const ctx = { run: "2026-11-08T12:00:00.000Z", now: "2026-11-08T12:00:00.000Z" };

const nodes: DeclaredNode[] = [
  { label: "Machine", key: "repo:celestia", props: { name: "celestia", ips: ["10.10.10.103"], macs: undefined, vmId: 300 } },
  { label: "App", key: "jellyfin", props: { appRoute: "jellyfin.example.test", accessGroups: [] } },
  { label: "Zone", key: "unifi-fw:Internal", props: { system: "unifi-fw" } },
  { label: "Machine", key: "repo:spike", props: { name: "spike" } },
];
const rels: DeclaredRel[] = [
  { type: "REACHES", from: { label: "Group", key: "authentik:family" }, to: { label: "App", key: "jellyfin" }, mergeKey: "authentik:access-policy:jellyfin", props: { via: "authentik:access-policy:jellyfin" } },
  { type: "IN_ZONE", from: { label: "Network", key: "unifi:name:Home" }, to: { label: "Zone", key: "unifi-fw:Internal" }, mergeKey: "", props: {} },
];

describe("declaredSchemaStatements", () => {
  it("adds Zone's (layer, key) constraint and the load record's to the collector's", () => {
    const s = declaredSchemaStatements();
    assert.ok(s.every(x => x.includes("IF NOT EXISTS")));
    assert.ok(s.includes("CREATE CONSTRAINT network_map_zone_key IF NOT EXISTS FOR (n:Zone) REQUIRE (n.layer, n.zoneId) IS UNIQUE"));
    assert.ok(s.some(x => x.includes("network_map_machine_key")));
  });
});

describe("declaredNodeStatements", () => {
  const statements = declaredNodeStatements(nodes, ctx);

  it("batches per label, MERGEs on (declared, key), and replaces props but keeps firstSeen", () => {
    assert.deepEqual(
      statements.map(s => s.text.split("\n")[1]),
      ["MERGE (n:App {layer: $layer, appId: row.key})", "MERGE (n:Machine {layer: $layer, machineId: row.key})", "MERGE (n:Zone {layer: $layer, zoneId: row.key})"],
    );
    const machine = statements[1];
    assert.match(machine.text, /SET n = row\.props/);
    assert.match(machine.text, /n\.firstSeen = coalesce\(firstSeen, datetime\(\$now\)\)/);
    assert.equal(machine.params.layer, "declared");
    assert.equal(machine.params.source, "repo");
    assert.equal(machine.params.run, ctx.run);
  });

  it("sanitizes props: no undefined, no empty lists", () => {
    const rows = statements[1].params.rows as { key: string; props: Record<string, unknown> }[];
    assert.deepEqual(rows[0], { key: "repo:celestia", props: { name: "celestia", ips: ["10.10.10.103"], vmId: 300 } });
    assert.deepEqual((statements[0].params.rows as { props: unknown }[])[0].props, { appRoute: "jellyfin.example.test" });
  });

  it("refuses a label outside the closed set", () => {
    assert.throws(() => declaredNodeStatements([{ label: "Bogus" as "App", key: "x", props: {} }], ctx), /not a declared-layer label/);
  });
});

describe("declaredRelStatements", () => {
  it("matches both declared ends by their key and merges on (layer, source, mergeKey)", () => {
    const [inZone, reaches] = declaredRelStatements(rels, ctx);
    assert.equal(inZone.text.split("\n")[1], "MATCH (a:Network {layer: $layer, networkId: row.from})");
    assert.equal(inZone.text.split("\n")[2], "MATCH (b:Zone {layer: $layer, zoneId: row.to})");
    assert.match(reaches.text, /MERGE \(a\)-\[r:REACHES \{layer: \$layer, source: \$source, mergeKey: row\.mergeKey\}\]->\(b\)/);
    assert.deepEqual(reaches.params.rows, [{ from: "authentik:family", to: "jellyfin", mergeKey: "authentik:access-policy:jellyfin", props: { via: "authentik:access-policy:jellyfin" } }]);
  });

  it("refuses a type outside the closed set, DECLARES included", () => {
    assert.throws(() => declaredRelStatements([{ ...rels[0], type: "DECLARES" as "REACHES" }], ctx), /not a declared-layer relationship type/);
  });
});

describe("declaredStaleStatements", () => {
  it("deletes every declared label and type not written this run, and only the declared layer", () => {
    const s = declaredStaleStatements(ctx);
    assert.equal(s.length, DECLARED_LABELS.length + DECLARED_REL_TYPES.length);
    for (const x of s) {
      assert.match(x.text, /\{layer: \$layer, source: \$source\}/);
      assert.equal(x.params.layer, "declared");
      assert.equal(x.params.source, "repo");
      assert.doesNotMatch(x.text, /observed|DECLARES/);
    }
  });
});

describe("declaredWriteStatements", () => {
  it("writes nodes, then edges, then removes stale, then re-derives DECLARES, then records the load", () => {
    const all = declaredWriteStatements({ nodes, rels }, ctx, { commit: "abc123", counts: { App: 1 }, problems: 0 });
    const texts = all.map(s => s.text);
    const firstStale = texts.findIndex(t => t.includes("WHERE n.seenRun <> $run") || t.includes("WHERE r.seenRun <> $run"));
    const firstLink = texts.indexOf(linkStatements()[0].text);
    assert.ok(texts.findIndex(t => t.includes("MERGE (a)-[r:")) < firstStale);
    assert.ok(firstStale < firstLink);
    assert.match(texts.at(-1) ?? "", /DeclaredLoad/);
    assert.equal(all.at(-1)?.params.commit, "abc123");
  });

  it("records the counts as one JSON string (Neo4j stores no maps)", () => {
    assert.equal(loadRecordStatement(ctx, { counts: { App: 2 }, problems: 1 }).params.counts, '{"App":2}');
  });
});
