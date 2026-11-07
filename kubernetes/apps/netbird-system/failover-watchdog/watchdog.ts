// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The NetBird failover watchdog (#3001, docs/plans/netbird-mirror.md §E).
 *
 * Runs every minute as a CronJob in Equestria. It reads the lease record
 * (netbird.<root domain>) from Cloudflare, probes management at the address
 * the record points to, and after WATCHDOG_FAILURES_TO_FLIP failed runs in a
 * row repoints the record at a standby. It does that only if:
 *   - Cloudflare answered: no internet, no Cloudflare, no flip. A run that
 *     cannot read it is "blind"; enough blind runs in a row page on their own;
 *   - the failures were in a row: a success, a blind run or a missed run
 *     (CONSECUTIVE_RUN_GAP_MINUTES) starts the count over;
 *   - a standby answers TLS on 443: so a home-internet outage, where nothing
 *     outside answers, never flips;
 *   - the holder itself still answers TLS on 443, so the route from here is
 *     proven and only management failed. A holder that does not answer at all
 *     looks the same as Equestria losing its route to it, and no second
 *     vantage point exists (ADR 0002, #3161), so that holds and pages;
 *   - no flip happened in the last FLIP_COOLDOWN_MINUTES: no ping-pong;
 *   - management has answered at least once: nothing fails over from a
 *     server that never came up.
 * Each host's fence (components/netbird/fence.ts) then does the rest: the old
 * primary stops management, the standby restores and starts.
 *
 * The counts live in a ConfigMap, because each run is a new pod. Every flip,
 * every run that would flip but may not, and a watchdog blind for too long
 * post an alert to Alertmanager.
 *
 * Node runs this file by stripping types. watchdog.test.ts covers the pure
 * part (decide, alertFor, the parsers) and run(), the I/O around it, with the
 * network faked through WatchdogIo.
 */
import { readFileSync } from "node:fs";
import * as https from "node:https";
import * as tls from "node:tls";

/** Five minutes at one run a minute: longer than an unattended-upgrades reboot. */
export const WATCHDOG_FAILURES_TO_FLIP = 5;
export const FLIP_COOLDOWN_MINUTES = 60;
/**
 * A run a minute, each up to 55 s and allowed to start 50 s late: two runs in a
 * row are at most about two minutes apart. A longer gap since the last recorded
 * run means runs were missed or crashed, and that breaks the streak.
 */
export const CONSECUTIVE_RUN_GAP_MINUTES = 3;
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
  /** Runs in a row that could not read Cloudflare: the watchdog is blind. */
  blindRuns?: number;
  /** When the last run finished and wrote this state (the ConfigMap's lastRun). */
  lastRunAt?: string;
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
  /** Whether leaseIp answers TLS on 443 at all: Equestria's route to the holder works. */
  activeReachable: boolean;
  /** Every candidate host with its address and whether it answers TLS on 443. */
  candidates: { name: string; ip: string; reachable: boolean }[];
  now: Date;
}

export type Decision =
  | { action: "healthy" }
  | { action: "count"; failures: number }
  | { action: "flip"; from: string; to: { name: string; ip: string } }
  | { action: "hold"; reason: string; failures: number }
  | { action: "blind"; runs: number };

/** The whole policy. Pure: the caller does the probing and acts on the result. */
export function decide(state: WatchdogState, obs: Observation, failuresToFlip: number = WATCHDOG_FAILURES_TO_FLIP): { decision: Decision; next: WatchdogState } {
  const kept: WatchdogState = {
    failures: 0,
    ...(state.lastFlipAt ? { lastFlipAt: state.lastFlipAt } : {}),
    ...(state.everHealthy ? { everHealthy: true } : {}),
    lastRunAt: obs.now.toISOString(),
  };
  // Only runs in a row count. With no recorded run, or one too long ago, the
  // streak starts over: a crashed or skipped run is not a failure.
  const sinceLastRun = state.lastRunAt ? (obs.now.getTime() - Date.parse(state.lastRunAt)) / 60000 : Number.POSITIVE_INFINITY;
  const inARow = sinceLastRun <= CONSECUTIVE_RUN_GAP_MINUTES;
  if (obs.leaseIp === null) {
    // Cannot even read the record: the watchdog's own internet, or Cloudflare.
    // Nothing is learned about the primary, and the failure streak is broken.
    const runs = (inARow ? (state.blindRuns ?? 0) : 0) + 1;
    return { decision: { action: "blind", runs }, next: { ...kept, blindRuns: runs } };
  }
  if (obs.activeHealthy) return { decision: { action: "healthy" }, next: { ...kept, everHealthy: true } };

  const failures = (inARow ? state.failures : 0) + 1;
  const next = { ...kept, failures };
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
  if (!obs.activeReachable) {
    // A dead VM and Equestria losing only its route to it look the same from
    // here, and no second vantage point exists to tell them apart (ADR 0002).
    // A holder that answers TLS but not management is the case that flips.
    return { decision: { action: "hold", reason: obs.leaseIp + " does not answer on 443 from Equestria, which a route loss on Equestria's side also looks like", failures }, next };
  }
  return {
    decision: { action: "flip", from: obs.leaseIp, to: { name: target.name, ip: target.ip } },
    next: { failures: 0, lastFlipAt: obs.now.toISOString(), everHealthy: true, lastRunAt: obs.now.toISOString() },
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
  const count = (value: string | undefined): number => {
    const n = Number.parseInt(value ?? "0", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const blindRuns = count(data?.blindRuns);
  return {
    failures: count(data?.failures),
    ...(data?.lastFlipAt ? { lastFlipAt: data.lastFlipAt } : {}),
    ...(data?.everHealthy === "true" ? { everHealthy: true } : {}),
    ...(blindRuns > 0 ? { blindRuns } : {}),
    ...(data?.lastRun ? { lastRunAt: data.lastRun } : {}),
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
  if (decision.action === "blind" && decision.runs >= WATCHDOG_FAILURES_TO_FLIP) {
    return [
      {
        labels: { ...labels, alertname: "NetbirdFailoverWatchdogBlind", severity: "warning" },
        annotations: {
          summary: "The NetBird failover watchdog cannot read Cloudflare, so it cannot fail over",
          description:
            "The watchdog has not been able to read " +
            lease +
            " from Cloudflare for " +
            decision.runs +
            " runs in a row: Equestria's internet is down, or Cloudflare's API is. It never flips while blind, and it has not checked management. docs/runbooks/netbird-failback.md.",
        },
        startsAt: now.toISOString(),
        endsAt: at(5 / 60),
      },
    ];
  }
  return undefined;
}

// ── I/O ──────────────────────────────────────────────────────────────────

/** Everything run() touches outside the process, so watchdog.test.ts can fake it. */
export interface WatchdogIo {
  env: (name: string) => string | undefined;
  now: () => Date;
  fetch: typeof fetch;
  serviceAccountToken: () => string;
  /** GET HEALTH_PATH at `ip`, verifying the certificate for `name`. */
  healthy: (ip: string, name: string) => Promise<boolean>;
  /** A TLS handshake on 443 at `ip`, any certificate. */
  reachable: (ip: string, name: string) => Promise<boolean>;
  log: (line: object) => void;
}

function required(io: WatchdogIo, name: string): string {
  const value = io.env(name);
  if (!value) throw new Error(name + " is not set");
  return value;
}

async function cloudflare(io: WatchdogIo, path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await io.fetch("https://api.cloudflare.com/client/v4" + path, {
    ...init,
    headers: { Authorization: "Bearer " + required(io, "CF_API_TOKEN"), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const body = (await response.json()) as { success?: boolean; result?: unknown; errors?: { message?: string }[] };
  if (!response.ok || !body.success) throw new Error("Cloudflare " + path + ": HTTP " + response.status + " " + (body.errors ?? []).map(e => e.message).join("; "));
  return body.result;
}

async function aRecord(io: WatchdogIo, zoneId: string, name: string): Promise<{ id: string; content: string }> {
  const records = (await cloudflare(io, "/zones/" + zoneId + "/dns_records?type=A&name=" + encodeURIComponent(name))) as { id: string; content: string }[];
  if (records.length !== 1) throw new Error(name + " has " + records.length + " A records in Cloudflare, not one");
  return records[0];
}

async function kube(io: WatchdogIo, method: "GET" | "PATCH", path: string, body?: unknown): Promise<unknown> {
  const response = await io.fetch("https://kubernetes.default.svc" + path, {
    method,
    headers: { Authorization: "Bearer " + io.serviceAccountToken(), "Content-Type": method === "PATCH" ? "application/merge-patch+json" : "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Kubernetes " + method + " " + path + ": HTTP " + response.status);
  return response.json();
}

/** One watchdog run: read state and Cloudflare, probe, decide, act, record. Returns the decision. */
export async function run(io: WatchdogIo): Promise<Decision> {
  const now = io.now();
  const lease = required(io, "NETBIRD_LEASE");
  const zoneId = required(io, "CF_ZONE_ID");
  const candidates = parseCandidates(required(io, "NETBIRD_CANDIDATES"));
  const stateUrl = "/api/v1/namespaces/" + required(io, "POD_NAMESPACE") + "/configmaps/" + required(io, "STATE_CONFIGMAP");
  const state = parseState(((await kube(io, "GET", stateUrl)) as { data?: Record<string, string> }).data);

  let record: { id: string; content: string } | null = null;
  let hosts: { name: string; ip: string; record: string }[] = [];
  try {
    record = await aRecord(io, zoneId, lease);
    hosts = await Promise.all(candidates.map(async c => ({ name: c.name, ip: (await aRecord(io, zoneId, c.record)).content, record: c.record })));
  } catch (error) {
    io.log({ msg: "Cloudflare unreadable", error: String(error) });
    record = null;
  }
  const activeHealthy = record ? await io.healthy(record.content, lease) : false;
  // Only asked when management failed: does the holder answer at all, so the route from here works?
  const activeReachable = record && !activeHealthy ? await io.reachable(record.content, lease) : false;
  const probed = record ? await Promise.all(hosts.map(async h => ({ name: h.name, ip: h.ip, reachable: h.ip === record.content ? false : await io.reachable(h.ip, h.record) }))) : [];
  const { decision, next } = decide(state, { leaseIp: record?.content ?? null, activeHealthy, activeReachable, candidates: probed, now });

  if (decision.action === "flip" && record) {
    const written = (await cloudflare(io, "/zones/" + zoneId + "/dns_records/" + record.id, { method: "PATCH", body: JSON.stringify({ content: decision.to.ip }) })) as { content: string };
    if (written.content !== decision.to.ip) throw new Error("Cloudflare kept " + written.content + " instead of " + decision.to.ip);
  }
  const alerts = alertFor(decision, lease, now);
  if (alerts) {
    // A failed alert must not undo the flip, or block the state write below.
    try {
      const response = await io.fetch(required(io, "ALERTMANAGER_URL") + "/api/v2/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alerts),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) io.log({ msg: "Alertmanager refused the alert", status: response.status });
    } catch (error) {
      io.log({ msg: "Alertmanager unreachable", error: String(error) });
    }
  }
  await kube(io, "PATCH", stateUrl, {
    data: {
      failures: String(next.failures),
      blindRuns: String(next.blindRuns ?? 0),
      lastFlipAt: next.lastFlipAt ?? "",
      everHealthy: String(next.everHealthy === true),
      lastRun: next.lastRunAt ?? now.toISOString(),
      lastDecision: decision.action,
      lastLease: record?.content ?? "",
    },
  });
  io.log({ msg: "netbird-failover-watchdog", lease: record?.content ?? null, activeHealthy, activeReachable, candidates: probed, decision });
  return decision;
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

if (import.meta.main) {
  run({
    env: name => process.env[name],
    now: () => new Date(),
    fetch: (input, init) => fetch(input, init),
    serviceAccountToken: () => readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8"),
    healthy,
    reachable,
    log: line => console.log(JSON.stringify(line)),
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
