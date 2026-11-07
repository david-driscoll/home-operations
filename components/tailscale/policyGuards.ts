import * as parser from "jsonc-parser";

type Grant = { src?: string[]; dst?: string[]; ip?: string[]; via?: string[] };

const INTERNET = "autogroup:internet";

function parseGrants(policyJson: string): Grant[] {
  const policy = parser.parse(policyJson, [], { allowTrailingComma: true }) as { grants?: Grant[] };
  return policy?.grants ?? [];
}

/**
 * The ports of `ports` that NO grant in `policyJson` opens from `src` to `dst`.
 * Reads the rendered policy (HuJSON), not the grant that is supposed to provide
 * the path, so a later edit that drops or narrows it some other way still shows
 * up. A grant with `ip: ["*"]` covers every port.
 */
export function missingGrantPorts(policyJson: string, src: string, dst: string, ports: readonly string[]): string[] {
  const grants = parseGrants(policyJson);
  return ports.filter(port => !grants.some(g => (g.src ?? []).includes(src) && (g.dst ?? []).includes(dst) && ((g.ip ?? []).includes(port) || (g.ip ?? []).includes("*"))));
}

/** Throws unless every port in `ports` is granted from `src` to `dst`; `why` explains what depends on it. */
export function assertGrantPath(policyJson: string, src: string, dst: string, ports: readonly string[], why: string): void {
  const missing = missingGrantPorts(policyJson, src, dst, ports);
  if (missing.length > 0) {
    throw new Error(`Tailnet policy no longer grants ${src} -> ${dst} ${missing.join(", ")}. ${why} Refusing to write the policy.`);
  }
}

/**
 * Whether `principal` -- every selector it matches, e.g. a friends-and-family
 * user is `["autogroup:member", "group:fnf"]` -- may send internet traffic
 * through an exit node carrying `exitNodeTags`. Using an exit node is a grant
 * to autogroup:internet; `via` narrows it to exit nodes with one of its tags,
 * and an absent or empty `via` allows any. Grants are a union, so a single
 * grant without `via` opens every exit node.
 *
 * Tailscale's policy `tests` can express neither autogroup:internet nor `via`,
 * so this reads the rendered policy instead.
 */
export function canUseExitNode(policyJson: string, principal: readonly string[], exitNodeTags: readonly string[]): boolean {
  return parseGrants(policyJson).some(g => {
    const via = g.via ?? [];
    return (g.src ?? []).some(s => principal.includes(s)) && (g.dst ?? []).includes(INTERNET) && (via.length === 0 || via.some(t => exitNodeTags.includes(t)));
  });
}

/**
 * The tags an ordinary internet grant's `via` should name: `exitNodeTag`
 * (the tag that marks an exit node by name), then every tag in `approvers`
 * (autoApprovers.exitNode) except `excluded`. Approvers that are not tags
 * (users, groups, autogroups) cannot appear in `via` and are dropped.
 */
export function ordinaryExitNodeTags(exitNodeTag: string, approvers: readonly string[], excluded: readonly string[]): string[] {
  return [...new Set([exitNodeTag, ...approvers.filter(a => a.startsWith("tag:") && !excluded.includes(a))])];
}

/** Throws unless canUseExitNode is `expected`; `who` names the principal in the message, `why` explains what depends on it. */
export function assertExitNodeAccess(policyJson: string, who: string, principal: readonly string[], exitNodeTags: readonly string[], expected: boolean, why: string): void {
  if (canUseExitNode(policyJson, principal, exitNodeTags) === expected) return;
  const what = expected ? "can no longer use" : "can use";
  throw new Error(`Tailnet policy: ${who} ${what} an exit node tagged ${exitNodeTags.join(", ")}. ${why} Refusing to write the policy.`);
}
