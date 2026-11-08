/**
 * Reads both layers of the network map out of Neo4j for the Homelable sync,
 * in one READ transaction so the two queries see the same graph.
 *
 * Everything with a `layer` (observed or declared) except the collector's own
 * run records, and every relationship between those nodes: the projections
 * need only a few hundred machines' worth, so reading it all is simpler than
 * one query per design and keeps the projections pure (./graph.ts).
 *
 * The declared layer may be missing entirely (its loader is built
 * separately); the graph then has observed nodes only and nothing is judged
 * as drift.
 */
import neo4j, { type Driver } from "neo4j-driver";
import { buildMapGraph, type Layer, type MapGraph, type MapNode, type MapRel, type Value } from "./graph.ts";

const LAYERS: Layer[] = ["observed", "declared"];

const NODES_QUERY = ["MATCH (n) WHERE n.layer IN $layers AND NOT n:CollectorRun AND NOT n:CollectorSource", "RETURN elementId(n) AS id, labels(n) AS labels, n.layer AS layer, properties(n) AS props"].join("\n");

const RELS_QUERY = ["MATCH (a)-[r]->(b) WHERE a.layer IN $layers AND b.layer IN $layers", "RETURN elementId(a) AS from, elementId(b) AS to, type(r) AS type, properties(r) AS props"].join("\n");

/** Bolt values -> plain ones: temporals become ISO strings, Integers numbers. */
export function plainValue(value: unknown): Value {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(plainValue);
  if (neo4j.isInt(value)) return (value as { toNumber(): number }).toNumber();
  return String(value);
}

const plainProps = (props: Record<string, unknown>) => Object.fromEntries(Object.entries(props).map(([k, v]) => [k, plainValue(v)]));

export async function readMapGraph(driver: Driver): Promise<MapGraph> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    return await session.executeRead(async tx => {
      const nodeResult = await tx.run(NODES_QUERY, { layers: LAYERS });
      const relResult = await tx.run(RELS_QUERY, { layers: LAYERS });
      const nodes: MapNode[] = nodeResult.records.map(r => ({
        id: r.get("id") as string,
        labels: r.get("labels") as string[],
        layer: r.get("layer") as Layer,
        props: plainProps(r.get("props") as Record<string, unknown>),
      }));
      const rels: MapRel[] = relResult.records.map(r => ({
        from: r.get("from") as string,
        to: r.get("to") as string,
        type: r.get("type") as string,
        props: plainProps(r.get("props") as Record<string, unknown>),
      }));
      return buildMapGraph(nodes, rels);
    });
  } finally {
    await session.close();
  }
}
