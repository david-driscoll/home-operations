# 01 — Stabilise (A)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). This is the plan's Phase 0 and
the first gate on the critical path (`01 → 10 → 18 → 19 → 20`). Nothing that touches a node —
not [10-drain-safety.md](10-drain-safety.md), not the SGC→control-plane join in
[18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) — should start until
this file's exit gate is genuinely green.

**Decisions this piece implements:** D3 (drop `oxycloud`; drop **SGC's** `crowdsec` db, keep
equestria's — [vault#111](https://github.com/david-driscoll/vault/issues/111) /
[equestria-cluster#2977](https://github.com/david-driscoll/equestria-cluster/pull/2977)). See
the [decision ledger](README.md#decision-ledger) for the full table; this plan does not
relitigate D1–D12.

## Read this first: the July exit gate is stale, and not in the direction you'd expect

[Expansion v2.1](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583)
(2026-07-31) stated: *"Phase 0's exit gate is currently met, re-check immediately before
starting rather than trusting this snapshot."* That warning was correct — the snapshot didn't
hold. Between 2026-08-02 and 2026-08-07, five new issues landed that touch exactly this phase:
[#139](https://github.com/david-driscoll/vault/issues/139),
[#130](https://github.com/david-driscoll/vault/issues/130),
[#126](https://github.com/david-driscoll/vault/issues/126),
[#119](https://github.com/david-driscoll/vault/issues/119),
[#127](https://github.com/david-driscoll/vault/issues/127), and
[#118](https://github.com/david-driscoll/vault/issues/118).

Here is the twist: **I re-verified all six live against both clusters on 2026-08-13, and five
of the six are already resolved in practice** — even though every one of them is still `open`
on the tracker. Only one, #127, is a live, unmitigated risk today. The table below is the
actual state as of 2026-08-13; the "re-verify" column is what you run immediately before
trusting it again, because — as v2.1 already learned the hard way — this table has a shelf
life too.

## Verified state, 2026-08-13

| Issue | What it claimed | Live verification, 2026-08-13 | Status |
|---|---|---|---|
| [#139](https://github.com/david-driscoll/vault/issues/139) | shining-armor's Talos upgrade stuck `Failed`, tainted since 2026-08-05, on the **surviving** cluster | `kubectl --context admin@equestria get node shining-armor` → `Talos (v1.13.8)`, matches all 3 other nodes; no taint; `TalosUpgrade/talos` phase = `Completed` | **RESOLVED** |
| [#130](https://github.com/david-driscoll/vault/issues/130) | equestria `postgres-1` on timeline 21 while primary is on 24; `CNPGClusterHAWarning` firing | `Cluster postgres -n database`: all 3 instances report `timeLineID: 26`; `postgres-2` primary; `Ready=True`, `readyInstances: 3` | **RESOLVED** |
| [#126](https://github.com/david-driscoll/vault/issues/126) | equestria `postgres-1` wedged replica, not streaming for ~19h, silently down to 1 usable replica | Same check as above — `postgres-1` fully caught up on the shared timeline. Whoever ran `kubectl cnpg destroy postgres-1` (the issue's own prescribed fix) closed this. | **RESOLVED** |
| [#119](https://github.com/david-driscoll/vault/issues/119) | WAL archiving failing on both clusters (`NoSuchBucket`); **no PITR exists anywhere** | See [§ No-PITR correction](#correction-pitr-now-genuinely-works-on-both-clusters) below — fully resolved, with a caveat | **RESOLVED, with caveat** |
| [#127](https://github.com/david-driscoll/vault/issues/127) | equestria etcd on `fluttershy`/`kerfuffle`'s PNY SATA disks collapses under `/var` write contention from Pulumi Workspace pods, crashing every leader-electing controller | `kubectl get pods -n pulumi -o wide`: `sgc-workspace-0` scheduled on `fluttershy` right now. No `nodeSelector`/anti-affinity exists on any `Workspace` CR — the interim mitigation proposed in the issue was never applied. `kerfuffle` shows age 38d (a partial rebuild happened at some point) but `fluttershy` is still 156d old on its original PNY disk. | **STILL OPEN — see § below** |
| [#118](https://github.com/david-driscoll/vault/issues/118) | SGC's Flux controllers capped at `cpu: 100m` while running 10–20 concurrent reconciles; a graceful controller restart looks like a cluster-wide outage | `kubectl --context admin@sgc get deploy kustomize-controller -n flux-system -o jsonpath='{.spec.template.spec.containers[0].resources}'` → `{"limits":{"memory":"2Gi"},"requests":{"cpu":"100m","memory":"64Mi"}}` — **no CPU limit**. `sgc#1743` merged and is live. | **RESOLVED** |

None of these five resolutions closed the corresponding GitHub issue — the tracker state is
stale relative to cluster reality in the *opposite* direction from what you'd guess (better,
not worse). Recommend commenting each with the live evidence above and closing four of the six
as part of this phase's paperwork; leave #119 open per its own author's standard ("restores are
rehearsed, not improvised" — see below) and leave #127 open until its fix lands.

### Correction: PITR now genuinely works on both clusters

The README's "what changed" section and the cross-cutting rule "no PITR anywhere
([vault#119](https://github.com/david-driscoll/vault/issues/119)): database rollback
granularity is the nightly dump" both restate the *original* #119 finding. That finding is
**out of date**. Verified live, 2026-08-13:

```
equestria: kubectl get objectstores.barmancloud.cnpg.io postgres-backups -n database -o jsonpath='{.status}'
  {"serverRecoveryWindow":{"postgres":{
    "firstRecoverabilityPoint":"2026-08-03T16:01:09Z",
    "lastSuccessfulBackupTime":"2026-08-12T16:02:18Z"}}}

sgc: same command, same shape
  {"serverRecoveryWindow":{"postgres":{
    "firstRecoverabilityPoint":"2026-08-03T16:05:33Z",
    "lastSuccessfulBackupTime":"2026-08-12T16:09:06Z"}}}
```

`kubectl get backups.postgresql.cnpg.io -n database` on both clusters shows **10 consecutive
`completed` daily backups**, 2026-08-03 through 2026-08-12, after two initial failures on
2026-08-02 (the `NoSuchBucket` misconfiguration #119 was filed to fix). The fix landed as three
PRs — `home-operations#630` (provisioned `cnpg-equestria`/`cnpg-sgc` Minio buckets),
`equestria-cluster#2988`, `stargate-command-cluster#1744` — all merged, and CNPG's own
`ContinuousArchiving`/`LastBackupSucceeded` conditions read `True` on both clusters right now.

**What this means for the rest of this plan:** every phase from here on that says "rollback
granularity is 24 hours, take a dump and verify it" can now also point at a real WAL+base-backup
recovery window starting 2026-08-03. That is strictly additive safety margin for the CNPG
surgery steps in [18](18-sgc-nodes-join-control-plane.md) and
[19](19-rotate-equestria-control-planes.md) — it does not replace the nightly logical dump,
which stays the mechanism for the things barman-cloud doesn't cover (and is unaffected either
way).

**The caveat, and why #119 should stay open regardless:** nobody has restored from this backup
chain into a scratch cluster and timed it. The issue's own commenters were explicit — *"restores
are rehearsed, not improvised"* — and that rehearsal is unclaimed work, not a checkbox this
phase can tick. Treat PITR as **available-but-unrehearsed** capacity. It does not relax the
existing rule elsewhere in this plan that every CNPG-touching step takes and verifies its own
on-demand dump first.

Also still open from #119's own findings and unrelated to the archiving fix: the `recovery:`
block in both repos' `database/postgres/app/resources/values.yaml` still points
`{{ .backblaze_bucket }}-restore` at the Minio endpoint with `path: "/"` — the same
credential-target mismatch, in the block you'd actually reach for mid-restore, plus a path that
wouldn't match the archive layout even if the bucket were right. It's inert under
`mode: standalone` today, which is exactly why it's still there. Fixing it is cheap and belongs
in this phase; it is not gating.

### vault#127 — the one still-open blocker, and why it resolves itself later

Unlike the other five, #127 has no quick git fix — its root cause is that `fluttershy` and
`kerfuffle` install `/var` (and therefore etcd) onto a 27ms-average-write-latency PNY SATA SSD
instead of the fast Samsung NVMe that's fully allocated to Longhorn on those same nodes, and any
write-heavy pod scheduled there (measured: `pulumi/sgc-workspace-0` at 13.8 MB/s, ~71% of
`kerfuffle`'s disk write load) starves etcd's fsync past its 10ms p99 budget, which cascades into
leader-election losses on every controller cluster-wide.

**Two things make this tolerable for the length of this plan rather than an immediate
firefight:**

1. **It hasn't fired since the issue was filed.** No new synchronized-restart wave has been
   reported since 2026-08-02, and `kerfuffle`'s current 38-day age suggests a rebuild happened
   at some point since. It is a live risk, not an active incident.
2. **The durable fix already exists in this plan and requires no extra work.** `fluttershy` and
   `kerfuffle` are two of the three *original equestria control planes* that
   [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md) wipes and
   rejoins as **workers**. Once that happens, etcd runs only on the new control planes
   (`milky-way`/`othalla`/`pegasus`), whose `talconfig` already installs to `/dev/nvme0n1` with
   Longhorn isolated on a separate SATA disk — the *opposite* arrangement from `fluttershy`
   /`kerfuffle` today, and the one #127's own v2.1 measurement called "actually better isolation
   than equestria's current CPs." No hardware swap is needed on `fluttershy`/`kerfuffle`
   specifically; the problem disappears when they stop being etcd members.

That means this phase's job is *risk reduction for the stabilisation window*, not a fix:

- **Apply the interim mitigation from the issue.** Pin Pulumi `Workspace` pods off
  `fluttershy`/`kerfuffle` via `spec.podTemplate.spec.nodeSelector` in the Pulumi operator's
  workspace template (owned outside this repo pair — flag it as a same-week follow-up, not part
  of this file's file-level changes). This removes the dominant writer (~71% of the load) without
  touching Talos.
- **Do not let this phase's own work make it worse.** Nothing in this file's checklist below
  schedules new write-heavy workloads onto `fluttershy` or `kerfuffle`.
- **Carry the risk forward explicitly.** [10-drain-safety.md](10-drain-safety.md) and
  [18](18-sgc-nodes-join-control-plane.md) should treat a `fluttershy`/`kerfuffle` lease-election
  stall as a known failure mode, not a surprise, until 19 completes.

## Work items

### 1. Drop `oxycloud` and SGC's `crowdsec` database (D3)

Confirmed **still present** on SGC, 2026-08-13:

```
$ kubectl --context admin@sgc get databases.postgresql.cnpg.io -n database
NAME        AGE    CLUSTER    PG NAME     APPLIED   MESSAGE
authentik   232d   postgres   authentik   true
crowdsec    210d   postgres   crowdsec    true
oxycloud    182d   postgres   oxycloud    true
```

Both are confirmed orphans with no workload:

- **`oxycloud`** — no HelmRelease, no app directory anywhere in `stargate-command-cluster`
  (`find kubernetes/apps -iname "*oxycloud*"` returns nothing). David: *"It can be removed for
  now"* ([comment](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112326099)).
- **`crowdsec` (SGC's copy)** — same shape: orphaned app scaffold at
  `kubernetes/apps/network/crowdsec/`, never wired into `network/kustomization.yaml`, no live
  pods. **Equestria's `crowdsec` is now the live one** — confirmed running today
  (`crowdsec-agent` ×4, `crowdsec-lapi`, `crowdsec-ui`, all `Running`) since
  [equestria-cluster#2977](https://github.com/david-driscoll/equestria-cluster/pull/2977)
  shipped. [vault#111](https://github.com/david-driscoll/vault/issues/111) is explicit: *"Do not
  enable CrowdSec on SGC — #2977 is deliberately equestria-only."* SGC's database is the
  duplicate to drop, not the one to keep.

Both `Database` CRs carry `databaseReclaimPolicy: retain`, so removing the CR from git alone
**does not** drop the underlying Postgres database — it just stops CNPG from tracking it. To
actually reclaim them (matching "removed," not "abandoned"), do it in two steps:

1. **Ask CNPG to drop them first**, while the CR still exists: set `spec.ensure: absent` on both
   `Database` CRs, commit, let the reconcile run, confirm `psql -c '\l'` on the cluster no longer
   lists `oxycloud`/`crowdsec`.
2. **Then remove the resources from git** so Flux doesn't recreate an `ensure: absent` husk
   forever. In `stargate-command-cluster`:

   | File | What to remove |
   |---|---|
   | `kubernetes/apps/database/postgres/app/users.yaml` | The `crowdsec-postgres` `ExternalSecret` + `crowdsec` `Database` blocks (currently lines 1–92) and the `oxycloud-postgres` `ExternalSecret` + `oxycloud` `Database` blocks (currently lines 185–276) |
   | `kubernetes/apps/database/postgres/app/resources/values.yaml` | The `crowdsec` and `oxycloud` entries in the managed-roles list (currently lines 108–113 and 120–125) |
   | `kubernetes/apps/database/postgres/app/passwords.sops.yaml` | The `crowdsec-postgres-password` and `oxycloud-postgres-password` `Secret` stanzas (currently around lines 93–100 and 185–192) — re-encrypt with `sops updatekeys`/`sops -e` after editing, per the file's existing pattern |

   Line numbers are as of `stargate-command-cluster@6619209` (2026-08-13); re-grep
   (`grep -n "oxycloud\|crowdsec" kubernetes/apps/database/postgres/app/users.yaml`) before
   editing rather than trusting them verbatim.

Both databases are empty today (system catalogs only, per the 2026-07-29/31 discovery
verification) — the "free to drop right now" framing in Niobe's [2026-08-01
note](https://github.com/david-driscoll/vault/issues/84#issuecomment-5152487298) on vault#84
(*"Both are empty today (only system catalogs), so doing it now is free"*) holds. **Note:**
equestria's own `crowdsec` database is *not* empty anymore — it's been live since #2977 and now
holds real alert/decision history. That's not this phase's concern (equestria's copy is the
survivor and isn't being touched here), but it's the reason the pre-wipe database
dump/restore-verification inventory in [16-soak-and-gate.md](16-soak-and-gate.md) should list
`crowdsec` alongside `authentik` as a database with real content to verify, rather than assume
it's still the empty shell it was in July.

### 2. Delete the orphan `sgc/adguard-home-dns` Service

**Already done.** No `Service` named `adguard-home-dns` exists in the `sgc` namespace, and no
`Service` anywhere on SGC holds `10.10.209.202` (checked every `Service` object cluster-wide by
IP, not just by name). This item from the Q-B deletion list is closed; no action needed here.

**One loose end it left behind:** the Tailscale operator's generated child `Service` for that
parent was never cleaned up:

```
$ kubectl --context admin@sgc get svc ts-adguard-home-dns-9j8ct -n tailscale-system -o yaml
  labels:
    tailscale.com/parent-resource: adguard-home-dns
    tailscale.com/parent-resource-ns: sgc
  spec:
    clusterIP: None
    selector:
      app: c5575529-5b12-4c3a-b352-49d3218801ba   # no pod matches this selector
```

No backing pod exists for that selector — this is inert, not actively causing anything — but
it's a stale Tailscale-managed object plus, most likely, a stale device entry in the Tailscale
admin console (`opossum-yo.ts.net`). Delete the `Service` in `tailscale-system` and check the
admin console for a lingering `adguard-home-dns` device to remove alongside it. Cheap, not
blocking, worth doing in the same pass as the rest of this phase's cleanup so it doesn't
resurface as a mystery object during
[10-drain-safety.md](10-drain-safety.md)'s node-by-node inventory.

### 3. `max_slot_wal_keep_size` — confirmed capped on both, but not matched

```
equestria: kubectl get cluster.postgresql.cnpg.io postgres -n database \
  -o jsonpath='{.spec.postgresql.parameters.max_slot_wal_keep_size}'  →  10GB
sgc:       same command                                                →  20GB
```

Both are capped, which is the thing that actually matters — this is the one guardrail that
stops a wedged replica's inactive slot from repeating the 2026-07 WAL-fill stuck-slot cascade
that took authentik down. Neither cluster is at the dangerous `-1` (unbounded) setting.

The two values don't match (10GB vs 20GB). That's not a defect — nothing requires them to be
equal — but it's worth a deliberate decision rather than an accident, since after
[18](18-sgc-nodes-join-control-plane.md)/[19](19-rotate-equestria-control-planes.md) there is
only one `database/postgres` cluster and one value to pick. Recommend carrying this forward as
an open question for whoever owns the CNPG migration steps rather than resolving it here — this
phase's job was to confirm both are capped, and they are.

## Exit gate

All of the following must pass, re-checked immediately before starting
[10-drain-safety.md](10-drain-safety.md) — not read off this document, which will itself be
stale by then:

```bash
# 1. All Pulumi stacks reconciled, none STALLED
kubectl --context admin@equestria get stacks.pulumi.com -n pulumi

# 2. Zero degraded Longhorn volumes, both clusters
kubectl --context admin@equestria get volumes.longhorn.io -n longhorn-system \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.robustness}{"\n"}{end}' \
  | grep -v -E 'healthy|unknown'
kubectl --context admin@sgc get volumes.longhorn.io -n longhorn-system \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.robustness}{"\n"}{end}' \
  | grep -v -E 'healthy|unknown'
# (both should print nothing)

# 3. shining-armor healthy and untainted (vault#139)
kubectl --context admin@equestria get node shining-armor \
  -o jsonpath='{.status.nodeInfo.osImage}{" taints="}{.spec.taints}{"\n"}'

# 4. equestria CNPG: all instances on the same timeline, 3/3 ready (vault#126/#130)
kubectl --context admin@equestria get cluster.postgresql.cnpg.io postgres -n database \
  -o jsonpath='{.status.phase}{" ready="}{.status.readyInstances}{"\n"}'
kubectl cnpg status postgres -n database --context admin@equestria   # eyeball timelines match
# (the cnpg plugin requires --context after the subcommand, not before)

# 5. WAL archiving + base backups current on both clusters (vault#119)
for ctx in admin@equestria admin@sgc; do
  echo "== $ctx =="
  kubectl --context $ctx get objectstores.barmancloud.cnpg.io postgres-backups -n database \
    -o jsonpath='{.status.serverRecoveryWindow}{"\n"}'
  kubectl --context $ctx get backups.postgresql.cnpg.io -n database \
    --sort-by=.metadata.creationTimestamp | tail -3
done

# 6. max_slot_wal_keep_size still capped (not -1) on both
kubectl --context admin@equestria get cluster.postgresql.cnpg.io postgres -n database \
  -o jsonpath='{.spec.postgresql.parameters.max_slot_wal_keep_size}{"\n"}'
kubectl --context admin@sgc get cluster.postgresql.cnpg.io postgres -n database \
  -o jsonpath='{.spec.postgresql.parameters.max_slot_wal_keep_size}{"\n"}'

# 7. oxycloud / crowdsec(sgc) actually gone, not just untracked
kubectl --context admin@sgc get databases.postgresql.cnpg.io -n database
# expect: only "authentik" left

# 8. No Service anywhere holds the retired adguard-home-dns address
kubectl --context admin@sgc get svc -A -o json | \
  python3 -c "import json,sys; d=json.load(sys.stdin); \
  print([ (i['metadata']['namespace'],i['metadata']['name']) for i in d['items'] \
  if '10.10.209.202' in (i.get('spec',{}).get('loadBalancerIP') or '') ])"
# expect: []

# 9. vault#127 interim mitigation applied — no Pulumi Workspace pod on fluttershy/kerfuffle
# (filter to *-workspace-* specifically: the pulumi-operator Deployment and its
# lock-canceller CronJob pods legitimately float onto any node and are not the
# write-heavy culprit named in vault#127 — only Workspace pods are)
kubectl --context admin@equestria get pods -n pulumi -o wide | grep workspace | grep -E 'fluttershy|kerfuffle'
# expect: no matches, once the nodeSelector fix lands. Today (2026-08-13) this still
# matches — confirmed live, sgc-workspace-0 was observed on fluttershy — so this item
# is an accepted, tracked risk (see § vault#127 above), not a currently-passing gate.

# 10. Both clusters' OpenBao secret store is healthy — everything from here on (10, 13,
# 14, 22, and every ExternalSecret in both clusters) depends on it. OpenBao's own storage
# rides the exact CNPG `database/postgres` cluster items 4-6 above already gate on, so a
# clean CNPG check does not by itself prove OpenBao is reachable — check it directly.
for ctx in admin@equestria admin@sgc; do
  echo "== $ctx =="
  kubectl --context $ctx get clustersecretstore openbao \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
done
# expect: True / True. Verified live 2026-08-13 on both — this is a regression check,
# not a currently-failing item.
```

If (9) still shows a workspace pod on either node, that's an accepted, tracked risk under
[§ vault#127](#vault127--the-one-still-open-blocker-and-why-it-resolves-itself-later), not a
hard gate — but it should be a *conscious* accept, re-confirmed, not silently ignored.

**Reversible:** entirely. Nothing in this phase touches a node, a Kustomization's placement, or
any resource outside the two orphaned SGC databases and one stale Tailscale Service. The riskiest
individual action — `ensure: absent` on `oxycloud`/`crowdsec` — is scoped to databases already
confirmed to hold zero application data.

## See also

- [README.md](README.md) — decision ledger, full sequencing, cross-cutting rules
- [02-volsync-two-writer.md](02-volsync-two-writer.md) — the other Phase-0-adjacent cleanup,
  independent of this file
- [10-drain-safety.md](10-drain-safety.md) — depends on this file's exit gate
- [18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) — where vault#127
  stops mattering by construction
- [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md) — the actual
  fix for vault#127
