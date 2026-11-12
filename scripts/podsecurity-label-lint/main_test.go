package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The Namespace every app namespace gets from components/common.
const fixtureNamespace = `apiVersion: v1
kind: Namespace
metadata:
  name: not-used
`

const fixtureCommon = `apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
resources:
  - ./namespace.yaml
`

// The shape of kubernetes/components/privileged-namespace, with the patch
// target left open so a test can aim it at the wrong kind.
const fixturePrivilegedComponent = `apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
patches:
  - target:
      kind: %s
    patch: |-
      apiVersion: v1
      kind: %s
      metadata:
        name: not-used
        labels:
          pod-security.kubernetes.io/enforce: privileged
`

// A namespace kustomization that pulls in common plus the given components.
func namespaceKustomization(ns string, components ...string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nnamespace: %s\ncomponents:\n  - ../../components/common\n", ns)
	for _, c := range components {
		fmt.Fprintf(&b, "  - ../../components/%s\n", c)
	}
	return b.String()
}

// writeTree lays down components/common plus the given files (path relative
// to the root -> body), and returns the root.
func writeTree(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	all := map[string]string{
		"components/common/kustomization.yaml": fixtureCommon,
		"components/common/namespace.yaml":     fixtureNamespace,
	}
	for name, body := range files {
		all[name] = body
	}
	for name, body := range all {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func scanTree(t *testing.T, files map[string]string) report {
	t.Helper()
	rep, err := scan(writeTree(t, files))
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	return rep
}

func appFile(ns string) string { return filepath.Join("apps", ns, "kustomization.yaml") }

// The bug in #3162: kustomize ignores `metadata.labels` on a Kustomization
// file, so the Namespace renders without the label it was meant to carry.
func TestMetadataLabelsOnTheKustomizationAreAFinding(t *testing.T) {
	rep := scanTree(t, map[string]string{
		appFile("netbird-system"): namespaceKustomization("netbird-system") + `metadata:
  labels:
    pod-security.kubernetes.io/enforce: privileged
`,
	})
	if len(rep.findings) != 1 {
		t.Fatalf("want 1 finding, got %v", rep.findings)
	}
	f := rep.findings[0]
	if f.check != checkMissing || f.namespace != "netbird-system" || f.label != "pod-security.kubernetes.io/enforce=privileged" {
		t.Errorf("wrong finding: %+v", f)
	}
	if !strings.HasSuffix(f.file, appFile("netbird-system")) {
		t.Errorf("finding names the wrong file: %q", f.file)
	}
}

// The repo pattern: the privileged-namespace component. Its intent is read
// through the consumer's `components:` list, and it renders, so it is clean.
// The component itself is never built on its own (kustomize cannot).
func TestPrivilegedNamespaceComponentIsClean(t *testing.T) {
	rep := scanTree(t, map[string]string{
		"components/privileged-namespace/kustomization.yaml": fmt.Sprintf(fixturePrivilegedComponent, "Namespace", "Namespace"),
		appFile("kube-system"):                               namespaceKustomization("kube-system", "privileged-namespace"),
	})
	if len(rep.findings) != 0 {
		t.Fatalf("want no findings, got %v", rep.findings)
	}
	if rep.checked != 1 {
		t.Errorf("want 1 kustomization rendered (the consumer), got %d", rep.checked)
	}
}

// A component whose patch misses the Namespace: the consumer carries the
// intent, so the consumer is what gets reported.
func TestComponentThatMissesTheNamespaceIsAFindingOnItsConsumer(t *testing.T) {
	rep := scanTree(t, map[string]string{
		"components/privileged-namespace/kustomization.yaml": fmt.Sprintf(fixturePrivilegedComponent, "ServiceAccount", "ServiceAccount"),
		appFile("kube-system"):                               namespaceKustomization("kube-system", "privileged-namespace"),
	})
	if len(rep.findings) != 1 || rep.findings[0].label != "pod-security.kubernetes.io/enforce=privileged" ||
		!strings.HasSuffix(rep.findings[0].file, appFile("kube-system")) {
		t.Fatalf("want 1 finding on kube-system naming the label, got %+v", rep.findings)
	}
}

// An inline JSON patch on the Namespace renders too.
func TestInlineJSONPatchOnTheNamespaceIsClean(t *testing.T) {
	rep := scanTree(t, map[string]string{
		appFile("kube-system"): namespaceKustomization("kube-system") + `patches:
  - target:
      kind: Namespace
    patch: |-
      - op: add
        path: /metadata/labels
        value:
          pod-security.kubernetes.io/enforce: privileged
`,
	})
	if len(rep.findings) != 0 {
		t.Fatalf("want no findings, got %v", rep.findings)
	}
}

// A JSON pointer spells the label's `/` as `~1`. Here it lands on an
// annotation, which PodSecurity admission does not read.
func TestJSONPointerToALabelKeyIsReadAsIntent(t *testing.T) {
	rep := scanTree(t, map[string]string{
		appFile("kube-system"): namespaceKustomization("kube-system") + `patches:
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
	})
	if len(rep.findings) != 1 || rep.findings[0].label != "pod-security.kubernetes.io/warn=restricted" {
		t.Fatalf("want 1 finding naming the warn label, got %+v", rep.findings)
	}
}

// Intent with no Namespace to put it on.
func TestIntentWithoutANamespaceIsAFinding(t *testing.T) {
	rep := scanTree(t, map[string]string{
		appFile("kube-system"): `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
metadata:
  labels:
    pod-security.kubernetes.io/enforce: privileged
`,
	})
	if len(rep.findings) != 1 || rep.findings[0].check != checkNoNamespace {
		t.Fatalf("want 1 %s finding, got %+v", checkNoNamespace, rep.findings)
	}
}

// Kustomizations that ask for nothing are never rendered, let alone reported:
// this one would fail to build if it were.
func TestKustomizationWithoutIntentIsIgnored(t *testing.T) {
	rep := scanTree(t, map[string]string{
		appFile("default"): `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: default
resources:
  - ./does-not-exist.yaml
`,
	})
	if len(rep.findings) != 0 || rep.checked != 0 {
		t.Fatalf("want nothing rendered or reported, got checked=%d %v", rep.checked, rep.findings)
	}
}

// Exit codes match eso-values-lint: 1 is a finding, 2 is the linter failing.
func TestExitCodes(t *testing.T) {
	var out, errOut bytes.Buffer
	clean := writeTree(t, map[string]string{appFile("default"): namespaceKustomization("default")})
	if got := run(clean, &out, &errOut); got != exitOK {
		t.Errorf("clean tree: exit %d, want %d", got, exitOK)
	}
	dirty := writeTree(t, map[string]string{
		appFile("kube-system"): namespaceKustomization("kube-system") + "metadata:\n  labels:\n    pod-security.kubernetes.io/enforce: privileged\n",
	})
	if got := run(dirty, &out, &errOut); got != exitFinding {
		t.Errorf("finding: exit %d, want %d", got, exitFinding)
	}
	broken := writeTree(t, map[string]string{appFile("kube-system"): "kind: [unclosed\n"})
	if got := run(broken, &out, &errOut); got != exitFailure {
		t.Errorf("unparsable kustomization: exit %d, want %d", got, exitFailure)
	}
}
