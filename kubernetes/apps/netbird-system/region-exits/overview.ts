// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The overview at `/` on wonderbolts.<root domain> (docs/plans/region-exits.md
 * §D4): every region exit's availability, region and the people on it,
 * read-only. Whichever picker the route's all-pickers Service lands on builds
 * it from each region exit's GET /status over that region exit's own Service,
 * itself included. One region exit that does not answer shows as not
 * responding; the page still lists the rest.
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

import { AVAILABILITY_STYLE, describeAvailability, describeRegion, escapeHtml, peopleCount, renderDocument } from "./html.ts";
import { type Availability, availabilityOf } from "./overlays.ts";
import type { Region } from "./picker.ts";

export interface OverviewEntry {
  name: string;
  /** Its /status availability; "unreachable" when /status did not answer. */
  availability: Availability;
  region: Region | null;
  /** People on it now, its /status activeClients; null when it does not say. */
  activeClients: number | null;
}

/** The parts of a picker's GET /status the overview reads. Anything else is ignored. */
interface PeerStatus {
  region?: { country?: unknown; city?: unknown } | null;
  tunnel?: { up?: unknown } | null;
  overlays?: { tailscale?: unknown; netbird?: unknown } | null;
  availability?: { state?: unknown; offlineOn?: unknown; reason?: unknown } | null;
  activeClients?: unknown;
}

/** The time zone "last checked" is shown in: the family's. */
const TIME_ZONE = "America/New_York";

const unreachable = (name: string): OverviewEntry => ({ name, availability: { state: "unreachable" }, region: null, activeClients: null });

/**
 * The peer's own availability when it is one the overview knows, else worked
 * out the same way from its tunnel and overlays (a picker from before
 * availability was on /status, or a value it does not recognise).
 */
function availabilityFrom(body: PeerStatus): Availability {
  const reported = body.availability;
  if (reported?.state === "online") return { state: "online" };
  if (reported?.state === "degraded" && (reported.offlineOn === "netbird" || reported.offlineOn === "tailscale")) return { state: "degraded", offlineOn: reported.offlineOn };
  if (reported?.state === "offline" && (reported.reason === "tunnel" || reported.reason === "overlays")) return { state: "offline", reason: reported.reason };
  return availabilityOf(body.tunnel?.up === true, { tailscale: body.overlays?.tailscale === true, netbird: body.overlays?.netbird === true });
}

async function entryFor(name: string, url: string | null, fetchFn: typeof globalThis.fetch, timeoutMs: number): Promise<OverviewEntry> {
  if (!url) return unreachable(name);
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return unreachable(name);
    const body = (await response.json()) as PeerStatus;
    const country = body.region?.country;
    const city = body.region?.city;
    const people = body.activeClients;
    return {
      name,
      availability: availabilityFrom(body),
      region: typeof country === "string" ? { country, city: typeof city === "string" ? city : null } : null,
      activeClients: typeof people === "number" && Number.isFinite(people) ? people : null,
    };
  } catch {
    return unreachable(name);
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

/** The page at `/`: one row per region exit, each linking to its picker, and when it was read. Read-only. */
export function renderOverview(entries: readonly OverviewEntry[], checkedAt: Date): string {
  const rows = entries.map(entry => {
    const name = escapeHtml(entry.name);
    const status = describeAvailability(entry.name, entry.availability);
    return (
      '<tr><th scope="row"><a href="/' +
      name +
      '">' +
      name +
      '</a></th><td><span class="availability ' +
      entry.availability.state +
      '">' +
      escapeHtml(status.label) +
      "</span></td><td>" +
      escapeHtml(entry.availability.state === "unreachable" ? "unknown" : describeRegion(entry.region)) +
      "</td><td>" +
      escapeHtml(entry.activeClients === null ? "" : peopleCount(entry.activeClients)) +
      "</td></tr>"
    );
  });
  const checked = checkedAt.toLocaleTimeString("en-US", { timeZone: TIME_ZONE, timeZoneName: "short" });
  return renderDocument(
    "Region exits",
    "body{font-family:system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.4rem;border-bottom:1px solid #ddd}" +
      AVAILABILITY_STYLE +
      "td .availability{display:inline-block;padding:.1rem .4rem}",
    [
      "<h1>Region exits</h1>",
      "<table><thead><tr><th>Region exit</th><th>Status</th><th>Region</th><th>People on it</th></tr></thead><tbody>",
      ...rows,
      "</tbody></table>",
      '<p>Last checked <time datetime="' + checkedAt.toISOString() + '">' + escapeHtml(checked) + "</time>. Reload to check again.</p>",
      "<p>Pick a region exit to move it, or to see what still works when it is offline. Everyone using it moves with it.</p>",
    ],
  );
}
