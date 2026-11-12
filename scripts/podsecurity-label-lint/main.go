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
// `path` spells the key as `.../pod-security.kubernetes.io~1enforce`), and,
// recursively, in every component it lists under `components:`. Each
// Kustomization (not Component: kustomize cannot build one on its own) that
// states an intent is rendered with the kustomize library kubectl embeds
// (`kubectl kustomize`, with LoadRestrictionsNone like Flux's
// kustomize-controller), and every Namespace it renders must carry each
// intended label with the intended value.
//
// Checks, as they appear in output:
//
//	PSA-MISSING       a rendered Namespace lacks an intended label=value.
//	PSA-NO-NAMESPACE  the kustomization asks for a label but renders no
//	                  Namespace to put it on.
//
// KNOWN LIMITS: intent is not read from patch FILES (`patches: - path:`) or
// from a Flux Kustomization's `commonMetadata`. Neither carries a PodSecurity
// label in this repo today.
//
// THE REPO PATTERN it is checked against is the
// kubernetes/components/privileged-namespace component.
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
)

// check identifiers, as they appear in output
const (
	checkMissing     = "PSA-MISSING"
	checkNoNamespace = "PSA-NO-NAMESPACE"
)

// exit codes
const (
	exitOK      = 0
	exitFinding = 1
	exitFailure = 2 // the linter itself could not run
)

const missingAdvice = "kustomize ignores `metadata.labels` on a kustomization; " +
	"list ../../components/privileged-namespace under `components:` instead"

type finding struct {
	file      string
	check     string
	namespace string // empty for checkNoNamespace
	label     string // key=value
	msg       string
}

func (f finding) String() string { return fmt.Sprintf("%s: [%s] %s", f.file, f.check, f.msg) }

// report is the outcome of a run: what was rendered, and what was wrong.
type report struct {
	findings []finding
	checked  int // kustomizations that stated an intent and were rendered
}

func main() {
	root := "kubernetes"
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	os.Exit(run(root, os.Stdout, os.Stderr))
}

func run(root string, stdout, stderr io.Writer) int {
	rep, err := scan(root)
	if err != nil {
		fmt.Fprintf(stderr, "podsecurity-label-lint: %v\n", err)
		return exitFailure
	}
	for _, f := range rep.findings {
		fmt.Fprintln(stdout, f)
	}
	fmt.Fprintf(stdout, "podsecurity-label-lint: %d kustomization(s) with PodSecurity intent rendered, %d finding(s)\n",
		rep.checked, len(rep.findings))
	if len(rep.findings) > 0 {
		return exitFinding
	}
	return exitOK
}

func scan(root string) (report, error) {
	var rep report
	var files []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && isKustomizationFile(d.Name()) {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return rep, err
	}
	slices.Sort(files)

	for _, file := range files {
		k, err := readKustomization(file)
		if err != nil {
			return rep, fmt.Errorf("%s: %w", file, err)
		}
		if k.isComponent {
			continue // checked through each consumer
		}
		intended := map[string]string{}
		if err := collectPodSecurityIntent(file, k, intended, map[string]bool{}); err != nil {
			return rep, fmt.Errorf("%s: %w", file, err)
		}
		if len(intended) == 0 {
			continue
		}
		rep.checked++
		found, err := missingLabels(file, intended)
		if err != nil {
			return rep, fmt.Errorf("%s: render: %w", file, err)
		}
		rep.findings = append(rep.findings, found...)
	}
	return rep, nil
}

func isKustomizationFile(name string) bool {
	return name == "kustomization.yaml" || name == "kustomization.yml" || name == "Kustomization"
}

type kustomization struct {
	doc         any
	isComponent bool
	components  []string
}

func readKustomization(file string) (kustomization, error) {
	raw, err := os.ReadFile(file)
	if err != nil {
		return kustomization{}, err
	}
	var k kustomization
	if err := yaml.Unmarshal(raw, &k.doc); err != nil {
		return k, err
	}
	if m, ok := k.doc.(map[string]any); ok {
		k.isComponent = m["kind"] == "Component"
		if list, ok := m["components"].([]any); ok {
			for _, c := range list {
				if s, ok := c.(string); ok {
					k.components = append(k.components, s)
				}
			}
		}
	}
	return k, nil
}

// collectPodSecurityIntent gathers every PodSecurity label the kustomization
// at file asks for, including through the components it lists.
func collectPodSecurityIntent(file string, k kustomization, labels map[string]string, seen map[string]bool) error {
	abs, err := filepath.Abs(file)
	if err != nil {
		return err
	}
	if seen[abs] {
		return nil
	}
	seen[abs] = true

	walkPodSecurityLabels(k.doc, labels)
	for _, c := range k.components {
		dir := filepath.Join(filepath.Dir(file), c)
		compFile := ""
		for _, name := range []string{"kustomization.yaml", "kustomization.yml", "Kustomization"} {
			if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
				compFile = filepath.Join(dir, name)
				break
			}
		}
		if compFile == "" {
			continue // not a local directory; kustomize will report it on render
		}
		ck, err := readKustomization(compFile)
		if err != nil {
			return fmt.Errorf("%s: %w", compFile, err)
		}
		if err := collectPodSecurityIntent(compFile, ck, labels, seen); err != nil {
			return err
		}
	}
	return nil
}

// walkPodSecurityLabels walks a parsed YAML tree. String values are parsed
// again, because an inline `patch: |-` holds YAML of its own.
func walkPodSecurityLabels(node any, labels map[string]string) {
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
			walkPodSecurityLabels(v, labels)
		}
	case []any:
		for _, v := range n {
			walkPodSecurityLabels(v, labels)
		}
	case string:
		if !strings.Contains(n, labelPrefix) && !strings.Contains(n, jsonPointerPrefix) {
			return
		}
		var inner any
		if yaml.Unmarshal([]byte(n), &inner) == nil {
			if _, isString := inner.(string); !isString {
				walkPodSecurityLabels(inner, labels)
			}
		}
	}
}

// missingLabels renders the kustomization at file and reports each intended
// label a rendered Namespace lacks.
func missingLabels(file string, intended map[string]string) ([]finding, error) {
	abs, err := filepath.Abs(filepath.Dir(file))
	if err != nil {
		return nil, err
	}
	opts := krusty.MakeDefaultOptions()
	opts.LoadRestrictions = types.LoadRestrictionsNone
	resMap, err := krusty.MakeKustomizer(opts).Run(filesys.MakeFsOnDisk(), abs)
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(intended))
	for k := range intended {
		keys = append(keys, k)
	}
	slices.Sort(keys)

	var found []finding
	namespaces := 0
	for _, res := range resMap.Resources() {
		if res.GetKind() != "Namespace" {
			continue
		}
		namespaces++
		got := res.GetLabels()
		for _, k := range keys {
			if got[k] == intended[k] {
				continue
			}
			label := k + "=" + intended[k]
			found = append(found, finding{
				file:      file,
				check:     checkMissing,
				namespace: res.GetName(),
				label:     label,
				msg:       fmt.Sprintf("Namespace %s renders without %s (%s)", res.GetName(), label, missingAdvice),
			})
		}
	}
	if namespaces == 0 {
		found = append(found, finding{
			file:  file,
			check: checkNoNamespace,
			msg:   "asks for PodSecurity labels but renders no Namespace",
		})
	}
	return found, nil
}
