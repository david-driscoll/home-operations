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
  "member-exit-node": "mirrored by the exit-<host> routes (stacks/netbird/index.ts), not by a policy",
  "peer-relay": "Tailscale peer relays (app capability); NetBird runs its own relays",
  "member-drive-access": "Taildrive (app capability)",
  "shared-drive-access": "Taildrive (app capability)",
  "family-drive-access": "Taildrive (app capability)",
  "admin-drive-access": "Taildrive (app capability)",
  "media-manager-drive-access": "Taildrive (app capability)",
  "member-golink-defaults": "golink (app capability)",
  "member-tsidp-defaults": "tsidp claims (app capability); NetBird logins get groups from Authentik",
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

/** The text of the `{ … }` starting at `open`, braces balanced. */
function balancedObject(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

const list = (body: string, field: "src" | "dst") =>
  (new RegExp(`\\b${field}:\\s*\\[([^\\]]*)\\]`).exec(body)?.[1] ?? "")
    .split(",")
    .map(part => part.trim())
    .filter(part => part !== "");

/** Keys of every `setGrant` call in `source` whose src is a user, group or role autogroup. */
export function userFacingGrants(source: string): string[] {
  const keys: string[] = [];
  const call = /setGrant\(\s*(?:(["`])((?:(?!\1)[\s\S])*)\1\s*,\s*)?\{/g;
  for (let match = call.exec(source); match; match = call.exec(source)) {
    const body = balancedObject(source, match.index + match[0].length - 1);
    const src = list(body, "src");
    if (!src.some(entry => USER_SOURCE.test(entry))) continue;
    const users = src.filter(entry => !entry.startsWith("..."));
    keys.push(match[2] ?? `${users.join(", ")} -> ${list(body, "dst").join(", ")}`);
  }
  return keys;
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
