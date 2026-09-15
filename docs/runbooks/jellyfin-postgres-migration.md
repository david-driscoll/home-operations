# Jellyfin: SQLite → PostgreSQL trial (`jellyfin-pg`)

Standing up a **throwaway** Jellyfin instance on PostgreSQL, and converting a **copy** of
production's SQLite library into it, to find out whether the real migration is viable.

Production `jellyfin` is not touched by any step here. If a step ever needs it, that step says so
and stops for a human decision — there is exactly one such step (§2.3).

> **Be skeptical of a green result.** This is an unofficial fork
> ([`Nichols-HomeLab/Jellyfin.Pgsql`](https://git.nicholstech.org/Nichols-HomeLab/Jellyfin.Pgsql))
> of an unofficial provider, with no GitHub releases and effectively no users, and Jellyfin's own
> plugin database-provider API is labelled highly experimental upstream. "The pod is Ready and the
> UI loads" is worth very little on its own — §4 exists because the failure modes here are quiet
> ones: a table that copied zero rows, a sequence that did not get reset, play state that writes
> but never reads back.

## The pinned build

| | |
| --- | --- |
| Image | `git.nicholstech.org/nichols-homelab/jellyfin.pgsql` |
| Tag | `12.0-nichols.68` |
| Index digest | `sha256:cd825748c2ea6f5dc1242d3e1326db26ca6de31bfe22447d7f8f59d50d8da96c` |
| amd64 manifest | `sha256:8db41e422f1ed3694356e6b80228e3233cc2278ffd5801478c37c444efd760f3` |
| Built | 2026-09-10 |
| Contents | Jellyfin server `12.0.0` (patched), `Jellyfin.Plugin.Pgsql.dll`, Npgsql `10.0.3` |

Tag **and** digest, because the project explicitly says not to track `latest` for upgrades. At the
time of pinning `latest` resolved to this same digest and `main` was a different, newer build.

**This registry is a self-hosted Gitea, not ghcr or Docker Hub**, and it is not one of the mirrors
in `talos/patches/global/machine-registries.yaml`, so containerd pulls it directly. Anonymous pull
works — no `imagePullSecret` is involved. To list tags:

```bash
TOK=$(curl -s "https://git.nicholstech.org/v2/token?service=container_registry&scope=repository:nichols-homelab/jellyfin.pgsql:pull" | jq -r .token)
curl -s -H "Authorization: Bearer $TOK" https://git.nicholstech.org/v2/nichols-homelab/jellyfin.pgsql/tags/list
```

Renovate does not watch this registry, so upgrades are a manual re-pin. **The provider and the
server move as a unit** — never mix this image with a stock Jellyfin 12 image or a stock plugin.

## How the container is configured

Set by `kubernetes/apps/equestria/media/jellyfin-pg/`, and worth knowing before debugging it:

- **`POSTGRES_CONNECTION_STRING` only.** It outranks the alias
  `JELLYFIN_POSTGRES_CONNECTION_STRING`, and both outrank the legacy
  `POSTGRES_HOST`/`PORT`/`DB`/`USER`/`PASSWORD` set, which the entrypoint concatenates into a
  connection string itself when the first two are empty. One string keeps SSL, pooling and
  timeouts in one reviewable place.
- **`POSTGRES_COMMAND_TIMEOUT: "30"`** — seconds; `0` means unlimited. Read by the provider, not
  the entrypoint. Deliberately not duplicated as `Command Timeout` in the connection string.
- **`database.xml` is never hand-written.** The entrypoint copies its own template to
  `/config/config/database.xml` if absent, then rewrites `<ConnectionString>` with `xmlstarlet`
  on **every** start. That is what makes the 30-day password rotation survivable: Reloader
  restarts the pod, the entrypoint rewrites the file.
- ⚠️ **That file holds the password in clear text on the config volume.** It is the image's
  design. It is also why this app uses a plain PVC instead of `components/volsync` — a
  ReplicationSource would copy that file into the restic repository.
- **The container does not import SQLite.** Its entrypoint has a migration block, but it is
  commented out and the tools it references (`jellyfin.PgsqlMigrator.dll`, `jellyfindb.load`,
  `pgloader`) are **not in the image**. The conversion in §3 is a manual, out-of-band procedure.

## 1. Stand up the empty instance

Merging `kubernetes/apps/equestria/media/jellyfin-pg/` is the whole of this phase. It creates an
empty database, an empty config volume, and an instance that initialises its own schema.

**Expect `stacks/system` to stall on that merge.** `components/postgres` is discovered by Pulumi,
which creates `database/static-roles/jellyfin-pg` and issues `ALTER ROLE` immediately — and it
reliably beats Flux to creating the role. The recovery is in
[`kubernetes/components/postgres/ks.yaml`](../../kubernetes/components/postgres/ks.yaml):

```bash
flux -n flux-system reconcile ks cluster-apps
kubectl -n database get databaserole jellyfin-pg -w        # wait for status.applied
kubectl annotate stack -n pulumi system pulumi.com/reconciliation-request=$(date +%s) --overwrite
kubectl -n database annotate externalsecret jellyfin-pg-postgres force-sync=$(date +%s) --overwrite
```

Then confirm the instance came up clean and **empty**:

```bash
kubectl -n equestria rollout status deploy/jellyfin-pg
kubectl -n equestria logs deploy/jellyfin-pg | grep -iE 'npgsql|postgres|provider|error|fail' | head -40
```

```sql
-- schema created by the provider, with migrations applied
SELECT count(*) FROM "__EFMigrationsHistory";
SELECT count(*) FROM "BaseItems";   -- must be 0
SELECT count(*) FROM "Users";       -- must be 0
```

The setup wizard should be reachable at `https://jellyfin-pg.<root-domain>`. **Do not complete
it** — §3 replaces the database wholesale, and a wizard-created admin would simply be truncated
away. Confirming it renders is enough.

Then stop the instance, because everything below needs the target idle:

```bash
kubectl -n equestria scale deploy/jellyfin-pg --replicas=0
```

## 2. Take a copy of production's database

### 2.1 Restore, never read the live volume

Production's config PVC is Longhorn RWO and attached to a running pod. **Do not mount it.** The
copy comes from the volsync restic repository instead, which touches neither the volume nor the
pod:

```bash
kubectl -n equestria get replicationsource jellyfin -o jsonpath='{.status.lastSyncTime}{"\n"}'
```

Create a one-off `ReplicationDestination` restoring the latest snapshot into a scratch PVC
(`jellyfin-seed`, 60Gi, `longhorn`), modelled on
[`kubernetes/components/volsync/replicationdestination.yaml`](../../kubernetes/components/volsync/replicationdestination.yaml)
but named so it can never be confused with the real `jellyfin-dst`. It reads the same restic
repository credentials from the `jellyfin-volsync` Secret.

### 2.2 Check the copy is intact

The snapshot was taken while Jellyfin was **running**, so the SQLite file is a hot copy and may be
torn. Check before trusting it — the export script in §3.3 refuses a bad database anyway, but
finding out here is cheaper:

```bash
# in a throwaway pod with the seed PVC mounted and sqlite3 available
sqlite3 /seed/data/jellyfin.db 'PRAGMA quick_check;'        # must print: ok
sqlite3 /seed/data/jellyfin.db 'PRAGMA foreign_key_check;'  # must print nothing
sqlite3 /seed/data/jellyfin.db 'SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY 1 DESC LIMIT 5;'
ls -lh /seed/data/jellyfin.db
```

**Gate — schema level.** The history must contain
`20260815063607_RemoveOrphanedUserPermissionsAndPreferences`. `docker/export-code-migrations.py`
hard-fails without it. That ID is the final SQLite migration in stock `v12.0-rc7`, which is what
production runs, so this should pass; if it does not, production is older than assumed and
nothing below is valid.

**Gate — size.** Record `jellyfin.db`'s size. The **entire** shared CNPG cluster was 2.8 GB across
all databases when this was written. A multi-GB load lands next to production databases on a
shared cluster and gets picked up by the nightly `pg_dump`. Stop and re-decide if it is large.

### 2.3 If, and only if, the integrity check fails

This is the one step that involves production. The fork's README says to stop the source instance
before copying its database, precisely because of the torn-copy problem.

**Get explicit human approval first.** Then, for a few minutes' downtime:

```bash
kubectl -n equestria scale deploy/jellyfin --replicas=0
kubectl -n equestria patch replicationsource jellyfin --type=merge \
  -p '{"spec":{"trigger":{"manual":"clean-copy-'"$(date +%s)"'"}}}'
# wait for status.lastManualSync to match, then:
kubectl -n equestria scale deploy/jellyfin --replicas=1
```

Then redo §2.1 and §2.2 against the new snapshot. Production is running again before anything
else happens.

## 3. Convert

Everything here runs against `jellyfin-pg` **only**, with its Deployment at 0 replicas.

### 3.1 Fetch the fork's conversion assets

They are in the repository, not the image. Pin to the commit the image was built from
(`460d74ac`, or whichever `sha-*` tag matches your pinned image):

```bash
base=https://git.nicholstech.org/Nichols-HomeLab/Jellyfin.Pgsql/raw/commit/460d74ac
curl -sSO "$base/docker/jellyfindb.load"
curl -sSO "$base/docker/export-code-migrations.py"
```

`export-code-migrations.py` also needs the **pinned server's** migration sources — it scans
`Jellyfin.Server/Migrations/**/*.cs` for `[JellyfinMigration(...)]` attributes to learn which
history rows are code migrations rather than schema migrations. Fetch that subtree from the
pinned submodule commit `d20f97d32b102f5c9be370d8041759e69671ad31` of
`Nichols-HomeLab/jellyfin` into `./jellyfin/Jellyfin.Server/Migrations/`, and pass
`--server-source ./jellyfin`. A full clone works too and is simpler if bandwidth is free.

### 3.2 Load the data

`jellyfindb.load` already does the right things and should be adapted, not replaced: it excludes
`__EFMigrationsHistory`, `__EFMigrationsLock` and `sqlite_%`, uses `create no tables` /
`create no indexes` so the provider's schema survives, `truncate`s the target, and — importantly —
repositions identity sequences afterwards, which pgloader's own `reset sequences` misses for
PostgreSQL identity columns.

Adapt only the two endpoints: the source path to wherever the seed database is mounted, and the
target, which reads `${POSTGRES_*}` environment variables.

Run it as a one-off Job, following the pattern in
[`media-stack-postgres-migration.md` §5.6](media-stack-postgres-migration.md) — same
digest-pinned loader image, same `backoffLimit: 0`, same "password goes in a Secret, never in the
Job spec" rule:

```
ghcr.io/roxedus/pgloader@sha256:1a7a86ad56623c00ee714ee4969913ed5c6f59ac9785073e2ffd1bea9cc54d31
```

- **Percent-encode the password** into the target URI. OpenBao-generated passwords can contain
  characters that silently re-parse a URI.
- **`backoffLimit: 0`.** A half-loaded database must never be loaded into twice. On failure,
  truncate and start over.
- **Require zero errors in pgloader's summary**, including index and foreign-key recreation. Not
  "it finished" — zero.

### 3.3 Carry the code-migration state across

pgloader deliberately skipped the history tables. The provider's own schema history must stay;
the **server's code-migration** rows must come from the source, or Jellyfin re-runs migration
routines against already-migrated data:

```bash
python3 export-code-migrations.py /path/to/seed/jellyfin.db --server-source ./jellyfin > code-migrations.sql
psql -v ON_ERROR_STOP=1 -f code-migrations.sql
```

The script validates the source schema and foreign keys, deletes only the known code-migration
IDs from the target history, and re-inserts the ones the source had completed. Point `PGHOST`,
`PGPORT`, `PGUSER`, `PGDATABASE` and the password at `jellyfin-pg`'s database — **never** at
another database on the cluster.

### 3.4 Bring the matching config across

Restore the upgraded config/data files onto the `jellyfin-pg` config volume, keeping the target's
own PostgreSQL configuration:

- **Keep** the target's `/config/config/database.xml`. It is rewritten on every start anyway, but
  copying the source's file over it means a start with `DatabaseType` pointing at SQLite.
- **Skip `/config/plugins/`.** Those were built against stock rc7. The entrypoint manages the
  `PostgreSQL` plugin directory itself and verifies the payload hash on each start.
- **Skip `/config/data/jellyfin.db*`.** The data now lives in PostgreSQL; leaving a SQLite file
  beside it invites confusion later, and `library.db` is dead weight.
- Configuration XML under `/config/config/` and library definitions under `/config/root/` are the
  parts worth carrying, and are what make the converted rows resolve to real libraries.

Then start it: `kubectl -n equestria scale deploy/jellyfin-pg --replicas=1`.

## 4. Verify

In rough order of how likely each is to catch something real.

**4.1 Row counts, per table, source against target.** The check that catches a silent partial
load. Compare SQLite's `SELECT count(*)` per table against PostgreSQL's for the same table. Pay
attention to `BaseItems`, `UserData`, `MediaStreams`, `People`, `ItemValues`, `Users`.

**4.2 Sequences.** Insert-time failures come from here. For every identity column, the sequence
must be at or past `max(id)` — the load file's `after load` block handles it, so this is
verifying it worked:

```sql
SELECT pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS seq,
       column_name, table_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) IS NOT NULL;
-- then, per sequence: SELECT last_value FROM <seq>;  vs  SELECT max(<col>) FROM <table>;
```

**4.3 Migration history.** `__EFMigrationsHistory` should hold the **provider's** schema
migrations (`..._PgSQL_Init` through `20260910022712_UpgradeJellyfin12`) plus the source's
completed code-migration rows. It must **not** contain SQLite schema migration IDs.

**4.4 The application.** Users can log in with their existing passwords; libraries appear with
their items; artwork and metadata resolve; play state (watched flags, resume positions) matches
what production shows.

**4.5 Playback, end to end.** Play one file to completion, confirm the resume position and
watched flag land in `UserData`, then restart the pod and confirm they are still there. Without
a GPU on this pod anything needing a transcode is software-only, so pick a direct-play file and
do not read performance numbers off this instance.

**4.6 Logs.** No Npgsql exceptions, no provider errors, no migration routines re-running.
Also check whether the provider's `PostgreSQL connection string: {ConnectionString}` log line
leaks the password into pod logs — if it does, that is a finding worth reporting upstream and a
reason to keep this instance's logs out of anywhere shared.

## 5. Teardown

In this order. Steps 3 and 4 are one unit — do not leave a live database with no `Database` CR,
because the nightly backup CronJob treats that as a hard failure.

**1. Remove the app.** PR deleting `kubernetes/apps/equestria/media/jellyfin-pg/` and its line in
`kubernetes/apps/equestria/media/kustomization.yaml`. Flux prunes the HelmRelease, Service,
HTTPRoute, `jellyfin-pg-env` and the config PVC. Confirm the Longhorn volume is gone, and delete
the `jellyfin-seed` scratch PVC and its `ReplicationDestination` if still around.

**2. Let Pulumi drop the OpenBao role.** With the `components/postgres` line gone, `stacks/system`
no longer discovers the app and removes `database/static-roles/jellyfin-pg`. Do this **before**
step 4 — a static role whose PostgreSQL role has been dropped fails on its next rotation.

```bash
kubectl annotate stack -n pulumi system pulumi.com/reconciliation-request=$(date +%s) --overwrite
```

**3. Delete the retained CNPG objects.** `components/postgres` renders everything with
`deletionPolicy: Orphan`, `retain` reclaim policies and `kustomize.toolkit.fluxcd.io/prune:
disabled`, so none of this goes on its own:

```bash
kubectl -n database delete database jellyfin-pg
kubectl -n database delete databaserole jellyfin-pg
kubectl -n database delete externalsecret jellyfin-pg-postgres
kubectl -n database delete secret jellyfin-pg-postgres jellyfin-pg-postgres-conn
kubectl delete clustergenerator jellyfin-pg-postgres-rotation
```

**4. Drop the database and role.** `retain` means deleting the CRs above dropped nothing.
`DROP DATABASE` cannot run inside a transaction block, so one statement per `-c`:

```sql
DROP DATABASE "jellyfin-pg";
DROP ROLE "jellyfin-pg";
```

**5. Clean up the backups.** Any nightly `pg_dump` output for `jellyfin-pg` taken while it existed
is still in backup storage; delete it if you care about the space.

Production `jellyfin` needs no teardown step, because nothing here ever changed it.
