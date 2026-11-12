// Command podsecurity-label-lint fails when a kustomization means to put a
// PodSecurity label on its Namespace and the rendered Namespace does not
// carry it (#3162).
//
// THE BUG IT GUARDS: a `metadata.labels` block on a kustomization.yaml looks
// like it labels the namespace, and kustomize silently ignores it. Six
// namespaces (netbird-system among them) rendered unlabelled that way. Today
// that changes nothing -- talos/control-plane/10-cluster.yaml deletes the
// PodSecurity admission config, so the built-in default is privileged -- but
// the day an enforcing default returns, every privileged pod in those
// namespaces would be refused.
//
// HOW: every kustomization.yaml under the given root is read for intent -- any
// `pod-security.kubernetes.io/*` key with a value, anywhere in the file,
// including inside inline `patches` (both strategic-merge and JSON6902, whose
// `path` spells the key as `.../pod-security.kubernetes.io~1enforce`). Each
// file that states an intent is rendered with the kustomize library kubectl
// embeds (`kubectl kustomize`, with LoadRestrictionsNone like Flux's
// kustomize-controller), and every Namespace it renders must carry each
// intended label with the intended value.
//
// THE REPO PATTERN it is checked against is a JSON patch on the Namespace in
// the namespace's own kustomization.yaml; see any of
// kubernetes/apps/*/kustomization.yaml that carry one.
package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"gopkg.in/yaml.v3"
	"sigs.k8s.io/kustomize/api/krusty"
	"sigs.k8s.io/kustomize/api/types"
	"sigs.k8s.io/kustomize/kyaml/filesys"
)

const (
	labelPrefix = "pod-security.kubernetes.io/"
	// How a JSON6902 path spells the prefix: `/` escapes to `~1`.
	jsonPointerPrefix = "pod-security.kubernetes.io~1"
	exitFailure       = 1
)

type finding struct {
	file string
	msg  string
}

func (f finding) String() string { return f.file + ": " + f.msg }

func main() {
	root := "kubernetes"
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	os.Exit(run(root, os.Stdout, os.Stderr))
}

func run(root string, stdout, stderr io.Writer) int {
	findings, err := scan(root)
	if err != nil {
		fmt.Fprintf(stderr, "podsecurity-label-lint: %v\n", err)
		return exitFailure
	}
	for _, f := range findings {
		fmt.Fprintln(stdout, f)
	}
	fmt.Fprintf(stdout, "podsecurity-label-lint: %d finding(s)\n", len(findings))
	if len(findings) > 0 {
		return exitFailure
	}
	return 0
}

// scan returns one finding per kustomization whose intended PodSecurity
// labels do not all render onto its Namespace(s).
func scan(root string) ([]finding, error) {
	var files []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && (d.Name() == "kustomization.yaml" || d.Name() == "kustomization.yml") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	slices.Sort(files)

	var findings []finding
	for _, file := range files {
		intended, err := intendedLabels(file)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", file, err)
		}
		if len(intended) == 0 {
			continue
		}
		msg, err := missingLabels(filepath.Dir(file), intended)
		if err != nil {
			return nil, fmt.Errorf("%s: render: %w", file, err)
		}
		if msg != "" {
			findings = append(findings, finding{file: file, msg: msg})
		}
	}
	return findings, nil
}

// intendedLabels collects every PodSecurity label the file asks for.
func intendedLabels(file string) (map[string]string, error) {
	raw, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	var doc any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	labels := map[string]string{}
	collect(doc, labels)
	return labels, nil
}

// collect walks a parsed YAML tree. String values are parsed again, because
// an inline `patch: |-` holds YAML of its own.
func collect(node any, labels map[string]string) {
	switch n := node.(type) {
	case map[string]any:
		if path, ok := n["path"].(string); ok {
			if i := strings.Index(path, jsonPointerPrefix); i >= 0 {
				if v, ok := n["value"].(string); ok {
					labels[labelPrefix+path[i+len(jsonPointerPrefix):]] = v
				}
			}
		}
		for k, v := range n {
			if s, ok := v.(string); ok && strings.HasPrefix(k, labelPrefix) {
				labels[k] = s
				continue
			}
			collect(v, labels)
		}
	case []any:
		for _, v := range n {
			collect(v, labels)
		}
	case string:
		if !strings.Contains(n, labelPrefix) && !strings.Contains(n, jsonPointerPrefix) {
			return
		}
		var inner any
		if yaml.Unmarshal([]byte(n), &inner) == nil {
			if _, isString := inner.(string); !isString {
				collect(inner, labels)
			}
		}
	}
}

// missingLabels renders dir and describes what its Namespaces lack, or "".
func missingLabels(dir string, intended map[string]string) (string, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	opts := krusty.MakeDefaultOptions()
	opts.LoadRestrictions = types.LoadRestrictionsNone
	resMap, err := krusty.MakeKustomizer(opts).Run(filesys.MakeFsOnDisk(), abs)
	if err != nil {
		return "", err
	}

	keys := make([]string, 0, len(intended))
	for k := range intended {
		keys = append(keys, k)
	}
	slices.Sort(keys)

	var problems []string
	namespaces := 0
	for _, res := range resMap.Resources() {
		if res.GetKind() != "Namespace" {
			continue
		}
		namespaces++
		got := res.GetLabels()
		var missing []string
		for _, k := range keys {
			if got[k] != intended[k] {
				missing = append(missing, k+"="+intended[k])
			}
		}
		if len(missing) > 0 {
			problems = append(problems, fmt.Sprintf("Namespace %s renders without %s",
				res.GetName(), strings.Join(missing, ", ")))
		}
	}
	if namespaces == 0 {
		return "asks for PodSecurity labels but renders no Namespace", nil
	}
	if len(problems) > 0 {
		return strings.Join(problems, "; ") +
			" (kustomize ignores `metadata.labels` on a kustomization; use a JSON patch on the Namespace)", nil
	}
	return "", nil
}
