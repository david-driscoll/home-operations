# 19 — Rotate equestria's control planes to workers (R)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). Depends on
[18 — SGC nodes join as control planes](18-sgc-nodes-join-control-plane.md) (etcd must already
be at 6 members) and [10 — drain safety](10-drain-safety.md) (every node must already be
provably drainable). Feeds [20 — low-power tier](20-low-power-tier.md), which taints the
surviving 3 control planes — this phase deliberately does **not** touch
`allowSchedulingOnControlPlanes`.

> **Status 2026-08-18 — one node of three done, then deliberately parked.**
>
> | node | state |
> |---|---|
> | `hard-hat` | **worker.** Drained, out of etcd, wiped, rejoined. `machinetype: worker`, no control-plane statics, uncordoned, stale role label removed |
> | `fluttershy` | control plane, untouched |
> | `kerfuffle` | control plane, untouched. Holds `postgres-1` (**primary**) and the most Longhorn replicas of any node |
>
> etcd is at 5 members (the 3 ex-SGC nodes plus fluttershy and kerfuffle), healthy, no alarms.
>
> **Why it is parked, and it is not the Step 6 gate.** The end state this phase produces —
> control plane entirely on `milky-way`/`othalla`/`pegasus` — puts etcd, the apiserver, the
> scheduler and the controller-manager on **4-core / 16 GiB** machines, replacing **16–20 core /
> 48–64 GiB** ones:
>
> | | cores | memory |
> |---|---|---|
> | fluttershy, kerfuffle | 20 | 64 GiB |
> | shining-armor | 20 | 48 GiB |
> | hard-hat | 16 | 48 GiB |
> | milky-way, othalla, pegasus | **4** | **16 GiB** |
>
> That is a 4× reduction in control-plane CPU, and it was never stated as a consequence anywhere
> in this plan. It needs an explicit decision before `fluttershy` and `kerfuffle` are rotated,
> because each rotation is a wipe-and-rejoin and is therefore expensive to undo. Three options,
> none yet chosen: continue as written and move Longhorn storage off the control planes; keep six
> control planes and rotate nobody; or invert the plan — rejoin `hard-hat` as a control plane and
> make the ex-SGC nodes workers.
>
> **Do not read the 2026-08-17 instability as evidence for that decision.** See the incident note
> below: it was a bad ethernet cable, not node sizing. Re-verified 2026-08-18: `ping -c 30`
> returns 0.0% loss to all three ex-SGC nodes, and the 50 `Ready` flaps still visible in a 24 h
> window are entirely inside the 08-17 incident — milky-way was then simply *out of the cluster*
> for ~22 h and rejoined etcd as a learner at 00:11 UTC on 08-19. There is no post-fix
> instability.
>
> **Resolved 2026-08-18 — David chose to continue, and to take the remaining two in the order
> `kerfuffle` then `fluttershy`** (the reverse of the order documented below; see "Why hard-hat,
> then fluttershy, then kerfuffle", which already flags either order as legitimate). The sizing
> arithmetic above is *not* the strongest argument against continuing, and it turned out not to
> be the operative one either — see the next section, which measures the thing that actually
> matters and records the recommendation that was not taken.

## The 2026-08-18 disk measurements — the real argument, and the road not taken

**Measured live 2026-08-18/19 against `admin@equestria`: 19 h of steady state, hourly samples,
deliberately excluding milky-way's rejoin window** (it was out of the cluster ~22 h and rejoined
etcd as a learner at 00:11 UTC, so its figures are not comparable and are omitted):

| node | etcd install disk | p50 fsync | p99 fsync (median) | p99 max |
|---|---|---|---|---|
| fluttershy | `PNY 500GB SATA` | **0.74 ms** | **3.86 ms** | 4.71 ms |
| kerfuffle | `PNY 500GB SATA` | **0.74 ms** | **3.97 ms** | 5.06 ms |
| othalla | `ShiJi 256GB M.2-NVMe` | 3.73 ms | 13.62 ms | 29.17 ms |
| pegasus | `ShiJi 256GB M.2-NVMe` | 3.74 ms | 13.77 ms | 26.73 ms |

etcd's own guidance is p99 WAL fsync **< 10 ms**. The two PNY SATA nodes pass it with better
than 2× margin; both ShiJi nodes fail it persistently. Variance across the 19 h is tiny, so this
is the hardware floor, not load noise — the ex-SGC drives are ~5× slower at the median than the
disks this phase replaces.

**This falsifies the "fixes vault#127 by construction" claim in the next section.** vault#127 was
a *contention* incident — an unconstrained `pulumi` workspace pod putting 71 % of its writes on
kerfuffle's `/var` — not the disk's floor. The floor is 0.74 ms. What removes that contention is
[20](20-low-power-tier.md)'s taint (dedicated control planes carrying no general workload), and
that works on **any** node set. This phase is claiming credit for 20's fix.

It also supersedes [17](17-nvme-replacement.md)'s counterweight ("fluttershy is worse than
milky-way right now — 18.3 ms fsync p99"), which came from a single 1 h window on 2026-08-13.
Over 19 h on 2026-08-18, fluttershy's p99 never exceeded 4.71 ms.

### Endurance — the part no piece had measured

| drive | host | written | % used | implied endurance | remaining at current rate |
|---|---|---|---|---|---|
| Samsung 990 EVO Plus | fluttershy | 113.9 TB | 12 % | ~950 TB | ~8.7 yr @ 262 GB/day |
| Samsung 990 EVO Plus | kerfuffle | 81.4 TB | 9 % | ~900 TB | — |
| ShiJi 256GB | milky-way | 32.1 TB | **51 %** | ~63 TB | — |
| ShiJi 256GB | othalla | 25.2 TB | **48 %** | ~53 TB | **~1.5 yr** @ 50 GB/day |
| ShiJi 256GB | pegasus | 36.7 TB | **53 %** | ~69 TB | **~1.8 yr** @ 50 GB/day |

The ShiJi drives carry roughly **1/18th** the write endurance of the estate's standard Samsung
and are already half consumed. Three identical drives, same batch, same age, wear within five
points of each other — and this phase's end state puts the **entire etcd quorum** on them. That
is one correlated wear-out, not three independent risks.

### The recommendation that was not taken

Recorded so the decision is legible later, not to relitigate it: the analysis recommended
**gating this phase on [17](17-nvme-replacement.md)** — swap the three ShiJi drives, then
continue. D6 (low-power on battery) is the real reason the small nodes must hold the control
plane, and it is untouched by the drive question; three cheap NVMes remove the only substantive
objection and preserve the design intact. The fallback was to hold at 5 control planes, which
costs nothing and keeps etcd spanning both disk classes so a ShiJi wear-out cannot take quorum.

**David chose to continue on the current drives.** The operative consequence to carry forward:
after this phase, [17](17-nvme-replacement.md) stops being an opportunistic nice-to-have and
becomes the single highest-value hardware item in the estate, because the whole quorum then sits
on drives with ~1.5–1.8 years of projected life that will expire together. It should be
re-scoped accordingly and the hardware issue actually opened (17's Action item 1, still not
done).

### On sizing — it is the weaker argument

`kube-apiserver` working set peaks at **3.2–4.2 GiB on every control plane regardless of node
size** (24 h max: fluttershy 4.07, kerfuffle 4.24, milky-way 3.91, othalla 3.84, pegasus 3.22 GiB)
— it is dominated by the watch cache, which does not scale with request share. The ex-SGC nodes
held ~9 GB available across the whole window at 33–43 % CPU. Going 5 apiservers → 3 raises
request handling, not cache. Tight, not fatal. The disks are the problem, and the 4-core /
16 GiB arithmetic in the status block above is not what should have driven the decision.

### Corrections to the README's hardware claims

- The **70–85 °C** figure attaches to the *Transcend `TS1TMTS425S` SATA data disks* (live:
  othalla 69 °C, pegasus 61 °C, kerfuffle 59 °C), **not** the etcd drives — the ShiJi NVMes run
  45–47 °C. The thermal concern belongs to Longhorn's disks, and therefore to
  [12](12-longhorn-critical-tier.md), not to etcd.
- The reallocated/pending sectors are on **`pegasus`** `sda` (1 reallocated + 1 pending) and
  **`milky-way`** `sda` (`Available_Reservd_Space` down to 88 %) — again the SATA data disks.
  othalla's `nvme0` still reads a flat **18 media errors**
  ([vault#95](https://github.com/david-driscoll/vault/issues/95)), unchanged since 2026-07-29.
- milky-way's `smartctl-exporter` pod sat in `ContainerCreating` with **no disk metrics at all**
  for its whole outage window, then recovered on its own during the 2026-08-18 verification.
  It is the one node whose disk health the README singles out, and it was the one node not being
  watched — worth an alert on exporter readiness.

## The 2026-08-17 milky-way incident — a hardware fault that reads exactly like resource exhaustion

Recorded because the misdiagnosis cost several hours and the symptom profile is genuinely
deceptive.

`milky-way` presented as a node buckling under load: its etcd health check failed every ~5
minutes (`context deadline exceeded`), it flapped `NotReady` nine times, its `longhorn-manager`
logged `i/o timeout` reaching the API service VIP, Longhorn drained it from 22 replicas to 2,
and rebuilds targeting it errored while identical rebuilds targeting `pegasus` succeeded. On a
4-core control plane also running etcd, apiserver, scheduler and Cilium, "it is out of CPU" is
the obvious reading. It was wrong.

The actual fault was **66% packet loss on one ethernet cable.** What ruled software out:

1. A reboot did not fix it.
2. A full wipe (STATE + EPHEMERAL) did not fix it — the loss persisted into maintenance mode,
   with no cluster software running at all.
3. `pegasus` and `othalla` — identical hardware, same switch — sat at 0% loss throughout.

After the cable was replaced: 0.0% loss over 30 packets, 5/5 clean Talos API probes, and etcd
`HEALTH: OK` stable across the rejoin where it had previously failed every 5 minutes.

**The lesson for the remaining nodes:** on a partially-connected node, every layer reports the
symptom in its own vocabulary — etcd says deadline exceeded, kubelet says NotReady, Longhorn says
i/o timeout, the scheduler says the node is unhealthy. None of them says "packet loss". Before
attributing that pattern to load, run `ping -c 30` against the node and against a sibling. It
takes ten seconds and would have saved this one.

A second, smaller trap from the same incident: `talosctl version --insecure` and
`talosctl shutdown --insecure` **print help text and exit 0** rather than erroring on the
unrecognised flag. Both were briefly read as success. `--insecure` is valid on `apply-config` and
`reset` only; a node in maintenance mode therefore cannot be shut down remotely at all.

## What this phase delivers

Equestria's three original control planes — **hard-hat**, **fluttershy**, **kerfuffle** — leave
etcd and rejoin as workers, one at a time: **6 → 3** members. shining-armor, already a worker,
is untouched. End state: **3 control planes (the ex-SGC trio: milky-way, othalla, pegasus) + 4
workers (hard-hat, fluttershy, kerfuffle, shining-armor)**.

This is the mirror image of [18](18-sgc-nodes-join-control-plane.md): Talos cannot demote a
control-plane node in place, so each node is wiped and reinstalled with a **worker** machine
config, exactly as 18 wiped each SGC node and reinstalled it as a **control-plane** config. The
mechanics are identical; only the target role and the direction of travel differ.

**Read this whole file before starting.** It assumes 18 has already completed and etcd is
sitting at 6 healthy members, but it does not assume you have read the vault#84 discovery
comments — the facts that matter are restated here, dated, and re-derived from the live cluster
and the repos, not copied from the July discovery text.

## Why now — this phase fixes vault#127 by construction

> **Superseded 2026-08-18 — this section's premise is false.** Measured over 19 h of steady
> state, the PNY SATA disks do 0.74 ms p50 / 3.9 ms p99 WAL fsync and the ShiJi NVMe that
> replaces them does 3.7 ms / 13.7 ms. vault#127's 5038 ms was write *contention*, not the
> disk's floor, and the thing that removes contention is [20](20-low-power-tier.md)'s taint,
> not this phase. Kept below as written because the rest of the section (which disk is where,
> why the Pulumi workspace pod landed on kerfuffle) is still accurate and still useful. See
> "The 2026-08-18 disk measurements" above.

[vault#127](https://github.com/david-driscoll/vault/issues/127) (opened 2026-08-02, open) found
that **fluttershy and kerfuffle's `/var/lib/etcd` lives on a slow PNY 500GB SATA SSD**, while
Longhorn gets the fast Samsung 990 EVO Plus NVMe on those same nodes. Under write pressure —
measured dominant cause: `pulumi/sgc-workspace-0`, unconstrained by any `nodeSelector`, landing
71% of its disk writes on kerfuffle — etcd backend-commit p99 goes from ~7ms to **5038ms**,
`coordination.k8s.io/leases` calls degrade to 10–26s, and every leader-electing controller in
the cluster (`postgres-operator`, `cilium-operator`, `kube-scheduler`, `kube-controller-manager`,
Longhorn/NFS CSI sidecars) starts losing its lease and crash-looping. Verified in
`talos/talconfig.yaml`:

```yaml
# hard-hat (line 125-126)
installDiskSelector:
  model: "KINGSTON SNV3S1000G"      # NVMe — not the #127 problem
# fluttershy (line 180) / kerfuffle (line 229)
installDisk: "/dev/sda"             # PNY SATA — the #127 problem, on BOTH nodes
```

vault#127's own proposed durable fix is a reinstall-in-place onto the Samsung NVMe with a
shrunk Longhorn volume. **This phase makes that fix unnecessary.** Once fluttershy and
kerfuffle leave etcd, `/var/lib/etcd` no longer exists on either PNY-SATA node — etcd's fsync
path becomes exclusively the three ex-SGC nodes, which install to NVMe
(`stargate-command-cluster` talconfig, verified during [18](18-sgc-nodes-join-control-plane.md)).
The interim mitigation vault#127 proposes (pin `Workspace` pods off fluttershy/kerfuffle) is
still worth landing independently and sooner, since it helps until this phase runs — but this
phase is the durable one, and it's already on the critical path.

The other reason this phase matters: today `allowSchedulingOnControlPlanes: true` is set
cluster-wide (verified in `talos/patches/controller/cluster.yaml:2`), so the
three control planes ALSO carry general workload — that's exactly how an unconstrained Pulumi
workspace pod ended up on kerfuffle's etcd disk in the first place. After this phase, the three
surviving control planes (ex-SGC) don't need to double as workers — equestria will have 4
dedicated worker nodes — which is what makes it safe for [20](20-low-power-tier.md) to taint
them. **This phase does not add that taint itself** — `allowSchedulingOnControlPlanes` stays
`true` through the end of this phase, because during the transition all 6 nodes are
simultaneously control planes and the cluster still needs their workload capacity. Tainting is
scoped entirely to 20, once only 3 CPs remain and 4 real workers exist to absorb what moves off.

## Preconditions — do not start until

- [ ] [18](18-sgc-nodes-join-control-plane.md) complete: etcd at 6 healthy members
      (hard-hat, fluttershy, kerfuffle, milky-way, othalla, pegasus), Cilium ready on all 7
      nodes, Longhorn rebuilt with **zero** degraded volumes.
- [ ] [10](10-drain-safety.md) complete: every node is provably drainable. The specific known
      trap — confirmed as the live failure mode for Talos maintenance on this exact node set —
      is a Longhorn instance-manager PodDisruptionBudget with 0 allowed disruptions blocking
      eviction when the node holds a volume's last healthy replica; 10 is what makes that
      untrue everywhere before this phase touches a node.
- [ ] A fresh `talosctl etcd snapshot` and a `talhelper genconfig` / `clusterconfig/` export,
      taken and stored off-box, immediately before the first node in this phase is touched.
- [ ] `mise run talos:validate-config` passes clean (validates every
      generated machine config against the pinned `talosVersion` before anything is applied).
- [ ] CNPG cluster `database/postgres` reports `Cluster in healthy state`, `readyInstances: 3`,
      and the `postgres` / `postgres-primary` PodDisruptionBudgets both exist (see below —
      their presence is what makes the per-node CNPG steps below safe to rely on).
- [ ] OpenBao reports 3/3 unsealed (`bao status` against `bao.equestria.driscoll.tech`, or the
      `openbao-sealed=false` label on all three `openbao-N` pods).
- [ ] No node in the 7-node pool carries a stale taint from an unrelated incident. As of
      2026-08-13, shining-armor's [vault#139](https://github.com/david-driscoll/vault/issues/139)
      (`TalosUpgradeFailed`, tainted since 2026-08-05) shows no live taint and a `Ready`
      condition since 2026-08-07T12:44Z — treat as resolved, but re-check rather than assume.

## Live-state snapshot — verified 2026-08-13, `admin@equestria` — re-verify at execution

Everything in this section is a live read from the cluster today, **before** phase 18 has run.
By the time this phase actually executes, 18 will have added milky-way/othalla/pegasus (6-7
node pool instead of 4), and [13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md) will have
changed what's scheduled where. **None of the specific placements below should be assumed true
at execution time** — they are here to (a) prove the mechanism this runbook relies on actually
behaves as described, and (b) give the exact commands to re-derive the same picture live,
immediately before each node's turn.

**Nodes today** (`kubectl get nodes -o wide`):

| Node | Role | Age | CPU model | Notes |
|---|---|---|---|---|
| hard-hat | control-plane | 156d | AMD (family 25, Zen-class), `amd.com/gpu` ×1 | `technitium-dns=true` node label |
| fluttershy | control-plane | 156d | Intel (family 6, Alder Lake-class), `i915` iGPU | |
| kerfuffle | control-plane | **38d** | same Intel silicon as fluttershy | recent rebuild — matches the discovery's "kerfuffle is 25 days old vs 143 for the others" note from ~2026-08-02 |
| shining-armor | worker | 156d | AMD, small iGPU passthrough | the cluster's only confirmed VM (see next section) |

**CNPG `database/postgres` instances** (`kubectl get pods -n database -l cnpg.io/cluster=postgres -o wide`):

| Pod | Role | Node |
|---|---|---|
| postgres-1 | replica | shining-armor |
| postgres-2 | **primary** | **kerfuffle** |
| postgres-3 | replica | hard-hat |

Note there is **no instance on fluttershy today**. `cluster.affinity.podAntiAffinityType:
required` (`kubernetes/apps/database/postgres/app/resources/values.yaml:73-75`) only forbids two
instances on the same node — it says nothing about which node a freshly re-provisioned instance
lands on, so don't assume a `cnpg destroy` on this snapshot would land the replacement on
fluttershy specifically; that's the scheduler's call given whatever the pool looks like that
day.

**OpenBao** (`kubectl get pods -n kube-system -l app.kubernetes.io/name=openbao -o wide`):

| Pod | State | Node |
|---|---|---|
| openbao-0 | standby | shining-armor |
| openbao-1 | standby | fluttershy |
| openbao-2 | **active** | **hard-hat** |

All three on different nodes today, by scheduler luck, not by a `nodeSelector` —
`kubernetes/apps/kube-system/openbao/helmrelease.yaml` sets no explicit `server.affinity` or
`topologySpreadConstraints`. **Never assume the spread holds; re-check it immediately before
cordoning any node.** OpenBao's own state is not the risk (`dataStorage.enabled: false` — no
PVC, everything lives in the `database/postgres` CNPG cluster under `table =
"openbao_kv_store"` / `ha_table = "openbao_ha_locks"`, confirmed in
`kubernetes/apps/kube-system/openbao/helmrelease.yaml:109-114`); the risk is momentary
unavailability if you take out the active instance while the other two are unexpectedly
unhealthy.

**PodDisruptionBudgets that gate every step below** (`kubectl get pdb -A`):

| PDB | Namespace | minAvailable / maxUnavailable | Allowed disruptions today |
|---|---|---|---|
| `postgres` | database | minAvailable 1 | 1 |
| `postgres-primary` | database | minAvailable 1 | **0** |
| `openbao` | kube-system | maxUnavailable 1 | 1 |

`postgres-primary` allowing **zero** disruptions is why the runbook below promotes before it
destroys, rather than destroying whichever instance happens to be primary — a plain `kubectl
drain` would simply refuse to evict the primary pod, so a planned switchover has to happen
first regardless.

## Correction to the discovery record — hard-hat's VM status is not settled

The July discovery text and this phase's own ordering guidance both assume **hard-hat is a
Proxmox VM** ("best rollback"). Live evidence is mixed, and worth resolving against the Proxmox
host directly before relying on it:

- **For "VM":** hard-hat's NIC (`talconfig.yaml:166`, `bc:24:11:11:7d:6a`) carries the
  `bc:24:11` OUI, which is Proxmox's registered virtio-net prefix — the same prefix
  shining-armor uses, and shining-armor is unambiguously a VM (see below).
- **Against "VM":** live node labels report
  `feature.node.kubernetes.io/cpu-model.hypervisor=none` for hard-hat, hard-hat's schematic
  (`talconfig.yaml:155-162`) does not include `siderolabs/qemu-guest-agent`, and neither
  `extensions.talos.dev/qemu-guest-agent` nor `cpu-cpuid.HYPERVISOR=true` appears in its node
  labels.
- **shining-armor, by contrast, is unambiguous:** `bc:24:11` MAC, `cpu-model.hypervisor=kvm`,
  `cpu-cpuid.HYPERVISOR=true`, `extensions.talos.dev/qemu-guest-agent` present, and
  `siderolabs/qemu-guest-agent` in its talconfig schematic — every signal agrees.

The most likely explanation is that hard-hat **is** a Proxmox VM with the hypervisor CPUID bit
deliberately hidden — a common Proxmox setting (`args: -cpu ...,hv_vendor_id=...` /
hidden-KVM-leaf) used specifically for AMD GPU passthrough, which hard-hat does
(`amd.com/gpu`). That's plausible but not confirmed from repo or `kubectl` evidence alone.
**Verify directly against the Proxmox host inventory before starting this phase.** It doesn't
change the prescribed order below (hard-hat still goes first — see next section for the
corrected reasoning), but if hard-hat turns out to be bare metal, the "snapshot and restore in
minutes" rollback path doesn't exist and the per-node reversibility procedure (reinstall from
talconfig) is the only rollback for all three nodes, not just two of them.

## Why hard-hat, then fluttershy, then kerfuffle

The order is fixed by the task, but the justification in the discovery text needs correcting
given the above: if hard-hat's VM status isn't confirmed, "best rollback" isn't the reason to
go first. The reason that **does** hold regardless of hard-hat's VM status:

- **hard-hat is not a vault#127 node.** Its etcd disk is the Kingston NVMe, not the PNY SATA.
  Rotating it first validates the wipe → worker → rejoin mechanism on a node whose disk was
  never the problem — if the *procedure* misfires, you haven't touched either of the two nodes
  actually causing #127.
- fluttershy and kerfuffle are the two PNY-SATA nodes. Doing them second and third means
  vault#127's root cause (etcd fsync contention) persists for two more rotation cycles after
  hard-hat's — acceptable, because the 6-member etcd tolerates 2 node failures throughout (see
  the quorum table below), and #127's own interim mitigation (pin Pulumi workspace pods off
  fluttershy/kerfuffle) should already be landed independently before this phase starts,
  reducing the write pressure regardless of order.
- kerfuffle last: it's the node with the least production history at this specific disk
  (38 days since its last full rebuild versus 156 for the other two) — going last gives the
  procedure two prior clean runs before touching the newest unknown.

If minimizing vault#127 exposure time is judged more valuable than a clean dry run, doing
fluttershy or kerfuffle first is a legitimate alternative — either order fixes #127 completely
by the end of this phase. This document follows the assigned order (hard-hat, fluttershy,
kerfuffle) and flags the alternative rather than silently relitigating it.

## The stateful-singleton problem — why this is not just a drain

`database/postgres`'s PVCs use the `longhorn-local` StorageClass —
`cluster.storage.storageClass: longhorn-local`
(`kubernetes/apps/database/postgres/app/resources/values.yaml:64`). That StorageClass is
`dataLocality: strict-local` with `numberOfReplicas: 1`: **each CNPG instance's data exists on
exactly one node, full stop.** A normal Kubernetes drain reschedules the *pod*; it cannot move
the *data*, because there is no second copy anywhere else for the new pod to attach to. Cordon
and drain a node holding a `postgres-N` instance without relocating it first, and that instance
just goes permanently `Pending` — CNPG will not conjure a replacement without the operator being
told to (`kubectl cnpg destroy`), and manually deleting the PVC is explicitly the wrong move
(estate-standard trap — see `MEMORY: CNPG replica recovery`).

Contrast with `valkey` in the same namespace, which the estate deliberately runs with
**best-effort** data locality (3 replicas, no pinning) specifically so its pods can move freely
during node maintenance — the comment in
`kubernetes/apps/database/valkey/helmrelease.yaml:50` says as much. `database/postgres` is the
one workload in equestria that does not get that freedom, and it is the only CNPG `Cluster`
resource in the repo (`grep -rl "kind: Cluster" kubernetes/` confirms exactly one). This is the
entire reason this phase needs an explicit "move the singleton first" step instead of a plain
`kubectl drain --ignore-daemonsets`.

OpenBao is the opposite case and needs no such step: `dataStorage.enabled: false`, no PVC, all
state in the shared CNPG cluster. An OpenBao pod on a node being wiped simply gets evicted and
rescheduled elsewhere by the StatefulSet controller — the only care needed is confirming 3/3
health and the PDB's headroom *before* cordoning, not relocating anything by hand.

## The runbook — repeat once per node, in order

> **Command-runner note, 2026-08-18.** The tree consolidated into `home-operations`
> ([21](21-repo-consolidation-flux-repoint.md)) and go-task was replaced by mise. Every task
> below is now `mise run talos:<task> <ip>` from the **repo root** — not `task talos:… IP=…`
> from `equestria-cluster/talos/`. `generate-config` was renamed `genconfig`. Definitions
> live in `.config/mise/tasks/talos/`. `talos:reset-node` carries a `#MISE confirm` prompt.

Run this block for hard-hat, then fluttershy, then kerfuffle. Do not start the next node until
the current node's Step 6 gate passes.

### Step 0 — pre-flight, this node

```bash
# etcd healthy, 6 members (or whatever the current phase-19 count is)
talosctl -n <any-healthy-cp-ip> etcd status
talosctl -n <any-healthy-cp-ip> etcd members

# CNPG cluster healthy, 3/3 ready
kubectl get cluster postgres -n database
kubectl get pods -n database -l cnpg.io/cluster=postgres -o wide

# OpenBao 3/3 unsealed
kubectl get pods -n kube-system -l app.kubernetes.io/name=openbao \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,SEALED:.metadata.labels.openbao-sealed,ACTIVE:.metadata.labels.openbao-active

# Longhorn: zero degraded volumes anywhere in the pool
kubectl get volumes.longhorn.io -n longhorn-system \
  -o custom-columns=NAME:.metadata.name,STATE:.status.state,ROBUSTNESS:.status.robustness \
  | grep -v Healthy
```

Abort and fix before proceeding if any of the above is not clean. Take the etcd snapshot for
this specific node's turn if the one from the phase-level precondition is more than a
maintenance window old.

### Step 1 — relocate the stateful singletons off this node

**CNPG**, only if this node currently hosts a `postgres-N` instance (re-check placement live —
do not trust the table above):

```bash
kubectl get pods -n database -l cnpg.io/cluster=postgres \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,ROLE:.metadata.labels.role
```

- If the instance on this node is a **replica**: cordon the node first (so the replacement
  can't land right back on it), then destroy it.
  ```bash
  kubectl cordon <node>
  kubectl cnpg destroy postgres <instance-ordinal>
  # wait for the replacement to rejoin and stream
  kubectl get cluster postgres -n database -w
  ```
- If the instance on this node is the **primary** (this is why `postgres-primary`'s PDB exists
  — it will block a plain eviction): promote a healthy replica first, *then* treat the old
  primary like any other replica.
  ```bash
  kubectl cnpg promote postgres <replica-ordinal>   # planned switchover
  kubectl get cluster postgres -n database -w        # wait for the new primary to settle
  kubectl cordon <node>
  kubectl cnpg destroy postgres <old-primary-ordinal>
  ```
- Confirm `readyInstances: 3` and all three `role` labels look correct before moving on. Do
  **not** manually delete the PVC at any point in this step — that breaks the recovery path
  this exact sequence exists to avoid (see `MEMORY: CNPG replica recovery`).

**OpenBao**, always:

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=openbao \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,ACTIVE:.metadata.labels.openbao-active
```

No relocation action is needed — confirm 3/3 healthy (already checked in Step 0) and note
whether this node holds the **active** instance. If it does, expect an active/standby failover
to a healthy standby during the drain in Step 3; re-check the `openbao-active` label lands on a
different pod before calling this node's turn complete. Do not proceed if fewer than 3/3 are
healthy going in — the `openbao` PDB's `maxUnavailable: 1` means a second concurrent
unavailability will block eviction outright.

**hard-hat only — Technitium DNS:** hard-hat carries the node label `technitium-dns: "true"`
and Technitium is pinned to it via `nodeSelector` for macvlan/`enp2s0` reasons
(`kubernetes/apps/equestria/dns/technitium/helmrelease.yaml:154-155`), single replica, no
failover pod. Confirm another DNS path is answering (split-horizon secondary, UniFi's own
resolver, whatever the estate's current fallback is) before cordoning hard-hat — DNS goes
unavailable from this replica for the duration of the wipe and comes back once hard-hat rejoins
as a worker with the same label (the label is regenerated from `talconfig.yaml`'s `nodeLabels`
on every `talhelper genconfig`, so it survives the role change without manual reapplication).

### Step 1b — evict the node's Longhorn replicas BEFORE wiping it

**Added 2026-08-17, after running Step 1 on hard-hat without it.** The runbook as written goes
straight from relocating the CNPG singleton to draining and wiping. That leaves every ordinary
Longhorn replica on the node to be *rebuilt from surviving copies* after the wipe. Longhorn has a
first-class way to avoid that, and it is strictly better:

```bash
kubectl -n longhorn-system patch nodes.longhorn.io <node> \
  --type merge -p '{"spec":{"evictionRequested":true}}'
# watch it drain
kubectl -n longhorn-system get replicas.longhorn.io -o json \
  | jq -r '[.items[]|select(.spec.nodeID=="<node>")]|length'
```

| | wipe first (what hard-hat got) | evict first |
|---|---|---|
| replicas | rebuilt from surviving copies, under time pressure | copied off while the source is still healthy and readable |
| redundancy | drops for the duration | never drops |
| second-fault exposure | real, and the window is long | none — the node is empty before anything destructive |

hard-hat's wipe put **~100 replicas** into rebuild and the backlog was still draining well over an
hour later, oscillating between 9 and 17 degraded volumes as workloads churned. kerfuffle holds
**112** — the most of any node — so the difference is not marginal.

Capacity must exist before requesting eviction (`allowScheduling: true` and free space on enough
other nodes to satisfy `replica-soft-anti-affinity: false`, i.e. one replica per node). Check
first; an eviction that cannot place replicas stalls rather than failing loudly.

**Do not confuse this with `allowScheduling: false`.** That only stops *new* replicas landing;
it does not move the existing ones.

### Step 1c — the stuck-detach chain after `cnpg destroy`

`kubectl cnpg destroy` leaves a four-link chain that pins the old replica to the node and blocks
the drain. Every link has to clear, and none of it is obvious from the drain's error:

```
Longhorn attachment ticket  →  CSI VolumeAttachment  →  PV finalizers  →  replica pinned
```

Symptoms, in the order you meet them:

- the old PV sits `Released` with `reclaimPolicy: Delete` and never reclaims
- `kubectl delete pv` is accepted, then hangs — the PV goes `Terminating` and stays
- the PV's finalizers include `external-attacher/driver-longhorn-io`
- a `volumeattachment` still exists for it with `attached=true`, on the node being drained
- `volumes.longhorn.io` shows `state: attached`, `spec.nodeID: <node>`
- and `volumeattachments.longhorn.io` holds an **attachment ticket** named for that CSI
  VolumeAttachment, which re-asserts `nodeID` if you clear it

Clearing the CSI VolumeAttachment and the Longhorn `spec.nodeID` together resolves it; the ticket
goes with them. Confirm the volume is genuinely stale first — the destroyed instance's PVC is
replaced by a *new* PV with the same claim name, so check `creationTimestamp` and which PV the
live PVC is bound to before deleting anything.

### Step 2 — remove the node from etcd

```bash
# graceful, from the node itself, while it's still reachable
talosctl -n <node-ip> etcd leave

# if the node is already unreachable, force it from a healthy peer instead
talosctl -n <healthy-cp-ip> etcd members
talosctl -n <healthy-cp-ip> etcd remove-member <member-id-of-target>
```

Confirm the member count dropped by one and the remaining members report healthy before
continuing.

### Step 3 — drain

```bash
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
```

This is where [10](10-drain-safety.md)'s precondition pays off. If the drain hangs, check
Longhorn instance-manager PDBs on this node first — a PDB with 0 allowed disruptions on a node
holding a volume's last replica is the estate's confirmed failure mode for this exact class of
maintenance, not a CNPG or Cilium problem. Confirm with the volume's replica list before
deleting anything.

**Do not delete the PDB (corrected 2026-08-17).** On hard-hat both instance-manager PDBs still
read `allowed=0` *after* its last replica was relocated, which looks like the blocker and invites
deleting them. It is a lag, not a lie: Longhorn recalculates once the last-replica condition
clears, and the drain then evicted both instance-manager pods with no intervention. Fix the
replica situation and wait; reach for the PDB only if the drain is still blocked once the node
provably holds no last replicas.

**Judge "last replica" by `failedAt`, not by state.** A replica whose disk has died still reports
`currentState: running` while carrying a `failedAt` timestamp. Counting running replicas alone
will tell you a node holds the only copy of something when two healthy copies exist elsewhere —
it produced exactly that false alarm on pegasus. The correct test is replicas with an empty
`spec.failedAt`.

### Step 4 — wipe

```bash
mise run talos:reset-node <node-ip>
```

This runs, from `talos/`, `talhelper gencommand reset --node <ip> --extra-flags="--reboot
--system-labels-to-wipe STATE --system-labels-to-wipe EPHEMERAL --graceful=false --wait=false"`
— wipes the STATE and EPHEMERAL partitions and reboots into maintenance mode. Note
`--graceful=false` here: this step does **not** remove the node from etcd on its own, which is
exactly why Step 2 has to happen first and separately.

### Step 5 — flip the role and rejoin as a worker

In `talos/talconfig.yaml`, change this node's entry:

```yaml
controlPlane: false   # was: true
```

Then regenerate, validate, and apply:

```bash
mise run talos:genconfig
mise run talos:validate-config
mise run talos:add-node <node-ip>
```

`talos:add-node` runs `talhelper gencommand apply --node <ip> --extra-flags '--insecure
--mode=auto'` (mise prompts for confirmation on `reset-node`; `--mode` defaults to `auto`) — the same task used to bring a genuinely new node into the cluster, appropriate
here because the node is in maintenance mode with no existing certs after Step 4. Talos cannot
demote a control-plane node in place; this wipe-and-rejoin is the only path, mirroring exactly
how [18](18-sgc-nodes-join-control-plane.md) promoted the SGC nodes in the other direction.

### Step 6 — verify before the next node

```bash
kubectl get nodes <node> -o wide          # Ready, role now <none> (worker)
kubectl uncordon <node>                    # the join does NOT clear the Step 1 cordon
# Kubernetes keeps the old role label regardless of what Talos rejoined as:
kubectl label node <node> node-role.kubernetes.io/control-plane-
# confirm the demotion from Talos, not from the label:
talosctl -n <node-ip> get machinetype     # must read: worker
talosctl -n <any-cp-ip> etcd members       # member count as expected, all healthy
cilium status --wait                       # Cilium ready cluster-wide
kubectl get volumes.longhorn.io -n longhorn-system \
  -o custom-columns=NAME:.metadata.name,ROBUSTNESS:.status.robustness | grep -v Healthy
```

Do not start the next node until: etcd is healthy, Cilium is ready on every node, and Longhorn
reports **zero** degraded volumes. This is the same gate used throughout the plan (see the
cross-cutting rules in the [README](README.md)) — a full-cluster restart or a rushed sequence
has previously produced the Cilium-not-ready → instance-manager `OutOfcpu` → Longhorn/CNPG
wedge cascade that ended in a physical power-cycle on SGC. If a node comes back wrong, check
nodes and taints first, not CNPG.

## Per-node reversibility

If Step 5's worker join fails — the node won't come up, kubelet won't register, whatever — the
recovery is symmetric and does not touch the other nodes or quorum:

1. Flip `controlPlane` back to `true` for this node in `talconfig.yaml`.
2. `mise run talos:genconfig && mise run talos:validate-config`
3. `mise run talos:reset-node <node-ip>` (wipe again)
4. `mise run talos:add-node <node-ip>` (rejoins as a control plane, same as it was)
5. Confirm it re-enters etcd and Longhorn rebuilds cleanly, then decide whether to retry the
   worker rotation or pause and investigate.

Nothing about this touches the other 5 (or however many remain) nodes. The only thing that was
ever irreversible in the surrounding plan is wiping the *second* SGC node in
[18](18-sgc-nodes-join-control-plane.md) — this phase has no equivalent hard point of no
return.

## Quorum across this phase

| Step | Etcd members | Quorum | Tolerates |
|---|---|---|---|
| Start (end of 18) | 6 (hard-hat, fluttershy, kerfuffle, milky-way, othalla, pegasus) | 4 | 2 failures |
| hard-hat leaves | 5 | 3 | 2 failures |
| hard-hat rejoins as worker | 5 (unchanged — workers aren't etcd members) | 3 | 2 failures |
| fluttershy leaves | 4 | 3 | 1 failure |
| fluttershy rejoins as worker | 4 | 3 | 1 failure |
| kerfuffle leaves | 3 | 2 | 1 failure |
| kerfuffle rejoins as worker | 3 (final) | 2 | 1 failure |

The safety margin narrows as the phase progresses — 2-failure tolerance at the start, down to
1-failure tolerance by the end — which is exactly why Step 6's gate (etcd healthy + Cilium
ready + Longhorn zero-degraded) matters more on kerfuffle's turn than on hard-hat's, and why
each node's turn should not start until the previous one is fully settled, not just "probably
fine."

## End state

- **3 control planes:** milky-way, othalla, pegasus (all ex-SGC, all NVMe-backed etcd) — to be
  tainted in [20](20-low-power-tier.md), not here.
- **4 workers:** hard-hat, fluttershy, kerfuffle, shining-armor.
- `allowSchedulingOnControlPlanes: true` is unchanged — still needed by the surviving 3 CPs
  until 20 gives them dedicated worker capacity to hand workload off to.
- [vault#127](https://github.com/david-driscoll/vault/issues/127) is fixed by construction:
  `/var/lib/etcd` no longer exists on either PNY-SATA node, because neither node runs etcd
  anymore.

## Verification checklist

- [ ] `talosctl etcd members` shows exactly milky-way, othalla, pegasus.
- [ ] `kubectl get nodes` shows hard-hat, fluttershy, kerfuffle, shining-armor with no
      `node-role.kubernetes.io/control-plane` label.
- [ ] `kubectl get cluster postgres -n database` reports `readyInstances: 3`, healthy, no
      instance pinned to a node that no longer exists.
- [ ] OpenBao 3/3 unsealed, `bao status` clean against `bao.equestria.driscoll.tech`.
- [ ] Technitium DNS pod is `Running` on hard-hat with the `technitium-dns=true` label intact.
- [ ] Longhorn: zero degraded volumes across the full 7-node pool.
- [ ] No stray taints left over from a failed intermediate attempt on any of the three nodes.
- [ ] A fresh `talosctl etcd snapshot` taken and stored off-box at the new 3-member state.

## Open questions carried into this phase

- Node ordering (this file follows hard-hat → fluttershy → kerfuffle per the assigned task; see
  "Why hard-hat, then fluttershy, then kerfuffle" above for the corrected rationale and the
  legitimate alternative).
- hard-hat's actual VM/bare-metal status is not conclusively resolved from repo or `kubectl`
  evidence alone (see the correction section above) — confirm against the Proxmox host before
  relying on a VM-snapshot rollback path for that node specifically.
- The interim vault#127 mitigation (pin Pulumi `Workspace` pods off fluttershy/kerfuffle via
  `spec.podTemplate.spec.nodeSelector` in the Pulumi repo) is independent of this phase and
  should land regardless of when this phase executes — it reduces exposure while fluttershy and
  kerfuffle are still control planes, whichever order they rotate in.

## References

- [README.md](README.md) — full plan, decision ledger, sequencing
- [10-drain-safety.md](10-drain-safety.md) — the drainability precondition this phase depends on
- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — Longhorn node tags used from 20 onward
- [18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) — the mirror-image
  phase this one reverses; the 6-member starting state
- [20-low-power-tier.md](20-low-power-tier.md) — tints the surviving 3 CPs; out of scope here
- `talos/talconfig.yaml` — node definitions, install disks, `controlPlane`
  flags
- `talos/patches/controller/cluster.yaml` — `allowSchedulingOnControlPlanes`
- `.config/mise/tasks/talos/` — `reset-node` / `add-node` / `generate-config` / `validate-config` tasks used throughout the runbook
- `kubernetes/apps/database/postgres/app/resources/values.yaml` — CNPG
  `storageClass: longhorn-local`, `podAntiAffinityType: required`, instance count
- `kubernetes/apps/kube-system/openbao/helmrelease.yaml` — OpenBao HA
  replicas, Postgres storage backend, disruption budget
- [vault#127](https://github.com/david-driscoll/vault/issues/127) — the etcd/PNY-SATA issue this phase fixes
- [vault#139](https://github.com/david-driscoll/vault/issues/139) — shining-armor taint history, checked clear as of 2026-08-13
