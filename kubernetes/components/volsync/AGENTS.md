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

## Substitutions worth pinning in the app's `ks.yaml`

- `VOLSYNC_CAPACITY` — the app PVC size. Always set it.
- `VOLSYNC_CACHE_CAPACITY` — the restic metadata cache. The defaults are **asymmetric**
  (`ReplicationSource` 2Gi, `ReplicationDestination` 8Gi), so pin it explicitly rather than
  inheriting an 8Gi `longhorn-cache` volume by accident during a restore.
- `VOLSYNC_PUID` / `VOLSYNC_PGID` — must match the app's runtime user or the mover writes files
  the app cannot read.
