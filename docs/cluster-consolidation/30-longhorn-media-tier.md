# 30 — Longhorn media tier (ABANDONED)

> ## ⚠️ THIS DOCUMENTS A TIER THAT NO LONGER EXISTS.
>
> The `longhorn-media` StorageClass, the `low-power` and `low-power-off` node tags, and the
> scheduling machinery that moved `plex` / `jellyfin` / `dispatcharr` onto the control planes
> overnight were **all built and all reverted on 2026-08-22**, the same day.
>
> **Nothing described here is live.** The class is deleted, both tags are gone from
> `talos/talconfig.yaml`, and the three media config volumes are back on the ordinary
> `longhorn` (bulk) class, which is where they were before any of this started and where they
> stayed throughout — no PVC ever referenced `longhorn-media`.
>
> This file is kept, rather than deleted, for two reasons: several of the things learned
> along the way are true independently of the design that surfaced them (see
> [What is worth keeping](#what-is-worth-keeping)), and the next person to have this idea
> should be able to find out cheaply that it was tried.

**Created 2026-08-22. Rewritten three times that day as the design changed, then rewritten a
fourth time — this one — as the record of why it was dropped.** Unfiled, standalone. Sequel
to [12](12-longhorn-critical-tier.md) (which built `longhorn-critical` and the node-tag
machinery) and to [20](20-low-power-tier.md) §9.

---

## The question this was trying to answer

> When the nightly Low Power window sheds **both** media workers (`fluttershy` and
> `kerfuffle`), how do the `plex`, `jellyfin` and `dispatcharr` config volumes keep more than
> one healthy replica?

The premise was that both media workers would **power off** overnight, which meant the three
media apps had to relocate onto the control planes for the duration, which meant their config
volumes had to be reachable from there.

**The premise is what got reverted.** See [The decision](#the-decision-keep-the-workers-powered).

---

## The three shapes that were tried

Each one was a genuine attempt, and each failed for a different reason. The failures are the
useful part, because they are not independent — fixing one reliably broke another.

### Shape 1 — `bulk`, 4 replicas

**Put a replica on all four `bulk` nodes** (`fluttershy`, `kerfuffle`, `hard-hat`,
`shining-armor`) and let the two survivors carry the volume overnight.

**Why it failed: the volumes are `degraded` every night, and "degraded" has two teeth.**
Longhorn defines `degraded` as *fewer healthy replicas than `numberOfReplicas`*, so the
moment the two workers power off, a 4-replica volume with 2 healthy replicas is degraded by
definition. There is no configuration that avoids this — it is arithmetic, not policy.

1. **It pages, nightly, forever.** `LonghornVolumeStatusWarning` fires on degraded volumes.
   Three volumes × every night.
2. **It blocks Talos upgrades cluster-wide.** The tuppr health gate in
   `kubernetes/apps/system-upgrade/upgrades/talos.yaml` is:

   ```yaml
   - apiVersion: longhorn.io/v1beta2
     kind: Volume
     namespace: longhorn-system
     expr: status.robustness != "degraded"
     timeout: 15m
   ```

   **It names no volume.** It is a predicate over *every* `Volume` in `longhorn-system`, so
   any degraded volume anywhere stalls the next node drain for the full 15 minutes and then
   *fails* the upgrade — silently, because a blocked upgrade looks exactly like an idle one.
   A design that is degraded 02:00–09:00 hands the cluster a nightly seven-hour hole in which
   node upgrades cannot run.

An earlier variant — 5 replicas on a new `media` tag over the five Intel-QuickSync nodes —
was rejected for the same reason before it was built.

### Shape 2 — `critical` then `low-power`, 3 replicas

**Put the replicas only on nodes that stay powered overnight.** First
([#1051](https://github.com/david-driscoll/home-operations/pull/1051)) that meant
`nodeSelector: critical` — the three control planes. Then
([#1053](https://github.com/david-driscoll/home-operations/pull/1053)) a new **`low-power`
tag** on the *five* nodes that stay up: the three control planes plus `hard-hat` (up for
immich's GPU) and `shining-armor` (up because it hosts the backup volumes).

The `critical` → `low-power` move was itself a real correction, for two reasons that would
apply again to any future tag of this kind:

1. **`critical` borrowed a tag that means something else** — "Tier-0/1 storage tier" — and
   piled all three media config volumes onto the same three control-plane disks already
   serving the registry, home-assistant, technitium, mosquitto and tsidp.
2. **`critical` was needlessly narrow.** Three replicas over three eligible nodes leaves
   **zero spare**, so a single control-plane outage or Talos upgrade stranded these volumes
   degraded until the node came back. Over five eligible nodes there are two spares and a
   failed node self-heals.

**This shape worked.** Nights were genuinely spotless: no replica on a shed node, so
`usableCount` stayed at 3, nothing failed, nothing rebuilt, nothing alerted, no upgrade was
blocked. The migration was executed and `dispatcharr` and `plex` completed.

**Why it was rejected: it is remote all day.** The pods run on `fluttershy` or `kerfuffle`
for the ~17 hours a day the estate is awake, and neither node held a replica, so **every read
and write crossed the network during the entire period the volumes are actually used.**
`plex`'s config is SQLite — a latency workload, not a throughput one — so the expensive half
of the day was the remote half. Trading all-day latency for clean nights is the wrong
direction when the volumes are idle at night by definition.

### Shape 3 — `low-power-off`, 5 replicas, then 3

**Invert it: put replicas where the pods actually run.** A new `low-power-off` tag on the
five nodes with an Intel iGPU — both media workers plus the three control planes — which is
exactly the set that can run these apps. The pod then always sits on a node holding a local
replica: a worker by day, a control plane by night.

This bought daytime locality and immediately cost everything Shape 2 had gained, because a
replica on a node that powers off is a *failed* replica:

- **The volumes are degraded 02:00–09:00 every night by design** — straight back to Shape 1's
  problem, knowingly this time.
- **It forced the tuppr maintenance window on.** To stop the cluster-wide degraded gate from
  blocking drains for seven hours nightly, Talos upgrades were confined to a 2h daily window
  at 11:00. That is a real, permanent constraint on when the estate can be patched, accepted
  purely to work around a self-inflicted nightly degradation.
- **It forced an alert suppression.** `LonghornVolumeStatusWarning` had to be muted for these
  three PVCs whenever a media worker was NotReady — which means muted for exactly the window
  in which a *genuine* media-volume failure would be least visible.

At **5 replicas** there was nowhere to rebuild (every eligible node already held one), so
Longhorn waited and fast-resynced at 09:00. Dropping to **3 replicas** (for lower write
amplification) reintroduced the churn that five had removed:

> At 02:00 the two worker replicas fail, and there are two empty eligible control planes to
> rebuild onto. At 09:00 the workers return empty and `replicaAutoBalance: best-effort` moves
> replicas back — **required**, not incidental, because without it they would stay on the
> control planes and the daytime locality the tag exists for would be gone after one night.
>
> **~170 GiB copied each way, every night**, at the 26–33 MiB/s this cluster actually
> achieves (see [Rebuild throughput](#rebuild-throughput-was-4-slower-than-estimated)). That
> is roughly 1h36m of pure copying in each direction, nightly, forever, to save network reads
> on three config volumes that are largely served from page cache anyway.

**That is the point at which the whole approach stopped being worth it.** Every shape traded
one unacceptable cost for another; the machinery required to hold any of them in place — a
second descheduler profile, tolerations, soft affinities, a maintenance window, an alert
suppression, a bespoke node tag and a bespoke StorageClass — was large, interlocking, and
each piece existed only to compensate for a different piece.

---

## The decision: keep the workers powered

**`fluttershy` and `kerfuffle` STAY POWERED overnight.** They idle rather than shut down,
accepted on the basis that *running less means drawing less* — the Tier-2 workload shed
already scales their workloads to zero, so an idle node draws far below its working figure
without any of the machinery above.

Everything follows from that:

| Consequence | |
| --- | --- |
| The media apps never relocate | No tolerations, no soft affinity, no descheduler return trip |
| The volumes are never degraded on a schedule | No nightly alert, no suppression clause, no blocked drains |
| No maintenance window needed | Talos upgrades run whenever tuppr wants |
| The volumes stay on `longhorn` (bulk) | No `longhorn-media` class, no `low-power*` tags |

**What stays.** The nightly Tier-2 workload shed
([#1046](https://github.com/david-driscoll/home-operations/pull/1046)) is unaffected — it
sheds *workloads*, not *nodes*, and is the part that was actually delivering the saving. The
Gatus maintenance windows ([#1047](https://github.com/david-driscoll/home-operations/pull/1047))
and the Intel GPU per-node split
([#1048](https://github.com/david-driscoll/home-operations/pull/1048)) also stay.

**What this costs.** Piece [20](20-low-power-tier.md) §9 item 10 — powering nodes *off* on a
schedule — remains undelivered, and this document is the record of why the first serious
attempt at it was withdrawn rather than the record of it succeeding.

---

## What is worth keeping

These were all established during the work and are **true independently of the abandoned
design**. They are the reason this file still exists.

### Longhorn does NOT auto-evict tag-nonconforming replicas

**This is the single most useful finding here, and it is a trap in any future storage
migration.** Changing `nodeSelector` on a volume whose replica count is already satisfied
causes Longhorn to do **nothing at all**.

**Source — Longhorn v1.12.x, `controller/volume_controller.go`.** Rebuilds are driven by
`replenishReplicas()`, which calls `getReplenishReplicaCount()`. That function counts
replicas that are **usable** (roughly `r.Spec.FailedAt == "" && r.Spec.NodeID != ""`) and
returns `v.Spec.NumberOfReplicas - usableCount`. **It compares a COUNT against
`numberOfReplicas`. It never asks whether a replica's node still satisfies the volume's
tags.** The tag filter (`IsSelectorsInTags`) lives one layer down in the *scheduler* and runs
only when a **new** replica is being placed. No new replica is created, so the filter is
never consulted, so the stale replicas are never noticed.

Concretely: 3 healthy replicas, `numberOfReplicas: 3` → replenish count `0` → the volume
stays `healthy` with all three replicas on non-conforming nodes **indefinitely**. The patch
appears to succeed and changes nothing observable.

**Confirmed twice, from opposite directions:**

- Repointing `dispatcharr` from `["critical"]` to `["low-power"]` after its replicas were
  already on control planes moved **zero bytes and created no replica CR** — the same
  count-only logic that refuses to notice a *violating* replica equally refuses to notice
  that the eligible set just got *bigger*.
- Three volumes on this cluster were found carrying replicas that violate their own
  `nodeSelector` — `volsync-src-{tautulli,searxng,n8n}-cache`, all `sel=["bulk"]` with a
  replica on `pegasus`. They were provisioned from `longhorn-cache` when it had no selector;
  the selector was backfilled later. The replicas did not move, are not `failedAt`, and have
  `evictionRequested: false`.

Doc [12](12-longhorn-critical-tier.md) reached the same conclusion from source independently:
*"It does not move the replicas that are already placed […] Useful as an emergency stopgap
[…]; not a migration."*

**Practical consequence:** a live tag migration is **grow-then-shrink**, driven by hand —
raise `numberOfReplicas`, wait for the new conforming replicas, delete the non-conforming
ones, lower the count back. Never drop below 3 copies at any point. A `nodeSelector` patch
alone is not a migration and does not become one by waiting.

### `dataLocality: best-effort` mints permanent ghost replicas

When `best-effort` cannot be satisfied — because the attached node is outside the volume's
tag, and tags are a hard filter `best-effort` cannot override — Longhorn does not quietly do
nothing. It mints a **ghost replica**: `spec.nodeID: ""`, `status.currentState: stopped`,
`spec.hardNodeAffinity` pinned to the node that rejected it, `rebuildRetryCount` capped at 5,
and a permanent `Scheduled=False / LocalReplicaSchedulingFailure` condition on the volume.
Upstream calls this "tags not fulfilled"
([longhorn#7312](https://github.com/longhorn/longhorn/discussions/7312),
[longhorn#11007](https://github.com/longhorn/longhorn/issues/11007)).

It performs no I/O and cannot serve as a replenishment slot, so it is **cruft, not damage** —
but it is permanent and invisible. Live examples at the time of writing:

```
pvc-8cfbf411-… (teamarr)   replica: node=""  state=stopped  hardNodeAffinity=milky-way
pvc-4f906258-… (pinepods)  replica: node=""  state=stopped  hardNodeAffinity=othalla
```

both reporting `robustness: healthy` while carrying `Scheduled=False`.

> ⚠️ **Nothing alerts on this.** The Longhorn rules watch `robustness`, actual-space usage,
> node storage, node-down and CPU. **Nothing watches the `Scheduled` condition.** A volume can
> sit `Scheduled=False` with an orphan replica CR forever and no alert will ever say so.

### `kustomize.toolkit.fluxcd.io/force: enabled` on a PVC is a data-loss trap

`PersistentVolumeClaim.spec.storageClassName` is **immutable**.
`kubernetes/components/volsync/kustomization.yaml` stamps
`kustomize.toolkit.fluxcd.io/force: enabled` as a **commonLabel** on everything it emits —
the PVC included. Verified live: all three media PVCs carry it.

So changing `VOLSYNC_STORAGECLASS` in a `ks.yaml` makes Flux hit the immutable-field conflict
and, because `force` is enabled, **delete and recreate the PVC — destroying the data.**
`components/volsync/AGENTS.md` already says it: *"Expanding `VOLSYNC_CAPACITY` is safe;
changing storage class is not."*

**A live storage-class migration goes via the Volume CR, never via the PVC.** Editing
`storageClassName` in Git is safe only at a deliberate re-provision (a VolSync restore, a
namespace rebuild, a DR event).

Related, and the first time the flag was ever exercised: **`force: true` on
`storageclass/ks.yaml` really does delete-and-recreate a StorageClass** when `parameters`
change — confirmed by `longhorn-media`'s `creationTimestamp` landing one minute after #1053
merged and thirty minutes after #1051 had created it. That is correct and safe *for that
directory specifically*, because it contains only StorageClasses, which hold no data. The
failure mode without the flag is silent: the Kustomization goes not-Ready with "updates to
parameters are forbidden" and the live class keeps its old values.

### Rebuild throughput was ~4× slower than estimated

Measured on the real 2026-08-22 run, `metadata.creationTimestamp` → `spec.healthyAt`:

| Rebuild | Bytes | Elapsed | Throughput |
| --- | --- | --- | --- |
| `dispatcharr` → `othalla` | 1.65 GiB | 63 s | 26.8 MiB/s |
| `dispatcharr` → `milky-way` | 1.65 GiB | 65 s | 26.0 MiB/s |
| `dispatcharr` → `pegasus` | 1.65 GiB | 65 s | 26.0 MiB/s |
| `plex` → `othalla` | 23.07 GiB | 821 s | 28.8 MiB/s |
| `plex` → `milky-way` | 23.07 GiB | 715 s | 33.0 MiB/s |
| `jellyfin` → `othalla` | 59.95 GiB | 1039 s (to 52 %) | 30.7 MiB/s |

**~26–33 MiB/s onto the control-plane Transcend SATA disks, against a predicted median of
119 MiB/s** derived from historical `healthyAt − creationTimestamp` samples.

**Use ~30 MiB/s for planning any future Longhorn migration on this cluster.** Two candidate
explanations for the bad prediction, neither verified: the fast historical samples may have
been `fast-replica-rebuild` checksum diffs against retained data rather than full copies, or
a live daytime workload competes for those disks in a way an idle historical rebuild did not.

### A deleted replica is replenished in 15–60 s, not after 600 s

`replica-replenishment-wait-interval` is 600 s, and the migration runbook was originally
budgeted assuming a deleted replica would wait it out. **It does not.** Replacements were
observed created **15–60 s** after the previous replica went healthy.

The 600 s interval governs the *failed*-replica path — how long Longhorn waits before giving
up on a replica that might come back — not the deliberate-deletion path. This matters in both
directions: it makes a grow-then-shrink migration much faster than budgeted, and it means a
"delete then shrink" step done slowly will start a **real rebuild** in the gap rather than
harmlessly failing to schedule.

### The dead alerts

Checking that `LonghornVolumeStatusWarning` would actually fire — before suppressing it —
turned out to be the most valuable thing in the entire effort.

**It had never been able to fire. Neither had two others.** Two independent faults, either
fatal on its own:

1. **`longhorn_volume_robustness == 2` tests an enum the metric stopped being.** It used to
   be one series per volume valued 0=unknown / 1=healthy / 2=degraded / 3=faulted. In
   Longhorn v1.12.1 it is **one-hot**: four series per volume carrying
   `state="unknown|healthy|degraded|faulted"`, each valued 0 or 1. Verified live — 196 volumes
   → 784 series, and no `2` anywhere.
2. **The PVC join was broken independently.** The expression reached the PVC name through
   `kube_persistentvolume_info{volumename=~"pvc-.*"}`. **That metric has no `volumename`
   label** — it is `persistentvolume` — so the selector matched 0 of 200 series and collapsed
   the join to empty. The outer `on(volume)` was equally unmatchable.

**The failure is silent by construction.** PromQL returning an empty vector is valid, so
Prometheus reported `health: ok`, `state: inactive`, forever. Zero `ALERTS` series in 30 days
of retention for all three, while the non-joined Longhorn alerts in the same file fired
normally. **For the life of this cluster a volume could have gone degraded — or FAULTED, data
down — and nothing would have paged.**

`LonghornVolumeStatusWarning` and `LonghornVolumeStatusCritical` are **fixed and kept**; the
fix is unrelated to the abandoned tier and outlives it. Longhorn now exports `pvc` and
`pvc_namespace` directly on these metrics, so the join is unnecessary as well as broken:

```promql
# LonghornVolumeStatusWarning
longhorn_volume_robustness{state="degraded"} == 1

# LonghornVolumeStatusCritical
longhorn_volume_robustness{state="faulted"} == 1
```

> ⚠️ **Label rename.** The alerts now carry `pvc` / `pvc_namespace` instead of
> `persistentvolumeclaim` / `namespace`. `namespace` is still present but is the **scrape**
> namespace (`longhorn-system`), not the PVC's. Nothing in this repo matched on the old names,
> because these alerts had never fired.

**`LonghornVolumeStatusWarning` carries no suppression clause.** One briefly existed, gating
on media-worker readiness, and it was removed with the rest of this design — see the comment
in `kubernetes/apps/longhorn-system/longhorn/rules/pvc-usage-rules.yaml`, which explains why
it must not come back.

> ### ⚠️ STILL OPEN: `LonghornVolumeActualSpaceUsedWarning` is still dead.
>
> It has the same broken join and the same one-line fix — delete the join, leaving
> `(longhorn_volume_actual_size_bytes / longhorn_volume_capacity_bytes) * 100 > 90`. **It was
> deliberately not fixed**, because that expression returns **eight** volumes today, three of
> them over 100 % (thin-provisioned volumes whose actual size has caught up with their nominal
> capacity). Fixing it ships an eight-alert pager storm.
>
> **This is a real, known gap: nothing currently warns that a Longhorn volume is nearly
> full.** It wants its own change — triage the eight, and decide whether
> `actual_size / capacity` is even the right ratio for thin provisioning (it arguably is not;
> `longhorn_volume_actual_size_bytes` counts allocated blocks, which never shrink after a
> delete), then enable.

**How to re-check the metric shape after a Longhorn upgrade** — 30 seconds, and worth doing,
because this class of breakage is invisible:

```bash
kubectl -n observability port-forward pod/prometheus-prometheus-0 9090:9090
curl -sG --data-urlencode 'match[]=longhorn_volume_robustness' localhost:9090/api/v1/labels
# expect `state`, `pvc`, `pvc_namespace`, `volume` in the label list
curl -sG --data-urlencode 'query=longhorn_volume_robustness{state="healthy"}==1' \
  localhost:9090/api/v1/query | jq '.data.result|length'
# expect: roughly the number of ATTACHED volumes, not 0
```

---

## If someone tries this again

The constraint that defeated every shape is worth stating on its own, because it is a
property of Longhorn and the tuppr gate, not of this particular design:

> **You cannot have all three of: a replica on the node the pod runs on, no replica on a node
> that powers off, and a pod that follows the power schedule.** Pick two. Shape 2 gave up the
> first, Shape 3 gave up the second, and Shape 1 gave up the second more expensively.

And the cluster-wide tuppr gate (`status.robustness != "degraded"`, naming no volume) means
the second of those is not a local cost — **any** scheduled degradation anywhere becomes a
cluster-wide upgrade freeze. Any future design in this space should either scope that gate to
specific volumes first, or accept that scheduled degradation is off the table entirely.

The remaining escape that was never tried: **narrow the tag to exactly three nodes — both
workers plus one control plane.** That restores "nowhere to rebuild" (three replicas, three
eligible nodes) while keeping daytime locality, at the cost of zero spare capacity and still
being degraded nightly. It does not solve the tuppr gate, so it was not pursued.

---

## See also

- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — `longhorn-critical` and the
  node-tag machinery this built on; independently reached the "a `nodeSelector` patch is not a
  migration" conclusion.
- [20-low-power-tier.md](20-low-power-tier.md) — the Low Power tier, §9 item 10 (scheduled
  node power-off, still undelivered).
- [24-power-states.md](24-power-states.md) — Low Power vs Battery, and the storage-class
  summary.
- [29-taint-readiness-audit.md](29-taint-readiness-audit.md) — the control-plane taint, and
  the descheduler `nodeFit` churn it causes. `nodeFit: true` shipped in
  [#1051](https://github.com/david-driscoll/home-operations/pull/1051) alongside this design
  and **was deliberately kept** through the revert; its cause is the taint, not the media
  relocation.
