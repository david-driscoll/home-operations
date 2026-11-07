/**
 * Talking to the region exits' agents: the picker sidecar in each region
 * exit's pod (kubernetes/apps/netbird-system/region-exits/picker.ts), reached
 * through its Service. Only the root paths, which the region exits'
 * CiliumNetworkPolicy opens to this app: GET /status, GET /regions and
 * POST /region.
 *
 * Every function takes `fetch` so the tests can fake the agents. None trusts
 * an agent's body: an agent from before a field existed, or one answering
 * nonsense, still gives a view the pages can show.
 */
import type { Availability, LastMove, MoveRequest, Region, RegionChoice, RegionExitView } from "../../shared/types/regionExit";
import { canonicalRegion } from "../../shared/utils/regions";

export interface AgentConfig {
  /** Every region exit, in the order the overview lists them. The only names an agent URL is ever built for. */
  regionExits: readonly string[];
  /** An agent's base URL, `{name}` standing for the region exit. */
  agentUrlTemplate: string;
}

/** gluetun is given 5 s by the agent; a page waits a little longer than that for one region exit. */
export const STATUS_TIMEOUT_MS = 6000;
/** The overview shows a region exit that has not answered by then as not responding. */
export const OVERVIEW_TIMEOUT_MS = 3000;
/** A move saves the region, then waits for gluetun to reconnect (the agent gives that 30 s). */
export const MOVE_TIMEOUT_MS = 45000;

/** "spitfire, soarin" -> ["spitfire", "soarin"]: runtime config is a string. */
export function namesFrom(list: string): string[] {
  return list
    .split(",")
    .map(name => name.trim())
    .filter(Boolean);
}

/**
 * The agent's base URL for a region exit, or null when `name` is not one.
 * The name is checked against the list before it goes anywhere near a host,
 * so a route parameter can never point the server at another Service.
 */
export function agentUrl(config: AgentConfig, name: string): string | null {
  if (!config.regionExits.includes(name)) return null;
  return config.agentUrlTemplate.replaceAll("{name}", name).replace(/\/+$/, "");
}

const isString = (value: unknown): value is string => typeof value === "string";

function regionFrom(value: unknown): Region | null {
  const region = value as { country?: unknown; city?: unknown } | null | undefined;
  if (!region || !isString(region.country)) return null;
  return { country: region.country, city: isString(region.city) ? region.city : null };
}

/** The agent's availability when it is one this app knows, else worked out the same way from its tunnel and overlays. */
function availabilityFrom(body: Record<string, unknown>): Availability {
  const reported = body.availability as { state?: unknown; offlineOn?: unknown; reason?: unknown } | null | undefined;
  if (reported?.state === "online") return { state: "online" };
  if (reported?.state === "degraded" && (reported.offlineOn === "netbird" || reported.offlineOn === "tailscale")) return { state: "degraded", offlineOn: reported.offlineOn };
  if (reported?.state === "offline" && (reported.reason === "tunnel" || reported.reason === "overlays")) return { state: "offline", reason: reported.reason };
  const tunnelUp = (body.tunnel as { up?: unknown } | null | undefined)?.up === true;
  const overlays = body.overlays as { tailscale?: unknown; netbird?: unknown } | null | undefined;
  const tailscale = overlays?.tailscale === true;
  const netbird = overlays?.netbird === true;
  if (!tunnelUp) return { state: "offline", reason: "tunnel" };
  if (tailscale && netbird) return { state: "online" };
  if (tailscale) return { state: "degraded", offlineOn: "netbird" };
  if (netbird) return { state: "degraded", offlineOn: "tailscale" };
  return { state: "offline", reason: "overlays" };
}

function lastMoveFrom(value: unknown): LastMove | null {
  const move = value as { by?: unknown; at?: unknown } | null | undefined;
  if (!move || !isString(move.at) || move.at === "" || Number.isNaN(Date.parse(move.at))) return null;
  return { by: isString(move.by) && move.by !== "" ? move.by : null, at: move.at };
}

/** A region exit no one could ask. */
export function unreachable(name: string): RegionExitView {
  return { name, availability: { state: "unreachable" }, region: null, tunnel: null, egress: null, activeClients: null, lastMove: null };
}

/** An agent's GET /status body as a view, whatever it holds. */
export function viewFromStatus(name: string, body: unknown): RegionExitView {
  if (!body || typeof body !== "object") return unreachable(name);
  const status = body as Record<string, unknown>;
  const tunnel = status.tunnel as { up?: unknown; status?: unknown } | null | undefined;
  const egress = status.egress as { country?: unknown; city?: unknown; ip?: unknown } | null | undefined;
  const people = status.activeClients;
  return {
    name,
    availability: availabilityFrom(status),
    region: regionFrom(status.region),
    tunnel: { up: tunnel?.up === true, status: isString(tunnel?.status) ? tunnel.status : null },
    egress: egress ? { country: isString(egress.country) ? egress.country : null, city: isString(egress.city) ? egress.city : null, ip: isString(egress.ip) ? egress.ip : null } : null,
    activeClients: typeof people === "number" && Number.isFinite(people) ? people : null,
    lastMove: lastMoveFrom(status.lastMove),
  };
}

/** GET a JSON body from an agent, or undefined when it does not answer with one. */
async function agentJson(fetchFn: typeof globalThis.fetch, url: string, timeoutMs: number): Promise<unknown> {
  try {
    const response = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Mullvad's countries and cities from an agent, or an empty list. */
export async function fetchRegions(config: AgentConfig, name: string, fetchFn: typeof globalThis.fetch, timeoutMs = STATUS_TIMEOUT_MS): Promise<RegionChoice[]> {
  const base = agentUrl(config, name);
  if (!base) return [];
  const body = await agentJson(fetchFn, `${base}/regions`, timeoutMs);
  if (!Array.isArray(body)) return [];
  return body.filter((r): r is { country: string; cities?: unknown } => !!r && isString(r.country)).map(r => ({ country: r.country, cities: Array.isArray(r.cities) ? r.cities.filter(isString) : [] }));
}

/** One region exit's view; `unreachable` when its agent does not answer. Never throws. */
export async function fetchView(config: AgentConfig, name: string, fetchFn: typeof globalThis.fetch, timeoutMs = STATUS_TIMEOUT_MS): Promise<RegionExitView> {
  const base = agentUrl(config, name);
  if (!base) return unreachable(name);
  const body = await agentJson(fetchFn, `${base}/status`, timeoutMs);
  return body === undefined ? unreachable(name) : viewFromStatus(name, body);
}

/**
 * One region exit's view with its region in servers.json's spelling, for its
 * own page, and Mullvad's countries for the form. Both asked at once.
 */
export async function fetchPage(config: AgentConfig, name: string, fetchFn: typeof globalThis.fetch): Promise<{ view: RegionExitView; regions: RegionChoice[] }> {
  const [view, regions] = await Promise.all([fetchView(config, name, fetchFn), fetchRegions(config, name, fetchFn)]);
  return { view: view.region ? { ...view, region: canonicalRegion(view.region, regions) } : view, regions };
}

/** Every region exit's view, in the configured order, all asked at once. One not answering never holds up the rest. */
export function collectOverview(config: AgentConfig, fetchFn: typeof globalThis.fetch, timeoutMs = OVERVIEW_TIMEOUT_MS): Promise<RegionExitView[]> {
  return Promise.all(config.regionExits.map(name => fetchView(config, name, fetchFn, timeoutMs)));
}

/** What an agent said to a move: its HTTP status and JSON body. 502 when it could not be asked. */
export interface AgentReply {
  status: number;
  body: unknown;
}

/** POST /region on the region exit's agent, naming who is moving it. */
export async function postMove(config: AgentConfig, name: string, move: MoveRequest, movedBy: string | null, fetchFn: typeof globalThis.fetch, timeoutMs = MOVE_TIMEOUT_MS): Promise<AgentReply> {
  const base = agentUrl(config, name);
  if (!base) return { status: 404, body: { error: `no region exit called ${name}` } };
  try {
    const response = await fetchFn(`${base}/region`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ country: move.country, city: move.city ?? null, confirm: move.confirm === true, movedBy }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text || `HTTP ${response.status}` };
    }
    return { status: response.status, body };
  } catch (error) {
    return { status: 502, body: { error: `${name} did not answer: ${error instanceof Error ? error.message : String(error)}` } };
  }
}
