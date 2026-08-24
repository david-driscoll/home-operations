# Garage S3 on equestria

In-cluster S3-compatible object storage, managed by
[garage-operator](https://github.com/rajsinghtech/garage-operator), plus an
annotation-driven backup path that reuses the estate's existing backrest
machinery.

## What is where

| Path                                              | What it is                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `kubernetes/apps/garage-system/operator/`          | The operator: OCIRepository + HelmRelease, chart pinned by digest  |
| `kubernetes/apps/garage-system/cluster/`           | The `GarageCluster`, its secrets, the S3 route, the backup key     |
| `components/BackupPlanOrchestrator.ts`             | `S3PreSyncArgs` — the new pre-sync variant                         |
| `components/BackupPlanDirector.ts`                 | Renders the rclone command and `garage.conf` on the backrest host  |
| `stacks/applications/kubernetes-backups.ts`        | `garageBucketBackups()` — the annotation scan                      |

## Topology

Three storage nodes, replication factor 3, one per bulk worker.

```
fluttershy ┐
hard-hat   ├─ 3 x (10Gi metadata + 250Gi data) on longhorn-local
kerfuffle  │     one Garage StatefulSet each, enforced anti-affinity
shining-armor ┘  (3 of the 4 workers; the scheduler picks)
```

Two storage-class decisions carry most of the weight:

- **`longhorn-local`, not `longhorn`.** Garage already keeps three copies.
  The default class keeps three Longhorn replicas underneath, which would be
  **nine** copies of every object and triple the write amplification for
  redundancy Garage is already providing. `longhorn-local` is
  `numberOfReplicas: 1, dataLocality: strict-local` — the same reasoning CNPG
  uses for its Postgres volumes.
- **`pvcRetentionPolicy: Retain` on both `whenScaled` and `whenDeleted`.**
  `longhorn-local` is a `reclaimPolicy: Delete` class. A StatefulSet whose PVC
  retention says `Delete`, sitting on a `Delete`-reclaim class, discards its
  volumes the moment it is scaled to zero — and scaling to zero is a routine
  maintenance and low-power action. This is the mosquitto trap; the retention
  policy is the only thing between a scale-down and losing every object.

### Garage is Tier 2

The storage nodes have **no control-plane toleration**. They live on the bulk
workers, which means Garage goes away in Low Power mode (D6) along with the
rest of the bulk tier.

**Nothing in Tier 0 or Tier 1 may take a hard dependency on it.** Concretely:
Pulumi state and CNPG barman backups stay on the TrueNAS minio where they are.
Those are the things you need *when the cluster is broken*; moving them inside
the cluster is a circular dependency, not a consolidation.

The operator itself *does* tolerate the control plane, so it keeps reconciling
through a low-power window and converges the moment the workers come back.

### What is published, and what is not

`httproute.yaml` publishes the **S3 API only** (`https://s3.${ROOT_DOMAIN}`,
port 3900) on the `internal` gateway.

- **No authentik forward-auth**, unlike every other route in this estate. S3
  clients authenticate with SigV4 and cannot follow an interactive redirect; a
  middleware there would break every client at once while looking like a Garage
  fault. Access control is the `GarageKey` grant.
- **No Admin API (3903) and no RPC (3901).** Admin is the control plane and RPC
  is the mesh. Both stay on the ClusterIP Service.
- **Path-style addressing only** (`https://s3.<domain>/<bucket>/<key>`).
  Virtual-hosted style would need `s3Api.rootDomain`, a wildcard hostname, and a
  wildcard certificate the internal gateway does not carry.
- `webApi` (bucket-as-website) is **off** — nothing needs it, and it is one more
  unauthenticated listener on the pod network.

## Bootstrap

Two secrets must exist in OpenBao before the cluster will start. The operator
would happily generate an RPC secret itself, but that secret *is* the mesh
identity and `GarageKey` material is derived from it — lose it and the store
cannot be reassembled from its PVCs.

```bash
bao kv put secrets/clusters/equestria/apps/garage/rpc-secret \
  password="$(openssl rand -hex 32)"
bao kv put secrets/clusters/equestria/apps/garage/admin-token \
  password="$(openssl rand -hex 32)"
```

Both sit under the `clusters/*` prefix the ESO role already grants, so this
needs no root ceremony. Record them in `bootstrap/INVENTORY.md`.

## Creating a bucket

```yaml
---
apiVersion: garage.rajsingh.info/v1beta1
kind: GarageBucket
metadata:
  name: app-data
  namespace: garage-system
  annotations:
    driscoll.dev/backup: "true"
spec:
  clusterRef:
    name: garage
  quotas:
    maxSize: 50Gi
---
apiVersion: garage.rajsingh.info/v1beta1
kind: GarageKey
metadata:
  name: app-data-rw
  namespace: garage-system
spec:
  clusterRef:
    name: garage
  bucketPermissions:
    - bucketRef:
        name: app-data
      read: true
      write: true
```

The `GarageKey` writes a Secret (default name = the key name) containing
`access-key-id`, `secret-access-key`, `endpoint`, `host`, `scheme`, and
`region`. Note that `endpoint` is the **in-cluster** Service URL; anything
outside the cluster wants `https://s3.${ROOT_DOMAIN}` instead.

Buckets in other namespaces need a `GarageReferenceGrant` in `garage-system`.

## Backup

### Why not VolSync

VolSync backs up PVCs. A Garage storage PVC is a shard of replicated blocks
plus an LMDB metadata database. Snapshotting the three volumes yields something
restorable only by reassembling the whole cluster with the same node
identities — it is not a bucket backup, and it gives you no way to restore one
bucket, let alone one object.

Restic cannot help directly either: its S3 support is for the repository
*destination*, not for reading a bucket as a *source*.

### How it actually works

Mirror the bucket through its S3 API, then snapshot the mirror — which is
exactly the shape the per-stack dockge plans already use, with `rclone sync`
in a `CONDITION_SNAPSHOT_START` hook.

```
GarageBucket (driscoll.dev/backup: "true")
        │
        │  stacks/applications/kubernetes-backups.ts scans for the annotation,
        │  resolves credentials from the Secret labelled
        │  driscoll.dev/garage-backup-credentials
        ▼
BackupPlanItem { source: "celestia", preSync: { type: "s3", ... } }
        │  serialized into the backup-plan inventory (1Password + OpenBao)
        ▼
BackupPlanDirector (stacks/home, on the next run)
        │  writes /opt/stacks-data/backrest/rclone/garage.conf
        │  writes the plan into backrest's config.json
        ▼
backrest on celestia, nightly:
    hook   rclone sync garage-<plan>:<bucket> /data/staging/garage/<cluster>/<bucket>/
    snap   restic backup of that path -> /data/backup/<plan>/
    hook   Gatus heartbeat (success, skipped, or failure)
        ▼
copy jobs replicate the repo to the other Proxmox Backup Servers — for free,
because a bucket plan is an ordinary celestia-sourced plan.
```

Everything downstream of the plan — repo, retention (7 daily / 4 weekly /
3 monthly), prune and check schedules, `skipIfUnchanged`, the 25h Gatus
heartbeat, the cross-PBS copy — is the machinery that was already there. The
only new code is the pre-sync variant and the annotation scan.

### Opting a bucket in

Add `driscoll.dev/backup: "true"` to the `GarageBucket`. Optionally add
`driscoll.dev/backup-exclude` with comma-separated rclone patterns:

```yaml
metadata:
  annotations:
    driscoll.dev/backup: "true"
    # A bare `/dir` matches FILES only. Directories need `/dir/**`.
    driscoll.dev/backup-exclude: "/thumbs/**,/cache/**"
```

Then run the `applications` stack (registers the plan) followed by `home`
(pushes it to backrest). **Until both have run, the annotation does nothing** —
a newly annotated bucket is not backed up on the strength of the manifest
alone.

### Credentials

One read-only `GarageKey` (`garage-backup`, `allBuckets: { read: true }`)
serves every backed-up bucket, so opting a bucket in stays a one-file change.

The trade-off, stated plainly: that key can read **every** bucket in the
cluster, including ones never opted in. It is a read-only credential held by a
backup process — the same trust level restic already has over `/spike` and every
dockge host — but it is not least privilege. A bucket that backrest must not be
able to read needs its own Garage cluster, not a comment.

It cannot write, delete, or reconfigure anything (`owner: false`, no
`createBucket`). A backup that can mutate its source is a backup that can
destroy it.

Credentials land in `garage.conf` on the backrest host (mode 600, owned by
65534) rather than inline in the hook command, so they stay out of `config.json`
and out of backrest's UI, and a rotation is one file write. The file is
deliberately **not** named `rclone.conf`: that name is rclone's default inside
the container's mounted config directory, and writing to it would silently
replace anything a human had put there.

### Operational limits — read before opting in a large bucket

- **Staging is a full second copy.** `/data/staging/garage/` on celestia holds
  an uncompressed mirror of every backed-up bucket. Budget disk there equal to
  the total size of what you opt in, on top of the restic repo in
  `/data/backup/`.
- **The bytes cross the network nightly.** The first sync of a large bucket
  pulls the whole thing from equestria to celestia over the LAN.
- **`rclone sync` compares size and modtime**, so steady-state runs are cheap;
  it is the first run and any bulk rewrite that are expensive.
- **Object versions are not preserved.** The mirror is the current state of the
  bucket; restic's snapshot history is what gives you time travel, at snapshot
  granularity, not object-version granularity.

## Verifying

```bash
kubectl -n garage-system get garagecluster,garagenode
kubectl -n garage-system get garagecluster garage \
  -o jsonpath='{.status.phase}{"\n"}{.status.layoutDiagnosis}{"\n"}'
```

`Ready=True` means the requested shape reconciled. It does not mean anything is
backed up — check the `Backups: Celestia` group in Gatus for that.

## Gotchas

- **Three schedulable bulk workers are required.** With the workers cordoned
  (low power, a node roll) the storage pods stay `Pending` and the cluster never
  reaches Ready. That is expected, not a fault. `cluster/ks.yaml` sets
  `wait: false` precisely so a low-power window does not fail the Kustomization
  and drag its dependents down with it.
- **`replication.factor` is effectively immutable.** Changing it routes through
  a destructive layout rebuild (`status.factorMigration`).
- **`s3Api.region` is baked into every SigV4 signature.** Changing it
  invalidates every configured client at once.
- **The Garage image is deliberately unpinned** (`spec.image` omitted). The
  operator ships a tested digest per release and the compatibility matrix is
  stated per *operator* version. Pinning here would add a second Renovate
  dependency that can drift out of that matrix — and the repo's customManager
  regex updates an annotated `image:` tag but never its `@sha256:` digest, so a
  bump would leave `v2.4.0@sha256:<v2.3.0>` and silently keep running the old
  image.
