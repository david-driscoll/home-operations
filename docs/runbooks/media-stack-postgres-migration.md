# Media stack: SQLite → PostgreSQL migration

Moving the media stack off the SQLite files in its config PVCs and onto the shared CNPG cluster
in `database`.

**Eight applications, in two families.** The procedure in §3–§8 is the same for all of them;
the per-app differences are in §9.

| App | Family | Databases | Loader | Notes |
| --- | --- | --- | --- | --- |
| `sonarr` | Servarr | `sonarr`, `sonarr-log` | pgloader | log DB new, not backed up |
| `radarr` | Servarr | `radarr`, `radarr-log` | pgloader | " |
| `lidarr` | Servarr | `lidarr`, `lidarr-log` | pgloader | " |
| `prowlarr` | Servarr | `prowlarr`, `prowlarr-log` | pgloader | " |
| `bazarr` | Servarr-adjacent | `bazarr` | pgloader | derived `--cast` list; one config.yaml edit |
| `seerr` | Overseerr family | `seerr` | pgloader (`ralgar` build, digest-pinned) | §9.3 |
| `jellyseerr` | Overseerr family | `jellyseerr` | pgloader (`ralgar` build, digest-pinned) | §9.3 |
| `autobrr` | — | `autobrr` | **`autobrrctl db:convert`** | first-party tool; skips §5.2, §5.5 |

**Four applications were checked and are out of scope**, because they have no relational
database to migrate:

| App | What it actually stores | Verified at |
| --- | --- | --- |
| `kapowarr` | one SQLite file, `db/Kapowarr.db`; no Postgres support in any release | v1.3.1 |
| `mylar` | SQLite only — `mylar/db.py` hard-codes `sqlite3.connect(...)` | v0.8.3 |
| `sabnzbd` | an INI file (`sabnzbd.ini`) plus per-job admin files; no database at all | 5.1.2 |
| `qbittorrent` | `qBittorrent.conf` via QSettings plus `.fastresume` files; no database at all | 5.2.3 |

Nothing to do for those four — no manifest changes, and they keep their config PVCs as-is.

Source material per app is linked from §9. For the Servarr four, the two pages that matter are
each app's `postgres-setup` and `environment-variables` on <https://wiki.servarr.com>.

Read [`kubernetes/components/postgres/AGENTS.md`](../../kubernetes/components/postgres/AGENTS.md)
first if you have not. This runbook assumes the model it describes: one database, one login role
and one OpenBao-owned rotating password per app, all discovered from a single line in `ks.yaml`.

> **Most of these upstreams call the SQLite migration unsupported, and mean it.** The Servarr
> pages say only fresh Postgres installs are supported; the Overseerr-family docs route you
> through a community pgloader build from an unmerged upstream PR (pinned by digest in §9.3).
> autobrr is the one exception
> — it ships a first-party converter. The rollback in §7 is not a formality.

**All eight databases land in `public`.** Every one of these applications emits unqualified DDL,
so its tables go wherever `search_path` resolves first. `components/postgres` declares **only**
`public` and no schema named after the role, so `"$user"` has nothing to resolve to and the path
falls through — verified on the live cluster, where `openbao` is the sole database with a
role-named schema and every app database is `public`-only. Two of these apps would break
otherwise: bazarr's `0124f9e278fb_` migration probes `table_schema = 'public'`, and seerr's
`FixBlocklistIdDefault` hard-codes `public."blocklist_id_seq"`. §6 has the drift check.

---

## 1. What the Servarr wiki says, and what this estate does instead

Four deliberate deviations, all four specific to the Servarr family (`sonarr`, `radarr`,
`lidarr`, `prowlarr`, and `bazarr` where noted). Each is a decision, not an oversight.
§9 carries the equivalents for the other apps.

### 1.1 Two databases per app, and the log one is new

The wiki is emphatic that each app needs **two** databases (`sonarr-main` and `sonarr-log`),
that it will not create either for you, and that both must exist before first start. That is
correct, and this migration honours it — but it was not always going to.

All four HelmReleases used to carry `<APP>__LOG__DBENABLED: "False"`, so there was no log
database anywhere, not even the SQLite one. In `NzbDrone.Host/Bootstrap.cs` that flag selects
`AddDummyLogDatabase()` over `AddLogDatabase()`:

```csharp
if (logDbEnabled) { c.AddLogDatabase(); } else { c.AddDummyLogDatabase(); }
```

`AddDummyLogDatabase()` registers `new LogDatabase(null)` — no connection is ever opened and
`PostgresLogDb` is never read. Verified in the source at each pinned tag: Sonarr
`v4.0.19.3007`, Radarr `v6.4.2.10590`, Lidarr `v3.1.3.4987`, Prowlarr `v2.6.2.5562`.

**The flag is now `"True"`, and each app gets a second `Database`.** That brings System > Logs
back in the UI, and it makes `<app>-log` a hard startup dependency: the app opens both
connections at boot and creates neither. `components/postgres` renders exactly one database, so
the second comes from its sibling
[`components/postgres/databases`](../../kubernetes/components/postgres/databases/kustomization.yaml),
reading `<app-dir>/postgres-databases/` — the same shape as `postgres/roles`.

Three things follow, and all three are the reason this stays cheap:

- **One credential covers both.** `ConnectionStringFactory` builds the main and log connections
  from the same `PostgresUser`, `PostgresPassword`, `PostgresHost` and `PostgresPort`, varying
  only the database name. So there is no second role, no second OpenBao static role and no
  second password — the log database is simply owned by the app's existing login role.
- **Nothing is migrated into it.** There was no log database before, so `<app>-log` starts empty
  and stays out of the pgloader step entirely. §5 only ever touches the main database.
- **It is not backed up**, by `driscoll.dev/backup: "false"` on each `Database`. It holds only
  the app's own log entries, which the app's `TrimLogDatabase` housekeeper prunes on its own
  schedule. The annotation keeps a `backup-credentials` value anyway, so flipping the exclusion
  off later cannot leave the nightly job hunting for a Secret that does not exist.

`sonarr` rather than the wiki's `sonarr-main` for the primary, because `components/postgres`
names an app's database after the app; `sonarr-log` keeps the wiki's name because nothing
constrains it. Both are only ever what `PostgresMainDb` and `PostgresLogDb` say — see §1.2.

### 1.2 The names are `sonarr` and `sonarr-log`

`components/postgres` names the database and the role after `${APP}`, so the primary is `sonarr`
rather than the wiki's `sonarr-main`. The wiki's names are defaults, not requirements — the app
reads whatever `PostgresMainDb` and `PostgresLogDb` say, and the ExternalSecret sets both.

### 1.3 Environment variables, never `config.xml`

The wiki writes `<PostgresHost>` and friends into `config.xml`. We set
`<APP>__POSTGRES__{HOST,PORT,USER,PASSWORD,MAINDB}` instead, from a Secret, because **the
password rotates every 30 days** and a value baked into a file on the config PVC cannot.

The precedence is explicit in `ConfigFileProvider.cs`, and it goes the right way:

```csharp
public string PostgresHost => _postgresOptions?.Host ?? GetValue("PostgresHost", string.Empty, persist: false);
```

The environment wins, and `persist: false` means nothing is written back to `config.xml`. So the
file on the PVC stays SQLite-shaped and inert, which is exactly what makes §7 a rollback rather
than a restore.

Note that **Sonarr alone has no connection-string option**. Radarr, Lidarr and Prowlarr also
accept `__POSTGRES__MAINDBCONNECTIONSTRING`, and the credential Secret even carries a ready-made
`connection-string` key. It is not used: five variables that work on all four beats one variable
that works on three.

### 1.4 A generic sequence fix and a full truncate, not the per-app SQL lists

The wiki gives each app a hand-maintained list of `setval(...)` statements and — except
Prowlarr — a short list of `DELETE FROM` statements. Both are replaced here:

- **The `setval` lists are wrong on an empty table.** `setval(seq, (SELECT MAX("Id")+1 FROM t))`
  passes `NULL` when `t` is empty, which errors. They also skip a value on every table
  (`is_called` defaults true, so the next id is `MAX+2`), and they drift — Sonarr's list still
  reads `Blacklist_Id_seq` from `Blocklist`. §5.6 derives every sequence from
  `pg_get_serial_sequence` instead, which cannot go stale.
- **Prowlarr's page has no `DELETE` step at all**, which reads as an omission rather than a
  claim that Prowlarr seeds nothing. §5.5 truncates every table in `public` instead of deleting
  from a named few. That is a strict superset of what the wiki deletes, identical in effect
  (pgloader reloads every table from SQLite immediately afterwards), and it cannot drift as the
  schema changes. `TRUNCATE` is not `DROP` — the wiki's "do not drop any tables" still holds.

---

## 2. What lands in git

Per app, all already written on this branch:

| File | Change | Apps |
| --- | --- | --- |
| `ks.yaml` | adds `components/postgres`; `dependsOn` gains `external-secrets` and `postgres` | all eight |
| `externalsecret.yaml` | `${APP}-env`, the app's own connection variables | all eight (new for seven; `autobrr` already had one for OIDC) |
| `kustomization.yaml` | lists `./externalsecret.yaml` | the seven that gained one |
| `helmrelease.yaml` | `envFrom: ${APP}-env`; a startup probe | all eight |
| `ks.yaml` | also `components/postgres/databases`, and `spec.path` anchored into `POSTGRES_APP_PATH` | Servarr four |
| `postgres-databases/` | **new** — the `<app>-log` `Database`, excluded from backup | Servarr four |
| `helmrelease.yaml` | `LOG__DBENABLED: "True"` | Servarr four |

The variable names differ per app and are not interchangeable — `SONARR__POSTGRES__HOST`,
`POSTGRES_HOST`, `DB_HOST` and `AUTOBRR__POSTGRES_HOST` are four different contracts. Each app's
`externalsecret.yaml` documents its own, including the ones that fail silently when set wrong.

**`autobrr` is a special case in git as well as in §9.4.** Its `components/postgres` line and its
whole Postgres block were imported commented-out in `91760f82` and never enabled. Enabling them
also fixed a latent bug: the commented block read `{{ .postgres_user }}`, but the credential
Secret's key is `username`, which the rewrite turns into `postgres_username`. It would have
rendered an empty user, and autobrr does not validate that — `PostgresDSN` omits the userinfo and
lib/pq falls back to the OS user, failing at connect time with an error that points nowhere near
the cause.

Three things need justifying.

**`envFrom` rather than five `secretKeyRef`s.** The connection moves as one unit, and — more
importantly — the password changes under a running pod every 30 days.
`reloader.stakater.com/auto` is already on `controllers.app.annotations`, i.e. on the Deployment,
which is the only place it does anything.

**`postgres-databases/` is not in `kustomization.yaml`.** It sits inside the app's build path,
so listing it would render the `Database` a second time into `equestria`, where CNPG's local
`spec.cluster.name` resolution makes it meaningless and it would fight the real one. Every app
here lists its resources explicitly, so an unreferenced subdirectory is inert. What renders it is
the nested `${APP}-postgres-databases` Kustomization the component emits, which targets
`database`.

**The startup probe.** All eight had a liveness budget of roughly
`initialDelay + failureThreshold × period ≈ 110s` and no startup probe (Lidarr had one worth 30s
of grace; bazarr had one commented out). First boot against an empty Postgres database replays the entire migration chain,
and every rotation forces a cold start. A kubelet kill mid-migration restarts the pod, which
replays from the top, which gets killed again. A startup probe suspends liveness *and* readiness
until it passes; 60 × 10s buys ten minutes and costs nothing on a normal boot.

Validate before merging:

```bash
mise run flate
```

---

## 3. Preconditions

```bash
kubectl config current-context
kubectl -n database get cluster postgres
flux -n flux-system get kustomization cluster-apps
```

- [ ] The CNPG cluster is healthy and has a recent backup. The nightly `pg_dump` to
      `/mnt/stash/data/pgdump` discovers databases from the `Database` resources in the
      `database` namespace, which `components/postgres` renders — so all eight new ones are picked
      up with no edit, but the *first* dump is at 02:00 the following night. (The four `-log`
      databases are deliberately excluded; see §1.1.)
- [ ] Each app has a recent VolSync snapshot. This is the real safety net: the SQLite file it
      holds is the rollback.
- [ ] Nobody else — no other Claude session, no other operator — is doing destructive work in
      the `database` namespace. That has bitten twice.
- [ ] A window is agreed. Each app is fully down for the length of its own §5, dominated by the
      pgloader run: minutes for Prowlarr and Lidarr, longer for Sonarr and Radarr.

---

## 4. Phase 1 — merge, and let the database and role land

**No downtime, but suspend first.** The merge adds `envFrom` to a live HelmRelease. If a pod
picks that up before §5 has loaded any data, the app comes up pointed at an empty database,
serves an empty library to everything holding its API key, and starts writing to Postgres.
Suspending is what keeps §5 the only moment an app's data source changes.

```bash
ALL="prowlarr lidarr sonarr radarr bazarr seerr jellyseerr autobrr"
for app in $ALL; do flux -n equestria suspend hr "$app"; done
for app in $ALL; do kubectl -n equestria scale deploy "$app" --replicas=0; done
```

All eight live in the `equestria` namespace; only their directories differ.

**⚠️ SUSPENDING THE HELMRELEASE IS NOT ENOUGH — SCALE TO ZERO IN THE SAME BREATH.**
Suspension stops *Flux*. It does not stop **reloader**, which watches the credential Secret and
patches the pod template the moment `${APP}-env` first syncs — rolling the Deployment onto an
EMPTY Postgres database with no data in it, past a suspended HelmRelease.

This is not hypothetical. On 2026-08-27 the merge landed before the suspend, seven apps took the
new `envFrom` and stopped with `CreateContainerConfigError` (the safe failure — no Secret yet, so
no pod started). `autobrr` was the one left running, because it reuses its existing
`autobrr-oidc` Secret; when that Secret gained the Postgres keys, reloader restarted it and it
came up on an empty database and applied its own base schema. Recoverable — its SQLite file was
untouched and `db:convert` re-ran cleanly after truncating — but it is a real trap, and
scale-to-zero is the only thing that closes it.

**If the merge already happened**, do this immediately, in this order: suspend, then scale every
app to zero, *then* work §4.1. Anything already stopped is fine; anything still running is the
one at risk.

Merge the PR, then:

```bash
flux -n flux-system reconcile ks cluster-apps
kubectl -n database get databaserole $ALL
kubectl -n database get database     $ALL
kubectl -n database get database     prowlarr-log lidarr-log sonarr-log radarr-log
```

Only the Servarr four have a `-log` database. `bazarr`, `seerr`, `jellyseerr` and `autobrr` get
one database each.

The `-log` databases come from a **separate** nested Kustomization,
`<app>-postgres-databases`, and it is `wait: false` like its siblings — so nothing blocks on it
and nothing tells you it failed except the object not being there. Check it explicitly:

```bash
flux -n equestria get kustomizations | grep postgres
```

### 4.1 Expect the Pulumi stack to stall, once

This is the **brand-new-app** ordering trap written up in
[`kubernetes/components/postgres/ks.yaml`](../../kubernetes/components/postgres/ks.yaml), and
this change is eight brand-new apps at once. `stacks/system` discovers `components/postgres` in a
`ks.yaml` and creates `database/static-roles/<app>` in OpenBao, which immediately issues
`ALTER ROLE ... PASSWORD`. The Pulumi operator reconciles the merge in seconds; Flux's
`cluster-apps` runs on its own interval. Pulumi wins the race, and fails:

```
Code: 500 ... error setting credentials: failed to execute query:
ERROR: role "sonarr" does not exist (SQLSTATE 42704)
```

All eight are brand-new here — none of them has ever had a role or a database, `autobrr`
included (its `components/postgres` line was imported commented-out and never enabled).

After three failures the Stack goes `Stalled/UpdateFailed` and, with
`resyncFrequencySeconds: 86400`, sits there for a day. Expected, not a bug. Clear it in this
order:

```bash
flux -n flux-system reconcile ks cluster-apps
kubectl -n database get databaserole $ALL -w   # wait for status.applied
kubectl annotate stack -n pulumi system pulumi.com/reconciliation-request=$(date +%s) --overwrite
```

Then force the ExternalSecrets to re-resolve. They cache the `Secret does not exist` error and
will otherwise leave the app in `CreateContainerConfigError`:

```bash
for app in $ALL; do
  kubectl -n database annotate externalsecret "${app}-postgres" force-sync=$(date +%s) --overwrite
  kubectl -n equestria annotate externalsecret "${app}-env"     force-sync=$(date +%s) --overwrite
done
```

### 4.2 Gate

Do not start §5 for an app until both of these hold:

```bash
app=prowlarr
kubectl -n database get externalsecret "${app}-postgres"     # SecretSynced
kubectl -n database get database "${app}" "${app}-log" -o custom-columns='NAME:.metadata.name,APPLIED:.status.applied'
kubectl -n equestria get secret "${app}-env" -o jsonpath='{.data}' | tr ',' '\n'
```

Both databases must report `applied: true` (only the Servarr four have a second one), and the
`${app}-env` Secret's host key must decode to `postgres-rw.database.svc.cluster.local`. The key
NAMES differ per app — see the table in §5.

**The log database is a hard startup dependency.** With `LOG__DBENABLED: "True"` the app opens
`PostgresLogDb` at boot and will not create it, so an app that comes up before `<app>-log` exists
crash-loops on `database "<app>-log" does not exist`. That is why this gate checks it, and it is
the one new way this cutover can fail that the SQLite-era runbook had no equivalent of.

---

## 5. Phase 2 — per-app cutover

**One app at a time, start to finish.** Suggested order, cheapest failure first: **autobrr**
(§9.4 — first-party converter, so it proves the database and credential plumbing without any
pgloader risk), then **prowlarr** (smallest pgloader load), then lidarr, sonarr, radarr, bazarr,
and seerr/jellyseerr last since §9.3 asks you to make a call about the loader image.

Set these once per app and leave them set for the whole of §5 and §6:

| `app` | `port` | sqlite file | env prefix | §9 |
| --- | --- | --- | --- | --- |
| `prowlarr` | 9696 | `/config/prowlarr.db` | `PROWLARR__POSTGRES__*` | — |
| `lidarr` | 8686 | `/config/lidarr.db` | `LIDARR__POSTGRES__*` | — |
| `sonarr` | 8989 | `/config/sonarr.db` | `SONARR__POSTGRES__*` | — |
| `radarr` | 7878 | `/config/radarr.db` | `RADARR__POSTGRES__*` | — |
| `bazarr` | 6767 | `/config/db/bazarr.db` | `POSTGRES_*` | §9.2 |
| `seerr` | 5055 | `/app/config/db/db.sqlite3` | `DB_*` | §9.3 |
| `jellyseerr` | 5055 | `/app/config/db/db.sqlite3` | `DB_*` | §9.3 |
| `autobrr` | 7474 | `/config/autobrr.db` | `AUTOBRR__POSTGRES_*` | **§9.4 — different procedure** |

**`autobrr` does not follow §5.** It ships a first-party converter that creates the schema,
copies the data and resets the sequences in one command. Go to §9.4 instead.

```bash
app=prowlarr
port=9696
APP_UC=$(printf '%s' "$app" | tr '[:lower:]' '[:upper:]')

image=$(kubectl -n equestria get deploy "$app" -o jsonpath='{.spec.template.spec.containers[0].image}')
primary=$(kubectl -n database get cluster postgres -o jsonpath='{.status.currentPrimary}')
echo "$app / $image / primary=$primary"
```

`$primary` is used for every psql call below. `kubectl exec -i … -- psql` is used rather than
`kubectl cnpg psql`, which allocates a TTY and so cannot be fed a heredoc; use the plugin for
interactive poking, this for scripted SQL.

### 5.1 Stop the app

Already done in §4 for all eight — both halves of it. Re-check rather than assume, because a
running pod here means something restarted it:

```bash
kubectl -n equestria get deploy "$app" -o jsonpath='{.spec.replicas}'   # must be 0
```

```bash
kubectl -n equestria scale deploy "$app" --replicas=0
kubectl -n equestria rollout status deploy "$app" --timeout=5m
kubectl -n equestria get pods -l "app.kubernetes.io/name=$app"
```

Wait until the pod is **gone**, not merely `Terminating`. A graceful stop is what checkpoints
SQLite's WAL; a killed pod leaves a `-wal` beside the `.db` and the copy in §5.3 has to replay
it.

### 5.2 Create the schema — in a throwaway pod, not the app

The wiki's instruction is "run the app against the created Postgres databases at least once".
Doing that with the real Deployment means the live Service serves an empty library to Prowlarr's
app sync, to Pulsarr, to Overseerr and to anything else holding the API key. A bare Pod with
**deliberately different labels** does not match the Service selector, so nothing routes to it.

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${app}-schema-init
  namespace: equestria
  labels:
    driscoll.dev/oneshot: servarr-postgres
spec:
  restartPolicy: Never
  securityContext:
    runAsUser: 568
    runAsGroup: 568
    fsGroup: 568
  containers:
    - name: app
      image: ${image}
      envFrom:
        - secretRef:
            name: ${app}-env
      env:
        # Servarr four only. No LOG__DBENABLED override, deliberately:
        # `LogDbEnabled` defaults to true, which is what the HelmRelease now
        # sets, so this pod builds the schema in BOTH databases. Setting it
        # "False" here would leave `<app>-log` empty and push its migration into
        # the app's first real boot -- inside the startup-probe budget, with
        # nobody watching. For bazarr, seerr and jellyseerr, drop this `env:`
        # block entirely; `envFrom` above is all they need.
        - name: ${APP_UC}__LOG__LEVEL
          value: info
      volumeMounts:
        - name: config
          mountPath: /config
  volumes:
    - name: config
      emptyDir: {}
EOF

kubectl -n equestria logs -f "${app}-schema-init"
```

`emptyDir` for `/config` is the point: this pod cannot reach the real config PVC, has no SQLite
file to find, and no choice but to build its schema in Postgres.

Wait for `Now listening on: http://[::]:${port}`, confirm the schema is really there, note the
migration version, then delete the pod:

```bash
kubectl -n database exec -i "$primary" -c postgres -- psql -d "$app" -c '\dt' | head -20
kubectl -n database exec -i "$primary" -c postgres -- psql -d "$app" \
  -c 'SELECT max("Version") FROM "VersionInfo";'
# and the log database, which this pod also migrated
kubectl -n database exec -i "$primary" -c postgres -- psql -d "${app}-log" -c '\dt'
kubectl -n equestria delete pod "${app}-schema-init"
```

`\dt` should list tens of tables on the main database and a couple (`Logs`, `VersionInfo`) on the
log one. If either lists none, the pod never reached that database — read its logs for an Npgsql
authentication failure before going any further.

### 5.3 Cold-copy the SQLite database

Not read in place: a leftover `-wal` needs a writable file to recover into, and you want an
untouched original either way.

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${app}-dbcopy
  namespace: equestria
  labels:
    driscoll.dev/oneshot: servarr-postgres
spec:
  restartPolicy: Never
  containers:
    - name: c
      image: docker.io/library/busybox:1.37
      command: ["sh", "-c", "ls -l /config/${app}.db*; sleep 3600"]
      volumeMounts:
        - { name: config, mountPath: /config, readOnly: true }
  volumes:
    - name: config
      persistentVolumeClaim:
        claimName: ${app}
EOF

kubectl -n equestria wait --for=condition=Ready "pod/${app}-dbcopy" --timeout=5m
kubectl -n equestria cp "${app}-dbcopy:/config/${app}.db" "./${app}.db.$(date +%Y%m%d).bak"
ls -lh "./${app}.db."*.bak
kubectl -n equestria delete pod "${app}-dbcopy"
```

Keep that file until the app has been happily on Postgres for a week. It is the second rollback,
after the VolSync snapshot, and §6 compares row counts against it.

### 5.4 Check the two schemas are at the same migration version

Both were migrated by the same binary, so they should already agree. This is the last cheap
moment to find out they do not — a mismatch means the SQLite data will not fit the Postgres
schema, and the fix is to get both onto the same app version before continuing.

```bash
sqlite3 "./${app}.db."*.bak 'SELECT max(Version) FROM VersionInfo;'
# compare against the number printed at the end of 5.2
```

### 5.5 Truncate the seeded schema

The schema from §5.2 arrives pre-seeded — quality profiles, quality definitions, the config row,
the scheduled-task list. pgloader is about to insert the SQLite copies of all of those, so they
have to go first or each one is a primary-key collision. §1.4 covers why this is a blanket
truncate rather than the wiki's per-app `DELETE` lists.

`-d "$app"`, the MAIN database, in this step and in §5.6. **`<app>-log` is never truncated and
never loaded** — it is new, it starts empty, and there was no SQLite log database to migrate
from. Pointing either step at it would throw away the schema §5.2 just built.

```bash
kubectl -n database exec -i "$primary" -c postgres -- psql -v ON_ERROR_STOP=1 -d "$app" <<'SQL'
DO $$
DECLARE stmt text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO stmt
    FROM pg_tables
   WHERE schemaname = 'public';
  IF stmt IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || stmt || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
SQL
```

`RESTART IDENTITY` and `CASCADE` are both load-bearing: the first resets the sequences the seed
rows consumed, the second means the tables need not be named in foreign-key order.

### 5.6 Load the data with pgloader

pgloader wants its target as a URI and the password is OpenBao-generated, so **percent-encode
it** — a `/`, `@`, `:` or `#` otherwise produces a URI that parses to the wrong thing without
complaining:

```bash
pw=$(kubectl -n equestria get secret "${app}-env" \
       -o "jsonpath={.data['${APP_UC}__POSTGRES__PASSWORD']}" | base64 -d)
usr=$(kubectl -n equestria get secret "${app}-env" \
       -o "jsonpath={.data['${APP_UC}__POSTGRES__USER']}" | base64 -d)
host=$(kubectl -n equestria get secret "${app}-env" \
       -o "jsonpath={.data['${APP_UC}__POSTGRES__HOST']}" | base64 -d)
port_db=$(kubectl -n equestria get secret "${app}-env" \
       -o "jsonpath={.data['${APP_UC}__POSTGRES__PORT']}" | base64 -d)
db=$(kubectl -n equestria get secret "${app}-env" \
       -o "jsonpath={.data['${APP_UC}__POSTGRES__MAINDB']}" | base64 -d)

uri="postgresql://$(printf %s "$usr" | jq -sRr @uri):$(printf %s "$pw" | jq -sRr @uri)@${host}:${port_db}/${db}"
kubectl -n equestria create secret generic "${app}-pgloader" --from-literal=target="$uri"
unset pw uri
```

The Secret exists so the password never lands in a Job spec, and it is deleted at the end of
this section.

```bash
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${app}-pgloader
  namespace: equestria
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        driscoll.dev/oneshot: servarr-postgres
    spec:
      restartPolicy: Never
      securityContext:
        runAsUser: 568
        runAsGroup: 568
        fsGroup: 568
      initContainers:
        - name: copy-db
          image: docker.io/library/busybox:1.37
          command: ["sh", "-c", "cp -v /config/${app}.db* /work/ && ls -l /work"]
          volumeMounts:
            - { name: config, mountPath: /config, readOnly: true }
            - { name: work, mountPath: /work }
      containers:
        - name: pgloader
          image: ghcr.io/roxedus/pgloader@sha256:1a7a86ad56623c00ee714ee4969913ed5c6f59ac9785073e2ffd1bea9cc54d31
          args:
            - --with
            - quote identifiers
            - --with
            - data only
            - --with
            - prefetch rows = 100
            - --with
            - batch size = 1MB
            - /work/${app}.db
            - \$(PGLOADER_TARGET)
          env:
            - name: PGLOADER_TARGET
              valueFrom:
                secretKeyRef:
                  name: ${app}-pgloader
                  key: target
          volumeMounts:
            - { name: work, mountPath: /work }
            - { name: tmp, mountPath: /tmp }
      volumes:
        - name: config
          persistentVolumeClaim:
            claimName: ${app}
        - name: work
          emptyDir: {}
        - name: tmp
          emptyDir: {}
EOF

kubectl -n equestria logs -f "job/${app}-pgloader"
```

Everything unusual in that Job is there because the alternative goes wrong:

- **`--with "quote identifiers"` and `--with "data only"`** are the two the wiki insists on.
  Without the first, pgloader folds identifiers to lower case and finds no `"Movies"`. Without
  the second, it tries to build its own schema over the app's.
- **`prefetch rows` and `batch size`** are the wiki's large-database workaround, applied from
  the start because they cost nothing and the alternative is discovering you needed them an hour
  in.
- **`backoffLimit: 0`.** A partially loaded database must never be loaded into a second time. If
  the Job fails, go back to §5.5, truncate, and re-run.
- **The image is pinned by digest.** `latest` is the only tag Roxedus publishes, and it is
  `amd64`-only — fine on these nodes, and the reason this runs in-cluster rather than on a Mac.
- **`$(PGLOADER_TARGET)`** is expanded by the kubelet, not a shell. The `\$` above escapes it
  from *your* shell, not from Kubernetes.
- **The app's config PVC is Longhorn RWO.** The Job can only attach it because §5.1 scaled the
  app to zero.

Then fix the sequences. This replaces the wiki's per-app `setval` list — see §1.4.

**Observed 2026-08-27:** pgloader's sqlite→pgsql path *does* reset sequences on its own — it
reported `Reset Sequences 19` (prowlarr), `14` (bazarr) and `14` (seerr). So this block is
belt-and-braces rather than the sole guard. Run it anyway: it is idempotent, it covers anything
pgloader skipped, and the failure it prevents is silent until the first insert. Confirmed working
afterwards on prowlarr (`History_Id_seq.last_value` = `max("Id")` = 506836), and proven in
production when prowlarr and radarr wrote new history rows minutes later with no duplicate-key
error.

```bash
kubectl -n database exec -i "$primary" -c postgres -- psql -v ON_ERROR_STOP=1 -d "$app" <<'SQL'
DO $$
DECLARE r record; maxid bigint;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl,
           a.attname AS col,
           pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM public.%I', r.col, r.tbl) INTO maxid;
    EXECUTE format('SELECT setval(%L, %s, true)', r.seq, GREATEST(maxid, 1));
  END LOOP;
END $$;
SQL

kubectl -n equestria delete job "${app}-pgloader"
kubectl -n equestria delete secret "${app}-pgloader"
```

### 5.7 Start the app

```bash
flux -n equestria resume hr "$app"
kubectl -n equestria scale deploy "$app" --replicas=1
kubectl -n equestria rollout status deploy "$app" --timeout=10m
kubectl -n equestria logs -l "app.kubernetes.io/name=$app" -c app --tail=100
```

**⚠️ THE SCALE-UP IS NOT REDUNDANT.** `flux resume` does not restore the replica count: the
app-template chart only renders `replicas` when it is configured, and none of these apps
configure it — so Helm does not own that field and the scale-to-zero from §5.1 survives the
resume untouched. `rollout status` then reports "successfully rolled out" against zero replicas
and you will believe the app is up. Verified on prowlarr, where exactly that happened.

Confirm it is actually on Postgres and not quietly back on SQLite:

```bash
kubectl -n equestria exec deploy/"$app" -- env | grep "${APP_UC}__POSTGRES__HOST"
kubectl -n database exec -i "$primary" -c postgres -- psql -d "$app" \
  -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '$app';"
```

---

## 6. Verification

Per app, in the UI:

- [ ] **Sonarr** — series list complete; History populated; Indexers, Download Clients, Import
      Lists, Custom Formats, Quality Profiles, Tags and Notifications all present.
- [ ] **Radarr** — the same, plus Collections and Lists.
- [ ] **Lidarr** — artists, albums and Metadata Profiles.
- [ ] **Prowlarr** — indexers, Applications (the sync targets), and app sync still works.
- [ ] **The write path.** Add and remove a tag in each app. It is the cheapest thing that
      exercises an `INSERT` with a sequence, which is the failure §5.6 exists to prevent. A
      `duplicate key value violates unique constraint` here means the sequence fix did not run,
      or did not cover that table.
- [ ] **Bazarr** — series and movies listed, language profiles intact, History populated. Then
      the check that matters more than the UI: `kubectl -n equestria logs deploy/bazarr | grep -i
      "Connecting to PostgreSQL database"`. Without that line bazarr is on SQLite and everything
      above is the *old* data (§9.2).
- [ ] **Seerr / Jellyseerr** — request history, users, watchlists and issues. Settings, the API
      key and every service pairing come from `settings.json` on the PVC and are unaffected
      either way, so a healthy-looking UI proves nothing about the database. Confirm with
      `psql -d "$app" -c '\\dt'`.
- [ ] **autobrr** — filters, indexers, download clients, feeds and API keys. You will be logged
      out once; that is expected (§9.4). Releases history should be present.
- [ ] **Cross-app** — Prowlarr → *Test All Applications*; anything holding an API key (Pulsarr,
      Overseerr, Kometa) still sees a full library.

- [ ] **System > Logs** shows entries in each Servarr app. That tab was empty before this change
      — the log database is what fills it, and it is the cheapest proof that the second
      connection opened.

Servarr four only — both databases, and the log one being deliberately excluded from backup:

```bash
kubectl -n database get database "$app" "${app}-log" \
  -o custom-columns='NAME:.metadata.name,APPLIED:.status.applied,BACKUP:.metadata.annotations.driscoll\.dev/backup'
kubectl -n database exec -i "$primary" -c postgres -- psql -d "${app}-log" -c 'SELECT count(*) FROM "Logs";'
```

Row counts, SQLite versus Postgres, on the tables that matter:

```bash
sqlite3 "./${app}.db."*.bak 'SELECT count(*) FROM History;'
kubectl -n database exec -i "$primary" -c postgres -- psql -d "$app" \
  -c 'SELECT count(*) FROM "History";'
```

And a schema-layout check, because this cluster has been bitten by it before. It must return
exactly one row, `public`:

```bash
kubectl -n database exec -i "$primary" -c postgres -- psql -d "$app" <<'SQL'
SELECT n.nspname, count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public', current_database())
   AND c.relkind IN ('r','p','v','m','S')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
 GROUP BY 1;
SQL
```

A second row named after the app means `search_path`'s `$user` element has armed and the app is
splitting its data across two schemas. Stop, and read the schema section of
`components/postgres/AGENTS.md`.

This check is not boilerplate for three of these apps. bazarr's `0124f9e278fb_` migration probes
`table_schema = 'public'` directly, and seerr's `FixBlocklistIdDefault` hard-codes
`public."blocklist_id_seq"` — both would fail partway through a migration run if the tables had
landed anywhere else. They land in `public` because `components/postgres` declares only `public`;
this confirms it rather than assuming it.

---

## 7. Rollback

**The SQLite file is untouched throughout.** §5.3 only copies it, and §1.3 is why nothing ever
writes back to `config.xml`. So rolling back means nothing more than making the app stop reading
the Postgres environment.

Fast, per app, no git:

```bash
flux -n equestria suspend hr "$app"
kubectl -n equestria set env deploy/"$app" --containers=app "${APP_UC}__POSTGRES__HOST-"
kubectl -n equestria rollout status deploy "$app"
```

An empty `PostgresHost` makes `ConnectionStringFactory` choose the SQLite path — for **both**
connections, so the log database stops being needed at the same moment. The app comes back on
exactly the data it had before §5, writing its log entries to a fresh SQLite `logs.db`. Follow it with a revert of the PR — otherwise the next
reconcile puts `envFrom` back.

What you lose is whatever was written to Postgres after cutover: rolling back the next morning
loses a night of history and grabs. Say that out loud before choosing it.

Deeper failures:

| Symptom | Action |
| --- | --- |
| pgloader failed part-way | Truncate (§5.5) and re-run §5.6. Never re-run pgloader into a partially loaded database. |
| Config PVC damaged | VolSync restore, then start again from §5.1. |
| Postgres data wrong, SQLite fine | Roll back as above. The Postgres database can be truncated and re-loaded at leisure. |
| App crash-loops on `database "<app>-log" does not exist` | The log database has not landed. Either reconcile `<app>-postgres-databases`, or set `<APP>__LOG__DBENABLED: "False"` to drop the dependency — that lever is independent of the Postgres one. |

Leaving the `components/postgres` line behind after a rollback is fine, and is what other apps
do — comment it out (`autobrr` is the pattern) so the Pulumi discovery stops seeing it. The
database, role and OpenBao static role are **not** cleaned up by that: nothing this component
renders is ever pruned, by design. Cleaning up for real is a manual job, and re-enabling a
commented-out line puts the app straight back into the §4.1 new-app race.

---

## 8. After

- **Three applications stop backing up their own data, and none of them warns you.** All four
  Servarr wiki pages say it outright — "Postgres databases are NOT backed up by \<app\>" — so the
  backup zip becomes `config.xml` and not much else. bazarr is the same, plus the `config.yaml`
  wrinkle in §9.2. autobrr's periodic database snapshots are SQLite-only code with no Postgres
  equivalent, so `AUTOBRR__DATABASE_MAX_BACKUPS` silently becomes a no-op. In all three cases the
  real backup is now the nightly `pg_dump` to `/mnt/stash/data/pgdump`, which discovers databases
  from the `Database` resources `components/postgres` renders and picks all eight up with no edit.
  Confirm the first run:

  ```bash
  kubectl -n database logs -l app.kubernetes.io/name=postgres-backup --tail=50
  ```

- **Do not lower `VOLSYNC_CAPACITY`** now that the config PVC holds less. Lowering it deletes the
  PVC and leaves it unbindable. Sonarr and Radarr set `10Gi`; leave them.

- **Each app now restarts every 30 days** when OpenBao rotates its password. That is
  irreversible per app from the moment the component landed — `rotation_period` is mandatory and
  [openbao#284](https://github.com/openbao/openbao/issues/284) is still open. The startup probe
  from §2 is what makes it survivable.

- **The SQLite files stay on the config PVC.** They are the rollback, they are small, and
  deleting them buys nothing. Revisit in a month if the space matters.

- **`Housekeeping` runs `VACUUM;` and does not need a superuser.** The Prowlarr page claims the
  user must be one. Two reasons it is not true here: the role owns its database and every table
  it created, so a bare `VACUUM` covers all of them and merely warns about catalogs it skips; and
  `Database.Vacuum()` wraps the call in a `try/catch` that logs and moves on. Do **not** add
  `components/postgres/superuser` — `immich` is the only app that has it, and a `DatabaseRole`
  forces every attribute it declares.

---

## 9. Per-app deltas

§3-§8 is the whole procedure. This section is only what differs.

### 9.1 The Servarr four — nothing extra

`sonarr`, `radarr`, `lidarr`, `prowlarr` follow §5 exactly. Their only distinguishing feature is
the second `-log` database, covered in §1.1.

### 9.2 bazarr

Env prefix `POSTGRES_*` (bare, no app prefix). Source:
<https://wiki.bazarr.media/Additional-Configuration/PostgreSQL-Database/>.

**Three things will bite you, and two are silent.**

**`POSTGRES_ENABLED` must be the literal string `"true"`.** The check is
`POSTGRES_ENABLED_ENV.lower() == 'true'` — `"1"`, `"yes"` and `"on"` all evaluate false and
Bazarr starts on the SQLite file in `/config` with no error. Confirm from the startup log:

```bash
kubectl -n equestria logs deploy/bazarr | grep -i "Connecting to PostgreSQL database"
```

**Do not use `POSTGRES_URL`.** It exists at 1.6.0 and does not work alone: `database.py` reads
`os.getenv('POSTGRES_HOST', settings.postgresql.host)`, `config.py` gives that key a `must_exist`
default of `localhost`, and `validate_all()` always materialises it — so the truthy default is
applied over the URL and the connection goes to localhost. The manifest uses the six discrete
variables.

**Bazarr's own backup task needs a one-time `config.yaml` edit.** `utilities/backup.py` branches
on `settings.postgresql.enabled` — the config.yaml key, not the env var everything else honours.
Left alone it tries to open a non-existent `/config/db/bazarr.db` and logs an exception on every
backup run. During the window, with the app at zero:

```bash
kubectl -n equestria exec "${app}-dbcopy" -- sh -c \
  "grep -A6 '^postgresql:' /config/config/config.yaml"
```

then set `postgresql.enabled: true` there. It is a config PVC file, not GitOps-managed, so this
is a genuine manual step. Bazarr's backup is redundant here regardless — the database is dumped
nightly by the CNPG backup CronJob.

**The `--cast` list must be derived, not copied.** The wiki gives four `--cast "column X.timestamp
to timestamp"` flags. At 1.6.0 the schema has eleven DateTime columns — the wiki page predates
the release, and 1.6.0 moved subtitles into new `table_episodes_subtitles` /
`table_movies_subtitles` tables. Generate the list from the schema Bazarr just built in §5.2
rather than trusting the page:

```bash
kubectl -n database exec -i "$primary" -c postgres -- psql -At -d bazarr <<'SQL'
SELECT c.relname || '.' || a.attname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_type t ON t.oid = a.atttypid
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND t.typname LIKE 'timestamp%'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
 ORDER BY 1;
SQL
```

**The `pg_depend` exclusion and `relkind = 'r'` are both load-bearing.** The obvious
`information_schema.columns` version of this query also returns `pg_stat_statements` and
`pg_stat_statements_info` — extension *views* living in `public` — and casting those breaks the
run. Filtering to ordinary tables and excluding extension-owned objects returns exactly the 11
bazarr columns. Verified 2026-08-27: 11 real columns against the wiki's documented 4, and the
load then carried `table_episodes_subtitles` (17,916 rows) and `table_movies_subtitles` (2,723) —
the 1.6.0 tables the wiki page predates.

Paste the result into the pgloader `args` in §5.6. If you would rather not: bazarr is the one app
here where starting fresh is genuinely cheap — point it at an empty database, let it re-sync from
Sonarr/Radarr, and you lose only download/blacklist history. Language profiles and every setting
live in `config.yaml`, not the database, and no subtitle file on disk is touched.

### 9.3 seerr and jellyseerr

Two separate deployments, two separate databases, identical procedure. Env prefix `DB_*`.
Sources: <https://docs.seerr.dev/extending-seerr/database-config> and
<https://docs.jellyseerr.dev/extending-jellyseerr/database-config>.

**`DB_TYPE` must be exactly `postgres`.** `isPgsql = process.env.DB_TYPE === 'postgres'` is a
strict, case-sensitive comparison with no validation and no warning. `postgresql` or `Postgres`
selects SQLite silently and the app looks healthy. Verify against Postgres, not the UI:

```bash
kubectl -n database exec -i "$primary" -c postgres -- psql -d "$app" -c '\dt' | head
```

**Do not override the container command.** Migrations run at boot only under
`NODE_ENV === 'production'`, and nothing in either image's environment sets it — it comes from
the `start` script (`NODE_ENV=production node dist/index.js`), which the default `pnpm start`
invokes. A `command:`/`args:` override that drops it gives a pod that connects to Postgres and
then skips its migrations.

**⚠️ The loader is a third-party build from an unmerged upstream PR, pinned by digest.** Both
projects tell you to use `ghcr.io/ralgar/pgloader:pr-1531`, because stock pgloader releases
mis-quote column identifiers on this schema. That image is a community artifact built from a
patch that was never merged, and your entire request history goes through it — so it is pinned to
the digest resolved on 2026-08-26, never the floating tag:

```
ghcr.io/ralgar/pgloader@sha256:e5ae0b8149058828938d0f14ccc1f793171db8c4c8b69b7b6b45dfd998f0149f
```

That is the OCI **index** digest; it resolves to `linux/amd64`
(`sha256:d3f46411e305c23ee6768e3b66dd5268760b6c22d953ae4d5165d55462364792`), which is what these
nodes are. Pinning the index rather than the platform manifest keeps `kubectl` doing the
platform selection.

Use the §5.6 Job verbatim, with two substitutions: this image in place of
`ghcr.io/roxedus/pgloader@sha256:1a7a…`, and `/work/db.sqlite3` in place of `/work/${app}.db`.
The `--with` flags are unchanged. Re-resolve and re-pin if you ever need a newer build:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:ralgar/pgloader:pull&service=ghcr.io" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -sI -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.oci.image.index.v1+json" \
  "https://ghcr.io/v2/ralgar/pgloader/manifests/pr-1531" | grep -i docker-content-digest
```

**If you would rather not run it at all, skipping the load is a real option here** — more so than
for any other app in this runbook. `settings.json` lives on the config PVC and is not part of the
migration, so the API key and every service pairing survive regardless. Point the app at an empty
database, let it build the schema, and the media/season tables rebuild on the next full scan.
What you actually lose is request history, issues, comments, blocklist entries and watchlists.

**Keep the `migrations` table when you truncate, and expect pgloader to error on it.** The
TypeORM ledger is populated by the app's own migration run (19 rows for seerr at v3.4.1) and must
survive — SQLite's ledger is a different, larger set (53 rows) and loading it would corrupt the
version state. So truncate every table *except* `migrations`, and pgloader will then report
exactly one error, on `migrations`, which is the desired outcome rather than a problem.

**Run 2026-08-27 (seerr):** 32,283 rows moved with that single expected error — media 15,204,
season 17,011, media_request 20, user 7, season_request 17, session 12, discover_slider 12. All
16 foreign keys were dropped and recreated **validated**, and the ledger came out holding the 19
Postgres migration names. Exact parity against the SQLite source on every table checked.

Whichever you pick, **§5.6's sequence fix is mandatory here.** Every primary key is `SERIAL`, a
data-only load inserts explicit ids without advancing the sequences, and neither project's docs
mention it — the first new request after cutover fails on a duplicate key. The generic
`pg_get_serial_sequence` block covers it.

`jellyseerr` 2.7.3 exposes no pool control (`DB_POOL_SIZE` is a 3.x feature), so it runs node-pg's
default of 10 connections. `seerr` 3.4.1 accepts `DB_POOL_SIZE`; the manifest leaves it unset.

### 9.4 autobrr — a different, better procedure

**Skip §5.2, §5.5 and §5.6.** autobrr ships `autobrrctl`, a first-party converter, at
`/usr/local/bin/autobrrctl` in the image already pinned in `helmrelease.yaml`. It runs the
Postgres migration chain itself, so the target must be an **empty** database — do not pre-create
the schema, and do not truncate.

What it does, in order: opens both databases; runs the full Postgres migration chain; applies
nine fixups that NULL out dangling foreign-key references; copies 19 tables in 1000-row batches;
then calls `setval()` on every id sequence. Rows that still violate a foreign key are reported as
a summary rather than aborting the run.

```bash
app=autobrr
flux -n equestria suspend hr "$app"                       # already suspended from §4
kubectl -n equestria scale deploy "$app" --replicas=0
kubectl -n equestria rollout status deploy "$app" --timeout=5m
```

Then run the converter from a pod that mounts the existing config PVC. Build the URL with the
same percent-encoding step as §5.6 — `autobrrctl` takes a URL, and the password is
OpenBao-generated:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${app}-convert
  namespace: equestria
  labels:
    driscoll.dev/oneshot: media-stack-postgres
spec:
  restartPolicy: Never
  securityContext: { runAsUser: 568, runAsGroup: 568, fsGroup: 568 }
  containers:
    - name: convert
      image: ${image}
      command: ["sleep", "3600"]
      envFrom:
        - secretRef:
            name: ${app}-env
      volumeMounts:
        - { name: config, mountPath: /config }
  volumes:
    - name: config
      persistentVolumeClaim:
        claimName: ${app}
EOF

kubectl -n equestria wait --for=condition=Ready "pod/${app}-convert" --timeout=5m

# Dry run FIRST. It reports what it would copy and exits without writing.
kubectl -n equestria exec "${app}-convert" -- autobrrctl db:convert \
  --sqlite-db /config/autobrr.db --postgres-url "$uri" --dry-run

# Then for real.
kubectl -n equestria exec "${app}-convert" -- autobrrctl db:convert \
  --sqlite-db /config/autobrr.db --postgres-url "$uri"

kubectl -n equestria delete pod "${app}-convert"
flux -n equestria resume hr "$app"
```

Three consequences of moving autobrr to Postgres, none of them failures:

- **Everyone is logged out once.** The HTTP session store follows the driver
  (`sqlite3store` → `postgresstore`), and the converter deliberately skips the `sessions` table.
  autobrr here is OIDC-only through authentik, so this is one redirect.
- **autobrr's own periodic database backups stop.** `DatabaseMaxBackups` drives SQLite-only code;
  there is no Postgres equivalent, so `AUTOBRR__DATABASE_MAX_BACKUPS` becomes a no-op and backup
  responsibility moves entirely to the CNPG nightly dump.
- **API keys carry over**, so nothing that talks to autobrr needs re-pairing.

**Foreign-key violations are dropped and reported, not fatal — and they are usually pre-existing
orphans, so verify before calling it data loss.** Run 2026-08-27 moved 18,258 rows (9,082
release_action_status, 9,062 release, plus filters, indexers, clients and actions) and rejected
two `filter_indexer` rows on `filter_indexer_indexer_id_fkey`. Both referenced `indexer_id = 2`,
which does not exist — the `indexer` table holds one row. SQLite does not enforce foreign keys by
default, so those mappings had been dangling for as long as that indexer had been deleted;
Postgres correctly refused them and nothing real was lost. Check the source before assuming
otherwise:

```sql
-- against the SQLite copy
SELECT fi.filter_id, fi.indexer_id,
       CASE WHEN i.id IS NULL THEN 'ORPHAN' ELSE 'ok' END
  FROM filter_indexer fi LEFT JOIN indexer i ON i.id = fi.indexer_id;
```

**If autobrr has already restarted onto an empty Postgres database** — the reloader trap in §4 —
do not drop the database. Scale to zero, truncate every table **except `schema_migrations`**, and
run the converter: its migrator sees the ledger already at the current version, no-ops, and
copies into the empty tables. That is exactly how the 2026-08-27 run recovered.

The SQLite file is left untouched by the converter, so §7's rollback applies unchanged.
