import * as parser from "jsonc-parser";

type Grant = { src?: string[]; dst?: string[]; ip?: string[] };

/**
 * The ports of `ports` that NO grant in `policyJson` opens from `src` to `dst`.
 * Reads the rendered policy (HuJSON), not the grant that is supposed to provide
 * the path, so a later edit that drops or narrows it some other way still shows
 * up. A grant with `ip: ["*"]` covers every port.
 */
export function missingGrantPorts(policyJson: string, src: string, dst: string, ports: readonly string[]): string[] {
  const policy = parser.parse(policyJson, [], { allowTrailingComma: true }) as { grants?: Grant[] };
  const grants = policy?.grants ?? [];
  return ports.filter(port => !grants.some(g => (g.src ?? []).includes(src) && (g.dst ?? []).includes(dst) && ((g.ip ?? []).includes(port) || (g.ip ?? []).includes("*"))));
}

/** Throws unless every port in `ports` is granted from `src` to `dst`; `why` explains what depends on it. */
export function assertGrantPath(policyJson: string, src: string, dst: string, ports: readonly string[], why: string): void {
  const missing = missingGrantPorts(policyJson, src, dst, ports);
  if (missing.length > 0) {
    throw new Error(`Tailnet policy no longer grants ${src} -> ${dst} ${missing.join(", ")}. ${why} Refusing to write the policy.`);
  }
}
