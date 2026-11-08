/**
 * The graph plan -> parameterised Cypher. Pure: it builds `{ text, params }`
 * statements and ./main.ts runs them, all in ONE write transaction, so a run
 * either lands whole or not at all.
 *
 * The write strategy (docs/network-map/schema.md "Two layers, one graph"):
 *
 *   1. constraints and indexes, idempotently (`IF NOT EXISTS`), before the
 *      transaction: a uniqueness constraint per label on (layer, key), which
 *      Community supports, and which is also the index every MERGE uses;
 *   2. nodes, batched per label with UNWIND, MERGEd on (layer, key), stamped
 *      with `source`, `seenRun`, `lastSeen`, and `firstSeen` kept from the
 *      first sighting unless the source reports one;
 *   3. relationships, batched per (type, from label, to label), MERGEd on
 *      (layer, source, mergeKey) so two policies' REACHES between the same
 *      pair stay two edges;
 *   4. stale replacement, per source, only for sources that fully succeeded:
 *      their nodes and edges this run did not write are deleted. A source
 *      that failed, or only partly answered, keeps last run's;
 *   5. Machines are NOT replaced per run. Retention removes an observed
 *      Machine nobody saw this run whose lastSeen is older than the retention
 *      window and which no declared node DECLARES;
 *   6. a `CollectorRun` node records the run, and a `CollectorSource` per
 *      source its last outcome and last full success.
 *
 * Labels and relationship types are never parameters in Cypher, so they come
 * from the closed sets below, never from data.
 */
import type { GraphPlan, NodeLabel, PlanNode, PlanRel, Prop, RelType, SourceName } from "./model.ts";

export const LAYER = "observed";

/** Each label's key property (schema.md "Nodes"). */
export const KEY_PROPERTY: Record<NodeLabel, string> = {
  Machine: "machineId",
  Interface: "ifaceId",
  Network: "networkId",
  Device: "mac",
  Port: "portId",
  Group: "groupId",
  Route: "routeId",
  App: "appId",
  EntryPoint: "entryId",
  Policy: "policyId",
};

const LABELS = Object.keys(KEY_PROPERTY) as NodeLabel[];
export const REL_TYPES: RelType[] = ["HAS_INTERFACE", "ON", "HOSTED_ON", "UPLINK", "ASSOCIATED", "MEMBER_OF", "ADVERTISES", "ROUTES_TO", "RUNS", "SERVED_BY", "REACHES"];
/** Nodes stale replacement removes. Machine is left to retention; Device rides on Machine. */
const REPLACED_LABELS = LABELS.filter(l => l !== "Machine" && l !== "Device");

export interface Statement {
  text: string;
  params: Record<string, unknown>;
}

function assertLabel(label: string): asserts label is NodeLabel {
  if (!(LABELS as string[]).includes(label)) throw new Error(`not a network-map label: ${label}`);
}
function assertRelType(type: string): asserts type is RelType {
  if (!(REL_TYPES as string[]).includes(type)) throw new Error(`not a network-map relationship type: ${type}`);
}

/** Constraints and indexes. Each is its own statement: schema changes cannot share a transaction with writes. */
export function schemaStatements(): string[] {
  const out: string[] = [];
  for (const label of LABELS) {
    const key = KEY_PROPERTY[label];
    out.push(`CREATE CONSTRAINT network_map_${label.toLowerCase()}_key IF NOT EXISTS FOR (n:${label}) REQUIRE (n.layer, n.${key}) IS UNIQUE`);
    out.push(`CREATE INDEX network_map_${label.toLowerCase()}_run IF NOT EXISTS FOR (n:${label}) ON (n.layer, n.source, n.seenRun)`);
  }
  out.push("CREATE INDEX network_map_machine_lastseen IF NOT EXISTS FOR (n:Machine) ON (n.layer, n.lastSeen)");
  out.push("CREATE CONSTRAINT network_map_collector_run IF NOT EXISTS FOR (n:CollectorRun) REQUIRE n.name IS UNIQUE");
  out.push("CREATE CONSTRAINT network_map_collector_source IF NOT EXISTS FOR (n:CollectorSource) REQUIRE n.name IS UNIQUE");
  return out;
}

export interface RunContext {
  run: string;
  /** ISO 8601, the run's start. */
  now: string;
}

/** One node row: the MERGE key, its owner, and the props `SET n += row.props` writes. */
export function nodeRow(node: PlanNode) {
  return { key: node.key, source: node.source, props: sanitizeProps(node.props), firstSeen: node.firstSeen ?? null, lastSeen: node.lastSeen ?? null };
}

export function nodeStatements(plan: GraphPlan, ctx: RunContext): Statement[] {
  const groups = new Map<string, PlanNode[]>();
  for (const node of plan.nodes) {
    assertLabel(node.label);
    const id = [node.label, ...(node.extraLabels ?? [])].join(":");
    groups.set(id, [...(groups.get(id) ?? []), node]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, nodes]) => {
      const [label, ...extra] = id.split(":") as NodeLabel[];
      for (const l of extra) assertLabel(l);
      const key = KEY_PROPERTY[label];
      const setExtra = extra.map(l => `SET n:${l}`).join("\n");
      return {
        text: [
          "UNWIND $rows AS row",
          `MERGE (n:${label} {layer: $layer, ${key}: row.key})`,
          "SET n += row.props",
          "SET n.source = row.source, n.seenRun = $run,",
          "    n.firstSeen = coalesce(datetime(row.firstSeen), n.firstSeen, datetime($now)),",
          "    n.lastSeen = coalesce(datetime(row.lastSeen), datetime($now))",
          setExtra,
        ]
          .filter(Boolean)
          .join("\n"),
        params: { rows: nodes.map(nodeRow), layer: LAYER, run: ctx.run, now: ctx.now },
      };
    });
}

/** How to MATCH a relationship end by label. A Device is matched by its MAC. */
function endPattern(variable: string, label: NodeLabel, param: string): string {
  return `(${variable}:${label} {layer: $layer, ${KEY_PROPERTY[label]}: ${param}})`;
}

export function relRow(rel: PlanRel) {
  return { from: rel.from.key, to: rel.to.key, source: rel.source, mergeKey: rel.mergeKey, props: sanitizeProps(rel.props) };
}

export function relStatements(plan: GraphPlan, ctx: RunContext): Statement[] {
  const groups = new Map<string, PlanRel[]>();
  for (const rel of plan.rels) {
    assertRelType(rel.type);
    assertLabel(rel.from.label);
    assertLabel(rel.to.label);
    const id = `${rel.type}|${rel.from.label}|${rel.to.label}`;
    groups.set(id, [...(groups.get(id) ?? []), rel]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, rels]) => {
      const [type, from, to] = id.split("|") as [RelType, NodeLabel, NodeLabel];
      return {
        text: [
          "UNWIND $rows AS row",
          `MATCH ${endPattern("a", from, "row.from")}`,
          `MATCH ${endPattern("b", to, "row.to")}`,
          `MERGE (a)-[r:${type} {layer: $layer, source: row.source, mergeKey: row.mergeKey}]->(b)`,
          "SET r += row.props, r.seenRun = $run",
        ].join("\n"),
        params: { rows: rels.map(relRow), layer: LAYER, run: ctx.run },
      };
    });
}

/** Stale replacement for one fully successful source. */
export function staleStatements(source: SourceName, ctx: RunContext): Statement[] {
  const params = { layer: LAYER, source, run: ctx.run };
  return [
    ...REL_TYPES.map(type => ({ text: `MATCH ()-[r:${type} {layer: $layer, source: $source}]->() WHERE r.seenRun <> $run DELETE r`, params })),
    ...REPLACED_LABELS.map(label => ({ text: `MATCH (n:${label} {layer: $layer, source: $source}) WHERE n.seenRun <> $run DETACH DELETE n`, params })),
  ];
}

/** Observed Machines nobody saw this run, last seen before the window, that no declared node DECLARES. */
export function retentionStatement(ctx: RunContext, retentionDays: number): Statement {
  return {
    text: [
      "MATCH (m:Machine {layer: $layer})",
      "WHERE m.seenRun <> $run AND m.lastSeen < datetime($now) - duration({days: $days})",
      "  AND NOT EXISTS { MATCH ()-[:DECLARES]->(m) }",
      "DETACH DELETE m",
      "RETURN count(*) AS removed",
    ].join("\n"),
    params: { layer: LAYER, run: ctx.run, now: ctx.now, days: retentionDays },
  };
}

export interface SourceOutcome {
  source: SourceName;
  status: "ok" | "partial" | "failed" | "skipped";
  error?: string;
  counts?: Record<string, number>;
}

/**
 * The run record: one `CollectorRun` for the latest run, and one
 * `CollectorSource` per source with its last outcome and last full success,
 * so a consumer can tell a stale source's nodes from fresh ones.
 */
export function runRecordStatement(ctx: RunContext, outcomes: SourceOutcome[]): Statement {
  return {
    text: [
      "MERGE (c:CollectorRun {name: 'network-map-collector'})",
      "SET c.layer = $layer, c.lastRun = $run, c.lastRunAt = datetime($now),",
      "    c.ok = $ok, c.partial = $partial, c.failed = $failed",
      "WITH c",
      "UNWIND $outcomes AS o",
      "MERGE (s:CollectorSource {name: o.source})",
      "SET s.layer = $layer, s.status = o.status, s.error = o.error, s.lastRun = $run, s.lastRunAt = datetime($now),",
      "    s.lastSuccessRun = CASE WHEN o.status = 'ok' THEN $run ELSE s.lastSuccessRun END,",
      "    s.lastSuccessAt = CASE WHEN o.status = 'ok' THEN datetime($now) ELSE s.lastSuccessAt END",
    ].join("\n"),
    params: {
      layer: LAYER,
      run: ctx.run,
      now: ctx.now,
      ok: outcomes.filter(o => o.status === "ok").map(o => o.source),
      partial: outcomes.filter(o => o.status === "partial").map(o => o.source),
      failed: outcomes.filter(o => o.status === "failed").map(o => o.source),
      outcomes: outcomes.map(o => ({ source: o.source, status: o.status, error: o.error ?? null })),
    },
  };
}

/** The UniFi networks the last good run wrote, for a run whose UniFi read failed (./build.ts BuildContext). */
export const fallbackNetworksQuery: Statement = {
  text: "MATCH (n:Network {layer: $layer, source: 'unifi'}) WHERE n.cidr IS NOT NULL RETURN n.networkId AS networkId, n.cidr AS cidr",
  params: { layer: LAYER },
};

/**
 * Props as Neo4j stores them: primitives and homogeneous lists. Undefined,
 * null and empty lists are dropped; a mixed list becomes strings.
 */
export function sanitizeProps(props: Record<string, Prop | unknown>): Record<string, string | number | boolean | string[] | number[]> {
  const out: Record<string, string | number | boolean | string[] | number[]> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) {
      const items = v.filter(x => x !== undefined && x !== null);
      if (items.length === 0) continue;
      out[k] = items.every(x => typeof x === "number") ? (items as number[]) : items.map(String);
    } else out[k] = JSON.stringify(v);
  }
  return out;
}
