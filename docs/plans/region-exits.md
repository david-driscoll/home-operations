# Region exits: family choose where their traffic leaves from

**Status:** designed 2026-11-06, nothing built yet. Owner: David. Decision record:
[ADR 0005](../adr/0005-region-exits-gluetun-pod.md). Terms: GLOSSARY.md (Region exit, Region,
Region picker). Family instructions: [`docs/runbooks/region-exits.md`](../runbooks/region-exits.md).

**Deadline:** live before **2026-11-30**. Tailscale's Mullvad add-on ends at the end of
November 2026, and region exits replace it.

The idea comes from [manfredbjorlin/netbird_gluetun_mullvad](https://codeberg.org/manfredbjorlin/netbird_gluetun_mullvad)
(Apache-2.0): a NetBird client in gluetun's network namespace forwards its peers out through
Mullvad, and a small page calls gluetun's control API to switch city.

## A. Decisions

Decisions marked ✅ were taken by David on 2026-11-06 in a grilling session:

- ✅ **Provider:** Mullvad, on David's existing standalone account (not the Tailscale add-on).
- ✅ **Shape:** five shared, switchable region exits named after the Wonderbolts. Each one's
  default region lives in Git:

  | Region exit | Default region |
  |---|---|
  | spitfire | United States |
  | soarin | Canada |
  | fleetfoot | United Kingdom |
  | misty-fly | Germany |
  | high-winds | Japan |

  The five region exits use all five device slots on the Mullvad account.
- ✅ **Platform:** Equestria. One pod per region exit, in which gluetun, `netbird`, `tailscaled`
  and the region picker share the pod network namespace.
- ✅ **Who:** friends and family may use the region exits; only family and admins change their
  region.
- ✅ **Fail closed:** while the tunnel is down or reconnecting, forwarded traffic is dropped.
  Traffic never falls back to the home WAN.
- ✅ **Region picker:** one host, `wonderbolts.<root domain>`, on the internal Gateway behind
  Authentik forward-auth (family and admins). `/` is a read-only overview of all five region
  exits: their region, tunnel state, and how many people are on each. `/<name>` switches that
  region exit. The picker offers a country, optionally narrowed to a city. Before switching it
  shows how many people are on that region exit and asks for confirmation. There is no locking.
- ✅ **Persistence:** the last region picked survives restarts. Git holds only the default.
- ✅ **Picker build:** our own TypeScript server on a stock, digest-pinned `node:24-alpine`,
  mounted from a `configMapGenerator`. This is the same pattern as `kubernetes/apps/coder/setup-status`
  and `netbird-system/proxy-watchdog`. Nothing is vendored from the reference repo.
- ✅ **Mullvad keys:** Pulumi-managed. Pulumi generates each keypair, registers the public key with
  Mullvad's device API and writes the private key to OpenBao.
- ✅ **Tailscale access:** `member-exit-node` gains a `via` on the existing exit-node tags, and a
  new grant gives `group:fnf` and admins `autogroup:internet` via `tag:region-exit`.
- ✅ **Mesh transport bypasses the tunnel:** NetBird's and tailscaled's own packets leave over
  `eth0` (the home WAN). Only forwarded client traffic goes through Mullvad.
- ✅ **Monitoring:** Prometheus metrics from the region picker, a ServiceMonitor and a
  PrometheusRule.
- ✅ **Known v1 gaps, documented rather than fixed:** NetBird clients resolve DNS at home, and
  NetBird clients' IPv6 bypasses the region exit (§F).
- ✅ **Tailscale's Mullvad add-on:** it ends with November 2026. Once it has, remove the seven
  hand-set `mullvad` nodeAttrs (§E4).

Defaults proposed in the session and accepted with the design:

- Namespace `region-exits`.
- One ephemeral, reusable NetBird setup key per region exit.
- NetBird routes named `region-<name>`.
- The picked region kept in a ConfigMap that Flux does not manage.
- One region exit prototyped before the other four.

## B. Facts this rests on (read 2026-11-06)

- **No commercial VPN exists in the repo.** Mullvad appears only as seven hand-set `mullvad`
  nodeAttrs, which code deliberately leaves alone (`stacks/unifi-network/acl-manager.ts` ~L106,
  `components/tailscale/nodeAttrs.ts`,
  [cloudflare-tunnel-to-funnel.md](cloudflare-tunnel-to-funnel.md) §J1).
- **NetBird's overlay is `10.100.0.0/16`** (`stacks/netbird/index.ts` L58). It is clear of
  Tailscale's `100.64.0.0/10`, so both can live in one network namespace.
- **NetBird exit nodes today** are `exit-<stack>` routes on `0.0.0.0/0` with `skipAutoApply`,
  the access-control group `exit-internet`, and the policies `users-exit-nodes` and
  `users-internet` (`stacks/netbird/index.ts` ~L515-560).
- **Tailscale DNS:** `overrideLocalDns: true`, and the Technitium nameservers have
  `useWithExitNode: false` (`acl-manager.ts` ~L693-748). A Tailscale client on an exit node
  therefore resolves through the exit node's own resolver.
- **NetBird DNS:** both Technitium nameserver groups apply to every client, whatever route it
  uses (`stacks/netbird/dns.ts`).
- **The precedent for two overlays in one pod** is Technitium's `tailscale` and `netbird`
  sidecars (`kubernetes/apps/equestria/dns/technitium/helmrelease.yaml`). Its `tailscale-routing`
  init container already policy-routes tailscaled's mark `0x80000/0xff0000` and NetBird's
  `0x1bd00` into an `eth0`-only table, and uses `iptables-nft`, because the Talos kernel has no
  legacy tables.
- **Talos kubelet allows no unsafe sysctls**, so `net.ipv4.ip_forward` is set by a privileged
  container inside the pod, not through `securityContext.sysctls`.
- **Equestria has no default-deny network policy.** Egress to Mullvad on UDP 51820 is open.

## C. Pulumi

### C1. Mullvad devices, in `stacks/netbird`

Section 13 of `stacks/netbird` (`region-exit-devices.ts`, with the pure payload in
`regionExits.ts`), beside the NetBird half in C2. No stack of its own: one Stack CR, one
state file and one set of envRefs for everything a region exit needs from Pulumi.


- Add a `MullvadDevice` dynamic resource in `dynamic/mullvad/MullvadDevice.ts`:
  - **Create:** generate an X25519 keypair in-process and register the public key with
    Mullvad's device API.
  - **Delete:** revoke the device.
  - **Read:** fetch the device, so `pulumi refresh` drops one revoked by hand.
  - **Outputs:** the device id, the device name Mullvad assigns, the tunnel IPv4 address, and
    the private key as a secret.
- Read the Mullvad account number in `components/globals.ts` (provider centralisation) from
  OpenBao `third-party-tokens/mullvad/wonderbolts`, property `account`.
- Write one `baoKvSecret` per region exit at `third-party-tokens/mullvad/region-exits`, with
  properties `<name>_private_key` and `<name>_address`.
- Confirm the API's endpoints and auth flow (account number → access token → devices) against
  Mullvad's current docs during P1.

### C2. NetBird, in `stacks/netbird`

For each region exit:

- A device group `region-exit-<name>`.
- A setup key `region-exit-<name>`: ephemeral, reusable, auto-group `region-exit-<name>`. It is
  written to the existing OpenBao `third-party-tokens/netbird/setup-keys` as property
  `region_exit_<name>`, as `k8s_router` is.
- A `netbird.Route` named `region-<name>`:
  - network `0.0.0.0/0`, with `peerGroups: [region-exit-<name>]`, `masquerade: true` and
    `skipAutoApply: true`;
  - distribution groups `family`, `friends` and `admins`.
- A policy letting `family`, `friends` and `admins` use the region exits, modelled on
  `users-exit-nodes` and `users-internet`.

The memory note about same-prefix routes colliding applies to *renaming* one: rename in two
steps, never create-before-delete.

### C3. Tailscale, in `stacks/unifi-network`

- Add `tag:region-exit` to `components/constants.ts`, give it a tag owner, and add it to
  `autoApprovers.exitNode`.
- Add `via` to the `member-exit-node` grant, listing the existing exit-node tags.
- Add a new grant `region-exit`: `src: [group:fnf, admins]`, `dst: [autogroup:internet]`,
  `via: [tag:region-exit]`.
- Update the policy tests in `acl-manager.ts` so that friends and family can reach the internet
  via `tag:region-exit`, and others cannot.
- Mint a `TailnetKey` (reusable, preauthorised, tagged `tag:region-exit`) into the
  `region-exits/tailscale-authkey` Secret, following `KubernetesTailscaleAuthKey.ts`.

## D. Kubernetes: `kubernetes/apps/region-exits/`

### D1. Namespace and app

- The namespace kustomization sets `pod-security.kubernetes.io/enforce: privileged`.
- The `app/` directory has one app-template HelmRelease with five controllers (one per region
  exit, one replica each) and a `configMapGenerator` for:
  - the picker script;
  - `region-exit-defaults`: `SERVER_COUNTRIES` per region exit.

### D2. Containers in each pod

| Container | Image | Role |
|---|---|---|
| `routing` (init) | `tailscale/tailscale` (has `ip`, `iptables-nft`) | Sets `ip_forward=1`. Copies the `eth0` routes into table 100. Adds `fwmark 0x80000/0xff0000` (priority 90) and `fwmark 0x1bd00` (91) → table 100, and `to 100.64.0.0/10` → table 52 (95), all ahead of gluetun's 98–101 (§G2). Sets the mangle kill switch (§G7). Technitium's init is the template, but this one fails closed: any failed step keeps the pod down. |
| `gluetun` | `qmcgaw/gluetun` (digest-pinned) | `VPN_SERVICE_PROVIDER=mullvad`, `VPN_TYPE=wireguard`, `WIREGUARD_PRIVATE_KEY` and `WIREGUARD_ADDRESSES` from an ExternalSecret. `envFrom` takes the defaults ConfigMap, then the state ConfigMap (`optional: true`), so a picked region wins. `HTTP_CONTROL_SERVER_ADDRESS` is loopback only. `FIREWALL_OUTBOUND_SUBNETS` lists Equestria's pod and service CIDRs. `FIREWALL_INPUT_PORTS` lists the picker port and the two WireGuard ports. `DOT=on`. IPv6 is off. Forwarding and the bypass go in `/iptables/post-rules.txt` (§D3). |
| `netbird` | `netbirdio/netbird` (as the router pins) | `NB_SETUP_KEY` comes from the ExternalSecret. `NB_HOSTNAME=<name>`. `NB_DISABLE_CLIENT_ROUTES=true`, so it never uses another node's exit route. `NB_DISABLE_DNS=true` and `NB_DNS_RESOLVER_ADDRESS=127.0.0.1:5053`, so it stays off gluetun's :53, as Technitium does. State is in an emptyDir: the setup key is ephemeral, so each restart enrols fresh, which is also the only time NB_* env applies. |
| `tailscale` | `tailscale/tailscale` | containerboot with `TS_USERSPACE=false`, `TS_DEBUG_FIREWALL_MODE=nftables` and `TS_ACCEPT_DNS=false`. `TS_HOSTNAME=<name>`. `TS_EXTRA_ARGS=--advertise-exit-node --accept-routes=false`. State goes in a Secret through `TS_KUBE_SECRET`, with RBAC for that Secret only. |
| `picker` | `node:24-alpine` | The region picker (§D4). It shares a `/gluetun` emptyDir with gluetun, for `servers.json`, and the tailscaled and NetBird daemon sockets through emptyDirs. |

Set the pod's `dnsPolicy: None` with nameserver `127.0.0.1`. Everything in the pod then resolves
through gluetun's DNS-over-TLS over the tunnel. In particular, tailscaled answers Tailscale
clients' DNS with it, which makes Tailscale's DNS match the region. A side effect is that
NetBird cannot resolve the home relay's private name, so the region exits use the public relays.

### D3. Forwarding (gluetun post-rules)

- `FORWARD`: accept `wt0`→`tun0` and `tailscale0`→`tun0`, and established traffic coming back.
- `POSTROUTING`: masquerade sources in `10.100.0.0/16` and `100.64.0.0/10` out of `tun0`.
- `OUTPUT`: accept packets marked `0x1bd00` and `0x80000/0xff0000` out of `eth0`, so gluetun's
  kill switch lets the overlay transport through.
- Nothing accepts forwarded traffic to `eth0`. On its own this does not fail closed, because
  tailscaled's `ts-forward` accepts client traffic first (§G7). The kill switch is a mangle
  FORWARD drop of anything from tailscale0 not going out tun0, set by the `routing` init
  container (`kubernetes/apps/region-exits/app/resources/routing.sh`).

### D4. Region picker

- One script, run in every pod. It knows its own name from env and reaches the others through
  their Services.
  - **`GET /status`** (JSON) reports: region, tunnel up, the Mullvad egress country (gluetun's
    public-IP endpoint), whether NetBird and Tailscale are connected, and active clients.
  - **`GET /metrics`** serves the same values for Prometheus.
  - **`GET /`** shows the overview built from every region exit's `/status`.
  - **`GET /<name>`** offers country and city from gluetun's `servers.json`.
  - **`POST /<name>/region`** asks for confirmation when anyone is on the region exit. It then
    patches the `region-exit-<name>-state` ConfigMap (RBAC: get, create and patch on that name
    only) and calls gluetun's control API to reconnect.
- Active clients are distinct overlay sources (`10.100.0.0/16` or `100.64.0.0/10`) with a
  conntrack entry out of `tun0` in the last few minutes.
- `HTTPRoute` `wonderbolts.${ROOT_DOMAIN}` on Gateway `internal` in `network`, with middleware
  `authenticated-user`:
  - `/<name>` routes to that region exit's Service;
  - `/` routes to a Service selecting all five.
- `definition.yaml`: `authentik.proxy.mode: forward_single`, `groups: [family, admins]`. The
  pattern is `kubernetes/apps/equestria/downloads/qbittorrent`.
- No `$` in inline scripts: Flux post-build substitution rewrites it (see Technitium's init).

### D5. Monitoring

- A ServiceMonitor on each picker's `/metrics`.
- A PrometheusRule with these alerts:
  - `RegionExitTunnelDown` (5m);
  - `RegionExitWrongCountry` (15m), when the egress country differs from the stored region;
  - `RegionExitOverlayOffline` (10m), per overlay.

## E. Phases

1. **P0, prerequisites.**
   - Put the Mullvad account number in OpenBao and list it in `bootstrap/INVENTORY.md`.
   - Revoke any devices already on the account, since all five slots are needed.
2. **P1, prototype spitfire.**
   - One Mullvad device, one NetBird route, the Tailscale tag and grant, and the pod without the
     picker (region set by the defaults ConfigMap).
   - Resolve §G, then prove the following from a NetBird client and from a Tailscale client: the
     egress IP is in the US, P2P is direct (not relayed), killing gluetun drops traffic, and
     Tailscale DNS resolves through the region exit.
3. **P2, region picker.** The overview, switching, persistence across a pod delete, the
   active-client count, metrics and alerts.
4. **P3, all five.** Add the other four region exits. Walk the family runbook on a phone on each
   overlay.
5. **P4, cutover (by 2026-11-30).**
   - Send the runbook to family.
   - After the add-on ends, remove the seven `mullvad` nodeAttrs and the code comments that
     protect them, and close §J1 in `cloudflare-tunnel-to-funnel.md`.

## F. Known gaps (v1)

- **NetBird DNS resolves at home.** Nameserver groups go to distribution groups, not to "peers
  using route X". Services that geolocate by resolver, such as some CDNs and streaming services,
  may see home. IP geolocation, which most services check, is correct. A later fix could be an
  opt-in NetBird group whose nameserver is a region exit.
- **NetBird IPv6 bypasses the region exit.** The routes are `0.0.0.0/0` only, and the tunnel is
  IPv4 only, so a NetBird client on a dual-stack network reaches IPv6 sites directly, from where
  it really is. Tailscale's `::/0` through a region exit fails closed instead, and the client
  falls back to IPv4.
- **No locking.** A family member can move a region exit someone else is using. The picker
  warns before it switches.

## G. Open risks for the P1 prototype

Risks 1, 2, 3 and 7 were settled from the pinned sources (gluetun v3.41.3, tailscale v1.104.4)
for #3138, before the manifests were written. The live checks in the issue still have to confirm
them.

1. **gluetun's firewall on Talos.** It must use the nft backend: there are no legacy tables.
   Check that `post-rules.txt` applies there.

   **Resolved:** gluetun tries `iptables`, then `iptables-nft`, then `iptables-legacy`, and keeps
   the first that can append and delete a test rule and set the INPUT policy
   ([firewall.go L40](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/firewall.go#L40),
   [support.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/support.go)). Its
   image is Alpine 3.22, where `iptables` is the nft build (Alpine 3.19 switched it, as
   [tailscale's Dockerfile](https://github.com/tailscale/tailscale/blob/v1.104.4/Dockerfile#L99-L106)
   notes when it links back to legacy), so on Talos the first candidate wins with nft. Each
   post-rules line starting `iptables `, `iptables-nft ` or `iptables-legacy ` runs with that
   detected binary, and every other line is skipped, so `#` comments are safe
   ([iptables.go L260](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/iptables.go#L260)).
2. **`ip rule` priorities.** gluetun installs its own rules for its WireGuard table. They must
   not collide with priorities 100 and 101 (the bypass), NetBird's 105 and 110, or tailscaled's
   5210 and up. The bypass must sit below all of them.

   **Resolved:** Technitium's 100 and 101 would collide. gluetun uses 98 (to each local
   network, main;
   [local.go L99](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/routing/local.go#L99)),
   99 (to `FIREWALL_OUTBOUND_SUBNETS`, table 199;
   [outbound.go L13](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/routing/outbound.go#L13)),
   100 (from the pod IP, table 200;
   [inbound.go L12](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/routing/inbound.go#L12))
   and 101 (`not fwmark 0xca6c`, table 51820, which is tun0, present only while the tunnel is up;
   [wireguard.go L22](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/provider/utils/wireguard.go#L22)).
   tailscaled uses 5210/5230/5250 for its mark and 5270 for table 52
   ([router_linux.go L1594](https://github.com/tailscale/tailscale/blob/v1.104.4/wgengine/router/osrouter/router_linux.go#L1594)).
   The region exit takes **90** (fwmark `0x80000/0xff0000` → table 100, eth0 only),
   reserves **91** for NetBird's `0x1bd00` (#3139), and adds **95** (to `100.64.0.0/10` →
   table 52). Without 95, the replies to Tailscale clients, de-NATed to their 100.x address,
   would match gluetun's 101 and go back into the tunnel. The rules are in
   `kubernetes/apps/region-exits/app/resources/routing.sh`.
3. **Ordering and re-application.** gluetun rewrites its rules on every reconnect, including
   each region switch. The bypass and post-rules must survive that without the reference repo's
   30-second loop.

   **Resolved:** no loop is needed. gluetun enables its firewall, post-rules included, once, at
   startup ([main.go L235](https://github.com/qdm12/gluetun/blob/v3.41.3/cmd/gluetun/main.go#L235),
   [enable.go L74](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/enable.go#L74)).
   A reconnect or region switch only swaps the VPN-server OUTPUT rule and the tun0 rule
   ([vpn.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/vpn.go)), and
   deletes and re-adds only its own rule 101. Rules 90 and 95 and the mangle chains belong to
   nothing gluetun touches: it only flushes `filter`, and only when the firewall is disabled
   ([iptables.go L88](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/iptables.go#L88)).
   The init container sets them once per pod sandbox.
4. **gluetun's control API.** In the pinned version, confirm the endpoint for changing
   `SERVER_COUNTRIES`/`SERVER_CITIES` at runtime, its loopback binding and its auth role
   (`HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE`).
5. **Mullvad's device API.** Confirm the endpoints, the token flow and the error when the device
   limit is reached.
6. **Counting active clients.** Confirm conntrack is readable from the picker container (it needs
   `NET_ADMIN`, or a shared reader).
7. **tailscaled forwarding.** Check tailscaled's nftables `ts-forward` chain against gluetun's
   FORWARD policy.

   **Resolved, and it changes §D3:** the two share one chain. In nftables mode tailscaled
   creates its chains in the iptables-nft `filter` and `nat` tables, the same ones gluetun
   uses ([AddChains L931](https://github.com/tailscale/tailscale/blob/v1.104.4/util/linuxfw/nftables_runner.go#L931)).
   It inserts `jump ts-forward` at the top of `FORWARD`
   ([AddHooks L1098](https://github.com/tailscale/tailscale/blob/v1.104.4/util/linuxfw/nftables_runner.go#L1098)),
   and `ts-forward` marks and accepts everything arriving on tailscale0
   ([addBase4 L1721](https://github.com/tailscale/tailscale/blob/v1.104.4/util/linuxfw/nftables_runner.go#L1721)).
   `ts-postrouting` then masquerades it
   ([AddSNATRule L1879](https://github.com/tailscale/tailscale/blob/v1.104.4/util/linuxfw/nftables_runner.go#L1879)).
   An accept is final within its chain, so gluetun's FORWARD policy DROP never sees client
   traffic. With the tunnel down, gluetun's rule 101 is gone, main's default route via eth0
   applies, and the traffic would leave through the home WAN. "Nothing accepts forwarded traffic
   to eth0" therefore does not fail closed on its own. The kill switch is a DROP in the
   **mangle** table's FORWARD chain (`-i tailscale0 ! -o tun0`, and all IPv6 from tailscale0),
   set by the init container. It is another base chain on the forward hook, where a drop is
   final whatever `filter` accepts. The same holds for INPUT: `ts-input` accepts all of
   tailscale0, so the pod's own ports (gluetun's 8000 and 9999, the picker's 8080) are dropped
   on tailscale0 and wt0 in mangle INPUT too.
