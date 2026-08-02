### 2026-08-02T02-58-34: CNPG barman-cloud WAL archives go to per-cluster Minio buckets (cnpg-&lt;cluster&gt;), never to a Backblaze bucket name
**By:** seraph
**What:** CNPG barman-cloud WAL archives go to per-cluster Minio buckets (cnpg-&lt;cluster&gt;), never to a Backblaze bucket name
**References:** vault#119, vault#114, david-driscoll/home-operations#630, david-driscoll/equestria-cluster#2988, david-driscoll/stargate-command-cluster#1744, roland, niobe, mouse
**Why:** ## Context

eq#2981 / sgc#1738 enabled barman-cloud WAL archiving but configured the ObjectStore
with `bucket: "{{ .backblaze_bucket }}"` — a Backblaze B2 bucket name sourced from the
`${BACKBLAZE_DATABASE}` 1Password item — while supplying the truenas **Minio** endpoint
and Minio credentials. Those buckets do not exist on Minio, so every
`barman-cloud-wal-archive` failed with NoSuchBucket, surfacing as barman's opaque
`exit status 4` (`GeneralErrorExit`, the catch-all). Nothing was ever archived on
either cluster. (vault#119)

## Decision

1. **CNPG barman-cloud archives live in per-cluster Minio buckets on truenas**, named
   `cnpg-${CLUSTER_CNAME}` (`cnpg-equestria`, `cnpg-sgc`). Not Backblaze B2, and not a
   bucket name derived from a Backblaze secret.

2. **These buckets are provisioned in `home-operations` `stacks/home/index.ts`** as
   `minio.S3Bucket` with `protect: true` + `retainOnDelete: true`. Destroying one
   discards the entire PITR recovery window; a stack destroy must never be able to take
   them.

3. **Never pair a `backblaze_*` templated value with a `minio_*` endpoint or credential**
   in `values.yaml`. The ExternalSecret pulls from two different 1Password items and the
   prefixes are the only thing distinguishing them. The same latent bug still exists in
   the `recovery:` block of both clusters' postgres values (`{{ .backblaze_bucket }}-restore`
   against the Minio endpoint) — inert under `mode: standalone`, wrong the instant a
   restore is attempted.

4. **Ordering is a hard constraint.** barman-cloud does not create buckets. The
   home-operations bucket PR must apply before either cluster PR merges, or the cluster
   just re-arms the same NoSuchBucket loop against a new name.

## Operational notes for the team

- **Barman exit codes are not diagnostic.** From `src/barman/clients/cloud_cli.py`:
  1 = OperationErrorExit, 2 = NetworkErrorExit, 3 = CLIErrorExit, 4 = GeneralErrorExit
  (catch-all). Exit 4 carries no information by design — the real cause is only ever on
  stderr in the `plugin-barman-cloud` sidecar log. Do not diagnose from the Cluster
  condition string.

- **`ContinuousArchiving=True` with no object store configured is meaningless.** CNPG's
  archiver returns success with nothing to upload, so the condition is green and the
  archive is empty. Verify archiving by listing the object store, never by the condition.

- **A stale `LastBackupSucceeded=False / requested plugin is not available` is expected
  at rollout.** The cluster chart creates its ScheduledBackup with `immediate: true`,
  which fires before the instance pods are recreated with the barman sidecar injected.
  It clears on the next backup attempt. Don't chase it as a separate fault.

- **PITR is not established until a restore has been rehearsed.** Archiving working
  means data exists; it does not mean recovery works. vault#114 (PG 17→18) stays gated
  until a restore to a scratch cluster has been performed and timed.

- **The archive is currently single-site.** It lives on the same truenas that holds the
  NFS logical dumps. A NAS loss takes the database and its whole recovery window
  together. Replicating the `barman/` prefix off to B2 is outstanding.

## Not mine, but found while investigating

equestria's `postgres-operator` has 12 restarts in ~3.5h against SGC's 0, with an
identical archiving symptom. Unrelated to barman: it is dying on `leader election lost`
after `Error retrieving lease lock ... context deadline exceeded` against the apiserver,
and the crashes predate the archiving change. That is equestria apiserver reachability —
Roland or Niobe.
