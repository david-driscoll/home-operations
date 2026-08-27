# Postgres component

Adding `../../../components/postgres` to an app's `ks.yaml` `spec.components` is the **only**
edit needed to give that app a PostgreSQL database, a login role, a credential Secret and an
OpenBao-owned password that rotates every 30 days. There is no generator step any more —
`Update.cs` was retired in phase 1 of
[docs/postgres-credentials/PLAN.md](../../../docs/postgres-credentials/PLAN.md), and the
`rotate` sibling that used to make rotation opt-in was folded in here once phase 4 finished.

## What it renders

The component itself emits one object into the app's namespace: a nested Flux `Kustomization`
named `${APP}-postgres`. That Kustomization renders `./database/` into the **`database`**
namespace, where the CNPG `Cluster` lives:

| Object | Name | Purpose |
| --- | --- | --- |
| `DatabaseRole` | `${APP}` | the login role (CNPG >= 1.30), with **no** `passwordSecret` |
| `Database` | `${APP}` | the database, with a `public` schema and **no** schema named after the role |
| `ExternalSecret` | `${APP}-postgres` | the credential Secret apps read back |
| `ExternalSecret` | `${APP}-postgres-conn` | connection metadata, derived not stored |
| `ClusterGenerator` | `${APP}-postgres-rotation` | reads `database/static-creds/${APP}` from OpenBao |

Apps consume the credential the same way they always have — through
`ClusterSecretStore/database` with `extract: {key: ${APP}-postgres}`.

## Substitutions

| Variable | Default | Notes |
| --- | --- | --- |
| `APP` | — | required; already set by every app's `ks.yaml`. The only one. |

Anything that is not a string is a **sibling component**, not a variable:

| Component | Effect |
| --- | --- |
| `../../components/postgres/superuser` | `DatabaseRole.spec.superuser: true` — used by `immich` only |
| `../../components/postgres/client-cert` | certificate auth instead of a password |
| `../../components/postgres/roles` | extra roles beyond the app's login role, from the app's own `postgres-roles/` |
| `../../components/postgres/databases` | extra databases beyond the app's own, from the app's own `postgres-databases/` |

### Extra roles

`roles` exists because some applications' migrations reference roles they do not create —
grant targets, RLS principals — assuming they run as something holding `CREATEROLE`. App roles
here hold `login: true` and nothing else, deliberately, so those migrations fail:

```
ERROR:  permission denied to create role
CONTEXT: SQL statement "CREATE ROLE toolhive_registry_server"
```

**The manifests live next to the app**, in `<app-dir>/postgres-roles/` — they are that app's
business, they change when its migrations change, and a reviewer looking at the app sees them
without going anywhere else. The component emits a second nested Kustomization,
`${APP}-postgres-roles`, that reads that directory and targets `database`, because a
`DatabaseRole` is namespace-scoped and `spec.cluster.name` resolves locally, so the objects
themselves must sit beside the `Cluster`.

Wiring it takes two lines in the app's `ks.yaml`, because `spec.path` is repo-root-relative and
a component has no idea where the build came from — `${APP}` is not enough either, since an
app's directory is not derivable from its name:

```yaml
spec:
  path: &path ./kubernetes/apps/equestria/home/windmill
  components:
    - ../../../../components/postgres
    - ../../../../components/postgres/roles
  postBuild:
    substitute:
      APP: *app
      POSTGRES_APP_PATH: *path
```

Use the anchor. Writing the string once means an app that moves directories cannot end up with
a stale roles path. The `/postgres-roles` suffix is appended by the component, not by the app.

**Never list `postgres-roles/` in the app's own `kustomization.yaml`.** It sits inside the app's
build path, so listing it renders the same roles a second time into the app's namespace, where
they are meaningless and fight the real ones. Every app here lists resources explicitly, so an
unreferenced subdirectory is inert. Forgetting `POSTGRES_APP_PATH` fails the Kustomization with
a path-not-found, which is deliberate.

Consumers: `toolhive-registry` (`toolhive_registry_server`), `windmill` (`windmill_user`,
`windmill_admin`).

**⚠️ Read the live role before declaring one.** A `DatabaseRole` adopts an existing role and
forces every attribute, including the ones you omit — and these roles are usually created by
hand long before anyone declares them. `windmill_admin` carries `BYPASSRLS` and is a member of
`windmill_user`; declaring it without either silently strips a privilege the application's row
security depends on.

```sql
select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolcanlogin, rolreplication, rolbypassrls, rolconnlimit
  from pg_roles where rolname = '<role>';
select g.rolname, m.admin_option from pg_auth_members m
  join pg_roles r on r.oid = m.member join pg_roles g on g.oid = m.roleid
 where r.rolname = '<role>';
```

**Why:** `postBuild.substitute` is typed `map[string]string`, and the parent resolves these
values before the child Kustomization is applied. A boolean-valued variable therefore lands as
a bare `false` and the CRD rejects the whole object:

```
spec.postBuild.substitute.POSTGRES_SUPERUSER: Invalid value: "boolean": must be of type string
```

Quoting the source does not help — kustomize re-emits `"${X:=false}"` as bare `${X:=false}`,
because at build time that scalar is an ordinary string needing no quotes. Verified: double,
single and bare all render identically.

### Extra databases

`databases` is the same shape as `roles`, one level over: the app writes manifests in
`<app-dir>/postgres-databases/` and the component emits a `${APP}-postgres-databases`
Kustomization that renders them into `database`. It reads the **same** `POSTGRES_APP_PATH`, so
an app using both siblings passes the path once.

```yaml
spec:
  path: &path ./kubernetes/apps/equestria/media/sonarr
  components:
    - ../../../../components/postgres
    - ../../../../components/postgres/databases
  postBuild:
    substitute:
      APP: *app
      POSTGRES_APP_PATH: *path
```

It exists because `components/postgres` renders exactly one `Database`, which is right for
almost everything here — but not for an app that wants a second one for a different retention or
vacuum profile, or a vendor that hard-codes two connection strings.

Consumers: `sonarr`, `radarr`, `lidarr`, `prowlarr` (`<app>-log`). Every Servarr wiki page
documents an `<app>-main`/`<app>-log` pair, the app opens both at startup and **creates
neither**, and the estate ran with `LOG__DBENABLED: "False"` — no log database at all — until
this component existed to declare the second one. See
[`docs/runbooks/media-stack-postgres-migration.md`](../../../docs/runbooks/media-stack-postgres-migration.md) §1.1.

**⚠️ An extra database must name its credential.** `kubernetes/apps/database/postgres/backups`
enumerates the `Database` resources in the `database` namespace and, for each, reads the Secret
its `driscoll.dev/backup-credentials` annotation names — defaulting to `<database>-postgres`,
which for an extra database does not exist. So the manifest carries one annotation pointing at
the app's own credential:

```yaml
metadata:
  annotations:
    driscoll.dev/backup-credentials: foo-postgres
spec:
  name: foo-cache
  owner: ${APP}
```

**One role, one OpenBao static role, one rotating password, two databases.** The app's login
role owns the extra database, so it can dump it; no second static role is created, and
`stacks/system/postgres-rotation.ts` never sees this component because it matches
`components/postgres` by exact path suffix.

The full copy-paste template, with every field annotated, is the header of
[`databases/kustomization.yaml`](databases/kustomization.yaml). Two more things it repeats and
this file will not: `ensure: absent` **drops** the database and everything in it, so deleting the
manifest is the safe way to stop managing one; and the app is still not told the extra database's
name by any of this — that stays a literal in the app's own ExternalSecret
(`SONARR__POSTGRES__LOGDB: sonarr-log`).

### The backup's annotation contract

Three annotations, all optional, all read off the `Database` resource. They are the whole
interface between this component family and the nightly `pg_dump`:

| Annotation | Effect |
| --- | --- |
| `driscoll.dev/backup` | `"false"` excludes the database; absent or anything else backs it up |
| `driscoll.dev/backup-credentials` | Secret to authenticate with; defaults to `<database>-postgres` |
| `driscoll.dev/backup-reason` | why it is excluded, printed on every run |

**The polarity is the opposite of a Garage bucket**, where `driscoll.dev/backup: "true"` opts one
*in* (`kubernetes/apps/coder/forgejo-garage/bucket.yaml`). Forgetting the annotation on a bucket
wastes space; forgetting it on a database loses data, so a database is backed up unless it says
otherwise.

Two kinds of exclusion live in git. `openbao`, because its role authenticates with a client
certificate, has no password anywhere since phase 2.4b, and is dumped separately by
`kube-system/openbao-replica`. And the four Servarr `<app>-log` databases, because they hold
nothing but application log entries that the app itself trims — those also keep a
`backup-credentials` annotation, so flipping the exclusion off cannot break the nightly job.
The two decommissioned databases (`keeper`, `vikunja`) stay in the CronJob's
`DECOMMISSIONED_DATABASES` env var — they have no Kubernetes object to annotate, which is exactly
what makes them decommissioned. A live database with **neither** a `Database` resource nor an
entry there is a hard failure, and that guard is the reason this job can be trusted.

## Things that will bite you

- **A `DatabaseRole` adopts an existing role and forces every attribute to match the
  manifest, including the ones you omit.** Never drop the `superuser` component from an app
  that needs it — the live role is demoted silently.
- **`flate` cannot catch a bad `postBuild.substitute` value.** It renders the placeholder, not
  the substituted result, so a type error only appears when Flux applies the child object for
  real. To check by hand, build the app, apply Flux's `${VAR:=default}` semantics to the output,
  and `kubectl apply --dry-run=server` the nested Kustomization that falls out. That is exactly
  what the controller does.
- **Two systems have to converge, and there are TWO ordering constraints pointing in opposite
  directions.** This is the part that bites; the full write-up with the recovery commands is in
  [`ks.yaml`](ks.yaml). Short version:

  | case | constraint | what goes wrong |
  | --- | --- | --- |
  | migrated app | merge the Kubernetes half **before** the Pulumi run picks it up | reverse order rotates a password the app cannot yet read — an outage |
  | **brand-new app** | the login role must exist **before** the Pulumi run | `stacks/system` dies on `ERROR: role "x" does not exist (SQLSTATE 42704)` |

  The second one has no ordering you can choose: a new app ships both halves in one commit, the
  Pulumi operator reconciles that merge in seconds, and Flux's `cluster-apps` runs on its own
  interval — so Pulumi reliably wins. After 3 failures the Stack goes `Stalled/UpdateFailed`
  and, with `continueResyncOnCommitMatch: false` and `resyncFrequencySeconds: 86400`, sits there
  for a **day**. Expect it on new-app day; clear it with the runbook in `ks.yaml`. It cost a
  stalled stack on degoog (#1180).

- **`passwords.sops.yaml` holds no app password any more.** Only `postgres-user-password` and
  `postgres-superuser-password` — the CNPG cluster's own bootstrap and superuser credentials.
  Adding a new app needs **no** edit there, and a `DatabaseRole` with a `passwordSecret`
  pointing at a document that does not exist would simply never get a role.
- **Rotation is irreversible, per app, from the moment the component lands.** Creating
  `database/static-roles/${APP}` rotates the password immediately; `rotation_period` is
  mandatory and [openbao#284](https://github.com/openbao/openbao/issues/284) (disable auto
  rotation) is still open. So the app gets a forced restart every 30 days forever, and it must
  be able to survive one: check `reloader.stakater.com/auto` is on the **workload** (not the pod
  template), that the pod actually references the Secret, and that a cold boot fits inside its
  liveness budget. Three of the phase-4 tranches turned up an app that failed one of those.

- **A dropped app leaves a live `components/postgres` line behind, and re-enabling it is not
  free.** `outline`, `retrom` and `strmgen` had their `Database` CR, database and role removed
  in group E; their component line is commented out so the Pulumi discovery does not see them.
  Uncommenting one puts it straight into the new-app case above — CNPG has to recreate the role
  before `stacks/system` can create a static role for it.

- **Nothing here ever deletes anything.** That is a deliberate, consistent policy, not three
  unrelated settings: the nested ks is `deletionPolicy: Orphan`, both CRs carry `retain`
  reclaim policies, and all three rendered objects carry
  `kustomize.toolkit.fluxcd.io/prune: disabled`. Removing the component from an app, or a file
  from `database/`, leaves the live objects alone. Cleaning up for real is a manual job.
- **Do not enable `clientCertificate` on a role without that prune guard.** A `DatabaseRole`
  with client certificates owns the generated `<name>-client-cert` Secret through a controller
  `ownerReference`, so pruning the role garbage-collects the credential — and CNPG's
  `deleteOwnedCertSecret` removes it outright the moment `enabled` goes false.
- **`reloader.stakater.com/auto` belongs on the WORKLOAD, not on a Secret.** It is present on
  the rendered `ExternalSecret` because the generator put it there and churning it would break
  the byte-for-byte match with the live object, but it does nothing where it sits. What makes
  an app pick up a changed password is the annotation on the app's own Deployment/StatefulSet.
  This matters from phase 4 onward, when passwords start rotating.
- **The nested ks does not inherit `components/common`.** Its `decryption` and
  `substituteFrom` are spelled out in `ks.yaml`; `common` is applied by the umbrella
  kustomization and never sees this object. If you add a new cluster-wide substitution source,
  add it there too.

## Schemas, `search_path`, and why `public` is the default

**A new database gets `public` and nothing else.** Do not add a schema named after the role.

PostgreSQL's default `search_path` is `"$user", public`, and it has never been customised on
this cluster — `pg_settings` reports `source = default`, and there are no `ALTER DATABASE ...
SET` overrides. The `$user` element is dormant and completely harmless for exactly as long as
no schema matches the role name. It **arms itself the instant one exists**, and every role
this component creates is named after its database.

That is why the failure had no configuration change behind it and nothing in a diff to review.
Declaring a `${APP}` schema made `$user` resolve for every app at once, and the schema then
shadowed `public` for every unqualified name. An app already running against `public` kept its
old tables there while its next migration resolved `CREATE TABLE foo` to `${APP}.foo` and built
a second, emptier copy — so it looked like the app had lost its history, and column drift
between the copies surfaced as things like `column "episodecount" of relation "Playlists" does
not exist`.

**It can also break behaviour without ever raising an error.** immich had four audit trigger
functions `CREATE OR REPLACE`d into its `immich` schema instead of replacing the `public`
originals. The triggers stayed bound to `public`, so the intended update never took effect and
immich ran pre-update trigger bodies for roughly seven weeks, silently. Treat "no errors" as no
evidence at all.

### Removing a schema entry does not drop the schema

CNPG's database reconciler only acts on the entries it is given: `present` creates, `absent`
drops, and an **undeclared schema is left alone — there is no prune.** Verified against a live
database on CNPG 1.30.0: removing an entry reconciled to `applied: true` with the schema, and
an undeclared schema beside it, both still present.

This is what lets `public` become the default without disturbing the apps that already live
inside their role-named schema. `ensure: absent` is the wrong tool and would drop the schema
along with every table in it.

### Two other CNPG behaviours worth knowing

- **CNPG will not recreate a database that disappears underneath it.** It gates on
  `observedGeneration == generation` and no-ops, even though `ensure: present`. Force a
  reconcile by bumping the generation — toggling `spec.allowConnections` false then true works.
- `DROP DATABASE` cannot run inside a transaction block, so `psql -c "a; b; c"` fails. One
  `-c` per statement.

### The layout is structural, not pin-dependent

**The schema topology itself now encodes each app's home**, so nothing depends on a
`search_path` pin surviving:

- An app whose home is `public` has **no schema named after its role** — the empty ones were
  dropped on 2026-08-26 once the component stopped declaring them. `$user` has nothing to
  resolve to and the path falls through to `public`.
- An app whose home is its role-named schema still has that schema, holding its data. `$user`
  resolves to it, which is correct.

Verified by forcing the bare default `"$user", public` with the pins bypassed: all fifteen
app roles resolved to their correct home. Re-run that check after any change here:

```sql
-- per database, as the app's role, with the pin deliberately ignored
SET search_path TO "$user", public;
SET ROLE "<app>";
SELECT current_schemas(true);
```

### The pins are belt-and-braces, and survive more than first assumed

`DatabaseRole` has no field for `ALTER ROLE ... SET`, and `Database` has no SQL hook —
`extensions`, `fdws`, `servers` and `schemas` are the only object lists in the 1.30.0 CRDs. So
the pins below cannot be declared from git.

They are, however, **more durable than "live-only" suggests**. `pg_authid` and
`pg_db_role_setting` are *shared* catalogs (`relisshared = t`) living in `global/`, which a
physical base backup copies wholesale. So:

| Recovery path | Pins |
| --- | --- |
| barman PITR / `pg_basebackup` / CNPG recovery — **the estate's actual path** | **preserved** |
| logical rebuild (fresh `initdb` + per-database dumps) | lost unless `pg_dumpall --globals-only` is restored too |
| brand-new cluster from scratch | absent — but no role-named schemas exist either, so new apps correctly default to `public` |

An earlier revision of this file claimed a rebuild "comes back with the default" in all cases.
That was too broad, and it argued for machinery that is not needed. **Do not build a CronJob or
per-app Job to replay these pins.** The layout is already correct without them; the pins only
add a second line of defence if a role-named schema ever reappears.

| Pin | Roles |
| --- | --- |
| `public` | degoog, forgejo, immich, keeper, n8n, pinepods, questarr, romm, toolhive-registry, toolhive-ui, vikunja, windmill |
| `<app>, public` | coder, crowdsec, freshrss, grafana, openbao, pulsarr, tandoor |
| none | `app` — the CNPG bootstrap database. It has no role-named schema, so it is safe by absence |

Two are load-bearing, not stylistic:

- **pinepods MUST resolve to `public`.** Its migration runner checks whether a table exists
  against `public` but issues an *unqualified* `CREATE TABLE`. Give it a role-schema home and
  it logs "Creating missing RssKeys table" and then dies on `relation "RssKeys" already exists`,
  on every start.
- **immich MUST resolve to `public`.** Its migration ledger (`kysely_migrations`) and all eight
  extensions live there, and its 18 role-schema tables were consolidated back into `public` on
  2026-08-26.

### Detecting a regression

A duplicate-NAME check is **not** sufficient. immich had zero duplicated names and was still
badly split, because its two halves held entirely different tables. Sweep by schema
*population* instead — this returns more than one row for any database that has drifted:

```sql
SELECT n.nspname, count(*)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', current_database())
  AND c.relkind IN ('r','p','v','m','S')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
GROUP BY 1;
```

The `pg_depend` exclusion matters: without it, extensions installed in `public` (`vector`,
`pg_stat_statements`, `unaccent`, …) look like app objects and every role-schema app appears
split when it is not.
