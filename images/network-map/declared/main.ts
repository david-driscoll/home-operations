/**
 * The network map's declared-layer loader (docs/network-map/schema.md,
 * docs/adr/0006-network-map-neo4j-homelable-projection.md): what the repo on
 * main says, written to Neo4j as `layer: 'declared'`, `source: 'repo'`.
 *
 * Run by .forgejo/workflows/network-map-declared.yml on each push to main
 * that touches its sources, from the checkout:
 *
 *   node images/network-map/declared/main.ts [<repo root>]
 *
 * Environment:
 *   NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD   the graph (as the collector's)
 *   ROOT_DOMAIN, TAILSCALE_DOMAIN               the names apps are reached by;
 *                                               never in the repo
 *   COMMIT                                      recorded on the DeclaredLoad node
 *   DRY_RUN=1                                   build the plan, print counts,
 *                                               write nothing (no Neo4j needed)
 *
 * One run replaces the whole declared layer in one transaction (./cypher.ts)
 * and re-derives the DECLARES join (../src/declares.ts). Exits 1 when the
 * repo cannot be read or the write fails; per-file problems (a definition
 * with no ks.yaml) are logged and do not fail the run.
 */
import { resolve } from "node:path";
import neo4j, { type Driver } from "neo4j-driver";
import { toBolt } from "../src/main.ts";
import { declaredSchemaStatements, declaredWriteStatements } from "./cypher.ts";
import { loadDeclared } from "./load.ts";

const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ msg: "network-map-declared", ...fields }));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

async function main(): Promise<number> {
  const root = resolve(process.argv[2] ?? new URL("../../..", import.meta.url).pathname);
  const dryRun = process.env.DRY_RUN === "1";
  // A real load needs both: without them every app route is a literal `${ROOT_DOMAIN}`.
  const domains = dryRun ? { root: process.env.ROOT_DOMAIN || undefined, tailnet: process.env.TAILSCALE_DOMAIN || undefined } : { root: required("ROOT_DOMAIN"), tailnet: required("TAILSCALE_DOMAIN") };

  const plan = await loadDeclared(root, domains);
  const counts = { ...countBy(plan.nodes, n => n.label), ...countBy(plan.rels, r => r.type) };
  // Problems name repo paths and variable names, never values.
  for (const problem of plan.problems) log({ problem });
  log({ nodes: plan.nodes.length, relationships: plan.rels.length, problems: plan.problems.length, counts, dryRun });
  if (dryRun) return 0;

  const now = new Date().toISOString();
  const ctx = { run: now, now };
  const driver: Driver = neo4j.driver(required("NEO4J_URI"), neo4j.auth.basic(required("NEO4J_USERNAME"), required("NEO4J_PASSWORD")), { disableLosslessIntegers: true });
  try {
    await driver.verifyConnectivity();
    for (const text of declaredSchemaStatements()) await driver.executeQuery(text);
    const statements = declaredWriteStatements(plan, ctx, { commit: process.env.COMMIT || undefined, counts, problems: plan.problems.length });
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite(async tx => {
        for (const s of statements) await tx.run(s.text, toBolt(s.params) as Record<string, unknown>);
      });
    } finally {
      await session.close();
    }
    const { records } = await driver.executeQuery("MATCH (:Machine|App|Group|Route|Network|Policy {layer: 'declared'})-[r:DECLARES]->() RETURN r.by AS by, count(*) AS n");
    log({ run: ctx.run, written: true, declares: Object.fromEntries(records.map(r => [r.get("by"), r.get("n")])) });
    return 0;
  } finally {
    await driver.close();
  }
}

if (import.meta.main) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(JSON.stringify({ msg: "network-map-declared", error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    },
  );
}
