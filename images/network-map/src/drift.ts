/**
 * The network map's drift alerts (GLOSSARY.md "Drift"): the pure part.
 * ./drift-main.ts runs the queries below in READ transactions every 15
 * minutes (kubernetes/apps/database/network-map/drift.yaml), hands the rows
 * to `evaluate`, and posts what it returns to Alertmanager, the way
 * kubernetes/apps/netbird-system/health does.
 *
 * Five alerts, all `severity: warning`, each from one saved query in
 * docs/network-map/queries.md (a test keeps the two texts identical):
 *
 *   NetworkMapRouteNoLiveRouter       a Tailscale or NetBird route in use
 *                                     whose routers are all offline, or a
 *                                     NetBird route with no router at all
 *   NetworkMapDeclaredNotObserved     a declared machine (gateways included)
 *                                     or app nothing has observed for 6h
 *   NetworkMapUnknownClient           a client (not a UniFi device) on the
 *                                     Home or IoT VLAN that nothing declares,
 *                                     first seen by UniFi in the last 24h
 *   NetworkMapReachDrift              live Tailscale/NetBird/UniFi reach that
 *                                     differs from the declared reach
 *   NetworkMapCollectorSourceStale    a collector source with no full
 *                                     success in 6h (CollectorSource)
 *
 * The middle three need the declared layer, which is loaded separately and
 * can be empty. Each is a no-op while its part of that layer is empty: with
 * nothing declared, every observed machine would be "unknown". Reach drift
 * is judged only for systems that have at least one declared REACHES.
 *
 * FIRING AND RESOLVING. Every run re-posts each alert that still holds with
 * endsAt ALERT_TTL_MINUTES ahead (three runs), so a run that stops posting it
 * lets it lapse. It also asks Alertmanager which of its alerts are active and
 * posts the ones this run no longer found with endsAt = now, so a fixed drift
 * clears within one run. An alert whose query failed this run is neither
 * re-posted nor resolved: it lapses on the TTL unless a later run finds it.
 * Labels are stable per finding (route, machine key, group pair...), never a
 * time or a count, so Alertmanager deduplicates the re-posts.
 */
import type { Statement } from "./cypher.ts";

export const JOB = "network-map-drift";
export const NAMESPACE = "database";
/** A declared thing unobserved this long, and a source without a full success this long, alert. */
export const STALE_HOURS = 6;
/** An undeclared client counts as unknown for this long after it is first seen. */
export const UNKNOWN_CLIENT_HOURS = 24;
/** Three runs at one every 15 minutes. */
export const ALERT_TTL_MINUTES = 45;
/** The UniFi networks whose undeclared clients alert, by name. Guest is left out on purpose. */
export const DEFAULT_UNKNOWN_CLIENT_NETWORKS = ["Home", "IoT"];
/** The systems whose live policy the reach-drift alert compares with the declared one. */
export const REACH_SYSTEMS = ["tailscale", "netbird", "unifi"];

export const ALERT_NAMES = {
  route: "NetworkMapRouteNoLiveRouter",
  presence: "NetworkMapDeclaredNotObserved",
  unknownClient: "NetworkMapUnknownClient",
  reach: "NetworkMapReachDrift",
  source: "NetworkMapCollectorSourceStale",
} as const;
export type AlertName = (typeof ALERT_NAMES)[keyof typeof ALERT_NAMES];

const HOUR_MS = 3_600_000;

// ── Queries ──────────────────────────────────────────────────────────────
//
// Copied verbatim into docs/network-map/queries.md, and drift.test.ts fails
// when the two differ. Times come back as epoch milliseconds, never strings,
// so a named time zone can never break the parse.

/**
 * A REACHES end's key. Reach runs from a Group to a Group, Network, App or
 * Machine (schema.md "Relationships"), and those are the four keys.
 */
const endKey = (v: string) => `coalesce(${v}.groupId, ${v}.networkId, ${v}.appId, ${v}.machineId)`;

/**
 * The keys of the other layer's nodes that are the same thing as REACHES end
 * `v`: those a DECLARES edge joins it to, and those with the same label and
 * key (for an App, also a declared one's `deployedAs`). The key match is a
 * fallback for a node the collector re-created after the loader last ran (a
 * DETACH DELETE takes the DECLARES edge with it).
 * Machine keys come from the collector's join, so a Machine relies on
 * DECLARES alone.
 */
function counterparts(v: string, other: "declared" | "observed", indent: string): string {
  const edge = other === "observed" ? `(${v})-[:DECLARES]->(o {layer: '${other}'})` : `(o {layer: '${other}'})-[:DECLARES]->(${v})`;
  // A declared App's `deployedAs` (the ks's APP, when the definition is named otherwise) is the observed App's key too.
  const deployedAs = other === "observed" ? `o.appId = ${v}.deployedAs` : `o.deployedAs = ${v}.appId`;
  return [
    "COLLECT {",
    `${indent}  MATCH ${edge} RETURN ${endKey("o")} AS k`,
    `${indent}  UNION MATCH (o:Group {layer: '${other}'}) WHERE o.groupId = ${v}.groupId RETURN o.groupId AS k`,
    `${indent}  UNION MATCH (o:Network {layer: '${other}'}) WHERE o.networkId = ${v}.networkId RETURN o.networkId AS k`,
    `${indent}  UNION MATCH (o:App {layer: '${other}'}) WHERE o.appId = ${v}.appId RETURN o.appId AS k`,
    `${indent}  UNION MATCH (o:App {layer: '${other}'}) WHERE ${deployedAs} RETURN o.appId AS k`,
    `${indent}}`,
  ].join("\n");
}

/** How much of the declared layer exists: the inputs each declared-layer alert needs. */
export const declaredCountsQuery: Statement = {
  text: [
    "RETURN",
    "  COUNT { MATCH (m:Machine {layer: 'declared'}) } AS machines,",
    "  COUNT { MATCH (a:App {layer: 'declared'}) } AS apps,",
    "  COLLECT {",
    "    MATCH (f:Group {layer: 'declared'})-[:REACHES {layer: 'declared'}]->()",
    "    RETURN DISTINCT coalesce(f.system, split(f.groupId, ':')[0]) AS system",
    "  } AS reachSystems",
  ].join("\n"),
  params: {},
};

/** Every observed Tailscale/NetBird route with its routers: who advertises it, approved, online. */
export const routesQuery: Statement = {
  text: [
    "MATCH (r:Route {layer: 'observed'})",
    "OPTIONAL MATCH (i:Interface {layer: 'observed'})-[a:ADVERTISES]->(r)",
    "OPTIONAL MATCH (m:Machine {layer: 'observed'})-[:HAS_INTERFACE]->(i)",
    "WITH r, collect(CASE WHEN i IS NULL THEN null ELSE {machine: coalesce(m.name, i.hostname, i.ifaceId), approved: a.approved, online: i.online} END) AS routers",
    "RETURN r.routeId AS routeId, coalesce(r.system, r.source) AS system, r.cidr AS cidr, coalesce(r.exit, false) AS exit, r.name AS name, routers",
    "ORDER BY routeId",
  ].join("\n"),
  params: {},
};

/** Every declared machine and app, with when anything that is the same thing was last observed. */
export const declaredPresenceQuery: Statement = {
  text: [
    "MATCH (d {layer: 'declared'})",
    "WHERE d:Machine OR d:App",
    "RETURN CASE WHEN d:App THEN 'app' ELSE 'machine' END AS kind,",
    "       coalesce(d.machineId, d.appId) AS nodeKey,",
    "       coalesce(d.name, d.machineId, d.appId) AS name,",
    "       d.firstSeen.epochMillis AS declaredSinceMs,",
    "       COLLECT {",
    "         MATCH (d)-[:DECLARES]->(o {layer: 'observed'}) RETURN o.lastSeen.epochMillis AS seen",
    "         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = d.appId RETURN o.lastSeen.epochMillis AS seen",
    "         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = d.deployedAs RETURN o.lastSeen.epochMillis AS seen",
    "       } AS observedLastSeenMs",
    "ORDER BY kind, nodeKey",
  ].join("\n"),
  params: {},
};

/**
 * Candidate unknown clients: the interfaces of undeclared observed machines
 * on the named UniFi networks, first seen since `$sinceMs`. Only `unifi:`
 * networks: the `site-lan:<site>` fallbacks are named after their site, so
 * `home` would match an overlay peer's LAN NIC too. "First seen" is UniFi's
 * own first sight of the client (`unifiFirstSeen`, ./build.ts), falling back
 * to the collector's only when UniFi gave none: the collector's first
 * sighting of an old phone is just the day the graph started.
 * Only `kind: client` machines that are not UniFi Devices (a switch or AP is
 * a Machine too); classifyUnknownClients applies the same rules again.
 */
export function unknownClientsQuery(networks: string[], sinceMs: number): Statement {
  return {
    text: [
      "MATCH (m:Machine {layer: 'observed', kind: 'client'})-[:HAS_INTERFACE]->(i:Interface {layer: 'observed'})-[:ON]->(n:Network {layer: 'observed', kind: 'vlan'})",
      "WHERE NOT m:Device",
      "  AND n.networkId STARTS WITH 'unifi:'",
      "  AND toLower(n.name) IN $networks",
      "  AND NOT EXISTS { MATCH ({layer: 'declared'})-[:DECLARES]->(m) }",
      "  AND NOT EXISTS { MATCH ({layer: 'declared'})-[:DECLARES]->(i) }",
      "WITH m, i, n, datetime(i.unifiFirstSeen).epochMillis AS unifiFirstSeenMs",
      "WHERE coalesce(unifiFirstSeenMs, m.firstSeen.epochMillis) >= $sinceMs",
      "RETURN m.machineId AS machineId, m.name AS name, m.kind AS kind, m:Device AS isDevice,",
      "       unifiFirstSeenMs, m.firstSeen.epochMillis AS firstSeenMs,",
      "       n.networkId AS networkId, n.kind AS networkKind, n.name AS network,",
      "       i.mac AS mac, coalesce(i.ips, []) AS ips, i.hostname AS hostname",
      "ORDER BY machineId",
    ].join("\n"),
    params: { networks: networks.map(n => n.toLowerCase()), sinceMs },
  };
}

/** Declared REACHES, each end with the keys of its observed counterparts. */
export const declaredReachQuery: Statement = {
  text: [
    "MATCH (f:Group {layer: 'declared'})-[r:REACHES {layer: 'declared'}]->(t {layer: 'declared'})",
    "RETURN coalesce(f.system, split(f.groupId, ':')[0]) AS system,",
    `       f.groupId AS fromKey, ${endKey("t")} AS toKey, r.via AS via, coalesce(r.ports, []) AS ports,`,
    `       ${counterparts("f", "observed", "       ")} AS fromObserved,`,
    `       ${counterparts("t", "observed", "       ")} AS toObserved`,
  ].join("\n"),
  params: {},
};

/** Observed REACHES from the systems `$systems`, each end with the keys of its declared counterparts. */
export function observedReachQuery(systems: string[]): Statement {
  return {
    text: [
      "MATCH (f:Group {layer: 'observed'})-[r:REACHES {layer: 'observed'}]->(t {layer: 'observed'})",
      "WHERE r.source IN $systems",
      `RETURN r.source AS system, f.groupId AS fromKey, ${endKey("t")} AS toKey, r.via AS via, coalesce(r.ports, []) AS ports,`,
      `       ${counterparts("f", "declared", "       ")} AS fromDeclared,`,
      `       ${counterparts("t", "declared", "       ")} AS toDeclared`,
    ].join("\n"),
    params: { systems },
  };
}

/** Each collector source's last outcome and last full success (./cypher.ts runRecordStatement). */
export const sourcesQuery: Statement = {
  text: [
    "MATCH (s:CollectorSource)",
    "RETURN s.name AS source, s.status AS status, s.error AS error,",
    "       s.lastRunAt.epochMillis AS lastRunMs, s.lastSuccessAt.epochMillis AS lastSuccessMs",
    "ORDER BY source",
  ].join("\n"),
  params: {},
};

// ── Rows ─────────────────────────────────────────────────────────────────

export interface DeclaredCounts {
  machines: number;
  apps: number;
  reachSystems: string[];
}

export interface RouteRow {
  routeId: string;
  system: string | null;
  cidr: string | null;
  exit: boolean;
  name?: string | null;
  routers: { machine: string; approved?: boolean | null; online?: boolean | null }[];
}

export interface PresenceRow {
  kind: "machine" | "app";
  nodeKey: string;
  name: string;
  declaredSinceMs?: number | null;
  observedLastSeenMs: (number | null)[];
}

export interface UnknownClientRow {
  machineId: string;
  name?: string | null;
  kind?: string | null;
  /** The machine is also a UniFi Device (gateway, switch, AP). */
  isDevice?: boolean | null;
  /** UniFi's own first sight of this client, when it reported one. */
  unifiFirstSeenMs?: number | null;
  /** The collector's first sight of the machine. */
  firstSeenMs?: number | null;
  networkId: string;
  networkKind?: string | null;
  network: string;
  mac?: string | null;
  ips: string[];
  hostname?: string | null;
}

export interface DeclaredReachRow {
  system: string;
  fromKey: string;
  toKey: string;
  via?: string | null;
  ports: string[];
  fromObserved: string[];
  toObserved: string[];
}

export interface ObservedReachRow {
  system: string;
  fromKey: string;
  toKey: string;
  via?: string | null;
  ports: string[];
  fromDeclared: string[];
  toDeclared: string[];
}

export interface SourceRow {
  source: string;
  status?: string | null;
  error?: string | null;
  lastRunMs?: number | null;
  lastSuccessMs?: number | null;
}

/** What one run read. An input is undefined when its query failed; its alert is then skipped, not resolved. */
export interface DriftInputs {
  now: Date;
  declared?: DeclaredCounts;
  routes?: RouteRow[];
  presence?: PresenceRow[];
  unknownClients?: UnknownClientRow[];
  declaredReach?: DeclaredReachRow[];
  observedReach?: ObservedReachRow[];
  sources?: SourceRow[];
}

// ── Classification ───────────────────────────────────────────────────────

export interface RouteFinding {
  routeId: string;
  system: string;
  cidr: string;
  exit: boolean;
  /** `missing`: no router advertises it. `offline`: every approved router is offline. */
  reason: "missing" | "offline";
  routers: string[];
}

/**
 * A route is in use when at least one router advertises it approved
 * (Tailscale: enabled in the admin; NetBird: the route or resource enabled).
 * It has no live router when every approved one reports `online: false`. An
 * unknown online state counts as live: this alert never guesses. A NetBird
 * route that no peer serves at all is `missing`. An advertised but
 * unapproved route is not in use, so it is not drift.
 */
export function classifyRoutes(rows: RouteRow[]): RouteFinding[] {
  const out: RouteFinding[] = [];
  for (const row of rows) {
    const system = row.system ?? row.routeId.split(":")[0];
    if (system !== "tailscale" && system !== "netbird") continue;
    const cidr = row.cidr ?? row.routeId.slice(system.length + 1);
    // A Tailscale exit node always advertises both; one alert is enough.
    if (cidr === "::/0") continue;
    const routers = row.routers.filter(Boolean);
    if (routers.length === 0) {
      if (system === "netbird") out.push({ routeId: row.routeId, system, cidr, exit: row.exit, reason: "missing", routers: [] });
      continue;
    }
    const approved = routers.filter(r => r.approved === true);
    if (approved.length === 0) continue;
    if (approved.every(r => r.online === false)) out.push({ routeId: row.routeId, system, cidr, exit: row.exit, reason: "offline", routers: uniqSorted(approved.map(r => r.machine)) });
  }
  return out;
}

export interface PresenceFinding {
  kind: "machine" | "app";
  key: string;
  name: string;
  /** The newest observation of it, or undefined when nothing observed is joined to it. */
  lastSeenMs?: number;
}

/**
 * A declared machine or app is drift once nothing observed has seen it for
 * STALE_HOURS. One with no observed counterpart at all is judged by how long
 * it has been declared instead, so a new declaration gets the same grace to
 * show up. A declaration with no first-seen time is treated as old.
 */
export function classifyPresence(rows: PresenceRow[], now: Date, hours: number = STALE_HOURS): PresenceFinding[] {
  const cutoff = now.getTime() - hours * HOUR_MS;
  const out: PresenceFinding[] = [];
  for (const row of rows) {
    const seen = row.observedLastSeenMs.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const lastSeenMs = seen.length > 0 ? Math.max(...seen) : undefined;
    const stale = lastSeenMs !== undefined ? lastSeenMs < cutoff : typeof row.declaredSinceMs !== "number" || row.declaredSinceMs < cutoff;
    if (stale) out.push({ kind: row.kind, key: row.nodeKey, name: row.name, lastSeenMs });
  }
  return out;
}

export interface UnknownClientFinding {
  machineId: string;
  name: string;
  firstSeenMs: number;
  networks: string[];
  macs: string[];
  ips: string[];
}

/**
 * An unknown client: a `kind: client` machine that is not UniFi
 * infrastructure (a switch or AP is a Machine and a Device), with an
 * interface on a watched UniFi VLAN (by name; never a `site-lan:` fallback or
 * an overlay), first seen by UniFi within `hours`. The collector's own first
 * sighting counts only when UniFi reported none. Declared machines never get
 * here: the query drops them. One finding per machine, however many of its
 * interfaces are on the watched networks.
 */
export function classifyUnknownClients(rows: UnknownClientRow[], networks: string[], now: Date, hours: number = UNKNOWN_CLIENT_HOURS): UnknownClientFinding[] {
  const watched = new Set(networks.map(n => n.toLowerCase()));
  const cutoff = now.getTime() - hours * HOUR_MS;
  const byMachine = new Map<string, UnknownClientFinding>();
  for (const row of rows) {
    if (row.isDevice === true || row.kind !== "client") continue;
    if (!row.networkId.startsWith("unifi:") || (row.networkKind ?? "vlan") !== "vlan" || !watched.has(row.network.toLowerCase())) continue;
    const firstSeenMs = typeof row.unifiFirstSeenMs === "number" ? row.unifiFirstSeenMs : row.firstSeenMs;
    if (typeof firstSeenMs !== "number" || firstSeenMs < cutoff) continue;
    const f = byMachine.get(row.machineId) ?? { machineId: row.machineId, name: row.name || row.hostname || row.mac || row.machineId, firstSeenMs, networks: [], macs: [], ips: [] };
    f.firstSeenMs = Math.min(f.firstSeenMs, firstSeenMs);
    f.networks = uniqSorted([...f.networks, row.network]);
    f.macs = uniqSorted([...f.macs, ...(row.mac ? [row.mac] : [])]);
    f.ips = uniqSorted([...f.ips, ...row.ips]);
    byMachine.set(row.machineId, f);
  }
  return [...byMachine.values()].sort((a, b) => a.machineId.localeCompare(b.machineId));
}

export interface ReachFinding {
  system: string;
  /** `missing`: declared, not live. `unexpected`: live, not declared. `ports`: both, on different ports. */
  drift: "missing" | "unexpected" | "ports";
  from: string;
  to: string;
  declaredPorts?: string[];
  observedPorts?: string[];
}

/** Ports as a comparable set: lowercased, sorted, with `*`, `any` and an empty list all meaning every port. */
export function normalizePorts(ports: readonly string[]): string[] {
  const list = uniqSorted(ports.map(p => String(p).trim().toLowerCase()).filter(Boolean));
  return list.length === 0 || list.some(p => p === "*" || p === "any" || p === "*:*") ? ["*"] : list;
}

/**
 * Reach drift, per (from, to) pair, after mapping both ends across the
 * layers. Only pairs whose two ends exist in both layers are compared; an end
 * missing from one layer is machine or app drift, reported elsewhere. Only
 * systems in `systems` (those with declared reach) are judged at all, so a
 * system the declared layer does not describe yet never fires.
 */
export function classifyReach(declared: DeclaredReachRow[], observed: ObservedReachRow[], systems: readonly string[]): ReachFinding[] {
  const judged = new Set(systems);
  const pair = (from: string, to: string) => `${from}\u0000${to}`;

  // Observed reach per observed pair.
  const live = new Map<string, Set<string>>();
  for (const row of observed) {
    const k = pair(row.fromKey, row.toKey);
    live.set(k, new Set([...(live.get(k) ?? []), ...normalizePorts(row.ports)]));
  }
  // Declared reach per declared pair, and the declared pairs as observed pairs.
  const wanted = new Map<string, { row: DeclaredReachRow; ports: Set<string> }>();
  for (const row of declared) {
    const k = pair(row.fromKey, row.toKey);
    const entry = wanted.get(k) ?? { row, ports: new Set<string>() };
    for (const p of normalizePorts(row.ports)) entry.ports.add(p);
    wanted.set(k, entry);
  }

  const out: ReachFinding[] = [];
  for (const { row, ports } of wanted.values()) {
    if (!judged.has(row.system) || row.fromObserved.length === 0 || row.toObserved.length === 0) continue;
    const livePorts = new Set<string>();
    let found = false;
    for (const f of row.fromObserved)
      for (const t of row.toObserved) {
        const hit = live.get(pair(f, t));
        if (hit) {
          found = true;
          for (const p of hit) livePorts.add(p);
        }
      }
    const declaredPorts = normalizePorts([...ports]);
    if (!found) out.push({ system: row.system, drift: "missing", from: row.fromKey, to: row.toKey, declaredPorts });
    else {
      const observedPorts = normalizePorts([...livePorts]);
      if (declaredPorts.join(",") !== observedPorts.join(",")) out.push({ system: row.system, drift: "ports", from: row.fromKey, to: row.toKey, declaredPorts, observedPorts });
    }
  }

  const seen = new Set<string>();
  for (const row of observed) {
    if (!judged.has(row.system) || row.fromDeclared.length === 0 || row.toDeclared.length === 0) continue;
    const k = pair(row.fromKey, row.toKey);
    if (seen.has(k)) continue;
    seen.add(k);
    const declaredHere = row.fromDeclared.some(f => row.toDeclared.some(t => wanted.has(pair(f, t))));
    if (!declaredHere) out.push({ system: row.system, drift: "unexpected", from: row.fromKey, to: row.toKey, observedPorts: normalizePorts([...(live.get(k) ?? [])]) });
  }
  return out.sort((a, b) => `${a.system}|${a.from}|${a.to}|${a.drift}`.localeCompare(`${b.system}|${b.from}|${b.to}|${b.drift}`));
}

export interface SourceFinding {
  source: string;
  status?: string;
  error?: string;
  lastSuccessMs?: number;
}

/** A source whose last full success is older than STALE_HOURS, or that has never had one. */
export function classifySources(rows: SourceRow[], now: Date, hours: number = STALE_HOURS): SourceFinding[] {
  const cutoff = now.getTime() - hours * HOUR_MS;
  return rows
    .filter(r => typeof r.lastSuccessMs !== "number" || r.lastSuccessMs < cutoff)
    .map(r => ({ source: r.source, status: r.status ?? undefined, error: r.error ?? undefined, lastSuccessMs: typeof r.lastSuccessMs === "number" ? r.lastSuccessMs : undefined }));
}

// ── Alerts ───────────────────────────────────────────────────────────────

export interface Alert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
}

export interface DriftConfig {
  unknownClientNetworks: string[];
}

export interface DriftResult {
  /** Alerts that hold this run. */
  alerts: Alert[];
  /** Alert names this run judged: their active alerts that are not in `alerts` are resolved. */
  evaluated: AlertName[];
  /** Why a check did not run, or ran as a no-op. */
  skipped: string[];
}

const QUERY_DOC = "docs/network-map/queries.md";

/** `3h12m ago (2026-11-08T12:00:00.000Z)`, or `never`. */
export function ago(ms: number | undefined, now: Date): string {
  if (ms === undefined) return "never";
  const minutes = Math.max(0, Math.floor((now.getTime() - ms) / 60000));
  const h = Math.floor(minutes / 60);
  return `${h > 0 ? `${h}h` : ""}${minutes % 60}m ago (${new Date(ms).toISOString()})`;
}

/** The whole policy. Pure: the caller runs the queries and posts the result. */
export function evaluate(inputs: DriftInputs, config: DriftConfig = { unknownClientNetworks: DEFAULT_UNKNOWN_CLIENT_NETWORKS }): DriftResult {
  const { now } = inputs;
  const startsAt = now.toISOString();
  const endsAt = new Date(now.getTime() + ALERT_TTL_MINUTES * 60000).toISOString();
  const alerts: Alert[] = [];
  const evaluated: AlertName[] = [];
  const skipped: string[] = [];
  const alert = (alertname: AlertName, labels: Record<string, string>, summary: string, description: string, query: string) =>
    alerts.push({
      labels: { alertname, severity: "warning", namespace: NAMESPACE, job: JOB, ...labels },
      annotations: { summary, description, query: `${QUERY_DOC}#${query}` },
      startsAt,
      endsAt,
    });

  // Routes: observed only.
  if (inputs.routes) {
    evaluated.push(ALERT_NAMES.route);
    for (const f of classifyRoutes(inputs.routes)) {
      const what = f.exit ? `${f.system} exit node route ${f.cidr}` : `${f.system} route ${f.cidr}`;
      alert(
        ALERT_NAMES.route,
        { system: f.system, route: f.cidr, reason: f.reason },
        f.reason === "missing" ? `The ${what} has no router` : `Every router for the ${what} is offline`,
        f.reason === "missing"
          ? `No NetBird peer serves ${f.routeId}: its routing peer or peer group is empty, so nothing on it is reachable through NetBird.`
          : `${f.routeId} is approved on ${f.routers.join(", ")}, and every one of them is offline, so nothing on it is reachable through ${f.system}.`,
        "routes-with-no-live-router",
      );
    }
  } else skipped.push("routes: query failed");

  // Declared machines and apps not observed.
  if (inputs.presence && inputs.declared) {
    evaluated.push(ALERT_NAMES.presence);
    const kinds = new Set<string>();
    if (inputs.declared.machines > 0) kinds.add("machine");
    else skipped.push("declared-not-observed machines: the declared layer has no machines");
    if (inputs.declared.apps > 0) kinds.add("app");
    else skipped.push("declared-not-observed apps: the declared layer has no apps");
    for (const f of classifyPresence(
      inputs.presence.filter(r => kinds.has(r.kind)),
      now,
    )) {
      alert(
        ALERT_NAMES.presence,
        { kind: f.kind, key: f.key },
        `Declared ${f.kind} ${f.name} has not been observed for ${STALE_HOURS}h`,
        f.lastSeenMs === undefined
          ? `The repo declares ${f.kind} ${f.key}, and nothing observed is joined to it: no source reports it, or the collector cannot match it.`
          : `The repo declares ${f.kind} ${f.key}; it was last observed ${ago(f.lastSeenMs, now)}.`,
        "declared-but-not-observed",
      );
    }
  } else skipped.push("declared-not-observed: query failed");

  // Unknown clients on the watched networks.
  if (inputs.unknownClients && inputs.declared) {
    evaluated.push(ALERT_NAMES.unknownClient);
    if (inputs.declared.machines === 0) skipped.push("unknown clients: the declared layer has no machines, so every client would be unknown");
    else
      for (const f of classifyUnknownClients(inputs.unknownClients, config.unknownClientNetworks, now)) {
        alert(
          ALERT_NAMES.unknownClient,
          { machine: f.machineId, network: f.networks.join(",") },
          `Unknown client ${f.name} on ${f.networks.join(", ")}`,
          `${f.name} (${[...f.macs, ...f.ips].join(", ") || f.machineId}) joined ${f.networks.join(", ")} ${ago(f.firstSeenMs, now)} and nothing in the repo declares it. Declare it, or find out what it is. This clears ${UNKNOWN_CLIENT_HOURS}h after it was first seen.`,
          "unknown-clients-on-home-and-iot",
        );
      }
  } else skipped.push("unknown clients: query failed");

  // Reach drift, per system with declared reach.
  if (inputs.declaredReach && inputs.observedReach && inputs.declared) {
    evaluated.push(ALERT_NAMES.reach);
    const systems = REACH_SYSTEMS.filter(s => inputs.declared?.reachSystems.includes(s));
    for (const s of REACH_SYSTEMS) if (!systems.includes(s)) skipped.push(`reach drift ${s}: the declared layer has no ${s} reach`);
    for (const f of classifyReach(inputs.declaredReach, inputs.observedReach, systems)) {
      const ports = (p: string[] | undefined) => (p ?? []).join(",");
      const description =
        f.drift === "missing"
          ? `The repo grants ${f.from} reach to ${f.to} (ports ${ports(f.declaredPorts)}), and the live ${f.system} policy does not.`
          : f.drift === "unexpected"
            ? `The live ${f.system} policy grants ${f.from} reach to ${f.to} (ports ${ports(f.observedPorts)}), and the repo does not. A console edit, or a declaration still to land.`
            : `${f.from} reaches ${f.to} on ports ${ports(f.observedPorts)} live, and on ${ports(f.declaredPorts)} in the repo.`;
      alert(ALERT_NAMES.reach, { system: f.system, from: f.from, to: f.to, drift: f.drift }, `${f.system} reach from ${f.from} to ${f.to} differs from the repo (${f.drift})`, description, "reach-drift");
    }
  } else skipped.push("reach drift: query failed");

  // Stale collector sources: observed only.
  if (inputs.sources) {
    evaluated.push(ALERT_NAMES.source);
    for (const f of classifySources(inputs.sources, now)) {
      alert(
        ALERT_NAMES.source,
        { source: f.source },
        `Network map source ${f.source} has not fully succeeded in ${STALE_HOURS}h`,
        `The collector last read ${f.source} in full ${ago(f.lastSuccessMs, now)}; its nodes are that old. Last status: ${f.status ?? "unknown"}${f.error ? `: ${f.error}` : ""}. Read the collector Job's log (\`kubectl -n database logs job/<job>\`).`,
        "stale-sources",
      );
    }
  } else skipped.push("stale sources: query failed");

  return { alerts: dedupe(alerts), evaluated, skipped };
}

/** A stable identity for an alert: its labels, sorted. Alertmanager's own fingerprint is over the same set. */
export function fingerprint(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map(k => `${k}=${labels[k]}`)
    .join("\u0000");
}

function dedupe(alerts: Alert[]): Alert[] {
  const byPrint = new Map<string, Alert>();
  for (const a of alerts) if (!byPrint.has(fingerprint(a.labels))) byPrint.set(fingerprint(a.labels), a);
  return [...byPrint.values()];
}

/** GET /api/v2/alerts, the fields used here. */
export interface ActiveAlert {
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
}

/**
 * The alerts to post as resolved: this job's active alerts, of an alert name
 * this run judged, that this run did not find. Posted with endsAt = now,
 * which Alertmanager takes as resolved.
 */
export function resolutions(active: ActiveAlert[], firing: Alert[], evaluated: readonly string[], now: Date): Alert[] {
  const holding = new Set(firing.map(a => fingerprint(a.labels)));
  const judged = new Set(evaluated);
  const at = now.toISOString();
  return active
    .filter(a => a.labels.job === JOB && a.labels.namespace === NAMESPACE && judged.has(a.labels.alertname) && !holding.has(fingerprint(a.labels)))
    .map(a => ({ labels: a.labels, annotations: a.annotations ?? {}, startsAt: a.startsAt ?? at, endsAt: at }));
}

/** `a,b , c` -> [a, b, c]. */
export function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function uniqSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
