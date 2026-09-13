# authentik failover: promote the alpha-site standby

The manual path for **equestria down** (or `stargate-command/authentik-pg` lost) in
the active-active design — [docs/authentik-active-active/PLAN.md](../../../docs/authentik-active-active/PLAN.md).
While equestria is down, both authentik sites fail `/-/health/ready/` because
their shared primary is gone; nobody holds the VIP and SSO is down until this
runbook runs.

It has three parts: **promote** (restore SSO from the Pi), **fail back**
(return the primary to equestria and re-clone the standby), and the
**rehearsal** that is phase 3's gate.

This file ships with the stack, so a copy sits at
`/opt/stacks/authentik-pg-standby/FAILOVER.md` on the Pi — readable when the
repo, the cluster, or both are what is down. Keep it free of anything the
deploy-time secret resolver would expand.

## What you can and cannot rely on while equestria is down

| Needed for      | Available?                                                                         |
| --------------- | ---------------------------------------------------------------------------------- |
| The Pi          | `ssh root@dockge-as` — LAN `10.10.10.9` or the tailnet                             |
| Secrets         | **Not OpenBao** (it runs on equestria). Nothing below needs it: the authentik role and its password replicated into the standby, and the rendered `/opt/stacks/authentik/.env` already holds them |
| Pulumi          | **No.** The Pulumi Operator runs on equestria, so every Pi change below is a direct host edit. Git is brought into agreement in step P5, so that the operator's first run after recovery renders the failed-over state instead of reverting it |
| DNS             | The vanity names resolve to the VIP through UniFi and Cloudflare, which do not depend on equestria |
| GitHub          | Yes — step P5 merges a commit                                                      |

```sh
pi$ PGIMG='postgres:18.6-bookworm@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af'
```

---

## Promote

### P0. Decide

Promotion is not free: failing back is a maintenance window (F1–F7). Promote
when equestria is down and not coming back within the time you are willing to
be without SSO — not for a blip, and not while CNPG is merely failing over
internally (that recovers on its own in under a minute).

```sh
# The copy you are about to promote: is it streaming-current, and how stale is it?
pi$ docker exec authentik-pg-standby psql -U postgres -d postgres -tAc \
      "select pg_is_in_recovery(), now() - pg_last_xact_replay_timestamp() as replay_age,
              (select status from pg_stat_wal_receiver) as receiver"
#   t | <interval> | (empty once the primary is gone)
```

`replay_age` taken just after equestria vanished is your **data-loss window**
(recent logins, token changes). Write it down.

### P1. Fence equestria, if any of it answers

If `kubectl` still reaches the API server, stop the old primary from accepting
writes and take authentik there out of service:

```sh
ws$ flux suspend kustomization authentik -n equestria
ws$ kubectl -n equestria scale deploy authentik-server authentik-worker --replicas=0
ws$ kubectl -n stargate-command annotate cluster authentik-pg cnpg.io/hibernation=on --overwrite
```

If equestria is entirely dark, skip this. The VIP is fenced automatically:
once P2 flips the role endpoint to `primary`, equestria's keepalived goes to
FAULT the moment it comes back (PLAN.md decision 10). P5 covers the rest.

### P2. Promote the standby

```sh
pi$ docker exec authentik-pg-standby psql -U postgres -d postgres -tAc "select pg_promote(wait => true, wait_seconds => 60)"
#   t
pi$ docker exec authentik-pg-standby psql -U postgres -d postgres -tAc "select pg_is_in_recovery()"
#   f
pi$ sleep 15; curl -s http://10.10.10.9:5480/role
#   primary
```

`pg_promote` removes `standby.signal`, and the entrypoint never recreates it on
a restart, so the promotion survives container and host restarts.

### P3. Repoint the Pi's authentik at it

```sh
pi$ cp /opt/stacks/authentik/.env /root/authentik.env.pre-failover
pi$ sed -i \
      -e 's|^AUTHENTIK_POSTGRESQL__HOST=.*|AUTHENTIK_POSTGRESQL__HOST=authentik-pg-standby|' \
      -e 's|^AUTHENTIK_POSTGRESQL__SSLMODE=.*|AUTHENTIK_POSTGRESQL__SSLMODE=disable|' \
      /opt/stacks/authentik/.env
pi$ cd /opt/stacks/authentik && docker compose up -d authentik-server authentik-worker
```

- Host by container name over `dockge_default`, which the standby's
  `pg_hba.conf` admits for the `authentik` role.
- `sslmode=disable`: the standby runs without TLS, on a network that never
  leaves this LXC.
- Same user and password — they are the replicated role.

### P4. Verify

```sh
pi$ docker logs --since 5m authentik-worker 2>&1 | grep -iE 'migrat|error' | tail
pi$ docker exec authentik-server wget -qO /dev/null --server-response http://localhost:9000/-/health/ready/ 2>&1 | head -1   # 200
pi$ ip -4 addr show eth0 | grep 10.10.255.10    # the Pi holds the VIP (within ~15 s of ready)
```

Log in through `https://authentik.driscoll.tech`, and check one forwardAuth app
on the Pi.

### P5. Make git agree — before equestria comes back

Open and merge a **failover commit** with exactly these changes:

1. `docker/alpha-site/authentik/.env`: `AUTHENTIK_POSTGRESQL__HOST=authentik-pg-standby`
   and `AUTHENTIK_POSTGRESQL__SSLMODE=disable` (the references stay as they are).
2. `kubernetes/apps/equestria/idp/authentik/ks.yaml`: `suspend: true`.
3. `kubernetes/apps/stargate-command/authentik-pg/app/resources/values.yaml`: under
   `cluster:`, `annotations: { cnpg.io/hibernation: "on" }`.

Why each matters when equestria boots:

- Without (1), the operator's first `stacks/home` run renders the `.env` back
  to `10.10.206.150`, the Pi's authentik starts writing to the **stale** old
  primary, and — because the fence keeps the VIP on the Pi — every user is
  served stale data with no alarm.
- (2) and (3) stop equestria from running its own authentik against the stale
  primary. They race the CNPG operator on boot, so the old primary may start
  briefly before hibernation lands; the fence keeps clients off it meanwhile.

---

## Fail back (re-establish replication)

A maintenance window: **SSO is down from F2 to F5.** Run it with equestria
healthy, the failover commit merged, and the VIP still on the Pi.

### F0. Pre-flight

```sh
ws$ kubectl -n stargate-command get cluster authentik-pg        # hibernated
ws$ kubectl -n equestria get deploy authentik-server     # absent or 0/0
ws$ curl -s http://10.10.10.9:5480/role                  # primary
pi$ df -h /opt/stacks-data                                # room for a dump
```

### F1. Wake authentik-pg without authentik

Remove **only** the hibernation annotation (a PR reverting item 3 of the
failover commit); leave authentik on equestria suspended. Wait for the cluster
to become healthy. It comes back with the pre-failover data, which is about to
be replaced.

### F2. Freeze the Pi's authentik and dump the promoted server

```sh
pi$ docker stop authentik-server authentik-worker
pi$ BASE="select 'users='||(select count(*) from authentik_core_user)||' groups='||(select count(*) from authentik_core_group)||' apps='||(select count(*) from authentik_core_application)||' tokens='||(select count(*) from authentik_core_token)||' flows='||(select count(*) from authentik_flows_flow)"
pi$ docker exec authentik-pg-standby psql -U postgres -d authentik -tAc "$BASE" | tee /root/failback-baseline.txt
pi$ docker exec authentik-pg-standby pg_dump -U postgres -Fc --no-owner --no-privileges \
      -d authentik -f /var/lib/postgresql/data/failback.dump
```

### F3. Drop the standby's old slot on the primary

The slot is from before the failover and is now useless. Dropped before the
restore, the restore's WAL cannot pile up behind it.

```sh
pi$ docker exec authentik-pg-standby psql \
      "host=10.10.206.150 user=alpha_site_standby dbname=postgres replication=database sslmode=require passfile=/var/lib/postgresql/data/.pgpass" \
      -tAc "select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name = 'alpha_site_standby'"
```

### F4. Restore into authentik-pg

The same restore as [CUTOVER.md](../../../docs/authentik-active-active/CUTOVER.md)
step 4, from this dump. The credential file comes from the rendered `.env`, not
OpenBao:

```sh
pi$ . <(grep -E '^AUTHENTIK_POSTGRESQL__(USER|PASSWORD)=' /root/authentik.env.pre-failover)
pi$ printf 'PGUSER=%s\nPGPASSWORD=%s\nPGDATABASE=authentik\nPGHOST=10.10.206.150\nPGSSLMODE=require\n' \
      "$AUTHENTIK_POSTGRESQL__USER" "$AUTHENTIK_POSTGRESQL__PASSWORD" > /root/authentik-pg.env
pi$ chmod 600 /root/authentik-pg.env; unset AUTHENTIK_POSTGRESQL__USER AUTHENTIK_POSTGRESQL__PASSWORD

# Wipe the stale data (the owner owns `public`; no superuser needed).
pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" \
      psql -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public AUTHORIZATION authentik'

pi$ docker run --rm --env-file /root/authentik-pg.env \
      -v /opt/stacks-data/authentik-pg-standby/pgdata:/dump:ro "$PGIMG" \
      pg_restore --no-owner --no-privileges --exit-on-error --jobs=4 -d authentik /dump/failback.dump
pi$ docker run --rm --env-file /root/authentik-pg.env "$PGIMG" vacuumdb --analyze-only -d authentik

pi$ docker run --rm --env-file /root/authentik-pg.env -e BASE="$BASE" "$PGIMG" \
      sh -c 'psql -tAc "$BASE"' | diff - /root/failback-baseline.txt && echo COUNTS-MATCH
```

Counts must match. If they do not, **stop here**: restart the Pi's authentik
on the promoted server (`docker start authentik-server authentik-worker`,
still pointed at it) and investigate. Nothing has been lost yet.

### F5. Point the Pi's authentik back at authentik-pg

```sh
pi$ cp /root/authentik.env.pre-failover /opt/stacks/authentik/.env
pi$ cd /opt/stacks/authentik && docker compose up -d authentik-server authentik-worker
pi$ docker exec authentik-server wget -qO /dev/null --server-response http://localhost:9000/-/health/ready/ 2>&1 | head -1   # 200
```

SSO is back (the Pi still holds the VIP). Merge the **revert of the failover
commit** (items 1 and 2; item 3 went in F1). Flux resumes equestria's authentik;
once it is ready, keepalived moves the VIP back after `preempt_delay` — as
soon as F6 has flipped the role endpoint back from `primary`.

### F6. Re-clone the standby

```sh
pi$ cd /opt/stacks/authentik-pg-standby && docker compose stop authentik-pg-standby authentik-pg-standby-role
pi$ mv /opt/stacks-data/authentik-pg-standby/pgdata/pgdata \
       /opt/stacks-data/authentik-pg-standby/pgdata.promoted-$(date +%Y%m%d)
pi$ docker compose up -d
pi$ docker logs -f authentik-pg-standby     # "no PG_VERSION ... cloning", then "starting as STANDBY"
```

Keep the moved-aside directory until F7 passes, then delete it — it is the
only copy of the promoted history if the re-clone goes wrong.

### F7. Verify

```sh
pi$ curl -s http://10.10.10.9:5480/role                   # standby
ws$ kubectl -n stargate-command get cluster authentik-pg -o jsonpath='{.status.currentPrimary}'   # the primary pod, e.g. authentik-pg-2
ws$ kubectl -n stargate-command exec <that pod> -c postgres -- psql -tAc \
      "select slot_name, active, wal_status from pg_replication_slots"   # alpha_site_standby | t | reserved
ws$ kubectl -n equestria get deploy authentik-server        # ready
```

`AuthentikPgStandbyDisconnected` resolves; the VIP is on an equestria node;
Gatus is green. Delete `/root/authentik-pg.env`,
`/root/authentik.env.pre-failover` and the dump.

---

## Rehearsal (phase 3's gate; repeat after any image or major change)

Proves that a promoted copy of **this** standby is usable — the check that
covers amd64 → arm64 physical replication being unsupported upstream (PLAN.md
decision 2). It clones the standby rather than promoting it, so production is
never touched.

```sh
pi$ mkdir -p /opt/stacks-data/authentik-pg-rehearsal && chown 999:999 /opt/stacks-data/authentik-pg-rehearsal

# 1. Clone the standby over its unix socket.
pi$ docker run --rm --network none -u 999:999 \
      -v /opt/stacks-data/authentik-pg-standby/run:/var/run/postgresql \
      -v /opt/stacks-data/authentik-pg-rehearsal:/rehearsal "$PGIMG" \
      pg_basebackup -h /var/run/postgresql -U postgres -D /rehearsal/pgdata -X stream --checkpoint=fast --progress
pi$ rm -f /opt/stacks-data/authentik-pg-rehearsal/pgdata/standby.signal

# 2. Start it as a primary: no standby.signal, so it replays the backup's WAL and opens read-write.
pi$ docker run -d --name authentik-pg-rehearsal --network none -u 999:999 \
      -v /opt/stacks-data/authentik-pg-rehearsal:/var/lib/postgresql/data \
      -v /opt/stacks/authentik-pg-standby/config:/etc/postgresql:ro "$PGIMG" \
      postgres -D /var/lib/postgresql/data/pgdata \
        -c config_file=/etc/postgresql/postgresql.conf -c hba_file=/etc/postgresql/pg_hba.conf \
        -c ident_file=/etc/postgresql/pg_ident.conf -c unix_socket_directories=/tmp -c primary_slot_name=
pi$ sleep 20; docker exec authentik-pg-rehearsal psql -h /tmp -U postgres -d postgres -tAc "select pg_is_in_recovery()"   # f

# 3. Every btree index, heap-verified. Any corruption raises an ERROR; the gate is a clean exit.
pi$ docker exec authentik-pg-rehearsal psql -h /tmp -U postgres -d authentik -v ON_ERROR_STOP=1 \
      -c "create extension if not exists amcheck" \
      -c "select count(*) as indexes_checked from (
            select bt_index_check(index => c.oid, heapallindexed => true)
            from pg_index i join pg_class c on c.oid = i.indexrelid join pg_am am on am.oid = c.relam
            join pg_namespace n on n.oid = c.relnamespace
            where am.amname = 'btree' and n.nspname = 'public' and c.relpersistence <> 't') s"

# 4. The data is really there.
pi$ docker exec authentik-pg-rehearsal psql -h /tmp -U postgres -d authentik -tAc \
      "select 'users='||(select count(*) from authentik_core_user)||' apps='||(select count(*) from authentik_core_application)||' flows='||(select count(*) from authentik_flows_flow)"

# 5. Clean up.
pi$ docker rm -f authentik-pg-rehearsal && rm -rf /opt/stacks-data/authentik-pg-rehearsal
```

Record the date, the image digests on both sides, the `indexes_checked` count
and the elapsed time in PLAN.md's phase-3 gate. **A failure in step 3 means
the Pi standby must not be promoted** — fall back to a restore from
authentik-pg's barman backups instead, and revisit PLAN.md decision 2.
