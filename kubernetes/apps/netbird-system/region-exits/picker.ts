// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The region picker (docs/plans/region-exits.md §D4, ADR 0005): a sidecar in a
 * region exit's pod that shows where the region exit leaves from and lets
 * family move it. The route publishes /<name> behind Authentik forward auth
 * (family and admins); /status is also served at the root for in-cluster
 * readers.
 *
 *   GET  /                        the overview of every region exit (overview.ts)
 *   GET  /status, /<name>/status  JSON: region, tunnel state, Mullvad egress,
 *                                 people on it (./activeClients.ts), overlays
 *                                 and the availability derived from them
 *                                 (./overlays.ts)
 *   GET  /metrics                 the same for Prometheus (./metrics.ts); root only
 *   GET  /<name>                  the page: availability, current region and a
 *                                 country/city form
 *   GET  /<name>/regions          JSON: Mullvad WireGuard countries and their cities
 *   POST /<name>/region           move it (JSON or the page's form post); with
 *                                 anyone on it, only once confirmed
 *   GET  /healthz                 liveness, touches nothing
 *
 * gluetun's control server (pinned v3.41.x, internal/server/vpn.go) listens on
 * 127.0.0.1:8000 only, with HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE {"auth":"none"}
 * so the picker needs no key: the pod's loopback is the boundary. A switch is
 * PUT /v1/vpn/settings with a partial settings.VPN; gluetun overrides only the
 * fields given (gosettings.OverrideWithSlice: a non-nil empty list clears),
 * validates against its server list, and restarts the tunnel when anything
 * changed (internal/vpn/state/vpn.go SetSettings).
 *
 * The region is saved first to the region-exit-<name>-state ConfigMap, which
 * Flux does not manage and which gluetun's envFrom reads after the Git
 * defaults, so the pick survives a restart and deleting it falls back to Git.
 * Countries and cities come from /gluetun/servers.json, which gluetun writes
 * into the emptyDir both containers mount.
 *
 * Node runs this file by stripping types. createHandler is what
 * picker.test.ts covers, with fetch and readFile faked; main() is the socket
 * around it.
 */
import { readFile } from "node:fs/promises";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { activeClients } from "./activeClients.ts";
import { AVAILABILITY_STYLE, describeAvailability, describeRegion, escapeHtml, peopleCount, renderDocument } from "./html.ts";
import { renderMetrics } from "./metrics.ts";
import { type Availability, availabilityOf, type OverlayConfig, type OverlayDeps, type OverlayState, overlayState } from "./overlays.ts";
import { collectOverview, peerStatusUrl, renderOverview } from "./overview.ts";

export interface PickerConfig extends OverlayConfig {
  name: string;
  namespace: string;
  stateConfigMap: string;
  gluetunUrl: string;
  kubeUrl: string;
  serversPath: string;
  tokenPath: string;
  /** Every region exit, in the order the overview lists them. */
  regionExits: string[];
  /** A region exit's GET /status URL through its Service, or null when there is none. */
  statusUrl: (name: string) => string | null;
}

export interface Deps extends OverlayDeps {
  fetch: typeof globalThis.fetch;
}

export interface RegionChoice {
  country: string;
  cities: string[];
}

interface ServerEntry {
  vpn?: string;
  country?: string;
  city?: string;
}

/** Mullvad's WireGuard countries in servers.json, each with its cities. */
export function regionsFrom(serversJson: string): RegionChoice[] {
  const servers: ServerEntry[] = JSON.parse(serversJson)?.mullvad?.servers ?? [];
  const byCountry = new Map<string, Set<string>>();
  for (const server of servers) {
    if (server.vpn !== "wireguard" || !server.country) continue;
    const cities = byCountry.get(server.country) ?? new Set<string>();
    if (server.city) cities.add(server.city);
    byCountry.set(server.country, cities);
  }
  return [...byCountry.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([country, cities]) => ({ country, cities: [...cities].sort((a, b) => a.localeCompare(b)) }));
}

export interface Region {
  country: string;
  city: string | null;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** "lost city" -> "Lost City": the best guess at a name servers.json does not list. */
const titleCase = (name: string) => name.replace(/(^|[\s-])(\S)/g, (_, gap: string, first: string) => gap + first.toUpperCase());

/**
 * `region` in servers.json's spelling. gluetun's control API reports
 * server_selection lowercased ("uk", "new york ny"), so the name is looked up
 * in `regions` ignoring case, and title-cased when it is not there.
 */
export function canonicalRegion(region: Region, regions: readonly RegionChoice[]): Region {
  const choice = regions.find(r => sameName(r.country, region.country));
  const city = region.city;
  return {
    country: choice?.country ?? titleCase(region.country),
    city: city === null ? null : (choice?.cities.find(c => sameName(c, city)) ?? titleCase(city)),
  };
}

export interface Status {
  name: string;
  region: Region | null;
  tunnel: { up: boolean; status: string | null };
  egress: { country: string | null; city: string | null; ip: string } | null;
  /** People on the region exit now; null when conntrack cannot be read. */
  activeClients: number | null;
  /** Whether each overlay's daemon is connected (overlays.ts). */
  overlays: OverlayState;
  /** Whether family can use it, from the tunnel and the overlays (availabilityOf). */
  availability: Availability;
}

/** JSON safe inside a <script>: no `<`, so no `</script>`. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
const describePeople = (name: string, count: number | null) =>
  count === null ? "The picker cannot tell how many people are using " + name + "." : peopleCount(count) + (count === 1 ? " is" : " are") + " using " + name + " right now.";
const PAGE_STYLE = "body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem}";

/** The page a form post gets when people are on the region exit: the same move again, confirmed. */
export function renderConfirm(name: string, region: Region, count: number | null): string {
  const hidden = (field: string, value: string) => '<input type="hidden" name="' + field + '" value="' + escapeHtml(value) + '">';
  return renderDocument("Move " + name + "?", PAGE_STYLE + "button{display:block;width:100%;margin:.5rem 0;font-size:1rem;padding:.6rem}", [
    "<h1>Move " + escapeHtml(name) + " to " + escapeHtml(describeRegion(region)) + "?</h1>",
    "<p>" + escapeHtml(describePeople(name, count)) + " Everyone using it moves with it.</p>",
    '<form method="post" action="/' + escapeHtml(name) + '/region">',
    hidden("country", region.country) + hidden("city", region.city ?? "") + hidden("confirm", "yes"),
    "<button>Move anyway</button>",
    "</form>",
    '<p><a href="/' + escapeHtml(name) + '">Cancel</a></p>',
  ]);
}

/** The countries the page offers as one-click moves, in servers.json's names, in this order. */
export const QUICK_COUNTRIES: readonly string[] = ["USA", "Canada", "UK"];

const option = (value: string, label: string, selected: boolean) => '<option value="' + escapeHtml(value) + '"' + (selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";

/** The page at /<name>: where the region exit is, and a form to move it. */
export function renderPage(name: string, current: Status, regions: RegionChoice[]): string {
  // What the country <select> shows: the current country, or the browser's
  // default (the first) when Mullvad no longer offers it. The city list
  // matches it, so the page is right before (or without) the script.
  const shown = regions.find(r => r.country === current.region?.country) ?? regions[0];
  const currentCity = shown && shown.country === current.region?.country ? current.region.city : null;
  const options = regions.map(r => option(r.country, r.country, r === shown && shown.country === current.region?.country)).join("");
  const cityOptions = option("", "Any city", !currentCity) + (shown?.cities ?? []).map(c => option(c, c, c === currentCity)).join("");
  // One-click moves: a country and no city, through the same POST as the form.
  // The buttons sit in the form beside the dropdown but submit the empty
  // #quick form (the form attribute), so they never send the dropdowns too.
  const quick = QUICK_COUNTRIES.filter(c => regions.some(r => r.country === c))
    .map(c =>
      c === current.region?.country
        ? '<button form="quick" name="country" value="' + escapeHtml(c) + '" disabled aria-current="true">' + escapeHtml(c) + " (current)</button>"
        : '<button form="quick" name="country" value="' + escapeHtml(c) + '">' + escapeHtml(c) + "</button>",
    )
    .join("");
  const cities = Object.fromEntries(regions.map(r => [r.country, r.cities]));
  const tunnel = current.tunnel.up ? "connected" : "not connected" + (current.tunnel.status ? " (" + escapeHtml(current.tunnel.status) + ")" : "");
  const egress = current.egress ? "Traffic leaves from " + escapeHtml((current.egress.city ? current.egress.city + ", " : "") + (current.egress.country ?? "an unknown country")) + "." : "";
  const availability = describeAvailability(name, current.availability);
  const quickStyle = ".quick{display:flex;gap:.5rem}.quick button{flex:1;margin:0}.quick button[aria-current]{font-weight:bold}";
  return renderDocument(name + " region", PAGE_STYLE + AVAILABILITY_STYLE + "label,select,button{display:block;width:100%;margin:.5rem 0;font-size:1rem}button{padding:.6rem}" + quickStyle, [
    "<h1>" + escapeHtml(name) + "</h1>",
    '<p class="availability ' + current.availability.state + '"><strong>' + escapeHtml(availability.label) + "</strong><br>" + escapeHtml(availability.detail) + "</p>",
    "<p>Region: <strong>" + escapeHtml(describeRegion(current.region)) + "</strong>. Tunnel " + tunnel + ". " + egress + "</p>",
    '<form id="quick" method="post" action="/' + escapeHtml(name) + '/region"></form>',
    '<form method="post" action="/' + escapeHtml(name) + '/region">',
    '<label for="country">Country</label><div class="quick">' + quick + "</div>",
    '<select id="country" name="country" required>' + options + "</select>",
    '<label for="city">City (optional)</label><select id="city" name="city">' + cityOptions + "</select>",
    "<button>Move " + escapeHtml(name) + "</button>",
    "<p>" + escapeHtml(describePeople(name, current.activeClients)) + " Everyone using it moves with it.</p>",
    "</form>",
    "<script>",
    "const cities = " + scriptJson(cities) + ";",
    "const current = " + scriptJson(current.region) + ";",
    'const country = document.getElementById("country"), city = document.getElementById("city");',
    // The server rendered the cities of the country shown; this redoes it,
    // the same way, when another country is picked.
    "function fill() {",
    '  city.replaceChildren(new Option("Any city", ""));',
    "  for (const c of cities[country.value] || []) city.add(new Option(c, c, false, !!current && current.country === country.value && current.city === c));",
    "}",
    'country.addEventListener("change", fill);',
    "</script>",
  ]);
}

const asJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function createHandler(config: PickerConfig, deps: Deps): (request: Request) => Promise<Response> {
  const base = "/" + config.name;

  /** A GET on gluetun's control API, or null when it does not answer. */
  async function gluetun<T>(path: string): Promise<T | null> {
    try {
      const response = await deps.fetch(config.gluetunUrl + path, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  /** Mullvad's countries and cities from servers.json, or none when it cannot be read. */
  const offeredRegions = (): Promise<RegionChoice[]> =>
    deps
      .readFile(config.serversPath)
      .then(regionsFrom)
      .catch(() => []);

  async function status(): Promise<Status> {
    const [vpn, settings, publicIp, people, overlays, regions] = await Promise.all([
      gluetun<{ status?: string }>("/v1/vpn/status"),
      gluetun<{ provider?: { server_selection?: { countries?: string[] | null; cities?: string[] | null } } }>("/v1/vpn/settings"),
      gluetun<{ public_ip?: string; country?: string; city?: string }>("/v1/publicip/ip"),
      activeClients(deps.readFile),
      overlayState(config, deps),
      offeredRegions(),
    ]);
    const selection = settings?.provider?.server_selection;
    const country = selection?.countries?.[0];
    const tunnelUp = vpn?.status === "running";
    return {
      name: config.name,
      region: country ? canonicalRegion({ country, city: selection?.cities?.[0] ?? null }, regions) : null,
      tunnel: { up: tunnelUp, status: vpn?.status ?? null },
      egress: publicIp?.public_ip ? { country: publicIp.country ?? null, city: publicIp.city ?? null, ip: publicIp.public_ip } : null,
      activeClients: people,
      overlays,
      availability: availabilityOf(tunnelUp, overlays),
    };
  }

  /** A call on the Kubernetes API with the pod's ServiceAccount token. */
  async function kube(method: "PATCH" | "POST", path: string, body: unknown, contentType = "application/json"): Promise<Response> {
    const token = (await deps.readFile(config.tokenPath)).trim();
    return deps.fetch(config.kubeUrl + path, {
      method,
      headers: { Authorization: "Bearer " + token, "Content-Type": contentType, Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  }

  /** Writes the region to the state ConfigMap, creating it the first time. Throws when it cannot. */
  async function saveRegion(region: Region): Promise<void> {
    const configmaps = "/api/v1/namespaces/" + config.namespace + "/configmaps";
    const patched = await kube("PATCH", configmaps + "/" + config.stateConfigMap, { data: { SERVER_COUNTRIES: region.country, SERVER_CITIES: region.city } }, "application/merge-patch+json");
    if (patched.ok) return;
    if (patched.status !== 404) throw new Error("patching ConfigMap " + config.stateConfigMap + ": HTTP " + patched.status);
    const data: Record<string, string> = { SERVER_COUNTRIES: region.country };
    if (region.city) data.SERVER_CITIES = region.city;
    const created = await kube("POST", configmaps, { apiVersion: "v1", kind: "ConfigMap", metadata: { name: config.stateConfigMap }, data });
    if (!created.ok) throw new Error("creating ConfigMap " + config.stateConfigMap + ": HTTP " + created.status);
  }

  /** PUT /v1/vpn/settings: gluetun merges the selection in, validates it, and reconnects. Returns its outcome text. */
  async function applyRegion(region: Region): Promise<string> {
    const response = await deps.fetch(config.gluetunUrl + "/v1/vpn/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // An empty `cities` clears a city picked before; a missing one would keep it.
      body: JSON.stringify({ provider: { server_selection: { countries: [region.country], cities: region.city ? [region.city] : [] } } }),
      signal: AbortSignal.timeout(30000),
    });
    const text = (await response.text()).trim();
    if (!response.ok) throw new Error("gluetun refused the region: " + text);
    return text;
  }

  /** The region asked for, if Mullvad offers it, and whether the move is confirmed; an error message otherwise. */
  async function requested(request: Request): Promise<{ region: Region; confirmed: boolean } | string> {
    let country: string | undefined;
    let city: string | undefined;
    let confirmed = false;
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as { country?: unknown; city?: unknown; confirm?: unknown };
      country = typeof body.country === "string" ? body.country : undefined;
      city = typeof body.city === "string" ? body.city : undefined;
      confirmed = body.confirm === true;
    } else {
      const form = new URLSearchParams(await request.text());
      country = form.get("country") ?? undefined;
      city = form.get("city") ?? undefined;
      confirmed = form.get("confirm") === "yes";
    }
    if (!country) return "pick a country";
    const asked = country;
    const offered = regionsFrom(await deps.readFile(config.serversPath)).find(r => sameName(r.country, asked));
    if (!offered) return "Mullvad has no WireGuard servers in " + country;
    const offeredCity = city ? offered.cities.find(c => sameName(c, city)) : null;
    if (offeredCity === undefined) return "Mullvad has no WireGuard servers in " + city + ", " + country;
    return { region: { country: offered.country, city: offeredCity }, confirmed };
  }

  async function switchRegion(request: Request): Promise<Response> {
    const fromForm = !(request.headers.get("content-type") ?? "").includes("application/json");
    const asked = await requested(request);
    if (typeof asked === "string") return asJson({ error: asked }, 400);
    const { region } = asked;
    // Moving a region exit moves everyone on it, and nothing locks it, so
    // anyone on it (or not knowing) means asking first.
    if (!asked.confirmed) {
      const people = await activeClients(deps.readFile);
      if (people !== 0) {
        if (fromForm) return new Response(renderConfirm(config.name, region, people), { headers: { "Content-Type": "text/html; charset=utf-8" } });
        return asJson({ error: describePeople(config.name, people) + " Send it again with confirm: true to move them.", activeClients: people, confirm: true }, 409);
      }
    }
    let outcome: string;
    try {
      // Saved first, so a restart never goes back on a switch gluetun already made.
      await saveRegion(region);
      outcome = await applyRegion(region);
    } catch (error) {
      console.log(JSON.stringify({ msg: "region switch failed", region, error: String(error) }));
      return asJson({ error: String(error instanceof Error ? error.message : error) }, 502);
    }
    console.log(JSON.stringify({ msg: "region switched", region, outcome }));
    if (fromForm) return new Response(null, { status: 303, headers: { Location: base } });
    return asJson({ region, outcome });
  }

  async function page(): Promise<Response> {
    const [current, regions] = await Promise.all([status(), deps.readFile(config.serversPath).then(regionsFrom)]);
    return new Response(renderPage(config.name, current, regions), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return async request => {
    let path = new URL(request.url).pathname;
    while (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (request.method === "GET" && path === "/healthz") return new Response("ok");
    if (request.method === "GET" && path === "/") {
      const [peers, regions] = await Promise.all([collectOverview(config.regionExits, config.statusUrl, deps.fetch), offeredRegions()]);
      // A peer's /status is already canonical; this covers one from before it was.
      const entries = peers.map(entry => (entry.region ? { ...entry, region: canonicalRegion(entry.region, regions) } : entry));
      return new Response(renderOverview(entries, new Date()), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (request.method === "GET" && path === base) return page();
    if (request.method === "GET" && (path === "/status" || path === base + "/status")) return asJson(await status());
    // Root only, never under /<name>: the HTTPRoute publishes /<name>, and
    // the CNP lets Prometheus GET this path and nothing else.
    if (request.method === "GET" && path === "/metrics") return new Response(renderMetrics(await status()), { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" } });
    if (request.method === "POST" && path === base + "/region") return switchRegion(request);
    if (request.method === "GET" && path === base + "/regions") return asJson(regionsFrom(await deps.readFile(config.serversPath)));
    return new Response("not found", { status: 404 });
  };
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(name + " is not set");
  return value;
}

/** Hands a node:http request to the fetch-style handler and writes back its answer. */
async function serve(handle: (request: Request) => Promise<Response>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
    const method = req.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks);
    const response = await handle(new Request("http://picker" + (req.url ?? "/"), { method, headers, body }));
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.log(JSON.stringify({ msg: "request failed", url: req.url, error: String(error) }));
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}

/** A GET over a unix socket (fetch cannot dial one), for tailscaled's LocalAPI. */
function unixGet(socketPath: string, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ socketPath, path, headers, timeout: 5000 }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk as Buffer));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end();
  });
}

function main(): void {
  const name = env("REGION_EXIT_NAME");
  const config: PickerConfig = {
    name,
    namespace: env("POD_NAMESPACE"),
    stateConfigMap: env("STATE_CONFIGMAP", "region-exit-" + name + "-state"),
    gluetunUrl: env("GLUETUN_CONTROL_URL", "http://127.0.0.1:8000"),
    // The API server's CA comes from NODE_EXTRA_CA_CERTS, as for the proxy watchdog.
    // By address, not kubernetes.default.svc: the pod resolves through
    // Technitium (dnsPolicy None), which knows no cluster names.
    // The kubelet always sets KUBERNETES_SERVICE_HOST/PORT, service links or not,
    // and the API server's certificate carries the Service address.
    kubeUrl: env("KUBERNETES_URL", "https://" + process.env.KUBERNETES_SERVICE_HOST + ":" + process.env.KUBERNETES_SERVICE_PORT),
    serversPath: env("GLUETUN_SERVERS_JSON", "/gluetun/servers.json"),
    tokenPath: "/var/run/secrets/kubernetes.io/serviceaccount/token",
    // Every region exit, comma-separated; on its own, the overview lists this one.
    regionExits: env("REGION_EXITS", name)
      .split(",")
      .map(exit => exit.trim())
      .filter(Boolean),
    statusUrl: peerStatusUrl(env("REGION_EXIT_SERVICE_PREFIX", "region-exits-"), process.env),
    // The tailscale container's TS_SOCKET, on the emptyDir both mount.
    tailscaleSocket: env("TAILSCALE_SOCKET", "/var/run/tailscale/tailscaled.sock"),
    netbirdFlagsPath: "/sys/class/net/" + env("NETBIRD_INTERFACE", "wt0") + "/flags",
  };
  const handle = createHandler(config, { fetch: globalThis.fetch, readFile: path => readFile(path, "utf8"), unixGet });
  const port = Number(env("PORT", "8080"));
  createServer((req, res) => void serve(handle, req, res)).listen(port, () => console.log(JSON.stringify({ msg: "region picker listening", name, port })));
}

if (import.meta.main) main();
