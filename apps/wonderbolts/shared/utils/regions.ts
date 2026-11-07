/**
 * Region names: servers.json's spelling for what gluetun reports lowercased
 * (ported from the picker sidecar's picker.ts canonicalRegion), and whether
 * traffic leaves from the country a region exit is set to (from its
 * metrics.ts egressMatchesRegion, which also alerts on it).
 */
import type { Region, RegionChoice } from "../types/regionExit";

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
/** "lost city" -> "Lost City": the best guess at a name servers.json does not list. */
const titleCase = (name: string): string => name.replace(/(^|[\s-])(\S)/g, (_, gap: string, first: string) => gap + first.toUpperCase());

/** `region` in servers.json's spelling, looked up ignoring case, title-cased when it is not there. */
export function canonicalRegion(region: Region, regions: readonly RegionChoice[]): Region {
  const choice = regions.find(r => sameName(r.country, region.country));
  const city = region.city;
  return {
    country: choice?.country ?? titleCase(region.country),
    city: city === null ? null : (choice?.cities.find(c => sameName(c, city)) ?? titleCase(city)),
  };
}

/**
 * One spelling per country, for names spelt more than one way: the region is
 * a Mullvad name ("USA", "UK"), the egress whichever name won gluetun's
 * public-IP vote. Keys are lower case, without diacritics or a leading "the".
 * Keep in step with metrics.ts in the region exits.
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

/**
 * Whether a region exit has finished moving to `to`: the tunnel is up and
 * traffic leaves from that country. The city is not compared: gluetun's
 * public-IP lookup names cities differently from Mullvad.
 */
export function isConnectedTo(view: { tunnel: { up: boolean } | null; egress: { country: string | null } | null } | null | undefined, to: Region): boolean {
  const egressCountry = view?.egress?.country;
  return view?.tunnel?.up === true && !!egressCountry && egressMatchesRegion(to.country, egressCountry);
}
