/**
 * node --test kubernetes/apps/netbird-system/health/health.test.ts
 *
 * The NetBird health policy (D47): which management answers page, and which
 * absences are tolerated.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALERT_TTL_MINUTES, evaluate, type HealthConfig, type LivePeer, minutesSince, PEER_DISCONNECTED_MINUTES, parseList } from "./health.ts";

const now = new Date("2026-11-04T20:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();
const config: HealthConfig = { peerGroups: ["gateways", "dns-servers"], customDomains: ["nb.example.test", "nbidp.example.test"], proxyCluster: "nbidp.example.test" };
const groups = [
  { id: "g1", name: "gateways" },
  { id: "g2", name: "dns-servers" },
];
const peer = (name: string, connected: boolean, lastSeenMinutesAgo: number, ...groupNames: string[]): LivePeer => ({
  id: name,
  name,
  connected,
  last_seen: ago(lastSeenMinutesAgo),
  groups: groupNames.map(g => ({ id: g, name: g })),
});
const names = (alerts: { labels: Record<string, string> }[]) => alerts.map(a => `${a.labels.alertname}:${a.labels.peer ?? a.labels.group ?? a.labels.domain ?? a.labels.cluster}`);

describe("parseList", () => {
  it("splits, trims and drops empties", () => {
    assert.deepEqual(parseList(" a, b ,,c "), ["a", "b", "c"]);
    assert.deepEqual(parseList(undefined), []);
  });
});

describe("minutesSince", () => {
  it("is Infinity for a missing or unreadable time", () => {
    assert.equal(minutesSince(undefined, now), Number.POSITIVE_INFINITY);
    assert.equal(minutesSince("not a date", now), Number.POSITIVE_INFINITY);
    assert.equal(minutesSince(ago(5), now), 5);
  });
});

describe("evaluate: peers", () => {
  it("pages a watched peer down past the threshold, not one just dropped or connected", () => {
    const peers = [peer("gw-celestia", false, PEER_DISCONNECTED_MINUTES + 1, "gateways"), peer("gw-luna", false, 2, "gateways"), peer("gw-skystar", true, 600, "gateways")];
    const { alerts } = evaluate(config, { peers, groups, now });
    assert.deepEqual(names(alerts), ["NetbirdPeerDisconnected:gw-celestia"]);
    assert.equal(alerts[0].labels.severity, "warning");
  });

  it("ignores peers outside the watched groups", () => {
    const { alerts } = evaluate(config, { peers: [peer("laptop", false, 999, "family")], groups, now });
    assert.deepEqual(alerts, []);
  });

  it("names every watched group of a peer in one alert", () => {
    const { alerts } = evaluate(config, { peers: [peer("dns-celestia", false, 60, "gateways", "dns-servers"), peer("gw-2", true, 0, "gateways"), peer("dns-2", true, 0, "dns-servers")], groups, now });
    assert.deepEqual(names(alerts), ["NetbirdPeerDisconnected:dns-celestia"]);
    assert.equal(alerts[0].labels.groups, "gateways,dns-servers");
  });

  it("adds a critical group alert when every peer in a group is down", () => {
    const peers = [peer("gw-a", false, 60, "gateways"), peer("gw-b", false, 30, "gateways")];
    const { alerts } = evaluate(config, { peers, groups, now });
    assert.deepEqual(names(alerts), ["NetbirdPeerDisconnected:gw-a", "NetbirdPeerDisconnected:gw-b", "NetbirdPeerGroupDown:gateways"]);
    assert.equal(alerts[2].labels.severity, "critical");
  });

  it("treats a down peer with no last_seen as down", () => {
    const { alerts } = evaluate(config, { peers: [{ id: "x", name: "x", connected: false, groups: [{ id: "g1", name: "gateways" }] }], groups, now });
    assert.ok(names(alerts).includes("NetbirdPeerDisconnected:x"));
  });

  it("skips a watched group that does not exist yet (dns-servers before #3055)", () => {
    const { alerts, skipped } = evaluate(config, { peers: [peer("dns-a", false, 60, "dns-servers")], groups: [groups[0]], now });
    assert.deepEqual(alerts, []);
    assert.deepEqual(skipped, ["group dns-servers does not exist"]);
  });

  it("skips the peer checks when either read failed", () => {
    assert.deepEqual(evaluate(config, { peers: [peer("gw", false, 60, "gateways")], now }).alerts, []);
  });
});

describe("evaluate: domains and the proxy cluster", () => {
  const cluster = [{ address: "nbidp.example.test", online: true }];

  it("warns on an unvalidated custom domain and skips an absent one", () => {
    const { alerts, skipped } = evaluate(config, { domains: [{ domain: "nb.example.test", validated: false, type: "custom" }], clusters: cluster, now });
    assert.deepEqual(names(alerts), ["NetbirdCustomDomainUnvalidated:nb.example.test"]);
    assert.equal(alerts[0].labels.severity, "warning");
    assert.deepEqual(skipped, ["domain nbidp.example.test is not registered"]);
  });

  it("is quiet when the domains are validated and the cluster online", () => {
    const domains = config.customDomains.map(domain => ({ domain, validated: true }));
    assert.deepEqual(evaluate(config, { domains, clusters: cluster, now }).alerts, []);
  });

  it("pages when the cluster is offline or missing", () => {
    assert.deepEqual(names(evaluate(config, { clusters: [{ address: "nbidp.example.test", online: false }], now }).alerts), ["NetbirdProxyClusterOffline:nbidp.example.test"]);
    assert.deepEqual(names(evaluate(config, { clusters: [], now }).alerts), ["NetbirdProxyClusterOffline:nbidp.example.test"]);
  });

  it("skips the cluster check when the endpoint was unavailable", () => {
    assert.deepEqual(evaluate(config, { now }).alerts, []);
  });
});

describe("evaluate: the alert shape", () => {
  it("lapses ALERT_TTL_MINUTES after the run unless re-posted", () => {
    const [alert] = evaluate(config, { clusters: [], now }).alerts;
    assert.equal(alert.startsAt, now.toISOString());
    assert.equal(Date.parse(alert.endsAt) - now.getTime(), ALERT_TTL_MINUTES * 60000);
    assert.equal(alert.labels.namespace, "netbird-system");
    assert.equal(alert.labels.job, "netbird-health");
  });
});
