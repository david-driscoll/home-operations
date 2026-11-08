/**
 * The drift alerts' entrypoint (./drift.ts has the policy). A CronJob every
 * 15 minutes in `database` (kubernetes/apps/database/network-map/drift.yaml)
 * runs `node /app/src/drift-main.ts` from the collector's image.
 *
 * One run:
 *   1. run ./drift.ts's queries, each on its own and each in a READ
 *      transaction: this job never writes the graph, and a failed query only
 *      skips the alert it feeds;
 *   2. evaluate them into alerts;
 *   3. ask Alertmanager which of this job's alerts are active, and post this
 *      run's alerts plus a resolution for every active one no longer found;
 *   4. log one JSON line.
 *
 * Exits 1 when Neo4j, a query, or Alertmanager failed, so
 * NetworkMapDriftNotRunning (./prometheusrule.yaml) pages once that has
 * lasted an hour. Exits 0 when everything ran, whatever it found.
 */
import neo4j, { type Driver } from "neo4j-driver";
import type { Statement } from "./cypher.ts";
import {
  type ActiveAlert,
  type Alert,
  DEFAULT_UNKNOWN_CLIENT_NETWORKS,
  type DeclaredCounts,
  type DeclaredReachRow,
  type DriftInputs,
  declaredCountsQuery,
  declaredPresenceQuery,
  declaredReachQuery,
  evaluate,
  JOB,
  type ObservedReachRow,
  observedReachQuery,
  type PresenceRow,
  parseList,
  REACH_SYSTEMS,
  type RouteRow,
  resolutions,
  routesQuery,
  type SourceRow,
  sourcesQuery,
  UNKNOWN_CLIENT_HOURS,
  type UnknownClientRow,
  unknownClientsQuery,
} from "./drift.ts";
import { toBolt } from "./main.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main(): Promise<number> {
  const now = new Date();
  const networks = parseList(process.env.UNKNOWN_CLIENT_NETWORKS);
  const config = { unknownClientNetworks: networks.length > 0 ? networks : DEFAULT_UNKNOWN_CLIENT_NETWORKS };
  const alertmanager = required("ALERTMANAGER_URL").replace(/\/+$/, "");
  const errors: string[] = [];

  const driver: Driver = neo4j.driver(required("NEO4J_URI"), neo4j.auth.basic(required("NEO4J_USERNAME"), required("NEO4J_PASSWORD")), { disableLosslessIntegers: true });
  let inputs: DriftInputs;
  try {
    await driver.verifyConnectivity();
    /** Rows as plain objects, or undefined (and an error) when the query failed. */
    const read = async <T>(what: string, s: Statement): Promise<T[] | undefined> => {
      try {
        const { records } = await driver.executeQuery(s.text, toBolt(s.params) as Record<string, unknown>, { routing: neo4j.routing.READ });
        return records.map(r => r.toObject() as T);
      } catch (error) {
        errors.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
    };
    const [declared, routes, presence, unknownClients, declaredReach, observedReach, sources] = await Promise.all([
      read<DeclaredCounts>("declared counts", declaredCountsQuery),
      read<RouteRow>("routes", routesQuery),
      read<PresenceRow>("declared presence", declaredPresenceQuery),
      read<UnknownClientRow>("unknown clients", unknownClientsQuery(config.unknownClientNetworks, now.getTime() - UNKNOWN_CLIENT_HOURS * 3_600_000)),
      read<DeclaredReachRow>("declared reach", declaredReachQuery),
      read<ObservedReachRow>("observed reach", observedReachQuery(REACH_SYSTEMS)),
      read<SourceRow>("sources", sourcesQuery),
    ]);
    inputs = { now, declared: declared?.[0], routes, presence, unknownClients, declaredReach, observedReach, sources };
  } finally {
    await driver.close();
  }

  const { alerts, evaluated, skipped } = evaluate(inputs, config);

  // Which of ours Alertmanager holds, so the cleared ones resolve now rather than on the TTL.
  let resolved: Alert[] = [];
  try {
    const filter = encodeURIComponent(`job="${JOB}"`);
    const response = await fetch(`${alertmanager}/api/v2/alerts?active=true&silenced=true&inhibited=true&unprocessed=true&filter=${filter}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    resolved = resolutions((await response.json()) as ActiveAlert[], alerts, evaluated, now);
  } catch (error) {
    errors.push(`Alertmanager active alerts unreadable, cleared alerts will lapse on their TTL: ${String(error)}`);
  }

  const posted = [...alerts, ...resolved];
  if (posted.length > 0) {
    try {
      const response = await fetch(`${alertmanager}/api/v2/alerts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(posted), signal: AbortSignal.timeout(10000) });
      if (!response.ok) errors.push(`Alertmanager refused the alerts: HTTP ${response.status}`);
    } catch (error) {
      errors.push(`Alertmanager unreachable: ${String(error)}`);
    }
  }

  console.log(JSON.stringify({ msg: JOB, firing: alerts.map(a => a.labels), resolved: resolved.map(a => a.labels), skipped, errors }));
  return errors.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(JSON.stringify({ msg: JOB, error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    },
  );
}
