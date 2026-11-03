/**
 * node --test kubernetes/apps/netbird-system/failover-watchdog/watchdog.test.ts
 *
 * The watchdog's policy (#3001): flip only after enough failures in a row,
 * and only when Cloudflare and a standby both answer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertFor, decide, FLIP_COOLDOWN_MINUTES, parseCandidates, parseState, WATCHDOG_FAILURES_TO_FLIP } from "./watchdog.ts";

const PRIMARY = "203.0.113.10";
const STANDBY = "198.51.100.20";
const now = new Date("2026-11-03T20:00:00Z");
const hosts = (standbyReachable = true) => [
  { name: "azure-eus2", ip: PRIMARY, reachable: false },
  { name: "azure-cus", ip: STANDBY, reachable: standbyReachable },
];
const down = (standbyReachable = true) => ({ leaseIp: PRIMARY, activeHealthy: false, candidates: hosts(standbyReachable), now });

describe("decide", () => {
  it("resets the count while management answers, and remembers it did", () => {
    const { decision, next } = decide({ failures: 3 }, { leaseIp: PRIMARY, activeHealthy: true, candidates: hosts(), now });
    assert.deepEqual(decision, { action: "healthy" });
    assert.equal(next.failures, 0);
    assert.equal(next.everHealthy, true);
  });

  it("never fails over from a management that has never answered", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP }, down());
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /never answered/);
  });

  it("counts failures up to the threshold without flipping", () => {
    let state = { failures: 0 };
    for (let i = 1; i < WATCHDOG_FAILURES_TO_FLIP; i++) {
      const { decision, next } = decide(state, down());
      assert.deepEqual(decision, { action: "count", failures: i });
      state = next;
    }
  });

  it("flips to the reachable standby on the Nth failure in a row, and starts over", () => {
    const { decision, next } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1, everHealthy: true }, down());
    assert.deepEqual(decision, { action: "flip", from: PRIMARY, to: { name: "azure-cus", ip: STANDBY } });
    assert.deepEqual(next, { failures: 0, lastFlipAt: now.toISOString(), everHealthy: true });
  });

  it("a single healthy run in between restarts the count", () => {
    const one = decide({ failures: WATCHDOG_FAILURES_TO_FLIP - 1 }, { leaseIp: PRIMARY, activeHealthy: true, candidates: hosts(), now }).next;
    assert.equal(decide(one, down()).decision.action, "count");
  });

  // "Cutting the watchdog's own internet does not trigger a flip."
  it("holds, and keeps its count, when Cloudflare cannot be read", () => {
    const state = { failures: WATCHDOG_FAILURES_TO_FLIP + 2 };
    const { decision, next } = decide(state, { leaseIp: null, activeHealthy: false, candidates: [], now });
    assert.equal(decision.action, "hold");
    assert.deepEqual(next, state);
  });

  it("holds when no standby answers on 443, which is what a home-internet outage looks like", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true }, down(false));
    assert.deepEqual(decision, { action: "hold", reason: "no standby answers on 443", failures: WATCHDOG_FAILURES_TO_FLIP + 1 });
  });

  it("holds when there is no other host at all", () => {
    const { decision } = decide({ failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true }, { ...down(), candidates: [{ name: "azure-eus2", ip: PRIMARY, reachable: false }] });
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /no standby/);
  });

  it("never flips again inside the cooldown, and may after it", () => {
    const recent = new Date(now.getTime() - (FLIP_COOLDOWN_MINUTES - 1) * 60000).toISOString();
    assert.equal(decide({ failures: WATCHDOG_FAILURES_TO_FLIP, lastFlipAt: recent, everHealthy: true }, down()).decision.action, "hold");
    const old = new Date(now.getTime() - (FLIP_COOLDOWN_MINUTES + 1) * 60000).toISOString();
    assert.equal(decide({ failures: WATCHDOG_FAILURES_TO_FLIP, lastFlipAt: old, everHealthy: true }, down()).decision.action, "flip");
  });

  it("after a flip, watches the new holder: the lease address is what it probes", () => {
    // The standby holds the lease now and is down; the old primary is back.
    const { decision } = decide(
      { failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true },
      {
        leaseIp: STANDBY,
        activeHealthy: false,
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
      { failures: WATCHDOG_FAILURES_TO_FLIP, everHealthy: true },
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
    assert.equal(alertFor({ action: "hold", reason: "Cloudflare did not answer", failures: 1 }, "netbird.example.test", now), undefined);
    assert.equal(alertFor({ action: "healthy" }, "netbird.example.test", now), undefined);
  });
});
