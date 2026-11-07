// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The overview at `/` on wonderbolts.<root domain> (docs/plans/region-exits.md
 * §D4): every region exit's region, tunnel state and active users, read-only.
 * Whichever picker the route's all-pickers Service lands on builds it from each
 * region exit's GET /status over that region exit's own Service, itself
 * included. One region exit that does not answer shows as down; the page
 * still lists the rest.
 *
 * The pod resolves names through gluetun's DNS-over-TLS (dnsPolicy None), so
 * cluster names do not resolve: the peers' Services are found through the
 * `<SERVICE>_SERVICE_HOST`/`_PORT` variables Kubernetes injects
 * (enableServiceLinks), and gluetun's FIREWALL_OUTBOUND_SUBNETS lets the
 * Service CIDR out.
 *
 * Shipped beside picker.ts in the region-exit-picker ConfigMap; picker.ts
 * imports it. overview.test.ts covers it with fetch faked.
 */

export interface OverviewRegion {
  country: string;
  city: string | null;
}

export interface OverviewEntry {
  name: string;
  /** Whether its /status answered at all. false is "down". */
  reachable: boolean;
  region: OverviewRegion | null;
  tunnelUp: boolean;
  /** People on it now (#3141's active clients); null when it does not say. */
  activeUsers: number | null;
}

/** The parts of a picker's GET /status the overview reads. Anything else is ignored. */
interface PeerStatus {
  region?: { country?: unknown; city?: unknown } | null;
  tunnel?: { up?: unknown } | null;
  activeClients?: unknown;
}

const down = (name: string): OverviewEntry => ({ name, reachable: false, region: null, tunnelUp: false, activeUsers: null });

/** A count from /status: a number, or an object carrying one as `count`. */
function countOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && typeof (value as { count?: unknown }).count === "number") return (value as { count: number }).count;
  return null;
}

async function entryFor(name: string, url: string | null, fetchFn: typeof globalThis.fetch, timeoutMs: number): Promise<OverviewEntry> {
  if (!url) return down(name);
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return down(name);
    const body = (await response.json()) as PeerStatus;
    const country = body.region?.country;
    const city = body.region?.city;
    return {
      name,
      reachable: true,
      region: typeof country === "string" ? { country, city: typeof city === "string" ? city : null } : null,
      tunnelUp: body.tunnel?.up === true,
      activeUsers: countOf(body.activeClients),
    };
  } catch {
    return down(name);
  }
}

/** Every region exit's entry, in the order given, all asked at once. Never throws. */
export function collectOverview(names: readonly string[], statusUrl: (name: string) => string | null, fetchFn: typeof globalThis.fetch, timeoutMs = 3000): Promise<OverviewEntry[]> {
  return Promise.all(names.map(name => entryFor(name, statusUrl(name), fetchFn, timeoutMs)));
}

/**
 * A region exit's /status URL from the variables Kubernetes injects for its
 * Service `<servicePrefix><name>` (e.g. REGION_EXITS_MISTY_FLY_SERVICE_HOST),
 * or null when the pod has none, as for a Service created after it started.
 */
export function peerStatusUrl(servicePrefix: string, env: Record<string, string | undefined>): (name: string) => string | null {
  return name => {
    const variable = (servicePrefix + name).toUpperCase().replace(/-/g, "_");
    const host = env[variable + "_SERVICE_HOST"];
    const port = env[variable + "_SERVICE_PORT"];
    if (!host || !port) return null;
    return "http://" + (host.includes(":") ? "[" + host + "]" : host) + ":" + port + "/status";
  };
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

function describeEntry(entry: OverviewEntry): { region: string; state: string; users: string } {
  if (!entry.reachable) return { region: "unknown", state: "down (not answering)", users: "" };
  const region = entry.region ? (entry.region.city ? entry.region.city + ", " : "") + entry.region.country : "unknown";
  const users = entry.activeUsers === null ? "" : entry.activeUsers === 1 ? "1 person" : entry.activeUsers + " people";
  return { region, state: entry.tunnelUp ? "tunnel up" : "tunnel down", users };
}

/** The page at `/`: one row per region exit, each linking to its picker. Read-only. */
export function renderOverview(entries: readonly OverviewEntry[]): string {
  const rows = entries.map(entry => {
    const shown = describeEntry(entry);
    const name = escapeHtml(entry.name);
    return (
      '<tr class="' +
      (entry.reachable && entry.tunnelUp ? "up" : "down") +
      '"><th scope="row"><a href="/' +
      name +
      '">' +
      name +
      "</a></th><td>" +
      escapeHtml(shown.region) +
      "</td><td>" +
      escapeHtml(shown.state) +
      "</td><td>" +
      escapeHtml(shown.users) +
      "</td></tr>"
    );
  });
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Region exits</title>",
    "<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.4rem;border-bottom:1px solid #ddd}tr.down td{color:#a00}</style>",
    "</head><body>",
    "<h1>Region exits</h1>",
    "<table><thead><tr><th>Region exit</th><th>Region</th><th>State</th><th>Using it</th></tr></thead><tbody>",
    ...rows,
    "</tbody></table>",
    "<p>Pick a region exit to move it. Everyone using it moves with it.</p>",
    "</body></html>",
  ].join("\n");
}
