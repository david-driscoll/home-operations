# 13 — Stage the SGC apps in equestria

Piece **L** of [vault#84](https://github.com/david-driscoll/vault/issues/84). See the
[README](README.md) for the full decision ledger and sequencing. This file is standalone —
read it without the issue.

## Scope

Four apps move from `stargate-command-cluster` into `equestria-cluster`: **chrony**, **mosquitto**,
**tsidp**, **home-assistant**. `authentik` is *not* one of them — it goes to alpha-site under
[07](07-authentik-to-alpha-site.md). This file defines how each app's manifests land in
equestria's Flux tree and what "staged" means before [14](14-cutover-runbook.md) cuts traffic
over. Depends on [09](09-mqtt-ntp-renumber-ip-audit.md) (LB addresses) and
[12](12-longhorn-critical-tier.md) (storage tier); feeds [14](14-cutover-runbook.md) and
[15](15-migrate-apps.md).

## Status as of 2026-08-13 — read this before doing anything

**Three of the four apps are no longer "to be staged." They are already live on equestria,
unstaged, migrated outside this plan.** Verified directly against both clusters and both git
repos this session:

| App | git (stargate-command-cluster) | git (equestria-cluster) | Live on SGC (`admin@sgc`) | Live on equestria (`admin@equestria`) |
|---|---|---|---|---|
| chrony | deleted, `bddf20ac8` → `fae9ca66a` | added, `2e030d161` | gone (no Pod/PVC/Volume) | Running, `stargate-command` ns, replicas: 1 |
| mosquitto | deleted, `bddf20ac8` → `fae9ca66a` | added, `2e030d161` | gone | Running, `stargate-command` ns, replicas: 2 |
| home-assistant | deleted, `d6b36427a` → `fae9ca66a` | added, `def57cc1a`…`16da17896` | gone | Running, `stargate-command` ns, replicas: 1 |
| tsidp | untouched | not present | **still live**, `tailscale-system` ns | **not staged** |

The equestria-side commits (`2e030d161` "moving chrony, matter and mosquitto for the move",
`def57cc1a` "migrating home-assistant") land at the same minute as the matching SGC-side deletion
commits — `git log --format="%h %ad %s" --date=iso` on both repos shows `2026-08-12 20:36:57
-0400` (equestria) against `2026-08-12 20:36:48 -0400` (SGC), and `21:07:24` against `21:07:12`
for home-assistant. **This was a single fast, paired cut — remove from SGC, add to equestria, no
`replicas: 0` staging step, no [14](14-cutover-runbook.md)-shaped runbook, because neither this
file nor that one existed yet.** `matter` (a home-assistant companion app, not one of the four in
scope here — see [README](README.md)) moved in the same sweep.

This file's job changes accordingly. For chrony/mosquitto/home-assistant it is now a
**verification checklist against what already happened**, plus the cleanup items that sweep
missed. For tsidp — the one app not yet touched — it is the actual staging spec to execute.

**Do not treat the already-done three as "safe, skip ahead."** Read the
[live incident](#live-incident-the-volsync-restore-component-is-still-attached-to-home-assistant)
below — there is a recurrence of the vault#120 pattern sitting live in git right now, primed to
fire on the next successful reconcile — and see
[14's retroactive audit](14-cutover-runbook.md#retroactive-audit-chrony-mosquitto-home-assistant)
for exactly which steps of a proper cutover that sweep skipped.

**What the sweep also missed: SGC still carries live `ExternalSecret`s for apps that already
left.** Both clusters already run an identically-named `ClusterSecretStore/openbao`
(`Ready: True` on both, verified live 2026-08-13), so an `ExternalSecret`'s
`secretStoreRef: {name: openbao}` needs no edit purely because an app changes cluster — that
part of the OpenBao migration is a non-issue here. What *is* live and unaddressed: SGC's
`sgc` namespace still has `home-assistant-credentials`, `media-management-credentials`,
`truenas-credentials` and `unifi-credentials` `ExternalSecret`s syncing successfully against
`openbao` today, for an app (`home-assistant`) that no longer runs there. They're harmless —
OpenBao doesn't care who reads a path — but they're exactly the kind of "still authenticates,
so it looks healthy" leftover this estate has been bitten by before (the OpenBao migration's
own retrospective lists reading a stale-but-live credential as indistinguishable from a
healthy one as a recurring failure class). Don't port them to equestria's tree — they're
decommission debris, not a migration source; [22](22-decommission-sgc.md) is where they get
deleted, once SGC's Flux tree is retired rather than reconciling. Leave a pointer here so
whoever executes this file doesn't mistake their presence for "home-assistant's secrets
still need staging."

## What "staged" means here

**Staged is a replica count, not a Flux suspension.** The Kustomization must actively reconcile —
that is what makes `components/volsync-restore` run the bootstrap restore, binds the PVC, creates
the `ExternalSecret` and the LoadBalancer `Service` (reserving its new IP) — but the workload's
`replicas:` is pinned to `0` so no pod starts and nothing serves traffic or writes to the shared
restic repo. Setting `spec.suspend: true` on the Kustomization is the wrong tool: it also stops
the restore from running, so the app would sit with an unbound PVC and nothing to verify before
cutover. Exit criterion for this file, per app: **the Kustomization is `Ready: True` and the
workload shows `0/0` — reconciled, not suspended, replicas zero.**

[14](14-cutover-runbook.md) is what flips `replicas: 0 → 1` (or removes the override) at cutover.

## Component wiring: the volsync / volsync-restore split, and where vault#120 already bit twice

Both repos this plan touches carry the fixed, split shape —
`components/volsync` (`ExternalSecret` + nightly `ReplicationSource` + `PersistentVolumeClaim`,
steady state only) and `components/volsync-restore` (`ReplicationDestination`, added only for a
first deploy, removed once the restore is confirmed). `home-operations` itself carried the
bundled shape (both in one component) until vault#120; that landed in commit `f53f766c` and is
confirmed fixed as of today — `kubernetes/components/volsync/kustomization.yaml` there lists only
`externalsecret.yaml`, `replicationsource.yaml`, `pvc.yaml`. All three repos are consistent now.

The `pvc.yaml` in `components/volsync` sets `dataSourceRef: ReplicationDestination/${APP}-dst`.
That field is only consulted when the PVC is first created — once `Bound` it is immutable and
inert, so `volsync-restore` does not need to stay attached for the app's lifetime. The procedure
(from `equestria-cluster`'s `components/volsync/AGENTS.md`, itself written after the **2026-07
Longhorn storage incident**):

1. On first deploy, list **both** `../../../components/volsync` and
   `../../../components/volsync-restore` in the app's `ks.yaml` `components:`.
2. Let it reconcile. With no snapshots yet this is a successful no-op that initializes the restic
   repo and binds an empty volume; with a snapshot to restore, the data lands.
3. **Remove `volsync-restore` from the `components:` list** once the restore is confirmed
   (`ReplicationDestination` status shows `lastSyncTime` set, or a later steady-state
   `ReplicationSource` sync has already run — either proves the PVC is bound and populated).

Skipping step 3 is exactly the vault#120 mechanism: the nightly `volsync-restore-cleanup`
CronJob (`30 3 * * *`, `kubernetes/apps/volsync-system/restore-cleanup`) deletes the
`ReplicationDestination` once its `restore-once` trigger has fired, and Flux — because the
component is still listed in git — recreates it on the very next reconcile. The recreate holds
open a full `${APP}-dst-dest` + `${APP}-dst-cache` PVC pair (8Gi cache by default unless
`VOLSYNC_CACHE_CAPACITY` is pinned — the RD default is 8Gi against the RS's 2Gi, asymmetric on
purpose per the component's `AGENTS.md`, easy to miss) indefinitely, and the delete-then-recreate
fight is the actual **2026-07 incident mechanism** on `dynacat`, not a cosmetic annoyance.

### Live incident: the volsync-restore component is still attached to home-assistant

**As of 2026-08-13**, `kubernetes/apps/stargate-command/home-assistant/ks.yaml` in
`equestria-cluster` still lists:

```yaml
  components:
    - ../../../components/failover/fast-node-eviction
    - ../../../components/volsync
    - ../../../components/volsync-restore   # <- step 3 was never done
```

The restore is confirmed done: `ReplicationSource/home-assistant` in the `stargate-command`
namespace shows a **steady-state** sync completed at `2026-08-13T02:04:31Z` — that only happens
against a bound, populated PVC. There is currently no `ReplicationDestination` object live
(`admin@equestria` shows none in `stargate-command`) — the `restore-cleanup` CronJob has already
reaped it at least once (a `restore-cleanup-*` Job completed 56 minutes before this check). **The
fight has not started yet only because nothing has forced a reconcile since the cleanup ran.**
The next successful reconcile of `home-assistant`'s Kustomization will recreate the RD and its
mover-PVC pair — `${VOLSYNC_CAPACITY:=40Gi}` for the destination plus the unpinned
`${VOLSYNC_CACHE_CAPACITY:=8Gi}` default, **48Gi held open for a restore that already
happened** (dynacat's equivalent, per vault#120, was 13Gi: a 5Gi destination + the same 8Gi
unpinned cache default) — and the incident repeats nightly from there.

**Action for this file: remove `../../../components/volsync-restore` from
`kubernetes/apps/stargate-command/home-assistant/ks.yaml`'s `components:` list now,** before any
other work touches this app. `matter` (the companion app moved in the same sweep) carries the
same component and needs the same fix, though it is out of this file's four-app scope — flag it
to whoever owns cleanup of the wider sweep.

This removal is currently **blocked from taking effect**: `home-assistant`'s Kustomization
reads `Ready: False — dependency 'volsync-system/volsync' is not ready` right now, because
`nfs-system/csi-driver-nfs`'s Kustomization is failing its own reconcile —
`post build failed for 'StorageClass.v1.storage.k8s.io/nfs-csi': envsubst error: variable
substitution failed: variable not set (strict mode): "SPIKE_IP"` (first observed 2026-08-13,
~2 hours old at time of writing). The VolSync controller pod itself is healthy and running (8
days up) — this is a dependency-chain health-check gate, not an outage — but it means the
`components:` edit above sits inert until `SPIKE_IP` resolves. That variable is defined in
`kubernetes/flux/meta/shared-secrets.sops.yaml`; chasing why it isn't substituting is
[01](01-stabilise.md) territory (or [06](06-age-key-consolidation.md), if it's a decryption-key
mismatch) — not re-litigated here, just named as a live blocker on this file's exit criterion.

## Recovering the deleted SGC manifests

`stargate-command-cluster`'s `main` HEAD no longer has `kubernetes/apps/sgc/home/` — it was
deleted across `bddf20ac8` (disabled `chrony`/`matter`/`mosquitto`), `d6b36427a` (deleted
`home-assistant`, `matter`, `oxycloud`, and the rest of the group), and `fae9ca66a` (dropped the
`./home` line from the parent `kubernetes/apps/sgc/kustomization.yaml`). The last commit with the
full, intact manifests is **`d6481eac1`** (`mise: resolve env with vals instead of op:// literals
(#1815)`, the commit immediately before the disable started). Anyone needing the original SGC
shape for reference — for `tsidp`, or to double check what equestria's copies diverged from —
pulls it from there:

```console
git -C stargate-command-cluster show d6481eac1:kubernetes/apps/sgc/home/chrony/helmrelease.yaml
git -C stargate-command-cluster checkout d6481eac1 -- kubernetes/apps/sgc/home   # scratch checkout, don't commit
```

`tsidp` was never touched by the delete sweep — its source is still live at
`stargate-command-cluster:kubernetes/apps/tailscale-system/idp/` on `main`, no archaeology needed.

## Per-app staging

### chrony — done, verify only

Stateless: an NTP daemon reading a `ConfigMap` (`kubernetes/apps/stargate-command/chrony/chrony.conf`
in equestria-cluster), no PVC, no VolSync. Live in equestria as a `StatefulSet`, `replicas: 1`,
Service `type: LoadBalancer` pinned via `io.cilium/lb-ipam-ips: "${CHRONY_VIP}"` — resolves live
(`admin@equestria`, `stargate-command` namespace) to **`10.10.206.204`**, the renumbered address
(was `10.10.209.204`) recorded by [09](09-mqtt-ntp-renumber-ip-audit.md). Falls inside the
existing `CiliumLoadBalancerIPPool/pool` block `${LOADBALANCER_RANGE}.202-.252`
(`kubernetes/apps/kube-system/cilium/networks.yaml`) — no pool edit was needed, matching D7 ("no
`.209` block is added to equestria's LB pool").

Verify: `kubectl get statefulset,svc -n stargate-command chrony` shows `1/1` and
`EXTERNAL-IP 10.10.206.204`.

### mosquitto — done, verify only

Two `StatefulSet` PVCs (`data-mosquitto-0`, `data-mosquitto-1`, `4Gi` each, plain `longhorn`
StorageClass — matches the original SGC sizing exactly), no VolSync component (retained MQTT
messages were never backed up in SGC either — same shape, not a regression). `replicas: 2`,
Service `type: LoadBalancer` externalIP **`10.10.206.203`** (was `10.10.209.203`), also inside the
existing pool block. `users.sops.yaml` was carried over and its `sops.age` recipient is
`age1eurl2t7…` — equestria's key, so it decrypts correctly in equestria's tree; note this is a
**single-recipient** encryption where the repo's own `.sops.yaml` `creation_rules` for
`kubernetes/.*\.sops\.ya?ml` calls for three recipients — it works today, but the next
`sops updatekeys` on that file will change its header. Not a blocker, just a paper cut for
whoever runs key hygiene next.

Verify: `kubectl get statefulset,svc,pvc -n stargate-command mosquitto` shows `2/2` and
`EXTERNAL-IP 10.10.206.203`.

### home-assistant — done, but finish the cleanup above first

`Deployment`, `replicas: 1`, single `40Gi` RWO `longhorn` PVC (matches the original SGC size —
no truncation), `components/volsync` steady-state cycle already running (see incident above),
Tailscale ingress via `components/tailscale` (`TAILSCALE_HOST: home`). `mosquitto` is a
`dependsOn` for `home-assistant`'s Kustomization — correct, MQTT must be up before HA starts.
Restic repo is `/repository/home-assistant` — global, keyed by app name only, shared with
whatever SGC wrote to it historically (see the two-writers trap in
[14](14-cutover-runbook.md#trap-two-writers-one-restic-repo)); since SGC's copy and its
`ReplicationSource` are gone, there is no live double-writer today, but it is why the
[SGC deletion order matters](14-cutover-runbook.md) for any future app that follows this
pattern.

**Before calling this app done:** remove `volsync-restore` from its `ks.yaml` (see above), confirm
the removal actually reconciled (blocked today on the `SPIKE_IP` chain — recheck after that
clears), and confirm no `*-dst-dest`/`*-dst-cache` PVC pair is present:
`kubectl get pvc -n stargate-command | grep home-assistant-dst`.

### tsidp — not started, stage it

The one app this file actually needs to execute. Source is intact at
`stargate-command-cluster:kubernetes/apps/tailscale-system/idp/` (`tsidp.yaml`, `ks.yaml`,
`kustomization.yaml`, `definition.yaml`) — no recovery needed, copy directly. `5Gi` RWO PVC
(component default, `${VOLSYNC_CAPACITY:=5Gi}` — matches the discovery catalog's "tsidp | 5Gi,
volsync"), `Deployment`, `replicas: 1` today.

Target layout in `equestria-cluster`:

```
kubernetes/apps/tailscale-system/idp/
├── ks.yaml
├── kustomization.yaml
├── tsidp.yaml
└── definition.yaml
```

Steps:

1. Copy the four files verbatim from `stargate-command-cluster`'s `main`. `definition.yaml`'s
   `$schema` line points at
   `github.com/david-driscoll/stargate-command-cluster/.../definition.schema.json` — leave it;
   equestria's own `golink/definition.yaml` uses the identical cross-repo schema URL today, so
   this is the estate's actual convention, not an oversight to fix.
2. In `tsidp.yaml`, change the controller's `replicas: 1` to **`replicas: 0`** — this is the
   staging gate; [14](14-cutover-runbook.md) flips it back.
3. In `ks.yaml`, add the `components:` list (the copied file has none — SGC's copy pre-dates the
   convention on this particular app):
   ```yaml
   components:
     - ../../../components/failover/fast-node-eviction
     - ../../../components/volsync
     - ../../../components/volsync-restore
   postBuild:
     substitute:
       APP: *app
       NAMESPACE: *namespace
       VOLSYNC_PUID: "1000"
       VOLSYNC_PGID: "1000"
       VOLSYNC_STORAGECLASS: longhorn-critical   # requires 12 to have landed; see below
   ```
   Keep the existing `dependsOn: [tailscale-operator, volsync-system/volsync]`.
4. Wire it in: add `- ./idp/ks.yaml` to
   `kubernetes/apps/tailscale-system/kustomization.yaml`'s `resources:` (alongside
   `operator/ks.yaml`, `services/ks.yaml`, `resources/ks.yaml`, `golink/ks.yaml`).
5. No new secret work — equestria's `tailscale-system` namespace already has its own
   `tailscale-authkey` `Secret` (reflected independently since 2026-06-04, verified live on both
   clusters), which is what `tsidp.yaml`'s `TS_AUTHKEY` env references. `definition.yaml`'s
   `authentik.proxy` block still points SSO at the in-cluster outpost — fine for staging; revisit
   once [07](07-authentik-to-alpha-site.md) lands, since outposts stay in-cluster per D4.
6. Let it reconcile. First pass: `volsync-restore` creates `tsidp-dst`, restores from
   `/repository/tsidp` (SGC's copy is still live and syncing today, so this restore is against a
   *current* snapshot, not a stale one — better position than the retroactive three above).
   Confirm `ReplicationDestination/tsidp-dst` shows a completed sync, confirm `pvc/tsidp` is
   `Bound`.
7. **Remove `volsync-restore` from `ks.yaml`'s `components:`** once step 6 is confirmed — do not
   repeat the home-assistant gap on the very next app.

Exit for tsidp, and for this file overall: `kubectl get kustomization -n tailscale-system tsidp`
shows `Ready: True`; `kubectl get deploy -n tailscale-system tsidp` shows `0/0` (reconciled,
replicas pinned to zero); `pvc/tsidp` `Bound` on (ideally) `longhorn-critical`.

## Storage tier: longhorn-critical (12) is not live yet

**As of 2026-08-13**, `equestria`'s `StorageClass` list is `longhorn` (default), `longhorn-cache`,
`longhorn-local`, `longhorn-snapshot`, `openebs-hostpath` — **no `longhorn-critical`**. All three
already-migrated PVCs (`home-assistant` 40Gi, `data-mosquitto-0/1` 4Gi×2) sit on plain `longhorn`,
not the critical tier this file was supposed to target, because they moved before
[12](12-longhorn-critical-tier.md) existed. `tsidp`'s `ks.yaml` above pins
`VOLSYNC_STORAGECLASS: longhorn-critical` on the assumption 12 lands first; **if it hasn't, drop
that line (falls back to the component's `longhorn` default) and retag later.**

Retagging later is not a one-line edit: `storageClassName` is immutable on a `Bound` PVC, and
`components/volsync`'s `kustomization.yaml` stamps `kustomize.toolkit.fluxcd.io/force: enabled`
on everything it manages — changing an immutable field there makes Flux **delete and recreate**
the PVC, which destroys the data (`AGENTS.md`, both cluster repos, are explicit that
`VOLSYNC_CAPACITY` expansion is safe and storage-class changes are not). Moving these three PVCs
onto `longhorn-critical` after the fact means: force a fresh `ReplicationSource` sync, then a
scale-to-0 + PVC delete + `volsync-restore` restore onto the new class — the exact same
choreography as [14](14-cutover-runbook.md), run again, against equestria itself. Track that as a
follow-up item once 12 ships; it is not blocking for tsidp's first-time creation (which never
touches an existing PVC).

## Exit criteria

- [ ] `tsidp` staged per above: Kustomization `Ready: True`, workload `0/0`, PVC `Bound`.
- [ ] `volsync-restore` removed from `home-assistant`'s `ks.yaml` (and ideally `matter`'s, though
      out of scope) and confirmed reconciled — no `*-dst-*` PVC pair recreated after a full
      cleanup-cron cycle.
- [ ] `SPIKE_IP` / `nfs-system/csi-driver-nfs` failure cleared, so the above can actually
      reconcile (tracked in [01](01-stabilise.md), not owned here).
- [ ] chrony, mosquitto confirmed on their recorded LB pins (`10.10.206.204`, `10.10.206.203`)
      and healthy.
- [ ] `longhorn-critical` tracked as a follow-up retag for the three already-migrated PVCs once
      [12](12-longhorn-critical-tier.md) lands.

## See also

- [09-mqtt-ntp-renumber-ip-audit.md](09-mqtt-ntp-renumber-ip-audit.md) — the LB address decisions
  this file records as already-live.
- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — the storage tier this file's
  apps should end up on.
- [14-cutover-runbook.md](14-cutover-runbook.md) — flips `replicas: 0 → 1`, cuts DNS/LB, and is
  the checklist the fast paired cut on 2026-08-12 should have followed.
- [15-migrate-apps.md](15-migrate-apps.md) — executes 14 per app, in order.
