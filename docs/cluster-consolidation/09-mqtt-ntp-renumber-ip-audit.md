# 09 — MQTT/NTP renumber + literal-IP audit (H′)

Sub-issue **H′** of [vault#84](https://github.com/david-driscoll/vault/issues/84) ·
[← plan index](README.md) · Decision **D7** · Feeds: [13 — Stage SGC apps](13-stage-sgc-apps.md),
[15 — Migrate apps](15-migrate-apps.md)

**Decision this piece implements:** D7 — mosquitto (`10.10.209.203`) **and** chrony
(`10.10.209.204`) both renumber into equestria's existing `10.10.206.x` pool, pinned with
`io.cilium/lb-ipam-ips` exactly as they are today. The v2-discovery idea of extending
equestria's `CiliumLoadBalancerIPPool` with a third `.209` block to preserve the old addresses
unchanged is **dead — do not resurrect it.** See the [decision ledger](README.md#decision-ledger)
for the full table; this plan does not relitigate D1–D12.

## Read this first: this piece already executed live, ahead of the plan, and it broke something

This file was written assuming H′ was still-future work: pick the new `.206` addresses while
staging ([13](13-stage-sgc-apps.md)), then renumber and audit clients during the per-app
cutovers ([15](15-migrate-apps.md)) — chrony first, then mosquitto, with Home Assistant
reconfigured in the same window as mosquitto's move. **That sequencing has been overtaken by
events.** Verified live against both clusters on 2026-08-13: David (or an agent working from
this same issue) already renumbered chrony, mosquitto, matter and home-assistant into equestria,
in both repos, in a single evening —

| Repo | Commit | Timestamp (local) | What it did |
|---|---|---|---|
| `stargate-command-cluster` | `bddf20ac8` | 2026-08-12 20:36:48 | "disabling chrony, matter and mosquitto for the move" — flips `kubernetes/apps/sgc/home/kustomization.yaml` |
| `equestria-cluster` | `2e030d161` | 2026-08-12 20:36:57 | "moving chrony, matter and mosquitto for the move" — adds `kubernetes/apps/stargate-command/{chrony,matter,mosquitto}` |
| `stargate-command-cluster` | `d6b36427a` | 2026-08-12 21:07:12 | "removing home-assistant" — deletes all four `kubernetes/apps/sgc/home/*` app directories (chrony, matter, mosquitto, home-assistant, oxycloud) |
| `equestria-cluster` | `def57cc1a` | 2026-08-12 21:07:24 | "migrating home-assistant" — adds `kubernetes/apps/stargate-command/home-assistant` |
| `equestria-cluster` | `f1b31b124`, `3746ba460`, `16da17896` | 21:41–21:58 | "ha deps", "fix volumes", "volsync restore" — follow-up fixes for the home-assistant move |

This is good news and bad news. Good: **D7 is implemented exactly as decided** — verified below,
no `.209` pool block was ever added. Bad: it was executed as a same-evening cutover without the
staged/suspended pattern this plan's [13](13-stage-sgc-apps.md) prescribes and without the soak
gate in [16](16-soak-and-gate.md), and the literal-IP audit this file exists to perform had not
happened first. **The result, found live during this audit: Home Assistant's MQTT integration
is down right now** — see [§ Urgent](#urgent--home-assistants-mqtt-integration-is-down-right-now)
below. This file is therefore not a forward plan for a not-yet-started renumber; it is a
verification of what already shipped, a live incident report, and the remaining checklist to
actually close H′ out. Whoever picks this up should treat the "urgent" section as the first
thing to act on, independent of the rest of the migration's sequencing.

## Why D7 exists, restated for a reader who hasn't read vault#84

The July discovery ([Expansion v2 §1.3](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273))
found that equestria's `CiliumLoadBalancerIPPool` already carries two blocks
(`10.10.206.100-200`, `10.10.206.202-252`) on a flat `10.10.0.0/16` Cilium L2-announcement
network, and proposed a third `10.10.209.202-204` block so mosquitto and chrony could move
clusters **without changing IP** — "zero LoadBalancer churn estate-wide." David rejected that
trade explicitly:

> **Q-F — Preserve `10.10.209.203/.204`?** [...] Preference?
>
> We can update home assistant to use the new IP range for MQTT.
>
> — [comment-4](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112326099), 2026-07-29

The v2.1 follow-up ([§4](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583))
asked the one thing Q-F hadn't covered — chrony/NTP — separately, since UniFi typically
distributes NTP via DHCP option 42 rather than per-device config, and DHCP-distributed servers
are trivial to renumber while hardcoded ones aren't:

> `chrony` at **`10.10.209.204`** [...] I found no NTP configuration anywhere in the Pulumi tree
> [...] **Unverified:** whether UniFi hands out `10.10.209.204` via DHCP [...] **Please confirm:
> renumber chrony too, or preserve `.204`?**

> Lets renumber.
>
> — [comment-5-answers-2](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734), 2026-08-01

**So: both addresses renumber, no exceptions, and the third pool block is off the table
permanently.** The "unverified" NTP-distribution question from that exchange is resolved below —
it turns out DHCP hands out neither DNS-via-option nor NTP-via-option for chrony, which changes
the shape of the remaining audit (see [§ NTP](#ntp-the-unverified-question-is-now-resolved-dhcp-hands-out-nothing)).

## What actually happened, verified 2026-08-13

**New addresses** (decrypted from `equestria-cluster/kubernetes/flux/meta/cluster-secrets.sops.yaml`
with the repo's own `age.key` — this is the estate's normal `sops -d` verification path, not a
new credential exposure):

| Service | Old (sgc) | New (equestria) | Pin mechanism |
|---|---|---|---|
| chrony (NTP) | `10.10.209.204` (`CHRONY_VIP`) | **`10.10.206.204`** (`CHRONY_VIP`) | `io.cilium/lb-ipam-ips` + `externalIPs`, same as before |
| mosquitto (MQTT) | `10.10.209.203` (`AUTOMATION_VIP`) | **`10.10.206.203`** (`AUTOMATION_VIP`) | `io.cilium/lb-ipam-ips`, `external-dns` hostname `replicator.driscoll.tech`, Tailscale hostname `replicator` — all carried over unchanged |

Both keep their sgc-era last octet (`.203`/`.204`) and their sgc-era `*_VIP` secret-key names —
only the third octet changed, `209` → `206`. That's a deliberate mnemonic, not a coincidence to
rely on for other services: don't assume every future renumber preserves the last octet.

**Confirmed dead: no third pool block was added.** `equestria-cluster/kubernetes/apps/kube-system/cilium/networks.yaml`
today:

```yaml
apiVersion: cilium.io/v2
kind: CiliumLoadBalancerIPPool
metadata:
  name: pool
spec:
  blocks:
    - start: ${LOADBALANCER_RANGE}.100
      stop: ${LOADBALANCER_RANGE}.200
    - start: ${LOADBALANCER_RANGE}.202
      stop: ${LOADBALANCER_RANGE}.252
```

Exactly the two blocks from the discovery, `LOADBALANCER_RANGE=10.10.206`. **If anyone proposes a
`.209` block again — to "make the migration invisible" or similar — point them at this file:
David decided against it twice** (Q-F for MQTT, the chrony follow-up for NTP), and it's already
been built the other way.

**Live cluster state, 2026-08-13** (`kubectl --context admin@equestria -n stargate-command get
pods,svc`):

```
pod/chrony-0                          1/1     Running   0          3h44m
pod/home-assistant-695f96d685-x4tr7   2/2     Running   0          158m
pod/matter-d79959b5f-qf6kv            1/1     Running   0          3h37m
pod/mosquitto-0                       1/1     Running   0          3h44m
pod/mosquitto-1                       1/1     Running   0          3h44m

service/chrony       LoadBalancer   10.196.239.159   10.10.206.204   123:31981/TCP,31880:30834/TCP
service/mosquitto     LoadBalancer   10.196.228.205   10.10.206.203   1883:30616/TCP,9090:32416/TCP
service/matter        LoadBalancer   10.196.95.77     10.10.206.100   5580:30099/TCP
```

Flux Kustomization status in the same namespace: `chrony` and `mosquitto` are **Ready**
(`Applied revision: ...474739e0`); `home-assistant` and `matter` are **not** —
`dependency 'volsync-system/volsync' is not ready` — even though their pods are up and serving.
That dependency failure traces back to `volsync-system/volsync` itself being blocked on
`nfs-system/csi-driver-nfs`, which is outside this piece's scope
([01](01-stabilise.md)/[10](10-drain-safety.md) territory) but worth flagging to whoever owns
those: **this migration shipped with two of its four Kustomizations reporting not-Ready**, which
is exactly the state [16 — soak and gate](16-soak-and-gate.md) exists to catch before a
point-of-no-return step, and this move happened without that gate.

All four apps landed in a **new namespace, `stargate-command`**, not folded into any existing
equestria namespace — note this for [21 — repo consolidation](21-repo-consolidation-flux-repoint.md)
and [22 — decommission SGC](22-decommission-sgc.md), which will want to know this namespace name
exists and is where these four apps now live.

**One app the discovery's table never named:** `matter` moved in the same batch (see the commit
messages above — "chrony, matter and mosquitto"), even though the README's five-app list and the
v2/v2.1 discoveries only ever discuss chrony, mosquitto, tsidp and home-assistant. Matter is
Home Assistant's Matter integration bridge; it makes sense bundled with home-assistant, but it
was never separately decided or audited. Treat it as in-scope for this piece's IP audit too
(done below) and flag it to [13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md) as a fifth app
that needs the same staging/cutover discipline the other four are supposed to get.

## Urgent — Home Assistant's MQTT integration is down right now

This is the literal-IP audit's central risk, caught live rather than in advance, because the
audit ran after the cutover instead of before it (see [§ above](#read-this-first-this-piece-already-executed-live-ahead-of-the-plan-and-it-broke-something)).
Home Assistant's own MQTT integration config is stored on its PVC and was carried over by the
VolSync restore from sgc, not regenerated — and it was never a literal IP, it was an
internal Kubernetes DNS name that only resolved inside the cluster being dissolved:

```
$ kubectl --context admin@equestria -n stargate-command exec deploy/home-assistant -c app -- \
    grep -o '"broker":[^,]*' /config/.storage/core.config_entries
"broker":"mosquitto.sgc.svc.cluster.local"
```

```
$ kubectl --context admin@equestria -n stargate-command logs deploy/home-assistant -c app | grep -i mqtt
2026-08-12 22:01:39.975 INFO  [homeassistant.setup] Setting up mqtt
2026-08-12 22:01:40.070 ERROR [homeassistant.components.mqtt.client] Failed to connect to MQTT
  server due to exception: [Errno -2] Name does not resolve
```

`mosquitto.sgc.svc.cluster.local` is sgc's own cluster-local Service DNS (`<svc>.<ns>.svc.cluster.local`)
— every Kubernetes cluster has a private `cluster.local` zone that only resolves inside that
cluster's own CoreDNS. It never was a literal IP, but the effect is identical to a client with a
hardcoded old IP: it cannot reach the broker in its new home, full stop. Every MQTT-backed
entity in Home Assistant (anything routed through the `mqtt` integration — likely includes
Zigbee2MQTT-bridged devices if Zigbee2MQTT itself publishes to this broker) has been
non-functional since the pod started at 2026-08-12 22:01, with automations against those entities
silently stale.

**The fix, in-cluster:** point Home Assistant's MQTT broker at `mosquitto.stargate-command.svc.cluster.local`
(the correct in-cluster name in the app's new namespace) or at the pinned LB address
`10.10.206.203`, via Settings → Devices & Services → MQTT → Reconfigure in the HA UI (safest —
handles the stored config-entry correctly), not by hand-editing `.storage/core.config_entries` on
a live PVC. This is the concrete instance of the "we can update home assistant to use the new IP
range for MQTT" commitment David made in Q-F — it has not happened yet, seven-plus hours after
the broker itself moved.

## The rest of the literal-IP audit, live-verified 2026-08-13

The discovery listed the audit surface as a checklist; this is that checklist, actually run.

| Surface | Finding |
|---|---|
| **Home Assistant** | **Broken now** — see [§ Urgent](#urgent--home-assistants-mqtt-integration-is-down-right-now) above. |
| **Zigbee2MQTT, ESPHome, Frigate, Node-RED, Tasmota firmware** | **Unverified — cannot be audited from this repo set.** None of these run as config-in-git in any repo this plan has access to (they're either separate Docker services with their own config stores, or literal device firmware). If Zigbee2MQTT or Frigate exist in the estate, they most likely point at the broker the same way Home Assistant's `.storage` did — check each one's own MQTT-broker setting by hand. Grepped `docker/` in home-operations for `mosquitto`, `chrony`, `mqtt`, `ntp`, and the literal octets — no hits (see below), so if these services exist, their config isn't in this Pulumi tree either. |
| **UniFi DHCP option 42 (NTP)** | **Resolved, not just verified — the discovery's "unverified" item is now a definitive no.** `dhcpd_ntp_enabled: false`, `dhcpd_ntp_1`/`dhcpd_ntp_2` empty on **both** the "Home" network (`10.10.0.0/16`, where the cluster LB IPs live) and the "IoT" network (VLAN 10, `192.168.100.0/24`). UniFi does not distribute an NTP server to any client, anywhere, via DHCP. Nothing learns chrony's address that way — whatever uses chrony must have it statically configured, narrowing the real remaining audit to "what has `.204` hardcoded," which this file cannot enumerate without device-by-device access. |
| **UniFi DHCP option 6 (DNS) — tangential finding** | The **IoT VLAN** hands out `dhcpd_dns_4: 10.10.209.202` to every IoT device — the orphaned `adguard-home-dns` Service IP the discovery already flagged as dead (no HelmRelease, no workload, since 2026-07-29). Not mosquitto/chrony's address, but the same class of staleness and worth fixing in the same pass. Traced to `components/constants.ts`'s `dnsServers["Stargate Command"]` entry (`ips: ["10.10.209.202"]`, `internal: true, use: true`), consumed by `stacks/unifi-network/local-dns.ts:84` into the `dns.internalIps` list that feeds this DHCP field. Owned by [01](01-stabilise.md)/[22](22-decommission-sgc.md), flagged here for visibility. |
| **UniFi static leases / client IP reservations** | Not checked exhaustively (94 firewall policies and dozens of client records exist; a full pass is out of scope for this file). No policy or reservation found by name-search for "mqtt" or "ntp". |
| **UniFi firewall rules** | No V2 zone-based policy named for MQTT or NTP; none of the ~50 policies inspected target `.209.203/.204` or `.206.203/.204` by IP. The IoT-VLAN policies visible only allow established/related traffic plus specific multicast protocols (IGMP, SSDP, Bonjour/mDNS, AirPlay, Chromecast) back toward the LAN — **recommend explicitly confirming a rule permits new outbound connections from IoT-VLAN devices to TCP 1883 on the LAN**, since an MQTT publish is a client-initiated connection, not a response to one, and 44 of 94 policies weren't individually inspected. |
| **Docker compose (all Dockge hosts, `docker/`)** | Clean. `grep -rln "209\.\|mosquitto\|chrony\|mqtt\|ntp" docker/` returns two files, both false positives (a `zwavejs2mqtt` icon URL, and the word "mountpoint"). |
| **Gatus checks** | Clean in both cluster repos — no `mosquitto`/`chrony`/`.209.203`/`.209.204` hits under either repo's `observability/gatus` tree. |
| **Prometheus scrape configs** | Clean — same grep, same result, across both cluster repos. |
| **`stacks/unifi-network/acl-manager.ts`** (home-operations) | Hardcodes sgc's API VIP (`kubeApiIp: "10.10.209.201"`) and a `publicIps` list (`10.199.0.10`, `10.10.209.100`, `10.10.209.101`, `10.10.209.202`) — **none of these are mosquitto or chrony's addresses**, so no change is needed here for H′ specifically. This whole `sgc` cluster block is dead weight once SGC dissolves — that's [22](22-decommission-sgc.md)'s job, flagged here so it isn't missed. |
| **`components/constants.ts`** (home-operations) | See the DHCP-DNS finding above — same file, same root cause. |

## Bugs found during this audit (not literal-IP, but found while auditing the same code)

1. **`matter`'s Service declares mosquitto's IP as a stray `externalIPs` entry.**
   `equestria-cluster/kubernetes/apps/stargate-command/matter/helmrelease.yaml` has its
   `io.cilium/lb-ipam-ips` annotation commented out (so Cilium auto-assigned it `10.10.206.100`,
   confirmed live) but still sets `externalIPs: ["${AUTOMATION_VIP}"]` — the same `10.10.206.203`
   mosquitto is pinned to. Live confirmation: `kubectl get svc matter -o yaml` shows both
   `spec.externalIPs: [10.10.206.203]` and `status.loadBalancer.ingress[0].ip: 10.10.206.100`
   simultaneously. Looks like a copy-paste leftover from mosquitto's manifest. Not user-visible
   yet (matter is reachable on `.100`), but it's an IP declared on two Services at once and
   should be removed.
2. **The old sgc `mosquitto` Service is stuck `Terminating`.** `kubectl --context admin@sgc -n sgc
   get svc mosquitto` still returns it, holding `10.10.209.203`, with a `deletionTimestamp` set
   and the `tailscale.com/service-pg-finalizer` blocking cleanup. sgc's pre-deletion mosquitto
   manifest (`git show bddf20ac8~1:...mosquitto/helmrelease.yaml`) carried the identical
   `tailscale.com/hostname: "${AUTOMATION_CNAME}"` (`replicator`) and `tailscale.com/expose: "true"`
   annotations that the new equestria mosquitto now also carries — the same Tailscale hostname
   claimed by two Services in two clusters at once is exactly the estate's known
   **Tailscale operator svc-name-collision finalizer deadlock**: a ghost tailnet device holds the
   name, the old Service's finalizer can never satisfy, and it sits Terminating forever until the
   colliding device is deleted from the Tailscale admin console by hand. Chrony has no Tailscale
   annotations at all in either cluster, so it isn't exposed to this trap — this is a
   mosquitto-only cleanup item. **Action: check the tailnet admin console for a duplicate
   `replicator` device and remove the stale one, then confirm the sgc Service's finalizer
   clears.**
3. **mosquitto's data has no VolSync backup in its new home.** `data-mosquitto-0` and
   `data-mosquitto-1` (4Gi each, Longhorn) exist and are bound in `stargate-command`, but
   `kubectl get replicationsource -n stargate-command` shows only `home-assistant` and `matter` —
   no `mosquitto` source. Retained-message/ACL state for the broker currently has zero backup
   coverage post-move. This is [02](02-volsync-two-writer.md)/[13](13-stage-sgc-apps.md)
   territory more than H′'s, flagged here because it surfaced during this audit.
4. **sgc's `*_VIP` cluster-secret keys are still present, correctly.** `TECHNITIUM_VIP`,
   `ADGUARD_VIP`, `CHRONY_VIP`, `AUTOMATION_VIP` (plus `TUNER_VIP`, `SCRYPTED_VIP`, not previously
   catalogued) all still exist, encrypted, in `stargate-command-cluster/kubernetes/flux/meta/cluster-secrets.sops.yaml`.
   The discovery said `AUTOMATION_VIP` and `TECHNITIUM_VIP`/`ADGUARD_VIP` "retire with sgc" — that
   is correctly **not yet done**, since sgc itself hasn't been dissolved
   ([18](18-sgc-nodes-join-control-plane.md) territory, still far downstream). Nothing to fix
   here yet; noted so nobody mistakes their continued presence for a missed cleanup step.

## NTP: the "unverified" question is now resolved — DHCP hands out nothing

The v2.1 discovery's open question — *"I cannot confirm how the estate learns its time
source"* — is answered: it doesn't, via any Pulumi-managed or UniFi DHCP mechanism. Re-grepped
`stacks/` and `components/` in home-operations for `ntp` today: only SDK type definitions
(`sdks/unifi/types/{input,output}.ts`, TrueNAS's `SystemNtpServerQueryRequest` types) and
comment/variable-name false positives (`mountPoints`) — **no `SettingNtp` resource is ever
instantiated, and no `dhcpd_ntp_*` field is ever set, anywhere in the Pulumi tree.** Confirmed
live against the UniFi controller itself (not just the Pulumi source) that both networks have
NTP-via-DHCP switched off. Whatever in the estate uses chrony must be pointed at it by hand,
which means the blast radius of the renumber is smaller than "every device on the network" but
harder to enumerate than "check one DHCP setting" — it comes down to whoever set up NTP clients
originally knowing which devices those were. No record of that exists in any repo this plan has
access to. **This stays an open item for David:** if you know of anything besides Home
Assistant/the cluster's own nodes pointed at chrony by IP, that's the thing to check; if nothing
comes to mind, the honest status is "probably fine, unauditable from here."

## Remaining work to actually close H′

1. **Fix Home Assistant's MQTT broker config now** — this is a live outage, not a planning item.
   See [§ Urgent](#urgent--home-assistants-mqtt-integration-is-down-right-now).
2. **Audit and fix `matter`'s stray `externalIPs` entry** (bug 1 above).
3. **Resolve the stuck sgc `mosquitto` Service** — find and remove the colliding `replicator`
   Tailscale device, confirm the finalizer clears (bug 2 above).
4. **Add a VolSync `ReplicationSource` for mosquitto** in `stargate-command`, respecting the
   one-writer-per-repo rule from [02](02-volsync-two-writer.md) (bug 3 above).
5. **Manually check every physical/IoT device class** the discovery flagged — Zigbee2MQTT,
   ESPHome, Frigate, Node-RED, Tasmota — for a hardcoded broker address (`.209.203` old,
   `.206.203` new) or NTP server address (`.209.204` old, `.206.204` new). None of this is in any
   repo this plan can grep; it needs hands-on device access.
6. **Verify the `home-assistant` and `matter` Flux Kustomizations actually go Ready** once
   `nfs-system/csi-driver-nfs` and `volsync-system/volsync` clear (tracked outside this piece,
   but this piece's exit gate depends on it — see below).
7. **Once satisfied, update this file's status line and [13](13-stage-sgc-apps.md)/[15](15-migrate-apps.md)**
   to reflect that chrony/mosquitto/matter/home-assistant are already migrated rather than still
   pending — those files should not re-plan a cutover that already happened; they should instead
   inherit this file's remaining-work list for anything not yet closed.

## Exit gate

- Home Assistant's MQTT integration reconnects and stays connected (no `[Errno -2] Name does not
  resolve` in logs after the fix).
- `matter`'s `externalIPs` field no longer duplicates mosquitto's IP.
- The old sgc `mosquitto` Service is fully deleted (not stuck `Terminating`), and `10.10.209.203`
  is free.
- A VolSync `ReplicationSource` exists and has completed at least one sync for mosquitto in
  `stargate-command`.
- `home-assistant` and `matter` Flux Kustomizations report `Ready: True`, not blocked on
  `volsync-system/volsync`.
- David has confirmed (or ruled out) any IoT-device class with a hardcoded old-IP reference,
  per item 5 above.
- A repo-wide grep for `10.10.209.203` and `10.10.209.204` across all three repos (home-operations,
  equestria-cluster, stargate-command-cluster) returns nothing outside historical git log —
  re-run the exact greps in this file to confirm.

## Cross-references

- [README.md](README.md) — decision ledger entry D7; sequencing diagram (`H → L`).
- [02 — VolSync two-writer](02-volsync-two-writer.md) — the one-writer-per-restic-repo rule that
  governs how mosquitto's new `ReplicationSource` must be set up.
- [13 — Stage SGC apps](13-stage-sgc-apps.md) and [15 — Migrate apps](15-migrate-apps.md) — the
  pieces whose sequencing this file's cutover jumped ahead of; both need updating to reflect that
  chrony/mosquitto/matter/home-assistant already moved.
- [16 — Soak and gate](16-soak-and-gate.md) — the gate this cutover shipped without; two of the
  four Kustomizations are still not-Ready as a direct result.
- [22 — Decommission SGC](22-decommission-sgc.md) — owns retiring the sgc `*_VIP` cluster-secret
  keys, the `stacks/unifi-network/acl-manager.ts` sgc block, and the stale
  `components/constants.ts` DNS entry once sgc is fully dissolved.
