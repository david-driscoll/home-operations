# 26 — Migrate `scripts/bootstrap-apps.sh` into Pulumi

New, 2026-08-13. **Unfiled** — no dependency edge into the migration
sequencing graph in [README.md](README.md) yet. Standalone, like
[24](24-power-states.md) and [25](25-unseal-key-scope.md).

## What this delivers

Today `equestria-cluster:scripts/bootstrap-apps.sh` bootstraps a fresh (or
recovering) cluster by hand, before Flux exists on it: creates namespaces,
applies the SOPS-encrypted Flux secrets, installs a fixed list of
foundational CRDs via `kubectl apply --server-side` (Gateway API, Traefik,
the observability `application`/`cluster` CRDs, Tailscale operator CRDs),
and optionally applies the bootstrap Helm releases via `helmfile`. This
piece's job, when it's picked up, is to move that logic into Pulumi so it's
driven the same way as everything else in `components/`/`stacks/`, instead
of a bash script someone has to remember exists and run by hand.

## Why this matters more than "one less shell script"

**Incident, 2026-08-13, ~19:50–20:03 EDT** — during piece 21's `network`
namespace migration ([equestria-cluster#3156](https://github.com/david-driscoll/equestria-cluster/pull/3156)),
Flux's CRD-owning Kustomization (`network/traefik-crds`) got caught in
exactly the churn class flagged during piece 21's review: the
`<namespace>-ref` redirect flip deletes the *old* per-app Kustomization
object from git, `cluster-apps` prunes it, and pruning a Kustomization
cascades — its finalizer deletes everything it managed. For `traefik-crds`,
that was every Traefik and Gateway API CRD in the cluster: `Middleware`,
`IngressRoute`, `TLSOption`, `ServersTransport`, `HTTPRoute`, `TCPRoute`,
`BackendTLSPolicy`, all of it. CRD deletion cascade-deletes every *instance*
of that kind cluster-wide, so this wasn't scoped to the `network` namespace —
every namespace's `Middleware`-chained ingress (auth, redirects) was
affected simultaneously.

The replacement `network-ref` Kustomization could not self-heal. It applies
its entire rendered tree — including the baseline `Middleware` objects
`components/common` creates directly — in one pass, and that pass aborts on
the first `404` (the CRD isn't registered) before it ever reaches the nested
`traefik-crds` Kustomization that would reinstall it. A structural deadlock:
the fix depends on a step that can never run, because an earlier step in the
*same* apply keeps failing first. `cluster-apps` itself was wedged on the
identical error, which blocked every other pending merge — including the
unrelated tsidp staging Kustomization ([piece 13](13-stage-sgc-apps.md)) —
from applying at all, cluster-wide, until this was fixed.

**The fix was `bootstrap-apps.sh`'s own `apply_crds()` idea, run by hand, out
of band from Flux:**

```console
kubectl --context admin@equestria apply --server-side --force-conflicts \
  -k https://github.com/david-driscoll/home-operations/kubernetes/apps/network/traefik-crds
```

(`--force-conflicts` was needed because a `ValidatingAdmissionPolicyBinding`
from the Gateway API bundle was still partially tracked by
`kustomize-controller` as field manager, even mid-deadlock.) That one command
reinstalled the CRDs directly against the API server, broke the deadlock,
and let `traefik-crds` → `network-ref` → `cluster-apps` recover on their own
within about two minutes, no further intervention. Traefik's pods themselves
never restarted during the incident — only new/changed CRD-backed config was
affected — but a longer gap or a pod restart mid-incident would have been a
genuine cluster-wide ingress outage, not a near-miss.

## What this means for the Pulumi migration

- **The escape hatch has to survive the move.** Whatever replaces
  `apply_crds()` needs to remain runnable independently of Flux's own
  reconcile loop. A Pulumi resource that manages these CRDs directly (not
  indirectly through a Flux Kustomization it also owns) is the natural fit —
  Pulumi state doesn't get pruned by a `git rm` the way a Flux-owned
  Kustomization does.
- **Consider having Pulumi own the foundational CRDs outright**, the same
  way `components/globals.ts` centralizes providers. Gateway API, Traefik,
  and the observability CRDs are exactly the kind of thing that's
  catastrophic-if-briefly-missing and essentially never changes shape day to
  day. Moving that list from `bootstrap-apps.sh`'s array into a Pulumi
  resource removes it from the class of things a namespace-redirect churn
  can ever delete again — Flux would consume the CRDs Pulumi manages, not
  own their lifecycle itself.
- **This is a real failure mode of the `<namespace>-ref` redirect pattern**
  ([21](21-repo-consolidation-flux-repoint.md)), not a network- or
  coder-specific fluke: any namespace whose migration includes a
  Kustomization that installs cluster-scoped resources (CRDs, ClusterRoles,
  etc.) is at risk of the identical deadlock. Checked `kube-system`'s
  still-open migration PR ([equestria-cluster#3158](https://github.com/david-driscoll/equestria-cluster/pull/3158))
  for the same shape: **no standalone CRD-installing Kustomization exists
  there** — Cilium and `snapshot-controller` both bundle their CRDs inside
  their own Helm charts' `crds/` folder, which Helm's own convention
  protects from deletion on uninstall/upgrade by default. So kube-system
  isn't exposed to *this specific* deadlock, though the separate
  uninstall/reinstall churn on Cilium/CoreDNS themselves (flagged earlier in
  piece 21's review) is still a live, independent risk worth watching when
  that PR merges.

## Cross-references

- [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md) —
  the piece whose namespace-redirect pattern triggered this incident
- [13-stage-sgc-apps.md](13-stage-sgc-apps.md) — the tsidp staging
  Kustomization collaterally blocked by the same deadlock
- [23-talos-in-pulumi.md](23-talos-in-pulumi.md) — sibling follow-on piece
  (Talos machine config, not app bootstrap); independent of this one, can
  run in either order
- `equestria-cluster:scripts/bootstrap-apps.sh` — today's implementation,
  the thing this piece replaces
