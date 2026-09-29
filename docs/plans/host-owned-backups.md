# Backups: hosts own their snapshots, Garage holds the repos, TrueNAS keeps the copy

**Status:** plan, 2026-09-29. Nothing is built. Owner: David. Decisions marked ✅ were taken by
David on 2026-09-29, after a read-only review of the backup estate (repo at `origin/main`, three
nights of Backrest and copy-service logs, upstream source; the evidence is in §A and §B):

- ✅ Every Docker host backs up its own stacks (the review's option 1).
- ✅ Restic repositories move into the geo-replicated Garage for the cases in §C2 (option 4), with
  one bucket per host, plus Immich and pgdump (H1, H10).
- ✅ TrueNAS pulls from Garage over the LAN, through celestia's node, and keeps the independent,
  versioned copy (§C3). Snapshots are kept 1 daily, 4 weekly, 4 monthly and 1 yearly, and
  `pulumi-state` is pulled too (H2, H3, H4).
- ✅ VolSync reaches Garage through celestia's node directly, over the LAN. equestria and celestia
  are co-located, so backups and the nightly restores never cross the tailnet (H5).
- ✅ Postgres dumps stream straight into restic, with no dump files (§C4), and `garage-sync`
  retires (H9).
- ✅ `garage-mirror` retires after phase 4 (H8). The in-cluster buckets are read in place later,
  instead of staged (H7).

The review's other options are not pursued (§G). Every question in [§H](#h-open-questions) is
answered. One choice is deliberately deferred: the mechanism for reading the buckets in place is
picked when phase 5 starts.

## A. Why

### A1. Today's shape

Every Backrest plan runs on celestia (`source: "celestia"` in `stacks/backups/index.ts` and
`stacks/system/application-backups.ts`), so any plan whose data lives elsewhere stages it onto
celestia first.

| Source | Count | How it reaches restic | Copies afterwards |
| --- | --- | --- | --- |
| Docker stacks | 28 plans: celestia 9, alpha-site 11, luna 4, skystar 4 | each host's `rclone-sftp` → an `ON_ERROR_FATAL` pre-sync hook (`rclone sync` over SFTP) → staging tree on celestia → restic | the copy service mirrors every repo to luna and skystar |
| Garage buckets | 4 plans: in-cluster forgejo, git-pages, outline; geo `pulumi-state` | rclone S3 pre-sync → staging tree → restic | the same copies; `garage-mirror` also re-uploads the bucket staging tree into the geo Garage |
| VolSync | 62 apps | movers write restic to TrueNAS over NFS (`volsync-mover-nfs`) | TrueNAS → celestia `/data/backup` (a local rclone copy), then celestia → luna and skystar |
| Immich, k8s pg_dump, old Minio state | 3 plans | restic reads the NFS mount directly | copied to luna and skystar |
| etcd | 1 repo | a restic CronJob writes to the same NFS tree | none (A3.3) |

- The staging tree is `/opt/stacks/backrest/data/staging/` on the celestia Docker LXC. That is
  the 150 GB SSD root disk every stack's `/opt/stacks-data` also lives on, and it sits under
  `/opt/stacks`, which DockgeLxc `rm -rf`s when a stack is removed.
- Celestia's own 9 stacks leave over SFTP and come back to the same machine, although Backrest
  already mounts `/opt/stacks-data` read-only. `pulumi-state` lives on celestia's own Garage node
  and is staged back onto celestia.
- The copy service (`docker/_common/backups/Playground.cs`) runs about 250 `rclone sync` jobs a
  day at fixed UTC times: 62 on celestia and about 97 on each of luna and skystar.
- Luna's Postgres dumps exist in 8 places, 3 of them on luna: the dumps directory, Garage ×3
  (`garage-sync`), celestia's staging tree, celestia's repo, and the repo copies on luna and
  skystar.

### A2. What that costs

- **Staging is a second, uncompressed copy on the wrong disk, and one failed pull fails the whole
  plan.** Most of the exclude list in `components/dockerStackBackups.ts` exists because rclone
  fails a transfer when a file changes mid-copy (Technitium stats, Tailscale logs, Gatus's SQLite,
  the Authentik standby's PGDATA).
- **One serial queue.** Backrest runs one task at a time per instance, and `CLOCK_LAST_RUN_TIME`
  reschedules each plan 24 hours after it *finishes*. Start times drift: `home-operations` started
  at 23:15, then 01:34, then 03:28, and is next due at 06:36, while the copy jobs fire at fixed
  times.
- **Mirrors are not independent copies.** `rclone sync` carries a bad prune or a wiped repo to
  every host within a day, and a copy taken while a repo is being written can be inconsistent
  until the next run.
- **Lag.** A VolSync snapshot taken at 14:00 UTC reaches celestia's `/data/backup` at 10:00 UTC
  the next day and luna and skystar at 04:00 UTC the day after: about 38 hours.

### A3. Live defects (logs 2026-09-27 → 2026-09-29)

1. **Skystar has no fresh backup.** All 4 skystar plans died in the pre-sync on every run in the
   window, each at exactly 10m00s. Backrest's command hook has no timeout (`exec.Command`), so the
   cut happens on the rclone/SFTP/WAN side. The copy tier stays green: `DescribeSnapshotlessRepo`
   only rejects repos with zero snapshots.
2. **Four orphaned plans fail nightly**: `celestia-`, `luna-` and `alpha-site-dockge-docker-prune`,
   and `alpha-site-dockge-pecron-monitor`. `updateBackrestConfiguration` only adds and updates; the
   hand-kept `RETIRED_BACKREST_PLANS` is the only thing it ever removes. Their Gatus endpoints are
   gone, so nothing alerts.
3. **etcd has one copy.** Its repo exists only on TrueNAS. The copy tier finds repos by scanning
   Secrets labelled `volsync=true`, and `talos-etcd-restic-keys` is not labelled.
4. **The off-site Pulumi-state store is copied back on-site.** `alpha-site-dockge-garage-backup`
   qualifies as an ordinary stack plan, so the standalone Garage's live LMDB is file-copied to
   celestia. That is the reason `garage` itself is in `BACKUP_OPT_OUT_STACKS`.
5. **The copy service needs 1Password Connect to start**, although no job uses a secret
   (`GetVaultsAsync` at the top of `Playground.cs`). It will crash-loop once Connect is retired.
6. **One SFTP key everywhere.** The `Rclone SFTP Key` pair is every host's `rclone-sftp`
   authorized key, its copy-job key and Backrest's pre-sync key. Any one host can read every
   other host's `/opt/stacks-data`.
7. **VolSync has no alert of its own.** No PrometheusRule mentions VolSync; the copy-job
   heartbeats are its only freshness signal.

## B. Facts this plan relies on (verified 2026-09-29)

- **Backrest v1.14.1.**
  - Runs one task at a time per instance, and a hook blocks that queue.
  - Has no native repo-to-repo copy.
  - Multihost sync is experimental (since 1.13.0) and moves config and operation history, never
    data.
  - Accepts `--stdin-from-command` as a backup flag (since 1.12.1).
  - Repos take `env` and `flags`; schedules take `cron` with `CLOCK_LOCAL`.
- **`BackupPlanDirector` already supports per-host sources.**
  - Plans whose `source` is the director's cluster become Backrest plans on that host; plans from
    other clusters become copy jobs.
  - The `source` union already includes `luna` and `skystar`.
  - Copy sources are looked up through the PBS server list, which has no alpha-site entry.
- **Where Backrest runs.** It runs on celestia, luna and skystar. `docker/alpha-site/backrest/.ignore`
  (empty) suppresses it on alpha-site, and the alpha-site Docker LXC has no `/data` mount.
- **restic 0.19.1.**
  - The S3 backend's credential chain includes `FileAWSCredentials` (`internal/backend/s3/s3.go`),
    so `AWS_SHARED_CREDENTIALS_FILE` plus `AWS_PROFILE` work, although only environment variables
    are documented.
  - `copy --from-repo` only adds, verifies each blob, and needs `init --copy-chunker-params` to
    keep deduplication.
  - `backup --stdin-from-command` (since 0.17.0) stores a command's output as one file, and
    cancels the snapshot if the command exits non-zero.
  - Garage wants region `garage` (`AWS_DEFAULT_REGION` or `-o s3.region`); path-style addressing is
    restic's default for non-AWS endpoints.
- **Garage v2.4.1.**
  - Has no versioning, object lock, retention or bucket replication.
  - Keys are granted per bucket, so least privilege means one bucket per writer.
  - `stacks/system/garage.ts` already has the helpers: `backupBucket`, `readWriteKey` and
    `deliverCredentialFile`.
  - Every node also answers on its own LAN route, `https://s3.<host>.<root domain>` (Traefik, a
    Let's Encrypt certificate): the per-instance name in `docker/_common/garage/compose.yaml`. Any
    node serves every object, because `replication_factor 3` puts all of them on all three.
- **TrueNAS.**
  - `spike` is a VM on twilight-sparkle, which is not a Garage node.
  - Cloud Sync tasks (rclone underneath) support `PULL` with `SYNC` from an S3-compatible endpoint,
    exclude patterns, and a post-script that runs only on success.
  - `components/truenas/truenas-types.ts` already types `pool.snapshottask.*`; `cloudsync.*` is not
    typed yet.
  - `TruenasVm.addClusterBackup` is the existing pattern for datasets plus NFS shares.
- **CNPG already reaches the geo Garage** through the tailnet egress (`equestriaEndpoint` in
  `garage.ts`, the `garage-s3-backups` grant: `tag:egress` → `tag:dockge` on the S3 port).

## C. Target design ✅

### C1. Every Docker host backs up its own stacks

- **Plans run where the data is.** `source` is the owning host's cluster key, the path is
  `/opt/stacks-data/<stack>/`, and there is no pre-sync. The per-stack excludes become restic
  excludes (`/opt/stacks-data/postgres/pgdata`, …). Plan and repo ids keep today's
  `<dockge-name>-<stack>` form, so history carries over.
- **Backrest takes `rclone-sftp`'s posture.** It runs as uid 0 with `cap_drop: ALL`,
  `cap_add: DAC_READ_SEARCH` and every data mount read-only, so it can read the 0700 app
  directories and cannot write to them. Its `./data` and `./cache` move under
  `/opt/stacks-data/backrest/`, out of the `/opt/stacks` tree DockgeLxc deletes.
- **Repos stay local until phase 4.** On celestia, luna and skystar they stay at
  `/data/backup/<id>/` on the owning host until phase 4 moves them into Garage (§C2). Luna and
  skystar each already hold a copy-job mirror of their own repos at exactly that path, so the move
  keeps history.
- **alpha-site has no `/data`** and so cannot hold local repos. It stays on celestia's pull path
  until its Garage bucket exists (phase 2), then goes straight to the Garage shape. Nothing needs
  to copy its repos, so the PBS-keyed copy lookup never has to learn about it.
- **The config writer owns what it wrote.** It keeps a ledger of the plan and repo ids it emitted
  last run and removes any it no longer emits. Without the ledger, a plan moved to luna keeps
  running on celestia, and celestia's prune keeps rewriting a repo that is now luna's mirror.
- **Schedules are fixed** cron times with `CLOCK_LOCAL`, staggered per host.

### C2. Garage holds the restic repos, for these cases

| Case | Bucket | Writer key | Reached through |
| --- | --- | --- | --- |
| VolSync (62 apps) | `volsync-equestria`, one prefix per app | one rw key for the movers | celestia's node, directly over the LAN (`https://s3.celestia.<root domain>`) ✅ |
| etcd | `volsync-equestria`, prefix `etcd` | the same key | the same route |
| Every other plan a Docker host runs (alpha-site in phase 2, the rest in phase 4) | `backrest-<host>`, one per host | one rw key per host, on its own bucket only | the host's own node (`http://garage:3900` on `dockge_default`); alpha-site through the VIP |
| Immich ✅ | `backrest-immich` | celestia's key, also granted this bucket | celestia's own node; restic still reads the library over NFS |
| k8s pg_dump ✅ | `backrest-pgdump` | one rw key for the CronJob | celestia's node over the LAN, like VolSync; `pg_dump` streams into restic (§C4) |
| Docker hosts' Postgres ✅ | `backrest-<host>`, prefix `postgres` | the host's key | the host's own node; the postgres stack's dump loop streams into restic (§C4) |

**Why celestia's node for VolSync ✅.**
- equestria and celestia share a site, and celestia's node holds a full replica of every object.
  Reads and writes therefore stay on the LAN, and the nightly restore-once cycle (about 64.5 GiB
  each morning) never touches the tailnet. Garage still replicates every write to luna and
  skystar.
- The trade-off: while celestia is down, VolSync backups and restores stop.
- The source and the destination share one Secret per app, so the fallback is a single value (the
  VIP), not a second Secret.

**Immich ✅.** Its library stays on TrueNAS, and Garage becomes its off-TrueNAS, geo-replicated
copy at about today's footprint (the three `/data/backup` copies it replaces). TrueNAS does not pull
`backrest-immich` back (§C3).

**pgdump ✅** no longer lands on TrueNAS at all (§C4), so TrueNAS does pull `backrest-pgdump`.

Three of celestia's plans change only where their repo lives, in phase 4 with the rest:

- **`home-operations`**, unless it is retired first at the end of the Minio rollback window. It
  spends 2–3 hours a night re-scanning a frozen tree.
- **The in-cluster bucket plans** (forgejo, git-pages, outline; about 1.3 MB in total). They keep
  their S3 staging until phase 5 reads them in place (H7).
- **`pulumi-state`.** Its independent copies are alpha-site's standalone Garage and, from phase 2,
  the TrueNAS pull of the bucket itself (H2).

Credentials:

- **Movers and the etcd CronJob** get theirs from OpenBao through an ExternalSecret, the way CNPG
  gets `garage-backup`.
- **Backrest** gets a mode-600 AWS credentials file on the host, delivered by
  `deliverCredentialFile`. The repo's `env` names only the path and profile
  (`AWS_SHARED_CREDENTIALS_FILE`, `AWS_PROFILE`), so no key lands in `config.json` or Backrest's
  UI. That is the same rule `garage.conf` follows today.

Quotas are sized from measured repo sizes in phase 2, inside the 4T-per-node budget. Immich is the
one that may not fit. If it does not fit with margin, Garage's capacity grows first (phase 2,
step 1).

### C3. TrueNAS keeps the independent copy

- **Key.** One read-only Garage key, `truenas-copy`, covers every bucket TrueNAS pulls.
- **Pull.** One Cloud Sync task per bucket: direction `PULL`, mode `SYNC`, into
  `stash/backup/garage/<bucket>`, excluding `locks/**`. Each is scheduled after its writers'
  window, and a post-script pushes to Gatus.
- **Route ✅.** spike reaches celestia's node over the LAN, at `https://s3.celestia.<root domain>`,
  the same way VolSync does. No tailnet grant is needed.
- **Snapshots.** Periodic ZFS snapshot tasks on `stash/backup/garage`, recursive, run after the
  pulls (retention below). The snapshots are the history, and no Garage credential can touch them.
- **Buckets pulled.**
  - `volsync-equestria`, `backrest-pgdump` and the per-host `backrest-<host>` buckets, as they
    come into use.
  - From day one, the buckets that already live in Garage and have no independent copy on TrueNAS:
    `cnpg-equestria`, `pulumi-state` ✅ (H2), and `postgres-{celestia,luna,skystar}` until
    `garage-sync` retires.
- **Never pull back what originated on TrueNAS.** `backrest-immich` is not pulled: the library
  already lives on TrueNAS, so a copy there would sit next to the original.
- **Restores do not need Garage.** Point restic at a ZFS snapshot with `--no-lock`, or at a clone.
  An NFS share, like the ones `addClusterBackup` creates, lets celestia's Backrest browse the copy
  read-only.
- **Managed from Pulumi.** `TruenasVm` gains `addGarageCopy(...)`, and `TrueNASResourceManager`
  gains cloud-sync credential, cloud-sync task and snapshot-task helpers.

**Snapshot retention ✅.** One task per tier. Each has its own naming schema, so TrueNAS keeps
their retention apart.

| Task | Runs | Kept |
| --- | --- | --- |
| daily | every night, after the pulls | 1 |
| weekly | Sundays | 4 |
| monthly | the 1st | 4 |
| yearly | 1 January | 1 |

- **The restic history lives inside each copied repo.** VolSync alone keeps 7 daily, 4 weekly,
  4 monthly and 1 yearly. These tiers only decide how far back a damaged or deleted *repo* can be
  recovered.
- **One daily means a fast catch.** A mirrored failure has to be noticed within a day to get
  yesterday's state back. After that, the fallback is the latest weekly.
- **The yearly snapshot pins pruned data** on `stash` for up to a year. Size the dataset for that.

### C4. Postgres dumps stream into restic ✅

No dump files, anywhere. Each database's `pg_dump` output goes straight into a restic snapshot
(`backup --stdin-from-command`), so no dumps directory is needed and `garage-sync` has nothing left
to mirror.

**Docker hosts: the postgres stack's own loop.**

- **`backup.sh` keeps its hardened loop.** A failed database listing is a failure, a database
  dropped mid-cycle is not, and every cycle pushes to Gatus.
- **Only the write changes.** Instead of a file, each database becomes
  `restic backup --stdin-from-command --stdin-filename <db>.dump --tag db:<db> -- pg_dump -Fc -Z0 -d <db>`,
  plus one snapshot of `pg_dumpall --globals-only`.
- **Dumps are uncompressed.** `-Z0` lets restic's chunker deduplicate them day to day, and restic
  compresses them anyway.
- **The repo** is `s3:http://garage:3900/backrest-<host>/postgres`, written with the host's key.
- **The image.** `postgres-backup` keeps `postgres:18-alpine`, whose `pg_dump` matches the server,
  and gains the restic binary. Either a derived image copies it from the pinned `restic/restic`
  image, or a one-shot service copies it into a shared volume.
- **The loop owns retention:** a weekly
  `restic forget --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune`,
  and a `restic unlock` at start for locks left behind by a killed container.
- **Backrest** registers the repo read-only (`--no-lock`), for browsing.
- **Restore:** `restic dump --tag db:<db> latest /<db>.dump | pg_restore -d <db>`.

**Kubernetes: the pg_dump CronJob.**

- **The same stream.** `kubernetes/apps/database/postgres/backups` streams each database the same
  way (`resources/App.cs` spawns restic instead of writing files) into `backrest-pgdump`, through
  celestia's node over the LAN (the VolSync route).
- **Tools.** Its container already installs `postgresql-client-18`. restic arrives either the same
  way or from an init container that copies the pinned binary into a shared `emptyDir`.
- **Retention** runs in a second CronJob, the way etcd's prune job does.
- **What retires:** the NFS mount of `/mnt/stash/data/pgdump`, and celestia's `pgdump` plan.

### C5. Copies, before and after

| Data | Today | After |
| --- | --- | --- |
| A VolSync app | NFS repo on TrueNAS, then celestia, then luna and skystar; about 38 h to leave celestia | Garage ×3 (celestia, luna, skystar) within minutes of the mover finishing, plus the TrueNAS copy with ZFS history |
| A stack on luna | staged on celestia, repo on celestia, copies on luna and skystar | phase 1: repo on luna, copies on celestia and skystar; phase 4: Garage ×3 plus the TrueNAS copy |
| A stack on alpha-site | staged on celestia, repo on celestia, copies on luna and skystar | phase 2: Garage ×3 plus the TrueNAS copy |
| etcd | TrueNAS only | Garage ×3 plus the TrueNAS copy |
| `cnpg-equestria`, `pulumi-state` | Garage ×3, no history, no independent copy on TrueNAS | the same, plus the TrueNAS copy with ZFS history |
| Immich | repo on celestia, copies on luna and skystar; the library is on TrueNAS | Garage ×3 (phase 4); the library stays on TrueNAS |
| k8s pg_dump | dump files on TrueNAS, a repo on celestia, copies on luna and skystar | streamed into Garage ×3 (phase 3), plus the TrueNAS copy; no dump files |
| A Docker host's Postgres | 8 places for luna's dumps, 3 of them on luna (§A1) | streamed into Garage ×3 (phase 4), plus the TrueNAS copy; no dump files |

### C6. What is gone at the end

- **The SFTP pre-sync path** (phases 1 and 2): the Docker staging tree, `SftpPreSyncArgs` in the
  director, Backrest's `./ssh` mount, and `rclone-sftp`'s view of `/opt/stacks-data`.
- **The copy tier** (phase 4): `rclone-sftp`, the copy service, and the shared `Rclone SFTP Key`.
- **The VolSync NFS path** (phase 3): the VolSync NFS repos, the celestia-local VolSync copies, the
  `volsync=true` label scan, and the mover NFS mount.
- **Dump files** (phases 3 and 4): the Docker hosts' dumps directories, `garage-sync` with its
  `postgres-<host>` buckets and keys, and the NFS pgdump directory.
- **`garage-mirror`** (end of phase 4), with its bucket, key and Gatus group.
- **The S3 pre-sync path** (phase 5): the bucket staging tree, `S3PreSyncArgs` and `garage.conf`,
  once the buckets are read in place.
- **`RETIRED_BACKREST_PLANS`** as a hand-kept list, replaced by the ledger (phase 0).

## D. Rollout, in order

Each phase is its own PR or small set of PRs. Run `pulumi preview` before every `pulumi up`. Exit
criteria are measured over consecutive nights.

### Phase 0 — prerequisites and quick fixes

| Step | Change | Where |
| --- | --- | --- |
| 0.1 | Keep a ledger of emitted plan and repo ids, and remove ids that were emitted before but are not now. Seed it with the four orphans (A3.2). | `components/BackupPlanDirector.ts` |
| 0.2 | Add `garage-backup` to `BACKUP_OPT_OUT_STACKS`; the ledger then removes its plan. | `components/dockerStackBackups.ts` |
| 0.3 | Make the etcd repo visible to today's copy tier: label its Secret `volsync=true` and give it a `RESTIC_REPOSITORY` key, as the VolSync component does. Phase 3 supersedes this. | `kubernetes/apps/kube-system/etcd/externalsecret.yaml` |
| 0.4 | Look up 1Password Connect only when a job names a secret. | `docker/_common/backups/Playground.cs` |
| 0.5 | Default schedules to fixed cron with `CLOCK_LOCAL`, and time the copy jobs after the backup window. | `components/BackupPlanDirector.ts` |
| 0.6 | Run one skystar pre-sync by hand to find what stops it at 10 minutes. Moot once phase 1 reaches skystar. | on celestia |

**Exit:** no orphan failures in Backrest's log for two nights, and an `equestria-volsync-etcd` copy
on luna.

### Phase 1 — celestia, luna and skystar own their backups

1. **Backrest container** (`docker/_common/backrest/compose.yaml`).
   - Run as uid 0 with `cap_drop: ALL` and `cap_add: DAC_READ_SEARCH`.
   - Move `./data` and `./cache` to `/opt/stacks-data/backrest/{data,cache}`.
   - The director's `backrest-rclone-garage-perms` step chowns `garage.conf` to `0:0` instead of
     65534.
2. **One-time chown on each host.** Chown Backrest's config, data and cache, and its own repos
   under `/data/backup`, to root: Backrest no longer runs as 65534 and has no `DAC_OVERRIDE`.
   Repos it only browses (copies, VolSync) keep their owner and get `flags: ["--no-lock"]`.
3. **Plans** (`stacks/backups/index.ts`), for celestia, luna and skystar.
   - `source` = the host's cluster key, `path` = `/opt/stacks-data/<stack>/`, no `preSync`.
   - `planConfig.excludes` is built from `BACKUP_STACK_EXCLUDES`, rewritten as absolute restic
     patterns.
   - Ids stay the same. alpha-site stays on celestia's pull path.
4. **Cutover, one host at a time.**
   - Celestia first: its repos are already local, so only the path changes.
   - Then luna, then skystar. Each already holds a mirror of its repos at the same path.
   - The director then turns those repos into copy jobs on celestia and on the other host, and
     drops the host's own copy job for them. The ledger removes the plans and repos from
     celestia's Backrest.
   - The first snapshot on the new path has no parent, so restic reads everything once (from
     local disk) but uploads little.
5. **`rclone-sftp`** drops `/opt/stacks-data/:/data/stacks/:ro` in `_common`. alpha-site keeps the
   mount through a host override until it moves in phase 2.
6. **After seven green nights**, delete `/opt/stacks/backrest/data/staging/{celestia,luna,skystar}-dockge/`
   on celestia.

- **Verify.**
  - Each host's Backrest lists its own plans, and its `Backups: <Cluster>` group is green in Gatus.
  - Skystar's four plans are green.
  - `restic check` passes on each moved repo.
  - One file restores per host.
- **Rollback.** Revert the `stacks/backups` change. The plans go back to celestia with their
  pre-sync, the repos are untouched (same ids, same paths), and the staging tree is still there
  until step 6.
- **Gatus.** Endpoint names do not change, but on celestia the entries for moved plans now mean
  "copied", not "snapshotted".

### Phase 2 — Garage and TrueNAS foundation; alpha-site moves

1. **Measure.**
   - Read `stash/backup/equestria/volsync` with `TrueNASResourceManager.getDatasetUsage`, and each
     host's `/data/backup/<id>`, including `immich` and `pgdump`. Set the quotas from those
     numbers.
   - If Immich does not fit under the 4T-per-node budget with margin, grow Garage first. The
     `data_dir` capacity in `garage.toml`, the layout's `-c` and the quotas move together, as
     `docs/garage-offsite-s3.md` requires.
2. **`stacks/system/garage.ts`.**
   - Buckets: `volsync-equestria`, `backrest-{celestia,luna,skystar,alpha-site}`,
     `backrest-immich` and `backrest-pgdump`, each with a quota.
   - Keys: one rw key each for the movers and the pg_dump CronJob, and one rw key per host.
     Celestia's also covers `backrest-immich`. The read-only `truenas-copy` key covers every pulled
     bucket.
   - An OpenBao record for each key.
3. **TrueNAS** (`components/truenas/*` and `components/TruenasVm.ts`, called from `stacks/home`).
   - Add `cloudsync.credentials.*` and `cloudsync.*` types and manager helpers, plus a
     `pool.snapshottask` helper.
   - Create one dataset and one Cloud Sync task per pulled bucket, plus the four snapshot tasks
     (§C3).
   - Each task's post-script pushes to Gatus.
4. **Network ✅.** spike reaches celestia's node over the LAN (§C3). Confirm that spike resolves
   `s3.celestia.<root domain>` to celestia's LAN address and can reach it.
5. **Monitoring.** Add a `TrueNAS Garage Copy` Gatus group, with one 25-hour heartbeat per bucket,
   in `stacks/backups/index.ts`.
6. **Start pulling** `cnpg-equestria`, `pulumi-state` and `postgres-{celestia,luna,skystar}`.
7. **alpha-site moves.** It is the first Docker host on Garage and the pilot for phase 4.
   - Delete `docker/alpha-site/backrest/.ignore`.
   - Add alpha-site to the `source` union.
   - `stacks/home` runs a director for alpha-site that emits no copy jobs, because the host has no
     `/data`. `createPlans` takes `pbs` as optional.
   - The plans write to `backrest-alpha-site` through the VIP; the `pulumi-state-backup` loop on
     alpha-site already reads the main cluster, so the path exists.
   - Once it is green, delete the rest of the SFTP pre-sync path (§C6), including alpha-site's
     `rclone-sftp` override and its staging tree.

**Exit.**
- Seven green nights.
- A restore drill without Garage: a `pg_restore` of a dump taken from a TrueNAS snapshot, and a
  barman-cloud listing against the copied `cnpg-equestria` tree.
- One alpha-site stack restored from Garage and from the TrueNAS copy.

### Phase 3 — VolSync, etcd and the k8s pg_dump write to Garage

**Route ✅.** The movers (and the etcd and pg_dump CronJobs) reach celestia's node directly over the
LAN, at
`https://s3.celestia.<root domain>` (`${ROOT_DOMAIN}` in the manifest). The nightly restore-once
reads (about 64.5 GiB) stay on the LAN too. Before the pilot, confirm two things:

- The name resolves to celestia's LAN address from inside the cluster.
- The movers' egress policy allows the route. Today they reach TrueNAS NFS on the LAN. No VolSync
  egress policy lives in this repo, so check the cluster repos as well.

1. **Alert first.** Add a PrometheusRule on VolSync's own metrics (`volsync_volume_out_of_sync`,
   `volsync_missed_intervals_total`). Step 6 removes the copy-job heartbeats, which are its only
   signal today.
2. **Component.** `kubernetes/components/volsync/externalsecret.yaml` learns to emit an S3
   repository in place of the NFS path:
   `RESTIC_REPOSITORY=s3:https://s3.celestia.${ROOT_DOMAIN}/volsync-equestria/${APP}`, the AWS key
   pair and `AWS_DEFAULT_REGION=garage`.
   - It starts as a per-app variable for the migration and becomes the default afterwards.
   - The endpoint is a variable too. While celestia is down, the fallback to the VIP is one change.
   - `volsync-mover-nfs` stops mounting NFS into movers that no longer use it.
3. **Pilot with two small apps.**
   - Run `restic init --from-repo /repository/<app> --copy-chunker-params` against the Garage repo,
     then `restic copy` to bring the history across.
   - Flip the app and let one mover run.
   - Confirm the TrueNAS pull picks up the new prefix.
   - Restore from Garage (a ReplicationDestination) and from the TrueNAS copy.
4. **Everything else.**
   - Give `volsync-lock-canceller` an S3 variant: locks strand on killed movers whatever the
     backend.
   - Migrate the remaining apps in batches of about ten.
   - Then etcd: both CronJobs' `RESTIC_REPOSITORY` → `s3:…/volsync-equestria/etcd`.
5. **The k8s pg_dump CronJob streams into restic** (§C4).
   - `resources/App.cs` pipes each database into `backrest-pgdump`, and a prune CronJob owns
     retention.
   - After a week of green runs, retire celestia's `pgdump` plan and the NFS mount.
   - Keep `/mnt/stash/data/pgdump` read-only until the restic history covers its window, then delete
     it.
6. **Retire.**
   - The director's `volsyncJobTasks` on all three hosts.
   - The `volsync=true` scan in `stacks/system/application-backups.ts`.
   - Backrest's VolSync browse repos, repointed at Garage (read-only key, `--no-lock`).
7. **Old NFS repos.** Keep `stash/backup/equestria/volsync` read-only until its last snapshot passes
   retention (VolSync keeps one yearly), then delete it.

**Exit:**
- All 62 apps, etcd and the pg_dump CronJob have written to Garage for seven nights.
- The nightly restore-once cycle has run green against celestia's node.
- The TrueNAS copy is green.
- One database restores from the streamed dumps with `pg_restore`.
- The drills in §E pass.

### Phase 4 — Docker host repos to Garage; retire the copy tier

1. **Per host (celestia, luna, skystar), the shape alpha-site proved in phase 2.**
   - This covers every plan the host runs. On celestia that includes the bucket plans,
     `pulumi-state`, and `home-operations` unless it has been retired by then.
   - Deliver the AWS credentials file with `deliverCredentialFile`.
   - Set the repo `uri` to `s3:http://garage:3900/backrest-<host>/<plan>`.
   - Put `AWS_SHARED_CREDENTIALS_FILE`, `AWS_PROFILE` and `AWS_DEFAULT_REGION=garage` in the repo's
     `env`.
   - On celestia, Immich goes to `backrest-immich` instead ✅. pgdump already moved in phase 3.
2. **History.** `restic copy` from `/data/backup/<id>` into the new repo (initialised with
   `--copy-chunker-params`), then flip the `uri`. Immich's copy is the long one, so pause its plan
   while it runs.
3. **Postgres dumps stream into restic** (§C4), host by host, alpha-site included.
   - Give `postgres-backup` three things: the restic binary; the repo password (in `.env`, from the
     same OpenBao path as the other repos); and a copy of the host's credentials file that uid 70
     can read.
   - Switch `backup.sh` to streaming.
   - After a week of green cycles, retire `garage-sync`: its container, the
     `Dockge Garage Postgres Sync` Gatus group, the `rclone.env` delivery and the `postgres-<host>`
     keys. Delete the `postgres-<host>` buckets once the restic history covers their 14-day window.
   - Delete the dumps directory. With PGDATA excluded and the dumps gone, the postgres stack's file
     plan protects close to nothing. Check what is left under `/opt/stacks-data/postgres/`; if
     nothing matters, add `postgres` to `BACKUP_OPT_OUT_STACKS`, as `garage` is.
4. **Retire.**
   - Every copy job (`destinationPlans`), because no repo is left on local disk that needs one.
   - `docker/_common/backups`, `docker/_common/rclone-sftp`, and the `Rclone SFTP Key` in the store
     and on every host.
   - `garage-mirror` ✅ (H8): its container, the `Dockge Garage Bucket Mirror` Gatus group, the
     `mirror.env` delivery and its key. Its bucket goes once the bucket repos have their TrueNAS
     copies.
5. **Old local repos.** Keep `/data/backup/<id>` read-only until retention passes (3 monthly), then
   delete them.

**Exit.**
- No rclone copy jobs remain, and `garage-sync` and `garage-mirror` are gone.
- TrueNAS pulling the per-host `backrest-<host>` buckets is green.
- One stack per host restored from Garage and from the TrueNAS copy.
- One Immich file restored from Garage.
- One `pg_restore` per host from its streamed dumps.

### Phase 5 — leftovers

- **`home-operations`:** retire it at the end of its rollback window.
- **Read the buckets in place ✅ (H7).** The in-cluster bucket plans stop staging. The same
  mechanism can then cover `pulumi-state`'s plan. Two candidates (H7):
  - a read-only `rclone mount` inside Backrest's container, with restic's `--ignore-inode` (needs
    FUSE and `SYS_ADMIN`);
  - rustic's S3 source, writing to a rustic-only repo (rustic takes no locks, so it cannot share a
    repo with Backrest).
  - Afterwards, the bucket staging tree, `S3PreSyncArgs` and `garage.conf` go.

## E. Monitoring and restore drills

| Signal | Covers |
| --- | --- |
| `Backups: <Cluster>` (per host, as today) | each Backrest plan's snapshot |
| `TrueNAS Garage Copy` (new) | each bucket's pull, with a 25-hour heartbeat |
| VolSync PrometheusRule (new) | each ReplicationSource being in sync |
| `Dockge Postgres Dumps` (as today) | each host's dump loop, now writing into restic |
| The cluster's failed-Job alerts | the pg_dump and etcd CronJobs |
| Garage's existing TCP checks and `garage status` | the store itself |

**Drills,** at each phase exit and then quarterly:

- Restore one file from a Garage repo.
- Restore the same file from the TrueNAS copy with Garage stopped (restic against a ZFS snapshot,
  `--no-lock`).
- Restore one VolSync app into a scratch PVC from Garage.

**Optional freshness probe.** A weekly `restic snapshots --latest 1` against the TrueNAS copy
that pushes the newest snapshot's age. A sync that ran is not the same as a sync that carried a
new snapshot.

## F. Security, before and after

| | Before | After |
| --- | --- | --- |
| Reading another host's stack data | any host, through the shared SFTP key | no host |
| Destroying backups | a bad prune or wipe on celestia reaches luna and skystar within a day | a host can damage only its own bucket, and the TrueNAS snapshots survive that |
| Backup process privilege | Backrest as 65534; `rclone-sftp` as uid 0 with `DAC_READ_SEARCH` | Backrest as uid 0 with `DAC_READ_SEARCH` and read-only data mounts; `rclone-sftp` gone |
| Credentials | one SSH key pair on every host; bucket keys in `garage.conf` | one Garage key per writer, scoped to that writer's own buckets; TrueNAS holds a read-only key |

**Residual risk.**

- A compromised TrueNAS can destroy the independent copy but not the primary.
- A Garage-wide logical failure at the same moment as losing the home site is not covered.
  Skystar's replica would carry the failure, and TrueNAS is on-site.

## G. Out of scope, noted

- **PBS for the Docker LXCs, and ZFS replication of the copy tier** (the review's options 2 and 3)
  are not pursued.
- **Backrest multihost as a single pane of glass** is worth revisiting once it leaves experimental.
  Today the director deletes the `multihost` and `sync` keys on every run.
- **Fixing VolSync's restore-once cycle itself** belongs to `kubernetes/components/volsync/AGENTS.md`.
  With its reads on the LAN (H5), it no longer blocks phase 3.

## H. Open questions

- **H1 — Immich and pgdump repos into Garage.** ✅ Decided 2026-09-29: yes (§C2).
  - Immich moves in phase 4, sized in phase 2, and is left out of the TrueNAS pull.
  - pgdump streams from the cluster in phase 3 (H9), so TrueNAS pulls it.
- **H2 — Pull `pulumi-state` too.** ✅ Decided 2026-09-29: yes, alongside alpha-site's copy (§C3).
- **H3 — Snapshot retention on TrueNAS.** ✅ Decided 2026-09-29: 1 daily, 4 weekly, 4 monthly,
  1 yearly (§C3).
- **H4 — How TrueNAS reaches Garage.** ✅ Decided 2026-09-29: over the LAN to celestia's node, like
  VolSync. No tailnet grant is needed (§C3).
- **H5 — VolSync's route and its nightly restore-once.** ✅ Decided 2026-09-29: celestia's node,
  directly over the LAN. equestria and celestia are co-located, so the restore-once reads stay local
  (§C2, phase 3). Fixing the cycle itself stays out of scope (§G).
- **H6 — When the copy service can go.** ✅ Answered by H1: every remaining repo moves to Garage in
  phase 4, so the copy service retires at the end of that phase.
- **H7 — Reading the in-cluster buckets.** ✅ Decided 2026-09-29: read them in place, later
  (phase 5); their repos move to Garage in phase 4 either way.
  - **Deferred to phase 5 ✅:** the mechanism. The candidates are a read-only `rclone mount` with
    `--ignore-inode`, or rustic's S3 source writing to a rustic-only repo. Also check Backrest's
    open request for remote sources (#944) then.
- **H8 — `garage-mirror`.** ✅ Decided 2026-09-29: retire it at the end of phase 4.
- **H9 — Postgres dumps.** ✅ Decided 2026-09-29: retire `garage-sync` and stream the dumps into
  restic (§C4):
  - on the Docker hosts, from the postgres stack's own loop;
  - in Kubernetes, from the pg_dump CronJob straight to Garage.
- **H10 — Bucket layout.** ✅ Decided 2026-09-29: one `backrest-<host>` bucket per host, because
  Garage grants are per bucket.
