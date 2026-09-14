# The cutover (PR B): alpha-site authentik → `stargate-command/authentik-pg`

> **Done 2026-09-13**, not by this sequence: PR B merged early and the restore
> ran against live clients instead. PLAN.md "As run" has the record. The steps
> below remain the reference for a rehearsed cutover; the restore command that
> was actually used tolerates running clients (`--clean --if-exists
> --single-transaction` after `pg_terminate_backend` of the other sessions).

Moves authentik's data from the Pi's shared postgres into the dedicated CNPG
cluster and points the Pi's authentik at it. The PR that does the repoint
(PLAN.md's PR B) deploys more than that in the same merge, all of it safe
only once the restore is done:

- the Pi's streaming standby, which clones `authentik-pg` at first start;
- removal of the Pi's unused valkey;
- authentik on equestria, on its staging hostname;
- keepalived on both sites, holding `10.10.255.10` (nothing resolves to it yet);
- `FAILOVER.md` onto the Pi. **Authentik is down for the
window** (new logins and forwardAuth checks fail; sessions apps already hold
keep working). Plan the window from the rehearsal timing, not a guess.

Context: [PLAN.md](PLAN.md). The dump/restore traps are the ones doc 07 §4.2
already paid for; they are repeated inline where they apply.

## Where commands run

| Prompt   | Where                                                                  |
| -------- | ---------------------------------------------------------------------- |
| `ws$`    | A workstation with `kubectl` (equestria), `flux`, `bao` (logged in), `ssh` |
| `pi$`    | `ssh root@dockge-as` — the Docker LXC on the Pi                         |

Every Postgres client used against `authentik-pg` is a one-shot
`postgres:18.6-bookworm` container **on the Pi**, so the commands exercise the
exact network path authentik will use (LXC → `10.10.206.150`).

```sh
# Used throughout. Same digest the standby stack pins.
pi$ PGIMG='postgres:18.6-bookworm@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af'
```

## 0. Pre-flight (any day before the window)

### 0.1 Phase 1 is live

```sh
ws$ kubectl -n stargate-command get cluster authentik-pg           # STATUS "Cluster in healthy state", 3/3
ws$ kubectl -n stargate-command get svc authentik-pg-lan            # EXTERNAL-IP 10.10.206.150
ws$ kubectl -n stargate-command get externalsecret -l app.kubernetes.io/name=authentik   # all SecretSynced
```

### 0.2 The Pi can log in, over the real path

Put the app credential in a root-only env file on the Pi. It never touches a
command line or shell history.

```sh
ws$ bao kv get -format=json secrets/clusters/equestria/apps/authentik-pg/app \
      | jq -r '.data.data | "PGUSER=\(.username)\nPGPASSWORD=\(.password)\nPGDATABASE=authentik\nPGHOST=10.10.206.150\nPGSSLMODE=require"' \
      | ssh root@dockge-as 'umask 077; cat > /root/authentik-pg.env'

pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" \
      psql -tAc "select current_user, version(), (select count(*) from pg_tables where schemaname='public')"
#   authentik | PostgreSQL 18.6 ... | 0        <- MUST be 0 tables before the rehearsal
```

A `no pg_hba.conf entry` or timeout here is a phase-1 problem; stop.

### 0.2a The rest of the merge has what it needs

```sh
ws$ bao kv get -field=password secrets/clusters/equestria/apps/authentik-vip/vrrp >/dev/null && echo VRRP-OK
ws$ bao kv get -field=username secrets/clusters/equestria/apps/authentik-pg/replication          # alpha_site_standby
pi$ df -h /opt/stacks-data          # free space >= 2x the database size from 0.3 (the standby clone)
pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" \
      psql -tAc "select slot_name, active from pg_replication_slots"     # no alpha_site_standby row, or an inactive one
```

A missing OpenBao reference does not fail one stack; it aborts the entire
`stacks/home` run (HO#636), so the two `bao kv get`s are load-bearing.

### 0.3 Source facts

```sh
pi$ docker exec postgres psql -U postgres -d authentik -tAc "select extname from pg_extension"
#   plpgsql only. Anything else must exist in the CNPG image or be excluded at dump time (doc 07 trap 1).
pi$ docker exec postgres psql -U postgres -tAc "select pg_size_pretty(pg_database_size('authentik'))"
pi$ find /opt/stacks-data/authentik/media -type f
#   Uploaded media does not follow authentik to equestria (PLAN.md decision 8).
#   Re-point each file's owner (application icon, source icon, brand) at a URL
#   in the admin UI before phase 5, then these can stay where they are.
pi$ docker inspect authentik-server --format '{{.Config.Image}}'
#   The pinned 2026.8.2 digest. Record it -- if a Renovate bump lands before the
#   window, the restored schema and the image must still match (doc 07: a newer
#   server silently migrates a restored database).
```

### 0.4 Rehearsal — restore last night's dump, time it, wipe it

This uses the dump `postgres-backup` already wrote, so it costs the live
authentik nothing.

```sh
pi$ ls -lh /opt/stacks-data/postgres/dumps/authentik-*.dump | tail -1
pi$ DUMP=$(ls /opt/stacks-data/postgres/dumps/authentik-*.dump | tail -1)

pi$ time docker run --rm --env-file /root/authentik-pg.env \
      -v /opt/stacks-data/postgres/dumps:/dumps:ro "$PGIMG" \
      pg_restore --no-owner --no-privileges --exit-on-error --jobs=4 -d authentik "/dumps/$(basename "$DUMP")"
```

- `--no-owner` connecting **as `authentik`** makes every object owned by
  `authentik` — doc 07's trap 2 (tables owned by `postgres`) cannot happen,
  because no superuser is involved at all.
- `--jobs` needs a file, not a pipe; that is why the dump lands on disk first.

**Record the `real` time. The window is dump time + that + ~5 minutes.**

Wipe the rehearsal. The database owner owns `public` (PG15+), so no superuser
is needed:

```sh
pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" \
      psql -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public AUTHORIZATION authentik'
pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" \
      psql -tAc "select count(*) from pg_tables where schemaname='public'"      # 0
```

Also rehearse step 5's fast path once against a copy of the rendered `.env`,
so the `sed` is known to match the live file.

## 1. Window: freeze everything that could restart authentik

Doc 07 trap 3: `docker stop` only holds until something runs `compose up -d`,
and a `stacks/home` run does exactly that. A restart mid-dump means writes the
dump never saw.

```sh
# No run in flight, and none can start.
ws$ kubectl -n pulumi get stack home-operations -o jsonpath='{.status.lastUpdate.state}{"\n"}'   # succeeded/failed, not in progress
ws$ kubectl -n pulumi get pods | grep -i home-operations                                          # no workspace pod mid-run
ws$ flux suspend kustomization pulumi-operator -n pulumi
ws$ kubectl -n pulumi get deploy -o name | grep -i operator            # find the controller
ws$ kubectl -n pulumi scale <that deployment> --replicas=0
```

Do not merge anything to `main` during the window.

## 2. Baseline and quiesce

```sh
pi$ BASE="select 'users='||(select count(*) from authentik_core_user)||' groups='||(select count(*) from authentik_core_group)||' apps='||(select count(*) from authentik_core_application)||' tokens='||(select count(*) from authentik_core_token)||' flows='||(select count(*) from authentik_flows_flow)"

pi$ docker stop authentik-server authentik-worker
pi$ docker exec postgres psql -U postgres -d authentik -tAc "$BASE"   | tee /root/cutover-baseline.txt
```

The baseline is taken **after** the stop, so nothing can move it between the
count and the dump.

## 3. Dump

```sh
pi$ docker exec postgres-backup pg_dump -h postgres -Fc --no-owner --no-privileges \
      -d authentik -f /dumps/authentik-cutover.dump
pi$ ls -lh /opt/stacks-data/postgres/dumps/authentik-cutover.dump
```

(`postgres-backup` carries the superuser env and the `/dumps` mount; the
`postgres` container has neither mount.)

## 4. Restore and verify

```sh
pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" \
      psql -tAc "select count(*) from pg_tables where schemaname='public'"      # 0 -- else re-run the wipe from 0.4

pi$ time docker run --rm --env-file /root/authentik-pg.env \
      -v /opt/stacks-data/postgres/dumps:/dumps:ro "$PGIMG" \
      pg_restore --no-owner --no-privileges --exit-on-error --jobs=4 -d authentik /dumps/authentik-cutover.dump

# pg_restore carries no optimizer statistics.
pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" vacuumdb --analyze-only -d authentik
```

**Gates — all must pass, or go to Rollback A:**

```sh
pi$ docker run --rm --env-file /root/authentik-pg.env -e BASE="$BASE" "$PGIMG" \
      sh -c 'psql -tAc "$BASE"' | diff - /root/cutover-baseline.txt && echo COUNTS-MATCH

pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" \
      psql -tAc "select count(*) from pg_tables where schemaname='public' and tableowner <> 'authentik'"   # 0
```

## 5. Repoint the Pi's authentik

### Fast path (preferred) — edit the rendered file, then merge

The deployed `/opt/stacks/authentik/.env` is the Pulumi-rendered copy, with
references already resolved. Rewrite its database block to exactly what the
PR B renders, so the later operator run finds nothing to change.

```sh
pi$ cp /opt/stacks/authentik/.env /root/authentik.env.pre-cutover
pi$ . /root/authentik-pg.env
pi$ sed -i \
      -e "s|^AUTHENTIK_POSTGRESQL__HOST=.*|AUTHENTIK_POSTGRESQL__HOST=10.10.206.150|" \
      -e "s|^AUTHENTIK_POSTGRESQL__NAME=.*|AUTHENTIK_POSTGRESQL__NAME=authentik|" \
      -e "s|^AUTHENTIK_POSTGRESQL__USER=.*|AUTHENTIK_POSTGRESQL__USER=\"${PGUSER}\"|" \
      -e "s|^AUTHENTIK_POSTGRESQL__PASSWORD=.*|AUTHENTIK_POSTGRESQL__PASSWORD=\"${PGPASSWORD}\"|" \
      -e "s|^AUTHENTIK_POSTGRESQL__CONN_HEALTH_CHECKS=true|AUTHENTIK_POSTGRESQL__SSLMODE=require\nAUTHENTIK_POSTGRESQL__CONN_HEALTH_CHECKS=true|" \
      /opt/stacks/authentik/.env
pi$ unset PGUSER PGPASSWORD PGDATABASE PGHOST PGSSLMODE
pi$ grep -c '^AUTHENTIK_POSTGRESQL__SSLMODE=require$' /opt/stacks/authentik/.env    # exactly 1
pi$ cd /opt/stacks/authentik && docker compose up -d authentik-server authentik-worker
```

### Slow path — merge and let the operator deploy

Resume the operator (step 7) first, merge PR B, and wait for the
`home-operations` Stack to finish. Adds the length of a full `stacks/home` run
to the outage.

## 6. Verify

```sh
pi$ docker logs -f authentik-worker 2>&1 | grep -iE 'migrat|error'    # "No migrations to apply"-shaped; any migration running means a version mismatch -- STOP, Rollback A
pi$ docker exec authentik-server wget -qO- --server-response http://localhost:9000/-/health/ready/ 2>&1 | head -1   # 200
```

- Log in to `https://authentik.driscoll.tech` in a private window.
- One forwardAuth app per outpost type still challenges and passes (doc 07's
  post-checks: embedded on alpha-site, equestria's proxy outpost, a remote
  dockge host).
- Gatus: all four authentik checks green.
- `select count(*) from pg_stat_activity where usename='authentik'` on
  `authentik-pg` is non-zero, and the shared postgres shows **no** authentik
  sessions: `docker exec postgres psql -U postgres -tAc "select count(*) from pg_stat_activity where datname='authentik'"` → 0.

### 6.1 The rest of the merge (after step 7's unfreeze has run it)

```sh
pi$ docker logs authentik-pg-standby 2>&1 | grep -E 'clone complete|starting as STANDBY'
pi$ curl -s http://10.10.10.9:5480/role                       # standby (once the clone finishes)
pi$ docker ps --format '{{.Names}} {{.Status}}' | grep -E 'authentik-vip|authentik-pg-standby'
pi$ docker rm -f authentik-redis                              # the orphaned valkey; the stack no longer declares it
ws$ kubectl -n stargate-command get deploy authentik-server authentik-worker   # ready
ws$ kubectl -n network get ds authentik-vip                   # one pod per node
ws$ curl -sk --resolve authentik.equestria.driscoll.tech:443:10.10.255.10 https://authentik.equestria.driscoll.tech/-/health/ready/ -o /dev/null -w '%{http_code}\n'   # 200 -- equestria holds the VIP
```

Then the phase-6 gate in PLAN.md, before PR C.

## 7. Unfreeze and converge

```sh
ws$ kubectl -n pulumi scale <operator deployment> --replicas=1
ws$ flux resume kustomization pulumi-operator -n pulumi
```

Merge PR B (fast path) and watch the `home-operations` run. The Pi side should
copy an identical `.env` and leave the authentik containers' `Created` time
unchanged. Only the comments differ from the fast-path edit, and compose
recreates on parsed values, not bytes. If it does recreate them, compare
`docker inspect authentik-server --format '{{.Config.Env}}'` with what step 5
wrote — a difference there means the fast path and the commit disagree.

```sh
pi$ rm -f /root/authentik-pg.env
pi$ rm -f /opt/stacks-data/postgres/dumps/authentik-cutover.dump   # after the soak, not before -- it is Rollback B's input
```

## Rollback

**A — before step 5 (nothing has written to `authentik-pg`).** The shared
postgres was only read. Unfreeze (step 7) **without** merging, then:

```sh
pi$ docker start authentik-server authentik-worker
```

Wipe `authentik-pg` (0.4) before trying again.

**B — after step 5, during the soak.** `authentik-pg` has accepted writes the
shared copy never saw; rolling back loses them (logins, new tokens, config
changes since the window). Restore the pre-cutover env and revert PR B:

```sh
pi$ cp /root/authentik.env.pre-cutover /opt/stacks/authentik/.env
pi$ cd /opt/stacks/authentik && docker compose up -d authentik-server authentik-worker
ws$ git revert <PR B's squash commit>   # merge it: renders the same .env, and also removes the standby, keepalived and equestria's authentik
```

The shared copy exists until phase 4 sets `ensure: absent`. After that, rollback
means a dump **from** `authentik-pg` back into the shared postgres — the same
procedure in the other direction.
