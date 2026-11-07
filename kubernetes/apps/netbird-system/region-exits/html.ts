// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * What the region picker's pages (picker.ts) and the overview (overview.ts)
 * share: escaping, the page around them, and how a region and a count of
 * people read. Shipped beside them in the region-exit-picker ConfigMap.
 */
import type { Availability, Overlay } from "./overlays.ts";
import type { Region } from "./picker.ts";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

/** "Dallas TX, USA", "Japan", or "unknown" for no region. */
export const describeRegion = (region: Region | null): string => (region ? (region.city ? region.city + ", " : "") + region.country : "unknown");

/** "1 person", "3 people". */
export const peopleCount = (count: number): string => (count === 1 ? "1 person" : count + " people");

/** Colours for an element with class `availability` and its state as a second class. */
export const AVAILABILITY_STYLE =
  ".availability{padding:.4rem .6rem;border-radius:.3rem;border:1px solid}.availability.online{color:#065f2c;background:#e6f4ea}.availability.degraded{color:#7a4a00;background:#fff4dc}.availability.offline,.availability.unreachable{color:#8a0000;background:#fdecec}";

const OVERLAY_NAMES: Record<Overlay, string> = { tailscale: "Tailscale", netbird: "NetBird" };

/**
 * A region exit's availability in plain words, for family: a short label for
 * the overview's badge, and what still works, for its own page.
 */
export function describeAvailability(name: string, availability: Availability): { label: string; detail: string } {
  switch (availability.state) {
    case "online":
      return { label: "Online", detail: "Working on NetBird and Tailscale." };
    case "degraded": {
      const down = OVERLAY_NAMES[availability.offlineOn];
      const up = OVERLAY_NAMES[availability.offlineOn === "netbird" ? "tailscale" : "netbird"];
      return {
        label: "Offline on " + down + ", " + up + " works",
        detail: "People on " + up + " can still use " + name + ". People on " + down + " cannot until it reconnects" + (availability.offlineOn === "netbird" ? ", which takes about 10 minutes after a restart." : "."),
      };
    }
    case "offline":
      return availability.reason === "tunnel"
        ? {
            label: "Offline: not connected to Mullvad",
            detail: "Nothing gets out through " + name + ", so anyone using it has no internet through it. Picking a region below reconnects the tunnel and may fix it.",
          }
        : { label: "Offline: not connected to NetBird or Tailscale", detail: "Nobody can reach " + name + " right now, on either app." };
    case "unreachable":
      return { label: "Not responding", detail: name + " did not answer, so its state is unknown." };
  }
}

/** A whole page: `title` is escaped, `style` and `body` are HTML as given. */
export function renderDocument(title: string, style: string, body: readonly string[]): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>" + escapeHtml(title) + "</title>",
    "<style>" + style + "</style>",
    "</head><body>",
    ...body,
    "</body></html>",
  ].join("\n");
}
