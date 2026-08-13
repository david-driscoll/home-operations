# 14 — Per-app cutover runbook

Piece **M** of [vault#84](https://github.com/david-driscoll/vault/issues/84). See the
[README](README.md) for the full decision ledger and sequencing. This file is standalone —
read it without the issue.

## Purpose

This is the procedure [15](15-migrate-apps.md) follows, once per app, to cut chrony, mosquitto,
tsidp and home-assistant over from `stargate-command-cluster` to `equestria-cluster`, after
[13](13-stage-sgc-apps.md) has each app staged (`replicas: 0`, reconciled, PVC bound where
applicable). Traps are called out **inline**, at the step that bites, not collected at the end —
follow the steps in order and you will hit the warning immediately before you need it.

**As of 2026-08-13, three of the four apps (chrony, mosquitto, home-assistant) were already cut
over — fast, paired, outside this procedure — before this file existed.** See
[13's status section](13-stage-sgc-apps.md#status-as-of-2026-08-13--read-this-before-doing-anything)
for the evidence. This file is written two ways at once: it is the runbook `tsidp` (the one
app still pending) should actually follow, and it is a retroactive checklist against what already
happened to the other three, so gaps get closed rather than repeated. Each step below says which
mode it's in.

## Preconditions — check these before starting *any* app

- **PITR is available but unrehearsed, not broken.** [01](01-stabilise.md) re-verified live on
  2026-08-13 that WAL archiving and base backups are genuinely working on both CNPG clusters
  (`ContinuousArchiving: True`, `LastBackupSucceeded: True`, ten consecutive completed daily
  backups 2026-08-03→2026-08-12 on both equestria and sgc) — correcting the July text's flat "no
  PITR anywhere" claim, which was still true when [vault#119](https://github.com/david-driscoll/vault/issues/119)
  was filed but is now out of date. **The restore path has never been exercised**, so treat it as
  unproven rather than absent: the operative rollback mechanism for this runbook is still the
  nightly `pg_dump`, because nobody has verified a WAL-based restore actually completes. Only
  `authentik` in this app set touches CNPG, and authentik is out of scope here
  ([07](07-authentik-to-alpha-site.md) handles it) — but if a future app added to this rotation has
  a database, confirm and verify its nightly dump (and, ideally, a real PITR restore) *before*
  touching anything.
- **Do not interleave with the CNPG 17→18 upgrade**
  ([vault#114](https://github.com/david-driscoll/vault/issues/114), open as of 2026-08-13).
  Run cutovers and the CNPG major-version upgrade in separate maintenance windows. Combining
  storage-layer and app-layer changes is how you lose the ability to tell which change caused a
  given symptom.
- **Do not suspend a Flux Kustomization mid-upgrade.** The `windmill`/`romm` precedent (shared
  CNPG postgres, object-ownership drift from a suspend-mid-migration) is why: a suspended
  Kustomization stops reconciling but does not stop an in-flight Helm upgrade or a running pod,
  so state and git drift apart silently. If a step below needs to pause reconciliation, prefer
  `replicas: 0` (a real, git-committed, converged state) over `flux suspend`.
- Confirm you are not mid-drain on the node either app's pod or PVC lives on
  ([10-drain-safety.md](10-drain-safety.md)).

## The manual trigger mechanism

VolSync's `ReplicationSource` and `ReplicationDestination` both support
`spec.trigger.manual: <string>`. Set it to any value different from the object's current
`status.lastManualSync` and the controller runs one sync immediately, independent of
`spec.trigger.schedule`; when it completes, `status.lastManualSync` is set to match what you
wrote. This is the estate's own mechanism, not invented for this file — `components/volsync-restore`'s
`replicationdestination.yaml` already sets `trigger.manual: restore-once`, and the
`restore-cleanup` CronJob's cleanup logic (`kubernetes/apps/volsync-system/restore-cleanup`)
polls exactly this pair of fields (`spec.trigger.manual == status.lastManualSync`) to decide a
restore has finished. Verified live: `kubectl get replicationdestinations.volsync.backube -A -o
custom-columns='NS:.metadata.namespace,NAME:.metadata.name,TRIGGER:.spec.trigger.manual,SYNCED:.status.lastManualSync'`
is the actual query that CronJob runs today.

For a **final source-side sync** (step 2 below), the invocation is:

```console
kubectl patch replicationsource <app> -n <namespace> --type merge \
  -p "{\"spec\":{\"trigger\":{\"manual\":\"cutover-$(date +%s)\"}}}"

# poll until it completes
kubectl get replicationsource <app> -n <namespace> \
  -o jsonpath='{.spec.trigger.manual} {.status.lastManualSync}{"\n"}'
# wait until the two values printed are equal
```

Use a value that can't collide with a prior run — `cutover-<unix-timestamp>` is enough entropy
for a one-off. Don't reuse `restore-once`; that string is `volsync-restore`'s convention and
reusing it would confuse the cleanup CronJob's classification of the object.

## Per-app sequence

```mermaid
sequenceDiagram
    participant SGC as SGC ReplicationSource
    participant Repo as shared restic repo<br/>/repository/&lt;app&gt;
    participant EQ as equestria ReplicationDestination/Source
    participant App as equestria workload

    Note over SGC,App: App still live on SGC (replicas > 0)
    SGC->>SGC: 1. scale SGC workload to 0
    SGC->>Repo: 2. force final ReplicationSource sync (manual trigger)
    Note over Repo: last snapshot now reflects the scaled-down, quiesced state
    SGC->>SGC: 3. suspend/delete SGC ReplicationSource FIRST
    Note over SGC,EQ: only now is there a single writer to the repo
    EQ->>Repo: 4. unsuspend equestria app (replicas 0→1), volsync-restore reads latest snapshot
    Repo->>EQ: restore into new PVC
    EQ->>App: 5. verify data (app-specific check)
    App->>App: 6. cut DNS / LB pin to equestria's address
    Note over SGC: 7. leave SGC copy scaled to 0 — do NOT delete
```

1. **Scale the SGC workload to 0.** `kubectl scale statefulset/deployment <app> -n <ns>
   --replicas=0` on `admin@sgc`, or commit the equivalent in `stargate-command-cluster`'s git —
   prefer the git commit so the state is reproducible and doesn't drift back on the next
   reconcile (a live `kubectl scale` against a `Ready` Kustomization gets overwritten on the next
   sync unless the source itself says `0`).

2. **Force a final `ReplicationSource` sync** using the manual-trigger mechanism above, against
   the *SGC-side* `ReplicationSource`. Wait for `status.lastManualSync` to match before
   continuing — do not proceed on a scheduled sync that happened to run recently; a scheduled
   sync ran against the app *before* it was quiesced in step 1, a manual one runs against it
   *after*, and that difference is the entire point of this step.

3. <a name="trap-two-writers-one-restic-repo"></a>**Suspend or delete the SGC `ReplicationSource`
   before doing anything on the equestria side.** The restic repository is global and keyed only
   by app name — `RESTIC_REPOSITORY: "/repository/${APP}"` is byte-identical in both repos'
   `components/volsync/externalsecret.yaml`, and both clusters' `nfs-csi` StorageClasses point at
   the same `10.10.10.10:/mnt/stash/backup/volsync` export. If both sides' `ReplicationSource`
   objects are live at once — even briefly — you have two writers racing into one restic repo.
   Restic tolerates concurrent writers badly: interleaved snapshots, index corruption risk, and a
   confusing "which snapshot is authoritative" question exactly when you need the answer to be
   unambiguous. **Order matters: suspend SGC's `ReplicationSource` before you unsuspend
   equestria's anything**, not "roughly around the same time."

4. **Unsuspend the equestria app** — flip `replicas: 0 → 1` (or remove the override) in
   `equestria-cluster` git and let it reconcile.

   <a name="trap-datasourceref-fires-once"></a>**Trap: `dataSourceRef` populates a PVC once, at
   creation — it does not refresh on a later snapshot.** If [13](13-stage-sgc-apps.md)'s staging
   already created and bound the app's real PVC (which is what `volsync-restore` being part of
   staging causes — the `ReplicationDestination`'s static `trigger.manual: restore-once` fires as
   soon as the object exists, it does not wait for cutover), then that PVC is already populated
   from *whatever snapshot existed at staging time*, and step 2's freshly-forced final sync does
   **not** flow into it — `dataSourceRef` is only consulted once, when the PVC transitions from
   nonexistent to `Bound`, and Kubernetes' populator does not re-run against a `Bound` PVC.
   Practically: keep the gap between [13](13-stage-sgc-apps.md)'s staging and this step short (the
   sequencing in [15](15-migrate-apps.md) chains them back-to-back for exactly this reason), so
   whatever staging restored is close enough to current that step 2's forced sync is
   belt-and-suspenders, not the only thing standing between you and stale data. If the gap was
   long enough that this matters, there is no clean re-refresh short of the trap below — plan the
   sequencing to avoid needing one.

   <a name="trap-restore-pvc-immutable"></a>**Trap: the restore PVC's `dataSourceRef` is
   immutable, and deleting a VolSync-backed `StatefulSet` PVC permanently breaks its Flux
   Kustomization.** `components/volsync/pvc.yaml` sets `dataSourceRef: ReplicationDestination/${APP}-dst`
   only for the PVC's *creation* — if something goes wrong here, the instinct to "delete the PVC
   and let it recreate" does not work: `kustomize.toolkit.fluxcd.io/force: enabled` is stamped on
   everything in the volsync components, and Flux *will* delete-and-recreate an object whose
   immutable field changed, but that destroys whatever was there. The known-good fix, matching
   the AdGuard VolSync re-bootstrap incident precedent, is **scale-to-0 on the StatefulSet plus
   backup cleanup** (remove the stuck `ReplicationDestination`/mover PVCs by hand if the
   `restore-cleanup` CronJob hasn't caught them yet), not deleting the app's own PVC. This applies
   directly to `mosquitto` (`StatefulSet`, 2 PVCs) and `chrony` (`StatefulSet`, though it carries
   no PVC) if either needs to be re-run.

5. **Verify data** before touching DNS or the LB pin. App-specific:
   - **chrony**: no data to verify — confirm the daemon is serving correct time
     (`chronyc tracking` against the new address, or any client that queries NTP).
   - **mosquitto**: confirm broker connectivity and that `users.sops.yaml`'s accounts authenticate
     (retained-message history is not backed up in this estate today — same shape on both sides,
     not a regression to chase).
   - **tsidp**: confirm the OIDC discovery endpoint responds
     (`https://idp.<tailnet-domain>/.well-known/openid-configuration`, the same check
     `definition.yaml`'s `gatus` block already encodes) and that a known client can complete a
     login.
   - **home-assistant**: confirm the UI loads, confirm the automation/history data present
     matches expectations for the last-known-good sync timestamp (see below for what "matches
     expectations" means when the source was already gone before a final sync could run), confirm
     MQTT integration re-connects to the (already cut over) `mosquitto`.

6. **Cut DNS / the LB pin.** For chrony and mosquitto this *is* the LB pin — the Service's
   `io.cilium/lb-ipam-ips` annotation is the whole cutover, since the renumbered address
   (`10.10.206.204` / `10.10.206.203`, decided in [09](09-mqtt-ntp-renumber-ip-audit.md)) only
   exists on the equestria side; there is no separate DNS record pointing at the old `.209.x`
   address to flip. For tsidp and home-assistant, cutover is the Tailscale ingress claiming the
   hostname (`idp`, `home`) on equestria's tailnet identity — verify the old SGC-side Tailscale
   node for the same hostname is gone or renamed so there's no ambiguous two-node claim on one
   MagicDNS name.

7. **Leave the SGC copy scaled to 0. Do not delete it.** This is the rollback path for the
   soak window in [16](16-soak-and-gate.md) — if equestria's copy misbehaves, scaling SGC's
   `replicas` back up (after re-suspending equestria's `ReplicationSource` first, same ordering
   rule as step 3, reversed) is faster and safer than restoring from backup again. SGC's copy
   only gets fully removed in [22-decommission-sgc.md](22-decommission-sgc.md), well after the
   soak gate.

## Retroactive audit: chrony, mosquitto, home-assistant

**As of 2026-08-13**, these three skipped this procedure — see
[13's status section](13-stage-sgc-apps.md#status-as-of-2026-08-13--read-this-before-doing-anything)
for the paired-commit evidence. Grading the actual sequence against the seven steps above:

| Step | What the procedure asks | What actually happened |
|---|---|---|
| 1. Scale SGC to 0 | commit-driven scale-down first | skipped — went straight from live to deleted |
| 2. Final manual sync | force a sync *after* quiescing | not possible to confirm — the `ReplicationSource` objects are gone; the last sync each app has is whatever its `0 14 * * *` schedule last ran, **up to ~11 hours before deletion** (deletion commits land `20:36`–`21:07 EDT` on 2026-08-12; the sibling apps that share the same schedule — `registry`, `technitium`, `authentik`, `tsiam`, `tsidp` — all show `Last sync` around `14:03`–`14:15 UTC` that day, i.e. `10:03`–`10:15 EDT`) |
| 3. Suspend source first | ordering discipline | moot — SGC's `ReplicationSource` objects for these three don't exist anymore, deleted along with everything else |
| 4. Unsuspend equestria | restore from the repo | happened, successfully — PVCs are `Bound` at the original sizes (40Gi home-assistant, 4Gi×2 mosquitto) |
| 5. Verify data | app-specific check | not documented anywhere; pods are `Running` and stayed running for 3+ hours, which is *some* evidence of health but not a substitute for an explicit check |
| 6. Cut DNS/LB | renumber | done — live LB IPs confirmed `10.10.206.204` (chrony), `10.10.206.203` (mosquitto) |
| 7. Leave SGC at 0 | keep the rollback path | **not followed — SGC's copies were fully deleted**, not scaled to 0. There is no rollback path for these three if equestria's copies turn out to be wrong. |

**Net risk carried forward: bounded, not open-ended.** The worst-case data-loss window is the gap
between each app's last scheduled `ReplicationSource` sync (~10:00–10:15 EDT on 2026-08-12,
inferred from sibling apps' identical cron schedule, since the objects themselves are gone) and
whenever each app actually stopped taking writes (some time before the `20:36`/`21:07 EDT`
deletion commits — the apps were presumably not receiving meaningful traffic in that gap either,
given deletion was imminent). Call it **under 24 hours of MQTT retained-state and Home Assistant
automation-history churn**, consistent with the no-PITR posture already accepted everywhere else
in this estate. This is a fact to record, not an incident to escalate — but it is exactly why
step 7 (never delete the source) exists, and exactly why this table is worth keeping: the next
time someone is tempted to move fast on an app not yet through this file, point at it.

**Remaining action items from the audit**, tracked here rather than re-opened as new plan pieces:

- Do step 5 (verify data) explicitly and record it for these three, even after the fact — at
  minimum, confirm home-assistant's entity history looks continuous across the cutover boundary
  and mosquitto's configured users can authenticate.
- [13](13-stage-sgc-apps.md) already tracks the `volsync-restore` component removal for
  home-assistant and the `longhorn-critical` retag as open follow-ups — this file doesn't
  duplicate them, just points there.

## tsidp — the actual runbook to execute

The one app still in the "to do" state. Preconditions: [13](13-stage-sgc-apps.md)'s staging steps
complete (Kustomization `Ready: True`, `replicas: 0`, `volsync-restore` present and its first
restore already confirmed and then *removed* from `components:` per that file's step 7).

1. `kubectl scale deployment/tsidp -n tailscale-system --replicas=0` on `admin@sgc`, or commit
   the equivalent — SGC's `tsidp` is still live today, so this is a real step here (unlike the
   other three, where it's moot).
2. Force a final manual sync on `admin@sgc`:
   `kubectl patch replicationsource tsidp -n tailscale-system --type merge -p '{"spec":{"trigger":{"manual":"cutover-'"$(date +%s)"'"}}}'`,
   poll `status.lastManualSync` until it matches.
3. Suspend or delete SGC's `ReplicationSource/tsidp` **before** touching equestria's side (the
   two-writers trap above applies here exactly as written — `/repository/tsidp` is the shared
   repo key).
4. In `equestria-cluster`, flip `tsidp.yaml`'s `replicas: 0 → 1`. Let it reconcile. Whether this
   step actually picks up step 2's fresh snapshot depends on the
   [`dataSourceRef` trap](#trap-datasourceref-fires-once) above — if [13](13-stage-sgc-apps.md)'s
   staging happened shortly before this, the difference is negligible; if it happened long
   before, the PVC is already populated from staging time and step 2's sync bought nothing.
5. Verify: OIDC discovery endpoint responds, a known client completes a login flow.
6. Cutover is the Tailscale hostname claim — confirm `idp` resolves to equestria's tailnet
   identity and SGC's old node for the same name is gone from MagicDNS.
7. Scale SGC's `tsidp` to 0 (already done in step 1) and **leave it there** — do not delete the
   Deployment or its PVC from `stargate-command-cluster` git. Decommissioned fully only in
   [22](22-decommission-sgc.md).

## Rollback / abort criteria

Abort and roll back to the SGC copy (scale it back up, re-suspend equestria's `ReplicationSource`
first) if, after step 5's verification:

- The app fails to start against the restored data, or starts but is visibly missing expected
  state (MQTT users, HA entities, tsidp client registrations).
- The `ReplicationDestination`/`ReplicationSource` pair on equestria shows a failed or partial
  sync rather than a clean completion.
- Any CNPG-backed dependency (not applicable to these four today, but relevant if this runbook is
  reused later) shows replication lag or a failed dump verification.

Rolling back after step 7 (SGC already scaled to 0, not deleted) is: re-suspend/delete equestria's
`ReplicationSource` for the app, scale SGC's copy back to its prior replica count, revert the
DNS/LB cut. This is why step 7 says "do not delete" — for tsidp, that discipline is still fully
available; for the three retroactive apps, it no longer is, which is the real cost of the fast cut
documented above.

## Exit criteria

- [ ] tsidp cut over per the seven-step sequence above, SGC copy left at `replicas: 0`.
- [ ] Retroactive verification (step 5) done and recorded for chrony, mosquitto, home-assistant.
- [ ] All four apps' `ReplicationSource` objects live only on equestria (SGC-side sources
      suspended or gone — already true for three of four; complete for tsidp here).
- [ ] No two-writer window occurred for tsidp (confirmed by timestamps: SGC source suspended
      before equestria source unsuspended).

## See also

- [13-stage-sgc-apps.md](13-stage-sgc-apps.md) — the staging step this runbook assumes is already
  done, and the file that owns the `volsync-restore`/`longhorn-critical` follow-ups.
- [15-migrate-apps.md](15-migrate-apps.md) — the phase that executes this runbook, chrony →
  mosquitto → tsidp → home-assistant.
- [16-soak-and-gate.md](16-soak-and-gate.md) — the ≥72h soak this file's "leave SGC at 0" step
  exists to make possible.
- [22-decommission-sgc.md](22-decommission-sgc.md) — where the SGC copies finally get deleted.
