# 10 — Drain safety (I)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). Depends on
[01-stabilise.md](01-stabilise.md)'s exit gate. Gates
[18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) and
[12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — nothing that wipes or rejoins a
node should start until this file's rehearsal has actually passed on all seven nodes.

**What this piece does not do:** it does not create the `critical`/`bulk` Longhorn node tags or
the `longhorn-critical` StorageClass — that's
[12-longhorn-critical-tier.md](12-longhorn-critical-tier.md). It does not apply the Talos
`node-role.driscoll.tech/critical` taint itself — that's
[20-low-power-tier.md](20-low-power-tier.md). It lands the one piece of groundwork those two
files depend on: Longhorn must already be configured to *tolerate* that taint before it exists,
because retrofitting tolerance after the taint lands costs an ~1 hour sync delay per
[Longhorn's own docs](https://longhorn.io/docs/1.9.0/advanced-resources/deploy/taint-toleration/).

## Read this first: a live incident sits directly on top of this piece's scope, today

Longhorn's own config is mid-migration into `home-operations` right now, and it broke in a way
that intersects this file more than any other. This was discovered during this session's live
verification, not flagged elsewhere — [01-stabilise.md](01-stabilise.md)'s exit gate doesn't
check it, and [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md)'s
migration table checked the wrong layer (the wrapper Kustomization, not the child it delegates
to) and reads healthier than the cluster actually is. Treat the table below as this file's real
Step 0, not background color.

**What happened, reconstructed from git + live cluster state:** on 2026-08-12 22:11–23:28,
`longhorn-system`, `nfs-system` and `openebs-system` were moved out of `equestria-cluster` and
`stargate-command-cluster` into `home-operations` — a small precursor slice of the repo
consolidation that [21](21-repo-consolidation-flux-repoint.md) plans for much later, done ahead
of schedule (`home-operations@5fa1a7f2` "migrating longhorn-system, nfs-system and
openebs-system", plus follow-ups; identical commits landed in all three repos, e.g.
`equestria-cluster@efae3b5f7`, `stargate-command-cluster@d705df533`). Two things broke:

1. **The per-app Kustomizations that got split out of the wrapper never picked up
   `postBuild.substituteFrom` for the cluster's `CLUSTER_DOMAIN`/`SPIKE_IP` secrets.** The
   *wrapper* Kustomization (`longhorn-system`, `nfs-system`) still reconciles fine — it just
   applies a folder of child `Kustomization` CRs — but those children fail their own build.
2. **Flux pruned the old, directly-defined `HelmRelease/longhorn`** when the wrapper's content
   changed from "the app itself" to "a folder of child Kustomizations," and Longhorn's own
   `deleting-confirmation-flag` safety setting is correctly refusing to let the resulting `helm
   uninstall` proceed. **No data has been lost** — this is the guard working as designed — but
   the `HelmRelease` object is wedged retrying forever, and it is not obvious from `flux get
   kustomizations` alone that anything is wrong, because the parent Kustomizations all read
   `Ready`.

Live state, verified **2026-08-13T04:38Z**, both clusters, identical shape on each:

```bash
$ kubectl --context admin@equestria get helmrelease longhorn -n longhorn-system
NAME       AGE    READY   STATUS
longhorn   156d   False   Helm uninstall failed for release longhorn-system/longhorn.v11 with
                          chart longhorn@1.12.0: failed early due to stalled resources:
                          [Job/longhorn-system/longhorn-uninstall status: 'Failed']
# 18 failures, wedged since 02:25Z. Root cause, from the uninstall Job's own log:
#   "cannot uninstall Longhorn because deleting-confirmation-flag is set to `false`.
#    Please set it to `true` using Longhorn UI or kubectl -n longhorn-system edit
#    settings.longhorn.io deleting-confirmation-flag" — Longhorn refusing to self-destruct.

$ kubectl --context admin@equestria get kustomization longhorn -n longhorn-system \
    -o jsonpath='{range .status.conditions[*]}{.type}={.status} {.reason}: {.message}{"\n"}{end}'
Ready=False BuildFailed: post build failed for 'ApplicationDefinition.v1.driscoll.dev/${APP}':
  envsubst error: variable substitution failed: variable not set (strict mode): "CLUSTER_DOMAIN"

$ kubectl --context admin@equestria get kustomization csi-driver-nfs -n nfs-system \
    -o jsonpath='{range .status.conditions[*]}{.type}={.status} {.reason}: {.message}{"\n"}{end}'
Ready=False BuildFailed: post build failed for 'StorageClass.v1.storage.k8s.io/nfs-csi':
  envsubst error: variable substitution failed: variable not set (strict mode): "SPIKE_IP"

$ kubectl --context admin@equestria get storageclass nfs-csi
Error from server (NotFound): storageclasses.storage.k8s.io "nfs-csi" not found
```

Downstream: `longhorn-system/storageclass` is `DependencyNotReady` (blocked on `longhorn`), and
**`volsync-system/volsync` and `equestria/truenas-volumes` are both `DependencyNotReady` on
`nfs-system/csi-driver-nfs`**, on both clusters. The `nfs-csi` StorageClass itself is gone
(`NotFound`) on both clusters. The running VolSync controller pod and existing `nfs-csi`-backed
mounts are unaffected *so far* — this is a reconciliation freeze, not a live outage — but the
next scheduled VolSync cycle (daily, `14:00 UTC`) is the first real test of whether anything
actually needs that StorageClass to exist, and nobody has verified it doesn't.

**This is likely already being worked.** `home-operations`, `equestria-cluster` and
`stargate-command-cluster` all show commits *after* the migration burst with messages like
`more secrets`, `Add cluster and shared secrets with SOPS encryption`, `bootstrap tweak` — this
reads as an in-progress fix for exactly this `substituteFrom` gap, not an abandoned change. **Do
not "fix" it by flipping `deleting-confirmation-flag` to `true`** — that unblocks the very
uninstall this file needs to *not* happen. The correct direction is the one already in progress:
restore `postBuild.substituteFrom` on the split-out child Kustomizations so they resolve
`CLUSTER_DOMAIN`/`SPIKE_IP`, which stops Flux from wanting to touch the `HelmRelease` at all once
its managed-resource inventory stabilizes.

**Step 0, before anything else in this file:** re-run the block above. Proceed only once
`longhorn-system/longhorn`, `longhorn-system/storageclass`, `nfs-system/csi-driver-nfs`,
`volsync-system/volsync` are all `Ready=True` and `nfs-csi` exists as a StorageClass again, on
**both** clusters. A drain rehearsal against a Longhorn install whose own Flux ownership is
unsettled is not a fair test of anything, and could turn a benign reconciliation freeze into a
second incident layered on the first.

## Corrections to the July/early-August discovery comments

[Expansion v2](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273) and
[v2.1](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583) both describe
this piece's starting point. Two of their claims are now stale — verified against the live
`settings.longhorn.io` CRs and the `home-operations` values file, not just re-read:

- **`node-drain-policy` is not `block-for-eviction-if-contains-last-replica`.** v2.1 §3.3 read it
  as already set to that value and called Phase 3 "half done" on that basis. It is actually
  **`allow-if-replica-is-stopped`**, live on both clusters today, and the `home-operations`
  values file explains why in an inline comment: `block-for-eviction-if-contains-last-replica`
  deadlocks a Talos upgrade on any node holding a `longhorn-local` (`strict-local`,
  `numberOfReplicas: 1`, hard PV node-affinity) volume, because Longhorn tries to rebuild the
  last replica elsewhere before releasing the drain and that rebuild can never schedule —
  matching [vault#139](https://github.com/david-driscoll/vault/issues/139)'s shining-armor
  symptom exactly (stuck `Failed`, tainted, tuppr retrying forever). `allow-if-replica-is-stopped`
  still refuses to evict a node whose last replica is actively *running*, but lets the drain
  through once the workload is gone and the replica has stopped. Trade-off, stated in the same
  comment: a single-replica volume on a node that never comes back is lost — already true for
  every `longhorn-local` volume by construction, not a new risk. **This is the setting to keep,
  not to change** — it's a better fit for this estate's `strict-local` CNPG volumes than the
  policy the discovery comments assumed.
  ```bash
  $ kubectl --context admin@equestria get settings.longhorn.io node-drain-policy -n longhorn-system -o jsonpath='{.value}'
  allow-if-replica-is-stopped
  $ kubectl --context admin@sgc get settings.longhorn.io node-drain-policy -n longhorn-system -o jsonpath='{.value}'
  allow-if-replica-is-stopped
  ```
- **[vault#139](https://github.com/david-driscoll/vault/issues/139) (shining-armor) is resolved
  live**, even though the tracker still shows it `open` — [01-stabilise.md](01-stabilise.md)'s
  own verification table covers this in full; this file just needs the fact that the node-drain
  deadlock pattern it exposed is real and is exactly what `allow-if-replica-is-stopped` exists to
  prevent going forward.
- **`taint-toleration` is still empty**, on both clusters — this part of v2.1 §3.3/§3.4 holds.
  Work item 1 below is what fixes it.

## Work items

### 1. Longhorn `taint-toleration` — land it now, before anything tolerates it

[12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) tags control planes `critical` and
workers `bulk`, and [20-low-power-tier.md](20-low-power-tier.md) is what actually applies the
Talos taint `node-role.driscoll.tech/critical=true:NoSchedule` to the three control planes. Both
are phases away. The reason this file adds Longhorn's *tolerance* of that taint today, months
before the taint exists, is entirely about *when* the setting takes effect:
[Longhorn's docs](https://longhorn.io/docs/1.9.0/advanced-resources/deploy/taint-toleration/) are
explicit that a `taint-toleration` change applies to running instance-managers immediately only
if workloads are stopped and volumes detached; with volumes still attached, it applies to the
instance-manager only once no engine or replica instance is running on that node, and otherwise
the change simply waits for the next ~1 hour sync. Doing this now, while nothing is tainted yet
and there is no urgency, means the setting is already correct and already synced by the time
[20](20-low-power-tier.md) actually applies the taint — turning a "stop workloads, wait up to an
hour, hope nothing needed those instance-managers meanwhile" step into a no-op.

```bash
# Current value, both clusters — confirmed empty 2026-08-13
kubectl --context admin@equestria get settings.longhorn.io taint-toleration -n longhorn-system -o jsonpath='{.value}'
kubectl --context admin@sgc get settings.longhorn.io taint-toleration -n longhorn-system -o jsonpath='{.value}'
```

Set it in the `home-operations` values file (once Step 0 above has it reconciling cleanly), not
by hand — a `kubectl edit` gets reverted on the next Flux sync:

```yaml
# kubernetes/apps/longhorn-system/longhorn/values.yaml, defaultSettings:
taintToleration: node-role.driscoll.tech/critical=true:NoSchedule
```

This is additive and inert today — there is no matching taint on any node yet (confirmed live,
2026-08-13: `kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{": "}{.spec.taints}{"\n"}{end}'`
prints an empty taint list for all seven nodes on both clusters), so tolerating a taint that
doesn't exist changes nothing about current scheduling. It only pays off later. Do this as its
own small PR now, not bundled into [12](12-longhorn-critical-tier.md) or
[20](20-low-power-tier.md)'s later PRs — the whole point is that it lands early and is boring by
the time it matters.

*Exit:* `taint-toleration` reads `node-role.driscoll.tech/critical=true:NoSchedule` live on both
clusters; no instance-manager pod restarted or moved as a result (verify with
`kubectl get pods -n longhorn-system -l app=longhorn-instance-manager -o wide` before/after).

### 2. Confirm replica placement never leaves a bare last-replica on drain

Verified live, 2026-08-13, both clusters:

```bash
$ kubectl --context admin@equestria get settings.longhorn.io replica-soft-anti-affinity -n longhorn-system -o jsonpath='{.value}'
false
```

`replica-soft-anti-affinity: false` means Longhorn enforces **hard** anti-affinity — no two
replicas of the same volume may share a node. Combined with `numberOfReplicas: 3` on the default
`longhorn` StorageClass across seven nodes, no single-node drain can strand a 3-replica volume
down to zero without at least two replicas surviving elsewhere. The volumes this doesn't protect
are the `longhorn-local` (`strict-local`, `numberOfReplicas: 1`) class — CNPG's PVCs use this
class by design (§3.2 of
[v2.1](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583) confirms it),
and *every* one of those is a genuine last-replica-on-one-node situation, unconditionally. That's
not a misconfiguration to fix here — it's the reason
[18](18-sgc-nodes-join-control-plane.md) and
[19](19-rotate-equestria-control-planes.md) both mandate `kubectl cnpg destroy` for replica
surgery instead of touching the PVC directly, and it's why `allow-if-replica-is-stopped` (§ above)
rather than the eviction-blocking policy is the correct drain posture for this estate.

Zero degraded volumes on either cluster right now (2026-08-13) — every volume reads `healthy`
(attached) or `unknown` (idle VolSync cache PVCs, detached; not degradation, per
[01](01-stabilise.md)'s exit gate filter):

```bash
$ kubectl --context admin@equestria get volumes.longhorn.io -n longhorn-system \
    -o jsonpath='{range .items[*]}{.status.robustness}{"\n"}{end}' | sort | uniq -c
     61 healthy
     42 unknown
$ kubectl --context admin@sgc get volumes.longhorn.io -n longhorn-system \
    -o jsonpath='{range .items[*]}{.status.robustness}{"\n"}{end}' | sort | uniq -c
     10 healthy
      5 unknown
```

*Exit:* no action needed beyond confirming these settings before the rehearsal — this section is
a verification checkpoint, not a change.

### 3. The per-node drain rehearsal — all seven, one at a time

This is the actual test the rest of the plan depends on. IM PDBs reading `ALLOWED DISRUPTIONS: 0`
at rest is normal and expected under `block-for-eviction-if-contains-last-replica`'s successor —
it does not by itself mean a node can't be drained; it means Longhorn hasn't been asked to prove
it yet. This rehearsal is that proof.

```bash
$ kubectl --context admin@equestria get pdb -n longhorn-system
NAME                                                MIN AVAILABLE   ALLOWED DISRUPTIONS   AGE
instance-manager-3e15f5e34dba08f31a9873a4afbcf291   1               0                      22d
instance-manager-52e9a0ea449dd9821bbd4336db007bd7   1               0                      8d
instance-manager-b02b60880ab101f19722ccf77d18edc8   1               0                      8d
instance-manager-f7723a2475849e2f43e7660a03dca00f   1               0                      8d
```
(sgc shows the same shape, 3 instance-manager PDBs.)

**Procedure, per node, in this order — `shining-armor` first (worker, lowest blast radius, most
recently proven healthy per §139 above), then the three equestria control planes, then the three
sgc control planes last (they're the ones actually joining as control planes in
[18](18-sgc-nodes-join-control-plane.md), so proving them last keeps the rehearsal closest in
time to when it matters):**

1. **Pre-check.** Zero degraded volumes cluster-wide. This node holds no unique last replica
   outside the expected `longhorn-local` set (cross-reference `kubectl get volumes.longhorn.io -o
   jsonpath='{range .items[*]}{.status.currentNodeID}{" "}{.spec.numberOfReplicas}{"\n"}{end}'`
   against the node under test). etcd healthy: `talosctl -n <any-CP> etcd status` (or
   `kubectl get --raw /livez/etcd` from within the cluster) shows the expected member count with
   no alarms.
   **On any of equestria's four nodes** (`shining-armor`, `hard-hat`, `fluttershy`,
   `kerfuffle` — OpenBao only runs on equestria, not sgc), also check which OpenBao pod is
   active and where: `kubectl --context admin@equestria get pods -n kube-system -l
   app.kubernetes.io/name=openbao -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,ACTIVE:.metadata.labels.openbao-active`.
   Verified live 2026-08-13: `helmrelease.yaml` sets no `server.affinity` or
   `topologySpreadConstraints` for OpenBao, so its three pods land wherever the scheduler
   puts them — **never assume the spread from a prior check still holds.** The `openbao` PDB
   (`kube-system`) is `maxUnavailable: 1`, so draining the node holding the *active* instance
   is expected to trigger a failover, not a refusal — but confirm that's what you're
   triggering, not a surprise.
2. `kubectl cordon <node>`.
3. `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --timeout=15m`. Expect this
   to succeed under `allow-if-replica-is-stopped` once workloads scheduled there have terminated
   and their replicas stop — it is not instant, and that wait is the point of the rehearsal, not
   a failure.
4. **Between drain and uncordon, verify, not assume:**
   - Every Longhorn volume back to `robustness: healthy` (or `unknown` only for detached idle
     PVCs — see [01](01-stabilise.md)'s exit gate for the exact filter).
   - etcd still reports the same healthy member count as step 1, no leader changes attributable
     to this drain.
   - Cilium `cilium status` (or `kubectl get ciliumnodes`) shows every remaining node `Ready`
     before touching the next one — **this is the guard against the zombie-node cascade**
     documented estate-wide: a node that comes back with Cilium not yet ready looks `Ready` to
     `kubectl get nodes` while its instance-manager goes `OutOfcpu` and Longhorn/CNPG wedge
     behind it. If a node comes back wrong, check nodes and taints first, not CNPG.
   - **On equestria nodes only:** `ClusterSecretStore/openbao` still reads `Ready: True`
     (same command as [01](01-stabilise.md)'s exit gate item 10), and if this node held the
     active OpenBao instance, a new pod has taken over (`openbao-active=true` on a different
     pod) rather than the store sitting unreachable. OpenBao's own data isn't at risk either
     way — it's stateless towards the pod (`dataStorage.enabled: false`, everything lives in
     the `database/postgres` CNPG cluster) — the risk is a window where every
     `ExternalSecret` on the cluster stops refreshing.
5. `kubectl uncordon <node>`. Wait for it to report `Ready`, for its Longhorn node object to
   report `Ready` with disks schedulable, and for any replicas that rebuild onto it to finish.
6. **Full stop before the next node.** Do not pipeline nodes. If any check in step 4 fails,
   **the rehearsal stops here** — do not proceed to the next node, and do not proceed to
   [18](18-sgc-nodes-join-control-plane.md)/[19](19-rotate-equestria-control-planes.md) until the
   failure is understood and this node's cycle is re-run clean.

**IM PDB deletion stays a tactical fallback, not the routine.** If a drain genuinely wedges (a
volume that should have released its last replica doesn't, and `kubectl drain` times out),
manually deleting the per-node instance-manager PDB — after confirming that node holds no
last-replica volume the deletion would actually endanger — is the documented escape hatch from
prior Talos-upgrade incidents on this estate. Needing it during this rehearsal is a signal to
investigate why the policy didn't handle it on its own, not just a step to repeat every time.

### 4. vault#132 — what "pass" means on sgc specifically

[vault#132](https://github.com/david-driscoll/vault/issues/132) has been open since
2026-08-03: sgc's `KubeCPUOvercommit` alert fires because the cluster's summed CPU *requests*
exceed allocatable-minus-one-node by 0.35 cores — a scheduling-margin warning, not a live
resource crunch (all three nodes had headroom when filed: 43-66% CPU). It has not been
re-verified as part of this piece; re-check before the sgc leg of the rehearsal, since a
month-old snapshot of "not urgent" is exactly the kind of claim this plan keeps finding stale in
the helpful direction, but shouldn't be assumed stale in the *unhelpful* direction here.

**What this means for the rehearsal:** draining any one of sgc's three all-control-plane nodes
while the cluster is already 0.35 cores over its one-node-failure budget will almost certainly
push some pods to `Pending` — that is the alert's literal claim, not a new risk this rehearsal
introduces. Decide "pass" as:

- **Required:** every platform/system pod (Cilium, CSI plugins, CoreDNS-equivalent, Longhorn
  instance-managers, Flux controllers) reschedules and reaches `Running` on the two remaining
  nodes. If any of these stay `Pending`, the rehearsal has found a real problem — stop and treat
  it as a blocker, not an accepted risk.
- **Acceptable:** lower-priority application pods may sit `Pending` for the duration of the
  drain and resume once the node returns. Note which ones, and how long — that's the actual
  measurement vault#132 was missing, and it belongs in that issue's thread as the concrete
  evidence its own filer flagged as not-yet-done ("didn't pull the exact per-namespace request
  breakdown").
- **This resolves itself, not by this file.** [15-migrate-apps.md](15-migrate-apps.md) is what
  actually relieves sgc's overcommit — five apps' worth of requests leave sgc for equestria
  before sgc's nodes ever join as control planes. This piece's job is to characterize the
  current margin honestly, not to fix it; fixing it happens elsewhere in the sequence and mostly
  as a side effect.

## Cross-cutting traps (from the estate's incident history, not new to this file)

- **One node at a time, always**, with the explicit etcd/Cilium/Longhorn gate between nodes in
  §3 step 4. A full-cluster restart or multiple simultaneous node returns is the shape of the
  Cilium zombie-node cascade that has already forced a physical power-cycle on sgc once: a node
  boots with Cilium not yet ready → its instance-manager goes `OutOfcpu` → Longhorn and CNPG
  wedge behind it. If a node comes back wrong, check nodes and taints first — not CNPG, which is
  usually a downstream victim, not the cause.
- **CNPG replica surgery is `kubectl cnpg destroy`, never manual PVC deletion.** `longhorn-local`
  PVCs are `strict-local` with hard node affinity; a replica that's lost when its node doesn't
  come back clean must be re-provisioned, not rescued by touching the PVC. This applies during
  the rehearsal exactly as it will during the real node wipes in
  [18](18-sgc-nodes-join-control-plane.md)/[19](19-rotate-equestria-control-planes.md).
- **`pulumi refresh` is a trap** on these stacks (UniFi provider read-404s on a full refresh) —
  irrelevant to this file directly, but if the rehearsal prompts anyone to "just refresh state
  and see," don't; see [04-pulumi-state-backend.md](04-pulumi-state-backend.md).

## Exit gate

All of the following, re-checked immediately before starting
[18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) — this file's own
snapshot will be stale by then, the same way [01](01-stabilise.md)'s July snapshot was stale by
August:

```bash
# 1. Step 0's live incident is fully resolved, both clusters
for ctx in admin@equestria admin@sgc; do
  echo "== $ctx =="
  kubectl --context $ctx get kustomization longhorn -n longhorn-system \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
  kubectl --context $ctx get kustomization storageclass -n longhorn-system \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
  kubectl --context $ctx get kustomization csi-driver-nfs -n nfs-system \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
  kubectl --context $ctx get storageclass nfs-csi
  kubectl --context $ctx get helmrelease longhorn -n longhorn-system \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
done
# expect: True, True, True, a StorageClass object, True — on both clusters

# 2. taint-toleration landed and synced, both clusters
kubectl --context admin@equestria get settings.longhorn.io taint-toleration -n longhorn-system -o jsonpath='{.value}'
kubectl --context admin@sgc get settings.longhorn.io taint-toleration -n longhorn-system -o jsonpath='{.value}'
# expect: node-role.driscoll.tech/critical=true:NoSchedule on both

# 3. node-drain-policy still allow-if-replica-is-stopped (hasn't drifted back)
kubectl --context admin@equestria get settings.longhorn.io node-drain-policy -n longhorn-system -o jsonpath='{.value}'
kubectl --context admin@sgc get settings.longhorn.io node-drain-policy -n longhorn-system -o jsonpath='{.value}'

# 4. All seven nodes have completed one full drain -> uncordon cycle this pass, with
#    zero degraded volumes and no lingering taints/cordons
kubectl --context admin@equestria get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" cordoned="}{.spec.unschedulable}{"\n"}{end}'
kubectl --context admin@sgc get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" cordoned="}{.spec.unschedulable}{"\n"}{end}'
kubectl --context admin@equestria get volumes.longhorn.io -n longhorn-system \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.robustness}{"\n"}{end}' | grep -v -E 'healthy|unknown'
kubectl --context admin@sgc get volumes.longhorn.io -n longhorn-system \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.robustness}{"\n"}{end}' | grep -v -E 'healthy|unknown'
# expect: unschedulable=<none> on all 14 lines; both degraded-volume queries print nothing

# 5. vault#132 characterized (not necessarily fixed) — know what pended and for how long
```

If any node's cycle in item 4 was skipped, retried with a manual PDB deletion, or left the
cluster in a state that needed investigation, **that node has not passed** — re-run it clean
before this gate is considered green.

**Reversible:** yes, entirely, and cheaper here than anywhere downstream — uncordoning a node
that failed to drain cleanly costs nothing but time. This is deliberately the first
node-touching file in the sequence for exactly that reason.

## See also

- [README.md](README.md) — decision ledger, full sequencing, cross-cutting rules
- [01-stabilise.md](01-stabilise.md) — this file's prerequisite exit gate
- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — the node tags and StorageClass
  that consume the `taint-toleration` groundwork landed here
- [20-low-power-tier.md](20-low-power-tier.md) — where the actual `critical` taint gets applied
- [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md) — the wider
  migration this file's Step 0 incident is a precursor slice of; its own migration table should
  be re-checked at the child-Kustomization level, not just the wrapper, once Step 0 is resolved
- [11-volumesnapshotcontents-trim.md](11-volumesnapshotcontents-trim.md) — the other Longhorn/CSI
  storage piece with its own dependency on Step 0 being clean
- [18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) — depends on this
  file's rehearsal having passed on all seven nodes
