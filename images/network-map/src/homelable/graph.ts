/**
 * The network map as the Homelable sync reads it: every node and relationship
 * of both layers (docs/network-map/schema.md), held in memory and indexed for
 * the projections in ./project-*.ts. The whole graph is a few thousand
 * elements, so the sync reads it in two queries (./reader.ts) instead of
 * asking Neo4j one question per design.
 *
 * Drift (GLOSSARY.md) is computed here, once, the way ../drift.ts and
 * ../declares.ts see the two layers:
 *
 *   - an observed node is `undeclared` (amber) when no declared node DECLARES
 *     it, it is not a client Machine (`kind: client`: phones, laptops, IoT,
 *     which NetworkMapUnknownClient covers instead), and,
 *     for the labels both layers key alike (App, Group, Route, Network:
 *     ../declares.ts SAME_KEY_LABELS), no declared node has its key (a
 *     declared App's `deployedAs` counts as its key too). The key
 *     match covers a node the collector re-created since the link last ran,
 *     as ../drift.ts's `counterparts` does;
 *   - a declared node is `unobserved` when it DECLARES nothing and no observed
 *     node shares its key in the same way.
 *
 * A node is judged by its own label, and only when the declared layer has at
 * least one node of that label: the loader may not have run yet, and covers
 * Machine, Network, Group, Route, App, Policy and Zone, never Interface,
 * EntryPoint or Port. A UniFi Device (labelled Machine and Device) is judged
 * as a Device, so the gateway, switches and APs, which the repo never
 * declares, are not drawn as drift.
 *
 * Each DECLARES edge records `by` (key, name, mac, ip, hostname); `declaredBy`
 * returns those of a node's edges, which the projections show as a property.
 *
 * Pure: no I/O. Node ids are whatever the reader used (Neo4j element ids);
 * they never leave the process. Homelable ids come from the schema keys.
 */
import { KEY_PROPERTY } from "../cypher.ts";
import { SAME_KEY_LABELS, sameKeyValues } from "../declares.ts";
import type { NodeLabel } from "../model.ts";

export type Layer = "observed" | "declared";
export type Drift = "undeclared" | "unobserved";

export type Value = string | number | boolean | null | undefined | Value[];

export interface MapNode {
  id: string;
  labels: string[];
  layer: Layer;
  props: Record<string, Value>;
}

export interface MapRel {
  type: string;
  from: string;
  to: string;
  props: Record<string, Value>;
}

export interface Hop {
  rel: MapRel;
  node: MapNode;
}

export interface MapGraph {
  readonly nodes: readonly MapNode[];
  node(id: string): MapNode | undefined;
  /** Nodes with `label` on `layer`, sorted by key. */
  find(label: string, layer?: Layer): MapNode[];
  /** The node's schema key (`machineId`, `ifaceId`, ...). */
  key(node: MapNode): string;
  /** Outgoing hops of `type`, sorted by the far node's key. */
  out(id: string, type: string): Hop[];
  /** Incoming hops of `type`, sorted by the near node's key. */
  in(id: string, type: string): Hop[];
  drift(id: string): Drift | undefined;
  /** The `by` of each DECLARES edge into (observed) or out of (declared) the node, sorted. */
  declaredBy(id: string): string[];
  /** Labels the declared layer has nodes of: drift is only judged for these. */
  readonly declaredLabels: ReadonlySet<string>;
}

/** Label order for picking a node's key: Device rides on Machine, so Machine wins. */
const KEY_LABELS = (Object.keys(KEY_PROPERTY) as NodeLabel[]).filter(l => l !== "Device");

export function nodeKey(node: MapNode): string {
  for (const label of KEY_LABELS) {
    if (node.labels.includes(label)) {
      const value = node.props[KEY_PROPERTY[label]];
      if (value !== undefined && value !== null) return String(value);
    }
  }
  if (node.labels.includes("Device") && node.props.mac) return String(node.props.mac);
  return node.id;
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildMapGraph(nodes: MapNode[], rels: MapRel[]): MapGraph {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const keys = new Map(nodes.map(n => [n.id, nodeKey(n)]));
  const outgoing = new Map<string, MapRel[]>();
  const incoming = new Map<string, MapRel[]>();
  for (const rel of rels) {
    if (!byId.has(rel.from) || !byId.has(rel.to)) continue;
    outgoing.set(`${rel.from}|${rel.type}`, [...(outgoing.get(`${rel.from}|${rel.type}`) ?? []), rel]);
    incoming.set(`${rel.to}|${rel.type}`, [...(incoming.get(`${rel.to}|${rel.type}`) ?? []), rel]);
  }
  const keyOf = (id: string) => keys.get(id) ?? id;
  const sortedNodes = [...nodes].sort((a, b) => byString(keyOf(a.id), keyOf(b.id)) || byString(a.layer, b.layer) || byString(a.id, b.id));

  const declaredLabels = new Set(nodes.filter(n => n.layer === "declared").flatMap(n => n.labels));
  const sameKey = new Set<string>();
  const keyId = (label: string, layer: Layer, key: string) => `${label}|${layer}|${key}`;
  // A declared App is also known by its `deployedAs` (../declares.ts sameKeyValues).
  for (const n of nodes) {
    for (const { label, key } of SAME_KEY_LABELS) {
      if (n.labels.includes(label)) for (const value of sameKeyValues(label, n.layer, n.props, key)) sameKey.add(keyId(label, n.layer, value));
    }
  }
  const counterpartByKey = (n: MapNode) => {
    const other: Layer = n.layer === "observed" ? "declared" : "observed";
    return SAME_KEY_LABELS.some(({ label, key }) => n.labels.includes(label) && sameKeyValues(label, n.layer, n.props, key).some(value => sameKey.has(keyId(label, other, value))));
  };
  /** A client Machine (a phone, a laptop, an IoT device) is never amber: an unknown client is NetworkMapUnknownClient's to report (../drift.ts). */
  const isClient = (n: MapNode) => n.labels.includes("Machine") && n.props.kind === "client";
  /** The label a node is judged as: Device over Machine, else its labels. */
  const judgedLabels = (n: MapNode) => (n.labels.includes("Device") ? ["Device"] : n.labels);
  const drift = new Map<string, Drift>();
  for (const n of nodes) {
    if (!judgedLabels(n).some(l => declaredLabels.has(l))) continue;
    if (n.layer === "observed" && !isClient(n) && !(incoming.get(`${n.id}|DECLARES`) ?? []).length && !counterpartByKey(n)) drift.set(n.id, "undeclared");
    if (n.layer === "declared" && !(outgoing.get(`${n.id}|DECLARES`) ?? []).length && !counterpartByKey(n)) drift.set(n.id, "unobserved");
  }
  const declaredBy = (id: string) => {
    const n = byId.get(id);
    const rels = n?.layer === "declared" ? outgoing.get(`${id}|DECLARES`) : incoming.get(`${id}|DECLARES`);
    return [...new Set((rels ?? []).map(r => (r.props.by === undefined || r.props.by === null ? "" : String(r.props.by))).filter(Boolean))].sort();
  };

  const hops = (rels: MapRel[] | undefined, end: "from" | "to"): Hop[] =>
    (rels ?? []).map(rel => ({ rel, node: byId.get(rel[end]) as MapNode })).sort((a, b) => byString(keyOf(a.node.id), keyOf(b.node.id)) || byString(JSON.stringify(a.rel.props), JSON.stringify(b.rel.props)));

  return {
    nodes: sortedNodes,
    node: id => byId.get(id),
    find: (label, layer = "observed") => sortedNodes.filter(n => n.layer === layer && n.labels.includes(label)),
    key: node => keyOf(node.id),
    out: (id, type) => hops(outgoing.get(`${id}|${type}`), "to"),
    in: (id, type) => hops(incoming.get(`${id}|${type}`), "from"),
    drift: id => drift.get(id),
    declaredBy,
    declaredLabels,
  };
}

// ── Small readers the projections share ─────────────────────────────────

export const str = (v: Value): string | undefined => (v === undefined || v === null || v === "" ? undefined : String(v));
export const strs = (v: Value): string[] => (Array.isArray(v) ? v.map(x => String(x)) : v === undefined || v === null ? [] : [String(v)]);
export const num = (v: Value): number | undefined => (typeof v === "number" ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** IPv4 first: Homelable's ping and its inventory match want one plain address. */
export function preferredIp(ips: string[]): string | undefined {
  return ips.find(ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) ?? ips[0];
}
