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
   should come out byte-identical.

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

## Pilot: authentik

`kubernetes/apps/pulumi/authentik/artifactgenerator.yaml`. authentik was chosen
because it has no resync timer, so commits were its only trigger. It has no
`prerequisites`, no Stack lists it as one, and a run is cheap. Its import closure
is 43 files: `components/`, `dynamic/1password`, three `sdks/*` packages, and the
stack itself. `components/store/clusters.ts` reads `clusters/*.yaml` at run
time, and the `@openapi/*` alias points at `types/`.

### Verifying after merge

1. `kubectl -n flux-system get deploy source-watcher` is available, and
   `kubectl -n pulumi get artifactgenerator authentik` is `Ready=True`.
2. `kubectl -n pulumi get externalartifact authentik -o jsonpath='{.status.artifact.revision}'`
   prints `latest@sha256:…`.
3. The Stack runs **once** on the switch, because the generation and revision
   format both change. Afterwards `status.lastUpdate.lastSuccessfulCommit` holds
   that `latest@sha256:…` value.
4. **Unrelated commit:** merge anything outside the include list. The
   home-operations GitRepository moves, the ExternalArtifact revision does not,
   `lastSuccessfulCommit` stays put, and no new `Update` appears
   (`kubectl -n pulumi get updates -l pulumi.com/stack-name=authentik`).
5. **Related commit:** an edit under `stacks/authentik/` (or `components/`)
   gives a new ExternalArtifact revision and one new Update.

### Rolling back

Point `spec.fluxSource.sourceRef` back at
`{kind: GitRepository, name: home-operations}` and drop the generator. The other
pieces (source-watcher, the RBAC rule) are inert on their own.

## Rollout to the other Stacks

The same three edits per Stack: an `artifactgenerator.yaml`, its entry in the
Stack's `kustomization.yaml`, and the `sourceRef`. Traced on 2026-10-19; re-trace
before each one.

| Stack (`dir`) | Resync today | Extra repo reads beyond authentik's set | Benefit |
| --- | --- | --- | --- |
| backups (`stacks/backups`) | 86400s, `continueResyncOnCommitMatch: false` | `docker/**` (`components/dockerStackBackups.ts`: compose files, `.ignore` markers) | High: commits are its main trigger |
| home-operations (`stacks/home`) | 86400s, continue | `docker/**` (`components/DockgeLxc.ts`) | High |
| gulf-of-mexico | 3600s, continue | `docker/**` (`DockgeLxc`) | Medium: the hourly resync stays |
| ocracoke | 86400s, continue (Kustomization disabled) | `docker/**` (`DockgeLxc`) | When it is re-enabled |
| unifi-network | 300s, continue | none beyond its own 8 stack files | Low: the 5-minute resync dominates |
| system | 600s, continue | `kubernetes/apps/coder/coder/**` (templates, `helmrelease.yaml`, `resources/pulumi-token-job.yaml`), `kubernetes/apps/**/ks.yaml` (`postgres-rotation.ts` globs them) | Low, and system's list is the widest. Do it last, or not at all. |

`home-operations`, `gulf-of-mexico` and `ocracoke` list `backups` as a
prerequisite. The operator's prerequisite check reads the other Stack's status,
not its source, so moving `backups` first is safe.

## Risks

- **A missing include path is silent** (see the table above). The trace and the
  emulation are the guard. A run that never happens is easy to miss on a Stack
  that rarely changes.
- **source-watcher availability.** If it is down, the ExternalArtifact keeps its
  last revision. The Stack keeps running on that source and stops seeing new
  ones until it is back. With source-controller down the effect would be the
  same. A newly scheduled workspace cannot fetch until it is back.
- **Ordering at merge.** The authentik Kustomization applies an
  `ArtifactGenerator` before source-watcher's CRD may exist. Flux's server-side
  dry-run fails the whole apply, so the Stack stays on the GitRepository and the
  Kustomization retries every 2m until the CRD lands. Then the Stack may report
  `could not resolve sourceRef` for a few seconds before the first artifact
  appears. The operator watches the kind and picks it up.
- **v1beta1 API.** `source.extensions.fluxcd.io` is beta. A future Flux upgrade
  may need the manifests moved to a new version.
