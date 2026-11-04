/**
 * The pure half of `mise run netbird:invite` (scripts/netbird-invite.ts,
 * docs/runbooks/netbird-client-onboarding.md): the arguments, the request,
 * the credential chain and the link. Tested in invite.test.ts.
 *
 * NetBird logs people in with its built-in IdP (embedded Dex, local users),
 * so a person joins by invite: `POST /api/users/invites` (management v0.82.0,
 * shared/management/http/api/openapi.yml, UserInviteCreateRequest) returns an
 * `invite_token`, and the dashboard's public `/invite?token=` page is where
 * they set their password. The user exists only once they accept.
 *
 * Relative imports only, so node --test loads it with no npm install (CI).
 */
import type { StoredToken, TokenCandidate } from "../../components/netbird/tokens.ts";
import { USER_GROUPS } from "./policy.ts";

/** NetBird's default, 72 hours: long enough to reach someone, short enough that a leaked link soon dies. */
export const INVITE_EXPIRES_SECONDS = 72 * 60 * 60;

export const INVITE_USAGE = `usage: mise run netbird:invite [--dry-run] <email> "<name>" <${USER_GROUPS.join("|")}>`;

export interface InviteArgs {
  email: string;
  name: string;
  group: string;
  /** Look the group up and show the request, but send nothing. */
  dryRun: boolean;
}

/** Deliberately loose: one `@`, no spaces, a dot in the domain. NetBird checks the rest. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseInviteArgs(argv: string[]): InviteArgs {
  const flags = argv.filter(arg => arg.startsWith("--"));
  const unknown = flags.filter(flag => flag !== "--dry-run");
  if (unknown.length > 0) throw new Error(`unknown option ${unknown.join(", ")}\n${INVITE_USAGE}`);
  const positional = argv.filter(arg => !arg.startsWith("--"));
  if (positional.length !== 3) throw new Error(`expected 3 arguments, got ${positional.length}\n${INVITE_USAGE}`);
  const [email, name, group] = positional.map(arg => arg.trim());
  if (!EMAIL.test(email)) throw new Error(`"${email}" is not an email address. Use the person's Authentik email, so nbidp's email_link matches them.`);
  if (!name) throw new Error(`the name is empty\n${INVITE_USAGE}`);
  if (!USER_GROUPS.includes(group)) throw new Error(`"${group}" is not a user group. Pick one of: ${USER_GROUPS.join(", ")}`);
  return { email, name, group, dryRun: flags.includes("--dry-run") };
}

/** GET /api/groups, the fields used here. */
export interface NamedGroup {
  id: string;
  name: string;
}

export function findGroupId(groups: NamedGroup[], name: string): string {
  const matches = groups.filter(group => group.name === name);
  if (matches.length === 0) throw new Error(`NetBird has no group "${name}" yet. stacks/netbird creates the user groups; run it first.`);
  if (matches.length > 1) throw new Error(`NetBird has ${matches.length} groups named "${name}"; delete the extra one in the dashboard.`);
  return matches[0].id;
}

/** POST /api/users/invites body. */
export interface InviteRequest {
  email: string;
  name: string;
  role: "user";
  auto_groups: string[];
  expires_in: number;
}

/**
 * A regular user (no dashboard: the account has `regularUsersViewBlocked`)
 * whose peers all join `groupId`, which is what the client-access policy and
 * nbidp key on.
 */
export function inviteRequest(args: { email: string; name: string; groupId: string }): InviteRequest {
  return { email: args.email, name: args.name, role: "user", auto_groups: [args.groupId], expires_in: INVITE_EXPIRES_SECONDS };
}

/**
 * The link to send. `invite_token` is a bare token (`nbi_…`), not a URL; the
 * dashboard builds the link as `<its origin>/invite?token=<token>`
 * (netbirdio/dashboard src/modules/users/UserInviteModal.tsx), and here the
 * dashboard shares the management URL's host.
 */
export function inviteUrl(managementUrl: string, token: string | undefined): string {
  if (!token) throw new Error("NetBird returned no invite_token; regenerate the invite in the dashboard (Team → Users → Invites)");
  return `${managementUrl.replace(/\/+$/, "")}/invite?token=${encodeURIComponent(token)}`;
}

/**
 * The environment .config/fnox.toml's `netbird` profile fills in, as the
 * candidates components/netbird/tokens.ts chooseToken walks: the same order
 * globals.netbirdApi uses. An unset variable is a path that does not exist.
 */
export function candidatesFromEnv(env: Record<string, string | undefined>): TokenCandidate[] {
  const stored = (pat: string | undefined, expires: string | undefined): StoredToken | undefined => (pat?.trim() ? { personal_access_token: pat, expires: expires?.trim() || undefined } : undefined);
  return [
    { source: "automation", token: stored(env.NETBIRD_AUTOMATION_PAT, env.NETBIRD_AUTOMATION_EXPIRES) },
    { source: "owner-pat", token: stored(env.NETBIRD_OWNER_PAT, env.NETBIRD_OWNER_PAT_EXPIRES) },
    { source: "owner", token: stored(env.NETBIRD_SETUP_PAT, undefined) },
  ];
}
