# 15 — Migrate the apps (N)

Piece **N** of [vault#84](https://github.com/david-driscoll/vault/issues/84) · [← plan
index](README.md) · Depends on [13 — Stage the SGC apps](13-stage-sgc-apps.md) and
[14 — Cutover runbook](14-cutover-runbook.md) · Feeds [16 — Soak and gate](16-soak-and-gate.md)
· This file is standalone — read it without the issue.

This piece executes [14](14-cutover-runbook.md)'s per-app cutover pattern against the four apps
in scope — **chrony → mosquitto → tsidp → home-assistant**, one at a time — each landing on its
renumbered `10.10.206.x` address from [09](09-mqtt-ntp-renumber-ip-audit.md). `authentik` is not
here; it moved to alpha-site under [07](07-authentik-to-alpha-site.md) and never enters this
migration's blast radius.

## Read this first: three of the four apps are already live

**As of 2026-08-13**, verified directly against both clusters (`admin@equestria`, `admin@sgc`)
and both git repos: **chrony, mosquitto and home-assistant are already running on equestria,
serving traffic, and deleted from SGC.** [13](13-stage-sgc-apps.md#status-as-of-2026-08-13--read-this-before-doing-anything)
documents the git/cluster forensics in full — a single fast, paired cut on 2026-08-12 (commits
`2e030d161`/`bddf20ac8` for chrony+mosquitto, `def57cc1a`…`16da17896`/`d6b36427a` for
home-assistant) that skipped the `replicas: 0` staging step and the runbook this file and 14 now
define. **tsidp is the only one of the four still untouched** — still live on SGC, not staged in
equestria at all.

This file's job is therefore split:

- **chrony, mosquitto, home-assistant** — confirm the fast cut actually satisfies this piece's
  exit criteria (it mostly does, with real gaps below), not re-execute a cutover that already
  happened.
- **tsidp** — the actual cutover to run, once
  [13](13-stage-sgc-apps.md#tsidp--not-started-stage-it) has staged it at `replicas: 0`.

**Load-bearing correction carried from [14](14-cutover-runbook.md#retroactive-audit-chrony-mosquitto-home-assistant):**
the fast cut did not merely skip staging, it also skipped the runbook's step 7 ("leave the SGC
copy scaled to 0, don't delete"). SGC's manifests for chrony, mosquitto and home-assistant were
**fully deleted**, not scaled down — so unlike tsidp, **there is no rollback path back to SGC for
these three** if equestria's copies turn out to be wrong. 14's audit table dates the worst-case
data-loss window at under 24 hours of MQTT/HA state, which it treats as an acceptable fact given
the estate's existing no-PITR posture — not re-litigated here, but carried into
[16](16-soak-and-gate.md)'s risk framing: the soak for these three apps validates forward-only,
it cannot be treated as a safety net the way it can for tsidp.

Do not read "three of four are done" as "skip to tsidp." Two of the three done apps have live,
verified defects that must close before this piece's exit gate — and therefore before
[16](16-soak-and-gate.md)'s soak clock can honestly start — for reasons in their sections below.

## The cutover pattern (from 14, restated so this file stands alone)

Per app, in order:

1. **Force a final SGC-side backup** (only for apps carrying VolSync — chrony has no PVC,
   mosquitto has no VolSync component; see per-app notes).
2. **Scale the SGC copy to 0**, do not delete it yet.
3. **Land the equestria manifests** with `components/volsync` + `components/volsync-restore`
   (first deploy only — see the removal obligation below), `replicas: 0`.
4. **Let the restore run**, confirm `ReplicationDestination/${APP}-dst` shows a `lastSyncTime`
   (or, with nothing to restore, that it completed as a successful no-op), confirm the PVC is
   `Bound`.
5. **Remove `components/volsync-restore`** from the `ks.yaml` `components:` list. This step is
   not optional — leaving it in is the exact vault#120 mechanism: the nightly
   `volsync-restore-cleanup` CronJob (`30 3 * * *`) deletes the `ReplicationDestination` once its
   `restore-once` trigger fires, and if the component is still listed, Flux recreates it on the
   very next reconcile, holding open a full `${APP}-dst-dest`/`${APP}-dst-cache` PVC pair
   forever and re-fighting the cleanup job nightly — the actual 2026-07 Longhorn storage
   incident mechanism.
6. **Flip `replicas: 0 → 1`** (or remove the override), cut DNS/LB pin to the new address, verify
   the app is healthy and serving.
7. **Leave the SGC copy scaled to 0** — do not delete its manifests yet. It stays as the
   rollback path until [16](16-soak-and-gate.md)'s soak clears it. Actual deletion of SGC's
   manifests happens naturally when [18](18-sgc-nodes-join-control-plane.md) wipes the node, or
   earlier if [22](22-decommission-sgc.md) is run ahead of that — not this piece's job.

**Trap — two writers, one restic repo.** Both repos' `components/volsync/externalsecret.yaml`
template `RESTIC_REPOSITORY` as the literal `/repository/${APP}` — namespaced by app name only,
not by cluster. If SGC's `ReplicationSource` for an app is still scheduled (`0 14 * * *` by
default, same trigger time on both sides) when equestria's copy starts writing to the same path,
that is the exact two-writer hazard [02](02-volsync-two-writer.md) exists to remove for
`technitium`/`registry`. Step 2 (scale SGC to 0) is what prevents it recurring here — do not
skip it because "it's just a scale-down."

## Per-app sections, in migration order

### 1. chrony — done, but not actually answering NTP

**Live state (verified 2026-08-13):** `StatefulSet chrony`, `replicas: 1`, `Running` on
`shining-armor`. Stateless — `chrony.conf` mounted from a `ConfigMap`, `/var/lib/chrony` is an
`emptyDir`. No PVC, no VolSync — nothing to restore or back up; a rebuild from git is a complete
recovery. `Service` type `LoadBalancer`, `externalIPs: 10.10.206.204` (was `10.10.209.204`,
renumbered per [09](09-mqtt-ntp-renumber-ip-audit.md) and D-track answer "Lets renumber" —
[comment-5-answers-2](https://github.com/david-driscoll/vault/issues/84#issuecomment-5152258821)).
Falls inside the existing `CiliumLoadBalancerIPPool` block, no pool edit needed (D7).

**Verified defect — the Service exposes NTP over the wrong protocol.** The `HelmRelease`
declares:

```yaml
    service:
      chrony:
        ports:
          ntp-port:
            port: 123
            protocol: TCP     # <- NTP is UDP. chronyd does not speak NTP over TCP.
```

Confirmed live (`kubectl get svc -n stargate-command chrony -o yaml`): the Service's only ports
are `123/TCP` and `31880/TCP` (an unexplained second port with nothing listening behind it — no
config references it, most likely template boilerplate, not a health endpoint). **A real NTP
query against the new address fails:**

```console
$ sntp -t 3 10.10.206.204
sntp: Exchange failed: Timeout           # x5, all attempts
```

Ruled out as a reachability artifact: this session's Mac reaches the same `10.10.206.0/24`
subnet fine for other protocols (`curl https://10.10.206.101` — the traefik VIP — returns a
normal `404` over TLS). The chrony pod does not run `hostNetwork`, has no `hostPort`, and the
Service has no UDP port declared anywhere — there is no path for UDP/123 traffic to reach it.
**Every "chrony healthy" signal Flux and `kubectl` can currently give (`Ready: True`, `1/1`) is
true and simultaneously says nothing about whether NTP actually works.** This is precisely why
the ledger calls for "an NTP-answering check in every later phase gate" — the existing
Kustomization/pod health checks would pass this today.

**Action for this piece:** add a `protocol: UDP` port for `123` on the chrony Service (either
alongside or instead of the TCP one, depending on whether anything intentionally wants TCP/123 —
nothing found that does) before this app can be marked done. This is a one-line HelmRelease
change; verify with a repeat `sntp -t 3 10.10.206.204` returning a real reply, not a timeout.

**Resolved, not open — [09](09-mqtt-ntp-renumber-ip-audit.md) closed the DHCP question.** UniFi's
`dhcpd_ntp_enabled` is `false` with no NTP servers configured on either the Home or IoT network,
confirmed live — nothing in the estate learns chrony's address via DHCP option 42. Whatever
queries chrony must have `10.10.209.204` (or now `.206.204`) statically configured, so this
renumber is **not** transparent the way MQTT's DHCP-adjacent story might have suggested; it is a
live outage for anything with the old address hardcoded, same shape as mosquitto's audit below.
Which devices those are remains unenumerated (device-by-device, outside this repo set) — that
part is still genuinely open.

**Exit for chrony:** UDP fix landed and verified with a live `sntp` reply; the DHCP question is
closed (no DHCP path exists), but the hardcoded-device enumeration is not — accept as a known,
bounded risk or track it as a follow-up before declaring this app fully done.

### 2. mosquitto — done and answering, no backup story

**Live state (verified 2026-08-13):** `StatefulSet mosquitto`, `replicas: 2`
(`mosquitto-0` on `shining-armor`, `mosquitto-1` on `fluttershy`), both `Running`. Two
`volumeClaimTemplates`-managed PVCs, `4Gi` each, plain `longhorn` StorageClass (see the storage
tier gap below — matches SGC's original sizing exactly, just not on the intended critical tier).
`Service` type `LoadBalancer`, `externalIPs: 10.10.206.203` (was `10.10.209.203`, D-track answer
"We can update home assistant to use the new IP range for MQTT" —
[comment-4](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112326099)).

**Verified live and answering:**

```console
$ nc -zv -G 3 10.10.206.203 1883
Connection to 10.10.206.203 port 1883 [tcp/ibm-mqisdp] succeeded!
```

Unlike chrony, MQTT genuinely is TCP, so this Service's port declaration is correct and the
broker answers on the new address today.

**No VolSync component at all** — confirmed live, no `ReplicationSource`/`ReplicationDestination`
object exists for mosquitto in either cluster. Per [13](13-stage-sgc-apps.md#mosquitto--done-verify-only)
this matches SGC's original shape (retained messages were never backed up there either), so it
is not a regression introduced by this migration — but it means the "≥1 successful
equestria-side VolSync run" exit criterion this piece was scoped against **does not apply to
mosquitto**, because there is no VolSync run to have. [16](16-soak-and-gate.md) corrects the
gate wording for this.

**Literal-IP audit — run, and it found a live outage.**
[09](09-mqtt-ntp-renumber-ip-audit.md) is the piece that owns this audit and has already executed
it in full. The headline result: **Home Assistant's own MQTT integration is down right now** —
not from a hardcoded IP but from a stale Kubernetes-internal DNS name left over from SGC. See the
home-assistant section below for the specifics; it is this piece's problem to fix (home-assistant
is one of the four apps), not 09's. The rest of 09's audit (UniFi DHCP, firewall rules, Docker
compose, Gatus, Prometheus) came back clean for mosquitto's new address, with one exception
outside this file's scope: 09 also found `matter`'s Service carrying a stray `externalIPs:
["${AUTOMATION_VIP}"]` entry (mosquitto's own address, copy-paste leftover) — `matter` is not one
of this piece's four apps, flagged here only so it isn't lost. Zigbee2MQTT/ESPHome/Frigate/
Node-RED/Tasmota firmware remain genuinely unauditable from this repo set per 09 — nothing in
`docker/` or either cluster repo references them, so if they exist their config is elsewhere.

**Minor paper cut, not blocking:** `mosquitto/users.sops.yaml` decrypts with a single age
recipient (`age1eurl2t7…`) while the repo's own `.sops.yaml` `creation_rules` for
`kubernetes/.*\.sops\.ya?ml` call for three. Works today; the next `sops updatekeys` on that
file will rewrite its header to match. Noted in [13](13-stage-sgc-apps.md#mosquitto--done-verify-only)
already — not re-litigated here.

**Exit for mosquitto:** the broker itself meets its own criteria (answering, `4Gi×2` PVCs
healthy); what remains open belongs to home-assistant's row, not mosquitto's — see below.

### 3. tsidp — not started, execute it

**Live state (verified 2026-08-13):** untouched. Still running on SGC (`tailscale-system`
namespace), pod `tsidp-8666c78f77-2st6t` on `milky-way`, `6d6h` old. Not present anywhere in
`equestria-cluster` yet.

**Prerequisite — [13](13-stage-sgc-apps.md#tsidp--not-started-stage-it) stages this first.** That
file's "tsidp — not started, stage it" section is the actual staging spec: copy the four source
files verbatim from `stargate-command-cluster:kubernetes/apps/tailscale-system/idp/`, pin
`replicas: 0`, add the `components:` list (`fast-node-eviction`, `volsync`, `volsync-restore`)
with `VOLSYNC_PUID/PGID: "1000"`, wire it into `kubernetes/apps/tailscale-system/kustomization.yaml`.
**This piece assumes that staging is done and `Ready: True` / `0/0` before starting the steps
below** — if it isn't, do 13 first.

Spec, verified against `stargate-command-cluster` source: `5Gi` RWO PVC (component default,
`${VOLSYNC_CAPACITY:=5Gi}`), `Deployment`, `replicas: 1` on SGC today. Pod anti-affinity
excludes `othalla` by hostname
(`kubernetes.io/hostname NotIn [othalla]`) — plausibly related to
[vault#95](https://github.com/david-driscoll/vault/issues/95) (othalla NVMe media errors), though
that connection is inferred from timing and hardware, not confirmed by a comment on the manifest
itself; treat as a hint, not a settled fact, and preserve the anti-affinity when the manifest
moves regardless of the reason.

**tsidp's own web UI sits behind authentik forward-auth** (`definition.yaml`:
`authentik.proxy.mode: forward_single`, `access_policy.groups: [admins]`). Authentik itself is
still live on SGC as of today ([07](07-authentik-to-alpha-site.md) has not executed — verified:
no `docker/alpha-site/authentik*` stack exists yet in `home-operations`, only the shared
`docker/_common/authentik-outpost` config used by every cluster's outpost). This is not a hard
blocker for tsidp's cutover — authentik keeps working from wherever it currently lives — but the
README's critical path prefers 07 land first, and coordinating the two avoids debugging SSO
against a moving target during tsidp's own cutover window.

**Cutover steps** (once [13](13-stage-sgc-apps.md) has staged it):

1. Confirm staging exit: `kubectl get kustomization -n tailscale-system tsidp` → `Ready: True`;
   `kubectl get deploy -n tailscale-system tsidp` → `0/0`; `pvc/tsidp` → `Bound`;
   `ReplicationDestination/tsidp-dst` shows a completed `lastSyncTime`.
2. Confirm `components/volsync-restore` has already been removed from equestria's
   `tsidp/ks.yaml` (13's step 7) — do not proceed to a live cutover with it still attached, or
   this becomes a second live vault#120 recurrence on top of the one already open on
   home-assistant.
3. On SGC: force a final `ReplicationSource/tsidp` sync
   (`kubectl -n tailscale-system annotate replicationsource tsidp
   volsync.backube/do-sync=$(date +%s) --overwrite`), wait for `lastSyncTime` to update.
4. On SGC: scale `deployment/tsidp` to `0`. Do not delete the manifests.
5. On equestria: flip `tsidp`'s `replicas: 0 → 1`. Confirm the pod starts, confirm
   `https://idp.${TAILSCALE_DOMAIN}/.well-known/openid-configuration` returns `200` through the
   authentik forward-auth proxy (matching the `gatus` check already defined in
   `definition.yaml` — there is no need to invent a new one, just confirm it goes green once
   this app has real traffic).
6. Confirm a steady-state `ReplicationSource/tsidp` sync completes from equestria within one
   cycle — this is the "≥1 successful equestria-side VolSync run" this app actually owes.
7. Whatever authenticates against tsidp (Tailscale's own OIDC integration, any app using it as
   an identity provider) — re-point at the new location if it referenced SGC's address
   explicitly. Not independently inventoried by this file — [09](09-mqtt-ntp-renumber-ip-audit.md)
   is the piece that owns the literal-IP audit generally, but tsidp is not in its scope (that
   file covers mosquitto/chrony's `.209.203`/`.204` only); treat this as a gap neither file has
   closed yet.

**New finding, out of this file's instructed scope but directly adjacent — `tsiam`.** Verified
live on SGC today (`tailscale-system` namespace, pod `tsiam-5c9979d769-*`, `12h` old): a second
Tailscale-identity app, **not** in the original five-app ledger. Per its own
`definition.yaml` — "Tailscale-powered workload identity. Issues short-lived JWTs to machines
based on their tailnet node identity — the machine-side counterpart to tsidp, which
authenticates humans." It shares tsidp's `tailscale-operator` dependency and the same
`tailscale-authkey` Secret (`tag:apps`), uses the identical `components/volsync` pattern with
`VOLSYNC_STORAGECLASS: longhorn` pinned explicitly against
[vault#113](https://github.com/david-driscoll/vault/issues/113) (two default StorageClasses —
**verified resolved as of today**: `kubectl get storageclass` shows only `longhorn` carrying
`storageclass.kubernetes.io/is-default-class: "true"`; `openebs-hostpath` exists but carries no
default annotation, `118m` old at time of check). `tsiam` is deliberately **not** behind
authentik forward-auth (its callers are machines with no browser session) and is currently a
placeholder deployment — `allowedAudiences: ["https://placeholder.invalid"]`,
`allowEmptyNodeCapability: false`, no tailnet ACL grants yet, so nothing can obtain a token from
it regardless. This is genuinely new since the ledger was written and is **not** one of this
piece's four ordered apps — flagged here as an open question rather than silently folded in.
Given the shared dependency chain, migrating it in the same maintenance window as tsidp (same
pattern, same secret, same namespace) is the practical choice once someone decides it's in
scope — see Open Questions.

**Exit for tsidp:** healthy on equestria, `idp.${TAILSCALE_DOMAIN}` gatus check green, one
successful equestria-side `ReplicationSource` cycle, SGC copy at `0` (not deleted).

### 4. home-assistant — done, but a live incident is still armed

**Live state (verified 2026-08-13):** `Deployment` (not `StatefulSet` — no `type: statefulset`
in the HelmRelease values), `replicas: 1`, `Running` `2/2` (the `home-assistant` app container
plus a `code-server` sidecar) on `shining-armor`. `hostNetwork: true` (required for mDNS device
discovery). Single `40Gi` RWO `longhorn` PVC (again plain `longhorn`, not `longhorn-critical` —
see below), matches SGC's original size, no truncation. `dependsOn: mosquitto` in `ks.yaml` —
correct at the Kubernetes-scheduling level, MQTT's pods are up before HA's start. **That
ordering guarantee does not extend to HA's own MQTT integration config, and there is a live gap
between the two — see next.**

**Live outage, more urgent than the volsync-restore incident below —
[09](09-mqtt-ntp-renumber-ip-audit.md#urgent--home-assistants-mqtt-integration-is-down-right-now)
found it first.** Home Assistant's MQTT integration config lives on its restored PVC, carried
over byte-for-byte from SGC rather than regenerated, and it was never a literal IP — it's the
Kubernetes-internal DNS name `mosquitto.sgc.svc.cluster.local`, which only ever resolved inside
the SGC cluster that no longer runs it:

```console
$ kubectl -n stargate-command exec deploy/home-assistant -c app -- \
    grep -o '"broker":[^,]*' /config/.storage/core.config_entries
"broker":"mosquitto.sgc.svc.cluster.local"

$ kubectl -n stargate-command logs deploy/home-assistant -c app | grep -i mqtt
ERROR [homeassistant.components.mqtt.client] Failed to connect to MQTT server due to
  exception: [Errno -2] Name does not resolve
```

Every MQTT-backed entity — anything through the `mqtt` integration, plausibly including any
Zigbee2MQTT-bridged device if one exists — has been non-functional since the pod started
(2026-08-12 22:01), automations silently stale. **Fix via the HA UI** (Settings → Devices &
Services → MQTT → Reconfigure, pointed at `mosquitto.stargate-command.svc.cluster.local` or the
pinned `10.10.206.203`) rather than hand-editing `.storage/core.config_entries` on a live PVC.
This is the literal execution of David's "we can update home assistant to use the new IP range
for MQTT" commitment (Q-F) — as of this writing it has not happened. **This piece's exit gate
for home-assistant cannot be "healthy" while this is broken**, regardless of what the
Kustomization/pod status say.

**A genuine, verified successful equestria-side VolSync run exists:**
`ReplicationSource/home-assistant` in `stargate-command` shows `lastSyncTime:
2026-08-13T02:04:31Z`, duration `56m24s`. That satisfies this app's exit criterion on its own.

**Live incident — do not treat this app as closed.** `home-assistant`'s `ks.yaml` in
`equestria-cluster` still lists `components/volsync-restore` in its `components:` even though
the restore completed and step 5 of the cutover pattern (above) was never done. This is the
identical vault#120 mechanism described in that pattern step: the `restore-cleanup` CronJob has
already reaped the `ReplicationDestination` once (a completed cleanup Job observed ~56 minutes
before this check), and **the only reason it hasn't recreated yet and started the nightly
fight is that `home-assistant`'s Kustomization currently can't reconcile at all** —
`Ready: False — dependency 'volsync-system/volsync' is not ready`, itself caused by
`nfs-system/csi-driver-nfs` failing on an unset `SPIKE_IP` substitution (first observed
~2026-08-13, both clusters). [13](13-stage-sgc-apps.md#live-incident-the-volsync-restore-component-is-still-attached-to-home-assistant)
owns the fix (remove the component line) and traces the `SPIKE_IP` root cause to
[01](01-stabilise.md)/[06](06-age-key-consolidation.md) territory. **This piece's exit gate for
home-assistant is blocked on that fix landing and actually reconciling** — a currently-broken
dependency chain is incidentally preventing an incident, not proof one won't happen.

**Node-pin question — resolved, not merely "probably fine."** The ledger has carried "whether
home-assistant is node-pinned (USB Zigbee/Z-Wave)" as explicitly unverified since
[Expansion v2.1 §10](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149130419)
item 5. Verified this session: `docker/alpha-site/zwave/compose.yaml` in `home-operations` runs
`zwave-js-ui` on alpha-site with a direct USB device mount
(`/dev/serial/by-id/usb-Silicon_Labs_HubZ_Smart_Home_Controller_C1301C21-if00-port0:/dev/zwave`),
exposed over the network for Home Assistant's Z-Wave JS integration to connect to remotely — the
Z-Wave stick is on the Pi, not any Kubernetes node. Zigbee has no coordinator deployed at all
yet (the only estate reference is a deferred placeholder,
`docker/celestia/homelable/.env:80` — `# ZIGBEE_*/ZWAVE_* — cross-cluster from celestia;
deferred (vault#109 phase 3)`). **This closes the open question: no Kubernetes node needs USB
passthrough for either integration**, which is also independently confirmed by the fact that
home-assistant has already run successfully on `shining-armor` — an arbitrary equestria worker,
not a specially chosen one — without incident.

**Verified reachable (web UI only):** `home.driscoll.tech` resolves to `10.10.206.101` (the
traefik VIP) and returns a normal `HTTPS` response, confirming DNS + `HTTPRoute` + ingress are
wired correctly end to end. This says nothing about the MQTT integration above — the UI loading
and the app being functionally healthy are different claims, and only the first is currently true.

**Exit for home-assistant:** three separate things, all required: (1) MQTT integration
repointed and verified reconnected — currently failing, highest-priority open item on this app;
(2) `volsync-restore` component removed from `ks.yaml` and confirmed reconciled (owned by
[13](13-stage-sgc-apps.md), gated here); (3) VolSync steady-state run — already satisfied
(`2026-08-13T02:04:31Z`). Do not mark this app done on (3) alone.

## Cross-cutting gaps found this session, apply to all four

**Storage tier — [12](12-longhorn-critical-tier.md) hasn't landed.** `kubectl get storageclass`
on equestria today: `longhorn` (default), `longhorn-cache`, `longhorn-local`,
`longhorn-snapshot`, `openebs-hostpath` — no `longhorn-critical`. All three already-migrated PVCs
(`home-assistant` 40Gi, `data-mosquitto-0/1` 4Gi×2) sit on plain `longhorn`, because they moved
before 12 existed. `components/volsync`'s `kustomization.yaml` stamps
`kustomize.toolkit.fluxcd.io/force: enabled` on everything it manages, and `storageClassName` is
immutable once a PVC is `Bound` — so retagging these later is **not** a one-line edit, it is
Flux deleting and recreating the PVC, which destroys the data. If 12 lands after this piece
closes, treat the retag as its own follow-up cutover (force a fresh sync, scale to 0, delete,
`volsync-restore`, verify) rather than a config tweak. tsidp's staged manifest in 13 pins
`VOLSYNC_STORAGECLASS: longhorn-critical` on the assumption 12 lands first; if it hasn't when
this piece executes tsidp's cutover, drop that line (falls back to `longhorn`) rather than block
on it — first-time PVC creation never touches this immutability trap, only after-the-fact
retagging does.

**No Gatus checks for chrony or mosquitto.** Verified: neither `definition.yaml` has a `gatus:`
block. `mosquitto`'s MQTT port is a straightforward TCP check to add. `chrony` is harder — Gatus
has no native NTP probe type, and (per the defect above) a naive TCP-connect check on `123`
would currently report healthy while genuinely misrepresenting NTP service, so **fix the
UDP/TCP protocol defect first**, then either add a TCP check against the same host on a
different, actually-listening port as a liveness proxy, or a small `exec`/CronJob-based check
that runs an actual NTP query and reports the result — a bare port-open check is not sufficient
for this specific app given what was just found.

**Live blocker, both clusters, not owned here:** `nfs-system/csi-driver-nfs` Kustomization fails
with `envsubst error: variable substitution failed: variable not set (strict mode): "SPIKE_IP"`.
`SPIKE_IP` is the static address (`10.10.10.10`) of the `spike` TrueNAS VM defined in
`home-operations/stacks/home/index.ts`, referenced from `kubernetes/flux/meta/shared-secrets.sops.yaml`
in both cluster repos. This cascades: `volsync-system/volsync` → `Ready: False` (dependency not
ready) → every app whose `ks.yaml` `dependsOn: volsync-system/volsync` shows `Ready: False` too
— `home-assistant`, `matter`, `tsiam`, `tsidp`, `technitium`, `truenas-volumes`, on both
clusters — even though the underlying workloads keep running. **This is why Flux/kubectl health
cannot be trusted at face value for this piece's exit gate right now** — clear it (tracked in
[01](01-stabilise.md)) before declaring any app in this file "healthy" on the strength of a green
Kustomization alone.

## Exit criteria

| App | Healthy | Resolving/answering | ≥1 equestria-side VolSync run | Notes |
|---|---|---|---|---|
| chrony | Pod `1/1` | **No** — UDP/123 not exposed, live `sntp` timeout | n/a (no PVC) | Fix protocol before declaring done |
| mosquitto | Pods `2/2` | Yes — verified MQTT TCP connect | n/a (no VolSync exists) | Broker itself is done; see home-assistant's row for the client-side gap |
| tsidp | Not started | Not started | Not started | Execute the cutover steps above |
| home-assistant | Pod `2/2` (web UI reachable) | **No** — MQTT integration broken (stale `mosquitto.sgc.svc.cluster.local`) | Yes — `2026-08-13T02:04:31Z` | Fix MQTT config **and** land the `volsync-restore` removal |

None of the four should be marked closed for this piece until every cell in its row is a clean
"yes."

## Open questions

1. Should `tsiam` be added to this migration's explicit scope, migrated in the same window as
   `tsidp` given the shared dependency chain? Not decided by this file.
2. Chrony's hardcoded-device enumeration — [09](09-mqtt-ntp-renumber-ip-audit.md) already closed
   the DHCP question (definitively no), but not which devices, if any, have `.204` hardcoded.
   Fixing the UDP/TCP protocol defect is necessary regardless of the answer; the blast radius of
   the renumber itself depends on it.
3. Zigbee2MQTT/ESPHome/Frigate/Node-RED/Tasmota against mosquitto's new address — per
   [09](09-mqtt-ntp-renumber-ip-audit.md), unauditable from any repo this plan has access to.
   Still open; someone needs to check each device by hand.

## See also

- [09-mqtt-ntp-renumber-ip-audit.md](09-mqtt-ntp-renumber-ip-audit.md) — the address decisions
  this file verifies as already-live.
- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — the storage tier these four
  apps should retroactively move to.
- [13-stage-sgc-apps.md](13-stage-sgc-apps.md) — staging spec and live-state forensics this file
  builds directly on.
- [14-cutover-runbook.md](14-cutover-runbook.md) — the generic per-app pattern this file applies.
- [16-soak-and-gate.md](16-soak-and-gate.md) — what happens once every row above is green.
