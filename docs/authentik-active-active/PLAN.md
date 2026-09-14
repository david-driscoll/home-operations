# Authentik active-active: equestria + alpha-site behind one VIP

Status: **cut over 2026-09-13/14.** Both sites serve against `authentik-pg`, the
SSO names resolve to the VIP, the Pi standby streams (verified <1 s behind on
2026-09-14). The FAILOVER.md rehearsal **passed on 2026-09-14**: a clone of the
standby opened read-write on the Pi and `amcheck` heap-verified all 824 btree
indexes (primary `ghcr.io/cloudnative-pg/postgresql:18.6-standard-bookworm`
amd64, standby `postgres:18.6-bookworm` arm64; clone 2m31s, check 2m50s), so
the standby is trusted for promotion. Outstanding: PR D (drop the Pi's old
copy) after the soak, and the phase-6 VIP move test (scale equestria's
authentik to zero and back). See "As run" at the end for what diverged.

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
| Battery / Low Power (workers off) | SSO unaffected         | SSO unaffected — every piece is Tier 1 (decision A)                |

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
   authentik server+worker (equestria)   authentik server+worker
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
8. **No uploaded media.** Revised 2026-09-13 from "media on Garage S3":
   authentik's S3 backend hands browsers presigned URLs to fetch directly, so
   Garage would have to be exposed to every browser over TLS — new public
   infrastructure for what doc 07 counted as 4 files / 108 KB. Every
   Pulumi-managed application already sets its icon as a URL; the few uploaded
   files are converted to URLs too (CUTOVER.md pre-flight lists them), and
   both sites keep the `file` backend on scratch storage.
9. **One DNS writer.** The vanity names (`authentik`, `iris`, `canterlot`) stay
   owned by Pulumi and stay CNAMEs, retargeted from the Pi to a new
   `authentik-vip` A record — a value change is in place on all three
   providers, a type change is delete-then-create on two (verified against the
   provider sources, 2026-09-13).
   equestria's routes for those names carry no external-dns hostname. Two
   writers on these names is the doc 07 incident.
10. **Split-brain fence.** After a manual promotion of the Pi, a recovering
    equestria would bring its old primary back and, at priority 150, preempt
    the VIP onto stale data. equestria's keepalived health check therefore also
    fails if the Pi's postgres reports `pg_is_in_recovery() = false`
    (unreachable counts as "not promoted"). The runbook adds hibernating
    `authentik-pg` before letting Flux reconcile.

## Decision A — Battery / Low Power (decided 2026-09-13)

In Battery mode the workers are off and only Tier 0/1 runs on the control
planes (doc 20). A primary on worker-bound volumes would have made a power
outage an "equestria down" for SSO on **both** sites — worse than today, where
the PoE-powered Pi rides through it.

Chosen: **option 1 — `authentik-pg` runs on the control planes.** It lives in
`stargate-command` (the Tier-1 namespace), with a required `nodeSelector` on
`node-role.kubernetes.io/control-plane`, the control-plane toleration,
`critical-tier`, and `longhorn-local` on each control plane's own disk (three
instances are the redundancy; a lost disk is a re-clone, not data loss). The
other pieces were already Tier 1: authentik's pods carry the same toleration
and `critical-tier`, keepalived runs on every node, and Traefik is Tier 1.

Rejected: `longhorn-critical` for the same pods (3 × 3 copies buys nothing
once the pods are pinned), and "accept it, promote the Pi in a Battery window"
(a runbook for a scheduled event is a regression, not a design).

## Phases

Each phase is its own commit (or PR).

**Merging is deploying.** The Pulumi Operator runs `system` and
`home-operations` (`stacks/home`, which deploys the Pi) on every new commit to
`main`, and Flux applies `kubernetes/` at the same time. So the phases are
grouped into **four PRs**, and each boundary is a point where a human has to
act before the next merge:

| PR | Phases | Merge when |
|----|--------|------------|
| **A** | 1, plus the VIP's VRRP password | Any time. The `system` run creates the OpenBao records while Flux creates the cluster; ExternalSecrets retry until they exist. |
| **B — the cutover** | 2, 3, 4a, 5, 6, 8 | **At step 5 of [CUTOVER.md](CUTOVER.md), inside the window, after the restore.** Everything in it is either the cutover itself or only safe after it: equestria's authentik (5) would migrate an empty database, and the standby (3) would clone one. Merged early, the Pi's authentik restarts against an empty `authentik-pg` and serves a blank IdP. |
| **C — DNS** | 7 | After the phase-6 gate passes, and `pulumi preview` on `home-operations` shows `update`, never `replace`, for the three names. |
| **D** | 4b | Last, after ≥ 7 days of soak — it drops the cutover's rollback copy. |

The VRRP password sits in PR A rather than with keepalived because PR B's
merge triggers the `system` and `home-operations` runs with no ordering
between them, and a `home-operations` render that beat the `system` run to a
missing OpenBao reference would abort the whole run (HO#636).

| # | PR | What | Where | Gate to proceed |
|---|----|------|-------|-----------------|
| 1 | A | `authentik-pg` cluster + credentials | `kubernetes/apps/stargate-command/authentik`, `stacks/system/authentik-pg.ts` | Cluster Ready, one instance per control plane, `authentik-pg-lan` holds `10.10.206.150`, `psql` from the Pi LXC works |
| 2 | B | Move data: dump Pi → restore `authentik-pg`, repoint the Pi's authentik | `docker/alpha-site/authentik/.env`, [CUTOVER.md](CUTOVER.md) | Gatus green on all four names; logins + outposts work |
| 3 | B | Pi streaming standby (clones at first start) | `docker/alpha-site/authentik-pg-standby` | Lag < 1 min in Prometheus; **promotion rehearsal with `amcheck` passes** on a throwaway copy |
| 4a | B | Drop the Pi's unused valkey | `docker/alpha-site/authentik` | `docker rm -f authentik-redis` once |
| 5 | B | authentik on equestria (staging hostname) | `kubernetes/apps/stargate-command/authentik` (namespace `stargate-command`) | Both sites serve logins against the one DB; both Deployments carry the Tier-1 tolerations |
| 6 | B | keepalived both sides + Traefik `externalIPs` + the fence's role endpoint | `kubernetes/apps/network/authentik-vip`, `docker/alpha-site/authentik-vip`, `docker/alpha-site/authentik-pg-standby` | See "Phase 6 gate" below |
| 7 | C | `authentik-vip` A record, equestria's unpublished vanity route, then the CNAME retarget | `stacks/home/index.ts`, `kubernetes/apps/stargate-command/authentik/vanity-route.yaml`, `docker/alpha-site/authentik/compose.yaml` (`x-dns`), `components/DockgeLxc.ts` | `dig authentik-vip.driscoll.tech` → `10.10.255.10` from all three providers; Gatus green for all four authentik names |
| 8 | B | Failover runbook | [`docker/alpha-site/authentik-pg-standby/FAILOVER.md`](../../docker/alpha-site/authentik-pg-standby/FAILOVER.md) | Rehearsed once end-to-end |
| 4b | D | Retire the Pi's shared-postgres tenant | `docker/alpha-site/authentik` | Soak ≥ 7 days after the cutover |

### Phase 6 gate

The VIP carries nothing until phase 7, so all of this is tested before any
client depends on it:

1. **The equestria health check works from the host network.** Cilium runs
   with `bpf-lb-sock=false`, and the track script reaches authentik's and
   Traefik's ClusterIPs from a hostNetwork pod. `kubectl -n network exec
   ds/authentik-vip -- sh /config/check-authentik.sh; echo $?` must print `0`
   on a worker **and** a control plane. If it fails everywhere the failure is
   safe (equestria sits in FAULT and the Pi keeps the VIP), but it is not the
   design — stop and fix the path before phase 7.
2. **Exactly one holder.** `ip -4 addr show | grep 10.10.255.10` on every
   equestria node (via `talosctl get addresses`) and in the Pi LXC finds one.
3. **Moves and returns.** `docker stop authentik-server` on the Pi: no change
   (equestria holds it). Scale `equestria/authentik-server` to 0: the Pi takes
   it within ~15 s. Scale back: equestria takes it back after `preempt_delay`.
4. **Clients across the router see it.** `curl -sk --resolve
   authentik.driscoll.tech:443:10.10.255.10 https://authentik.driscoll.tech/-/health/ready/`
   from the LAN, from the IoT VLAN and over the tailnet, with equestria and
   then the Pi holding the VIP. Cilium load-balances in DSR mode, so a reply
   can leave from a different node than the one holding the VIP — this is the
   check that proves the router is fine with that.
5. **The fence.** `curl http://10.10.10.9:5480/role` prints `standby` once
   phase 3 is live. A rehearsed promotion (FAILOVER.md) must flip it to
   `primary` and put every equestria instance into FAULT.

## Version lock

Both sites must run the **same authentik version**: a newer server migrates the
schema out from under an older one. Renovate groups the two pins
(`docker/alpha-site/authentik/compose.yaml`, the equestria HelmRelease) into one
PR. Upgrade by stopping the Pi's authentik, letting equestria migrate, then
starting the Pi on the new image.

## As run (2026-09-13)

PRs A, B and C merged within minutes of each other, before CUTOVER.md's data
move, so `authentik-pg` started empty and both sites migrated it; the DNS
retarget went live at the same time. The old copy on the Pi's shared postgres
was frozen when the Pi's authentik was recreated (20:49 UTC) and was intact.
Recovery, with David's approval to proceed unattended:

1. Fresh `pg_dump` of the frozen copy (one-shot container on the Pi reading the
   superuser credential from the rendered env, never leaving the host).
2. `pg_restore --clean --if-exists --single-transaction` into `authentik-pg`
   after terminating the other sessions, so no client ever saw an empty
   schema; equestria's authentik held at zero replicas meanwhile (#1685).
   Restored at 21:03 UTC; counts identical to the baseline (users=11 groups=9
   apps=151 tokens=7 flows=26), no ownership drift.
3. Two defects fixed live:
   - `authentik-pg-replication` is a Secret name CNPG reserves for its own
     streaming_replica client certificate, so the managed role never got a
     password and the standby could not clone. Renamed to
     `authentik-pg-standby-auth` (#1685).
   - keepalived under `cap_drop: ALL` cannot `setgroups()` before running its
     track script, so the script never ran: an equestria node held the VIP as
     MASTER with authentik at zero and Traefik answered 503 on the SSO names.
     `SETGID`/`SETUID` added on both sides (#1690). Until that landed, SSO was
     down on the vanity names for about four hours (`authentik.as.driscoll.tech`
     kept working).
4. #1690 restored equestria's replicas; the `home-operations` run succeeded at
   05:42 UTC on 2026-09-14 and the VIP has answered 200 since.

Lesson for the runbooks: a stacked PR set where merging deploys needs the
"merge only inside the window" PR to be physically unmergeable until then
(a draft, or a required check), not a note in its description.
