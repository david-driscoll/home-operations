# 30 — Longhorn media tier

Created **2026-08-22**, rewritten the same day for **plan C**, which supersedes the
original recommendation. **Unfiled** — standalone, like
[24](24-power-states.md) through [29](29-taint-readiness-audit.md). Direct sequel to
[12](12-longhorn-critical-tier.md) (which built `longhorn-critical` and the node-tag
machinery) and to [20](20-low-power-tier.md) §9.

Answers one question: **when low-power mode sheds both media workers overnight, how do the
`plex`, `jellyfin` and `dispatcharr` config volumes keep more than one healthy replica?**

> ## The decision: plan C — `longhorn-media`, `nodeSelector: critical`, 3 replicas, `dataLocality: disabled`
>
> **Put the replicas only on nodes that never shut down.** The three control planes
> (`milky-way`, `othalla`, `pegasus`) stay up through the low-power window, they carry Intel
> iGPUs, and they are where the three media pods relocate to overnight. Give the volumes
> exactly those three nodes and exactly three replicas.
>
> Overnight the pod runs on a control plane that **already holds a replica**, all three
> replicas stay up, and the volume never leaves `healthy`. There is no rebuild, because
> there is nowhere to rebuild to and nothing to rebuild.
>
> **The accepted cost:** by DAY the pods prefer the media workers, so the pod runs on a
> worker while all three replicas sit on control planes and every read and write crosses the
> network. See §3.

**Two earlier designs are superseded** and are described only where the contrast is
load-bearing: option A (4 replicas on the 4 `bulk` nodes) and option B (5 replicas on a new
`media` tag over the five Intel-QuickSync nodes). Both left the volumes **degraded every
night**, which §2 shows is not cosmetic. Plan C needs **no new node tag** and **no
`talconfig.yaml` edit** — `critical` already exists on the three control planes — so
option B's entire prerequisite phase disappears.

Everything marked **verified live** was read from `admin@equestria` on **2026-08-22** with
read-only commands, or with `--dry-run=server` patches that run the real admission chain and
mutate nothing. Claims marked **inferred** are reasoning from Longhorn source or semantics,
flagged as such. Longhorn is **v1.12.1**.

> ### ⚠️ Execution status — MIGRATION UNDERWAY, 2026-08-22
>
> ~~**Nothing in this document has been executed.**~~ The scheduling, return-trip and
> StorageClass halves landed with
> [#1051](https://github.com/david-driscoll/home-operations/pull/1051) and are live; §6's
> **volume migration is in progress and is not finished.** Re-verified live 2026-08-22:
>
> | Volume | State | Where in §6.2 |
> |---|---|---|
> | `dispatcharr` (`pvc-633d7002…`) | `nodeSelector: ["critical"]`, `numberOfReplicas: 4`, `healthy`, attached `fluttershy`. Replicas on **`milky-way`, `othalla`, `pegasus`** plus one remaining `bulk` replica on `fluttershy` | **through step C.** Step D outstanding — delete the `fluttershy` replica, then patch `numberOfReplicas: 3` back to back |
> | `plex` (`pvc-242324ae…`) | `nodeSelector: ["bulk"]`, 3 replicas on `fluttershy`/`kerfuffle`/`shining-armor`, `healthy` | **not started** |
> | `jellyfin` (`pvc-d49e4972…`) | `nodeSelector: ["bulk"]`, 3 replicas on `fluttershy`/`kerfuffle`/`shining-armor`, `healthy` | **not started** |
>
> The three control-plane replicas of `dispatcharr` reached `healthy` at **17:47:56, 17:50:01 and
> 17:51:21 UTC** — roughly two minutes apart for a 1.51 GiB volume. That bounds the rebuild
> cost; it does **not** answer open item 2 (deleted-vs-failed replenishment timing), which needs
> the deletion timestamps alongside these.
>
> **Until all three are done, do not shed a media worker overnight** — its config volume would
> sit degraded for the whole window, which is exactly §2's problem.
>
> The replica names in §6.2's deletion table are from before this run and are stale by
> construction. Re-read them with the command underneath it, as that section already says.

---

## 1. Current state (verified live)

| App | Volume | Size / actual | Replicas on | Access | Attached to |
| --- | --- | --- | --- | --- | --- |
| `equestria/plex` | `pvc-242324ae-0f5e-4be8-82ce-01afe2d51b53` | 40Gi / **23.19 GiB** | `fluttershy`, `kerfuffle`, `shining-armor` | **RWX** | `kerfuffle` |
| `equestria/jellyfin` | `pvc-d49e4972-17e8-4811-9850-10a8f17d89f4` | 60Gi / **59.96 GiB** | `fluttershy`, `kerfuffle`, `shining-armor` | RWO | `fluttershy` |
| `equestria/dispatcharr` | `pvc-633d7002-9640-4f86-b9a0-127d8d14a9c2` | 5Gi / **1.51 GiB** | `fluttershy`, `hard-hat`, `kerfuffle` | RWO | `fluttershy` |

All three: `state: attached`, `robustness: healthy`, `spec.nodeSelector: ["bulk"]`,
`spec.dataLocality: best-effort`, `spec.replicaAutoBalance: ignored` (inherits the global),
PV `storageClassName: longhorn`, reclaim `Delete`. **Total actual data ≈ 84.66 GiB.**

**The problem:** `fluttershy` and `kerfuffle` are the pair low-power mode sheds, and both
hold a replica of all three volumes. Shed the pair and `plex` and `jellyfin` drop to **one**
copy until morning.

### 1.1 Node tags (verified live)

```
fluttershy ["bulk"]   hard-hat ["bulk"]   kerfuffle ["bulk"]   shining-armor ["bulk"]
milky-way ["critical"]   othalla ["critical"]   pegasus ["critical"]
```

`nodeSelector` is a **hard AND filter over tags** — `getDiskCandidates` in
`scheduler/replica_scheduler.go`:

```go
// Filter Nodes. If the Nodes don't match the tags, don't bother marking them as candidates.
if !types.IsSelectorsInTags(node.Spec.Tags, volume.Spec.NodeSelector, allowEmptyNodeSelectorVolume) {
    continue
}
```

So a class names exactly one tier; `"bulk,critical"` matches nothing.

### 1.2 Relevant settings (verified live)

| Setting | Value | Relevance |
| --- | --- | --- |
| `replica-soft-anti-affinity` | `false` | HARD anti-affinity — at most one replica per node |
| `replica-auto-balance` | `best-effort` | see §4.3 — does **not** do tag conformance |
| `replica-replenishment-wait-interval` | `600` | the nightly-rebuild trigger under the old designs |
| `concurrent-replica-rebuild-per-node-limit` | `2` | bounds the migration (§7) |
| `fast-replica-rebuild-enabled` | `{"v1":"true",…}` | irrelevant to a *new* replica — see §7 |
| `storage-over-provisioning-percentage` | `600` | capacity headroom |
| `storage-minimal-available-percentage` | `5` | capacity floor |
| `allow-empty-node-selector-volume` | `true` | why §4.2's proof case exists |
| `taint-toleration` | `node-role.kubernetes.io/control-plane:NoSchedule` | share-managers can run on control planes |

---

## 2. Why "degraded every night" killed the earlier designs

Both superseded designs left the three volumes `degraded` for the whole 02:00–09:00 window.
That state has two teeth, and **both were verified in this repository**:

**1. It fires an alert, nightly, forever.**
`kubernetes/apps/longhorn-system/longhorn/rules/pvc-usage-rules.yaml`:

```yaml
- alert: LonghornVolumeStatusWarning
  expr: (longhorn_volume_robustness == 2) * on(volume) group_left(…) (…)
  for: 5m
  labels:
    severity: warning
```

`robustness == 2` is `degraded`. Three volumes × every night.

**2. It blocks Talos upgrades cluster-wide.**
`kubernetes/apps/system-upgrade/upgrades/talos.yaml`:

```yaml
- apiVersion: longhorn.io/v1beta2
  kind: Volume
  namespace: longhorn-system
  description: Wait for degraded Longhorn volumes to finish rebuilding before draining the next node, so its replica isn't the last healthy copy
  expr: status.robustness != "degraded"
  timeout: 15m
```

This check **names no volume**. It is a predicate over *every* `Volume` in
`longhorn-system`, so **any** degraded volume anywhere stalls the drain of the next node for
the full 15 minutes and then fails the upgrade. A design that is degraded 02:00–09:00 hands
the cluster a nightly seven-hour window in which node upgrades cannot run.

Under plan C nothing is degraded overnight, so neither tooth bites. **Verified live:**
`kubectl get talosupgrades.tuppr.home-operations.com` currently reports the `talos` upgrade
`PHASE=Completed READY=True`, and `0` volumes are degraded cluster-wide right now.

### 2.1 The churn rule, and why plan C satisfies it trivially

The old designs had to engineer around `replica-replenishment-wait-interval` (600 s). From
`getCurrentNodesAndZones()` in `replica_scheduler.go`, a failed replica stops occupying its
node once `creatingNewReplicasForReplenishment` is set — i.e. once the 600 s wait expires —
at which point the shed nodes re-enter the candidate pool, are found unschedulable (powered
off), and any *other* eligible-but-empty node gets a full rebuild.

**The rule: churn happens if and only if there is at least one tag-eligible node that is
still AWAKE and does not already hold a live replica.**

Under plan C the eligible set *is* the set of nodes that stay up, and all three hold a
replica. The shed cannot create a vacancy, so the rule is satisfied by construction rather
than by matching a replica count to a node count. It is the only one of the three designs
where that is true for a reason rather than by arithmetic.

---

## 3. The accepted cost: remote reads by day

The three apps carry a **soft** nodeAffinity preferring the media workers (stronger Iris Xe
iGPU) and a **hard** one requiring an Intel iGPU. So by day the pod sits on `fluttershy` or
`kerfuffle` while all three replicas are on control planes: the engine runs on the worker
and every read and write crosses the network.

**This shape is already running healthy in this cluster, in mirror image** (verified live):

| Volume | PVC | Attached to | Replicas on | Robustness | Engine replica modes |
| --- | --- | --- | --- | --- | --- |
| `pvc-8cfbf411-185d-4e9e-8b33-07a12bd66372` | `teamarr` | **`milky-way`** (CP) | `fluttershy`, `hard-hat`, `kerfuffle` (all `bulk`) | `healthy` | 3 × `RW` |
| `pvc-4f906258-9fd8-4a94-bdca-e24bb44ff34d` | `pinepods` | **`othalla`** (CP) | `fluttershy`, `hard-hat`, `kerfuffle` (all `bulk`) | `healthy` | 3 × `RW` |

Both have their engine on a node holding **zero** replicas and both are fully healthy. That
is the plan-C day-state with the tiers swapped, and it is the empirical answer to "is remote
read viable here".

Measured 7-day load on the three media volumes is **4.2 write IOPS / ~52 KB/s combined**,
with **~0 reads** (the page cache absorbs them), so there is very little traffic to make
remote in the first place.

**What to watch after cutover.** The control-plane Longhorn disks are Transcend
TS1TMTS425S M.2 SATA (54–75 ms mean write latency over 7d) against the workers' Samsung
990 EVO Plus NVMe (0.5–11 ms). Longhorn v1 acks a write only once **every** replica has it,
so these volumes inherit the slower disk **24/7**, not just overnight — and now with a
network hop on top for most of the day. At 4.2 IOPS that is affordable, but the risk is
**per-operation latency, not throughput**, and **`plex`'s config is SQLite** — library scans
and metadata refreshes are fsync-bursty and serialised. **`plex` is the most
latency-sensitive of the three and is the thing to watch after cutover.** If it disappoints,
the rollback in §6.5 is cheap.

---

## 4. THE MIGRATION — the hard part

Under the superseded designs the migration was small: `numberOfReplicas` went up, and
Longhorn added one or two replicas to nodes that had none. **Under plan C every existing
replica must move.** Current placement and target placement are **disjoint**:

| Volume | Now | Target | Replicas to relocate | Bytes copied |
| --- | --- | --- | --- | --- |
| `dispatcharr` | fluttershy, hard-hat, kerfuffle | milky-way, othalla, pegasus | **3** | 3 × 1.51 = **4.5 GiB** |
| `plex` | fluttershy, kerfuffle, shining-armor | milky-way, othalla, pegasus | **3** | 3 × 23.19 = **69.6 GiB** |
| `jellyfin` | fluttershy, kerfuffle, shining-armor | milky-way, othalla, pegasus | **3** | 3 × 59.96 = **179.9 GiB** |
| | | | **9** | **≈ 254 GiB** |

> ⚠️ The logical data is ~85 GiB, but **nine** replicas are rebuilt, so **~254 GiB moves.**

### 4.1 Q1 — can `spec.nodeSelector` be patched live? **Yes.** (verified)

`spec.numberOfReplicas`, `spec.nodeSelector` and `spec.dataLocality` are plain, mutable
fields on `volumes.longhorn.io`, and `longhorn-webhook-validator` accepts changing them on an
**attached, healthy** volume. **Verified live** with server-side dry-run (full admission
chain, mutates nothing) on **all three** volumes:

```bash
kubectl -n longhorn-system patch volumes.longhorn.io <vol> --type=merge \
  -p '{"spec":{"numberOfReplicas":3,"nodeSelector":["critical"],"dataLocality":"disabled"}}' \
  --dry-run=server
```

| Volume | Access mode | Result |
| --- | --- | --- |
| `pvc-633d7002-…` (dispatcharr) | RWO | `n=3 sel=["critical"] dl=disabled` — **accepted** |
| `pvc-242324ae-…` (plex) | **RWX** | `n=3 sel=["critical"] dl=disabled` — **accepted** |
| `pvc-d49e4972-…` (jellyfin) | RWO | `n=3 sel=["critical"] dl=disabled` — **accepted** |

The `n=4` variant used by the runbook (§6) was dry-run separately and is **also accepted on
all three**.

**`plex` is RWX and was tested explicitly.** Its `sharemanagers.longhorn.io` is `running` on
`kerfuffle`, exporting `nfs://10.196.249.75/pvc-242324ae-…`, with a
`share-manager-pvc-242324ae-…` pod up 2d22h. The webhook did not object. Replica rebuild
sits **below** the share-manager — the NFS export is served by the share-manager pod from the
engine, and replicas are the engine's backend — so the export is not expected to be
interrupted, but it is the one thing to watch during plex's migration (§6.3).

The patch is **durable**: the CSI driver stamps these values only at provisioning time and
neither Flux nor VolSync manages `volumes.longhorn.io`. Corroborated live — all three media
PVs record `csi.volumeAttributes.nodeSelector: null` (the class had no selector when they
were provisioned) while their Volume CRs already say `["bulk"]`. **The CRs have diverged from
the PVs once already and stayed diverged.**

### 4.2 Q2 — does Longhorn then auto-evict the non-conforming replicas? **NO.**

**This is the finding that makes plan C's migration manual.** Changing `nodeSelector` on a
volume whose replica count is already satisfied causes Longhorn to do **nothing at all**.

**Source — Longhorn `v1.12.x`, `controller/volume_controller.go`.** Rebuilds are driven by
`replenishReplicas()`, which calls `getReplenishReplicaCount()`. That function counts
replicas that are **usable** — roughly, `r.Spec.FailedAt == "" && r.Spec.NodeID != ""` — and
returns `v.Spec.NumberOfReplicas - usableCount`. **It compares a COUNT against
`numberOfReplicas`. It never asks whether a replica's node still satisfies the volume's
tags.** The tag filter (`IsSelectorsInTags`, §1.1) lives one layer down in the *scheduler*
and only runs when a **new** replica is being placed. No new replica is created, so the
filter is never consulted, so the stale replicas are never noticed.

Concretely, for plan C: 3 healthy replicas, `numberOfReplicas: 3` → replenish count `0` →
the volume stays `healthy` with all three replicas on `bulk` nodes **indefinitely**. The
patch appears to succeed and changes nothing observable.

**The estate already established this, from source, in
[12](12-longhorn-critical-tier.md):**

> "`Volume.Spec.NodeSelector` is live and mutable, so patching an existing volume to
> `["critical"]` makes Longhorn replenish onto control planes without recreating the PVC.
> **It does not move the replicas that are already placed** […] Useful as an emergency
> stopgap […]; not a migration."

Doc 12 resolved the same question in its own terms: *"adding `nodeSelector: bulk` to the
default class protects every volume created after the change, and does nothing — neither
migrates nor immediately endangers — volumes that already exist."*

**Verified live, empirically.** Three volumes on this cluster are carrying replicas that
violate their own `nodeSelector` right now:

```
pvc-399ec4a9-… (volsync-src-tautulli-cache)  sel=["bulk"]  replica on pegasus (tags=critical)
pvc-6c707c13-… (volsync-src-searxng-cache)   sel=["bulk"]  replica on pegasus (tags=critical)
pvc-d37bf17f-… (volsync-src-n8n-cache)       sel=["bulk"]  replica on pegasus (tags=critical)
```

The provenance is exactly the plan-C scenario in miniature. Their PVs record
`csi.volumeAttributes.nodeSelector: null` — they were provisioned from `longhorn-cache` when
it had **no** selector, so `Volume.Spec.NodeSelector` was `[]`, and with
`allow-empty-node-selector-volume: true` they matched any node, which is how a replica landed
on `pegasus` on 2026-08-19. The selector was **later** backfilled to `["bulk"]`. **The
pegasus replicas did not move, are not `failedAt`, and have `evictionRequested: false`.**

> **Caveat, stated plainly:** those three volumes are `detached` (`robustness: unknown`), and
> a detached volume's controller does less work than an attached one's. They demonstrate that
> a non-conforming replica **persists and is never marked for eviction**; they do not by
> themselves prove the attached-volume path. The source reading above and doc 12's
> independent source reading are what carry that. Rated **verified (source) + corroborated
> (live)**, not **proven live on an attached volume**.

### 4.3 Is `replica-auto-balance` the mechanism? **No.**

`replica-auto-balance` is `best-effort` globally (volume-level is `ignored`, i.e. inherit).
It balances the **number** of replicas across nodes and zones —
`getReplicaCountForAutoBalanceNode` / `…Zone` compare replica *counts* per node and per
zone. **It has no notion of tag conformance** and will not move a replica off a node merely
because the node no longer matches the volume's selector.

It is also inert here in the steady state: 3 replicas over exactly 3 eligible nodes with
hard anti-affinity has exactly one valid placement, so there is nothing to balance.

### 4.4 Is node-level `evictionRequested` the sanctioned mechanism? **It is the sanctioned mechanism for draining a NODE — and it is the wrong tool here.**

Longhorn's official eviction primitive is `spec.evictionRequested` on `nodes.longhorn.io`
and on `spec.disks[<disk>].evictionRequested` ("Evicting Replicas on Disabled Disks or
Nodes"). Two independent reasons it cannot be used for this migration, **both verified
live**:

**1. It is gated on disabling scheduling on the whole node or disk first.** Server-side
dry-run:

```
$ kubectl -n longhorn-system patch nodes.longhorn.io hard-hat --type=merge \
    -p '{"spec":{"evictionRequested":true}}' --dry-run=server
The request is invalid: : need to disable scheduling on node hard-hat for node eviction,
or cancel eviction to enable scheduling on this node

$ … -p '{"spec":{"disks":{"default-disk-1030400000000":{"evictionRequested":true}}}}' --dry-run=server
The request is invalid: : need to disable scheduling on disk default-disk-1030400000000
for disk eviction, or cancel eviction to enable scheduling on this disk
```

Disabling scheduling on a worker changes placement for the entire cluster, not just these
volumes.

**2. It is indiscriminate — the blast radius is enormous.** Node eviction moves **every**
replica on that node. Live counts:

```
fluttershy: 78   hard-hat: 79   kerfuffle: 61   shining-armor: 26
milky-way: 45    othalla: 35    pegasus: 52
```

To relocate 9 media replicas it would evict **244** replicas across the four `bulk` nodes.
Doc 12 already warns against reaching for this reflexively, *"given what eviction onto the
Transcend SATAs did"*.

### 4.5 Is per-replica `evictionRequested` a usable primitive? **No — it does not stick.**

`replicas.longhorn.io` **does** have `spec.evictionRequested` (confirmed via
`kubectl explain`), and patching it directly **is accepted by the validating webhook**
(verified live, server-side dry-run on the dispatcharr replica on `hard-hat` returned
`evictionRequested=true`).

**But acceptance is not durability.** That field is a *derived* one: the node controller's
`syncReplicaEvictionRequested` reconciles every replica's `spec.evictionRequested` from its
**node's and disk's** eviction state on each resync, and **reverts** a hand-set value on a
node that is not itself being evicted. So a direct patch survives only until the next
resync.

> This is the one place where a `--dry-run=server` result is actively misleading: the webhook
> says yes, and the change still will not persist. Recorded because it is an easy trap.

### 4.6 So: what actually moves a replica?

**Deleting the replica CR.** `kubectl delete replicas.longhorn.io <name>` removes it from the
volume's replica set; `usableCount` drops immediately; `getReplenishReplicaCount()` returns
`1`; the scheduler places a replacement, **applying the volume's CURRENT `nodeSelector`**,
and the engine rebuilds into it online.

Four behaviours of that path matter to the runbook, from the same source reading:

1. **The volume must be `attached`.** `replenishReplicas()` returns early for a detached
   volume — a detached volume will not rebuild. All three are attached; keep them attached.
2. **Rebuilds are serialised per volume.** The controller returns early when the volume
   already has a rebuilding replica, so a volume rebuilds **one replica at a time** no matter
   what you ask for.
3. **The replenish count is forced to 1 per pass**, so even a large deficit is filled one
   replica at a time.
4. **There is a webhook safety net.** `validateReplicaDeletion` **refuses** to delete the
   last available healthy replica of a volume. You cannot destroy a volume with this
   procedure by miscounting. (Verified live in the permitted direction: deleting one of three
   healthy replicas is accepted by `kubectl delete --dry-run=server`.)

**Note the difference from a *failed* replica.** `replica-replenishment-wait-interval: 600`
delays replacement of replicas with `failedAt` set (the powered-off-node case). A **deleted**
replica has no `failedAt` — it is simply gone from the set — so replacement is expected to be
**immediate**, not after 600 s. *(**Inferred** from where the wait is applied; confirm it on
the dispatcharr rehearsal in §6.2 before trusting the timing for the larger volumes.)*

---

## 5. Capacity — do the control planes have room? (verified live)

Longhorn schedules against `storageMaximum × over-provisioning%` and refuses to go below
`storage-minimal-available-percentage`. Adding all three volumes to each control plane adds
**105 GiB scheduled** (spec sizes 40 + 60 + 5) and **~85 GiB actual**.

| Node | max | avail now | sched now | sched after (+105) | avail after (−85) | usage after |
| --- | --- | --- | --- | --- | --- | --- |
| `milky-way` | 930 GiB | 793 GiB | 491 GiB | 596 GiB | 708 GiB | **23 %** |
| `othalla` | 930 GiB | 813 GiB | 349 GiB | 454 GiB | 728 GiB | **21 %** |
| `pegasus` | 930 GiB | 780 GiB | 654 GiB | 759 GiB | 695 GiB | **25 %** |

Over-provisioning limit is `930 × 6 = 5585 GiB` — not close. Minimum available is
`930 × 5 % = 46 GiB` — not close. `LonghornNodeStorageWarning` fires above **80 %** usage;
the worst case lands at **25 %**. **Capacity is not a constraint.**

---

## 6. The migration runbook — do NOT execute unattended

**Method: grow-then-shrink.** Rather than deleting a replica and letting the volume run at
two copies while it rebuilds, temporarily set `numberOfReplicas: 4`. Every intermediate state
then holds **at least three** healthy replicas — comfortably better than the "never below 2"
bar — for the same three rebuilds and the same total copy volume.

Why the obvious alternative is worse: patching to `nodeSelector: ["critical"]` and simply
deleting one replica at a time works, but the volume sits at **2** healthy replicas during
each of the nine rebuilds. Grow-then-shrink costs one extra patch per volume and never does.

Why you cannot just "add three replicas first, then drop the old ones": there is no way to
express `bulk ∪ critical` — tags are a hard **AND** (§1.1). With an empty selector the
scheduler would pick by free space and could place a new replica on `hard-hat` instead of a
control plane. `numberOfReplicas: 4` **with** `nodeSelector: ["critical"]` is what makes each
new replica land deterministically on a control plane.

### 6.1 Preconditions — check ALL of these first

```bash
# 1. No Talos upgrade in flight or pending. THIS IS THE IMPORTANT ONE — see §6.6.
kubectl get talosupgrades.tuppr.home-operations.com -A
#    require: PHASE=Completed, READY=True

# 2. Nothing already degraded (would confuse both your verification and tuppr)
kubectl -n longhorn-system get volumes.longhorn.io -o json \
  | jq -r '[.items[]|select(.status.robustness=="degraded")|.metadata.name]|"degraded=\(length) \(.)"'
#    require: degraded=0

# 3. All three target volumes attached + healthy
kubectl -n longhorn-system get volumes.longhorn.io \
  pvc-242324ae-0f5e-4be8-82ce-01afe2d51b53 pvc-d49e4972-17e8-4811-9850-10a8f17d89f4 \
  pvc-633d7002-9640-4f86-b9a0-127d8d14a9c2 \
  -o custom-columns=NAME:.metadata.name,STATE:.status.state,ROBUST:.status.robustness,N:.spec.numberOfReplicas

# 4. All three control planes schedulable with room (§5)
kubectl -n longhorn-system get nodes.longhorn.io milky-way othalla pegasus \
  -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags,SCHED:.spec.allowScheduling,EVICT:.spec.evictionRequested

# 5. NOT inside the low-power window (02:00-09:00) — you want the workers awake so
#    the source replicas are all available to read from.
```

### 6.2 Per-volume procedure

Run it **one volume at a time**, in this order — **`dispatcharr` first as a cheap
rehearsal** (1.51 GiB, under a minute per replica), then `plex`, then `jellyfin` last.

Let `V` be the volume and `CP` the set `{milky-way, othalla, pegasus}`.

**Step A — grow onto the first control plane.**

```bash
kubectl -n longhorn-system patch volumes.longhorn.io "$V" --type=merge \
  -p '{"spec":{"numberOfReplicas":4,"nodeSelector":["critical"],"dataLocality":"disabled"}}'
```

Longhorn now has 3 usable replicas against `numberOfReplicas: 4` → replenish 1 → the
scheduler filters candidates to `critical`-tagged nodes → the new replica lands on a control
plane. The volume reads `degraded` while it rebuilds (3 healthy < 4), then returns to
`healthy` at 4.

*Wait for:* `robustness: healthy` **and** 4 running replicas, one of them on a `CP` node.

**Steps B and C — replace the remaining two `bulk` replicas, one at a time.**

For each of the two remaining `bulk` replicas — **take the one on the node the volume is NOT
attached to first**, so the engine's own node keeps a local replica for as long as possible:

```bash
kubectl -n longhorn-system delete replicas.longhorn.io <bulk-replica-name>
```

Healthy count drops 4 → 3, which is below `numberOfReplicas: 4`, so Longhorn replenishes onto
the next unused `critical` node. **Minimum healthy replicas during this: 3.**

*Wait for:* `robustness: healthy` and 4 running replicas again, before doing the next one.

**Step D — drop the last `bulk` replica and shrink back to 3.**

Run these two commands **back to back**:

```bash
kubectl -n longhorn-system delete replicas.longhorn.io <last-bulk-replica-name>
kubectl -n longhorn-system patch volumes.longhorn.io "$V" --type=merge \
  -p '{"spec":{"numberOfReplicas":3}}'
```

Between them the volume is briefly `degraded` at 3 healthy against `numberOfReplicas: 4`,
and Longhorn will look for a fourth `critical` node, find none (all three are used) and log a
scheduling failure. That is expected and harmless; the `numberOfReplicas: 3` patch clears it
immediately and the volume returns to `healthy` with exactly the three control-plane replicas.

> **Why this order.** Do **not** patch `numberOfReplicas: 3` while four healthy replicas
> exist: the controller's extra-healthy-replica cleanup would then choose which one to cull,
> and **which one it picks is not verified** — it could remove a control-plane replica and
> leave the `bulk` one. Deleting by name first keeps the choice yours.

**Replica names for the deletions** (verified live 2026-08-22 — **re-read them immediately
before acting**, names change whenever a replica is rebuilt):

| Volume | `bulk` replicas to delete, in order |
| --- | --- |
| `dispatcharr` (attached `fluttershy`) | `…-r-9b1295a0` (hard-hat), `…-r-60f76b67` (kerfuffle), `…-r-4c38a712` (fluttershy) |
| `plex` (attached `kerfuffle`) | `…-r-d459b0c5` (shining-armor), `…-r-47bef0f1` (fluttershy), `…-r-33f357aa` (kerfuffle) |
| `jellyfin` (attached `fluttershy`) | `…-r-d90dbcc1` (shining-armor), `…-r-a4e2f069` (kerfuffle), `…-r-9c1d4987` (fluttershy) |

Re-read with:

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '.items[]|select(.spec.volumeName=="'"$V"'")
   |"\(.metadata.name) node=\(.spec.nodeID) state=\(.status.currentState) hardAff=\(.spec.hardNodeAffinity//"-")"'
```

> **`plex` has a pinned replica.** Its `kerfuffle` replica carries
> `hardNodeAffinity: kerfuffle`, left by `dataLocality: best-effort`. That pin is why it must
> be the **last** one deleted — and it is harmless, because its replacement is created under
> `dataLocality: disabled` and gets no pin.

### 6.3 What to watch during each step

```bash
# rolling status
kubectl -n longhorn-system get volumes.longhorn.io "$V" -w \
  -o custom-columns=ROBUST:.status.robustness,STATE:.status.state,N:.spec.numberOfReplicas

# replica placement + engine modes (all should reach RW)
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '.items[]|select(.spec.volumeName=="'"$V"'")|"\(.spec.nodeID//"-") \(.status.currentState) failedAt=\(.spec.failedAt//"-")"'
kubectl -n longhorn-system get engines.longhorn.io -o json | jq -r \
  '.items[]|select(.spec.volumeName=="'"$V"'")|"engineNode=\(.spec.nodeID) modes=\(.status.replicaModeMap)"'

# THE POD MUST NOT RESTART — this is an online migration
kubectl -n equestria get pods -l app.kubernetes.io/name=<app> -o wide
```

**For `plex` only**, additionally watch the RWX share-manager throughout:

```bash
kubectl -n longhorn-system get sharemanagers.longhorn.io pvc-242324ae-0f5e-4be8-82ce-01afe2d51b53
kubectl -n longhorn-system get pods -l longhorn.io/share-manager=pvc-242324ae-0f5e-4be8-82ce-01afe2d51b53 -o wide
```

Expect `state: running` and **no pod restart**. A share-manager restart would break the NFS
export and disconnect plex; if it happens, stop and reassess before continuing.

### 6.4 Final verification

```bash
kubectl -n longhorn-system get volumes.longhorn.io -o json | jq -r \
  '.items[]|select(.metadata.name|test("242324ae|d49e4972|633d7002"))
   |"\(.metadata.name) n=\(.spec.numberOfReplicas) sel=\(.spec.nodeSelector) dl=\(.spec.dataLocality) rob=\(.status.robustness) state=\(.status.state)"'
```

Expect for all three: `n=3 sel=["critical"] dl=disabled rob=healthy state=attached`.

**The gate that actually matters — simulate the shed on paper and count survivors.** Every
volume must have all three replicas on control planes, and **none** on any `bulk` node:

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '[.items[]|select((.spec.volumeName|test("242324ae|d49e4972|633d7002")) and .spec.nodeID!="" and (.spec.failedAt//"")=="")]
   | group_by(.spec.volumeName)[]
   | "\(.[0].spec.volumeName) survivors=\([.[]|select(.spec.nodeID|test("milky-way|othalla|pegasus"))]|length) onBulk=\([.[]|select(.spec.nodeID|test("fluttershy|kerfuffle|hard-hat|shining-armor"))]|length)"'
```

**Required: `survivors=3 onBulk=0` for all three volumes.**

Also confirm **no ghost replicas** were minted (`dataLocality: disabled` should prevent them
entirely — §8):

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '.items[]|select((.spec.volumeName|test("242324ae|d49e4972|633d7002")) and .spec.nodeID=="")
   |"GHOST \(.metadata.name) hardAff=\(.spec.hardNodeAffinity)"'
# expect: no output
```

### 6.5 Rollback, mid-flight

Every step is reversible and **shrinking is instant** — reducing `numberOfReplicas` deletes
replicas rather than copying anything.

- **Before step D on a given volume**, the original `bulk` replicas that have not yet been
  deleted are still present and healthy. To abort: patch
  `{"spec":{"numberOfReplicas":3,"nodeSelector":["bulk"],"dataLocality":"best-effort"}}` and
  then delete the control-plane replicas by name. The volume returns to its original shape,
  rebuilding onto `bulk` if fewer than three `bulk` replicas remain.
- **After step D**, rollback is a full migration in reverse — same nine rebuilds, same
  ~254 GiB, same runbook with the tags swapped. Not dangerous, just not free.
- **Aborting between volumes is safe.** The three volumes are independent; a half-migrated
  set (say `dispatcharr` on `critical`, the others still on `bulk`) is a perfectly valid
  resting state. There is no ordering dependency between them.
- **Nothing here is one-way**, and none of it touches the PVC, the PV or Git.

### 6.6 ⚠️ Do not overlap a tuppr upgrade window

Per §2, `kubernetes/apps/system-upgrade/upgrades/talos.yaml` gates node drains on
`status.robustness != "degraded"` across **every** volume in `longhorn-system`, with a 15 m
timeout. This migration deliberately makes a volume degraded **nine times**, each for the
duration of one rebuild — and `jellyfin`'s rebuilds are the longest at roughly 6–9 minutes
each, close to that 15 m timeout on their own.

**Before starting:**

```bash
kubectl get talosupgrades.tuppr.home-operations.com -A
# require PHASE=Completed / READY=True — not Progressing, not pending
```

**Verified live 2026-08-22:** the `talos` TalosUpgrade is `PHASE=Completed READY=True`,
44 h old — so there is no upgrade in flight right now.

Also check Renovate has not just merged a Talos or Kubernetes version bump that tuppr will
pick up mid-migration. If an upgrade starts while a rebuild is running, tuppr will stall on
the health check and may fail the upgrade — recoverable, but noisy and confusing.

The inverse also holds permanently: **once plan C is live, these three volumes go degraded
during control-plane maintenance** (a Talos upgrade of `milky-way`/`othalla`/`pegasus`
takes a replica down and there is no fourth `critical` node to rebuild onto). That is the
same trade `longhorn-critical` already makes for all of Tier 1 — plan C adds three volumes to
an existing behaviour rather than creating a new one — but it is the reason control-plane
maintenance belongs in the awake window.

---

## 7. Wall-clock estimate

**Copy volume: ~254 GiB across 9 sequential rebuilds** (§4).

**Throughput, measured on this cluster**, from `spec.healthyAt − metadata.creationTimestamp`
against `status.actualSize`. These are **upper bounds on elapsed time**, so the *faster*
samples are the closer estimate of true rebuild speed. Filtering to rebuilds that **targeted a
control plane** — the disks this migration actually writes to — gives 14 samples:

```
18.2, 40.7, 44.8, 62.7, 64.7, 80.5, 115.7, 119, 160.8, 161.2, 181.1, 326.9, 372.8  MiB/s
median = 119 MiB/s
```

*(A 14th sample reads 2587 MiB/s — 17.69 GiB in 7 s — which is not a full copy and is
excluded; it is almost certainly a `fast-replica-rebuild` checksum diff against retained
data.)* For reference the previously recorded worker-side figures were 122–373 MiB/s, with
**plex's own last rebuild at 23.1 GiB in 195 s = 122 MiB/s** — consistent with the
control-plane median.

> **Useful surprise:** rebuilds onto the Transcend SATA control-plane disks are **not**
> dramatically slower than onto the workers' NVMe. Rebuild is large sequential I/O, where a
> SATA SSD is perfectly adequate; the Transcend's weakness (§3) is per-operation latency,
> which is a *steady-state* problem, not a *migration* problem. The migration is therefore
> cheaper than the disk-latency table would suggest.

**Pure data-movement time:**

| Volume | Bytes copied | @ 181 MiB/s | @ **119 MiB/s** (median) | @ 45 MiB/s (slow tail) |
| --- | --- | --- | --- | --- |
| `dispatcharr` | 4.5 GiB | 25 s | **39 s** | 1.7 min |
| `plex` | 69.6 GiB | 6.6 min | **10 min** | 26 min |
| `jellyfin` | 179.9 GiB | 17 min | **26 min** | 68 min |
| **total** | **254 GiB** | **24 min** | **≈ 36 min** | **≈ 96 min** |

Per individual rebuild that is roughly **13 s** (dispatcharr), **3.3 min** (plex) and
**8.6 min** (jellyfin) at the median rate.

**`concurrent-replica-rebuild-per-node-limit: 2` does not bind this migration.** The volume
controller already serialises to **one rebuild per volume** (§4.6), and the runbook does one
volume at a time, so at most one rebuild is ever in flight. The limit would only matter if
you tried to run all three volumes in parallel, where it would cap you at 2 concurrent
rebuilds per target control plane. **Do not parallelise** — the serial ordering is what keeps
verification meaningful and rollback simple.

**Realistic supervised wall-clock.** Add per-step overhead: replica CR creation, engine
sync, the `robustness` transition settling, and a human verifying each of the 9 steps —
call it 2–4 minutes per step, ~25–35 minutes total.

> **Budget a 2-hour window; reserve 3 hours.** Expect ~36 minutes of actual copying and
> **1.5–2 hours** of supervised elapsed time. `jellyfin` alone is ~70 % of the work and
> should be started with at least an hour left in the window.

**Not verified:** whether a *deleted* (as opposed to *failed*) replica is replaced
immediately or waits out `replica-replenishment-wait-interval: 600` (§4.6). If replacement
turns out to be delayed by 600 s, add **90 minutes** to the total (9 steps × 10 min) — the
copying time is unchanged. **Measure this on the dispatcharr rehearsal**, where the rebuild
itself takes seconds and any wait is obvious.

---

## 8. `dataLocality: disabled`, not `best-effort` (verified live)

`best-effort` asks Longhorn to keep a replica on the node the volume is attached to. Under
plan C the pod is on a media **worker** for most of every day (§3), which is **outside** the
`critical` tag — so the request is **unsatisfiable**, and tags are a hard filter that
`best-effort` cannot override.

What Longhorn does then is not "nothing". It mints a **ghost replica**: `spec.nodeID: ""`,
`status.currentState: stopped`, `spec.hardNodeAffinity` pinned to the node that rejected it,
`rebuildRetryCount` capped at 5, and a permanent
`Scheduled=False / LocalReplicaSchedulingFailure` condition on the volume. Upstream calls
this "tags not fulfilled" ([longhorn#7312](https://github.com/longhorn/longhorn/discussions/7312),
[longhorn#11007](https://github.com/longhorn/longhorn/issues/11007)). It performs no I/O and
cannot serve as a replenishment slot (`spec.nodeID` is empty, and `hardNodeAffinity` pins it
to the one node that rejected it), so it is **cruft, not damage**.

**This is not hypothetical — it is live right now**, on the same two volumes that prove the
remote-read case in §3:

```
pvc-8cfbf411-… (teamarr)   replica: node=""  state=stopped  hardNodeAffinity=milky-way
pvc-4f906258-… (pinepods)  replica: node=""  state=stopped  hardNodeAffinity=othalla
```

both with `Scheduled=False (LocalReplicaSchedulingFailure)` while reporting
`robustness: healthy`. That is precisely what plan C would inherit under `best-effort`, with
the tiers swapped.

**And `best-effort` buys nothing in exchange.** Overnight, when the pod is on a control
plane, locality is **already satisfied** — every control plane holds a replica — so
`best-effort` has nothing left to ask for. Unsatisfiable by day, redundant by night.

**No alert covers any of this.** Grepping the Longhorn rules confirms the alerts are on
`robustness`, actual-space usage, node storage, node-down and CPU — **nothing watches the
`Scheduled` condition**. A `best-effort` choice here would leave three volumes permanently
`Scheduled=False` with three orphan replica CRs and nothing would ever say so.

**Conclusion: `disabled` is correct, and the reasoning holds.** `longhorn-critical` keeps
`best-effort` legitimately — its workloads run **on** the control planes, so for them the
request is satisfiable.

---

## 9. Why a separate class and not `longhorn-critical`

`longhorn-critical` already has `nodeSelector: critical` and `numberOfReplicas: "3"`, so it
would place these volumes identically today. Two reasons not to reuse it:

1. **Different `dataLocality`.** `longhorn-critical` is `best-effort`; `longhorn-media` must
   be `disabled` (§8). The parameter is per-class, so this alone requires a second class.
2. **An independent knob, and an undiluted tier.** `longhorn-critical` means "Tier-0/1 data
   that must survive low-power mode". Media config volumes are **Tier-2 data that happens to
   need the same placement for an unrelated reason** — their GPU-bound pods relocate to the
   control planes. Folding them in would make the critical tier's replica count, capacity
   budget and future placement changes hostage to media config, and would make "what is
   Tier-1?" unanswerable from the class name. Separate classes mean either tier can be
   retuned — replica count, disk selector, a move back to `bulk` when the media workers stop
   being shed — without touching the other.

The class lives in `kubernetes/apps/longhorn-system/storageclass/media.yaml`. That directory
has **no** `kustomization.yaml`, so kustomize-controller auto-generates one over every YAML
file it finds — **`storageclass/ks.yaml` needs no edit.** (`force: true` is already set
there because StorageClass `parameters` are immutable; a brand-new class does not exercise
it.)

```bash
flux -n longhorn-system reconcile kustomization storageclass --with-source
kubectl get sc longhorn-media -o yaml
```

**Creating the class does nothing to the existing volumes.** §6 is what moves them.

Unlike the superseded option B, plan C needs **no new node tag**: `critical` already exists
on all three control planes, so there is **no `talos/talconfig.yaml` edit** and no
tag-before-provision ordering hazard.

---

## 10. The Git side, and the drift it leaves

### 10.1 ⚠️ Editing `storageClassName` in Git DESTROYS these PVCs

**Carried forward from the previous revision — still true, still the most dangerous thing in
this document.**

`PersistentVolumeClaim.spec.storageClassName` is immutable. `kubernetes/components/volsync/
kustomization.yaml` stamps `kustomize.toolkit.fluxcd.io/force: enabled` as a **commonLabel**
on everything it emits, the PVC included. **Verified live** — all three PVCs carry it:

```
plex        sc=longhorn force=enabled size=40Gi
jellyfin    sc=longhorn force=enabled size=60Gi
dispatcharr sc=longhorn force=enabled size=5Gi
```

So adding `VOLSYNC_STORAGECLASS: longhorn-media` to
`kubernetes/apps/equestria/media/{plex,jellyfin}/ks.yaml` or
`kubernetes/apps/equestria/pvr/dispatcharr/ks.yaml` would make Flux hit the immutable-field
conflict and, because `force` is enabled, **delete and recreate the PVC — destroying the
data.** `components/volsync/AGENTS.md` already says it: *"Expanding `VOLSYNC_CAPACITY` is
safe; changing storage class is not."*

`jellyfin/ks.yaml` pins `VOLSYNC_STORAGECLASS: longhorn` explicitly; `plex` and `dispatcharr`
inherit the same default. **Leave all three exactly as they are.** The right record of intent
is a comment in each `ks.yaml` — "on next re-provision, set `VOLSYNC_STORAGECLASS:
longhorn-media`" — not a live substitution. Those files are outside this change's scope and
were not edited.

**The class change in Git is safe only at a deliberate re-provision** (a VolSync restore, a
namespace rebuild, a DR event). **Live migration goes via the Volume CR** (§6), never via the
PVC.

### 10.2 The drift this leaves

The three PVCs will keep saying `storageClassName: longhorn` for as long as they exist, while
their Longhorn volumes run at `longhorn-media`'s parameters. **Say this out loud, because it
is invisible:** anyone reading `kubectl get pvc` will conclude these are ordinary `longhorn`
volumes at 3 replicas on `bulk`. They are not. **The only place the truth lives is the Volume
CR.**

The drift resolves the next time each PVC is re-provisioned from scratch, if
`VOLSYNC_STORAGECLASS` says `longhorn-media` by then.

> **VolSync backups still break overnight.** `VOLSYNC_STAGING_STORAGECLASS` /
> `VOLSYNC_CACHE_SNAPSHOTCLASS` default to `longhorn-snapshot` / `longhorn-cache`, both
> `bulk`, so **the media apps' nightly backups will not run while both workers are shed** —
> no `bulk` node to place the staging clone, and the mover pod needs one too. Plan C makes
> the *data* survive the window; it does not make the *backup* survive it. Fixing that needs
> the media apps pointed at `longhorn-critical-snapshot` / `longhorn-critical-cache`, which
> already exist (`storageclass/critical.yaml`, 1 replica each on `critical`) and which
> [12](12-longhorn-critical-tier.md) created for exactly this reason. Changing those two
> variables **is** safe on a live app — unlike `VOLSYNC_STORAGECLASS`, they only affect the
> next throwaway mover volume. **Not done here**; see open item 4.

---

## 11. Open items

1. ~~**Nothing here has been executed.** §6 is a proposal.~~ **Partly executed as of
   2026-08-22 — see the execution-status box at the top.** `dispatcharr` is through step C;
   `plex` and `jellyfin` have not started. The `longhorn-media` StorageClass itself is live but
   still has no volume provisioned against it — the migration patches existing volumes in place
   rather than reprovisioning through the class (§10.2's drift).
2. **The deleted-vs-failed replenishment timing is unverified** (§4.6, §7). ~~Measure it on the
   `dispatcharr` rehearsal~~ — the rehearsal has now run and the three control-plane replicas
   reached `healthy` about two minutes apart on a 1.51 GiB volume, but the **deletion**
   timestamps were not captured alongside them, so the deleted-vs-failed question is still open.
   Capture both on the `plex` run. It is worth up to 90 minutes of the migration estimate.
3. **Which replica the extra-healthy cleanup culls is unverified** (§6.2 step D). The runbook
   avoids depending on it by deleting by name first. If someone later wants to shorten the
   procedure, that is the thing to verify.
4. **Overnight VolSync backups for the media tier are not addressed** (§10.2). The
   `longhorn-critical-snapshot` / `-cache` classes already exist; pointing the three apps at
   them is a small, separate change.
5. **Steady-state write latency is the thing to watch during the soak** (§3). The
   measurements say "affordable at 4.2 IOPS"; they do not prove Plex library scans feel the
   same afterwards. **`plex` is SQLite and is the most exposed of the three.**
6. **The replica count is coupled to the control-plane count** and nothing guards it. Adding
   a fourth control plane silently reintroduces the nightly rebuild (§2.1): nothing alerts on
   it and the volumes stay `healthy`. A cheap guard is an alert on the eligible-node count,
   or a line in [24](24-power-states.md)'s node-tagging procedure.
7. **Control-plane maintenance now degrades three more volumes** (§6.6). Pre-existing
   behaviour for Tier 1, but the blast radius grew.
8. **The `Scheduled` condition is unmonitored** (§8). `dataLocality: disabled` means plan C
   should never set it, but nothing would tell you if that assumption broke.
9. **The three `volsync-src-*-cache` volumes carrying non-conforming `pegasus` replicas**
   (§4.2) are unrelated cruft this investigation surfaced. Harmless — they are `bulk`-selector
   volumes with a replica on a control plane — but they are evidence that the Tier-2
   `nodeSelector` backfill doc 12 deferred is still outstanding.
