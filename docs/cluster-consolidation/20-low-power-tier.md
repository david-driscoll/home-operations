# 20 — Low-power / control-plane-only operating mode (S′)

Sub-issue anchor **S′** ([vault#84](https://github.com/david-driscoll/vault/issues/84),
[Expansion v2.1](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583)
§3, "Q-E"). Implements decision **D6**: a deliberate 3–4h+ operating posture, on battery,
where the cluster "limps along" on control planes alone. This is not a disaster-recovery
mode — it is a *planned* posture David enters on purpose, on Pecron F3000LFP battery power,
runbook-driven.

> *"I want to ensure that the cluster can still limp along if the 3 control plane nodes are
> all that is running (during low power situations). It should run the minimum critical
> services if possible."* — [Q-E answer](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112326099)
>
> *"Ideally the cluster could run in a low power state for 3 to 4 hours, or more. They are
> connected to [a Pecron F3000LFP portable power station](https://www.pecron.com/products/pecron-f3000lfp-portable-power-station-3600w-3072wh)
> with 2 others available as needed for outages."* — [follow-up](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734)
>
> *"Yes, home assistant is tier 1, if the lights stop working the wife gets upset."* — [same comment](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734)

**Read this file standalone.** It does not assume you have read vault#84.

---

## Status — 2026-08-22, fifth revision, re-verified live against `admin@equestria`

> ### ⚠️ REVERSAL — 2026-08-22 evening. The media workers are NOT shed.
>
> Earlier the same day, #1051/#1053/#1054 built machinery to relocate `plex`, `jellyfin` and
> `dispatcharr` onto the control planes so that **both** media workers (`fluttershy`,
> `kerfuffle`) could power down overnight. **That was reverted the same evening.** It caused
> more complexity and operational pain than it was worth — see
> [30](30-longhorn-media-tier.md), which is now the record of an abandoned design.
>
> **The new posture: `fluttershy` and `kerfuffle` STAY POWERED overnight.** They idle rather
> than shut down, accepted on the basis that *running less means drawing less* — the Tier-2
> shed already scales their workloads to zero. The media apps therefore never move, and their
> volumes are back on the ordinary `longhorn` (bulk) class.
>
> **Reverted:** the control-plane tolerations and soft worker-iGPU affinity on the three media
> apps; the `LowPowerReturnProfile` descheduler profile; the `longhorn-media` StorageClass; the
> `low-power` and `low-power-off` Longhorn node tags; and the tuppr maintenance window.
> **Kept:** #1046's nightly Tier-2 workload shed (it sheds *workloads*, not *nodes*, and is
> unaffected), #1047's Gatus maintenance windows, #1048's Intel GPU split, and the descheduler
> `nodeFit: true` fix (its cause is the control-plane taint — see
> [29](29-taint-readiness-audit.md) — not the media relocation).
>
> Read the #1051/#1053 rows in the table below as **history, not current state.**

**Low Power now runs on a schedule. Battery — this file's S′ — is still a manual runbook and
has still never been run.** Four PRs merged on 2026-08-22 and between them deliver part of
§9 item 10 ("automate entering a low-power state at night"):

| PR | What landed | Verified how |
|---|---|---|
| [#1046](https://github.com/david-driscoll/home-operations/pull/1046) | py-kube-downscaler `--default-downtime=Mon-Sun 02:00-09:00 ${TIMEZONE}` — Tier 2 sheds every night; the eleven keep-list workloads carry `downscaler/exclude: "true"` in Git and survive. `system-upgrade` (tuppr) excluded so a shed cannot stop a node upgrade halfway | live 2026-08-22: `kube-system/kube-downscaler-py-kube-downscaler` runs with that arg, `${TIMEZONE}` resolved to `America/New_York` out of the `shared-secrets` Secret rather than hardcoded |
| [#1047](https://github.com/david-driscoll/home-operations/pull/1047) | Gatus `maintenance-windows` (`start: "02:00"`, `duration: 7h`, `timezone: ${TIMEZONE}`) on the **26** `definition.yaml` files whose services actually shed. Required un-pruning the Gatus fields on the `ApplicationDefinition` CRD, and brought the JSON schemas **and a real type generator** (`schemas/`, `scripts/generate-types.ts`, `mise run codegen`) into this repo from `stargate-command-cluster` — the generator had never existed here | 26 files carry the block; `schemas/` and `scripts/generate-types.ts` are present in-tree |
| [#1048](https://github.com/david-driscoll/home-operations/pull/1048) | Intel GPU plugin split per node class: `intel-gpu-plugin` on the control planes (`sharedDevNum: 2`, and the **only** release that creates the fixed-name `NodeFeatureRule`) and `intel-gpu-plugin-workers` (`sharedDevNum: 3`, correcting the old and wrong `5`). Also right-sized the media apps — plex 6 CPU/4Gi/8Gi → 1 CPU/1Gi/4Gi with no CPU limit, jellyfin 4 CPU → 1 CPU and 8Gi → 4Gi, dispatcharr 1 CPU → 300m | live: both `GpuDevicePlugin` CRs exist with those ratios and disjoint device-id selectors (`46d4` control planes, `46a6` workers) |
| ~~[#1051](https://github.com/david-driscoll/home-operations/pull/1051)~~ **REVERTED same day** | Shed **both** media workers: control-plane tolerations plus a **soft** (weight 100) node affinity toward the worker iGPU on plex/jellyfin/dispatcharr; a second descheduler profile running `RemovePodsViolatingNodeAffinity` with `evictLocalStoragePods: true` and `nodeFit: true` for the 09:00 return trip; and the `longhorn-media` StorageClass | **Backed out 2026-08-22 evening.** Only `nodeFit: true` on the *DefaultProfile* survives, for an unrelated reason ([29](29-taint-readiness-audit.md)). See [30](30-longhorn-media-tier.md) |
| ~~[#1053](https://github.com/david-driscoll/home-operations/pull/1053)~~ / ~~[#1054](https://github.com/david-driscoll/home-operations/pull/1054)~~ **REVERTED same day** | The **`low-power`** Longhorn node tag (five nodes that stay powered overnight), then **`low-power-off`** (the five Intel-iGPU nodes), with `longhorn-media` repointed at each in turn; plus the tuppr maintenance window that `low-power-off`'s nightly degradation forced on | **Backed out 2026-08-22 evening.** Both tags removed from `talconfig.yaml`, class deleted, maintenance window re-commented. The three media PVCs were always on `longhorn` and never moved |

**Keep Low Power and Battery apart when reading this file.**
[24](24-power-states.md)'s **Low Power** is what runs nightly: *workloads* scale to zero,
**no node powers off**. **Battery** is the S′ posture this file specs: *every* worker down,
Tier 0/1 only, on the Pecron. Low Power is not a small Battery — different node set, different
tooling, different keep-list. Nothing in §6's runbook or §8's rehearsal has been overtaken by
the nightly schedule.

**What is still manual, stated because "automated" is easy to over-read:** nothing powers a node
off or wakes one up on a schedule, and after the 2026-08-22 reversal nothing is *intended* to,
overnight. #1046 sheds *workloads*; node shutdown and the WoL return trip remain §6's human
runbook for a Battery event.

**§4 IS DONE AND LIVE.** Both halves landed on 2026-08-21:
[#1001](https://github.com/david-driscoll/home-operations/pull/1001) (Tier-0/1 tolerations) and
[#1002](https://github.com/david-driscoll/home-operations/pull/1002) (the taint). All three
control planes now carry `node-role.kubernetes.io/control-plane:NoSchedule`; all six Tier-0/1
workloads carry the toleration; the §4 audit returns exactly the Tier-2 set and nothing else.

Post-flip verification (29 §7) passed clean: no `FailedScheduling` events, nothing newly
`Pending`, every DaemonSet that covered 7 nodes still covers 7, 0 degraded and 0 faulted volumes,
Flux 0 not-ready. `mosquitto-0` is running on `othalla` — a tainted control plane — which is the
positive proof that the tolerations work rather than merely being present.

**Every hardware question in this file is now closed**, all answered by David on 2026-08-20/21:
the battery powers **alpha-site**; all three bare-metal workers can be started by **WoL** (§6.2);
**celestia and luna are on battery** and **skystar is remote**; and **the network and the Internet
uplink are on the battery too** (§7). What is left is measurement, not enquiry — the battery
carries more than the three control planes D6's "3–4 h+" was reasoned about, and
`pecron_runtime_remaining_seconds` reports the truth (§8).

The 2026-08-19 revision said "the remaining work is a build, not a wait." That build is done and
applied. The honest reading now is **"a storage burndown, then rehearse"** — §9 items 1 and 8 are
the only things left between here and §8 Stage 1.

**The taint was not applied with `mise run talos:apply`, and that matters** — see §4's
"How it was actually applied". A blanket apply would have carried an in-flight Kubernetes
upgrade with it.

Everything below marked "verified" was re-checked live with read-only `kubectl`/`talosctl` —
2026-08-19 (evening) for the storage and tier tables, 2026-08-20 (evening) for §6.0's pre-flight,
§9's toleration audit and 29's four-command gate, and 2026-08-22 for the four PRs in the table
above. **Correction to the third revision's closing sentence, which said "the taint has not been
applied":** that was already stale when it was written — the taint was applied on 2026-08-21, as
the top of this section says and as §6.0 check 1 verifies live.

### What changed between this morning's revision and this one

| Claim in the morning revision | Status now |
|---|---|
| §0.1 `taint-toleration` accepted but `applied: false`; needs an all-volumes-detached window | **CLEARED.** `applied: true`, all three managed DaemonSets and every instance-manager carry the annotation. It did **not** take a quiesce window — §0.1 |
| §0.2 zero Longhorn node tags, no `longhorn-critical`, default class unconstrained | **CLEARED.** [12](12-longhorn-critical-tier.md) landed (PR #960). Tags live, `longhorn-critical` exists, default `longhorn` is `nodeSelector: bulk` — §0.2 |
| §0.3 Tier-1 DNS cannot run on a control plane; three candidate fixes, needs David | **DECIDED.** Technitium **moves to the control planes**; the ipvlan NAD rebinds from `enp2s0` to `enp3s0`. §0.3 is now a design, not a question |
| §2 `postgres-3` is stranded on `othalla` with a `longhorn-local` PV that cannot move | **No longer true.** `postgres-3` is on **`kerfuffle`** (worker), PV `nodeAffinity: kerfuffle`, cluster healthy 3/3. [29](29-taint-readiness-audit.md)'s blocker 2 is resolved |
| [29](29-taint-readiness-audit.md): "**NOT SAFE TO FLIP** `allowSchedulingOnControlPlanes`" | **All four of 29 §7's gate commands now pass** — §0.1. The flip is safe *for the flip*; it still does not by itself deliver low-power mode |
| §5: Tier-1 volumes are degraded but mostly hold 2 control-plane replicas | **Resolved, via a detour.** It first got *worse* (every Tier-1 volume down to at most one control-plane replica), then PRs #963/#966 moved all seven onto `longhorn-critical` — three-of-three on the trio, all `healthy` — §5 |

### What is actually left

The gate has moved from "three things are broken" to "three things are unbuilt":

1. ~~**Technitium has not moved yet.**~~ **Done 2026-08-20** — §0.3.
2. ~~**Tier 0/1 tolerations and the `critical-tier` PriorityClass are unbuilt.**~~ **Built; the
   toleration half is live.** The PriorityClass landed in PR #970; the tolerations in
   [#1001](https://github.com/david-driscoll/home-operations/pull/1001), **merged and reconciled
   2026-08-21**. The taint flip is
   [#1002](https://github.com/david-driscoll/home-operations/pull/1002) — still draft, still
   unapplied, because it is applied by `talos:apply` rather than by Flux. §4.
3. ~~**`kube-system/registry` is Tier 0 with zero control-plane replicas.**~~ **Answered
   2026-08-21** — and the premise was wrong: the registry was not in the pull path at all.
   Fixed across #1012/#1013/#1015/#1016; the storage half (#1014) is a deliberate open
   decision. §9 item 1 has the whole account.

**Both questions that needed David are answered, 2026-08-20.** The battery powers alpha-site,
so identity, the transit seal, netboot and the `pecron-monitor` telemetry all survive a grid
outage (§7) — that was the item deciding whether a window is *worth* entering. And all three
bare-metal workers can be started by WoL (§6.2), retiring the exit scenario that needed someone
physically at three machines. One narrower question is left in their place: whether `celestia`,
`luna` and `skystar` are on battery, which decides how much of §0.3's off-cluster DNS redundancy
is real — §9 item 4.

**Closed the same day, by work landing in parallel:** the Tier-1 PVCs moved to
`longhorn-critical` (PRs #963, #966), so every Tier-1 volume now holds three
control-plane replicas instead of at most one — §5. That was this file's item 1 for most of
the day.

---

## 0. Preconditions — where each one now stands

### 0.1 — CLEARED: Longhorn's `taint-toleration` is applied

Live, 2026-08-19 evening:

```console
$ kubectl get settings.longhorn.io -n longhorn-system taint-toleration \
    -o custom-columns=VALUE:.value,APPLIED:.status.applied
VALUE                                              APPLIED
node-role.kubernetes.io/control-plane:NoSchedule   true

$ kubectl -n longhorn-system get ds -l longhorn.io/managed-by=longhorn-manager \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.metadata.annotations.longhorn\.io/last-applied-tolerations}{"\n"}{end}'
engine-image-ei-493e04e7  [{"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]
engine-image-ei-a4d05f02  [{"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]
longhorn-csi-plugin       [{"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]
```

Every instance-manager — all seven, including the three on `milky-way`/`othalla`/`pegasus`
that this file specifically called out as missing it — carries the same annotation.

**It did not take the maintenance window this file specified.** The earlier text (and
[29](29-taint-readiness-audit.md) §7 step 3, and `values.yaml`'s "DETACH CAVEAT" comment)
said the only supported path was a full estate quiesce with every Longhorn volume detached.
That is not what happened, and the reason is worth recording because it changes the cost of
every future danger-zone setting:

`getNotUpdatedTolerationList` (`controller/setting_controller.go:571`) compares **only the
`longhorn.io/last-applied-tolerations` annotation** against the setting — never the live pod
spec. If every collected object's annotation already matches, `updateTaintToleration()`
returns `nil` **before** `AreAllVolumesDetachedState()` is ever consulted, and
`Setting.Status.Applied` flips `true`. Hand-writing the annotation onto the 17
`longhorn.io/managed-by=longhorn-manager` objects (plus the instance-manager, share-manager
and backing-image-manager pods) therefore lands the setting with **zero** detach window.
Verified against `longhorn-manager` **v1.12.1** and executed live with `restartCount: 0` on
every patched pod and no workload scaled down.

Three properties make it safe rather than a hack, and all three were checked in source:

- `updateTolerationForDaemonset` is an in-place `UpdateDaemonSet`
  (`setting_controller.go:606`), **not** a delete/recreate — so the hand-patched end state is
  byte-for-byte what the controller would have written.
- Kubernetes permits **adding** tolerations to a running pod, which is why the disruptive
  objects (instance-manager, share-manager) took the patch live. The injected `NoExecute`
  not-ready/unreachable pair must be included in the patch, since only additions are legal.
- Nothing reverts it: the engine-image controller only builds a DaemonSet when one is
  **absent** (`controller/engine_image_controller.go:257`), and `csi/deployment_util.go:200`
  short-circuits on CSI version match. Neither reconciles tolerations on an existing object.

> **Do not generalise this.** `priority-class`,
> `system-managed-components-node-selector` and `storage-network` sit behind the same gate
> for materially different reasons. A toleration is uniquely safe because it only *widens*
> where a pod may schedule and cannot evict anything. The other three change where data
> lives or how it is reached.

**Consequence: [29](29-taint-readiness-audit.md)'s flip gate is now fully green.** All four
of its §7 step 5 commands pass, and its blocker 2 (`postgres-3`) resolved independently —
the instance is on `kerfuffle` with its `longhorn-local` PV pinned there, cluster healthy
3/3. Flipping `allowSchedulingOnControlPlanes: false` is safe *for the flip*. It is still
not sufficient for low-power mode on its own — see §4 and the caveat in 29 §7 item 6.

### 0.2 — CLEARED: piece 12 landed, with one caveat that matters more than it looks

Live, 2026-08-19 evening:

```console
$ kubectl get nodes.longhorn.io -n longhorn-system \
    -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags
NAME            TAGS
fluttershy      [bulk]
hard-hat        [bulk]
kerfuffle       [bulk]
milky-way       [critical]
othalla         [critical]
pegasus         [critical]
shining-armor   [bulk]

$ kubectl get sc longhorn -o jsonpath='{.parameters.nodeSelector}'
bulk
$ kubectl get sc longhorn-critical -o name
storageclass.storage.k8s.io/longhorn-critical
```

The §0.2 failure mode this file was most worried about — Longhorn replenishing Tier-2
volumes onto the control-plane SATA disks ten minutes into a window — **is fixed for new
replicas**. `replica-replenishment-wait-interval` is still `600`, but the default class now
carries `nodeSelector: bulk`, so what it replenishes onto is worker disks.

**The caveat: adding the selector to the StorageClass stamped it onto volumes, but did not
relocate a single existing replica.** Live:

| Volume | `spec.nodeSelector` | Replicas |
|---|---|---|
| `kube-system/registry` | `["bulk"]` | `hard-hat`, **`othalla`**, **`milky-way`** |
| `network/crowdsec-config-pvc` | `["bulk"]` | **`othalla`**, **`pegasus`**, `hard-hat` |
| `network/crowdsec-ui` | `["bulk"]` | **`pegasus`**, `fluttershy`, **`othalla`** |
| `tailscale-system/volsync-tsiam-dst-dest` | `["bulk"]` | `hard-hat`, **`pegasus`**, **`milky-way`** |

A `bulk`-selected volume with two replicas on the `critical` trio is not a contradiction
Longhorn will resolve on its own — the selector governs *where a new replica may be
scheduled*, not where existing ones sit. Piece 12's proof passed because it was run against
a **freshly provisioned** PVC. This is the "Tier-2 backfill" item 12 leaves open, and it is
the reason §0.2 is marked cleared-with-caveat rather than simply cleared: the control-plane
disks are still carrying Tier-2 data, so the thermal argument that motivated §0.2 is only
half-retired. Draining them is a rebuild-per-volume and belongs to 12, not here.

### 0.3 — DONE: Technitium runs on the control planes

> **Executed 2026-08-20.** The label move applied to all four affected nodes with
> `--mode=no-reboot` (one line of diff each, no reboot required), and one
> `rollout restart` cut the pod over. Live now: `technitium-57c594c6b4-jlm24`
> **Running 2/2 on `milky-way`**, its ipvlan `net1` holding `10.10.206.202` with
> MAC `e0:51:d8:19:93:18` — milky-way's own `enp3s0`, which is what ipvlan L2
> sharing the parent MAC looks like when it has bound the right interface. Its
> Longhorn volume is `attached` on `milky-way`, `healthy`. `dig @10.10.206.202`
> answers both an internal name (`home-assistant.driscoll.tech` →
> `ponyville.driscoll.tech` → `10.10.206.101`) and an external one
> (`github.com` → `140.82.113.3`), and the three off-cluster members still agree.
>
> The half-applied window this section warned about was real and did occur: PR
> #970 merged the NAD change, Flux applied it, and for several hours the cluster
> ran with a NAD bound to `enp3s0` while the only labelled node was `hard-hat`,
> which has `enp2s0`. Nothing broke, because a NAD is only read at pod creation
> and the pod was not recreated in that window — which is exactly the shape of
> the trap: it is invisible until something unrelated restarts the pod. **If a
> future change splits these two files again, land them in the same window.**

### 0.3 (design, as decided) — Technitium moves to the control planes

**David's call, 2026-08-19:** *"I would like technitium to move to the control plane if
possible, if that means we change the adapters it's allowed to connect to, lets do that."*

That selects a variant of the earlier option (a) — but a simpler one than (a) as written.
(a) proposed a *second* CP-resident Technitium member alongside the worker-resident one.
The decision is to **move the existing one**, which means there is no second cluster member
to keep in sync and no second LAN address to reserve.

**Why the move is mechanically safe: it is one broadcast domain.** The two NIC names differ
(`enp2s0` on the workers, `enp3s0` on the control planes) but the L2 segment does not:

| Node | Role | LAN NIC | Address |
|---|---|---|---|
| `milky-way` | control plane | `enp3s0` | `10.10.209.10/16` |
| `othalla` | control plane | `enp3s0` | `10.10.209.11/16` |
| `pegasus` | control plane | `enp3s0` | `10.10.209.12/16` |
| `hard-hat` | worker (today's Technitium node) | `enp2s0` | `10.10.206.14/16` |

Every node is a `/16` inside `10.10.0.0/16` behind gateway `10.10.0.1`, which
`talos/talconfig.yaml` already relies on for the shared API VIP and states in its own
comment: *"one broadcast domain."* So the NAD's static `10.10.206.202/16` is equally valid
bound to `enp3s0` on a control plane as to `enp2s0` on a worker — same segment, different
parent interface, no renumbering, no change to `TECHNITIUM_VIP`, and no change to anything
that dials it.

**The change is three edits and a toleration:**

1. **`talos/talconfig.yaml`** — move `technitium-dns: "true"` off `hard-hat`'s `nodeLabels`
   (line 151, whose comment *"it has enp2s0, required for ipvlan L2 NAD"* is exactly the
   constraint being retired) and onto all three control planes. The CP blocks currently use
   the bare `nodeLabels: *nodeLabels` anchor and need the `<<: *nodeLabels` merge form that
   `hard-hat` already demonstrates.
2. **`kubernetes/apps/equestria/dns/technitium/macvlan-nad.yaml`** — `"master": "enp2s0"` →
   `"enp3s0"`. One word. The file name says macvlan; the `type` is `ipvlan`.
3. **A control-plane toleration on the Technitium Deployment**, required before the §4 taint,
   not after — a `nodeSelector` that only matches tainted nodes and no toleration is an
   unschedulable pod.

**Cutover order matters, and both obvious orders are wrong.** A `NetworkAttachmentDefinition`
is read at *pod creation*, and a `nodeSelector` is evaluated at *scheduling* — neither
disturbs a running pod. But each change on its own leaves a latent break:

- NAD first: the pod still runs on `hard-hat`, and the next recreate — a node reboot, an
  eviction, a Renovate-driven image bump — schedules it there with a NAD binding `enp3s0`,
  which `hard-hat` does not have. CNI fails, `ContainerCreating`, DNS gone, and the cause is
  hours or days removed from the change.
- Label first: `hard-hat` loses `technitium-dns=true`, the control planes gain it, and the
  next recreate lands on a control plane with a NAD still binding `enp2s0`. Same failure,
  other end.

Because neither change touches the running pod, the safe sequence is to land **both** and
then cut over deliberately, exactly once:

```bash
# 1. Land the NAD change (Flux) and the talconfig labels (Talos). Order between these two
#    does not matter; the running pod is unaffected by both.
talosctl --talosconfig talos/clusterconfig/talosconfig \
  -n 10.10.209.10,10.10.209.11,10.10.209.12 apply-config --mode=no-reboot -f <rendered>

# 2. Confirm the label landed on the trio and left hard-hat
kubectl get nodes -L technitium-dns

# 3. Confirm the NAD is live with the new parent
kubectl -n network get network-attachment-definitions technitium-dns-net \
  -o jsonpath='{.spec.config}' | grep master

# 4. Cut over — one deliberate recreate, Recreate strategy, replicas: 1, so the static
#    ipvlan address is never claimed twice
kubectl -n network rollout restart deployment technitium

# 5. Verify from off-cluster, not from inside it
kubectl -n network get pods -o wide -l app.kubernetes.io/name=technitium
dig @${TECHNITIUM_VIP} +short home-assistant.driscoll.tech
```

The DNS gap is one pod start. The three off-cluster members answer throughout, and nothing on
the LAN or in Talos points at this copy anyway — which is what makes a deliberate cutover the
right shape here rather than a maintenance window.

**The toleration is already present.** `defaultPodOptions.tolerations` on the HelmRelease
already carries `node-role.kubernetes.io/control-plane: Exists / NoSchedule` — left over from
when `hard-hat` *was* a control plane, with a comment that said so. Retained deliberately: it
is exactly what the §4 taint will require, and its comment is corrected in the same change.

**Storage was the part that was not one word, and it is already done.** When this decision
was taken, Technitium's PVC sat on the default `longhorn` class — which piece 12 had just
confined to `bulk`, the exact opposite of where the pod was going. Moving the pod without
the volume would have produced a DNS server pinned to the control planes whose storage was
pinned to the workers: strictly worse than not moving it. **PR #963 moved it**, and live
2026-08-19 `network/technitium` is on `longhorn-critical` with all three replicas on
`milky-way`/`othalla`/`pegasus`, `healthy` (§5). The pod move is now purely a scheduling
change, which is what makes it small.

**What this decision does *not* rest on, but is worth recording as defence in depth:** the
estate already has three Technitium cluster members outside equestria, and the in-cluster
copy is not what LAN clients or cluster nodes actually resolve against.

- `dns-celestia`, `dns-luna` and `dns-skystar` (`100.111.{30,40,50}.101`) each answer for
  `driscoll.tech` live. They share config sync with the in-cluster member, which the
  HelmRelease comments already note (*"After the node joins the Technitium cluster, cluster
  sync owns most of these settings"*).
- LAN clients are handed the **Dockge** hosts, not `TECHNITIUM_VIP`:
  `stacks/unifi-network/local-dns.ts:66` derives the four DHCP DNS slots from
  `nodeType === "dockge"` hosts on the Home subnet.
- Cluster nodes never point at it either: `talos/patches/global/machine-network.yaml` lists
  `9.9.9.9`, `149.112.112.112`, `10.10.10.9`, `10.10.0.1`. CoreDNS forwards `.` to
  `/etc/resolv.conf`, so in-cluster resolution during a window depends on those four, not on
  the in-cluster Technitium.

The morning revision's framing — *"a low-power window means the estate has no in-cluster
resolver, and the wife's lights depend on whatever Home Assistant can reach without one"* —
was therefore overstated on the second half. Losing the in-cluster copy is a **degradation
of redundancy**, not a DNS outage. That does not argue against the move; it argues that the
move is an improvement to make calmly rather than a fire to put out. It does add one
question to §7's list: **the three Dockge resolvers only help during a battery window if
celestia, luna and skystar are themselves powered.** **Answered by David 2026-08-21:
`celestia` and `luna` are on battery; `skystar` is not, and is remote — and the network and
Internet uplink are on the battery too, so the remote member is reachable.** Resolver redundancy
during a local outage is therefore **four members, not one**, with no reachability caveat. §7.

### 0.4 — Confirm before entry (unchanged in kind, refreshed live)

- ~~`allowSchedulingOnControlPlanes: true` is still set.~~ **Flipped to `false` and applied
  2026-08-21** (`talos/patches/controller/cluster.yaml:2`, PR #1002). The trio carries
  `node-role.kubernetes.io/control-plane:NoSchedule` and the Tier-0/1 tolerations that make it
  useful are live — §4. Nothing here is left to confirm; it is a property to verify still holds,
  which check 1 in §6.0 now does.
- [07-authentik-to-alpha-site.md](07-authentik-to-alpha-site.md) has landed (cut over
  2026-08-16). This is what lets CNPG drop to Tier 2 at all — §2.
- **Flux is fully reconciled and nothing is suspended.** Live: `flux get kustomizations -A
  --status-selector ready=false` prints nothing, and the `database/{postgres,pg-backups}`,
  `kube-system/{openbao,openbao-replica}` and `equestria/xcproxy` suspensions the morning
  revision recorded have all been resumed. Entering low-power on top of an already-failing
  reconcile makes the post-window diff unreadable.
- **Four volumes are `degraded`**, all Tier 2: `observability/storage-loki-0`,
  `equestria/tududi`, `equestria/jellyfin`, `equestria/immich`. §6.0's pre-flight requires
  zero, so these are a burndown item, not a blocker on building anything.

---

## 1. The tiers — explicit membership, verified live 2026-08-19

**Tier 0 — cluster platform (mandatory).** Namespaces `kube-system` (except the Tier-2 items
called out below), `longhorn-system`, `cert-manager`, `nfs-system`, `flux-system`,
`cloudnative-pg` (the *operator*, not the cluster it manages — §2), `volsync-system`,
`openebs-system`.

Named components: `cilium` + `cilium-operator` · `coredns` · `external-secrets` (+ webhook,
cert-controller, reloader) · `onepassword-connect` (+ operator) · `reflector` · `reloader` ·
`metrics-server` · `snapshot-controller` · `spegel` · `registry` · `multus` · Longhorn
(manager, CSI, engine images, instance-managers, share-managers) · `csi-driver-nfs` ·
`cert-manager` + `trust-manager` · `cloudnative-pg` operator · `flux-operator` + the four Flux
controllers · `volsync` · `openebs` localpv.

- **`onepassword-connect` stays in Tier 0** even though 1Password no longer sources any secret.
  Re-verified 2026-08-19: `kubernetes/apps/kube-system/external-secrets/stores/ks.yaml:25-29`
  still lists `onepassword-connect` as a `dependsOn` of the `external-secrets-stores`
  Kustomization, which `openbao`'s own Kustomization transitively depends on. Dropping it from
  Tier 0 without removing that edge means OpenBao cannot boot at exit.
- **`openbao` is deliberately not Tier 0 or Tier 1** — §2.

**Tier 1 — estate services.** Namespaces `network`, `stargate-command`, `tailscale-system`.

Per-app, with its storage and where it actually runs today (re-read live, 2026-08-19
evening — replica placement now lives in §5, which is where the decisions hang off it):

| App | Namespace | Pod node (live) | PVC | StorageClass | CP replicas |
|---|---|---|---|---|---|
| `technitium` (DNS) | `network` | `hard-hat` | `technitium` 5 Gi | `longhorn-critical` | **3** |
| `technitium-dns` (external-dns provider) | `network` | `hard-hat` | — | — | — |
| `k8s-gateway` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `traefik` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `cloudflare-dns` | `network` | `hard-hat` | — | — | — |
| `cloudflare-tunnel` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `unifi-dns` | `network` | `hard-hat` | — | — | — |
| `error-pages` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `crowdsec` (agent DaemonSet + `lapi` + `ui`) | `network` | agent on all 7; `lapi` `hard-hat`; `ui` `fluttershy` | `crowdsec-{config,db,ui}` | `longhorn` | **0** — see §5 |
| `chrony` (NTP) | `stargate-command` | `fluttershy` | — | — | — |
| `mosquitto` (MQTT) | `stargate-command` | `shining-armor`, `hard-hat` | `data-mosquitto-{0,1}` 4 Gi | `longhorn-critical` | **3** each |
| `home-assistant` | `stargate-command` | `hard-hat` | `home-assistant` 40 Gi | `longhorn-critical` | **3** |
| `matter` | `stargate-command` | `shining-armor` | `matter` 4 Gi | `longhorn-critical` | **3** |
| `tailscale-operator` + connectors | `tailscale-system` | `shining-armor`, `hard-hat` | — | — | — |
| `tsidp` | `tailscale-system` | `hard-hat` | `tsidp` 5 Gi | `longhorn-critical` | **3** |
| `tsiam` | `tailscale-system` | `fluttershy` | `tsiam` 1 Gi | `longhorn-critical` | **3** |
| `golink` | `tailscale-system` | `hard-hat` | `golink` | `longhorn` | **0** |
| `taildrive` | `tailscale-system` | `hard-hat` | `taildrive` | `longhorn` | **0** |

**Every Tier-1 volume is `healthy`, and the seven that matter now hold three control-plane
replicas each** — PRs #963 and #966 moved them onto `longhorn-critical` on 2026-08-19. What
is left on the default `bulk` class is `crowdsec-*`, `golink`, `taildrive` and — the one that
is a genuine gap rather than a settled Tier-2 call — Tier-0 `kube-system/registry`. §5.

**And not one Tier-1 *pod* runs on a control plane today.** Every row above lands on
`hard-hat`, `shining-armor`, `fluttershy` or `kerfuffle`. Under Path B that means the whole
Tier-1 set reschedules at entry; under Path A (§4) it means the required affinity has real
work to do rather than merely ratifying where things already are. Either way, §3's capacity
projection is a projection, not an observation — nothing has ever actually run there.

Three corrections this table forces:

- **`tsidp` is no longer free.** The pre-19 text described it as "a one-line `ExternalName`
  Service in `apps/tailscale-system/services/tailscale.yaml`". It is now a real Deployment
  under `kubernetes/apps/tailscale-system/idp/` with a 5 Gi Longhorn PVC, cut over 2026-08-15.
  It also carries a **hard anti-affinity excluding `othalla`**
  (`idp/tsidp.yaml:40-48`, `kubernetes.io/hostname NotIn [othalla]`) — a Tier-1 workload that
  structurally cannot use one of the three control planes. Copied verbatim from
  equestria-cluster during piece 21; confirm whether it is still needed before Tier-1
  placement is pinned.
- **`chrony`, `mosquitto` and `matter` are LoadBalancer-fronted, and that is fine on the trio.**
  `chrony` uses `io.cilium/lb-ipam-ips: ${CHRONY_VIP}`, `mosquitto` and `matter` share
  `${AUTOMATION_VIP}`. The `CiliumL2AnnouncementPolicy` selects interfaces matching
  `^enp[0-9]+s[0-9]+` on all Linux nodes, which the control planes' `enp3s0` satisfies. VIP
  announcement is **not** a low-power blocker. (Unlike Technitium's ipvlan NAD — §0.3.)
- **`matter` sets `hostNetwork: true`.** It runs on whichever node it lands on and needs its
  ports free there; it has no node pin today. Tier call still open — §9 item 3.

**Tier 2 — dropped in low-power.** Namespaces `equestria` (56 pods: media stack, immich, n8n,
windmill, romm, …), `github-actions`, `coder`, `database` (CNPG shared postgres + valkey),
`system-upgrade`; plus, inside `kube-system`: `openbao`, `openbao-replica`, `headlamp`,
`descheduler`, `node-feature-discovery`, and the AMD/Intel/NVIDIA device plugins.

> **Amended by [24-power-states.md](24-power-states.md) §1, 2026-08-13.** `observability`
> (prometheus, loki, tempo, thanos, grafana, alloy — 46 pods live) and `pulumi` (7 pods) move
> **back to Tier 1** and stay up during Battery. This file's original reasoning for dropping
> them (alpha-site covers observability externally; Pulumi is not usefully runnable during an
> outage) is preserved in §7, not as current tier assignment. §3 costs the amendment with a
> fresh measurement, which is what 24 §"Open items" item 4 asked for.

---

## 2. OpenBao and CNPG during low-power

**The decision stands: OpenBao goes dark, CNPG goes dark.** Two of the three arguments the
pre-19 text used to justify it are now factually wrong, so the decision is re-derived here
from what is actually true.

**Still true, and it is the load-bearing argument:** there is no hot path to OpenBao. Every
consumer is one hop removed — app → mounted env/volume → `Secret` → ESO → OpenBao. Nothing in
the tree uses a Vault CSI driver, a `vault-agent` sidecar, or an in-app client dialling
OpenBao directly. Existing Kubernetes `Secret`s, already synced by ESO before the window
opened, keep working; ESO's reconcile loop fails to refresh them and sets a
`SecretSyncedError` condition but does **not** delete or blank an already-synced `Secret`.
Pods that restart mid-window read the cached `Secret` from the API server. The cost of
option (a) is "no secret rotation for 3–4+ hours," which is a good trade.

**No longer true (1): "no OpenBao pod runs on a future-critical node."**

```bash
kubectl -n kube-system get pods -l app.kubernetes.io/name=openbao \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName
```

Live 2026-08-19: `openbao-0` → `shining-armor`, `openbao-1` → `hard-hat`, **`openbao-2` →
`milky-way`**. OpenBao has no pod anti-affinity, so the scheduler put one replica on a control
plane. It has no storage of its own (its backend is the shared CNPG postgres), so this is not
a pinning problem — but the claim that the taint excludes OpenBao "by construction, not by
luck" was only ever true because of where the scheduler happened to have placed it. After the
§0.1 taint lands, `openbao-2` keeps running on `milky-way` (`NoSchedule` does not evict) and
migrates off the trio the first time it is recreated. That is the desired end state; it just
is not the current one.

**No longer true (2): "a CNPG instance can never be on a control plane."**

```bash
kubectl -n database get pods -o custom-columns=N:.metadata.name,NODE:.spec.nodeName,ROLE:.metadata.labels.cnpg\\.io/instanceRole
kubectl get pv pvc-cf9e7127-5ffd-4073-8a29-9c9ee638c690 \
  -o jsonpath='{.spec.nodeAffinity.required.nodeSelectorTerms[*].matchExpressions[*].values[*]}'
```

Live 2026-08-19: `postgres-1` (replica) → `fluttershy`, `postgres-2` (**primary**) →
`shining-armor`, **`postgres-3` (replica) → `othalla`**, whose PV `nodeAffinity` is hard-pinned
to `othalla`. Piece 19's strict-local relocation put a CNPG instance on a control plane and it
cannot move without `kubectl cnpg destroy` + re-provision.

This makes "keep Postgres up during low-power" *mechanically* possible in a way it was not
before — promote `postgres-3` on `othalla`, run single-instance for the window, let
`postgres-1`/`-2` resync on exit — and it is still **rejected**, for reasons that are now about
risk rather than impossibility:

- It converts a planned, reversible posture into one that includes a **primary promotion** and a
  3–4h single-instance window with no HA, on the estate's slowest disk.
- WAL retention during the window is bounded but not free: `max_slot_wal_keep_size = 10GB` on a
  40 Gi `longhorn-local` PVC, with two replication slots inactive for the duration. That cap is
  what keeps this from being the stuck-slot cascade that previously filled every PVC in
  `database` and took authentik down — but it means the two absent replicas may need a full
  base backup rather than a WAL catch-up on exit, which is a rebuild on the SATA disk at exactly
  the moment §6's exit is trying to stay calm.
- It buys nothing Tier 1 needs. Nothing in Tier 0 or Tier 1 reads Postgres during the window.

**Update, 2026-08-19 evening: this stranding risk is gone.** `postgres-3` is now on
**`kerfuffle`**, a worker, with its `longhorn-local` PV `nodeAffinity` pinned to `kerfuffle`;
the CNPG cluster reports healthy with 3/3 instances ready. No toleration and no
`kubectl cnpg destroy` is needed before the §4 flip, and
[29](29-taint-readiness-audit.md)'s blocker 2 is closed. The reasoning above is preserved
because it is the general rule — *a strict-local PV on a node about to be tainted is a
landmine* — and §9 item 6 records the next instance of it (`observability`'s three
untolerated control-plane pods).

**What quietly pauses, and why that is fine.** `openbao-replica`'s nightly `pg_dump` (03:00)
and monthly restore-test CronJobs depend on `openbao` and therefore on CNPG; both go idle.
Their Gatus heartbeats on alpha-site (`docker/alpha-site/uptime/config/openbao-break-glass.yaml`)
tolerate 26 h (dump) and 792 h/33 d (restore-test) of silence, so a 3–4 h window trips neither,
even straddling 03:00.

---

## 3. Does it fit — capacity, re-measured live 2026-08-19

The allocatable figure is unchanged from the 2026-07-31 measurement because it is the same
three machines:

```bash
kubectl get nodes -o custom-columns='NAME:.metadata.name,CPU:.status.allocatable.cpu,MEM:.status.allocatable.memory,PODS:.status.allocatable.pods'
```

| Node | Allocatable CPU | Allocatable memory | Pod cap |
|---|---|---|---|
| `milky-way` | 3950m | 14.85 GiB | 220 |
| `othalla` | 3950m | 14.85 GiB | 220 |
| `pegasus` | 3950m | 14.85 GiB | 220 |
| **trio total** | **11.85 cores** | **44.55 GiB** | 660 |

Demand, measured from live pod `requests` and projected onto a CP-only cluster. Per-node
components (DaemonSets, `instance-manager`) are counted at their **current control-plane**
values rather than scaled from worker values, because they size against node CPU — Longhorn's
`guaranteedInstanceManagerCpu` yields 2.39 cores per instance-manager on a 20-core worker and
0.47 on a 4-core control plane, so scaling the worker number would have overstated demand by
several cores:

| | Pods | CPU requests | Memory requests |
|---|---|---|---|
| Tier 0 + Tier 1 already resident on the trio | 68 | 4.58 | 11.73 GiB |
| Tier 0 that must move in from workers (non-DaemonSet) | 42 | 1.43 | 2.42 GiB |
| Tier 1 that must move in from workers (non-DaemonSet) | 31 | 1.16 | 3.42 GiB |
| **Projected total — this file's tiers** | **141** | **7.18 / 11.85 (61 %)** | **17.57 / 44.55 GiB (39 %)** |
| plus `observability` + `pulumi` ([24](24-power-states.md) §1) | +18 | +1.23 | +5.49 GiB |
| **Projected total — with 24's amendment** | **159** | **8.40 / 11.85 (71 %)** | **23.07 / 44.55 GiB (52 %)** |

**Verdict: it fits, but CPU — not memory — is the tight axis**, which inverts the pre-19
text's "roughly 2× headroom on both axes." With 24's amendment the trio runs at ~71 % of
allocatable CPU in requests alone, before any burst, before etcd (a Talos host service,
invisible to `kubectl top` — §9 item 11), and before the exit-storm write load §6 warns about.
24's "≈7.4 GiB additional" estimate is confirmed as ≈5.5 GiB of requests here; it is the
**1.23 cores** that deserve the attention.

The single largest Tier-1 mover is `home-assistant` at 260m / 1.14 GiB. The largest
24-amendment movers are `thanos-receive-0` (200m / 2.00 GiB) and `prometheus-prometheus-0`
(130m / 1.06 GiB) — if the window ever needs CPU back, those two are the first candidates to
re-drop to Tier 2, not Home Assistant.

Pod count is not a constraint: 159 across three nodes against a 660 cap.

---

## 4. Placement mechanism — taint, required affinity, PriorityClass (Path A)

> This section designs the **permanent** structural version of low-power. **DONE and LIVE,
> 2026-08-21.** §0.1 cleared, [29](29-taint-readiness-audit.md)'s four-command gate passed, the
> `critical-tier` PriorityClass landed in PR #970, the Tier-0/1 tolerations in
> [#1001](https://github.com/david-driscoll/home-operations/pull/1001), and the taint in
> [#1002](https://github.com/david-driscoll/home-operations/pull/1002). All three control planes
> carry `node-role.kubernetes.io/control-plane:NoSchedule`.
> §6 Path B still rehearses the mode without any of it.

> ### ⚠ The taint key below is NOT what was built
>
> This section was written around a **custom** taint key, `node-role.driscoll.tech/critical`.
> **The estate went the other way and uses the standard
> `node-role.kubernetes.io/control-plane:NoSchedule`**, applied by flipping
> `allowSchedulingOnControlPlanes` to `false` in `talos/patches/controller/cluster.yaml:2` —
> no `nodeLabels`/`nodeTaints` entry in `talconfig.yaml` at all.
>
> The custom-key design below is kept for its reasoning, not as instructions. **Following it
> verbatim now would be actively harmful**, and once was: PR #764 set Longhorn's
> `taintToleration` to the custom key and had to be closed on 2026-08-20, because merging it
> would have replaced the live, `APPLIED: true`
> `taintToleration: node-role.kubernetes.io/control-plane:NoSchedule` with a key no node will
> ever carry — stripping Longhorn's real toleration at the exact moment the taint landed.
>
> Read `## What was actually built` at the end of this section for the shipped design.

> **Superseded in part by [24-power-states.md](24-power-states.md), 2026-08-13.** Everything
> here still applies to Tier 0 (DaemonSets — toleration only) and to Tier-1 workloads that
> genuinely should be permanently CP-resident. 24 moves Tier-1 *applications* (Home Assistant
> named explicitly) to a float-on-worker / relocate-on-Battery model with a new
> `longhorn-controlplane` StorageClass instead of the permanent pin below. The relocation
> trigger is still an open item in 24.

**Label + taint** on the three control planes, via Talos machine config, following the existing
`nodeLabels` anchor pattern in `talos/talconfig.yaml`:

```yaml
# talos/talconfig.yaml — on each of milky-way / othalla / pegasus
    nodeLabels:
      <<: *nodeLabels
      node-role.driscoll.tech/critical: "true"
    nodeTaints:
      node-role.driscoll.tech/critical: "true:NoSchedule"
```

**Using a custom taint key does not route around §0.1.** Longhorn's system-managed components
would need to tolerate `node-role.driscoll.tech/critical` too, and the only way to give them a
toleration is the same `taint-toleration` Setting, behind the same all-volumes-detached gate.
Whichever key is chosen, the quiesce window in §0.1 is required. The advantage of a custom key
is only that it decouples the taint from `allowSchedulingOnControlPlanes`, letting the two land
in separate changes.

That advantage stopped mattering once §0.1's quiesce window turned out to be bypassable
(29 §4.4): with the gate gone, there was nothing left to buy by decoupling, and the standard key
costs nothing to adopt because Kubernetes, Longhorn and every upstream chart already understand
it. Hence the reversal recorded above.

Every Tier-0 and Tier-1 workload gets **both**:

```yaml
tolerations:
  - key: node-role.driscoll.tech/critical
    operator: Equal
    value: "true"
    effect: NoSchedule
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: node-role.driscoll.tech/critical
              operator: In
              values: ["true"]
```

DaemonSets that must cover every node — `cilium`, `node-exporter`, `smartctl-exporter`,
`spegel`, `csi-nfs-node`, `alloy`, `crowdsec-agent`, Longhorn's manager/CSI/engine-image — get
the **toleration only, never the affinity**. Per §0.1's audit, five already tolerate anything
by blanket `operator: Exists`, twelve carry the explicit key from #912, and three are waiting
on the Setting.

**Three workloads need an explicit decision before the affinity is applied**, because they
cannot satisfy it as written:

| Workload | Why it cannot | Options |
|---|---|---|
| `technitium` | `nodeSelector: technitium-dns=true` + ipvlan `master: enp2s0` (§0.3) | §0.3 (a)/(b)/(c) |
| `tsidp` | hard anti-affinity `hostname NotIn [othalla]` | drop the exclusion, or accept 2-of-3 CP placement |
| `postgres-3` | `longhorn-local` PV pinned to `othalla`, no toleration (§2) | toleration in the same change, or destroy + re-provision on a worker first |

**PriorityClass.** Live classes today:

```bash
kubectl get priorityclass -o custom-columns=NAME:.metadata.name,VALUE:.value
```

| Class | Value | Owner |
|---|---|---|
| `system-node-critical` | 2000001000 | Kubernetes |
| `system-cluster-critical` | 2000000000 | Kubernetes |
| `longhorn-critical` | 1000000000 | the Longhorn chart (`defaultSettings.priorityClass`) |
| `observability-critical` | 1000 | `kubernetes/apps/observability/priority-class/` |

Add `critical-tier` between them:

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: critical-tier
description: Tier 0/1 low-power workloads — DNS, NTP, MQTT, Home Assistant, ingress, cluster platform.
value: 100000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
```

`100000` sits above every application-tier class and every unset (`0`) pod, and below
Kubernetes' own two and Longhorn's. That answers comment-5 §9's "above or below
`system-cluster-critical`?" with **below**. Priority governs preemption under contention, not
placement — with workers off, Tier-2 pods just go `Pending`. Its value is for the case where a
control plane is *lost* mid-window and the survivors must evict the right things.

**Note the name is close to but distinct from the chart's `longhorn-critical`, and piece 12's
`longhorn-critical` StorageClass is a third, unrelated object with the same string.** Three
different resources, three different kinds; do not assume a `kubectl get` of one tells you
anything about the others.

**Correction to make in the same change:** `home-assistant`, `mosquitto` and `chrony` all set
`priorityClassName: system-cluster-critical` today
(`kubernetes/apps/stargate-command/{home-assistant/helmrelease.yaml:42,mosquitto/helmrelease.yaml:78,chrony/helmrelease.yaml:40}`,
verified 2026-08-19 — the pre-19 text named only Home Assistant). That is a Kubernetes
system-reserved class handed to three application pods, letting them preempt genuine
control-plane components on a 4-core node. Move all three to `critical-tier`.

### What was actually built

Shipped and live 2026-08-21 — tolerations and taint both. This is the authoritative version;
everything above it in §4 is design history.

**The taint** is the stock Kubernetes one, from one line of Talos machine config:

```yaml
# talos/patches/controller/cluster.yaml
cluster:
  allowSchedulingOnControlPlanes: false   # -> node-role.kubernetes.io/control-plane:NoSchedule
```

`talhelper genconfig` changes exactly that line, and only in the three control-plane configs —
the four worker configs come out byte-identical, because the field is not rendered for them.
**This file is not GitOps.** Flux never reads `talos/patches/`; it takes
`mise run talos:genconfig && mise run talos:apply`.

**The toleration**, on every Tier-0/1 workload:

```yaml
tolerations:
  - key: node-role.kubernetes.io/control-plane
    operator: Exists
    effect: NoSchedule
```

No `nodeAffinity`. The required affinity designed earlier in this section was **not** built:
24 §2 moved Tier-1 applications to a float-on-worker model, so pinning them to the trio would
fight that. A toleration widens where a pod *may* schedule and pins nothing, which is the whole
behaviour needed — and it is why landing these ahead of the taint changes no placement at all.

**Where the toleration goes differs per chart, and the obvious key is not always right.**
Verified with `helm template` rather than assumed:

| Workload | Chart | Key |
|---|---|---|
| `metrics-server` | metrics-server 3.14.0 | top-level `tolerations` |
| `kube-downscaler` | py-kube-downscaler 0.3.12 | top-level `tolerations` |
| `chrony`, `mosquitto`, `unpoller` | app-template 5.1.0 | `controllers.<name>.pod.tolerations` |
| `equestria-kubeproxy` | Tailscale operator | **a ProxyClass** — see below |
| Longhorn's system-managed set | longhorn | `defaultSettings.taintToleration` **only** — a pod-spec toleration never reaches them (§0.1) |

**The Tailscale case is the one that surprises.** A `ProxyGroup` has exactly seven spec fields
(`hostnamePrefix`, `kubeAPIServer`, `proxyClass`, `replicas`, `tags`, `tailnet`, `type`) and
**no pod-spec fields at all**, so there is no way to give a proxy a toleration by editing its
manifest. The only route to the operator-generated StatefulSet's pod template is a
`ProxyClass` referenced by `spec.proxyClass`:

```yaml
kind: ProxyClass
metadata:
  name: control-plane-tolerant
spec:
  statefulSet:
    pod:
      tolerations: [...]
```

Check before guessing:

```bash
kubectl get crd proxygroups.tailscale.com -o json \
  | jq -r '.spec.versions[0].schema.openAPIV3Schema.properties.spec.properties|keys[]'
```

`control-plane-tolerant` is deliberately separate from the existing `default` ProxyClass:
`default` also carries a reloader annotation and its members (`tailnet-inbound`,
`tailnet-outbound`) are not Tier 1. It does copy `default`'s metrics/serviceMonitor —
`equestria-kubeproxy` referenced no class at all and therefore had no metrics, which is a poor
property for the Tier-1 component carrying the tailnet's path to the API server.

**The audit that decides who needs one.** A naive filter counts every DaemonSet as a false
positive; the two conditions that matter are excluding node-owned pods and treating a blanket
`operator: Exists` as already-tolerating:

```bash
kubectl get pods -A -o json | jq -r '
 .items[]
 | select(.spec.nodeName|test("milky-way|othalla|pegasus"))
 | select(.metadata.ownerReferences[0].kind!="Node")
 | select([.spec.tolerations[]?|select((.key=="node-role.kubernetes.io/control-plane") or (.key==null and .operator=="Exists"))]|length==0)
 | "\(.metadata.namespace)/\(.metadata.name)"' | sort
```

Re-run it before acting — placement drifts. **Verified 2026-08-21, both before and after the
taint:** it returns exactly the Tier-2 set (`equestria/{pinepods,teamarr,windmill-*}`,
`kube-system/openbao-0`, `database/postgres-backup`) and nothing else. Those pods keep running —
`NoSchedule` does not evict — and migrate off the trio on their next recreate, which is the point
of the taint.

### How it was actually applied — do NOT use `mise run talos:apply` for this

**`mise run talos:apply` would have applied far more than the taint.** It runs
`talhelper gencommand apply` across every node with the *whole* rendered config, and
`talos/talenv.yaml` had already been bumped by Renovate to `kubernetesVersion: v1.36.4` while the
live cluster ran v1.36.3. The `--dry-run` diff on `milky-way` showed the taint **plus** new
`v1.36.4` images for `kube-apiserver`, `kube-controller-manager`, `kube-scheduler` and
`kube-proxy`.

That is not a stray detail. **`tuppr` owns Kubernetes upgrades in this estate**, and it had a
`KubernetesUpgrade` CR in `Upgrading` phase, `v1.36.3 → v1.36.4`, at the time. A blanket apply
would have shoved v1.36.4 static pods onto all three control planes at once, outside tuppr's
one-node-at-a-time orchestration, while tuppr believed it was still driving that transition —
and it would have done so as an invisible side effect of a change whose diff in Git is one line.

The taint was applied surgically instead, one node at a time, `--dry-run` first each time:

```bash
# taint-patch.yaml
#   cluster:
#     allowSchedulingOnControlPlanes: false
for ip in 10.10.209.10 10.10.209.11 10.10.209.12; do
  mise exec -- talosctl patch machineconfig --nodes "$ip" \
    --mode=no-reboot --patch-file taint-patch.yaml --dry-run    # inspect, then drop --dry-run
done
```

`--dry-run` prints the config diff against the **live** node, which is the only reliable way to
see what an apply will really do: `talos/clusterconfig/*.yaml` is gitignored and goes stale, so
diffing against it proves nothing. The patch is written to the STATE partition, so it survives
reboots, and the live value now matches the repo.

Note JSON6902 patches (`-p '[{"op":"replace",...}]'`) are rejected — "JSON6902 patches are not
supported for multi-document machine configuration". Use a strategic-merge YAML patch file.

**The general rule this establishes:** before any `talos:apply`, diff `talos/talenv.yaml` against
the live cluster. Renovate keeps that file current, the cluster is updated by `tuppr` on its own
schedule, and the two drift by design. A one-line change to `talos/patches/` is never a one-line
apply.

---

## 5. Storage placement — the live picture

[12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) **landed 2026-08-19** (PR #960):
the trio is tagged `critical`, the four workers `bulk`, `longhorn-critical` exists
(`numberOfReplicas: "3"`, `nodeSelector: "critical"`), and the default `longhorn` class
carries `nodeSelector: "bulk"`. 12 also settled "which three": `critical` stays on the
control planes despite their being the slower disks, because Tier 1 is only ~68 GB of
low-IOPS data, and because the real problem was never that `critical` points at slow disks
but that nothing pointed Tier 2 *away* from them.

**And the Tier-1 volumes have now moved onto it** — PRs #963 (`technitium`, `tsidp`,
`tsiam`) and #966 (`home-assistant`, `matter`, `mosquitto`), both merged 2026-08-19. This
section spent two revisions as the blocker; it is no longer one.

Live, 2026-08-19 evening:

```bash
kubectl get pvc -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,SC:.spec.storageClassName
kubectl -n longhorn-system get volumes.longhorn.io -o custom-columns=NAME:.metadata.name,SEL:.spec.nodeSelector,ROBUST:.status.robustness
kubectl -n longhorn-system get replicas.longhorn.io \
  -o custom-columns=VOL:.spec.volumeName,NODE:.spec.nodeID,STATE:.status.currentState
```

| Volume | Class | Volume `nodeSelector` | Replica nodes | CP replicas | Survives all four workers off? |
|---|---|---|---|---|---|
| `network/technitium` | `longhorn-critical` | `["critical"]` | `milky-way`, `othalla`, `pegasus` | **3** | **yes, undegraded** |
| `stargate-command/home-assistant` | `longhorn-critical` | `["critical"]` | `milky-way`, `othalla`, `pegasus` | **3** | **yes, undegraded** |
| `stargate-command/data-mosquitto-0` | `longhorn-critical` | `["critical"]` | `milky-way`, `othalla`, `pegasus` | **3** | **yes, undegraded** |
| `stargate-command/data-mosquitto-1` | `longhorn-critical` | `["critical"]` | `milky-way`, `othalla`, `pegasus` | **3** | **yes, undegraded** |
| `stargate-command/matter` | `longhorn-critical` | `["critical"]` | `milky-way`, `othalla`, `pegasus` | **3** | **yes, undegraded** |
| `tailscale-system/tsidp` | `longhorn-critical` | `["critical"]` | `milky-way`, `othalla`, `pegasus` | **3** | **yes, undegraded** |
| `tailscale-system/tsiam` | `longhorn-critical` | `["critical"]` | `milky-way`, `othalla`, `pegasus` | **3** | **yes, undegraded** |
| `kube-system/registry` (Tier 0) | `longhorn` | `["bulk"]` | `hard-hat`, `kerfuffle`, `shining-armor` | 0 | **no** |
| `network/crowdsec-config-pvc` | `longhorn` | `["bulk"]` | `hard-hat`, `kerfuffle`, `shining-armor` | 0 | **no** |
| `network/crowdsec-db-pvc` | `longhorn` | `["bulk"]` | `hard-hat`, `kerfuffle`, `fluttershy` | 0 | **no** |
| `network/crowdsec-ui` | `longhorn` | `["bulk"]` | `hard-hat`, `kerfuffle`, `fluttershy` | 0 | **no** |
| `tailscale-system/golink` | `longhorn` | `["bulk"]` | `fluttershy`, `kerfuffle`, `shining-armor` | 0 | **no** |
| `tailscale-system/taildrive` | `longhorn` | `["bulk"]` | `hard-hat`, `kerfuffle`, `shining-armor` | 0 | **no** |

**Every migrated Tier-1 volume now holds all three replicas on the trio, and every one is
`healthy`.** Two revisions ago this table said "not one Tier-1 volume has three
control-plane replicas"; it now says the opposite for the seven that matter. The class
change did what the earlier `bulk` StorageClass edit did not — because a class change on a
PVC forces a re-provision, whereas adding a `nodeSelector` to an existing class only
constrains *future* replica scheduling (§0.2).

**The six volumes left on `bulk` are a tier decision, not an oversight.** All six are now
cleanly all-worker, which is the correct shape for anything Tier 2:

- `golink` (link shortener) and `taildrive` (file share) — §9 recommended resolving both as
  **Tier 2**, and their placement now matches that. Nothing further to do beyond writing the
  call down.
- The three `crowdsec-*` volumes — CrowdSec is Tier 1 only by living in the `network`
  namespace, not because anyone decided the estate needs intrusion detection during a
  battery window. The honest answer is almost certainly Tier 2; it needs saying explicitly.
- `kube-system/registry` reads as the uncomfortable one and is now a **written decision**
  rather than a gap — see §9 item 1, which also records that the registry was not in the pull
  path at all until 2026-08-21. It is **Tier 0** in §1
  and it has **zero** control-plane replicas, so a battery window has no in-cluster registry
  mirror. That is survivable — `spegel` serves from node-local image stores and nothing
  pulls a new image during a window unless something crash-loops — but "unless something
  crash-loops" is exactly the case a low-power window creates. **This is now the sharpest
  remaining storage item**, and it is a Tier-0 one, which is worse than the Tier-1 problem
  this section used to describe.

**A cosmetic artefact worth not misreading:** several of the migrated volumes list a
replica with an empty `nodeID` alongside their three placed ones — a leftover from the
migration's rebuild, not a fourth replica and not a fault. `robustness` is `healthy` on all
seven; judge from that, not from the replica count in a raw listing.

**Four volumes are `degraded` right now**, all Tier 2 — `observability/storage-loki-0`,
`equestria/{tududi,jellyfin,immich}`. §6.0's pre-flight requires zero.

**Longhorn policy settings that shape the window.** All four re-verified live 2026-08-19 as
`applied: true` — which is itself new: PR #959 fixed three `defaultSettings` keys the chart
had been silently dropping, and `nodeDownPoddeletionPolicy` was one of them, so this row was
describing behaviour that was **not actually live** when this file was first written.

| Setting (live CR name) | Value | What it does during the window |
|---|---|---|
| `node-drain-policy` | `allow-if-replica-is-stopped` | Never engages — this runbook does not `kubectl drain` |
| `node-down-pod-deletion-policy` | `delete-both-statefulset-and-deployment-pod` | **Does** engage, and now genuinely: once node-down detection fires on a powered-off worker, Longhorn deletes its Tier-2 pods. Controllers recreate them, they find nowhere to go, they sit `Pending` |
| `replica-replenishment-wait-interval` | `600` | 10 minutes in, replenishment starts — but §0.2's `bulk` selector now aims it at worker disks, which are off. Tier-2 volumes stay degraded instead of rebuilding onto the trio. That is the intended outcome |
| `concurrent-replica-rebuild-per-node-limit` | `2` | Lowered from 5 for these SATA disks ([12](12-longhorn-critical-tier.md), PR #939). Governs the exit storm |

Expect a wall of `Pending` Tier-2 pods during the window. That is this policy doing what it
now does, not a problem — and it is strictly better than the `Terminating` limbo the older
policy produced. §6 Path B pre-empts most of it by scaling Tier 2 to 0 before the workers go
down.

---

## 6. Entering and leaving low-power mode

Two runbooks. **Path B is what the first rehearsal uses**, because Path A is gated on §0.1.

| | Path A — taint | Path B — suspend + scale |
|---|---|---|
| Requires §0.1 green | **yes** | no |
| Requires a talconfig change | yes | no |
| Requires §0.2 (piece 12) | yes | yes |
| Requires §0.3 (DNS) | yes | yes |
| Tier-2 kept off the trio by | the taint, permanently | `flux suspend` + `scale --replicas=0`, per window |
| Entering involves rescheduling Tier 0/1 | no (already resident) | yes |
| Available today | no | yes |

### 6.0 Pre-flight — all must pass, in this order

**Burndown as of 2026-08-19 evening** — the morning revision recorded five of nine failing:

| # | Check | State |
|---|---|---|
| 1 | Topology: 3 CP + 4 workers, Ready, uncordoned; **the trio tainted and the workers not** | **pass** — re-verified live 2026-08-21: 7 nodes on Talos v1.13.9, all Ready, none cordoned; `milky-way`/`othalla`/`pegasus` carry `node-role.kubernetes.io/control-plane:NoSchedule`, the four workers carry nothing. **The sense of this check inverted on 2026-08-21** — it used to require *no* taints anywhere; since §4 landed, control-plane taints are the desired state and their *absence* is the failure |
| 2 | etcd: 3 members healthy, no alarms | not re-run this revision |
| 3 | Zero degraded volumes | **pass** — re-verified live 2026-08-20 evening: 0 degraded, 0 faulted, 62 healthy attached. The four Tier-2 degradations recorded in the previous revision have cleared |
| 4 | Every Tier-1 volume ≥ 2 replicas on the trio | **pass** for the seven on `longhorn-critical` (3 each). `kube-system/registry` still has 0, by decision — §9 item 1 |
| 5 | Piece 12 landed: default class `bulk`-confined, `longhorn-critical` exists, nodes tagged | **pass** (§0.2) |
| 6 | Longhorn `taint-toleration` applied + annotation present — Path A only | **pass** (§0.1) |
| 7 | Flux fully reconciled | **pass** — 0 not-ready, 0 suspended |
| 8 | DNS answer decided and reachable from a control plane | **pass** — Technitium runs on `milky-way`, verified with `dig` (§0.3) |
| 9 | alpha-site up and on the battery circuit | **pass** — David confirmed the battery powers alpha-site, 2026-08-20 (§7). The check below still only proves it is *up*; the circuit half is now answered rather than measured |

So the honest count is now **eight pass, zero fail, one not re-run** (check 2, etcd). Three
checks flipped green on 2026-08-20: check 1 when `shining-armor`'s upgrade was fixed and all
seven nodes reached v1.13.9, check 3 when the last Tier-2 degradations cleared, and check 9 when
David confirmed alpha-site's power. Check 8 (DNS) went green the same day with the Technitium
cutover.

**Do not read that as "ready to enter."** The pre-flight measures whether the cluster is
*healthy enough* to try; it does not measure whether Battery has ever been *rehearsed* — §8
Stage 4 is still unrun. Check 4's caveat — Tier-0 `registry` at zero control-plane replicas — is
not counted as a failure of check 4 as written, but it is §9's sharpest storage item and should
not be lost in the arithmetic.

**Superseded 2026-08-21/22:** the third revision's version of this paragraph said "§4's taint is
still unapplied, so a window entered today would still have Tier 2 competing for the trio's CPU."
The taint went in on 2026-08-21 (check 1), and since 2026-08-22 Tier 2 is additionally shed
nightly by py-kube-downscaler (#1046) — so that specific objection no longer holds.

> **Superseded again, 2026-08-22 evening.** This paragraph previously reserved two future
> pre-flight entries for [30](30-longhorn-media-tier.md)'s media-volume migration and the
> descheduler's `LowPowerReturnProfile`. **Both are moot: that design was reverted.** The media
> volumes are on the ordinary `longhorn` class, the profile is deleted, and the media workers
> are no longer shed at all. No new pre-flight entries are owed.
>
> For **Battery** — which is what this pre-flight is actually for — the media volumes were
> never safe under any of 30's shapes anyway, since `hard-hat` goes down in a Battery event.
> That has not changed and is not affected by the revert.

```bash
# 1. Topology: 3 control-plane + 4 <none>, all Ready, none cordoned.
#    Since 2026-08-21 the trio MUST show node-role.kubernetes.io/control-plane:NoSchedule
#    and the four workers MUST show none. Missing CP taints = §4 was reverted or a node
#    was re-provisioned without the patch.
kubectl get nodes -o wide
kubectl get nodes -o custom-columns='NAME:.metadata.name,TAINTS:.spec.taints,UNSCHED:.spec.unschedulable'

# 2. etcd: 3 members, all healthy, no alarms
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10 etcd members
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10,10.10.209.11,10.10.209.12 etcd status
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10 etcd alarm list

# 3. Longhorn health. TWO checks -- the single "count degraded" line this used to be is
#    structurally blind, and read clean on 2026-08-23 while 62 volumes were under-replicated.
#    `robustness` is only meaningful while a volume is ATTACHED; a detached volume reports
#    `unknown` no matter how few replicas it has. §9 item 8.
#
# 3a. Zero degraded among attached volumes  (must print 0)
kubectl get volumes.longhorn.io -n longhorn-system -o json \
  | jq '[.items[] | select(.status.robustness=="degraded")] | length'

# 3b. Detached volumes holding fewer replicas than they want -- invisible to 3a.
#     Not a hard fail today (they are regenerable VolSync scratch, §9 item 8), but it must be
#     a KNOWN number before entry, not a surprise found during one.
kubectl get volumes.longhorn.io -n longhorn-system -o json > /tmp/lh-v.json
kubectl get replicas.longhorn.io -n longhorn-system -o json > /tmp/lh-r.json
jq -n --slurpfile v /tmp/lh-v.json --slurpfile r /tmp/lh-r.json '
  ($r[0].items | map(.spec.volumeName) | group_by(.)
     | map({key:.[0], value:length}) | from_entries) as $cnt
  | [ $v[0].items[]
      | select(.status.state=="detached")
      | {pvc:(.status.kubernetesStatus.pvcName // .metadata.name),
         want:.spec.numberOfReplicas, have:($cnt[.metadata.name] // 0)}
      | select(.have < .want) ]
  | {count: length, volumes: .}'

# 4. Every Tier-1 volume has >= 2 replicas on the trio.
#    Scoped to 3-replica `critical` volumes deliberately. The old wording asked this of every
#    `critical` volume, but piece 12 also created longhorn-critical-snapshot and
#    longhorn-critical-cache at numberOfReplicas: 1, so ten VolSync staging volumes reported
#    "1 replica" forever and the check could never read clean. A check nobody can pass is a
#    check nobody reads.  (must print failing: [])
jq -n --slurpfile v /tmp/lh-v.json --slurpfile r /tmp/lh-r.json '
  ($r[0].items
     | map(select(.spec.nodeID as $n | ["milky-way","othalla","pegasus"] | index($n)))
     | map(.spec.volumeName) | group_by(.)
     | map({key:.[0], value:length}) | from_entries) as $trio
  | [ $v[0].items[]
      | select((.spec.nodeSelector // []) | index("critical"))
      | select(.spec.numberOfReplicas >= 3)
      | {pvc:(.status.kubernetesStatus.pvcName // .metadata.name),
         onTrio:($trio[.metadata.name] // 0), robustness:.status.robustness} ]
  | {tier1_volumes: length, failing: [.[] | select(.onTrio < 2)], all: .}'

# 5. Piece 12 landed: default class confined to bulk, longhorn-critical exists
kubectl get sc longhorn -o jsonpath='{.parameters.nodeSelector}{"\n"}'    # must be: bulk
kubectl get sc longhorn-critical -o name                                   # must exist
kubectl get nodes.longhorn.io -n longhorn-system \
  -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags

# 6. Longhorn taint-toleration — Path A only, both must be green
kubectl get settings.longhorn.io -n longhorn-system taint-toleration \
  -o custom-columns=VALUE:.value,APPLIED:.status.applied
kubectl -n longhorn-system get ds longhorn-csi-plugin \
  -o jsonpath='{.metadata.annotations.longhorn\.io/last-applied-tolerations}{"\n"}'

# 7. Flux fully reconciled (must print nothing)
flux get kustomizations -A --status-selector ready=false

# 8. DNS answer for the window is decided (§0.3) and reachable from a control plane
kubectl -n network get deploy technitium -o jsonpath='{.spec.template.spec.nodeSelector}{"\n"}'

# 9. alpha-site is up and on the battery circuit (§7)
curl -fsS https://uptime.driscoll.tech/api/v1/endpoints/statuses >/dev/null && echo gatus-ok
```

### 6.1 Enter

**Step 1 — freeze Flux for Tier 2.** This stops Flux fighting the `Pending` pods and stops it
reconciling unrelated Tier-2 drift mid-window. It does not stop the `nodeDownPoddeletionPolicy`
behaviour in §5, which is controller-level.

```bash
flux -n equestria      suspend kustomization --all
flux -n github-actions suspend kustomization --all
flux -n coder          suspend kustomization --all
flux -n database       suspend kustomization --all
flux -n kube-system    suspend kustomization headlamp descheduler openbao openbao-replica \
                                             node-feature-discovery amd-device-plugin \
                                             intel-device-plugin-gpu intel-device-plugin-operator \
                                             nvidia-device-plugin
```

> **Trap:** the `technitium` Kustomization lives in the **`equestria`** Flux namespace even
> though it targets `network` (`kubernetes/apps/equestria/dns/technitium/ks.yaml`), so
> `--all` above suspends a Tier-1 app's reconcile. Harmless (suspension does not scale
> anything), but note it so the resume in §6.2 is not read as a mistake.

**Step 2 — scale Tier 2 to zero.** This is what actually frees the capacity §3 budgets and
detaches Tier-2 volumes so their pods are not competing for a control-plane instance-manager.

```bash
for ns in equestria github-actions coder; do
  kubectl -n $ns scale deployment,statefulset --all --replicas=0
done
kubectl -n kube-system scale statefulset openbao --replicas=0
kubectl -n kube-system scale deployment headlamp --replicas=0
kubectl cnpg hibernate on postgres -n database        # CNPG has no scale-to-0; plugin v1.26.0 verified present
kubectl -n database scale deployment valkey --replicas=0
```

Verify nothing Tier-2 is left running, and that the Tier-1 set is untouched:

```bash
kubectl get pods -A --field-selector status.phase=Running \
  -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,NODE:.spec.nodeName | sort
```

**Step 3 — move Tier 1 onto the control planes (Path B only).** Under Path A this step does
not exist: the required affinity already put them there. Under Path B, cordon first so the
reschedule cannot land back on a worker, then delete the Tier-1 pods that are on workers and
let them reschedule:

Since §6.1's 2026-08-22 correction, cordoning `shining-armor` is a **choice** rather than a
consequence: it stays powered, so leaving it uncordoned would let Tier 1 keep running there
instead of consolidating onto the trio. Cordon it anyway if the point of the window is to prove
the trio can carry Tier 1; leave it uncordoned if the point is to ride out a real outage with the
least churn. Decide before entry, not during.

```bash
kubectl cordon hard-hat fluttershy kerfuffle shining-armor
kubectl -n stargate-command delete pod -l app.kubernetes.io/name=home-assistant
kubectl -n stargate-command rollout restart statefulset mosquitto
kubectl -n stargate-command delete pod -l app.kubernetes.io/name=chrony
kubectl -n tailscale-system delete pod -l app.kubernetes.io/name=tsidp
# technitium is NOT in this list — it cannot move (§0.3). Follow whichever
# §0.3 option was chosen instead.
kubectl -n network rollout restart deployment traefik k8s-gateway error-pages \
                                              cloudflare-dns cloudflare-tunnel unifi-dns
```

Wait for each to be `Running` on a control plane and for its Longhorn volume to re-attach
there before continuing. A Tier-1 volume with only one trio replica (§5) re-attaches from that
single replica — confirm `robustness` before proceeding, not after.

**Step 4 — power off the workers, one at a time.**

> **⚠️ Corrected 2026-08-22 — it is three workers, not four.** David, answering
> [24](24-power-states.md)'s "which hosts are power-hungry" item: during a **true outage**
> `fluttershy`, `hard-hat` and `kerfuffle` can be shut down. **`shining-armor` stays online** —
> it is a VM on `twilight-sparkle` and it hosts the backup volumes. Everything below that says
> "all four workers" predates that answer and is wrong; the operative set is the **three
> bare-metal workers**, which is also exactly the set WoL covers (§6.2).
>
> Two consequences worth stating rather than deriving. Battery therefore ends at **3 control
> planes + `shining-armor`**, not at the control planes alone, so §3's capacity model is
> *conservative* rather than wrong — it budgets for a node that will in fact still be there.
> And the implication that `twilight-sparkle` itself stays powered through the outage follows
> from David's answer but was **not separately confirmed**; treat it as the one derived claim
> in this correction.

```bash
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.206.14 shutdown   # hard-hat
```

Between **each** node, all three must hold:

```bash
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10 etcd members   # still 3, healthy
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --brief                    # OK
kubectl get volumes.longhorn.io -n longhorn-system \
  -o custom-columns=ROBUST:.status.robustness --no-headers | sort | uniq -c
```

Order: ~~`shining-armor`, then~~ `kerfuffle`, then `fluttershy`, then `hard-hat` **last** —
hard-hat carries the most Tier-1 pods and the `technitium-dns` label, so it is the node whose
loss is most visible; taking it last leaves the longest window to abort. `shining-armor` is
struck from the order per the correction above: it stays up. Do **not** `kubectl drain`:
the nodes are about to lose power anyway, and a drain only adds a step that can hang on a
`PodDisruptionBudget` at zero allowed disruptions.

**Step 5 — post-check.** Not "did it come up" but "does the estate work":

```bash
dig @${TECHNITIUM_VIP} +short home-assistant.driscoll.tech      # or the §0.3 replacement
sntp -t 2 ${CHRONY_VIP}
mosquitto_sub -h ${AUTOMATION_VIP} -t '$SYS/broker/uptime' -C 1
curl -fsS -o /dev/null -w '%{http_code}\n' https://home-assistant.driscoll.tech
curl -fsS https://uptime.driscoll.tech/api/v1/endpoints/statuses | jq -r '.[] | select(.results[-1].success==false) | .name'
```

Repeat the post-check at the **1 h, 2 h and 3–4 h marks**, not only at entry. §8's gate depends
on it.

### 6.2 Exit — the dangerous direction

**Correction to the pre-19 exit path: three of the four workers are bare metal.** The MAC-OUI
inference that put `hard-hat` in the "Proxmox VM, start it with `qm start`" column does not
survive live inspection:

```bash
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.206.14 get links
```

`hard-hat` has exactly one physical NIC — `enp2s0`, MAC `58:47:ca:79:ed:0d`, the same Intel
UN1290-class OUI as `fluttershy` and `kerfuffle`. `talos/talconfig.yaml:170` names
`bc:24:11:11:7d:6a` in hard-hat's `deviceSelector`, and **that MAC does not exist on the node**;
the address arrives at `layer: platform` and the selector resolves to a phantom `ethSel0`.
Two things follow: hard-hat is **bare metal**, which settles the README's open "hard-hat's VM
status is genuinely ambiguous" question in the other direction from the July text; and
hard-hat's talconfig network block is stale and should be corrected by whoever owns
[19](19-rotate-equestria-control-planes.md) — this piece only records the observation.

| Worker | Power-on path |
|---|---|
| `shining-armor` | Proxmox VM on `twilight-sparkle` (`ens18`, `bc:24:11:4c:62:fc`) — `qm start`. **Not powered off during a real window** (§6.1, 2026-08-22): it hosts the backup volumes and stays online |
| `hard-hat` | **bare metal** — WoL or physical button |
| `fluttershy` | bare metal — WoL or physical button |
| `kerfuffle` | bare metal — WoL or physical button |

So WoL covers **three of four workers**, not two. ~~Unverified whether WoL is enabled in BIOS on
any of them.~~ **Confirmed by David, 2026-08-20: all three can be started via WoL.** That removes
the scenario this table existed to price — an exit that needs someone physically at three
machines — and it means `shining-armor`'s `qm start` is a convenience rather than the only
guaranteed path back. §8 Stage 3 still exercises WoL on one node before the full rehearsal
depends on it; that is proof, not investigation.

**Exit sequence:**

1. Power on **one** worker. Reverse of the shutdown order: `hard-hat` first (it is the
   `technitium-dns` node, so restoring it restores DNS), then `fluttershy`, then `kerfuffle`.
   ~~then `shining-armor`~~ — per §6.1's 2026-08-22 correction `shining-armor` was never
   powered off, so it only needs uncordoning (step 3), not starting.
2. Before touching the next node, all four must hold:

   ```bash
   kubectl get node <worker>                                             # Ready
   kubectl -n kube-system exec ds/cilium -- cilium-dbg status --brief    # OK on that node
   kubectl -n longhorn-system get nodes.longhorn.io <worker> \
     -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'  # True
   kubectl get volumes.longhorn.io -n longhorn-system \
     -o custom-columns=ROBUST:.status.robustness --no-headers | grep -c degraded   # trending to 0
   ```

   Rebuilds run at `concurrentReplicaRebuildPerNodeLimit: 2` and the source disks are the SATA
   drives. Expect this to be slow. Slow is the design.
3. `kubectl uncordon <worker>` only after its Longhorn rebuild completes. Uncordoning early
   invites the scheduler to place pods on a node whose storage is still catching up.
4. After all the shut-down workers are back (three, per §6.1's correction): reverse Step 2,
   then Step 1.

   ```bash
   kubectl cnpg hibernate off postgres -n database
   flux -n database       resume kustomization --all
   flux -n kube-system    resume kustomization headlamp descheduler openbao openbao-replica \
                                               node-feature-discovery amd-device-plugin \
                                               intel-device-plugin-gpu intel-device-plugin-operator \
                                               nvidia-device-plugin
   flux -n coder          resume kustomization --all
   flux -n github-actions resume kustomization --all
   flux -n equestria      resume kustomization --all
   ```

   Flux restores the Tier-2 replica counts on reconcile; do not hand-scale them back.
5. Final verification: zero degraded volumes, 160/160 Kustomizations `Ready`, no `Pending` or
   `Terminating` pods left over.

   ```bash
   kubectl get volumes.longhorn.io -n longhorn-system \
     -o custom-columns=ROBUST:.status.robustness --no-headers | sort | uniq -c
   flux get kustomizations -A --status-selector ready=false
   kubectl get pods -A --field-selector status.phase!=Running,status.phase!=Succeeded
   ```

**Why one at a time is non-negotiable.** This is the exact shape of the Cilium zombie-node
cascade that has already forced a physical power-cycle once: a node boots Cilium-not-ready →
its instance-manager goes `OutOfcpu` → Longhorn and CNPG wedge. Four nodes rejoining at once,
each triggering rebuilds and a burst of apiserver writes, is that failure mode turned up — and
during the window the only etcd members are the three control planes, whose NVMe does
**3.7 ms p50 / 13.7 ms p99** WAL fsync against the PNY SATA nodes' 0.74 / 3.9 ms
([19](19-rotate-equestria-control-planes.md), [17](17-nvme-replacement.md)) — permanently
outside etcd's <10 ms guidance. The rejoin write storm lands squarely on the weakest component
if this is rushed. **If a node comes back wrong, check nodes and taints first, not CNPG or
OpenBao.**

### 6.3 Rollback — abort at any point

Every step above is reversible, and there is no point of no return in this piece. Abort by
undoing in reverse:

| Aborted at | Rollback |
|---|---|
| After Step 1 (Flux suspended) | `flux resume kustomization` per §6.2 step 4. Nothing else changed |
| After Step 2 (Tier 2 scaled to 0) | `kubectl cnpg hibernate off postgres -n database`, then resume Flux — it restores every replica count from Git. Do not hand-scale |
| After Step 3 (cordon + Tier-1 moved) | `kubectl uncordon hard-hat fluttershy kerfuffle shining-armor`, then resume Flux. Tier-1 pods stay on the control planes until something restarts them; that is harmless and self-corrects |
| After Step 4, one or more workers off | Power the workers back on **one at a time** per §6.2. This is the same procedure as a normal exit |
| Path A only: taint applied, something broke | `kubectl taint nodes milky-way othalla pegasus node-role.driscoll.tech/critical-` removes it immediately from the live nodes; revert the talconfig change and re-apply so Talos does not put it back. **Removing the taint does not re-fix Longhorn** — if the §0.1 setting was still pending, any csi-plugin/engine-image pod already lost from a control plane needs the DaemonSet rolled after the taint is gone |

The one thing that is *not* cheaply reversible is a `postgres-3` destroy (§2) — that is a CNPG
re-provision and a full base backup over the SATA disk. Decide it before entry, not during.

---

## 7. alpha-site — load-bearing during low-power, and its power circuit (answered)

[07](07-authentik-to-alpha-site.md) landed 2026-08-16, so alpha-site is not a bystander during
a low-power window — it is carrying identity for the entire estate. Its Dockge stacks,
verified 2026-08-19 (`docker/alpha-site/`):

`authentik` + `authentik-outpost` + `postgres` (identity) · `bao-transit` (the transit-seal key
OpenBao unseals against at exit) · `bao-standby` (break-glass Postgres replica) · `netbootxyz`
(how bare-metal nodes PXE-boot if a reinstall is needed mid-window) · `uptime` (Gatus,
`uptime.driscoll.tech` — the observability source for the window) · `prometheus` +
`prometheus-exporters` (scraping the estate from outside) · `backrest`/`backups` · `zwave`
(which is why Home Assistant is not node-pinned in the cluster — the radio hardware is here,
not on a Kubernetes node) · `neo4j`, `lmstudio`, `librespeed`, `openspeedtest`, `arcane-agent`.

This concentration is deliberate and already flagged in 07's design. Low-power is the scenario
that makes it matter: if alpha-site goes dark at the same moment as the cluster, this design
has produced **zero critical services**, not a minimum-critical tier.

**alpha-site now measures the batteries.** The `pecron-monitor` stack landed on alpha-site
2026-08-19 (PRs #962, #964, #967, #968): an MQTT-fed exporter publishing
`pecron_battery_percent`, `pecron_ac_input_power_watts`, `pecron_runtime_remaining_seconds`
and `pecron_device_status` per unit, scraped by alpha-site's own Prometheus, with alert
rules evaluated **there** rather than as an equestria `PrometheusRule` — deliberately, so
that a mains-loss alert does not depend on the cluster it is warning about.

That is directly load-bearing for this file in two ways. It gives §9 item 10 (the low-power
*trigger*) an actual signal to trigger on — `pecron_ac_input_power_watts` falling to zero is
mains loss, and `pecron_runtime_remaining_seconds` is how long the window can last, which is
the number D6's "3–4 h+" was estimated rather than measured. And it means a rehearsal can now
record battery draw against the tier list instead of asserting it. Note the AC-cut *control*
rule was deliberately removed in #967 — this is telemetry and alerting, not automation, which
keeps entry a human decision exactly as this file assumes.

**~~alpha-site is PoE-powered and whether its PoE switch is on the Pecron circuit is still
unverified.~~ ANSWERED by David, 2026-08-20: the battery powers alpha-site.** Since a PoE Pi
has no other power path, that necessarily puts its PoE switch on the Pecron circuit — the two
statements are the same statement. This was the single most important open item in this file,
and it resolves the *good* way.

What that buys: through a grid outage the estate keeps identity (`authentik`), the transit seal
(`bao-transit`), break-glass Postgres (`bao-standby`), netboot, the independent Gatus/Prometheus
observer **and** `pecron-monitor` — the only instrument that says how much runtime is left. The
failure mode this section was written to warn about (cluster up, identity dark) does not apply.

> *"Alpha site is a raspberry pi 4 that is poe powered, so it's downtime is dependent on the
> PoE switch it is getting powered by."* — [comment-6](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734)

The reasoning is kept because it still sets the standard: **the cluster staying up while
identity is dark would be a failure of this design, not a success of it.** That is now a
property the estate has, not a risk it carries.

**The other half of the question is answered too, 2026-08-21, and it answers well.** §0.3's
off-cluster DNS redundancy rests on the three Dockge Technitium members on **celestia**, **luna**
and **skystar**. David: **celestia and luna are on battery; skystar is not, and is remote.**

That is a better answer than "all three on battery" would have been, and it is worth being
precise about why:

| Resolver | Survives a local grid outage | Why |
|---|---|---|
| in-cluster (control planes) | ✅ | trio is on the Pecron circuit |
| `celestia` | ✅ | on battery |
| `luna` | ✅ | on battery |
| `skystar` | ✅ *for its own uptime* | **remote — a different site and a different grid entirely** |

So a local outage leaves **four** resolvers standing, not one, and `skystar` is the only one whose
survival is not a function of how long the Pecron lasts. A battery that runs flat takes the other
three with it; `skystar` is unaffected by that failure mode, which makes it the most valuable of
the three off-cluster members rather than the weakest.

~~**The caveat is reachability, not power.**~~ **Answered by David the same day: the network is
on the batteries as well, and the Internet uplink is itself PoE-powered from the battery.** The
caveat does not apply — `skystar` is reachable, and all four resolvers are genuinely available for
the duration of a window.

**This is the last hardware unknown in this file, and it closes the good way.** What it buys is
larger than DNS:

| Capability during a window | Depends on | Status |
|---|---|---|
| four Technitium resolvers, including the remote one | local network path | ✅ on battery |
| alpha-site's Gatus/Prometheus reaching the outside | Internet uplink | ✅ PoE from battery |
| the mains-loss alert actually reaching David | Internet uplink | ✅ |
| driving §6's runbook remotely rather than at the rack | tailnet egress | ✅ |
| `pecron_runtime_remaining_seconds` readable off-site | Internet uplink | ✅ |

The last two matter more than they look. A runbook-driven posture that can only be driven *from
the house* is a different and worse product than one that can be driven from anywhere — and
battery telemetry that goes dark exactly when the battery becomes interesting would have been
self-defeating.

**The cost, and it is real: the battery is carrying more than the cluster.** D6's "3–4 h+" figure
was reasoned about the three control planes. The Pecron is also feeding alpha-site, the PoE
switch, the network gear and the Internet uplink. None of those is large next to three servers,
but the runtime budget is shared and the figure was never measured.

That is now a **measurement rather than an unknown**, because `pecron-monitor` publishes
`pecron_runtime_remaining_seconds` against the real draw. §8 Stage 1 should record it at idle and
Stage 4 its slope across the window — the number to trust is the one the battery reports, not the
one this file estimated. §9 item 4.

**The original Tier-2 reasoning for `observability`, kept for the record.** This file
originally dropped `observability` to Tier 2 on the grounds that alpha-site's external
Prometheus/Gatus covers the window from outside. [24](24-power-states.md) §1 superseded that
and keeps it in Tier 1; §3 costs the change. Both remain true at once — alpha-site is the
*independent* observer and stays load-bearing regardless of what runs in-cluster, which is
exactly why the PoE question above is not softened by 24's amendment.

---

## 8. Rehearsal — without cutting any power

The exit gate is a **real** full-workers-down cycle for the full 3–4 h. But that should not be
the first thing attempted. Both questions that used to gate it — WoL on the bare-metal workers
and alpha-site's PoE circuit — were answered by David on 2026-08-20 (§6.2, §7), so what is left
is verification rather than investigation. Rehearse in four stages; each stage is independently
useful and none of them requires touching mains power.

### Stage 1 — paper + live read-only (no cluster change at all)

Run §6.0's nine pre-flight commands and record the output. **As of 2026-08-21 eight of nine
pass and none fail** (check 2, etcd, has not been re-run) — see §6.0. Re-run before entry
regardless; this stage is what turns §0 from a list into a burndown.

Additionally, answer by measurement rather than inference:

```bash
# etcd's own footprint, invisible to kubectl top (§9 item 11)
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10,10.10.209.11,10.10.209.12 \
  service etcd status
# and its fsync latency, which is the exit-storm risk in §6.2
kubectl -n observability exec deploy/grafana -- true   # then query:
#   histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m]))
```

**And record the battery's own baseline, which is the number D6 never had.** Now that §7's power
questions are answered, the Pecron is known to be carrying the three control planes, alpha-site,
the PoE switch, the network gear *and* the Internet uplink — a larger load than the "3–4 h+"
figure was reasoned about. `pecron-monitor` measures it, so this stops being an estimate:

```promql
# on alpha-site's Prometheus (deliberately not in-cluster -- §7)
pecron_ac_input_power_watts        # > 0 = on mains; the mains-loss signal is this hitting 0
pecron_runtime_remaining_seconds   # the real answer to "how long can a window last"
pecron_battery_percent
```

~~Record `pecron_runtime_remaining_seconds` at idle here, on mains, with everything up. It is the
ceiling.~~ **That does not work — corrected 2026-08-22.** On mains the device has nothing to
estimate from and reports a flat sentinel (`359640` s = 99.9 h) on all three units. Anyone
following the original instruction would have recorded 99.9 h and moved on.

Compute the ceiling from **load** instead — `pecron_ac_output_power_watts` against the F3000LFP's
3072 Wh — and record the 24 h mean *and* peak, because they give very different answers. See
"Stage 1 RESULTS" below. Stage 4 then records the real discharge slope with the workers off, which
is the only number that settles it. §9 item 11.

#### Stage 1 RESULTS — run 2026-08-22

**All nine pre-flight checks pass. First time.** Check 2 (etcd) had never been re-run in this
plan's history and is included below.

| # | Check | Result |
|---|---|---|
| 1 | Topology | **pass** — 7 Ready, none cordoned; the trio carries `node-role.kubernetes.io/control-plane:NoSchedule`, the four workers carry none |
| 2 | etcd | **pass** — 3 voting members, no learners, **no alarms**, all three at raft index 266533227 / term 408, leader `milky-way`. DB 296–307 MB, 141 MB in use (46 %) against the 4 GiB `quota-backend-bytes` |
| 3 | Zero degraded volumes | **pass** — 0 degraded, 0 faulted |
| 4 | Tier-1 volumes ≥ 2 replicas on the trio | **pass**, but the check as worded reports 10 false failures — see below |
| 5 | Piece 12 landed | **pass** — `longhorn` is `bulk`, `longhorn-critical` exists, all 7 nodes tagged (`critical` ×3, `bulk` ×4) |
| 6 | Longhorn `taint-toleration` | **pass** — `APPLIED: true`, annotation present on `longhorn-csi-plugin` |
| 7 | Flux reconciled | **pass** — 0 Kustomizations and 0 HelmReleases not-ready |
| 8 | DNS on a control plane | **pass** — `technitium` on `othalla` via `technitium-dns: "true"` |
| 9 | alpha-site up | **pass** — Gatus answered |

**Check 4 is worded so that it can never read clean, and that needs fixing before it trains
anyone to ignore it.** It asks for ≥ 2 replicas on the trio across every `critical` volume, but
piece 12 also introduced `longhorn-critical-snapshot` and `longhorn-critical-cache` at
`numberOfReplicas: 1`. Ten VolSync staging volumes therefore report "1 replica" forever, by
design. The seven real Tier-1 volumes — `home-assistant`, `matter`, `mosquitto-0`, `mosquitto-1`,
`technitium`, `tsidp`, `tsiam` — all hold **3 replicas on the trio and are `healthy`**. Read the
check as "every 3-replica `critical` volume", or it is the same always-dirty signal §9 item 1
already flags for the registry.

#### etcd's footprint — §9 item 11, answered

The number §3's capacity model excluded, because it is a host service and invisible to
`kubectl top`:

| Node | etcd RSS |
|---|---|
| `milky-way` (leader) | **585 MiB** |
| `othalla` | **448 MiB** |
| `pegasus` | **431 MiB** |

≈ **1.43 GiB across the trio**, ~0.5 GiB per 16 GiB node. Meaningful against §3's arithmetic but
not alarming, and the leader carries the most — worth remembering when the leader is also the node
you are about to reboot.

#### etcd fsync — the exit-storm risk, and it is real

Over a 6-hour window, cluster-wide:

    p50   3.8 ms
    p99  14.4 ms      ← etcd's guidance is < 10 ms

Per node the p99 sits at 13–14 ms, and backend-commit p99 at 16 ms. **This is at idle, on mains,
with everything healthy.** It matches the README's ShiJi-NVMe measurement (3.7 ms p50 / 13.7 ms
p99) almost exactly, which makes it hardware-bound and persistent rather than transient load.

§6.2 calls the exit the dangerous direction because of the write burst when workers return. That
burst lands on an etcd already outside guidance before it starts. Not a blocker for entering a
window — but it is a measured reason to bring workers back **one at a time with the gates between
them**, exactly as §6.2 already insists, rather than treating that rule as ceremony.

#### The battery baseline — and the metric this file told you to use does not work

**`pecron_runtime_remaining_seconds` is a sentinel while on mains.** All three units report a flat
`359640` (99.9 h), unchanged across the whole retention window. The device has nothing to estimate
from when it is not discharging. Stage 1 as originally written said to "record
`pecron_runtime_remaining_seconds` at idle here, on mains… It is the ceiling" — that cannot work,
and anyone following it would have written down 99.9 h and moved on.

Compute it from load instead. Three units, `pecron-monitor` scraped through to Thanos:

| Unit | Now | 24 h mean | 24 h peak | Battery |
|---|---|---|---|---|
| **Primary** | 294 W | **349 W** | **1650 W** | 98 % |
| **Backup** | 79 W | 116 W | 901 W | 98 % |
| **Spare** | 0 W | 3.5 W | 27 W | 100 % (standby) |

At the F3000LFP's 3072 Wh, and derating 0.88 for inverter losses:

| Unit | at 24 h mean | at 24 h peak |
|---|---|---|
| **Primary** | **≈ 7.7 h** | **≈ 1.6 h** |
| Backup | ≈ 23.3 h | ≈ 3.0 h |

**Primary is the binding unit, and the answer is better than D6 assumed at typical load and worse
at peak.** ~7.7 h against a 3–4 h target is real headroom. But the observed 24-hour peak of 1650 W
gives only ~1.6 h — under target. That peak is workers under load, which is precisely what a
low-power window removes, so the design is sound; what it means is that **entering late, after
load has already spiked, is materially different from entering at rest**, and the runbook should
say which one it assumes.

Two things this does not answer, and Stage 4 must: which loads sit on which unit (the mapping is
not in the metrics), and the actual discharge slope with the workers off — the only number that
settles it. Pack voltage 53.1–53.6 V, current −0.2 to −0.3 A (float), temperatures 26 °C / 26 °C /
32 °C.

### Stage 2 — scheduling dry-run (reversible in seconds, no node powered off)

Cordon the four workers, do **not** shut them down, and observe where the Tier-1 set would go:

```bash
kubectl cordon hard-hat fluttershy kerfuffle shining-armor
kubectl -n stargate-command delete pod -l app.kubernetes.io/name=home-assistant
kubectl get pods -n stargate-command -o wide -w
```

This proves — or disproves — that Tier 1 can *schedule* on the trio, which is a different
question from whether it can *run* there. It is where §0.3's Technitium problem shows up as a
`ContainerCreating` pod with a CNI error rather than as a theory. Undo with
`kubectl uncordon hard-hat fluttershy kerfuffle shining-armor` and let Flux/the descheduler
settle it back.

### Stage 3 — one worker off, mains power untouched

`talosctl shutdown` **one** worker (`shining-armor` — fewest Tier-1 pods, and restartable with
`qm start` regardless of what WoL does). Hold it down for one hour. This
answers, at 1/4 the blast radius:

- Does §5's `nodeDownPoddeletionPolicy` behave as documented (Tier-2 pods `Pending`, not
  `Terminating`)?
- Does the 600 s `replica-replenishment-wait-interval` start rebuilding Tier-2 volumes onto the
  trio at the ten-minute mark? If piece 12 Step 3 is live, it must **not**. This is the single
  cheapest test of §0.2 and should be run the moment 12 lands.
- Does the trio's SATA disk temperature move? `kubectl -n observability` → the
  `smartctl-exporter` series, or the piece-12 numbers as a baseline.

Then power it back on and run §6.2's per-node gates.

**Run a WoL power-on against one bare-metal worker here too** — `hard-hat`, `fluttershy` or
`kerfuffle`. David has confirmed all three support it (§6.2); this proves the magic packet
actually reaches them on the current VLAN, which is the part a BIOS setting does not guarantee.
Cheaper to find a broken WoL path on one node now than on three during an exit.

> **Reconsider the pick, 2026-08-22.** `shining-armor` is now the one worker that *stays up*
> during a real window (§6.1), so shutting it down rehearses the node whose loss the design no
> longer plans for. It is still the cheapest and safest single-node test — that is why it was
> chosen — but if the goal is to rehearse Battery rather than to exercise §5's
> `nodeDownPoddeletionPolicy`, use `kerfuffle` instead and take the WoL power-on on the same
> node. Note what the nightly Low Power window (#1046) does **not** substitute for here: it
> scales Tier 2 to zero and detaches those volumes cleanly, which is a graceful shutdown. §5's
> `nodeDownPoddeletionPolicy` and the `replica-replenishment-wait-interval` only fire when a
> node goes **away**, so Stage 3 still has to actually power something off.

### Stage 4 — the real thing (the gate)

~~All four workers down~~ **the three bare-metal workers down** (§6.1's 2026-08-22 correction —
`shining-armor` stays online), the full 3–4 h, one-at-a-time exit per §6.2.

Gate checklist before calling this mode rehearsed:

- [ ] §6.0's nine pre-flight checks all green before entry.
- [ ] `hard-hat`, `fluttershy` and `kerfuffle` cordoned and shut down with no `kubectl drain`
      and no hang; `shining-armor` left running, cordoned or not per §6.1 Step 3's choice.
- [ ] Zero Tier-1 volumes degraded below 2 replicas for the full window.
- [ ] DNS, NTP, MQTT, Home Assistant, Traefik and forward-auth (against alpha-site) verified
      reachable at the **1 h, 2 h and 3–4 h** marks, not just at entry.
- [ ] alpha-site's Gatus stayed reachable for the entire window (answers §7 with evidence).
- [ ] etcd `wal_fsync` p99 stayed under 10 ms for the duration — measured, not assumed.
- [ ] Tier-2 pods went `Pending` as §5 predicts and rescheduled cleanly on exit with no
      orphaned `Terminating` pods.
- [ ] Exit completed one node at a time with no Cilium-not-ready / `OutOfcpu` cascade.
- [ ] Every worker came back by its documented power-on path (§6.2 table) — WoL confirmed or
      confirmed unavailable, per node.
- [ ] 160/160 Kustomizations `Ready` and zero degraded volumes at the end.

Only after this is green should low-power be treated as validated for a real grid outage. The
blast radius of skipping it is small — nothing here is irreversible — but the failure mode if
it is wrong (identity dark, DNS down, wife's lights off) is exactly the one D6 exists to
prevent.

---

## 9. Open items

Resolved, and left resolved:

- ~~Is Home Assistant Tier 1?~~ Confirmed by David, comment-6.
- ~~Is Home Assistant node-pinned to Zigbee/Z-Wave hardware?~~ **No** — no `nodeSelector`,
  `nodeName` or device `hostPath` in its HelmRelease; the radios run in alpha-site's `zwave`
  stack. Re-verified 2026-08-19.
- ~~Should `critical-tier` sit above or below `system-cluster-critical`?~~ **Below** — §4.
- ~~Does anything read OpenBao at request time, bypassing synced Secrets?~~ **No** — §2.
- ~~Re-verify §3's capacity numbers live.~~ **Done 2026-08-19** — §3. Result: it fits, but CPU
  is the tight axis, not the 2×-on-both-axes the old figure implied.
- ~~Is `hard-hat` a Proxmox VM?~~ **No, it is bare metal** — §6.2. Only `shining-armor` is a VM.
- ~~§0.1 — schedule the all-volumes-detached quiesce window for `taint-toleration`.~~
  **Not needed.** The setting was landed by hand-writing the `last-applied-tolerations`
  annotation, with zero detach window and zero pod restarts — §0.1 has the mechanism and the
  three source-verified reasons it is safe.
- ~~§0.2 — piece 12's tags and StorageClasses.~~ **Landed 2026-08-19** (PR #960). One caveat
  survives: the `bulk` selector did not relocate existing replicas — §0.2.
- ~~§0.3 — how does DNS survive a low-power window?~~ **Decided 2026-08-19 and executed
  2026-08-20.** Technitium runs on the control planes; the NAD binds `enp3s0`; the PVC moved
  to `longhorn-critical` in #963. Verified live end to end — §0.3.
- ~~Move the Tier-1 PVCs onto `longhorn-critical`.~~ **Done 2026-08-19**, PRs #963
  (`technitium`, `tsidp`, `tsiam`) and #966 (`home-assistant`, `matter`, `mosquitto`). All
  seven now hold three control-plane replicas and are `healthy` — §5. This was item 1 for
  most of the day and is the reason the pre-flight in §6.0 went from two failures to one.
- ~~`shining-armor` stuck at Talos v1.13.8 and cordoned, CNPG at 2/3.~~ **Fixed 2026-08-20.**
  Root cause was the **drain**, not the install: `tuppr` runs `talosctl upgrade` with drain
  enabled, and the drain looped on Longhorn `instance-manager` evictions until the context
  deadline, so the installer never started. `talosctl upgrade --drain=false` against the
  already-cordoned node completed in one pass. All seven nodes are on v1.13.9, CNPG is 3/3,
  and `tuppr` reports `Completed`. Three things that read as failures during recovery and
  were not: `longhorn-manager` CrashLoopBackOffs on first boot and self-heals; the
  instance-managers cannot return until the node is **uncordoned**; and `tuppr` never
  self-clears a `Failed` TalosUpgrade — it needs a generation bump (delete the CR and let
  Flux recreate it), because annotations do not bump `metadata.generation`.
- ~~`postgres-3` and the taint.~~ **Moot.** It is on `kerfuffle` with its `longhorn-local`
  PV pinned there; CNPG healthy 3/3. [29](29-taint-readiness-audit.md)'s blocker 2 is closed
  and no toleration/destroy decision is needed.

Still open, in priority order. **Items 4 and 5 are answered but keep their numbers**, struck
through in place rather than moved to the resolved list above — several sections cross-reference
"§9 item N", and renumbering has silently broken those references before.

1. ~~**`kube-system/registry` is Tier 0 and has zero control-plane replicas.**~~ **ANSWERED
   2026-08-21, and the premise was wrong in a way worth reading.** The item assumed the
   registry was a working mirror whose only defect was storage placement. It was not a
   working mirror at all.

   **It was not in the pull path.** `spegel.appendMirrors: true` does not exist in the spegel
   chart — zero occurrences at 0.7.4 — so it was silently dropped, `--prepend-existing=false`
   stood, and spegel moved the entire Talos mirror list into
   `/etc/cri/conf.d/hosts/_backup/`, writing a `_default/hosts.toml` naming only itself. The
   proof was zot's own catalog: **zero repositories on a 60Gi PVC.** Nothing had ever pulled
   through it. Real path was spegel → upstream.

   **And the mirror list would not have worked anyway**, in two different directions.
   `overridePath` is a mirror-wide flag (Talos rejects per-endpoint objects), so
   `docker.io`/`gcr.io`/`quay.io`/`ghcr.io` had working zot endpoints and *decorative*
   upstream fallbacks (`https://index.docker.io` without `/v2` is a 301 to a web page, not a
   registry API), while `registry.k8s.io`/`public.ecr.aws`/`cgr.dev` had the inverse — working
   upstream, and zot endpoints resolving to `…/v2/<reg>/v2/<repo>`.

   **Then a third fault, only visible once the first two were fixed:** the primary zot endpoint
   was `registry.kube-system.svc.cluster.local`. containerd runs on the **host**, whose
   resolvers are `9.9.9.9, 149.112.112.112, 10.10.10.9, 10.10.0.1` — no cluster DNS. It had
   never resolved. Measured: a 2.8 MB `alpine` pull took **2m32s** walking dead endpoints.

   Fixed in #1012 (paths), #1013 + #1015 (spegel `prependExisting` **and**
   `mirroredRegistries` — the first is inert without the second), and #1016 (a resolvable
   endpoint). Live chain, verified on a control plane and a worker:

   **spegel → equestria zot → celestia zot → upstream**

   Proven end to end rather than by inspection — zot's log shows the pull arriving from
   `User-Agent: containerd/v2.2.7`, `X-Real-Ip: 10.10.206.10`, and the same pull now takes
   **4.65s against 2m32s**. Note `registry.driscoll.tech` is **celestia's** zot, not a second
   name for this one; it serves the same layout and is kept deliberately as a cross-cluster
   fallback on another battery-backed host.

   ~~**The storage half is a deliberate open decision, not an oversight.**~~
   **MERGED — the decision reversed, and every cost below is retired. Verified live
   2026-08-23.** [#1014](https://github.com/david-driscoll/home-operations/pull/1014) landed
   as `a229071b` ("make zot Tier 1 — control-plane toleration and `longhorn-critical`"), so
   the paragraph that follows describes a posture the estate no longer holds. Kept because
   the reasoning is still the reasoning, and because the *shape* of the argument — never
   half-merge a toleration without its storage — is the one this file keeps re-learning.

   Live today: the `registry` PVC is `longhorn-critical` with **3 replicas on the trio, all
   `healthy`**, and the zot pod carries `node-role.kubernetes.io/control-plane`. §6.0's
   corrected check 4 now returns **eight** Tier-1 volumes rather than seven — `registry`
   joined `home-assistant`, `matter`, `mosquitto-0/1`, `technitium`, `tsidp` and `tsiam`.

   **The RWX refinement is answered too, and the answer is milder than this file expected.**
   The concern was that a `ReadWriteMany` volume needs a share-manager pod that must itself be
   schedulable on a tainted control plane. It is: Longhorn's `taint-toleration` setting (§0.1)
   propagates to share-manager pods, and `share-manager-pvc-8eea418a…` was observed carrying
   `node-role.kubernetes.io/control-plane`. It currently runs on `shining-armor`, which stays
   online through Battery anyway (§6.1's 2026-08-22 correction), so it does not even need to
   move. **RWX is no longer a Battery blocker** — RWO would still be simpler for a
   `replicas: 1` Deployment, but it is now a tidiness argument, not a correctness one, and
   access mode is immutable so it would still cost a PVC recreate.

   The original text, for the record:

   > Left whole rather than half-merged on purpose: toleration without storage is the same
   > deferred-failure shape as the taint without tolerations, so zot stays a coherently
   > worker-resident service (`kerfuffle`, no CP toleration) instead.
   >
   > What that costs during a window, stated so nobody has to re-derive it:
   >
   > - **Images still pull.** That is the point of the chain above. A dead-but-*resolvable*
   >   endpoint fails fast through traefik — nothing like the 2m32s, which was an unresolvable
   >   name black-holing. celestia's zot and upstream both stay reachable on battery (§7).
   > - **zot itself is down for the whole window.** All three replicas are on workers, and
   >   because the volume is **RWX** its share-manager is on a worker too (`kerfuffle`), so
   >   there is neither a replica nor a share-manager to attach from.
   > - **§6.0 check 3 is dirty by construction.** "Zero degraded volumes" can never pass
   >   during a window while zot is on `bulk`.
   > - **The cache is absent in the one case it exists for** — a pod crash-looping mid-window.
   > - It quietly moves the nearest cache onto **celestia**, whose tiering this file has never
   >   reasoned about.

   **What still needs doing:** write zot into §1's tier table as Tier 1 rather than leaving
   its status implied by a closed open-item. Note also that check 3's "dirty by construction"
   cost was retired twice over — once by #1014 moving zot onto `critical`, and once by §6.0's
   check 3 being rewritten (§9 item 8) so that it measures the right thing in the first place.
2. ~~**Build §4's remaining half: Tier-0/1 tolerations and the taint flip.**~~ **DONE and LIVE
   2026-08-21.** Split into two PRs deliberately, because the halves apply by different
   mechanisms and had to be sequenced:

   * **[#1001](https://github.com/david-driscoll/home-operations/pull/1001) — tolerations.**
     **Merged and reconciled 2026-08-21**; all six verified live carrying the key, and the audit
     filter now returns only the Tier-2 set. Covers the six workloads in the audit table below. `equestria-kubeproxy` needed a
     new `control-plane-tolerant` ProxyClass: a Tailscale `ProxyGroup` exposes no pod-spec
     fields of its own, so `spec.proxyClass` is the only route to its StatefulSet's pod
     template.
   * **[#1002](https://github.com/david-driscoll/home-operations/pull/1002) — the taint.**
     Merged and **applied 2026-08-21**, one node at a time. `talos/patches/` is **not** GitOps —
     Flux never reads it — but it was applied with `talosctl patch machineconfig`, **not**
     `mise run talos:apply`: a blanket apply would have carried an in-flight, tuppr-owned
     Kubernetes upgrade with it. §4's "How it was actually applied" has the detail, and it
     generalises to every future `talos/patches/` change.

   [29](29-taint-readiness-audit.md)'s four-command gate re-verified live 2026-08-20 — all four
   pass; §7's post-flip block re-verified 2026-08-21 and passed clean. The `critical-tier`
   PriorityClass and the three `system-cluster-critical` corrections landed earlier in PR #970.

   PR #764 (`taintToleration` set to the custom `node-role.driscoll.tech/critical` key) was
   **closed** the same day: the estate went with the standard `node-role.kubernetes.io/control-plane`
   key instead, and that value is live and `APPLIED: true`, so merging #764 would have stripped
   Longhorn's real toleration exactly as the taint landed.

   What is left is the tolerations that make the taint *useful* rather than merely safe.
   Audited live 2026-08-20 — pods on the trio that carry **neither** the explicit
   control-plane toleration **nor** a blanket `operator: Exists` (which is what makes the
   DaemonSet fleet a non-issue):

   | Pod | Tier | What the flip does to it |
   |---|---|---|
   | `kube-system/metrics-server` | **0** | Must gain the toleration. Losing it on recreate degrades HPA and `kubectl top` estate-wide |
   | `stargate-command/chrony-0` | **1** | Must gain it — NTP is a low-power survivor |
   | `stargate-command/mosquitto-1` | **1** | Must gain it — one of two MQTT members |
   | `tailscale-system/equestria-kubeproxy-1` | **1** | Must gain it |
   | `observability/unpoller` | **1** per [24](24-power-states.md) §1 | Must gain it if 24's amendment stands |
   | `kube-system/kube-downscaler` | special | Needs to run in **Low Power** (it *is* the shed mechanism) but not in Battery. Needs an explicit call, not a default |
   | `equestria/{pinepods,teamarr,windmill-app,windmill-extra,windmill-workers-*}` | 2 | Correctly migrate off on recreate — no action |
   | `kube-system/openbao-0` | 2 | Correctly migrates off — no action |
   | `database/postgres-backup` (Job) | 2 | Correctly migrates off — no action |

   Note `chrony` and `mosquitto` are the same two workloads PR #970 moved to `critical-tier`:
   their priority is now right and their *placement* is still wrong, which is the sharpest
   illustration of why the taint without the tolerations is only half a change.
3. **Tier calls at the margins** — moved up from item 6 now that the storage measurements
   exist. `golink` (link shortener, 0 CP replicas) and `taildrive` (file share, 0) should be
   written down as **Tier 2**; their placement already matches. `crowdsec-*` is Tier 1 only
   by living in `network` and is almost certainly Tier 2 — three volumes, 0 CP replicas.
   `matter` (`hostNetwork`, shares `${AUTOMATION_VIP}`) and `tsiam` have never been
   tier-assigned explicitly. None of these blocks anything; all of them make §6.0's check 4
   ambiguous until written down.
4. ~~**Is alpha-site's PoE switch on the battery circuit?**~~ **ANSWERED by David 2026-08-20:
   the battery powers alpha-site.** A PoE Pi has no other power path, so that settles the switch
   too. The estate keeps identity, the transit seal, break-glass Postgres, netboot, the
   independent Gatus/Prometheus observer and `pecron-monitor` through a grid outage — §7. This
   was the item that determined whether entering a window is *worth* it, and it resolves the
   good way.

   ~~**The second half of this item:** are `celestia`, `luna` and `skystar` on battery?~~
   **ANSWERED by David 2026-08-21: celestia and luna are on battery; skystar is not, and is
   remote.** Four resolvers survive a local outage — the in-cluster copy, celestia, luna (all on
   the battery) and skystar (a different site and grid, so unaffected by the battery running
   flat). §7 has the table.

   ~~**Replaced by a sharper question: is the local network gear on the Pecron circuit?**~~
   **ANSWERED by David 2026-08-21: the network is on the batteries as well, and the Internet
   uplink is itself PoE-powered from the battery.** `skystar` is reachable, alpha-site's off-site
   telemetry and mains-loss alerting work, and §6's runbook can be driven remotely rather than at
   the rack. **Every hardware question in this file is now closed.** §7 has the table.

   What replaces it is not a question but a **measurement**: the battery carries the cluster,
   alpha-site, the PoE switch, the network and the uplink, so D6's "3–4 h+" — reasoned about three
   control planes alone — is an estimate against a larger load than it assumed.
   `pecron_runtime_remaining_seconds` measures the real thing. §8 Stage 1 records it at idle,
   Stage 4 its slope. Folded into item 11's measurement work rather than kept as an open question.
5. ~~**WoL on `hard-hat`, `fluttershy` and `kerfuffle`**~~ — three bare-metal workers (§6.2).
   **ANSWERED by David 2026-08-20: all three can be started via WoL.** That retires the exit
   scenario this was priced against — someone physically at three machines — and demotes
   `shining-armor`'s `qm start` from "the only guaranteed path back" to a convenience.

   What remains is proof rather than investigation: a BIOS setting does not guarantee the magic
   packet reaches the node on the current VLAN. §8 Stage 3 now exercises one WoL power-on
   alongside the single-worker shutdown, and §8 Stage 4's checklist still records the path each
   worker actually came back by.
6. **`observability`'s control-plane pods have no toleration.** [24](24-power-states.md) §1
   keeps `observability` up during Battery, but live today `kube-state-metrics`,
   `prometheus-operator` and `unpoller` run on the trio with **no** control-plane toleration.
   After the §4 flip they keep running and then cannot come back on recreate. If 24's
   amendment stands, they need the toleration in the same change as the flip — the same trap
   `postgres-3` used to be.
7. **`tsidp`'s `hostname NotIn [othalla]` anti-affinity** (§1) — a Tier-1 workload excluded
   from a control plane. Copied verbatim during piece 21; confirm whether the reason still
   applies before §4's required affinity is written.
8. **Tier-2 backfill of `spec.nodeSelector: ["bulk"]`** onto existing volumes, and the
   rebuilds that actually move them off the control-plane disks (§0.2). Owned by
   [12](12-longhorn-critical-tier.md). **Measured 2026-08-20: 100 volumes still hold at least
   one replica on the trio.** The `bulk` selector governs where a *new* replica may be
   scheduled and never evicts an existing one, so this does not improve on its own — and the
   2026-08-20 reboot rebuilt 33 volumes without changing it, because a rebuild replaces a
   replica in place rather than re-placing the volume. Until it runs, the trio's SATA disks
   still carry Tier-2 data and §0.2's thermal argument is only half-retired. The Tier-1
   migration (#963/#966) has now *added* ~68 GB of Tier-1 data to those same disks, which is
   by design but raises the stakes on evicting the Tier-2 tenants.

   **Re-measured in full, 2026-08-23 — the count barely moved, but what it is made of changes
   the item.** 99 of 195 volumes still hold a trio replica, against 100 on 2026-08-20, which
   confirms the "a selector never evicts" mechanism exactly. Broken down for the first time:

   | Volumes with a trio replica | `nodeSelector` | Count |
   |---|---|---|
   | legitimately resident (Tier 1) | `critical` | 18 |
   | **the backfill target** | **`(none)`** | **78** |
   | the selector working as intended | `bulk` | 3 |

   **The target volumes do not carry `bulk` — they carry no selector at all.** This item has
   been written as "backfill `bulk` onto existing volumes", which reads as though the label is
   present and merely unenforced. It is absent: these 81 volumes predate
   [12](12-longhorn-critical-tier.md) landing on 2026-08-19, and Longhorn stamps
   `spec.nodeSelector` at *provision* time from the StorageClass. Volumes created before that
   day are free to place replicas anywhere, permanently.

   **Every Longhorn StorageClass is now correct, so nothing refills this.** Verified live:
   `longhorn`, `longhorn-cache` and `longhorn-snapshot` are all `nodeSelector: bulk`;
   `longhorn-critical{,-cache,-snapshot}` are `critical`; only `longhorn-local`
   (`strict-local`, 1 replica, by design) has none. The backfill is a **one-time, bounded
   burndown of 81 legacy volumes**, not a leak that has to be plugged first.

   **And what is actually on those disks is not application data.** 97 non-critical replicas,
   **63.7 GiB** (milky-way 32 / 27.6 GiB, othalla 22 / 7.8 GiB, pegasus 43 / 28.2 GiB):

   | What | Volumes | Size |
   |---|---|---|
   | VolSync restore destinations (`*-dst-dest`) | 39 | 44.6 GiB |
   | VolSync restic caches (`*-dst-cache`) | 39 | 3.5 GiB |
   | VolSync source caches (`volsync-src-*-cache`) | 3 | 0.3 GiB |
   | **real application data** | **0** | **0** |

   **There is no Tier-2 application data on the control planes.** It is 100 % VolSync scratch,
   all of it regenerable from restic. That materially weakens §0.2's thermal argument rather
   than half-retiring it: **all 97 replicas belong to `detached` volumes** — zero attached, so
   they do no I/O and generate no heat except during an actual restore. The disks are carrying
   idle bytes, not write load. §0.2's concern was Tier-2 *workloads* doing I/O on the trio's
   Transcend SATA disks, and by that measure the trio is already clean.

   > ⚠️ **Do not burn this down the obvious way — it is a data-loss trap.** The natural move
   > is "patch `spec.nodeSelector`, delete the trio replica, let it replenish onto `bulk`",
   > which is what [30](30-longhorn-media-tier.md) established is required because a selector
   > patch alone moves nothing. **78 of the 81 target volumes have their *only* replicas on
   > the trio** (`want: 2`, `have: 1` for most; a few hold 2, both on the trio). Deleting the
   > trio replica on those destroys the volume. Only 3 — the `volsync-src-*-cache` trio, the
   > ones already carrying `bulk` — have a replica off the trio to fall back on.
   >
   > Compounding it: a **detached** volume does not rebuild. Longhorn replenishes on attach,
   > so the delete-and-replenish loop does not even run until something mounts the volume.

   **A monitoring blind spot falls out of the same measurement, and it is the part worth
   acting on.** Those 78 volumes are under-replicated *right now* — `numberOfReplicas: 2` with
   one replica — and **nothing can see it.** Detached volumes report
   `robustness: unknown`, not `degraded`, so §6.0 check 3 ("zero degraded volumes", which
   returns a clean 0 today) is structurally blind to them, as is any alert written against
   `robustness`. This is the same family as [30](30-longhorn-media-tier.md)'s finding that
   three Longhorn volume alerts had never been able to fire.

   **Recommended shape, given all of the above:** stop treating this as a replica-eviction
   exercise. The cheapest correct route is to let VolSync scratch be *recreated* rather than
   *moved* — the destinations and caches are disposable by construction and will provision
   against the corrected StorageClasses — and to fix the `robustness`-blind check separately,
   since that one is real whether or not the burndown ever runs. Needs David's call before
   anything is deleted.
9. **`hard-hat`'s stale talconfig `deviceSelector`** (§6.2) — names a MAC that does not
    exist on the node. Not this piece's to fix; raise against
    [19](19-rotate-equestria-control-planes.md) / talconfig.
10. **Low-power trigger.** ~~D6 settled duration (3–4 h+) but not trigger.~~ **SUBSTANTIALLY
    DELIVERED 2026-08-22, for the *scheduled* trigger — not the grid-loss one.** The question
    split in two, and the halves resolved differently:

    * **"Enter a lower-power state at night" is built and running.**
      [#1046](https://github.com/david-driscoll/home-operations/pull/1046) gives
      py-kube-downscaler `--default-downtime=Mon-Sun 02:00-09:00 ${TIMEZONE}`, so Tier 2 sheds
      every night with no human in the loop and no annotation. The timezone comes from the
      `TIMEZONE` key of the `shared-secrets` Secret rather than being hardcoded, so this window
      and #1047's Gatus maintenance windows cannot drift apart. The keep-list survives on
      `downscaler/exclude` precedence, already proven by two dry-run scans (24 "Exercised
      2026-08-21"). Two companion changes make the window quiet and make it *deeper*:
      [#1047](https://github.com/david-driscoll/home-operations/pull/1047) stops 26 shed
      services paging Gatus for seven hours a night. (A third,
      [#1051](https://github.com/david-driscoll/home-operations/pull/1051), would have made it
      possible to power **both** media workers off during the window rather than one — it was
      **reverted** the same evening, so the window shrinks nothing at the node level. See
      [30](30-longhorn-media-tier.md).
      [#1048](https://github.com/david-driscoll/home-operations/pull/1048)'s GPU split stands
      on its own and is unaffected.)
    * **Grid-loss auto-entry is still not built, and is still a policy call.** The signal
      exists — alpha-site's `pecron-monitor` publishes `pecron_ac_input_power_watts` and
      `pecron_runtime_remaining_seconds`, off-cluster by design (§7) — and #967 deliberately
      removed the one rule that *acted* on it. Nothing added since acts on it either. The
      choice remains "alert David, David runs §6" versus "automate entry."

    **What is still manual in the delivered half, so the item is not closed outright:** nothing
    powers a node off or wakes one up on a schedule. #1046 sheds *workloads only* — node
    shutdown and the WoL return trip are §6's human runbook.

    > **Amended 2026-08-22 evening.** This paragraph previously said #1051's node-shedding
    > half was merely *blocked* on 30's volume migration. It is not blocked — it is
    > **withdrawn**. The media-relocation design was reverted the same evening, so overnight
    > node shutdown is not pending completion of anything; it is no longer the plan. The
    > media workers stay powered and idle. This item stays open on the strength of the
    > grid-loss half only.
11. ~~**etcd's memory footprint on Talos** is invisible to `kubectl top`.~~ **MEASURED
    2026-08-22** in §8 Stage 1: **585 / 448 / 431 MiB** on milky-way / othalla / pegasus,
    ≈ 1.43 GiB across the trio, leader highest. §3's arithmetic can now include it.

    The same run measured the thing that turned out to matter more: **etcd's WAL fsync p99 is
    14.4 ms cluster-wide over 6 h (p50 3.8 ms), against etcd's < 10 ms guidance** — at idle, on
    mains, healthy. Hardware-bound, matching the README's ShiJi-NVMe figures. It does not block a
    window; it is a measured reason §6.2's one-node-at-a-time exit is a real constraint rather
    than ceremony.
12. ~~**The `longhorn-media` volume migration is unfinished — one volume left.**~~
    **CLOSED — NOT COMPLETED, ABANDONED. 2026-08-22 evening.** The migration was in flight
    (`dispatcharr` and `plex` done, `jellyfin` mid-rebuild) when the whole media-relocation
    design was reverted. There is nothing left to migrate: the `longhorn-media` class is
    deleted and the three PVCs are on `longhorn`, where they always were.

    The item is kept rather than removed because its *reason for existing* is the useful
    part, and [30](30-longhorn-media-tier.md) now records it: every shape of this design
    traded a nightly degraded volume for all-day remote reads or ~170 GiB of nightly rebuild
    churn, and the cluster-wide tuppr degraded-gate turned any scheduled degradation into a
    seven-hour nightly upgrade freeze.

    **The live Longhorn volumes are being returned to ordinary `bulk` placement separately
    by the coordinator** — that is volume-level work, not a Git change, and is not part of
    the revert commit.

---

## Cross-references

- [00-README](README.md) — decision ledger, full sequencing, cross-cutting rules
- [29-taint-readiness-audit.md](29-taint-readiness-audit.md) — the four-command gate on
  `allowSchedulingOnControlPlanes: false`, now green; owns the estate-wide audit of what the
  taint would strand, which §4 depends on and §9 item 7 extends
- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — the storage tagging this piece
  depends on; owns the `critical`/`bulk` tags, the `longhorn-critical` StorageClass, the
  default-class `nodeSelector` that §0.2 turns on, and the disk measurements that justify
  keeping `critical` on the control planes
- [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md) — the topology
  this piece now runs on for real, the etcd fsync measurements §6.2 cites, and the owner of
  §6.2's stale-`deviceSelector` finding
- [24-power-states.md](24-power-states.md) — amends §1 (tier membership) and §4 (placement
  model); read both, this file is not superseded by it. It also owns **Low Power**, the nightly
  02:00–09:00 shed that landed 2026-08-22 — a different state from this file's Battery
- [30-longhorn-media-tier.md](30-longhorn-media-tier.md) — **ABANDONED design.** Was the
  `longhorn-media` class and the migration that would have let both media workers be shed
  overnight; now the record of why that was dropped on 2026-08-22 and of the findings worth
  keeping (Longhorn never auto-evicts tag-nonconforming replicas; the `force: enabled` PVC
  data-loss trap; the dead volume alerts). §9 item 12 closes it
- [07-authentik-to-alpha-site.md](07-authentik-to-alpha-site.md) — the landed precondition that
  makes CNPG droppable to Tier 2, and the source of §7's concentration risk
- [03-secrets-bootstrap-independence.md](03-secrets-bootstrap-independence.md) — the OpenBao-era
  bootstrap catch-22 that §2's decision is a corollary of
- [16-soak-and-gate.md](16-soak-and-gate.md) — the rehearse-before-trust pattern §8 mirrors
- [17-nvme-replacement.md](17-nvme-replacement.md) — the etcd-disk weakness that makes §6.2's
  one-at-a-time exit non-negotiable
