# 29 — Control-plane taint readiness audit

New, **2026-08-19**. **Unfiled** — standalone, like [24](24-power-states.md) through
[28](28-postgres-restore-and-bootstrap-deadlock.md).

Answers one question: **is it safe to flip `allowSchedulingOnControlPlanes` from `true` to
`false` in [`talos/patches/controller/cluster.yaml`](../../talos/patches/controller/cluster.yaml)?**

That flip taints `milky-way`, `othalla` and `pegasus` with
`node-role.kubernetes.io/control-plane:NoSchedule`.

> **Verdict: NOT SAFE YET.** Two hard blockers and one storage-plane blocker, listed in
> [§7](#7-verdict-and-ordered-prerequisites). One of them —
> `etcd-tasks-backup`/`etcd-tasks-defrag` — is fixed by this change; the other two are
> operational and cannot be fixed in Git.

> **Update, 2026-08-19 (later the same day).** **All three blockers are now cleared** and
> all four gate commands in [§7](#7-verdict-and-ordered-prerequisites) pass. Blocker C was
> resolved with `kubectl cnpg destroy`. Blocker B was resolved **without** the
> volumes-detached maintenance window this document prescribes — that prescription was
> stricter than necessary; see
> [§4.4](#44-how-blocker-b-was-actually-resolved-without-a-detach-window). Nothing in
> §§1–6 below was rewritten; it stands as the audit read on the morning of 2026-08-19.

Everything marked **verified live** below was read from `admin@equestria` on 2026-08-19
with read-only commands. Nothing was patched, drained or cordoned. Claims marked
**inferred** are reasoning from Kubernetes/Longhorn semantics, flagged as such.

---

## 1. Starting state (verified live, 2026-08-19)

Post-[19](19-rotate-equestria-control-planes.md) topology, `kubectl get nodes -o wide`:

| Node | Role | Allocatable CPU | Allocatable memory |
| --- | --- | --- | --- |
| `milky-way` | control-plane | 3950m | 15569124Ki |
| `othalla` | control-plane | 3950m | 15569124Ki |
| `pegasus` | control-plane | 3950m | 15569124Ki |
| `hard-hat` | worker | 15950m | 48618452Ki |
| `fluttershy` | worker | 19950m | 65139572Ki |
| `kerfuffle` | worker | 19950m | 65156484Ki |
| `shining-armor` | worker | 19950m | 48912364Ki |

**No node carries any taint today** — `kubectl get nodes -o json | jq '.items[].spec.taints'`
returns `null` for all seven. This is the confirming half of the claim that
`allowSchedulingOnControlPlanes: true` is what suppresses the standard taint; the flip
introduces the first taint in this cluster (*inferred* for the exact taint string, from
Talos machine-config semantics — it is `node-role.kubernetes.io/control-plane` with effect
`NoSchedule`, no value).

**Capacity is not a constraint.** The three control planes together currently hold
~5.6 CPU of *requests* and ~16GiB of memory requests, most of it DaemonSets that stay put.
The four workers have 76 cores and ~222GiB allocatable between them. Relocating every
non-DaemonSet control-plane resident is trivially absorbable.

---

## 2. What `NoSchedule` actually does — confirmed, with the one exception

`NoSchedule` is a **scheduling-time** predicate. It never evicts a running pod; only
`NoExecute` does, via the node-lifecycle controller's taint manager. So **nothing breaks at
the instant the taint lands**. The blast radius is on the next pod *recreate* on a control
plane:

- a reboot or power-cycle of a control plane,
- a Talos upgrade (tuppr), which reboots each node in turn,
- a DaemonSet rollout (image bump, values change),
- a Deployment/StatefulSet rollout that happens to have had a pod there,
- the next fire of a CronJob that is *pinned* there (see [§4.1](#41-blocker-a-etcd-tasks-backup-and-defrag-hard-break) — this one is immediate).

**The exception that was checked and cleared.** The `descheduler` CronJob runs
`*/2 * * * *` in `kube-system` and *could* have converted "NoSchedule does not evict" into
"evicted within two minutes". It does not. Its live policy
(`kubectl get cm -n kube-system descheduler -o jsonpath='{.data}'`) enables only the
`balance` plugins — `RemoveDuplicates`, `RemovePodsViolatingTopologySpreadConstraint`,
`LowNodeUtilization` — and **no `deschedule` profile at all**, so
`RemovePodsViolatingNodeTaints` is absent. Verified live.

Two second-order descheduler notes, neither a blocker:

- `DefaultEvictor` has `nodeFit` unset (default `false`), so `LowNodeUtilization` will keep
  seeing three permanently-underutilised (because tainted) nodes and may evict from workers
  toward targets that can never accept the pods. Result is churn, not outage (*inferred*).
- `RemovePodsViolatingTopologySpreadConstraint` interacts with the four live
  `topologySpreadConstraints` in the cluster, all of which are
  `kubernetes.io/hostname` / `maxSkew: 1` / `whenUnsatisfiable: DoNotSchedule` with
  `nodeTaintsPolicy` unset (defaults to `Ignore`, i.e. tainted nodes still count as
  domains): `kube-system/coredns` (2 replicas), `network/error-pages` (2),
  `network/k8s-gateway` (2), `stargate-command/mosquitto` (2). All are at 2 replicas against
  4 remaining workers, so all stay satisfiable. **This becomes a real trap the moment any of
  them exceeds the worker count**, or during a low-power window when workers are off — note
  it in [20](20-low-power-tier.md)'s runbook rather than here.

---

## 3. Full audit — every pod currently resident on a control plane

Enumerated with, for each of the three nodes:

```console
kubectl get pods -A --field-selector spec.nodeName=<node> -o json
```

and classified by evaluating each pod's own `spec.tolerations` against the taint
`(key=node-role.kubernetes.io/control-plane, value="", effect=NoSchedule)`.
**81 pods** total (34 on `milky-way`, 20 on `othalla`, 28 on `pegasus`).

| Class | Count | Meaning |
| --- | --- | --- |
| `TOLERATES` | 35 | carries the specific `node-role.kubernetes.io/control-plane` toleration (mostly [#912](https://github.com/david-driscoll/home-operations/pull/912)) |
| `BLANKET-NOSCHEDULE` | 9 | keyless `operator: Exists` **scoped to `effect: NoSchedule`** |
| `BLANKET-ALL` | 6 | keyless `operator: Exists` with no effect — tolerates `NoExecute` too |
| `NO-TOLERATION` | 31 | would not schedule there again |

### 3.1 The `NO-TOLERATION` 31, by owner — and what each actually means

| Namespace | Owner | ×  | Nodes | Classification | Consequence after the taint |
| --- | --- | --- | --- | --- | --- |
| `kube-system` | `Node/milky-way`, `Node/othalla`, `Node/pegasus` (apiserver, controller-manager, scheduler) | 9 | all 3 | **N/A — static/mirror pods** | None. Talos writes these to `/etc/kubernetes/manifests`; the kubelet runs them directly and the API objects are read-only mirrors. They never pass through the scheduler, so taints are irrelevant to them. |
| `kube-system` | `Job/etcd-tasks-backup`, `Job/etcd-tasks-defrag` | 2 | `milky-way` | **WOULD-BE-STRANDED (hard)** | `nodeSelector: {node-role.kubernetes.io/control-plane: ""}` + no toleration = **permanently unschedulable**. etcd snapshot backup and etcd defrag silently stop. See [§4.1](#41-blocker-a-etcd-tasks-backup-and-defrag-hard-break). |
| `longhorn-system` | `DaemonSet/longhorn-csi-plugin` | 3 | all 3 | **WOULD-BE-STRANDED (storage plane)** | No CSI node plugin on the control planes ⇒ **no Longhorn PVC can be mounted by any pod there, ever.** See [§4.2](#42-blocker-b-longhorns-system-managed-set). |
| `longhorn-system` | `DaemonSet/engine-image-ei-493e04e7`, `…-ei-a4d05f02` | 6 | all 3 | **WOULD-BE-STRANDED (storage plane)** | No engine image ⇒ no engine or replica process can start on that node. |
| `longhorn-system` | `InstanceManager/instance-manager-{1493c2db…,a8c6a8b4…,9011d0ab…}` | 3 | `milky-way`, `othalla`, `pegasus` | **WOULD-BE-STRANDED (storage plane)** | The node's entire Longhorn disk contribution goes offline on recreate. 167 replicas live on these three disks. See [§5](#5-longhorn-blast-radius-quantified). |
| `database` | `Cluster/postgres` → pod `postgres-3` | 1 | `othalla` | **WOULD-BE-STRANDED (data pinned)** | Its PVC is `longhorn-local` = `dataLocality: strict-local`, `numberOfReplicas: 1`. The data cannot move. See [§4.3](#43-blocker-c-postgres-3-is-strict-local-on-a-control-plane). |
| `kube-system` | `StatefulSet/openbao` → `openbao-2` | 1 | `milky-way` | **RELOCATES** | Raft member with no PVC (`spec.volumes` = `config`, `home`, SA token — verified live; storage is in-pod raft state, rebuilt on join). `podAntiAffinity` is `required` on hostname, 3 replicas vs 4 workers ⇒ still placeable. Rejoins raft on the new node. Cluster tolerates one member down (quorum 2/3) during the move. |
| `equestria` | `ReplicaSet/windmill-app`, `…/windmill-workers-default` | 2 | `pegasus` | **RELOCATES** | Stateless-to-placement; DB is CNPG. Moves to a worker. |
| `observability` | `ReplicaSet/kube-state-metrics`, `…/prometheus-operator` | 2 | `pegasus`, `milky-way` | **RELOCATES — deliberate** | [#912](https://github.com/david-driscoll/home-operations/pull/912) explicitly documented this in `kubernetes/apps/observability/prometheus/values.yaml` lines 43-47: both are stateless Deployments rendered by the `prometheus` release and were intentionally *not* given tolerations. Re-confirmed correct. |
| `observability` | `ReplicaSet/unpoller` | 1 | `pegasus` | **RELOCATES** | Stateless UniFi poller. |
| `stargate-command` | `Job/volsync-src-home-assistant` | 1 | `milky-way` | **RELOCATES** | VolSync mover Job. Its `volsync-home-assistant-src` and `…-cache` volumes are `dataLocality: disabled` (verified live), so they reattach wherever the mover lands. Next scheduled run simply runs on a worker. |

### 3.2 The 20 DaemonSets, checked at the DaemonSet level

```console
kubectl get ds -A -o json   # classify .spec.template.spec.tolerations
```

| Class | DaemonSets |
| --- | --- |
| `BLANKET-ALL` (keyless `Exists`, no effect) | `kube-system/cilium`, `nfs-system/csi-nfs-node` |
| `BLANKET-NOSCHEDULE` (keyless `Exists`, `effect: NoSchedule`) | `kube-system/spegel`, `observability/node-exporter`, `observability/smartctl-exporter-0` |
| `TOLERATES` (specific key) | `kube-system/multus`, `…/node-feature-discovery-worker`, `…/intel-gpu-plugin-intel-gpu-plugin`, `…/amd-gpu-device-plugin-daemonset`, `…/amd-gpu-labeller-daemonset`, `…/nvidia-device-plugin` (+ `-gpu-feature-discovery`, `-mps-control-daemon`, all desired=0), `longhorn-system/longhorn-manager`, `network/crowdsec-agent`, `observability/alloy`, `observability/intel-gpu-exporter` |
| `NO-TOLERATION` | `longhorn-system/longhorn-csi-plugin`, `…/engine-image-ei-493e04e7`, `…/engine-image-ei-a4d05f02` |

**Correction to the earlier informal audit.** The claim was "5 already tolerate via a
pre-existing *blanket* `operator: Exists`". Only **two** of those five are unscoped blankets
(`cilium`, `csi-nfs-node`). `spegel`, `node-exporter` and `smartctl-exporter-0` use
`{operator: Exists, effect: NoSchedule}` — keyless but **effect-scoped**, which tolerates
every `NoSchedule` taint and *no* `NoExecute` taint. That is strictly the safer form: it
cannot defeat `not-ready`/`unreachable` eviction, which is exactly the property
[#912](https://github.com/david-driscoll/home-operations/pull/912) was careful to preserve
when it chose the specific key over a blanket.

**And the reasoning about blankets on DaemonSets holds.** The DaemonSet controller injects
`node.kubernetes.io/not-ready:NoExecute` and `node.kubernetes.io/unreachable:NoExecute`
tolerations **with no `tolerationSeconds`** into every DaemonSet pod it creates (visible on
any live DaemonSet pod). A DaemonSet pod is therefore already immune to taint-based
eviction whether or not its template carries a blanket — so `cilium`/`csi-nfs-node`'s
unscoped `Exists` gives up nothing that the controller had not already given up. The same
blanket on a *Deployment* would be a real regression; on a DaemonSet it is not.

### 3.3 Anything else pinned to a control plane

```console
kubectl get deploy,sts,ds,cronjob,job -A -o json   # scan nodeSelector + affinity for control-plane
```

Complete list, cluster-wide:

| Workload | Mechanism | Tolerates? | Verdict |
| --- | --- | --- | --- |
| `kube-system/etcd-tasks-backup` (CronJob) | `nodeSelector` control-plane | **no** | **Hard break** — fixed by this change |
| `kube-system/etcd-tasks-defrag` (CronJob) | `nodeSelector` control-plane | **no** | **Hard break** — fixed by this change |
| `kube-system/coredns` | `requiredDuringScheduling` nodeAffinity `control-plane Exists` | **yes** (`{key: node-role.kubernetes.io/control-plane, operator: Exists, effect: NoSchedule}` + `CriticalAddonsOnly`) | Safe. Cluster DNS is *confined* to the three control planes and can still run there — which is also what makes low-power mode viable for DNS. |
| `kube-system/node-feature-discovery-master` | `preferred` nodeAffinity to control-plane | **yes** | Safe; preference degrades gracefully anyway. |

`kube-system/etcd-tasks-prune` has **no** `nodeSelector` (it only runs `restic forget` against
the NFS repository) and is unaffected.

---

## 4. The three blockers

### 4.1 Blocker A: `etcd-tasks` backup and defrag (hard break)

**This is the finding that most changes the answer.** Both CronJobs in
`kubernetes/apps/kube-system/etcd/helmrelease.yaml` set:

```yaml
        pod:
          hostNetwork: true
          hostPID: true
          nodeSelector:
            node-role.kubernetes.io/control-plane: ""
```

and no tolerations anywhere in the release. A pod that *selects* the tainted nodes and does
not *tolerate* the taint can never be scheduled — this is not a "next reboot" problem, it
fires on the very next cron tick (04:12 and 09:03 daily). The failure mode is the quiet
kind: the Job object is created, its pod sits `Pending` with
`FailedScheduling … node(s) had untolerated taint`, and unless something is watching Job
failures, **etcd snapshot backups stop and nobody is told**.

`defrag` matters slightly less (it is a maintenance job), but `backup` is the etcd
disaster-recovery path.

**Fixed in this change**: `tolerations` added under each controller's `pod:` block, next to
the existing `nodeSelector`. Verified that the key reaches the pod spec rather than being
silently dropped — the same discipline [#912](https://github.com/david-driscoll/home-operations/pull/912)
used after the `multus` chart ignored the obvious key:

```console
helm template t oci://ghcr.io/bjw-s-labs/helm/app-template --version 5.1.0 -f /tmp/vt.yaml
#   nodeSelector:
#     node-role.kubernetes.io/control-plane: ""
#   tolerations:
#     - effect: NoSchedule
#       key: node-role.kubernetes.io/control-plane
#       operator: Exists
```

(app-template `5.1.0` is the pinned version in
`kubernetes/components/repos/app-template/ocirepository.yaml`. The independent live proof
that this shape works is `observability/intel-gpu-exporter`, which sets it under
`defaultPodOptions` and classifies `TOLERATES` on the cluster today.)

### 4.2 Blocker B: Longhorn's system-managed set

Confirmed exactly as suspected, and the value **is already staged**:

```console
kubectl get settings.longhorn.io -n longhorn-system taint-toleration \
  -o custom-columns=VALUE:.value,APPLIED:.status.applied
# VALUE                                              APPLIED
# node-role.kubernetes.io/control-plane:NoSchedule   false
```

`global.tolerations` (Helm) reached the *user-deployed* half — `longhorn-manager`,
`longhorn-ui`, `longhorn-driver-deployer`, the CSI sidecar Deployments all classify
`TOLERATES`. The **system-managed** half did not, because `updateTaintToleration()` gates on
`AreAllVolumesDetachedState()` and requeues on the one-hour resync until every volume is
detached. All of this is already written up in
`kubernetes/apps/longhorn-system/longhorn/values.yaml` (the "DETACH CAVEAT" comment); this
audit confirms it empirically rather than re-deriving it.

**How many volumes are attached: 78 of 203** (`kubectl get volumes.longhorn.io -n longhorn-system`),
distributed `hard-hat` 34, `shining-armor` 25, `fluttershy` 10, `kerfuffle` 4,
`milky-way` 2, `othalla` 2, `pegasus` 1. Getting to zero attached means stopping essentially
every stateful workload in the cluster — a real maintenance window, not a rolling change.

Running #912's own verification command confirms the setting has **not** landed:

```console
kubectl -n longhorn-system get ds longhorn-csi-plugin \
  -o jsonpath='{.metadata.annotations.longhorn\.io/last-applied-tolerations}'
# []
kubectl -n longhorn-system get ds engine-image-ei-493e04e7 -o jsonpath='{…}'  # []
kubectl -n longhorn-system get ds engine-image-ei-a4d05f02 -o jsonpath='{…}'  # []
```

**One thing here was a genuine surprise.** The gate is not total — it applies to the *bulk
re-application*, but an instance-manager **created after** the setting was written picks the
current value up:

```console
kubectl -n longhorn-system get pod -l longhorn.io/component=instance-manager \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.annotations.longhorn\.io/last-applied-tolerations}{"\n"}{end}'
```

Two of the eight instance-managers already carry
`[{"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]`
— and both are on **workers** (`kerfuffle`, `fluttershy`), where it is cosmetic. All three
**control-plane** instance-managers (`1493c2db…`/milky-way, `a8c6a8b4…`/othalla,
`9011d0ab…`/pegasus) still read `[]`. So the drift is real but is *not* going to
self-resolve into readiness: the moment a control-plane instance-manager is recreated after
the taint exists, it is recreated *by a controller whose desired pod spec has no
toleration*, and it cannot come back. Do not read "two of them have it" as progress.

The three system-managed DaemonSets (`longhorn-csi-plugin`, both `engine-image-*`) still
read `[]` and **cannot be fixed from Git** — a pod-spec toleration in `values.yaml` would
never reach them; they are created by `longhorn-manager` at runtime and selected by
`longhorn.io/managed-by: longhorn-manager`.

There are also **13 ShareManagers** (RWX volumes), all currently on `hard-hat`. They are
system-managed too and inherit the same setting; none is on a control plane today, so they
are not an immediate blocker, but they are covered by the same fix.

### 4.3 Blocker C: `postgres-3` is `strict-local` on a control plane

```console
kubectl get volumes.longhorn.io -n longhorn-system -o json \
  | jq -r '.items[]|select(.spec.dataLocality=="strict-local")|"\(.metadata.name) \(.status.currentNodeID) \(.status.kubernetesStatus.pvcName)"'
# pvc-e1d4927e…  fluttershy      postgres-1
# pvc-9f3b190c…  shining-armor   postgres-2
# pvc-cf9e7127…  othalla         postgres-3
```

`database/postgres` is a 3-instance CNPG `Cluster` on `storageClass: longhorn-local`
(`dataLocality: strict-local`, `numberOfReplicas: "1"`), with `podAntiAffinityType: required`
on `kubernetes.io/hostname` and **no tolerations** (`.spec.affinity.tolerations` is null —
CNPG's toleration key lives under `.spec.affinity`, not at the top level).

`postgres-3`'s single replica is physically on `othalla`. Once `othalla` is tainted, the
pod cannot be recreated there and the data cannot be rebuilt anywhere else — `strict-local`
plus hard PV `nodeAffinity` makes the rebuild unschedulable, which is the exact deadlock
already documented in the `nodeDrainPolicy` comment in
`kubernetes/apps/longhorn-system/longhorn/values.yaml`.

This is **recoverable, not fatal** — `kubectl cnpg destroy database/postgres 3` drops the
instance and its PVC and CNPG re-bootstraps it from the primary onto a worker (see the
[CNPG replica recovery](https://github.com/david-driscoll/vault) notes; never delete the PVC
by hand). But it must be done *deliberately, before* the taint, not discovered during the
next reboot of `othalla`.

Note that the anti-affinity arithmetic still works afterwards: 3 instances, `required`
anti-affinity on hostname, 4 workers.

### 4.4 How Blocker B was actually resolved, without a detach window

**Executed live on 2026-08-19, after the audit above.** §4.2 is right that the setting
controller gates on `AreAllVolumesDetachedState()`, and right that this is still true in
the deployed `longhorn-manager` **v1.12.1** — every volume must be in state `detached`,
not merely idle (`datastore/longhorn.go:995`). What §4.2 got wrong is the conclusion that
the gate is the *only* way in, and that the system-managed set "cannot be fixed from Git"
implies it cannot be fixed at all without stopping the cluster.

Three facts from the v1.12.1 source change the answer:

1. **`updateTolerationForDaemonset` is an in-place `UpdateDaemonSet`**, not a
   delete-and-recreate (`controller/setting_controller.go:606`). It sets
   `.spec.template.spec.tolerations` to `existing − lastApplied + new` and writes the
   `longhorn.io/last-applied-tolerations` annotation. The detach gate is checked *before*
   this update; the update itself is ordinary and safe.
2. **`getNotUpdatedTolerationList` compares only the annotation** against the setting
   (`setting_controller.go:571`), never the live pod spec. When every collected object's
   annotation already matches, `updateTaintToleration()` returns `nil` **before** reaching
   the detach check, and `Setting.Status.Applied` flips to `true` (`setting_controller.go:224`).
3. **Kubernetes permits *adding* tolerations to a running pod.** The instance-manager and
   share-manager pods — the objects whose recreation is genuinely disruptive — can be
   patched in place with no restart at all.

So the fix was to write, by hand, exactly the state the controller would have written:

```console
# 4 CSI sidecar Deployments + 3 system-managed DaemonSets: template tolerations + annotation
kubectl -n longhorn-system patch deploy|ds <name> --type merge -p '{
  "metadata":{"annotations":{"longhorn.io/last-applied-tolerations":
    "[{\"key\":\"node-role.kubernetes.io/control-plane\",\"operator\":\"Exists\",\"effect\":\"NoSchedule\"}]"}},
  "spec":{"template":{"spec":{"tolerations":[
    {"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]}}}}'

# instance-manager and share-manager pods: prepend the toleration to the EXISTING list
#   (K8s allows additions only, so the patch must carry the injected NoExecute pair too)
```

Then one no-op label write on the `Setting` to trigger a resync, because the setting
controller only re-evaluates on an update event and its periodic resync is an hour:

```console
kubectl -n longhorn-system label settings.longhorn.io taint-toleration resync-nudge=1 --overwrite
kubectl -n longhorn-system label settings.longhorn.io taint-toleration resync-nudge-
```

**Result:** 17 objects updated, `taint-toleration` `APPLIED: true`, and

- `longhorn-csi-plugin`, both `engine-image-*` DaemonSets: `7/7` ready throughout,
- **all eight instance-manager pods kept their original creation timestamps and
  `restartCount: 0`** — nothing was recreated, so no engine or replica was interrupted,
- `0` faulted volumes before, during and after,
- not one workload was scaled down.

The nodes that mattered were also far emptier than §5's snapshot suggests: at execution
time only **three** volumes were attached on a control plane (`volsync-jellyfin-src` and
`postgres-3` on `othalla`, `storage-tempo-0` on `pegasus`).

**Why this is not fighting upstream.** The end state is byte-for-byte what
`updateTaintToleration()` produces; the annotation is upstream's own idempotency marker.
Once it matches, the controller's own comparison finds nothing to do and takes no further
action. Nothing here has to be re-applied, and nothing reverts it: the engine-image
controller only builds a DaemonSet when one is **absent**
(`controller/engine_image_controller.go:257`), and `csi/deployment_util.go:200`
short-circuits on a CSI version match, so neither reconciles tolerations on an existing
object.

**The caveat worth keeping.** Skipping the gate is safe *for this particular setting*
because the toleration only ever widens where a pod may schedule — it cannot evict
anything, and `NoSchedule` does not act on running pods. Do **not** generalise the trick to
`priority-class`, `system-managed-components-node-selector` or `storage-network`, which sit
behind the same gate for materially different reasons.

### 4.5 Blocker C, resolved

`kubectl cnpg destroy postgres 3 -n database` (note: the plugin takes `CLUSTER INSTANCE`,
not the `namespace/cluster` form §7 originally showed). CNPG dropped instance 3 and its
PVC, then re-bootstrapped from the primary. The rebuild took roughly seven minutes at
`readyInstances: 2`, and `postgres-3` came back on **`kerfuffle`**, a worker. All three
`strict-local` volumes are now on workers:

```console
# database/postgres-1  fluttershy
# database/postgres-2  shining-armor   (primary)
# database/postgres-3  kerfuffle
```

Because CNPG's pods carry no control-plane toleration, once the taint exists this cannot
recur on its own — the scheduler will refuse to place an instance there in the first place.
The exposure returns only if [20](20-low-power-tier.md)/[24](24-power-states.md) later give
the database a toleration for low-power mode, which is where that decision belongs.

---

## 5. Longhorn blast radius, quantified

This is the part that makes Blocker B more than bookkeeping.

```console
kubectl get replicas.longhorn.io -n longhorn-system -o json \
  | jq '[.items[].spec.nodeID]|group_by(.)|map({(.[0]):length})|add'
```

| Node | Replicas |
| --- | --- |
| `hard-hat` | 106 |
| `shining-armor` | 79 |
| `milky-way` | **67** |
| `pegasus` | **62** |
| `fluttershy` | 59 |
| `othalla` | **38** |
| `kerfuffle` | 2 |

**167 replicas (62 of them currently `running`) live on the three control-plane disks.**
`kubectl get nodes.longhorn.io` shows all seven nodes with `allowScheduling=true` and **no
tags at all** — [12](12-longhorn-critical-tier.md)'s `critical`/`bulk` tagging has not
landed, so the control planes are full, untagged participants in the storage pool.

Of 202 volumes with replicas:

- **133 have at least one replica on a control plane**,
- **22 have *every* replica on a control plane**.

The 22 are the ones with no worker-side copy to fall back on. Naming them matters, and the
answer is reassuring:

| Volume set | Count | Assessment |
| --- | --- | --- |
| VolSync `*-cache` / `*-dst-dest` / `*-src` (`longhorn-cache`, `longhorn-snapshot`, one `longhorn`) — `pulsarr`, `freshrss`, `sabnzbd`, `bazarr`, `pinepods`, `technitium`, `radarr`, `registry`, `sonarr`, `lidarr`, `identifiarr`, `jellyfin`, `tsiam`, `kapowarr`, `jellyseerr`, `golink`, `taildrive`, `tududi` | 21 | **Ephemeral by construction.** Recreated per replication run. Losing them costs one backup/restore cycle, not data. |
| `database/postgres-3` (`longhorn-local`) | 1 | Blocker C above. |

So the storage-plane consequence is: for the 133 volumes with a control-plane replica,
losing a control plane's instance-manager degrades them and triggers rebuilds onto workers
(self-healing, but a rebuild storm across ~167 replicas); for 21 VolSync scratch volumes it
is a lost cycle; and for `postgres-3` it is a manual `cnpg destroy`. *Inferred* from
Longhorn replica-scheduling semantics — not something that can be tested read-only.

The one hard, non-degraded consequence is the CSI node plugin: **with
`longhorn-csi-plugin` unable to run on the control planes, no pod on a control plane can
mount any Longhorn PVC at all.** That is what makes this a blocker for
[20](20-low-power-tier.md) rather than a tolerable degradation.

---

## 6. The Tier-1 question — the taint cuts the wrong way today

[20](20-low-power-tier.md) §4 and [24](24-power-states.md) want the control planes to be the
*surviving* tier: Tier-0 and Tier-1 keep running there when the workers go dark. Their
mechanism is a **different, custom** taint — `node-role.driscoll.tech/critical:NoSchedule`
— applied via `talconfig.yaml` `nodeTaints`. The standard control-plane taint is a second,
independent gate: a node carrying both taints admits only pods that tolerate **both**.

Verified live, `kubectl get deploy/sts … -o json` filtered for a
`node-role.kubernetes.io/control-plane` toleration:

| Tier-1 workload | Currently on | Tolerates CP taint? | PriorityClass |
| --- | --- | --- | --- |
| `network/technitium` (DNS) | `hard-hat` | **yes** — `{key: node-role.kubernetes.io/control-plane, operator: Exists, effect: NoSchedule}` | none |
| `network/technitium-dns` | `hard-hat` | **no** | none |
| `network/k8s-gateway` (cluster DNS split) | worker | **no** | none |
| `network/traefik` (ingress) | worker | **no** | none |
| `stargate-command/home-assistant` | `hard-hat` | **no** | `system-cluster-critical` |
| `stargate-command/chrony` (NTP) | `fluttershy` | **no** | `system-cluster-critical` |
| `stargate-command/mosquitto` (MQTT, 2 replicas, `longhorn` PVC) | `shining-armor`, `hard-hat` | **no** | `system-cluster-critical` |
| `stargate-command/matter` | `shining-armor` | **no** | none |
| `kube-system/coredns` | control planes | **yes** | — |

**Nothing breaks the day of the flip** — every one of these is on a worker today, and
`NoSchedule` does not evict. But the flip makes the low-power tier *unreachable* until they
are fixed: with the taint on and no tolerations, Home Assistant, NTP, MQTT and Matter
physically cannot be placed on the control planes, which is the entire point of
[20](20-low-power-tier.md)/[24](24-power-states.md).

**Deliberately not fixed here.** Adding a bare toleration to those seven would be half the
change: [24](24-power-states.md) pairs the toleration with a placement model
(float-on-worker / relocate-on-Battery), a `longhorn-controlplane` StorageClass from
[12](12-longhorn-critical-tier.md), and a `critical-tier` PriorityClass — plus the
correction that `home-assistant` should stop using the Kubernetes-reserved
`system-cluster-critical`. Landing tolerations alone would let Tier-1 drift onto 4-core
control planes with no storage class to hold their volumes and no `longhorn-csi-plugin` to
mount them (§4.2). That belongs to 12/20/24, sequenced, and those files are being edited
separately. This audit's job is to say the dependency exists — it does, and it is
load-bearing.

`kubernetes/apps/observability/prometheus/values.yaml` is worth reading as the model for how
to write these when they do land: it says out loud that the toleration is *placement
flexibility only* and does not move the volume.

---

## 7. Verdict and ordered prerequisites

### ~~**NOT SAFE TO FLIP** as of 2026-08-19.~~ → **Prerequisites cleared, 2026-08-19.**

The ordered list below is kept as written. Status after the live work described in
[§4.4](#44-how-blocker-b-was-actually-resolved-without-a-detach-window) and
[§4.5](#45-blocker-c-resolved):

| # | Prerequisite | Status |
| --- | --- | --- |
| 1 | `etcd-tasks` tolerations | **Done** — merged in [#956](https://github.com/david-driscoll/home-operations/pull/956), live on both CronJobs |
| 2 | `postgres-3` off `othalla` | **Done** — `cnpg destroy`, rebuilt on `kerfuffle` |
| 3 | Longhorn `taint-toleration` applied | **Done** — `APPLIED: true`, *without* the detach window step 3 prescribes |
| 4 | Rebuild-storm exposure | **Moot** — step 3 is complete, so this disappears exactly as the step itself says |
| 5 | The four gate commands | **All four pass** |
| 6 | Tier-1 tolerations | **Still open** — [12](12-longhorn-critical-tier.md)/[20](20-low-power-tier.md)/[24](24-power-states.md); never a prerequisite for the flip |

Ordered. 1 is in this PR; 2-4 must be done live; 5 is the gate.

1. **Give `etcd-tasks` its tolerations.** Done in this change — `helm template`-verified
   against app-template 5.1.0. Merge and let Flux reconcile it **before** the flip.
   Without it, etcd backups stop on the next tick with no alert.

2. **Deal with `postgres-3`.** Its `strict-local` single replica is on `othalla` and cannot
   move. Either `kubectl cnpg destroy database/postgres 3` and let CNPG re-bootstrap it onto
   a worker, or fold this into step 3's window (the volumes must be detached there anyway).
   Never hand-delete the PVC.

3. **Land Longhorn's `taint-toleration` setting in a volumes-detached window.** This is the
   expensive one: 78 volumes are attached and the setting only applies at
   `AreAllVolumesDetachedState()`. Scale every stateful workload to zero, confirm
   `kubectl get volumes.longhorn.io -n longhorn-system` shows zero `attached`, wait for the
   setting controller, then verify the annotations in step 5 before scaling back up. This is
   [12](12-longhorn-critical-tier.md)'s early maintenance step, exactly as
   [20](20-low-power-tier.md) §4 already says — it is not retrofittable during an incident.

4. **Optional but strongly advised before the *next reboot* rather than before the flip:**
   accept that 133 of 202 volumes have a control-plane replica, and that a control-plane
   reboot with step 3 incomplete triggers a rebuild storm. If step 3 is done, this
   disappears.

5. **Gate the flip on these four commands.** All must pass:

   ```console
   # a. Longhorn system-managed set actually picked the toleration up
   kubectl -n longhorn-system get ds longhorn-csi-plugin \
     -o jsonpath='{.metadata.annotations.longhorn\.io/last-applied-tolerations}'
   kubectl -n longhorn-system get ds -l longhorn.io/managed-by=longhorn-manager \
     -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.metadata.annotations.longhorn\.io/last-applied-tolerations}{"\n"}{end}'
   # each must contain node-role.kubernetes.io/control-plane

   # b. every instance-manager, including the three on control planes
   kubectl -n longhorn-system get pod -l longhorn.io/component=instance-manager \
     -o jsonpath='{range .items[*]}{.spec.nodeName}{"\t"}{.metadata.annotations.longhorn\.io/last-applied-tolerations}{"\n"}{end}'

   # c. the setting is applied, not merely set
   kubectl get settings.longhorn.io -n longhorn-system taint-toleration \
     -o custom-columns=VALUE:.value,APPLIED:.status.applied
   # APPLIED must be true

   # d. etcd-tasks carries the toleration live
   kubectl -n kube-system get cronjob etcd-tasks-backup \
     -o jsonpath='{.spec.jobTemplate.spec.template.spec.tolerations}'
   kubectl -n kube-system get cronjob etcd-tasks-defrag \
     -o jsonpath='{.spec.jobTemplate.spec.template.spec.tolerations}'
   ```

6. **Separately, and before anyone calls low-power mode ready:** Tier-1 needs the toleration
   too ([§6](#6-the-tier-1-question--the-taint-cuts-the-wrong-way-today)). That is
   [12](12-longhorn-critical-tier.md)/[20](20-low-power-tier.md)/[24](24-power-states.md)'s
   work, not a prerequisite for the flip itself. Flipping first is safe *for the flip*, but
   it does not get you low-power mode; it only stops Tier-2 from landing on the control
   planes.

### Re-verification after the flip

```console
kubectl get nodes -o json | jq -r '.items[]|"\(.metadata.name): \(.spec.taints//"none")"'
kubectl get pods -A --field-selector status.phase=Pending -o wide
kubectl get events -A --field-selector reason=FailedScheduling --sort-by=.lastTimestamp | tail -30
kubectl get ds -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,DESIRED:.status.desiredNumberScheduled,READY:.status.numberReady
# every DaemonSet that was desired=7 must still be desired=7/ready=7
kubectl get volumes.longhorn.io -n longhorn-system -o json \
  | jq '[.items[]|select(.status.robustness=="faulted")]|length'   # must be 0
```

---

## 8. What surprised me

1. **`etcd-tasks` was the real blocker, and it is not a Longhorn problem.** Everything about
   this flip has been discussed in terms of Longhorn's detach caveat. The thing that breaks
   *immediately and silently* is a pair of CronJobs that select the control planes without
   tolerating them — a `nodeSelector` + missing-toleration contradiction that no amount of
   Longhorn work would have caught.

2. **Three of the five "blanket `Exists`" DaemonSets are effect-scoped, not unscoped.**
   `spegel`, `node-exporter` and `smartctl-exporter-0` use `{operator: Exists, effect:
   NoSchedule}`, which is the *good* form — it can never defeat `NoExecute` eviction. Only
   `cilium` and `csi-nfs-node` are truly unscoped, and on DaemonSets that is harmless
   because the DaemonSet controller already injects unbounded `not-ready`/`unreachable`
   `NoExecute` tolerations regardless.

3. **Longhorn's detach gate is partial.** Two instance-managers already carry the
   toleration — the ones created *after* the setting was written. It looks like progress and
   is not: both are on workers, all three control-plane instance-managers still read `[]`,
   and they are recreated from a template that has no toleration.

4. **The 22 "all replicas on a control plane" volumes are almost all VolSync scratch.**
   That number sounds alarming and is mostly benign; the single real one is `postgres-3`.

5. **The descheduler could have made `NoSchedule` behave like `NoExecute`** and does not,
   purely because its policy omits the `deschedule` profile. That is one config change away
   from being a very unpleasant surprise, and nothing documents the dependency — until now.
