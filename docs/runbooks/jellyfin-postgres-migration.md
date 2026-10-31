# Jellyfin on PostgreSQL (`jellyfin-pg`)

A **clone of production Jellyfin** that runs on PostgreSQL, to find out whether
production can follow. It is not a second production server.

- **Same image as production**, tag and digest
  (`kubernetes/apps/equestria/media/jellyfin-pg/helmrelease.yaml`). Renovate bumps
  both HelmReleases in one PR, so the clone always runs the Jellyfin version
  production does.
- **Production's data**: the config volume is restored from production's latest
  volsync snapshot when it is created (`pvc.yaml` + `replicationdestination.yaml`).
- **PostgreSQL through a plugin**: the
  [BORNIOS PostgreSQL Database Provider](https://github.com/BORNIOS/Jellyfin-Database-Providers-Postgres),
  installed from its plugin repository like any other plugin. Its own Migration
  tab copies the SQLite database into PostgreSQL and switches the server over.

It replaced the Nichols-HomeLab `jellyfin.pgsql` fork on 2026-10-31. That fork
was a patched 12.0 server image that never caught up with production's 12.1, and
its pgloader procedure lived here. Both are in git history before that date if
you need the lessons; the two that still apply are repeated below.

> **Be skeptical of a green result.** A provider plugin replaces Jellyfin's whole
> data layer, and upstream labels that API experimental. The fork trial's two
> worst defects passed "the pod is Ready and the UI loads". Row counts are the
> check that matters (§4).

## The plugin

| | |
| --- | --- |
| Repository | `https://raw.githubusercontent.com/BORNIOS/Jellyfin-Database-Providers-Postgres/main/manifest.json` |
| Catalogue name | PostgreSQL Database Provider |
| GUID | `a2b5f3e8-4c1d-4f7a-9e6b-8d0c2f1a3b5e` |
| Version at adoption | 3.1.0.0 (2026-10-19), `targetAbi` 12.1.0.0 |
| PostgreSQL | 16+; the CNPG cluster is 18 |

**It documents Jellyfin 12.1.x only, and production is on 12.4.** The 12.1 → 12.4
diff was read on 2026-10-31: `IJellyfinDatabaseProvider` gained one method
(`RefreshStatistics`) *with a default body*, so the plugin still binds; the one
new schema migration, `MakeOwnerIdIndexesPartial`, only rebuilds two indexes
as partial. Nothing in it should fail on the plugin. Re-check that diff when a
Jellyfin bump touches `src/Jellyfin.Database/`. The clone is where a break
should surface first, and that is why it tracks production.

## How the pod is put together

An init container (`resources/prepare.sh`, in the `postgres:18-trixie` image)
runs before Jellyfin on every start:

1. **A PostgreSQL client for the plugin.** Before any Jellyfin migration that
   asks for a backup (in practice, a version bump), the plugin runs `pg_dump`
   inside the Jellyfin container, and a missing client is a **fatal startup
   error** ([#5](https://github.com/BORNIOS/Jellyfin-Database-Providers-Postgres/issues/5)).
   The stock image has none. The script copies `pg_dump`, `pg_dumpall`,
   `pg_restore` and `psql` plus their libraries into an emptyDir, which Jellyfin
   mounts at `/usr/lib/postgresql`. The plugin auto-detects that path, so
   leave **PostgreSQL bin directory** empty.
2. **One-time fix-ups on a fresh clone.** The copy names production. Its
   `network.xml` publishes `all=https://jellyfin.<root domain>/`, and Webhook,
   Moonfin and Jellyfin Enhanced carry production URLs. Whole hostnames are
   rewritten to `jellyfin-pg` once, and `/config/.clone-seed-fixups-done`
   marks that the rewrite ran.
3. **The rotating password.** The plugin reads its connection from
   `config/database.xml` and the dashboard reads it from
   `plugins/configurations/Jellyfin.Database.Providers.Postgres.xml`. Both
   `<ConnectionString>` elements are rewritten from the `jellyfin-pg-env`
   Secret, and Reloader restarts the pod when OpenBao rotates the password. The
   script never switches a server to PostgreSQL itself: it rewrites
   `database.xml` only once that file already names `PLUGIN_PROVIDER`.

⚠️ **`database.xml` holds the password in clear text** once the provider is
active, and so do `database.xml.bak` and the plugin's settings XML. That is why
the config volume is a plain PVC with no volsync backup.

## 1. Bring the clone up

Merging the app directory does it. Flux restores production's snapshot into
`jellyfin-pg-config`, and the pod starts **on SQLite**, as a copy of production
at the time of that snapshot.

Check it is a copy before going further: the same users, the same libraries,
and play state on a title you know. Then read the init container's log for the
`rewrote hosts in` lines:

```bash
kubectl -n equestria logs deploy/jellyfin-pg -c prepare
```

**SSO does not work on the clone.** The SSO-Auth plugin's settings came across
naming production's Authentik client, whose redirect URIs are production's.
Sign in with a local Jellyfin password.

## 2. Empty the database

`jellyfin-pg` in CNPG still holds the retired fork's tables, and plugin 3.x does
not adopt a schema it did not create. As the superuser, against the
`jellyfin-pg` database, one statement per `-c`:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public AUTHORIZATION "jellyfin-pg";
```

This is the whole database of a test instance. **Check the database name
before running it.**

## 3. Install, migrate, activate

1. **Dashboard → Plugins → Repositories → +**, paste the manifest URL above.
   **Catalog → PostgreSQL Database Provider → Install**, then restart the
   server.
2. **Plugin → Configuration.** Paste the connection string:

   ```bash
   kubectl -n equestria get secret jellyfin-pg-env \
     -o jsonpath='{.data.POSTGRES_CONNECTION_STRING}' | base64 -d
   ```

   Press **Test connection**; it must answer OK. Then **Save**. Leave
   **PostgreSQL bin directory** empty. Set **backup retention** to a number of
   days, or turn the daily backup task off: the default `0` keeps every daily
   `pg_dump` on the config volume forever, and the CNPG cluster's nightly dump
   already covers this database.
3. **Plugin → Migration → Migrate data from SQLite to PostgreSQL.** Leave
   *Truncate tables before insert* off, because §2 left the database empty.
   Start it and wait for 100%.
4. **Activate PostgreSQL and restart Jellyfin.** The plugin writes
   `database.xml` and the server restarts onto PostgreSQL. From that start on,
   the init container keeps the password in it current.

The log line that proves the switch:

```
[ENGINE] Modo activo: PostgreSQL. Connection: Host=...;Password=*****
```

## 4. Verify

**Row counts, every table, SQLite against PostgreSQL.** `data/jellyfin.db` is
still on the volume after activation. A table that
silently loaded nothing is exactly what the fork trial produced. It lost all 84
`Devices` rows to a 48-character `AppVersion` in a `varchar(32)`, and all 3,863
`KeyframeData` rows to a JSON-vs-`bigint[]` mismatch. Both runs reported
success.

```bash
# PostgreSQL, from the CNPG primary.
kubectl -n database exec -i \
  "$(kubectl -n database get pod -l cnpg.io/cluster=postgres,cnpg.io/instanceRole=primary -o name)" \
  -c postgres -- psql -d jellyfin-pg -Atc \
  "select relname, n_live_tup from pg_stat_user_tables order by 1"
```

For SQLite, the Jellyfin image has no `sqlite3`. An ephemeral container that
shares the app's process namespace can read the file through `/proc/1/root`.
It runs as the pod's UID, which is what makes that path readable:

```bash
kubectl -n equestria debug -it deploy/jellyfin-pg --target=app \
  --image=docker.io/keinos/sqlite3 -- \
  sh -c 'sqlite3 /proc/1/root/config/data/jellyfin.db \
    "select name from sqlite_master where type=\"table\" order by 1" |
    while read t; do echo "$t $(sqlite3 /proc/1/root/config/data/jellyfin.db "select count(*) from \"$t\"")"; done'
```

`n_live_tup` is an estimate until `ANALYZE` runs; run the plugin's **Apply
optimizations** (Health) first, or use `count(*)` for the tables that differ.
Pay particular attention to `Devices`, `KeyframeData` and `UserData`.

Then, in order of what each proves:

- **Plugin → Health** reads Ok, and `pg_trgm` is available.
- Users log in; libraries resolve; `GET /Items/{id}` returns real metadata.
- `GET /Videos/{id}/stream?static=true` with a Range header returns 206.
- Mark something played: the row changes in PostgreSQL. That is the write path,
  and reads alone do not exercise it.
- Restart the pod and re-read that row.

## When Renovate bumps Jellyfin

Both servers get the new image in the same PR. On the clone, a bump that
carries migrations runs this sequence:

1. The plugin's `pg_dump` writes to `/config/data/postgres-migration-backups`.
   This is uncompressed and about the size of the database.
2. The migrations run against PostgreSQL.
3. The backup is deleted when they succeed.

The startup probe allows ten minutes for all of it.

If the clone fails and production does not, that is the result this instance
exists to produce. Read the log, then either wait for a plugin release or pin
the clone's tag back by hand until there is one. Pinning back is a deliberate
divergence: put it in the PR.

## Re-clone from production

When the copy has drifted, or to rerun the migration from a fresh snapshot:

1. Change `spec.trigger.manual` in `replicationdestination.yaml` to any new
   value, e.g. `clone-<date>`, and merge.
2. Scale to zero and delete the claim; Flux recreates it from the new restore:

   ```bash
   kubectl -n equestria scale deploy/jellyfin-pg --replicas=0
   kubectl -n equestria delete pvc jellyfin-pg-config
   flux -n equestria reconcile kustomization jellyfin-pg
   ```

3. Repeat §2 and §3. The new volume is on SQLite, so the init container leaves
   the database alone until you activate again.

**Never `restore-once` as the trigger value.** The `volsync-restore-cleanup`
CronJob deletes completed `restore-once` destinations and Flux recreates them,
which would re-restore 60Gi of production every night.

## Back to SQLite

Delete `config/database.xml` and restart. Jellyfin falls back to
`data/jellyfin.db`, which is the clone as it stood at migration time; anything
written to PostgreSQL since is not in it. The plugin has an export
(PostgreSQL → SQLite) if that matters.

## ⚠️ What it shares with production

| | Production | Clone |
| --- | --- | --- |
| `truenas-media` (the library) | `/media` | `/media`, **writable** |
| `/mnt/stash/data/jellyfin` | `/metadata` | same |
| `…/subtitles` | `/config/data/subtitles` | same |
| `…/trickplay` | `/config/data/trickplay` | same |

The cloned database stores absolute paths, so these must resolve identically.
The price is isolation. A metadata refresh, a prune or a deleted item on the
clone changes what production serves, and **library options decide whether a
scan writes `.nfo` files and artwork into `/media`**. **Never clear those paths
from inside the clone's pod.**

Also inherited from the copy, and worth a look after each re-clone:

- **Plugins with outside side effects.** Webhook destinations (Discord, the
  \*arr apps), Trakt scrobbling and Tracearr SSE run on the clone too. The host
  rewrite only repoints links *to Jellyfin*, not where notifications go.
  Disable whatever should not fire twice.
- **The same server ID** as production. Clients that remember servers by ID can
  confuse the two. The clone has no LAN interface, so LAN discovery answers
  only for production.
- **Plugin SQLite databases** (`playback_reporting.db`, `infuse_sync.db`, …)
  stay SQLite files on the volume; the provider never sees them.

## Teardown

In this order. Steps 3 and 4 are one unit: never leave a live database with no
`Database` CR, because the nightly backup CronJob treats that as a hard failure.

1. **Remove the app.** Delete `kubernetes/apps/equestria/media/jellyfin-pg/`
   and its line in `kubernetes/apps/equestria/media/kustomization.yaml`. Flux
   prunes the HelmRelease, both PVCs, the seed `ReplicationDestination` (and its
   staging volumes), the scripts ConfigMap and both ExternalSecrets.
2. **Let Pulumi drop the OpenBao role** before step 4. A static role whose
   PostgreSQL role was dropped fails on its next rotation:

   ```bash
   kubectl annotate stack -n pulumi system pulumi.com/reconciliation-request=$(date +%s) --overwrite
   ```

3. **Delete the retained CNPG objects.** `components/postgres` renders them with
   `deletionPolicy: Orphan`, `retain` and prune disabled:

   ```bash
   kubectl -n database delete database jellyfin-pg
   kubectl -n database delete databaserole jellyfin-pg
   kubectl -n database delete externalsecret jellyfin-pg-postgres
   kubectl -n database delete secret jellyfin-pg-postgres jellyfin-pg-postgres-conn
   kubectl delete clustergenerator jellyfin-pg-postgres-rotation
   ```

4. **Drop the database and role**, one statement per `-c`:

   ```sql
   DROP DATABASE "jellyfin-pg";
   DROP ROLE "jellyfin-pg";
   ```

Leave `/mnt/stash/data/jellyfin` on the NAS alone. It is production's.
