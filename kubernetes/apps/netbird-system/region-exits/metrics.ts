// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * The region picker's GET /metrics (docs/plans/region-exits.md §D5): the
 * Prometheus text for one region exit's status. Every series carries
 * `region_exit="<name>"`, so the five region exits share one PrometheusRule
 * (prometheusrule.yaml), which alerts on:
 *
 *   region_exit_tunnel_up                  RegionExitTunnelDown
 *   region_exit_egress_country_match       RegionExitWrongCountry
 *   region_exit_overlay_connected{overlay} RegionExitOverlayOffline
 *
 * region_exit_available (online or degraded, overlays.ts availabilityOf) is
 * for dashboards; no alert reads it.
 *
 * The info series (region, egress) keep the country names out of the alerting
 * series, so a region switch does not start a new series under the alert.
 */
import type { Status } from "./picker.ts";

/**
 * One spelling per country, for names that are spelt more than one way. The
 * region is a Mullvad name from gluetun's servers.json ("USA", "UK"). The
 * egress is whichever name won gluetun's public-IP vote (v3.41.3,
 * internal/publicip/api/resilient.go): ipinfo's and Cloudflare's codes named
 * by constants.CountryCodes() ("United States", "Czech Republic", "Turkey"),
 * ifconfig.co's MaxMind names ("Czechia", "Türkiye", "The Netherlands"), or
 * ip2location's with any " (...)" cut off. Keys are lower case, without
 * diacritics or a leading "the". metrics.test.ts holds every Mullvad country.
 */
const SAME_COUNTRY: Record<string, string> = {
  usa: "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "united kingdom of great britain and northern ireland": "united kingdom",
  czechia: "czech republic",
  turkiye: "turkey",
};

function countryKey(name: string): string {
  const key = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ \(.*\)$/, "")
    .replace(/^the /i, "")
    .trim()
    .toLowerCase();
  return SAME_COUNTRY[key] ?? key;
}

/** Whether traffic leaves from the country the region exit is set to. */
export function egressMatchesRegion(regionCountry: string, egressCountry: string): boolean {
  return countryKey(regionCountry) === countryKey(egressCountry);
}

const escapeLabel = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const labels = (pairs: Record<string, string>) =>
  "{" +
  Object.entries(pairs)
    .map(([key, value]) => key + '="' + escapeLabel(value) + '"')
    .join(",") +
  "}";
const bit = (value: boolean) => (value ? 1 : 0);

export function renderMetrics(status: Status): string {
  const exit = { region_exit: status.name };
  const lines: string[] = [];
  const gauge = (name: string, help: string, samples: [Record<string, string>, number][]) => {
    if (samples.length === 0) return;
    lines.push("# HELP " + name + " " + help, "# TYPE " + name + " gauge");
    for (const [extra, value] of samples) lines.push(name + labels({ ...exit, ...extra }) + " " + value);
  };

  gauge("region_exit_tunnel_up", "Whether gluetun reports the Mullvad tunnel running.", [[{}, bit(status.tunnel.up)]]);
  gauge(
    "region_exit_region_info",
    "The region the region exit is set to (gluetun's server selection, from the state or defaults ConfigMap).",
    status.region ? [[{ country: status.region.country, city: status.region.city ?? "" }, 1]] : [],
  );
  gauge(
    "region_exit_egress_info",
    "Where traffic leaves from, by gluetun's public-IP lookup. Absent while there is no public IP.",
    status.egress ? [[{ country: status.egress.country ?? "", city: status.egress.city ?? "" }, 1]] : [],
  );
  const match = status.region && status.egress?.country ? [[{}, bit(egressMatchesRegion(status.region.country, status.egress.country))] as [Record<string, string>, number]] : [];
  gauge("region_exit_egress_country_match", "Whether the egress country is the region's country. Absent while either is unknown.", match);
  gauge("region_exit_overlay_connected", "Whether the overlay's daemon on the region exit is connected.", [
    [{ overlay: "tailscale" }, bit(status.overlays.tailscale)],
    [{ overlay: "netbird" }, bit(status.overlays.netbird)],
  ]);
  gauge("region_exit_available", "Whether family can use the region exit on at least one overlay: its /status availability is online or degraded.", [
    [{}, bit(status.availability.state === "online" || status.availability.state === "degraded")],
  ]);
  // activeClients.ts; absent, not 0, when conntrack cannot be read.
  if (status.activeClients !== null) gauge("region_exit_active_clients", "Distinct overlay clients with traffic out of the tunnel recently (activeClients.ts).", [[{}, status.activeClients]]);
  return lines.join("\n") + "\n";
}
