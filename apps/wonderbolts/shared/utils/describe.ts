/**
 * How a region exit's state reads, for family. Ported from the picker
 * sidecar's html.ts so the words stay the same.
 */
import type { Availability, Overlay, Region } from "../types/regionExit";

const OVERLAY_NAMES: Record<Overlay, string> = { tailscale: "Tailscale", netbird: "NetBird" };

/** "Dallas TX, USA", "Japan", or "unknown" for no region. */
export function describeRegion(region: Region | null): string {
  if (!region) return "unknown";
  return region.city ? `${region.city}, ${region.country}` : region.country;
}

/** "1 person", "3 people". */
export function peopleCount(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

/** "2 people are using spitfire right now.", or that it cannot tell. */
export function describePeople(name: string, count: number | null): string {
  if (count === null) return `The picker cannot tell how many people are using ${name}.`;
  return `${peopleCount(count)} ${count === 1 ? "is" : "are"} using ${name} right now.`;
}

/** The badge colour for an availability, as Nuxt UI names them. */
export function availabilityColor(availability: Availability): "success" | "warning" | "error" {
  if (availability.state === "online") return "success";
  if (availability.state === "degraded") return "warning";
  return "error";
}

/**
 * A region exit's availability in plain words: a short label for its badge,
 * and what still works, for its own page.
 */
export function describeAvailability(name: string, availability: Availability): { label: string; detail: string } {
  switch (availability.state) {
    case "online":
      return { label: "Online", detail: "Working on NetBird and Tailscale." };
    case "degraded": {
      const down = OVERLAY_NAMES[availability.offlineOn];
      const up = OVERLAY_NAMES[availability.offlineOn === "netbird" ? "tailscale" : "netbird"];
      const wait = availability.offlineOn === "netbird" ? ", which takes about 10 minutes after a restart." : ".";
      return {
        label: `Offline on ${down}, ${up} works`,
        detail: `People on ${up} can still use ${name}. People on ${down} cannot until it reconnects${wait}`,
      };
    }
    case "offline":
      return availability.reason === "tunnel"
        ? {
            label: "Offline: not connected to Mullvad",
            detail: `Nothing gets out through ${name}, so anyone using it has no internet through it. Moving it to a region reconnects the tunnel and may fix it.`,
          }
        : { label: "Offline: not connected to NetBird or Tailscale", detail: `Nobody can reach ${name} right now, on either app.` };
    case "unreachable":
      return { label: "Not responding", detail: `${name} did not answer, so its state is unknown.` };
  }
}

/** The family's time zone: every time the picker shows is in it. */
export const TIME_ZONE = "America/New_York";

/** "2:05 PM EST" for an ISO time. */
export function easternTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TIME_ZONE, timeZoneName: "short", hour: "numeric", minute: "2-digit" });
}

/** "Nov 7, 2026, 2:05 PM EST" for an ISO time. */
export function easternDateTime(iso: string): string {
  // Fields, not dateStyle/timeStyle: those cannot be combined with timeZoneName.
  return new Date(iso).toLocaleString("en-US", { timeZone: TIME_ZONE, timeZoneName: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Moved by Jamie", or "Moved by unknown" when nobody is recorded. */
export function describeMover(by: string | null | undefined): string {
  return `Moved by ${by ?? "unknown"}`;
}
