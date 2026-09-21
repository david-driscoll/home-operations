# Jellyfin: SQLite → PostgreSQL trial (`jellyfin-pg`)

A **throwaway** Jellyfin instance on PostgreSQL, carrying a converted **copy** of
production's SQLite library, to find out whether the real migration is viable.

**It is viable — but the fork's documented procedure does not work as written.**
Followed literally it produces a server that starts, logs no errors, and is
silently missing every registered device and all keyframe data. §3.3 is the part
that is not in their README and without which the result is quietly wrong.

Production `jellyfin` was not modified at any point. Everything below reads the
volsync restic repository (mounted **read-only**, `--no-lock`) and writes only to
`jellyfin-pg`'s own database and volume.

> **Be skeptical of a green result.** This is an unofficial fork
> ([`Nichols-HomeLab/Jellyfin.Pgsql`](https://git.nicholstech.org/Nichols-HomeLab/Jellyfin.Pgsql))
> of an unofficial provider, and Jellyfin's plugin database-provider API is
> labelled highly experimental upstream. "The pod is Ready and the UI loads" is
> worth very little here: both defects found on 2026-09-16 passed that test.

## Result, 2026-09-16

| Check | Result |
| --- | --- |
| pgloader | **zero errors**, 1,489,934 rows, 259.9 MB, 1m12s |
| Row counts, every table | match source exactly |
| `Devices` | 84 / 84 — **only after §3.3** |
| `KeyframeData` | 3,863 / 3,863, 2,382,026 tick values — **only after §3.3** |
| Users | 5 visible accounts, passwords and policy intact |
| Libraries | all resolve; LibraryMonitor watches every path |
| Items | 29,050 episodes, 2,999 movies, 335 series, 724 box sets, 340 books |
| Play state | 9,439 played / 69 resumable |
| API read | `GET /Items/{id}` 200 |
| Playback | `GET /Videos/{id}/stream` 206, 2 MiB @ 17.5 MB/s |
| Write path | `POST /UserPlayedItems` 200 → row in PostgreSQL |
| Persistence | play state survived a pod restart unchanged |
| Database size | **518 MB in PostgreSQL vs 637 MB as SQLite** |

## The pinned build

| | |
| --- | --- |
| Image | `git.nicholstech.org/nichols-homelab/jellyfin.pgsql` |
| Tag | `12.0-nichols.68` |
| Index digest | `sha256:cd825748c2ea6f5dc1242d3e1326db26ca6de31bfe22447d7f8f59d50d8da96c` |
| amd64 manifest | `sha256:8db41e422f1ed3694356e6b80228e3233cc2278ffd5801478c37c444efd760f3` |
| Built | 2026-09-10 |
| Contents | Jellyfin server `12.0.0` (patched), `Jellyfin.Plugin.Pgsql.dll`, Npgsql `10.0.3` |
| Fork sources | repo commit `460d74ac`, `jellyfin` submodule `d20f97d3` |

Tag **and** digest, because the project says not to track `latest`. At pinning
time `latest` resolved to the same digest and `main` was a different, newer
build. **The provider and the server move as a unit** — never mix this image
with a stock Jellyfin 12 image or a stock plugin.

⚠️ **git.nicholstech.org rate-limits.** After roughly 120 requests across three
runs it returned HTTP 403 to everything from this cluster's egress IP — raw
files and API, curl and Python alike — for long enough to break a run mid-flight.
**Fetch and cache their scripts before a cutover**, never at cutover time. The
`render.py` approach in §3.1 carries the load template in a ConfigMap and
verifies it by checksum instead of fetching it.

## How the container is configured

- **`POSTGRES_CONNECTION_STRING` only.** It outranks the alias
  `JELLYFIN_POSTGRES_CONNECTION_STRING`, and both outrank the legacy
  `POSTGRES_HOST`/`PORT`/`DB`/`USER`/`PASSWORD` set, which the entrypoint
  concatenates itself when the first two are empty.
- **`POSTGRES_COMMAND_TIMEOUT: "30"`** — seconds, `0` means unlimited. Read by
  the provider, not the entrypoint. Do not also set `Command Timeout` in the
  connection string.
- ⚠️ **`Maximum Pool Size=20` is too low.** The idle instance held **17 of 20**
  connections. A library scan will saturate it, and Npgsql queues rather than
  failing, so the symptom is latency rather than an error. Use 50–100 for a real
  cutover and check it against the CNPG cluster's `max_connections` — that
  cluster serves ~30 other databases.
- **`database.xml` is never hand-written.** The entrypoint copies its template in
  if absent, then rewrites `<ConnectionString>` on **every** start, which is what
  makes the 30-day password rotation survivable.
- ⚠️ **That file holds the password in clear text on the config volume.** It is
  the image's design, and it is why this app uses a plain PVC rather than
  `components/volsync` — a ReplicationSource would copy it into restic.
  Do not `cat` it in a shared terminal.
- **The container does not import SQLite.** Its entrypoint has a migration
  block, but it is commented out and the tools it references are not in the
  image.

## 1. Stand up the empty instance

Merging `kubernetes/apps/equestria/media/jellyfin-pg/` is the whole of this phase.

**Expect `stacks/system` to stall on that merge** — Pulumi creates
`database/static-roles/jellyfin-pg` and beats Flux to the role. Recovery is in
[`kubernetes/components/postgres/ks.yaml`](../../kubernetes/components/postgres/ks.yaml).
On 2026-09-16 it in fact did **not** stall for that reason; it was already failing
for an unrelated reason (a retired dockge host, fixed in #1763), which blocked the
credential for 20 minutes. Check `stacks/system` is green **before** blaming the
new app.

Confirm the instance is up and **empty** (54 migrations, 32 tables, 0 users), then
stop it — everything below needs the target idle:

```bash
kubectl -n equestria scale deploy/jellyfin-pg --replicas=0
```

## 2. Take a copy of production's database

Production's config PVC is Longhorn RWO and attached to a running pod. **Do not
mount it.** Read the volsync restic repository instead — it is an NFS export
(`10.10.10.10:/mnt/stash/backup/equestria/volsync`, repo `/repository/jellyfin`),
mounted **read-only** with credentials from the `jellyfin-volsync-secret` Secret.

`restic dump` rather than `restore`, so nothing can write to the repository:

```sh
restic --no-lock dump latest /data/jellyfin.db     > /work/jellyfin.db
restic --no-lock dump latest /data/jellyfin.db-wal > /work/jellyfin.db-wal
```

Sizes on 2026-09-16: `jellyfin.db` 637 MiB, WAL 36 MiB, whole snapshot 3.03 GiB.
The dump took 18 seconds. **The 637 MiB fits in an emptyDir** — no PVC and no
`ReplicationDestination` are needed, which also means no extra RBAC.

⚠️ **Take the WAL too, and checkpoint it.** The snapshot is a HOT copy — volsync
backed it up while Jellyfin was running. `render.py` runs
`PRAGMA wal_checkpoint(TRUNCATE)` to fold committed pages into the main file.
Skip that and pgloader silently reads the pre-WAL state.

**Gates, all fail-closed** (`render.py`): `quick_check` must be `ok`,
`foreign_key_check` must be empty, and `__EFMigrationsHistory` must contain
`20260815063607_RemoveOrphanedUserPermissionsAndPreferences` — the fork's
export script refuses without it, and it is the final SQLite migration in stock
`v12.0-rc7`.

**On 2026-09-16 the hot copy passed every gate**, so production never had to be
stopped. If `quick_check` fails, stop production Jellyfin briefly, trigger a
manual volsync sync, restart it, and use that snapshot.

## 3. Convert

With `jellyfin-pg` at 0 replicas. Stage order matters; each stage fails the pod
rather than continuing.

### 3.1 Render the load file (offline)

Run [`assets/jellyfin-pg/render.py`](assets/jellyfin-pg/render.py). It carries the
integrity gates from §2 and renders
[`assets/jellyfin-pg/jellyfindb.load`](assets/jellyfin-pg/jellyfindb.load) — the
fork's `docker/jellyfindb.load` at `460d74ac`, committed here byte for byte and
asserted to be `sha256:8e06bfa5bb5c3665f12f80659140cea824792c45e6b3c30f14d29865aa7c6973`
before use. Mount both from a ConfigMap at `/load`, or point `LOAD_TEMPLATE` at
the file. No network access is needed.

Only the two endpoints are rewritten — `create no tables`, `truncate`, the
excluded migration tables and the identity-sequence reset stay the fork's own
file.

[`assets/jellyfin-pg/prepare.py`](assets/jellyfin-pg/prepare.py) is the online
variant: the same gates plus fetching the fork's scripts and the pinned server
sources, which §3.5 needs. Run it **once, ahead of time**, not at cutover — it is
the script that hit the Gitea rate limit.

**Percent-encode the password** into the pgloader target URI; an OpenBao password
containing `/`, `@`, `:` or `#` otherwise re-parses the URI silently.

### 3.2 Dump the target schema

```sh
psql -At -F'|' -c "select table_name, column_name, data_type,
  coalesce(character_maximum_length::text,'')
  from information_schema.columns where table_schema='public'
  order by table_name, ordinal_position;" > /work/target-schema.tsv
```

### 3.3 Pre-clean — THE STEP THE FORK'S README DOES NOT HAVE

Run [`assets/jellyfin-pg/preclean.py`](assets/jellyfin-pg/preclean.py) against the
**restored copy**. Without it, pgloader reports 2 errors and loads zero rows into
two tables:

```
ERROR 22001: value too long for type character varying(32)
CONTEXT: COPY Devices, line 10, column AppVersion:
         "develop-e53c2a34dc521598dec4055089f863fa2d03a3bb"

ERROR 22P02: malformed array literal: "[0,83420000,166830000,...]"
DETAIL: Missing "]" after array dimensions.
CONTEXT: COPY KeyframeData, line 1, column KeyframeTicks
```

- **`varchar(n)`** — SQLite does not enforce declared lengths; PostgreSQL does. A
  48-character `AppVersion` from a dev-build client cost all **84** device rows.
  This is not specific to this estate: anyone with a long client version string
  hits it.
- **`ARRAY`** — EF stores the tick list as JSON text in SQLite; the provider
  declares `bigint[]`. Cost all **3,863** keyframe rows.

pgloader *warns* about both up front (`is casted to type "text" which is not the
same as "bigint[]"`) and proceeds anyway.

⚠️ **The varchar fix is lossy** — the value is truncated to fit. The alternative
is widening the column, which diverges from the fork's schema and fights its EF
migrations. The script prints every value it changes.

Actual output on the production dataset — **two problems in the entire schema**:

```
VARCHAR Devices.AppVersion varchar(32): truncated 1 rows (longest was 48)
ARRAY   KeyframeData.KeyframeTicks: converted 3863 JSON literals
```

### 3.4 Load

```
ghcr.io/roxedus/pgloader@sha256:1a7a86ad56623c00ee714ee4969913ed5c6f59ac9785073e2ffd1bea9cc54d31
```

The same digest-pinned loader [`media-stack-postgres-migration.md`](media-stack-postgres-migration.md)
uses. `backoffLimit: 0` / `restartPolicy: Never` — a half-loaded database must
never be loaded into twice.

**Require `Total import time  ✓` — a literal check mark, meaning zero errors.**
Not "it finished": the failing run also finished, and reported `2` in that column
while two tables sat empty.

### 3.5 Carry the code-migration state across

`docker/export-code-migrations.py` needs `Jellyfin.Server/Migrations/**/*.cs`
from the pinned submodule commit to tell server **code** migrations from provider
**schema** migrations. It emitted 8,325 bytes / 45 history rows.

```sh
python3 export-code-migrations.py /work/jellyfin.db --server-source ./jellyfin > code-migrations.sql
psql -v ON_ERROR_STOP=1 -f code-migrations.sql
```

**This survives a re-load** — pgloader excludes `__EFMigrationsHistory` — so a
second attempt at §3.4 does not need it repeated.

### 3.6 Bring the config across

Restore `/config` and `/root` from the same snapshot onto the target's PVC.

⚠️ **Skip `database.xml`.** Production's copy names the SQLite provider, and the
entrypoint hard-aborts (`exit 2`) if that file does not say `PostgreSQL`.

⚠️ **Skip `/config/plugins`** — those were built against stock rc7, and the
entrypoint manages the `PostgreSQL` plugin directory itself.

⚠️ **Rewrite absolute paths that do not exist in the target pod.** Production's
`system.xml` carries `<MetadataPath>/metadata</MetadataPath>` because prod mounts
NFS there. In a test pod without that mount Jellyfin dies before serving anything:

```
Unhandled exception. System.UnauthorizedAccessException: Access to the path '/metadata' is denied.
  at ServerConfigurationManager.UpdateMetadataPath()
```

Repoint it at `/config/metadata`. Not an issue for an in-place cutover, where the
mounts are identical. Note that **image paths are stored as absolute paths in the
database**, so changing MetadataPath orphans existing artwork — posters 404 until
a metadata refresh.

## 4. Verify

**Row counts per table, source against target. This is the check that matters** —
it is the only thing that caught either defect in §3.3.

Then, in order of what each proves:

- `Devices` and `KeyframeData` specifically, plus
  `sum(array_length("KeyframeTicks",1))` — a present-but-empty array passes a
  naive row count.
- Sequences: every identity column at or past `max(id)`.
- `__EFMigrationsHistory`: provider schema migrations plus the source's completed
  code migrations, and **no SQLite schema migration IDs**.
- Users log in; libraries resolve; `GET /Items/{id}` returns real metadata.
- `GET /Videos/{id}/stream?static=true` with a Range header returns 206.
- `POST /UserPlayedItems/{id}` returns 200 **and** the row changes in PostgreSQL —
  this is the write path, and reads alone will not exercise it.
- Restart the pod and re-read that row.

For an authenticated check, mint a throwaway key directly in the target database
and delete it afterwards, rather than using one of the production API keys the
migration carries across:

```sql
insert into "ApiKeys" ("DateCreated","DateLastActivity","Name","AccessToken")
values (now(), now(), 'migration-verify', '<random>');
-- ... verify ...
delete from "ApiKeys" where "Name" = 'migration-verify';
```

Note `UserData` holds **more than one row per (ItemId, UserId)** — three, for the
item tested. All were updated consistently; it is not a migration artifact, but
do not write queries assuming uniqueness.

## 5. Teardown

In this order. Steps 3 and 4 are one unit — never leave a live database with no
`Database` CR, because the nightly backup CronJob treats that as a hard failure.

**1. Remove the app.** PR deleting `kubernetes/apps/equestria/media/jellyfin-pg/`
and its line in `kubernetes/apps/equestria/media/kustomization.yaml`. Flux prunes
the HelmRelease, Service, HTTPRoute, `jellyfin-pg-env` and the config PVC. Confirm
the Longhorn volume is gone.

**2. Let Pulumi drop the OpenBao role**, before step 4 — a static role whose
PostgreSQL role was dropped fails on its next rotation:

```bash
kubectl annotate stack -n pulumi system pulumi.com/reconciliation-request=$(date +%s) --overwrite
```

**3. Delete the retained CNPG objects.** `components/postgres` renders everything
with `deletionPolicy: Orphan`, `retain` reclaim policies and
`kustomize.toolkit.fluxcd.io/prune: disabled`, so none of this goes on its own:

```bash
kubectl -n database delete database jellyfin-pg
kubectl -n database delete databaserole jellyfin-pg
kubectl -n database delete externalsecret jellyfin-pg-postgres
kubectl -n database delete secret jellyfin-pg-postgres jellyfin-pg-postgres-conn
kubectl delete clustergenerator jellyfin-pg-postgres-rotation
```

**4. Drop the database and role.** `retain` means step 3 dropped nothing.
`DROP DATABASE` cannot run inside a transaction block, so one statement per `-c`:

```sql
DROP DATABASE "jellyfin-pg";
DROP ROLE "jellyfin-pg";
```

**5. Clean up the leftovers.** Any nightly `pg_dump` output for `jellyfin-pg`;
the one-off ConfigMaps (`jellyfin-pg-migrate`, `jellyfin-pg-preclean`,
`jellyfin-pg-load`) and any `driscoll.dev/oneshot=jellyfin-pg-migration` pods.

Production `jellyfin` needs no teardown step, because nothing here changed it.

## What a real cutover would need beyond this

1. **The `varchar` truncation is a data decision, not a technical one.** Decide
   whether to truncate or widen the column before the maintenance window.
2. **Raise `Maximum Pool Size`** (§"How the container is configured").
3. **Cache the fork's scripts and the pinned server sources in advance** — their
   Gitea rate-limits.
4. **Stop production for the copy** if you want a cold source. The hot copy
   passed its integrity gates here, but that is evidence about one snapshot, not
   a guarantee.
5. **Plan for artwork.** Image paths are absolute in the database; anything that
   moves the metadata directory needs a refresh afterwards.
6. **Decide what happens to plugin databases.** `infuse_sync.db`,
   `playback_reporting.db` and `streamyfin_plugin.db` are separate SQLite files
   under `/config/data` and are outside both this procedure and the provider's
   scope.

---

# The 2026-09-21 re-run: plugins, repositories and settings included

§1–§5 above describe the 2026-09-16 trial, which deliberately skipped
`/config/plugins`. This section is the re-run that does not, and it replaces
§3.1–§3.6 as the procedure to follow. Everything else above still holds.

## ⛔ It does not run today, and the reason is not a bug

| | Server | Image |
| --- | --- | --- |
| `jellyfin` | **12.1.0** | `ghcr.io/jellyfin/jellyfin:12.1` |
| `jellyfin-pg` | **12.0.0** | `git.nicholstech.org/.../jellyfin.pgsql:12.0-nichols.68` |

Both read off `/System/Info/Public` on the live servers. Production moved to
12.1 in #1727; the fork's pinned build is still the 12.0 one the trial used.

**The source's schema is therefore ahead of the target's.** Every EF migration
12.1 added exists in production's SQLite and in none of the fork's PostgreSQL
tables. pgloader is told `create no tables`, so it loads into whatever columns
are already there and fails the tables where they do not match — which is the
same shape as the `Devices` and `KeyframeData` losses in §3.3: a run that
finishes, reports success, and leaves tables empty.

`gate.py` refuses the load for exactly this and prints which columns differ.
**Do not work around it by adding the columns by hand** — the provider's next
EF migration will fight them.

The way through is to bring `jellyfin-pg` to a fork build that matches
production's Jellyfin version, let it run its migrations against an **empty**
database, and then run this job. That build may not exist yet:
`git.nicholstech.org` browsing is behind authentik SSO from here and its
registry API could not be reached to list tags, so **check for a 12.1 tag
yourself before planning a window**. If there is none, the options are to hold
the re-run until there is, or to pin production back to 12.0 — a decision about
production, not about this instance.

## What it carries, and what the trial did not

`config-sync.py` replaces §3.6. It carries the whole config volume rather than
the XMLs alone:

| | |
| --- | --- |
| `config/` | every server setting. **`system.xml` is also where `<PluginRepositories>` lives** — the repository list is a server setting, not a per-plugin one, so it travels with that file. The script prints the repositories it found so "they came across" is visible rather than discovered later in an empty catalogue. |
| `plugins/` | the plugin assemblies **and** `plugins/configurations/`, which is where each plugin's own settings XML lives |
| `root/` | the **library definitions** — `root/default/<Library>/options.xml` and the `.mblink` files. Without these the loaded `BaseItems` rows belong to libraries the server does not know it has. |
| `data/ScheduledTasks/`, `data/collections/`, `data/playlists/` | task triggers, collections, playlists |
| `data/*.db` | the plugins' **own SQLite databases** — `playback_reporting.db`, `infuse_sync.db`, `streamyfin_plugin.db`. They stay SQLite files on the volume; the provider never sees them. This closes item 6 of "what a real cutover would need". `--no-plugin-data` leaves them behind. |

Refused, each for a reason that would otherwise break something:

- **`config/database.xml`** — production's names the SQLite provider and the
  entrypoint hard-aborts (`exit 2`) on it. The target's own copy is **held aside
  across the replace and put back**; declining to copy the source's is not
  enough, because a carried directory is wiped first.
- **the provider's plugin directory** — the entrypoint manages it, and it is
  likewise preserved across the wipe.
- `data/jellyfin.db` (the thing being converted), `data/library.db`,
  `metadata/`, `cache/`, `log/`, `transcodes/`.

Nothing outside that carry list is touched.

## ⚠️ Three settings that name paths this pod does not have

A setting pointing at a path the pod cannot write is not a degraded feature; it
is a server that dies before it serves anything (§3.6 has the stack trace).

- **`MetadataPath`** — production mounts NFS at `/metadata`; `jellyfin-pg`
  mounts nothing there. `--metadata-path` is **required** for that reason, and
  `/config/metadata` is the value for this instance. Image paths are stored
  absolute in the database, so **artwork 404s until a metadata refresh**.
- **`network.xml` → `LocalNetworkAddresses`** — production's pod carries an
  ipvlan interface on the Home LAN (`jellyfin-lan-net`, 10.10.206.20).
  `jellyfin-pg` has no such interface and cannot bind that address. The script
  reports the list and `--clear-bind-addresses` empties it.
- **plugin `targetAbi`** — a plugin declares the server ABI it was built
  against and the server silently declines to load one built for a newer
  server. Carrying production's plugins onto an older `jellyfin-pg` is the
  normal way to hit this. Every plugin is listed with its ABI and flagged;
  `--strict-abi` makes it fatal.

## Plugin settings are repointed at this instance

A carried plugin configuration still names **production** — a webhook's server
URL, a sync plugin's callback, the address Streamyfin hands to clients. Left
alone, `jellyfin-pg`'s plugins would talk to production and send clients there.
`job.yaml` passes two rewrites to `config-sync.py`:

| From | To |
| --- | --- |
| `jellyfin.equestria.svc.cluster.local` | `jellyfin-pg.equestria.svc.cluster.local` |
| `jellyfin.driscoll.tech` | `jellyfin-pg.driscoll.tech` |

- **Only the text files under `plugins/`** are rewritten: settings XML and
  JSON. Assemblies are never touched.
- Only **whole hostnames** match, ignoring case: `myjellyfin.driscoll.tech`,
  `jellyfin.driscoll.tech.example.com` and the already-correct
  `jellyfin-pg.driscoll.tech` are left alone. Ports and paths are kept.
- Files are rewritten as bytes, so the BOM .NET writes survives.
- The same hostnames under `config/` and inside the plugins' **SQLite
  databases** are **reported, not rewritten**. A URL stored in a plugin's own
  database is data that plugin owns, and rewriting it would need that plugin's
  schema. Read the `warn:` lines and decide.
- Short forms such as `jellyfin.equestria.svc`, `jellyfin:8096` or a bare IP do
  not match. Add another `--rewrite-host=OLD=NEW` for any the run turns up.

## ⚠️ `truenas-media` is no longer read-only

The mount lost `readOnly: true` in 6b8d281c (2026-09-17). The comments in
`helmrelease.yaml` and §3.6 above still say it is read-only and are **stale**.
This matters more for this run than for the trial, because this one carries
production's **library options** — and those are what decide whether Jellyfin
writes `.nfo` files and artwork back into the media folders. Inherited options
mean scans have not written into `/media` so far, but nothing structural stops
them now, and a delete from this instance deletes real shared media. Decide
whether that mount should be read-only again **before** scaling the instance
back up with production's library settings on it.

## Running it

Assets, all under [`assets/jellyfin-pg/`](assets/jellyfin-pg/):

| File | Stage |
| --- | --- |
| `restore.sh` | dumps the database, WAL and config tree out of restic, read-only, `--no-lock`. **Locates `jellyfin.db` in the snapshot** rather than assuming a path — §2's `/data/jellyfin.db` and VolSync's mount-at-`/data` cannot both be right. |
| `render.py` | integrity gates, WAL checkpoint, source row counts, rendered load file (unchanged) |
| `gate.py` | **new** — refuses a source schema the target does not cover |
| `preclean.py` | varchar truncation and JSON→PostgreSQL array conversion (unchanged) |
| `jellyfindb.load` | the fork's load file, checksum-verified (unchanged) |
| `verify.py` | **new** — per-table source-vs-target counts, plus the KeyframeData tick total |
| `config-sync.py` | **new** — plugins, repositories, settings, libraries |
| `job.yaml` | **new** — all of it as one staged Job |

```bash
kubectl -n equestria scale deploy/jellyfin-pg --replicas=0
kubectl -n equestria wait --for=delete pod \
  -l app.kubernetes.io/instance=jellyfin-pg --timeout=5m

kubectl -n equestria create configmap jellyfin-pg-migrate \
  --from-file=docs/runbooks/assets/jellyfin-pg/ \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n equestria apply -f docs/runbooks/assets/jellyfin-pg/job.yaml
kubectl -n equestria logs -f job/jellyfin-pg-migrate --all-containers --prefix
```

The instance must be at **zero replicas**: the config PVC is RWO Longhorn, so
the pod cannot schedule while the app holds it. That is the good failure; the
bad one would be two writers on one config directory.

`backoffLimit: 0` and `restartPolicy: Never`, as in §3.4 — a half-loaded
database must never be loaded into twice. A failed stage means read the log, fix
the cause, and re-create the Job deliberately.

**§3.5 is not in the Job.** pgloader excludes `__EFMigrationsHistory`, so the
code-migration history the trial imported survives a re-load and does not need
repeating. It *does* need repeating if the database is rebuilt empty — which is
exactly what the version fix above requires — and it needs the fork's
`export-code-migrations.py` plus the pinned server's `Migrations/**/*.cs`.
**Cache both before the window**; that fetch is what hit the Gitea rate limit.

## Afterwards

§4's verification still applies, and `verify.py` does its first and most
important part automatically. Beyond that, the things this run adds:

- Plugins appear in the dashboard **and are enabled** — an ABI-blocked plugin
  is absent, not broken, and says so only in the log.
- The plugin catalogue lists the repositories `config-sync.py` printed.
- Each plugin's settings page shows production's values, not defaults, and
  any URL on it names `jellyfin-pg`, not `jellyfin`.
- Libraries resolve and their paths point at `/media`.
- `MEILI_URL` / `MEILI_MASTER_KEY` still come from the environment and outrank
  the carried Meilisearch config, so that plugin points at this pod's own
  sidecar rather than production's. Confirm the index is this instance's.
