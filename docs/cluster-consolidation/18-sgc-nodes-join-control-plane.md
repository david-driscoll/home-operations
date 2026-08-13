# 18. SGC nodes join the control plane (Q)

**Contains the estate's only hard point of no return in this entire migration.**

**Pre-gate:** cannot start until [16 — soak and gate](16-soak-and-gate.md) has passed in
full — every migrated SGC app healthy on equestria, verified restores done, SGC idle, a final
etcd snapshot and machine-config export of SGC taken. This piece assumes that gate is green
and re-checks the parts of it that decay with time (see below).

**Depends on:** [10 — Drain safety](10-drain-safety.md) (all seven nodes provably drainable)
and [11 — VolumeSnapshotContents trim](11-volumesnapshotcontents-trim.md) (apiserver object
churn reduced before the control plane grows and moves toward smaller-memory nodes).
**Feeds:** [19 — Rotate equestria control planes](19-rotate-equestria-control-planes.md)
(6→3), which must not start until this piece's exit criteria hold on all seven nodes, and
[12 — Longhorn critical tier](12-longhorn-critical-tier.md), which tags the *final*
control-plane trio only after 19 finishes.
**Risk inherited from:** [17 — NVMe replacement (deferred)](17-nvme-replacement.md).

## What this piece does

Dissolves SGC. Its three control-plane nodes — milky-way, othalla, pegasus — leave SGC one at
a time, get wiped, and rejoin **equestria** as additional control planes, taking equestria's
etcd from 3 members to 6. They keep their `10.10.209.x` addresses; **no CIDR or L2 change is
required.** Cilium runs native routing (`routing-mode=native`, `auto-direct-node-routes=true`)
on both clusters today, over a flat `10.10.0.0/16` L2 — every node, regardless of cluster,
sits on one broadcast domain. Once a joining node is `Ready`, equestria's existing
`cilium-agent` DaemonSet simply schedules onto it like any other node, and
`kube-controller-manager` allocates its pod CIDR block from equestria's existing
`10.206.0.0/16` pool. This was verified directly during discovery (both clusters' Cilium
config compared key-for-key) and nothing since has changed it.

By the end of this piece: **equestria has 6 control planes (its original hard-hat, fluttershy,
kerfuffle, plus milky-way, othalla, pegasus) and 4 workers (shining-armor, until
[19](19-rotate-equestria-control-planes.md) rotates the other three in)**. SGC as a cluster
ceases to exist — its `admin@sgc` kubeconfig context becomes unusable once the last node
leaves. Retiring SGC's DNS/VIP/Pulumi stack/repo is **not** this piece's job; that's
[22 — Decommission SGC](22-decommission-sgc.md).

## Versions — re-verify immediately before starting

At discovery (2026-07-30) both clusters ran Talos 1.13.7 / Kubernetes 1.36.3. **Live-checked
today (2026-08-13): both clusters are on Talos v1.13.8 / Kubernetes v1.36.3** — still equal,
one patch ahead of discovery on both sides in lockstep ([tuppr](https://github.com/home-operations/tuppr)
manages upgrades on both trees):

```
$ kubectl --context admin@equestria get nodes -o wide   # OS-IMAGE / VERSION columns
$ kubectl --context admin@sgc       get nodes -o wide
```

**Re-run this check immediately before starting the node sequence below, not just once at
planning time.** If the two clusters have drifted apart by execution time, resolve it through
tuppr *first* — upgrade whichever side lags to match — rather than letting a wipe-and-reinstall
silently carry one node to a different version than its new siblings. **Do not interleave a
Talos or Kubernetes upgrade with the membership changes in this piece**; this piece assumes
the fleet is already homogeneous when the per-node sequence starts.

## The etcd-substrate risk

Inherited from [17](17-nvme-replacement.md), which is deferred: all three joining nodes still
install to a no-name **ShiJi 256GB M.2-NVMe** (`/dev/nvme0n1`), measured today at 15.8–30.3 ms
p99 WAL fsync / 28.7–52.9 ms p99 backend commit — over etcd's own <10 ms / <25 ms guidance on
all three, stable rather than worsening (cross-referenced against
[vault#95](https://github.com/david-driscoll/vault/issues/95)'s flat 18-media-errors reading
on othalla).

The receiving side isn't clean either: **fluttershy and kerfuffle currently run etcd on a PNY
500GB SATA SSD**, not the Samsung NVMe ([vault#127](https://github.com/david-driscoll/vault/issues/127),
open, unfixed) — measured as bad as 5038 ms commit p99 under load, and 18.3 ms / 46.1 ms p99
fsync/commit live today on fluttershy alone. See [17](17-nvme-replacement.md) for the full
comparison and numbers.

**Practical consequence for this piece:** at every membership change below, watch — don't just
check once and move on:

```promql
histogram_quantile(0.99, sum(rate(etcd_disk_wal_fsync_duration_seconds_bucket{cluster="equestria"}[10m])) by (le, instance))
histogram_quantile(0.99, sum(rate(etcd_disk_backend_commit_duration_seconds_bucket{cluster="equestria"}[10m])) by (le, instance))
increase(etcd_server_leader_changes_seen_total{cluster="equestria"}[30m])
```

**Stop and do not proceed to the next node if:** any member's p99 fsync climbs past roughly
30 ms *sustained* (othalla's own resting baseline today — treat a merged cluster matching or
exceeding the worse of the two source substrates as a regression, not a wash), or leader
changes start incrementing beyond the isolated baseline (0 in 24 h on SGC, 1 in 24 h on
equestria, both live-checked today) during or after a join. A join is a burst of writes —
snapshot transfer plus catch-up — which is exactly the load pattern that has already taken
equestria's apiserver down for hours in vault#127.

## Talconfig mechanics

Verified against `equestria-cluster/talos/talconfig.yaml` and
`stargate-command-cluster/talos/talconfig.yaml` (both current as of this writing). Talhelper
generates one machine config per `nodes[]` entry from a single template file; adding a node is
an edit to that list, not a new tool or process.

equestria's cluster-level settings are untouched by this piece:

```yaml
endpoint: https://10.10.206.201:6443     # unchanged
clusterPodNets: ["10.206.0.0/16"]        # unchanged — kube-controller-manager allocates
clusterSvcNets: ["10.196.0.0/16"]        #   the new nodes' pod CIDRs from this range
```

Each of the three joining nodes gets a new entry under `nodes:`, modeled on SGC's own current
entries — their hardware and network identity don't change, only which cluster's config they
run:

| Field | Value | Notes |
|---|---|---|
| `hostname` | `milky-way` / `othalla` / `pegasus` | unchanged |
| `ipAddress` | `10.10.209.10` / `.11` / `.12` | unchanged — kept per this migration's IP-preservation decision; no renumbering |
| `installDisk` | `/dev/nvme0n1` | unchanged (the ShiJi NVMe — see [17](17-nvme-replacement.md)); device-path selector means a later drive swap needs no config edit |
| `controlPlane` | `true` | new *cluster*, same role — SGC ran these as control planes too |
| `userVolumes` (Longhorn) | `diskSelector: match: disk.model == "TS1TMTS425S"`, `/dev/sda`, 1 TB | port from SGC's config; equestria selects Longhorn disks by *model*, SGC by *dev_path* — use equestria's model-based pattern for consistency with its three existing control planes |
| `nodeLabels` / `nodeAnnotations` | Longhorn `default-disks-config` at `/var/mnt/longhorn` | **decision point:** SGC tags this disk `["ssd"]`; equestria's convention is `["nvme", "ssd"]`. Recommend adopting equestria's tagging for consistency across the merged pool — confirm before generating config. |
| `schematic` | `siderolabs/i915`, `intel-ucode`, `iscsi-tools`, `util-linux-tools` | the same extensions equestria already runs successfully on fluttershy/kerfuffle for the same `i915` iGPU class |
| `networkInterfaces` | existing MACs (`e0:51:d8:19:93:18` / `e0:51:d8:19:d4:98` / `e0:51:d8:19:d2:b2`), static `10.10.209.1x/16`, gateway `10.10.0.1`, mtu 1500 | unchanged — hardware property, survives the wipe |
| `vip.ip` | **`10.10.206.201`** | **must change.** This is equestria's VIP, not SGC's old `10.10.209.201`. Getting this wrong is the single easiest mistake in this step: a node configured with the old VIP will never agree with its new siblings on where the apiserver lives. |

**One decision this piece surfaces and does not resolve on your behalf.** SGC's current
schematic also carries `extraKernelArgs` that reduce security for performance (`apparmor=0`,
`mitigations=off`, `security=none`, `talos.auditd.disabled=1`, `init_on_alloc=0`,
`init_on_free=0`), plus `intel_iommu=on` / `iommu=pt` / `i915.enable_guc=3`. **equestria's
fluttershy and kerfuffle run the identical `siderolabs/i915` extension today with no
`extraKernelArgs` block at all** — so none of those flags are a requirement of the extension
itself; they're SGC-specific tuning. Recommend dropping the security-reduction flags for nodes
that are about to host etcd and the apiserver in a cluster that doesn't run that way anywhere
else. Confirm before generating config — this is a judgment call the repos don't settle for
you.

Global and control-plane patches (`machine-files.yaml`, `machine-kubelet.yaml`,
`machine-network.yaml`, `machine-sysctls.yaml`, `machine-time.yaml`, `machine-registries.yaml`,
and `controller/cluster.yaml` with `allowSchedulingOnControlPlanes: true`,
`controller/machine-rbac.yaml`) are file-list patches applied to every node in `talconfig.yaml`
automatically — nothing extra to wire up per node. `controller/cluster.yaml` is byte-identical
between the two repos today (etcd `election-timeout: 5000`, `quota-backend-bytes: 4Gi`), so
the joining nodes' etcd tuning doesn't change either.

## Per-node sequence — repeat exactly three times: milky-way → othalla → pegasus

**One node fully in and verified before starting the next.** This isn't a convenience rule —
it's how equestria's etcd quorum survives every step, and how the documented Cilium
zombie-node cascade (a node boots not-Ready → its instance-manager goes `OutOfcpu` → Longhorn
and CNPG wedge behind it → physical power-cycle required) stays a known failure mode instead
of a recurrence.

### Step A: remove from SGC

1. Confirm the [16](16-soak-and-gate.md) gate is still green for *this specific node's*
   moment: SGC's Flux tree suspended; the four migrated apps — chrony, mosquitto, tsidp,
   home-assistant (see [15](15-migrate-apps.md); **not** authentik, which already moved to
   alpha-site in [07](07-authentik-to-alpha-site.md) and is out of this migration's blast
   radius entirely) — healthy on equestria; a final `talosctl etcd snapshot` and
   machine-config export of SGC taken and stored off-box.
2. `kubectl --context admin@sgc cordon <node>`. Drain is close to a no-op by this point — SGC's
   workloads are already scaled to 0 or migrated — but it's the same procedural gate the
   estate uses everywhere else, and it catches anything left running that shouldn't be.
3. **Gracefully leave etcd, then wipe, in one step:**

   ```
   talosctl -n <node-ip> -e <node-ip> reset --graceful --reboot \
     --system-labels-to-wipe STATE --system-labels-to-wipe EPHEMERAL --wait=false
   ```

   **Do not use `task talos:reset-node IP=<ip>`** from
   `stargate-command-cluster/.taskfiles/talos/Taskfile.yaml` for this step — it hardcodes
   `--graceful=false`, which skips the etcd member-remove and would leave a dead member in
   SGC's etcd list for the surviving nodes to reconcile around. The manual command above does
   the graceful leave and the wipe atomically.
4. From a **surviving** SGC node, confirm membership dropped cleanly and the remainder is
   healthy before touching hardware further:

   ```
   talosctl -n <surviving-ip> -e <surviving-ip> etcd members
   talosctl -n <surviving-ip> -e <surviving-ip> etcd status
   ```

   Expect member count 2 (after milky-way), then 1 (after othalla) — see "The point of no
   return" below for what changes at that second step specifically.

**What this destroys, on purpose:** wiping the node destroys its SGC-side Longhorn
replicas — up to ~930 GiB of them (live-confirmed: each SGC node's Longhorn disk reports
930.9 GiB storage maximum today). This is expected and fine: SGC is being fully abandoned, and
[16](16-soak-and-gate.md)'s gate exists specifically to prove every volume's data is already
verified on equestria's side before this piece starts. Don't try to preserve or evacuate SGC
Longhorn data mid-sequence; there's nothing there that isn't already elsewhere.

**SGC's `KubeCPUOvercommit` warning** ([vault#132](https://github.com/david-driscoll/vault/issues/132),
open since 2026-08-02) is moot by the time this step runs — it was a scheduling-margin warning
on a 3-node all-CP cluster still carrying its full app set, and by [16](16-soak-and-gate.md)'s
gate that app set is gone. No action needed here; it closes naturally as SGC is decommissioned
in [22](22-decommission-sgc.md).

### Step B: swap the NVMe (opportunistic, see 17)

If the hardware budget has landed by this point, the node is already open — swap the ShiJi for
the estate-standard Samsung 990 EVO Plus now (see [17](17-nvme-replacement.md)). If not, skip
this step; it is not a gate.

### Step C: reinstall and join

1. Add the node's entry to `equestria-cluster/talos/talconfig.yaml` per the table above, with
   `vip.ip: "10.10.206.201"`.
2. `task talos:generate-config` — regenerates **every** node's machine config from the single
   template. Diff before applying: `git diff talos/clusterconfig/` should show only the new
   node's file as new content; the existing nodes' generated configs should be unchanged. If
   they're not, find out why before applying anything.
3. `task talos:validate-config` — runs `talosctl validate --mode metal --strict` against every
   generated config, including the new one.
4. Find the node's current address. In maintenance mode (freshly wiped, no machine config yet)
   it may come up on a DHCP lease rather than its static `10.10.209.x` address until config is
   applied — check UniFi's client list / DHCP reservations for the node's known MAC before
   assuming the address hasn't changed.
5. **Join:**

   ```
   task talos:add-node IP=<maintenance-mode-ip>
   ```

   which runs `talhelper gencommand apply --node <IP> --extra-flags '--insecure --mode=auto' | bash`
   — applies the new config over an unauthenticated connection (the node has no cert yet),
   which is exactly how talhelper expects to onboard a fresh node. **No separate
   `talosctl bootstrap` call** — bootstrap is a one-time action for a brand-new cluster's very
   first etcd member; this node is joining an already-running cluster, and Talos handles the
   etcd join itself once it has the cluster's PKI (embedded in the generated config, sourced
   from `talsecret.sops.yaml`).
6. Once applied, the node re-adopts its static `10.10.209.1x/16` address per its new machine
   config.

### Step D: verify before moving on

All four must be true before starting the next node:

1. **etcd healthy.** `talosctl -n <new-node-ip> -e 10.10.206.201 etcd members` — member count
   as expected (4 / 5 / 6), all `started`, no flapping. Watch the risk metrics above for at
   least a few minutes past the join, not just an instant snapshot.
2. **Cilium ready.**
   `kubectl --context admin@equestria get pods -n kube-system -l k8s-app=cilium --field-selector spec.nodeName=<node>`
   — `1/1 Running`. This is the check that catches the zombie-node cascade before it
   cascades: if Cilium isn't ready, stop here and diagnose the node and its taints — don't
   move on to CNPG or Longhorn troubleshooting first.
3. **Node Ready.** `kubectl get nodes <node>` — `Ready`, correct `OS-IMAGE`/`KERNEL-VERSION`
   matching the rest of the fleet.
4. **Longhorn rebuilt, cluster-wide, not just this node.**
   `kubectl get nodes.longhorn.io -n longhorn-system <node>` — `Ready` + `Schedulable`; then
   `kubectl get volumes.longhorn.io -A` — **zero** `degraded` or `faulted` anywhere in the
   (now larger) pool before starting the next node. The new node joins the pool as ordinary
   capacity (+~930 GiB each — 7 nodes × ~930 GiB ≈ 6.5 TiB raw once all three are in) — it is
   **not** tagged `critical` yet. That tagging, and the taint/affinity pinning that makes
   low-power mode work, is [12 — Longhorn critical tier](12-longhorn-critical-tier.md)'s job,
   applied once milky-way/othalla/pegasus are confirmed as the *permanent* control-plane trio —
   which isn't settled until [19](19-rotate-equestria-control-planes.md) finishes rotating
   equestria's original three out.

## The point of no return

Everything above is reversible **up to and including wiping milky-way** (SGC etcd 3→2 —
quorum still holds, though margin is now zero; if the join to equestria somehow failed,
milky-way could in principle be reinstalled back into SGC to restore the third member).

**Wiping the second node (othalla) is not.** At that instant SGC's etcd drops from 2 members
to 1 — pegasus alone, no redundancy, and nothing left to gracefully validate a rejoin against
if that last node is lost before its own join to equestria completes. From here, SGC's only
recovery path is the etcd snapshot taken in Step A before this piece started. In practice this
isn't a real exposure — [16](16-soak-and-gate.md)'s gate already proved nothing SGC held is
unique — but it is the moment the plan stops offering a way back, and it should be treated
that way: **do not start othalla's wipe until milky-way is fully verified per Step D, and do
not treat this step as routine.**

## After all three: hold before touching equestria

Once pegasus joins and passes Step D, equestria is at **6 control-plane members (quorum 4,
tolerates 2 failures) and 4 workers** — SGC no longer exists as a cluster. Before starting
[19 — rotate equestria's control planes](19-rotate-equestria-control-planes.md):

- Confirm 6-member etcd health holds over a soak period (a few hours minimum, not an instant
  check) — no leader flapping, fsync/commit within the bounds discussed above.
- Confirm Longhorn has fully rebuilt across all seven nodes with zero degraded volumes. This
  is the entire reason for the 3→6→3 sequencing over an alternating add/remove pattern:
  **the new capacity must be proven in the pool before any of it is asked to absorb the load
  of an original equestria node being wiped in turn.**

This piece's job ends here. Longhorn critical-tier tagging
([12](12-longhorn-critical-tier.md)), the equestria-CP-to-worker rotation
([19](19-rotate-equestria-control-planes.md)), the low-power runbook
([20](20-low-power-tier.md)), and formally decommissioning SGC's DNS/VIP/Pulumi
stack/repo ([22](22-decommission-sgc.md)) are all separate, later pieces.

## See also

- [16 — Soak and gate](16-soak-and-gate.md) — the pre-gate for this entire piece.
- [17 — NVMe replacement (deferred)](17-nvme-replacement.md) — the risk this piece inherits
  and does not wait for.
- [15 — Migrate apps](15-migrate-apps.md) — where chrony/mosquitto/tsidp/home-assistant
  actually cut over, ahead of this piece.
- [19 — Rotate equestria control planes](19-rotate-equestria-control-planes.md) — must not
  start until this piece's exit criteria hold on all seven nodes.
- [12 — Longhorn critical tier](12-longhorn-critical-tier.md) — tags the final control-plane
  trio, after 19.
- [vault#95](https://github.com/david-driscoll/vault/issues/95),
  [vault#127](https://github.com/david-driscoll/vault/issues/127),
  [vault#132](https://github.com/david-driscoll/vault/issues/132) — the three open issues this
  piece directly touches.
