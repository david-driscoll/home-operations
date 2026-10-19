# Move EPHEMERAL off the PNY SATA disks (fluttershy, kerfuffle)

**Status: plan only. Nothing here has been run.** Written 2026-10-18 after the
third `/var` incident in a week on these two nodes (2026-10-11 fluttershy,
2026-10-17 both rebooted, 2026-10-19 both down).

## The problem, measured

`fluttershy` (10.10.206.16) and `kerfuffle` (10.10.206.17) are the two UN1290
workers. Each has two disks:

| Disk | Holds | Notes |
| --- | --- | --- |
| `sda`: PNY 500GB SATA SSD, 2.5", DRAM-less | EFI, META, STATE, **EPHEMERAL (`/var`, sda4, ~498 GB)** | `installDisk: /dev/sda`. Both drives report the **same WWID** (`naa.5f8db4c082538489`), so never select them by wwid |
| `nvme0n1`: Samsung 990 EVO Plus 1TB | one partition, `u-longhorn` (xfs, exactly 1 TB, `grow: false`) | The whole disk. There is no free space |

From `smartctl` and Prometheus, 7 days to 2026-10-18:

| | fluttershy `sda` | kerfuffle `sda` | `nvme0n1` (both) |
| --- | --- | --- | --- |
| io_time utilisation, p95 | **88 %** | 13 % | 50 % |
| io_time utilisation, max | 96 % | 71 % | 59 % |
| write MiB/s, p95 | 46.5 | 9.6 | 40 / 26 |

The PNY drives are SMART-clean but top out at about 30-45 MiB/s of sustained
writes. fluttershy's sits near saturation **all the time**, not only during
incidents. A saturated `/var` stalls containerd's overlay unmounts (TaskExit
backoff), then PLEG goes unhealthy and the node goes NotReady. The NVMe moves
the same bytes at half the io_time, and io_time overstates load on a
multi-queue NVMe.

`/var` usage on each node: **~320 GB**, of which ~222 GB is the image
filesystem. Kubelet image GC runs at 80 % and stops at 60 %
(`talos/patches/global/machine-kubelet.yaml`).

Longhorn on the NVMe:

| Node | Replicas | Actually used | Scheduled | Strict-local (1 replica, cannot be evicted) |
| --- | --- | --- | --- | --- |
| fluttershy | 186 | ~489 GB | ~2.0 TB | `database/postgres-3`, `garage-system/data-garage-storage-2-0`, `garage-system/metadata-garage-storage-2-0` |
| kerfuffle | 84 | ~168 GB | ~0.85 TB | `database/postgres-1` |

The other bulk nodes (`hard-hat`, `shining-armor`) plus whichever UN1290 node
is not being worked on have ~2 TB free between them, so evacuating one node is
within capacity.

## Options

### A. Put EPHEMERAL on the NVMe, shrink `u-longhorn` (recommended)

Free, and it removes the cause: `/var` moves off the slowest device in the
box, and `sda` keeps only EFI/META/STATE, which see almost no I/O.

Talos 1.14 can place EPHEMERAL with a `VolumeConfig`, but **only when the
volume is first provisioned**. The NVMe has no free space and xfs cannot
shrink, so each node needs **both disks wiped**. All Longhorn data on that node
has to leave first.

Sizing: EPHEMERAL **300 GB** fixed. The other ~100 GB of `/var` stays; image
GC trims images to fit (it starts at 240 GB and stops at 180 GB). `u-longhorn`
takes the rest, ~700 GB. fluttershy's 489 GB of real Longhorn data would be
~70 % of that. Bulk-tier capacity drops by 600 GB in total. Raise the 300 if
re-pull churn (image GC firing often) shows up afterwards.

### B. Replace the PNY drives with DRAM-equipped 2.5" SATA SSDs

For example a Samsung 870 EVO. The SATA link (~550 MB/s) is still about 10x the
PNY's sustained ceiling. **The NVMe is not touched**, so `u-longhorn`, every
replica and the strict-local volumes stay where they are. Talos finds the
existing `u-longhorn` partition by its label on the new install. Costs: two
drives, hands-on time at each box, and a boot USB built from the node's
schematic (`talhelper genurl iso`). Each node is down for the whole swap. If
it is down longer than `replica-replenishment-wait-interval` (600 s), Longhorn
starts rebuilding replicas elsewhere, so raise that setting for the window or
accept the rebuild traffic.

**Ask before buying:** if the UN1290 chassis has a second M.2 slot, a second
NVMe there for EPHEMERAL beats both options.

### Interim, whichever option

Keep the Pulumi workspace pods off these two nodes. They started the
2026-10-19 cascade: 6 of 7 cold workspaces landed on fluttershy at once.

The rest of this runbook is **option A**.

## Config change (option A)

`talconfig.yaml` is not GitOps. Nothing changes until a node is wiped and
re-added. During the migration only the node being worked on gets the new
layout, so **break that node out of the shared `&intel_un1290_*` anchors**
rather than editing the anchors. Otherwise a routine `talos:apply-node` on the
other node renders a layout it cannot have. When both nodes are done, fold it
back into the anchors.

New `talos/patches/un1290/ephemeral-nvme.yaml`:

```yaml
# EPHEMERAL (/var) on the Samsung NVMe, not the PNY SATA system disk.
# Honoured only at first provisioning: see docs/runbooks/un1290-ephemeral-on-nvme.md.
apiVersion: v1alpha1
kind: VolumeConfig
name: EPHEMERAL
provisioning:
  diskSelector:
    match: disk.transport == "nvme"
  minSize: 300GB
  maxSize: 300GB
  grow: false
```

In the node's entry (this example is kerfuffle):

```yaml
    patches:
      - "@./patches/un1290/ephemeral-nvme.yaml"
    userVolumes:
      - name: longhorn
        filesystem:
          type: xfs
        provisioning:
          diskSelector:
            match: disk.model == "Samsung SSD 990 EVO Plus 1TB"
          minSize: 600GB
          grow: true          # takes what EPHEMERAL leaves
```

EPHEMERAL has to be provisioned before `u-longhorn`: user volumes mount under
`/var/mnt`, which lives on EPHEMERAL. Even so, **verify the order on the first
node** (step 6) before trusting it on the second.

Check with `mise run talos:genconfig` and then
`talosctl ... apply-config --dry-run` against the node. On a node that has
**not** been wiped, the diff shows the new documents, but Talos ignores them.
That is expected.

## Procedure, one node at a time

Do **kerfuffle first**: fewer replicas, less data, and its one strict-local
instance (`postgres-1`) is a replica, not the primary. Don't start the second
node until the first has passed step 7, and kerfuffle's `sda` has gone quiet in
Grafana.

`tl` below is `talosctl --talosconfig <main checkout>/talos/clusterconfig/talosconfig -e <ip> -n <ip>`.

### 0. Preflight

- `talos-logs` applied on this node (`tl get kmsglogconfigs` lists one).
  Then if the node misbehaves during the window, the logs survive.
- Every Longhorn volume `healthy`. CNPG `postgres` 3/3 ready. Garage healthy.
- No tuppr `TalosUpgrade`/`KubernetesUpgrade` in progress.
- No bare pods on the node (they block the drain; see
  [19](../cluster-consolidation/19-rotate-equestria-control-planes.md) §2).
- Pulumi workspaces paused or pinned elsewhere. The other UN1290 node takes a
  share of the evicted pods, and that is exactly how 2026-10-19 spread.
- Save the node's evidence: `tl dmesg > ...`, `tl logs cri > ...`.

### 1. Evacuate Longhorn

```bash
kubectl -n longhorn-system patch nodes.longhorn.io <node> --type merge \
  -p '{"spec":{"allowScheduling":false,"evictionRequested":true}}'
```

Wait until the node's disk has **0 scheduled replicas**, apart from the
strict-local ones (step 2).

### 2. Move the strict-local volumes

- **CNPG.** If the node holds the primary, switch it over first
  (`kubectl cnpg promote`). Then
  `kubectl cnpg destroy -n database postgres <ordinal>`, after cordoning so
  the replacement instance cannot land back here. Never delete the PVC by
  hand. Expect the stuck-detach chain in 19 §"Step 1c".
- **Garage** (fluttershy only). The StatefulSet's PVCs are `longhorn-local`
  with `pvcRetentionPolicy: Retain`, so delete the pod **and** both
  `*-garage-storage-2-0` PVCs. Pod anti-affinity rules out `hard-hat` and
  `shining-armor`, and fluttershy is cordoned, so the pod lands on kerfuffle
  (already migrated by then) with empty volumes. Replication is factor 3,
  consistent mode, so two nodes hold quorum meanwhile. `layoutPolicy: Auto`
  should add the new node ID to the layout. **Check that it did**, and wait for
  resync to drain before going on.

### 3. Drain

```bash
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
```

Put a check against the API in front of any assertion that the drain worked
(19 §1).

### 4. Reset to maintenance mode

```bash
mise run talos:reset-node <ip>    # wipes STATE + EPHEMERAL, reboots into maintenance
```

While the node is down and holds no replicas, delete its Longhorn node object
(`kubectl -n longhorn-system delete nodes.longhorn.io <node>`). Its disk record
points at a filesystem that is about to be destroyed. On rejoin,
longhorn-manager recreates the object from the node's
`default-disks-config` annotation.

### 5. Wipe in maintenance mode, and look first

```bash
tl --insecure get discoveredvolumes
tl --insecure wipe disk nvme0n1                    # u-longhorn: everything on the NVMe
tl --insecure wipe disk sda4 --drop-partition      # only if an EPHEMERAL partition is still on sda
tl --insecure get discoveredvolumes                # sda: EFI, META, STATE only; nvme0n1: empty
```

`reset --system-labels-to-wipe` wipes the partition, but it is not documented
to remove it. Talos locates an existing volume by its partition label before
provisioning a new one, so a leftover `EPHEMERAL` label on `sda` would be
re-used and the `VolumeConfig` ignored. Don't apply config until `sda4` is gone.

### 6. Rejoin with the new layout

Commit the per-node config change, then:

```bash
mise run talos:genconfig
mise run talos:add-node <ip>
tl get volumestatus EPHEMERAL u-longhorn
```

Expect EPHEMERAL on `/dev/nvme0n1p1` at ~300 GB, `u-longhorn` on
`/dev/nvme0n1p2` at ~700 GB, and nothing on `sda` except EFI/META/STATE. If
`u-longhorn` is missing or EPHEMERAL is on `sda`, stop. That is the ordering
problem, and the rollback below applies.

### 7. Return it to service

`Ready` comes ~40 minutes before Longhorn is usable (19 §4). Gate on
`nodes.longhorn.io <node>` condition `Ready=True` **and** `longhorn-manager` and
`longhorn-csi-plugin` at N/N, then:

```bash
kubectl uncordon <node>
kubectl -n longhorn-system patch nodes.longhorn.io <node> --type merge \
  -p '{"spec":{"allowScheduling":true,"evictionRequested":false}}'
```

Check every node reads `allowScheduling=true, evictionRequested=false`. A flag
left set fails silently, forever.

`add-node` applies the full rendered config, and that includes
`machine-logging.yaml`. Confirm `{job=~"talos/.+", node="<node>"}` in Loki.

## Rollback

| Where it failed | Rollback |
| --- | --- |
| Steps 0-3 | Undo the flags (step 7's patch) and uncordon. Nothing was destroyed. A CNPG instance or Garage node that was already rebuilt elsewhere stays there, which is fine |
| Step 5 or 6: wrong layout, or the node won't come up | The node's data is already gone, but nothing depends on it. Revert the per-node config change, `talos:genconfig`, re-run steps 4-6 (reset, wipe both disks, add-node). It comes back in the old layout: EPHEMERAL on `sda4`, `u-longhorn` 1 TB |
| Step 7: the node is unstable on the new layout | Same as above. Cordon it first, and set `allowScheduling: false` so no new replicas land on it while you do |

The node keeps booting from `sda` (EFI + STATE are untouched by the wipes in
step 5), so maintenance mode is always reachable over the network. The one
exception is a hang at shutdown: on 2026-10-19 kerfuffle needed a physical
power cycle. Have hands-on access available while either node is mid-procedure.

## After both nodes

- Fold the per-node `patches`/`userVolumes` back into the `&intel_un1290_*`
  anchors, and delete the unused `talos/patches/un1290/machine-disks.yaml`.
- Update the memory/incident notes: `/var` is no longer on the PNY.
- Leave `sda` as the system disk. It is now nearly idle. Don't put Longhorn
  on it: that only moves the slow-disk problem from containerd into
  replicas.
