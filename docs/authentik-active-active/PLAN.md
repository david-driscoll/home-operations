# Authentik active-active: equestria + alpha-site behind one VIP

Status: **in progress** — phases land as separate commits; each phase below says
what gates the next one. Started 2026-09-13.

## Why, and what it changes about doc 07

[07-authentik-to-alpha-site.md](../cluster-consolidation/07-authentik-to-alpha-site.md)
moved authentik onto the alpha-site Pi so identity would survive the equestria
merge, and accepted "one Pi, one PSU, one USB cable" as the risk. This plan
removes that single point of failure by running authentik on **both** sites
against one database, with a keepalived VIP in front.

It is a deliberate trade, and the trade is not free:

| Outage          | Today (doc 07)                      | After this plan                                                    |
| --------------- | ----------------------------------- | ------------------------------------------------------------------ |
| alpha-site down | **All SSO down** until the Pi is back | VIP moves to equestria; SSO unaffected                              |
| equestria down  | SSO unaffected                      | **SSO down until a human promotes the Pi standby** (FAILOVER.md) |

authentik ≥ 2025.10 keeps sessions, tasks and its channel layer in PostgreSQL,
so a read-only standby cannot serve a login. The Pi's authentik is only as
available as the primary it writes to. Accepted 2026-09-13.

## Target

```
                     10.10.255.10  (VRRP VIP, unicast)
                 ┌──────────────┴───────────────┐
      prio 150 (preempt)                  prio 100
   keepalived DaemonSet                 keepalived container
   equestria workers                    alpha-site LXC 10.10.10.9
          │ externalIPs                         │ 0.0.0.0:443
   Traefik (network/traefik)             Traefik (docker/_common/traefik)
          │                                     │
   authentik server+worker (idp)         authentik server+worker
          │                                     │
          └──────────► authentik-pg-rw ◄────────┘  10.10.206.150 (LB)
                     CNPG, 3 instances           │
                               │ streaming (slot alpha_site_standby)
                               ▼
                     authentik-pg-standby (Pi, hot standby, manual promote)
```

## Decisions (and the facts they rest on)

1. **Dedicated CNPG cluster `stargate-command/authentik-pg`, not a database on
   `database/postgres`.** Physical replication copies a whole cluster; the
   shared one holds ~35 databases, OpenBao's storage, and a TimescaleDB/PostGIS
   image. It lives in the Tier-1 namespace and is **pinned to the control
   planes** (`critical-tier`, control-plane toleration, `longhorn-local` on
   each control plane's disk) so it survives a Battery window when the workers
   are off — decided 2026-09-13.
2. **Physical streaming to the Pi, amd64 → arm64.** PostgreSQL documents
   physical replication as same-architecture only. x86-64 and aarch64 agree on
   endianness, alignment and float format, so the control-file checks pass and
   it works in practice — but it is unsupported, so it is **gated**: the
   standby is not trusted until a promotion rehearsal passes `amcheck`
   (phase 3). Collation, the other cross-platform trap, is removed outright:
   `authentik-pg` uses the builtin `C.UTF-8` provider, and both sides run
   Debian bookworm glibc images (never the Pi's alpine/musl postgres).
3. **Data move by `pg_dump`/`pg_restore` in a short window, not logical
   replication.** The database was ~2.7 GB at doc 07's cutover, both ends are
   PG 18, and that cutover already proved this dump/restore. CUTOVER.md
   rehearses it against a scratch database first, so the window is a measured
   number rather than a guess. Logical replication would
   need a restart of the Pi's shared postgres for `wal_level=logical`, a manual
   sequence resync, and still a cutover moment — complexity to save minutes.
4. **Credentials are born in OpenBao** (`stacks/system/authentik-pg.ts` →
   `clusters/equestria/apps/authentik-pg/{app,replication}`), and flow to
   equestria via ESO and to the Pi via `ref+openbao://`. Nothing on the Pi
   needs the Kubernetes API to deploy.
5. **The Pi's standby is its own stack** (`docker/alpha-site/authentik-pg-standby`),
   not the shared `docker/_common/postgres`. A read-only shared postgres would
   fail `provision.sh`, and `postgresInit` turns that into a failed
   `stacks/home` run for every stack on the host.
6. **VIP `10.10.255.10/16`.** UniFi's Home DHCP pool is `10.10.0.5–10.10.254.254`,
   so `10.10.255.0/24` is outside it; also outside Cilium's LB pool
   (`10.10.206.100–252`), no UniFi client has held it, and nothing in the repo
   referenced it (verified 2026-09-13).
7. **Traefik on equestria answers the VIP via `externalIPs`**, not a second
   LoadBalancer Service. Cilium L2-announces LoadBalancer IPs unconditionally,
   which would fight the Pi's keepalived for ARP; `externalIPs` are served by
   kube-proxy replacement (`kube-proxy-replacement=true`) but never announced,
   so keepalived is the only thing answering ARP for the VIP.
8. **Media on Garage S3**, shared by both sites, instead of the Pi's local
   `/media`.
9. **One DNS writer.** The vanity names (`authentik`, `iris`, `canterlot`) stay
   owned by Pulumi and move from a CNAME-to-the-Pi to an A record for the VIP.
   equestria's routes for those names carry no external-dns hostname. Two
   writers on these names is the doc 07 incident.
10. **Split-brain fence.** After a manual promotion of the Pi, a recovering
    equestria would bring its old primary back and, at priority 150, preempt
    the VIP onto stale data. equestria's keepalived health check therefore also
    fails if the Pi's postgres reports `pg_is_in_recovery() = false`
    (unreachable counts as "not promoted"). The runbook adds hibernating
    `authentik-pg` before letting Flux reconcile.

## Phases

Each phase is its own commit (or PR).

**Merging is deploying.** The Pulumi Operator runs `system` and
`home-operations` (`stacks/home`, which deploys the Pi) on every new commit to
`main`, and Flux applies `kubernetes/` at the same time. So:

- Phase 1 needs no ordering: the `system` run creates the OpenBao records while
  Flux creates the cluster, and the ExternalSecrets retry until the records
  exist. Only the `authentik-pg` Kustomization waits in the meantime.
- Phase 2's `.env` change **is the cutover**. Merged early, the Pi's authentik
  restarts against an empty `authentik-pg`, runs its migrations there and
  serves a blank IdP — and the later `pg_restore` then collides with that
  schema. It merges at step 5 of [CUTOVER.md](CUTOVER.md), not before.
- Later-phase Pi stacks ship gated with `.ignore`; removing the gate is the
  deploy.

| # | What | Where | Gate to proceed |
|---|------|-------|-----------------|
| 1 | `authentik-pg` cluster + credentials | `kubernetes/apps/stargate-command/authentik-pg`, `stacks/system/authentik-pg.ts` | Cluster Ready, `authentik-pg-lan` holds `10.10.206.150`, `psql` from the Pi LXC works |
| 2 | Move data: dump Pi → restore `authentik-pg`, repoint the Pi's authentik | `docker/alpha-site/authentik/.env`, [CUTOVER.md](CUTOVER.md) | **Merge only inside the window, after the restore** (see above); Gatus green on all four names; logins + outposts work |
| 3 | Pi streaming standby | `docker/alpha-site/authentik-pg-standby` | Lag < 1 min in Prometheus; **promotion rehearsal with `amcheck` passes** on a throwaway copy |
| 4 | Retire the Pi's shared-postgres tenant + valkey | `docker/alpha-site/authentik` | Soak ≥ 7 days after phase 2 |
| 5 | authentik on equestria (staging hostname), media on Garage | `kubernetes/apps/equestria/idp/authentik`, `stacks/system/garage.ts` | Both sites serve logins against the one DB |
| 6 | keepalived both sides + Traefik `externalIPs` | `kubernetes/apps/network/keepalived`, `docker/alpha-site/keepalived` | VIP moves on `docker stop authentik-server` / pod kill and back on recovery |
| 7 | DNS cutover of the vanity names to the VIP | `docker/alpha-site/authentik/compose.yaml` (`x-dns`), `components/DockgeLxc.ts` | Gatus per-site + VIP checks green |
| 8 | Failover runbook | [`docker/alpha-site/authentik-pg-standby/FAILOVER.md`](../../docker/alpha-site/authentik-pg-standby/FAILOVER.md) | Rehearsed once end-to-end |

## Version lock

Both sites must run the **same authentik version**: a newer server migrates the
schema out from under an older one. Renovate groups the two pins
(`docker/alpha-site/authentik/compose.yaml`, the equestria HelmRelease) into one
PR. Upgrade by stopping the Pi's authentik, letting equestria migrate, then
starting the Pi on the new image.
