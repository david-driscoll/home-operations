import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  ALERT_NAMES,
  ALERT_TTL_MINUTES,
  classifyPresence,
  classifyReach,
  classifyRoutes,
  classifySources,
  classifyUnknownClients,
  type DeclaredReachRow,
  type DriftInputs,
  declaredCountsQuery,
  declaredPresenceQuery,
  declaredReachQuery,
  evaluate,
  fingerprint,
  JOB,
  normalizePorts,
  type ObservedReachRow,
  observedReachQuery,
  REACH_SYSTEMS,
  resolutions,
  routesQuery,
  sourcesQuery,
  unknownClientsQuery,
} from "./drift.ts";

const now = new Date("2026-11-08T12:00:00.000Z");
const hoursAgo = (h: number) => now.getTime() - h * 3_600_000;

describe("classifyRoutes", () => {
  it("flags a route whose approved routers are all offline, and ignores unapproved ones", () => {
    const findings = classifyRoutes([
      {
        routeId: "tailscale:10.10.0.0/16",
        system: "tailscale",
        cidr: "10.10.0.0/16",
        exit: false,
        routers: [
          { machine: "a", approved: true, online: false },
          { machine: "b", approved: false, online: true },
        ],
      },
      {
        routeId: "tailscale:10.20.0.0/16",
        system: "tailscale",
        cidr: "10.20.0.0/16",
        exit: false,
        routers: [
          { machine: "a", approved: true, online: false },
          { machine: "c", approved: true, online: true },
        ],
      },
      { routeId: "tailscale:10.30.0.0/16", system: "tailscale", cidr: "10.30.0.0/16", exit: false, routers: [{ machine: "d", approved: false, online: false }] },
    ]);
    assert.deepEqual(findings, [{ routeId: "tailscale:10.10.0.0/16", system: "tailscale", cidr: "10.10.0.0/16", exit: false, reason: "offline", routers: ["a"] }]);
  });

  it("counts an unknown online state as live: it never guesses", () => {
    assert.deepEqual(classifyRoutes([{ routeId: "tailscale:10.10.0.0/16", system: "tailscale", cidr: "10.10.0.0/16", exit: false, routers: [{ machine: "a", approved: true, online: null }] }]), []);
  });

  it("flags a NetBird route nobody serves as missing, but not a Tailscale one", () => {
    const findings = classifyRoutes([
      { routeId: "netbird:10.40.0.0/24", system: "netbird", cidr: "10.40.0.0/24", exit: false, routers: [] },
      { routeId: "tailscale:10.50.0.0/24", system: "tailscale", cidr: "10.50.0.0/24", exit: false, routers: [] },
    ]);
    assert.deepEqual(
      findings.map(f => [f.routeId, f.reason]),
      [["netbird:10.40.0.0/24", "missing"]],
    );
  });

  it("reports an exit node once, for 0.0.0.0/0", () => {
    const routers = [{ machine: "exit", approved: true, online: false }];
    const findings = classifyRoutes([
      { routeId: "tailscale:0.0.0.0/0", system: "tailscale", cidr: "0.0.0.0/0", exit: true, routers },
      { routeId: "tailscale:::/0", system: "tailscale", cidr: "::/0", exit: true, routers },
    ]);
    assert.deepEqual(
      findings.map(f => f.cidr),
      ["0.0.0.0/0"],
    );
  });
});

describe("classifyPresence", () => {
  it("flags declared things last observed over 6h ago, and gives a new declaration the same grace", () => {
    const findings = classifyPresence(
      [
        { kind: "machine", nodeKey: "stale", name: "stale", declaredSinceMs: hoursAgo(100), observedLastSeenMs: [hoursAgo(7), hoursAgo(9)] },
        { kind: "machine", nodeKey: "fresh", name: "fresh", declaredSinceMs: hoursAgo(100), observedLastSeenMs: [hoursAgo(7), hoursAgo(1)] },
        { kind: "app", nodeKey: "never-old", name: "never-old", declaredSinceMs: hoursAgo(7), observedLastSeenMs: [] },
        { kind: "app", nodeKey: "never-new", name: "never-new", declaredSinceMs: hoursAgo(1), observedLastSeenMs: [null] },
        { kind: "app", nodeKey: "never-undated", name: "never-undated", declaredSinceMs: null, observedLastSeenMs: [] },
      ],
      now,
    );
    assert.deepEqual(
      findings.map(f => [f.key, f.lastSeenMs]),
      [
        ["stale", hoursAgo(7)],
        ["never-old", undefined],
        ["never-undated", undefined],
      ],
    );
  });
});

describe("classifyUnknownClients", () => {
  it("keeps recent clients on watched networks, one finding per machine, and leaves Guest out", () => {
    const findings = classifyUnknownClients(
      [
        { machineId: "m1", name: "phone", firstSeenMs: hoursAgo(2), network: "Home", mac: "aa:bb", ips: ["10.0.0.5"] },
        { machineId: "m1", name: "phone", firstSeenMs: hoursAgo(2), network: "IoT", mac: "aa:cc", ips: ["10.1.0.5"] },
        { machineId: "m2", name: "visitor", firstSeenMs: hoursAgo(1), network: "Guest", mac: "dd:ee", ips: [] },
        { machineId: "m3", name: "old", firstSeenMs: hoursAgo(30), network: "Home", mac: "ff:00", ips: [] },
      ],
      ["Home", "IoT"],
      now,
    );
    assert.deepEqual(findings, [{ machineId: "m1", name: "phone", firstSeenMs: hoursAgo(2), networks: ["Home", "IoT"], macs: ["aa:bb", "aa:cc"], ips: ["10.0.0.5", "10.1.0.5"] }]);
  });
});

describe("classifyReach", () => {
  const declared = (over: Partial<DeclaredReachRow>): DeclaredReachRow => ({
    system: "netbird",
    fromKey: "netbird:admins",
    toKey: "netbird:servers",
    ports: [],
    fromObserved: ["netbird:admins"],
    toObserved: ["netbird:servers"],
    ...over,
  });
  const observed = (over: Partial<ObservedReachRow>): ObservedReachRow => ({
    system: "netbird",
    fromKey: "netbird:admins",
    toKey: "netbird:servers",
    ports: [],
    fromDeclared: ["netbird:admins"],
    toDeclared: ["netbird:servers"],
    ...over,
  });

  it("finds nothing when the two layers agree, across policies and port spellings", () => {
    assert.deepEqual(classifyReach([declared({ ports: ["443", "22"] })], [observed({ via: "a", ports: ["22"] }), observed({ via: "b", ports: ["443"] })], ["netbird"]), []);
    assert.deepEqual(classifyReach([declared({ ports: ["*"] })], [observed({ ports: [] })], ["netbird"]), []);
  });

  it("finds declared reach that is not live, live reach that is not declared, and different ports", () => {
    const findings = classifyReach(
      [declared({}), declared({ toKey: "netbird:dns", toObserved: ["netbird:dns"], ports: ["53"] })],
      [observed({ toKey: "netbird:dns", toDeclared: ["netbird:dns"], ports: ["53", "853"] }), observed({ fromKey: "netbird:guests", fromDeclared: ["netbird:guests"], ports: ["22"] })],
      ["netbird"],
    );
    assert.deepEqual(
      findings.map(f => [f.drift, f.from, f.to, f.declaredPorts, f.observedPorts]),
      [
        ["ports", "netbird:admins", "netbird:dns", ["53"], ["53", "853"]],
        ["missing", "netbird:admins", "netbird:servers", ["*"], undefined],
        ["unexpected", "netbird:guests", "netbird:servers", undefined, ["22"]],
      ],
    );
  });

  it("judges only systems with declared reach, and only pairs whose ends exist in both layers", () => {
    assert.deepEqual(classifyReach([], [observed({ system: "tailscale", fromKey: "tailscale:tag:x", fromDeclared: ["tailscale:tag:x"] })], ["netbird"]), []);
    assert.deepEqual(classifyReach([declared({ toObserved: [] })], [observed({ fromDeclared: [] })], ["netbird"]), []);
  });

  it("normalizes ports", () => {
    assert.deepEqual(normalizePorts([]), ["*"]);
    assert.deepEqual(normalizePorts(["443", " 22 ", "443"]), ["22", "443"]);
    assert.deepEqual(normalizePorts(["22", "*"]), ["*"]);
  });
});

describe("classifySources", () => {
  it("flags sources whose last full success is over 6h old, or missing", () => {
    const findings = classifySources(
      [
        { source: "unifi", status: "ok", lastSuccessMs: hoursAgo(1) },
        { source: "docker", status: "partial", error: "luna down", lastSuccessMs: hoursAgo(7) },
        { source: "proxmox", status: "failed", lastSuccessMs: null },
      ],
      now,
    );
    assert.deepEqual(findings, [
      { source: "docker", status: "partial", error: "luna down", lastSuccessMs: hoursAgo(7) },
      { source: "proxmox", status: "failed", error: undefined, lastSuccessMs: undefined },
    ]);
  });
});

/** Rows that would fire every alert, if the declared layer were there. */
function everything(machines: number, apps: number, reachSystems: string[]): DriftInputs {
  return {
    now,
    declared: { machines, apps, reachSystems },
    routes: [{ routeId: "netbird:10.40.0.0/24", system: "netbird", cidr: "10.40.0.0/24", exit: false, routers: [] }],
    presence: [
      { kind: "machine", nodeKey: "gateway-luna", name: "gateway-luna", declaredSinceMs: hoursAgo(100), observedLastSeenMs: [hoursAgo(8)] },
      { kind: "app", nodeKey: "jellyfin", name: "jellyfin", declaredSinceMs: hoursAgo(100), observedLastSeenMs: [] },
    ],
    unknownClients: [{ machineId: "unifi:client:aa:bb", name: "phone", firstSeenMs: hoursAgo(1), network: "Home", mac: "aa:bb", ips: [] }],
    declaredReach: [{ system: "netbird", fromKey: "netbird:admins", toKey: "netbird:servers", ports: [], fromObserved: ["netbird:admins"], toObserved: ["netbird:servers"] }],
    observedReach: [],
    sources: [{ source: "docker", status: "failed", lastSuccessMs: hoursAgo(7) }],
  };
}

describe("evaluate", () => {
  it("is a no-op for every declared-layer alert while that layer is empty, and still judges the rest", () => {
    const result = evaluate(everything(0, 0, []));
    assert.deepEqual(result.alerts.map(a => a.labels.alertname).sort(), [ALERT_NAMES.source, ALERT_NAMES.route].sort());
    // Judged, so any alert left from before the layer emptied is resolved.
    assert.deepEqual([...result.evaluated].sort(), Object.values(ALERT_NAMES).sort());
    assert.ok(result.skipped.some(s => s.includes("unknown clients") && s.includes("no machines")));
    assert.ok(result.skipped.some(s => s.startsWith("reach drift netbird")));
  });

  it("fires the declared-layer alerts once the layer has what each needs", () => {
    const names = evaluate(everything(3, 2, ["netbird"])).alerts.map(a => a.labels.alertname);
    assert.deepEqual([...new Set(names)].sort(), Object.values(ALERT_NAMES).sort());
    // Apps declared but no machines: only the app half of presence fires, and no unknown clients.
    const appsOnly = evaluate(everything(0, 2, [])).alerts;
    assert.deepEqual(
      appsOnly.filter(a => a.labels.alertname === ALERT_NAMES.presence).map(a => a.labels.key),
      ["jellyfin"],
    );
    assert.equal(appsOnly.filter(a => a.labels.alertname === ALERT_NAMES.unknownClient).length, 0);
  });

  it("skips, and neither fires nor resolves, a check whose query failed", () => {
    const inputs = { ...everything(3, 2, ["netbird"]), routes: undefined, declared: undefined };
    const result = evaluate(inputs);
    assert.deepEqual(result.evaluated, [ALERT_NAMES.source]);
    assert.ok(result.skipped.includes("routes: query failed"));
  });

  it("builds Alertmanager v2 payloads with stable labels and a TTL", () => {
    const { alerts } = evaluate(everything(3, 2, ["netbird"]));
    const route = alerts.find(a => a.labels.alertname === ALERT_NAMES.route);
    assert.deepEqual(route?.labels, { alertname: ALERT_NAMES.route, severity: "warning", namespace: "database", job: JOB, system: "netbird", route: "10.40.0.0/24", reason: "missing" });
    assert.equal(route?.annotations.query, "docs/network-map/queries.md#routes-with-no-live-router");
    assert.equal(route?.startsAt, now.toISOString());
    assert.equal(Date.parse(route?.endsAt ?? "") - now.getTime(), ALERT_TTL_MINUTES * 60000);
    for (const a of alerts) {
      assert.equal(a.labels.severity, "warning");
      for (const v of Object.values(a.labels)) assert.equal(typeof v, "string");
      assert.ok(a.annotations.summary && a.annotations.description);
    }
    const reach = alerts.find(a => a.labels.alertname === ALERT_NAMES.reach);
    assert.deepEqual(reach?.labels, { alertname: ALERT_NAMES.reach, severity: "warning", namespace: "database", job: JOB, system: "netbird", from: "netbird:admins", to: "netbird:servers", drift: "missing" });
    // A second run an hour later posts the same identities, so Alertmanager deduplicates.
    const later = evaluate({ ...everything(3, 2, ["netbird"]), now: new Date(now.getTime() + 3_600_000) }).alerts;
    assert.deepEqual(later.map(a => fingerprint(a.labels)).sort(), alerts.map(a => fingerprint(a.labels)).sort());
  });
});

describe("resolutions", () => {
  it("resolves this job's judged alerts that no longer hold, and nothing else", () => {
    const { alerts, evaluated } = evaluate({ ...everything(0, 0, []), routes: [] });
    const base = { severity: "warning", namespace: "database", job: JOB };
    const active = [
      { labels: { ...base, alertname: ALERT_NAMES.route, system: "netbird", route: "10.9.0.0/24", reason: "missing" }, startsAt: "2026-11-08T10:00:00.000Z", annotations: { summary: "s" } },
      { labels: { ...base, alertname: ALERT_NAMES.source, source: "docker" } },
      { labels: { ...base, alertname: "SomethingElse" } },
      { labels: { ...base, job: "netbird-health", alertname: ALERT_NAMES.route } },
    ];
    const out = resolutions(active, alerts, evaluated, now);
    assert.deepEqual(out, [{ labels: active[0].labels, annotations: { summary: "s" }, startsAt: "2026-11-08T10:00:00.000Z", endsAt: now.toISOString() }]);
    // The source alert still holds, so it is not resolved; an unjudged name is left to lapse.
    assert.deepEqual(resolutions(active, alerts, [], now), []);
  });
});

describe("queries", () => {
  it("are the ones docs/network-map/queries.md lists, verbatim", async () => {
    const doc = await readFile(new URL("../../../docs/network-map/queries.md", import.meta.url), "utf8");
    const statements = {
      declaredCountsQuery,
      routesQuery,
      declaredPresenceQuery,
      unknownClients: unknownClientsQuery(["Home"], 0),
      declaredReachQuery,
      observedReach: observedReachQuery(REACH_SYSTEMS),
      sourcesQuery,
    };
    for (const [name, s] of Object.entries(statements)) assert.ok(doc.includes(s.text), `${name} is not in queries.md as drift.ts has it:\n${s.text}`);
  });

  it("only read", () => {
    for (const s of [declaredCountsQuery, routesQuery, declaredPresenceQuery, unknownClientsQuery(["Home"], 0), declaredReachQuery, observedReachQuery(["netbird"]), sourcesQuery]) {
      assert.doesNotMatch(s.text, /\b(CREATE|MERGE|SET|DELETE|REMOVE|DETACH|LOAD CSV|CALL\s+apoc)\b/i);
    }
  });
});
