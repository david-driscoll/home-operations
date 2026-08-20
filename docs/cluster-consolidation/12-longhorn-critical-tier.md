# 12 — Longhorn critical tier (K′)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). Depends on
[10-drain-safety.md](10-drain-safety.md). Gates
[13-stage-sgc-apps.md](13-stage-sgc-apps.md) and
[20-low-power-tier.md](20-low-power-tier.md). Read this file standalone — it
does not assume you've read the vault issue or the discovery comments.

> **Status 2026-08-19 — ready to execute.** [19](19-rotate-equestria-control-planes.md) is
> done, so the topology this piece was blocked on is final. The design below is unchanged;
> what has been added is an ordered, copy-pasteable procedure
> (*[The fix — executable procedure](#the-fix--executable-procedure)*), a per-phase
> *[Rollback](#rollback)*, the volume list under
> *[Which volumes get `longhorn-critical`](#which-volumes-get-longhorn-critical)*, and
> *[What still blocks piece 20](#what-still-blocks-piece-20)*. Sections dated 2026-08-13 or
> earlier describe a four-node cluster and are kept for their reasoning, not their state;
> where an older section and a 2026-08-19 one disagree, the later one is correct. Three
> specific corrections are called out inline: the default StorageClass is **not** Helm-owned
> and needs no manual recreate, Tier-1's real data is **≈4.9 GiB** rather than 68 GB, and
> `taint-toleration` is **set but not applied**.

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

1. Tag the 3 control planes `critical` and the workers `bulk` (Longhorn node
   tags — a separate concept from Kubernetes node labels). Post-[19](19-rotate-equestria-control-planes.md)
   that is `milky-way`/`othalla`/`pegasus` and four workers respectively.
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

> **It has disappeared.** [19](19-rotate-equestria-control-planes.md) completed 2026-08-19.
> The pigeonhole argument below no longer holds, and *Which volumes get `longhorn-critical`*
> measures what replaced it: not one Tier-1 volume has all three replicas on a control
> plane, and one Tier-2 volume has none at all. Kept for the reasoning, not the state.

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

## Current live state (first written 2026-08-13; topology and settings
re-verified against `admin@equestria` on 2026-08-19)

### Topology

> **Superseded 2026-08-17 — the cluster is now seven nodes, not four.** SGC was
> decommissioned and its three nodes wiped and rejoined to equestria as control planes
> ([18](18-sgc-nodes-join-control-plane.md) complete; etcd 3 → 6). The table below is kept
> because the settings analysis around it is still valid, but the topology and the
> "only 3 nodes ever carrying `critical`" arithmetic are not. See *Topology after piece 19*
> underneath it.

| Node | Role | Longhorn disk | Longhorn tags today |
|---|---|---|---|
| `hard-hat` | control-plane | Samsung 990 EVO Plus 1TB | *(none)* |
| `fluttershy` | control-plane | Samsung 990 EVO Plus 1TB | *(none)* |
| `kerfuffle` | control-plane | Samsung 990 EVO Plus 1TB | *(none)* |
| `shining-armor` | worker | 1TB (`/dev/sdb`) | *(none)* |

### Topology after piece 19 (verified live 2026-08-19)

[19](19-rotate-equestria-control-planes.md) is **done**. The cluster is seven nodes: three
control planes (the ex-SGC trio) and four workers, etcd at 3 members. Verified with
`kubectl get nodes` and `kubectl -n longhorn-system get nodes.longhorn.io` on 2026-08-19:

| Node | Role | Longhorn disk ID | Block device | Hardware | Tags today |
|---|---|---|---|---|---|
| `milky-way` | control-plane | `default-disk-080100000000` | `sda1` (8:1) | Transcend `TS1TMTS425S` SATA | *(none)* |
| `othalla` | control-plane | `default-disk-080100000000` | `sda1` (8:1) | Transcend `TS1TMTS425S` SATA | *(none)* |
| `pegasus` | control-plane | `default-disk-080100000000` | `sda1` (8:1) | Transcend `TS1TMTS425S` SATA | *(none)* |
| `hard-hat` | worker | `default-disk-1030400000000` | `nvme0n1p4` (259:4) | Kingston NVMe | *(none)* |
| `fluttershy` | worker | `default-disk-1030100000000` | `nvme0n1p1` (259:1) | Samsung 990 EVO Plus 1TB (9–12 % wear) | *(none)* |
| `kerfuffle` | worker | `default-disk-1030100000000` | `nvme0n1p1` (259:1) | Samsung 990 EVO Plus 1TB (9–12 % wear) | *(none)* |
| `shining-armor` | worker | `default-disk-081100000000` | `sdb1` (8:17) | 1 TB, VM-backed | *(none)* |

The disk ID is Longhorn's encoding of the backing block device's `major:minor` in hex —
`0801` → 8:1 (`sda1`), `10304` → 0x103:0x04 = 259:4 (`nvme0n1p4`) — and it agrees with the
hardware inventory, which is how the two columns were cross-checked rather than assumed.

**Every fast Longhorn disk is now on a worker, and every slow, hot one is on a control
plane.** That is the inversion this piece has to design around. It is settled below in
*Answering "which three"*: `critical` stays on the control planes, and the weight of the
work shifts to Phase 4 (the old Step 3).

Live per-node Longhorn state the same day. Note that `hard-hat` and `shining-armor` are
already scheduled past their physical size — that is `storageOverProvisioningPercentage:
600`, not an error — and that `kerfuffle` is nearly empty because it was the last node
piece 19 rotated:

| Node | Disk max | Available | Scheduled | Replicas |
|---|---|---|---|---|
| `milky-way` | 930 GiB | 697 GiB | 532 GiB | 69 |
| `othalla` | 930 GiB | 783 GiB | 684 GiB | 38 |
| `pegasus` | 930 GiB | 731 GiB | 455 GiB | 63 |
| `hard-hat` | 930 GiB | 624 GiB | 1009 GiB | 106 |
| `fluttershy` | 930 GiB | 718 GiB | 519 GiB | 59 |
| `kerfuffle` | 930 GiB | 912 GiB | 12 GiB | 2 |
| `shining-armor` | 930 GiB | 325 GiB | 998 GiB | 79 |

All seven nodes are back to `allowScheduling: true` — piece 19's `allowScheduling: false`
stopgap on `milky-way`/`pegasus` has been undone, so nothing is masking the placement
problem any more.

**One caveat on the alternative you might reach for.** Longhorn's CSI parameters offer
`diskSelector` alongside the `nodeSelector` this piece uses. It is not available here:
every node registers `spec.disks[].tags: []` despite `talos/talconfig.yaml` requesting disk
tags (`["ssd"]` on the ex-SGC nodes, `["nvme","ssd"]` on the originals). The reason is not
a stale registration — it is that the whole annotation path is switched off. In
`controller/kubernetes_node_controller.go` at v1.12.1, `syncDefaultDisks()` opens with:

```go
requireLabel, err := knc.ds.GetSettingAsBool(types.SettingNameCreateDefaultDiskLabeledNodes)
...
if !requireLabel { return nil }
// only apply default disks if there is no existing disk
if len(node.Spec.Disks) != 0 { return nil }
```

`createDefaultDiskLabeledNodes: false` is set deliberately in
`kubernetes/apps/longhorn-system/longhorn/values.yaml`, so the
`node.longhorn.io/default-disks-config` annotation is never read at all — the `config`
label and the annotation are both present on all seven Kubernetes nodes and both inert.
Even flipping the setting would not retag the existing disks, because of the second guard.
Disk tags are therefore off the table without a disk re-registration, and this piece uses
**node** tags, which take a different code path with no such gate (see Phase 1).

`replica-soft-anti-affinity: false` (hard — confirmed live) means Longhorn will never put
two replicas of the same volume on the same node. Combined with exactly 3 nodes carrying
the `critical` tag, that is what forces exactly one `longhorn-critical` replica per control
plane — there is no fourth `critical` node for a spillover replica to land on.

### Answering "which three" with measurements (2026-08-18)

The section above leaves the choice open — follow the control plane, or follow the faster
disk. Running [19](19-rotate-equestria-control-planes.md)'s eviction on `fluttershy`
produced the numbers that settle it, measured mid-drain while ~340 GB of replicas moved:

| node | Longhorn disk | utilisation | avg write latency | temp |
|---|---|---|---|---|
| `milky-way` | Transcend SATA `/dev/sda` | **93.5 %** | **126 ms** | 75 °C |
| `pegasus` | Transcend SATA `/dev/sda` | **89.7 %** | **470 ms** | 73 °C |
| `othalla` | Transcend SATA `/dev/sda` | 3.7 % (idle) | — | 64 °C |
| `fluttershy` (source) | Samsung 990 EVO Plus | 6.3 % | — | 49 °C |

**The answer is: keep `critical` on the control planes anyway, and prioritise step 3.**

The disks are the worse ones, but that is not what `critical` is *for*. Tier-1 is small and
low-IOPS — home-assistant 43 GB, technitium 5.4 GB, mosquitto 8.6 GB, matter 4.3 GB,
crowdsec ~6.5 GB, about **68 GB of real data** (162 GB counting volsync caches/dests). That
load is negligible on any of these drives. What is *not* negligible is what is on them
today:

| node | in use | scheduled |
|---|---|---|
| `milky-way` | 172.7 GB | 534.7 GB |
| `othalla` | 159.0 GB | 735.5 GB |
| `pegasus` | 220.1 GB | 562.7 GB |

Roughly **70 % of that is Tier-2 bulk** — loki, thanos, jellyfin, immich, the *arr stack —
which has no reason to be on a control-plane disk at all. So the problem was never that
`critical` points at slow disks; it is that **nothing points anything away from them**.
Step 3 is the fix, and it is the step this piece already warns is "the one that matters
most and is easiest to skip."

Tag assignment for the post-[19](19-rotate-equestria-control-planes.md) topology, replacing
Step 1's original list:

```bash
# critical - the three control planes (D6 needs Tier-1 data to survive here)
for n in milky-way othalla pegasus; do
  kubectl -n longhorn-system patch nodes.longhorn.io $n --type merge -p '{"spec":{"tags":["critical"]}}'
done
# bulk - the four workers, all NVMe-backed
for n in hard-hat fluttershy kerfuffle shining-armor; do
  kubectl -n longhorn-system patch nodes.longhorn.io $n --type merge -p '{"spec":{"tags":["bulk"]}}'
done
```

### What step 3 would have prevented, concretely

With no tags and no selector, eviction picks targets by **free space alone**. `milky-way` and
`pegasus` were emptiest after their own wipes, so every rebuild went there while three NVMe
nodes sat idle. Consequences, all observed:

- throughput collapsed to 1–2 % per five minutes;
- rebuilds began failing and restarting from 0 % — one 64 GiB volume fell from 93 % to 3 %,
  and the failed-replica count went 0 → 3 → 6 → 9 in about twenty minutes;
- both drives climbed toward the 85 °C at which `pegasus` previously shut its XFS filesystem
  down mid-rebuild.

The stopgap was `allowScheduling: false` on both nodes, which is documented in
[19](19-rotate-equestria-control-planes.md) Step 1b-bis along with the matching undo. Step 3
is what makes the stopgap unnecessary.

**Root cause of the failures was a livelock, not a failing disk.** No kernel I/O errors and
no SMART errors on any drive. `concurrent-replica-rebuild-per-node-limit` defaults to **5**,
which is tuned for NVMe: five simultaneous rebuilds onto one Transcend SATA saturate it, the
rebuild data connections time out and drop (`Data server connection closed by remote
error=EOF`), Longhorn marks the replicas failed and retries all five — discarding the
progress each time. Lowered to **2** in
`kubernetes/apps/longhorn-system/longhorn/values.yaml`; two rebuilds that finish beat five
that restart. This matters most on the remaining rotations — `kerfuffle` holds ~80 replicas.

### How the default class actually gets updated — the constraint, corrected

The paragraph this replaces said that turning on `persistence.defaultNodeSelector` makes
`helm upgrade` **fail**, because StorageClass `parameters` are immutable. The immutability
is real. The conclusion is wrong, and it matters, because it makes the default-class
change (old Step 3, now Phase 4) look like a
hand-surgery job when it is not.

**Helm does not own the `longhorn` StorageClass.** Verified live 2026-08-19:

```console
$ kubectl get sc longhorn -o jsonpath='{.metadata.labels}{.metadata.annotations.meta\.helm\.sh/release-name}'
                       # empty: no Helm labels, no Helm release annotation

$ kubectl -n longhorn-system get cm longhorn-storageclass -o jsonpath='{.metadata.labels}'
{"app.kubernetes.io/managed-by":"Helm",...,"helm.toolkit.fluxcd.io/name":"longhorn",...}
```

The chart's `templates/storageclass.yaml` renders a **ConfigMap** named
`longhorn-storageclass` whose `data."storageclass.yaml"` is the class manifest. It never
renders a StorageClass object. `longhorn-manager` watches that ConfigMap and applies it,
and it handles the immutability itself by deleting and recreating —
`controller/kubernetes_configmap_controller.go` at `longhorn-manager@v1.12.1`:

```go
if !needToUpdateStorageClass(storageclassYAML, existingSC) { return nil }
storageclass, err := buildStorageClassManifestFromYAMLString(storageclassYAML)
...
err = kc.ds.DeleteStorageClass(types.DefaultStorageClassName)
...
storageclass, err = kc.ds.CreateStorageClass(storageclass)
```

`needToUpdateStorageClass` diffs the ConfigMap body against the
`longhorn.io/last-applied-configmap` annotation the controller stamps onto the class. That
annotation is present on the live object, which confirms this is the path in use rather
than a theoretical one, and the `longhorn-role` ClusterRole grants `*` on
`storageclasses`, so it has the permission to do it.

**So Phase 4 needs no manual delete and no `force: true`.** Edit the values, let Flux
reconcile, and `longhorn-manager` performs the recreate within one reconcile of the
ConfigMap write. Three consequences follow, each of which changes how the step is run:

1. **The DaemonSet does not roll.** `.Values.persistence` is referenced in exactly one
   template in the whole chart (`templates/storageclass.yaml`, grepped against
   `longhorn@v1.12.1`), so a `persistence`-only values change produces a single-object Helm
   diff. The `maxUnavailable: 100%` trap is real for any `defaultSettings` or `global`
   change — it is **not** triggered by this one. That is the reason to keep Phase 4's diff
   surgically limited to the `persistence:` block and land any `defaultSettings` change as
   a separate commit.
2. **The exposure is a delete-then-create gap, not a failed upgrade.** It is sub-second on
   the happy path. Two things can land inside it: a provisioning call naming `longhorn`
   explicitly, which `external-provisioner` simply retries; and a PVC created with no
   `storageClassName` at all during the moment there is no default class. The second used
   to be permanent, but Kubernetes 1.36 has retroactive default-StorageClass assignment
   (GA since 1.28), so such a PVC is filled in once the class returns. VolSync's movers are
   this cluster's main creator of PVCs, so still prefer a window with no sync running —
   but this is a far smaller hazard than "the upgrade fails."
3. **The `force: false` problem is real, but only for the hand-written classes.**
   `kubernetes/apps/longhorn-system/storageclass/` is applied by Flux directly and
   `ks.yaml:20` is `force: false`, so an immutable-field change to `longhorn-cache`,
   `longhorn-snapshot` or `longhorn-local` surfaces as a stuck Kustomization with an
   immutable-field error. That is Phase 5 below, and it is optional. Adding a **new** file
   to that directory — which is all Phase 3 does — is unaffected.

**The `maxUnavailable: 100%` trap, restated with its actual scope.** `longhorn-manager`'s
DaemonSet ships `updateStrategy.rollingUpdate.maxUnavailable: 100%` (confirmed live). Any
change that reaches the DaemonSet or the `longhorn-default-setting` ConfigMap rolls all
seven managers at once, leaving the cluster with no Longhorn control plane for ~90 s. It
recovers on its own and eviction state survives in the CRs, but it stalls any rebuild in
flight — so never land such a change while a node is draining. Phase 4 as specced does not
reach either object.

### Longhorn settings that matter to this piece (chart 1.12.1, live 2026-08-19)

The HelmRelease pins `version: 1.12.1`, not 1.12.0 as an earlier revision of this file
said. Values below read from `settings.longhorn.io`, which is the applied state, not from
`values.yaml`, which is the requested state — the two disagree in three places and that
disagreement is itself a finding (below the table).

| Setting | Value | Relevance |
|---|---|---|
| `replica-soft-anti-affinity` | `false` | Hard anti-affinity — the mechanism this piece relies on |
| `replica-replenishment-wait-interval` | `600` | Seconds until a short-a-replica volume gets rebuilt — the timer this piece is racing |
| `concurrent-replica-rebuild-per-node-limit` | `2` | Lowered from the chart's 5 after the piece-19 livelock; keeps a Transcend SATA from being saturated by rebuilds |
| `create-default-disk-labeled-nodes` | `false` | Disables the `default-disks-config` annotation path entirely — this is *why* disk tags are unavailable (see the caveat above) |
| `taint-toleration` | `node-role.kubernetes.io/control-plane:NoSchedule`, **`status.applied: false`** | **Changed since the last revision, which recorded `""`.** PR #912 set it; it has not applied. This is [20](20-low-power-tier.md)'s live blocker — see *What still blocks piece 20* below |
| `default-longhorn-static-storage-class` | `longhorn` | The plain default class |
| `node-down-pod-deletion-policy` | `do-nothing` | Longhorn's default. `values.yaml` asks for `Delete-both-statefulset-and-deployment-pod` and is silently not getting it — see the finding below. Relevant to [20](20-low-power-tier.md)/[24](24-power-states.md), not to this piece |
| `allow-empty-node-selector-volume` | `true` | Existing volumes with no `nodeSelector` (i.e. everything provisioned before this piece) keep matching *any* node — see the open-question analysis below. It is also why Phase 1 is inert on its own |
| `allow-volume-creation-with-degraded-availability` | `true` | Lets a new volume bind when it can place at least one replica |
| `node-drain-policy` | `allow-if-replica-is-stopped` | **Changed since v2.1**, which recorded `block-for-eviction-if-contains-last-replica`. `values.yaml` documents why: the old policy deadlocked Talos upgrades on any node holding a `longhorn-local` (strict-local, 1-replica) volume. [10](10-drain-safety.md) and [20](20-low-power-tier.md) both reference the old value and should re-verify against this one |

> **Three `values.yaml` keys are being silently dropped.** Found while cross-checking the
> table above against `longhorn@v1.12.1`'s `values.yaml`, and each one is a live
> requested-vs-applied divergence with no error anywhere:
>
> | In `values.yaml` | Chart key | Live effect |
> |---|---|---|
> | `nodeDownPoddeletionPolicy` | `nodeDownPodDeletionPolicy` (capital `D`) | setting stays `do-nothing`; the requested `Delete-both-statefulset-and-deployment-pod` never applied |
> | `guaranteedInstanceManagerCpu` | `guaranteedInstanceManagerCPU` (capital `CPU`) | setting stays `{"v1":"12","v2":"12"}`; the requested `5` never applied |
> | `volumeAttachmentRecoveryPolicy` | *(no such key in 1.12.1)* | dropped entirely |
>
> `templates/default-setting.yaml` guards every key with `if not (kindIs "invalid" ...)`,
> so a misspelled key is indistinguishable from an unset one and the rendered
> `longhorn-default-setting` ConfigMap simply omits it. Confirmed live: neither
> `node-down-pod-deletion-policy` nor `guaranteed-instance-manager-cpu` appears in that
> ConfigMap. **Out of scope for this piece** — fixing them is a `defaultSettings` change,
> which does roll all seven managers, and `guaranteed-instance-manager-cpu` in particular
> changes instance-manager CPU reservation across a 7-node cluster whose control planes
> have 4 cores each. Land it as its own change with its own window.

### StorageClasses today

`longhorn` (default, 3 replicas, no selector), `longhorn-cache` (2 replicas, disposable
VolSync cache), `longhorn-snapshot` (2 replicas, VolSync restore staging), `longhorn-local`
(1 replica, `dataLocality: strict-local` — **CNPG only, see "Out of scope" below**),
`openebs-hostpath` (not default, unused), `nfs-csi` (not Longhorn). Confirmed live
2026-08-19: exactly one class carries `is-default-class: "true"`, and **no** class sets
`nodeSelector` or `diskSelector`. Placement across all 203 Longhorn volumes is decided by
free space alone.

> **Superseded by execution, same day.** Phases 1–4 landed (PR #960), so `longhorn` now
> carries `nodeSelector: bulk` and `longhorn-critical` (3 replicas, `nodeSelector:
> critical`) exists and holds all seven Tier-1 volumes. Two more classes were added when
> the VolSync staging split landed: `longhorn-critical-snapshot` and
> `longhorn-critical-cache`, both 1 replica on `nodeSelector: critical`, so Tier-1 mover
> volumes survive Phase 5 restricting the `bulk` pair — see Phase 5 below.

> **Naming collision worth knowing about before you type it.** The chart's default
> `priorityClass` is itself named `longhorn-critical` (this repo overrides it to
> `system-node-critical`). It is a PriorityClass, not a StorageClass, so there is no actual
> conflict — but `kubectl get longhorn-critical` is ambiguous. Always qualify:
> `kubectl get sc longhorn-critical`.

## The fix — executable procedure

> **Numbering.** Older sections of this file — and [24](24-power-states.md) — refer to
> "Step 1/2/3". The phases below supersede them: old **Step 1** (tag the nodes) is
> **Phase 1** plus the durable form in **Phase 2**; old **Step 2** (the `longhorn-critical`
> class) is **Phase 3**; old **Step 3** (restrict the default class) is **Phase 4**.
> Phase 5 is new.

Every file below lives in **this repo** (`home-operations`). That now includes
`talos/talconfig.yaml`, which an earlier revision of this file said was still in
`equestria-cluster`; it is not, it moved with the rest of the tree.

**The order is not negotiable, and the reason is one specific failure.** Phase 4 puts
`nodeSelector: bulk` on the default StorageClass. If no node carries the `bulk` tag when
that lands, every newly provisioned default-class volume has **zero** eligible nodes, and
`allow-volume-creation-with-degraded-availability: true` does not save it — that valve
needs at least one successful placement, not zero. The PVC then sits `Pending` forever.
VolSync creates such PVCs on every scheduled sync across ~40 apps, so the blast radius of
getting this backwards is the whole backup system, quietly, within an hour. **Tags first.**

Phases 1–3 are individually safe and individually revertible. Phase 4 is the one that
changes behaviour. Phase 5 is optional. Do not run any of this while a node is draining or
a rebuild is in flight.

### Phase 0 — preflight, read-only

```bash
export KC="kubectl --context admin@equestria"

# Topology is what this plan assumes: 3 CPs (milky-way/othalla/pegasus) + 4 workers.
$KC get nodes -o custom-columns='NAME:.metadata.name,ROLES:.metadata.labels.node-role\.kubernetes\.io/control-plane'

# Exactly one default class, and it is `longhorn` (re-confirms vault#113 still holds).
$KC get sc

# Nothing degraded, nothing rebuilding, nothing evicting. All three must be empty.
$KC -n longhorn-system get volumes.longhorn.io \
  -o custom-columns='NAME:.metadata.name,ROBUSTNESS:.status.robustness' | grep -v healthy
$KC -n longhorn-system get nodes.longhorn.io \
  -o custom-columns='NAME:.metadata.name,SCHED:.spec.allowScheduling,EVICT:.spec.evictionRequested' \
  | grep -Ev 'true +false'
$KC -n longhorn-system get replicas.longhorn.io \
  -o jsonpath='{range .items[?(@.status.currentState!="running")]}{.metadata.name}{"\n"}{end}'
```

**Record the rollback baseline** — this is the only thing that makes Phase 4 reversible
with confidence:

```bash
$KC -n longhorn-system get volumes.longhorn.io -o yaml > /tmp/lh-volumes-before.yaml
$KC -n longhorn-system get replicas.longhorn.io \
  -o custom-columns='VOL:.spec.volumeName,NODE:.spec.nodeID' | sort > /tmp/lh-replicas-before.txt
$KC get sc longhorn -o yaml > /tmp/sc-longhorn-before.yaml
```

### Phase 1 — tag the nodes

Longhorn node tags live on `Node.spec.tags` of the `nodes.longhorn.io` CRD in
`longhorn-system`. They are **not** Kubernetes node labels and **not** managed by Flux —
there is no manifest for them anywhere in this repo, by design. All seven are `[]` today.

Applying them is safe, immediate and idempotent, and — this is the part worth
internalising — **it changes nothing on its own**. No StorageClass references either tag
yet, and `allow-empty-node-selector-volume: true` means every existing volume (whose
`Spec.NodeSelector` is `[]`) keeps matching every node regardless of tags. Nothing moves,
nothing rebuilds, nothing is evicted. Phase 1 is inert until Phase 3 and Phase 4 give the
tags meaning.

```bash
# critical - the three control planes (D6 needs Tier-1 data to survive here)
for n in milky-way othalla pegasus; do
  $KC -n longhorn-system patch nodes.longhorn.io "$n" --type merge \
    -p '{"spec":{"tags":["critical"]}}'
done

# bulk - the four workers
for n in hard-hat fluttershy kerfuffle shining-armor; do
  $KC -n longhorn-system patch nodes.longhorn.io "$n" --type merge \
    -p '{"spec":{"tags":["bulk"]}}'
done
```

Verify — all seven rows must be tagged, with no node carrying both:

```bash
$KC -n longhorn-system get nodes.longhorn.io \
  -o custom-columns='NAME:.metadata.name,TAGS:.spec.tags'
# milky-way/othalla/pegasus            -> [critical]
# hard-hat/fluttershy/kerfuffle/shining-armor -> [bulk]
```

Longhorn will not overwrite a tag you set. `syncDefaultNodeTags()` in
`controller/kubernetes_node_controller.go@v1.12.1` opens with
`if len(node.Spec.Tags) != 0 { return nil }` — once `Spec.Tags` is non-empty it is yours.

### Phase 2 — the durable, git-tracked form of the tags

Phase 1 is imperative, so a node rebuild would come back untagged and silently rejoin the
wrong tier. `talos/talconfig.yaml` fixes that with the
`node.longhorn.io/default-node-tags` annotation, which `syncDefaultNodeTags()` reads
**only** when `Spec.Tags` is empty — i.e. exactly on a fresh registration, and never as a
fight with Phase 1.

Unlike the disks path, this one has **no** `create-default-disk-labeled-nodes` gate (the
guard quoted in the topology caveat above appears in `syncDefaultDisks()`, not here), so it
works on this cluster as configured.

The file already groups the annotation by hardware with YAML anchors, and those groups
happen to align exactly with the tier split. Four edits cover all seven nodes:

| Anchor in `talos/talconfig.yaml` | Nodes | Tag to add |
|---|---|---|
| `&nodeAnnotations` | `milky-way`, `othalla`, `pegasus` | `'["critical"]'` |
| `&amd_minifm_annotations` | `hard-hat` | `'["bulk"]'` |
| `&intel_un1290_annotations` | `fluttershy`, `kerfuffle` | `'["bulk"]'` |
| *(inline block on `shining-armor`)* | `shining-armor` | `'["bulk"]'` |

For example, on the control-plane block:

```yaml
    nodeAnnotations: &nodeAnnotations
      node.longhorn.io/default-node-tags: '["critical"]'   # ADD
      node.longhorn.io/default-disks-config: |
        {
          "disks": [
            {
              "path": "/var/mnt/longhorn",
              "allowScheduling": true,
              "tags":["ssd"]
            }
          ]
        }
```

**No `talosctl apply-config` is required for this piece.** The annotation is inert while
`Spec.Tags` is non-empty, so it can ride along with the next natural machine-config apply.
Do not schedule a node-touching operation just to land it.

### Phase 3 — add the `longhorn-critical` StorageClass

New file, `kubernetes/apps/longhorn-system/storageclass/critical.yaml`. That directory has
no `kustomization.yaml` — Flux auto-generates one covering every YAML file it finds — so
dropping a file in is sufficient. This is purely additive: no existing object changes, so
`force: false` on that Kustomization is not in play.

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

`nodeSelector: "critical"` is the Longhorn CSI parameter restricting replica placement to
nodes carrying that tag — unrelated to Kubernetes' own `nodeSelector`, same word, different
layer. `numberOfReplicas: "3"` against exactly three `critical` nodes plus hard
anti-affinity is what forces one replica per control plane; no separate affinity rule is
needed. `dataLocality: best-effort` gets a local replica when the consuming pod is on a
control plane and is a harmless no-op when it is not — the scheduler still filters by tag,
so it cannot place a replica on an untagged worker.

```bash
flux reconcile kustomization storageclass -n longhorn-system --with-source
$KC get sc longhorn-critical -o yaml | yq '.parameters'
```

### Phase 4 — restrict the default class to `bulk`

This is the step that matters, and the only one that changes behaviour. Read *How the
default class actually gets updated* above first — the recreate is automatic and there is
no `force: true` to flip.

Edit `kubernetes/apps/longhorn-system/longhorn/values.yaml`. **Keep the diff to the
`persistence:` block**; a `defaultSettings` change in the same commit would roll all seven
`longhorn-manager` pods:

```yaml
persistence:
  defaultDataLocality: best-effort
  defaultNodeSelector:          # ADD
    enable: true                # ADD
    selector: "bulk"            # ADD
```

That is `persistence.defaultNodeSelector`, not `persistence.nodeSelector` and not a
`defaultSettings` key — verified against `longhorn@v1.12.1`'s `templates/storageclass.yaml`,
which emits `parameters.nodeSelector` on the default class only when
`.Values.persistence.defaultNodeSelector.enable` is true, using `.selector` as the value.

Pick a quiet moment: no VolSync sync running, no node draining, no rebuild in flight
(Phase 0's checks). Then:

```bash
flux reconcile helmrelease longhorn -n longhorn-system --with-source
```

Verify, in this order — the second check is the one that proves it reconciled rather than
merely landed in git:

```bash
# 1. Helm wrote the ConfigMap.
$KC -n longhorn-system get cm longhorn-storageclass \
  -o jsonpath='{.data.storageclass\.yaml}' | grep nodeSelector
# expect: nodeSelector: "bulk"

# 2. longhorn-manager recreated the class from it.
$KC get sc longhorn -o jsonpath='{.parameters.nodeSelector}{"\n"}'
# expect: bulk

# 3. It is still the one and only default class.
$KC get sc | grep default

# 4. Nothing went Pending in the gap.
$KC get pvc -A --field-selector status.phase=Pending
```

If check 2 stays empty for more than a couple of minutes while check 1 passes,
`longhorn-manager` is not reconciling. Look at its log for the ConfigMap controller before
touching anything by hand:

```bash
$KC -n longhorn-system logs -l app=longhorn-manager --tail=200 | grep -i storageclass
```

### Phase 5 — optional: the hand-written classes

`longhorn-cache` and `longhorn-snapshot` are VolSync's cache and restore-staging classes.
They are Tier-2 by nature, they are large (`volsync-taildrive-dst-dest` alone is 100 Gi
provisioned), and they place by free space like everything else — so they are a live route
for bulk data back onto a control-plane disk even after Phase 4. Adding
`nodeSelector: "bulk"` to both in
`kubernetes/apps/longhorn-system/storageclass/snapshot.yaml` closes it.

**`longhorn-local` must NOT get a selector.** It is `dataLocality: strict-local`,
`numberOfReplicas: "1"`, and it is what CNPG's `postgres-1/2/3` sit on; constraining it to
either tier would make those volumes unschedulable on the other.

This is the only place the immutability constraint genuinely bites, because Flux applies
these directly and `storageclass/ks.yaml:20` is `force: false`. Two ways:

- **Flip `force: true` on that Kustomization** (`kubernetes/apps/longhorn-system/storageclass/ks.yaml`).
  Durable, and correct for a directory that contains only StorageClasses — recreating one
  is safe because bound PVs do not need the class object to exist. It also makes every
  future parameter change to these classes a non-event. Same sub-second provisioning gap as
  Phase 4.
- **Delete the two classes by hand and let Flux recreate them**, leaving `force: false`.
  Minimal blast radius, but it has to be repeated for every future parameter change, and it
  is a hand step that will eventually be forgotten.

Prefer flipping `force: true`. Either way, do it as a separate commit from Phase 4 so the
two recreate windows do not overlap.

**The consequence for Tier 1, and how it is already handled.** Restricting these two
classes gives a Tier-1 VolSync *restore* — and, equally, a scheduled *backup*, since the
restic cache is `longhorn-cache` on both movers — zero schedulable nodes while the workers
are dark. A tier whose defining property is surviving low power cannot stop backing up in
the mode it exists for, so the critical tier has its own scratch classes,
`longhorn-critical-snapshot` and `longhorn-critical-cache` (1 replica each,
`nodeSelector: critical`, in `storageclass/critical.yaml`). The five VolSync-backed Tier-1
apps already point at them via `VOLSYNC_STAGING_STORAGECLASS` and
`VOLSYNC_CACHE_SNAPSHOTCLASS`, so Phase 5 does not strand them. **Both variables must move
together** — pinning staging and leaving the cache behind strands the mover just the same.

Longhorn's tag selector is a hard filter with no preference order, so this is binary:
Tier-1 scratch volumes are on the control planes always, not "workers normally, control
planes when dark". The price is about 4.7 GB of writes a night across the three SATA
disks (home-assistant is ~3.9 GB of it), which is noise against those drives' endurance
budget and buys backup coverage that does not depend on a worker being awake.

> **Phase 5 depends on a component fix that landed 2026-08-19.** `VOLSYNC_STORAGECLASS` used
> to drive three volumes at once — the app's PVC *and* both mover staging volumes — so the
> five Tier-1 apps migrated above had their backup staging silently moved onto
> `longhorn-critical` too. Two things follow, and both defeat Phase 5 if the fix is not in:
> restricting `longhorn-snapshot` would not touch those apps at all (they no longer use it),
> and every nightly backup would clone the full dataset onto the three control-plane SATA
> disks at 3 replicas — ~12 GB of writes per night for home-assistant alone, precisely the
> churn Phase 4 exists to prevent. The fix splits out `VOLSYNC_STAGING_STORAGECLASS`
> (default `longhorn-snapshot`, i.e. no behaviour change for any app that never set the old
> variable); see `kubernetes/components/volsync/AGENTS.md` §"Two storage classes, not one".
> **Verify before running Phase 5:**
>
> ```bash
> kubectl -n network get replicationsources technitium \
>   -o jsonpath='{.spec.restic.storageClassName}{"\n"}'   # expect: longhorn-snapshot
> ```

## Rollback

Per phase, because they fail differently. Nothing here needs data movement, which is the
point of doing the tagging structurally rather than by eviction.

**Phase 4 (default class restricted to `bulk`) — the one you are most likely to want.**
Revert the `persistence.defaultNodeSelector` block in `values.yaml` and reconcile. Helm
rewrites the ConfigMap, `longhorn-manager` recreates the class without the parameter, and
the cluster is back to free-space placement. Same sub-second gap as landing it.

```bash
git revert <commit>            # or delete the three added lines
flux reconcile helmrelease longhorn -n longhorn-system --with-source
$KC get sc longhorn -o jsonpath='{.parameters.nodeSelector}{"\n"}'   # expect empty
```

**Volumes created while Phase 4 was live keep `Spec.NodeSelector: ["bulk"]`** — reverting
the class does not reach them, because the scheduler reads the field off the Volume CR, not
off the StorageClass. If one of them needs to be freed:

```bash
$KC -n longhorn-system patch volumes.longhorn.io <volume-name> --type merge \
  -p '{"spec":{"nodeSelector":[]}}'
```

Find them with:

```bash
$KC -n longhorn-system get volumes.longhorn.io \
  -o custom-columns='NAME:.metadata.name,SEL:.spec.nodeSelector,PVC:.status.kubernetesStatus.pvcName' \
  | grep -v '\[\]'
```

**Phase 5 (`force: true` / selectors on the hand-written classes).** Revert the YAML and
reconcile. If `force: true` was flipped, leaving it flipped is harmless — it only takes
effect on an immutable-field error — but revert it too if the intent is a clean undo.

**Phase 3 (`longhorn-critical`).** Delete `critical.yaml` and let Flux prune it
(`prune: true` on that Kustomization). Safe only while nothing is bound to the class; check
first, and if anything is, that PVC has to be migrated off before the class can go:

```bash
$KC get pvc -A -o json | jq -r '.items[]|select(.spec.storageClassName=="longhorn-critical")|"\(.metadata.namespace)/\(.metadata.name)"'
```

**Phase 1 (node tags).** Only meaningful after Phases 3–5 are reverted, since the tags are
what those reference. Clearing them restores free-space placement everywhere:

```bash
for n in milky-way othalla pegasus hard-hat fluttershy kerfuffle shining-armor; do
  $KC -n longhorn-system patch nodes.longhorn.io "$n" --type merge -p '{"spec":{"tags":[]}}'
done
```

Reverting in the wrong order — clearing tags while a selector still references them —
strands new provisioning exactly the way running Phase 4 before Phase 1 would. **Undo in
reverse: 5, 4, 3, 1.**

**Phase 2 (talconfig annotation).** Revert the YAML. Nothing to undo in the cluster; the
annotation was never read, because `Spec.Tags` was non-empty the whole time.

**What no rollback can undo:** replicas that were placed while the selectors were live have
moved, and reverting does not move them back. Compare against
`/tmp/lh-replicas-before.txt` from Phase 0 to see what actually shifted, then decide
deliberately — do not evict reflexively, given what eviction onto the Transcend SATAs did
during piece 19.

## Which volumes get `longhorn-critical`

Answered here so that [13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md) and
[24](24-power-states.md) (open item 5) inherit a list rather than a question. Derived from
[20](20-low-power-tier.md) §1's Tier-1 set, then reconciled against every Longhorn PVC that
actually exists — `kubectl get pvc -A`, 2026-08-19. Sizes are provisioned request and
`volumes.longhorn.io.status.actualSize`.

### Today's exposure, measured

Replica placement is arbitrary today, and the arithmetic that used to protect it is gone.
Count of replicas landing on a control plane, per Tier-1 volume, live 2026-08-19:

| PVC | Replica nodes | On a control plane |
|---|---|---|
| `tailscale-system/golink` | `fluttershy`, `hard-hat`, `shining-armor` | **0 of 3** |
| `network/technitium` | `fluttershy`, `pegasus`, `hard-hat` | 1 of 3 |
| `stargate-command/matter` | `shining-armor`, `fluttershy`, `pegasus` | 1 of 3 |
| `tailscale-system/tsiam` | `fluttershy`, `othalla`, `shining-armor` | 1 of 3 |
| `network/crowdsec-db-pvc` | `milky-way`, `fluttershy`, `hard-hat` | 1 of 3 |
| `stargate-command/data-mosquitto-0` | `pegasus`, `milky-way`, `shining-armor` | 2 of 3 |
| `stargate-command/data-mosquitto-1` | `hard-hat`, `milky-way`, `othalla` | 2 of 3 |
| `stargate-command/home-assistant` | `hard-hat`, `othalla`, `milky-way` | 2 of 3 |
| `tailscale-system/tsidp` | `hard-hat`, `pegasus`, `milky-way` | 2 of 3 |

**Not one Tier-1 volume has 3 of 3.** Every one of them is degraded the instant the workers
go dark, and DNS (`technitium`), the Matter bridge and `tsiam` would each be running on a
single replica, on a Transcend SATA, for the length of the window. `golink` — Tier 2, so
nobody loses sleep, but it is the proof — has **no** control-plane replica at all and would
simply be gone. This is exactly the "pigeonhole luck has evaporated" prediction in §4
above, now measured rather than predicted.

### The list

**Group A — `longhorn-critical`, unconditionally.** Estate services whose consumer belongs
on a control plane in every proposed power model, so there is no pod-placement question to
resolve first:

| PVC | Namespace | Provisioned | Actual | Why |
|---|---|---|---|---|
| `technitium` | `network` | 5 Gi | 443 MiB | DNS for the whole estate. Tier 1 in [20](20-low-power-tier.md) §1 and the single most load-bearing volume in this list |
| `tsidp` | `tailscale-system` | 5 Gi | 147 MiB | Tailscale OIDC provider state, including its signing keys. Losing the PVC does not degrade it — it mints **new** keys and every relying party breaks |
| `tsiam` | `tailscale-system` | 1 Gi | 49 MiB | Same, for the successor instance. Both deployments are live at 1/1 |

**Group B — `longhorn-critical` recommended, but coupled to an unresolved decision.**
[20](20-low-power-tier.md) §4 pins every Tier-1 application to a control plane permanently;
[24](24-power-states.md) §2 supersedes that with float-on-worker + relocate-on-Battery and
proposes a `longhorn-controlplane` class for exactly these volumes. That disagreement is
not this piece's to settle, so both the recommendation and the condition are stated:

| PVC | Namespace | Provisioned | Actual |
|---|---|---|---|
| `home-assistant` | `stargate-command` | 40 Gi | 3.8 GiB |
| `data-mosquitto-0` | `stargate-command` | 4 Gi | 162 MiB |
| `data-mosquitto-1` | `stargate-command` | 4 Gi | 159 MiB |
| `matter` | `stargate-command` | 4 Gi | 133 MiB |

Recommend `longhorn-critical` for all four unless and until 24's float model is actually
built, on three grounds. First, `longhorn-controlplane` as specced is **2** replicas
zone-split, which means exactly one control-plane replica — no redundancy at all during
Battery, which is the one window it exists for. Second, it depends on
`replica-zone-soft-anti-affinity`, which [24](24-power-states.md) open item 3 flags as
unverified against source; `longhorn-critical`'s mechanism is verified. Third, the capacity
argument that motivates floating does not survive measurement — see the footprint below.

The one real cost of choosing `longhorn-critical` here: with all three replicas confined to
`critical` nodes, a pod that floats on a worker does every read and write across the
network to a Transcend SATA, and `dataLocality: best-effort` cannot fix it because the
worker has no `critical` tag. If 24's float model wins, that is the reason to revisit —
**not** capacity.

**Footprint if Groups A and B both move:** seven volumes, **63 GiB provisioned and ≈4.9 GiB
actual**. With 3 replicas that is 63 GiB provisioned and ≈4.9 GiB actual *per control-plane
disk*, against 930 GiB disks with 697–783 GiB free. It is nothing.

> **This corrects this file's own figure.** The *Answering "which three"* section above
> says Tier-1 is "about 68 GB of real data (162 GB counting volsync caches/dests)". Those
> were **provisioned request sizes**, and the total also counted crowdsec, which the audit
> below removes from the tier. Measured actual is ≈4.9 GiB. The conclusion the number was
> supporting — keep `critical` on the control planes, prioritise Phase 4 — gets stronger,
> not weaker.

### Explicitly not `longhorn-critical`

Audited rather than assumed, because [24](24-power-states.md) §1 flags the observability
storage question as open and this closes it.

- **`network/crowdsec-config-pvc`, `crowdsec-db-pvc`, `crowdsec-ui`.** The Traefik bouncer
  is not in the request path: `traefik/middleware/crowdsec.yaml` ships `enabled: false`
  (the standing kill switch), and even enabled it runs `crowdsecMode: stream` with
  `streamStartupBlock: false`, i.e. deliberately fail-open, so a LAPI outage degrades to a
  stale decision list rather than an ingress failure. Tier 2 for storage purposes.
- **All nine `observability/*` volumes** — `data-thanos-receive-0` (77 GiB actual),
  `storage-loki-0` (58 GiB), `thanos-compactor` (20 GiB),
  `prometheus-prometheus-db-prometheus-prometheus-0` (19 GiB),
  `data-thanos-storegateway-0` (6.3 GiB), `grafana`, `storage-tempo-0`,
  `data-thanos-ruler-0`, `alertmanager-alertmanager-db-alertmanager-alertmanager-0`. That
  is ≈178 GiB of real data with the highest write rate in the cluster. [24](24-power-states.md)
  §1 moves observability's *pods* to Tier 1 and explicitly leaves its storage unaudited;
  audited, the answer is that putting it on three Transcend SATAs is a non-starter, on IOPS
  rather than capacity. It stays on the default class, which after Phase 4 means it stays on
  the NVMe workers.
- **`tailscale-system/golink`, `tailscale-system/taildrive`, `kube-system/registry`,
  everything in `equestria` and `database`.** Tier 2.
- **`chrony`.** Tier 1 but stateless — confirmed live, its Deployment mounts no volumes at
  all. It needs nothing from this piece.
- **`k8s-gateway`, `traefik`, `cloudflare-dns`, `cloudflare-tunnel`, `unifi-dns`,
  `error-pages`, `technitium-dns`.** Tier 1 and all stateless — the only PVCs in the
  `network` namespace are `technitium` and the three crowdsec ones.
- **`database/postgres-{1,2,3}`** on `longhorn-local`. Outside this scheme entirely; see
  *Out of scope*.

### Moving a volume onto the class is not this piece's job

Changing a bound PVC's `storageClassName` requires recreating the PVC and copying the data
— [13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md) own that, per *Out of scope*. What
this piece owes them is the list above and a class that exists.

There is a cheaper partial measure that is **not** a substitute: `Volume.Spec.NodeSelector`
is live and mutable, so patching an existing volume to `["critical"]` makes Longhorn
replenish onto control planes without recreating the PVC. It does not move the replicas
that are already placed, and it leaves the PVC pointing at the wrong class so a VolSync
restore or a resize silently reverts it. Useful as an emergency stopgap before a planned
Battery window; not a migration.

## What still blocks piece 20

Neither item blocks *this* piece — tags and StorageClasses are unaffected by both — but
both are live, both are invisible unless you look, and both gate
[20](20-low-power-tier.md). They are recorded here because 20's dependency edge runs
through this file.

### 1. `taint-toleration` is set but has not applied

```console
$ kubectl -n longhorn-system get settings.longhorn.io taint-toleration \
    -o custom-columns=VALUE:.value,APPLIED:.status.applied
VALUE                                             APPLIED
node-role.kubernetes.io/control-plane:NoSchedule   false

$ kubectl -n longhorn-system get ds longhorn-csi-plugin \
    -o jsonpath='{.metadata.annotations.longhorn\.io/last-applied-tolerations}'
[]
```

That second command is the check `values.yaml` itself prescribes, and it agrees: the
system-managed components are carrying no toleration at all.

PR #912 landed **the Helm half only**. `global.tolerations` reaches the user-deployed pods
(`longhorn-manager`, `longhorn-ui`, `longhorn-driver-deployer`) through an ordinary pod
spec, and that part is live. The system-managed half — `instance-manager`, `engine-image`,
`longhorn-csi-plugin`, `backing-image-manager`, `share-manager`, all created by
`longhorn-manager` at runtime rather than by Helm — is reachable only through the
`taint-toleration` **setting**, and since longhorn/longhorn#7173 that setting is *accepted
and deferred* rather than rejected: `updateTaintToleration()` gates on
`AreAllVolumesDetachedState()`, logs `ErrorInvalidState`, and requeues on the one-hour
resync. **Live count 2026-08-19: 78 of 203 volumes attached.** Nothing surfaces the
failure — `helm upgrade` succeeded, the HelmRelease is `Ready`, and only
`longhorn-manager`'s log disagrees.

Why 20 cannot proceed on this: 20 adds a `critical` taint to the control planes and flips
`allowSchedulingOnControlPlanes: false`. `NoSchedule` does not evict, so the existing
system-managed pods keep running and it looks fine — until the next pod recreate on a
control plane (reboot, Talos upgrade, DaemonSet rollout), after which they cannot come back
and every volume attached through that node breaks. Landing the taint before the setting
applies converts a routine reboot into a storage outage.

**What it needs:** a maintenance window with **every** Longhorn volume detached, then
re-verify `last-applied-tolerations` actually contains the key. That is
[10-drain-safety.md](10-drain-safety.md)'s territory and it is not scheduled. Do not
discover it on the day.

### 2. `node-down-pod-deletion-policy` is `do-nothing`, not what `values.yaml` asks for

Per the silently-dropped-keys finding above, the live setting is Longhorn's default
`do-nothing` rather than the requested
`Delete-both-statefulset-and-deployment-pod`. Under [20](20-low-power-tier.md) §4's
always-resident model nothing needs to move when the workers go dark, so this is harmless.
Under [24](24-power-states.md) §2's float-and-relocate model it is not: with `do-nothing`,
StatefulSet pods stranded on a powered-off worker are never deleted and therefore never
reschedule onto a control plane. 24's open item 2 ("the imperative step that actually moves
float+relocate workloads") has to account for this, or fix the key first.

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

### A sequencing nuance Phase 4 used to surface — now retired

`allow-volume-creation-with-degraded-availability: true` (verified live) is the safety valve
that kept Step 3 from being harmful when this file was written: `controller/volume_controller.go`
only marks a new volume `Scheduled: true` despite an unsatisfied replica count if **at least
one** replica placed successfully. At the time there was exactly one `bulk`-tagged node
(`shining-armor`), so a new Tier-2 PVC would provision, bind and run with 1 replica instead
of 3 until [19](19-rotate-equestria-control-planes.md) grew the worker pool.

**19 is done, so this interim no longer exists.** There are four `bulk` nodes, hard
anti-affinity has three to choose from, and a new default-class volume gets its full 3
replicas immediately — which is why *Rehearsed placement proof* below now expects 3 of 3
rather than 1 of 3. The valve still matters as a failure mode, though, and in a direction
worth naming: it needs **one** successful placement, not zero. That is precisely why Phase 1
must precede Phase 4 — with a `bulk` selector and no `bulk`-tagged node, there is no
degraded binding to fall back to, only a `Pending` PVC.

## Rehearsed placement proof

Prove the mechanism on a scratch volume before trusting it for real workloads. Run after
Phases 1–4 are applied and reconciled. Both proofs are cheap and self-cleaning; run them
even if everything looks right, because the failure mode they catch — a tag typo, a
selector that landed in git but not in the cluster — is otherwise invisible until a Battery
window.

**Proof 1 — `longhorn-critical` places one replica per control plane:**

```bash
$KC apply -f - <<'EOF'
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

# WaitForFirstConsumer, so it needs a pod before it binds.
$KC run scratch-critical-pod --image=busybox --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"c","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"v","mountPath":"/data"}]}],"volumes":[{"name":"v","persistentVolumeClaim":{"claimName":"scratch-critical-proof"}}]}}'
$KC wait --for=condition=Ready pod/scratch-critical-pod --timeout=180s

$KC -n longhorn-system get replicas.longhorn.io \
  -l longhornvolume=$($KC get pvc scratch-critical-proof -o jsonpath='{.spec.volumeName}') \
  -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeID'
# expect exactly 3 rows: milky-way, othalla, pegasus. Zero on any worker.

$KC -n longhorn-system get volumes.longhorn.io \
  $($KC get pvc scratch-critical-proof -o jsonpath='{.spec.volumeName}') \
  -o jsonpath='{.spec.nodeSelector}{" "}{.status.robustness}{"\n"}'
# expect: ["critical"] healthy

$KC delete pod scratch-critical-pod
$KC delete pvc scratch-critical-proof
```

**Proof 2 — the default class can no longer place onto a control plane:**

```bash
$KC apply -f - <<'EOF'
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
# storageClassName deliberately omitted - this must hit the default `longhorn` class,
# which is `Immediate` binding, so it provisions without a pod.

$KC -n longhorn-system get replicas.longhorn.io \
  -l longhornvolume=$($KC get pvc scratch-bulk-proof -o jsonpath='{.spec.volumeName}') \
  -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeID'
# expect exactly 3 rows, all on workers (hard-hat / fluttershy / kerfuffle /
# shining-armor). Zero on milky-way, othalla or pegasus.

$KC delete pvc scratch-bulk-proof
```

> Proof 2 now expects a full **3 of 3**. An earlier revision of this file expected 1 of 3,
> because at the time there was exactly one worker and the degraded-availability valve was
> carrying the difference. Piece 19 gave the cluster four `bulk` nodes, so that interim
> caveat is retired — if you see fewer than 3 replicas here, it is a real problem, not the
> documented trade.

If either proof shows a replica landing somewhere it shouldn't, stop — something in Phases
1–4 didn't apply the way this document assumes, and it needs to be understood before
[13](13-stage-sgc-apps.md) or [20](20-low-power-tier.md) build on top of it.

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
  a separate mechanism layered on top. **Amended by
  [24-power-states.md](24-power-states.md):** not every Tier-1 application
  wants permanent CP residency — some float on a worker normally and
  relocate only during Battery mode. That pattern needs a *third* storage
  class, `longhorn-controlplane` (2 replicas, Longhorn zone anti-affinity
  across a `critical`/`bulk` zone split — a different mechanism from this
  piece's tag-based `nodeSelector`), which 24 specs. Out of scope here, same
  as the taint/affinity work.
- **Longhorn's `taint-toleration` setting.** No longer empty and no longer
  merely theoretical — it is set to `node-role.kubernetes.io/control-plane:NoSchedule`
  and stuck at `status.applied: false`. Still out of scope for this piece, but it is
  now a live gate on [20](20-low-power-tier.md); see *What still blocks piece 20*
  above for the evidence and the window it needs. The original note follows.
  It doesn't need to change until [20](20-low-power-tier.md) adds the `critical` taint
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

- [ ] `kubectl get sc` shows exactly one `(default)` class (`longhorn`) — re-confirms
      vault#113 is still fixed before building on top of it.
- [ ] All **7** nodes' `nodes.longhorn.io` show the expected tag: 3×`critical`
      (`milky-way`/`othalla`/`pegasus`), 4×`bulk`
      (`hard-hat`/`fluttershy`/`kerfuffle`/`shining-armor`). No node carries both.
- [ ] `longhorn-critical` StorageClass exists with `numberOfReplicas: "3"` and
      `nodeSelector: "critical"`.
- [ ] `kubectl -n longhorn-system get cm longhorn-storageclass -o jsonpath='{.data.storageclass\.yaml}'`
      contains `nodeSelector: "bulk"` — the Helm half of Phase 4 reconciled.
- [ ] `kubectl get sc longhorn -o jsonpath='{.parameters.nodeSelector}'` returns `bulk` —
      `longhorn-manager` actually recreated the class. **This is the check that catches a
      Phase 4 that landed in git and stalled in the cluster**; the previous one is not
      sufficient.
- [ ] `kubectl get pvc -A --field-selector status.phase=Pending` is empty after Phase 4 —
      nothing was stranded in the delete/create gap.
- [ ] Scratch-volume proof 1: `longhorn-critical` PVC gets exactly 3 replicas, one on each
      control plane, none on any worker.
- [ ] Scratch-volume proof 2: default-class PVC gets exactly 3 replicas, all on workers,
      none on any control plane.
- [ ] `talos/talconfig.yaml` (**this repo**, not `equestria-cluster`) carries
      `node.longhorn.io/default-node-tags` on all four annotation blocks, covering all 7
      nodes — the durable form, even though the live tags were set imperatively.
- [ ] The Group A/B volume list under *Which volumes get `longhorn-critical`* has been
      handed to whoever owns [13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md), and the
      Group B condition (20 vs 24 pod placement) is on
      [24](24-power-states.md)'s open-item list as answered-with-a-caveat rather than open.
- [ ] *(Does not gate this piece; gates [20](20-low-power-tier.md).)*
      `kubectl -n longhorn-system get settings.longhorn.io taint-toleration -o custom-columns=VALUE:.value,APPLIED:.status.applied`
      still reads `false`, and the volumes-detached window it needs is on someone's
      calendar.

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
- [24-power-states.md](24-power-states.md) — the three-state (Full/Low
  Power/Battery) model that adds `longhorn-controlplane` alongside this
  piece's two classes, and amends 20's placement model for float+relocate
  workloads.
- [vault#113](https://github.com/david-driscoll/vault/issues/113) — the
  two-default-StorageClasses fix this piece assumes is already live.
- [Expansion v2.1 §3.3–3.4](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583) —
  original design; §10 item 12 is the open question resolved above.
