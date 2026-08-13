# 11 — Trim `volumesnapshotcontents` (J)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). No dependency on
[10-drain-safety.md](10-drain-safety.md) or any other piece — this can start today — but it
shares [10](10-drain-safety.md)'s live blocking incident (Longhorn's `HelmRelease` mid-migration
and wedged) as a soft prerequisite: see [§ Step 0](#step-0-check-10s-live-incident-first) below.

**Why this piece exists at all:** `volumesnapshotcontents` is equestria's largest
apiserver-storage object type after the TTL'd `events` — ahead of `secrets`, ahead of Pulumi's
own `updates.auto.pulumi.com` — and every one of those objects is dead weight in etcd on the
cluster whose control plane is about to move onto three GMKtec nodes with the estate's slowest
disks ([17-nvme-replacement.md](17-nvme-replacement.md)) and, per
[19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md), onto 16 GiB
nodes carrying etcd, Cilium and Longhorn's instance-managers on the same budget. Fewer objects
here is directly fewer bytes for etcd to fsync and less memory for every apiserver to cache,
on the exact nodes this plan is about to make load-bearing.

This piece is **partially in flight already** —
[vault#123](https://github.com/david-driscoll/vault/issues/123) (the snapshot leak plus the
`snapshotMaxCount: 5` deadlock that took `network/technitium` down to 1 of 3 replicas on both
clusters) is **closed**, its fix is live, and it's what stopped the leak from continuing to grow.
[vault#134](https://github.com/david-driscoll/vault/issues/134) is the residue #123's fix cannot
reach — the objects created before the fix — and it is **still open**, and the bulk cleanup it
describes is **stalled, not running**, exactly as its own text says. This piece's job is to
finish that cleanup, close the retention gap that would let the pile grow back, and define the
measurement that says "done."

## Step 0: check 10's live incident first

[10-drain-safety.md](10-drain-safety.md) documents a live incident, discovered this session
(2026-08-13): Longhorn's `HelmRelease` on both clusters is wedged mid-migration
(`UninstallFailed`, blocked by Longhorn's own `deleting-confirmation-flag` safety setting — no
data lost, but the object is unstable), and the `nfs-csi` StorageClass is currently `NotFound` on
both clusters. Deleting `VolumeSnapshotContent` objects at scale routes through the Longhorn CSI
driver and its webhooks; doing that while the `HelmRelease` that owns those components is itself
retrying a failed uninstall is not a controlled environment for a bulk operation. **Re-run
[10](10-drain-safety.md)'s Step 0 verification block before starting the batches in §2 below** —
it costs one command and the alternative is debugging two incidents tangled together.

This piece does not depend on [10](10-drain-safety.md)'s taint-toleration or drain-rehearsal
work otherwise — only on Longhorn/CSI being in a settled state before touching hundreds of its
objects at once.

## Section 1: current state, verified live 2026-08-13

vault#134 measured this on 2026-08-03. Ten days on, with the cleanup confirmed stalled, the
counts should be nearly frozen — and they are, which is itself useful confirmation that nothing
has quietly resumed:

| | equestria (2026-08-03) | equestria (2026-08-13) | sgc (2026-08-03) | sgc (2026-08-13) |
|---|---|---|---|---|
| Dangling Retain VSCs | 949 | **951** | 38 | **38** |
| …of those, still backed by a live Longhorn snapshot | 118 | **81** | 12 | **8** |
| Disk held by those live snapshots | 159.86 GiB | **150.2 GiB** | 24.45 GiB | **17.4 GiB** |

sgc's count (38, all `Retain`) hasn't moved by a single object in ten days — the cleanup really
is stopped there, not merely slow. Equestria gained 2 stragglers and the live-backed subset
*shrank* (118 → 81, 159.86 → 150.2 GiB) — that's not the stalled cleanup resuming, it's normal
VolSync chain churn: old snapshots in a retained chain naturally coalesce into their child as
newer ones are taken, so a VSC that pointed at a live snapshot on 08-03 can point at nothing by
08-13 without anyone running the fix. **This means the "184 GiB held" framing in vault#134 is
already understating today's true reclaim target in the other direction** — the total object
count is flat-to-growing (987 → 989 combined) even as the disk value trends down on its own; the
object cleanup and the disk cleanup are two different problems with two different urgencies, and
only the object count is guaranteed to keep growing unattended.

```bash
$ kubectl --context admin@equestria get volumesnapshotcontents --no-headers | wc -l
951
$ kubectl --context admin@equestria get volumesnapshotcontents \
    -o jsonpath='{range .items[*]}{.spec.deletionPolicy}{"\n"}{end}' | sort | uniq -c
    949 Retain
      2 Delete
$ kubectl --context admin@sgc get volumesnapshotcontents --no-headers | wc -l
38
```

The `2 Delete` on equestria are transient — objects created since #123's fix, mid-reclaim. Zero
`Delete`-policy VSCs linger on either cluster; the fix genuinely stops the leak going forward,
confirmed by the `VolumeSnapshotClass` still reading `Delete` live on both clusters:

```bash
$ kubectl --context admin@equestria get volumesnapshotclass longhorn-snapclass -o jsonpath='{.deletionPolicy}'
Delete
$ kubectl --context admin@sgc get volumesnapshotclass longhorn-snapclass -o jsonpath='{.deletionPolicy}'
Delete
```

**The wedged object from vault#134 is still wedged**, now **over 10 days** into `Terminating`
rather than the ~16 hours reported when the issue was filed:

```bash
$ kubectl --context admin@equestria get volumesnapshotcontent snapcontent-45b30446-462b-4659-b933-76d69d4280dc
NAME                                               READYTOUSE   DELETIONPOLICY   VOLUMESNAPSHOT       AGE
snapcontent-45b30446-462b-4659-b933-76d69d4280dc   true         Retain           volsync-radarr-src   69d
$ kubectl --context admin@equestria get volumesnapshotcontent snapcontent-45b30446-462b-4659-b933-76d69d4280dc \
    -o jsonpath='{.metadata.deletionTimestamp}'
2026-08-03T01:32:30Z
```
Its `bound-protection` finalizer guards a `VolumeSnapshot` (`equestria/volsync-radarr-src`) that
no longer exists — there are zero `VolumeSnapshot` objects of consequence on either cluster today
(2 on equestria, 1 on sgc, both fresh in-flight VolSync copies, not this one) — so nothing will
ever satisfy that finalizer on its own.

**Recomputing which VSCs are live-backed, not just trusting vault#134's snapshot:** the method is
cross-referencing each `Retain` VSC's `status.snapshotHandle` (`snap://<volume>/<snapshot-name>`)
against the actual `snapshots.longhorn.io` CRs, since the handle alone doesn't confirm the
backing object still exists:

```bash
kubectl get volumesnapshotcontents -o json > vsc.json
kubectl get snapshots.longhorn.io -n longhorn-system -o json > snaps.json
python3 -c "
import json
vsc = json.load(open('vsc.json'))['items']
snaps = json.load(open('snaps.json'))['items']
keys = set()
for s in snaps:
    vol = s.get('status', {}).get('volume') or s['spec'].get('volume', '')
    keys.add((vol, s['metadata']['name']))
    keys.add(s['metadata']['name'])
live, size = 0, 0
for i in vsc:
    if i['spec'].get('deletionPolicy') != 'Retain':
        continue
    h = i.get('status', {}).get('snapshotHandle', '')
    if not h.startswith('snap://'):
        continue
    vol, name = h[len('snap://'):].split('/', 1)
    s = next((s for s in snaps if (s.get('status',{}).get('volume') or s['spec'].get('volume','')) == vol
              and s['metadata']['name'] == name), None)
    if s:
        live += 1
        size += int(s.get('status', {}).get('size', 0) or 0)
print('live-backed:', live, 'size GiB:', size / 1024**3)
"
```
Re-run this before the bulk pass in §2 — the 81/8 split above is this session's snapshot, and per
the ten-day drift already observed, it will have moved again by the time anyone acts on it.

## Section 2: finish the vault#134 cleanup

vault#134's own suggested order is sound and doesn't need reinventing — the mechanism it
validated in #123 (patch `deletionPolicy` to `Delete` *first*, then delete the VSC, so the CSI
driver reclaims the underlying Longhorn snapshot instead of orphaning it) is the only safe path.
Deleting a `Retain` VSC directly stands the Longhorn snapshot up with no API object pointing at
it — the opposite of what this piece is trying to clean up.

1. **Clear the wedged finalizer by hand first.** `snapcontent-45b30446-462b-4659-b933-76d69d4280dc`
   cannot resolve on its own — its `VolumeSnapshot` is gone. Confirm no `ReplicationDestination`
   restore flow depends on it (equestria's namespace-wide `ReplicationDestination` inventory —
   cross-check against [vault#120](https://github.com/david-driscoll/vault/issues/120), which
   covers a *different* stuck `ReplicationDestination` on `dynacat` and is a reminder to check
   this class of object generally, not a claim this specific one is affected), then remove the
   `snapshot.storage.kubernetes.io/volumesnapshotcontent-bound-protection` finalizer:
   ```bash
   kubectl --context admin@equestria patch volumesnapshotcontent snapcontent-45b30446-462b-4659-b933-76d69d4280dc \
     --type=json -p='[{"op":"remove","path":"/metadata/finalizers"}]'
   ```
2. **The live-backed set first — where the actual disk is.** Re-run the §1 script, then for each
   live-backed VSC: patch `deletionPolicy: Delete`, confirm the patch took, delete the VSC,
   confirm the matching `snapshots.longhorn.io` CR is gone or `markRemoved: true`. This is ~89
   objects combined (81 equestria + 8 sgc, this session's count) reclaiming roughly 167 GiB
   combined — small enough to do by hand in batches of 10-20 with a health check between batches
   (`kubectl get volumes.longhorn.io -n longhorn-system` — no new `degraded` entries), not
   large enough to justify new automation.
3. **The remainder, in batches.** ~860 equestria + ~30 sgc stale API-only objects (no live
   Longhorn snapshot backing them — cost etcd, not disk). Same patch-then-delete mechanism, no
   snapshot-side risk since there's nothing left to orphan, but still worth batching (50-100 at a
   time) rather than one `kubectl delete volumesnapshotcontents --all` — a single scripted delete
   of ~900 objects is also ~900 CSI `DeleteSnapshot` calls fanning out through the driver at once,
   and this cluster's apiserver is already the thing this piece is trying to protect.
4. **Watch counts trend to zero between batches**, not just at the end — a batch that doesn't
   move the count is the same "stopped, not running" signal vault#134 already hit once.

*Exit for this section:* `kubectl get volumesnapshotcontents` returns nothing (or only fresh,
transient `Delete`-policy objects mid-reclaim) on both clusters; `snapshots.longhorn.io` no
longer carries orphaned entries with no matching VSC.

## Section 3: the retention/GC change that stops the pile coming back

#123's fix (`deletionPolicy: Delete` on `longhorn-snapclass`) closes the mechanism that created
this backlog. It does not, by itself, guarantee nothing accumulates again — a future
`VolumeSnapshotClass` added with `Retain` (a legitimate choice for some other workflow) would
recreate exactly this problem with no warning until someone measures it again. Two additions,
neither large:

1. **A recurring measurement, not a one-time cleanup.** Alert or dashboard panel on
   `apiserver_storage_objects{resource="volumesnapshotcontents.snapshot.storage.k8s.io"}`
   trending up over, say, a 7-day window with no corresponding drop — the exact shape #123's
   leak had and #134's stall has. This is cheap (the metric already exists, per §4 below) and is
   the thing that would have caught both #123 and #134 before either needed a live-cluster
   archaeology session to characterize.
2. **`snapshotMaxCount: 5` stays as-is, deliberately, not by default.** #123 flagged raising it as
   a separate, undecided fix (#2 in its list); #134 explicitly carried it forward as "not in
   scope here." Re-litigating it is not this piece's job — but note for whoever does: raising it
   only affects *newly created* volumes (Longhorn copies the global setting into
   `Volume.spec.snapshotMaxCount` at creation and never reconciles it after), so raising the
   global value today would do nothing for the ~989 objects this piece already cleaned up, and
   this piece's own before/after counts (§4) would look unaffected by that decision either way.

## Section 4: the measurement that says done

Two numbers, both directly queryable, both already used above rather than invented for this
section:

```bash
# Object count — the apiserver-memory lever this piece exists to pull
for ctx in admin@equestria admin@sgc; do
  echo "== $ctx =="
  kubectl --context $ctx get --raw /metrics | grep 'apiserver_storage_objects{resource="volumesnapshotcontents'
done

# etcd db size — the write-volume lever, doubly relevant once the apiserver moves to
# 16 GiB nodes on the estate's slowest disks (17, 18/19)
for ctx in admin@equestria admin@sgc; do
  echo "== $ctx =="
  kubectl --context $ctx get --raw /metrics | grep 'apiserver_storage_size_bytes'
done
```

Baseline, captured this session for exactly this purpose (2026-08-13T04:38Z):

| | equestria | sgc |
|---|---|---|
| `volumesnapshotcontents` objects | 951 | 38 |
| apiserver storage (etcd) DB size | 262.9 MiB | 182.0 MiB |
| Rank among all `apiserver_storage_objects` resources | #2 (behind `events`, TTL'd; ahead of `secrets` at 935 and `updates.auto.pulumi.com` at 897) | n/a — not in sgc's top 10 |

"Done" for this piece is: `volumesnapshotcontents` count on equestria drops out of the top 3
non-ephemeral resource types (i.e., below `secrets`), sgc's count reaches single digits or zero,
and the etcd DB size numbers above are re-measured post-cleanup and don't show growth relative to
this baseline. This is a smaller, sharper claim than "reduce apiserver memory" in the abstract —
it's a specific metric, a specific baseline, and a specific comparison anyone can re-run with the
one-liners above.

Note what this measurement will *not* show: equestria's per-node apiserver memory today (2.1–3.5
GiB, spot-checked this session via `kubectl top pods -n kube-system -l component=kube-apiserver`)
is not obviously elevated relative to the 3.2–3.3 GiB baseline
[Expansion v2](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273)
recorded on 2026-07-29, despite the object count having been far higher in between (5,532 on
07-29, peaking higher before #123's fix). Object count and apiserver RSS are correlated, not
identical — memory reflects working set and watch-cache behavior as much as raw object count.
Track both numbers in §4's table regardless; don't let a flat memory reading be mistaken for "the
object count doesn't matter" when the actual risk this piece is managing is what happens to that
correlation once the apiserver's headroom shrinks to 16 GiB per
[19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md).

## Exit gate

```bash
# 1. Step 0 — Longhorn/CSI settled (shared with 10)
kubectl --context admin@equestria get helmrelease longhorn -n longhorn-system \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
kubectl --context admin@sgc get helmrelease longhorn -n longhorn-system \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'

# 2. VSC counts near zero, both clusters
kubectl --context admin@equestria get volumesnapshotcontents --no-headers | wc -l
kubectl --context admin@sgc get volumesnapshotcontents --no-headers | wc -l

# 3. No orphaned Longhorn snapshots left without a VSC pointing at them
#    (re-run the §1 cross-reference script; expect live-backed count == 0 or explained)

# 4. The wedged object is gone
kubectl --context admin@equestria get volumesnapshotcontent snapcontent-45b30446-462b-4659-b933-76d69d4280dc
# expect: NotFound

# 5. §3's recurring measurement exists (alert, dashboard panel, or documented manual check)
#    and etcd DB size hasn't grown past this file's baseline (262.9 / 182.0 MiB)
```

**Reversible:** the retention/GC change (§3) is git, fully reversible. The bulk deletion (§2) is
not reversible in the sense that a deleted `VolumeSnapshotContent` and its reclaimed Longhorn
snapshot are gone — but every object in scope is either already-orphaned (no live backing data)
or a snapshot whose actual protection is the VolSync/restic backup chain, not the retained
Longhorn snapshot itself (§1.7 of
[Expansion v2](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273):
"the real backups are in restic, not these snapshots"). Confirm that framing still holds for
each app before deleting its snapshots, don't assume it estate-wide without checking.

## See also

- [README.md](README.md) — decision ledger, full sequencing, cross-cutting rules
- [10-drain-safety.md](10-drain-safety.md) — the live Longhorn/CSI incident this piece's Step 0
  depends on being resolved; the other piece most directly sharing this file's infrastructure
- [17-nvme-replacement.md](17-nvme-replacement.md) — why etcd write volume specifically matters
  for the nodes this cleanup is protecting
- [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md) — the 16 GiB
  node budget that makes apiserver object count a real constraint, not a nice-to-have
- [vault#123](https://github.com/david-driscoll/vault/issues/123) — closed; the fix this piece
  builds on
- [vault#134](https://github.com/david-driscoll/vault/issues/134) — open; the cleanup this piece
  finishes
- [vault#120](https://github.com/david-driscoll/vault/issues/120) — a different stuck
  `ReplicationDestination`; worth the same class of check before deleting retained snapshots
