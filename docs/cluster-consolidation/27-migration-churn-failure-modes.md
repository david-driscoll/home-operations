# 27 — Migration churn: failure modes beyond the CRD cascade

New, 2026-08-13. **Unfiled** — no dependency edge into the migration
sequencing graph in [README.md](README.md) yet. Standalone, like
[24](24-power-states.md), [25](25-unseal-key-scope.md), and
[26](26-bootstrap-apps-to-pulumi.md).

## What this catalogs

[26](26-bootstrap-apps-to-pulumi.md) covers the CRD cascade-deletion
incident and its direct follow-on (stale HelmReleases not recreating
CRD-backed resources). This piece catalogs two more failure modes hit the
same afternoon, during the **same** piece 21 Phase A execution window, with
**different root causes** — one a cluster-wide control-plane symptom, one a
narrow staging-specific gotcha. Filed separately because neither is really
about CRD ownership or `bootstrap-apps.sh`; they're general lessons for
anyone executing the remaining namespace migrations (`equestria`,
`tailscale-system`) or any future multi-namespace Flux churn.

## Incident: `cilium-operator` silently drops L2-announcement leader election under API-server pressure

**2026-08-13, ~20:35 EDT onward.** Migrating several namespaces in quick
succession (`network`, `github-actions`, `cert-manager` earlier, `kube-system`'s
`vsc-retention`, plus the CRD-cascade recovery itself) put sustained load on
the API server. `cilium-operator` — unrelated to any of those namespaces —
crash-looped 4 times in ~4 minutes from lease-renewal timeouts:

```
level=error msg="Error retrieving lease lock" ... error="... context deadline exceeded" lock=kube-system/cilium-operator-resource-lock
level=fatal msg="Leader election lost, shutting down."
```

This is the *same symptom class* as `github-actions`' HelmRelease uninstalls
hitting `client rate limiter Wait returned an error: context deadline
exceeded` during their own churn — API-server pressure from many
simultaneous reinstalls doesn't just slow things down, it can knock
unrelated control-plane components off their leader-election lease.

**The specific damage:** after `cilium-operator` came back up and stabilized
(no further restarts for 28+ minutes), it never elected an L2-announcement
leader for the `network/traefik` Service — the single Service that
essentially every `driscoll.tech` hostname routes through (`CNAME
<app>.driscoll.tech → ponyville.driscoll.tech → A 10.10.206.101`, one shared
name so only one record has to move when the IP changes). `kubectl get
lease -n kube-system | grep l2announce` showed leases for `rustdesk`,
`qbittorrent-bittorrent`, `matter`, `mosquitto` — all fine — but **none for
`traefik`**. `cilium-dbg statedb dump`'s `l2-announce` table was empty on
*both* of traefik's backend nodes (`fluttershy`, `shining-armor`), while the
nodes actually leading the other four services showed their announcements
correctly. Not "leader lost", not "leader stuck" — **no leader was ever
elected** for this one Service, silently, with zero alert and zero log line
naming it.

**Effect:** `10.10.206.101` stopped being answerable via ARP on the
physical/tailnet-visible network at all. Every *external* client — a laptop
on Tailscale, Gatus (running on alpha-site, reached via Tailscale MagicDNS),
this session's own `curl` — got `no route to host`, consistently, for over
half an hour. **Traffic that never left the cluster kept working the whole
time** (pod-to-Service routing is pure eBPF, no L2/ARP involved), which is
what made this so slow to diagnose: `kubectl exec`-ing a curl pod and
getting a clean `302` looked like proof the app was healthy, when it only
proved the *internal* path was healthy. The external and internal paths to
the exact same hostname can and did tell completely different stories.

**What did *not* fix it:**
- Restarting the Tailscale subnet-router Connector pod (`ts-primary-connector`)
  — plausible-looking lead (its logs showed unrelated ACL packet drops), but
  wrong layer entirely. Established this was a red herring only after
  restarting it changed nothing.
- Restarting `cilium-operator` a first time — necessary (it really was
  crash-looping) but not sufficient. It came back healthy and simply never
  reprocessed the `traefik` Service into a leader election.

**What did fix it:** a trivial no-op annotation on the `traefik` Service
specifically —

```console
kubectl --context admin@equestria annotate svc traefik -n network \
  l2-nudge="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite
```

— forced `cilium-operator` to re-evaluate that one object. A lease
(`cilium-l2announce-network-traefik`, held by `shining-armor`) appeared
within 5 seconds; external connectivity recovered immediately after.

**Diagnostic path that worked**, for next time:

1. `kubectl get lease -n kube-system | grep l2announce` — compare against
   every `LoadBalancer` Service using `CiliumL2AnnouncementPolicy`
   (`loadBalancerIPs: true`, no namespace/service selector in this cluster's
   `l2-policy`, so it should cover every LB Service uniformly). A Service
   missing from this list, whose IP is otherwise correctly assigned
   (`kubectl get svc` shows the external IP, `cilium-dbg service list`
   shows it programmed with healthy backends), is exactly this failure —
   not a DNS problem, not a Tailscale problem, a **missing L2 leader**.
2. `cilium-dbg statedb dump` on the Service's actual backend nodes,
   checking the `l2-announce` table specifically — confirms whether *any*
   node is announcing that IP, not just that a lease object exists (the
   lease can lag or lie; the per-node state table is closer to ground
   truth).
3. Rule out DNS explicitly before chasing routing: trace the actual record
   chain in the authoritative server (here, Technitium) end to end. If the
   final `A` record matches the Service's live external IP and the chain is
   otherwise correct, the DNS layer is exonerated — the remaining gap is
   purely "is anything answering ARP for this IP," which is what sent this
   investigation to the right place eventually.
4. Prefer the narrowest reproduction available: a scoped annotation touch
   on the *one* affected Service, before reaching for anything
   cluster-wide (recreating the shared `CiliumL2AnnouncementPolicy`, which
   would have re-elected leaders for all four already-healthy services too,
   was the fallback that turned out not to be necessary).

**Open question, not resolved here:** why `cilium-operator` skipped
`traefik` specifically rather than every LB Service, or why a second full
pod restart didn't trigger the same re-evaluation the Service-level
annotation did. Worth a Cilium version check / upstream issue search if
this recurs — a control-plane component silently failing to elect a leader
for one specific object, with no error logged naming that object, is a real
gap regardless of root cause. No alerting exists for "a `LoadBalancer`
Service has an assigned IP but no L2-announcement lease" — that's a
concrete, cheap PrometheusRule worth adding (compare `kube_service_status_loadbalancer_ingress`
against `kube_lease` objects matching `cilium-l2announce-<namespace>-<name>`).

## Incident: staging an app whose source cluster still has it live can crash Gatus entirely

**2026-08-13, ~19:51 EDT onward**, discovered ~2 hours later via
`uptime.driscoll.tech` reporting a broad, stale-looking outage. Root cause,
found by inspecting Gatus's own panic on the host it runs on (alpha-site,
`docker/alpha-site/uptime/`):

```
panic: error parsing config: invalid endpoint applications_tailscale-idp: name and group combination must be unique
```

[Piece 13](13-stage-sgc-apps.md) staged `tsidp` into equestria — copying its
`ApplicationDefinition` (including a `gatus:` block, `group: "Applications"`)
verbatim per that piece's spec, `replicas: 0`, SGC's copy deliberately still
live (staging is designed to keep both running simultaneously; that's the
whole point of restoring against a *current* snapshot). What piece 13 didn't
anticipate: `stacks/applications/kubernetes.ts` runs
`addUptimeGatus(cluster-apps-<cluster>, ...)` **once per cluster**, reading
every `ApplicationDefinition` in that cluster and publishing its `gatus:`
entries into Gatus's shared, merged config. SGC's still-live `tsidp` and
equestria's newly-staged `tsidp` both carried the identical `(name, group)`
pair. Gatus's config loader enforces global uniqueness across the whole
merged config regardless of which cluster/Pulumi stack contributed which
entry — and **panics** (not "skip the duplicate", a hard crash) the moment
it sees two. Because Gatus crashed at config-load time, it stopped
publishing *any* fresh results at all — every endpoint in
`uptime.driscoll.tech`, not just `tsidp`, showed stale/failing data,
which is what made the actual cause hard to spot from the dashboard alone.

**Resolution:** unrelated to any Flux/git fix on the equestria side — SGC's
`tsidp` (and, in the same sweep, `tsiam`/`taildrive`) was deleted from
`stargate-command-cluster` entirely (`c18b499fb`, "disable tsidp"),
eliminating the second registration. Gatus recovered on its own once its
config no longer conflicted — no restart needed, it just needed a clean
config on its next reconcile.

**What this means for future staged apps:** any app staged per piece 13's
pattern (dual-live: SGC serving, equestria's copy present but
`replicas: 0`) that carries a `gatus:` block in its `ApplicationDefinition`
will hit this **every time**, not just for `tsidp`. The staging period is
exactly when you'd most want monitoring to keep working (SGC is still the
one actually serving traffic), so the fix isn't "remove monitoring during
staging" — it's picking one side to own the `gatus:` block for the duration.
Two options, neither implemented yet:

- Comment out `gatus:` in the **staged (equestria) copy** specifically
  during staging, since `replicas: 0` means it isn't the thing actually
  worth monitoring yet — SGC's copy, still serving, keeps the real check.
  Re-enable it as part of [14](14-cutover-runbook.md)'s cutover, in the same
  commit that flips `replicas: 0 → 1`.
- Or teach `addUptimeGatus`/`AuthentikApplicationManager` to dedupe by
  `(name, group)` across clusters before publishing, keeping one and
  dropping the other with a warning instead of letting Gatus itself hard
  panic on the conflict. More invasive, but fixes the failure mode for
  every future dual-registration case, not just staged-app pairs.

Either way: **before staging any future app per piece 13, check whether its
`ApplicationDefinition` carries a `gatus:` block, and if the source cluster's
copy is staying live during staging, resolve the collision before merging**
— not after Gatus panics and someone has to notice the dashboard looks wrong
two hours later.

## Cross-references

- [26-bootstrap-apps-to-pulumi.md](26-bootstrap-apps-to-pulumi.md) — the CRD
  cascade-deletion incident from the same afternoon; different mechanism,
  same triggering event (mass simultaneous namespace migration)
- [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md) —
  the piece whose Phase A execution triggered all of this
- [13-stage-sgc-apps.md](13-stage-sgc-apps.md) — where the staging pattern
  that caused the Gatus collision is specified; needs the dedup fix above
  before the next staged app
- [14-cutover-runbook.md](14-cutover-runbook.md) — natural place to land the
  "re-enable `gatus:` on cutover" step if that's the chosen fix
