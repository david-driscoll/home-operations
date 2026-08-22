# 24 — Three-state power model (Full / Low Power / Battery)

Not yet filed as a vault#84 sub-issue letter — this piece is new, introduced
2026-08-13, extending [20-low-power-tier.md](20-low-power-tier.md) rather than
replacing it. ~~**This is a design proposal, not yet executed or rehearsed.**~~
**Low Power is built and running nightly as of 2026-08-22; Battery is still a design.**
Where it states something as fact it was checked live against `admin@equestria`
on 2026-08-13, and re-checked on 2026-08-19/21/22 where the revision blocks below say so;
where it proposes a mechanism that hasn't been verified against
the tool's actual behavior, it says so — don't treat those parts with the same
confidence as the rest of this plan set.

Depends on [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) (storage
tagging) and amends [20-low-power-tier.md](20-low-power-tier.md) (§1 Tier-1
namespace list, §4 placement model) — read this file *and* 20 together; 20 is
not being rewritten, this file records what changed and why.

## Revision, 2026-08-22 — Low Power runs on a schedule now, and it can shed both media workers

**Low Power stopped being a manual toggle.** Five PRs merged 2026-08-22:

| PR | What landed | Verified |
|---|---|---|
| [#1046](https://github.com/david-driscoll/home-operations/pull/1046) | `--default-downtime=Mon-Sun 02:00-09:00 ${TIMEZONE}` on py-kube-downscaler — **Tier 2 sheds nightly with no human in the loop.** `${TIMEZONE}` comes from the `TIMEZONE` key of the `shared-secrets` Secret, not hardcoded, so this window and #1047's Gatus windows cannot drift apart. `system-upgrade` added to `excludedNamespaces`: a shed must not stop tuppr mid-upgrade | live 2026-08-22 — `kube-system/kube-downscaler-py-kube-downscaler` carries the arg with `${TIMEZONE}` resolved to `America/New_York` |
| [#1047](https://github.com/david-driscoll/home-operations/pull/1047) | Gatus `maintenance-windows` (`start: "02:00"`, `duration: 7h`, `timezone: ${TIMEZONE}`) on the **26** `definition.yaml` files whose services actually shed — without it every shed service pages for seven hours a night. The `ApplicationDefinition` CRD had to regain the previously-pruned Gatus fields first, and the JSON schemas **plus a real type generator** (`schemas/`, `scripts/generate-types.ts`, `mise run codegen`) came into this repo from `stargate-command-cluster`; the generator had never existed here at all. Gatus fields synced to v5.36.0 | 26 files carry the block; `schemas/` and `scripts/generate-types.ts` present in-tree |
| [#1048](https://github.com/david-driscoll/home-operations/pull/1048) | Intel GPU plugin split per node class — `intel-gpu-plugin` on the control planes (`sharedDevNum: 2`, and the only release creating the fixed-name `NodeFeatureRule`) and `intel-gpu-plugin-workers` (`sharedDevNum: 3`, correcting the old and wrong `5`). Also right-sized the media apps: plex 6 CPU/4Gi/8Gi → 1 CPU/1Gi/4Gi with no CPU limit, jellyfin 4 CPU → 1 CPU and 8Gi → 4Gi, dispatcharr 1 CPU → 300m | live — both `GpuDevicePlugin` CRs exist with those ratios and disjoint device-id selectors (`46d4` = control planes, `46a6` = workers) |
| [#1051](https://github.com/david-driscoll/home-operations/pull/1051) | **Both** media workers become sheddable: control-plane tolerations plus a *soft* (weight 100) node affinity toward the worker iGPU on plex/jellyfin/dispatcharr; a second descheduler profile running `RemovePodsViolatingNodeAffinity` with `evictLocalStoragePods: true` and `nodeFit: true` for the 09:00 return trip; and the `longhorn-media` StorageClass. Design and runbook: [30](30-longhorn-media-tier.md) | live — `LowPowerReturnProfile` in the descheduler ConfigMap; `longhorn-media` created (`nodeSelector: critical` as shipped, superseded hours later by #1053) |
| [#1053](https://github.com/david-driscoll/home-operations/pull/1053) | A **new `low-power` node tag** on exactly the five nodes that stay powered through the window — `milky-way`/`othalla`/`pegasus` (now `["critical", "low-power"]`) plus `hard-hat` (immich's GPU) and `shining-armor` (backup volumes) — and `longhorn-media` repointed from `nodeSelector: critical` to `low-power`. `fluttershy` and `kerfuffle` are deliberately **not** tagged. Purely additive: every existing `bulk`/`critical` selector still matches what it did. Three `talconfig.yaml` anchor edits cover all five nodes, but the annotation is read only at Longhorn node **creation**, so the live retag came from patching the `nodes.longhorn.io` CRs | live — all seven node tag lists verified; `longhorn-media` reads `nodeSelector: low-power`, 3 replicas, `dataLocality: disabled` |

**Why the retag, in one line:** `critical` means "Tier-0/1 storage tier", so borrowing it both
diluted that meaning and piled all three media config volumes onto the same three control-plane
disks. And three replicas over **five** eligible nodes leaves **two spare**, so Longhorn can
rebuild if a node dies — the `critical`-only shape had no spare at all. Three replicas still
**structurally guarantee** one on a control plane: only two of the five tagged nodes are not
control planes, and `replica-soft-anti-affinity: false` allows at most one replica per node.

⚠️ **`low-power` is not `battery`.** In a real Battery event `hard-hat` does go down and a
replica there will fail. Expected — Battery is an emergency, not a nightly routine.

**What is NOT done, and it is the thing the node-shedding half depends on:**
[30](30-longhorn-media-tier.md)'s volume migration is **nearly finished**. Verified live
2026-08-22 18:21 UTC — `dispatcharr` **complete** (`n=3 sel=["low-power"]`, healthy, replicas
on all three control planes) and `plex` **complete** (`n=3 sel=["low-power"]`, healthy,
`milky-way`/`othalla`/`shining-armor`); `jellyfin` is mid-migration at `n=4`, `degraded`, still
holding replicas on both `fluttershy` and `kerfuffle`. Until `jellyfin` finishes, shutting a
media worker overnight leaves its config volume degraded every night — which fires
`LonghornVolumeStatusWarning` and stalls tuppr's drain gate, the exact failure 30 exists to
prevent. **So the workload half of Low Power is automated and the node half is not yet safe to
use.**

Also still manual, and easy to over-read as automated: **nothing powers a node off or wakes one
up on a schedule.** #1046 sheds workloads only.

## Revision, 2026-08-21 — Low Power has been run, in dry-run, for the first time

**No longer only a design proposal.** The Low Power mechanism was exercised against the live
cluster on 2026-08-21 with the controller still `--dry-run`: one 60 s scan under
`downscaler/force-downtime`, nothing moved, 40 workloads correctly named, and **two real defects
in the keep-list found that no amount of reading the manifests would have surfaced** (PR #1005).
See "Exercised 2026-08-21". Battery's half is further along still — [20](20-low-power-tier.md) §4
is applied, so the control planes are tainted and the Tier-0/1 tolerations are live.

**`--dry-run` is off as of 2026-08-21**, after a second scan showed all eleven keep-list entries
surviving and nothing moving cluster-wide. The mechanism is armed: annotating `equestria` and
`github-actions` with `downscaler/force-downtime` now genuinely sheds. ~~What is left before Low
Power is *rehearsable* rather than merely runnable: decide open item 1, measure the
Low-Power-specific capacity in open item 4, and settle which hosts are "power-hungry" in item 5.~~
**Of those three: item 5 is answered (below), item 1 is settled as "leave it unbuilt", and item 4
is the one that is genuinely still open.** And the toggle itself was superseded the next day by a
schedule — see the 2026-08-22 revision above.

### Revision, 2026-08-19 — two of the three unknowns are now known

What changed then is that the two things this file said had to be checked before anything was
buildable have been checked, both against source rather than documentation:

| Open item | Then | Now |
|---|---|---|
| py-kube-downscaler's live toggle | "the single biggest gap before Low Power is buildable" | **Answered** — namespace `downscaler/force-downtime`, per-workload `downscaler/exclude` wins, controller installs inert. See "Mechanism" |
| `replica-zone-soft-anti-affinity` | "used by inference … not verified against source" | **Verified live** — the setting exists, is `true` (soft) and applied. No node has a `zone`, so flipping it is currently a no-op |
| `longhorn-controlplane`'s premise | Tier-1 data is over-pinned to the control planes | **Did not hold.** PRs #963/#966 moved all seven Tier-1 volumes to `longhorn-critical` — three replicas on the trio each, `healthy`. The always-resident model works; see Open items item 1 |

One thing got *harder*, and it is not in the original design: **Flux's drift detection will
undo py-kube-downscaler.** 48 HelmReleases run `driftDetection: mode: enabled`. That is a
prerequisite, not a detail — "Mechanism" has the three ways out and a recommendation.

And one thing this file assumed but could not measure now exists: alpha-site's
`pecron-monitor` stack exports live battery telemetry, so "Pecron UPS reports mains lost" is
a real signal rather than a placeholder — Open items item 2.

## Why a third state

20's design is binary: normal operation, or S′ — control-planes-only, workers
fully off, a deliberate 3–4h+ posture on the Pecron battery. That leaves no
posture for "mains is fine but we want to trim load" — pre-emptive load
shedding, or a lower-power posture that doesn't require shutting every worker
down. Three states:

| State | Trigger | Workers | What runs |
|---|---|---|---|
| **Full** | default | all up | everything |
| **Low Power** | **nightly schedule, 02:00–09:00 `${TIMEZONE}`** (#1046, live 2026-08-22) — the manual `downscaler/force-downtime` namespace annotation still works on top for an ad-hoc window | **workload shed is automatic; node shutdown is not.** The intended set is both media workers (`fluttershy` + `kerfuffle`) — exactly the two nodes #1053 left **out** of the `low-power` Longhorn tag — once [30](30-longhorn-media-tier.md)'s migration lands. **Not usable yet: `jellyfin` is unmigrated** | Tier 0/1 + an explicit keep-list; everything else scaled to 0 by default |
| **Battery** | Pecron UPS reports mains lost — still a **human** decision, nothing acts on the signal | the three **bare-metal** workers cordoned + shut down. **`shining-armor` stays online** (David, 2026-08-22 — VM on `twilight-sparkle`, hosts the backup volumes) | Tier 0/1 only — this *is* 20's S′, amended below |

Full → Low Power → Battery is a strictly increasing amount of shed load; Battery
is not "Low Power taken further" mechanically (different node set, different
tooling) but it is a superset in effect — anything excluded in Low Power is
also excluded in Battery.

## Battery — amendments to 20's design

Two changes to [20-low-power-tier.md](20-low-power-tier.md), both decided
2026-08-13:

### 1. `observability` and `pulumi` move back to Tier 1

20 §1 drops both to Tier 2 deliberately, reasoning that alpha-site's external
Prometheus/Gatus covers observability during the window and that Pulumi simply
isn't runnable during an outage. Superseded: both stay up during Battery.

Live footprint, checked 2026-08-13 against `admin@equestria`:

| Namespace | Pods | Aggregate memory *requests* |
|---|---|---|
| `observability` | 34 | ≈ 6.3 GiB |
| `pulumi` | 7 | ≈ 1.1 GiB |

That's on top of 20 §3's ≈21.5 GiB / 44.55 GiB headroom estimate (itself
unverified since 2026-07-31 — 20 §8 item 6 already flags re-measuring it). Call
it **≈7.4 GiB additional**, which the stated headroom still absorbs, but this
needs a fresh live measurement before Battery mode is rehearsed, not an
assumption stacked on an assumption. **Open item, carried into 20 §8's list.**

Two things this doesn't resolve, flagged rather than answered here:

- `observability`'s Prometheus/Loki/Alloy stack has real Longhorn-backed
  storage — which StorageClass those PVCs sit on decides whether they need
  `longhorn-critical`/`longhorn-controlplane` treatment (see below) or are fine
  degrading during the window. Not audited yet.
- The `pulumi` operator staying up doesn't mean a `pulumi up` can *usefully*
  run during Battery — its state backend is Postgres DIY on **celestia**
  (D2), a separate Docker host, whose own power posture during a mains outage
  is unspecified. Keeping the in-cluster operator alive is necessary but not
  sufficient for Pulumi to actually work mid-outage; that's a celestia-side
  question, out of scope here.

### 2. Tier-1 *application* placement: float + relocate, not always-resident

20 §4 pins every Tier 0/1 workload to the control planes permanently, in Full
operation too — the stated goal was "entering low-power must involve zero
rescheduling." Superseded for **application** workloads (Home Assistant,
mosquitto, matter, technitium — anything with real state and a real Longhorn
volume, as opposed to Tier-0 cluster-platform DaemonSets, which are unaffected
by this and keep the toleration-only treatment 20 §4 already gives them):

- **In Full and Low Power**, these run on workers, same as any other app —
  the control planes stay lean.
- **On Battery entry**, they reschedule onto a control plane.
- **On Battery exit**, they reschedule back onto a worker **30 minutes after**
  mains is confirmed restored (not immediately) — a debounce against a
  flickering mains signal causing a reschedule storm.

This trades 20's "zero rescheduling, permanent CP cost" for "CPs stay boring
and cheap most of the time, at the cost of a real reschedule + brief
disruption at both ends of every Battery event." That's a real trade, not a
strict improvement over 20's original design — worth restating since 20 chose
the other side of it deliberately.

**Storage: the new `longhorn-controlplane` class.** `longhorn-critical` (12,
Step 2) doesn't fit this — it's 3 replicas confined entirely to the 3
control-plane-tagged nodes, which is right for a workload that should *never*
touch a worker, wrong for one that lives on a worker by default. What fits is
Longhorn's **zone anti-affinity**, not its tag-based `nodeSelector`:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn-controlplane
reclaimPolicy: Delete
provisioner: driver.longhorn.io
parameters:
  numberOfReplicas: "2"
  dataLocality: best-effort
  staleReplicaTimeout: "30"
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

This class carries **no `nodeSelector`** — zone spread is a Longhorn *node*
setting, not a StorageClass parameter. It requires labeling nodes with a zone
(Longhorn reads `node.longhorn.io/zone` off `nodes.longhorn.io`, distinct from
both the `critical`/`bulk` tags 12 introduces and from Kubernetes'
`topology.kubernetes.io/zone`):

```bash
kubectl -n longhorn-system patch nodes.longhorn.io hard-hat fluttershy kerfuffle \
  --type merge -p '{"spec":{"zone":"critical"}}'
kubectl -n longhorn-system patch nodes.longhorn.io shining-armor \
  --type merge -p '{"spec":{"zone":"bulk"}}'
```

then the Longhorn setting `replica-zone-soft-anti-affinity: false` (hard —
**verified live 2026-08-19**: the setting exists on this cluster at
`longhorn-manager` v1.12.1 with `value: true`, `applied: true`, so today it is
*soft*. Flipping it to `false` is estate-wide, not per-class — it changes
scheduling for every zoned volume. It is a no-op until nodes actually carry a
`zone`, all of which are `<none>` today, which makes it cheap to land first and
risky to land last) forces `numberOfReplicas: "2"` across
exactly two zones onto exactly one replica each — one on whichever CP the
scheduler picks, one on whichever worker it picks. That's "one on
`shining-armor`, one on a future `milky-way`," generalized to whichever nodes
Longhorn/Kubernetes actually place the pod and its replicas on, not a specific
node pin.

**What this does not yet answer:** the actual pod-relocation trigger. 20's
taint+required-affinity mechanism makes placement *permanent and automatic* —
there's no "move now" step because the pod was never anywhere else. Float +
relocate needs something to *act* on Battery entry/exit: either (a) a manual
runbook step (`kubectl patch` the pod's node affinity, or delete the pod and
let it reschedule under a toleration/affinity pair that only exists during the
window), or (b) a small controller that watches the power-state signal (below)
and drives it. Given 20's existing runbook is already imperative
(`kubectl cordon`, `talosctl shutdown`, one command at a time — not
GitOps'd), (a) is the more consistent choice and the one this piece
recommends, but it's not designed in detail here — that's the next piece of
work once the questions above are settled.

## Low Power — new tier

### Keep-list (stays up, everything else defaults to scaled-to-0)

Mapped to what actually exists in the cluster, live 2026-08-19. This matters because the
keep-list and the shed-list **share the `equestria` namespace** — 47 workloads, of which
eleven are keep — so the mechanism below cannot be namespace-granular alone.

| Keep-list entry | Lives as | Namespace |
|---|---|---|
| Plex | `Deployment/plex` | `equestria` |
| Jellyfin | `Deployment/jellyfin` | `equestria` |
| Immich | `Deployment/immich` | `equestria` |
| FreshRSS | `Deployment/freshrss` | `equestria` |
| Dynacat | `Deployment/dynacat` + `Deployment/dynacat-equestria-glance` | `equestria` |
| n8n | `Deployment/n8n` | `equestria` |
| obsidian-sync | `Deployment/obsidian-sync` | `equestria` |
| pulsarr | `Deployment/pulsarr` | `equestria` |
| dispatcharr | `Deployment/dispatcharr` | `equestria` |
| xcproxy | `Deployment/xcproxy` | `equestria` |
| namespace `coder` | whole namespace | `coder` |
| ~~namespace `github-actions`~~ | **removed from the keep-list 2026-08-21** — David: CI is safe to scale down and can wait out a window. It is a **shed** namespace; Low Power entry annotates it alongside `equestria` | `github-actions` |
| watch-state | **not deployed** — no matching workload live | — |
| strmgen | **not deployed** — no matching workload live | — |

**Three keep-list entries now *move* during a window rather than merely staying up — new
2026-08-22.** `plex`, `jellyfin` and `dispatcharr` are the reason both media workers can be shed
at all: [#1051](https://github.com/david-driscoll/home-operations/pull/1051) gave them
control-plane tolerations plus a *soft* iGPU affinity so they relocate onto the trio for the
duration and are descheduled home at 09:00, and
[#1048](https://github.com/david-driscoll/home-operations/pull/1048) gave the control planes GPU
slots (`sharedDevNum: 2`) to land on. "Stays up" is therefore doing more work for these three
than for the other eight — and it is **gated on [30](30-longhorn-media-tier.md)'s volume
migration finishing**, which it has not: `dispatcharr` and `plex` are migrated, `jellyfin` is
not. See "Node shutdown" below.

`watch-state` and `strmgen` are named in the original keep-list but have no workload in the
cluster today. **Re-confirmed live 2026-08-21** — no Deployment, StatefulSet or CronJob under
either name, and no near-miss (`watchstate` searched too). They are gone, not hiding. The list
should not carry entries that cannot be annotated; treat the keep-list as **eleven entries**,
not thirteen. Open item 6 closed.

**~~`dynacat` cannot be annotated from this repo.~~ It can, and now is — corrected 2026-08-21.**
The claim rested on `kubernetes/apps/equestria/home/dynacat/ks.yaml` having `path: ./dashboard`
"against a different source". It is not a different source: `dashboard/` is **tracked in
home-operations** (`git ls-files dashboard/` returns `dashboard/helmrelease.yaml`), and its
`sourceRef` is the same `GitRepository/flux-system` every other app uses. The path simply points
at a top-level directory rather than one under `kubernetes/apps/`.

So the annotation goes in Git like every other keep-list app. Both controllers in
`dashboard/helmrelease.yaml` — `dynacat` and `equestria-glance` — now carry
`downscaler/exclude: "true"` (PR #1005), verified with `helm template` against app-template
5.1.0. **No keep-list entry is held by a live `kubectl annotate`**, and the "placement that
exists only in cluster state" this plan set warns about does not occur here.

This mattered: the 2026-08-21 dry-run below shed **both** dynacat Deployments.

Plus, implicitly, everything already in Tier 0 (cluster platform — Cilium, CoreDNS, Longhorn,
Flux, etc.) and Tier 1 per 20/above — Low Power sheds Tier 2 load, it isn't a *harder*
posture than normal for cluster platform services.

### Mechanism: py-kube-downscaler — verified against source, 2026-08-19

This is new tooling: `grep -ri downscaler` across home-operations still returns **zero**
hits. The project is [`caas-team/py-kube-downscaler`](https://github.com/caas-team/py-kube-downscaler)
(the earlier draft of this file named `caas-team/kube-downscaler`, which is the older
lineage); the chart is `oci://ghcr.io/caas-team/charts/py-kube-downscaler`.

**The open item this file called "the single biggest gap before Low Power is buildable" is
closed.** Everything below was read out of `kube_downscaler/scaler.py` at `main`, not
inferred from the README, because the polarity question is exactly the kind the README
answers ambiguously.

**Default polarity — both halves are what this design wants, and they are different halves.**

- *Scope* is opt-out: every workload is in scope unless excluded. `--exclude-namespaces`
  defaults to `kube-system` and nothing else.
- *Action* is inert: `--default-uptime` defaults to `always` and `--default-downtime` to
  `never`, so a freshly installed downscaler **scales nothing**, ever, until something tells
  it to.

That combination is precisely the requirement — a new app in `equestria` is shed by default
in Low Power without anyone remembering to opt it in, and installing the controller changes
nothing until the toggle is thrown. The failure this design existed to avoid ("new app
silently keeps running and consumes power") does not occur; the safe failure ("new app
silently doesn't survive Low Power") is the default.

**The live toggle is a namespace annotation.** `downscaler/force-downtime` is read from the
**Namespace object only** — there is no workload-level equivalent
(`FORCE_DOWNTIME_ANNOTATION`, `scaler.py:41`, consumed at `:1466`). So:

```bash
# enter Low Power
for ns in equestria github-actions; do
  kubectl annotate namespace "$ns" downscaler/force-downtime=true --overwrite
done
# leave Low Power
for ns in equestria github-actions; do
  kubectl annotate namespace "$ns" downscaler/force-downtime=false --overwrite
done
```

`github-actions` joined the shed list on 2026-08-21 (David: CI is safe to scale down). **Shedding
it is partial, and worth knowing before relying on it** — a dry-run scan named exactly two
workloads, `gha-arc-controller` and `onepassword-syndicates`. The four `AutoscalingRunnerSet` CRs
are untouched: `actions.github.com` is not a kind py-kube-downscaler handles
(`--include-resources` is deployments, statefulsets, cronjobs, scaledobjects), and the ARC
listener runs as a bare Pod owned by an `AutoscalingListener` CR rather than a Deployment.

So stopping the controller means **no new runners are created**, but `littles-tech-runners` and
`littles-tech-release-runners` both carry `minRunners: 1` and any in-flight `EphemeralRunner` pods
run to completion. If a window needs the runners genuinely gone rather than merely not
replenished, that needs `minRunners: 0` on those two sets — a separate change, and a decision
about whether CI should be able to start at all mid-window.

No Git commit, no Flux reconcile cycle, one command per shed namespace. The original replica
count is stored on each workload as `downscaler/original-replicas`
(`ORIGINAL_REPLICAS_ANNOTATION`, `scaler.py:39`) and restored on the way back up, so exit
does not depend on Git either.

**Per-workload exclusion beats the namespace toggle — this is the load-bearing detail.**
Because keep and shed share `equestria`, the whole design rests on
`downscaler/exclude: "true"` on a Deployment surviving `downscaler/force-downtime: "true"` on
its Namespace. It does, and the reason is worth writing down exactly, because the obvious
reading of the code says otherwise:

```python
# scaler.py:97
def define_scope(exclude, original_replicas, upscale_target_only):
    if upscale_target_only:
        exclude_condition = exclude
    else:
        exclude_condition = exclude and not original_replicas
    return exclude_condition
```

`exclude` is set by `ignore_resource()` (`:459`), which returns `True` for any
`downscaler/exclude` value other than `"false"`. For a keep-list workload that has never been
scaled down, `original_replicas` is `None`, so `exclude_condition` is `True` and
`autoscale_resource()` short-circuits — *"was excluded"* — before the `forced_downtime`
branch is ever reached. The later `elif forced_downtime and not (exclude and
original_replicas)` line is **not** the protection; it handles the opposite case (a workload
already scaled down and *then* excluded, which gets forced back up). Reading only that line
suggests namespace force-downtime wins, and it does not.

Concretely:

- Deploy py-kube-downscaler cluster-wide in its own namespace (`power-management`), with
  **no** default uptime/downtime schedule, and `--exclude-namespaces` covering the Tier-0 and
  Tier-1 namespaces as belt-and-braces: `kube-system`, `longhorn-system`, `cert-manager`,
  `nfs-system`, `flux-system`, `cloudnative-pg`, `volsync-system`, `openebs-system`,
  `network`, `stargate-command`, `tailscale-system`, `observability`, `pulumi`,
  `power-management`. Belt-and-braces because those namespaces are never annotated with
  `force-downtime` anyway — but the annotation is one `kubectl` typo away from being applied
  to the wrong namespace, and this makes that typo inert.
- Annotate the eleven keep-list workloads with `downscaler/exclude: "true"` **in Git**, in
  their HelmReleases — so surviving Low Power is a property of the app's manifest, which is
  the whole point of the inverted default.
- Run it with `--dry-run` first and read the log before it is ever allowed to act.

**The conflict this design has to resolve: Flux drift detection will fight it.** 48
HelmReleases in this repo carry `driftDetection: mode: enabled` — including `n8n`, `immich`,
`freshrss`, `obsidian-sync`, `tandoor`, `searxng`, `karakeep`, `super-productivity` and the
`neo4j` cluster. Flux will see `replicas: 0` as drift and correct it, so a downscaled
workload comes *back* mid-window, which is precisely the load the mode exists to shed.

Three ways out, and the choice should be deliberate:

1. **`driftDetection.ignore` on `/spec/replicas`** for the shed-list HelmReleases. This is
   the GitOps-correct answer — it says "an external controller owns this field," which is
   true — and it is the only one that leaves Low Power as a *single*-mechanism posture:

   ```yaml
   driftDetection:
     mode: enabled
     ignore:
       - paths: ["/spec/replicas"]
         target:
           kind: Deployment
   ```

2. **`flux suspend` the shed namespaces on entry**, exactly as [20](20-low-power-tier.md) §6.1
   Path B already does. Works today with no manifest changes, but makes Low Power a
   two-mechanism posture (suspend *and* downscale) with two things to get wrong on exit.
3. **Do nothing and accept the fight.** Not viable — the reconcile interval is 15 m, so the
   shed would partially undo itself several times an hour.

**Recommendation: (1), and treat it as a prerequisite rather than a refinement.** Without it
py-kube-downscaler is not the mechanism for this cluster, it is a second opinion Flux
overrules.

**Built 2026-08-19.** Option (1), applied **namespace-wide** rather than per-HelmRelease, in
`kubernetes/apps/equestria/kustomization.yaml`:

```yaml
patches:
  - target:
      group: kustomize.toolkit.fluxcd.io
      kind: Kustomization
    patch: |-
      # …injects spec.patches into every equestria child Kustomization, which then
      # patches the HelmRelease it builds:
      spec:
        driftDetection:
          ignore:
            - paths: ["/spec/replicas"]
            - paths: ["/spec/suspend"]
              target:
                kind: CronJob
```

Three things about that shape are deliberate:

- **Two rules, not one.** The downscaler scales Deployments and StatefulSets but *suspends*
  CronJobs, so `/spec/suspend` needs ignoring too or every suspended CronJob un-suspends on
  the next reconcile. `/spec/replicas` is left untargeted (it only exists on workload kinds
  in a rendered app chart); `/spec/suspend` is targeted at `CronJob` specifically, because
  the same path exists on Flux's own `Kustomization` and `HelmRelease` kinds and must not be
  ignored there.
- **Namespace-wide, not per-app.** The design's premise is that a *new* app in `equestria`
  sheds correctly without anyone opting it in. A per-HelmRelease ignore would have to be
  remembered 60+ times, and forgetting it fails silently and only during a window — the same
  inverted-default failure this mechanism exists to avoid.
- **It reaches HelmReleases in two hops**, because `equestria/kustomization.yaml` renders
  `ks.yaml` files (Flux `Kustomization` CRs), not HelmReleases. The patch injects
  `spec.patches` into each child, and each child patches the HelmRelease it builds. Verified
  with `kustomize build` at both hops: 47 of 47 equestria Kustomizations carry the injected
  patch, and a rendered `plex` HelmRelease comes out with `mode: enabled` intact plus the two
  ignore rules.

**The cost, stated plainly:** replica drift is no longer corrected for the keep-list apps
either, since they live in the same namespace and are never downscaled. Nothing but the
downscaler writes replicas on these workloads, so this is accepted rather than solved. **No
equestria child sets `spec.patches` of its own today** — if one ever needs to, this patch
stops being additive and has to move to the app level.

**Untested here:** whether `downscaler/exclude` on a workload also survives a `helm upgrade`
that re-renders `spec.replicas` — drift detection and chart upgrade are different paths.
A chart upgrade during a window is unlikely but not impossible (Renovate merges land
continuously), and the honest answer is that this needs a dry-run check rather than a
confident claim.

### Exercised 2026-08-21 — the first time the mechanism actually ran

Everything above this point was derived from `scaler.py`. This is what happened when it was
run. Method: `kubectl annotate namespace equestria downscaler/force-downtime=true --overwrite`
with the controller still `--dry-run`, one 60 s interval, then
`kubectl annotate namespace equestria downscaler/force-downtime-`. Replica counts and CronJob
suspend flags were snapshotted before and after.

**Nothing moved.** Both snapshots were byte-identical — 45 equestria Deployments and every
CronJob in the cluster. `--dry-run` holds exactly as documented; the log line is
`**DRY-RUN**: would update <kind> <ns>/<name>` paired with a `Scaling down …` or `Suspending …`
line carrying the reason `(uptime: ignored, downtime: forced)`.

**Scope was correct.** 40 distinct workloads named, **all of them in `equestria`** — 36
Deployments, the `meilisearch` and `rustdesk` StatefulSets, and the `kometa` /
`kometa-imagemaid` CronJobs. No Tier-0/Tier-1 namespace was touched, which is what
`excludedNamespaces` is there to guarantee.

**The precedence claim is confirmed, not merely argued.** Nine of the eleven keep-list entries
survived the namespace `force-downtime` because they carry `downscaler/exclude: "true"` — the
`define_scope` short-circuit above, observed rather than read.

**Two found the hard way, both now fixed in PR #1005:**

- `dynacat` and `dynacat-equestria-glance` were **shed**. Keep-list, unannotated — see the
  keep-list section for why the "cannot be annotated from this repo" premise was wrong.
- `coder` and `database` were **not** in `excludedNamespaces`. `coder` is a keep-list namespace;
  `database` is not on the written keep-list but every keep-list app depends on it — CNPG's
  Postgres is operator-managed and invisible to the downscaler, but `valkey` is a plain Deployment
  and `postgres-backup` a CronJob, so shedding `database` would pull the cache and the nightly
  backup out from under Plex/Immich/n8n/FreshRSS while those keep running.

  `github-actions` was in the same first cut of that fix and was **taken back out** the same day:
  David confirmed CI is safe to scale down, so it is a shed namespace rather than a keep-list one.
  A second dry-run scan against it named exactly `gha-arc-controller` and `onepassword-syndicates`
  — see "Mechanism" for why that is a partial shed.

Neither would have been caught by reading the manifests, and neither is visible until the toggle
is thrown. **That is the argument for running the dry-run as its own step rather than as the
first minute of a real window.**

**Scan 2, after #1005 reconciled — the gate for arming it.** Same method, both shed namespaces
annotated at once:

- **40 workloads: 38 `equestria` + 2 `github-actions`.**
- **All eleven keep-list entries survived**, `dynacat` and `dynacat-equestria-glance` included.
- `coder` and `database` appeared nowhere.
- Replica counts and CronJob suspend flags byte-identical before and after, **cluster-wide** this
  time rather than just `equestria`.

**`--dry-run` removed 2026-08-21** on the strength of that. Note what this does and does not do:
it does **not** make the controller start acting, because action is still inert
(`--default-uptime=always` / `--default-downtime=never`, no schedule set). What changes is that
the toggle now works. The corollary is that a mistyped `kubectl annotate` is no longer harmless,
which is exactly what `excludedNamespaces` is for.

### Scheduled 2026-08-22 — the toggle became a nightly window

**[#1046](https://github.com/david-driscoll/home-operations/pull/1046).** David: *"enter a lower
power state at night, starting around 2am, and restore normal operation at 9am."* Delivered as a
default downtime rather than a cron or an operator:

```yaml
- --default-downtime=Mon-Sun 02:00-09:00 ${TIMEZONE}
```

Five things about that line are load-bearing, all of them verified rather than assumed:

- **It changes *when*, not *what*.** The shed-list is the same 40 workloads the two dry-run scans
  named, so it needed no fresh dry-run. Only three namespaces are in scope at all — everything
  else is already in `excludedNamespaces`.
- **The keep-list still wins.** `define_scope` short-circuits on `downscaler/exclude` *before* any
  uptime/downtime is evaluated (`scaler.py:97`), which is the same precedence that makes the
  manual toggle safe. Plex, Jellyfin, Immich, n8n and the rest stay up overnight.
- **A window cannot cross midnight.** The downscaler only interprets a range within a single day
  and requires end later than start, so `22:00-06:00` would be *silently* wrong. 02:00–09:00 is
  same-day. Worth knowing before anyone widens it backwards into the evening.
- **`${TIMEZONE}` is substituted, not hardcoded** — it comes from the `TIMEZONE` key of the
  `shared-secrets` Secret (`components/common` patches child Kustomizations to add it to
  `substituteFrom`), so this window and the Gatus maintenance windows below cannot drift apart.
  A postBuild variable that fails to resolve makes the Kustomization fail rather than render
  empty, so a regression here is loud. Live 2026-08-22 it resolves to `America/New_York`.
- **`system-upgrade` was added to `excludedNamespaces`.** That namespace holds tuppr, which drives
  Talos and Kubernetes node upgrades — and tuppr does not self-clear a `Failed` TalosUpgrade, it
  needs a generation bump. "CI can wait out a window" does not extend to "the thing rebooting
  nodes can be stopped halfway."

The manual `downscaler/force-downtime` toggle above still works on top of this, for an ad-hoc
window outside the nightly one.

**Companion: Gatus maintenance windows ([#1047](https://github.com/david-driscoll/home-operations/pull/1047)).**
Without them every shed service pages for seven hours a night. **26** `definition.yaml` files
gained:

```yaml
maintenance-windows:
  - start: "02:00"
    duration: 7h
    timezone: ${TIMEZONE}
```

Which 26 was derived from *what actually sheds* — every Deployment/StatefulSet/CronJob in
`equestria` and `github-actions` **without** `downscaler/exclude`, intersected with the set that
has a Gatus endpoint. Listing `definition.yaml` files by name would have given 44 and been wrong
twice over: it would have included apps with a definition but no live workload, and it would have
included `equestria/dns/technitium`, which is Tier 1 and must never get a maintenance window —
during a window it is exactly the thing that still has to answer.

Two pieces of estate plumbing had to be fixed to make that field exist at all, and they outlast
this change:

- **The CRD was the real gate.** `ApplicationDefinition` carries no
  `x-kubernetes-preserve-unknown-fields`, so an unrecognised key is pruned by the API server
  before Pulumi ever sees it — the Pulumi path round-trips YAML with a cast and would have
  happily passed it through. The Gatus fields were added back to the CRD with their own
  validation, and synced to Gatus v5.36.0.
- **The type generator did not exist in this repo.** `types/application-definition.d.ts` carried
  the "generated by json-schema-to-typescript, modify the source JSONSchema" banner while neither
  the schemas nor the generator lived here — both were in `stargate-command-cluster`, so the
  types could only be edited by hand, which the banner forbids, and they had drifted from both
  the schemas and the CRD. #1047 brought `schemas/` and `scripts/generate-types.ts` in and wired
  them to `mise run codegen` (which `mise run update` depends on).

### Node shutdown

Low Power additionally powers off specific power-hungry hosts — ~~`fluttershy`
named explicitly as the first case, more may follow as nodes join.~~ This reuses
20 §6's "cordon, don't drain, then power off" pattern and its "one at a time,
verify between each" rule — no new mechanism needed there, just a smaller,
selectable node set than Battery's "every worker."

**The node set is settled as of 2026-08-22, and it is both media workers, not one.**
[#1051](https://github.com/david-driscoll/home-operations/pull/1051) exists precisely to make
`kerfuffle` sheddable alongside `fluttershy`, by making the three media pods (plex, jellyfin,
dispatcharr) relocatable onto the control planes for the duration:

- **Outbound needs no help.** Shutting a node down evicts its pods; the control-plane toleration
  plus the *soft* (weight 100) iGPU affinity means they land on a control plane rather than going
  `Pending`. The soft half has to stay soft — with both workers gone a required term would leave
  them `Pending` until 09:00.
- **The 09:00 return trip does need help**, and it is the part that would have failed silently.
  A second descheduler profile (`LowPowerReturnProfile`) runs `RemovePodsViolatingNodeAffinity`
  against that same preference. It needs its **own** `DefaultEvictor` with
  `evictLocalStoragePods: true`, because all three apps use `emptyDir` and the default profile's
  `false` would have blocked every eviction — and flipping it on the *default* profile would have
  handed `RemoveDuplicates`/`LowNodeUtilization` the right to evict every `emptyDir` pod in the
  estate. `nodeFit: true` is set on both profiles, which also fixes churn flagged in
  [29](29-taint-readiness-audit.md): tainted control planes read as permanently under-utilised.
- **Storage is the blocker.** The three config volumes must hold their replicas only on
  `low-power`-tagged nodes, or they sit degraded all night — see the `longhorn-media` row below
  and [30](30-longhorn-media-tier.md). `dispatcharr` and `plex` are done; **`jellyfin` is
  not**, so **do not shed a media worker yet.**

**Capacity for the shed node-set is still the open question** (open item 4): the keep-up service
list has to be schedulable on whatever remains once both media workers are dark. #1048 helps
directly rather than incidentally — plex went from 6 CPU to 1 with no CPU limit, jellyfin from 4
to 1, dispatcharr from 1 CPU to 300m, and the control planes gained two shared GPU slots each —
but that is a right-sizing, not a measurement of the resulting node-set.

## Storage class summary (post-12, post-24)

| Class | Replicas | Placement | Use |
|---|---|---|---|
| `longhorn` (default) | 3 | `bulk`-tagged nodes only (12 Step 3) | ordinary Tier-2 app storage |
| `longhorn-critical` | 3 | `critical`-tagged nodes only, one per CP (12 Step 2) | data that must *never* leave a control plane — cluster-platform-adjacent state, not app data that floats |
| `longhorn-controlplane` *(new, this piece)* | 2 | zone-split: one replica in `critical` zone, one in `bulk` zone | Tier-1 **application** state that normally lives on a worker and relocates to a CP only during Battery (Home Assistant, etc.). **Recommended left unbuilt** — open item 1 |
| `longhorn-media` *(new 2026-08-22, [#1051](https://github.com/david-driscoll/home-operations/pull/1051) + [#1053](https://github.com/david-driscoll/home-operations/pull/1053); owned by [30](30-longhorn-media-tier.md))* | 3 | `nodeSelector: low-power` — the **five** nodes that stay powered overnight (3 CPs + `hard-hat` + `shining-armor`), `dataLocality: disabled`. Two spare eligible nodes, so a single node failure can rebuild; at least one replica is always on a CP | The `plex`/`jellyfin`/`dispatcharr` config volumes, so shedding **both** media workers during a Low Power window leaves nothing degraded. Class is live; `dispatcharr` and `plex` migrated, **`jellyfin` still in progress** |
| `longhorn-cache` / `longhorn-snapshot` / `longhorn-local` | unchanged | unchanged | unchanged, out of scope here (see 12's "out of scope") |

## Open items

Closed since this file was written:

- ~~**py-kube-downscaler's exact live-toggle mechanism** — the single biggest gap before Low
  Power is buildable.~~ **Answered 2026-08-19** against `scaler.py` at `main`, not the README:
  the toggle is `downscaler/force-downtime` on the **Namespace**, per-workload
  `downscaler/exclude: "true"` beats it, and the controller installs inert
  (`--default-uptime=always` / `--default-downtime=never`) while still being opt-*out* in
  scope. See "Mechanism" above — including the Flux `driftDetection` conflict, which is a
  new prerequisite the original design did not anticipate.
- ~~**`replica-zone-soft-anti-affinity` setting name/semantics** — used by inference, not
  verified.~~ **Verified live 2026-08-19**: the setting exists on this cluster
  (`longhorn-manager` v1.12.1), currently `value: true`, `applied: true` — i.e. zone
  anti-affinity is **soft** today. §2's `longhorn-controlplane` design needs it flipped to
  `false` to be a hard split, and that flip is estate-wide, not per-class: it changes replica
  scheduling for **every** volume that has a zone, not just the new class. Since no node
  carries a `zone` today (all `<none>`, verified), the flip is currently a no-op — which
  makes it cheap to land ahead of the zones, and dangerous to land after them without
  thinking about the other classes.
- ~~**Which specific apps get `longhorn-controlplane`.**~~ Answered in
  [12](12-longhorn-critical-tier.md#which-volumes-get-longhorn-critical): `technitium`,
  `tsidp` and `tsiam` are `longhorn-critical` unconditionally;
  `home-assistant`/`mosquitto`/`matter` are recommended `longhorn-critical` until this file's
  float model is actually built. The same audit closed §1's observability-storage question:
  ≈178 GiB of high-write data, so it stays on the default class.

Still open, in priority order:

1. **`longhorn-controlplane` is now a solution to a problem that was solved another way.**
   This file specced it before [12](12-longhorn-critical-tier.md) landed, on the premise
   that Tier-1 data would end up over-pinned to the control planes — which is what a
   2-replica zone-split class relieves. That premise did not hold. PRs #963 and #966 moved
   all seven Tier-1 volumes onto **`longhorn-critical`** on 2026-08-19, and the live result
   ([20](20-low-power-tier.md) §5) is three replicas on the trio each, all `healthy` — the
   always-resident model this file's §2 proposed replacing, now built and working.

   **Recommendation: leave `longhorn-controlplane` unbuilt and revisit it only if the
   control planes turn out to be a real capacity or wear problem** — which the piece-12
   measurements (≈68 GB of low-IOPS Tier-1 data) suggest they will not. Note this also
   retires item 2 below: the always-resident model needs no relocation trigger, which this
   file originally counted as a cost of the alternative rather than a benefit of the
   default.
2. **Battery pod-relocation trigger** — the imperative step (or small controller) that
   actually moves float+relocate workloads on entry/exit. Still not designed, and per item 1
   **probably never needs to be**: the always-resident `longhorn-critical` path that actually
   landed needs no trigger at all. Keep this open only as long as item 1 is.

   Separately, the *power-state* signal this file's Battery trigger always assumed —
   "Pecron UPS reports mains lost" — now exists and did not when this was written.
   alpha-site's `pecron-monitor` stack (PRs #962/#964/#967/#968) exports
   `pecron_ac_input_power_watts`, `pecron_runtime_remaining_seconds`,
   `pecron_battery_percent` and `pecron_device_status` per unit, with alert rules evaluated
   on alpha-site's own Prometheus rather than in-cluster — deliberately, so a mains-loss
   alert does not depend on the cluster it is warning about. #967 removed the one rule that
   *acted* on it (an upstream example that cut AC below 10 %), so this is telemetry and
   alerting, not automation. That is the right split for a runbook-driven posture: the
   signal is now measurable, and entering remains a human decision.
3. ~~**`observability`'s control-plane pods carry no control-plane toleration.**~~ **CLOSED
   2026-08-21.** [20](20-low-power-tier.md) §4 landed: PR #1001 gave the toleration to all six
   affected workloads — including `unpoller`, which this file's §1 amendment is what put on the
   list, and `kube-downscaler`, which is the new entry raised at the end of this item. PR #1002
   then applied the taint, and the post-flip verification was clean. The original text is kept
   below because the reasoning is still the reasoning.

   §1 of this file is what created the problem: keeping `observability` up during Battery means
   its workloads must survive on a tainted control plane, and at the time they would not be
   rescheduled there.

   **Re-audited live 2026-08-20**, and the finding is narrower but not smaller than it was.
   Filtering correctly for a blanket `operator: Exists` — which is what makes the whole
   DaemonSet fleet (`node-exporter`, `smartctl-exporter`, `cilium`, `spegel`, `csi-nfs-node`)
   a non-issue — `observability` is down to **one** genuinely untolerated control-plane pod,
   `unpoller`. `kube-state-metrics` and `prometheus-operator` no longer run on the trio.

   But the same audit found the problem is **not** confined to `observability`, which is how
   this item was framed: `kube-system/metrics-server` (Tier 0), `stargate-command/chrony-0`,
   `stargate-command/mosquitto-1` and `tailscale-system/equestria-kubeproxy-1` (all Tier 1)
   are in exactly the same position. The full table now lives in
   [20](20-low-power-tier.md) §9 item 2, which owns the toleration work; this item is
   folded into it and kept here only because 24 §1's amendment is what puts `unpoller` on
   the list at all.

   One new entry that belongs to *this* file rather than 20: **`kube-downscaler` itself has
   no control-plane toleration.** It is the Low Power shed mechanism, so it must run in Low
   Power — but it is useless in Battery, where everything it would shed is already gone.
   That is a deliberate call this file has not made: give it the toleration and let it ride
   through both states, or accept that it stops at Battery entry. Recommend the toleration,
   on the grounds that Battery is entered *from* Low Power and a controller that dies on the
   transition cannot restore replica counts on the way back out.

   **Decided as recommended, 2026-08-21** — `kube-downscaler` has the toleration (PR #1001).
   The deciding argument is the one above: Battery is entered *from* Low Power, and a controller
   that dies on the transition cannot restore replica counts on the way back out.

   **`kube-state-metrics` and `prometheus-operator` are the one loose end.** Both run on workers
   today, so the taint does not strand them — it only stops them *returning* to the trio, which
   matters at Battery entry rather than now. `kubernetes/apps/observability/prometheus/values.yaml`
   carries an explicit written decision to leave them untolerated, so reversing it means a
   kube-prometheus-stack upgrade and its own change. Tracked as [20](20-low-power-tier.md) §9
   item 6.

4. **Fresh capacity measurement** including `observability` + `pulumi` staying up in Battery.
   [20](20-low-power-tier.md) §3 costed the amendment at **+1.23 cores / +5.49 GiB**, taking
   the trio to ~71 % of allocatable CPU in requests alone — confirming this file's "≈7.4 GiB"
   estimate on memory while identifying **CPU** as the tight axis instead. What remains
   unmeasured is Low Power specifically: §3 models Full and Battery, not the middle state.

   **Sharper as of 2026-08-22, and still open.** The middle state now has a concrete node set
   (both media workers dark) and a concrete extra tenant on the trio (plex + jellyfin +
   dispatcharr relocating there for seven hours a night). #1048's right-sizing pulls hard in the
   helpful direction — plex 6 CPU → 1 with no CPU limit, jellyfin 4 → 1 and 8Gi → 4Gi,
   dispatcharr 1 CPU → 300m, and two shared GPU slots per control plane — but nobody has
   measured the trio's requests *with those three resident*, which is what this item asks for.
   Measure it during a real 02:00 window rather than on paper; the window now happens on its own.
5. ~~**PoE/host-shutdown ordering for Low Power's node list** — beyond `fluttershy`, which
   other hosts qualify as "power-hungry," and what is the capacity floor once they are down.~~
   **ANSWERED by David, 2026-08-22.** During a **true outage** `fluttershy`, `hard-hat` and
   `kerfuffle` can be shut down. **`shining-armor` stays online** — it is a VM on
   `twilight-sparkle` and it hosts the backup volumes.

   Three consequences:

   - **Battery is not "all four workers off."** [20](20-low-power-tier.md) §6.1 said so and has
     been corrected; the end state is 3 control planes **+ `shining-armor`**, which makes 20 §3's
     capacity model conservative rather than wrong.
   - **The sheddable set is exactly the WoL set.** All three bare-metal workers can be woken by
     WoL (David, 2026-08-20; [20](20-low-power-tier.md) §6.2), so every node the design turns off
     has a remote path back. `shining-armor`'s `qm start` is now a convenience for a node that is
     not being turned off in the first place.
   - **Low Power's own node list is narrower than Battery's**, and settled separately: both media
     workers, per "Node shutdown" above. `hard-hat` is *shed-capable* since Technitium moved to
     the control planes ([20](20-low-power-tier.md) §0.3) but is not on Low Power's list.

   **One derived claim, flagged rather than asserted:** for `shining-armor` to stay online,
   `twilight-sparkle` must stay powered through the outage. That follows from David's answer but
   was not separately confirmed.

   The remaining half of the original question — *the capacity floor once they are down* — is not
   closed here; it is item 4.

   For completeness, the rest of the estate's power posture is recorded in
   [20](20-low-power-tier.md) §7 rather than duplicated here: the battery powers **alpha-site**
   (and therefore its PoE switch), **celestia and luna** are on battery, **skystar** is remote on
   a different grid, and **the local network and the Internet uplink are battery/PoE-backed** —
   so a window can be driven remotely and the battery telemetry stays readable off-site.
6. ~~**`watch-state` and `strmgen` are on the keep-list but not in the cluster**~~ **CLOSED
   2026-08-21.** Re-confirmed live: no Deployment, StatefulSet or CronJob under either name, and
   no near-miss (`watchstate` searched too). They are gone. The keep-list is **eleven** entries,
   and all eleven now carry `downscaler/exclude` in Git (PR #1005) — see the keep-list table.
7. **No vault#84 sub-issue exists for this piece yet** — file one before treating this as
   more than a local design doc, consistent with how every other numbered piece in this set
   traces to a lettered sub-issue.

## Cross-references

- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — owns
  `critical`/`bulk` tags and the two existing StorageClasses this piece adds a
  third one alongside.
- [20-low-power-tier.md](20-low-power-tier.md) — the Battery-mode design this
  piece amends in two places (§1 namespace list, §4 placement model); read
  both, this file is not a replacement.
- [25-unseal-key-scope.md](25-unseal-key-scope.md) — unrelated in mechanism,
  same 2026-08-13 design session.
- [30-longhorn-media-tier.md](30-longhorn-media-tier.md) — owns `longhorn-media` and the
  grow-then-shrink migration that Low Power's node-shutdown half is blocked on. Read it before
  shedding either media worker.
