/**
 * Drift guard between the tailnet's user grants and the NetBird client-access
 * policy (#2888). Pure, and checked by policyDrift.test.ts in CI.
 *
 * Every grant in stacks/unifi-network/acl-manager.ts whose `src` names users
 * (a member/admin autogroup or a group) must be either mirrored by an
 * ACCESS_RULES entry (`mirrors`) or listed in TAILSCALE_ONLY with the reason
 * it has no NetBird form. Server-to-server grants (tag sources) are out of
 * scope: servers stay on Tailscale.
 *
 * Grants are read from the source text rather than rendered, because rendering
 * needs the live tailnet. A grant is keyed by its name, or by `src -> dst` as
 * written when it has none.
 */

/** User-facing grants with no NetBird equivalent, and why. */
export const TAILSCALE_ONLY: Record<string, string> = {
  "forgejo-git-ssh": "git over SSH to tag:apps. NetBird routes the whole LAN, so opening :22 to members would open every host's sshd",
  "peer-relay": "Tailscale peer relays (app capability); NetBird runs its own relays",
  "member-drive-access": "Taildrive (app capability)",
  "shared-drive-access": "Taildrive (app capability)",
  "family-drive-access": "Taildrive (app capability)",
  "admin-drive-access": "Taildrive (app capability)",
  "media-manager-drive-access": "Taildrive (app capability)",
  "member-golink-defaults": "golink (app capability)",
  "member-tsidp-defaults": "tsidp claims (app capability); NetBird users get their group from their invite",
  "family-tsidp-defaults": "tsidp claims (app capability)",
  "friends-tsidp-defaults": "tsidp claims (app capability)",
  "tsidp-admin": "tsidp admin UI (app capability)",
  "tsidp-${role}-access": "tsidp role claims, one grant per Authentik role (app capability)",
  "admins-netbird-edge": "admin access to the NetBird VM itself, which deliberately stays off NetBird",
  "member-funnel-access": "Tailscale Funnel",
  "border0-pam-admin-access": "Tailscale PAM (Border0)",
  "autogroups.admin -> cluster.serviceNetwork, cluster.clusterNetwork, cluster.kubeApiIp": "kubectl and cluster networks stay on Tailscale (admin work)",
  "autogroups.admin -> tag.k8s, tag.operator": "Kubernetes API proxy impersonation (app capability)",
  "groups.friendsAndFamily -> tag.k8s, tag.operator": "Kubernetes API proxy impersonation (app capability)",
};

const USER_SOURCE = /autogroups\.(member|admin)\b|\bgroups\.|group:/;

/** A source that is a tag or a list of tags: a server, out of scope. */
const TAG_SOURCE = /^(?:\.\.\.)?(?:tag\.\w+|cluster\.tag|clusterTags|tagged\w*|["`]tag:[^"`]*["`])$/;

/** The text of the `{ … }` starting at `open`, braces balanced. */
function balancedObject(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

const entries = (list: string) =>
  list
    .split(",")
    .map(part => part.trim())
    .filter(part => part !== "");

/** The field as written: the entries of an array literal, or the bare expression when it is not one. */
function field(body: string, name: "src" | "dst"): { entries: string[] } | { expression: string } {
  const array = new RegExp(`\\b${name}:\\s*\\[([^\\]]*)\\]`).exec(body);
  if (array) return { entries: entries(array[1]) };
  return { expression: new RegExp(`\\b${name}:\\s*([^,}]*)`).exec(body)?.[1].trim() ?? "" };
}

const list = (body: string, name: "src" | "dst") => {
  const value = field(body, name);
  return "entries" in value ? value.entries : [value.expression];
};

interface GrantCall {
  key: string;
  src: string[];
  /** Why the guard cannot tell whether this grant is user-facing, if it cannot. */
  unreadable?: string;
}

const CALL = /setGrant\(\s*(?:(["`])((?:(?!\1)[\s\S])*)\1\s*,\s*)?\{/y;
const FORMS = '`setGrant("name", { src: [...] ... })` or `setGrant({ src: [...] ... })`';

/** Every `setGrant` call in `source`, read as far as the source text allows. */
function grantCalls(source: string): (GrantCall | { unparsed: string })[] {
  const calls: (GrantCall | { unparsed: string })[] = [];
  for (const start of source.matchAll(/setGrant\(/g)) {
    CALL.lastIndex = start.index;
    const match = CALL.exec(source);
    if (!match) {
      calls.push({ unparsed: source.slice(start.index).split("\n")[0].trim() });
      continue;
    }
    const body = balancedObject(source, match.index + match[0].length - 1);
    const src = field(body, "src");
    const users = list(body, "src").filter(entry => !entry.startsWith("..."));
    const key = match[2] ?? `${users.join(", ")} -> ${list(body, "dst").join(", ")}`;
    if (!("entries" in src)) {
      calls.push({ key, src: [src.expression], unreadable: TAG_SOURCE.test(src.expression) ? undefined : `src \`${src.expression}\` is not an array literal` });
      continue;
    }
    const unknown = src.entries.find(entry => !USER_SOURCE.test(entry) && !TAG_SOURCE.test(entry));
    calls.push({ key, src: src.entries, unreadable: unknown === undefined ? undefined : `src entry \`${unknown}\` is neither a user source nor a tag` });
  }
  return calls;
}

/** Keys of every `setGrant` call in `source` whose src is a user, group or role autogroup. */
export function userFacingGrants(source: string): string[] {
  return grantCalls(source).flatMap(call => ("key" in call && call.src.some(entry => USER_SOURCE.test(entry)) ? [call.key] : []));
}

/**
 * Every `setGrant` call the guard cannot classify, so it fails closed: a call
 * not written in one of the two inline forms, a src that is not an array
 * literal of tags, or a src entry that is neither a user source nor a tag.
 */
export function unreadableGrants(source: string): string[] {
  return grantCalls(source).flatMap(call => {
    if ("unparsed" in call) return [`${call.unparsed} is not ${FORMS}`];
    return call.unreadable === undefined ? [] : [`\`${call.key}\`: ${call.unreadable}`];
  });
}

/** Every grant with no twin or exemption, and every twin or exemption whose grant is gone. */
export function driftProblems(grants: string[], rules: { mirrors: string[] }[], tailscaleOnly: Record<string, string>): string[] {
  const mirrored = new Set(rules.flatMap(rule => rule.mirrors));
  const problems = grants.filter(grant => !mirrored.has(grant) && !(grant in tailscaleOnly)).map(grant => `Tailscale grant \`${grant}\` has no NetBird twin in stacks/netbird/policy.ts and no TAILSCALE_ONLY entry`);
  for (const key of [...mirrored, ...Object.keys(tailscaleOnly)]) {
    if (!grants.includes(key)) problems.push(`\`${key}\` is mirrored or exempted, but that Tailscale grant no longer exists`);
  }
  return problems;
}
