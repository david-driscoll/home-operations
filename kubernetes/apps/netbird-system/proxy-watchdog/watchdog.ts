// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The nbidp proxy watchdog: restarts the NetBird private reverse proxy
 * (Deployment nbidp-proxy, ../nbidp) when management has listed its cluster
 * (ek.<root domain>) offline for OFFLINE_RUNS_TO_RESTART runs in a row.
 *
 * Why it exists. In netbird v0.82.0 the proxy's own mapping stream to
 * management (proxy/server.go newManagementMappingWorker -> trySyncMappings ->
 * handleSyncMappingsStream) has no receive watchdog. When netbird-server
 * restarts behind the edge Traefik, that stream can be left open and silent:
 * stream.Recv() never returns, so the retry loop never runs, and the proxy's
 * own health checker keeps management_connected=true, so /healthz/ready stays
 * 200 and no probe can see it. Management, meanwhile, has no such proxy
 * connected, and every private service (nbidp login, the app. services) is
 * down until the pods restart. Signal's client already guards against exactly
 * this ("signal receive stream stalled", shared/signal/client/grpc.go); the
 * proxy's mapping stream does not. Seen twice on 2026-11-05.
 *
 * Its policy, which decide() is:
 *   - management must answer: if the API is unreadable, management itself is
 *     down, and a restart cannot help (the count stands);
 *   - OFFLINE_RUNS_TO_RESTART runs in a row must see the cluster offline (or
 *     not listed), so the proxy's own 10 s retry gets every chance first;
 *   - not while the Deployment is rolling out or scaled to zero (the count
 *     resets: new pods register on their own);
 *   - not within RESTART_COOLDOWN_MINUTES of its last restart.
 * A restart is a rollout restart (the restartedAt pod-template annotation),
 * so the two replicas roll one at a time. Every restart posts an alert.
 *
 * Apart from netbird-health on purpose: that job only reads, holds no
 * Kubernetes token, and a bug in a check there must never restart anything.
 *
 * Node runs this file by stripping types. The pure part (decide, parseState,
 * alertFor) is what watchdog.test.ts covers; main() is the I/O around it.
 */
import { readFileSync } from "node:fs";

/** Three runs at one a minute: two to three minutes offline, far past the proxy's own reconnect. */
export const OFFLINE_RUNS_TO_RESTART = 3;
/** Long enough for a rollout to finish and register; short enough to retry within the hour. */
export const RESTART_COOLDOWN_MINUTES = 15;
/** How long a restart alert stays firing in Alertmanager. */
export const RESTART_ALERT_HOURS = 1;

export interface WatchdogState {
  offline: number;
  lastRestartAt?: string;
}

/** GET /api/reverse-proxies/clusters, the fields used here. */
export interface LiveCluster {
  address: string;
  online: boolean;
  connected_proxies?: number;
}

/** The Deployment, the fields used here. */
export interface LiveDeployment {
  metadata: { generation?: number };
  spec: { replicas?: number };
  status?: { observedGeneration?: number; replicas?: number; updatedReplicas?: number };
}

export interface Observation {
  /** The clusters management lists, or null when the API could not be read. */
  clusters: LiveCluster[] | null;
  deployment: LiveDeployment;
  now: Date;
}

export type Decision = { action: "healthy" } | { action: "count"; offline: number } | { action: "hold"; reason: string; offline: number } | { action: "restart"; offline: number; connectedProxies: number | null };

/** True while the Deployment is mid-rollout: a spec it has not acted on, or old pods still running. */
export function rollingOut(deployment: LiveDeployment): boolean {
  const want = deployment.spec.replicas ?? 1;
  const status = deployment.status ?? {};
  if ((status.observedGeneration ?? 0) < (deployment.metadata.generation ?? 0)) return true;
  if ((status.updatedReplicas ?? 0) < want) return true;
  return (status.replicas ?? 0) > want;
}

/** The whole policy. Pure: the caller does the reads and acts on the result. */
export function decide(state: WatchdogState, obs: Observation, cluster: string, runsToRestart: number = OFFLINE_RUNS_TO_RESTART): { decision: Decision; next: WatchdogState } {
  if (obs.clusters === null) {
    return { decision: { action: "hold", reason: "the management API did not answer", offline: state.offline }, next: state };
  }
  const entry = obs.clusters.find(c => c.address === cluster);
  if (entry?.online) return { decision: { action: "healthy" }, next: { ...state, offline: 0 } };

  if ((obs.deployment.spec.replicas ?? 1) === 0) {
    return { decision: { action: "hold", reason: "the Deployment is scaled to zero", offline: 0 }, next: { ...state, offline: 0 } };
  }
  if (rollingOut(obs.deployment)) {
    return { decision: { action: "hold", reason: "the Deployment is rolling out", offline: 0 }, next: { ...state, offline: 0 } };
  }

  const offline = state.offline + 1;
  const next = { ...state, offline };
  if (offline < runsToRestart) return { decision: { action: "count", offline }, next };

  if (state.lastRestartAt) {
    const since = (obs.now.getTime() - Date.parse(state.lastRestartAt)) / 60000;
    if (since < RESTART_COOLDOWN_MINUTES) {
      return { decision: { action: "hold", reason: "the last restart was " + Math.floor(since) + " min ago (cooldown " + RESTART_COOLDOWN_MINUTES + " min)", offline }, next };
    }
  }
  return {
    decision: { action: "restart", offline, connectedProxies: entry?.connected_proxies ?? null },
    next: { offline: 0, lastRestartAt: obs.now.toISOString() },
  };
}

export function parseState(data: Record<string, string> | undefined): WatchdogState {
  const offline = Number.parseInt(data?.offline ?? "0", 10);
  return {
    offline: Number.isFinite(offline) && offline >= 0 ? offline : 0,
    ...(data?.lastRestartAt ? { lastRestartAt: data.lastRestartAt } : {}),
  };
}

/** The Alertmanager v2 payload for a restart, or undefined. */
export function alertFor(decision: Decision, cluster: string, deployment: string, now: Date): object[] | undefined {
  if (decision.action !== "restart") return undefined;
  return [
    {
      labels: { namespace: "netbird-system", job: "netbird-proxy-watchdog", alertname: "NetbirdProxyRestarted", severity: "warning", cluster },
      annotations: {
        summary: "Restarted the NetBird proxy: " + cluster + " was offline",
        description:
          "Management listed the proxy cluster " +
          cluster +
          " offline (" +
          (decision.connectedProxies === null ? "not listed" : decision.connectedProxies + " connected proxies") +
          ") for " +
          decision.offline +
          " checks in a row while its API answered, so the watchdog rollout-restarted Deployment " +
          deployment +
          ". Usually the proxy's mapping stream stalled across a netbird-server restart. If NetbirdProxyClusterOffline keeps firing, read the proxy logs: a restart did not help.",
      },
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + RESTART_ALERT_HOURS * 3600000).toISOString(),
    },
  ];
}

// ── I/O ──────────────────────────────────────────────────────────────────

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + " is not set");
  return value;
}

async function clusters(): Promise<LiveCluster[] | null> {
  try {
    const response = await fetch(env("NETBIRD_URL").replace(/\/+$/, "") + "/api/reverse-proxies/clusters", {
      headers: { Authorization: "Token " + env("NB_API_KEY"), Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error("not a list");
    return body as LiveCluster[];
  } catch (error) {
    console.log(JSON.stringify({ msg: "management API unreadable", error: String(error) }));
    return null;
  }
}

async function kube(method: "GET" | "PATCH", path: string, body?: unknown): Promise<unknown> {
  const token = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8");
  const response = await fetch("https://kubernetes.default.svc" + path, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": method === "PATCH" ? "application/merge-patch+json" : "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Kubernetes " + method + " " + path + ": HTTP " + response.status);
  return response.json();
}

async function main(): Promise<void> {
  const now = new Date();
  const cluster = env("NETBIRD_PROXY_CLUSTER");
  const namespace = env("POD_NAMESPACE");
  const name = env("PROXY_DEPLOYMENT");
  const stateUrl = "/api/v1/namespaces/" + namespace + "/configmaps/" + env("STATE_CONFIGMAP");
  const deploymentUrl = "/apis/apps/v1/namespaces/" + namespace + "/deployments/" + name;

  const state = parseState(((await kube("GET", stateUrl)) as { data?: Record<string, string> }).data);
  const deployment = (await kube("GET", deploymentUrl)) as LiveDeployment;
  const { decision, next } = decide(state, { clusters: await clusters(), deployment, now }, cluster);

  if (decision.action === "restart") {
    // What `kubectl rollout restart` writes.
    await kube("PATCH", deploymentUrl, { spec: { template: { metadata: { annotations: { "kubectl.kubernetes.io/restartedAt": now.toISOString() } } } } });
  }
  const alerts = alertFor(decision, cluster, name, now);
  if (alerts) {
    // A failed alert must not block the state write below, or a second restart follows.
    try {
      const response = await fetch(env("ALERTMANAGER_URL") + "/api/v2/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alerts), signal: AbortSignal.timeout(10000) });
      if (!response.ok) console.log(JSON.stringify({ msg: "Alertmanager refused the alert", status: response.status }));
    } catch (error) {
      console.log(JSON.stringify({ msg: "Alertmanager unreachable", error: String(error) }));
    }
  }
  await kube("PATCH", stateUrl, {
    data: { offline: String(next.offline), lastRestartAt: next.lastRestartAt ?? "", lastRun: now.toISOString(), lastDecision: decision.action },
  });
  console.log(JSON.stringify({ msg: "netbird-proxy-watchdog", cluster, decision }));
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
