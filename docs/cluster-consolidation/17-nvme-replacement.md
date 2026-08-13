# 17. NVMe replacement — deferred (P′)

> **Status: DEFERRED.** Not a dependency of [18 — SGC nodes join the control
> plane](18-sgc-nodes-join-control-plane.md). Tracked as its own hardware issue (not yet
> opened — see Action items below); revisit when the budget allows.

## The problem

The three GMKtec NucBox G3 Plus boxes that become equestria's control plane in
[18](18-sgc-nodes-join-control-plane.md) — milky-way, othalla, pegasus — install Talos, and
therefore etcd, onto a no-name, DRAM-less **"ShiJi 256GB M.2-NVMe"** at `/dev/nvme0n1`
(confirmed live via `smartctl_device`, 2026-08-13; unchanged since discovery). Longhorn lives
on a separate 1 TB Transcend `TS1TMTS425S` at `/dev/sda`, so etcd is at least isolated from
Longhorn's rebuild I/O — the problem is the drive underneath etcd itself.

**Measured live, 2026-08-13** (`etcd_disk_wal_fsync_duration_seconds` /
`etcd_disk_backend_commit_duration_seconds`, 1 h window, via Thanos):

| Node | p50 fsync | p99 fsync | p99 backend commit |
|---|---|---|---|
| milky-way | 3.9 ms | 15.8 ms | 28.7 ms |
| othalla | 6.6 ms | 30.3 ms | 52.9 ms |
| pegasus | 3.9 ms | 21.1 ms | 30.4 ms |

Discovery-time figures (2026-07-30 investigation comment) were 3.7–6.4 ms p50 / 15.6–29.3 ms
p99 fsync — **today's numbers land in the same band.** The condition is stable, not
worsening, which lines up with [vault#95](https://github.com/david-driscoll/vault/issues/95):
othalla's `nvme0` has sat at **18 media errors, flat**, since 2026-07-29 — re-confirmed live
today (`smartctl_device_media_errors{instance="othalla"}` = 18, milky-way and pegasus both 0).
That issue is open and tagged `wontfix` pending a drive swap, silenced periodically so it stops
re-paging for a condition that isn't changing. etcd's own guidance is p99 WAL fsync **< 10 ms**
and backend commit **< 25 ms**; all three SGC nodes exceed both today, as they did at
discovery.

## The counterweight — equestria's own etcd isn't clean either

This is not "trade a bad disk for a good one." **Two of equestria's three current control
planes have a worse-measured etcd substrate than SGC's, right now**, per
[vault#127](https://github.com/david-driscoll/vault/issues/127) (filed 2026-08-02, open,
unfixed as of this writing):

| Node | Etcd/system disk | Confirmed |
|---|---|---|
| hard-hat | `KINGSTON SNV3S1000G` NVMe | fast — 0.02 s apiserver p99 in vault#127 |
| fluttershy | **`PNY 500GB SATA SSD`** | slow — up to 320 ms etcd commit p99 during the vault#127 incident |
| kerfuffle | **`PNY 500GB SATA SSD`** | slow — up to **5038 ms** etcd commit p99, the trigger for vault#127 |

(The Samsung 990 EVO Plus present on fluttershy/kerfuffle is dedicated entirely to Longhorn,
not etcd — confirmed live today via `smartctl_device{cluster="equestria"}`, which shows both
`PNY 500GB SATA SSD` on `sda` and `Samsung SSD 990 EVO Plus 1TB` on `nvme0` on the same two
hosts. The 2026-07-30 discovery comment's shorthand — "equestria's system disk is the Samsung
990 EVO Plus" — was a simplification that vault#127 corrected three days later by tracing the
*actual* Talos install disk per node. **This file uses vault#127's more precise, more recent
reading, not the earlier shorthand.**)

Live right now (2026-08-13, same 1 h window as above):

| Node | p99 fsync | p99 backend commit |
|---|---|---|
| hard-hat | 3.6 ms | 3.0 ms |
| fluttershy | 18.3 ms | **46.1 ms** |
| kerfuffle | 3.6 ms | 5.2 ms |

fluttershy is worse than SGC's milky-way *right now* (18.3 ms vs 15.8 ms fsync p99; 46.1 ms
vs 28.7 ms commit p99) — and vault#127 shows it can get far worse under Pulumi workspace-pod
write load (kerfuffle hit 5038 ms commit p99 during that incident). So the control-plane
handover in [18](18-sgc-nodes-join-control-plane.md) is not introducing a known-bad substrate
into a known-good cluster. It is merging two already-imperfect substrates: SGC's
stable-but-slow ShiJi NVMe (all three nodes, consistently over etcd's guidance) against
equestria's inconsistent PNY SATA (two of three nodes, capable of catastrophic spikes under
write load). **Both classes of drive should be replaced eventually regardless of which
cluster they end up serving.** This file is scoped to SGC's copy of the problem because those
are the disks that keep the etcd role after 18; vault#127's own fix (reinstall
fluttershy/kerfuffle onto their Samsung NVMe, shrinking the Longhorn `userVolume` to make
room) is tracked separately and neither blocks nor is blocked by this migration.

## David's decision

> Let's make a new issue for this. This is a task that is needed to be done but with the
> prices of nvme drives at the moment, not something I'm going to afford at the moment.
>
> — [vault#84](https://github.com/david-driscoll/vault/issues/84), answering the NVMe-budget
> question

This is decision **D8** in the [README's ledger](README.md#decision-ledger): deferred to its
own hardware issue, not a dependency of the node phases.

## What to buy, and when

- **Drive.** Samsung 990 EVO Plus M.2 NVMe — the estate's existing standard (it's already the
  Longhorn drive on hard-hat/fluttershy/kerfuffle, and hard-hat's own etcd drive is a
  same-class Kingston NVMe). Any capacity at or above the current 256 GB works — etcd's DB is
  ~135–190 MiB total on these nodes today (live-measured), so there's no capacity pressure.
  Buy whatever SKU is cheapest/convenient when the budget allows.
- **Where.** Three drives, one per GMKtec NucBox G3 Plus (milky-way, othalla, pegasus),
  replacing the ShiJi at `/dev/nvme0n1` on each.
- **When.** Any wipe or maintenance window. **Opportunistically, the cheapest window is the
  wipe each node already gets in [18](18-sgc-nodes-join-control-plane.md)** — the lid is
  already off, the node is already being reinstalled from scratch, and swapping the M.2 costs
  a couple of minutes with zero incremental risk. If funding lands before 18 executes, do it
  then. **If not, 18 proceeds on schedule with the ShiJi drives still in place — this file is
  not a gate.**
- **Selector note.** Both talconfigs identify each node's install disk either by device path
  (`installDisk: /dev/sda`, e.g. equestria's fluttershy/kerfuffle) or by model
  (`installDiskSelector: model: "..."`, e.g. hard-hat). [18](18-sgc-nodes-join-control-plane.md)
  carries SGC's nodes into equestria by device path (`/dev/nvme0n1`), so a later drive swap
  needs **no talconfig edit** — the path stays the same regardless of which physical drive
  occupies the slot.

## Risk this hands to 18

Until the swap happens, [18](18-sgc-nodes-join-control-plane.md) executes with the ShiJi
drives in place. That plan explicitly:

- treats the measured fsync/commit numbers above as the accepted baseline for the merge, not a
  blocker;
- watches etcd fsync/commit p99 and leader-change counts at every membership change, and stops
  if the *merged* cluster degrades past what either substrate shows in isolation today;
- does not make replacing these drives a precondition for starting, continuing, or completing
  the SGC-to-control-plane handover.

## Action items

1. **Open the hardware issue.** None exists yet as of this writing — searched `vault` issues
   for `GMKtec` and `ShiJi` (title/body), zero hits; the only related open issues are
   [#95](https://github.com/david-driscoll/vault/issues/95) (othalla's drive diagnostics, not
   a replacement initiative) and [#127](https://github.com/david-driscoll/vault/issues/127)
   (equestria's unrelated PNY problem). Suggested title: "Replace ShiJi NVMe system disks on
   the 3 GMKtec control-plane nodes (milky-way/othalla/pegasus)". Link back to vault#84,
   vault#95, and this file.
2. **Track vault#127 separately.** It's equestria's half of the same class of problem (slow
   etcd substrate) with its own proposed fix. Neither issue blocks the other or blocks this
   migration.
3. **When the budget allows:** if [18](18-sgc-nodes-join-control-plane.md) hasn't run yet,
   fold the swap into its per-node wipe step. If 18 has already completed, schedule three
   individual maintenance windows instead — same procedure, just without the
   "already-reinstalling-anyway" savings.

## See also

- [16 — Soak and gate](16-soak-and-gate.md) — must pass before 18 (and therefore before this
  drive swap's opportunistic window) can start.
- [18 — SGC nodes join the control plane](18-sgc-nodes-join-control-plane.md) — inherits this
  risk explicitly and does not wait on it.
- [vault#95](https://github.com/david-driscoll/vault/issues/95) — othalla's stable 18 media
  errors.
- [vault#127](https://github.com/david-driscoll/vault/issues/127) — the counterweight finding
  on equestria's own etcd substrate.
