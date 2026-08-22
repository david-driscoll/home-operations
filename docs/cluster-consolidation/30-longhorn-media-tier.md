# 30 — Longhorn media tier

Created **2026-08-22**, rewritten **three** times the same day. **Unfiled** — standalone,
like [24](24-power-states.md) through [29](29-taint-readiness-audit.md). Direct sequel to
[12](12-longhorn-critical-tier.md) (which built `longhorn-critical` and the node-tag
machinery) and to [20](20-low-power-tier.md) §9.

Answers one question: **when low-power mode sheds both media workers overnight, where should
the `plex`, `jellyfin` and `dispatcharr` config volumes keep their replicas?**

> ## ⚠️ THE DESIGN CHANGED, TWICE. Read this before anything else.
>
> This document has argued for three different answers in one day, and the second one is
> quoted throughout the estate. If you find a claim below that contradicts this box, this box
> wins.
>
> | | Node set | Replicas | Nights | Days |
> | --- | --- | --- | --- | --- |
> | **plan C** (`critical`, [#1051](https://github.com/david-driscoll/home-operations/pull/1051)) | 3 control planes | 3 | clean | every read remote |
> | **`low-power`** ([#1053](https://github.com/david-driscoll/home-operations/pull/1053)) | 3 CPs + hard-hat + shining-armor | 3 | **clean** | every read remote |
> | **`low-power-off`** — **CURRENT** | the **5 Intel-iGPU** nodes: fluttershy, kerfuffle, milky-way, othalla, pegasus | **5** | **degraded 02:00–09:00, by design** | **always local** |
>
> **THE TRADE, stated once and plainly:** `low-power` bought **spotless nights** at the cost
> of **every daytime read and write crossing the network**. `low-power-off` buys **daytime
> data locality** at the cost of **a nightly degraded state that had to be made safe**.
>
> It went that way because of what these volumes *are*. They are not media — they are the
> apps' **config** volumes, and `plex`'s is **SQLite**: a latency workload, not a throughput
> one. The pods run on `fluttershy`/`kerfuffle` for the **seventeen hours a day the estate is
> awake**, which is when the volumes are actually used, and under `low-power` not one of the
> five eligible nodes was a node the pods could run on. Being remote for the busy 71 % of the
> day to be clean for the idle 29 % was the wrong way round.
>
> `low-power` is **not** deleted and was not a mistake — it still tags the five nodes that
> stay powered overnight, which is the right answer for anything whose only requirement is
> power continuity. It is simply not the right answer for *these* volumes.

> ## The decision: `longhorn-media`, `nodeSelector: low-power-off`, **5 replicas**, `dataLocality: disabled`
>
> **`low-power-off` = the five nodes with an Intel iGPU** — `fluttershy` and `kerfuffle` (the
> daytime workers) plus the control planes `milky-way`, `othalla` and `pegasus`. That is
> **exactly the set of nodes plex/jellyfin/dispatcharr can run on**: every one of the three
> carries a *hard* nodeAffinity requiring an Intel iGPU, and a *soft* one preferring the
> workers' stronger Iris Xe.
>
> **Five replicas across five eligible nodes means the pod ALWAYS sits on a node holding a
> local replica** — a worker by day, a control plane by night. Locality stops being something
> Longhorn has to chase and becomes structural.
>
> **`hard-hat` and `shining-armor` deliberately do NOT get the tag.** Neither has an Intel
> iGPU, so the media apps can never run there; a replica on either would be permanently
> remote — paying the write cost of a fifth copy and never once serving a local read. They
> keep `low-power`, which answers a different question.
>
> ### ⚠️ The accepted cost: these three volumes are `degraded` 02:00–09:00 EVERY NIGHT
>
> A replica on a node that powers off **is a failed replica**. Longhorn defines `degraded` as
> *fewer healthy replicas than `numberOfReplicas`*, so there is no arrangement in which a
> replica lives on a shed node and the volume is not degraded while that node is shed. This is
> not a bug to be fixed later; it is the price of the trade above, and it is **permanent**
> for as long as this class keeps replicas on the workers.
>
> **Someone reading a 03:00 dashboard will see three degraded volumes. That is correct.**
>
> ### The two companion changes that make it safe. BOTH ARE SHIPPED. Do not undo either.
>
> **1 — `LonghornVolumeStatusWarning` is scoped, not silenced.**
> `kubernetes/apps/longhorn-system/longhorn/rules/pvc-usage-rules.yaml`. The three media PVCs
> drop out of that alert exactly while `fluttershy` or `kerfuffle` is not `Ready`, plus a
> 30-minute post-wake resync grace. Nothing else is suppressed at any hour, and these three
> still page if they degrade while both workers are up. **§2.2 is the full argument**,
> including why a silence-operator `Silence` could not do this and why an Alertmanager mute
> interval was rejected — and the much larger thing that turned up while writing it: **all
> three PVC-joined Longhorn volume alerts had been silently dead for the life of this
> cluster.**
>
> **2 — tuppr's maintenance window is enabled.**
> `kubernetes/apps/system-upgrade/upgrades/talos.yaml`, `start: "0 11 * * *"`, `duration: 2h`,
> `timezone: ${TIMEZONE}`. tuppr's Talos health gate is `status.robustness != "degraded"` and
> **names no volume** — it is cluster-wide, so three degraded volumes would block *every* node
> drain for seven hours a night, and it would **fail on its 15 m timeout rather than wait**,
> silently, because a blocked upgrade looks exactly like an idle one. The window must stay
> **outside 02:00–09:00** for as long as this class keeps replicas on the shed nodes. §2.1.
>
> ### Why FIVE replicas and not three — the part that is easy to state backwards
>
> **Replenishment fires when a replica FAILS, not when a node is merely empty.** At 02:00 the
> two worker replicas fail and Longhorn goes looking for somewhere to rebuild them.
>
> * With **3** replicas over 5 eligible nodes, **two control planes are sitting empty**. They
>   are valid targets. Longhorn would rebuild **~170 GiB every night** and unwind it every
>   morning when the workers came back and auto-balance pulled replicas the other way.
> * With **5**, every eligible node already holds one and `replica-soft-anti-affinity` is
>   `false` (at most one replica per node), so **there is nowhere to rebuild to**. Longhorn
>   logs a scheduling failure, waits, and resyncs at 09:00.
>
> So the replica count is not a durability knob here — **it is the thing that stops nightly
> churn**. `numberOfReplicas` and the size of the `low-power-off` tag are a matched pair and
> must change together. See §2.3.
>
> ### What five replicas costs on the write path
>
> Longhorn v1 acks a write only once **every** replica has it, so these volumes are as slow as
> their slowest replica and now have **five** of them — at least three always on the control
> planes' Transcend SATA disks. Measured 7-day load is **4.2 write IOPS / ~52 KB/s combined**
> with ~0 reads, so this is affordable, but see §3.

> ### Why not `low-power`, and why not `critical`?
>
> **Against `critical`** (the first revision, shipped by #1051): it borrowed a tag that means
> "Tier-0/1 storage tier", diluting that meaning *and* piling all three media config volumes
> onto the same three control-plane disks already serving the registry, home-assistant,
> technitium, mosquitto and tsidp.
>
> **Against `low-power`** (#1053, and the design this document argued for for about four
> hours): it is
> a genuinely good tag that answers *"which nodes stay powered overnight?"* — but that is not
> the question these volumes ask. Its five nodes are `{3 CPs, hard-hat, shining-armor}`, and
> **not one of them is a node the media pods prefer by day.** The result was a volume whose
> every daytime I/O crossed the network, in exchange for a clean night on volumes that are
> idle at night. `low-power-off` inverts exactly that.
>
> The two tags now coexist and mean different things — see §1.1. Both are hand-maintained and
> neither is guarded by anything (§11, item 6).
>
> **Neither tag is `battery`.** In a real Battery event more nodes go down and these volumes
> degrade further; that is expected — Battery is an emergency, not a nightly routine. See
> [24](24-power-states.md) and [20](20-low-power-tier.md) §6.

**The shipped design needs a new node tag**, so `talos/talconfig.yaml` was edited. Because the
file uses YAML anchors, **two** edits cover all five nodes: `&intel_un1290_annotations`
(`fluttershy`, `kerfuffle`) gains `low-power-off` alongside `bulk`, and `&nodeAnnotations` (the
three control planes) gains it alongside `critical` and `low-power`. The `shining-armor` block
and `&amd_minifm_annotations` (`hard-hat`) are deliberately left at `["bulk", "low-power"]`.

> ⚠️ **`node.longhorn.io/default-node-tags` is read only at Longhorn node CREATION.** The
> talconfig edit is for persistence across a node rebuild; it does **not** retag a running
> node. **As of the live read below the retag has NOT been done** — the live `nodes.longhorn.io`
> CRs still show no `low-power-off` anywhere. That patch is now step 0 of the migration (§6.1),
> and until it lands every replenish onto the new selector will simply fail to schedule.
>
> ⚠️ **Do NOT run `mise run talos:apply` for the talconfig change.** It would carry Renovate's
> pending Kubernetes bump into a tuppr-owned upgrade. Patch per node, or let the change ride
> the next node rebuild.

Everything marked **verified live** was read from `admin@equestria` with read-only commands, or
with `--dry-run=server` patches that run the real admission chain and mutate nothing. Claims
marked **inferred** are reasoning from Longhorn source or semantics, flagged as such. Longhorn
is **v1.12.1**.

> ### ⚠️ Execution status — the `low-power` migration COMPLETED, and is now the *starting* state for a second one (live 2026-08-22 18:58 UTC)
>
> The scheduling, return-trip and StorageClass halves landed with #1051; the `low-power` tag
> and the class repoint landed with #1053; §6's volume migration ran the same afternoon and
> **all three volumes reached `healthy`** — `jellyfin`'s last rebuild finished at ~18:5x while
> this revision was being written. So the *previous* design is fully executed and stable.
>
> **Then the design changed.** None of the three volumes matches the `low-power-off` shape yet.
> Live at **2026-08-22 18:58 UTC**:
>
> | Volume | Live now | Conforming replicas | Still needed for `n=5 low-power-off` |
> | --- | --- | --- | --- |
> | `dispatcharr` (`pvc-633d7002…`, 1.65 GiB) | `n=3 sel=["low-power"]` · `healthy`/`attached` on `fluttershy` · replicas `milky-way`, `othalla`, `pegasus` | **3 of 3** | **+2** — `fluttershy`, `kerfuffle`. Nothing to delete. **3.3 GiB** |
> | `plex` (`pvc-242324ae…`, 23.09 GiB, **RWX**) | `n=3 sel=["low-power"]` · `healthy`/`attached` on `kerfuffle` · replicas `milky-way`, `othalla`, **`shining-armor`** | **2 of 3** | **+3** — `fluttershy`, `kerfuffle`, `pegasus`; **delete** the `shining-armor` replica. **69.3 GiB** |
> | `jellyfin` (`pvc-d49e4972…`, 59.95 GiB) | `n=4 sel=["low-power"]` · `healthy`/`attached` on `fluttershy` · replicas `fluttershy`, `kerfuffle`, `othalla`, **`shining-armor`** | **3 of 4** | **+2** — `milky-way`, `pegasus`; **delete** the `shining-armor` replica. **119.9 GiB** |
>
> **`jellyfin` is the closest to correct**, which is a piece of luck: it was stopped
> deliberately at `n=4` mid-migration, and the two replicas it never gave up — `fluttershy`
> and `kerfuffle` — are precisely the two the new design wants. Under `low-power` those were
> the two "stranded" replicas still to delete. **Under `low-power-off` they are the point.**
> Had the `low-power` migration been allowed to finish, they would have been destroyed and
> would now have to be rebuilt at 60 GiB each.
>
> **Total to copy: ~192.5 GiB across 7 rebuilds**, ≈ 1 h 49 m of pure copying at the measured
> ~30 MiB/s (§7). Two replicas get deleted (both on `shining-armor`).
>
> **Cluster-wide degraded count at the time of reading: 0.** No Longhorn volume anywhere is
> degraded, which is the precondition §6.1 asks for.
>
> Three findings from the completed `low-power` run, each written up where it belongs and all
> still true:
>
> - **Repointing an already-conforming volume moves ZERO bytes.** `dispatcharr` was migrated
>   under the `critical` design first; the later repoint to `low-power` created no replica,
>   because `{milky-way, othalla, pegasus}` ⊂ the `low-power` set. §4.2.
> - **A *deleted* replica is replenished in 15–60 s, not after the 600 s replenishment wait.**
>   Open item 2 is CLOSED. §4.6 and §7 carry the timestamps.
> - **Rebuild throughput was ~4× slower than estimated** — **26–33 MiB/s** onto the
>   control-plane disks against a predicted median of 119 MiB/s. §7.
>
> **On "the app never restarts":** all three pods reported **0 restarts** and all three volumes
> stayed `attached` throughout, so the migration is genuinely online. Do **not** read pod *age*
> as proof — the three pods date from ~17:47 UTC because the `app-template` HelmRelease was
> flapping between chart 5.0.1 and 5.1.0 that afternoon, unrelated to this.

---

## 1. Starting state (verified live, **before** the first migration)

> ⚠️ This table is the **2026-08-22-morning** snapshot, from before *any* migration ran. It is
> kept because every byte-count downstream is derived from it. **It is NOT the starting state
> for the `low-power-off` migration** — that is the execution-status box above, and it is a
> quite different picture.

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

### 1.1 Node tags — FOUR tags now, and they answer four different questions

**Live, verified 2026-08-22 18:58 UTC** (`kubectl -n longhorn-system get nodes.longhorn.io`):

```
fluttershy    ["bulk"]                    kerfuffle     ["bulk"]
hard-hat      ["bulk", "low-power"]       shining-armor ["bulk", "low-power"]
milky-way     ["critical", "low-power"]
othalla       ["critical", "low-power"]
pegasus       ["critical", "low-power"]
```

> ⚠️ **`low-power-off` does not exist on any live node yet.** The tag is committed to
> `talos/talconfig.yaml`, but that annotation is read only at Longhorn node **creation**. The
> live CRs must be patched before anything can schedule against it — §6.1 step 0.

**Target state**, after that patch:

```
fluttershy    ["bulk", "low-power-off"]                   kerfuffle ["bulk", "low-power-off"]
hard-hat      ["bulk", "low-power"]                       shining-armor ["bulk", "low-power"]
milky-way     ["critical", "low-power", "low-power-off"]
othalla       ["critical", "low-power", "low-power-off"]
pegasus       ["critical", "low-power", "low-power-off"]
```

The change is **purely additive** — every pre-existing `bulk`, `critical` and `low-power`
selector still matches exactly what it matched before, because a node's tag list is a set and
nothing is removed.

| Tag | Nodes | Answers the question |
| --- | --- | --- |
| `bulk` | fluttershy, hard-hat, kerfuffle, shining-armor | *"is this a worker?"* — the default tier |
| `critical` | milky-way, othalla, pegasus | *"where must **Tier-0/1 data** live?"* ([12](12-longhorn-critical-tier.md)) |
| `low-power` | milky-way, othalla, pegasus, hard-hat, shining-armor | *"does this node **stay powered** through the nightly 02:00–09:00 window?"* |
| `low-power-off` | milky-way, othalla, pegasus, **fluttershy, kerfuffle** | *"can the **media apps run** here?"* — i.e. does it have an Intel iGPU |

**These last two are nearly complements of each other and it is worth saying why both exist.**
`low-power` is about *power continuity*; `low-power-off` is about *where the workload can go*.
They overlap on the three control planes and disagree on all four workers. `longhorn-media`
wants the second, because a replica is only useful to these volumes if the pod that reads it
can be on the same node. Anything that merely needs to survive the night wants the first.

> ⚠️ **The name `low-power-off` is a trap.** It does not mean "nodes that power off". It means
> "the node set for the media apps *across* the low-power window" — the set that has a member
> up at every hour. `fluttershy` and `kerfuffle` are in it *and* are the two nodes that power
> off. If you read it as "the nodes that go off", every conclusion in this document inverts.

`critical` is a strict **subset** of `low-power`, which is why `longhorn-critical`'s volumes
also survive the window — but the tags answer different questions and are kept apart on
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
each of `low-power` and `low-power-off` had to be a **new tag** rather than a selector
expression over the existing ones — there is no way to write
`critical ∪ (bulk ∩ {fluttershy, kerfuffle})`, and the tag list is the only place the union
can be expressed.

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

## 2. "Degraded every night" — the thing the earlier designs were built to avoid, now ACCEPTED

The two earlier designs existed to keep these volumes out of `degraded`. `low-power-off`
walks straight into it, deliberately, because the daytime locality is worth more (see the
trade box at the top). That is only defensible because the two *consequences* of being
degraded have each been dealt with. This section is those two, plus the replica-count
reasoning that stops the third problem from existing at all.

### 2.1 Tooth one: it blocks Talos upgrades CLUSTER-WIDE — fixed with a maintenance window

`kubernetes/apps/system-upgrade/upgrades/talos.yaml`:

```yaml
- apiVersion: longhorn.io/v1beta2
  kind: Volume
  namespace: longhorn-system
  description: Wait for degraded Longhorn volumes to finish rebuilding before draining the next node, so its replica isn't the last healthy copy
  expr: status.robustness != "degraded"
  timeout: 15m
```

This check **names no volume**. It is a predicate over *every* `Volume` in `longhorn-system`,
so **any** degraded volume anywhere stalls the drain of the next node — and it does not wait
politely: it burns the full 15 minutes and then **fails the upgrade**. Silently, in the sense
that matters, because a blocked upgrade and an idle one look identical from outside.

Under `low-power-off` three volumes are degraded 02:00–09:00, so tuppr would be unable to
drain a node for **seven hours a night, every night**.

**Fix, shipped in the same commit as the class change:** the maintenance window in that file,
previously drafted-and-commented-out, is now enabled.

```yaml
maintenance:
  windows:
    - start: "0 11 * * *"    # Daily at 11
      duration: "2h"         # How long window stays open
      timezone: "${TIMEZONE}"
```

11:00 for 2 h sits squarely inside the awake hours, when both media workers are up and their
replicas are healthy. **This window must stay OUTSIDE 02:00–09:00 for as long as
`longhorn-media` keeps replicas on the shed nodes.** Verified against the live CRD —
`duration` and `start` are required, `timezone` optional — and accepted by a server-side
dry-run.

> **Note what this does NOT fix.** tuppr can still be blocked by a *genuinely* degraded volume
> during the window, and a rebuild of `jellyfin` at measured throughput is ~34 minutes, well
> past the 15 m gate. The maintenance window narrows *when* tuppr tries; it does not make the
> gate more forgiving. §6.6.

### 2.2 Tooth two: `LonghornVolumeStatusWarning` — fixed by SCOPING THE RULE

`kubernetes/apps/longhorn-system/longhorn/rules/pvc-usage-rules.yaml` carries, from Longhorn's
published example rules:

```yaml
- alert: LonghornVolumeStatusWarning
  expr: (longhorn_volume_robustness == 2) * on(volume) group_left(…) (…)
  for: 5m
  labels:
    severity: warning
```

Three media volumes × every night, forever. So it needed handling. What handling, though,
turned out to be a longer question than expected — and answering it uncovered something worse.

#### ⚠️ 2.2.1 The finding: this alert had NEVER been able to fire. Neither had two others.

Before silencing an alert it is worth checking that it works. It did not. **Verified live
against Prometheus on 2026-08-22**, and there are **two independent** faults, either of which
alone is fatal:

**Fault 1 — `longhorn_volume_robustness` is no longer an enum.** The rule tests `== 2`,
against a metric that in Longhorn v1.5-era exported one series per volume valued
`0=unknown / 1=healthy / 2=degraded / 3=faulted`. In the **v1.12.1** running here it is
**one-hot**: four series per volume carrying a `state="unknown|healthy|degraded|faulted"`
label, each valued **0 or 1**.

```
196 volumes → 784 series → exactly 196 of them valued 1
count_values("robustness", longhorn_volume_robustness)  →  {robustness="0"} 588, {robustness="1"} 196
```

There is no `2` anywhere in the metric. `== 2` matches nothing and can never match anything.

**Fault 2 — the kube-state-metrics join is broken on its own terms.** The rule reaches the PVC
name through `kube_persistentvolume_info{volumename=~"pvc-.*"}`. **`kube_persistentvolume_info`
has no `volumename` label.** Its label set is:

```
__name__, container, csi_driver, csi_volume_handle, endpoint, instance, job,
kubernetes_node, namespace, persistentvolume, pod, reclaim_policy, service, storageclass
```

so that selector matches **0 of 200** series and collapses the join to empty. The outer
`on(volume)` was equally unmatchable — nothing on the right-hand side carries a `volume` label
either.

**The consequence.** Three alerts share this shape and **all three have been dead for the life
of this cluster**:

| Alert | Was | Evidence |
| --- | --- | --- |
| `LonghornVolumeStatusWarning` | degraded volume | `state=inactive health=ok`, **0** `ALERTS` series in 30 d of retention |
| `LonghornVolumeStatusCritical` | **faulted** volume — i.e. data down | same |
| `LonghornVolumeActualSpaceUsedWarning` | volume >90 % full | same |

`health: ok` is the cruel part: PromQL that returns an empty vector is *valid*, so Prometheus
reports the rule as perfectly healthy and permanently inactive. Nothing anywhere says "this
alert cannot fire". For contrast, the Longhorn alerts in the same file that do **not** use the
join (`LonghornNodeCPUUsageWarning`) have fired normally in the same window.

**This is a much bigger deal than the nightly-degraded question that found it.** For the whole
life of the cluster, a Longhorn volume could go degraded — or **faulted**, which is data
unavailable — and nothing would have paged. Every "no volume alerts fired" reassurance in
docs [12](12-longhorn-critical-tier.md), [24](24-power-states.md) and earlier revisions of
*this* file was true but vacuous.

#### 2.2.2 The fix

Longhorn now exports `pvc` and `pvc_namespace` **directly on the metric**, so the join is not
just broken but unnecessary:

```
longhorn_volume_robustness{
  volume="pvc-d49e4972-…", pvc="jellyfin", pvc_namespace="equestria",
  node="fluttershy", state="degraded"
} = 1
```

`LonghornVolumeStatusWarning` becomes `longhorn_volume_robustness{state="degraded"} == 1` and
`LonghornVolumeStatusCritical` becomes the same with `state="faulted"`. Both were validated
against live Prometheus and accepted by the prometheus-operator admission webhook, which
does validate PromQL. At the moment of writing the fixed warning rule correctly returned the
one degraded volume in the cluster and the fixed critical rule correctly returned none.

> ⚠️ **Label rename.** These alerts now carry `pvc` / `pvc_namespace` where they used to
> *intend* `persistentvolumeclaim` / `namespace`. `namespace` is still present but is the
> **scrape** namespace, `longhorn-system`, not the PVC's. Nothing in this repo matched on the
> old names — because the alerts had never fired — but anything added later must use the new
> ones.

> ⚠️ **`LonghornVolumeActualSpaceUsedWarning` is deliberately left dead**, with a comment
> saying so. The same one-line fix applies, but running the fixed expression today returns
> **eight** volumes, three of them over 100 %. Shipping that as a side effect of a
> storage-placement change would have been an eight-alert pager storm nobody asked for. It
> needs its own pass — including deciding whether `actual_size / capacity` is even the right
> ratio for thin provisioning. **Open item 12; this is a real, currently-unmonitored gap.**

#### 2.2.3 Why a rule edit and not a silence

The estate's declarative silence mechanism is **silence-operator**
(`kubernetes/apps/observability/silences`, chart 0.20.0, image 0.18.0), driving
`observability.giantswarm.io/v1alpha2` `Silence` CRs. There is one in the tree today
(`keda-hpa-maxed-out`).

**It cannot express a window.** Read from the live CRD, the entire `spec` is:

```json
{"properties": {"matchers": {...}}, "required": ["matchers"]}
```

`matchers` and nothing else — **no schedule, no start/end, no recurrence, no timezone.** A
`Silence` here would be **permanent**, and a media volume genuinely degraded at 14:00 would be
hidden with it. That is the one outcome this must not produce, so a `Silence` is simply the
wrong tool. (The Gatus `maintenance-windows` used by #1047 *are* time-aware, but Gatus is an
uptime prober and has nothing to do with Prometheus alerts.)

**Alertmanager mute time intervals** were the other candidate. The `AlertmanagerConfig` in
`observability/alertmanager/config.yaml` is the global config, and the CRD does support
`spec.muteTimeIntervals` plus a per-route `muteTimeIntervals`. Rejected for two reasons:

1. **No timezone.** The prometheus-operator `TimeInterval` schema exposes
   `times / weekdays / daysOfMonth / months / years` and **no `location`**, so the window
   would be **UTC**. The shed itself is driven by `${TIMEZONE}` (`America/New_York`), so the
   two would drift by an hour at every DST change — silently, twice a year.
2. **A muted alert still shows as FIRING.** Muting suppresses the *notification*, not the
   alert. The estate's stated convention is a **zero-firing-alerts baseline**, and the triage
   skill counts *active* separately from *silenced*. A mute interval would leave three
   permanent nightly false positives in every triage view. A `Silence`, by contrast, shows as
   silenced — which is why silences are baseline-compatible and mute intervals are not.

**So: scope the rule.** This is also what the estate's own guidance asks for —
*"Silences are a LAST RESORT — fix the root cause first"* — and here the root cause is
genuinely that the alert's predicate is wrong. The volume is not unexpectedly degraded; the
alert is asking a question that has a known, boring answer for seven hours a night.

#### 2.2.4 The gate, and what it deliberately does not cover

```promql
(longhorn_volume_robustness{state="degraded"} == 1)
unless (
  longhorn_volume_robustness{state="degraded", pvc_namespace="equestria", pvc=~"plex|jellyfin|dispatcharr"}
  and on()
  count(
    min_over_time(
      kube_node_status_condition{node=~"fluttershy|kerfuffle", condition="Ready", status="true"}[30m]
    ) == 0
  ) > 0
)
```

**Gated on node readiness, not on a clock.** It suppresses exactly when the media workers are
actually down, which means: no timezone to get wrong, no DST drift, it survives a change to
the shed schedule, and it tracks a late wake or an early shed. And **a media volume degraded
while both workers are up still pages** — which is the case that matters.

**`min_over_time(...)[30m] == 0` is a post-wake resync grace.** It is true from the moment a
worker drops until 30 minutes after it is back, because the returning replicas need time to
catch up before the volume leaves `degraded`. The 02:00 leading edge needs no help: a node
takes ~40 s to report `NotReady` while the volume degrades immediately, and the rule's
`for: 5m` absorbs that gap and resets.

**Not suppressed, at any hour:** any volume that is not one of those three PVCs; those three
PVCs while both workers are up; and **anything at all** if kube-state-metrics is down or the
Node objects are missing — the gate then yields an empty vector and removes nothing. **It
fails open, on purpose.**

**Validated live 2026-08-22**, both directions: with the gate open the expression returned the
degraded volume; with the gate forced closed it returned nothing; and against a 63-series
control set the `unless` removed **exactly** the media PVCs (63 → 61, the two that were in the
set) and nothing else.

**Residual gaps, stated so nobody is surprised:**

- **A resync still running 30 minutes after wake WILL page at ~09:35.** That is intended — a
  media volume needing more than half an hour to come back is news. But it is **unverified**
  whether the 09:00 return is a fast resync at all: `staleReplicaTimeout` on these volumes is
  `"30"`, which is **minutes**, so Longhorn may delete the failed replicas around 02:30 and
  force a full **~170 GiB rebuild every morning** instead. **The first real night is the test.
  Open item 13.**
- **A media volume degraded for an unrelated reason inside the window is hidden.** Identical
  blast radius to any time-window silence, and shorter.
- **Node names are hardcoded** in the regex. If the shed set changes, the alert rule, the
  `low-power-off` tag and `numberOfReplicas` must all change together. Nothing enforces it.

### 2.3 Why five replicas — and the nightly churn that three would cause

The old designs had to engineer around `replica-replenishment-wait-interval` (600 s). From
`getCurrentNodesAndZones()` in `replica_scheduler.go`, a failed replica stops occupying its
node once `creatingNewReplicasForReplenishment` is set — i.e. once the 600 s wait expires — at
which point the shed nodes re-enter the candidate pool, are found unschedulable (powered off),
and any *other* eligible-but-empty node gets a full rebuild.

**The rule, stated correctly: replenishment needs a REPLICA TO FAIL. It is triggered by a
deficit (`usableCount < numberOfReplicas`), not by the existence of an empty eligible node.**
An awake, tag-eligible node holding no replica is a *destination* for churn; it is not a
*cause* of it.

> ⚠️ **Correction, carried forward.** The `critical`-era revision stated the rule as *"churn
> happens if and only if there is at least one tag-eligible node that is still awake and does
> not already hold a live replica."* That was a necessary condition dressed up as a sufficient
> one, and it only looked right because the `critical` design had **zero** spare eligible
> nodes, so both halves were false together.

**Under `low-power-off` the deficit is real** — two replicas genuinely fail at 02:00 — so
everything now turns on the *destination* half, which is where the replica count comes in:

| `numberOfReplicas` | At 02:00, two worker replicas fail. Longhorn looks for a target… | Result |
| --- | --- | --- |
| **3** over 5 eligible nodes | …and finds **two empty control planes**. Both are valid. | **~170 GiB rebuilt every night**, unwound every morning when the workers return and `replica-auto-balance` pulls the other way. Churn forever. |
| **5** over 5 eligible nodes | …and finds **nothing**: the two shed nodes are unschedulable, and each of the three control planes already holds a replica, which `replica-soft-anti-affinity: false` makes exclusive. | Scheduling failure logged, Longhorn waits, resync at 09:00. |

**So `numberOfReplicas: 5` is not a durability choice. It is the thing that makes the nightly
window free of data movement**, and it works only because it exactly equals the size of the
`low-power-off` node set. Change either and the other must change with it. Nothing in Longhorn
or Flux checks this; it is a hand-maintained invariant (§11, item 6).

## 3. What this design buys, and what it costs

> ⚠️ **This section used to be titled "The accepted cost: remote reads by day" and argued the
> opposite of what it now argues.** Under `low-power` the pods sat on nodes that could never
> hold a replica, and the whole section was an argument that remote reads were tolerable. That
> argument was *sound* — the evidence is kept below, because it is good evidence — but it was
> answering "can we live with this?" when the better question was "why are we accepting it at
> all?". `low-power-off` removes the remote read instead of justifying it.

### 3.1 What it buys: locality is now structural, in both states

All three apps carry a **hard** nodeAffinity requiring an Intel iGPU and a **soft** one (weight
100) preferring the media workers' stronger Iris Xe. `low-power-off` is exactly the set of
nodes that satisfies the hard constraint. With one replica on each:

| | Pod runs on | Local replica? |
| --- | --- | --- |
| **Day** (09:00–02:00, ~17 h) | `fluttershy` or `kerfuffle` (soft preference) | **yes** |
| **Night** (02:00–09:00) | `milky-way`, `othalla` or `pegasus` (only iGPU nodes left) | **yes** |

There is no state in which the pod can run somewhere that holds no replica, because there is
nowhere it can run that is not in the tag. That is why `dataLocality` stays `disabled` rather
than `best-effort` — there is nothing left for `best-effort` to ask for (§8).

**Why this is worth paying for.** These are **config** volumes, not media. `plex`'s is
**SQLite**: library scans and metadata refreshes are fsync-bursty and serialised, which makes
them a **per-operation latency** workload, not a throughput one — the kind of workload a
network hop hurts most and a benchmark shows least.

### 3.2 What it costs, part one: five-way synchronous writes

Longhorn v1 acks a write only once **every** replica has it, so a volume is as slow as its
slowest replica, and there are now **five**. At least three are always on the control planes'
Transcend TS1TMTS425S M.2 SATA disks (**54–75 ms** mean write latency over 7 d) against the
workers' Samsung 990 EVO Plus NVMe (**0.5–11 ms**). Going from 3 replicas to 5 does not change
the *slowest* disk — the control planes were already in the set — but it does add two more
acks to wait for.

Measured 7-day load on the three volumes is **4.2 write IOPS / ~52 KB/s combined**, with **~0
reads** (page cache absorbs them). At that rate this is affordable. **It is still the thing to
watch during the soak, and `plex` is the exposed one** (§11, item 5).

### 3.3 What it costs, part two: `degraded` every night

Covered at the top and in §2. Restated here because this is the section people read for
"what does this cost": **02:00–09:00 every night, all three volumes are `degraded`.** The
alert is scoped for it (§2.2) and tuppr's window avoids it (§2.1). Nothing else in the estate
reads `robustness`, which was checked.

### 3.4 The evidence that remote reads *were* survivable — kept, because it is still useful

The `low-power` shape ran healthy on this cluster, and the mirror-image shape still does
(verified live):

| Volume | PVC | Attached to | Replicas on | Robustness | Engine replica modes |
| --- | --- | --- | --- | --- | --- |
| `pvc-8cfbf411-185d-4e9e-8b33-07a12bd66372` | `teamarr` | **`milky-way`** (CP) | `fluttershy`, `hard-hat`, `kerfuffle` (all `bulk`) | `healthy` | 3 × `RW` |
| `pvc-4f906258-9fd8-4a94-bdca-e24bb44ff34d` | `pinepods` | **`othalla`** (CP) | `fluttershy`, `hard-hat`, `kerfuffle` (all `bulk`) | `healthy` | 3 × `RW` |

Both have their engine on a node holding **zero** replicas and both are fully healthy. So
remote-read is not *dangerous*; the case for `low-power-off` is that it is not *free* either,
and here it was avoidable. **These two volumes are also the live example of the ghost-replica
failure mode in §8** — they are worth keeping around for that reason alone.

## 4. THE MIGRATION — the hard part

This is the **second** migration of these volumes in a day. The first (to `low-power`) is
complete; this one moves them from there to `low-power-off`. §4.1–4.6 are the mechanics, and
they are unchanged and all still verified — **what Longhorn will and will not do to a replica
does not depend on which tag you are moving to.**

The shape of the work *is* different, and simpler. Under `low-power` the target count equalled
the current count, so every rebuild had to be manufactured by deleting a replica first, which
is why §6 uses a grow-then-shrink dance. **Here the target count is HIGHER than the current
count (5 vs 3 or 4), so the growth happens by itself**: patch the volume and Longhorn
replenishes into the deficit. Deletions are needed only for the two replicas sitting on
`shining-armor`, which is not in the new tag.

**What each volume needs**, from the live read at 2026-08-22 18:58 UTC:

| Volume | Actual size | Replicas now | Already conforming | Rebuilds needed | Deletions | Bytes copied |
| --- | --- | --- | --- | --- | --- | --- |
| `dispatcharr` | 1.65 GiB | milky-way, othalla, pegasus | **3** | **2** → fluttershy, kerfuffle | none | **3.3 GiB** |
| `plex` | 23.09 GiB | milky-way, othalla, **shining-armor** | **2** | **3** → fluttershy, kerfuffle, pegasus | 1 (`shining-armor`) | **69.3 GiB** |
| `jellyfin` | 59.95 GiB | fluttershy, kerfuffle, othalla, **shining-armor** | **3** | **2** → milky-way, pegasus | 1 (`shining-armor`) | **119.9 GiB** |
| | | | | **7** | **2** | **≈ 192.5 GiB** |

At the measured ~30 MiB/s (§7) that is **≈ 1 h 49 m of pure copying**.

> **`jellyfin` is the cheapest of the three relative to its size, and that is luck.** It was
> deliberately stopped at `n=4` part-way through the `low-power` migration, still holding
> replicas on `fluttershy` and `kerfuffle`. Under the old design those were the two "stranded"
> replicas queued for deletion. **Under `low-power-off` they are exactly what is wanted.** Had
> the first migration been allowed to finish, both would have been destroyed and would now
> need rebuilding at 60 GiB apiece — a **120 GiB** round trip avoided by stopping.

> ⚠️ **`shining-armor`'s two replicas are the mirror image**, and worth noting for the
> next time a tag changes: under `low-power` they *conformed* and the runbook went out of its
> way not to touch them, saving two rebuilds. Under `low-power-off` they are the only
> non-conforming replicas left. **A replica's conformance is a property of the current tag,
> not of the replica.** Nothing is stable across a tag change except the bytes.

### 4.1 Q1 — can `spec.nodeSelector` be patched live? **Yes.** (verified)

`spec.numberOfReplicas`, `spec.nodeSelector` and `spec.dataLocality` are plain, mutable
fields on `volumes.longhorn.io`, and `longhorn-webhook-validator` accepts changing them on an
**attached, healthy** volume. **Verified live** with server-side dry-run (full admission
chain, mutates nothing) on **all three** volumes:

```bash
kubectl -n longhorn-system patch volumes.longhorn.io <vol> --type=merge \
  -p '{"spec":{"numberOfReplicas":5,"nodeSelector":["low-power-off"],"dataLocality":"disabled"}}' \
  --dry-run=server
```

| Volume | Access mode | Result |
| --- | --- | --- |
| `pvc-633d7002-…` (dispatcharr) | RWO | `n=… sel=[…] dl=disabled` — **accepted** |
| `pvc-242324ae-…` (plex) | **RWX** | `n=… sel=[…] dl=disabled` — **accepted** |
| `pvc-d49e4972-…` (jellyfin) | RWO | `n=… sel=[…] dl=disabled` — **accepted** |

*(These dry-runs were originally taken with `nodeSelector: ["critical"]`, then re-run for
`["low-power"]` with `n=3` and `n=4`. All were accepted, and all three volumes were
subsequently patched **for real**, live, attached and healthy. **The webhook does not inspect
tag membership or replica count at all**, which is why every variant is accepted and why the
`low-power-off`/`n=5` form needs no fresh dry-run to be trusted — but see the warning below,
because "accepted" is emphatically not "will schedule".)*

> ⚠️ **THE WEBHOOK WILL HAPPILY ACCEPT A SELECTOR THAT MATCHES NOTHING.** As of the live read,
> **no Longhorn node carries the `low-power-off` tag** (§1.1). Patching a volume to
> `nodeSelector: ["low-power-off"]` right now would be accepted, would immediately mark the
> existing replicas non-conforming, and would leave every replenish unable to place anything.
> **Tag the nodes first** — §6.1 step 0.

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

## 5. Capacity — do the eligible nodes have room? (verified live 2026-08-22 18:58 UTC)

Longhorn schedules against `storageMaximum × over-provisioning%` (600 %) and refuses to go
below `storage-minimal-available-percentage` (5 %).

**Under `low-power-off` this is no longer a worst-case question.** Five replicas over exactly
five eligible nodes with hard anti-affinity has **one** valid placement: every one of the five
takes **one replica of every volume**. So the load is known exactly — `+105 GiB scheduled`
(spec sizes 40 + 60 + 5) and `+85 GiB actual` on **each** of the five, minus whatever it
already holds.

| Node | max | avail now | sched now | replicas now | sched after | avail after | headroom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fluttershy` | 931 GiB | 645 GiB | 620 GiB | 76 | 725 GiB | ~560 GiB | fine |
| `kerfuffle` | 931 GiB | 601 GiB | 663 GiB | 59 | 768 GiB | ~516 GiB | fine |
| `milky-way` | 931 GiB | 769 GiB | 536 GiB | 47 | 641 GiB | ~684 GiB | fine |
| `othalla` | 931 GiB | 728 GiB | 454 GiB | 39 | 559 GiB | ~643 GiB | fine |
| `pegasus` | 931 GiB | 778 GiB | 659 GiB | 53 | 764 GiB | ~693 GiB | fine |

Over-provisioning limit is `931 × 6 = 5586 GiB` — the busiest node lands at **768 GiB
scheduled**, nowhere near it. Minimum available is `931 × 5 % = 47 GiB`; the tightest node
keeps **~516 GiB**. `LonghornNodeStorageWarning` fires above **80 %** usage and the worst node
lands around **26 %**. **Capacity is not a constraint.**

> Note the two workers already carry the *largest* scheduled totals (620 and 663 GiB) and the
> most replicas, because they are `bulk` — the default tier — and everything else in the
> cluster lands there. Adding the media config volumes to them is still comfortable, but they
> are the two to watch if this class ever grows.

**Freed by the migration:** two replicas leave `shining-armor` (23.09 + 59.95 = **83 GiB
actual**, 100 GiB scheduled), which is the tightest node in the cluster at 441 GiB available.
A small side benefit, and the only node that gets *better* out of this change.

## 6. The migration runbook — do NOT execute unattended

> ⚠️ **REWRITTEN for `low-power-off` / 5 replicas.** The previous version of this section
> described a **grow-then-shrink** dance: bump `numberOfReplicas` to 4, delete a stranded
> replica, delete another, shrink back to 3. **That is no longer the right procedure and its
> commands are actively wrong** — wrong tag, wrong count, and it would delete the two worker
> replicas this design exists to keep. If you have that version open, close it.

**Method now: grow, then prune.** The target count (5) is *higher* than the current count (3
or 4), so Longhorn manufactures the rebuilds by itself the moment the volume is patched —
`usableCount < numberOfReplicas` is a deficit, and §4.6's replenish path fills it one replica
at a time, applying the volume's **current** `nodeSelector`. Only the two `shining-armor`
replicas need deleting, and only *after* the growth has landed.

**Minimum healthy replicas at any point: 3** (`plex`, at the very start, before its first new
replica lands). Every other moment is 4 or better. There is no window in which these volumes
are less safe than they are today.

### 6.1 Preconditions — check ALL of these first

> ### ⚠️ STEP 0 — TAG THE NODES. Nothing else works until this is done.
>
> `low-power-off` exists in `talos/talconfig.yaml` and on **no live Longhorn node**
> (§1.1). `node.longhorn.io/default-node-tags` is read only at Longhorn node **creation**, so
> the talconfig edit will not retag a running node — it exists so a *rebuilt* node comes back
> correct. The live effect comes from patching the `nodes.longhorn.io` CRs:
>
> ```bash
> # additive — read the current list, append, write back. Do NOT overwrite blindly.
> kubectl -n longhorn-system get nodes.longhorn.io \
>   -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags
>
> # workers: ["bulk"] -> ["bulk","low-power-off"]
> for n in fluttershy kerfuffle; do
>   kubectl -n longhorn-system patch nodes.longhorn.io "$n" --type=merge \
>     -p '{"spec":{"tags":["bulk","low-power-off"]}}' --dry-run=server
> done
>
> # control planes: ["critical","low-power"] -> +["low-power-off"]
> for n in milky-way othalla pegasus; do
>   kubectl -n longhorn-system patch nodes.longhorn.io "$n" --type=merge \
>     -p '{"spec":{"tags":["critical","low-power","low-power-off"]}}' --dry-run=server
> done
> ```
>
> **Drop `--dry-run=server` only once the printed tag lists match §1.1's target block.** This
> is purely additive: no existing `bulk`, `critical` or `low-power` selector changes meaning,
> because a tag list is a set and nothing is removed.
>
> ⚠️ **Do NOT reach for `mise run talos:apply`** to make the talconfig edit live. It would
> carry Renovate's pending Kubernetes bump into a tuppr-owned upgrade.

```bash
# 1. No Talos upgrade in flight or pending. THIS IS THE IMPORTANT ONE — see §6.6.
kubectl get talosupgrades.tuppr.home-operations.com -A
#    require: PHASE=Completed, READY=True

# 2. Nothing already degraded (would confuse both your verification and tuppr)
kubectl -n longhorn-system get volumes.longhorn.io -o json \
  | jq -r '[.items[]|select(.status.robustness=="degraded")|.metadata.name]|"degraded=\(length) \(.)"'
#    require: degraded=0   <- was true at 2026-08-22 18:58 UTC

# 3. All three target volumes attached + healthy
kubectl -n longhorn-system get volumes.longhorn.io \
  pvc-242324ae-0f5e-4be8-82ce-01afe2d51b53 pvc-d49e4972-17e8-4811-9850-10a8f17d89f4 \
  pvc-633d7002-9640-4f86-b9a0-127d8d14a9c2 \
  -o custom-columns=NAME:.metadata.name,STATE:.status.state,ROBUST:.status.robustness,N:.spec.numberOfReplicas

# 4. All FIVE low-power-off nodes tagged, schedulable and with room (§5).
#    Expect: milky-way/othalla/pegasus = [critical low-power low-power-off];
#            fluttershy/kerfuffle      = [bulk low-power-off];
#            hard-hat/shining-armor    = [bulk low-power]   <- NOT low-power-off, by design
kubectl -n longhorn-system get nodes.longhorn.io \
  -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags,SCHED:.spec.allowScheduling,EVICT:.spec.evictionRequested

# 5. NOT inside the low-power window (02:00-09:00). Two reasons now, not one:
#    the workers must be AWAKE to receive their new replicas at all, and you want
#    every source replica available to read from.
```

### 6.2 Per-volume procedure

Run it **one volume at a time**, in this order — **`dispatcharr` first as a cheap rehearsal**
(1.65 GiB, ~1 minute per replica), then `plex`, then `jellyfin` last.

Let `V` be the volume. Under `low-power-off` a replica is **conforming** if it sits on
`fluttershy`, `kerfuffle`, `milky-way`, `othalla` or `pegasus`, and **stranded** if it sits
anywhere else. Today that means **only `shining-armor` replicas are stranded** — two of them,
one on `plex` and one on `jellyfin`. `dispatcharr` has none.

> ⚠️ **DO NOT delete replicas on `fluttershy` or `kerfuffle`.** The `low-power`-era runbook
> told you to, and `jellyfin` still carries two of them. **They conform now and they are the
> entire point of this design.** Deleting them would cost 120 GiB of needless rebuild and
> leave the volume with no daytime local replica until it finished.

**Step A — patch to the new shape. This starts the rebuilds by itself.**

```bash
kubectl -n longhorn-system patch volumes.longhorn.io "$V" --type=merge \
  -p '{"spec":{"numberOfReplicas":5,"nodeSelector":["low-power-off"],"dataLocality":"disabled"}}'
```

Longhorn now sees `usableCount` (3 or 4) below `numberOfReplicas: 5` → replenishes → the
scheduler filters candidates to `low-power-off`-tagged nodes not already holding a replica of
this volume → new replicas land there, **one at a time** (§4.6, the replenish count is forced
to 1 per pass and the volume controller serialises rebuilds). The volume reads `degraded`
while each rebuild runs and returns to `healthy` between them.

Per volume this step produces:

| Volume | New replicas it must create | Ends at |
| --- | --- | --- |
| `dispatcharr` | 2 → `fluttershy`, `kerfuffle` | **5 healthy — DONE, no step B** |
| `plex` | 2 → two of `fluttershy` / `kerfuffle` / `pegasus` | 5 healthy, one of them still on `shining-armor` |
| `jellyfin` | 1 → `milky-way` or `pegasus` | 5 healthy, one of them still on `shining-armor` |

*Wait for:* `robustness: healthy` **and** 5 running replicas before going on.

**Step B — delete the stranded `shining-armor` replica (`plex` and `jellyfin` only).**

```bash
kubectl -n longhorn-system delete replicas.longhorn.io <shining-armor-replica-name>
```

Healthy count drops 5 → 4, below `numberOfReplicas: 5`, so Longhorn replenishes onto the one
remaining `low-power-off` node that holds no replica of this volume. **Minimum healthy
replicas during this: 4.**

*Wait for:* `robustness: healthy` and 5 running replicas, all on `low-power-off` nodes.

> **Why B comes after A and not before.** Deleting first would run the volume at 2 (plex) or 3
> (jellyfin) healthy replicas during a rebuild for no benefit. Growing first means the stranded
> replica is redundant by the time it goes. There is also no `numberOfReplicas` shrink at the
> end of this procedure — 5 is the final count — so the old runbook's "run these two commands
> back to back" hazard, and the open question about *which* replica the extra-healthy cleanup
> culls, **do not arise here at all.**

**Replica names.** Live at 2026-08-22 18:58 UTC — **re-read them immediately before acting**,
because every rebuild changes them:

| Volume | Delete (stranded) | Leave alone |
| --- | --- | --- |
| `dispatcharr` | *(none)* | `…-r-a7727873` (milky-way), `…-r-d4c5f23f` (othalla), `…-r-b10ddafa` (pegasus) |
| `plex` | `…-r-d459b0c5` (**shining-armor**) | `…-r-ae3cc55f` (milky-way), `…-r-a863798c` (othalla) |
| `jellyfin` | `…-r-d90dbcc1` (**shining-armor**) | `…-r-9c1d4987` (**fluttershy**), `…-r-a4e2f069` (**kerfuffle**), `…-r-b37dec84` (othalla) |

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '.items[]|select(.spec.volumeName=="'"$V"'")
   |"\(.metadata.name) node=\(.spec.nodeID) state=\(.status.currentState) hardAff=\(.spec.hardNodeAffinity//"-")"'
```

The rule is simple enough to apply from that output alone: **delete it if and only if the node
is not one of the five `low-power-off` nodes.**

> **On `hardNodeAffinity`.** Under the `low-power` migration `plex`'s `kerfuffle` replica
> carried `hardNodeAffinity: kerfuffle`, a leftover from `dataLocality: best-effort`, and it
> had to be deleted last. **Verified live now: none of the ten current replicas across the
> three volumes carries a `hardNodeAffinity`**, because every one of them was created under
> `dataLocality: disabled`. That hazard is gone, and §8 is why it should not come back.

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

Expect for all three: `n=5 sel=["low-power-off"] dl=disabled rob=healthy state=attached`.

**The gate that actually matters — simulate the shed on paper and count what survives, AND
what stays local.** Under `low-power-off` there are two things to prove, not one:

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '[.items[]|select((.spec.volumeName|test("242324ae|d49e4972|633d7002")) and .spec.nodeID!="" and (.spec.failedAt//"")=="")]
   | group_by(.spec.volumeName)[]
   | "\(.[0].spec.volumeName) total=\(length) onWorkers=\([.[]|select(.spec.nodeID|test("^(fluttershy|kerfuffle)$"))]|length) onCP=\([.[]|select(.spec.nodeID|test("^(milky-way|othalla|pegasus)$"))]|length) offTag=\([.[]|select(.spec.nodeID|test("^(hard-hat|shining-armor)$"))]|length)"'
```

**Required for all three: `total=5 onWorkers=2 onCP=3 offTag=0`.**

* `onWorkers=2` is the **daytime locality** guarantee — whichever worker the pod prefers, it
  has a local replica.
* `onCP=3` is the **overnight locality** guarantee — whichever control plane the pod relocates
  to, it has a local replica.
* `offTag=0` proves nothing is stranded on `hard-hat` or `shining-armor`, where it would be
  permanently remote.

⚠️ **Note this is the exact inverse of the check the previous revision demanded**, which was
`survivors=3 onShed=0`. If you run the old command it will report a "failure" on a correctly
migrated volume.

**And the honest one: confirm the nightly degradation is EXPECTED, not surprising.** After
migration, simulating the shed means 2 of 5 replicas fail, so `robustness` goes `degraded`.
There is no command that makes that go away, and none should be written. What to verify
instead is that the two things which react to it are correctly configured:

```bash
# the alert rule must carry the media exclusion
kubectl -n longhorn-system get prometheusrule longhorn-pvc-usage-rules -o yaml \
  | grep -A2 'pvc_namespace="equestria"'

# tuppr's maintenance window must be enabled and outside 02:00-09:00
kubectl get talosupgrades.tuppr.home-operations.com talos -o jsonpath='{.spec.maintenance}'
# expect: {"windows":[{"duration":"2h","start":"0 11 * * *","timezone":"America/New_York"}]}
```

Also confirm **no ghost replicas** were minted (`dataLocality: disabled` should prevent them
entirely — §8):

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o json | jq -r \
  '.items[]|select((.spec.volumeName|test("242324ae|d49e4972|633d7002")) and .spec.nodeID=="")
   |"GHOST \(.metadata.name) hardAff=\(.spec.hardNodeAffinity)"'
# expect: no output
```

**Then watch one real night.** The things to check the following morning, because none of them
can be established from the daytime:

1. Did any page fire? (It should not — §2.2.4.)
2. Did tuppr attempt and fail a drain? (`kubectl get talosupgrades -A`, look for a failed
   health check.)
3. **Did Longhorn rebuild anything overnight?** Compare replica `metadata.creationTimestamp`
   against yesterday's. **Any replica created between 02:00 and 09:00 means the
   "nowhere to rebuild to" argument (§2.3) is wrong and the design needs re-examining.**
4. **How long did the 09:00 recovery take, and was it a resync or a full rebuild?** If replica
   creation timestamps changed, it was a full rebuild — see open item 13 on
   `staleReplicaTimeout: 30`.

### 6.5 Rollback, mid-flight

Every step is reversible, and **shrinking is instant** — reducing `numberOfReplicas` deletes
replicas rather than copying anything.

- **Before step B on a given volume**, nothing has been destroyed at all: step A is purely
  additive. To abort, patch back to `{"spec":{"numberOfReplicas":3,"nodeSelector":["low-power"]}}`
  and Longhorn culls down to three. The `shining-armor` replica is still there, so `plex` and
  `jellyfin` return to exactly the shape they have today.
- **After step B** the `shining-armor` replica is gone and rolling back to `low-power` means
  rebuilding it — 23 GiB or 60 GiB. Not dangerous, not free.
- **Aborting between volumes is safe.** The three are independent; a half-migrated set is a
  valid resting state. There is no ordering dependency between them.

  ⚠️ **But a half-migrated set is NOT a safe state to leave overnight**, and this is new. A
  volume already on `low-power-off` will go degraded during the shed, which is fine — the
  alert scoping covers all three PVCs regardless of which shape each is in, and tuppr's window
  covers the rest. What is *not* covered is a volume left mid-step-A with a rebuild in flight.
  **Finish the volume you started, or roll it back, before 02:00.**
- **Nothing here touches the PVC, the PV or Git.**

### 6.6 ⚠️ Do not overlap a tuppr upgrade window

Per §2.1, `kubernetes/apps/system-upgrade/upgrades/talos.yaml` gates node drains on
`status.robustness != "degraded"` across **every** volume in `longhorn-system`, with a 15 m
timeout. This migration deliberately makes a volume degraded **seven times**, each for the
duration of one rebuild — and at the measured throughput (§7) **`jellyfin`'s rebuilds run ~34
minutes each, comfortably past that 15 m timeout on their own.**

**Before starting:**

```bash
kubectl get talosupgrades.tuppr.home-operations.com -A
# require PHASE=Completed / READY=True — not Progressing, not pending
```

Also check Renovate has not just merged a Talos or Kubernetes version bump that tuppr will
pick up mid-migration. If an upgrade starts while a rebuild is running, tuppr will stall on the
health check and may fail the upgrade — recoverable, but noisy and confusing.

> ⚠️ **The tuppr maintenance window makes this WORSE during the migration, not better.** The
> window is now 11:00–13:00 daily, which is a perfectly reasonable time to be running a
> supervised volume migration. **Do the migration outside 11:00–13:00**, or accept that tuppr
> may start a drain into the middle of it.

### 6.7 What happens when an eligible node dies — ⚠️ REVERSED for `low-power-off`

> ⚠️ **Read the correction chain, because this claim has now flipped twice.**
>
> * The `critical`-era revision said: three replicas on three eligible nodes, **no spare**, so
>   an eligible node dying strands the volume degraded until it returns.
> * The `low-power` revision said that was FALSE and boasted about it: three replicas over
>   **five** eligible nodes leaves **two spare**, so the volume self-heals.
> * **Under `low-power-off` we are back to no spare**, and it is a deliberate choice this
>   time, not an accident of a narrow tag.

Five replicas over exactly five eligible nodes leaves **zero** spare. `replica-soft-anti-affinity`
is `false`, so at most one replica per node, so there is nowhere to rebuild. **If an eligible
node goes down, the volume degrades and stays degraded until that node comes back.**

**This is the same property that makes the nightly window free** (§2.3) — you cannot have
"nothing rebuilds at 02:00" and "something rebuilds when a node dies" at the same time, because
Longhorn cannot tell the two apart. Both are just a failed replica on an unreachable node.
**The design chose no-nightly-churn, and self-healing is what it paid.**

What that means in practice:

1. **A control-plane Talos upgrade degrades all three volumes** for the length of the drain
   and reboot, and tuppr's own cluster-wide gate will then stall the *next* node's drain. The
   maintenance window bounds when this can start; it does not prevent it.
2. **The nightly shed is indistinguishable from a two-node outage**, which is exactly why the
   alert gate in §2.2.4 keys on node readiness — it correctly suppresses in both cases, and
   the *node* alerts are what tell you which one you are in.
3. **A third eligible node failing overnight** takes a volume to 2 of 5. Still readable,
   still writable, and now genuinely worth paging about — but the media exclusion would
   suppress it, because a media worker is not Ready. **That is the design's sharpest edge.**
   The `LonghornVolumeStatusCritical` (`faulted`) alert is deliberately **not** gated and
   would still fire if it went all the way down.

**Is the trade right?** For Tier-2 config volumes with VolSync backups, yes: the failure mode
is "degraded for the length of an outage you already know about", not data loss. It would be
the wrong trade for Tier-1 data, which is why `longhorn-critical` is a separate class with a
different shape (§9).

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
> **Use ~30 MiB/s for planning.** At that rate `jellyfin`'s rebuilds are ~34 minutes each. In
> practice `dispatcharr` + `plex` took **32 minutes wall-clock end to end** (17:46 → 18:18),
> and `jellyfin`'s single rebuild took roughly as long as both together.
>
> ⚠️ **These numbers were all measured writing to CONTROL-PLANE disks** (Transcend SATA),
> because that is where the `low-power` migration was going. **The `low-power-off` migration
> writes four of its seven rebuilds to the WORKERS' NVMe instead** (`fluttershy` ×3,
> `kerfuffle` ×3 — 3 of `dispatcharr`+`plex`+`jellyfin` each way). Historic worker-side figures
> were 122–373 MiB/s, so those four may be much faster than 30 MiB/s. **Plan at 30 anyway** —
> the historic figures are exactly the sample set §11 item 11 says is untrustworthy, and being
> early is not a problem.

**Copy volume for the `low-power-off` migration: ~192.5 GiB across 7 sequential rebuilds**
(§4). The superseded figures were ~169 GiB across 6 (`low-power`) and ~254 GiB across 9
(`critical`).

**Original estimate, left in place because the *method* is sound and only the input rate was
bad:**

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

**For the `low-power-off` migration**, at the measured rate:

| Volume | Bytes copied | Rebuilds | @ **30 MiB/s** (MEASURED) |
| --- | --- | --- | --- |
| `dispatcharr` | 3.3 GiB | 2 (→ fluttershy, kerfuffle) | **~2 min** |
| `plex` | 69.3 GiB | 3 (→ fluttershy, kerfuffle, pegasus) | **~39 min** |
| `jellyfin` | 119.9 GiB | 2 (→ milky-way, pegasus) | **~68 min** |
| **total** | **≈ 192.5 GiB** | **7** | **≈ 1 h 49 m** |

Per individual rebuild, at the **measured** rate: **~1 min** (dispatcharr), **~13 min**
(plex), **~34 min** (jellyfin) — unchanged, because per-rebuild cost is a function of volume
size, not of how many are needed.

**`concurrent-replica-rebuild-per-node-limit: 2` does not bind this migration.** The volume
controller already serialises to **one rebuild per volume** (§4.6), and the runbook does one
volume at a time, so at most one rebuild is ever in flight. The limit would only matter if
you tried to run all three volumes in parallel, where it would cap you at 2 concurrent
rebuilds per target node. **Do not parallelise** — the serial ordering is what keeps
verification meaningful and rollback simple.

**Realistic supervised wall-clock.** Add per-step overhead: replica CR creation, engine
sync, the `robustness` transition settling, and a human verifying each of the 9 steps —
call it 2–4 minutes per step, ~25–35 minutes total.

> **Budget a 3-hour window; reserve 4.** At the measured rate expect **~1 h 49 m of actual
> copying** plus per-step overhead. `jellyfin` alone is ~62 % of the work and should be started
> with at least 90 minutes left in the window.
>
> ⚠️ **And the window has two hard edges now, not one.** It must not overlap **02:00–09:00**
> (the workers must be awake to receive replicas at all) and it should not overlap
> **11:00–13:00** (tuppr's maintenance window, §6.6). That leaves 09:00–11:00 and
> 13:00–02:00 — which is plenty, but it does mean a migration started at 10:00 is a mistake.

**✅ Resolved — the 600 s contingency does not apply.** Whether a *deleted* (as opposed to
*failed*) replica waits out `replica-replenishment-wait-interval: 600` is now answered: **it
does not** (§4.6, with timestamps). The speculative **+90 minutes** is removed from the
estimate. What replaced it as the dominant error was the throughput miss above, which is
larger.

---

## 8. `dataLocality: disabled`, not `best-effort` — same answer, different reason

> ⚠️ **The setting did not change; the argument for it did, completely.** Under `low-power`
> the case was *"`best-effort` is UNSATISFIABLE, because the pods sit on nodes outside the
> tag"*. Under `low-power-off` the pods sit **inside** the tag, so that sentence is now false.
> The setting survives on a different and simpler argument.

### 8.1 The new reason: locality is already structural

`best-effort` exists to chase a local replica when there isn't one. Under `low-power-off`
**there always is one** — five replicas across the five nodes the pod can possibly run on, one
per node, guaranteed by `replica-soft-anti-affinity: false` (§3.1). Whichever node the pod
lands on, day or night, it is reading locally.

So `best-effort` has nothing left to ask for. It would be a no-op, and a no-op with a footgun
attached.

### 8.2 The footgun it keeps off the table

When `best-effort` **cannot** be satisfied — when the attached node is outside the volume's
tag — Longhorn does not quietly do nothing. It mints a **ghost replica**: `spec.nodeID: ""`,
`status.currentState: stopped`, `spec.hardNodeAffinity` pinned to the node that rejected it,
`rebuildRetryCount` capped at 5, and a permanent
`Scheduled=False / LocalReplicaSchedulingFailure` condition on the volume. Upstream calls this
"tags not fulfilled" ([longhorn#7312](https://github.com/longhorn/longhorn/discussions/7312),
[longhorn#11007](https://github.com/longhorn/longhorn/issues/11007)). It performs no I/O and
cannot serve as a replenishment slot (`spec.nodeID` is empty, and `hardNodeAffinity` pins it
to the one node that rejected it), so it is **cruft, not damage**.

**This is not hypothetical — it is live right now**, on the same two volumes that provide §3.4's
remote-read evidence:

```
pvc-8cfbf411-… (teamarr)   replica: node=""  state=stopped  hardNodeAffinity=milky-way
pvc-4f906258-… (pinepods)  replica: node=""  state=stopped  hardNodeAffinity=othalla
```

both with `Scheduled=False (LocalReplicaSchedulingFailure)` while reporting
`robustness: healthy`.

**So `disabled` is the setting that keeps this design safe under change.** The moment
`numberOfReplicas` drops below the size of the `low-power-off` tag — or a node loses the tag,
or an app's affinity changes so it can run somewhere untagged — `best-effort` would start
minting ghosts and parking a permanent `Scheduled=False` on these volumes. `disabled` makes
that structurally impossible. Given that §2.3 already makes the replica count a
hand-maintained invariant, this is worth having.

**Verified live post-`low-power`-migration:** none of the three volumes has a ghost replica
(`spec.nodeID: ""`), none of their ten replicas carries a `hardNodeAffinity`, and `jellyfin`'s
`Scheduled` condition reads `True`.

### 8.3 And nothing would tell you if it broke

**No alert covers any of this.** The Longhorn rules watch `robustness`, actual-space usage,
node storage, node-down and CPU — **nothing watches the `Scheduled` condition**. A
`best-effort` choice here would leave three volumes permanently `Scheduled=False` with three
orphan replica CRs and nothing would ever say so.

That observation deserves a sharper reading now than when it was first written: §2.2.1 showed
that the alerts which *do* exist for volume state had been **dead since the cluster was built**.
"No alert covers this" was not a statement about a gap at the edge of the monitoring; it was
the general case.

**Conclusion: `disabled` is correct, and it is correct for a better reason than before.**
`longhorn-critical` keeps `best-effort` legitimately — its workloads run **on** the control
planes, so for them the request is both satisfiable and useful.

## 9. Why a separate class and not `longhorn-critical`

`longhorn-critical` has `nodeSelector: critical` and `numberOfReplicas: "3"`. Under
`low-power-off` the two classes are no longer even close: `critical` is the three control
planes, `low-power-off` is those three **plus both media workers** at **5** replicas. Three
reasons not to reuse it:

1. **Different `dataLocality`.** `longhorn-critical` is `best-effort`; `longhorn-media` must
   be `disabled` (§8). The parameter is per-class, so this alone requires a second class.
2. **Different node set, for a genuinely different reason.** `critical` answers *"where must
   Tier-0/1 data live?"*; `low-power-off` answers *"where can the media apps run?"*. They
   overlap on the control planes by coincidence — because those happen to have Intel iGPUs —
   and will not stay in sync. Put an Intel iGPU in a new worker and `low-power-off` grows;
   that has nothing to do with Tier-1 data.
3. **Different tolerance for being degraded, and this is the decisive one.**
   `longhorn-critical` exists so Tier-0/1 data *never* loses redundancy overnight.
   `longhorn-media` is a class that is **deliberately degraded seven hours a night**. Those
   are opposite requirements and cannot share a class no matter how similar the node lists
   look. Folding media config into `critical` would drag Tier-1 data into the nightly
   degradation, drag it into the alert exclusion, and hand tuppr a permanent reason to stall.

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
> deleted and recreated the class.** The `low-power-off` change edits **both**
> `parameters.nodeSelector` **and** `parameters.numberOfReplicas`, so it depends on the same
> mechanism and is expected to delete-and-recreate the class again. Verified live by the
> object's identity —
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

The shipped design **does** need a new node tag, so `talos/talconfig.yaml` was edited — **two**
anchor edits covering five nodes, because of the YAML anchors (see the top of this document).

⚠️ **Unlike #1053, the live retag has NOT been done yet.** `node.longhorn.io/default-node-tags`
is only read at Longhorn node **creation**, so the talconfig edit alone changes nothing on a
running node, and no live `nodes.longhorn.io` CR carries `low-power-off` (§1.1). **That patch
is §6.1 step 0 and everything else in §6 is blocked on it.** Reconciling the StorageClass
before the nodes are tagged is harmless — the class binds nothing today (§10.2) — but patching
a *volume* before then is not.

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
volumes at 3 replicas on `bulk`. They are not — after §6 they are
`nodeSelector: ["low-power-off"]`, **5 replicas**, `dataLocality: disabled`. **The only place
the truth lives is the Volume CR.**

**Verified live: `longhorn-media` still has ZERO volumes provisioned against it.** All three
media PVCs report `storageclass: longhorn` (checked via `kube_persistentvolumeclaim_info`).
The class has now been rewritten twice without a single volume ever having been created from
it — it is, so far, purely documentation-of-intent plus a template for the next
re-provision.

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

1. **⚠️ THE `low-power-off` MIGRATION HAS NOT STARTED, AND NEITHER HAS ITS PRECONDITION.**
   The `low-power` migration is **complete** — all three volumes reached `n=3`/`n=4`,
   `sel=["low-power"]`, `healthy` — and that is now the *starting* state for a second
   migration. **Nothing is live for `low-power-off`:** no Longhorn node carries the tag
   (§1.1), no volume has been repatched, and the StorageClass is the only artefact in place.
   **§6.1 step 0 — patching the five `nodes.longhorn.io` CRs — blocks everything else.**
   ≈ 192.5 GiB across 7 rebuilds, ≈ 1 h 49 m of copying.

2. ~~**The deleted-vs-failed replenishment timing is unverified.**~~ **✅ CLOSED 2026-08-22 —
   a deleted replica does NOT wait out the 600 s interval.** Replacement replicas were created
   **15–60 s** after the previous one went healthy, and the gap is operator reaction time, not
   a Longhorn wait. Timestamps in §4.6; the contingent +90 min is removed from §7.

3. ~~**Which replica the extra-healthy cleanup culls is unverified.**~~ **✅ NO LONGER
   REACHABLE by this runbook.** That question only arose because the `low-power` procedure
   ended with a `numberOfReplicas` *shrink* while extra healthy replicas existed. The
   `low-power-off` procedure only ever grows (§6.2), so the cleanup path is never entered.
   The underlying behaviour is still unverified; it is simply no longer on the critical path.
   It becomes relevant again if this class is ever rolled back to 3 replicas.

4. **Overnight VolSync backups for the media tier are not addressed** (§10.2), and
   `low-power-off` makes this **worse, not better**. `VOLSYNC_STAGING_STORAGECLASS` /
   `VOLSYNC_CACHE_SNAPSHOTCLASS` default to `longhorn-snapshot` / `longhorn-cache`, both
   `nodeSelector: bulk`. Under `low-power` the source volumes were at least fully healthy
   overnight; under `low-power-off` they are **degraded** during exactly the window when the
   backup would run, on top of the mover-scheduling problem that already existed. Pointing the
   three apps at `longhorn-critical-snapshot` / `longhorn-critical-cache` (which
   [12](12-longhorn-critical-tier.md) created for this) is safe on a live app — unlike
   `VOLSYNC_STORAGECLASS`, those only affect the next throwaway mover volume. **Still not
   done**, and it is now the largest unaddressed consequence of this design.

5. **Steady-state write latency is the thing to watch during the soak** (§3.2), and the bar
   moved: the volumes went from **3-way to 5-way synchronous writes**. The measurements say
   "affordable at 4.2 IOPS"; they do not prove Plex library scans feel the same afterwards.
   **`plex` is SQLite and is the most exposed of the three.**

6. **THREE hand-maintained invariants now, all silent, all coupled.** Nothing checks any of
   them and every one of them fails by leaving the volumes reading `healthy` while the design
   is quietly wrong:
   - **`numberOfReplicas` must equal the size of the `low-power-off` tag.** Drop it below and
     the nightly shed starts rebuilding ~170 GiB into the empty control planes every night
     (§2.3). Raise the tag without raising the count and the same thing happens.
   - **`low-power-off` must remain exactly "the nodes the media apps can run on".** If a node
     gains or loses an Intel iGPU, or an app's nodeAffinity changes, the tag must follow.
   - **The alert rule's `node=~"fluttershy|kerfuffle"` regex must match the shed set** (§2.2.4).
     If the shed set changes, that is a *third* place to edit, in a different file, with
     nothing linking it to the other two.

   The tag also lives in **two** places — the live `nodes.longhorn.io` CRs and
   `talos/talconfig.yaml` — and only the CRs take effect, so those two can silently disagree
   (they do, right now, in the other direction: talconfig has `low-power-off` and the CRs do
   not). A cheap guard would be an alert on the eligible-node count, or a line in
   [24](24-power-states.md)'s node-tagging procedure.

7. ~~**Control-plane maintenance now degrades three more volumes.**~~ **⚠️ REOPENED AND
   WORSE.** The `low-power` revision closed this by pointing at two spare eligible nodes.
   `low-power-off` has **zero spares** (§6.7), so a downed eligible node strands these volumes
   degraded until it returns — the `critical`-era behaviour, chosen deliberately this time
   because it is the same property that makes the nightly window churn-free. A control-plane
   Talos upgrade will degrade all three volumes for the length of the drain and stall tuppr's
   next drain behind them.

8. **The `Scheduled` condition is unmonitored** (§8.3). `dataLocality: disabled` means this
   design should never set it — and post-migration it reads `True` on all three — but nothing
   would tell you if that assumption broke. **See item 12 for how much larger this problem
   turned out to be.**

9. **The three `volsync-src-*-cache` volumes carrying non-conforming `pegasus` replicas**
   (§4.2) are unrelated cruft this investigation surfaced. Harmless — `bulk`-selector volumes
   with a replica on a control plane — but evidence that the Tier-2 `nodeSelector` backfill
   doc 12 deferred is still outstanding.

10. **The `longhorn-media` class and the three live volumes drift apart by construction**
    (§10.2). A future edit to the class's `parameters` is delete-and-recreated onto the *class*
    by `force: true` and does **not** reach the existing volumes, which must be patched by
    hand. This has now happened twice in one day and nothing detects the divergence. **The
    class still has zero volumes provisioned against it.**

11. **Rebuild throughput was over-estimated by ~4×** (§7). Measured **26–33 MiB/s** onto the
    control-plane Transcend disks against a predicted median of **119 MiB/s**, and the
    historical `healthyAt − creationTimestamp` sample set that produced 119 has not been
    re-examined. Anything else in the estate planning a Longhorn migration off those historical
    figures is planning off a bad number. **Four of the seven `low-power-off` rebuilds target
    worker NVMe rather than control-plane SATA, which will produce the first clean comparison.**

12. **⚠️ NEW, AND THE BIGGEST FINDING HERE — three Longhorn volume alerts had been dead since
    this cluster was built** (§2.2.1). `longhorn_volume_robustness == 2` tests an enum the
    metric stopped being (it is one-hot with a `state=` label in v1.12.1), *and* the
    kube-state-metrics join used a `volumename` label that `kube_persistentvolume_info` does
    not have. Either fault alone is fatal; both were present. Prometheus reported the rules
    `health: ok` and `state: inactive` throughout, and there are **zero** `ALERTS` series for
    them in 30 days of retention.
    - `LonghornVolumeStatusWarning` and `LonghornVolumeStatusCritical` (**faulted** — data
      down) are **FIXED** in this change.
    - **`LonghornVolumeActualSpaceUsedWarning` is deliberately still dead.** The same one-line
      fix applies, but the fixed expression returns **eight** volumes today, three over 100 %.
      That needs its own triage pass — and a decision about whether
      `actual_size / capacity` is even meaningful for thin-provisioned volumes, since
      `longhorn_volume_actual_size_bytes` counts allocated blocks that never shrink after a
      delete. **Until then, nothing warns that a Longhorn volume is nearly full.**
    - **Wider lesson worth carrying:** every "no volume alerts fired" reassurance in this
      document set was true and meaningless. **A vendored example alert rule is a claim, not a
      guarantee**, and it should be checked against the live metric shape after every upgrade
      of the thing that emits it. The header of `pvc-usage-rules.yaml` now carries a 30-second
      recipe for doing exactly that.

13. **⚠️ NEW — the 09:00 recovery is UNVERIFIED, and `staleReplicaTimeout` may make it
    expensive.** §2.3 argues Longhorn has nowhere to rebuild at 02:00 and therefore waits and
    fast-resyncs at 09:00. The "nowhere to rebuild" half is well grounded in source. The
    "fast-resync" half is **assumed**. Against it: `staleReplicaTimeout` on these volumes is
    `"30"` — **minutes** — and Longhorn deletes failed replicas older than that when the
    volume still has healthy ones. If that fires at ~02:30, the overnight replicas are *gone*
    by morning and 09:00 becomes a full **~170 GiB rebuild every single day**, which would be
    a serious and continuing cost that nothing currently measures.
    **The first real night is the test** — §6.4's morning checklist is written for it. If
    replica `creationTimestamp`s change overnight, this design needs `staleReplicaTimeout`
    raised well past the seven-hour window (or the whole thing reconsidered).

14. **⚠️ NEW — a third eligible node failing during the window is invisible** (§6.7 item 3).
    The alert exclusion keys on "a media worker is not Ready", so during the shed it also
    suppresses a *genuine* extra failure that takes a volume from 3 healthy to 2. The
    `faulted` alert is not gated and would still fire on total loss, but the degraded-further
    case is hidden. This is the sharpest edge of the design and no cheap fix presents itself:
    distinguishing "degraded by exactly the expected two replicas" from "degraded by three"
    would need a replica-count metric the alert does not currently have.
