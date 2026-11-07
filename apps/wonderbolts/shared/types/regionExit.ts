/**
 * The region picker's view of a region exit (GLOSSARY.md), as the server
 * builds it from each region exit's agent and the pages show it. The agent is
 * the picker sidecar in the region exit's pod
 * (kubernetes/apps/netbird-system/region-exits/picker.ts); these mirror its
 * `Status`, plus `unreachable` for an agent that does not answer.
 */

export type Overlay = "tailscale" | "netbird";

/**
 * Whether family can use a region exit, as the agent works it out
 * (overlays.ts availabilityOf), plus `unreachable`: the agent did not answer.
 */
export type Availability = { state: "online" } | { state: "degraded"; offlineOn: Overlay } | { state: "offline"; reason: "tunnel" | "overlays" } | { state: "unreachable" };

/** A Mullvad country, optionally narrowed to a city, in servers.json's spelling. */
export interface Region {
  country: string;
  city: string | null;
}

/** A country Mullvad offers WireGuard servers in, and its cities. */
export interface RegionChoice {
  country: string;
  cities: string[];
}

/** Who last moved a region exit, and when (ISO 8601). `by` is null when nobody is recorded. */
export interface LastMove {
  by: string | null;
  at: string;
}

/** One region exit, everything the pages show about it. */
export interface RegionExitView {
  name: string;
  availability: Availability;
  region: Region | null;
  /** Null when the agent did not answer. */
  tunnel: { up: boolean; status: string | null } | null;
  /** Where traffic leaves from, by gluetun's public-IP lookup; null while it has none. */
  egress: { country: string | null; city: string | null; ip: string | null } | null;
  /** People on it now; null when the agent cannot tell, or did not answer. */
  activeClients: number | null;
  lastMove: LastMove | null;
}

/** Whoever is looking, from Authentik's forward-auth headers. */
export interface Viewer {
  username: string | null;
  /** Their display name, falling back to the username. */
  name: string | null;
  /** In family or admins: may move a region exit. Friends only look. */
  canMove: boolean;
}

/** What a move sends. */
export interface MoveRequest {
  country: string;
  city?: string | null;
  /** Set once the person has been told who is on it and still wants to move it. */
  confirm?: boolean;
}

/** A move the agent made. */
export interface MoveDone {
  region: Region;
  outcome: string;
}

/** The agent's answer when people are on the region exit and the move was not confirmed (HTTP 409). */
export interface MoveNeedsConfirm {
  error: string;
  activeClients: number | null;
  confirm: true;
}
