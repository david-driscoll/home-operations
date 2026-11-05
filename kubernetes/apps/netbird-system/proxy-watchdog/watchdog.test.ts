/**
 * node --test kubernetes/apps/netbird-system/proxy-watchdog/watchdog.test.ts
 *
 * The nbidp proxy watchdog's policy: restart only after enough offline runs in
 * a row, only while management answers, and never mid-rollout or twice within
 * the cooldown.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertFor, decide, type LiveCluster, type LiveDeployment, OFFLINE_RUNS_TO_RESTART, parseState, RESTART_COOLDOWN_MINUTES, rollingOut } from "./watchdog.ts";

const CLUSTER = "ek.example.test";
const now = new Date("2026-11-05T03:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();
const settled: LiveDeployment = { metadata: { generation: 7 }, spec: { replicas: 2 }, status: { observedGeneration: 7, replicas: 2, updatedReplicas: 2 } };
const offline: LiveCluster[] = [{ address: CLUSTER, online: false, connected_proxies: 0 }];
const online: LiveCluster[] = [{ address: CLUSTER, online: true, connected_proxies: 2 }];
const obs = (clusters: LiveCluster[] | null, deployment: LiveDeployment = settled) => ({ clusters, deployment, now });

describe("decide", () => {
  it("resets the count while the cluster is online", () => {
    const { decision, next } = decide({ offline: 2 }, obs(online), CLUSTER);
    assert.deepEqual(decision, { action: "healthy" });
    assert.equal(next.offline, 0);
  });

  it("holds, count unchanged, when the management API does not answer", () => {
    const { decision, next } = decide({ offline: OFFLINE_RUNS_TO_RESTART - 1 }, obs(null), CLUSTER);
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /did not answer/);
    assert.equal(next.offline, OFFLINE_RUNS_TO_RESTART - 1);
  });

  it("counts offline runs up to the threshold, then restarts", () => {
    let state = { offline: 0 };
    for (let i = 1; i < OFFLINE_RUNS_TO_RESTART; i++) {
      const { decision, next } = decide(state, obs(offline), CLUSTER);
      assert.deepEqual(decision, { action: "count", offline: i });
      state = next;
    }
    const { decision, next } = decide(state, obs(offline), CLUSTER);
    assert.deepEqual(decision, { action: "restart", offline: OFFLINE_RUNS_TO_RESTART, connectedProxies: 0 });
    assert.deepEqual(next, { offline: 0, lastRestartAt: now.toISOString() });
  });

  it("treats a cluster management does not list as offline", () => {
    const { decision } = decide({ offline: OFFLINE_RUNS_TO_RESTART - 1 }, obs([{ address: "other.example.test", online: true }]), CLUSTER);
    assert.deepEqual(decision, { action: "restart", offline: OFFLINE_RUNS_TO_RESTART, connectedProxies: null });
  });

  it("does not restart within the cooldown, but keeps counting", () => {
    const { decision, next } = decide({ offline: OFFLINE_RUNS_TO_RESTART, lastRestartAt: ago(RESTART_COOLDOWN_MINUTES - 1) }, obs(offline), CLUSTER);
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /cooldown/);
    assert.equal(next.offline, OFFLINE_RUNS_TO_RESTART + 1);
    assert.equal(next.lastRestartAt, ago(RESTART_COOLDOWN_MINUTES - 1));
  });

  it("restarts again once the cooldown has passed", () => {
    const { decision } = decide({ offline: OFFLINE_RUNS_TO_RESTART, lastRestartAt: ago(RESTART_COOLDOWN_MINUTES + 1) }, obs(offline), CLUSTER);
    assert.equal(decision.action, "restart");
  });

  it("holds and resets the count while the Deployment rolls out", () => {
    const rolling: LiveDeployment = { metadata: { generation: 8 }, spec: { replicas: 2 }, status: { observedGeneration: 8, replicas: 3, updatedReplicas: 1 } };
    const { decision, next } = decide({ offline: OFFLINE_RUNS_TO_RESTART + 5 }, obs(offline, rolling), CLUSTER);
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /rolling out/);
    assert.equal(next.offline, 0);
  });

  it("never restarts a Deployment scaled to zero", () => {
    const zero: LiveDeployment = { metadata: { generation: 9 }, spec: { replicas: 0 }, status: { observedGeneration: 9 } };
    const { decision, next } = decide({ offline: OFFLINE_RUNS_TO_RESTART + 5 }, obs(offline, zero), CLUSTER);
    assert.equal(decision.action, "hold");
    assert.match((decision as { reason: string }).reason, /scaled to zero/);
    assert.equal(next.offline, 0);
  });
});

describe("rollingOut", () => {
  it("is false for a settled Deployment", () => assert.equal(rollingOut(settled), false));
  it("is true for a spec not yet observed", () => assert.equal(rollingOut({ ...settled, metadata: { generation: 8 } }), true));
  it("is true while old pods remain", () => assert.equal(rollingOut({ ...settled, status: { observedGeneration: 7, replicas: 3, updatedReplicas: 2 } }), true));
  it("is true while too few pods are updated", () => assert.equal(rollingOut({ ...settled, status: { observedGeneration: 7, replicas: 2, updatedReplicas: 1 } }), true));
});

describe("parseState", () => {
  it("reads a fresh ConfigMap as zero", () => assert.deepEqual(parseState(undefined), { offline: 0 }));
  it("ignores garbage and an empty restart time", () => assert.deepEqual(parseState({ offline: "x", lastRestartAt: "" }), { offline: 0 }));
  it("round-trips what main() writes", () => assert.deepEqual(parseState({ offline: "2", lastRestartAt: ago(3) }), { offline: 2, lastRestartAt: ago(3) }));
});

describe("alertFor", () => {
  it("pages only for a restart", () => {
    assert.equal(alertFor({ action: "healthy" }, CLUSTER, "nbidp-proxy", now), undefined);
    assert.equal(alertFor({ action: "hold", reason: "x", offline: 9 }, CLUSTER, "nbidp-proxy", now), undefined);
    const [alert] = alertFor({ action: "restart", offline: 3, connectedProxies: 0 }, CLUSTER, "nbidp-proxy", now) as { labels: Record<string, string>; annotations: { description: string } }[];
    assert.equal(alert.labels.alertname, "NetbirdProxyRestarted");
    assert.equal(alert.labels.cluster, CLUSTER);
    assert.match(alert.annotations.description, /0 connected proxies/);
  });
});
