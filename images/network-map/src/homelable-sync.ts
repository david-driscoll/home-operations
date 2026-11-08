/**
 * The Homelable sync's entrypoint (./homelable/sync.ts has the steps):
 * project the network map into Homelable's four designs.
 *
 * The CronJob runs it right after the collector, from ./main.ts, so each sync
 * sees the graph that run just wrote; `node /app/src/homelable-sync.ts` runs it
 * alone (NEO4J_* and HOMELABLE_* set, HOMELABLE_SYNC=true).
 *
 * Exit policy, as ./exit.ts: 1 only when EVERY design failed (Homelable or
 * Neo4j unreachable, the key refused). One design failing is logged and
 * recorded, and the others still save.
 */
import neo4j, { type Driver } from "neo4j-driver";
import { exitCode } from "./exit.ts";
import { httpHomelableClient } from "./homelable/client.ts";
import { loadHomelableConfig } from "./homelable/config.ts";
import { readMapGraph } from "./homelable/reader.ts";
import { DESIGNS, type DesignOutcome, syncHomelable } from "./homelable/sync.ts";

type Env = Record<string, string | undefined>;

const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ msg: "network-map", step: "homelable-sync", ...fields }));

/** One sync against an open driver. Never throws: every failure is an outcome. Returns 0, 1, or undefined when the sync is off. */
export async function runHomelableSync(driver: Driver, env: Env): Promise<0 | 1 | undefined> {
  const config = loadHomelableConfig(env);
  if (!config.enabled) return undefined;
  let outcomes: DesignOutcome[];
  if ("problem" in config) {
    outcomes = DESIGNS.map(d => ({ design: d.name, status: "failed", error: config.problem }));
  } else {
    try {
      const graph = await readMapGraph(driver);
      log({ graph: { nodes: graph.nodes.length, declared: graph.nodes.filter(n => n.layer === "declared").length, declaredLabels: [...graph.declaredLabels].sort() } });
      outcomes = await syncHomelable(graph, httpHomelableClient({ baseUrl: config.url, serviceKey: config.serviceKey }));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      outcomes = DESIGNS.map(d => ({ design: d.name, status: "failed", error: `reading the graph: ${text}` }));
    }
  }
  for (const o of outcomes) log({ ...o });
  return exitCode(outcomes);
}

async function main(): Promise<number> {
  const uri = process.env.NEO4J_URI;
  if (!uri || !process.env.NEO4J_USERNAME || !process.env.NEO4J_PASSWORD) throw new Error("NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD must be set");
  const driver = neo4j.driver(uri, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD), { disableLosslessIntegers: true });
  try {
    const code = await runHomelableSync(driver, process.env);
    if (code === undefined) {
      log({ result: "HOMELABLE_SYNC is not true; nothing to do" });
      return 0;
    }
    return code;
  } finally {
    await driver.close();
  }
}

if (import.meta.main) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(JSON.stringify({ msg: "network-map", step: "homelable-sync", error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    },
  );
}
