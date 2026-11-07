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
 *   - another host saw the holder's management fail too, within the last
 *     PEER_VIEW_FRESH_MINUTES. Each host probes the others and publishes what
 *     it saw to Garage (components/netbird/failoverView.ts); without that
 *     second view, Equestria losing only its route to the holder would look
 *     like the holder dying (ADR 0002, #3161). Missing, stale or healthy: hold;
 *   - no flip happened in the last FLIP_COOLDOWN_MINUTES: no ping-pong;
 *   - management has answered at least once: nothing fails over from a
 *     server that never came up.
 * Each host's fence (components/netbird/fence.ts) then does the rest: the old
 * primary stops management, the standby restores and starts.
 *
 * Whether failover is armed is checked every run, not only during an outage
 * (follow-up to #3167): the watchdog reads every other host's view whatever
 * the holder's health, and records how old the standby's is. A standby whose
 * view is missing, unreadable, stale or silent about the holder for
 * VIEW_STALE_RUNS_TO_ALERT runs in a row raises NetbirdFailoverViewStale, so
 * a host that stopped publishing shows up now instead of as a hold during the
 * next outage. Reading the views only ever informs: it never flips, and a
 * Garage that cannot be read never fails the run.
 *
 * The counts live in a ConfigMap, because each run is a new pod. Every flip,
 * every run that would flip but may not, a watchdog blind for too long and a
 * standby whose view has gone stale post an alert to Alertmanager.
 *
 * Node runs this file by stripping types. watchdog.test.ts covers the pure
 * part (decide, alertFor, the parsers) and run(), the I/O around it, with the
 * network faked through WatchdogIo.
 */
import { createHash, createHmac } from "node:crypto";
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
/**
 * How recent another host's view of the holder must be (by Garage's
 * Last-Modified) to count. The hosts publish every 30 s, so this allows a few
 * missed runs; and it is shorter than the failure streak, so the view and
 * Equestria's failures overlap in time.
 */
export const PEER_VIEW_FRESH_MINUTES = 3;
/**
 * Runs in a row the standby's view must be unusable before
 * NetbirdFailoverViewStale fires: one late publish, or one Garage hiccup,
 * does not page.
 */
export const VIEW_STALE_RUNS_TO_ALERT = 3;
/** Where each host's view lives in the backup bucket: failover-view/<host>.json (components/netbird/failoverView.ts). */
export const PEER_VIEW_PREFIX = "failover-view/";
/** Garage signs as its own region (components/netbird/backup.ts). */
export const GARAGE_REGION = "garage";
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
  /** Runs in a row the standby's view could not have armed a flip (standbyView not fresh). */
  viewStaleRuns?: number;
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
  /**
   * What other hosts published about management at an address: `at` is
   * Garage's Last-Modified, so the host's clock cannot make a view look fresh.
   */
  views: PeerView[];
  /** Every candidate host with its address and whether it answers TLS on 443. */
  candidates: { name: string; ip: string; reachable: boolean }[];
  now: Date;
}

export interface PeerView {
  /** The host that probed, e.g. azure-cus. */
  observer: string;
  /** The address it probed. */
  ip: string;
  /** Whether management answered there. */
  healthy: boolean;
  at: string;
}

/** One host's view object as read from Garage, before any judgement of it. */
export interface ViewRead {
  observer: string;
  /** ok: a parsed object; missing: Garage answered 404; unreadable: anything else (Garage down, bad JSON, no Last-Modified). */
  status: "ok" | "missing" | "unreadable";
  /** Garage's Last-Modified, when status is ok. */
  at?: string;
  /** Management's health at each address it probed, when status is ok. */
  targets?: Record<string, unknown>;
}

/**
 * Whether the standby's view could confirm the holder down right now:
 *   fresh: it would count toward a flip (within PEER_VIEW_FRESH_MINUTES);
 *   stale: too old, or stamped in the future;
 *   silent: fresh, but it says nothing about the holder's address;
 *   missing / unreadable: as read (ViewRead).
 */
export type ViewStatus = "fresh" | "stale" | "silent" | "missing" | "unreadable";

export interface StandbyView {
  /** The host that would be promoted. */
  standby: string;
  status: ViewStatus;
  /** Seconds since Garage's Last-Modified, when there is an object. */
  ageSeconds?: number;
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
  const inARow = continuesStreak(state, obs.now);
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
  // The second view: another host, probing the holder from outside home.
  // A dead VM and Equestria losing only its route to it look the same from
  // here; only a host elsewhere can tell them apart.
  const holder = obs.candidates.find(c => c.ip === obs.leaseIp)?.name;
  const fresh = obs.views.filter(v => {
    const age = (obs.now.getTime() - Date.parse(v.at)) / 60000;
    return v.ip === obs.leaseIp && v.observer !== holder && age >= -1 && age <= PEER_VIEW_FRESH_MINUTES;
  });
  if (!fresh.some(v => !v.healthy)) {
    const seesIt = fresh.find(v => v.healthy);
    const reason = seesIt
      ? seesIt.observer + " still sees management at " + obs.leaseIp + " answer, so the failure is on Equestria's path"
      : "no fresh view from another host (within " + PEER_VIEW_FRESH_MINUTES + " min) confirms " + obs.leaseIp + " is down";
    return { decision: { action: "hold", reason, failures }, next };
  }
  return {
    decision: { action: "flip", from: obs.leaseIp, to: { name: target.name, ip: target.ip } },
    next: { failures: 0, lastFlipAt: obs.now.toISOString(), everHealthy: true, lastRunAt: obs.now.toISOString() },
  };
}

/** Whether the last recorded run is recent enough that this one continues its streaks. */
export function continuesStreak(state: WatchdogState, now: Date): boolean {
  return state.lastRunAt !== undefined && (now.getTime() - Date.parse(state.lastRunAt)) / 60000 <= CONSECUTIVE_RUN_GAP_MINUTES;
}

/** The views decide() weighs: every readable object's entries, stamped with Garage's Last-Modified. */
export function peerViewsFrom(reads: ViewRead[]): PeerView[] {
  return reads.flatMap(r => {
    const at = r.at;
    if (r.status !== "ok" || !at) return [];
    return Object.entries(r.targets ?? {})
      .filter(([, healthy]) => typeof healthy === "boolean")
      .map(([ip, healthy]) => ({ observer: r.observer, ip, healthy: healthy as boolean, at }));
  });
}

/**
 * The host that would be promoted, as decide() picks it: the first candidate
 * other than the holder that answers on 443, or else the first other one.
 * Undefined when there is no other host.
 */
export function standbyOf(leaseIp: string, candidates: { name: string; ip: string; reachable: boolean }[]): string | undefined {
  const others = candidates.filter(c => c.ip !== leaseIp);
  return (others.find(c => c.reachable) ?? others[0])?.name;
}

/** Judge the standby's view the way decide() would weigh it in a flip, whatever the holder's health. */
export function judgeStandbyView(standby: string, leaseIp: string, reads: ViewRead[], now: Date): StandbyView {
  const read = reads.find(r => r.observer === standby);
  if (!read || read.status === "missing") return { standby, status: "missing" };
  if (read.status === "unreadable" || !read.at) return { standby, status: "unreadable" };
  const ageSeconds = Math.round((now.getTime() - Date.parse(read.at)) / 1000);
  if (ageSeconds < -60 || ageSeconds > PEER_VIEW_FRESH_MINUTES * 60) return { standby, status: "stale", ageSeconds };
  if (typeof read.targets?.[leaseIp] !== "boolean") return { standby, status: "silent", ageSeconds };
  return { standby, status: "fresh", ageSeconds };
}

/**
 * Runs in a row the standby's view has been unusable. A fresh view resets it;
 * a run with nothing to judge (blind, or no standby) leaves it as it was; a
 * gap since the last run starts it over, as for the failure streak.
 */
export function nextViewStaleRuns(state: WatchdogState, view: StandbyView | undefined, now: Date): number {
  const before = continuesStreak(state, now) ? (state.viewStaleRuns ?? 0) : 0;
  if (!view) return before;
  return view.status === "fresh" ? 0 : before + 1;
}

/** NetbirdFailoverViewStale once the standby's view has been unusable for VIEW_STALE_RUNS_TO_ALERT runs, or undefined. */
export function alertForStandbyView(view: StandbyView | undefined, runs: number, lease: string, now: Date): object[] | undefined {
  if (!view || view.status === "fresh" || runs < VIEW_STALE_RUNS_TO_ALERT) return undefined;
  const age = view.ageSeconds === undefined ? "" : " (last written " + view.ageSeconds + " s ago)";
  return [
    {
      labels: { namespace: "netbird-system", job: "netbird-failover-watchdog", lease, alertname: "NetbirdFailoverViewStale", severity: "warning", standby: view.standby },
      annotations: {
        summary: "NetBird failover is not armed: " + view.standby + "'s view of the primary is " + view.status,
        description:
          view.standby +
          "'s view of management (" +
          PEER_VIEW_PREFIX +
          view.standby +
          ".json in the NetBird backup bucket) has been " +
          view.status +
          age +
          " for " +
          runs +
          " runs in a row. A flip needs it fresh (within " +
          PEER_VIEW_FRESH_MINUTES +
          " min), so if the primary died now the watchdog would hold and page instead of failing over. Check the failover-view timer on " +
          view.standby +
          ": docs/runbooks/netbird-failback.md.",
      },
      startsAt: now.toISOString(),
      // Re-sent every run while stale; lapses on its own once the view is fresh.
      endsAt: new Date(now.getTime() + 5 * 60000).toISOString(),
    },
  ];
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
  const viewStaleRuns = count(data?.viewStaleRuns);
  return {
    failures: count(data?.failures),
    ...(data?.lastFlipAt ? { lastFlipAt: data.lastFlipAt } : {}),
    ...(data?.everHealthy === "true" ? { everHealthy: true } : {}),
    ...(blindRuns > 0 ? { blindRuns } : {}),
    ...(data?.lastRun ? { lastRunAt: data.lastRun } : {}),
    ...(viewStaleRuns > 0 ? { viewStaleRuns } : {}),
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

const sha256 = (data: string): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer => createHmac("sha256", key).update(data).digest();

/**
 * AWS Signature Version 4 for one S3 request, enough for a GET from Garage.
 * Returns the headers to send (host is signed but left to fetch to set).
 */
export function signS3(args: { method: string; url: string; region: string; accessKeyId: string; secretAccessKey: string; now: Date; headers?: Record<string, string>; payloadHash?: string }): Record<string, string> {
  const url = new URL(args.url);
  const amzDate = args.now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = args.payloadHash ?? sha256("");
  const headers: Record<string, string> = { ...args.headers, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const all: Record<string, string> = { host: url.host, ...headers };
  const names = Object.keys(all)
    .map(n => n.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(all).map(([n, v]) => [n.toLowerCase(), v.trim()]));
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
    .sort()
    .join("&");
  const canonical = [args.method, url.pathname, query, names.map(n => n + ":" + lower[n] + "\n").join(""), names.join(";"), payloadHash].join("\n");
  const scope = day + "/" + args.region + "/s3/aws4_request";
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac("AWS4" + args.secretAccessKey, day), args.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return { ...headers, authorization: "AWS4-HMAC-SHA256 Credential=" + args.accessKeyId + "/" + scope + ", SignedHeaders=" + names.join(";") + ", Signature=" + signature };
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

/**
 * Every other host's published view, from Garage: read-only GETs, on every
 * run. Never throws: a 404 is "missing", and Garage down, a bad key, bad JSON
 * or no Last-Modified are "unreadable". Either way decide() sees no view from
 * that host and holds.
 */
async function readViews(io: WatchdogIo, observers: string[], now: Date): Promise<ViewRead[]> {
  return Promise.all(
    observers.map(async (observer): Promise<ViewRead> => {
      try {
        const url = required(io, "S3_ENDPOINT").replace(/\/+$/, "") + "/" + required(io, "S3_BUCKET") + "/" + PEER_VIEW_PREFIX + observer + ".json";
        const headers = signS3({ method: "GET", url, region: GARAGE_REGION, accessKeyId: required(io, "AWS_ACCESS_KEY_ID"), secretAccessKey: required(io, "AWS_SECRET_ACCESS_KEY"), now });
        const response = await io.fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          io.log({ msg: "no view from " + observer, status: response.status });
          return { observer, status: response.status === 404 ? "missing" : "unreadable" };
        }
        // Garage's clock, not the host's: the host cannot make a view look fresh.
        const at = new Date(response.headers.get("Last-Modified") ?? "").toISOString();
        const body = (await response.json()) as { targets?: unknown } | null;
        const targets = body?.targets;
        if (typeof targets !== "object" || targets === null || Array.isArray(targets)) throw new Error("the view has no targets");
        return { observer, status: "ok", at, targets: targets as Record<string, unknown> };
      } catch (error) {
        io.log({ msg: "no view from " + observer, error: String(error) });
        return { observer, status: "unreadable" };
      }
    }),
  );
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
  // What the other hosts saw at the holder, read on every run and beside the
  // health check rather than after it, so a slow Garage cannot hold it up. A
  // flip needs these views; between outages they show whether one could happen.
  const [activeHealthy, reads] = await Promise.all([
    record ? io.healthy(record.content, lease) : Promise.resolve(false),
    record
      ? readViews(
          io,
          hosts.filter(h => h.ip !== record?.content).map(h => h.name),
          now,
        ).catch((): ViewRead[] => [])
      : Promise.resolve([] as ViewRead[]),
  ]);
  const views = peerViewsFrom(reads);
  const probed = record ? await Promise.all(hosts.map(async h => ({ name: h.name, ip: h.ip, reachable: h.ip === record.content ? false : await io.reachable(h.ip, h.record) }))) : [];
  const { decision, next } = decide(state, { leaseIp: record?.content ?? null, activeHealthy, views, candidates: probed, now });
  // Is failover armed? The standby's view, judged as a flip would weigh it.
  const standby = record ? standbyOf(record.content, probed) : undefined;
  const standbyView = record && standby ? judgeStandbyView(standby, record.content, reads, now) : undefined;
  const viewStaleRuns = nextViewStaleRuns(state, standbyView, now);

  if (decision.action === "flip" && record) {
    const written = (await cloudflare(io, "/zones/" + zoneId + "/dns_records/" + record.id, { method: "PATCH", body: JSON.stringify({ content: decision.to.ip }) })) as { content: string };
    if (written.content !== decision.to.ip) throw new Error("Cloudflare kept " + written.content + " instead of " + decision.to.ip);
  }
  const alerts = [...(alertFor(decision, lease, now) ?? []), ...(alertForStandbyView(standbyView, viewStaleRuns, lease, now) ?? [])];
  if (alerts.length > 0) {
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
      // Whether failover is armed: the standby's view as a flip would weigh it.
      // Empty while blind, or with no standby.
      standby: standbyView?.standby ?? "",
      standbyView: standbyView?.status ?? "",
      standbyViewAgeSeconds: standbyView?.ageSeconds === undefined ? "" : String(standbyView.ageSeconds),
      viewStaleRuns: String(viewStaleRuns),
    },
  });
  io.log({ msg: "netbird-failover-watchdog", lease: record?.content ?? null, activeHealthy, views, standbyView, viewStaleRuns, candidates: probed, decision });
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
