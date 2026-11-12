package main

import (
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

const fixtureComponent = `apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
resources:
  - ./namespace.yaml
`

// writeTree lays down components/common plus one namespace directory per
// entry in apps (name -> kustomization.yaml body), and returns the root.
func writeTree(t *testing.T, apps map[string]string) string {
	t.Helper()
	root := t.TempDir()
	files := map[string]string{
		"components/common/kustomization.yaml": fixtureComponent,
		"components/common/namespace.yaml":     fixtureNamespace,
	}
	for ns, body := range apps {
		files[filepath.Join("apps", ns, "kustomization.yaml")] = body
	}
	for name, body := range files {
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

func findingsFor(t *testing.T, apps map[string]string) []finding {
	t.Helper()
	got, err := scan(writeTree(t, apps))
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	return got
}

// The bug in #3162: kustomize ignores `metadata.labels` on a Kustomization
// file, so the Namespace renders without the label it was meant to carry.
func TestMetadataLabelsOnTheKustomizationAreAFinding(t *testing.T) {
	got := findingsFor(t, map[string]string{
		"netbird-system": `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: netbird-system
metadata:
  labels:
    pod-security.kubernetes.io/enforce: privileged
components:
  - ../../components/common
`,
	})
	if len(got) != 1 {
		t.Fatalf("want 1 finding, got %v", got)
	}
	if !strings.Contains(got[0].msg, "pod-security.kubernetes.io/enforce=privileged") {
		t.Errorf("finding does not name the missing label: %q", got[0].msg)
	}
	if !strings.HasSuffix(got[0].file, filepath.Join("apps", "netbird-system", "kustomization.yaml")) {
		t.Errorf("finding names the wrong file: %q", got[0].file)
	}
}

// The repo-wide pattern (the one the region-exits namespace used before
// #3156): a JSON patch on the Namespace. It renders, so it is clean.
const patchedKustomization = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: kube-system
components:
  - ../../components/common
patches:
  - target:
      kind: %s
    patch: |-
      - op: add
        path: /metadata/labels
        value:
          pod-security.kubernetes.io/enforce: privileged
`

func TestJSONPatchOnTheNamespaceIsClean(t *testing.T) {
	got := findingsFor(t, map[string]string{
		"kube-system": fmt.Sprintf(patchedKustomization, "Namespace"),
	})
	if len(got) != 0 {
		t.Fatalf("want no findings, got %v", got)
	}
}

// A patch aimed at the wrong kind states the intent but labels nothing.
func TestJSONPatchThatMissesTheNamespaceIsAFinding(t *testing.T) {
	got := findingsFor(t, map[string]string{
		"kube-system": fmt.Sprintf(patchedKustomization, "ServiceAccount"),
	})
	if len(got) != 1 || !strings.Contains(got[0].msg, "pod-security.kubernetes.io/enforce=privileged") {
		t.Fatalf("want 1 finding naming the label, got %v", got)
	}
}

// A JSON pointer spells the label's `/` as `~1`. Here it lands on an
// annotation, which PodSecurity admission does not read.
func TestJSONPointerToALabelKeyIsReadAsIntent(t *testing.T) {
	got := findingsFor(t, map[string]string{
		"kube-system": `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: kube-system
components:
  - ../../components/common
patches:
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
	if len(got) != 1 || !strings.Contains(got[0].msg, "pod-security.kubernetes.io/warn=restricted") {
		t.Fatalf("want 1 finding naming the warn label, got %v", got)
	}
}

// Kustomizations that ask for nothing are never rendered, let alone reported:
// this one would fail to build if it were.
func TestKustomizationWithoutIntentIsIgnored(t *testing.T) {
	got := findingsFor(t, map[string]string{
		"default": `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: default
resources:
  - ./does-not-exist.yaml
`,
	})
	if len(got) != 0 {
		t.Fatalf("want no findings, got %v", got)
	}
}
