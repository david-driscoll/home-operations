# LAN attachment (Multus ipvlan) — discovery without hostNetwork

**Status:** stage 1 implemented (Jellyfin **and** Plex — the full set the
survey found). Stages 2–3 not started —
Matter is blocked on an unanswered IPv6 question, Home Assistant goes last.

## The question this answers

Two goals were raised together:

1. Expose cluster services (Jellyfin was the example) to LAN discovery.
2. Get Home Assistant and the Matter server off `hostNetwork: true`.

They have the same answer, and it is **not** an mDNS reflector. It is the Multus
ipvlan attachment this repo already runs for Technitium
(`kubernetes/apps/equestria/dns/technitium/macvlan-nad.yaml`).

## Findings that shaped this

### There is no mDNS gap to close

`Home` is an untagged flat `10.10.0.1/16`; every Talos node sits on it
(`10.10.206.x` workers, `10.10.209.x` control planes). A pod with a real
interface on that segment is already on the same broadcast domain as the
laptops and phones — nothing needs reflecting.

Cross-VLAN is handled at the gateway: both `Home` and `IoT` (VLAN 10,
`192.168.100.0/24`) report `mdns_enabled: true` on the UCG-Max, and they share
firewall zone `6961ba9adfe08e423bbedf73`. `Guest` (VLAN 2) is deliberately not
reflected.

So `external-mdns` and friends solve a problem this estate does not have. See
"Rejected options" below.

### Jellyfin does not speak mDNS at all

This is the load-bearing correction. Jellyfin's server auto-discovery is a
**UDP broadcast to `255.255.255.255:7359`** — the client sends
`"Who is JellyfinServer?"`, the server replies. It is not mDNS, not DNS-SD, and
[the port is not configurable](https://jellyfin.org/docs/general/post-install/networking/).

Consequences:

- Publishing an mDNS `_http._tcp` record for Jellyfin makes **zero** Jellyfin
  clients find it. No client browses mDNS.
- What *does* make clients find it is putting the pod on the LAN broadcast
  domain so it receives the `:7359` broadcast and can answer.
- `JELLYFIN_PublishedServerUrl` is already `https://jellyfin.${ROOT_DOMAIN}`, so
  a discovery reply hands the client the normal Traefik URL. Discovery starts
  working while traffic keeps flowing through the gateway and its `local-user`
  middleware. Nothing is bypassed.

### ipvlan L2 carries multicast and broadcast

Per the [kernel IPVLAN docs](https://docs.kernel.org/networking/ipvlan.html),
in L2 mode "the slaves will RX/TX multicast and broadcast traffic". That is what
makes the same mechanism serve both the Jellyfin `:7359` case and the
HA/Matter mDNS case.

ipvlan rather than macvlan for the reason already documented on the Technitium
NAD: some nodes are Proxmox KVM VMs and macvlan would need promiscuous mode on
the vmbr bridge.

### A `.local` name is worth less here than it looks

An avahi publisher advertising `jellyfin.local` would need:

- a matching `jellyfin.local` hostname on the Traefik gateway, since Traefik
  routes by Host header and would otherwise serve error-pages; and
- no TLS, because no public CA will issue for `.local`.

Against `jellyfin.driscoll.tech` — which already resolves through Technitium and
already has a real certificate — that is a downgrade. **Recommendation: do not
build the avahi publisher** unless a specific protocol that is genuinely browsed
comes up (AirPrint `_ipp._tcp` backed by a real IPP endpoint, or a custom
service type your own clients browse for). It is a fine follow-up, not a
foundation.

## Node facts

| Node | Role | LAN NIC | Address | Intel GPU |
|---|---|---|---|---|
| `shining-armor` | worker (Proxmox VM) | `ens18` | 10.10.206.10 | no |
| `hard-hat` | worker (Proxmox VM) | `enp2s0` | 10.10.206.14 | no |
| `fluttershy` | worker | `enp2s0` | 10.10.206.16 | yes |
| `kerfuffle` | worker | `enp2s0` | 10.10.206.17 | yes |
| `milky-way` | control plane | `enp3s0` | 10.10.209.10 | yes |
| `othalla` | control plane | `enp3s0` | 10.10.209.11 | yes |
| `pegasus` | control plane | `enp3s0` | 10.10.209.12 | yes |

A NAD hardcodes `master`, so **a workload that can land on both `enp2s0` and
`enp3s0` nodes cannot use a single NAD.** Every LAN-attached workload must be
pinned to one NIC family. This is why stage 1 narrows Jellyfin.

## Constraints that apply to every LAN attachment

- **Static IPAM is one address per NAD, so one pod per NAD.** Single-replica
  workloads only. If this grows past a handful, swap to the `whereabouts` IPAM
  plugin for a shared pool rather than minting NADs by hand.
- **Addresses must dodge two allocators.** The Cilium pool is
  `10.10.206.100-200` and `.202-252`; UniFi DHCP is `10.10.0.5-10.10.254.254`.
  Technitium sits at `10.10.206.202`, inside the Cilium block — it survives only
  because Cilium allocates upward from `.100`. **Do not repeat that.** Pick from
  outside both and add a UniFi reservation.
- **Parent/child isolation:** a node cannot reach its own ipvlan child's IP.
  Kubelet probes must target the primary Cilium pod IP — the default — so never
  point a probe at the LAN address.
- **One mDNS speaker per parent NIC.** ipvlan children share the parent MAC;
  multiple IGMP/mDNS speakers on one parent get ambiguous.

## Which services actually broadcast — the survey

Docs and GitHub searches were the starting point, but the authoritative answer
came from the running cluster: `/proc/net/udp` and `/proc/net/igmp` inside every
pod say what each service *actually* binds and which multicast groups it has
*actually* joined, rather than what its README claims is possible.

Coverage: 189 of 314 running pods inspected. The 125 misses are distroless or
shell-less images, and break down as infrastructure — kube-system (35), agents
(34), longhorn-system (19), network (9), observability (7) and smaller. In the
two user-facing namespaces only `equestria/traefik-whoami` and
`equestria/rustdesk-0` could not be entered; neither is a candidate (see below).

### Positive findings

| Service | Evidence | Verdict |
|---|---|---|
| **plex** | UDP `32410, 32412, 32413, 32414` (GDM) + `1901`; joined `239.0.0.250` (GDM) **and** `239.255.255.250` (SSDP/DLNA) | **Attach** |
| **jellyfin** | UDP `7359` — the auto-discovery listener, exactly as documented | **Attached** (stage 1) |

Nothing else in the cluster binds a discovery port or joins a non-default
multicast group. Every other inspected pod showed only ephemeral UDP and the
default `224.0.0.1` all-hosts membership.

### Rejected, with the reason

| Service | Why not |
|---|---|
| **qbittorrent** | BitTorrent LSD *would* use `239.192.152.143:6771`, but the running pod has not joined it — only its torrent port `18289` is bound, so LSD is off in its config. Even enabled it finds local peers for the same torrents, of which there are none here, and LAN-attaching it would put the WebUI on the LAN outside Traefik's auth. Negative value. |
| **dispatcharr** | Does HDHomeRun emulation, but the running pod binds **no UDP at all** — the emulation is HTTP-only here. Its consumers (plex, jellyfin) are in-cluster anyway, and entering the HDHR URL by hand is the documented, more robust path. |
| **rustdesk** | `rustdesk-server` (hbbs/hbbr) is a rendezvous/relay that clients reach by configured address; LAN peer discovery is a *client* feature. Also already has a LoadBalancer IP. Not inspectable (distroless), but not a candidate on design. |
| **emby**, **ersatztv** | Both would qualify — Emby shares Jellyfin's `7359`, ErsatzTV emulates HDHomeRun on UDP `65001` — but both are commented out of their `kustomization.yaml` and have no HelmRelease or pod. Revisit if either is ever enabled. |
| **stremio** | GitHub code search across the repo returned 0 hits for `SO_BROADCAST`, `ssdp` and `multicast`. |
| everything else | No discovery port bound, no multicast group joined. |

### Note on LoadBalancer services

A Cilium L2-announced LoadBalancer IP does **not** substitute for this. It
delivers unicast to the pod; it does not put the pod on the LAN broadcast
domain, so broadcast and multicast discovery still never arrive. qbittorrent and
rustdesk both have LoadBalancer IPs and would still be undiscoverable.

## Staged plan

### Stage 1 — Jellyfin and Plex (implemented)

Lowest risk, clearest payoff, no Tier-0 exposure. Adds a NAD and pins the pod;
changes nothing about how traffic reaches Jellyfin.

#### Pre-flight — both DONE, in this commit

Order matters here: getting it wrong takes Jellyfin down, and `hk check` will
not catch it. `flate` only renders HelmReleases, so it never validated the NAD
or its substitution — the 465-chart pass says nothing about this file.

1. **`JELLYFIN_LAN_IP` and `PLEX_LAN_IP` in `cluster-secrets.sops.yaml`** —
   set to `10.10.206.20` and `10.10.206.21`. Flux renders a missing `${VAR}` as
   empty, which would ship `"address": "/16"`, fail the Multus attachment, and
   leave the pod in `ContainerCreating` forever.
2. **`lan-nic=enp2s0` on fluttershy and kerfuffle** — applied live with
   `kubectl label`. Without it the new affinity terms match zero nodes and both
   pods go `Pending`. `talos/talconfig.yaml` carries the same label so it
   survives a rebuild, but **do not run `mise run talos:apply` to land it** —
   that would drag in Renovate's pending Kubernetes bump. Patch per node, or
   let it ride until the next planned apply.

Either failure is a Jellyfin outage, and the Kustomization is `wait: true` with
`retries: -1`, so it retries rather than surfacing loudly.

#### Why 10.10.206.20

It has to dodge two allocators. Verified free before assignment: no ARP reply
from a LAN node, and no UniFi client record. It sits **below** the Cilium pool
(`.100-200`, `.202-252`) so it can never be auto-assigned, and clear of the
node band (`.10-.17`). UniFi DHCP nominally spans `10.10.0.5-10.10.254.254` but
allocates upward from `.0.5` and has never reached `10.10.206.x` — the same
assumption every other static in this band already rests on.

Note `sops set` reindented `cluster-secrets.sops.yaml` from 4-space to 2-space
as a side effect, per `.sops.yaml`'s own `stores.yaml.indent: 2`. Read the diff
with `git diff -w`. Decrypted plaintext was compared before and after: exactly
one key added, no existing value or metadata changed.

Rollback is a revert of the commit plus
`kubectl label node fluttershy kerfuffle lan-nic-`; nothing here is stateful and
no data moves.

Pinning: Jellyfin requires `intel.feature.node.kubernetes.io/gpu=true`, which
matches five nodes across **both** NIC families. Stage 1 adds a `lan-nic` node
label so the affinity can narrow to `enp2s0` GPU nodes (`fluttershy`,
`kerfuffle`) — the same label-plus-nodeSelector shape Technitium uses.

Both workloads carry the identical Intel GPU affinity and therefore the
identical `lan-nic` narrowing. They can share the two enp2s0 nodes: ipvlan
children have distinct IPs, and `igmp_snooping` is off on the Home network, so
Plex's multicast memberships do not depend on per-child snooping state.

Verification from a LAN host — Jellyfin:

```bash
echo -n 'Who is JellyfinServer?' | socat - UDP-DATAGRAM:255.255.255.255:7359,broadcast
```

Plex GDM:

```bash
echo -n 'M-SEARCH * HTTP/1.0' | socat - UDP-DATAGRAM:255.255.255.255:32414,broadcast
```

Both should return server details. Plex clients on the LAN should then show the
server as local rather than as a remote plex.tv connection.

### Stage 2 — Matter (not started; verify IPv6 first)

**Do not start this before answering the IPv6 question.** Matter operational
discovery leans on mDNS over IPv6. The `Home` network reports
`ipv6_interface_type: none` with `ipv6_ra_enabled: true`, and the Talos
`networkInterfaces` are IPv4-only. Matter works today because `hostNetwork`
gives it whatever the host NIC has. A static IPv4-only ipvlan attachment may not
be equivalent. Confirm what IPv6 the Matter pod actually uses on the host today
before moving it.

Matter is Tier 1 (survives Battery windows), so this is a staged, out-of-hours
change with a tested rollback.

### Stage 3 — Home Assistant (not started; highest risk)

HA is the riskiest and must go last and alone. Beyond zeroconf browse it runs
the HomeKit bridge and accessory-mode cameras (ports 21063, 21070-73), SSDP, and
Thread. Changing HA's network identity re-announces the HomeKit bridge from a
new address; HomeKit should recover via mDNS re-announcement, but "should" is
carrying weight and the blast radius is every paired accessory.

HA also had an outage on 2026-09-04. Do not stack this on top of an unrelated
change.

## Rejected options

| Option | Why not |
|---|---|
| [blake/external-mdns](https://github.com/blake/external-mdns) | Watches Services and Ingresses only; `-source=gateway` is an open unimplemented issue. This repo has 75 HTTPRoutes and 4 Ingresses. Publishes A records only — no DNS-SD. Image last published 2024-03-10, manifests reference `:latest`. |
| [holoplot/kubelish](https://github.com/holoplot/kubelish) | Publishes proper SRV+TXT, but runs as a systemd unit outside the cluster against host `avahi-daemon`. Impossible on Talos. |
| [shipstuff/mdns-controller](https://github.com/shipstuff/mdns-controller) | DaemonSet with a bundled avahi, so Talos-compatible, but `avahi-publish-address` only (no service types), Ingress-only, and brand new with no adoption. |
| [vfreex/mdns-reflector](https://github.com/vfreex/mdns-reflector) | Router-side interface-to-interface reflector. The UCG-Max already does this job. |
| [Cilium multicast](https://docs.cilium.io/en/stable/network/multicast/) | Beta; pod-to-pod over the overlay only, never reaches the LAN. Manual `cilium-dbg` group config, no CRD, incompatible with IPsec. |
| [openshift/coredns-mdns](https://github.com/openshift/coredns-mdns) | Serves mDNS-discovered hosts over unicast DNS — the opposite direction, and Apple clients will not use unicast DNS for `.local` anyway. |
| avahi publisher for `.local` names | Needs `.local` hostnames on the Traefik gateway and cannot have TLS. Strictly worse than the existing `driscoll.tech` names. See above. |
