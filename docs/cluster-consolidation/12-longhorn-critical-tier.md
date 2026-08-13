# 12 — Longhorn critical tier (K′)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). Depends on
[10-drain-safety.md](10-drain-safety.md). Gates
[13-stage-sgc-apps.md](13-stage-sgc-apps.md) and
[20-low-power-tier.md](20-low-power-tier.md). Read this file standalone — it
does not assume you've read the vault issue or the discovery comments.

## What this piece is for

The plan needs a **low-power mode**: equestria running on its three control
planes alone, workers powered off, for hours at a time
([D6](README.md#decision-ledger)). That only works if the handful of
services that must survive low power (DNS, NTP, MQTT, Home Assistant, …ⁱ)
actually have their data *on* a control plane when the workers go dark. Today
they don't, and nothing stops it: Longhorn spreads replicas across whichever
nodes look free, with no concept of "these three nodes must never lose their
last copy."

This piece makes that impossible **by construction**, not by runbook
discipline:

1. Tag the 3 control planes `critical` and the 1 current worker `bulk`
   (Longhorn node tags — a separate concept from Kubernetes node labels).
2. Add a `longhorn-critical` StorageClass: 3 replicas, restricted to
   `critical`-tagged nodes. With Longhorn's hard replica anti-affinity this
   places **exactly one replica per control plane** — no scheduling gap is
   possible.
3. Add a node selector to the **default** `longhorn` StorageClass restricting
   it to `bulk`-tagged nodes, so an ordinary Tier-2 volume (media, immich,
   the observability stack, …) can never place — or *replenish* — a replica
   onto a control-plane disk.

Step 3 is the one that matters most and is easiest to skip. Longhorn's
`replica-replenishment-wait-interval` is 600 seconds (10 minutes, verified
live below). Without step 3, ten minutes into any low-power window Longhorn
notices a Tier-2 volume is short a replica (because a worker just went dark)
and rebuilds it — onto whichever node has room, which today includes the
three 1 TB control-plane SSDs that etcd and the Tier-1 workloads also live
on. **That is the single most likely way this plan turns a deliberate,
planned low-power event into an unplanned outage**, and it is silent: nobody
told Longhorn not to do it.

ⁱ The full Tier-0/Tier-1/Tier-2 definitions and the enter/exit runbook live
in [20-low-power-tier.md](20-low-power-tier.md). This piece only needs: Tier
1 is the set of estate services that must survive low power, and today that
set is DNS, NTP, MQTT, Home Assistant, and (newly discovered below) a Matter
bridge.

## What changed since the issue's discovery (2026-07-30 → 2026-08-13)

The design below is [Expansion v2.1 §3.3](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583),
written 2026-07-30. Four things have moved since then, verified live against
the equestria cluster and both repos on **2026-08-13**:

### 1. vault#113 (two default StorageClasses) is already fixed — name it, don't redo it

The July discovery predates [vault#113](https://github.com/david-driscoll/vault/issues/113):
both clusters had `longhorn` *and* `openebs-hostpath` simultaneously marked
`storageclass.kubernetes.io/is-default-class: "true"`, so an unqualified PVC
bound to whichever class was created more recently — accidental, and it would
flip on the next Helm upgrade or Flux prune/reapply. That's been resolved
since:
[equestria-cluster#3003](https://github.com/david-driscoll/equestria-cluster/pull/3003)
and
[stargate-command-cluster#1752](https://github.com/david-driscoll/stargate-command-cluster/pull/1752)
both merged 2026-08-03, flipping `openebs-hostpath`'s `isDefaultClass` to
`false`. Verified live today:

```
$ kubectl --context admin@equestria get sc
NAME                 PROVISIONER          RECLAIMPOLICY   VOLUMEBINDINGMODE
longhorn (default)   driver.longhorn.io   Delete          Immediate
longhorn-cache       driver.longhorn.io   Delete          WaitForFirstConsumer
longhorn-local       driver.longhorn.io   Delete          WaitForFirstConsumer
longhorn-snapshot    driver.longhorn.io   Delete          WaitForFirstConsumer
openebs-hostpath     openebs.io/local     Delete          WaitForFirstConsumer
```

Exactly one default, `longhorn`. This piece treats vault#113 as a satisfied
precondition, not a to-do — it's folded in here per the brief only in the
sense that it's the same "which StorageClass does an unqualified PVC land
on" problem space, and it's worth the executor knowing it's already closed
before they go looking for it.

### 2. The Longhorn config this piece edits has moved to a different repo

At the time of the July/v2.1 discovery, `longhorn-system` was defined
entirely inside `equestria-cluster`. As of commit `efae3b5f7` on
2026-08-12 ("migrating longhorn-system, nfs-system and openebs-system"),
equestria-cluster's copy was **deleted** and replaced with a stub
Kustomization that sources the same path from a `GitRepository` named
`home-operations` pointing at
`https://github.com/david-driscoll/home-operations.git`. The real
HelmRelease, values, and StorageClasses now live in **this repo**, at
`kubernetes/apps/longhorn-system/`, as of `home-operations@6c7ce0b8`
(2026-08-12/13) — a small, independent, already-in-flight piece of the
repo-merge work that [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md)
describes for everything else. `cert-manager`, `nfs-system`, `openebs-system`
and `pulumi` moved in the same wave; `observability` and most other
namespaces have not.

**Executor note:** if your checkout of this repo predates `5fa1a7f2`
("migrating longhorn-system, nfs-system and openebs-system"), pull `main`
before touching any path below — as of the branch this plan was written on,
that checkout was 6 commits behind on exactly this directory.

### 3. The four Tier-1 apps are not staged for a future migration — they are already running in equestria, unprotected, today

The plan's sequencing (see [README.md](README.md#sequencing)) assumes this
piece lands, *then* [13-stage-sgc-apps.md](13-stage-sgc-apps.md) stages the
four migrating SGC apps into equestria's Flux tree suspended, *then*
[15-migrate-apps.md](15-migrate-apps.md) cuts them over for real. That
assumption is stale. Verified live today, equestria already has a
`stargate-command` namespace with all four apps **running**, not staged:

```
$ kubectl --context admin@equestria -n stargate-command get pods -o wide
NAME                              READY   STATUS    NODE
chrony-0                          1/1     Running   shining-armor
mosquitto-0                       1/1     Running   shining-armor
mosquitto-1                       1/1     Running   fluttershy
matter-d79959b5f-qf6kv            1/1     Running   shining-armor
home-assistant-695f96d685-x4tr7   2/2     Running   shining-armor
```

`git log` in `equestria-cluster` shows this happened in the last ~4 hours of
commits ("moving chrony, matter and mosquitto for the move", "migrating
home-assistant", "ha deps", "fix volumes", "volsync restore"), pre-dating
and independent of this planning pass. There is also a **fifth app not in
the issue's decision ledger or README summary**: `matter`
(`ghcr.io/home-assistant-libs/python-matter-server`, a Matter/Thread bridge
for Home Assistant), sharing `${AUTOMATION_VIP}` with mosquitto — worth
flagging to whoever owns [09](09-mqtt-ntp-renumber-ip-audit.md)/[14](14-cutover-runbook.md)/[15](15-migrate-apps.md),
not something this piece resolves.

**All four data-bearing PVCs are on the plain `longhorn` StorageClass today**,
verified live:

| PVC | Namespace | StorageClass | Size |
|---|---|---|---|
| `data-mosquitto-0` | stargate-command | longhorn | 4Gi |
| `data-mosquitto-1` | stargate-command | longhorn | 4Gi |
| `home-assistant` | stargate-command | longhorn | 40Gi |
| `matter` | stargate-command | longhorn | 4Gi |

(`chrony` is stateless — a ConfigMap-mounted config, no PVC — so it isn't in
this list; it needs nothing from this piece beyond running on a
`critical`-tagged node, which is [20](20-low-power-tier.md)'s job.)

This piece still does **not** migrate these four PVCs onto
`longhorn-critical` — per its scope, that's
[13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md)'s job. But the framing
those pieces inherit needs correcting: this isn't "stage four apps that will
land later," it's "four apps are live right now on the wrong StorageClass,
and the migration is immediately actionable the moment `longhorn-critical`
exists." Flag this prominently to whoever picks up 13/15.

### 4. Today's apparent safety is a topology accident, not a guarantee — and it's about to disappear

Equestria today has **3 control planes and exactly 1 worker**
(`hard-hat`, `fluttershy`, `kerfuffle` control-plane; `shining-armor`
worker — verified live, `talos/talconfig.yaml` agrees). With hard replica
anti-affinity and `numberOfReplicas: 3` spread over only 4 nodes, **at least
2 of any volume's 3 replicas are mathematically forced onto a control
plane** — there's only one non-CP node to put a replica on. Checked live for
all four Tier-1 volumes: every one of them already has 2 replicas on control
planes and 1 on `shining-armor` (e.g. `data-mosquitto-0`'s engine is
currently attached *on* `shining-armor`, with replicas on `fluttershy` and
`hard-hat`). Today, powering off the one worker wouldn't lose any of them.

That's not a property of the system — it's pigeonhole arithmetic on a 3:1
CP:worker ratio, and [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md)
is going to turn today's 4-node cluster into 3 CPs + **4** workers. At that
point the same math no longer forces anything onto a control plane, and
whatever "it happens to work" comfort exists today evaporates on exactly the
day the cluster is bigger and the temptation to trust the old behavior is
strongest. This is the concrete argument for doing this structurally now
rather than waiting until it visibly breaks.

## Current live state (verified 2026-08-13, `admin@equestria`)

### Topology

| Node | Role | Longhorn disk | Longhorn tags today |
|---|---|---|---|
| `hard-hat` | control-plane | Samsung 990 EVO Plus 1TB | *(none)* |
| `fluttershy` | control-plane | Samsung 990 EVO Plus 1TB | *(none)* |
| `kerfuffle` | control-plane | Samsung 990 EVO Plus 1TB | *(none)* |
| `shining-armor` | worker | 1TB (`/dev/sdb`) | *(none)* |

`replica-soft-anti-affinity: false` (hard — confirmed live) means Longhorn
will never put two replicas of the same volume on the same node. Combined
with only 3 nodes ever carrying the `critical` tag, that's what forces
exactly one `longhorn-critical` replica per control plane — there's no
fourth `critical` node for a spillover replica to land on.

### Longhorn settings that matter to this piece (v1.12.0, live)

| Setting | Value | Relevance |
|---|---|---|
| `replica-soft-anti-affinity` | `false` | Hard anti-affinity — the mechanism this piece relies on |
| `replica-replenishment-wait-interval` | `600` | Seconds until a short-a-replica volume gets rebuilt — the timer this piece is racing |
| `create-default-disk-labeled-nodes` | `false` | Node tags are not auto-derived from k8s labels |
| `taint-toleration` | `""` (empty) | Longhorn tolerates nothing extra today — fine, because `allowSchedulingOnControlPlanes: true` means the CPs carry no taint yet. [20](20-low-power-tier.md) changes this when it adds a `critical` taint. |
| `default-longhorn-static-storage-class` | `longhorn` | The plain default class |
| `node-down-pod-deletion-policy` | `do-nothing` | Unrelated to this piece; relevant to [20](20-low-power-tier.md) |
| `allow-empty-node-selector-volume` | `true` | Existing volumes with no `nodeSelector` (i.e. everything provisioned before this piece) keep matching *any* node — see the open-question analysis below |
| `allow-volume-creation-with-degraded-availability` | `true` | Load-bearing for the sequencing note below |
| `node-drain-policy` | `allow-if-replica-is-stopped` | **Changed since v2.1**, which recorded `block-for-eviction-if-contains-last-replica`. `home-operations` values.yaml documents why: the old policy deadlocked Talos upgrades on any node holding a `longhorn-local` (strict-local, 1-replica) volume, because Longhorn would try to rebuild an un-reschedulable replica before releasing the drain. Noted here because [10](10-drain-safety.md) and [20](20-low-power-tier.md)'s enter/exit runbook both reference the old value — they should re-verify against this one. |

### StorageClasses today

`longhorn` (default, 3 replicas, no selector), `longhorn-cache` (2 replicas,
disposable VolSync cache), `longhorn-snapshot` (2 replicas, VolSync restore
staging), `longhorn-local` (1 replica, `dataLocality: strict-local` —
**CNPG only, see "Out of scope" below**), `openebs-hostpath` (not default,
unused — 0 PVCs on it cluster-wide per vault#113's audit).

## The fix

All three files below live in **this repo** (`home-operations`), under
`kubernetes/apps/longhorn-system/`, per the location change noted above.

### Step 1 — tag the nodes

Longhorn node tags are a Longhorn-specific concept (`Node.spec.tags` on the
`nodes.longhorn.io` CRD in the `longhorn-system` namespace) — not the same
thing as a Kubernetes node label, and not something Flux manages. Today
every node's tags are empty (verified live: `hard-hat`'s `nodes.longhorn.io`
object shows `spec.tags: []`, same for all four).

Apply directly — this is safe, immediate, and idempotent; Longhorn never
overwrites a tag you've set (confirmed against `longhorn-manager`'s
`syncDefaultNodeTags`, which only *ever* fills in a tag from the
`node.longhorn.io/default-node-tags` annotation when `Node.Spec.Tags` is
currently empty — once you set it, it's yours):

```bash
kubectl --context admin@equestria -n longhorn-system patch nodes.longhorn.io hard-hat   --type merge -p '{"spec":{"tags":["critical"]}}'
kubectl --context admin@equestria -n longhorn-system patch nodes.longhorn.io fluttershy --type merge -p '{"spec":{"tags":["critical"]}}'
kubectl --context admin@equestria -n longhorn-system patch nodes.longhorn.io kerfuffle  --type merge -p '{"spec":{"tags":["critical"]}}'
kubectl --context admin@equestria -n longhorn-system patch nodes.longhorn.io shining-armor --type merge -p '{"spec":{"tags":["bulk"]}}'
```

Verify:

```bash
kubectl --context admin@equestria -n longhorn-system get nodes.longhorn.io \
  -o custom-columns='NAME:.metadata.name,TAGS:.spec.tags'
# expect: hard-hat/fluttershy/kerfuffle -> ["critical"], shining-armor -> ["bulk"]
```

**Also add the git-tracked, self-healing form**, in `equestria-cluster`'s
`talos/talconfig.yaml` (not this repo — Talos machine config for equestria
still lives there). Add `node.longhorn.io/default-node-tags` alongside the
existing `node.longhorn.io/default-disks-config` annotation each node
already carries, e.g. for `hard-hat`:

```yaml
    nodeAnnotations: &amd_minifm_annotations
      node.longhorn.io/default-node-tags: '["critical"]'
      node.longhorn.io/default-disks-config: |
        { "disks": [ { "path": "/var/mnt/longhorn", "allowScheduling": true, "tags":["nvme", "ssd"] } ] }
```

...and `'["bulk"]'` for `shining-armor`. This doesn't do anything by itself
right now (tags are already set by the `kubectl patch` above, and the
annotation is a no-op once `Spec.Tags` is non-empty) — it's there so a full
node rebuild re-seeds the correct tag automatically instead of silently
reverting to untagged. **It is also the exact mechanism
[18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md)
should reuse**: set `default-node-tags: '["critical"]'` on the three SGC
nodes' Talos machine config *before* they first join equestria as control
planes, and they arrive pre-tagged with zero extra steps — worth that
piece's author knowing this pattern exists.

### Step 2 — the `longhorn-critical` StorageClass

New file, `kubernetes/apps/longhorn-system/storageclass/critical.yaml` (this
directory has no `kustomization.yaml` — Flux auto-generates one covering
every YAML file it finds, confirmed against the live `ks.yaml`, so dropping
a new file in is sufficient, no resource list to edit):

```yaml
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn-critical
reclaimPolicy: Delete
provisioner: driver.longhorn.io
parameters:
  numberOfReplicas: "3"
  nodeSelector: "critical"
  dataLocality: best-effort
  replicaAutoBalance: best-effort
  staleReplicaTimeout: "30"
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

`nodeSelector: "critical"` is the Longhorn CSI parameter that restricts
replica placement to nodes carrying that tag (this is unrelated to
Kubernetes' own `nodeSelector` concept — same word, different layer).
`numberOfReplicas: "3"` against exactly 3 `critical`-tagged nodes plus hard
anti-affinity is what forces one-per-control-plane; it is not something that
needs separate affinity rules to hold.

### Step 3 — restrict the default class to `bulk`

Edit `kubernetes/apps/longhorn-system/longhorn/values.yaml` (consumed by the
`longhorn` HelmRelease via `valuesFrom` → the `longhorn-config` ConfigMap —
verified against the chart's `templates/storageclass.yaml` for the pinned
version, `1.12.0`, which reads exactly this key):

```yaml
persistence:
  defaultDataLocality: best-effort
  defaultNodeSelector:          # ADD
    enable: true                # ADD
    selector: "bulk"            # ADD
```

That's `persistence.defaultNodeSelector`, not `persistence.nodeSelector` or
a `defaultSettings` key — verified directly against
`longhorn/charts@longhorn-1.12.0`'s `templates/storageclass.yaml`, which
only emits `parameters.nodeSelector` on the auto-created default class when
`.Values.persistence.defaultNodeSelector.enable` is true, using
`.selector` as the value. No corresponding StorageClass YAML resource
exists in this repo for the plain `longhorn` class to hand-edit — it's
chart-generated from these values, the same way `longhorn-critical`'s
`nodeSelector` above is a StorageClass-level analogue but declared by hand
because it isn't the chart's default class.

## Resolving the open question (v2.1 §10 item 12)

The discovery comment flagged this as unverified and gated on it: *"whether
already-placed replicas on control-plane disks are migrated, left, or
re-evaluated at replenishment"* once step 3 lands. Answered by reading the
pinned `longhorn-manager@v1.12.0` source rather than guessing:

- **`manager/volume.go`'s `CreateVolume`** sets `Volume.Spec.NodeSelector`
  once, from the CSI `CreateVolumeRequest` — which is itself built from the
  StorageClass's `parameters` at the moment a PVC is first provisioned.
  StorageClass parameters are **never re-read for an existing PV** — this is
  ordinary Kubernetes CSI behavior, not Longhorn-specific.
- **`scheduler/replica_scheduler.go`** (`IsSelectorsInTags(node.Spec.Tags,
  volume.Spec.NodeSelector, allowEmptyNodeSelectorVolume)`) filters
  candidate nodes for *every* replica placement, including a replenishment
  after step 3 lands — reading `Volume.Spec.NodeSelector` live off the
  Volume object, not the StorageClass, every time.

Put together: **adding `nodeSelector: bulk` to the default class protects
every volume created after the change, and does nothing — neither migrates
nor immediately endangers — volumes that already exist.** An existing
volume's `Spec.NodeSelector` stays `[]` (empty) forever unless something
edits it directly, and `allow-empty-node-selector-volume: true` (verified
live) means an empty selector still matches *any* node, `critical`-tagged
or not. So today's Tier-2 volumes remain exactly as exposed to CP placement
after step 3 as before it — step 3 is a **going-forward** guarantee, not a
retroactive one.

The `Volume.Spec.NodeSelector` field is a live, mutable field on the Volume
CR (confirmed: the scheduler reads it fresh on every pass, not just at
creation), so an existing volume *can* be retroactively brought under the
same protection with a direct patch:

```bash
kubectl --context admin@equestria -n longhorn-system patch volumes.longhorn.io <volume-name> \
  --type merge -p '{"spec":{"nodeSelector":["bulk"]}}'
```

**This piece does not do that bulk backfill** — retrofitting every existing
Tier-2 volume is a distinct, larger piece of work (there are dozens; see the
PVC counts in vault#113's audit) and belongs with whoever owns ongoing
Tier-2 hygiene, not the low-power critical-tier mechanism. It's flagged here
so it isn't lost: **existing Tier-2 volumes will keep being eligible for
CP placement at replenishment until someone backfills their
`nodeSelector`, or until they naturally get recreated (e.g. a VolSync
restore, a PVC resize that forces recreation) after step 3 has landed.**

### A sequencing nuance step 3 surfaces, not a blocker

`allow-volume-creation-with-degraded-availability: true` (verified live) is
the safety valve that keeps step 3 from being harmful today, but it's worth
understanding precisely: `controller/volume_controller.go` only marks a new
volume `Scheduled: true` despite an unsatisfied replica count if **at least
one** replica placed successfully. Today there is exactly **one**
`bulk`-tagged node (`shining-armor`), so any *new* Tier-2 PVC created after
step 3 lands will provision, bind, and run — just with 1 replica instead of
3, i.e. no redundancy — until [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md)
grows the worker pool to 4. At that point Longhorn's normal replenishment
cycle (`replica-replenishment-wait-interval`) tops these volumes up to 3
replicas automatically — no manual step needed later. This is a real,
bounded, self-healing trade during the interim window between this piece
landing and 19 completing, not a reason to defer step 3: existing volumes
are entirely unaffected (per the analysis above), and new-volume durability
recovers on its own once 19 lands.

## Rehearsed placement proof

Prove the mechanism on a scratch volume before trusting it for real
workloads. Run after steps 1–3 are applied and reconciled.

**Prove `longhorn-critical` places one replica per control plane:**

```bash
kubectl --context admin@equestria apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: scratch-critical-proof
  namespace: default
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: longhorn-critical
  resources:
    requests:
      storage: 1Gi
EOF
kubectl --context admin@equestria run scratch-critical-pod --image=busybox --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"c","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"v","mountPath":"/data"}]}],"volumes":[{"name":"v","persistentVolumeClaim":{"claimName":"scratch-critical-proof"}}]}}'

# once bound:
kubectl --context admin@equestria -n longhorn-system get replicas.longhorn.io \
  -l longhornvolume=$(kubectl --context admin@equestria get pvc scratch-critical-proof -o jsonpath='{.spec.volumeName}') \
  -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeID'
# expect exactly 3 rows: hard-hat, fluttershy, kerfuffle. Zero on shining-armor.

kubectl --context admin@equestria delete pod scratch-critical-pod
kubectl --context admin@equestria delete pvc scratch-critical-proof
```

**Prove the default class can no longer place onto a control plane:**

```bash
kubectl --context admin@equestria apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: scratch-bulk-proof
  namespace: default
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
EOF
# (omit storageClassName — this must hit the default `longhorn` class)

kubectl --context admin@equestria -n longhorn-system get replicas.longhorn.io \
  -l longhornvolume=$(kubectl --context admin@equestria get pvc scratch-bulk-proof -o jsonpath='{.spec.volumeName}') \
  -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeID'
# expect exactly 1 row, on shining-armor (see the degraded-availability note above
# for why 1-of-3 is expected today, not a failure).

kubectl --context admin@equestria delete pvc scratch-bulk-proof
```

If either proof shows a replica landing somewhere it shouldn't, stop —
something in steps 1–3 didn't apply the way this document assumes, and it
needs to be understood before [13](13-stage-sgc-apps.md) or
[20](20-low-power-tier.md) build on top of it.

## The trade, stated plainly

A `longhorn-critical` volume has exactly 3 replicas across exactly 3 nodes.
One control plane down: the volume is **degraded** (still serving, from
whichever replica is live). Two control planes down: the volume is
**unavailable**. That is a materially smaller safety margin than an ordinary
Tier-2 volume spread across 7 eventual nodes — and it is the correct price
for the guarantee that Tier-1 data is *always* on a control plane, never
subject to a scheduling roll of the dice. [20](20-low-power-tier.md)'s
low-power design already accepts two-CPs-down as an unavailable-cluster
scenario regardless of storage (etcd itself needs 2 of 3 for quorum), so
this doesn't introduce a new failure mode — it matches storage's fault
tolerance to the control plane's.

## Out of scope for this piece

- **Migrating the four live Tier-1 PVCs onto `longhorn-critical`.** Classes
  and tags are this piece's job; the actual `storageClassName` change (which
  requires a PVC recreate + data copy, since StorageClass is immutable on a
  bound PVC) belongs to [13-stage-sgc-apps.md](13-stage-sgc-apps.md) /
  [15-migrate-apps.md](15-migrate-apps.md) — see the urgency note above,
  since those apps are live today, not staged for later.
- **Backfilling `nodeSelector: bulk` onto existing Tier-2 volumes.** Real,
  documented above, explicitly deferred — not this piece's mechanism.
- **The `critical` taint, the toleration + required-affinity pinning that
  keeps Tier-0/Tier-1 pods permanently resident on the control planes, the
  `critical-tier` PriorityClass, and the enter/exit low-power runbook.** All
  [20-low-power-tier.md](20-low-power-tier.md). This piece makes the
  *storage* placement safe by construction; making the *pod* placement safe
  by construction (so nothing needs to reschedule when workers go dark) is
  a separate mechanism layered on top.
- **Longhorn's `taint-toleration` setting.** Still empty today and doesn't
  need to change until [20](20-low-power-tier.md) adds the `critical` taint
  — but note it then, since applying a taint without updating
  `taint-toleration` first costs the control planes their entire Longhorn
  instance-manager contribution. v2.1 §3.3 recommends doing that setting
  change as its own early maintenance step (stop workloads, detach volumes)
  since the alternative is up to a ~1 hour propagation delay with volumes
  attached — that's [10-drain-safety.md](10-drain-safety.md)'s territory.
- **The CNPG / `longhorn-local` volumes are entirely outside this scheme.**
  `postgres-1`, `postgres-2`, `postgres-3` (the shared CNPG cluster, `database`
  namespace) use `longhorn-local` — `dataLocality: strict-local`,
  `numberOfReplicas: "1"`, no node selector, and by design not reschedulable:
  a CNPG instance's data exists on exactly one node and the pod can only run
  there. If a database ever needs to be in the critical tier, its CNPG
  instance has to be *created* on a control plane from the start (per
  CLAUDE.md's rule: CNPG surgery is `kubectl cnpg destroy`, never manual PVC
  handling — there is no "move it later"). Today nothing on `database/postgres`
  is Tier 1 (authentik, the one thing that needed it, is moving to
  alpha-site per [07](07-authentik-to-alpha-site.md); Home Assistant uses
  SQLite in its own PVC, not Postgres), so this doesn't block anything — it's
  named here so nobody assumes `longhorn-critical` covers it.

## Verification checklist

- [ ] `kubectl get sc` shows exactly one `(default)` class (`longhorn`) —
      re-confirms vault#113 is still fixed before building on top of it.
- [ ] All 4 nodes' `nodes.longhorn.io` show the expected tag: 3×`critical`,
      1×`bulk`.
- [ ] `longhorn-critical` StorageClass exists, `numberOfReplicas: "3"`,
      `nodeSelector: "critical"`.
- [ ] Default `longhorn` class's live effect shows `nodeSelector: bulk` in
      its `parameters` (`kubectl get sc longhorn -o yaml`) — confirms the
      Helm values change actually reconciled, not just landed in git.
- [ ] Scratch-volume proof 1: `longhorn-critical` PVC gets exactly 3
      replicas, one on each of `hard-hat`/`fluttershy`/`kerfuffle`, none on
      `shining-armor`.
- [ ] Scratch-volume proof 2: default-class PVC gets exactly 1 replica, on
      `shining-armor`, none on any control plane.
- [ ] `talos/talconfig.yaml` in `equestria-cluster` carries
      `node.longhorn.io/default-node-tags` for all 4 nodes (durable/self-healing
      form), even though the live tags were already set imperatively.
- [ ] The urgency finding (4 live, unprotected Tier-1 PVCs) has been handed
      off to whoever is picking up [13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md).

## See also

- [README.md](README.md) — decision ledger, full sequencing, cross-cutting
  rules (one-node-at-a-time, no-PITR, CNPG surgery rules).
- [10-drain-safety.md](10-drain-safety.md) — drain policy and the
  `taint-toleration` maintenance step this piece's taint work depends on.
- [11-volumesnapshotcontents-trim.md](11-volumesnapshotcontents-trim.md) —
  independent prerequisite, same dependency slot in the sequencing graph.
- [13-stage-sgc-apps.md](13-stage-sgc-apps.md),
  [15-migrate-apps.md](15-migrate-apps.md) — where the four live Tier-1 PVCs
  actually move onto `longhorn-critical`.
- [18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) —
  reuse the `default-node-tags` annotation pattern for the incoming SGC
  nodes so they arrive pre-tagged `critical`.
- [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md) —
  the point at which the CP:worker ratio flips and today's pigeonhole-luck
  argument stops applying; also where the tag scheme must be re-applied to
  track the new CP/worker membership (today's `critical` 3 rotate out to
  `bulk`, the incoming SGC 3 rotate in as `critical`).
- [20-low-power-tier.md](20-low-power-tier.md) — the taint, toleration,
  required affinity, PriorityClass, and enter/exit runbook that this piece's
  storage guarantee is built to support.
- [vault#113](https://github.com/david-driscoll/vault/issues/113) — the
  two-default-StorageClasses fix this piece assumes is already live.
- [Expansion v2.1 §3.3–3.4](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583) —
  original design; §10 item 12 is the open question resolved above.
