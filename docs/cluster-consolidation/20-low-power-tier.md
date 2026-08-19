# 20 — Low-power / control-plane-only operating mode (S′)

Sub-issue anchor **S′** ([vault#84](https://github.com/david-driscoll/vault/issues/84),
[Expansion v2.1](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583)
§3, "Q-E"). Implements decision **D6**: a deliberate 3–4h+ operating posture, on battery,
where the cluster "limps along" on control planes alone. This is not a disaster-recovery
mode — it is a *planned* posture David enters on purpose, on Pecron F3000LFP battery power,
runbook-driven.

> *"I want to ensure that the cluster can still limp along if the 3 control plane nodes are
> all that is running (during low power situations). It should run the minimum critical
> services if possible."* — [Q-E answer](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112326099)
>
> *"Ideally the cluster could run in a low power state for 3 to 4 hours, or more. They are
> connected to [a Pecron F3000LFP portable power station](https://www.pecron.com/products/pecron-f3000lfp-portable-power-station-3600w-3072wh)
> with 2 others available as needed for outages."* — [follow-up](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734)
>
> *"Yes, home assistant is tier 1, if the lights stop working the wife gets upset."* — [same comment](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734)

**Read this file standalone.** It does not assume you have read vault#84.

---

## Status — 2026-08-19, re-verified live against `admin@equestria`

[19](19-rotate-equestria-control-planes.md) **completed 2026-08-19**, which is what unblocks
this piece: the end-state topology this file was written against is now the real topology.
Everything below marked "verified" was re-checked live on 2026-08-19 with read-only
`kubectl`/`talosctl`. Nothing in the cluster was mutated to write this file.

**This mode is NOT ready to enter.** Three preconditions are unmet, §0 has each one with its
verification command. The one that matters most is new and was not visible when this file was
first written: **the Longhorn `taint-toleration` setting from PR #912 is accepted but not
applied**, so flipping `allowSchedulingOnControlPlanes: false` today plants a landmine that
does not detonate until the next control-plane reboot.

### What piece 19 completing changed in this file

| Claim in the pre-19 text | Status now |
|---|---|
| CPs are `milky-way`/`othalla`/`pegasus`, workers are the other four | **Confirmed live.** 3 CP + 4 worker, all `Ready`, no taints on any node |
| `allowSchedulingOnControlPlanes: true`, no custom `nodeTaints` anywhere | **Still true** (`talos/patches/controller/cluster.yaml:2`). This piece owns the flip; §0.1 is why it cannot happen yet |
| §3 capacity: "11.85 cores / 44.55 GiB" allocatable across the trio | **Still exactly right** — same three machines. Re-measured demand in §3 |
| §2: "none of OpenBao's replicas run on a node that will end up in the critical tier" | **Now false.** `openbao-2` runs on `milky-way`. §2 |
| §2: a CNPG instance can never be on a control plane | **Now false.** `postgres-3` runs on `othalla`, `longhorn-local` strict-local, PV `nodeAffinity: othalla`. §2 |
| §1: "`tsidp` is a one-line `ExternalName` Service … costs nothing" | **Now false.** `tsidp` is a real Deployment in `tailscale-system` with a 5 Gi Longhorn PVC (`kubernetes/apps/tailscale-system/idp/`). §1 |
| §6: `hard-hat` is Proxmox-VM-backed by MAC OUI, so exit is `qm start` | **Now false.** §0.3 / §6 — `hard-hat` has exactly one NIC, `enp2s0`, MAC `58:47:ca:79:ed:0d`. Only `shining-armor` is a VM |
| §5: piece 12's tags/StorageClass are a precondition | **Still unmet.** Zero Longhorn node tags, zero disk tags, no `longhorn-critical` class. §0.2 |
| §4: "Longhorn's `taintToleration` … hasn't been touched yet" | **Half-landed and silently stuck.** §0.1 — this is the blocker |

---

## 0. Preconditions — do not enter low-power until all three are green

Each precondition has an exact verification command. Run all three. If any is red, low-power
mode is not safe to enter, and §0.1 in particular is not safe to *work around*.

### 0.1 — BLOCKER: Longhorn's `taint-toleration` setting is accepted but NOT applied

[PR #912](https://github.com/david-driscoll/home-operations/pull/912) ("tolerate the
control-plane taint before it exists") is merged. It added the toleration in **two** places,
because Longhorn needs both and they are not interchangeable:

| Half | Mechanism | Covers | State |
|---|---|---|---|
| `global.tolerations` | ordinary Helm pod-spec toleration | `longhorn-manager`, `longhorn-ui`, `longhorn-driver-deployer` | **APPLIED** |
| `defaultSettings.taintToleration` | a Longhorn **Setting** CR, consumed by `longhorn-manager` at runtime | `longhorn-csi-plugin`, `engine-image` (×2), `instance-manager`, `backing-image-manager`, `share-manager` | **NOT APPLIED** |

The second half is exactly the set of components that must tolerate the taint, because they
are the storage data path on every node.

**Verify — this is the command to run before any talconfig change:**

```bash
kubectl get settings.longhorn.io -n longhorn-system taint-toleration \
  -o custom-columns=VALUE:.value,APPLIED:.status.applied
```

Live, 2026-08-19:

```text
VALUE                                              APPLIED
node-role.kubernetes.io/control-plane:NoSchedule   false
```

Second, independent check — the DaemonSet annotation Longhorn writes when it *does* apply it:

```bash
kubectl -n longhorn-system get ds longhorn-csi-plugin \
  -o jsonpath='{.metadata.annotations.longhorn\.io/last-applied-tolerations}'
```

Live: `[]`. It must contain `node-role.kubernetes.io/control-plane` before the flip.

**Why it is stuck.** `updateTaintToleration()` in Longhorn's `controller/setting_controller.go`
gates on `AreAllVolumesDetachedState()`. Since #7173 (Longhorn 1.6) the Setting write is
*accepted* rather than rejected, and the controller then requeues on the one-hour
`settingControllerResyncPeriod` forever while any volume is attached. `helm upgrade` succeeds,
the HelmRelease reports `Ready`, and the only place the failure surfaces is
`longhorn-manager`'s log:

```bash
kubectl -n longhorn-system logs -l app=longhorn-manager --since=2h | grep -i toleration
```

Live, 2026-08-19:

```text
E0819 14:10:09.578701 1 setting_controller.go:202] "Unhandled Error"
  err="failed to sync setting for longhorn-system/taint-toleration: current state prevents
  this: failed to apply taint-toleration setting to Longhorn components when there are
  attached volumes. It will be eventually applied"
```

Live volume state at that moment: **78 attached, 125 detached, 1 detaching, of 204 total.**

**What happens if you flip the taint anyway.** `NoSchedule` does not evict running pods, so
nothing breaks the instant the taint lands — the existing `longhorn-csi-plugin` and
`engine-image` pods keep running on the control planes. It bites on the next pod **recreate**
on a control plane: a reboot, a Talos or Longhorn upgrade, a DaemonSet rollout, an OOM kill.
After that the pod cannot be scheduled back, and **every volume attached through that node
breaks** — including, by design, the Tier-1 volumes this whole mode exists to keep alive. The
failure is delayed, silent at flip time, and lands during exactly the kind of event (a reboot)
that a low-power exit involves.

**The DaemonSet audit, re-run live 2026-08-19.** 21 DaemonSets; 18 already tolerate the
control-plane taint, 3 do not — and all 3 are in the deferred-setting group:

| DaemonSet | Tolerates CP taint | How |
|---|---|---|
| `kube-system/cilium` | yes | blanket `operator: Exists` |
| `kube-system/spegel` | yes | blanket `operator: Exists` (`NoSchedule` + `NoExecute`) |
| `nfs-system/csi-nfs-node` | yes | blanket `operator: Exists` |
| `observability/node-exporter` | yes | blanket `operator: Exists`, `NoSchedule` |
| `observability/smartctl-exporter-0` | yes | blanket `operator: Exists`, `NoSchedule` |
| `kube-system/multus`, `node-feature-discovery-worker`, `amd-gpu-device-plugin`, `amd-gpu-labeller-daemonset`, `intel-gpu-plugin`, `nvidia-device-plugin` (×3), `network/crowdsec-agent`, `observability/alloy`, `observability/intel-gpu-exporter`, `longhorn-system/longhorn-manager` | yes | explicit key, landed by #912 |
| **`longhorn-system/longhorn-csi-plugin`** | **NO** | `tolerations: []` — waiting on the setting |
| **`longhorn-system/engine-image-ei-493e04e7`** | **NO** | `tolerations: []` — waiting on the setting |
| **`longhorn-system/engine-image-ei-a4d05f02`** | **NO** | `tolerations: []` — waiting on the setting |

`instance-manager` is not a DaemonSet (longhorn-manager creates the pods directly) and shows
the problem in its sharpest form:

```bash
kubectl -n longhorn-system get pods -l longhorn.io/component=instance-manager \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,TOL:.spec.tolerations
```

Live: the instance-managers on `kerfuffle` and `fluttershy` **do** carry
`node-role.kubernetes.io/control-plane:NoSchedule` — they were created while those nodes were
still control planes, before piece 19 rotated them out. The instance-managers on
`milky-way`, `othalla` and `pegasus` — the three nodes that will actually be tainted — do
**not**. The toleration is present on exactly the nodes that no longer need it and absent on
exactly the nodes that will.

**How to get it applied.** There is one supported path and it is expensive:

1. **A full-quiesce maintenance window in which every Longhorn volume detaches.** Not a
   low-power window — the two are different postures and must not be conflated. Low-power
   *keeps* the Tier-1 volumes attached; this needs them detached too. In practice that means
   suspending Flux estate-wide, scaling every Deployment/StatefulSet with a Longhorn PVC to
   0 (including Tier 1), suspending the VolSync `ReplicationSource`/`Destination` movers and
   the CNPG backup CronJobs — anything that attaches a volume — and waiting for:

   ```bash
   kubectl get volumes.longhorn.io -n longhorn-system \
     -o custom-columns=NAME:.metadata.name,STATE:.status.state | grep -vc detached
   ```

   to reach `1` (the header line only).

2. Then either wait out the remaining hour of the resync, or shorten it by restarting the
   controller that owns the setting:

   ```bash
   kubectl -n longhorn-system rollout restart daemonset/longhorn-manager
   ```

   **Trap, carried from [12](12-longhorn-critical-tier.md):** `longhorn-manager`'s DaemonSet
   ships `updateStrategy.rollingUpdate.maxUnavailable: 100%`, so this rolls all seven managers
   at once and leaves the cluster with no Longhorn control plane for ~90 s. That is acceptable
   in a fully-quiesced window and is *not* acceptable at any other time.

3. Re-run both verification commands at the top of this section. Both must be green — the
   Setting's `status.applied: true` **and** the `last-applied-tolerations` annotation
   containing the key — before the talconfig flip.

4. Only then flip `allowSchedulingOnControlPlanes` and un-quiesce.

**Or: don't take the taint path at all.** §6 gives two runbooks. **Path B needs no taint and
no talconfig change**, so it is not blocked by any of this and is what the first rehearsal
should use. Path A (the taint) is a permanent structural improvement and is what §4 designs,
but it is gated on this section and should not be rushed to get a rehearsal done.

### 0.2 — BLOCKER: piece 12 has not landed; storage placement is unconstrained

```bash
kubectl get nodes.longhorn.io -n longhorn-system \
  -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags,ZONE:.spec.zone
kubectl get sc
kubectl get settings.longhorn.io -n longhorn-system replica-replenishment-wait-interval \
  -o custom-columns=VALUE:.value,APPLIED:.status.applied
```

Live, 2026-08-19: **every node's `tags` is `[]` and every `zone` is unset**; every disk's
`tags` is `[]`; the StorageClasses are `longhorn` (default), `longhorn-cache`,
`longhorn-local`, `longhorn-snapshot`, `nfs-csi`, `openebs-hostpath` — **there is no
`longhorn-critical`**, and the default `longhorn` class carries no `nodeSelector` parameter.
`replica-replenishment-wait-interval` is `600` and *is* applied.

Two consequences, both fatal to a low-power window:

- **Tier-1 data is not on the control planes.** §5 has the live replica map. Not one Tier-1
  volume has three control-plane replicas, and one Tier-1-adjacent volume (`golink`) has
  **zero**.
- **Ten minutes into the window, Longhorn starts rebuilding Tier-2 volumes onto the control
  planes.** `replica-replenishment-wait-interval: 600` means that 600 s after the workers go
  dark, Longhorn treats every Tier-2 volume as short a replica and replenishes it onto
  whichever node has room — which, with the workers off, is only the three control planes.
  Their Longhorn disk is a Transcend TS1TMTS425S SATA; piece 12 measured 126 ms and 470 ms
  average write latency and 73–75 °C on those drives under exactly this kind of rebuild load,
  and `pegasus` has previously shut its XFS filesystem down at 85 °C mid-rebuild. A planned
  low-power event would become an unplanned outage, silently, ten minutes in.

Piece 12 Step 3 (a `nodeSelector: "bulk"` on the default class) is the fix, and it is the step
[12](12-longhorn-critical-tier.md) itself flags as "the one that matters most and is easiest to
skip." **Do not build a runbook workaround for this** — §6 Path B's Tier-2 scale-to-0 reduces
the exposure but does not remove it, because a scaled-down volume is still a volume Longhorn
will replenish.

### 0.3 — BLOCKER: Tier-1 DNS cannot run on a control plane at all

This one is new to this revision and is not a Longhorn problem. `technitium` — the estate's
LAN resolver, the most Tier-1 thing in the tier — is **hard-pinned to a node set that contains
no control plane**, by two independent mechanisms:

```bash
kubectl -n network get deploy technitium \
  -o jsonpath='{.spec.template.spec.nodeSelector}'          # {"technitium-dns":"true"}
kubectl get nodes -L technitium-dns                          # only hard-hat carries it
kubectl -n network get network-attachment-definitions technitium-dns-net \
  -o jsonpath='{.spec.config}'                               # "master": "enp2s0"
```

1. **`nodeSelector: technitium-dns=true`.** Exactly one node carries that label — `hard-hat`,
   which piece 19 turned into a **worker** on 2026-08-17. The label is set in
   `talos/talconfig.yaml` and the comment beside it still reads *"That node is a control plane
   node, so tolerate the NoSchedule taint"* — stale since the rotation.
2. **The ipvlan L2 NetworkAttachmentDefinition hardcodes `"master": "enp2s0"`.** Relabelling a
   control plane would place the pod there and then fail at CNI time, because the control
   planes' LAN NIC is **`enp3s0`**, not `enp2s0`.

Verified per node with `talosctl … get links` / `get addresses`, 2026-08-19:

| Node | Role | LAN NIC | MAC | Can host `technitium-dns-net`? |
|---|---|---|---|---|
| `milky-way` | control plane | `enp3s0` | `e0:51:d8:19:93:18` | **no** |
| `othalla` | control plane | `enp3s0` | `e0:51:d8:19:d4:98` | **no** |
| `pegasus` | control plane | `enp3s0` | `e0:51:d8:19:d2:b2` | **no** |
| `hard-hat` | worker | `enp2s0` | `58:47:ca:79:ed:0d` | yes (and is the labelled node today) |
| `fluttershy` | worker | `enp2s0` | `58:47:ca:7a:09:3d` | yes |
| `kerfuffle` | worker | `enp2s0` | `58:47:ca:7a:07:b4` | yes |
| `shining-armor` | worker | `ens18` | `bc:24:11:4c:62:fc` | **no** — Proxmox VM, different NIC name |

So powering off the four workers takes the estate's in-cluster LAN resolver with it, no matter
what piece 12 does to its storage. **This is a design gap, not a runbook step**, and it needs a
decision before the first rehearsal. Three candidate fixes, none of them free:

- **(a) A second NAD + a second label for the control planes.** Add
  `technitium-dns-net-cp` with `"master": "enp3s0"` and a `technitium-dns-cp=true` label on
  the trio, then run a second, CP-resident Technitium replica joined to the same Technitium
  cluster. Costs a second static LAN address out of the Cilium pool's reserved range and a
  second cluster member to keep in sync. Most faithful to D6.
- **(b) Serve DNS through the Cilium LoadBalancer VIP instead of ipvlan on the CP copy.**
  Verified viable on the network side: the `CiliumL2AnnouncementPolicy` matches interfaces
  `^ens[0-9]+`, `^enp[0-9]+s[0-9]+`, `^eth[0-9]+` with `nodeSelector: kubernetes.io/os=linux`,
  so `enp3s0` announces LB IPs fine — this is also why `chrony`/`mosquitto`/`matter`'s VIPs are
  *not* blocked (see §1). The cost is that DNS then traverses the LB path the NAD exists
  specifically to bypass.
- **(c) Accept an off-cluster resolver as the low-power DNS answer.** The repo carries a
  reusable `docker/_common/technitium/` stack (Tailscale sidecar, `hostname: dns-${CLUSTER_KEY}`,
  ports 53/udp) intended to run a Technitium cluster member per Dockge host — but **no Dockge
  host deploys it today**: `docker/{celestia,luna,skystar,alpha-site}/` contain no `technitium`
  stack. If a second resolver exists outside this repo, this option is nearly free and (c) is
  the answer; if it does not, (c) is not an option at all. **Needs David's confirmation** —
  §9 item 1.

Until one of these lands, a low-power window means the estate has no in-cluster resolver, and
"the wife's lights" depend on whatever Home Assistant can reach without one.

### 0.4 — Not a blocker, but confirm before entry

- `allowSchedulingOnControlPlanes: true` is still set (`talos/patches/controller/cluster.yaml:2`).
  That is *correct* for now: nothing should flip it until §0.1 is green. Path B in §6 works
  with it left as-is.
- [07-authentik-to-alpha-site.md](07-authentik-to-alpha-site.md) has landed (README's status
  table: cut over 2026-08-16). This is what lets CNPG drop to Tier 2 at all — see §2. If it
  had not landed, entering low-power would take SSO down with the database.
- Every Flux Kustomization is `Ready`. Live 2026-08-19: **160 of 160**, none suspended except
  the deliberately-suspended `database/{postgres,pg-backups}`, `kube-system/{openbao,openbao-replica}`
  and `equestria/xcproxy`. Entering low-power on top of an already-failing reconcile makes the
  post-window diff unreadable.

---

## 1. The tiers — explicit membership, verified live 2026-08-19

**Tier 0 — cluster platform (mandatory).** Namespaces `kube-system` (except the Tier-2 items
called out below), `longhorn-system`, `cert-manager`, `nfs-system`, `flux-system`,
`cloudnative-pg` (the *operator*, not the cluster it manages — §2), `volsync-system`,
`openebs-system`.

Named components: `cilium` + `cilium-operator` · `coredns` · `external-secrets` (+ webhook,
cert-controller, reloader) · `onepassword-connect` (+ operator) · `reflector` · `reloader` ·
`metrics-server` · `snapshot-controller` · `spegel` · `registry` · `multus` · Longhorn
(manager, CSI, engine images, instance-managers, share-managers) · `csi-driver-nfs` ·
`cert-manager` + `trust-manager` · `cloudnative-pg` operator · `flux-operator` + the four Flux
controllers · `volsync` · `openebs` localpv.

- **`onepassword-connect` stays in Tier 0** even though 1Password no longer sources any secret.
  Re-verified 2026-08-19: `kubernetes/apps/kube-system/external-secrets/stores/ks.yaml:25-29`
  still lists `onepassword-connect` as a `dependsOn` of the `external-secrets-stores`
  Kustomization, which `openbao`'s own Kustomization transitively depends on. Dropping it from
  Tier 0 without removing that edge means OpenBao cannot boot at exit.
- **`openbao` is deliberately not Tier 0 or Tier 1** — §2.

**Tier 1 — estate services.** Namespaces `network`, `stargate-command`, `tailscale-system`.

Per-app, with its storage and where it actually runs today:

| App | Namespace | Pod node (live) | PVC | StorageClass | Longhorn replicas (live) |
|---|---|---|---|---|---|
| `technitium` (DNS) | `network` | `hard-hat` | `technitium` 5 Gi | `longhorn` | `fluttershy`, `hard-hat`, `pegasus` — **degraded** |
| `technitium-dns` (external-dns provider) | `network` | `hard-hat` | — | — | — |
| `k8s-gateway` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `traefik` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `cloudflare-dns` | `network` | `hard-hat` | — | — | — |
| `cloudflare-tunnel` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `unifi-dns` | `network` | `hard-hat` | — | — | — |
| `error-pages` | `network` | `hard-hat`, `shining-armor` | — | — | — |
| `chrony` (NTP) | `stargate-command` | `fluttershy` | — | — | — |
| `mosquitto` (MQTT) | `stargate-command` | `shining-armor`, `hard-hat` | `data-mosquitto-{0,1}` 4 Gi | `longhorn` | `-0`: `milky-way`,`pegasus`,`shining-armor` · `-1`: `hard-hat`,`milky-way`,`othalla` — both **degraded** |
| `home-assistant` | `stargate-command` | `hard-hat` | `home-assistant` 40 Gi | `longhorn` | `hard-hat`, `milky-way`, `othalla` — **degraded** |
| `matter` | `stargate-command` | `shining-armor` | `matter` 4 Gi | `longhorn` | `fluttershy`, `pegasus`, `shining-armor` — healthy |
| `tailscale-operator` + connectors | `tailscale-system` | `shining-armor`, `hard-hat` | — | — | — |
| `tsidp` | `tailscale-system` | `hard-hat` | `tsidp` 5 Gi | `longhorn` | `hard-hat`, `milky-way`, `pegasus` — **degraded** |
| `tsiam` | `tailscale-system` | `fluttershy` | `tsiam` 1 Gi | `longhorn` | `fluttershy`, `othalla`, `shining-armor` — healthy |

Three corrections this table forces:

- **`tsidp` is no longer free.** The pre-19 text described it as "a one-line `ExternalName`
  Service in `apps/tailscale-system/services/tailscale.yaml`". It is now a real Deployment
  under `kubernetes/apps/tailscale-system/idp/` with a 5 Gi Longhorn PVC, cut over 2026-08-15.
  It also carries a **hard anti-affinity excluding `othalla`**
  (`idp/tsidp.yaml:40-48`, `kubernetes.io/hostname NotIn [othalla]`) — a Tier-1 workload that
  structurally cannot use one of the three control planes. Copied verbatim from
  equestria-cluster during piece 21; confirm whether it is still needed before Tier-1
  placement is pinned.
- **`chrony`, `mosquitto` and `matter` are LoadBalancer-fronted, and that is fine on the trio.**
  `chrony` uses `io.cilium/lb-ipam-ips: ${CHRONY_VIP}`, `mosquitto` and `matter` share
  `${AUTOMATION_VIP}`. The `CiliumL2AnnouncementPolicy` selects interfaces matching
  `^enp[0-9]+s[0-9]+` on all Linux nodes, which the control planes' `enp3s0` satisfies. VIP
  announcement is **not** a low-power blocker. (Unlike Technitium's ipvlan NAD — §0.3.)
- **`matter` sets `hostNetwork: true`.** It runs on whichever node it lands on and needs its
  ports free there; it has no node pin today. Tier call still open — §9 item 4.

**Tier 2 — dropped in low-power.** Namespaces `equestria` (56 pods: media stack, immich, n8n,
windmill, romm, …), `github-actions`, `coder`, `database` (CNPG shared postgres + valkey),
`system-upgrade`; plus, inside `kube-system`: `openbao`, `openbao-replica`, `headlamp`,
`descheduler`, `node-feature-discovery`, and the AMD/Intel/NVIDIA device plugins.

> **Amended by [24-power-states.md](24-power-states.md) §1, 2026-08-13.** `observability`
> (prometheus, loki, tempo, thanos, grafana, alloy — 46 pods live) and `pulumi` (7 pods) move
> **back to Tier 1** and stay up during Battery. This file's original reasoning for dropping
> them (alpha-site covers observability externally; Pulumi is not usefully runnable during an
> outage) is preserved in §7, not as current tier assignment. §3 costs the amendment with a
> fresh measurement, which is what 24 §"Open items" item 4 asked for.

---

## 2. OpenBao and CNPG during low-power

**The decision stands: OpenBao goes dark, CNPG goes dark.** Two of the three arguments the
pre-19 text used to justify it are now factually wrong, so the decision is re-derived here
from what is actually true.

**Still true, and it is the load-bearing argument:** there is no hot path to OpenBao. Every
consumer is one hop removed — app → mounted env/volume → `Secret` → ESO → OpenBao. Nothing in
the tree uses a Vault CSI driver, a `vault-agent` sidecar, or an in-app client dialling
OpenBao directly. Existing Kubernetes `Secret`s, already synced by ESO before the window
opened, keep working; ESO's reconcile loop fails to refresh them and sets a
`SecretSyncedError` condition but does **not** delete or blank an already-synced `Secret`.
Pods that restart mid-window read the cached `Secret` from the API server. The cost of
option (a) is "no secret rotation for 3–4+ hours," which is a good trade.

**No longer true (1): "no OpenBao pod runs on a future-critical node."**

```bash
kubectl -n kube-system get pods -l app.kubernetes.io/name=openbao \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName
```

Live 2026-08-19: `openbao-0` → `shining-armor`, `openbao-1` → `hard-hat`, **`openbao-2` →
`milky-way`**. OpenBao has no pod anti-affinity, so the scheduler put one replica on a control
plane. It has no storage of its own (its backend is the shared CNPG postgres), so this is not
a pinning problem — but the claim that the taint excludes OpenBao "by construction, not by
luck" was only ever true because of where the scheduler happened to have placed it. After the
§0.1 taint lands, `openbao-2` keeps running on `milky-way` (`NoSchedule` does not evict) and
migrates off the trio the first time it is recreated. That is the desired end state; it just
is not the current one.

**No longer true (2): "a CNPG instance can never be on a control plane."**

```bash
kubectl -n database get pods -o custom-columns=N:.metadata.name,NODE:.spec.nodeName,ROLE:.metadata.labels.cnpg\\.io/instanceRole
kubectl get pv pvc-cf9e7127-5ffd-4073-8a29-9c9ee638c690 \
  -o jsonpath='{.spec.nodeAffinity.required.nodeSelectorTerms[*].matchExpressions[*].values[*]}'
```

Live 2026-08-19: `postgres-1` (replica) → `fluttershy`, `postgres-2` (**primary**) →
`shining-armor`, **`postgres-3` (replica) → `othalla`**, whose PV `nodeAffinity` is hard-pinned
to `othalla`. Piece 19's strict-local relocation put a CNPG instance on a control plane and it
cannot move without `kubectl cnpg destroy` + re-provision.

This makes "keep Postgres up during low-power" *mechanically* possible in a way it was not
before — promote `postgres-3` on `othalla`, run single-instance for the window, let
`postgres-1`/`-2` resync on exit — and it is still **rejected**, for reasons that are now about
risk rather than impossibility:

- It converts a planned, reversible posture into one that includes a **primary promotion** and a
  3–4h single-instance window with no HA, on the estate's slowest disk.
- WAL retention during the window is bounded but not free: `max_slot_wal_keep_size = 10GB` on a
  40 Gi `longhorn-local` PVC, with two replication slots inactive for the duration. That cap is
  what keeps this from being the stuck-slot cascade that previously filled every PVC in
  `database` and took authentik down — but it means the two absent replicas may need a full
  base backup rather than a WAL catch-up on exit, which is a rebuild on the SATA disk at exactly
  the moment §6's exit is trying to stay calm.
- It buys nothing Tier 1 needs. Nothing in Tier 0 or Tier 1 reads Postgres during the window.

**Consequence for the §0.1 taint that is worth stating explicitly:** `postgres-3` has no
control-plane toleration. Once the taint lands, it keeps running (NoSchedule) but **cannot be
recreated on `othalla`** — and its PV can go nowhere else. Any CNPG rolling restart, node
reboot or `primaryUpdateStrategy: unsupervised` upgrade after the flip strands it. Either give
the CNPG cluster the toleration in the same change as the taint, or `kubectl cnpg destroy
postgres-3` and let it re-provision onto a worker first. **This must be decided in the same
change as the talconfig flip, not after it.**

**What quietly pauses, and why that is fine.** `openbao-replica`'s nightly `pg_dump` (03:00)
and monthly restore-test CronJobs depend on `openbao` and therefore on CNPG; both go idle.
Their Gatus heartbeats on alpha-site (`docker/alpha-site/uptime/config/openbao-break-glass.yaml`)
tolerate 26 h (dump) and 792 h/33 d (restore-test) of silence, so a 3–4 h window trips neither,
even straddling 03:00.

---

## 3. Does it fit — capacity, re-measured live 2026-08-19

The allocatable figure is unchanged from the 2026-07-31 measurement because it is the same
three machines:

```bash
kubectl get nodes -o custom-columns='NAME:.metadata.name,CPU:.status.allocatable.cpu,MEM:.status.allocatable.memory,PODS:.status.allocatable.pods'
```

| Node | Allocatable CPU | Allocatable memory | Pod cap |
|---|---|---|---|
| `milky-way` | 3950m | 14.85 GiB | 220 |
| `othalla` | 3950m | 14.85 GiB | 220 |
| `pegasus` | 3950m | 14.85 GiB | 220 |
| **trio total** | **11.85 cores** | **44.55 GiB** | 660 |

Demand, measured from live pod `requests` and projected onto a CP-only cluster. Per-node
components (DaemonSets, `instance-manager`) are counted at their **current control-plane**
values rather than scaled from worker values, because they size against node CPU — Longhorn's
`guaranteedInstanceManagerCpu` yields 2.39 cores per instance-manager on a 20-core worker and
0.47 on a 4-core control plane, so scaling the worker number would have overstated demand by
several cores:

| | Pods | CPU requests | Memory requests |
|---|---|---|---|
| Tier 0 + Tier 1 already resident on the trio | 68 | 4.58 | 11.73 GiB |
| Tier 0 that must move in from workers (non-DaemonSet) | 42 | 1.43 | 2.42 GiB |
| Tier 1 that must move in from workers (non-DaemonSet) | 31 | 1.16 | 3.42 GiB |
| **Projected total — this file's tiers** | **141** | **7.18 / 11.85 (61 %)** | **17.57 / 44.55 GiB (39 %)** |
| plus `observability` + `pulumi` ([24](24-power-states.md) §1) | +18 | +1.23 | +5.49 GiB |
| **Projected total — with 24's amendment** | **159** | **8.40 / 11.85 (71 %)** | **23.07 / 44.55 GiB (52 %)** |

**Verdict: it fits, but CPU — not memory — is the tight axis**, which inverts the pre-19
text's "roughly 2× headroom on both axes." With 24's amendment the trio runs at ~71 % of
allocatable CPU in requests alone, before any burst, before etcd (a Talos host service,
invisible to `kubectl top` — §9 item 5), and before the exit-storm write load §6 warns about.
24's "≈7.4 GiB additional" estimate is confirmed as ≈5.5 GiB of requests here; it is the
**1.23 cores** that deserve the attention.

The single largest Tier-1 mover is `home-assistant` at 260m / 1.14 GiB. The largest
24-amendment movers are `thanos-receive-0` (200m / 2.00 GiB) and `prometheus-prometheus-0`
(130m / 1.06 GiB) — if the window ever needs CPU back, those two are the first candidates to
re-drop to Tier 2, not Home Assistant.

Pod count is not a constraint: 159 across three nodes against a 660 cap.

---

## 4. Placement mechanism — taint, required affinity, PriorityClass (Path A)

> This section designs the **permanent** structural version of low-power. It is gated on §0.1
> and should not be rushed. §6 Path B rehearses the mode without any of it.

> **Superseded in part by [24-power-states.md](24-power-states.md), 2026-08-13.** Everything
> here still applies to Tier 0 (DaemonSets — toleration only) and to Tier-1 workloads that
> genuinely should be permanently CP-resident. 24 moves Tier-1 *applications* (Home Assistant
> named explicitly) to a float-on-worker / relocate-on-Battery model with a new
> `longhorn-controlplane` StorageClass instead of the permanent pin below. The relocation
> trigger is still an open item in 24.

**Label + taint** on the three control planes, via Talos machine config, following the existing
`nodeLabels` anchor pattern in `talos/talconfig.yaml`:

```yaml
# talos/talconfig.yaml — on each of milky-way / othalla / pegasus
    nodeLabels:
      <<: *nodeLabels
      node-role.driscoll.tech/critical: "true"
    nodeTaints:
      node-role.driscoll.tech/critical: "true:NoSchedule"
```

**Using a custom taint key does not route around §0.1.** Longhorn's system-managed components
would need to tolerate `node-role.driscoll.tech/critical` too, and the only way to give them a
toleration is the same `taint-toleration` Setting, behind the same all-volumes-detached gate.
Whichever key is chosen, the quiesce window in §0.1 is required. The advantage of a custom key
is only that it decouples the taint from `allowSchedulingOnControlPlanes`, letting the two land
in separate changes.

Every Tier-0 and Tier-1 workload gets **both**:

```yaml
tolerations:
  - key: node-role.driscoll.tech/critical
    operator: Equal
    value: "true"
    effect: NoSchedule
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: node-role.driscoll.tech/critical
              operator: In
              values: ["true"]
```

DaemonSets that must cover every node — `cilium`, `node-exporter`, `smartctl-exporter`,
`spegel`, `csi-nfs-node`, `alloy`, `crowdsec-agent`, Longhorn's manager/CSI/engine-image — get
the **toleration only, never the affinity**. Per §0.1's audit, five already tolerate anything
by blanket `operator: Exists`, twelve carry the explicit key from #912, and three are waiting
on the Setting.

**Three workloads need an explicit decision before the affinity is applied**, because they
cannot satisfy it as written:

| Workload | Why it cannot | Options |
|---|---|---|
| `technitium` | `nodeSelector: technitium-dns=true` + ipvlan `master: enp2s0` (§0.3) | §0.3 (a)/(b)/(c) |
| `tsidp` | hard anti-affinity `hostname NotIn [othalla]` | drop the exclusion, or accept 2-of-3 CP placement |
| `postgres-3` | `longhorn-local` PV pinned to `othalla`, no toleration (§2) | toleration in the same change, or destroy + re-provision on a worker first |

**PriorityClass.** Live classes today:

```bash
kubectl get priorityclass -o custom-columns=NAME:.metadata.name,VALUE:.value
```

| Class | Value | Owner |
|---|---|---|
| `system-node-critical` | 2000001000 | Kubernetes |
| `system-cluster-critical` | 2000000000 | Kubernetes |
| `longhorn-critical` | 1000000000 | the Longhorn chart (`defaultSettings.priorityClass`) |
| `observability-critical` | 1000 | `kubernetes/apps/observability/priority-class/` |

Add `critical-tier` between them:

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: critical-tier
description: Tier 0/1 low-power workloads — DNS, NTP, MQTT, Home Assistant, ingress, cluster platform.
value: 100000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
```

`100000` sits above every application-tier class and every unset (`0`) pod, and below
Kubernetes' own two and Longhorn's. That answers comment-5 §9's "above or below
`system-cluster-critical`?" with **below**. Priority governs preemption under contention, not
placement — with workers off, Tier-2 pods just go `Pending`. Its value is for the case where a
control plane is *lost* mid-window and the survivors must evict the right things.

**Note the name is close to but distinct from the chart's `longhorn-critical`, and piece 12's
`longhorn-critical` StorageClass is a third, unrelated object with the same string.** Three
different resources, three different kinds; do not assume a `kubectl get` of one tells you
anything about the others.

**Correction to make in the same change:** `home-assistant`, `mosquitto` and `chrony` all set
`priorityClassName: system-cluster-critical` today
(`kubernetes/apps/stargate-command/{home-assistant/helmrelease.yaml:42,mosquitto/helmrelease.yaml:78,chrony/helmrelease.yaml:40}`,
verified 2026-08-19 — the pre-19 text named only Home Assistant). That is a Kubernetes
system-reserved class handed to three application pods, letting them preempt genuine
control-plane components on a 4-core node. Move all three to `critical-tier`.

---

## 5. Storage placement — the live picture

Owned by [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md): tag the trio `critical`
and the four workers `bulk`, add a `longhorn-critical` StorageClass (`numberOfReplicas: "3"`,
`nodeSelector: "critical"`), and — the step that makes this safe by construction — add
`nodeSelector: "bulk"` to the **default** `longhorn` class so no Tier-2 volume can place or
replenish onto a control-plane disk. 12 also settles "which three": `critical` stays on the
control planes despite their being the slower disks, because Tier 1 is only ~68 GB of low-IOPS
data, and because the real problem was never that `critical` points at slow disks but that
nothing points Tier 2 *away* from them.

**This file's job is what depends on it.** Here is the state a low-power window would meet
today, reproduced with:

```bash
kubectl get replicas.longhorn.io -n longhorn-system \
  -o custom-columns=VOL:.spec.volumeName,NODE:.spec.nodeID,STATE:.status.currentState
```

| Volume | Replica nodes | Replicas on the CP trio | Survives all four workers off? |
|---|---|---|---|
| `stargate-command/home-assistant` | `hard-hat`, `milky-way`, `othalla` | 2 | yes, degraded |
| `stargate-command/data-mosquitto-0` | `milky-way`, `pegasus`, `shining-armor` | 2 | yes, degraded |
| `stargate-command/data-mosquitto-1` | `hard-hat`, `milky-way`, `othalla` | 2 | yes, degraded |
| `tailscale-system/tsidp` | `hard-hat`, `milky-way`, `pegasus` | 2 | yes, degraded |
| `kube-system/registry` (Tier 0) | `hard-hat`, `milky-way`, `othalla` | 2 | yes, degraded |
| `database/valkey` (Tier 2) | `hard-hat`, `othalla`, `pegasus` | 2 | n/a |
| `network/crowdsec-config-pvc` | `hard-hat`, `othalla`, `pegasus` | 2 | yes, degraded |
| `network/technitium` | `fluttershy`, `hard-hat`, `pegasus` | **1** | **single replica, and the pod cannot run there anyway (§0.3)** |
| `stargate-command/matter` | `fluttershy`, `pegasus`, `shining-armor` | **1** | **single replica** |
| `network/crowdsec-db-pvc` | `fluttershy`, `hard-hat`, `milky-way` | **1** | **single replica** |
| `tailscale-system/tsiam` | `fluttershy`, `othalla`, `shining-armor` | **1** | **single replica** |
| `tailscale-system/taildrive` | `hard-hat`, `othalla`, `shining-armor` | **1** | **single replica** |
| `tailscale-system/golink` | `fluttershy`, `hard-hat`, `shining-armor` | **0** | **NO — volume unavailable for the whole window** |

**Not one Tier-1 volume has three control-plane replicas.** Five have exactly one — meaning a
single control-plane disk failure during the window loses the volume outright — and `golink`
has none at all. This is precisely the "silently takes Tier-1 volumes with them" failure the
pre-19 text warned about, now measured rather than predicted. `golink` was already flagged as
a marginal Tier call (§9 item 4); this measurement argues for resolving it as **Tier 2**
rather than trying to fix its placement.

**31 of 204 volumes are `degraded` right now**, a tail of piece 19's rebuilds still settling.
That is a *pre-flight gate*, not a low-power condition: §6's pre-check requires zero.

**Longhorn policy settings that shape the window** (live values, `values.yaml` re-verified
2026-08-19):

| Setting | Value | What it does during the window |
|---|---|---|
| `nodeDrainPolicy` | `allow-if-replica-is-stopped` | Never engages — this runbook does not `kubectl drain` |
| `nodeDownPoddeletionPolicy` | `Delete-both-statefulset-and-deployment-pod` | **Does** engage: once node-down detection fires on a powered-off worker, Longhorn actively deletes its Tier-2 pods. Controllers recreate them, they find nowhere to go, they sit `Pending` |
| `replica-replenishment-wait-interval` | `600` | 10 minutes in, Tier-2 rebuilds start targeting the trio — §0.2 |
| `concurrentReplicaRebuildPerNodeLimit` | `2` | Lowered from 5 for these SATA disks ([12](12-longhorn-critical-tier.md), PR #939). Governs the exit storm |

Expect a wall of `Pending` Tier-2 pods during the window. That is this policy doing what it
now does, not a problem — and it is strictly better than the `Terminating` limbo the older
policy produced. §6 Path B pre-empts most of it by scaling Tier 2 to 0 before the workers go
down.

---

## 6. Entering and leaving low-power mode

Two runbooks. **Path B is what the first rehearsal uses**, because Path A is gated on §0.1.

| | Path A — taint | Path B — suspend + scale |
|---|---|---|
| Requires §0.1 green | **yes** | no |
| Requires a talconfig change | yes | no |
| Requires §0.2 (piece 12) | yes | yes |
| Requires §0.3 (DNS) | yes | yes |
| Tier-2 kept off the trio by | the taint, permanently | `flux suspend` + `scale --replicas=0`, per window |
| Entering involves rescheduling Tier 0/1 | no (already resident) | yes |
| Available today | no | yes |

### 6.0 Pre-flight — all must pass, in this order

```bash
# 1. Topology: 3 control-plane + 4 <none>, all Ready, no taints, none cordoned
kubectl get nodes -o wide
kubectl get nodes -o custom-columns='NAME:.metadata.name,TAINTS:.spec.taints,UNSCHED:.spec.unschedulable'

# 2. etcd: 3 members, all healthy, no alarms
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10 etcd members
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10,10.10.209.11,10.10.209.12 etcd status
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10 etcd alarm list

# 3. Zero degraded Longhorn volumes cluster-wide  (must print 0)
kubectl get volumes.longhorn.io -n longhorn-system \
  -o custom-columns=ROBUST:.status.robustness --no-headers | grep -c degraded

# 4. Every Tier-1 volume has >= 2 replicas on the trio  (see the §5 table for the shape)
kubectl get replicas.longhorn.io -n longhorn-system \
  -o custom-columns=VOL:.spec.volumeName,NODE:.spec.nodeID,STATE:.status.currentState

# 5. Piece 12 landed: default class confined to bulk, longhorn-critical exists
kubectl get sc longhorn -o jsonpath='{.parameters.nodeSelector}{"\n"}'    # must be: bulk
kubectl get sc longhorn-critical -o name                                   # must exist
kubectl get nodes.longhorn.io -n longhorn-system \
  -o custom-columns=NAME:.metadata.name,TAGS:.spec.tags

# 6. Longhorn taint-toleration — Path A only, both must be green
kubectl get settings.longhorn.io -n longhorn-system taint-toleration \
  -o custom-columns=VALUE:.value,APPLIED:.status.applied
kubectl -n longhorn-system get ds longhorn-csi-plugin \
  -o jsonpath='{.metadata.annotations.longhorn\.io/last-applied-tolerations}{"\n"}'

# 7. Flux fully reconciled (must print nothing)
flux get kustomizations -A --status-selector ready=false

# 8. DNS answer for the window is decided (§0.3) and reachable from a control plane
kubectl -n network get deploy technitium -o jsonpath='{.spec.template.spec.nodeSelector}{"\n"}'

# 9. alpha-site is up and on the battery circuit (§7)
curl -fsS https://uptime.driscoll.tech/api/v1/endpoints/statuses >/dev/null && echo gatus-ok
```

### 6.1 Enter

**Step 1 — freeze Flux for Tier 2.** This stops Flux fighting the `Pending` pods and stops it
reconciling unrelated Tier-2 drift mid-window. It does not stop the `nodeDownPoddeletionPolicy`
behaviour in §5, which is controller-level.

```bash
flux -n equestria      suspend kustomization --all
flux -n github-actions suspend kustomization --all
flux -n coder          suspend kustomization --all
flux -n database       suspend kustomization --all
flux -n kube-system    suspend kustomization headlamp descheduler openbao openbao-replica \
                                             node-feature-discovery amd-device-plugin \
                                             intel-device-plugin-gpu intel-device-plugin-operator \
                                             nvidia-device-plugin
```

> **Trap:** the `technitium` Kustomization lives in the **`equestria`** Flux namespace even
> though it targets `network` (`kubernetes/apps/equestria/dns/technitium/ks.yaml`), so
> `--all` above suspends a Tier-1 app's reconcile. Harmless (suspension does not scale
> anything), but note it so the resume in §6.2 is not read as a mistake.

**Step 2 — scale Tier 2 to zero.** This is what actually frees the capacity §3 budgets and
detaches Tier-2 volumes so their pods are not competing for a control-plane instance-manager.

```bash
for ns in equestria github-actions coder; do
  kubectl -n $ns scale deployment,statefulset --all --replicas=0
done
kubectl -n kube-system scale statefulset openbao --replicas=0
kubectl -n kube-system scale deployment headlamp --replicas=0
kubectl cnpg hibernate on postgres -n database        # CNPG has no scale-to-0; plugin v1.26.0 verified present
kubectl -n database scale deployment valkey --replicas=0
```

Verify nothing Tier-2 is left running, and that the Tier-1 set is untouched:

```bash
kubectl get pods -A --field-selector status.phase=Running \
  -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,NODE:.spec.nodeName | sort
```

**Step 3 — move Tier 1 onto the control planes (Path B only).** Under Path A this step does
not exist: the required affinity already put them there. Under Path B, cordon first so the
reschedule cannot land back on a worker, then delete the Tier-1 pods that are on workers and
let them reschedule:

```bash
kubectl cordon hard-hat fluttershy kerfuffle shining-armor
kubectl -n stargate-command delete pod -l app.kubernetes.io/name=home-assistant
kubectl -n stargate-command rollout restart statefulset mosquitto
kubectl -n stargate-command delete pod -l app.kubernetes.io/name=chrony
kubectl -n tailscale-system delete pod -l app.kubernetes.io/name=tsidp
# technitium is NOT in this list — it cannot move (§0.3). Follow whichever
# §0.3 option was chosen instead.
kubectl -n network rollout restart deployment traefik k8s-gateway error-pages \
                                              cloudflare-dns cloudflare-tunnel unifi-dns
```

Wait for each to be `Running` on a control plane and for its Longhorn volume to re-attach
there before continuing. A Tier-1 volume with only one trio replica (§5) re-attaches from that
single replica — confirm `robustness` before proceeding, not after.

**Step 4 — power off the workers, one at a time.**

```bash
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.206.14 shutdown   # hard-hat
```

Between **each** node, all three must hold:

```bash
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10 etcd members   # still 3, healthy
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --brief                    # OK
kubectl get volumes.longhorn.io -n longhorn-system \
  -o custom-columns=ROBUST:.status.robustness --no-headers | sort | uniq -c
```

Order: `shining-armor`, then `kerfuffle`, then `fluttershy`, then `hard-hat` **last** — hard-hat
carries the most Tier-1 pods and the `technitium-dns` label, so it is the node whose loss is
most visible; taking it last leaves the longest window to abort. Do **not** `kubectl drain`:
the nodes are about to lose power anyway, and a drain only adds a step that can hang on a
`PodDisruptionBudget` at zero allowed disruptions.

**Step 5 — post-check.** Not "did it come up" but "does the estate work":

```bash
dig @${TECHNITIUM_VIP} +short home-assistant.driscoll.tech      # or the §0.3 replacement
sntp -t 2 ${CHRONY_VIP}
mosquitto_sub -h ${AUTOMATION_VIP} -t '$SYS/broker/uptime' -C 1
curl -fsS -o /dev/null -w '%{http_code}\n' https://home-assistant.driscoll.tech
curl -fsS https://uptime.driscoll.tech/api/v1/endpoints/statuses | jq -r '.[] | select(.results[-1].success==false) | .name'
```

Repeat the post-check at the **1 h, 2 h and 3–4 h marks**, not only at entry. §8's gate depends
on it.

### 6.2 Exit — the dangerous direction

**Correction to the pre-19 exit path: three of the four workers are bare metal.** The MAC-OUI
inference that put `hard-hat` in the "Proxmox VM, start it with `qm start`" column does not
survive live inspection:

```bash
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.206.14 get links
```

`hard-hat` has exactly one physical NIC — `enp2s0`, MAC `58:47:ca:79:ed:0d`, the same Intel
UN1290-class OUI as `fluttershy` and `kerfuffle`. `talos/talconfig.yaml:170` names
`bc:24:11:11:7d:6a` in hard-hat's `deviceSelector`, and **that MAC does not exist on the node**;
the address arrives at `layer: platform` and the selector resolves to a phantom `ethSel0`.
Two things follow: hard-hat is **bare metal**, which settles the README's open "hard-hat's VM
status is genuinely ambiguous" question in the other direction from the July text; and
hard-hat's talconfig network block is stale and should be corrected by whoever owns
[19](19-rotate-equestria-control-planes.md) — this piece only records the observation.

| Worker | Power-on path |
|---|---|
| `shining-armor` | Proxmox VM (`ens18`, `bc:24:11:4c:62:fc`) — `qm start` against whichever host holds it |
| `hard-hat` | **bare metal** — WoL or physical button |
| `fluttershy` | bare metal — WoL or physical button |
| `kerfuffle` | bare metal — WoL or physical button |

So the WoL question is **three of four workers**, not two. Unverified whether WoL is enabled in
BIOS on any of them — §9 item 2, and the rehearsal in §8 is where it gets answered.

**Exit sequence:**

1. Power on **one** worker. Reverse of the shutdown order: `hard-hat` first (it is the
   `technitium-dns` node, so restoring it restores DNS), then `fluttershy`, `kerfuffle`,
   `shining-armor`.
2. Before touching the next node, all four must hold:

   ```bash
   kubectl get node <worker>                                             # Ready
   kubectl -n kube-system exec ds/cilium -- cilium-dbg status --brief    # OK on that node
   kubectl -n longhorn-system get nodes.longhorn.io <worker> \
     -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'  # True
   kubectl get volumes.longhorn.io -n longhorn-system \
     -o custom-columns=ROBUST:.status.robustness --no-headers | grep -c degraded   # trending to 0
   ```

   Rebuilds run at `concurrentReplicaRebuildPerNodeLimit: 2` and the source disks are the SATA
   drives. Expect this to be slow. Slow is the design.
3. `kubectl uncordon <worker>` only after its Longhorn rebuild completes. Uncordoning early
   invites the scheduler to place pods on a node whose storage is still catching up.
4. After all four are back: reverse Step 2, then Step 1.

   ```bash
   kubectl cnpg hibernate off postgres -n database
   flux -n database       resume kustomization --all
   flux -n kube-system    resume kustomization headlamp descheduler openbao openbao-replica \
                                               node-feature-discovery amd-device-plugin \
                                               intel-device-plugin-gpu intel-device-plugin-operator \
                                               nvidia-device-plugin
   flux -n coder          resume kustomization --all
   flux -n github-actions resume kustomization --all
   flux -n equestria      resume kustomization --all
   ```

   Flux restores the Tier-2 replica counts on reconcile; do not hand-scale them back.
5. Final verification: zero degraded volumes, 160/160 Kustomizations `Ready`, no `Pending` or
   `Terminating` pods left over.

   ```bash
   kubectl get volumes.longhorn.io -n longhorn-system \
     -o custom-columns=ROBUST:.status.robustness --no-headers | sort | uniq -c
   flux get kustomizations -A --status-selector ready=false
   kubectl get pods -A --field-selector status.phase!=Running,status.phase!=Succeeded
   ```

**Why one at a time is non-negotiable.** This is the exact shape of the Cilium zombie-node
cascade that has already forced a physical power-cycle once: a node boots Cilium-not-ready →
its instance-manager goes `OutOfcpu` → Longhorn and CNPG wedge. Four nodes rejoining at once,
each triggering rebuilds and a burst of apiserver writes, is that failure mode turned up — and
during the window the only etcd members are the three control planes, whose NVMe does
**3.7 ms p50 / 13.7 ms p99** WAL fsync against the PNY SATA nodes' 0.74 / 3.9 ms
([19](19-rotate-equestria-control-planes.md), [17](17-nvme-replacement.md)) — permanently
outside etcd's <10 ms guidance. The rejoin write storm lands squarely on the weakest component
if this is rushed. **If a node comes back wrong, check nodes and taints first, not CNPG or
OpenBao.**

### 6.3 Rollback — abort at any point

Every step above is reversible, and there is no point of no return in this piece. Abort by
undoing in reverse:

| Aborted at | Rollback |
|---|---|
| After Step 1 (Flux suspended) | `flux resume kustomization` per §6.2 step 4. Nothing else changed |
| After Step 2 (Tier 2 scaled to 0) | `kubectl cnpg hibernate off postgres -n database`, then resume Flux — it restores every replica count from Git. Do not hand-scale |
| After Step 3 (cordon + Tier-1 moved) | `kubectl uncordon hard-hat fluttershy kerfuffle shining-armor`, then resume Flux. Tier-1 pods stay on the control planes until something restarts them; that is harmless and self-corrects |
| After Step 4, one or more workers off | Power the workers back on **one at a time** per §6.2. This is the same procedure as a normal exit |
| Path A only: taint applied, something broke | `kubectl taint nodes milky-way othalla pegasus node-role.driscoll.tech/critical-` removes it immediately from the live nodes; revert the talconfig change and re-apply so Talos does not put it back. **Removing the taint does not re-fix Longhorn** — if the §0.1 setting was still pending, any csi-plugin/engine-image pod already lost from a control plane needs the DaemonSet rolled after the taint is gone |

The one thing that is *not* cheaply reversible is a `postgres-3` destroy (§2) — that is a CNPG
re-provision and a full base backup over the SATA disk. Decide it before entry, not during.

---

## 7. alpha-site — load-bearing during low-power, and the open PoE question

[07](07-authentik-to-alpha-site.md) landed 2026-08-16, so alpha-site is not a bystander during
a low-power window — it is carrying identity for the entire estate. Its Dockge stacks,
verified 2026-08-19 (`docker/alpha-site/`):

`authentik` + `authentik-outpost` + `postgres` (identity) · `bao-transit` (the transit-seal key
OpenBao unseals against at exit) · `bao-standby` (break-glass Postgres replica) · `netbootxyz`
(how bare-metal nodes PXE-boot if a reinstall is needed mid-window) · `uptime` (Gatus,
`uptime.driscoll.tech` — the observability source for the window) · `prometheus` +
`prometheus-exporters` (scraping the estate from outside) · `backrest`/`backups` · `zwave`
(which is why Home Assistant is not node-pinned in the cluster — the radio hardware is here,
not on a Kubernetes node) · `neo4j`, `lmstudio`, `librespeed`, `openspeedtest`, `arcane-agent`.

This concentration is deliberate and already flagged in 07's design. Low-power is the scenario
that makes it matter: if alpha-site goes dark at the same moment as the cluster, this design
has produced **zero critical services**, not a minimum-critical tier.

**alpha-site is PoE-powered and whether its PoE switch is on the Pecron circuit is still
unverified.** This remains the single most important open item.

> *"Alpha site is a raspberry pi 4 that is poe powered, so it's downtime is dependent on the
> PoE switch it is getting powered by."* — [comment-6](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734)

If the switch is not on battery, a grid outage takes down identity, break-glass observability
and netboot at the exact moment the design assumes they are the things still standing. **The
cluster staying up while identity is dark is a failure of this design, not a success of it.**
Before the first rehearsal, confirm which UniFi PoE switch feeds `dockge-as` and whether that
switch's upstream is on the Pecron circuit.

**The original Tier-2 reasoning for `observability`, kept for the record.** This file
originally dropped `observability` to Tier 2 on the grounds that alpha-site's external
Prometheus/Gatus covers the window from outside. [24](24-power-states.md) §1 superseded that
and keeps it in Tier 1; §3 costs the change. Both remain true at once — alpha-site is the
*independent* observer and stays load-bearing regardless of what runs in-cluster, which is
exactly why the PoE question above is not softened by 24's amendment.

---

## 8. Rehearsal — without cutting any power

The exit gate is a **real** full-workers-down cycle for the full 3–4 h. But that should not be
the first thing attempted, because three preconditions are red and two questions (WoL, PoE) are
unanswered. Rehearse in four stages; each stage is independently useful and none of them
requires touching mains power.

### Stage 1 — paper + live read-only (no cluster change at all)

Run §6.0's nine pre-flight commands and record the output. Today five of nine fail. Re-run
after each precondition lands. This stage is what turns §0 from a list into a burndown.

Additionally, answer by measurement rather than inference:

```bash
# etcd's own footprint, invisible to kubectl top (§9 item 5)
talosctl --talosconfig talos/clusterconfig/talosconfig -n 10.10.209.10,10.10.209.11,10.10.209.12 \
  service etcd status
# and its fsync latency, which is the exit-storm risk in §6.2
kubectl -n observability exec deploy/grafana -- true   # then query:
#   histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m]))
```

### Stage 2 — scheduling dry-run (reversible in seconds, no node powered off)

Cordon the four workers, do **not** shut them down, and observe where the Tier-1 set would go:

```bash
kubectl cordon hard-hat fluttershy kerfuffle shining-armor
kubectl -n stargate-command delete pod -l app.kubernetes.io/name=home-assistant
kubectl get pods -n stargate-command -o wide -w
```

This proves — or disproves — that Tier 1 can *schedule* on the trio, which is a different
question from whether it can *run* there. It is where §0.3's Technitium problem shows up as a
`ContainerCreating` pod with a CNI error rather than as a theory. Undo with
`kubectl uncordon hard-hat fluttershy kerfuffle shining-armor` and let Flux/the descheduler
settle it back.

### Stage 3 — one worker off, mains power untouched

`talosctl shutdown` **one** worker (`shining-armor` — fewest Tier-1 pods, and the only one that
can be restarted with `qm start` if WoL turns out not to work). Hold it down for one hour. This
answers, at 1/4 the blast radius:

- Does §5's `nodeDownPoddeletionPolicy` behave as documented (Tier-2 pods `Pending`, not
  `Terminating`)?
- Does the 600 s `replica-replenishment-wait-interval` start rebuilding Tier-2 volumes onto the
  trio at the ten-minute mark? If piece 12 Step 3 is live, it must **not**. This is the single
  cheapest test of §0.2 and should be run the moment 12 lands.
- Does the trio's SATA disk temperature move? `kubectl -n observability` → the
  `smartctl-exporter` series, or the piece-12 numbers as a baseline.

Then power it back on and run §6.2's per-node gates. **That also rehearses the WoL question on
one node without needing the whole estate down.**

### Stage 4 — the real thing (the gate)

All four workers down, the full 3–4 h, one-at-a-time exit per §6.2.

Gate checklist before calling this mode rehearsed:

- [ ] §6.0's nine pre-flight checks all green before entry.
- [ ] All four workers cordoned and shut down with no `kubectl drain` and no hang.
- [ ] Zero Tier-1 volumes degraded below 2 replicas for the full window.
- [ ] DNS, NTP, MQTT, Home Assistant, Traefik and forward-auth (against alpha-site) verified
      reachable at the **1 h, 2 h and 3–4 h** marks, not just at entry.
- [ ] alpha-site's Gatus stayed reachable for the entire window (answers §7 with evidence).
- [ ] etcd `wal_fsync` p99 stayed under 10 ms for the duration — measured, not assumed.
- [ ] Tier-2 pods went `Pending` as §5 predicts and rescheduled cleanly on exit with no
      orphaned `Terminating` pods.
- [ ] Exit completed one node at a time with no Cilium-not-ready / `OutOfcpu` cascade.
- [ ] Every worker came back by its documented power-on path (§6.2 table) — WoL confirmed or
      confirmed unavailable, per node.
- [ ] 160/160 Kustomizations `Ready` and zero degraded volumes at the end.

Only after this is green should low-power be treated as validated for a real grid outage. The
blast radius of skipping it is small — nothing here is irreversible — but the failure mode if
it is wrong (identity dark, DNS down, wife's lights off) is exactly the one D6 exists to
prevent.

---

## 9. Open items

Resolved, and left resolved:

- ~~Is Home Assistant Tier 1?~~ Confirmed by David, comment-6.
- ~~Is Home Assistant node-pinned to Zigbee/Z-Wave hardware?~~ **No** — no `nodeSelector`,
  `nodeName` or device `hostPath` in its HelmRelease; the radios run in alpha-site's `zwave`
  stack. Re-verified 2026-08-19.
- ~~Should `critical-tier` sit above or below `system-cluster-critical`?~~ **Below** — §4.
- ~~Does anything read OpenBao at request time, bypassing synced Secrets?~~ **No** — §2.
- ~~Re-verify §3's capacity numbers live.~~ **Done 2026-08-19** — §3. Result: it fits, but CPU
  is the tight axis, not the 2×-on-both-axes the old figure implied.
- ~~Is `hard-hat` a Proxmox VM?~~ **No, it is bare metal** — §6.2. Only `shining-armor` is a VM.

Still open, in priority order:

1. **§0.3 — how does DNS survive a low-power window?** Blocker. Pick (a) a CP-capable NAD +
   second Technitium member, (b) LB-VIP-served DNS on the CP copy, or (c) an off-cluster
   resolver — and for (c), confirm whether a Technitium node exists outside this repo, because
   no Dockge host in `docker/` deploys one today. Needs David.
2. **§0.1 — schedule the all-volumes-detached quiesce window** that lets Longhorn's
   `taint-toleration` apply. Until then, `allowSchedulingOnControlPlanes` must stay `true` and
   only §6 Path B is available.
3. **Is alpha-site's PoE switch on the battery circuit?** §7. Needs David. Unchanged in
   priority — it is only below the two above because they are blockers on *entering*, and this
   one determines whether entering is *worth* it.
4. **WoL on `hard-hat`, `fluttershy` and `kerfuffle`** — three bare-metal workers, not the two
   the pre-19 text assumed (§6.2). Unverified whether WoL is enabled in BIOS or reachable.
   Stage 3 of §8 answers it one node at a time.
5. **Tier calls at the margins.** `golink` — §5 shows it has **zero** control-plane replicas
   and it is a link shortener; recommend resolving it as **Tier 2**. `matter` — `hostNetwork`,
   shares `${AUTOMATION_VIP}` with mosquitto, one CP replica; needs an explicit call before
   piece 12 tags its volume. `taildrive` and `tsiam` are in a Tier-1 namespace with one CP
   replica each and have never been tier-assigned at all.
6. **`postgres-3` and the taint (§2).** Decide *in the same change as the flip*: give the CNPG
   cluster the toleration, or destroy and re-provision the instance onto a worker first.
   Leaving it undecided strands a database instance on the next reboot.
7. **`tsidp`'s `hostname NotIn [othalla]` anti-affinity** (§1) — a Tier-1 workload excluded from
   a control plane. Copied verbatim during piece 21; confirm whether the reason still applies.
8. **`hard-hat`'s stale talconfig `deviceSelector`** (§6.2) — names a MAC that does not exist on
   the node. Not this piece's to fix; raise against
   [19](19-rotate-equestria-control-planes.md) / talconfig.
9. **Low-power trigger.** D6 settled duration (3–4 h+) but not trigger: purely a manual runbook
   posture, or should grid-loss on a UPS/NUT signal auto-trigger entry? A NUT-driven automatic
   entry is materially different engineering and is explicitly **not** built here.
   [24](24-power-states.md) makes this sharper by adding a third state that needs a live toggle.
10. **etcd's memory footprint on Talos** is invisible to `kubectl top` (a host service), so §3
    excludes it. §8 Stage 1 measures it.

---

## Cross-references

- [00-README](README.md) — decision ledger, full sequencing, cross-cutting rules
- [12-longhorn-critical-tier.md](12-longhorn-critical-tier.md) — the storage tagging this piece
  depends on; owns the `critical`/`bulk` tags, the `longhorn-critical` StorageClass, the
  default-class `nodeSelector` that §0.2 turns on, and the disk measurements that justify
  keeping `critical` on the control planes
- [19-rotate-equestria-control-planes.md](19-rotate-equestria-control-planes.md) — the topology
  this piece now runs on for real, the etcd fsync measurements §6.2 cites, and the owner of
  §6.2's stale-`deviceSelector` finding
- [24-power-states.md](24-power-states.md) — amends §1 (tier membership) and §4 (placement
  model); read both, this file is not superseded by it
- [07-authentik-to-alpha-site.md](07-authentik-to-alpha-site.md) — the landed precondition that
  makes CNPG droppable to Tier 2, and the source of §7's concentration risk
- [03-secrets-bootstrap-independence.md](03-secrets-bootstrap-independence.md) — the OpenBao-era
  bootstrap catch-22 that §2's decision is a corollary of
- [16-soak-and-gate.md](16-soak-and-gate.md) — the rehearse-before-trust pattern §8 mirrors
- [17-nvme-replacement.md](17-nvme-replacement.md) — the etcd-disk weakness that makes §6.2's
  one-at-a-time exit non-negotiable
