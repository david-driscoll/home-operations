/**
 * Tests for scripts/podsecurity-label-lint.ts (#3162). Each builds a small
 * kubernetes/ tree in a temp dir and renders it with the real
 * `kubectl kustomize`, so kubectl (from mise) must be on PATH.
 *
 *   node --test scripts/podsecurity-label-lint.test.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { CHECK_MISSING, CHECK_NO_NAMESPACE, EXIT_FAILURE, EXIT_FINDING, EXIT_OK, type Report, run, scan } from "./podsecurity-label-lint.ts";

// The Namespace every app namespace gets from components/common.
const fixtureNamespace = `apiVersion: v1
kind: Namespace
metadata:
  name: not-used
`;

const fixtureCommon = `apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
resources:
  - ./namespace.yaml
`;

// The shape of kubernetes/components/privileged-namespace, with the patch
// target left open so a test can aim it at the wrong kind.
function privilegedComponent(kind: string): string {
  return `apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
patches:
  - target:
      kind: ${kind}
    patch: |-
      apiVersion: v1
      kind: ${kind}
      metadata:
        name: not-used
        labels:
          pod-security.kubernetes.io/enforce: privileged
`;
}

// A namespace kustomization that pulls in common plus the given components.
function namespaceKustomization(ns: string, ...components: string[]): string {
  let body = `apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nnamespace: ${ns}\ncomponents:\n  - ../../components/common\n`;
  for (const c of components) body += `  - ../../components/${c}\n`;
  return body;
}

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// Lays down components/common plus the given files (path relative to the
// root -> body), and returns the root.
function writeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "podsecurity-label-lint-"));
  roots.push(root);
  const all: Record<string, string> = {
    "components/common/kustomization.yaml": fixtureCommon,
    "components/common/namespace.yaml": fixtureNamespace,
    ...files,
  };
  for (const [name, body] of Object.entries(all)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  return root;
}

function scanTree(files: Record<string, string>): Report {
  return scan(writeTree(files));
}

function appFile(ns: string): string {
  return join("apps", ns, "kustomization.yaml");
}

const enforcePrivilegedOnTheKustomization = "metadata:\n  labels:\n    pod-security.kubernetes.io/enforce: privileged\n";

// The bug in #3162: kustomize ignores `metadata.labels` on a Kustomization
// file, so the Namespace renders without the label it was meant to carry.
test("metadata.labels on the kustomization is a finding", () => {
  const rep = scanTree({ [appFile("netbird-system")]: namespaceKustomization("netbird-system") + enforcePrivilegedOnTheKustomization });
  assert.equal(rep.findings.length, 1, JSON.stringify(rep.findings));
  const [f] = rep.findings;
  assert.equal(f.check, CHECK_MISSING);
  assert.equal(f.namespace, "netbird-system");
  assert.equal(f.label, "pod-security.kubernetes.io/enforce=privileged");
  assert.ok(f.file.endsWith(appFile("netbird-system")), `finding names the wrong file: ${f.file}`);
});

// The repo pattern: the privileged-namespace component. Its intent is read
// through the consumer's `components:` list, and it renders, so it is clean.
// The component itself is never built on its own (kustomize cannot).
test("the privileged-namespace component is clean", () => {
  const rep = scanTree({
    "components/privileged-namespace/kustomization.yaml": privilegedComponent("Namespace"),
    [appFile("kube-system")]: namespaceKustomization("kube-system", "privileged-namespace"),
  });
  assert.deepEqual(rep.findings, []);
  assert.equal(rep.checked, 1, "want 1 kustomization rendered (the consumer)");
});

// A component whose patch misses the Namespace: the consumer carries the
// intent, so the consumer is what gets reported.
test("a component that misses the Namespace is a finding on its consumer", () => {
  const rep = scanTree({
    "components/privileged-namespace/kustomization.yaml": privilegedComponent("ServiceAccount"),
    [appFile("kube-system")]: namespaceKustomization("kube-system", "privileged-namespace"),
  });
  assert.equal(rep.findings.length, 1, JSON.stringify(rep.findings));
  assert.equal(rep.findings[0].label, "pod-security.kubernetes.io/enforce=privileged");
  assert.ok(rep.findings[0].file.endsWith(appFile("kube-system")));
});

// An inline JSON patch on the Namespace renders too.
test("an inline JSON patch on the Namespace is clean", () => {
  const rep = scanTree({
    [appFile("kube-system")]: `${namespaceKustomization("kube-system")}patches:
  - target:
      kind: Namespace
    patch: |-
      - op: add
        path: /metadata/labels
        value:
          pod-security.kubernetes.io/enforce: privileged
`,
  });
  assert.deepEqual(rep.findings, []);
});

// A JSON pointer spells the label's `/` as `~1`. Here it lands on an
// annotation, which PodSecurity admission does not read.
test("a JSON pointer to a label key is read as intent", () => {
  const rep = scanTree({
    [appFile("kube-system")]: `${namespaceKustomization("kube-system")}patches:
  - target:
      kind: Namespace
    patch: |-
      - op: add
        path: /metadata/annotations
        value: {}
      - op: add
        path: /metadata/annotations/pod-security.kubernetes.io~1warn
        value: restricted
`,
  });
  assert.equal(rep.findings.length, 1, JSON.stringify(rep.findings));
  assert.equal(rep.findings[0].label, "pod-security.kubernetes.io/warn=restricted");
});

// Intent with no Namespace to put it on.
test("intent without a Namespace is a finding", () => {
  const rep = scanTree({
    [appFile("kube-system")]: `apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\n${enforcePrivilegedOnTheKustomization}`,
  });
  assert.equal(rep.findings.length, 1, JSON.stringify(rep.findings));
  assert.equal(rep.findings[0].check, CHECK_NO_NAMESPACE);
});

// Kustomizations that ask for nothing are never rendered, let alone reported:
// this one would fail to build if it were.
test("a kustomization without intent is ignored", () => {
  const rep = scanTree({
    [appFile("default")]: "apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nnamespace: default\nresources:\n  - ./does-not-exist.yaml\n",
  });
  assert.deepEqual(rep.findings, []);
  assert.equal(rep.checked, 0);
});

// A kustomization that asks for a label and does not build is the linter
// failing, never a pass.
test("a render error is not swallowed", () => {
  const root = writeTree({
    [appFile("kube-system")]: `${namespaceKustomization("kube-system")}resources:\n  - ./does-not-exist.yaml\n${enforcePrivilegedOnTheKustomization}`,
  });
  assert.throws(() => scan(root), /render/);
  assert.equal(
    run(
      root,
      () => {},
      () => {},
    ),
    EXIT_FAILURE,
  );
});

// Exit codes match eso-values-lint: 1 is a finding, 2 is the linter failing.
test("exit codes", () => {
  const ignore = (): void => {};
  const clean = writeTree({ [appFile("default")]: namespaceKustomization("default") });
  assert.equal(run(clean, ignore, ignore), EXIT_OK, "clean tree");
  const dirty = writeTree({ [appFile("kube-system")]: namespaceKustomization("kube-system") + enforcePrivilegedOnTheKustomization });
  assert.equal(run(dirty, ignore, ignore), EXIT_FINDING, "finding");
  const broken = writeTree({ [appFile("kube-system")]: "kind: [unclosed\n" });
  assert.equal(run(broken, ignore, ignore), EXIT_FAILURE, "unparsable kustomization");
});
