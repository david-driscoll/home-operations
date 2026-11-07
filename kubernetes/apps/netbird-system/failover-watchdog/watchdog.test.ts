/**
 * node --test kubernetes/apps/netbird-system/failover-watchdog/watchdog.test.ts
 *
 * The watchdog's policy (#3001): flip only after enough failures in a row,
 * and only when Cloudflare and a standby both answer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
// The hosts' side of the second view. Only the test imports it: watchdog.ts
// ships alone in a ConfigMap, so the two agree through this test.
import { FAILOVER_VIEW_HEALTH_PATH, FAILOVER_VIEW_PREFIX } from "components/netbird/failoverView.ts";
import {
  alertFor,
  alertForStandbyView,
  CONSECUTIVE_RUN_GAP_MINUTES,
  type Decision,
  decide,
  FLIP_COOLDOWN_MINUTES,
  HEALTH_PATH,
  judgeStandbyView,
  nextViewStaleRuns,
  type Observation,
  PEER_VIEW_FRESH_MINUTES,
  PEER_VIEW_PREFIX,
  parseCandidates,
  parseState,
  peerViewsFrom,
  run,
  type StandbyView,
  signS3,
  standbyOf,
  VIEW_STALE_RUNS_TO_ALERT,
  type ViewRead,
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
/** What another host published about `ip`, `minutesAgo` before now (Garage's Last-Modified). */
const view = (observer: string, ip: string, healthy: boolean, minutesAgo = 0.5) => ({ observer, ip, healthy, at: new Date(now.getTime() - minutesAgo * 60000).toISOString() });
/** The primary is down, and the standby sees it down too. */
const down = (standbyReachable = true) => ({ leaseIp: PRIMARY, activeHealthy: false, views: [view("azure-cus", PRIMARY, false)], candidates: hosts(standbyReachable), now });

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
    const blind = (at: Date): Observation => ({ leaseIp: null, activeHealthy: false, views: [], candidates: [], now: at });
    // The standby keeps publishing as the minutes pass: its view is always 30 s old.
    const failed = (at: Date): Observation => ({ ...down(), views: [{ observer: "azure-cus", ip: PRIMARY, healthy: false, at: new Date(at.getTime() - 30000).toISOString() }], now: at });
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
    const { decision, next } = decide(state, { leaseIp: null, activeHealthy: false, views: [], candidates: [], now });
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

  // #3161 item 2: a flip needs two views of the holder, Equestria's streak and
  // a fresh report from another host (components/netbird/failoverView.ts).
  describe("the second view", () => {
    const streak = { failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true, lastRunAt: minuteAgo };

    it("flips when the standby saw the holder down within the window, whether or not the holder answers TLS (a dead VM)", () => {
      assert.equal(decide(streak, down()).decision.action, "flip");
    });

    it("holds, and pages, when no other host has published a view", () => {
      const { decision } = decide(streak, { ...down(), views: [] });
      assert.equal(decision.action, "hold");
      assert.match((decision as { reason: string }).reason, /no fresh view/);
      const alerts = alertFor(decision, "netbird.example.test", now) as { labels: Record<string, string> }[];
      assert.equal(alerts[0].labels.alertname, "NetbirdFailoverBlocked");
    });

    it("holds when the standby's view is older than the window", () => {
      const stale = view("azure-cus", PRIMARY, false, PEER_VIEW_FRESH_MINUTES + 1);
      assert.match((decide(streak, { ...down(), views: [stale] }).decision as { reason: string }).reason, /no fresh view/);
    });

    it("holds when the standby still sees management answer: the failure is on Equestria's path", () => {
      const { decision } = decide(streak, { ...down(), views: [view("azure-cus", PRIMARY, true)] });
      assert.equal(decision.action, "hold");
      assert.match((decision as { reason: string }).reason, /azure-cus still sees/);
    });

    it("ignores a view of another address, and the holder's view of itself", () => {
      const views = [view("azure-cus", STANDBY, false), view("azure-eus2", PRIMARY, false)];
      assert.equal(decide(streak, { ...down(), views }).decision.action, "hold");
    });

    it("ignores a view stamped in the future", () => {
      const future = view("azure-cus", PRIMARY, false, -5);
      assert.equal(decide(streak, { ...down(), views: [future] }).decision.action, "hold");
    });

    it("one fresh down view is enough, even beside an older healthy one", () => {
      const views = [view("azure-cus", PRIMARY, true, PEER_VIEW_FRESH_MINUTES + 2), view("azure-cus", PRIMARY, false)];
      assert.equal(decide(streak, { ...down(), views }).decision.action, "flip");
    });
  });

  it("with no standby answering on 443, says so before anything about views", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true, lastRunAt: minuteAgo }, { ...down(false), views: [] });
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
        views: [view("azure-eus2", STANDBY, false)],
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

describe("agreement with the hosts (components/netbird/failoverView.ts)", () => {
  it("reads the objects they write, and checks management the way they do", () => {
    assert.equal(PEER_VIEW_PREFIX, FAILOVER_VIEW_PREFIX);
    assert.equal(HEALTH_PATH, FAILOVER_VIEW_HEALTH_PATH);
  });
});

describe("signS3", () => {
  it("matches AWS's published GET Object example", () => {
    const headers = signS3({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      now: new Date("2013-05-24T00:00:00Z"),
      headers: { range: "bytes=0-9" },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    assert.equal(
      headers.authorization,
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    assert.equal(headers["x-amz-date"], "20130524T000000Z");
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
    assert.deepEqual(parseState({ failures: "0", viewStaleRuns: "2" }), { failures: 0, viewStaleRuns: 2 });
    assert.deepEqual(parseState({ failures: "0", viewStaleRuns: "junk" }), { failures: 0 });
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

// Follow-up to #3167: is failover armed while the primary is healthy? The
// standby's view is judged every run as a flip would weigh it.
describe("the standby's view, between outages", () => {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60000).toISOString();
  const read = (minutesAgo: number, targets: Record<string, unknown> = { [PRIMARY]: true }): ViewRead => ({ observer: "azure-cus", status: "ok", at: at(minutesAgo), targets });

  it("is fresh inside the flip rule's window, healthy or not: the view itself is what matters", () => {
    assert.deepEqual(judgeStandbyView("azure-cus", PRIMARY, [read(0.5)], now), { standby: "azure-cus", status: "fresh", ageSeconds: 30 });
    assert.equal(judgeStandbyView("azure-cus", PRIMARY, [read(0.5, { [PRIMARY]: false })], now).status, "fresh");
    assert.equal(judgeStandbyView("azure-cus", PRIMARY, [read(PEER_VIEW_FRESH_MINUTES)], now).status, "fresh");
  });

  it("is stale past the window, or stamped in the future", () => {
    assert.deepEqual(judgeStandbyView("azure-cus", PRIMARY, [read(PEER_VIEW_FRESH_MINUTES + 1)], now), { standby: "azure-cus", status: "stale", ageSeconds: (PEER_VIEW_FRESH_MINUTES + 1) * 60 });
    assert.equal(judgeStandbyView("azure-cus", PRIMARY, [read(-2)], now).status, "stale");
  });

  it("is missing when the host never published, and unreadable when Garage or the object is broken", () => {
    assert.deepEqual(judgeStandbyView("azure-cus", PRIMARY, [{ observer: "azure-cus", status: "missing" }], now), { standby: "azure-cus", status: "missing" });
    assert.deepEqual(judgeStandbyView("azure-cus", PRIMARY, [], now), { standby: "azure-cus", status: "missing" });
    assert.deepEqual(judgeStandbyView("azure-cus", PRIMARY, [{ observer: "azure-cus", status: "unreadable" }], now), { standby: "azure-cus", status: "unreadable" });
  });

  it("is silent when fresh but saying nothing about the holder's address, which could not arm a flip", () => {
    assert.equal(judgeStandbyView("azure-cus", PRIMARY, [read(0.5, { [STANDBY]: true })], now).status, "silent");
    assert.equal(judgeStandbyView("azure-cus", PRIMARY, [read(0.5, { [PRIMARY]: "yes" })], now).status, "silent");
  });

  it("judges only the standby's own view", () => {
    const other: ViewRead = { observer: "azure-eus2", status: "ok", at: at(0.5), targets: { [PRIMARY]: true } };
    assert.equal(judgeStandbyView("azure-cus", PRIMARY, [other], now).status, "missing");
  });

  it("feeds decide() the same entries it judged", () => {
    assert.deepEqual(peerViewsFrom([read(0.5, { [PRIMARY]: false, junk: "x" }), { observer: "azure-eus2", status: "unreadable" }]), [{ observer: "azure-cus", ip: PRIMARY, healthy: false, at: at(0.5) }]);
  });

  it("the standby is the host that would be promoted", () => {
    assert.equal(standbyOf(PRIMARY, hosts()), "azure-cus");
    assert.equal(standbyOf(STANDBY, hosts()), "azure-eus2");
    assert.equal(standbyOf(PRIMARY, [{ name: "azure-eus2", ip: PRIMARY, reachable: true }]), undefined);
    const three = [...hosts(false), { name: "azure-west", ip: "192.0.2.30", reachable: true }];
    assert.equal(standbyOf(PRIMARY, three), "azure-west");
    assert.equal(standbyOf(PRIMARY, hosts(false)), "azure-cus");
  });

  describe("counting runs in a row, so one late publish does not page", () => {
    const stale: StandbyView = { standby: "azure-cus", status: "stale", ageSeconds: 400 };
    const fresh: StandbyView = { standby: "azure-cus", status: "fresh", ageSeconds: 20 };

    it("alerts only on the Nth unusable run in a row", () => {
      let state: WatchdogState = { failures: 0, lastRunAt: minuteAgo };
      for (let i = 1; i <= VIEW_STALE_RUNS_TO_ALERT; i++) {
        const runs = nextViewStaleRuns(state, stale, now);
        assert.equal(runs, i);
        assert.equal(alertForStandbyView(stale, runs, "netbird.example.test", now) === undefined, i < VIEW_STALE_RUNS_TO_ALERT);
        state = { ...state, viewStaleRuns: runs };
      }
    });

    it("a flapping view, fresh every other run, never alerts", () => {
      let state: WatchdogState = { failures: 0, lastRunAt: minuteAgo };
      for (let i = 0; i < 10; i++) {
        const view = i % 2 === 0 ? stale : fresh;
        const runs = nextViewStaleRuns(state, view, now);
        assert.equal(alertForStandbyView(view, runs, "netbird.example.test", now), undefined);
        state = { ...state, viewStaleRuns: runs };
      }
    });

    it("a fresh view resets the count; a blind run keeps it; a gap starts it over", () => {
      assert.equal(nextViewStaleRuns({ failures: 0, lastRunAt: minuteAgo, viewStaleRuns: 2 }, fresh, now), 0);
      assert.equal(nextViewStaleRuns({ failures: 0, lastRunAt: minuteAgo, viewStaleRuns: 2 }, undefined, now), 2);
      const longAgo = new Date(now.getTime() - (CONSECUTIVE_RUN_GAP_MINUTES + 1) * 60000).toISOString();
      assert.equal(nextViewStaleRuns({ failures: 0, lastRunAt: longAgo, viewStaleRuns: 2 }, stale, now), 1);
    });

    it("warns, naming the standby, and lapses on its own", () => {
      const alerts = alertForStandbyView({ standby: "azure-cus", status: "missing" }, VIEW_STALE_RUNS_TO_ALERT, "netbird.example.test", now) as {
        labels: Record<string, string>;
        annotations: Record<string, string>;
        endsAt: string;
      }[];
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].labels.alertname, "NetbirdFailoverViewStale");
      assert.equal(alerts[0].labels.severity, "warning");
      assert.equal(alerts[0].labels.standby, "azure-cus");
      assert.match(alerts[0].annotations.summary, /azure-cus.*missing/);
      assert.ok(Date.parse(alerts[0].endsAt) > now.getTime());
      assert.equal(alertForStandbyView(fresh, 99, "netbird.example.test", now), undefined);
      assert.equal(alertForStandbyView(undefined, 99, "netbird.example.test", now), undefined);
    });
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
    S3_ENDPOINT: "https://garage.test",
    S3_BUCKET: "netbird-backups",
    AWS_ACCESS_KEY_ID: "GKexample",
    AWS_SECRET_ACCESS_KEY: "secret",
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
    /**
     * What each host published to Garage: its view object's body and how old
     * it is. Absent: 404. Default: azure-cus saw the primary down 30 s ago.
     */
    published?: Record<string, { targets: Record<string, boolean>; minutesAgo: number }>;
    /** false: Garage refuses connections. A number: Garage answers every view GET with that status. */
    garage?: boolean | number;
    /** Replace the view object's body with this raw text (broken JSON, say). */
    rawView?: string;
    /** Env names to leave unset. */
    unset?: string[];
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
      if (url.startsWith(`${ENV.S3_ENDPOINT}/`)) {
        if (opts.garage === false) throw new TypeError("fetch failed");
        if (typeof opts.garage === "number") return new Response("<Error/>", { status: opts.garage });
        const match = /^\/netbird-backups\/failover-view\/([a-z0-9-]+)\.json$/.exec(new URL(url).pathname);
        const published = opts.published ?? { "azure-cus": { targets: { [PRIMARY]: false }, minutesAgo: 0.5 } };
        const object = match ? published[match[1]] : undefined;
        if (method !== "GET" || !object) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
        return new Response(opts.rawView ?? JSON.stringify({ observer: match?.[1], targets: object.targets }), {
          status: 200,
          headers: { "Last-Modified": new Date(now.getTime() - object.minutesAgo * 60000).toUTCString() },
        });
      }
      if (url === `${ENV.ALERTMANAGER_URL}/api/v2/alerts`) {
        if (opts.alertmanager === false) throw new TypeError("fetch failed");
        return new Response("", { status: 200 });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };
    const io: WatchdogIo = {
      env: name => (opts.unset?.includes(name) ? undefined : ENV[name]),
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
    assert.deepEqual(w.written()?.data, {
      failures: "0",
      blindRuns: "0",
      lastFlipAt: "",
      everHealthy: "true",
      lastRun: now.toISOString(),
      lastDecision: "healthy",
      lastLease: PRIMARY,
      standby: "azure-cus",
      standbyView: "fresh",
      standbyViewAgeSeconds: "30",
      viewStaleRuns: "0",
    });
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
    // Management at the holder under the lease's name; the standby's TLS under its relay's.
    assert.deepEqual(w.probes, [`healthy ${PRIMARY} ${LEASE}`, `reachable ${STANDBY} relay-cus.example.test`]);
  });

  it("reads every other host's view from Garage, signed with the bucket key", async () => {
    const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1) });
    await run(w.io);
    const reads = w.calls.filter(c => c.url.startsWith(ENV.S3_ENDPOINT));
    assert.deepEqual(
      reads.map(c => c.url),
      [`${ENV.S3_ENDPOINT}/netbird-backups/failover-view/azure-cus.json`],
    );
    assert.match(String(reads[0].authorization), /^AWS4-HMAC-SHA256 Credential=GKexample\/20261103\/garage\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });

  it("does not flip when the standby still sees the primary answer: only Equestria's route is gone", async () => {
    const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1), published: { "azure-cus": { targets: { [PRIMARY]: true }, minutesAgo: 0.5 } } });
    assert.equal((await run(w.io)).action, "hold");
    assert.deepEqual(w.recordWrites(), []);
    assert.equal(w.alerts()[0].labels.alertname, "NetbirdFailoverBlocked");
    assert.equal(w.written()?.data.failures, String(WATCHDOG_FAILURES_TO_FLIP));
  });

  it("does not flip when the standby's view is missing, stale, or Garage is down", async () => {
    const cases: World[] = [{ published: {} }, { published: { "azure-cus": { targets: { [PRIMARY]: false }, minutesAgo: PEER_VIEW_FRESH_MINUTES + 1 } } }, { garage: false }];
    for (const opts of cases) {
      const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1), ...opts });
      assert.equal((await run(w.io)).action, "hold");
      assert.deepEqual(w.recordWrites(), []);
      assert.equal(w.alerts()[0].labels.alertname, "NetbirdFailoverBlocked");
    }
  });

  it("flips a dead primary, one that answers nothing at all, once the standby confirms it", async () => {
    const w = world({ state: streak(WATCHDOG_FAILURES_TO_FLIP - 1), reachable: { [PRIMARY]: false, [STANDBY]: true } });
    assert.equal((await run(w.io)).action, "flip");
  });

  describe("whether failover is armed, checked on every run", () => {
    const healthyRun = (opts: World = {}) => world({ healthy: true, ...opts, state: { ...streak(0), ...opts.state } });

    it("reads the standby's view while management answers, and records how old it is", async () => {
      const w = healthyRun({ published: { "azure-cus": { targets: { [PRIMARY]: true }, minutesAgo: 1 } } });
      assert.deepEqual(await run(w.io), { action: "healthy" });
      assert.deepEqual(
        w.calls.filter(c => c.url.startsWith(ENV.S3_ENDPOINT)).map(c => `${c.method} ${c.url}`),
        [`GET ${ENV.S3_ENDPOINT}/netbird-backups/failover-view/azure-cus.json`],
      );
      assert.equal(w.written()?.data.standbyView, "fresh");
      assert.equal(w.written()?.data.standbyViewAgeSeconds, "60");
      assert.deepEqual(w.alerts(), []);
    });

    const unusable: [string, World, string][] = [
      ["missing", { published: {} }, "missing"],
      ["stale", { published: { "azure-cus": { targets: { [PRIMARY]: true }, minutesAgo: PEER_VIEW_FRESH_MINUTES + 2 } } }, "stale"],
      ["not JSON", { rawView: "{not json" }, "unreadable"],
      ["refused by Garage (403)", { garage: 403 }, "unreadable"],
      ["unreachable (Garage down)", { garage: false }, "unreadable"],
    ];
    for (const [what, opts, status] of unusable) {
      it(`a view that is ${what} never touches the health check or the record, and warns only after ${VIEW_STALE_RUNS_TO_ALERT} runs in a row`, async () => {
        const first = healthyRun(opts);
        assert.deepEqual(await run(first.io), { action: "healthy" });
        assert.deepEqual(first.recordWrites(), []);
        assert.deepEqual(first.alerts(), []);
        assert.equal(first.written()?.data.standbyView, status);
        assert.equal(first.written()?.data.viewStaleRuns, "1");
        assert.equal(first.written()?.data.failures, "0");

        const nth = healthyRun({ ...opts, state: { viewStaleRuns: String(VIEW_STALE_RUNS_TO_ALERT - 1) } });
        assert.deepEqual(await run(nth.io), { action: "healthy" });
        assert.deepEqual(nth.recordWrites(), []);
        assert.deepEqual(
          nth.alerts().map(a => [a.labels.alertname, a.labels.standby]),
          [["NetbirdFailoverViewStale", "azure-cus"]],
        );
      });
    }

    it("a fresh view clears the count, so the alert lapses", async () => {
      const w = healthyRun({ state: { viewStaleRuns: "7" } });
      await run(w.io);
      assert.equal(w.written()?.data.viewStaleRuns, "0");
      assert.deepEqual(w.alerts(), []);
    });

    it("missing Garage settings do not fail the run: the view is unreadable, the health check goes on", async () => {
      const w = healthyRun({ unset: ["S3_ENDPOINT", "AWS_SECRET_ACCESS_KEY"] });
      assert.deepEqual(await run(w.io), { action: "healthy" });
      assert.equal(w.written()?.data.standbyView, "unreadable");
    });

    it("an unreadable view on the Nth failure holds, never flips, and sends both alerts", async () => {
      const w = world({ state: { ...streak(WATCHDOG_FAILURES_TO_FLIP - 1), viewStaleRuns: String(VIEW_STALE_RUNS_TO_ALERT - 1) }, garage: 500 });
      assert.equal((await run(w.io)).action, "hold");
      assert.deepEqual(w.recordWrites(), []);
      assert.deepEqual(
        w.alerts().map(a => a.labels.alertname),
        ["NetbirdFailoverBlocked", "NetbirdFailoverViewStale"],
      );
    });
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
    // Blind: there is no holder to judge a view against, so none is read.
    assert.deepEqual(
      w.calls.filter(c => c.url.startsWith(ENV.S3_ENDPOINT)),
      [],
    );
    assert.equal(w.written()?.data.standbyView, "");
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
