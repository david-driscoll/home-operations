/**
 * The DECLARES join between the two layers (docs/network-map/schema.md
 * "Declared layer"): which observed node each declared node stands for.
 *
 * Both writers run these same statements, in their own write transaction,
 * after their nodes land:
 *
 *   - the declared loader (../declared/main.ts), on each push to main, so a
 *     new declaration links to what is already observed;
 *   - the observed collector (./main.ts), every hour, so a machine or group
 *     first observed AFTER the last push still gets its edge within the hour,
 *     instead of waiting for the next push. It runs them before retention, so
 *     a declared machine that was observed again keeps its protection.
 *
 * Each run drops every DECLARES edge and derives them again from the rules
 * below, so an edge whose rule no longer holds (a renamed host, a moved MAC)
 * does not outlive it. The rules read only node properties, so the result is
 * the same whichever writer ran last. Pure: statements only, no I/O.
 */
import type { Statement } from "./cypher.ts";

export const DECLARED_LAYER = "declared";
export const OBSERVED_LAYER = "observed";
export const DECLARED_SOURCE = "repo";

/** Labels whose declared and observed nodes share one key, and join on it alone. */
export const SAME_KEY_LABELS = [
  { label: "App", key: "appId" },
  { label: "Group", key: "groupId" },
  { label: "Route", key: "routeId" },
  { label: "Network", key: "networkId" },
] as const;

export interface LinkRule {
  /** What the edge records as `by`. */
  by: string;
  text: string;
}

const MERGE = (by: string) => [`MERGE (d)-[r:DECLARES]->(o)`, `SET r.layer = $declared, r.source = $source, r.by = '${by}'`];

/**
 * The rules, in order. A Machine has no key both layers share (an observed
 * one is `mac:<lowest mac>` or `<source>:<native id>`, a declared one
 * `repo:<hostname>`), so it joins in tiers, strongest first, and a weaker
 * tier is tried only for declared machines no stronger one linked:
 *
 *   1. MAC: a declared MAC on one of the observed machine's interfaces, or
 *      as its device MAC;
 *   2. IP: a declared LAN or tailnet address on one of its interfaces;
 *   3. hostname: the declared hostname among its `hostnames`.
 *
 * More than one observed machine can match a tier (two that the collector
 * could not join); each gets an edge, which is itself a drift signal.
 */
export function linkRules(): LinkRule[] {
  const sameKey = SAME_KEY_LABELS.map(({ label, key }) => ({
    by: "key",
    text: [`MATCH (d:${label} {layer: $declared})`, `MATCH (o:${label} {layer: $observed, ${key}: d.${key}})`, ...MERGE("key")].join("\n"),
  }));
  return [
    ...sameKey,
    {
      // UniFi networks are keyed by their controller id, which the repo never
      // sees; the zone map names them instead.
      by: "name",
      text: ["MATCH (d:Network {layer: $declared, system: 'unifi'}) WHERE d.name IS NOT NULL", "MATCH (o:Network {layer: $observed, source: 'unifi'}) WHERE o.name = d.name", ...MERGE("name")].join("\n"),
    },
    {
      // stacks/netbird names each client policy `client-<rule>` and its one
      // rule `<rule>`; the observed Policy is keyed by NetBird's rule id and
      // named `<policy>/<rule>` (sources/netbird.ts policiesToReach).
      by: "name",
      text: [
        "MATCH (d:Policy {layer: $declared, system: 'netbird'}) WHERE d.policyName IS NOT NULL",
        "MATCH (o:Policy {layer: $observed, system: 'netbird'}) WHERE o.name = d.policyName OR o.name STARTS WITH d.policyName + '/'",
        ...MERGE("name"),
      ].join("\n"),
    },
    {
      by: "mac",
      text: [
        "MATCH (d:Machine {layer: $declared}) WHERE size(coalesce(d.macs, [])) > 0",
        "MATCH (o:Machine {layer: $observed})",
        "WHERE o.mac IN d.macs OR EXISTS { MATCH (o)-[:HAS_INTERFACE]->(i:Interface {layer: $observed}) WHERE i.mac IN d.macs }",
        ...MERGE("mac"),
      ].join("\n"),
    },
    {
      by: "ip",
      text: [
        "MATCH (d:Machine {layer: $declared}) WHERE size(coalesce(d.ips, [])) > 0 AND NOT EXISTS { MATCH (d)-[:DECLARES]->() }",
        "MATCH (o:Machine {layer: $observed})",
        "WHERE EXISTS { MATCH (o)-[:HAS_INTERFACE]->(i:Interface {layer: $observed}) WHERE any(ip IN coalesce(i.ips, []) WHERE ip IN d.ips) }",
        ...MERGE("ip"),
      ].join("\n"),
    },
    {
      by: "hostname",
      text: [
        "MATCH (d:Machine {layer: $declared}) WHERE d.hostname IS NOT NULL AND NOT EXISTS { MATCH (d)-[:DECLARES]->() }",
        "MATCH (o:Machine {layer: $observed}) WHERE d.hostname IN coalesce(o.hostnames, [])",
        ...MERGE("hostname"),
      ].join("\n"),
    },
  ];
}

/** Drop every DECLARES edge, then derive them again: the statements both writers run. */
export function linkStatements(): Statement[] {
  const params = { declared: DECLARED_LAYER, observed: OBSERVED_LAYER, source: DECLARED_SOURCE };
  return [{ text: "MATCH ()-[r:DECLARES]->() DELETE r", params: {} }, ...linkRules().map(rule => ({ text: rule.text, params }))];
}
