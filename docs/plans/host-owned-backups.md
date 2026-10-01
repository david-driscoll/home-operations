# Backups: hosts own their snapshots, Garage holds the repos, TrueNAS keeps the copy

**Status:** plan, 2026-09-29. Phase 0 is live (#2205, #2206, #2207); 0.6 is answered (A3.1). Phase 1 started 2026-09-30: celestia (#2208) and luna (#2210) back up their own stacks, and `rclone-sftp` stops exporting them (step 5). skystar follows when it is back. Phase 2 started 2026-10-01 with TrueNAS pulling the buckets already in Garage (steps 3–6), and alpha-site writes its repos to Garage (#2215, #2216). Phase 3 started the same day: VolSync alerts on its own metrics (#2217), each app can switch to Garage on its own (#2218), and the pilot moves kapowarr and rustdesk (step 3). Owner: David. Decisions marked ✅ were taken by
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
   window, each at exactly 10m00s. The copy tier stays green: `DescribeSnapshotlessRepo` only
   rejects repos with zero snapshots.
   - **The cause (found in phase 0, step 0.6):** the whole skystar site has been off the tailnet
     since 2026-08-31 14:19 UTC. Its Proxmox host and its three LXCs (`dockge-skystar`,
     `pbs-skystar`, `dns-skystar`) all dropped off within four seconds of each other, and the
     `ocracoke` Stack is disabled for the same reason. Each pull is a connection that never
     completes: rclone's 1-minute connect timeout, times its 10 low-level retries, is the 10m00s.
     Backrest's command hook has no timeout of its own (`exec.Command`).
   - **What that means while skystar is away:** Garage runs on celestia and luna only, both on
     the home site, and skystar receives no copies. Nothing in the estate has an off-site copy.
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
  - The VIP is `https://garage-s3.<tailnet>`, on 443 only (`tailscale serve` into each node's
    Traefik); `:3900` on it is refused (#2200). On a Docker host, `http://garage:3900` on
    `dockge_default` reaches the local node directly.
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
  `cap_add: DAC_READ_SEARCH, DAC_OVERRIDE, FOWNER` and every data mount read-only. It can read the
  0700 app directories and cannot write to them. The two write capabilities cover its own
  65534-owned state (as built in phase 1, step 1). Its `./data` and `./cache` move under
  `/opt/stacks-data/backrest/`, out of the `/opt/stacks` tree DockgeLxc deletes, once nothing
  stages there any more.
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
| VolSync (62 apps) | `volsync-equestria`, one prefix per app | one rw key for the movers | celestia's node, directly over the LAN: its LAN address, `http://…:3900` (phase 3, "Route") ✅ |
| etcd | `volsync-equestria`, prefix `etcd` | the same key | the same route |
| Every other plan a Docker host runs (alpha-site in phase 2, the rest in phase 4) | `backrest-<host>`, one per host | one rw key per host, on its own bucket only | the host's own node (`http://garage:3900` on `dockge_default`); alpha-site through celestia's node (`dockge-celestia:3900`), since no grant lets a Docker host reach the VIP |
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

- **Key.** One read-only Garage key, `truenas-copy`, covers every bucket TrueNAS pulls, except
  `pulumi-state`. That bucket lives outside Pulumi, so it is pulled with the ceremony's read-only
  `pulumi-state-reader` key instead (phase 2, step 6).
- **Pull.** One Cloud Sync task per bucket: direction `PULL`, mode `SYNC`, into
  `stash/backup/garage/<bucket>`, excluding `locks/**`. Each is scheduled after its writers'
  window, and a post-script pushes to Gatus.
- **Route ✅.** spike reaches celestia's node at `https://s3.celestia.<root domain>`.
  - **As built, it goes over the tailnet**, not the bare LAN (found 2026-10-01, phase 3). DockgeLxc
    publishes that name as a CNAME to celestia's tailnet address. spike is on the tailnet as
    `tag:shared-drive`, and `default-apps-access` lets tagged devices reach `tag:dockge` on 443.
    The two peers connect directly, so the packets still stay on the LAN, inside WireGuard.
  - **That grant is meant for people.** Narrowing it would cut the pulls off. `garage-s3-vip-egress`
    guards Pulumi state's path against the same risk, so a dedicated grant like it, with a policy
    test, is the follow-up.
    - ✅ Done: the `garage-truenas-copy` grant (`stacks/unifi-network/acl-manager.ts`) allows
      `tag:shared-drive` → `tag:dockge` on 443 alone. Two guards back it, as with
      `garage-s3-vip-egress`: a policy test Tailscale enforces, and an `assertGrantPath` that
      fails the run before a policy without the path is written.
  - **Not the movers' route.** VolSync uses celestia's LAN address over plain HTTP (phase 3,
    "Route"). TrueNAS keeps HTTPS, because `cnpg-equestria` and `pulumi-state` are not encrypted
    client-side.
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
  - ✅ The restic buckets' copies now have read-only exports (phase 3, step 3), and
    `garage-copy-drill` restores from them.
- **Managed from Pulumi.** `configureGarageCopy` (`components/truenas.ts`), called from
  `stacks/system`, configures spike from the list in `components/garageTruenasCopy.ts`.
  `TrueNASResourceManager` gains cloud-sync credential, cloud-sync task and snapshot-task helpers
  (phase 2, step 3).

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

### How a change reaches the hosts

- **Two paths.** Each host's own Stack applies the compose files under `docker/` straight from the
  checkout. A plan change takes two hops: `backups` writes the inventory (OpenBao
  `clusters/_inventory/backup-plan`), and each director reads it when its Stack next runs
  (`home-operations` for celestia, `gulf-of-mexico` for luna).
- **The operator does not order those runs.** On a new commit all three Stacks start on their own.
  `prerequisites: [backups]` only asks that `backups` succeeded at some point before. On four
  commits in a row (2026-09-29 → 09-30, #2208 among them) `home-operations` ran before `backups`
  and read the previous inventory.
- **The resync catches up:** hourly for `gulf-of-mexico`, daily for `home-operations`. So a plan
  change can take a day to reach celestia's Backrest.
- **So, for every plan change:**
  - After merging, check that `home-operations` started after `backups` finished
    (`kubectl get updates.auto.pulumi.com -n pulumi`). If it did not, re-run it with
    `kubectl annotate stack -n pulumi home-operations pulumi.com/reconciliation-request=$(date +%s) --overwrite`.
  - A compose change that is only safe once the directors have read the new inventory goes in a
    later PR. That is why step 5 is not part of luna's cutover.

### Phase 0 — prerequisites and quick fixes

| Step | Change | Where |
| --- | --- | --- |
| 0.1 | Keep a ledger of emitted plan and repo ids, and remove ids that were emitted before but are not now. Seed it with the four orphans (A3.2). ✅ Live 2026-09-29 (#2205). The first run surfaced seven silent leftovers: celestia's `forgejo`, `hermes` and `homelable` (moved to the cluster, or ignored) and skystar's four (no `hosts/dockge` record while `ocracoke` is disabled). The seed now applies on every run and lists their plans; their repos stay as archives. | `components/backrestLedger.ts` |
| 0.2 | Add `garage-backup` to `BACKUP_OPT_OUT_STACKS`; the ledger then removes its plan. | `components/dockerStackBackups.ts` |
| 0.3 | Make the etcd repo visible to today's copy tier: label its Secret `volsync=true` and give it a `RESTIC_REPOSITORY` key, as the VolSync component does. Phase 3 supersedes this. | `kubernetes/apps/kube-system/etcd/externalsecret.yaml` |
| 0.4 | Look up 1Password Connect only when a job names a secret. | `docker/_common/backups/Playground.cs` |
| 0.5 | Default schedules to fixed cron with `CLOCK_LOCAL`, and time the copy jobs after the backup window. | `components/BackupPlanDirector.ts` |
| 0.6 | ✅ Answered: skystar has been offline since 2026-08-31 (A3.1). No code change; its plans recover when the site is back. | — |

**Exit:** no orphan failures in Backrest's log for two nights, and an `equestria-volsync-etcd` copy
on luna.

### Phase 1 — celestia, luna and skystar own their backups

1. **Backrest container** (`docker/_common/backrest/compose.yaml`). ✅ Built with celestia's
   cutover.
   - Runs as uid 0 with `cap_drop: ALL`, `cap_add: DAC_READ_SEARCH, DAC_OVERRIDE, FOWNER`, and
     `no-new-privileges`.
   - **Changed from the plan:** the two write capabilities replace the one-time chown and the
     `--no-lock` flags (the old step 2). Everything Backrest writes was created as 65534: the repos,
     config, data, cache and the S3 staging tree. `DAC_OVERRIDE` keeps that writable, and `FOWNER`
     lets rclone's S3 pre-sync set modtimes on it. Every data mount stays `:ro`, so the extra reach
     is the backup system's own storage. `garage.conf` stays 65534-owned; `DAC_READ_SEARCH` reads
     it.
   - **Deferred:** moving `./data` and `./cache` under `/opt/stacks-data/backrest/`. The staging
     tree lives in `./data`, `garage-mirror` reads it by host path, and alpha-site's pre-sync and
     the bucket plans still use it. Move it once they don't (phase 2 for alpha-site, phase 5 for
     the buckets).
2. *(Folded into step 1.)*
3. **Plans** (`stacks/backups/index.ts`), for celestia, luna and skystar. ✅ The mechanism is
   `HOST_OWNED_BACKUP_HOSTS` plus `resticExcludesFor` (`components/dockerStackBackups.ts`).
   - `source` = the host's cluster key, `path` = `/opt/stacks-data/<stack>/`, no `preSync`.
   - `planConfig.excludes` is built from `BACKUP_STACK_EXCLUDES`, rewritten as absolute restic
     patterns.
   - Ids stay the same. alpha-site stays on celestia's pull path.
4. **Cutover, one host at a time.**
   - **Celestia first** (in its own PR): its repos are already local, so only the path changes.
     The plan ids, repo ids and Gatus tokens stay the same, and Backrest's `forget` keeps one
     retention series across the path change, because it groups by tag (`--group-by ""`).
     ✅ Merged 2026-09-30 (#2208). The container change applied at once. The plan change did not,
     because `home-operations` ran before `backups` on that commit (see "How a change reaches the
     hosts" above). It reached celestia's Backrest with the next commit, on 2026-10-01 at 00:09 UTC.
   - **Then luna**, in its own PR, with step 5 in a later one. Luna already holds a mirror of its
     four repos (neo4j, postgres, technitium, traefik) at the same path, and Backrest adopts an
     existing repo rather than re-initialising it (its `init` is a no-op once `restic cat config`
     succeeds). ✅ Merged 2026-10-01 (#2210). Both directors ran before `backups` again, which
     wrote the inventory at 00:12 UTC. Luna takes the cutover on its hourly resync, and celestia
     with step 5's commit.
     - The director turns those repos into copy jobs on celestia and on the other host, and drops
       the host's own copy job for them. The ledger removes the plans and repos from celestia's
       Backrest, since celestia emitted them before.
     - ✅ As built, the director also treats every repo a host receives as a copy as owned. Such an
       id is removed from that host's Backrest whether or not its ledger recorded it, and an id a
       host both runs and receives fails the run. A copied repo never gets a second writer, even
       if celestia's ledger is lost.
     - Merge after luna's 16:00 UTC copy and before about midnight local. Luna's mirror then
       carries celestia's latest snapshot, and the switch is done before the 01:00 queue.
     - Either Stack order is safe. If `home-operations` reads the old inventory, celestia goes on
       snapshotting luna's stacks next to luna's own Backrest until it re-runs, and its copy of
       each repo is then replaced by luna's. Nothing is lost: luna's repo holds those nights too.
     - Backrest's `forget` also filters by `created-by:<instance>`. So luna never prunes the
       snapshots celestia made in those repos: at most one retention window's worth per repo,
       frozen. Remove them by hand if they matter.
   - **skystar** joins when it is back online. It has no `hosts/dockge` record while `ocracoke` is
     disabled.
   - The first snapshot on the new path has no parent, so restic reads everything once (from
     local disk) but uploads little.
5. **`rclone-sftp`** drops `/opt/stacks-data/:/data/stacks/:ro` in `_common`. This goes in its own
   PR, merged once both directors have applied luna's cutover, so celestia's Backrest no longer
   lists luna's plans. Merged together with the cutover, it could remove the export while celestia
   still pulls from it. Host overrides keep the mount wherever a host is still pulled:
   - alpha-site, until it moves in phase 2;
   - skystar, until its own cutover, so its plans still recover when it is back (0.6).

   ✅ As built: `docker/{alpha-site,skystar}/rclone-sftp/compose.yaml` are the old `_common` file,
   identical apart from their comments, and `HOST_OWNED_BACKUP_HOSTS` says to delete a host's copy
   when the host joins it. alpha-site's went after its first green night (phase 2, step 7). The PR only needs `backups` to have written
   luna's inventory before it merges. Its own commit then re-runs `home-operations`, which reads
   that inventory and stops pulling luna, whichever Stack runs first.
6. **After seven green nights**, delete `/opt/stacks/backrest/data/staging/{celestia,luna,skystar}-dockge/`
   on celestia.

- **Verify.**
  - Each host's Backrest lists its own plans, and its `Backups: <Cluster>` group is green in Gatus.
  - Skystar's plans are green once it is back.
  - `restic check` passes on each moved repo.
  - One file restores per host.
- **Rollback.** Revert the `stacks/backups` change. The plans go back to celestia with their
  pre-sync, the repos are untouched (same ids, same paths), and the staging tree is still there
  until step 6.
  - Keep the container change. From the first root run on, the repos hold root-owned files that a
    uid-65534 Backrest cannot read.
  - Rolling luna back needs its `/data/stacks` export, so revert step 5 first if it has landed.
    Merge after celestia's 16:00 UTC copy: the same window, in reverse.
- **Gatus.** Endpoint names do not change, but on celestia the entries for moved plans now mean
  "copied", not "snapshotted". The copy service re-runs every job an hour after its job list
  changes, so a cutover leaves no gap in the 25 h heartbeat.

### Phase 2 — Garage and TrueNAS foundation; alpha-site moves

1. **Measure.**
   - Read `stash/backup/equestria/volsync` with `TrueNASResourceManager.getDatasetUsage`, and each
     host's `/data/backup/<id>`, including `immich` and `pgdump`. Set the quotas from those
     numbers.
   - If Immich does not fit under the 4T-per-node budget with margin, grow Garage first. The
     `data_dir` capacity in `garage.toml`, the layout's `-c` and the quotas move together, as
     `docs/garage-offsite-s3.md` requires.
   - **Deferred (2026-10-01):** the repos could not be read from where this ran, so David set every
     new quota to 100 GiB. Measure each repo in the change that first points a writer at its bucket,
     and raise the quota there. VolSync (phase 3) and Immich (phase 4) are the likely ones.
   - ✅ **VolSync, measured in phase 3 (step 2):** `volsync-equestria` goes to 300 GiB, and
     `garage-mirror` comes down from 2 TiB to 1 TiB (it holds about 1.3 MB) to keep the quotas under
     the 4T share. The numbers are in phase 3, step 2.
2. **`stacks/system/garage.ts`.**
   - Buckets: `volsync-equestria`, `backrest-{celestia,luna,skystar,alpha-site}`,
     `backrest-immich` and `backrest-pgdump`, each with a quota.
   - Keys: one rw key each for the movers and the pg_dump CronJob, and one rw key per host.
     Celestia's also covers `backrest-immich`. The read-only `truenas-copy` key covers every pulled
     bucket.
   - An OpenBao record for each key.
   - ✅ **In part, first (#2213):** the `truenas-copy` key, with read on `cnpg-equestria` and
     `postgres-{celestia,luna,skystar}`, and its record at `clusters/spike/apps/garage/copy`.
   - ✅ **The rest:**
     - All seven buckets, at 100 GiB each (step 1).
     - A writer key for each, with its record: `clusters/equestria/apps/volsync/garage`,
       `clusters/equestria/apps/postgres/garage-pgdump`, and `clusters/<host>/apps/backrest/garage`.
       Celestia's key also writes `backrest-immich`.
     - Each host's key also arrives on the host as `/opt/stacks-data/backrest/aws-credentials`
       (root, mode 600, profile `backrest`; `components/backrestGarage.ts`). skystar's arrives
       when it is back.
     - Nothing writes to these buckets yet, and TrueNAS adds each one to its pulls as it comes
       into use.
3. **TrueNAS** (`components/truenas/*` and `components/TruenasVm.ts`, called from `stacks/home`).
   - Add `cloudsync.credentials.*` and `cloudsync.*` types and manager helpers, plus a
     `pool.snapshottask` helper.
   - Create one dataset and one Cloud Sync task per pulled bucket, plus the four snapshot tasks
     (§C3).
   - Each task's post-script pushes to Gatus.
   - ✅ **As built, from `stacks/system` instead of `stacks/home`.** `configureGarageCopy`
     (`components/truenas.ts`) runs in the stack that mints `truenas-copy`, so one run creates the
     key and hands it to TrueNAS, the way `deliverCredentialFile` hands keys to the Docker hosts.
     From `stacks/home` it would race the key's creation ("How a change reaches the hosts").
     - `stacks/system` resyncs every five minutes, so every write is conditional on a difference
       (the matchers in `truenas-manager.ts`). A steady-state run is one login and a few queries.
       The cadence is also the retry, and it puts back anything edited by hand.
     - It never fails the stack, because that stack also mints every app's database
       credentials. A failure is a warning in the run log and `skipped` in the `garage` stack
       output.
     - Managed tasks are described `garage-copy: <bucket>`. A task whose bucket leaves the list
       is deleted; its dataset and snapshots stay.
     - The list of buckets and keys is `components/garageTruenasCopy.ts`, shared with
       `stacks/backups`.
4. **Network ✅.** spike reaches celestia's node over the LAN (§C3). Confirm that spike resolves
   `s3.celestia.<root domain>` to celestia's LAN address and can reach it. The first scheduled
   pull confirms it: a failure shows in the TrueNAS task and, a day later, as a red heartbeat.
5. **Monitoring.** Add a `TrueNAS Garage Copy` Gatus group, with one 25-hour heartbeat per bucket,
   in `stacks/backups/index.ts`. ✅ Built. TrueNAS runs the post-script only after a successful
   pull, so a failed pull is silence and the window is what pages.
6. **Start pulling** `cnpg-equestria`, `pulumi-state` and `postgres-{celestia,luna,skystar}`. ✅
   Built: daily at 13:00 local, then snapshots at 18:00. `pulumi-state` uses the ceremony's
   `pulumi-state-reader` key (`apps/pulumi/state-s3-reader`), because `stacks/system` has no
   bucket id to grant `truenas-copy` on (docs/garage-offsite-s3.md).
7. **alpha-site moves.** It is the first Docker host on Garage and the pilot for phase 4.
   - Delete `docker/alpha-site/backrest/.ignore`.
   - Add alpha-site to the `source` union.
   - `stacks/home` runs a director for alpha-site that emits no copy jobs, because the host has no
     `/data`. `createPlans` takes `pbs` as optional.
   - The plans write to `backrest-alpha-site` through celestia's node at
     `http://dockge-celestia.<tailnet>:3900`, the path the `pulumi-state-backup` loop on alpha-site
     already takes (the `garage-mesh` grant). The garage-s3 VIP would follow whichever node is up,
     but it needs a tag:dockge grant on 443 first. Its key arrives as
     `/opt/stacks-data/backrest/aws-credentials` (step 2).
   - Once it is green, delete the rest of the SFTP pre-sync path (§C6), including alpha-site's
     `rclone-sftp` override and its staging tree.
   - ✅ **As built:**
     - **Inventory.** `GARAGE_BACKED_HOSTS` in `stacks/backups` makes alpha-site host-owned with
       its repos in Garage. Each plan carries `garage: {endpoint, bucket}` and nothing secret.
     - **Repos.** The director writes a Garage repo as
       `s3:<endpoint>/backrest-alpha-site/<repo id>`. Its env names the key file and profile, and it
       runs with `-o s3.region=garage -o s3.bucket-lookup=path` (`components/backrestGarage.ts`).
     - **Copies.** No host copies a Garage repo.
     - **Hosts without a backup server.** A host with none takes no copies, browses no VolSync
       repos, and fails the run if a plan would keep a local repo there.
     - **Resource names.** `stacks/home` now runs two directors, so `backrest-restart` and the
       rclone permissions Command are named per host. celestia, luna and skystar keep theirs
       through an alias, so nothing is replaced.
     - **The repos start fresh** (David, 2026-10-01). The old ones stay on celestia, with luna's
       copies, as a frozen archive that nothing prunes. Delete them once the new repos hold a
       retention window of their own. To browse one, add it in celestia's Backrest as a local repo
       at `/data/backup/<id>/` with the Volsync Password.
     - **TrueNAS** pulls `backrest-alpha-site`.
     - **Gatus.** alpha-site's rows move from `Backups: Celestia`, and from luna's copies, to a new
       `Backups: Alpha Site` group.
     - **SFTP clean-up, in parts.** alpha-site's first night, 01:00 local on 2026-10-01, was green:
       all 10 plans went to Garage, with no warning or error in Backrest's log.
       - ✅ Its `rclone-sftp` override is gone, so the host falls back to the `_common` file. That
         file exports the repos and not `/opt/stacks-data`.
       - Its staging tree on celestia waits for seven green nights, as phase 1, step 6 does for
         the other hosts' trees.
       - The rest of §C6's pre-sync path stays while skystar can still come back in the pulled
         shape (0.6): `SftpPreSyncArgs`, Backrest's `./ssh` mount, and skystar's own override.
         It goes when skystar's cutover is decided.

**Exit.**
- Seven green nights.
- A restore drill without Garage: a `pg_restore` of a dump taken from a TrueNAS snapshot, and a
  barman-cloud listing against the copied `cnpg-equestria` tree.
- One alpha-site stack restored from Garage and from the TrueNAS copy.

### Phase 3 — VolSync, etcd and the k8s pg_dump write to Garage

**Route ✅.** The movers (and the etcd and pg_dump CronJobs) reach celestia's node directly over the
LAN. The nightly restore-once reads (about 64.5 GiB) stay on the LAN too. The plan named
`https://s3.celestia.<root domain>` and listed two things to confirm before the pilot. Checked from
a pod on 2026-10-01:

- **The name does not resolve to a LAN address.** DockgeLxc publishes it as a CNAME to celestia's
  tailnet address, and no pod can route there, so the connection times out. celestia's LAN address
  (10.10.18.4) works: plain S3 on 3900 answers in about a millisecond, and so does HTTPS through
  traefik with the name pinned to that address.
- **No egress policy is in the way.** The cluster has no CiliumClusterwideNetworkPolicy, and the two
  namespaced policies in `equestria` select only their own apps' pods (navidrome,
  supersync-coordinator), for ingress.

So the movers use `http://<celestia's LAN address>:3900`, from the `ipAddress` celestia's DockgeLxc
records (`stacks/unifi-network` pins it with a DHCP reservation). Plain HTTP suits restic: every
pack is encrypted before it leaves the pod, and SigV4 never sends the secret key. The same reasoning
covers the pg_dump stream (§C4), which is restic too. TrueNAS keeps the HTTPS name (§C3).

1. **Alert first.** Add a PrometheusRule on VolSync's own metrics (`volsync_volume_out_of_sync`,
   `volsync_missed_intervals_total`). Step 6 removes the copy-job heartbeats, which are its only
   signal today.
   ✅ As built (`kubernetes/apps/volsync-system/volsync/prometheusrule.yaml`), two alerts:
   - `VolSyncControllerAbsent`: no healthy `volsync-metrics` target for 15 minutes.
   - `VolSyncBackupOutOfSync`: `volsync_volume_out_of_sync{role="source"} == 1` for an hour.
     It covers sources only, because the restore-once destinations run on demand. Missed
     intervals are the same signal, so they get no rule of their own.

   At the time it shipped, all 51 ReplicationSources readable from here had synced in the last 12
   hours, so neither alert fires on arrival.
2. **Component.** `kubernetes/components/volsync/externalsecret.yaml` learns to emit an S3
   repository in place of the NFS path:
   `RESTIC_REPOSITORY=s3:https://s3.celestia.${ROOT_DOMAIN}/volsync-equestria/${APP}`, the AWS key
   pair and `AWS_DEFAULT_REGION=garage`.
   - It starts as a per-app variable for the migration and becomes the default afterwards.
   - The endpoint is a variable too. While celestia is down, the fallback to the VIP is one change.
   - `volsync-mover-nfs` stops mounting NFS into movers that no longer use it.

   ✅ As built. No app moves in this step; every app renders as before, apart from the additions
   below. The switch is documented in `kubernetes/components/volsync/AGENTS.md`.
   - **The switch is `VOLSYNC_BACKEND`** (`nfs` by default, or `garage`), set in the app's
     `ks.yaml`. In the ExternalSecret's template it picks `RESTIC_REPOSITORY`:
     `s3:<endpoint>/volsync-equestria/${APP}` or `/repository/${APP}`. Source and destination
     share the Secret, so they move together.
   - **Endpoint, bucket and key come from the OpenBao record**
     (`clusters/equestria/apps/volsync/garage`), so the manifest names no host. The fallback is
     one change to that record in `stacks/system/garage.ts`.
     - Every app's Secret now extracts the record and carries the AWS key pair. restic ignores the
       pair for a local repo.
     - The record already existed, and `eso-equestria` reads all of `clusters/*`. That matters
       because ESO fails a whole ExternalSecret on one bad extract.
   - **The record's endpoint is celestia's LAN address** ("Route" above). If celestia's DockgeLxc
     record is missing or off the Home subnet, `stacks/system` fails the run rather than hand the
     movers an unreachable address. The TrueNAS record keeps the HTTPS name.
   - **NFS stays off Garage movers.** The ReplicationSource and ReplicationDestination label their
     mover pods `driscoll.dev/volsync-backend: <value>` (`moverPodLabels`). `volsync-mover-nfs`
     gains a guarded matchCondition that skips `garage`, so a TrueNAS outage cannot hold up a
     Garage backup.
   - **The inventory scan skips `s3:` repositories** (`stacks/system/application-backups.ts`), so a
     moved app leaves the copy tier. The hosts' ledgers remove its copy job and browse repo, and
     the copies already on disk stay. This brings forward the part of step 6 that concerns moved
     apps.
   - **TrueNAS pulls `volsync-equestria`**, empty for now, so the pilot can confirm a new prefix
     arrives.
   - **Quota: 300 GiB**, against the 100 GiB placeholder (phase 2, step 1).
     - The 62 apps' latest snapshots hold 99.5 GiB. The registry cache alone is 44.3 GiB, and Plex
       13.4 GiB.
     - The 15 repos that pruned in Loki's three-day window came to about 0.7× their snapshot size,
       history included, so the full set is roughly 90–145 GiB.
     - `garage-mirror` comes down from 2 TiB to 1 TiB, which keeps every quota summed at about
       2.75 TiB, under the 4T share.
   - **Not yet:** `volsync-lock-canceller` scans only the NFS share until step 4, so a stranded Garage
     lock is cleared with `VOLSYNC_UNLOCK`.
3. **Pilot with two small apps.**
   - Run `restic init --from-repo /repository/<app> --copy-chunker-params` against the Garage repo,
     then `restic copy` to bring the history across.
   - Flip the app and let one mover run.
   - Confirm the TrueNAS pull picks up the new prefix.
   - Restore from Garage (a ReplicationDestination) and from the TrueNAS copy.

   ✅ Started 2026-10-01 with `kapowarr` and `rustdesk`, the two smallest repos (about 400 KiB and
   17 KiB).
   - **The copy is a Job**, `kubernetes/apps/volsync-system/garage-history-copy`. It uses the
     lock-canceller's restic pin, runs as uid 568, and mounts the NFS share. It runs the two
     commands above for each app in `APPS`, and finishes by logging both snapshot counts.
     - Every batch reuses it: edit `APPS` in the same change as the apps' `VOLSYNC_BACKEND`.
     - The force label has Flux recreate it, because a Job's spec is immutable.
     - It is safe to re-run, and safe in either order with an app's first Garage backup.
   - **Checks, in the order they come due:**
     - The Job finishes, and the Garage snapshot count matches the NFS one.
     - The 14:00 UTC movers back up into Garage, with no NFS volume on their pods.
     - The 13:00-local pull carries both prefixes into `stash/backup/garage/volsync-equestria`.
     - The next nightly restore-once restores both apps from Garage.
     - The hosts drop both apps' copy jobs.
   - **The TrueNAS-copy restore.**
     - **Built: an export for each restic bucket's copy.** `configureGarageCopy` gives every
       bucket marked `restic: true` in `GARAGE_COPY_BUCKETS` a read-only NFS export of its own
       dataset, mapped to `apps`. Today that is `volsync-equestria` and `backrest-alpha-site`.
       - Each bucket's copy is its own dataset, so the CNPG archive, the Postgres dumps and the
         Pulumi state, none of them encrypted client-side, are never exported.
       - `ensureNFSShare` now writes only when a share differs, as the other TrueNAS helpers do.
     - **Built: the drill**, `kubernetes/apps/volsync-system/garage-copy-drill`. It restores each
       app in `APPS` from the copy with `--no-lock`, with no Garage involved, and prints Garage's
       newest snapshot beside the copy's.
       - Run it again at each phase exit by changing `APPS` or its `driscoll.dev/drill`
         annotation.
       - Merge only after a pull has landed, or the Job finds no repository and fails.
4. **Everything else.**
   - Give `volsync-lock-canceller` an S3 variant: locks strand on killed movers whatever the
     backend.

     ✅ As built: `lock-canceller-garage`, a release of its own in
     `kubernetes/apps/volsync-system/lock-canceller`, so a TrueNAS outage cannot stop it starting.
     It runs hourly at :35 with the NFS canceller's 6-hour rule.
     - An rclone init container lists the bucket's repositories and those holding a lock object
       older than 6 hours.
     - restic's own `unlock` then removes only the locks it judges stale, the same second guard
       the NFS canceller relies on.
   - Migrate the remaining apps in batches of about ten.
     - **The recipe for a batch:**
       - set `VOLSYNC_BACKEND: garage` in each app's `ks.yaml`;
       - append the apps to `APPS` in `garage-history-copy/job.yaml`, in the same change;
       - confirm afterwards that each app's line in the Job's log shows equal NFS and Garage
         snapshot counts.
     - **Batch 1:** seedstrem, n8n, homelable, questarr, mylar, tududi, mealie, arr-mcp-jellyfin,
       arr-mcp-plex and jellyseerr. They were chosen as small, low-stakes `equestria` apps on the
       component, each under 14 MiB.
     - **Held for later batches**, because they are larger or carry infrastructure:
       - `coder/forgejo`, the tailscale-system apps, `stargate-command` and `kube-system/registry`;
       - crowdsec's bespoke Secrets;
       - Plex.
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
  - **As built (2026-10-01):** celestia's node, by its HTTPS name. That name resolves to celestia's
    tailnet address, so the pulls ride WireGuard, peer to peer on the LAN. They were first allowed
    by `default-apps-access`. Now they have their own guarded grant, `garage-truenas-copy` (§C3).
- **H5 — VolSync's route and its nightly restore-once.** ✅ Decided 2026-09-29: celestia's node,
  directly over the LAN. equestria and celestia are co-located, so the restore-once reads stay local
  (§C2, phase 3). Fixing the cycle itself stays out of scope (§G).
  - **As built (2026-10-01):** celestia's LAN address over plain HTTP, because its HTTPS name is a
    tailnet name no pod can reach (phase 3, "Route").
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
