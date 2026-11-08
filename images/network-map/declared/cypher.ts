/**
 * The declared plan -> parameterised Cypher, the declared-layer twin of
 * ../src/cypher.ts. Pure; ./main.ts runs the statements in ONE write
 * transaction:
 *
 *   1. nodes, batched per label, MERGEd on (layer, key). Each run REPLACES a
 *      node's properties (`SET n = row.props`), so a field deleted from the
 *      repo leaves the graph too; only `firstSeen` is carried over;
 *   2. relationships, batched per (type, from, to), MERGEd on
 *      (layer, source, mergeKey) between declared ends;
 *   3. stale replacement of the WHOLE declared layer: every declared node and
 *      relationship this run did not write is deleted. It never matches
 *      `layer: 'observed'`, so the collector's layer is untouched;
 *   4. the DECLARES join, re-derived (../src/declares.ts);
 *   5. a `DeclaredLoad` node recording the run and the commit it loaded.
 *
 * Labels and types are never parameters in Cypher, so they come from the
 * closed sets in ./plan.ts, never from data.
 */
import { type RunContext, type Statement, sanitizeProps, schemaStatements } from "../src/cypher.ts";
import { DECLARED_LAYER, DECLARED_SOURCE, linkStatements } from "../src/declares.ts";
import { DECLARED_KEY_PROPERTY, DECLARED_LABELS, DECLARED_REL_TYPES, type DeclaredLabel, type DeclaredNode, type DeclaredRel, type DeclaredRelType } from "./plan.ts";

function assertLabel(label: string): asserts label is DeclaredLabel {
  if (!(DECLARED_LABELS as string[]).includes(label)) throw new Error(`not a declared-layer label: ${label}`);
}
function assertRelType(type: string): asserts type is DeclaredRelType {
  if (!(DECLARED_REL_TYPES as string[]).includes(type)) throw new Error(`not a declared-layer relationship type: ${type}`);
}

/** The collector's constraints and indexes, plus Zone's and the load record's. */
export function declaredSchemaStatements(): string[] {
  return [
    ...schemaStatements(),
    "CREATE CONSTRAINT network_map_zone_key IF NOT EXISTS FOR (n:Zone) REQUIRE (n.layer, n.zoneId) IS UNIQUE",
    "CREATE INDEX network_map_zone_run IF NOT EXISTS FOR (n:Zone) ON (n.layer, n.source, n.seenRun)",
    "CREATE CONSTRAINT network_map_declared_load IF NOT EXISTS FOR (n:DeclaredLoad) REQUIRE n.name IS UNIQUE",
  ];
}

export function declaredNodeStatements(nodes: DeclaredNode[], ctx: RunContext): Statement[] {
  const byLabel = new Map<DeclaredLabel, DeclaredNode[]>();
  for (const node of nodes) {
    assertLabel(node.label);
    byLabel.set(node.label, [...(byLabel.get(node.label) ?? []), node]);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => {
      const key = DECLARED_KEY_PROPERTY[label];
      return {
        text: [
          "UNWIND $rows AS row",
          `MERGE (n:${label} {layer: $layer, ${key}: row.key})`,
          "WITH n, row, n.firstSeen AS firstSeen",
          "SET n = row.props",
          `SET n.layer = $layer, n.${key} = row.key, n.source = $source, n.seenRun = $run,`,
          "    n.firstSeen = coalesce(firstSeen, datetime($now)), n.lastSeen = datetime($now)",
        ].join("\n"),
        params: { rows: rows.map(n => ({ key: n.key, props: sanitizeProps(n.props) })), layer: DECLARED_LAYER, source: DECLARED_SOURCE, run: ctx.run, now: ctx.now },
      };
    });
}

export function declaredRelStatements(rels: DeclaredRel[], ctx: RunContext): Statement[] {
  const groups = new Map<string, DeclaredRel[]>();
  for (const rel of rels) {
    assertRelType(rel.type);
    assertLabel(rel.from.label);
    assertLabel(rel.to.label);
    const id = `${rel.type}|${rel.from.label}|${rel.to.label}`;
    groups.set(id, [...(groups.get(id) ?? []), rel]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, rows]) => {
      const [type, from, to] = id.split("|") as [DeclaredRelType, DeclaredLabel, DeclaredLabel];
      return {
        text: [
          "UNWIND $rows AS row",
          `MATCH (a:${from} {layer: $layer, ${DECLARED_KEY_PROPERTY[from]}: row.from})`,
          `MATCH (b:${to} {layer: $layer, ${DECLARED_KEY_PROPERTY[to]}: row.to})`,
          `MERGE (a)-[r:${type} {layer: $layer, source: $source, mergeKey: row.mergeKey}]->(b)`,
          "SET r = row.props",
          "SET r.layer = $layer, r.source = $source, r.mergeKey = row.mergeKey, r.seenRun = $run",
        ].join("\n"),
        params: { rows: rows.map(r => ({ from: r.from.key, to: r.to.key, mergeKey: r.mergeKey, props: sanitizeProps(r.props) })), layer: DECLARED_LAYER, source: DECLARED_SOURCE, run: ctx.run },
      };
    });
}

/** Everything declared that this run did not write. Never touches the observed layer, nor DECLARES (re-derived next). */
export function declaredStaleStatements(ctx: RunContext): Statement[] {
  const params = { layer: DECLARED_LAYER, source: DECLARED_SOURCE, run: ctx.run };
  return [
    ...DECLARED_REL_TYPES.map(type => ({ text: `MATCH ()-[r:${type} {layer: $layer, source: $source}]->() WHERE r.seenRun <> $run DELETE r`, params })),
    ...DECLARED_LABELS.map(label => ({ text: `MATCH (n:${label} {layer: $layer, source: $source}) WHERE n.seenRun <> $run DETACH DELETE n`, params })),
  ];
}

export interface LoadRecord {
  commit?: string;
  counts: Record<string, number>;
  problems: number;
}

export function loadRecordStatement(ctx: RunContext, record: LoadRecord): Statement {
  return {
    text: [
      "MERGE (l:DeclaredLoad {name: 'network-map-declared'})",
      "SET l.layer = $layer, l.source = $source, l.lastRun = $run, l.lastRunAt = datetime($now),",
      "    l.commit = $commit, l.problems = $problems, l.counts = $counts",
    ].join("\n"),
    params: {
      layer: DECLARED_LAYER,
      source: DECLARED_SOURCE,
      run: ctx.run,
      now: ctx.now,
      commit: record.commit ?? null,
      problems: record.problems,
      counts: JSON.stringify(record.counts),
    },
  };
}

/** The whole transaction, in order. */
export function declaredWriteStatements(plan: { nodes: DeclaredNode[]; rels: DeclaredRel[] }, ctx: RunContext, record: LoadRecord): Statement[] {
  return [...declaredNodeStatements(plan.nodes, ctx), ...declaredRelStatements(plan.rels, ctx), ...declaredStaleStatements(ctx), ...linkStatements(), loadRecordStatement(ctx, record)];
}
