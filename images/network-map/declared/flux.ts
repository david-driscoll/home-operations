/**
 * Whether Flux actually applies a file under kubernetes/apps: the test the
 * loader puts every app's ks.yaml through, so a definition whose ks.yaml is
 * commented out of its parent kustomization.yaml (`# - ./karakeep/ks.yaml`)
 * is not declared.
 *
 * kubernetes/flux/cluster/ks.yaml's `cluster-apps` applies ./kubernetes/apps,
 * which has no kustomization.yaml of its own, so kustomize-controller
 * generates one: every manifest under it, except that a directory holding a
 * kustomization.yaml is taken as one resource and not walked into (each
 * namespace directory). Below that, kustomize applies exactly what each
 * kustomization.yaml lists under `resources:`, a file or a directory (that
 * directory's kustomization.yaml), relative to itself.
 *
 * So a file is applied when some kustomization.yaml in a directory above it
 * lists it and that directory is itself applied, up to the root; or, failing
 * any listing, when no directory between it and the root has a
 * kustomization.yaml (the generator reaches it). Pure: the kustomizations
 * come in as a map.
 */
import { posix } from "node:path";
import { parseAllDocuments } from "yaml";

/** What kubernetes/flux/cluster/ks.yaml's `cluster-apps` applies. */
export const FLUX_APPS_ROOT = "kubernetes/apps";

/** Repo-relative directory -> the resources its kustomization.yaml lists, resolved to repo-relative paths. */
export type KustomizationIndex = Map<string, Set<string>>;

const clean = (p: string) => posix.normalize(p).replace(/\/+$/, "");

/** A kustomization.yaml's `resources:` as repo-relative paths. Remote (URL) resources are dropped. */
export function kustomizationResources(dir: string, text: string): string[] {
  const doc = parseAllDocuments(text)[0]?.toJS() as { resources?: unknown[] } | undefined;
  return (doc?.resources ?? []).filter((r): r is string => typeof r === "string" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(r)).map(r => clean(posix.join(dir, r)));
}

export function indexKustomizations(files: { dir: string; text: string }[]): KustomizationIndex {
  return new Map(files.map(f => [clean(f.dir), new Set(kustomizationResources(clean(f.dir), f.text))]));
}

/** `dir` and each directory above it, up to and including `root`. */
function upTo(dir: string, root: string): string[] {
  const out: string[] = [];
  for (let d = clean(dir); ; d = posix.dirname(d)) {
    out.push(d);
    if (d === root || d === "." || d === "/") return d === root ? out : [];
  }
}

/** Whether Flux applies the file or directory `path` (repo-relative, under `root`). */
export function fluxApplies(path: string, index: KustomizationIndex, root: string = FLUX_APPS_ROOT): boolean {
  const target = clean(path);
  if (target === root) return true;
  const above = upTo(posix.dirname(target), root);
  if (above.length === 0) return false;
  for (const dir of above) if (index.get(dir)?.has(target)) return fluxApplies(dir, index, root);
  // Nothing lists it: only the generated root kustomization can reach it, and
  // it stops at the first directory with a kustomization.yaml.
  return above.every(dir => !index.has(dir));
}
