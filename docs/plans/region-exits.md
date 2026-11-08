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
- ✅ **Who:** on NetBird, friends, family and admins may use the region exits; on Tailscale,
  family and admins only (`group:family`, decided 2026-11-07). Only family and admins change
  their region.
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
  new grant gives `group:family` and admins `autogroup:internet` via `tag:region-exit`.
  (Originally `group:fnf`; narrowed to `group:family` on 2026-11-07. Its members are
  hand-managed in the admin console.)
- ✅ **Mesh transport bypasses the tunnel:** NetBird's and tailscaled's own packets leave over
  `eth0` (the home WAN). Only forwarded client traffic goes through Mullvad.
- ✅ **Monitoring:** Prometheus metrics from the region picker, a ServiceMonitor and a
  PrometheusRule.
- ✅ **DNS resolves at home, on both meshes (2026-11-07):** each pod, gluetun included,
  resolves through the cluster Technitium, and so do Tailscale clients on a region exit
  (tailscaled answers them from the pod's resolver). Home names resolve everywhere and the two
  meshes agree. The trade-off, accepted: Technitium forwards upstream from the home WAN, so
  geo-DNS answers are home's, while IP geolocation stays on Mullvad (§D2, §F). This replaces
  the first design, in which Tailscale clients resolved through gluetun's DNS-over-TLS over the
  tunnel.
- ✅ **Known v1 gap, documented rather than fixed:** NetBird clients' IPv6 bypasses the region
  exit (§F).
- ✅ **Tailscale's Mullvad add-on:** it ends with November 2026. Once it has, remove the seven
  hand-set `mullvad` nodeAttrs (§E4).

Defaults proposed in the session and accepted with the design:

- Namespace `region-exits`. Superseded 2026-11-07: the region exits live in `netbird-system`
  (§D1, ADR 0005).
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
  therefore resolves through the exit node's own resolver: tailscaled forwards the query to the
  first nameserver in its `/etc/resolv.conf` (`net/dns/resolver/tsdns.go`
  `HandleExitNodeDNSQuery`, `stubResolverForOS`, v1.104.4).
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
- Add a new grant `region-exit`: `src: [group:family, admins]`, `dst: [autogroup:internet]`,
  `via: [tag:region-exit]`. (First `group:fnf`; family only since 2026-11-07, so friends use
  region exits over NetBird.) `group:family` is in the `groups` map of `components/constants.ts`
  so the policy declares it; `setGroup` keeps its hand-managed members.
- Guard the rendered policy (`stacks/unifi-network/region-exit-access.ts`, tested in
  `region-exit-access.test.ts`) so that family and admins can reach the internet via
  `tag:region-exit`, and friends in `group:fnf` only, other members and every tag cannot.
- Mint a `TailnetKey` (reusable, preauthorised, tagged `tag:region-exit`) into the
  `tailscale-system/tailscale-region-exit-authkey` Secret, which Reflector mirrors into
  `netbird-system` and no other namespace (`region-exit-authkey.ts`).

## D. Kubernetes: `kubernetes/apps/netbird-system/region-exits/`

### D1. Namespace and app

- Namespace `netbird-system` (decided 2026-11-07, replacing a namespace of their own,
  `region-exits`): the region exits are part of the NetBird estate, and share its downscaler
  exclusion (#3158). The directory is one more per-app Kustomization beside `router/`,
  `nbidp/` and the watchdogs, listed in `netbird-system/kustomization.yaml`. Nothing in it relies
  on a namespace label; the old namespace's PodSecurity patch was deleted with it (Talos removes
  PodSecurity admission anyway).
- The app keeps the name `region-exits` (Flux Kustomization, HelmRelease, the
  `app.kubernetes.io/name` label the CiliumNetworkPolicy selects, and the `region-exits-<name>`
  Services), so none of its objects collides with the rest of `netbird-system`.
- The directory has one app-template HelmRelease with five controllers (one per region
  exit, one replica each) and a `configMapGenerator` for:
  - the picker script;
  - `region-exit-defaults`: `SERVER_COUNTRIES` per region exit.

### D2. Containers in each pod

| Container | Image | Role |
|---|---|---|
| `routing` (init) | `tailscale/tailscale` (has `ip`, `iptables-nft`) | Sets `ip_forward=1`. Copies the `eth0` routes into table 100. Adds `fwmark 0x80000/0xff0000` (priority 90) and `fwmark 0x1bd00` (91) → table 100, and `to 100.64.0.0/10` → table 52 (95), all ahead of gluetun's 98–101 (§G2). Sets the mangle kill switch (§G7). Technitium's init is the template, but this one fails closed: any failed step keeps the pod down. |
| `gluetun` | `qmcgaw/gluetun` (digest-pinned) | `VPN_SERVICE_PROVIDER=mullvad`, `VPN_TYPE=wireguard`, `WIREGUARD_PRIVATE_KEY` and `WIREGUARD_ADDRESSES` from an ExternalSecret. `envFrom` takes the defaults ConfigMap, then the state ConfigMap (`optional: true`), so a picked region wins. `HTTP_CONTROL_SERVER_ADDRESS` is loopback only. `FIREWALL_OUTBOUND_SUBNETS` lists Equestria's pod and service CIDRs. `FIREWALL_INPUT_PORTS` lists the picker port and the two WireGuard ports. No resolver: `DNS_SERVER=off` with `DNS_KEEP_NAMESERVER=on`, so it leaves `resolv.conf` alone (with the server off alone it would rewrite it to Cloudflare), and `DNS_UPDATE_PERIOD=0`, so it never loads block lists. The healthcheck targets are IPs. IPv6 is off. Forwarding and the bypass go in `/iptables/post-rules.txt` (§D3). |
| `netbird` | `netbirdio/netbird` (as the router pins) | `NB_SETUP_KEY` comes from the ExternalSecret. `NB_HOSTNAME=<name>` is the base: the command appends the pod-name suffix (`POD_NAME` from the downward API), so each pod enrols as `<name>-<suffix>` and never waits on the old peer's deletion (§F). The route and policies select the `region-exit-<name>` device group, not the peer name. `NB_DISABLE_CLIENT_ROUTES=true`, so it never uses another node's exit route. `NB_DISABLE_DNS=true` and `NB_DNS_RESOLVER_ADDRESS=127.0.0.153:5053`, where nothing uses it. Not 127.0.0.1: off port 53 NetBird DNATs `<listen IP>:53` to its own port, which on 127.0.0.1 hijacked gluetun's old resolver (SERVFAIL, then healthcheck restart loops). Nothing uses 127.0.0.1:53 now either, so the DNAT is harmless. State is in an emptyDir: the setup key is ephemeral, so each restart enrols fresh, which is also the only time NB_* env applies. |
| `tailscale` | `tailscale/tailscale` | containerboot with `TS_USERSPACE=false`, `TS_DEBUG_FIREWALL_MODE=nftables` and `TS_ACCEPT_DNS=false`. `TS_HOSTNAME=<name>`. `TS_EXTRA_ARGS=--advertise-exit-node --accept-routes=false`. State goes in a Secret through `TS_KUBE_SECRET`, with RBAC for that Secret only. |
| `picker` | `node:24-alpine` | The region picker (§D4). It shares a `/gluetun` emptyDir with gluetun, for `servers.json`, and the tailscaled and NetBird daemon sockets through emptyDirs. |

Set the pod's `dnsPolicy: None` with one nameserver: the cluster Technitium's pinned Service
ClusterIP (the `TECHNITIUM_CLUSTER_IP` substitution, the address CoreDNS forwards the root domain
to). Everything in the pod resolves through it: gluetun, NetBird, the picker, and tailscaled,
which answers Tailscale clients' DNS from it. NetBird clients already resolve through Technitium
(their nameserver groups), so both meshes give the same answers, and home names resolve on a
region exit (decided 2026-11-07, ADR 0005).

- **Path.** Lookups leave by `eth0`, outside the tunnel: the Service CIDR is in
  `FIREWALL_OUTBOUND_SUBNETS`, which gives gluetun's rule 99 (table 199, via `eth0`) and its
  OUTPUT accept (`internal/firewall/outboundsubnets.go`, v3.41.3), and in `routing.sh`'s
  `region-exit-out` chain. The CiliumNetworkPolicy leaves egress open, and Technitium answers
  recursion for private sources (`AllowOnlyForPrivateNetworks`), which the pod IP is.
- **Trade-off.** Technitium forwards upstream from the home WAN, so geo-DNS answers (some CDNs
  and streaming services) are home's. IP geolocation, which most services check, is the
  region's. Technitium's block lists apply to region exit clients too.
- **Resilience.** Technitium is a single replica, and a region exit has no second resolver
  (tailscaled reads only the first anyway). While it restarts, the region exits' clients lose
  DNS but keep their tunnel: gluetun's healthcheck dials IPs, never a name.
- **Side effect.** NetBird in the pod can now resolve the home relay's private name, so the
  region exits may use the home relay rather than only the public ones.

### D3. Forwarding (gluetun post-rules)

- `FORWARD`: accept `wt0`→`tun0` and `tailscale0`→`tun0`, and established traffic coming back.
- `POSTROUTING`: masquerade sources in `10.100.0.0/16` and `100.64.0.0/10` out of `tun0`. These
  two are set by the `routing` init container, guarded with `-C`, not by post-rules: gluetun execs
  each post-rules line without a shell, only flips a leading `-A` to `-D` on rollback, and never
  flushes `nat`, so a `-t nat -A` line there would pile up duplicates.
- `OUTPUT`: accept packets marked `0x1bd00` and `0x80000/0xff0000` out of `eth0`, so gluetun's
  kill switch lets the overlay transport through.
- Nothing accepts forwarded traffic to `eth0`. On its own this does not fail closed, because
  tailscaled's `ts-forward` accepts client traffic first (§G7). The kill switch is a mangle
  FORWARD drop of anything from tailscale0 not going out tun0, set by the `routing` init
  container (`kubernetes/apps/netbird-system/region-exits/resources/routing.sh`).
- NetBird does the same as tailscaled: it inserts `-i wt0 -j ACCEPT` at the top of filter FORWARD
  and INPUT. It never adds rules to iptables-managed tables such as mangle
  ([chains_linux.go](https://github.com/netbirdio/netbird/blob/v0.82.0/client/firewall/nftables/chains_linux.go),
  `isIptablesTable`). So wt0 gets the same mangle drops: FORWARD `-i wt0 ! -o tun0`, all IPv6
  from wt0, and the INPUT port drops. Rule 91 sends NetBird's own `0x1bd00` packets to table 100,
  and rule 96 (`to 10.100.0.0/16`, main without its default route) returns replies to NetBird
  clients over wt0.

### D4. Region picker

Amended 2026-11-07 by [ADR 0006](../adr/0006-region-picker-own-app.md) and
[wonderbolts-nuxt.md](wonderbolts-nuxt.md). The pages are now their own Nuxt app,
`app/` in the forge's `home-operations/wonderbolts`, deployed by the Kustomization
`kubernetes/apps/netbird-system/wonderbolts` from that repository's `deploy/`. What stays in
each pod is the agent, the `picker` container (`picker.ts`), which serves JSON only.

- **The agent**, one script run in every pod, knows its own name from env:
  - **`GET /status`** (JSON) reports: region, tunnel up, the Mullvad egress country (gluetun's
    public-IP endpoint), whether NetBird and Tailscale are connected, active clients, and the
    last move (who and when, from the state ConfigMap's annotations). It also reports one
    derived `availability` (`overlays.ts` `availabilityOf`): `online`, `degraded` with the
    overlay that is offline (as for ~10 minutes on NetBird after a restart, §F), or `offline`
    (tunnel down, or both overlays down).
  - **`GET /metrics`** serves the same values for Prometheus, plus `region_exit_available`
    (online or degraded).
  - **`GET /regions`** lists the countries and cities in gluetun's `servers.json`.
  - **`POST /region`** (JSON, with `movedBy`) answers 409 while anyone is on the region exit,
    until the move is confirmed. It then patches the `region-exit-<name>-state` ConfigMap
    (RBAC: get, create and patch on that name only) and calls gluetun's control API to
    reconnect.
  - Its CNP admits only the app's pods (and Prometheus for `/metrics`, the kubelet for
    `/healthz`).
- **The app** shows the overview at `/` (refreshed every 30 s) and each region exit at
  `/<name>`. It adds `unreachable` for an agent that doesn't answer. Family and admins move
  region exits: quick countries (USA, Canada, UK), or a country and an optional city, with a
  confirm step when the agent asks for one. The app refuses everyone else.
- Active clients are distinct overlay sources (`10.100.0.0/16` or `100.64.0.0/10`) with a
  conntrack entry out of `tun0` in the last few minutes.
- `HTTPRoute` `wonderbolts` (`wonderbolts.${ROOT_DOMAIN}`) on Gateway `internal` in
  `network`, with middleware `authenticated-user`, routes everything to the app.
- `definition.yaml`, now in `kubernetes/apps/netbird-system/wonderbolts`:
  `authentik.proxy.mode: forward_single`, `groups: [family, admins, friends]` (friends look but
  can't move, which the app enforces). The
  pattern is `kubernetes/apps/equestria/downloads/qbittorrent`.
- No `$` in inline scripts: Flux post-build substitution rewrites it (see Technitium's init).

### D5. Monitoring

- A ServiceMonitor on each picker's `/metrics`.
- A PrometheusRule with these alerts:
  - `RegionExitTunnelDown` (5m);
  - `RegionExitWrongCountry` (15m), when the egress country differs from the stored region;
  - `RegionExitOverlayOffline` (10m), per overlay;
  - `RegionExitDown` (15m), one rule per region exit, when no picker answers its scrape
    (`absent(up{namespace="netbird-system", service="region-exits-<name>"} == 1)`): the pod is gone, Pending or
    crash-looping, or the picker is dead, which would otherwise silence the alerts above.
- The egress match compares countries, not strings: Mullvad's `servers.json` says "USA", "UK",
  "Czech Republic", "Turkey", "Netherlands", and gluetun's public-IP vote may report MaxMind's
  or ip2location's spelling ("Czechia", "Türkiye", "The Netherlands"). `metrics.test.ts` holds
  every Mullvad country.
- Going from one controller to five keeps spitfire's Deployment and ServiceAccount named
  `region-exits` (`forceRename`). Renamed, Helm would create `region-exits-spitfire` before
  deleting `region-exits`, and two spitfire pods would share the Mullvad key and tailscaled
  state for a while. Kept, the Deployment updates in place and `Recreate` stops the old pod
  first. Its Service, Role and RoleBinding do take the `-spitfire` names; none of them runs a pod.

## E. Phases

1. **P0, prerequisites.**
   - Put the Mullvad account number in OpenBao and list it in `bootstrap/INVENTORY.md`.
   - Revoke any devices already on the account, since all five slots are needed.
2. **P1, prototype spitfire.**
   - One Mullvad device, one NetBird route, the Tailscale tag and grant, and the pod without the
     picker (region set by the defaults ConfigMap).
   - Resolve §G, then prove the following from a NetBird client and from a Tailscale client: the
     egress IP is in the US, P2P is direct (not relayed), killing gluetun drops traffic, and
     Tailscale DNS resolves through the region exit. (Since 2026-11-07, through Technitium:
     §D2.)
3. **P2, region picker.** The overview, switching, persistence across a pod delete, the
   active-client count, metrics and alerts.
4. **P3, all five.** Add the other four region exits. Walk the family runbook on a phone on each
   overlay.
5. **P4, cutover (by 2026-11-30).**
   - Send the runbook to family.
   - After the add-on ends, remove the seven `mullvad` nodeAttrs and the code comments that
     protect them, and close §J1 in `cloudflare-tunnel-to-funnel.md`.

### E1. Live migration to `netbird-system` (2026-11-07)

Moving the namespace is not an in-place update: Flux creates the app in `netbird-system` and
prunes the `region-exits` namespace, and everything in it, in the same reconcile. For a moment
the old and new pods can overlap and share a Mullvad key; whichever handshakes last wins, and the
old pod is gone within seconds.

- **Tailscale:** each region exit's tailscaled state Secret (`region-exit-<name>-tailscale`) is
  pruned with the old namespace, so the new pod logs in fresh with the auth key and the
  tailnet sees a new device. After rollout, delete the old offline `spitfire` device (and any
  other region exit's offline twin) in the Tailscale admin, then rename the new `spitfire-1`
  back to `spitfire`.
- **NetBird:** the peer is ephemeral; it re-enrols with its setup key and the stale one expires.
- **Mullvad:** unaffected. The keys live in OpenBao and the ExternalSecrets read the same path.
- **Picked regions:** the `region-exit-<name>-state` ConfigMaps go with the old namespace, so
  each region exit restarts on its default region until someone picks again.

## F. Known gaps (v1)

- **DNS resolves at home, on both meshes. By design since 2026-11-07.** This began as a NetBird
  gap: nameserver groups go to distribution groups, not to "peers using route X", so NetBird
  clients on a region exit resolved through Technitium. Rather than make Tailscale differ, the
  region exits now resolve through Technitium too (§A, §D2). Services that geolocate by
  resolver, such as some CDNs and streaming services, may see home. IP geolocation, which most
  services check, is the region's. Revisit only if a service that matters keys on the resolver:
  then the fix is a per-region resolver for both meshes, not for one.
- **NetBird IPv6 bypasses the region exit.** The routes are `0.0.0.0/0` only, and the tunnel is
  IPv4 only, so a NetBird client on a dual-stack network reaches IPv6 sites directly, from where
  it really is. Tailscale's `::/0` through a region exit fails closed instead, and the client
  falls back to IPv4.

  **To confirm live (#3139):** the account has an overlay IPv6 range for every peer, and
  management adds the `::/0` half of a `0.0.0.0/0` exit route for peers with an overlay IPv6
  address (`stacks/netbird/index.ts`, section 5). If so, NetBird clients' IPv6 also reaches
  spitfire, where the mangle drop on IPv6 from wt0 fails it closed, as on Tailscale. Record
  which of the two a dual-stack client sees.
- **No locking.** A family member can move a region exit someone else is using. The picker
  warns before it switches.
- **NetBird "connected" is only wt0 up.** The picker reports NetBird connected while `wt0`
  exists and is `IFF_UP` (`overlays.ts`), which the engine tears down when management is lost
  for good. It misses a stalled signal or relay connection. The stronger reads all need more
  than the picker should have: `netbird status --check startup` (v0.82.0: management, signal
  and a relay connected) goes through the daemon's gRPC socket, which has no read-only mode and
  would let the picker run `down` or rewrite the config. WireGuard handshake times come only from
  generic netlink, which needs `NET_ADMIN` in the pod's namespace and so would also reach the kill
  switch (§G6); sysfs has no per-peer state. The same check as an exec probe on the netbird
  container would fail the whole pod's readiness and take its picker off the route. Revisit if
  NetBird grows a read-only status endpoint.
- ~~**A restart costs about 10 minutes on NetBird.**~~ **Resolved 2026-11-07 by per-pod
  hostnames; old peers age out on their own.** Each pod enrols a fresh ephemeral peer (state in
  an emptyDir), and management won't register a second peer with the same hostname while the old
  ephemeral one still exists, which it deletes only about 10 minutes after it goes offline. Seen
  2026-11-07: the audit log showed each new `spitfire` peer added seconds after the old one was
  deleted. #3171 kept the pod Ready through that gap (the `netbird` container retries in place
  rather than crash-looping); David then chose a unique hostname per pod over NetBird state on a
  PVC with a non-ephemeral key. The peer is now `<name>-<pod name suffix>` (`spitfire-jjvlx`),
  so a restarted pod rejoins within about a minute and the old peer is deleted on schedule.
  Routes and policies use the device group, never the peer name (§D2).
- **A rollout takes the picker off for about a minute.** The region-exits Deployments use
  `strategy: Recreate`, so a rollout (any change to the pod template, such as a picker change
  in the ConfigMap) stops the old pod before starting the new one, and the picker on
  wonderbolts answers 503 until the new pod is Ready, about a minute. A plain pod restart no
  longer does: #3171 keeps the pod Ready while the `netbird` container retries in place.
  Recreate stays on purpose: a rolling update would briefly run two pods on one Mullvad key and
  one Tailscale state. Accepted by David 2026-11-07.

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
   `kubernetes/apps/netbird-system/region-exits/resources/routing.sh`.
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

   **Resolved (#3140):** `PUT /v1/vpn/settings` takes a partial `settings.VPN`,
   `{"provider":{"server_selection":{"countries":[..],"cities":[..]}}}`. gluetun overrides only
   the fields given (a non-nil empty `cities` clears a city), validates the result against its
   server list (a 400 if no server matches), and stops and restarts the tunnel only if something
   changed ([server/vpn.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/server/vpn.go),
   [vpn/state/vpn.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/vpn/state/vpn.go)).
   `HTTP_CONTROL_SERVER_ADDRESS` defaults to `:8000`, so it is set to `127.0.0.1:8000`
   ([settings/server.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/configuration/settings/server.go)).
   With no auth file, the built-in `public` role leaves out `/v1/vpn/settings`.
   `HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE={"auth":"none"}` covers every route the auth file does
   not, and the auth file is absent, so loopback is the only boundary
   ([middlewares/auth/settings.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/server/middlewares/auth/settings.go)).
   The picker reads the region from `GET /v1/vpn/settings`, the tunnel from `GET /v1/vpn/status`
   and the egress country from `GET /v1/publicip/ip`. The Mullvad server names it offers come
   from `servers.json`, which gluetun writes (mode 0644) into the `/gluetun` emptyDir.
5. **Mullvad's device API.** Confirm the endpoints, the token flow and the error when the device
   limit is reached.
6. **Counting active clients.** Confirm conntrack is readable from the picker container (it needs
   `NET_ADMIN`, or a shared reader).

   **Resolved (#3141):** neither. The picker reads `/proc/net/nf_conntrack` as **group 0**, with
   no capability. The Talos kernel has `CONFIG_NF_CONNTRACK_PROCFS=y` (read from a 6.18 Talos
   node's `/proc/config.gz`), and the picker shares the pod's network namespace, so the file is
   that namespace's table: the clients' forwarded flows and nothing from the node. The kernel
   creates it `0440` owned by the namespace's root uid and gid and makes no capability check on
   read ([nf_conntrack_standalone.c](https://github.com/torvalds/linux/blob/v6.18/net/netfilter/nf_conntrack_standalone.c)),
   so the picker keeps `runAsUser: 1000`, `runAsNonRoot`, all capabilities dropped and a
   read-only root, and changes only `runAsGroup` to 0. Netlink (`conntrack -L`) would need
   `NET_ADMIN` in this namespace, which also lets a process rewrite the mangle kill switch and
   gluetun's firewall. A privileged sidecar writing a count file would put another privileged
   container in the pod. Both cost more than a group.

   The count (`kubernetes/apps/netbird-system/region-exits/activeClients.ts`) is the number of distinct IPv4
   sources in `10.100.0.0/16` or `100.64.0.0/10` with an entry that is masqueraded, i.e. whose
   reply goes to an address other than the client's. routing.sh masquerades overlay sources only
   out `tun0`, and the mangle FORWARD drop discards everything else before conntrack confirms it,
   so a masqueraded entry is a flow through the tunnel. Overlay connections to the pod itself are
   not masqueraded and do not count. Conntrack keeps no last-seen time, but each packet resets an
   entry's timeout to its state's full value, so an `ESTABLISHED` TCP entry counts only while
   `nf_conntrack_tcp_timeout_established` minus its remaining timeout is under 180 seconds.
   Every other state and protocol times out within a few minutes and counts while it exists.
   When conntrack cannot be read, `/status` reports `activeClients: null` and a switch asks for
   confirmation as if someone were on the region exit.

   **To confirm live:** in the pod, `/proc/net/nf_conntrack` is readable by the picker, it is not
   masked by the runtime, and the count follows one Tailscale and one NetBird client to 2 and
   then back to 0.
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
