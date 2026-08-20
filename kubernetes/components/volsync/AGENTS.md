# Component

- This is the volsync component
- It's presence as part of a ks.yaml file will add these resources into a given component.
- It provides the **steady-state backup path only**: the `ExternalSecret` holding the restic
  repository credential, the nightly `ReplicationSource`, and the app's `PersistentVolumeClaim`.

## Who consumes this

Components in this repo are referenced by Flux `Kustomization` CRs that live in the *cluster*
repos and use `sourceRef: GitRepository/home-operations`, with `components:` paths relative to
this repo's root (e.g. `../kubernetes/components/volsync`). Those references are invisible to a
`git grep` inside this repo — search the cluster repos, or query the live cluster
(`kubectl get kustomization -A -o json`), before assuming a component is unused.

## Coupling with `components/volsync-restore`

`pvc.yaml` declares `spec.dataSourceRef` -> `ReplicationDestination/${APP}-dst`, which is
supplied by the sibling `components/volsync-restore` component and **not** by this one. That is
deliberate:

- `dataSourceRef` is only consulted when the PVC is first **created**. Once the PVC is `Bound`
  the field is immutable and inert, so the `ReplicationDestination` it names does not have to
  exist for the life of the app. Every volsync app in the estate runs this way today.
- A **brand-new** PVC is the opposite case, and this is the trap. The VolSync volume populator
  claims it, Longhorn stands down (`assuming an external populator will provision the volume`),
  and the populator then waits forever for a `ReplicationDestination` that nothing creates — so
  the PVC never binds and the pod never schedules. Symptom: PVC `Pending`, no Longhorn volume,
  no obvious error. See equestria-cluster#2987 and stargate-command-cluster#1739.
- So on any **first** deploy of an app — whether or not a backup exists to restore from — add
  `components/volsync-restore` to the app's `ks.yaml` `components:` list, let the restore run
  (with no snapshots it is a successful no-op that initializes the repo and binds an empty
  volume), then **remove it again**.

Do not try to fix a stuck PVC by editing `pvc.yaml`: `dataSourceRef` is immutable, and the
populator re-enqueues unbound PVCs, so creating the `ReplicationDestination` is sufficient. Note
also that `kustomization.yaml` stamps `kustomize.toolkit.fluxcd.io/force: enabled` on everything
here — changing an immutable PVC field (`storageClassName`, `dataSourceRef`) makes Flux delete
and recreate the PVC, which destroys the data. Expanding `VOLSYNC_CAPACITY` is safe; changing
storage class is not.

Leaving the `ReplicationDestination` bundled into this component is what caused the **2026-07
Longhorn storage incident**: a `restore-once` trigger that had already fired kept a fully
replicated `${APP}-dst-dest`/`${APP}-dst-cache` PVC pair on disk indefinitely, and the nightly
`volsync-restore-cleanup` CronJob (`30 3 * * *`) reaping them fought Flux recreating them on the
next reconcile — re-running a real restic restore every day. The cluster repos split the
component in 2026-07; this repo carried the bundled shape until vault#120.

## Two storage classes, not one

This component provisions volumes for **two different purposes**, and they deserve
different tiers:

| Variable | Default | Volumes it controls |
|---|---|---|
| `VOLSYNC_STORAGECLASS` | `longhorn` | the app's real data PVC (`pvc.yaml`) — the thing being backed up |
| `VOLSYNC_STAGING_STORAGECLASS` | `longhorn-snapshot` | the mover's throwaway volumes: the `ReplicationSource` staging clone (rebuilt on **every** backup run under `copyMethod: Snapshot`) and the `ReplicationDestination`'s `${APP}-dst-dest` |
| `VOLSYNC_CACHE_SNAPSHOTCLASS` | `longhorn-cache` | the restic metadata cache on both movers (misnamed — it is a storage class, not a snapshot class) |

**These were one variable until 2026-08-19**, so setting `VOLSYNC_STORAGECLASS` used to
silently move the mover's volumes too. That is how the piece-12 Tier-1 migration put
`longhorn-critical` on home-assistant's *backup staging* volume as well as its data
volume — meaning every nightly run cloned the full dataset onto the three control-plane
SATA disks at 3 replicas, which is exactly the bulk churn
[12-longhorn-critical-tier.md](../../../docs/cluster-consolidation/12-longhorn-critical-tier.md)
exists to keep off them.

The rule: **pin the data, not the churn.** An app whose data must live on a restricted
tier sets `VOLSYNC_STORAGECLASS` only, and lets its staging default to
`longhorn-snapshot`.

**The exception is Tier 1**, and it is the reason the critical tier has its own scratch
classes. Piece 12 Phase 5 restricts `longhorn-snapshot` and `longhorn-cache` to `bulk`,
so with the default a Tier-1 app's backup *and* restore have zero schedulable nodes
while the workers are powered down — a tier defined by "survives low power" would stop
backing up in exactly the mode it exists for. Those apps therefore point at
`longhorn-critical-snapshot` / `longhorn-critical-cache` (1 replica each, `nodeSelector:
critical`; see `kubernetes/apps/longhorn-system/storageclass/critical.yaml`):

```yaml
      VOLSYNC_STORAGECLASS: longhorn-critical              # the data
      VOLSYNC_STAGING_STORAGECLASS: longhorn-critical-snapshot   # the churn
      VOLSYNC_CACHE_SNAPSHOTCLASS: longhorn-critical-cache
```

Both scratch variables have to move together — pinning staging to the critical tier and
leaving the cache on `longhorn-cache` still strands the mover once Phase 5 lands.

Longhorn tag selectors are a hard filter with no preference order, so this is binary:
scratch volumes live on the control planes always, or on workers always. There is no
"prefer bulk, fall back to critical". Tier 1 takes the always-critical side and pays
roughly 4.7 GB of nightly writes across the three control-plane SATA disks; everything
else takes the default and keeps that churn on the NVMe workers.

Changing either staging variable is safe on a live app: it only affects the next
throwaway volume the mover creates. Changing `VOLSYNC_STORAGECLASS` on a bound PVC is
**not** — see the `force: enabled` warning above.

## Substitutions worth pinning in the app's `ks.yaml`

- `VOLSYNC_CAPACITY` — the app PVC size. Always set it.
- `VOLSYNC_CACHE_CAPACITY` — the restic metadata cache. The defaults are **asymmetric**
  (`ReplicationSource` 2Gi, `ReplicationDestination` 8Gi), so pin it explicitly rather than
  inheriting an 8Gi `longhorn-cache` volume by accident during a restore.
- `VOLSYNC_PUID` / `VOLSYNC_PGID` — must match the app's runtime user or the mover writes files
  the app cannot read.
