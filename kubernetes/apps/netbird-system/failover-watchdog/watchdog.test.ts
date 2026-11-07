/**
 * node --test kubernetes/apps/netbird-system/failover-watchdog/watchdog.test.ts
 *
 * The watchdog's policy (#3001): flip only after enough failures in a row,
 * and only when Cloudflare and a standby both answer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alertFor,
  CONSECUTIVE_RUN_GAP_MINUTES,
  type Decision,
  decide,
  FLIP_COOLDOWN_MINUTES,
  type Observation,
  parseCandidates,
  parseState,
  run,
  WATCHDOG_FAILURES_TO_FLIP,
  type WatchdogIo,
  type WatchdogState,
} from "./watchdog.ts";

const PRIMARY = "203.0.113.10";
const STANDBY = "198.51.100.20";
const now = new Date("2026-11-03T20:00:00Z");
const minuteAgo = new Date(now.getTime() - 60000).toISOString();
const hosts = (standbyReachable = true) => [
  { name: "azure-eus2", ip: PRIMARY, reachable: false },
  { name: "azure-cus", ip: STANDBY, reachable: standbyReachable },
];
const down = (standbyReachable = true) => ({ leaseIp: PRIMARY, activeHealthy: false, activeReachable: true, candidates: hosts(standbyReachable), now });

describe("decide", () => {
  it("resets the count while management answers, and remembers it did", () => {
    const { decision, next } = decide({ failures: 3 }, { ...down(), activeHealthy: true });
    assert.deepEqual(decision, { action: "healthy" });
    assert.equal(next.failures, 0);
    assert.equal(next.everHealthy, true);
  });

  it("never fails over from a management that has never answered", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP, lastRunAt: minuteAgo }, down());
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /never answered/);
  });

  it("counts failures up to the threshold without flipping", () => {
    let state: WatchdogState = { failures: 0 };
    for (let i = 1; i < WATCHDOG_FAILURES_TO_FLIP; i++) {
      const { decision, next } = decide(state, down());
      assert.deepEqual(decision, { action: "count", failures: i });
      state = next;
    }
  });

  it("flips to the reachable standby on the Nth failure in a row, and starts over", () => {
    const { decision, next } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true, lastRunAt: minuteAgo }, down());
    assert.deepEqual(decision, { action: "flip", from: PRIMARY, to: { name: "azure-cus", ip: STANDBY } });
    assert.deepEqual(next, { failures: 0, lastFlipAt: now.toISOString(), everHealthy: true, lastRunAt: now.toISOString() });
  });

  it("a single healthy run in between restarts the count", () => {
    const one = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1 }, { ...down(), activeHealthy: true }).next;
    assert.equal(decide(one, down()).decision.action, "count");
  });

  // #3161 item 3: only failures in a row count, and anything else breaks the streak.
  describe("consecutive failures only", () => {
    const minute = (i: number) => new Date(now.getTime() + i * 60000);
    const blind = (at: Date): Observation => ({ leaseIp: null, activeHealthy: false, activeReachable: false, candidates: [], now: at });
    const failed = (at: Date): Observation => ({ ...down(), now: at });
    const ok = (at: Date): Observation => ({ ...down(), activeHealthy: true, now: at });
    /** Runs the observations a minute apart from a healthy start and returns every decision. */
    const play = (pattern: string): Decision[] => {
      let state: WatchdogState = { failures: 0, everHealthy: true, lastRunAt: now.toISOString() };
      return [...pattern].map((c, i) => {
        const at = minute(i + 1);
        const { decision, next } = decide(state, c === "x" ? failed(at) : c === "?" ? blind(at) : ok(at));
        state = next;
        return decision;
      });
    };
    const flips = (decisions: Decision[]) => decisions.filter(d => d.action === "flip").length;

    it("flips on exactly the Nth failure in a row", () => {
      const decisions = play("x".repeat(WATCHDOG_FAILURES_TO_FLIP));
      assert.equal(decisions.at(-1)?.action, "flip");
      assert.equal(flips(decisions), 1);
    });

    it("never flips when every streak is broken by a success, however many failures there are", () => {
      const run = `${"x".repeat(WATCHDOG_FAILURES_TO_FLIP - 1)}.`;
      assert.equal(flips(play(run.repeat(6))), 0);
    });

    it("never flips when the streak is broken by a run that could not read Cloudflare (flaky internet)", () => {
      assert.equal(flips(play("xx?xx?xxx?xxxx?xx")), 0);
    });

    it("a broken streak starts again from one", () => {
      const decisions = play("xxxx?x");
      assert.deepEqual(decisions.at(-1), { action: "count", failures: 1 });
    });

    it("a gap since the last recorded run breaks the streak: missed or crashed runs are not failures", () => {
      const stale = new Date(now.getTime() - (CONSECUTIVE_RUN_GAP_MINUTES + 1) * 60000).toISOString();
      const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true, lastRunAt: stale }, down());
      assert.deepEqual(decision, { action: "count", failures: 1 });
    });

    it("a state with no recorded run starts the streak over", () => {
      const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true }, down());
      assert.deepEqual(decision, { action: "count", failures: 1 });
    });

    it("a run inside the gap continues the streak", () => {
      const recent = new Date(now.getTime() - (CONSECUTIVE_RUN_GAP_MINUTES - 1) * 60000).toISOString();
      assert.equal(decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true, lastRunAt: recent }, down()).decision.action, "flip");
    });

    it("blind runs count in a row the same way", () => {
      const stale = new Date(now.getTime() - (CONSECUTIVE_RUN_GAP_MINUTES + 1) * 60000).toISOString();
      assert.deepEqual(decide({ failures: 0, blindRuns: 9, lastRunAt: stale }, blind(now)).decision, { action: "blind", runs: 1 });
    });
  });

  // "Cutting the watchdog's own internet does not trigger a flip" (#3161 item 1).
  it("never flips while Cloudflare cannot be read, counts the blind runs, and drops the failure count", () => {
    const state = { failures: WATCHDOG_FAILURES_TO_FLIP + 2, everHealthy: true, blindRuns: 1, lastRunAt: minuteAgo };
    const { decision, next } = decide(state, { leaseIp: null, activeHealthy: false, activeReachable: false, candidates: [], now });
    assert.deepEqual(decision, { action: "blind", runs: 2 });
    assert.equal(next.failures, 0);
    assert.equal(next.blindRuns, 2);
    assert.equal(next.everHealthy, true);
  });

  it("a readable Cloudflare ends the blind streak", () => {
    const { next } = decide({ failures: 0, blindRuns: 7, lastRunAt: minuteAgo }, { ...down(), activeHealthy: true });
    assert.equal(next.blindRuns ?? 0, 0);
  });

  it("holds when no standby answers on 443, which is what a home-internet outage looks like", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true, lastRunAt: minuteAgo }, down(false));
    assert.deepEqual(decision, { action: "hold", reason: "no standby answers on 443", failures: WATCHDOG_FAILURES_TO_FLIP + 1 });
  });

  // #3161 item 2: Equestria's view alone is not evidence. A holder that still
  // answers TLS on 443 proves the route works, so its management is what failed.
  it("holds, and pages, when the holder does not answer on 443 at all: that is also what Equestria losing its route looks like", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true, lastRunAt: minuteAgo }, { ...down(), activeReachable: false });
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /does not answer on 443 from Equestria/);
    const alerts = alertFor(decision, "netbird.example.test", now) as { labels: Record<string, string> }[];
    assert.equal(alerts[0].labels.alertname, "NetbirdFailoverBlocked");
  });

  it("flips when the holder answers on 443 but management does not (the #2892 drill)", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true, lastRunAt: minuteAgo }, { ...down(), activeReachable: true });
    assert.equal(decision.action, "flip");
  });

  it("with neither host answering on 443, names the standby: Equestria's internet is the likelier cause", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true, lastRunAt: minuteAgo }, { ...down(false), activeReachable: false });
    assert.deepEqual(decision, { action: "hold", reason: "no standby answers on 443", failures: WATCHDOG_FAILURES_TO_FLIP + 1 });
  });

  it("holds when there is no other host at all", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true, lastRunAt: minuteAgo }, { ...down(), candidates: [{ name: "azure-eus2", ip: PRIMARY, reachable: false }] });
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /no standby/);
  });

  it("never flips again inside the cooldown, and may after it", () => {
    const recent = new Date(now.getTime() - (FLIP_COOLDOWN_MINUTES - 1) * 60000).toISOString();
    assert.equal(decide({ failures: WATCHDOG_FAILURES_TO_FLIP, lastFlipAt: recent, everHealthy: true, lastRunAt: minuteAgo }, down()).decision.action, "hold");
    const old = new Date(now.getTime() - (FLIP_COOLDOWN_MINUTES + 1) * 60000).toISOString();
    assert.equal(decide({ failures: WATCHDOG_FAILURES_TO_FLIP, lastFlipAt: old, everHealthy: true, lastRunAt: minuteAgo }, down()).decision.action, "flip");
  });

  it("after a flip, watches the new holder: the lease address is what it probes", () => {
    // The standby holds the lease now and is down; the old primary is back.
    const { decision } = decide(
      { failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true, lastRunAt: minuteAgo },
      {
        leaseIp: STANDBY,
        activeHealthy: false,
        activeReachable: true,
        candidates: [
          { name: "azure-eus2", ip: PRIMARY, reachable: true },
          { name: "azure-cus", ip: STANDBY, reachable: false },
        ],
        now,
      },
    );
    assert.deepEqual(decision, { action: "flip", from: STANDBY, to: { name: "azure-eus2", ip: PRIMARY } });
  });

  it("prefers candidates in the order given", () => {
    const { decision } = decide(
      { failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true, lastRunAt: minuteAgo },
      {
        ...down(),
        candidates: [
          { name: "azure-eus2", ip: PRIMARY, reachable: false },
          { name: "oci", ip: "192.0.2.5", reachable: true },
          { name: "azure-cus", ip: STANDBY, reachable: true },
        ],
      },
    );
    assert.equal((decision as { to: { name: string } }).to.name, "oci");
  });
});

describe("parseCandidates", () => {
  it("reads name=record pairs in order", () => {
    assert.deepEqual(parseCandidates("azure-eus2=relay-eus2.example.test, azure-cus=relay-cus.example.test"), [
      { name: "azure-eus2", record: "relay-eus2.example.test" },
      { name: "azure-cus", record: "relay-cus.example.test" },
    ]);
  });

  it("refuses an empty or malformed list", () => {
    assert.throws(() => parseCandidates(""), /empty/);
    assert.throws(() => parseCandidates("azure-cus"), /not <name>=<dns name>/);
    assert.throws(() => parseCandidates("azure-cus=https://x"), /not <name>=<dns name>/);
  });
});

describe("parseState", () => {
  it("starts from zero and survives junk", () => {
    assert.deepEqual(parseState(undefined), { failures: 0 });
    assert.deepEqual(parseState({ failures: "x" }), { failures: 0 });
    assert.deepEqual(parseState({ failures: "3", lastFlipAt: "2026-11-03T19:00:00.000Z" }), { failures: 3, lastFlipAt: "2026-11-03T19:00:00.000Z" });
    assert.deepEqual(parseState({ failures: "2", lastFlipAt: "" }), { failures: 2 });
    assert.deepEqual(parseState({ failures: "0", everHealthy: "true" }), { failures: 0, everHealthy: true });
    assert.deepEqual(parseState({ failures: "0", everHealthy: "false" }), { failures: 0 });
    assert.deepEqual(parseState({ failures: "1", blindRuns: "3", lastRun: "2026-11-03T19:59:00.000Z" }), { failures: 1, blindRuns: 3, lastRunAt: "2026-11-03T19:59:00.000Z" });
    assert.deepEqual(parseState({ failures: "1", blindRuns: "-2", lastRun: "" }), { failures: 1 });
  });
});

describe("alertFor", () => {
  it("pages on every flip, naming the new holder", () => {
    const alerts = alertFor({ action: "flip", from: PRIMARY, to: { name: "azure-cus", ip: STANDBY } }, "netbird.example.test", now) as { labels: Record<string, string>; endsAt: string }[];
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].labels.alertname, "NetbirdFailover");
    assert.equal(alerts[0].labels.severity, "critical");
    assert.equal(alerts[0].labels.to, "azure-cus");
    assert.ok(Date.parse(alerts[0].endsAt) > now.getTime());
  });

  it("pages when it would flip but holds, and stays quiet while counting", () => {
    const blocked = alertFor({ action: "hold", reason: "no standby answers on 443", failures: WATCHDOG_FAILURES_TO_FLIP }, "netbird.example.test", now) as { labels: Record<string, string> }[];
    assert.equal(blocked[0].labels.alertname, "NetbirdFailoverBlocked");
    assert.equal(alertFor({ action: "count", failures: 2 }, "netbird.example.test", now), undefined);
    assert.equal(alertFor({ action: "hold", reason: "cooldown", failures: 1 }, "netbird.example.test", now), undefined);
    assert.equal(alertFor({ action: "healthy" }, "netbird.example.test", now), undefined);
  });

  it("warns, under its own name, once Cloudflare has been unreadable for the flip threshold", () => {
    assert.equal(alertFor({ action: "blind", runs: WATCHDOG_FAILURES_TO_FLIP - 1 }, "netbird.example.test", now), undefined);
    const blind = alertFor({ action: "blind", runs: WATCHDOG_FAILURES_TO_FLIP }, "netbird.example.test", now) as { labels: Record<string, string>; endsAt: string }[];
    assert.equal(blind[0].labels.alertname, "NetbirdFailoverWatchdogBlind");
    assert.equal(blind[0].labels.severity, "warning");
    assert.ok(Date.parse(blind[0].endsAt) > now.getTime());
  });
});

// #3161 item 4: the I/O around decide(), with Cloudflare, the API server,
// Alertmanager and the TLS probes all faked.
describe("run", () => {
  const LEASE = "netbird.example.test";
  const STATE_URL = "https://kubernetes.default.svc/api/v1/namespaces/netbird-system/configmaps/netbird-failover-watchdog-state";
  const ENV: Record<string, string> = {
    NETBIRD_LEASE: LEASE,
    CF_ZONE_ID: "zone",
    CF_API_TOKEN: "token",
    NETBIRD_CANDIDATES: "azure-eus2=relay-eus2.example.test,azure-cus=relay-cus.example.test",
    POD_NAMESPACE: "netbird-system",
    STATE_CONFIGMAP: "netbird-failover-watchdog-state",
    ALERTMANAGER_URL: "http://alertmanager.test:9093",
  };
  const A: Record<string, string> = { [LEASE]: PRIMARY, "relay-eus2.example.test": PRIMARY, "relay-cus.example.test": STANDBY };

  interface Call {
    method: string;
    url: string;
    body?: unknown;
    authorization?: string | null;
  }
  interface World {
    state?: Record<string, string>;
    healthy?: boolean;
    reachable?: Record<string, boolean>;
    /** false: the watchdog's internet is gone. */
    cloudflare?: boolean;
    /** false: Alertmanager refuses connections. */
    alertmanager?: boolean;
    /** Cloudflare answers a PATCH with the old address. */
    keepRecord?: boolean;
  }
  function world(opts: World = {}) {
    const calls: Call[] = [];
    const probes: string[] = [];
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
      const url = String(input);
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body, authorization: new Headers(init.headers).get("Authorization") });
      if (url === STATE_URL) return json(method === "GET" ? { data: opts.state ?? {} } : {});
      if (url.startsWith("https://api.cloudflare.com/")) {
        if (opts.cloudflare === false) throw new TypeError("fetch failed");
        const name = new URL(url).searchParams.get("name");
        if (method === "GET" && name) return json({ success: true, result: [{ id: `id-${name}`, content: A[name] }] });
        if (method === "PATCH") return json({ success: true, result: { content: opts.keepRecord ? PRIMARY : (body as { content: string }).content } });
      }
      if (url === `${ENV.ALERTMANAGER_URL}/api/v2/alerts`) {
        if (opts.alertmanager === false) throw new TypeError("fetch failed");
        return new Response("", { status: 200 });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };
    const io: WatchdogIo = {
      env: name => ENV[name],
      now: () => now,
      fetch: fakeFetch as typeof fetch,
      serviceAccountToken: () => "sa-token",
      healthy: async (ip, name) => {
        probes.push(`healthy ${ip} ${name}`);
        return opts.healthy ?? false;
      },
      reachable: async (ip, name) => {
        probes.push(`reachable ${ip} ${name}`);
        return (opts.reachable ?? { [PRIMARY]: true, [STANDBY]: true })[ip] ?? false;
      },
      log: () => {},
    };
    const written = () => calls.find(c => c.url === STATE_URL && c.method === "PATCH")?.body as { data: Record<string, string> } | undefined;
    const alerts = () => calls.filter(c => c.url.endsWith("/api/v2/alerts")).flatMap(c => c.body as { labels: Record<string, string> }[]);
    const recordWrites = () => calls.filter(c => c.url.startsWith("https://api.cloudflare.com/") && c.method === "PATCH").map(c => ({ url: c.url, body: c.body }));
    return { io, calls, probes, written, alerts, recordWrites };
  }
  const streak = (failures: number) => ({ failures: String(failures), everHealthy: "true", lastRun: minuteAgo });

  it("on a healthy run, records it and touches nothing else", async () => {
    const w = world({ state: streak(3), healthy: true });
    assert.deepEqual(await run(w.io), { action: "healthy" });
    assert.deepEqual(w.recordWrites(), []);
    assert.deepEqual(w.alerts(), []);
    assert.deepEqual(w.written()?.data, { failures: "0", blindRuns: "0", lastFlipAt: "", everHealthy: "true", lastRun: now.toISOString(), lastDecision: "healthy", lastLease: PRIMARY });
    assert.ok(w.probes.includes(`healthy ${PRIMARY} ${LEASE}`));
  });

  it("authenticates to the API server with the service account and to Cloudflare with its token", async () => {
    const w = world({ state: streak(0), healthy: true });
    await run(w.io);
    assert.ok(w.calls.filter(c => c.url === STATE_URL).every(c => c.authorization === "Bearer sa-token"));
    assert.ok(w.calls.filter(c => c.url.startsWith("https://api.cloudflare.com/")).every(c => c.authorization === "Bearer token"));
  });

  it("on the Nth failure in a row, repoints the lease at the standby, pages, and starts the count over", async () => {
    const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1) });
    assert.equal((await run(w.io)).action, "flip");
    assert.deepEqual(w.recordWrites(), [{ url: `https://api.cloudflare.com/client/v4/zones/zone/dns_records/id-${LEASE}`, body: { content: STANDBY } }]);
    assert.equal(w.alerts()[0].labels.alertname, "NetbirdFailover");
    assert.equal(w.written()?.data.failures, "0");
    assert.equal(w.written()?.data.lastFlipAt, now.toISOString());
    // The holder is probed under the lease's name, the standby under its relay's.
    assert.ok(w.probes.includes(`reachable ${PRIMARY} ${LEASE}`));
    assert.ok(w.probes.includes(`reachable ${STANDBY} relay-cus.example.test`));
  });

  it("does not flip when only Equestria's route to the holder is gone", async () => {
    const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1), reachable: { [PRIMARY]: false, [STANDBY]: true } });
    assert.equal((await run(w.io)).action, "hold");
    assert.deepEqual(w.recordWrites(), []);
    assert.equal(w.alerts()[0].labels.alertname, "NetbirdFailoverBlocked");
    assert.equal(w.written()?.data.failures, String(WATCHDOG_FAILURES_TO_FLIP));
  });

  it("with no internet, probes nothing, never writes the record, and warns once blind long enough", async () => {
    const w = world({ state: { ...streak(WATCHDOG_FAILURES_TO_FLIP - 1), blindRuns: String(WATCHDOG_FAILURES_TO_FLIP - 1) }, cloudflare: false });
    assert.deepEqual(await run(w.io), { action: "blind", runs: WATCHDOG_FAILURES_TO_FLIP });
    assert.deepEqual(w.probes, []);
    assert.deepEqual(w.recordWrites(), []);
    assert.deepEqual(
      w.alerts().map(a => a.labels.alertname),
      ["NetbirdFailoverWatchdogBlind"],
    );
    assert.equal(w.written()?.data.failures, "0");
    assert.equal(w.written()?.data.blindRuns, String(WATCHDOG_FAILURES_TO_FLIP));
    assert.equal(w.written()?.data.lastDecision, "blind");
  });

  it("still records the run when Alertmanager is down", async () => {
    const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1), alertmanager: false });
    assert.equal((await run(w.io)).action, "flip");
    assert.equal(w.written()?.data.lastDecision, "flip");
  });

  it("fails the run, without recording a flip, when Cloudflare keeps the old address", async () => {
    const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1), keepRecord: true });
    await assert.rejects(run(w.io), /kept/);
    assert.equal(w.written(), undefined);
  });
});
