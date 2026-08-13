# 16 — Soak and gate (O)

Piece **O** of [vault#84](https://github.com/david-driscoll/vault/issues/84) · [← plan
index](README.md) · Depends on [15 — Migrate the apps](15-migrate-apps.md) and
[07 — Authentik to alpha-site](07-authentik-to-alpha-site.md) · Feeds
[18 — SGC nodes join the control plane](18-sgc-nodes-join-control-plane.md) · This file is
standalone — read it without the issue.

**What this piece is.** A ≥72-hour soak with everything that used to live on SGC now running
elsewhere — the four apps on equestria ([15](15-migrate-apps.md)), authentik on alpha-site
([07](07-authentik-to-alpha-site.md)) — while SGC itself sits idle but intact, followed by a
written go/no-go checklist. Passing that checklist is what makes wiping SGC's *first* node in
[18](18-sgc-nodes-join-control-plane.md) a safe, reversible step, and what makes wiping the
*second* node — the plan's only genuine point of no return — a defensible one rather than a
guess.

**This piece adapts v2 §6.2's gate to the shape the plan actually has today, not the shape it had
in July.** The original gate assumed five migrating apps including authentik, preserved IPs for
MQTT/NTP, and a uniform VolSync-cycle count across all of them. All three assumptions are wrong
now — authentik goes to alpha-site instead ([07](07-authentik-to-alpha-site.md), D4), MQTT and
NTP renumber ([09](09-mqtt-ntp-renumber-ip-audit.md), D7), and two of the four remaining apps
never touch VolSync at all (below). This file is the corrected version.

## Read this first: the soak has not started

**As of 2026-08-13**, verified against both clusters: the clock cannot honestly be running yet.

- **[15](15-migrate-apps.md)'s exit gate is not green.** Of its four rows: chrony's NTP Service
  has a live protocol defect (UDP/123 not exposed — real `sntp` queries time out); home-assistant's
  MQTT integration is actively broken (stale `mosquitto.sgc.svc.cluster.local` DNS name,
  zero-functioning MQTT entities since the pod started); home-assistant also still carries the
  `volsync-restore` component past its removal point (an armed vault#120 recurrence, currently
  inert only because an unrelated `SPIKE_IP` failure is blocking reconciliation — not evidence
  it's safe); tsidp hasn't been cut over at all. Only mosquitto's row is genuinely clean.
- **[07](07-authentik-to-alpha-site.md) has not executed.** Verified: `docker/alpha-site/`
  in `home-operations` has no authentik stack, only the shared `docker/_common/authentik-outpost`
  config every cluster already uses. Authentik is still fully live on SGC — 4 pods on
  `othalla`/`milky-way`, `7d23h` uptime.
- **Even for the three apps that already moved, elapsed time is nowhere near 72h.** The earliest
  live signal (`mosquitto`'s Service, first `LoadBalancer` condition) is `2026-08-13T00:46:35Z`;
  as of this writing that's roughly 4 hours, not 72.

**What starts the clock:** every row in [15](15-migrate-apps.md)'s exit table reading clean,
*and* [07](07-authentik-to-alpha-site.md)'s definition-of-done items through its cutover step
(§4.6) complete. 07 explicitly defers its own soak duration to "whatever cadence
[16] establishes" — so this file is the one place that actually states the number, and it
applies to authentik too, not just the four apps. **Until then, treat every hour already elapsed
on chrony/mosquitto/home-assistant as pre-soak bring-up time, not credit toward the 72h.**

## Soak duration and what "healthy" means for 72+ hours

**≥72 hours**, continuous, no restarts of any of the five relocated services attributable to the
migration itself (a Renovate-driven image bump or an unrelated node event doesn't reset the
clock; a crash-loop or an OOM does). Longer is fine and, per D6/D-track answers, authentik in
particular should "err toward longer" per 07 — identity being wrong outranks convenience.

### 1. The four apps, corrected per-app criteria

The original gate's "one successful VolSync run for each" doesn't hold uniformly — verified live,
only two of the four apps use VolSync at all:

| App | What actually needs to hold for 72h | VolSync cycles required |
|---|---|---|
| **chrony** | Pod stable; **and, only once [15](15-migrate-apps.md)'s UDP fix lands**, real NTP queries succeed repeatedly against `10.10.206.204` — not just a TCP port-open check (see the monitoring gap below) | n/a — no PVC, nothing to cycle |
| **mosquitto** | Pod stable, MQTT connections accepted on `10.10.206.203` throughout | n/a — no VolSync component exists for this app (retained-message state has no restic backup in this estate, same as it was on SGC; an accepted gap, not a regression, but don't claim VolSync coverage that doesn't exist) |
| **tsidp** | Pod stable, OIDC discovery endpoint green throughout, no re-auth storms | **≥3** successful equestria-side `ReplicationSource` cycles (schedule `0 14 * * *` — 72h covers roughly 3 by construction if the window starts clean) |
| **home-assistant** | Pod stable, **MQTT integration reconnected and staying connected** (not just "pod running" — see [15](15-migrate-apps.md)'s live-outage finding), entity history continuous across the window | **≥3** successful equestria-side `ReplicationSource` cycles |

Do not accept "≥3 VolSync cycles" as satisfied for chrony or mosquitto — there is nothing to
count for either, and treating the absence of a criterion as a pass is worse than stating the gap
plainly.

### 2. Authentik healthy on alpha-site, with a verified restore

Owned by [07](07-authentik-to-alpha-site.md); this piece gates on its definition-of-done, not
re-derives it. The specific item this gate cares about most:

> A **restore into a scratch target that opens and validates** (07 §3.2/§7) — not merely a
> `pg_dump` file existing. Backup-without-a-tested-restore has bitten this estate before
> (`romm`/`windmill` ownership drift on restore) and is exactly what D2/D6's posture is trying to
> avoid repeating for identity specifically.

Also required: every outpost (embedded, proxy, Dockge-proxy) re-registered and reporting healthy
against the alpha-site server for the full window — a flapping outpost during the soak is a
signal, not noise.

### 3. MQTT and NTP answering on their NEW `.206` addresses — build the check before trusting it

**The ledger's original wording said "preserved IPs" — obsolete.** D7/Q-F renumbered both
(`10.10.206.203` MQTT, `10.10.206.204` NTP); this criterion is now "answering on the new
addresses," not "still answering on the old ones."

**Neither check exists today.** Verified: neither `mosquitto/definition.yaml` nor
`chrony/`'s manifests carry a `gatus:` block, confirmed by [09](09-mqtt-ntp-renumber-ip-audit.md)'s
own audit ("Gatus checks: Clean... no mosquitto/chrony... hits"). Building these is a
precondition for this gate item meaning anything, not a nice-to-have alongside it.

**MQTT — straightforward, and there's already a precedent in this estate to copy.**
`equestria-cluster/kubernetes/apps/database/valkey/definition.yaml` carries a commented-out
example of exactly this shape:

```yaml
gatus:
  - group: *category
    url: tcp://mosquitto.stargate-command.svc.cluster.local:1883
    conditions:
      - "[CONNECTED] == true"
```

Verified live this session: `nc -zv 10.10.206.203 1883` succeeds today — so once this check
exists it should go green immediately, giving a real baseline rather than an assumed one.

**NTP — not a simple copy of the same pattern, because of what [15](15-migrate-apps.md) already
found.** Gatus has no native NTP (UDP) probe type; its `tcp://` check only proves a TCP
handshake, and chrony's Service currently declares `123/TCP` — a check against that port would
report `[CONNECTED] == true` today while a real NTP client gets nothing (`sntp -t 3
10.10.206.204` times out, verified live). **Fix the UDP/TCP Service defect first**, then either:

- add a Gatus TCP check against a genuinely different, actually-listening liveness port (not
  `31880` — verified nothing listens there), or
- run a small `exec`/CronJob-based check that performs a real NTP query (`chronyc -h
  10.10.206.204 tracking` or equivalent) and feeds the result to Prometheus/Alertmanager, since
  that is the only way to assert "NTP answering" in the protocol sense rather than "a TCP port is
  open."

A TCP-only check for chrony would be a false green — do not add one and call this criterion done.

### 4. DNS and forward-auth working estate-wide

Spot-checked and confirmed working this session as a pattern to replicate more broadly:
`home.driscoll.tech` resolves to `10.10.206.101` (traefik) and returns a normal HTTPS response —
DNS → `HTTPRoute` → ingress chain intact end to end for at least that one hostname.

"Estate-wide" for this gate means, at minimum, confirming the same for every hostname this
migration touches:

- `home.${ROOT_DOMAIN}` (home-assistant) — confirmed above.
- `idp.${TAILSCALE_DOMAIN}` (tsidp) — via its own `gatus` check, once cut over per
  [15](15-migrate-apps.md).
- `canterlot.${ROOT_DOMAIN}`, `iris.${ROOT_DOMAIN}`, `authentik.${ROOT_DOMAIN}` (authentik) —
  once [07](07-authentik-to-alpha-site.md) repoints them, per its §1.4 domain fan-out.
- Every `forwardAuth`-gated app that sits behind an outpost — a full login round-trip on at
  least one app per outpost type (embedded, proxy, Dockge-proxy), per 07 §4.6's post-check.
  Since tsidp's own UI is itself forward-auth-gated, its check doubles as one data point for
  this, not a substitute for the rest.

mosquitto and chrony have no HTTP surface, so "resolving" for them is the LB-pin check in §3, not
a DNS record — don't invent a hostname that doesn't exist for either.

### 5. SGC's Flux tree suspended

**Verified not done today**: `kubectl --context admin@sgc get kustomization -n flux-system
flux-system -o jsonpath='{.spec.suspend}'` returns empty. SGC is still actively reconciling.

This is a distinct action from anything [15](15-migrate-apps.md) does — scaling an app to 0 does
not stop Flux from reconciling *other* SGC resources, and does not, by itself, stop the estate's
`.github/sgc-sync.yaml` nightly mirror job (flagged as SGC-specific plumbing in
[21](21-repo-consolidation-flux-repoint.md), retired properly in
[22](22-decommission-sgc.md), but worth remembering it exists and keeps running unless
separately handled). The actual command:

```console
flux suspend kustomization flux-system -n flux-system --context admin@sgc
```

Confirm with the same `jsonpath` query above returning `true`, and confirm no Kustomization under
it continues reconciling after a `flux get kustomizations -A --context admin@sgc` a few minutes
later. This must happen **before** [18](18-sgc-nodes-join-control-plane.md) starts touching
nodes — an actively-reconciling Flux tree fighting a node wipe is its own failure mode, separate
from anything this piece is otherwise gating.

### 6. Final etcd snapshot and machine-config export, stored off-box

Sibling files ([18](18-sgc-nodes-join-control-plane.md),
[19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md)) both require this
artifact and both leave "off-box" unspecified — this file names the location, since it's the one
that produces the artifact.

**What to capture, per node** (`milky-way`, `othalla`, `pegasus`):

```console
talosctl -n <node-ip> -e <node-ip> etcd snapshot sgc-etcd-<node>-$(date +%F).db
```

Plus, once (not per-node): the full `stargate-command-cluster/talos/` directory —
`talconfig.yaml`, `patches/`, `talsecret.sops.yaml`, `talenv.yaml`, `talosconfig` — the exact
file set [21](21-repo-consolidation-flux-repoint.md) already identified as this cluster's
Talos-specific state that has no equestria equivalent.

**Where:** the `home-operations` Minio bucket on `truenas`
(`stacks/home/index.ts` — `pulumi.interpolate\`home-operations\``, `acl: private`, already
`protect: true` + `retainOnDelete: true`) under a new `sgc-decommission/<date>/` prefix. This
reuses the estate's established off-box pattern (D2 — Minio retained as the versioned archive
role) rather than inventing a new bucket or mechanism.

**Recommend a second copy, off the Minio bucket entirely, for defense in depth.** This artifact
is the *only* rollback path once [18](18-sgc-nodes-join-control-plane.md)'s second node wipe
happens — if it and the live cluster are both gone, there is nothing left to recover from. A
second copy (operator laptop, or attached as a private release asset on
[vault#84](https://github.com/david-driscoll/vault/issues/84) itself) costs little and removes a
single point of failure from the one artifact this whole gate exists to protect. This is a
recommendation, not a settled decision — see Open Questions.

## Risk framing, corrected for what's actually true today

**The soak is not a uniform safety net across all four apps.** Per
[14](14-cutover-runbook.md#retroactive-audit-chrony-mosquitto-home-assistant)'s audit: SGC's
copies of chrony, mosquitto and home-assistant were **fully deleted**, not scaled to `0`, during
the 2026-08-12 fast cut. There is no rollback path back to SGC for those three regardless of what
this soak finds — only tsidp, cut over properly per [15](15-migrate-apps.md)/[14](14-cutover-runbook.md),
retains that option (SGC's copy scaled to `0`, not deleted, until
[22](22-decommission-sgc.md)). **This gate's job for the three already-migrated apps is
therefore forward validation only** — proving they're healthy where they are now, not proving a
fallback exists. Size the soak's scrutiny accordingly: those three get less margin for silent
recovery than the risk model originally assumed.

**Softer irreversible moments, for completeness** (mechanics live in
[18](18-sgc-nodes-join-control-plane.md), not repeated here): deleting an SGC PVC is
restic-recoverable, so slow-return rather than no-return; each of the six eventual node wipes
across [18](18-sgc-nodes-join-control-plane.md)/[19](19-rotate-equestria-control-planes.md) is
soft *provided* Longhorn has no last replica on that node — verify per wipe, don't assume; the
Flux re-point in [21](21-repo-consolidation-flux-repoint.md) is soft only if `prune: false` holds
for the duration.

## The go/no-go checklist

Print this, tick it, don't proceed to [18](18-sgc-nodes-join-control-plane.md) until every box is
checked **at the same moment** — not "was true at some point during the soak."

- [ ] chrony: NTP Service protocol fixed (UDP/123 exposed); a real NTP query against
      `10.10.206.204` succeeds; the hardcoded-vs-DHCP device enumeration accepted as a known,
      bounded risk (DHCP itself confirmed not a factor — [09](09-mqtt-ntp-renumber-ip-audit.md)).
- [ ] mosquitto: healthy on `10.10.206.203` for the full ≥72h window, `2/2` replicas throughout.
- [ ] tsidp: cut over per [15](15-migrate-apps.md), healthy on equestria, ≥3 clean
      `ReplicationSource` cycles from equestria, SGC copy at `replicas: 0` (not deleted).
- [ ] home-assistant: MQTT integration reconnected and stable (not the stale
      `mosquitto.sgc.svc.cluster.local` config), `volsync-restore` removed from `ks.yaml` and
      confirmed reconciled with no `*-dst-*` PVC pair recreated, ≥3 clean `ReplicationSource`
      cycles, entity history continuous.
- [ ] authentik: live on alpha-site per [07](07-authentik-to-alpha-site.md), every outpost
      re-registered and healthy, a `pg_dump`→scratch-restore verified (not just taken), SGC copy
      at `replicas: 0` (not deleted).
- [ ] Gatus (or equivalent) checks exist and are green for MQTT (`tcp://…:1883`) and for a real
      NTP protocol query — not a TCP port-open substitute — both against the new `.206`
      addresses.
- [ ] DNS + forward-auth spot-checked across every hostname this migration touches (§4 list
      above), each returning a real, successful response, not just a resolvable name.
- [ ] `nfs-system/csi-driver-nfs`'s `SPIKE_IP` failure cleared on both clusters, so Flux health
      signals (`Ready: True`) can be trusted at face value again — this piece does not own the
      fix ([01](01-stabilise.md) does) but cannot honestly certify "healthy" against Kustomizations
      that are lying about their own dependency chain.
- [ ] SGC's `flux-system` Kustomization suspended (verified via `spec.suspend: true`, not
      inferred from app-level scale-downs) and confirmed nothing under it is still reconciling.
- [ ] SGC Longhorn: zero degraded volumes across all three nodes (`kubectl --context admin@sgc
      get volumes.longhorn.io -A`).
- [ ] SGC CNPG `database/postgres`: `Cluster in healthy state`, `readyInstances: 3` — the
      authentik database's own cluster stays intact until [22](22-decommission-sgc.md) even
      though the app itself has moved.
- [ ] A fresh `talosctl etcd snapshot` per SGC node plus the full `talos/` directory export,
      stored in the `home-operations` Minio bucket under `sgc-decommission/<date>/`, with a
      second copy somewhere off that bucket entirely.
- [ ] The ≥72h clock actually ran continuously against the state above — not 72h of wall time
      with a restart or a config change partway through that would invalidate what was measured.

Every unchecked box blocks [18](18-sgc-nodes-join-control-plane.md). There is no partial-credit
version of this gate — it exists specifically because the step after it removes the option to
change your mind about SGC's second node.

## Open questions

1. Should the off-box snapshot/config export get a second, non-Minio copy as recommended in §6?
   Not a settled decision — flagging the single-point-of-failure risk, not resolving it.
2. Should `tsiam` (the new, ledger-unlisted app [15](15-migrate-apps.md) found live on SGC)
   block this gate if left unmigrated, or is it acceptable to decommission SGC with `tsiam`
   simply gone (it's currently a placeholder with no working audience configured, per
   [15](15-migrate-apps.md))? Not decided here.
3. Exact soak duration beyond the ≥72h floor for authentik specifically — 07 says "err toward
   longer" without a number; this file sets the floor everyone shares but doesn't independently
   argue for a longer authentik-specific window.

## See also

- [07-authentik-to-alpha-site.md](07-authentik-to-alpha-site.md) — the authentik cutover and
  restore-verification this gate depends on.
- [09-mqtt-ntp-renumber-ip-audit.md](09-mqtt-ntp-renumber-ip-audit.md) — the literal-IP audit and
  the DHCP finding this gate's MQTT/NTP criterion relies on.
- [14-cutover-runbook.md](14-cutover-runbook.md) — the retroactive audit that established the
  no-rollback risk for three of the four apps.
- [15-migrate-apps.md](15-migrate-apps.md) — the four apps' exit criteria this gate re-checks
  under a ≥72h window.
- [18-sgc-nodes-join-control-plane.md](18-sgc-nodes-join-control-plane.md) — what this gate
  unlocks, including the plan's one hard point of no return.
- [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md) — the
  `sgc-sync.yaml` mirror job that keeps running until explicitly retired.
- [22-decommission-sgc.md](22-decommission-sgc.md) — where the scaled-to-zero copies (tsidp,
  authentik) and SGC's CNPG cluster are finally removed, after this gate and 18/19 complete.
