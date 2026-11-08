/**
 * ./unifi-zones.yaml -> Zone `unifi-fw:<zone>` nodes, a declared UniFi
 * Network `unifi:name:<network>` per named network, and IN_ZONE between
 * them. The observed UniFi networks are keyed by controller id, which the
 * repo never sees, so these join to them by name (../src/declares.ts).
 */
import { parse as parseYaml } from "yaml";
import type { DeclaredPlan } from "./plan.ts";

export const UNIFI_ZONES = ["Internal", "External", "Gateway", "Vpn", "Hotspot", "Dmz"] as const;
export type UnifiZone = (typeof UNIFI_ZONES)[number];

export const zoneKey = (zone: string) => `unifi-fw:${zone}`;
export const unifiNetworkKey = (name: string) => `unifi:name:${name}`;

/** Parses and checks the zone file: every built-in zone listed, no other key, each network in one zone. */
export function parseZones(text: string): Record<UnifiZone, string[]> {
  const doc = parseYaml(text) as { zones?: Record<string, unknown> } | null;
  const zones = doc?.zones;
  if (!zones || typeof zones !== "object") throw new Error("unifi-zones.yaml: no `zones` map");
  const problems: string[] = [];
  for (const key of Object.keys(zones)) if (!(UNIFI_ZONES as readonly string[]).includes(key)) problems.push(`unknown zone ${key}`);
  const out = {} as Record<UnifiZone, string[]>;
  const owner = new Map<string, string>();
  for (const zone of UNIFI_ZONES) {
    const value = zones[zone];
    if (value === undefined) {
      problems.push(`zone ${zone} is missing (list it, empty if need be)`);
      continue;
    }
    if (!Array.isArray(value) || !value.every(v => typeof v === "string" && v.trim() !== "")) {
      problems.push(`zone ${zone} must be a list of network names`);
      continue;
    }
    out[zone] = value as string[];
    for (const network of value as string[]) {
      const other = owner.get(network);
      if (other) problems.push(`${network} is in both ${other} and ${zone}`);
      else owner.set(network, zone);
    }
  }
  if (problems.length > 0) throw new Error(`unifi-zones.yaml: ${problems.join("; ")}`);
  return out;
}

export function addZones(plan: DeclaredPlan, zones: Record<UnifiZone, string[]>): void {
  for (const zone of UNIFI_ZONES) {
    plan.node("Zone", zoneKey(zone), { system: "unifi-fw", name: zone });
    for (const network of zones[zone]) {
      plan.node("Network", unifiNetworkKey(network), { system: "unifi", name: network });
      plan.rel("IN_ZONE", { label: "Network", key: unifiNetworkKey(network) }, { label: "Zone", key: zoneKey(zone) });
    }
  }
}
