# 30 — Longhorn media tier

Created **2026-08-22**, rewritten twice the same day: first for **plan C**, then — after
[#1053](https://github.com/david-driscoll/home-operations/pull/1053) — for the **`low-power`
node tag**, which is what actually shipped. **Unfiled** — standalone, like
[24](24-power-states.md) through [29](29-taint-readiness-audit.md). Direct sequel to
[12](12-longhorn-critical-tier.md) (which built `longhorn-critical` and the node-tag
machinery) and to [20](20-low-power-tier.md) §9.

Answers one question: **when low-power mode sheds both media workers overnight, how do the
`plex`, `jellyfin` and `dispatcharr` config volumes keep more than one healthy replica?**

> ## The decision: `longhorn-media`, `nodeSelector: low-power`, 3 replicas, `dataLocality: disabled`
>
> **Put the replicas only on nodes that stay powered through the nightly window.** That is
> **five** nodes, not three: the control planes `milky-way`, `othalla` and `pegasus`, plus
> `hard-hat` (stays up for immich's GPU) and `shining-armor` (stays up because it hosts the
> backup volumes). `fluttershy` and `kerfuffle` — the pair that gets shed — are deliberately
> **not** tagged.
>
> Overnight every replica is on a node that is still up, so nothing fails, nothing rebuilds,
> and the volume never leaves `healthy`.
>
> **At least one replica always lands on a control plane, structurally.** The tag covers five
> nodes, only **two** of which are not control planes. `replica-soft-anti-affinity` is `false`
> (§1.2), so at most one replica per node — three replicas cannot fit on two nodes, therefore
> **at least one must be on a control plane**. That is a proof, not a probability, and it is
> what keeps a local replica available to the pod overnight when it relocates to a control
> plane.
>
> **Three replicas across five eligible nodes leaves TWO SPARE**, so Longhorn can rebuild if a
> single eligible node dies. See §6.6 — this is the concrete improvement over the earlier
> `critical`-only shape, which had no spare at all.
>
> **The accepted cost:** by DAY the pods prefer the media workers, so the pod usually runs on
> a node holding no replica and every read and write crosses the network. See §3.

> ### Why not `nodeSelector: critical`?
>
> The first revision of this document chose `critical` — the three control planes — and
> [#1051](https://github.com/david-driscoll/home-operations/pull/1051) shipped the class that
> way. [#1053](https://github.com/david-driscoll/home-operations/pull/1053) replaced it with a
> new `low-power` tag for two reasons:
>
> 1. **It borrowed a tag that means something else.** `critical` means "Tier-0/1 storage
>    tier". Using it here diluted that meaning *and* piled all three media config volumes onto
>    the same three control-plane disks already serving the registry, home-assistant,
>    technitium, mosquitto and tsidp.
> 2. **It was needlessly narrow.** What these volumes actually need is *"a node that stays
>    powered through the nightly Low Power window"*. That property belongs to five nodes, and
>    `critical` names only three of them — throwing away the two spares that make rebuild
>    possible.
>
> **`low-power` is NOT `battery`.** In a real Battery event `hard-hat` **does** go down, so a
> replica there fails and the volume degrades. That is expected and accepted — Battery is an
> emergency, not a nightly routine. See [24](24-power-states.md) for the distinction and
> [20](20-low-power-tier.md) §6 for Battery's node set.

**Two earlier designs are superseded** and are described only where the contrast is
load-bearing: option A (4 replicas on the 4 `bulk` nodes) and option B (5 replicas on a new
`media` tag over the five Intel-QuickSync nodes). Both left the volumes **degraded every
night**, which §2 shows is not cosmetic.

The shipped design **does** need a new node tag, so `talos/talconfig.yaml` was edited —
three edits covering five nodes, because the file uses YAML anchors: the `shining-armor`
block, `&amd_minifm_annotations` (`hard-hat`), and `&nodeAnnotations` (the three control
planes). `&intel_un1290_annotations` (`fluttershy`, `kerfuffle`) was deliberately left alone.

> ⚠️ **`node.longhorn.io/default-node-tags` is read only at Longhorn node CREATION.** The
> talconfig edit is for persistence across a node rebuild; it does **not** retag a running
> node. The live effect came from patching the `nodes.longhorn.io` CRs directly, which has
> been done (§1.1 shows the result).

Everything marked **verified live** was read from `admin@equestria` on **2026-08-22** with
read-only commands, or with `--dry-run=server` patches that run the real admission chain and
mutate nothing. Claims marked **inferred** are reasoning from Longhorn source or semantics,
flagged as such. Longhorn is **v1.12.1**.

> ### ⚠️ Execution status — 2 of 3 DONE, `jellyfin` IN FLIGHT (2026-08-22, last read 18:37 UTC)
>
> ~~**Nothing in this document has been executed.**~~ The scheduling, return-trip and
> StorageClass halves landed with
> [#1051](https://github.com/david-driscoll/home-operations/pull/1051); the `low-power` tag and
> the class repoint landed with
> [#1053](https://github.com/david-driscoll/home-operations/pull/1053). Both are live. §6's
> **volume migration ran the same afternoon** and is nearly complete. Verified live at
> **2026-08-22 18:21 UTC**, `jellyfin` re-read at **18:37**:
>
> | Volume | Live state | Verdict |
> |---|---|---|
> | `dispatcharr` (`pvc-633d7002…`) | `n=3 sel=["low-power"] dl=disabled` · `attached`/**`healthy`** on `fluttershy` · replicas `milky-way`, `othalla`, `pegasus` — all `RW` | **COMPLETE** |
> | `plex` (`pvc-242324ae…`) | `n=3 sel=["low-power"] dl=disabled` · `attached`/**`healthy`** on `kerfuffle` · replicas `milky-way`, `othalla`, **`shining-armor`** — all `RW` | **COMPLETE** |
> | `jellyfin` (`pvc-d49e4972…`) | `n=4 sel=["low-power"] dl=disabled` · `attached`/`degraded` on `fluttershy` · replicas `fluttershy`, `kerfuffle`, `shining-armor` up, `othalla` **rebuilding — 4 % at 18:21, 52 % at 18:37** | **step A in flight**; two stranded replicas (`fluttershy`, `kerfuffle`) still to delete afterwards |
>
> **Until `jellyfin` finishes, do not shed a media worker overnight** — it still holds replicas
> on both, which is exactly §2's problem.
>
> Three things this run established, each written up where it belongs:
>
> - **`shining-armor` replicas did not have to move.** Because `shining-armor` carries the
>   `low-power` tag, `plex`'s and `jellyfin`'s existing replicas there already conform. `plex`
>   is complete having rebuilt **two** replicas, not three, and its `shining-armor` replica
>   (`…-r-d459b0c5`, created **2026-08-13**) was never touched. That is the `critical`→`low-power`
>   change paying for itself in the migration as well as in the steady state — see §4's revised
>   copy table.
> - **Repointing an already-migrated volume from `critical` to `low-power` moves ZERO bytes.**
>   `dispatcharr` was migrated first under the `critical` design onto all three control planes;
>   the repoint to `low-power` was a no-op because `{milky-way, othalla, pegasus}` ⊂ the
>   `low-power` node set. No replica was recreated.
> - **A *deleted* replica is replenished immediately — open item 2 is CLOSED.** See §4.6 and §7
>   for the timestamps.
>
> **Observed rebuild throughput was ~4× slower than §7 estimated** — ~26–33 MiB/s onto the
> control-plane disks against a predicted median of 119 MiB/s. §7 carries the measurements and
> the corrected table.
>
> **On "the app never restarts":** all three pods report **0 restarts**, and all three volumes
> stayed `attached` throughout — the migration is genuinely online, as designed. Do **not**
> read pod *age* as proof of that, though: the three pods date from ~17:47 UTC because the
> `app-template` HelmRelease was flapping between chart 5.0.1 and 5.1.0 that afternoon (six
> `UpgradeSucceeded` events across the three apps between 18:02 and 18:16), which is unrelated
> to this migration and would have recreated the pods regardless.
>
> The replica names in §6.2's deletion table are from before this run and are stale by
> construction. Re-read them with the command underneath it, as that section already says.

---

## 1. Starting state (verified live, **before** the migration)

> This table is the **pre-migration** snapshot, kept because every number downstream is
> derived from it. For where the volumes are **now**, see the execution-status box above.

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

### 1.1 Node tags (verified live, **after** #1053)

```
fluttershy    ["bulk"]                 kerfuffle ["bulk"]
hard-hat      ["bulk", "low-power"]    shining-armor ["bulk", "low-power"]
milky-way     ["critical", "low-power"]
othalla       ["critical", "low-power"]
pegasus       ["critical", "low-power"]
```

**`low-power` covers five nodes; `fluttershy` and `kerfuffle` carry only `bulk`.** The change
is **purely additive** — every pre-existing `bulk` and `critical` selector still matches
exactly what it matched before, because a node's tag list is a set and nothing was removed.

The three tiers now read:

| Tag | Nodes | Means |
| --- | --- | --- |
| `bulk` | fluttershy, hard-hat, kerfuffle, shining-armor | the four workers — the default tier |
| `critical` | milky-way, othalla, pegasus | **Tier-0/1 storage tier** ([12](12-longhorn-critical-tier.md)) |
| `low-power` | milky-way, othalla, pegasus, hard-hat, shining-armor | **stays powered through the nightly 02:00–09:00 window** |

`critical` is a strict **subset** of `low-power`, which is why `longhorn-critical`'s volumes
also survive the window — but the two tags answer different questions and are kept apart on
purpose (§9).

`nodeSelector` is a **hard AND filter over tags** — `getDiskCandidates` in
`scheduler/replica_scheduler.go`:

```go
// Filter Nodes. If the Nodes don't match the tags, don't bother marking them as candidates.
if !types.IsSelectorsInTags(node.Spec.Tags, volume.Spec.NodeSelector, allowEmptyNodeSelectorVolume) {
    continue
}
```

So a class names exactly one tier; `"bulk,critical"` matches nothing. That is precisely why
`low-power` had to be a **new tag** rather than a selector expression over the existing two —
there is no way to write `critical ∪ (bulk ∩ {hard-hat, shining-armor})`.

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

Under the shipped design nothing is degraded overnight, so neither tooth bites. **Verified
live:** `kubectl get talosupgrades.tuppr.home-operations.com` reported the `talos` upgrade
`PHASE=Completed READY=True`, and `0` volumes were degraded cluster-wide when the migration
began. (The one degraded volume visible at 18:21 UTC is `jellyfin` itself, mid-rebuild —
§6.6 is why that window must not overlap a tuppr upgrade.)

### 2.1 The churn rule, restated correctly

The old designs had to engineer around `replica-replenishment-wait-interval` (600 s). From
`getCurrentNodesAndZones()` in `replica_scheduler.go`, a failed replica stops occupying its
node once `creatingNewReplicasForReplenishment` is set — i.e. once the 600 s wait expires —
at which point the shed nodes re-enter the candidate pool, are found unschedulable (powered
off), and any *other* eligible-but-empty node gets a full rebuild.

**The rule, stated correctly: replenishment needs a REPLICA TO FAIL. It is triggered by a
deficit (`usableCount < numberOfReplicas`), not by the existence of an empty eligible node.**
An awake, tag-eligible node holding no replica is a *destination* for churn; it is not a
*cause* of it.

> ⚠️ **Correction.** The `critical`-era revision of this section stated the rule as *"churn
> happens if and only if there is at least one tag-eligible node that is still awake and does
> not already hold a live replica."* That was a necessary condition dressed up as a sufficient
> one, and it only looked right because the `critical` design had **zero** spare eligible
> nodes, so both halves were false together. Under `low-power` there are **two** spare
> eligible nodes and still **no nightly churn**, because the shed causes no failure.

Under the shipped design no replica sits on `fluttershy` or `kerfuffle`, so the shed takes
nothing down, `usableCount` stays at 3, `getReplenishReplicaCount()` returns `0`, and the
scheduler is never consulted. **The two spare nodes are irrelevant overnight** — and load-
bearing during an *outage*, which is exactly the asymmetry the design wants (§6.6).

---

## 3. The accepted cost: remote reads by day

The three apps carry a **soft** nodeAffinity preferring the media workers (stronger Iris Xe
iGPU) and a **hard** one requiring an Intel iGPU. So by day the pod sits on `fluttershy` or
`kerfuffle` — neither of which is `low-power`-tagged, so **neither can ever hold a replica of
these volumes.** The engine runs on the worker and every read and write crosses the network.

That cost is unchanged by the move from `critical` to `low-power`: the two nodes the pods
prefer by day are exactly the two nodes the tag excludes. What *did* change is that the
daytime remote hop can now terminate on `hard-hat` or `shining-armor` as well as on a control
plane.

**This shape is already running healthy in this cluster, in mirror image** (verified live):

| Volume | PVC | Attached to | Replicas on | Robustness | Engine replica modes |
| --- | --- | --- | --- | --- | --- |
| `pvc-8cfbf411-185d-4e9e-8b33-07a12bd66372` | `teamarr` | **`milky-way`** (CP) | `fluttershy`, `hard-hat`, `kerfuffle` (all `bulk`) | `healthy` | 3 × `RW` |
| `pvc-4f906258-9fd8-4a94-bdca-e24bb44ff34d` | `pinepods` | **`othalla`** (CP) | `fluttershy`, `hard-hat`, `kerfuffle` (all `bulk`) | `healthy` | 3 × `RW` |

Both have their engine on a node holding **zero** replicas and both are fully healthy. That
is this design's day-state with the tiers swapped, and it is the empirical answer to "is
remote read viable here".

Measured 7-day load on the three media volumes is **4.2 write IOPS / ~52 KB/s combined**,
with **~0 reads** (the page cache absorbs them), so there is very little traffic to make
remote in the first place.

**What to watch after cutover.** The control-plane Longhorn disks are Transcend
TS1TMTS425S M.2 SATA (54–75 ms mean write latency over 7d) against the workers' Samsung
990 EVO Plus NVMe (0.5–11 ms). Longhorn v1 acks a write only once **every** replica has it,
so a volume is only as fast as its slowest replica. Under `low-power` a replica may land on
`hard-hat` or `shining-armor` — both workers, both NVMe — but **at least one replica is always
on a control plane** (the structural guarantee above), so these volumes still inherit the
Transcend's write latency **24/7**, not just overnight, and now with a network hop on top for
most of the day. The wider tag does **not** buy back steady-state latency; it buys rebuild
headroom. At 4.2 IOPS that is affordable, but the risk is
**per-operation latency, not throughput**, and **`plex`'s config is SQLite** — library scans
and metadata refreshes are fsync-bursty and serialised. **`plex` is the most
latency-sensitive of the three and is the thing to watch after cutover.** If it disappoints,
the rollback in §6.5 is cheap.

---

## 4. THE MIGRATION — the hard part

Under the superseded designs the migration was small: `numberOfReplicas` went up, and
Longhorn added one or two replicas to nodes that had none. Here **every replica on a node
that is not `low-power`-tagged must move** — and only those.

**This is where the `critical` → `low-power` change pays for itself a second time.** Under
`critical` the target set was `{milky-way, othalla, pegasus}` and current placement was
**disjoint** from it, so all nine replicas had to be rebuilt. Under `low-power` the target set
also contains `hard-hat` and `shining-armor`, and **three of the nine existing replicas
already sit on those two nodes** — so they conform as they stand and are never touched:

| Volume | Starting replicas | Already conforming | Must move | Bytes copied |
| --- | --- | --- | --- | --- |
| `dispatcharr` | fluttershy, **hard-hat**, kerfuffle | 1 (`hard-hat`) | **2** | 2 × 1.51 = **3.0 GiB** |
| `plex` | fluttershy, kerfuffle, **shining-armor** | 1 (`shining-armor`) | **2** | 2 × 23.19 = **46.4 GiB** |
| `jellyfin` | fluttershy, kerfuffle, **shining-armor** | 1 (`shining-armor`) | **2** | 2 × 59.96 = **119.9 GiB** |
| | | | **6** | **≈ 169 GiB** |

> ⚠️ The logical data is ~85 GiB, but **six** replicas are rebuilt, so **~169 GiB moves** —
> down from the **nine** rebuilds and **~254 GiB** the `critical` design would have cost.

**What actually happened, verified live** (execution-status box): `plex` and `jellyfin` did
exactly this — two rebuilds each, `shining-armor` untouched. `dispatcharr` did **not**: it was
migrated first, under the `critical` design, before #1053 landed, so all three of its replicas
were rebuilt onto control planes. The subsequent repoint from `critical` to `low-power` moved
**zero bytes**, because `{milky-way, othalla, pegasus}` is a subset of the `low-power` node
set and `getReplenishReplicaCount()` therefore still returned `0` (§4.2). Total actually
copied: **3 × 1.51 + 2 × 23.19 + 2 × 59.96 ≈ 175 GiB.**

### 4.1 Q1 — can `spec.nodeSelector` be patched live? **Yes.** (verified)

`spec.numberOfReplicas`, `spec.nodeSelector` and `spec.dataLocality` are plain, mutable
fields on `volumes.longhorn.io`, and `longhorn-webhook-validator` accepts changing them on an
**attached, healthy** volume. **Verified live** with server-side dry-run (full admission
chain, mutates nothing) on **all three** volumes:

```bash
kubectl -n longhorn-system patch volumes.longhorn.io <vol> --type=merge \
  -p '{"spec":{"numberOfReplicas":3,"nodeSelector":["low-power"],"dataLocality":"disabled"}}' \
  --dry-run=server
```

| Volume | Access mode | Result |
| --- | --- | --- |
| `pvc-633d7002-…` (dispatcharr) | RWO | `n=3 sel=[…] dl=disabled` — **accepted** |
| `pvc-242324ae-…` (plex) | **RWX** | `n=3 sel=[…] dl=disabled` — **accepted** |
| `pvc-d49e4972-…` (jellyfin) | RWO | `n=3 sel=[…] dl=disabled` — **accepted** |

The `n=4` variant used by the runbook (§6) was dry-run separately and is **also accepted on
all three**.

*(The dry-runs above were originally taken with `nodeSelector: ["critical"]`, before #1053.
They have since been **superseded by real execution**: all three volumes were patched for
real, live, attached and healthy, and all three now read `sel=["low-power"]`. The webhook
does not inspect tag membership at all, so the selector value was never what it was checking.)*

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

**This is the finding that makes the migration manual.** Changing `nodeSelector` on a
volume whose replica count is already satisfied causes Longhorn to do **nothing at all**.

**Source — Longhorn `v1.12.x`, `controller/volume_controller.go`.** Rebuilds are driven by
`replenishReplicas()`, which calls `getReplenishReplicaCount()`. That function counts
replicas that are **usable** — roughly, `r.Spec.FailedAt == "" && r.Spec.NodeID != ""` — and
returns `v.Spec.NumberOfReplicas - usableCount`. **It compares a COUNT against
`numberOfReplicas`. It never asks whether a replica's node still satisfies the volume's
tags.** The tag filter (`IsSelectorsInTags`, §1.1) lives one layer down in the *scheduler*
and only runs when a **new** replica is being placed. No new replica is created, so the
filter is never consulted, so the stale replicas are never noticed.

Concretely: 3 healthy replicas, `numberOfReplicas: 3` → replenish count `0` → the volume
stays `healthy` with all three replicas on non-conforming nodes **indefinitely**. The patch
appears to succeed and changes nothing observable.

**This was confirmed a second time, from the opposite direction, during execution.** Repointing
`dispatcharr` from `nodeSelector: ["critical"]` to `["low-power"]` after its replicas were
already on control planes moved **zero bytes and created no replica CR** — the same
count-only logic that refuses to notice a *violating* replica equally refuses to notice that
the eligible set just got *bigger*. Nothing is re-evaluated either way.

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
pvc-399ec4a9-… (volsync-src-tautulli-cache)  sel=["bulk"]  replica on pegasus (tags=critical,low-power)
pvc-6c707c13-… (volsync-src-searxng-cache)   sel=["bulk"]  replica on pegasus (tags=critical,low-power)
pvc-d37bf17f-… (volsync-src-n8n-cache)       sel=["bulk"]  replica on pegasus (tags=critical,low-power)
```

The provenance is exactly this scenario in miniature. Their PVs record
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

**Note the difference from a *failed* replica. ✅ ANSWERED — a deleted replica does NOT wait
out the 600 s interval.** `replica-replenishment-wait-interval: 600` delays replacement of
replicas with `failedAt` set (the powered-off-node case). A **deleted** replica has no
`failedAt` — it is simply gone from the set — so replacement is immediate.

**Verified live, empirically, on the 2026-08-22 run.** From `metadata.creationTimestamp` and
`spec.healthyAt` on the replicas Longhorn actually created, the gap between one replacement
reaching `healthy` and the *next* replacement being created was:

```
dispatcharr  17:47:56 healthy → 17:48:56 created   = 60 s
dispatcharr  17:50:01 healthy → 17:50:16 created   = 15 s
plex         18:05:45 healthy → 18:06:45 created   = 60 s
```

**15–60 s, never ~600 s.** (The gap is the operator's own reaction time between steps, not a
Longhorn wait — the 15 s sample is the floor it can be pushed to.) This closes open item 2 and
removes the contingent **+90 minutes** from §7's estimate.

---

## 5. Capacity — do the eligible nodes have room? (verified live)

Longhorn schedules against `storageMaximum × over-provisioning%` and refuses to go below
`storage-minimal-available-percentage`.

The table below is the **worst case**: all three volumes landing on the same control plane,
adding **105 GiB scheduled** (spec sizes 40 + 60 + 5) and **~85 GiB actual**. Under
`nodeSelector: critical` that worst case was also the *only* case — three replicas over
exactly three nodes has one valid placement, so every control plane took all three volumes.
**Under `low-power` it is genuinely a worst case**: five eligible nodes and three replicas
means the load spreads, and no node is guaranteed to take all three. So this table is now
conservative rather than exact, and it was already comfortable.

| Node | max | avail now | sched now | sched after (+105) | avail after (−85) | usage after |
| --- | --- | --- | --- | --- | --- | --- |
| `milky-way` | 930 GiB | 793 GiB | 491 GiB | 596 GiB | 708 GiB | **23 %** |
| `othalla` | 930 GiB | 813 GiB | 349 GiB | 454 GiB | 728 GiB | **21 %** |
| `pegasus` | 930 GiB | 780 GiB | 654 GiB | 759 GiB | 695 GiB | **25 %** |

Over-provisioning limit is `930 × 6 = 5585 GiB` — not close. Minimum available is
`930 × 5 % = 46 GiB` — not close. `LonghornNodeStorageWarning` fires above **80 %** usage;
the worst case lands at **25 %**. **Capacity is not a constraint.**

`hard-hat` and `shining-armor` are the other two eligible nodes. `hard-hat` already carries
**79** replicas (§4.4) and `shining-armor` **26**, so `shining-armor` is the roomier of the
two; neither was anywhere near a limit during the migration, and in practice the only
`low-power` worker that ended up holding a media replica was `shining-armor` — because it
already held one and never had to move it.

---

## 6. The migration runbook — do NOT execute unattended

**Method: grow-then-shrink.** Rather than deleting a replica and letting the volume run at
two copies while it rebuilds, temporarily set `numberOfReplicas: 4`. Every intermediate state
then holds **at least three** healthy replicas — comfortably better than the "never below 2"
bar — for the same rebuilds and the same total copy volume.

Why the obvious alternative is worse: patching to `nodeSelector: ["low-power"]` and simply
deleting one replica at a time works, but the volume sits at **2** healthy replicas during
each rebuild. Grow-then-shrink costs one extra patch per volume and never does.

Why you cannot just "add replicas first, then drop the old ones" without setting the selector:
there is no way to express `bulk ∪ low-power` — tags are a hard **AND** (§1.1). With an empty
selector the scheduler would pick by free space and could place a new replica right back on
`fluttershy` or `kerfuffle`. `numberOfReplicas: 4` **with** `nodeSelector: ["low-power"]` is
what makes each new replica land on a node that survives the window.

> **Two replicas per volume, not three.** Because `hard-hat` and `shining-armor` are
> `low-power`-tagged, a replica already sitting on either of them **conforms and must not be
> deleted** (§4). For `plex` and `jellyfin` that means the `shining-armor` replica stays and
> only two rebuilds are needed; for `dispatcharr` the `hard-hat` replica would have stayed had
> it not already been migrated under the old `critical` design.
>
> ⚠️ **This is the single most important difference from the `critical`-era runbook**, which
> told you to delete all three. Deleting a conforming replica costs a needless full rebuild —
> 23 GiB for `plex`, 60 GiB for `jellyfin` — and buys nothing.

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

# 4. All FIVE low-power nodes tagged, schedulable and with room (§5).
#    Expect: milky-way/othalla/pegasus = [critical low-power];
#            hard-hat/shining-armor    = [bulk low-power];
#            fluttershy/kerfuffle      = [bulk]   <- NOT tagged, by design
kubectl -n longhorn-system get nodes.longhorn.io \
  -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags,SCHED:.spec.allowScheduling,EVICT:.spec.evictionRequested

# 5. NOT inside the low-power window (02:00-09:00) — you want the workers awake so
#    the source replicas are all available to read from.
```

### 6.2 Per-volume procedure

Run it **one volume at a time**, in this order — **`dispatcharr` first as a cheap
rehearsal** (1.5 GiB, about a minute per replica), then `plex`, then `jellyfin` last.

Let `V` be the volume. Call a replica **stranded** if it sits on `fluttershy` or `kerfuffle`
(the untagged pair) and **conforming** if it sits on any of the five `low-power` nodes.
**Only stranded replicas get deleted.** For all three volumes that is exactly **two**.

**Step A — grow onto a `low-power` node.**

```bash
kubectl -n longhorn-system patch volumes.longhorn.io "$V" --type=merge \
  -p '{"spec":{"numberOfReplicas":4,"nodeSelector":["low-power"],"dataLocality":"disabled"}}'
```

Longhorn now has 3 usable replicas against `numberOfReplicas: 4` → replenish 1 → the
scheduler filters candidates to `low-power`-tagged nodes that do not already hold a replica of
this volume → the new replica lands on one of them. The volume reads `degraded` while it
rebuilds (3 healthy < 4), then returns to `healthy` at 4.

*Wait for:* `robustness: healthy` **and** 4 running replicas, the new one on a `low-power`
node.

**Step B — replace the first stranded replica.**

Take the stranded replica on the node the volume is **NOT** attached to first, so the engine's
own node keeps a local replica for as long as possible:

```bash
kubectl -n longhorn-system delete replicas.longhorn.io <stranded-replica-name>
```

Healthy count drops 4 → 3, which is below `numberOfReplicas: 4`, so Longhorn replenishes onto
the next `low-power` node that has no replica of this volume. **Minimum healthy replicas
during this: 3.**

*Wait for:* `robustness: healthy` and 4 running replicas again.

**Step C — drop the last stranded replica and shrink back to 3.**

Run these two commands **back to back**:

```bash
kubectl -n longhorn-system delete replicas.longhorn.io <last-stranded-replica-name>
kubectl -n longhorn-system patch volumes.longhorn.io "$V" --type=merge \
  -p '{"spec":{"numberOfReplicas":3}}'
```

> ⚠️ **"Back to back" means it, and it matters MORE than it did under `critical`.** Between
> the two commands the volume is `degraded` at 3 healthy against `numberOfReplicas: 4`.
>
> Under the old `critical` design Longhorn would look for a fourth eligible node, **find
> none**, and simply log a scheduling failure — harmless, and the shrink patch cleared it.
>
> **Under `low-power` there are two spare eligible nodes, so Longhorn WILL find one** and
> start a real fourth rebuild — a needless full copy (up to 60 GiB for `jellyfin`), after
> which the shrink patch culls *some* replica of the controller's choosing (open item 3).
> Have the second command ready to paste. If a fourth rebuild does start, it is wasteful but
> not dangerous: let it finish, then delete the replica you do not want by name and re-patch.

> **Why this order.** Do **not** patch `numberOfReplicas: 3` while four healthy replicas
> exist: the controller's extra-healthy-replica cleanup would then choose which one to cull,
> and **which one it picks is not verified** — it could remove a conforming replica and leave
> the stranded one. Deleting by name first keeps the choice yours.

**Replica names for the deletions.** The `critical`-era table that used to sit here listed
**three** replicas per volume and is deleted, because under `low-power` two of the nine
entries it named — `plex`'s `…-r-d459b0c5` and `jellyfin`'s `…-r-d90dbcc1`, both on
`shining-armor` — **conform and must NOT be deleted.** Following it would have cost two
needless rebuilds.

Only replicas on `fluttershy` and `kerfuffle` are stranded. The remaining live example, as of
2026-08-22 18:21 UTC:

| Volume | Stranded replicas to delete, in order | Leave alone |
| --- | --- | --- |
| `dispatcharr` | *(none — complete)* | all three |
| `plex` | *(none — complete)* | all three, incl. `…-r-d459b0c5` on `shining-armor` |
| `jellyfin` (attached `fluttershy`) | `…-r-a4e2f069` (kerfuffle), then `…-r-9c1d4987` (fluttershy) | `…-r-d90dbcc1` (**shining-armor — conforms**), `…-r-b37dec84` (othalla) |

**Re-read the names immediately before acting** — they change whenever a replica is rebuilt.
The command below prints the node for each, which is the only thing you need: delete it if and
only if the node is `fluttershy` or `kerfuffle`.

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '.items[]|select(.spec.volumeName=="'"$V"'")
   |"\(.metadata.name) node=\(.spec.nodeID) state=\(.status.currentState) hardAff=\(.spec.hardNodeAffinity//"-")"'
```

> **`plex` had a pinned replica.** Its `kerfuffle` replica carried
> `hardNodeAffinity: kerfuffle`, left by `dataLocality: best-effort`. That pin is why it had to
> be the **last** one deleted — and it was harmless, because its replacement was created under
> `dataLocality: disabled` and got no pin. **Verified live post-migration:** none of `plex`'s
> three replicas carries a `hardNodeAffinity`, and no ghost replica was minted.

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

Expect for all three: `n=3 sel=["low-power"] dl=disabled rob=healthy state=attached`.

**The gate that actually matters — simulate the shed on paper and count survivors.** Every
volume must have all three replicas on `low-power` nodes, and **none** on `fluttershy` or
`kerfuffle` — the only two nodes the shed takes down:

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '[.items[]|select((.spec.volumeName|test("242324ae|d49e4972|633d7002")) and .spec.nodeID!="" and (.spec.failedAt//"")=="")]
   | group_by(.spec.volumeName)[]
   | "\(.[0].spec.volumeName) survivors=\([.[]|select(.spec.nodeID|test("milky-way|othalla|pegasus|hard-hat|shining-armor"))]|length) onShed=\([.[]|select(.spec.nodeID|test("fluttershy|kerfuffle"))]|length) onCP=\([.[]|select(.spec.nodeID|test("milky-way|othalla|pegasus"))]|length)"'
```

**Required: `survivors=3 onShed=0` for all three volumes**, and `onCP>=1` — which cannot fail
while `replica-soft-anti-affinity` is `false` (the structural guarantee at the top), but is
worth printing because it is the whole reason three replicas is enough.

**Verified live 2026-08-22 18:21 UTC:** `dispatcharr` `survivors=3 onShed=0 onCP=3`, `plex`
`survivors=3 onShed=0 onCP=2`. `jellyfin` is mid-migration and still reads `onShed=2`.

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

- **Before step C on a given volume**, the original stranded replicas that have not yet been
  deleted are still present and healthy. To abort: patch
  `{"spec":{"numberOfReplicas":3,"nodeSelector":["bulk"],"dataLocality":"best-effort"}}` and
  then delete the new replicas by name. The volume returns to its original shape, rebuilding
  onto `bulk` if fewer than three `bulk` replicas remain.
- **After step C**, rollback is a migration in reverse — but a *cheaper* one than the
  `critical` design would have needed, because a replica on `hard-hat` or `shining-armor` is
  already `bulk`-conformant and stays put. Not dangerous, just not free.
- **Aborting between volumes is safe.** The three volumes are independent; a half-migrated
  set (say `dispatcharr` on `low-power`, the others still on `bulk`) is a perfectly valid
  resting state. There is no ordering dependency between them.
- **Nothing here is one-way**, and none of it touches the PVC, the PV or Git.

### 6.6 ⚠️ Do not overlap a tuppr upgrade window

Per §2, `kubernetes/apps/system-upgrade/upgrades/talos.yaml` gates node drains on
`status.robustness != "degraded"` across **every** volume in `longhorn-system`, with a 15 m
timeout. This migration deliberately makes a volume degraded **six times**, each for the
duration of one rebuild — and at the throughput actually measured (§7) **`jellyfin`'s rebuilds
run ~34 minutes each, comfortably PAST that 15 m timeout on their own.**

**Before starting:**

```bash
kubectl get talosupgrades.tuppr.home-operations.com -A
# require PHASE=Completed / READY=True — not Progressing, not pending
```

**Verified live 2026-08-22:** the `talos` TalosUpgrade was `PHASE=Completed READY=True`,
44 h old, when the migration began — so there was no upgrade in flight.

Also check Renovate has not just merged a Talos or Kubernetes version bump that tuppr will
pick up mid-migration. If an upgrade starts while a rebuild is running, tuppr will stall on
the health check and may fail the upgrade — recoverable, but noisy and confusing.

### 6.7 What happens when an eligible node dies — CORRECTED for `low-power`

> ⚠️ **The `critical`-era revision of this document stated as fact that "there is no fourth
> `critical` node to rebuild onto", so these volumes would sit degraded until the node
> returned. Under `low-power` that is FALSE, and its being false is the main operational
> improvement #1053 bought.**

Three replicas over **five** eligible nodes leaves **two spare**. If one eligible node goes
down — a Talos upgrade, a crash, a control-plane rotation — the replica there gets `failedAt`
set, and once `replica-replenishment-wait-interval` (600 s) expires Longhorn **rebuilds onto
one of the spares**. The volume heals itself instead of waiting for the node to come back.
Under `critical` there was nowhere to rebuild to, so the volume was **stranded degraded** for
the entire outage.

Two honest qualifications, so this is not oversold:

1. **It still goes degraded first.** Self-healing is not no-impact: the volume is `degraded`
   for at least the 600 s wait plus one full rebuild. For `jellyfin` at measured throughput
   that is ~44 minutes, **well past tuppr's 15 m gate**, so a control-plane Talos upgrade will
   still stall the drain of the next node. The improvement is that it *ends on its own*, not
   that it stops happening.
2. **A second simultaneous failure is not covered.** Two eligible nodes down leaves one spare
   and one rebuild; three down leaves no spare at all.

Control-plane maintenance therefore still belongs in the awake window — but for a shorter
reason than before.

---

## 7. Wall-clock estimate — and what it actually cost

> ### ⚠️ The estimate below was WRONG by about 4×. Measured first, then the original.
>
> **Measured on the real 2026-08-22 run**, from `metadata.creationTimestamp` to
> `spec.healthyAt` on the replicas Longhorn created:
>
> | Rebuild | Target | Bytes | Elapsed | Throughput |
> | --- | --- | --- | --- | --- |
> | `dispatcharr` → `othalla` | CP | 1.65 GiB | 17:46:53 → 17:47:56 = **63 s** | **26.8 MiB/s** |
> | `dispatcharr` → `milky-way` | CP | 1.65 GiB | 17:48:56 → 17:50:01 = **65 s** | **26.0 MiB/s** |
> | `dispatcharr` → `pegasus` | CP | 1.65 GiB | 17:50:16 → 17:51:21 = **65 s** | **26.0 MiB/s** |
> | `plex` → `othalla` | CP | 23.07 GiB | 17:52:04 → 18:05:45 = **821 s** | **28.8 MiB/s** |
> | `plex` → `milky-way` | CP | 23.07 GiB | 18:06:45 → 18:18:40 = **715 s** | **33.0 MiB/s** |
> | `jellyfin` → `othalla` | CP | 59.95 GiB | 18:19:18 → **52 % at 18:36:37** (1039 s) | **30.7 MiB/s**, in flight |
>
> **~26–33 MiB/s, not the 119 MiB/s median predicted below.** Whatever the historical
> `healthyAt − creationTimestamp` samples were measuring, they were not this. Two candidate
> explanations, neither verified: the fast samples may have been `fast-replica-rebuild`
> checksum diffs against retained data rather than full copies (§7 already excluded one
> obvious 2587 MiB/s case on exactly those grounds, and may not have excluded enough of
> them), or the live workload during a supervised daytime migration competes for the Transcend
> SATA disks in a way an idle historical rebuild did not.
>
> **Use ~30 MiB/s for planning.** At that rate `jellyfin`'s two rebuilds are ~34 minutes each,
> and the whole six-rebuild migration is **~1 h 36 m of pure copying**, not 36 minutes. In
> practice `dispatcharr` + `plex` took **32 minutes wall-clock end to end** (17:46 → 18:18),
> and `jellyfin` alone is expected to take longer than both together.

**Original estimate, left in place because the *method* is sound and only the input rate was
bad. Copy volume: ~169 GiB across 6 sequential rebuilds** (§4 — the `critical`-era figure of
254 GiB across 9 is superseded).

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

| Volume | Bytes copied | @ 119 MiB/s (predicted median) | @ **30 MiB/s** (MEASURED) |
| --- | --- | --- | --- |
| `dispatcharr` | 3.0 GiB (2 rebuilds) | 26 s | **1.7 min** |
| `plex` | 46.4 GiB (2 rebuilds) | 6.7 min | **26 min** |
| `jellyfin` | 119.9 GiB (2 rebuilds) | 17 min | **68 min** |
| **total** | **169 GiB (6 rebuilds)** | **24 min** | **≈ 1 h 36 m** |

Per individual rebuild, at the **measured** rate: **~1 min** (dispatcharr), **~13 min**
(plex), **~34 min** (jellyfin). The predicted-median column is kept only to show the size of
the miss.

**`concurrent-replica-rebuild-per-node-limit: 2` does not bind this migration.** The volume
controller already serialises to **one rebuild per volume** (§4.6), and the runbook does one
volume at a time, so at most one rebuild is ever in flight. The limit would only matter if
you tried to run all three volumes in parallel, where it would cap you at 2 concurrent
rebuilds per target node. **Do not parallelise** — the serial ordering is what keeps
verification meaningful and rollback simple.

**Realistic supervised wall-clock.** Add per-step overhead: replica CR creation, engine
sync, the `robustness` transition settling, and a human verifying each of the 9 steps —
call it 2–4 minutes per step, ~25–35 minutes total.

> **Budget a 3-hour window; reserve 4.** At the measured rate expect **~1 h 36 m of actual
> copying** plus per-step overhead. `jellyfin` alone is ~71 % of the work and should be
> started with at least 90 minutes left in the window. The original "budget 2 hours" advice
> was based on the 119 MiB/s figure and is too tight.

**✅ Resolved — the 600 s contingency does not apply.** Whether a *deleted* (as opposed to
*failed*) replica waits out `replica-replenishment-wait-interval: 600` is now answered: **it
does not** (§4.6, with timestamps). The speculative **+90 minutes** is removed from the
estimate. What replaced it as the dominant error was the throughput miss above, which is
larger.

---

## 8. `dataLocality: disabled`, not `best-effort` (verified live)

`best-effort` asks Longhorn to keep a replica on the node the volume is attached to. The pods
sit on `fluttershy` or `kerfuffle` for most of every day (§3) — the two nodes that are
**outside** the `low-power` tag by construction — so the request is **unsatisfiable**, and
tags are a hard filter that `best-effort` cannot override. Widening the tag from `critical` to
`low-power` does not help: the widening added `hard-hat` and `shining-armor`, not the two
nodes the pods actually prefer.

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
`robustness: healthy`. That is precisely what these volumes would inherit under
`best-effort`, with the tiers swapped.

**And `best-effort` buys little in exchange.** Overnight the pod relocates to a control plane,
and **at least one replica is always on a control plane** (the structural guarantee at the
top) — so locality is usually already satisfied and `best-effort` has nothing left to ask for.
It is *not* guaranteed: with 3 replicas over 5 eligible nodes the pod could land on the one
control plane holding no replica. But the fix for that would be a remote read on an idle
overnight volume, against the certainty of a permanently `Scheduled=False` condition and a
ghost replica CR by day. **`disabled` is still the right trade.**

**Verified live post-migration:** none of the three volumes has a ghost replica
(`spec.nodeID: ""`), and `jellyfin`'s `Scheduled` condition reads `True`.

**No alert covers any of this.** Grepping the Longhorn rules confirms the alerts are on
`robustness`, actual-space usage, node storage, node-down and CPU — **nothing watches the
`Scheduled` condition**. A `best-effort` choice here would leave three volumes permanently
`Scheduled=False` with three orphan replica CRs and nothing would ever say so.

**Conclusion: `disabled` is correct, and the reasoning survives the tag change.**
`longhorn-critical` keeps `best-effort` legitimately — its workloads run **on** the control
planes, so for them the request is satisfiable.

---

## 9. Why a separate class and not `longhorn-critical`

`longhorn-critical` has `nodeSelector: critical` and `numberOfReplicas: "3"`. That is now a
strict **subset** of `longhorn-media`'s five eligible nodes, so it would no longer even place
these volumes identically. Three reasons not to reuse it:

1. **Different `dataLocality`.** `longhorn-critical` is `best-effort`; `longhorn-media` must
   be `disabled` (§8). The parameter is per-class, so this alone requires a second class.
2. **Different node set, for a different reason.** `critical` answers *"where must Tier-0/1
   data live?"*; `low-power` answers *"which nodes stay powered overnight?"*. They happen to
   overlap, but they are not the same question and will not stay in sync — `hard-hat` is
   `low-power` because of immich's GPU and `shining-armor` because of the backup volumes,
   neither of which has anything to do with Tier-1 data.
3. **An independent knob, and an undiluted tier.** `longhorn-critical` means "Tier-0/1 data
   that must survive low-power mode". Media config volumes are **Tier-2 data that happens to
   need power continuity for an unrelated reason**. Folding them in would make the critical
   tier's replica count, capacity budget and future placement changes hostage to media config,
   and would pile all three onto the same three control-plane disks already serving the
   registry, home-assistant, technitium, mosquitto and tsidp. Separate classes mean either
   tier can be retuned — replica count, disk selector, a move back to `bulk` when the media
   workers stop being shed — without touching the other.

The class lives in `kubernetes/apps/longhorn-system/storageclass/media.yaml`. That directory
has **no** `kustomization.yaml`, so kustomize-controller auto-generates one over every YAML
file it finds — **`storageclass/ks.yaml` needs no edit.**

> ### ✅ `force: true` works — verified live, and this is the mechanism every future class-parameter change depends on
>
> `storageclass/ks.yaml` carries `force: true` precisely because StorageClass `parameters` are
> **immutable**: without it, changing a parameter fails to apply, Flux reports the
> Kustomization not-Ready with *"updates to parameters are forbidden"*, and the live class
> **silently keeps its old values**.
>
> #1053 changed `parameters.nodeSelector` from `critical` to `low-power`, which is exactly that
> case, and it is the first time this repository has exercised the flag. **It worked: Flux
> deleted and recreated the class.** Verified live by the object's identity —
> `longhorn-media`'s `metadata.creationTimestamp` reads **2026-08-22T18:14:10Z**, one minute
> after #1053 merged (14:13 EDT) and **thirty minutes after #1051 created the class**
> (13:44 EDT). A patched object would have kept its original creation time and UID; this one
> is a different object.
>
> Recording it because the alternative failure mode is *silent*: had `force` been absent, the
> live class would still say `nodeSelector: critical` and only the Kustomization's Ready
> condition would have said so. **Deleting a StorageClass is safe here** — it holds no data,
> and bound PVs and PVCs carry their own copy of the parameters — which is why the whole
> directory is allowed to be forced.

```bash
flux -n longhorn-system reconcile kustomization storageclass --with-source
kubectl get sc longhorn-media -o yaml
```

**Creating the class does nothing to the existing volumes.** §6 is what moves them.

Like the superseded option B — and unlike the first `critical`-based revision of this
document — the shipped design **does** need a new node tag, so `talos/talconfig.yaml` was
edited (three anchor edits covering five nodes; see the top of this document). The
tag-before-provision ordering hazard does **not** apply, because
`node.longhorn.io/default-node-tags` is only read at Longhorn node **creation** and the live
retag was done by patching the `nodes.longhorn.io` CRs directly. The talconfig edit exists so
a rebuilt node comes back correctly tagged.

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
volumes at 3 replicas on `bulk`. They are not — they are `nodeSelector: ["low-power"]` with
`dataLocality: disabled`. **The only place the truth lives is the Volume CR.**

Nothing reconciles the two, in either direction. A future edit to `longhorn-media`'s
`parameters` will be delete-and-recreated onto the *class* by `force: true` (§9) and will
**not** propagate to these three volumes — those would have to be patched again by hand.

The drift resolves the next time each PVC is re-provisioned from scratch, if
`VOLSYNC_STORAGECLASS` says `longhorn-media` by then.

> **VolSync backups still break overnight.** `VOLSYNC_STAGING_STORAGECLASS` /
> `VOLSYNC_CACHE_SNAPSHOTCLASS` default to `longhorn-snapshot` / `longhorn-cache`, both
> `nodeSelector: bulk`. `bulk` covers all four workers, two of which (`hard-hat`,
> `shining-armor`) **do** stay up — so the staging clone can in principle still be placed. But
> the mover pod must also be schedulable, and neither class nor mover is pinned to the two
> workers that survive, so **the media apps' nightly backups are not reliable while both
> media workers are shed.** This design makes the *data* survive the window; it does not make
> the *backup* survive it. Fixing that needs
> the media apps pointed at `longhorn-critical-snapshot` / `longhorn-critical-cache`, which
> already exist (`storageclass/critical.yaml`, 1 replica each on `critical`) and which
> [12](12-longhorn-critical-tier.md) created for exactly this reason. Changing those two
> variables **is** safe on a live app — unlike `VOLSYNC_STORAGECLASS`, they only affect the
> next throwaway mover volume. **Not done here**; see open item 4.

---

## 11. Open items

1. ~~**Nothing here has been executed.** §6 is a proposal.~~ **Executed 2026-08-22 — see the
   execution-status box at the top.** `dispatcharr` and `plex` are **complete**; `jellyfin` is
   mid-step-A with two stranded replicas left to delete. **Finishing `jellyfin` is the only
   remaining blocker on shedding a media worker overnight.** Separately, the `longhorn-media`
   StorageClass itself still has **no volume provisioned against it** — the migration patched
   existing volumes in place rather than reprovisioning through the class (§10.2's drift).
2. ~~**The deleted-vs-failed replenishment timing is unverified.**~~ **✅ CLOSED 2026-08-22 —
   a deleted replica does NOT wait out the 600 s interval.** Replacement replicas were created
   15–60 s after the previous one went healthy, and the gap is operator reaction time, not a
   Longhorn wait. Timestamps in §4.6; the contingent +90 min is removed from §7.
3. **Which replica the extra-healthy cleanup culls is unverified** (§6.2 step C). The runbook
   avoids depending on it by deleting by name first. **This got MORE important under
   `low-power`, not less:** with two spare eligible nodes, a slow step C actually starts a
   fourth rebuild rather than harmlessly failing to schedule, so the cull can now be reached
   in normal operation. See the warning in §6.2 step C.
4. **Overnight VolSync backups for the media tier are not addressed** (§10.2). The
   `longhorn-critical-snapshot` / `-cache` classes already exist; pointing the three apps at
   them is a small, separate change.
5. **Steady-state write latency is the thing to watch during the soak** (§3). The
   measurements say "affordable at 4.2 IOPS"; they do not prove Plex library scans feel the
   same afterwards. **`plex` is SQLite and is the most exposed of the three.**
6. **The `low-power` tag is a hand-maintained invariant and nothing guards it** — CORRECTED
   from "coupled to the control-plane count", which was the `critical`-era framing. Two ways
   it can rot silently, neither alerted on, both leaving the volumes reading `healthy`:
   - **If the tag ever shrinks to three nodes**, the two spares disappear and §6.7's
     self-healing goes with them, back to the old stranded-degraded behaviour.
   - **If `hard-hat` or `shining-armor` is ever added to the nightly shed, it must lose the
     tag in the same change**, or a replica there fails every night and §2's nightly-degraded
     problem returns in full.

   A cheap guard is an alert on the eligible-node count, or a line in
   [24](24-power-states.md)'s node-tagging procedure. Note the tag lives in **two** places —
   the live `nodes.longhorn.io` CRs and `talos/talconfig.yaml` — and only the CRs take effect;
   talconfig applies at node creation only, so the two can silently disagree.
7. ~~**Control-plane maintenance now degrades three more volumes.**~~ **Corrected — see §6.7.**
   It still degrades them, but they now **self-heal onto a spare** rather than staying
   degraded until the node returns. The residual issue is duration: 600 s replenishment wait
   plus a rebuild is ~44 min for `jellyfin`, past tuppr's 15 m gate, so a control-plane Talos
   upgrade will still stall the drain of the next node.
8. **The `Scheduled` condition is unmonitored** (§8). `dataLocality: disabled` means this
   design should never set it — and post-migration it reads `True` on all three — but nothing
   would tell you if that assumption broke.
9. **The three `volsync-src-*-cache` volumes carrying non-conforming `pegasus` replicas**
   (§4.2) are unrelated cruft this investigation surfaced. Harmless — they are `bulk`-selector
   volumes with a replica on a control plane — but they are evidence that the Tier-2
   `nodeSelector` backfill doc 12 deferred is still outstanding.
10. **The `longhorn-media` class and the three live volumes can now drift apart** (§10.2). A
    future edit to the class's `parameters` is delete-and-recreated onto the class by
    `force: true` and does **not** reach the existing volumes, which must be patched by hand.
    Nothing detects the divergence.
11. **⚠️ NEW — rebuild throughput was over-estimated by ~4×** (§7). Measured **26–33 MiB/s**
    onto the control-plane Transcend disks against a predicted median of **119 MiB/s**, and
    the historical `healthyAt − creationTimestamp` sample set that produced 119 has not been
    re-examined to find out why. Anything else in the estate planning a Longhorn migration off
    those historical figures is planning off a bad number.
