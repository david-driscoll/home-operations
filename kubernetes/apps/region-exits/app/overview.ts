// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The overview at `/` on wonderbolts.<root domain> (docs/plans/region-exits.md
 * §D4): every region exit's region, tunnel state and the people on it, read-only.
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

import { describeRegion, escapeHtml, peopleCount, renderDocument } from "./html.ts";
import type { Region } from "./picker.ts";

export interface OverviewEntry {
  name: string;
  /** Whether its /status answered at all. false is "down". */
  reachable: boolean;
  region: Region | null;
  tunnelUp: boolean;
  /** People on it now, its /status activeClients; null when it does not say. */
  activeClients: number | null;
}

/** The parts of a picker's GET /status the overview reads. Anything else is ignored. */
interface PeerStatus {
  region?: { country?: unknown; city?: unknown } | null;
  tunnel?: { up?: unknown } | null;
  activeClients?: unknown;
}

const down = (name: string): OverviewEntry => ({ name, reachable: false, region: null, tunnelUp: false, activeClients: null });

async function entryFor(name: string, url: string | null, fetchFn: typeof globalThis.fetch, timeoutMs: number): Promise<OverviewEntry> {
  if (!url) return down(name);
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return down(name);
    const body = (await response.json()) as PeerStatus;
    const country = body.region?.country;
    const city = body.region?.city;
    const people = body.activeClients;
    return {
      name,
      reachable: true,
      region: typeof country === "string" ? { country, city: typeof city === "string" ? city : null } : null,
      tunnelUp: body.tunnel?.up === true,
      activeClients: typeof people === "number" && Number.isFinite(people) ? people : null,
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

function describeEntry(entry: OverviewEntry): { region: string; state: string; people: string } {
  if (!entry.reachable) return { region: "unknown", state: "down (not answering)", people: "" };
  const people = entry.activeClients === null ? "" : peopleCount(entry.activeClients);
  return { region: describeRegion(entry.region), state: entry.tunnelUp ? "tunnel up" : "tunnel down", people };
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
      escapeHtml(shown.people) +
      "</td></tr>"
    );
  });
  return renderDocument(
    "Region exits",
    "body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.4rem;border-bottom:1px solid #ddd}tr.down td{color:#a00}",
    [
      "<h1>Region exits</h1>",
      "<table><thead><tr><th>Region exit</th><th>Region</th><th>State</th><th>People on it</th></tr></thead><tbody>",
      ...rows,
      "</tbody></table>",
      "<p>Pick a region exit to move it. Everyone using it moves with it.</p>",
    ],
  );
}
