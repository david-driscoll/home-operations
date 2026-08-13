# 24 — Three-state power model (Full / Low Power / Battery)

Not yet filed as a vault#84 sub-issue letter — this piece is new, introduced
2026-08-13, extending [20-low-power-tier.md](20-low-power-tier.md) rather than
replacing it. **This is a design proposal, not yet executed or rehearsed.**
Where it states something as fact it was checked live against `admin@equestria`
on 2026-08-13; where it proposes a mechanism that hasn't been verified against
the tool's actual behavior, it says so — don't treat those parts with the same
confidence as the rest of this plan set.

Depends on [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) (storage
tagging) and amends [20-low-power-tier.md](20-low-power-tier.md) (§1 Tier-1
namespace list, §4 placement model) — read this file *and* 20 together; 20 is
not being rewritten, this file records what changed and why.

## Why a third state

20's design is binary: normal operation, or S′ — control-planes-only, workers
fully off, a deliberate 3–4h+ posture on the Pecron battery. That leaves no
posture for "mains is fine but we want to trim load" — pre-emptive load
shedding, or a lower-power posture that doesn't require shutting every worker
down. Three states:

| State | Trigger | Workers | What runs |
|---|---|---|---|
| **Full** | default | all up | everything |
| **Low Power** | manual toggle | some power-hungry hosts shut down (e.g. `fluttershy`); the rest stay up | Tier 0/1 + an explicit keep-list; everything else scaled to 0 by default |
| **Battery** | Pecron UPS reports mains lost | all workers cordoned + shut down | Tier 0/1 only — this *is* 20's S′, amended below |

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
**confirm this is the live setting name and semantics against the pinned
chart version before applying; not yet checked against source the way 12 did
for `replica-soft-anti-affinity`**) forces `numberOfReplicas: "2"` across
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

- Plex, Jellyfin
- namespace `coder`
- Immich
- FreshRSS
- Dynacat
- n8n
- obsidian-sync
- watch-state
- pulsarr
- dispatcharr
- strmgen
- xcproxy
- namespace `github-actions`

Plus, implicitly, everything already in Tier 0 (cluster platform — Cilium,
CoreDNS, Longhorn, Flux, etc.) and Tier 1 per 20/above — Low Power sheds Tier 2
load, it isn't a *harder* posture than normal for cluster platform services.

### Mechanism: kube-downscaler, default-off

This is new tooling — nothing in this repo does workload downscaling today
(`grep -r downscaler` across home-operations and equestria-cluster: zero
hits). [kube-downscaler](https://github.com/caas-team/kube-downscaler) fits
the "default off, opt out to stay up" requirement directly: it scales
Deployments/StatefulSets to 0 (and suspends CronJobs) unless a resource or its
namespace carries an exclude annotation, which is the inverse of most
downscaling tools' default (which default to leaving things alone unless
explicitly targeted) — confirm this reading against its current docs before
deploying, since getting the default polarity wrong here means "new app
silently doesn't survive Low Power" (safe direction) vs. "new app silently
keeps running and consumes power" (the failure this design exists to avoid) —
worth a deliberate dry-run check before trusting the default in production.

Concretely:

- Deploy kube-downscaler cluster-wide (own namespace, likely `kube-system` or
  a new `power-management` namespace).
- Annotate every namespace/workload in the keep-list above with its exclude
  annotation (exact key/value — `downscaler/exclude: "true"` per current docs,
  **verify against the installed chart version** — so a new app that wants to
  survive Low Power adds one annotation and nothing else changes; the default
  for anything unannotated is scaled down.
- The actual Full ↔ Low Power toggle needs to be something an operator can
  flip in real time (a UPS event or David's own judgment call), not a Git
  commit + Flux reconcile cycle each time — **the exact live-toggle mechanism
  (a ConfigMap kube-downscaler polls, a forced-downtime flag flipped via
  `kubectl patch`, or running it as an on-demand Job per transition) needs to
  be pinned down against kube-downscaler's actual current feature set before
  this is buildable** — flagging as the concrete next step rather than
  guessing at exact flags here.

### Node shutdown

Low Power additionally powers off specific power-hungry hosts — `fluttershy`
named explicitly as the first case, more may follow as nodes join. This reuses
20 §6's "cordon, don't drain, then power off" pattern and its "one at a time,
verify between each" rule — no new mechanism needed there, just a smaller,
selectable node set than Battery's "every worker." **Open item:** the keep-up
service list above has to actually be schedulable on whichever workers remain
after `fluttershy` (and any future additions) go dark — not verified here,
needs a capacity check per node-set once the specific shutdown list is final.

## Storage class summary (post-12, post-24)

| Class | Replicas | Placement | Use |
|---|---|---|---|
| `longhorn` (default) | 3 | `bulk`-tagged nodes only (12 Step 3) | ordinary Tier-2 app storage |
| `longhorn-critical` | 3 | `critical`-tagged nodes only, one per CP (12 Step 2) | data that must *never* leave a control plane — cluster-platform-adjacent state, not app data that floats |
| `longhorn-controlplane` *(new, this piece)* | 2 | zone-split: one replica in `critical` zone, one in `bulk` zone | Tier-1 **application** state that normally lives on a worker and relocates to a CP only during Battery (Home Assistant, etc.) |
| `longhorn-cache` / `longhorn-snapshot` / `longhorn-local` | unchanged | unchanged | unchanged, out of scope here (see 12's "out of scope") |

## Open items

1. **kube-downscaler's exact live-toggle mechanism** — the single biggest gap
   before Low Power is buildable. Needs its docs read against the pinned
   version before any manifest is written.
2. **Battery pod-relocation trigger** — the imperative step (or small
   controller) that actually moves float+relocate workloads on entry/exit.
   Not designed yet, flagged above.
3. **`replica-zone-soft-anti-affinity` setting name/semantics** — used above
   by inference from Longhorn's docs pattern, not verified against source the
   way 12 verified `replica-soft-anti-affinity`.
4. **Fresh capacity measurement** including `observability` + `pulumi` now
   staying up in Battery (this piece's §1 amendment) — extends 20 §8 item 6.
5. **Which specific apps get `longhorn-controlplane`** vs. staying on
   `longhorn-critical` (always-resident) vs. plain `longhorn` (Tier 2, no
   Battery guarantee at all) — Home Assistant is the one worked example here;
   mosquitto/matter/technitium need the same call made explicitly.
6. **PoE/host-shutdown ordering for Low Power's node list** — beyond
   `fluttershy`, which other hosts qualify as "power-hungry," and what's the
   capacity floor once they're down (open item under "Node shutdown" above).
7. **No vault#84 sub-issue exists for this piece yet** — file one before
   treating this as more than a local design doc, consistent with how every
   other numbered piece in this set traces to a lettered sub-issue.

## Cross-references

- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — owns
  `critical`/`bulk` tags and the two existing StorageClasses this piece adds a
  third one alongside.
- [20-low-power-tier.md](20-low-power-tier.md) — the Battery-mode design this
  piece amends in two places (§1 namespace list, §4 placement model); read
  both, this file is not a replacement.
- [25-unseal-key-scope.md](25-unseal-key-scope.md) — unrelated in mechanism,
  same 2026-08-13 design session.
