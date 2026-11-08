/**
 * node --test images/network-map/src/cypher.test.ts
 *
 * The Cypher and its parameters: batching per label and type, the MERGE keys,
 * stale replacement and retention, and what a property may hold.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KEY_PROPERTY, LAYER, nodeStatements, relStatements, retentionStatement, runRecordStatement, sanitizeProps, schemaStatements, staleStatements } from "./cypher.ts";
import type { GraphPlan } from "./model.ts";

const ctx = { run: "2026-11-07T12:00:00.000Z", now: "2026-11-07T12:00:00.000Z" };

const plan: GraphPlan = {
  nodes: [
    { label: "Machine", key: "mac:bc:24:11:00:00:20", source: "proxmox", props: { name: "dockge-luna", kind: "lxc", joined: true, sources: ["proxmox", "unifi"], os: undefined }, lastSeen: "2026-11-07T11:59:00.000Z" },
    { label: "Machine", key: "mac:f4:e2:c6:00:00:01", source: "unifi", extraLabels: ["Device"], props: { name: "usw-24", mac: "f4:e2:c6:00:00:01", type: "switch" } },
    { label: "Interface", key: "unifi:lan:bc:24:11:00:00:20", source: "unifi", props: { network: "unifi:lan", ips: ["10.10.10.20"] }, firstSeen: "2026-01-01T00:00:00.000Z" },
    { label: "Network", key: "unifi:lan", source: "unifi", props: { kind: "vlan", cidr: "10.10.10.0/24", vlan: 10 } },
  ],
  rels: [
    { type: "HAS_INTERFACE", from: { label: "Machine", key: "mac:bc:24:11:00:00:20" }, to: { label: "Interface", key: "unifi:lan:bc:24:11:00:00:20" }, source: "unifi", mergeKey: "", props: {} },
    { type: "ON", from: { label: "Interface", key: "unifi:lan:bc:24:11:00:00:20" }, to: { label: "Network", key: "unifi:lan" }, source: "unifi", mergeKey: "", props: {} },
    { type: "ASSOCIATED", from: { label: "Interface", key: "unifi:lan:bc:24:11:00:00:20" }, to: { label: "Device", key: "f4:e2:c6:00:00:01" }, source: "unifi", mergeKey: "", props: { essid: "home", band: undefined } },
    { type: "REACHES", from: { label: "Group", key: "netbird:admins" }, to: { label: "Network", key: "unifi:lan" }, source: "netbird", mergeKey: "netbird:r1", props: { via: "netbird:r1", ports: ["tcp:22"] } },
    { type: "REACHES", from: { label: "Group", key: "netbird:admins" }, to: { label: "Network", key: "unifi:lan" }, source: "netbird", mergeKey: "netbird:r2", props: { via: "netbird:r2", ports: ["*"] } },
  ],
};

describe("schemaStatements", () => {
  it("creates a (layer, key) uniqueness constraint per label, idempotently", () => {
    const statements = schemaStatements();
    assert.ok(statements.every(s => s.includes("IF NOT EXISTS")));
    for (const [label, key] of Object.entries(KEY_PROPERTY)) {
      assert.ok(statements.includes(`CREATE CONSTRAINT network_map_${label.toLowerCase()}_key IF NOT EXISTS FOR (n:${label}) REQUIRE (n.layer, n.${key}) IS UNIQUE`), label);
    }
  });
});

describe("nodeStatements", () => {
  const statements = nodeStatements(plan, ctx);

  it("batches per label set, a Device apart from plain Machines", () => {
    assert.deepEqual(
      statements.map(s => s.text.split("\n")[1]),
      [
        "MERGE (n:Interface {layer: $layer, ifaceId: row.key})",
        "MERGE (n:Machine {layer: $layer, machineId: row.key})",
        "MERGE (n:Machine {layer: $layer, machineId: row.key})",
        "MERGE (n:Network {layer: $layer, networkId: row.key})",
      ],
    );
    assert.ok(statements[2].text.endsWith("SET n:Device"));
    assert.ok(!statements[1].text.includes("SET n:Device"));
  });

  it("passes rows with the key, the owner and clean props, plus the run stamp", () => {
    const machines = statements[1];
    assert.deepEqual(machines.params, {
      layer: LAYER,
      run: ctx.run,
      now: ctx.now,
      rows: [{ key: "mac:bc:24:11:00:00:20", source: "proxmox", props: { name: "dockge-luna", kind: "lxc", joined: true, sources: ["proxmox", "unifi"] }, firstSeen: null, lastSeen: "2026-11-07T11:59:00.000Z" }],
    });
  });

  it("keeps the first sighting unless the source reports one, and stamps seenRun and lastSeen", () => {
    const text = statements[0].text;
    assert.match(text, /n\.firstSeen = coalesce\(datetime\(row\.firstSeen\), n\.firstSeen, datetime\(\$now\)\)/);
    assert.match(text, /n\.seenRun = \$run/);
    assert.match(text, /n\.lastSeen = coalesce\(datetime\(row\.lastSeen\), datetime\(\$now\)\)/);
  });

  it("refuses a label outside the schema", () => {
    const bad = { nodes: [{ label: "Machine) DETACH DELETE (x", key: "k", source: "unifi", props: {} }], rels: [] } as unknown as GraphPlan;
    assert.throws(() => nodeStatements(bad, ctx), /not a network-map label/);
  });
});

describe("relStatements", () => {
  const statements = relStatements(plan, ctx);

  it("batches per (type, from, to) and MERGEs on (layer, source, mergeKey)", () => {
    const reaches = statements.find(s => s.text.includes(":REACHES"))!;
    assert.equal(
      reaches.text,
      [
        "UNWIND $rows AS row",
        "MATCH (a:Group {layer: $layer, groupId: row.from})",
        "MATCH (b:Network {layer: $layer, networkId: row.to})",
        "MERGE (a)-[r:REACHES {layer: $layer, source: row.source, mergeKey: row.mergeKey}]->(b)",
        "SET r += row.props, r.seenRun = $run",
      ].join("\n"),
    );
    assert.deepEqual(
      (reaches.params.rows as { mergeKey: string }[]).map(r => r.mergeKey),
      ["netbird:r1", "netbird:r2"],
    );
  });

  it("matches a Device end by its MAC and drops undefined props", () => {
    const associated = statements.find(s => s.text.includes(":ASSOCIATED"))!;
    assert.match(associated.text, /MATCH \(b:Device \{layer: \$layer, mac: row\.to\}\)/);
    assert.deepEqual((associated.params.rows as { props: unknown }[])[0].props, { essid: "home" });
  });
});

describe("staleStatements and retention", () => {
  it("replaces a source's own nodes and edges not written this run, never Machines", () => {
    const statements = staleStatements("netbird", ctx);
    assert.ok(statements.every(s => s.params.source === "netbird" && s.params.run === ctx.run && s.params.layer === LAYER));
    assert.ok(statements.some(s => s.text === "MATCH (n:Interface {layer: $layer, source: $source}) WHERE n.seenRun <> $run DETACH DELETE n"));
    assert.ok(statements.some(s => s.text === "MATCH ()-[r:REACHES {layer: $layer, source: $source}]->() WHERE r.seenRun <> $run DELETE r"));
    assert.ok(!statements.some(s => s.text.includes(":Machine")));
  });

  it("retains a Machine until its lastSeen is past the window, and a declared one forever", () => {
    const s = retentionStatement(ctx, 30);
    assert.match(s.text, /m\.seenRun <> \$run AND m\.lastSeen < datetime\(\$now\) - duration\(\{days: \$days\}\)/);
    assert.match(s.text, /NOT EXISTS \{ MATCH \(\)-\[:DECLARES\]->\(m\) \}/);
    assert.equal(s.params.days, 30);
  });

  it("records each source's outcome", () => {
    const s = runRecordStatement(ctx, [
      { source: "unifi", status: "ok" },
      { source: "proxmox", status: "partial", error: "proxmox skystar: timeout" },
      { source: "docker", status: "failed", error: "x" },
    ]);
    assert.deepEqual([s.params.ok, s.params.partial, s.params.failed], [["unifi"], ["proxmox"], ["docker"]]);
    assert.deepEqual(
      (s.params.outcomes as { error: string | null }[]).map(o => o.error),
      [null, "proxmox skystar: timeout", "x"],
    );
  });
});

describe("sanitizeProps", () => {
  it("keeps primitives and homogeneous lists, drops empties, stringifies the rest", () => {
    assert.deepEqual(sanitizeProps({ a: "x", b: 1, c: true, d: [1, 2], e: ["x", 1], f: [], g: undefined, h: null, i: { nested: 1 }, j: Number.NaN }), {
      a: "x",
      b: 1,
      c: true,
      d: [1, 2],
      e: ["x", "1"],
      i: '{"nested":1}',
    });
  });
});
