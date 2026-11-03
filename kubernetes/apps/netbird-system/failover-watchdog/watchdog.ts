// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The NetBird failover watchdog (#3001, docs/plans/netbird-mirror.md §E).
 *
 * Runs every minute as a CronJob in Equestria. It reads the lease record
 * (netbird.<root domain>) from Cloudflare, probes management at the address
 * the record points to, and after WATCHDOG_FAILURES_TO_FLIP failed runs in a
 * row repoints the record at a standby. It does that only if:
 *   - Cloudflare answered: no internet, no Cloudflare, no flip;
 *   - a standby answers TLS on 443: so a home-internet outage, where nothing
 *     outside answers, never flips;
 *   - no flip happened in the last FLIP_COOLDOWN_MINUTES: no ping-pong;
 *   - management has answered at least once: nothing fails over from a
 *     server that never came up.
 * Each host's fence (components/netbird/fence.ts) then does the rest: the old
 * primary stops management, the standby restores and starts.
 *
 * The consecutive-failure count lives in a ConfigMap, because each run is a
 * new pod. Every flip, and every run that would flip but may not, posts an
 * alert to Alertmanager.
 *
 * Node runs this file by stripping types. The pure part (decide, parseCandidates)
 * is what watchdog.test.ts covers; main() is the I/O around it.
 */
import { readFileSync } from "node:fs";
import * as https from "node:https";
import * as tls from "node:tls";

/** Five minutes at one run a minute: longer than an unattended-upgrades reboot. */
export const WATCHDOG_FAILURES_TO_FLIP = 5;
export const FLIP_COOLDOWN_MINUTES = 60;
/** How long a flip alert stays firing in Alertmanager. */
export const FLIP_ALERT_HOURS = 6;
/** Management's embedded IdP answers this only while netbird-server runs. */
export const HEALTH_PATH = "/oauth2/.well-known/openid-configuration";

export interface WatchdogState {
  failures: number;
  lastFlipAt?: string;
  /**
   * Whether management has ever answered since this state began. Until it
   * has, there is nothing to fail over from: a server still being set up
   * would otherwise be "failed over" to a standby with no snapshot to restore,
   * which would start an empty management.
   */
  everHealthy?: boolean;
}

export interface Candidate {
  /** The host's id, e.g. azure-cus. */
  name: string;
  /** The DNS name its address is read from: its relay record. */
  record: string;
}

export interface Observation {
  /** The lease's current address, or null when Cloudflare could not be read. */
  leaseIp: string | null;
  /** Whether management answered at leaseIp. Unused when leaseIp is null. */
  activeHealthy: boolean;
  /** Every candidate host with its address and whether it answers TLS on 443. */
  candidates: { name: string; ip: string; reachable: boolean }[];
  now: Date;
}

export type Decision = { action: "healthy" } | { action: "count"; failures: number } | { action: "flip"; from: string; to: { name: string; ip: string } } | { action: "hold"; reason: string; failures: number };

/** The whole policy. Pure: the caller does the probing and acts on the result. */
export function decide(state: WatchdogState, obs: Observation, failuresToFlip: number = WATCHDOG_FAILURES_TO_FLIP): { decision: Decision; next: WatchdogState } {
  if (obs.leaseIp === null) {
    // Cannot even read the record: the watchdog's own internet, or Cloudflare.
    // The count stands; nothing is learned about the primary.
    return { decision: { action: "hold", reason: "Cloudflare did not answer", failures: state.failures }, next: state };
  }
  if (obs.activeHealthy) return { decision: { action: "healthy" }, next: { ...state, failures: 0, everHealthy: true } };

  const failures = state.failures + 1;
  const next = { ...state, failures };
  if (failures < failuresToFlip) return { decision: { action: "count", failures }, next };
  if (!state.everHealthy) return { decision: { action: "hold", reason: "management has never answered, so there is nothing to fail over from", failures }, next };

  if (state.lastFlipAt) {
    const since = (obs.now.getTime() - Date.parse(state.lastFlipAt)) / 60000;
    if (since < FLIP_COOLDOWN_MINUTES) {
      return { decision: { action: "hold", reason: "the last flip was " + Math.floor(since) + " min ago (cooldown " + FLIP_COOLDOWN_MINUTES + " min)", failures }, next };
    }
  }
  const target = obs.candidates.find(c => c.ip !== obs.leaseIp && c.reachable);
  if (!target) {
    const reason = obs.candidates.some(c => c.ip !== obs.leaseIp) ? "no standby answers on 443" : "there is no standby";
    return { decision: { action: "hold", reason, failures }, next };
  }
  return {
    decision: { action: "flip", from: obs.leaseIp, to: { name: target.name, ip: target.ip } },
    next: { failures: 0, lastFlipAt: obs.now.toISOString(), everHealthy: true },
  };
}

/** `azure-eus2=relay-eus2.example.com,azure-cus=relay-cus.example.com`, in preference order. */
export function parseCandidates(value: string): Candidate[] {
  const candidates = value
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(pair => {
      const [name, record] = pair.split("=");
      if (!name || !record || !/^[a-z0-9.-]+$/.test(record)) throw new Error("NETBIRD_CANDIDATES entry '" + pair + "' is not <name>=<dns name>");
      return { name, record };
    });
  if (candidates.length === 0) throw new Error("NETBIRD_CANDIDATES is empty");
  return candidates;
}

export function parseState(data: Record<string, string> | undefined): WatchdogState {
  const failures = Number.parseInt(data?.failures ?? "0", 10);
  return {
    failures: Number.isFinite(failures) && failures >= 0 ? failures : 0,
    ...(data?.lastFlipAt ? { lastFlipAt: data.lastFlipAt } : {}),
    ...(data?.everHealthy === "true" ? { everHealthy: true } : {}),
  };
}

/** The Alertmanager v2 payload for a decision worth a page, or undefined. */
export function alertFor(decision: Decision, lease: string, now: Date): object[] | undefined {
  const at = (hours: number) => new Date(now.getTime() + hours * 3600000).toISOString();
  const labels = { namespace: "netbird-system", job: "netbird-failover-watchdog", lease };
  if (decision.action === "flip") {
    return [
      {
        labels: { ...labels, alertname: "NetbirdFailover", severity: "critical", to: decision.to.name },
        annotations: {
          summary: "NetBird failed over to " + decision.to.name,
          description:
            "Management at " +
            decision.from +
            " failed " +
            WATCHDOG_FAILURES_TO_FLIP +
            " checks in a row, so the watchdog pointed " +
            lease +
            " at " +
            decision.to.name +
            " (" +
            decision.to.ip +
            "). Its fence restores the newest backup and starts management. Failing back is manual: docs/runbooks/netbird-failback.md.",
        },
        startsAt: now.toISOString(),
        endsAt: at(FLIP_ALERT_HOURS),
      },
    ];
  }
  if (decision.action === "hold" && decision.failures >= WATCHDOG_FAILURES_TO_FLIP) {
    return [
      {
        labels: { ...labels, alertname: "NetbirdFailoverBlocked", severity: "critical" },
        annotations: {
          summary: "NetBird management is down and the watchdog will not fail over",
          description: "Management failed " + decision.failures + " checks in a row, and the watchdog is holding: " + decision.reason + ". docs/runbooks/netbird-failback.md.",
        },
        startsAt: now.toISOString(),
        // Re-sent every run while it holds; lapses on its own once it stops.
        endsAt: at(5 / 60),
      },
    ];
  }
  return undefined;
}

// ── I/O ──────────────────────────────────────────────────────────────────

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + " is not set");
  return value;
}

async function cloudflare(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    ...init,
    headers: { Authorization: "Bearer " + env("CF_API_TOKEN"), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const body = (await response.json()) as { success?: boolean; result?: unknown; errors?: { message?: string }[] };
  if (!response.ok || !body.success) throw new Error("Cloudflare " + path + ": HTTP " + response.status + " " + (body.errors ?? []).map(e => e.message).join("; "));
  return body.result;
}

async function aRecord(zoneId: string, name: string): Promise<{ id: string; content: string }> {
  const records = (await cloudflare("/zones/" + zoneId + "/dns_records?type=A&name=" + encodeURIComponent(name))) as { id: string; content: string }[];
  if (records.length !== 1) throw new Error(name + " has " + records.length + " A records in Cloudflare, not one");
  return records[0];
}

/** GET HEALTH_PATH at `ip`, verifying the certificate for `name`. */
function healthy(ip: string, name: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = https.request({ host: ip, port: 443, path: HEALTH_PATH, servername: name, headers: { host: name }, timeout: 10000 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(false));
    req.end();
  });
}

/** A TLS handshake on 443, any certificate: the standby's management is stopped, its Traefik is not. */
function reachable(ip: string, name: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = tls.connect({ host: ip, port: 443, servername: name, rejectUnauthorized: false, timeout: 10000 }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("timeout", () => socket.destroy(new Error("timeout")));
    socket.on("error", () => resolve(false));
  });
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
  const lease = env("NETBIRD_LEASE");
  const zoneId = env("CF_ZONE_ID");
  const candidates = parseCandidates(env("NETBIRD_CANDIDATES"));
  const stateUrl = "/api/v1/namespaces/" + env("POD_NAMESPACE") + "/configmaps/" + env("STATE_CONFIGMAP");
  const state = parseState(((await kube("GET", stateUrl)) as { data?: Record<string, string> }).data);

  let record: { id: string; content: string } | null = null;
  let hosts: { name: string; ip: string; record: string }[] = [];
  try {
    record = await aRecord(zoneId, lease);
    hosts = await Promise.all(candidates.map(async c => ({ name: c.name, ip: (await aRecord(zoneId, c.record)).content, record: c.record })));
  } catch (error) {
    console.log(JSON.stringify({ msg: "Cloudflare unreadable", error: String(error) }));
    record = null;
  }
  const activeHealthy = record ? await healthy(record.content, lease) : false;
  const probed = record ? await Promise.all(hosts.map(async h => ({ name: h.name, ip: h.ip, reachable: h.ip === record.content ? false : await reachable(h.ip, h.record) }))) : [];
  const { decision, next } = decide(state, { leaseIp: record?.content ?? null, activeHealthy, candidates: probed, now });

  if (decision.action === "flip" && record) {
    const written = (await cloudflare("/zones/" + zoneId + "/dns_records/" + record.id, { method: "PATCH", body: JSON.stringify({ content: decision.to.ip }) })) as { content: string };
    if (written.content !== decision.to.ip) throw new Error("Cloudflare kept " + written.content + " instead of " + decision.to.ip);
  }
  const alerts = alertFor(decision, lease, now);
  if (alerts) {
    // A failed alert must not undo the flip, or block the state write below.
    try {
      const response = await fetch(env("ALERTMANAGER_URL") + "/api/v2/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alerts), signal: AbortSignal.timeout(10000) });
      if (!response.ok) console.log(JSON.stringify({ msg: "Alertmanager refused the alert", status: response.status }));
    } catch (error) {
      console.log(JSON.stringify({ msg: "Alertmanager unreachable", error: String(error) }));
    }
  }
  await kube("PATCH", stateUrl, {
    data: {
      failures: String(next.failures),
      lastFlipAt: next.lastFlipAt ?? "",
      everHealthy: String(next.everHealthy === true),
      lastRun: now.toISOString(),
      lastDecision: decision.action,
      lastLease: record?.content ?? "",
    },
  });
  console.log(JSON.stringify({ msg: "netbird-failover-watchdog", lease: record?.content ?? null, activeHealthy, candidates: probed, decision }));
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
