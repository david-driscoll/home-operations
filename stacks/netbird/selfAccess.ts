/**
 * Each person's devices reach each other (David, 2026-11-04): NetBird's
 * stand-in for Tailscale's `autogroup:self`, which it does not have.
 *
 * One group per human user, `self-<name>`, added to that user's auto groups,
 * and one policy from the group to itself. With the account's group
 * propagation on (index.ts, 1), every peer the user has or later registers
 * joins it, so a phone and a laptop of the same person see each other and
 * nobody else's.
 *
 * stacks/netbird reads the users live (GET /api/users) rather than from a
 * list here, so anyone who joins another way (an invite, the dashboard) gets
 * theirs on the stack's next run. Service users have no devices, and neither
 * does the break-glass owner stacks/netbird-edge bootstrapped; both are left
 * out.
 *
 * Pure, so `node --test` covers the naming. Relative imports only.
 */
import { createHash } from "node:crypto";

/** GET /api/users, the fields used here. */
export interface LiveUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  is_service_user?: boolean | null;
}

export interface SelfAccessEntry {
  userId: string;
  /** The Pulumi resource name: stable for the user's lifetime, whatever they are renamed to. */
  resourceName: string;
  /** The NetBird group name the dashboard shows. */
  groupName: string;
}

/** A short, stable digest of a user id. NetBird's ids for embedded-IdP users are base64 and long. */
export function userKey(userId: string, length = 12): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, length);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * One entry per human user other than the owner, sorted by group name. The group is named after the
 * user's name (else their email's local part, else their key); when two users
 * would share a name, each of those gets its key appended.
 */
export function selfAccessPlan(users: LiveUser[]): SelfAccessEntry[] {
  const humans = users.filter(user => !user.is_service_user && user.role !== "owner");
  const base = humans.map(user => ({
    user,
    stem: slug(user.name ?? "") || slug((user.email ?? "").split("@")[0]) || userKey(user.id, 6),
  }));
  const counts = new Map<string, number>();
  for (const { stem } of base) counts.set(stem, (counts.get(stem) ?? 0) + 1);
  return base
    .map(({ user, stem }) => ({
      userId: user.id,
      resourceName: `self-${userKey(user.id)}`,
      groupName: `self-${(counts.get(stem) ?? 0) > 1 ? `${stem}-${userKey(user.id, 6)}` : stem}`,
    }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName));
}
