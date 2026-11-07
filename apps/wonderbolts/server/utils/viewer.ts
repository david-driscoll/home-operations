/**
 * Who is looking, from the headers Authentik's forward auth puts on every
 * request (kubernetes/apps/network/traefik/middleware/outpost.yaml
 * authResponseHeaders). Traefik replaces those headers with the outpost's, so
 * a client cannot send its own; only Traefik can reach this app (its
 * CiliumNetworkPolicy). That is what makes `canMove` safe to decide on.
 *
 * Friends may look at every region exit but only family and admins move one
 * (ADR 0006).
 */
import type { Viewer } from "../../shared/types/regionExit";

/** The groups that may move a region exit unless runtime config says otherwise. */
export const DEFAULT_MOVER_GROUPS = ["family", "admins"] as const;

/**
 * A header value as the person wrote it. Node reads header bytes as latin1,
 * so UTF-8 ("Zoë") arrives as mojibake ("ZoÃ«"); this decodes it back, and
 * keeps the value as given when it was not UTF-8 to begin with.
 */
export function headerText(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  let text = value;
  // Only a latin1 string can be bytes; anything wider already is text.
  if (![...value].some(c => (c.codePointAt(0) ?? 0) > 0xff)) {
    const decoded = Buffer.from(value, "latin1").toString("utf8");
    if (!decoded.includes("�") && Buffer.from(decoded, "utf8").toString("latin1") === value) text = decoded;
  }
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** Authentik's X-authentik-groups: group names separated by `|`. */
export function groupsFrom(value: string | undefined | null): string[] {
  return (value ?? "")
    .split("|")
    .map(group => group.trim())
    .filter(Boolean);
}

/** The viewer from a request's headers (`header` returns one by lower-case name). */
export function viewerFrom(header: (name: string) => string | undefined, moverGroups: readonly string[] = DEFAULT_MOVER_GROUPS): Viewer {
  const username = headerText(header("x-authentik-username"));
  const name = headerText(header("x-authentik-name")) ?? username;
  const groups = groupsFrom(header("x-authentik-groups"));
  return { username, name, canMove: username !== null && groups.some(group => moverGroups.includes(group)) };
}
