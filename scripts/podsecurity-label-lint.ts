#!/usr/bin/env node
/**
 * podsecurity-label-lint -- fails when a kustomization means to put a
 * PodSecurity label on its Namespace and the rendered Namespace does not
 * carry it (#3162).
 *
 *   node scripts/podsecurity-label-lint.ts [root]     # root defaults to kubernetes
 *   mise run podsecurity-label-lint
 *
 * THE BUG IT GUARDS: a `metadata.labels` block on a kustomization.yaml looks
 * like it labels the namespace, and kustomize silently ignores it. Six
 * namespaces (netbird-system among them) rendered unlabelled that way. Today
 * that changes nothing -- talos/control-plane/10-cluster.yaml deletes the
 * PodSecurity admission config, so the built-in default is privileged -- but
 * the day an enforcing default returns, every privileged pod in those
 * namespaces would be refused.
 *
 * HOW: every kustomization.yaml under the root is read for intent -- any
 * `pod-security.kubernetes.io/*` key with a value, anywhere in the file,
 * including inside inline `patches` (both strategic-merge and JSON6902, whose
 * `path` spells the key as `.../pod-security.kubernetes.io~1enforce`), and,
 * recursively, in every component it lists under `components:`. Each
 * Kustomization (not Component: kustomize cannot build one on its own) that
 * states an intent is rendered with `kubectl kustomize --load-restrictor
 * LoadRestrictionsNone` (like Flux's kustomize-controller), and every
 * Namespace it renders must carry each intended label with the intended
 * value. kubectl comes from .config/mise.toml. A render that fails is the
 * linter failing (exit 2), never a pass.
 *
 * Checks, as they appear in output:
 *
 *   PSA-MISSING       a rendered Namespace lacks an intended label=value.
 *   PSA-NO-NAMESPACE  the kustomization asks for a label but renders no
 *                     Namespace to put it on.
 *
 * Exit codes match eso-values-lint: 0 clean, 1 a finding, 2 the linter could
 * not run.
 *
 * KNOWN LIMITS: intent is not read from patch FILES (`patches: - path:`) or
 * from a Flux Kustomization's `commonMetadata`. Neither carries a PodSecurity
 * label in this repo today.
 *
 * THE REPO PATTERN it is checked against is the
 * kubernetes/components/privileged-namespace component.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse, parseAllDocuments } from "yaml";

const LABEL_PREFIX = "pod-security.kubernetes.io/";
// How a JSON6902 path spells the prefix: `/` escapes to `~1`.
const JSON_POINTER_PREFIX = "pod-security.kubernetes.io~1";

const KUSTOMIZATION_FILE_NAMES = ["kustomization.yaml", "kustomization.yml", "Kustomization"];

export const CHECK_MISSING = "PSA-MISSING";
export const CHECK_NO_NAMESPACE = "PSA-NO-NAMESPACE";
export type Check = typeof CHECK_MISSING | typeof CHECK_NO_NAMESPACE;

export const EXIT_OK = 0;
export const EXIT_FINDING = 1;
export const EXIT_FAILURE = 2; // the linter itself could not run

const MISSING_ADVICE = "kustomize ignores `metadata.labels` on a kustomization; list ../../components/privileged-namespace under `components:` instead";

export interface Finding {
  file: string;
  check: Check;
  /** The rendered Namespace; absent for PSA-NO-NAMESPACE. */
  namespace?: string;
  /** `key=value`; absent for PSA-NO-NAMESPACE. */
  label?: string;
  msg: string;
}

/** The outcome of a run: what was rendered, and what was wrong. */
export interface Report {
  findings: Finding[];
  /** Kustomizations that stated an intent and were rendered. */
  checked: number;
}

interface Kustomization {
  doc: unknown;
  isComponent: boolean;
  components: string[];
}

export function formatFinding(f: Finding): string {
  return `${f.file}: [${f.check}] ${f.msg}`;
}

/** Runs the lint over root and returns the exit code. */
export function run(root: string, stdout: (line: string) => void, stderr: (line: string) => void): number {
  let rep: Report;
  try {
    rep = scan(root);
  } catch (err) {
    stderr(`podsecurity-label-lint: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_FAILURE;
  }
  for (const f of rep.findings) stdout(formatFinding(f));
  stdout(`podsecurity-label-lint: ${rep.checked} kustomization(s) with PodSecurity intent rendered, ${rep.findings.length} finding(s)`);
  return rep.findings.length > 0 ? EXIT_FINDING : EXIT_OK;
}

/** Throws when a file cannot be read or parsed, or an intended render fails. */
export function scan(root: string): Report {
  const rep: Report = { findings: [], checked: 0 };
  const files = findKustomizationFiles(root).sort();
  for (const file of files) {
    const k = withFile(file, () => readKustomization(file));
    if (k.isComponent) continue; // checked through each consumer
    const intended = new Map<string, string>();
    withFile(file, () => collectPodSecurityIntent(file, k, intended, new Set()));
    if (intended.size === 0) continue;
    rep.checked++;
    rep.findings.push(...withFile(file, () => missingLabels(file, intended)));
  }
  return rep;
}

function withFile<T>(file: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

function findKustomizationFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findKustomizationFiles(path));
    else if (KUSTOMIZATION_FILE_NAMES.includes(entry.name)) found.push(path);
  }
  return found;
}

function readKustomization(file: string): Kustomization {
  const doc: unknown = parse(readFileSync(file, "utf8"));
  const k: Kustomization = { doc, isComponent: false, components: [] };
  if (isRecord(doc)) {
    k.isComponent = doc.kind === "Component";
    if (Array.isArray(doc.components)) k.components = doc.components.filter((c): c is string => typeof c === "string");
  }
  return k;
}

/**
 * Gathers every PodSecurity label the kustomization at file asks for,
 * including through the components it lists.
 */
function collectPodSecurityIntent(file: string, k: Kustomization, labels: Map<string, string>, seen: Set<string>): void {
  const abs = resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);

  walkPodSecurityLabels(k.doc, labels);
  for (const c of k.components) {
    const dir = join(dirname(file), c);
    const compFile = KUSTOMIZATION_FILE_NAMES.map(name => join(dir, name)).find(path => existsSync(path));
    if (compFile === undefined) continue; // not a local directory; kustomize will report it on render
    const ck = withFile(compFile, () => readKustomization(compFile));
    collectPodSecurityIntent(compFile, ck, labels, seen);
  }
}

/**
 * Walks a parsed YAML tree. String values are parsed again, because an
 * inline `patch: |-` holds YAML of its own.
 */
function walkPodSecurityLabels(node: unknown, labels: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (const v of node) walkPodSecurityLabels(v, labels);
  } else if (isRecord(node)) {
    if (typeof node.path === "string") {
      const i = node.path.indexOf(JSON_POINTER_PREFIX);
      if (i >= 0 && typeof node.value === "string") labels.set(LABEL_PREFIX + node.path.slice(i + JSON_POINTER_PREFIX.length), node.value);
    }
    for (const [key, v] of Object.entries(node)) {
      if (typeof v === "string" && key.startsWith(LABEL_PREFIX)) {
        labels.set(key, v);
        continue;
      }
      walkPodSecurityLabels(v, labels);
    }
  } else if (typeof node === "string") {
    if (!node.includes(LABEL_PREFIX) && !node.includes(JSON_POINTER_PREFIX)) return;
    let inner: unknown;
    try {
      inner = parse(node);
    } catch {
      return; // prose that mentions the prefix, not YAML
    }
    if (typeof inner !== "string") walkPodSecurityLabels(inner, labels);
  }
}

/** Renders the kustomization at file with `kubectl kustomize`. */
function render(file: string): unknown[] {
  const dir = resolve(dirname(file));
  const out = spawnSync("kubectl", ["kustomize", "--load-restrictor", "LoadRestrictionsNone", dir], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (out.error) throw new Error(`render: kubectl kustomize: ${out.error.message}`);
  if (out.status !== 0) throw new Error(`render: kubectl kustomize exited ${out.status ?? out.signal}: ${out.stderr.trim()}`);
  const docs = parseAllDocuments(out.stdout);
  const resources: unknown[] = [];
  for (const doc of docs) {
    if (doc.errors.length > 0) throw new Error(`render: unparsable output: ${doc.errors[0].message}`);
    resources.push(doc.toJS());
  }
  return resources;
}

/** Renders the kustomization at file and reports each intended label a rendered Namespace lacks. */
function missingLabels(file: string, intended: Map<string, string>): Finding[] {
  const keys = [...intended.keys()].sort();
  const found: Finding[] = [];
  let namespaces = 0;
  for (const res of render(file)) {
    if (!isRecord(res) || res.kind !== "Namespace") continue;
    namespaces++;
    const metadata = isRecord(res.metadata) ? res.metadata : {};
    const name = String(metadata.name ?? "");
    const got = isRecord(metadata.labels) ? metadata.labels : {};
    for (const key of keys) {
      const want = intended.get(key);
      if (got[key] === want) continue;
      const label = `${key}=${want}`;
      found.push({ file, check: CHECK_MISSING, namespace: name, label, msg: `Namespace ${name} renders without ${label} (${MISSING_ADVICE})` });
    }
  }
  if (namespaces === 0) found.push({ file, check: CHECK_NO_NAMESPACE, msg: "asks for PodSecurity labels but renders no Namespace" });
  return found;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

if (import.meta.main) {
  process.exit(run(process.argv[2] ?? "kubernetes", console.log, console.error));
}
