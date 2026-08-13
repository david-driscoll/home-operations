# 21 — Repo consolidation and Flux re-point (Letter T)

> One tree in `home-operations`. Flux re-pointed with `prune: false` during the
> switch. Part of the [cluster consolidation plan](README.md) for
> [vault#84](https://github.com/david-driscoll/vault/issues/84); see that file
> for the decision ledger (D1–D12) and full sequencing graph. This file stands
> alone — no prior context required.

## What this delivers

One Flux tree, in `home-operations`, that the (by this point single, merged)
cluster reconciles from **exclusively**. `equestria-cluster` and
`stargate-command-cluster` stop being live GitOps sources. This is a
greenfield copy per **D9** — no `git subtree`, no preserved history — because
David decided "no need to keep history" (issue comment, 2026-07-29).

## Depends on / sequencing

**Starts after [19 — rotate equestria's control planes](19-rotate-equestria-control-planes.md) finishes.**
By that point there is one cluster (still identified as `equestria` — same
PKI, same etcd, same CIDRs, per **D1**), made of 3 ex-SGC control planes and 4
workers (the 3 ex-equestria control planes plus `shining-armor`). This piece
does not touch nodes, workloads, or the low-power tier — it only moves *where
Flux reads from*.

Two things this piece assumes are already true when it starts:

- **[06 — age-key consolidation](06-age-key-consolidation.md)** is done. Verified: `home-operations/.sops.yaml`
  today already lists the same three age recipients
  (`age1eurl2t7…` equestria, `age1klzrc4tp…` sgc, `age150z0s36…` David's third
  key) that `equestria-cluster/.sops.yaml` and `stargate-command-cluster/.sops.yaml`
  carry. One key decrypting everywhere is a precondition for merging
  sops-encrypted files from three trees into one without a re-encryption pass.
- **[18](18-sgc-nodes-join-control-plane.md)/[19](19-rotate-equestria-control-planes.md)** are complete — the merged cluster's
  node set is final before its Flux source becomes final. Re-pointing Flux and
  rotating control planes at the same time doubles the number of things that
  can produce a hard-to-diagnose failure.

**Downstream:** [22 — decommission SGC](22-decommission-sgc.md) and
[23 — Talos in Pulumi](23-talos-in-pulumi.md) both start only after this
piece's exit gate. Neither touches a node or a workload until Flux is
provably reading from one place.

## The starting shape, verified live (as of 2026-08-13)

This is the single most important thing this piece needs to know before doing
anything, because it means "repo consolidation" is **not a single future
event** — it is already underway, incrementally, in production, and this
piece's job is to *finish* a pattern rather than *invent* one.

### Two GitRepository objects, one cluster

Equestria's Flux bootstraps from a `FluxInstance` (`kubernetes/apps/flux-system/flux-instance/helm/values.yaml`
in `equestria-cluster`), whose `instance.sync` block is the actual root of
everything:

```yaml
instance:
  sync:
    name: flux-system
    kind: GitRepository
    url: "https://github.com/david-driscoll/equestria-cluster.git"
    ref: "refs/heads/main"
    path: kubernetes/flux/cluster
```

The flux-operator turns that into a `GitRepository/flux-system` object in the
`flux-system` namespace, which two Kustomizations consume
(`equestria-cluster:kubernetes/flux/cluster/ks.yaml`):

- `cluster-meta` — applies `./kubernetes/flux/meta` (repo/HelmRepository
  definitions, `shared-secrets.sops.yaml`, `cluster-secrets.sops.yaml`,
  `sops-age.sops.yaml`). **`prune: true`.**
- `cluster-apps` — applies the entire `./kubernetes/apps` tree (335
  Kustomization objects as of this writing) and injects sops decryption +
  `postBuild.substituteFrom` into every child via a patch. **`prune: true`.**

Separately, `equestria-cluster:kubernetes/apps/flux-system/repositories/home-operations.yaml`
declares a **second** GitRepository, `GitRepository/home-operations`
(also in `flux-system` namespace), pointed at this repo. A handful of
individual per-namespace Kustomization files — still committed to and applied
*from* `equestria-cluster`'s `cluster-apps` tree — redirect their own
`sourceRef` to that second GitRepository instead of the self one. That is the
whole trick: **the Kustomization-defining YAML stays in `equestria-cluster`
and keeps being applied by the same `prune: true` root it always was; only
the *content it fetches* moves.** Nothing about the root changes, so the
blast radius of migrating one namespace is exactly that namespace.

### What has already moved, verified live via `kubectl --context admin@equestria`

Five of `equestria-cluster`'s 17 `kubernetes/apps/*` namespaces already
redirect to `home-operations`, all landed in a six-commit burst on
**2026-08-12, 22:11–23:28** (`77dc074f` "standardize cert-manager" through
`6c7ce0b8` "refactor: remove sops-age secret file from kustomization"):

| Namespace | Kustomization name | Live status (checked this session) |
|---|---|---|
| `longhorn-system` | `longhorn-system` | `Applied revision: main@sha1:6c7ce0b8…` — reconciling from `GitRepository/home-operations` |
| `nfs-system` | `nfs-system` | Same — reconciling |
| `openebs-system` | `openebs-system` | Same — reconciling |
| `pulumi` | `pulumi` | Same — reconciling. This is the tree that already existed in `home-operations` (`kubernetes/apps/pulumi/**`) before any of this piece's work starts |
| `cert-manager` | `cert-manager` | **`NotFound` live** — the redirect file exists in git (`cert-manager/home-operations.cert-manager.yaml`) but the Kustomization object was not found when queried this session. Do not assume this one is clean; verify with `flux get kustomizations -n cert-manager` before relying on it |
| `equestria/home/dynacat` (the glance dashboard) | `dynacat` | Reconciling from `home-operations:./dashboard` (a repo-root path, not under `kubernetes/`), but currently blocked: `dependency 'volsync-system/volsync' is not ready`. Pre-existing, unrelated to this piece |

`kubernetes/components/**` is **already fully mirrored** — `home-operations`
and `equestria-cluster` have byte-identical component directory names today
(`alerts, common, failover, ingress, postgres, repos, secret-store,
tailscale, volsync, volsync-restore`). Nothing to do there beyond a final
content diff before cutover.

**Twelve namespaces have not moved yet:** `cloudnative-pg`, `coder`,
`database`, `equestria`, `flux-system` (itself), `github-actions`,
`kube-system`, `network`, `observability`, `stargate-command`,
`system-upgrade`, `tailscale-system`, `volsync-system`. (`stargate-command`
is where SGC's already-migrated apps are staged in equestria's own tree per
earlier phases — out of scope here, its fate is [22](22-decommission-sgc.md).)
`kubernetes/flux/meta/**` and `kubernetes/flux/cluster/ks.yaml` themselves
have not moved.

`kube-system` is the one of the twelve worth flagging specifically: it's where
`ClusterSecretStore/openbao` and OpenBao itself (the `openbao` HelmRelease, 3-pod
StatefulSet) live. The `secret-store` component that defines it is already in the
"fully mirrored" set above, so there's no divergent definition to reconcile — moving
`kube-system` in Phase A carries the same store equestria already runs today, verbatim.
**SGC's own copy is not part of this merge at all** — every namespace here is equestria's
tree only (per D9, greenfield from equestria), and SGC's `kubernetes-sgc` mount / `eso-sgc`
policy and its remaining `ExternalSecret`s are retired in [22](22-decommission-sgc.md) §5,
not ported.

**Practical consequence for this piece:** don't design a migration
mechanism — continue the one already proven in production, namespace by
namespace, using the same `home-operations.<namespace>.yaml` redirect
pattern, until every namespace is covered. Only then perform the root flip.

## Non-Kubernetes tree to merge

Everything below lives in `equestria-cluster` today and has no home in
`home-operations` yet, verified by listing both trees:

| Item | equestria-cluster | home-operations today |
|---|---|---|
| `talos/` (talconfig.yaml, patches/, talsecret.sops.yaml, talenv.yaml, talosconfig) | present, `talosVersion: v1.13.8` per `versions.env` | absent |
| `bootstrap/helmfile.yaml` | present | absent |
| `.taskfiles/{talos,bootstrap,flux,k8s}` | present | absent |
| `Taskfile.yaml` (root) | present | absent |
| `versions.env` + its `# renovate:` annotations (`KUBERNETES_VERSION`, `TALOS_VERSION`) | present | absent — see the [versions-renovate](../../.claude/skills) conventions before adding it, so the annotation syntax matches the estate standard on arrival, not as a follow-up fix |
| `.config/mise.toml` `[tools]` | has `talos`, `talosctl`, `talhelper`, `helm`, `helmfile`, `kubeconform`, `kustomize`, `cilium-cli`, `cloudflared`, `krew`, `actionlint`, `shellcheck`, `yamllint`, `powershell-core` | has `kubectl`, `flux2`, `sops`, `age`, `hk`, `vals`, plus its own Pulumi/Node/dotnet toolchain — **merge, don't overwrite**: both already pin `hk = "1.55.0"`, `sops = "3.13.3"`, `flux2 = "2.9.4"`, `age = "1.3.1"` identically, so those four are a no-op union |
| `.config/hk.pkl` | present, its own hook set | present — **home-operations' own header says it already consolidated "two competing configs that both landed on main"**; treat equestria's hk config as a third input to reconcile against that existing consolidation, not a fresh merge |
| `.github/workflows/flux-local.yaml` ("flate" PR validation) | present | **absent** — `home-operations/.github/workflows` today only has `label-sync.yaml`. Port this workflow; it is what validates `kubernetes/**` changes on every PR and this repo has none of that coverage yet despite already carrying live Flux content |
| `.github/workflows/sgc-sync.yaml` + `.github/sgc-sync.yaml` | present — a scheduled + on-push job that mirrors `equestria-cluster` files (`.config/`, `kubernetes/flux/`, `kubernetes/apps/{backup,cert-manager,nfs-system,network,cloudnative-pg,database,kube-system,flux-system/weave,flux-system/capacitor,longhorn-system,system-upgrade,volsync-system}`, …) into `stargate-command-cluster` on a nightly cron and every push to `main` | n/a | **Do not port this.** It is SGC-specific plumbing that [22](22-decommission-sgc.md) retires. Flag it here because it will start failing loudly (PRs against an archived repo) the moment `stargate-command-cluster` is archived, so it must be disabled *before* archival — sequence that inside 22, not here, but don't let it survive a `git subtree`-free copy by accident |
| `.github/renovate.json5` | present | **already present** in home-operations — diff the two before merging `versions.env` in, don't assume they're identical |

## The procedure

### Phase A — finish the namespace-by-namespace migration

For each of the 12 remaining namespaces, repeat the pattern already proven
five times:

1. Copy the namespace's `kubernetes/apps/<ns>/**` content into
   `home-operations:kubernetes/apps/<ns>/**` verbatim (adjust nothing yet —
   parity first, cleanup later).
2. In `equestria-cluster`, add `kubernetes/apps/<ns>/home-operations.<ns>.yaml`
   — a Kustomization with the same `metadata.name` as the namespace's
   existing native one, `sourceRef: {kind: GitRepository, name:
   home-operations, namespace: flux-system}`, `path: ./kubernetes/apps/<ns>`.
3. Remove (or replace) the old native Kustomization file so there is exactly
   one Kustomization object named `<ns>` in that namespace — a name
   collision between the old and new definitions is a kustomize-build error,
   not a silent overwrite.
4. Reconcile, verify `flux get kustomizations -n <ns>` reports the new
   `Applied revision` against the `home-operations` `GitRepository`, and
   confirm no resources were pruned that shouldn't have been (a namespace's
   `cluster-apps`-owned Kustomization set is small — diff it before and
   after).
5. **Given the live discrepancy already found on `cert-manager`**, treat
   "committed" and "actually reconciling" as different facts for every
   namespace — check both, not just the first.

`flux-system` itself is the one namespace in this list that is special: its
`kubernetes/apps/flux-system/**` content (the FluxInstance definition, the
`repositories/*.yaml` GitRepository objects, `flux-instance/receiver.yaml`,
etc.) needs to move too, but its Kustomization must NOT be redirected via the
same mechanism until the very end — it's the thing that defines where
*everything else, including itself* is sourced from. Treat it as part of
Phase B, not Phase A.

### Phase B — port `kubernetes/flux/meta` and `kubernetes/flux/cluster`

1. Copy `kubernetes/flux/meta/**` (repo/HelmRepository definitions,
   `shared-secrets.sops.yaml`, `cluster-secrets.sops.yaml`,
   `sops-age.sops.yaml`) into `home-operations` unchanged.
2. Copy `kubernetes/flux/cluster/ks.yaml` (`cluster-meta`, `cluster-apps`)
   into `home-operations` **with `prune: false` on both**, not the `true`
   they currently carry. This is deliberate and temporary — see Phase C.
3. Diff a `kustomize build` (or `flate test`) of `equestria-cluster`'s live
   tree against `home-operations`'s copy, namespace by namespace, until the
   rendered output is identical except for the things that are supposed to
   differ (e.g. `sourceRef` names, if any redirect files are still in place).
   This is the parity check the final flip depends on — do it before Phase C,
   not during it.

### Phase C — the root flip (self-modifying, do this with `prune: false` already in place)

This is the step the brief's "wrong path + `prune: true` garbage-collects the
cluster" warning is about, made concrete: `cluster-apps` diffs its **entire**
apply set (335+ objects) against whatever `GitRepository/flux-system`
resolves to the instant its target changes. If `home-operations`'s copy of
`kubernetes/apps` is incomplete or wrong at that instant, `cluster-apps`
(if still `prune: true`) deletes every live resource it can no longer find in
the new tree — which, at the scale of this cluster, is most of it.

1. Confirm Phase A covers all 12 remaining namespaces and Phase B's diff is
   clean.
2. With `cluster-meta`/`cluster-apps` already at `prune: false` (Phase B,
   step 2) in **both** copies, edit `equestria-cluster`'s live
   `kubernetes/apps/flux-system/flux-instance/helm/values.yaml`:
   `instance.sync.url` → `https://github.com/david-driscoll/home-operations.git`,
   `instance.sync.path` stays `kubernetes/flux/cluster` (same relative
   layout, copied in Phase B). Commit and let it reconcile — this is the
   moment `GitRepository/flux-system` starts resolving to `home-operations`.
3. Verify: `flux get kustomizations -A` shows every Kustomization's
   `Applied revision` pointing at a `home-operations` commit SHA, zero
   `NotReady`, and — because `prune: false` — nothing has been deleted even
   if something is wrong. This is the safe place to discover a gap.
4. Once confirmed clean, flip `prune: true` back on `cluster-meta` and
   `cluster-apps` **in `home-operations`'s copy** (it is now the live
   source; further edits to `equestria-cluster`'s copy no longer do
   anything) and reconcile once more to confirm the restored prune behavior
   doesn't delete anything either.
5. Recommended cleanup, not required for correctness: once the root sources
   from `home-operations`, the per-namespace `home-operations.<ns>.yaml`
   redirect files are redundant (a namespace can just point `sourceRef` at
   the self `flux-system` GitRepository, now also `home-operations`).
   Collapsing them removes a second `GitRepository/home-operations` object
   that would otherwise sit around meaning nothing. Fold this into a
   follow-up PR rather than the cutover itself.

## Exit gate

**The merged cluster reconciles from `home-operations` alone.** Concretely:
`flux get sources git -A` shows no `GitRepository` resolving to
`equestria-cluster` or `stargate-command-cluster`; `flux get kustomizations -A`
shows zero `NotReady` and every `Applied revision` is a `home-operations`
commit; a `pulumi preview` against `kubernetes/apps/pulumi/applications/*`
still succeeds (nothing about the Pulumi-vs-Flux responsibility line changed
here). This is the gate [22](22-decommission-sgc.md) and
[23](23-talos-in-pulumi.md) both wait on.

## Risks and rollback

| Step | What breaks | How you'd know | Rollback | Point of no return |
|---|---|---|---|---|
| Phase A, per namespace | Kustomization name collision; kustomize build fails | PR/`flate` check fails, or live Kustomization stuck | Revert the namespace's commit; the native Kustomization file is still there until step 3 deletes it | None — one namespace at a time, `cluster-apps` still owns the diff |
| Phase C step 2 (the flip) | `home-operations`'s tree is incomplete; with `prune: false` this surfaces as drift, not deletion | `flux get kustomizations -A` shows unexpected diffs or `NotReady` | Revert `instance.sync.url` back to `equestria-cluster` in a follow-up commit; `prune: false` means nothing was destroyed to roll back | **None, provided `prune: false` was actually in place before step 2.** This is the whole reason for the ordering in Phase B/C — skipping straight to the flip with `prune: true` still set is the hard failure mode |
| Phase C step 4 (re-enabling prune) | A namespace that looked clean under `prune: false` turns out to have an extra resource that Flux now deletes | Resource disappears; app-specific alerts fire | Depends on the resource — this is why step 4 is a separate, deliberate act after step 3's verification, not bundled into the flip itself | Soft — scoped to whatever that one resource was |
| CI drift | `sgc-sync.yaml` (equestria-cluster → stargate-command-cluster) keeps running against an archived target | Workflow failure notifications; a PR attempt against a read-only repo | Disable the workflow (see [22](22-decommission-sgc.md)) | None, but it must happen in the right order relative to repo archival |
| Phase A, namespace installs cluster-scoped resources (CRDs, ClusterRoles) via a dedicated Kustomization | **Confirmed live, 2026-08-13**: migrating `network` deleted the old `traefik-crds` Kustomization, whose finalizer cascade-deleted every Traefik/Gateway API CRD cluster-wide (not scoped to that namespace). The replacement redirect can't self-heal — it fails on its own baseline resources before ever reaching the nested Kustomization that would reinstall the CRD. `cluster-apps` itself wedges on the same error, blocking every other pending merge cluster-wide. See [26](26-bootstrap-apps-to-pulumi.md) for the full incident writeup and fix | `flux get kustomizations -A` shows a namespace's redirect `Ready: False` citing a `... not found` patch/apply error on a CRD-backed kind; `kubectl get crd \| grep <group>` comes back empty | Reinstall the CRD bundle directly against the API server, out of band from Flux: `kubectl apply --server-side --force-conflicts -k <path-to-the-CRD-kustomization>`. Breaks the deadlock; the namespace's own Kustomizations then recover on their own within a couple of minutes | None once CRDs are reinstalled, but check *before* merging any remaining namespace's PR whether it owns a dedicated CRD-installing Kustomization — `network` did, `kube-system` (checked 2026-08-13) does not |

## Cross-references

- [README.md](README.md) — decision ledger, full sequencing graph
- [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md) — hard prerequisite
- [06-age-key-consolidation.md](06-age-key-consolidation.md) — the single sops recipient this piece assumes
- [22-decommission-sgc.md](22-decommission-sgc.md) — starts after this piece's exit gate; retires `sgc-sync.yaml` and archives both cluster repos
- [23-talos-in-pulumi.md](23-talos-in-pulumi.md) — starts after this piece's exit gate; not on the critical path
- [26-bootstrap-apps-to-pulumi.md](26-bootstrap-apps-to-pulumi.md) — the CRD-cascade-deletion incident this piece's Phase A produced live, and why the fix (`bootstrap-apps.sh`'s CRD-reinstall step) belongs in Pulumi, not just a runbook note
