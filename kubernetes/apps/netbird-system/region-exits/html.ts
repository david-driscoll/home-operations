// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * What the region picker's pages (picker.ts) and the overview (overview.ts)
 * share: escaping, the page around them, and how a region and a count of
 * people read. Shipped beside them in the region-exit-picker ConfigMap.
 */
import type { Region } from "./picker.ts";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

/** "Dallas TX, USA", "Japan", or "unknown" for no region. */
export const describeRegion = (region: Region | null): string => (region ? (region.city ? region.city + ", " : "") + region.country : "unknown");

/** "1 person", "3 people". */
export const peopleCount = (count: number): string => (count === 1 ? "1 person" : count + " people");

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
