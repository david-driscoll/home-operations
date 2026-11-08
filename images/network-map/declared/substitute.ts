/**
 * `${VAR}` substitution, as the two renderers of a definition.yaml do it:
 *
 *   - Flux postBuild (Kubernetes): `${VAR}`, and envsubst's defaults
 *     `${VAR:=default}` / `${VAR:-default}` / `${VAR=default}` / `${VAR-default}`,
 *     which may nest (`${TAILSCALE_HOST:=${APP}}`);
 *   - components/DockgeLxc.ts (Docker): plain `${name}` replacements.
 *
 * Unlike Flux, a variable with no value and no default is LEFT IN PLACE and
 * reported, not replaced with an empty string: most such variables live only
 * in SOPS (kubernetes/flux/meta/cluster-secrets.sops.yaml), and an empty
 * hostname would look like a real one.
 */

const INNERMOST = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[=-])([^${}]*))?\}/g;

export interface Substituted {
  text: string;
  /** Variables with no value and no default, sorted. */
  unresolved: string[];
}

export function substitute(text: string, vars: Record<string, string | undefined>): Substituted {
  const unresolved = new Set<string>();
  // Placeholders (private-use U+E000, which no YAML here holds) keep an unresolved `${X}` from being matched again, and from
  // stopping the outer `${A:=${X}}` from resolving to its own value.
  const kept: string[] = [];
  let current = text;
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    current = current.replace(INNERMOST, (whole, name: string, op: string | undefined, fallback: string | undefined) => {
      changed = true;
      const value = vars[name];
      const empty = value === undefined || (op?.startsWith(":") && value === "");
      if (!empty) return value as string;
      if (op !== undefined) return fallback ?? "";
      unresolved.add(name);
      kept.push(whole);
      return `\uE000${kept.length - 1}\uE000`;
    });
    if (!changed) break;
  }
  const restore = (s: string): string => s.replace(/\uE000(\d+)\uE000/g, (_, i: string) => restore(kept[Number(i)]));
  return { text: restore(current), unresolved: [...unresolved].sort() };
}
