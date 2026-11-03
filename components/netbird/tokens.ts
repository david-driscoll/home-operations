/**
 * The NetBird PATs Pulumi holds, which one it drives the API with, and when
 * one is due for rotation (#2880; docs/plans/netbird-mirror.md, implementation
 * notes, "PATs and their rotation").
 *
 * Three tokens, in the order Pulumi prefers them:
 *
 *   1. `automation` — the admin service user stacks/netbird creates. Every
 *      NetBird call Pulumi makes uses it once it exists.
 *   2. `owner-pat` — the owner's own PAT, which stacks/netbird mints and
 *      rotates. Only the owner can mint a PAT for the owner, so the owner-side
 *      provider authenticates with this.
 *   3. `owner` — the 365-day PAT `/api/setup` returned when stacks/netbird-edge
 *      set the server up. Never rotated: nothing can re-run setup. Used only
 *      until (2) exists.
 *
 * Falling through the chain is what keeps the first run of stacks/netbird free
 * of a chicken-and-egg: it creates `automation` and `owner-pat` with the setup
 * PAT, and the next run switches to them. Skipping an expired token keeps a
 * lapsed one from locking Pulumi out of the very change that would rotate it.
 *
 * Import-free so node --test loads it without Pulumi.
 */

/** Paths within the `secrets` KV mount. */
export const NETBIRD_OWNER_BAO_PATH = "third-party-tokens/netbird/owner";
export const NETBIRD_OWNER_PAT_BAO_PATH = "third-party-tokens/netbird/owner-pat";
export const NETBIRD_AUTOMATION_BAO_PATH = "third-party-tokens/netbird/automation";

/** NetBird's ceiling for a PAT's lifetime. */
export const TOKEN_LIFETIME_DAYS = 365;
/** The alert and the Pulumi warning both start this long before a token expires. */
export const EXPIRY_WARNING_DAYS = 30;
/** A token with less than this left is not chosen: it would lapse mid-run. */
export const MIN_REMAINING_MS = 60 * 60 * 1000;

const DAY_MS = 86_400_000;

/** The fields of a token's OpenBao path that matter here. */
export interface StoredToken {
  personal_access_token?: string;
  /** RFC 3339. Absent on the setup PAT's path, which nothing recorded. */
  expires?: string;
}

export interface TokenCandidate {
  source: string;
  /** `undefined` when the path does not exist (yet). */
  token: StoredToken | undefined;
}

export interface SkippedToken {
  source: string;
  reason: "absent" | "empty" | "expired";
  detail: string;
}

export interface TokenChoice {
  source: string;
  token: string;
  skipped: SkippedToken[];
}

/** The first candidate that holds a PAT with more than MIN_REMAINING_MS left. Throws when none does. */
export function chooseToken(candidates: TokenCandidate[], now: Date): TokenChoice {
  const skipped: SkippedToken[] = [];
  for (const { source, token } of candidates) {
    if (!token) {
      skipped.push({ source, reason: "absent", detail: "not in OpenBao yet" });
      continue;
    }
    const pat = token.personal_access_token?.trim();
    if (!pat) {
      skipped.push({ source, reason: "empty", detail: "path exists but holds no personal_access_token" });
      continue;
    }
    const expires = token.expires ? Date.parse(token.expires) : Number.NaN;
    if (!Number.isNaN(expires) && expires - now.getTime() < MIN_REMAINING_MS) {
      skipped.push({ source, reason: "expired", detail: `expired ${token.expires}` });
      continue;
    }
    return { source, token: pat, skipped };
  }
  throw new Error(
    `No usable NetBird PAT:\n  - ${skipped.map(skip => `${skip.source}: ${skip.detail}`).join("\n  - ")}\n` +
      "Mint a new owner PAT by logging in as the break-glass owner (credentials at secrets/third-party-tokens/netbird/owner) and write it to secrets/third-party-tokens/netbird/owner-pat; see docs/plans/netbird-mirror.md.",
  );
}

/** The epoch second a token expires at; 0 when the date is absent or unreadable, which the alert reads as already expired. */
export function expiresAtSeconds(expires: string | undefined): number {
  const ms = expires ? Date.parse(expires) : Number.NaN;
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/** The tokens (name → epoch second) with less than `warningDays` left, soonest first. */
export function expiringTokens(expiry: Record<string, number>, now: Date, warningDays: number = EXPIRY_WARNING_DAYS): { name: string; daysLeft: number }[] {
  return Object.entries(expiry)
    .map(([name, seconds]) => ({ name, daysLeft: Math.floor((seconds * 1000 - now.getTime()) / DAY_MS) }))
    .filter(token => token.daysLeft < warningDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
