# 02 — VolSync two-writer cleanup (B)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84).

**Decisions this piece implements:** D3 boundary case (the "duplicate — drop the sgc copy" split
from [Expansion v2 §2](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273)
applied specifically to `technitium` and `registry`, the two apps that run on **both** clusters
today).

## Read this first: the premise this piece was scoped around is wrong

The July discovery record — both
[Expansion v2 §0.1](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112044984)
and [§1.7 of the v2 rewrite](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273)
— states that both clusters mount the *same* NFS export
(`10.10.10.10:/mnt/stash/backup/volsync`) and that VolSync's restic repositories are therefore
"global and keyed only by app name, not by cluster." From that, it concludes `technitium` and
`registry` — the two apps that run on both SGC and equestria — are writing into **one shared
restic repository**, and that either side's 14-day prune can silently delete the other's
snapshots. The README carries this forward as Piece B's mandate: *"SGC's `technitium`/`registry`
ReplicationSources gone — one writer per shared restic repo."*

**I verified this live against both clusters on 2026-08-13, and it is not true.** Each cluster's
VolSync mover pods write into a **cluster-specific subdirectory**, not a shared one. There is no
two-writer collision on the restic repository content today, and there is no evidence there ever
was one. The rest of this document explains what's actually true, why the July research got it
wrong, and what to do instead — which is a smaller, lower-urgency piece of work than originally
scoped.

### The evidence

`kubernetes/components/volsync/replicationsource.yaml` (identical in both cluster repos) sets:

```yaml
restic:
  repository: "${APP}-volsync-secret"
```

and the paired `externalsecret.yaml` in that same component renders that Secret's
`RESTIC_REPOSITORY` field as the literal `/repository/${APP}`. **This is the file the July
research read, and reading only this file, the "global repo keyed by app name" conclusion looks
right** — `/repository/technitium` is the same string on both clusters. But `/repository` is a
relative in-container path, not a filesystem location, and nothing in this component defines
what's mounted there. VolSync's restic mover Jobs don't carry a volume for it natively — it has
to be injected.

It's injected by a `MutatingAdmissionPolicy` that neither the original discovery comment nor the
README's carried-forward summary mentions —
`kubernetes/apps/volsync-system/volsync/mutatingadmissionpolicy.yaml`, present in both cluster
repos, matching any `batch/v1` `Job` named `volsync-*` with label
`app.kubernetes.io/created-by: volsync` (i.e., every VolSync mover pod) and adding:

```yaml
volumes:
  - name: repository
    nfs:
      server: "10.10.10.10"
      path: "/mnt/stash/backup/${CLUSTER_CNAME}/volsync"
volumeMounts:
  - name: repository
    mountPath: /repository
```

`${CLUSTER_CNAME}` is substituted from the `cluster-secrets` Secret in `flux-system`, which every
Kustomization under `kubernetes/apps` receives via a patch injected by the root `cluster-apps`
Kustomization (`kubernetes/flux/cluster/ks.yaml`) — the same mechanism vault#118's fix used to
patch every Flux controller Deployment. Read live from both clusters, 2026-08-13:

```
$ kubectl --context admin@sgc -n flux-system get secret cluster-secrets \
    -o jsonpath='{.data.CLUSTER_CNAME}' | base64 -d
sgc

$ kubectl --context admin@equestria -n flux-system get secret cluster-secrets \
    -o jsonpath='{.data.CLUSTER_CNAME}' | base64 -d
equestria

$ kubectl --context admin@sgc get mutatingadmissionpolicy volsync-mover-nfs -o yaml | grep -A3 'nfs:'
      nfs:
        server: "10.10.10.10"
        path: "/mnt/stash/backup/sgc/volsync"

$ kubectl --context admin@equestria get mutatingadmissionpolicy volsync-mover-nfs -o yaml | grep -A3 'nfs:'
      nfs:
        server: "10.10.10.10"
        path: "/mnt/stash/backup/equestria/volsync"
```

So the actual, physical restic repositories are:

| App | SGC writes to | Equestria writes to |
|---|---|---|
| `technitium` | `10.10.10.10:/mnt/stash/backup/sgc/volsync/technitium` | `10.10.10.10:/mnt/stash/backup/equestria/volsync/technitium` |
| `registry` | `10.10.10.10:/mnt/stash/backup/sgc/volsync/registry` | `10.10.10.10:/mnt/stash/backup/equestria/volsync/registry` |

Four distinct restic repositories, not two shared ones. `restic prune` operates per-repository —
there is no operation either cluster can run that touches the other's directory. The 14-day
`pruneIntervalDays` on SGC's `technitium`/`registry` `ReplicationSource` objects has never been
able to delete equestria's snapshots, and vice versa.

### Where the July research went wrong, precisely

`kubernetes/apps/volsync-system/volsync/volume.yaml` (present, unused today, in both repos)
defines a **static** `PersistentVolume`/`PersistentVolumeClaim` named `volsync` mounting the
un-prefixed `10.10.10.10:/mnt/stash/backup/volsync` — no cluster subdirectory. This is almost
certainly what the original "both clusters mount the same NFS export" claim was based on. It's a
real object (`Bound`, 100Gi, confirmed live on SGC), but **nothing in either cluster tree
references it** — no `claimName: volsync` anywhere in either repo's `kubernetes/`, and no live
pod on SGC mounts it (checked every pod's volume list cluster-wide). Its git history
(`kubernetes/apps/volsync-system/volsync/volume.yaml`, commits from 2025-04-24 through
2025-04-26) sits right alongside the `MutatingAdmissionPolicy`'s own history, suggesting it was
an early, abandoned approach to the same problem — the admission-policy mechanism is what
actually shipped and has been in place, with the per-cluster path, since the component's
inception. This is not a fix that landed recently; the July research read the vestigial PV and
missed the mechanism that superseded it. **Today's reality wins over the July text per this
plan's standing rule, and today's reality is: there never was a live collision.**

## What this means for the plan

The two-writer *hazard*, as described, doesn't exist and doesn't need "fixing" as a
data-safety emergency. It is **not** a blocker for
[10-drain-safety.md](10-drain-safety.md) or anything downstream, and it should be removed from
any framing that treats it as urgent. (The README's Piece B summary line and its Phase-0 bullet
in the "what changed" section both need the same correction applied here — flagging for whoever
next touches `README.md`, since this file doesn't own it.)

That does **not** mean there's nothing to do. `technitium` and `registry` are both on the
"duplicate — drop the SGC copy" side of the [Expansion v2 §2
split](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273) (equestria
already runs both; SGC's copies are the ones being retired, not migrated). Their
`ReplicationSource` objects on SGC exist only to back up an app that this plan is going to
delete. The remaining work is ordinary decommissioning hygiene, not an urgent race condition:

1. **Suspend, then delete, SGC's `technitium` and `registry` `ReplicationSource` objects** —
   in practice this means removing the `components/volsync` reference from their `ks.yaml`
   files, since the `ReplicationSource` isn't a standalone file in either app directory; it's
   generated by the component:

   | App | File to edit | Change |
   |---|---|---|
   | `technitium` | `stargate-command-cluster/kubernetes/apps/sgc/dns/technitium/ks.yaml` | Remove `../../../../components/volsync` from `spec.components` |
   | `registry` | `stargate-command-cluster/kubernetes/apps/kube-system/registry/ks.yaml` | Remove `../../../components/volsync` from `spec.components` |

   Do this as part of decommissioning the apps themselves in
   [22-decommission-sgc.md](22-decommission-sgc.md) (or whichever phase actually deletes SGC's
   `technitium`/`registry` app definitions), not as an isolated, urgent fix — there's no data
   race to race against. If you want to suspend the `ReplicationSource` ahead of the actual app
   removal for tidiness, `flux suspend` (or scale/patch `spec.trigger.manual`) works without a
   git change, but it isn't required for safety.

2. **Decide what happens to the orphaned data.** Once SGC's copies stop writing, the restic
   repositories at `10.10.10.10:/mnt/stash/backup/sgc/volsync/technitium` and
   `.../sgc/volsync/registry` become dead weight — nobody prunes them, nobody restores from
   them, and they sit there indefinitely under `retain`-style backup semantics. This is a
   storage-reclamation item, not a two-writer item: fold it into
   [22-decommission-sgc.md](22-decommission-sgc.md)'s cleanup of everything SGC-shaped, alongside
   the rest of the `/mnt/stash/backup/sgc/` tree once the whole cluster is retired. No action
   needed in this phase beyond noting it.

3. **The vestigial static PV/PVC** (`kubernetes/apps/volsync-system/volsync/volume.yaml`, both
   repos) is unused and safe to leave alone — removing it is a pure cleanup with zero blast
   radius, and can ride along with whichever phase touches `volsync-system` next
   ([12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) is the more natural owner, since
   it's already restructuring VolSync-adjacent storage classes). Not gating anything here.

## The byte-identical claim — re-verified, and now precise

The brief for this piece asked me to re-verify the "byte-identical `RESTIC_REPOSITORY` template"
claim from the discovery record. It is **still true for the load-bearing line**, but the file
around it is not identical anymore:

```diff
$ diff equestria-cluster/kubernetes/components/volsync/externalsecret.yaml \
       stargate-command-cluster/kubernetes/components/volsync/externalsecret.yaml
9,13c9,12
<   # Phase 6: one edit here moves 39 ExternalSecrets across 4 namespaces —
<   # every VolSync restic repository in the estate. ...
---
>   # Phase 7: one edit here moves 9 ExternalSecrets across 4 namespaces — every
>   # VolSync restic repository in this cluster. ...
```

The only differences are comments left by each repo's OpenBao migration (equestria's Phase 6 vs
SGC's Phase 7 of that separate, already-completed effort — see the OpenBao estate deployment
memory). The functional line, `RESTIC_REPOSITORY: "/repository/${APP}"`, is byte-identical in
both files, and both repos' `ClusterSecretStore`-backed `dataFrom.extract.key:
shared/volsync-password` resolve to the same OpenBao value, so the restic **encryption
password** is genuinely shared across every app and both clusters. That's a real, intentional
piece of shared state — it's what would let you point a restic client at the other cluster's
repository and read it, if you ever wanted to — but a shared password is not a shared
repository, and it creates no prune collision.

## Exit gate

Given the corrected finding, this piece's exit condition is narrower than originally scoped:

```bash
# 1. Confirm the per-cluster NFS split is still in effect (re-verify before relying on the
#    "no collision" finding — this is the load-bearing check for this entire document)
for ctx in admin@sgc admin@equestria; do
  echo "== $ctx =="
  kubectl --context $ctx get mutatingadmissionpolicy volsync-mover-nfs -o yaml | grep -A3 'nfs:'
done
# expect: different `path:` per cluster, each containing that cluster's CLUSTER_CNAME

# 2. Once technitium/registry are actually decommissioned on SGC (per whichever phase does it):
kubectl --context admin@sgc get replicationsource -n network technitium 2>&1
kubectl --context admin@sgc get replicationsource -n kube-system registry 2>&1
# expect: both "not found"

# 3. Equestria's copies unaffected throughout
kubectl --context admin@equestria get replicationsource -A | grep -E 'technitium|registry'
# expect: both present, LAST SYNC recent
```

**Reversible:** entirely, at every stage. Nothing in this piece deletes data — it only stops a
`ReplicationSource` on a cluster that's already scheduled for decommission from continuing to
write backups nobody will restore.

## See also

- [README.md](README.md) — decision ledger; note its Piece B summary and "what changed" section
  both need the correction in this file applied
- [01-stabilise.md](01-stabilise.md) — the other Phase-0-adjacent cleanup, independent of this
  file
- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — natural owner for the vestigial
  static PV/PVC cleanup
- [22-decommission-sgc.md](22-decommission-sgc.md) — where SGC's `technitium`/`registry` app
  definitions and their orphaned restic data actually get removed
