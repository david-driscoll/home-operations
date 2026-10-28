# Per-Stack source artifacts

A Pulumi Operator Stack re-runs `pulumi up` whenever its source artifact's
**revision** changes. On the `home-operations` GitRepository that revision is the
commit SHA, so every commit to main re-runs every Stack. This holds even when the
commit only touches `kubernetes/`, docs or Renovate pins. On 2026-10-19 that came
to ~40 runs per Stack per day (~112 commits folded into ~40 fetched revisions).
Only 12 of those commits touched `stacks/`, `components/`, `sdks/` or `dynamic/`,
and none touched `stacks/authentik`. Each run rewrites the full checkpoint and
adds a `history/` entry to the state bucket, and it costs a cold workspace (see
[`pulumi-workspace-image.md`](pulumi-workspace-image.md) for how much that was).

The fix gives each Stack its own source, cut from the same GitRepository down to
the files that Stack's program reads. Its revision moves only when one of those
files changes.

## How it works

```
GitRepository pulumi/home-operations      revision main@sha1:<commit>   (moves on every commit)
        |
        v  source-watcher (Flux), one ArtifactGenerator per Stack
ExternalArtifact pulumi/<stack>           revision latest@sha256:<tarball digest>
        |
        v  Stack.spec.fluxSource.sourceRef: {kind: ExternalArtifact, name: <stack>}
pulumi-kubernetes-operator                runs only when that revision changes
```

Pieces, each checked against source rather than taken from docs:

- **Operator v2.9.3 accepts any source kind.** `stack_controller.go` reads the
  source as `unstructured` and takes `status.artifact` through `getArtifact()` in
  `flux.go`. `maybeWatchFluxSourceKind` installs a watch for each new GVK the
  first time a Stack names it. `SourceRevisionChangePredicate` wakes the Stack
  only when `status.artifact.revision` changes. The workspace gets
  `spec.flux.{url,digest,dir}` from that artifact, the same as for a GitRepository.
- **RBAC is the one gap.** The chart's ClusterRole lists only buckets,
  gitrepositories and ocirepositories. `rbac.extraRules` in
  `kubernetes/apps/pulumi/pulumi-operator/helmrelease.yaml` adds get/list/watch
  on `externalartifacts`. The workspace pod fetches over HTTP and needs no API
  access to the artifact.
- **source-watcher** ships with Flux 2.9.6 as v2.2.4, API
  `source.extensions.fluxcd.io/v1beta1`. It is enabled as a FluxInstance
  component in `kubernetes/apps/flux-system/flux-instance/helm/values.yaml`. Its
  artifacts are served from
  `http://source-watcher.flux-system.svc.cluster.local./`. No NetworkPolicy sits
  on that path, the same as for source-controller today.
- **The revision is content-addressed and reproducible.** The builder hashes the
  staged tree, archives it, and sets `revision = latest@<archive digest>`.
  `fluxcd/pkg/artifact/storage` writes the tarball in walk order with mtimes,
  owners and modes zeroed. Identical inputs give an identical digest, so an
  unrelated commit leaves the revision alone. `originRevision: "@repo"` records
  the commit the artifact was cut from, in metadata only.
- **The layout matches the repo.** A plain directory copy (`@repo/components/`
  to `@artifact/`) lands as `components/`. A glob that is not `dir/**` keeps the
  full match path, so `@repo/stacks/*/package.json` lands as
  `stacks/<name>/package.json`. The Stack keeps `dir: stacks/<name>`, and
  `../../components` and the `clusters/` lookup still resolve.
- **`**` matches one segment.** v2.2.4 expands every non-Extract `from` glob
  with Go's `fs.Glob` (`getGlobMatchingEntries` in `internal/builder`), which
  has no recursive wildcard, so `**` behaves exactly like `*`. `dir/**` still
  copies everything, because each top-level match is then copied recursively.
  But `a/**/b.yaml` only matches `a/<one dir>/b.yaml`. A glob that matches
  nothing fails the whole build (v2.2.4 has no `optional`), and the Stack
  stalls on `could not resolve sourceRef`. That is how system broke on
  2026-10-20. Prefer whole-directory copies.
- **Retention.** source-watcher takes the same `--artifact-retention-*` flags as
  source-controller, with the same 1m/2 defaults. The workspace pins the artifact
  URL the same way, so the FluxInstance patch that raised source-controller to
  1h/10 now covers source-watcher too. The flux-instance values comment has the
  2026-09-15 deadlock that patch exists for.

## Deciding what goes in the artifact

The include list must cover every file the program reads. A mistake fails in one
of two ways:

| Mistake | What happens |
| --- | --- |
| A file the program **needs** is left out | The run fails loudly: `ERR_MODULE_NOT_FOUND`, or `no cluster definitions found` from `components/store/clusters.ts`. |
| A file the program reads is in the repo but **not in the list** | **Silent.** Its changes never move the revision, so the run that should apply them never happens. |

So when in doubt, include it. An extra path only costs an extra run. To trace a
Stack:

1. Follow the static imports from `stacks/<name>/index.ts`, including the
   `@components/*`, `@dynamic/*` and `@openapi/*` aliases and `.js` specifiers
   that point at `.ts` files.
2. In every file reached, grep for `readFileSync`, `readdirSync`, `globSync`,
   `existsSync` and `import.meta.url`. Each hit is a runtime read of a repo path.
3. Add npm's needs. `pulumi install` runs `npm install` against the **root**
   workspace, so the artifact needs the root `package.json` and
   `package-lock.json`, and **every** workspace member's `package.json`, other
   stacks' included. Without the other stacks, npm resolves a different tree:
   on 2026-10-19 `npm install --package-lock-only` pruned the lockfile from 6192
   to 5526 lines. The workspace image's npm cache was baked from the full one
   (`images/pulumi-workspace/inputs.sh`).
4. Emulate it. Copy the listed paths out of a `git archive` into a scratch dir,
   re-run the import trace there, and run
   `npm install --package-lock-only --ignore-scripts --offline`. The lockfile
   should come out byte-identical. Expand globs the way source-watcher does
   (`**` = `*`, see above), not with a shell's `globstar`. An emulation that
   used `globstar` is what let the broken system glob through.

Excluding `*.md` and `*.test.ts` from `components/` and the stack directory is
safe: nothing imports them at run time, and test-only commits stop triggering runs.

What the artifact cannot see: values the program reads from OpenBao, 1Password,
or the Stack's `envRefs` Secrets. Those never moved the revision. Until now an
unrelated commit applied them as a side effect. Now they wait for the next real
input change, or for a manual run:

```bash
kubectl -n pulumi annotate stack <name> --overwrite \
  pulumi.com/reconciliation-request="$(date -u +%FT%TZ)"
```

If a Stack depends on that external state changing on its own, give it
`resyncFrequencySeconds` with `continueResyncOnCommitMatch: true`, as `system`
and `unifi-network` have.

## Where it lives

Every Stack uses it. The shared part is a kustomize Component; each Stack adds
only its own paths.

- `kubernetes/components/pulumi-stack-artifact/` is the `ArtifactGenerator`
  named after the Stack (`${APP}`, substituted by each Stack's Flux
  Kustomization). It reads the `home-operations` GitRepository and copies what
  **every** program reads: the npm manifests, `components/`, `dynamic/`,
  `sdks/`, `types/` and `clusters/`.
- `kubernetes/apps/pulumi/<stack>/kustomization.yaml` pulls in the component
  and appends this Stack's own paths with a JSON patch onto
  `/spec/artifacts/0/copy/-`: its `stacks/<dir>/` at minimum, plus any extra
  repo reads from the table below. A kustomization's own `patches` run after
  its components, so the append lands on the component's generator.
- `kubernetes/apps/pulumi/<stack>/stack.yaml` points
  `spec.fluxSource.sourceRef` at `ExternalArtifact/<stack>`, keeping its `dir`.

A path that only some Stacks read, even when the reason is shared code in
`components/` (DockgeLxc reading `docker/`), goes in those Stacks' patches, not
in the component. In the component it would re-run Stacks that never read it.

### Per-Stack reads (traced 2026-10-20)

| Stack (`dir`) | Import closure | Extra repo reads appended | Resync |
| --- | --- | --- | --- |
| authentik | 46 files | none | none: commits were its only trigger |
| backups | 49 | `docker/` (`components/dockerStackBackups.ts`: compose files, `.ignore` markers) | 86400s, no continue |
| home-operations (`stacks/home`) | 55 | `docker/` (`components/DockgeLxc.ts` uploads every file under `docker/_common/` and `docker/<host>/`) | 86400s, continue |
| gulf-of-mexico | 54 | `docker/` (`DockgeLxc`) | 3600s, continue |
| ocracoke | 54 | `docker/` (`DockgeLxc`) | 86400s, continue. Its Kustomization is commented out of `kubernetes/apps/pulumi/kustomization.yaml`, so this is wired but has never run. |
| unifi-network | 55 | none | 300s, continue |
| system | 61 | all of `kubernetes/apps/`. `coder-templates.ts` and `components/coderTemplates.ts` read `kubernetes/apps/coder/coder/`, and `postgres-rotation.ts` globs every `kubernetes/apps/**/ks.yaml` (243 files at two depths). It is copied whole so that no depth can drop out of postgres-rotation's view, which would remove that app's OpenBao role. | 600s, continue |

The resync timers still fire. A Stack with `continueResyncOnCommitMatch: true`
keeps running on its interval whatever the revision does. What goes away is the
extra run per commit on top of it. For system, any commit under
`kubernetes/apps/` still re-runs it. That is broader than the `ks.yaml` files
`postgres-rotation.ts` reads, but it costs little on a Stack with a 10-minute
resync.

The emulation for all seven (step 4 above) on 2026-10-20 found:
- Every artifact's import closure resolves to the same files as in the repo.
- `docker/` and `kubernetes/apps/` match the repo exactly. The first emulation
  used `globstar` and passed a `kubernetes/apps/**/ks.yaml` glob that
  source-watcher then rejected; see the `**` note above.
- The npm lockfile comes out byte-identical.

source-watcher's copy keeps each file's mode, and the archive normalises modes
to 0600/0700 the same way the GitRepository archive does. So uploaded coder
templates and Dockge files are byte-for-byte what they were.

### Adding a Stack

1. Trace it (above), and run the emulation.
2. Give its `kustomization.yaml` the `pulumi-stack-artifact` component and a
   patch appending `stacks/<dir>/` plus any extra reads. Copy an existing one.
3. Point its `stack.yaml` at `ExternalArtifact/${APP}`.
4. Render it: `flux build kustomization <stack> -n pulumi --path kubernetes/apps/pulumi/<stack> --kustomization-file kubernetes/apps/pulumi/<stack>/ks.yaml --dry-run`.

## Verifying a Stack after it switches

1. `kubectl -n pulumi get artifactgenerator <stack>` is `Ready=True`.
2. `kubectl -n pulumi get externalartifact <stack> -o jsonpath='{.status.artifact.revision}'`
   prints `latest@sha256:…`.
3. The Stack runs **once** on the switch, because the generation and revision
   format both change. Afterwards `status.lastUpdate.lastSuccessfulCommit` holds
   that `latest@sha256:…` value.
4. **Unrelated commit:** merge anything outside the Stack's list. The
   home-operations GitRepository moves, the ExternalArtifact revision does not,
   `lastSuccessfulCommit` stays put, and no new `Update` appears
   (`kubectl -n pulumi get updates -l pulumi.com/stack-name=<stack>`). On a
   Stack with a resync timer, timer runs still appear; check the Update's
   `status.message` says resync rather than "New commit detected".
5. **Related commit:** an edit under `stacks/<dir>/` (or `components/`) gives a
   new ExternalArtifact revision and one new Update.

authentik, the pilot, passed all five on 2026-10-20. Two unrelated commits
(`a476b341`, `ddadf5f8`) produced no run. `7107de2a`, a comment in
`stacks/authentik/index.ts`, moved the revision and produced exactly one
successful run.

## Rolling back

Per Stack: point `spec.fluxSource.sourceRef` back at
`{kind: GitRepository, name: home-operations}` and drop the component and the
patch from its `kustomization.yaml`. source-watcher and the RBAC rule are inert
on their own.

## Risks

- **A missing include path is silent** (see the table above). The trace and the
  emulation are the guard. A run that never happens is easy to miss on a Stack
  that rarely changes.
- **source-watcher availability.** If it is down, the ExternalArtifact keeps its
  last revision. The Stack keeps running on that source and stops seeing new
  ones until it is back. With source-controller down the effect would be the
  same. A newly scheduled workspace cannot fetch until it is back.
- **v1beta1 API.** `source.extensions.fluxcd.io` is beta. A future Flux upgrade
  may need the manifests moved to a new version.
