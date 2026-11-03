# Self-hosted NetBird for client access (Oracle Always Free, Azure fallback)

**Status:** plan, re-scoped 2026-11-02. Nothing is built. Tracked in epic
[#2880](https://github.com/david-driscoll/home-operations/issues/2880) and its sub-issues. Every decision
in [§M](#m-decision-log) was taken by David.

**History of the scope:**

- **2026-10-24:** self-hosted full mirror of the tailnet.
- **2026-11-02 (first change):** client access only, on NetBird Cloud.
- **2026-11-02 (second change):** **back to self-hosted on OCI, with an automated Azure fallback**, keeping
  the client-only scope.

Facts marked **(unverified)** are checked in the ticket that depends on them.

## A. Goal and scope

**Client devices use NetBird to get into the estate:** phones, laptops and Apple TVs. They run NetBird *only*,
because iOS, Android and tvOS allow one VPN at a time.

**Everything else stays on Tailscale:**

- every server;
- the backplane (Garage, OpenBao seal path, Pulumi state);
- break-glass;
- all admin work (SSH, Proxmox UI, `kubectl`, tsidp realms on PVE/PBS).

NetBird must never enter a recovery path. An admin laptop may run both meshes; the overlays don't collide (§F).

**Out of scope:**

- NetBird on servers, and NetBird SSH;
- a `kubectl` ClusterProxy;
- a bridge from NetBird into tailnet-only services (garage-s3/admin VIPs, bao-*, taildrive, and five k8s apps
  without an internal route);
- Funnel, Taildrive, golink, session recording and Mullvad.

## B. Why client access is mostly "route the LAN"

From the 2026-11-02 reachability sweep:

| Service class | Reachable with LAN routing + Technitium DNS? |
|---|---|
| ~120 Equestria apps on the `internal` Gateway (`<app>.<root domain>`; Jellyfin, Home Assistant, *arr…) | Yes. `internal-network` already allows 10/8 and 100.64/10 |
| Authentik (`authentik.` / `iris.` / `canterlot.<root domain>` → LAN VIP) | Yes |
| Alpha-site Dockge apps (host A record = LAN IP) | Yes, apart from bao-standby/bao-transit (tailnet-only) |
| Celestia / luna / skystar Dockge apps | **No.** The host A record falls back to the Tailscale IP. Fixed in §H |
| garage-s3/admin VIPs, bao-*, taildrive, five k8s apps without an internal route | No, and they stay Tailscale-only |

## C. Topology

```
                ┌──── OCI Ashburn (Always Free, primary) ────┐      ┌──── Azure East US 2 (VS credits) ───┐
 netbird.<root  │ A1 2 OCPU/12 GB · netbird-server + dashboard│      │ relay (always on)                   │
 domain> ──DNS──┤ + Traefik + embedded Dex→Authentik          │      │ server compose ready, idle (fenced) │
  (60s TTL)     │ memory ballast · tailscaled (admin)         │      │ tailscaled (admin)                  │
                └──────────────┬──────────────────────────────┘      └──────────────┬──────────────────────┘
                               │ backup every 15 min → Garage (over tailnet) ◀── restore on promotion
            watchdog (Equestria) ── probes OCI; flips DNS to Azure when only OCI is down
 relays: OCI (embedded) · Azure · netbird-relay container on every Dockge host (alpha-site, celestia, luna, skystar)
 gateways: netbird gateway container on each site's Dockge host(s) → site LAN routes + exit node
           Equestria operator NetworkRouter → 2nd path to internal Gateway + Authentik VIP
 DNS for clients: Technitium (LAN IPs)
```

## D. OCI primary (free-tier guarded)

- **Free-only tenancy, home region US East (Ashburn).** Always Free compute only runs in the home region, which is
  permanent.
- **The A1 allowance was halved in 2026:** "1,500 OCPU hours and 9,000 GB hours… **2 OCPUs and 12 GB**". Design for
  2/12; NetBird needs 1 vCPU and 2 GB.
- **Ashburn A1 is often out of capacity on free-only accounts.** Retry, or switch AD and update the quota AD to
  match.
- **Idle reclamation** happens when the 7-day p95 of CPU, network *and* memory are all under 20%. A **~3 GB memory
  ballast** container keeps memory above the threshold. An alarm fires on instance stop. If reclamation happens
  anyway, the Azure failover (§E) covers it.
- **One stack, `stacks/netbird-edge`, with one admin key.** It holds:
  - the `netbird` compartment;
  - one `oci.limits.Quota` (allow-list, pinned to the home AD);
  - a $1 budget with ACTUAL > $0.01 and FORECAST alerts;
  - VCN, subnet and NSG (80/tcp, 443/tcp, 443/udp, 3478/udp; **no public 22**);
  - a RESERVED public IP;
  - the A1 VM;
  - a user-defined boot-volume backup policy (≤ 3 copies);
  - the Azure resources (§E).
- **Instance settings:** Ubuntu 24.04 aarch64, a 100 GB boot volume, `deleteBeforeReplace`, and ignoring
  `sourceDetails.sourceId` and `metadata`. IMDSv2 only.
- **cloud-init:**
  - add ACCEPT rules to OCI's Ubuntu `rules.v4` before installing Docker. Never `iptables -F`;
  - unattended-upgrades;
  - Docker;
  - Tailscale (`tag:netbird-edge`, admins only).
- **Guards:**
  1. A component that throws when the shape, region or size is outside the free allowance.
  2. A CrossGuard pack, run in CI, that checks:
     - Σ A1 ≤ 2 OCPU / 12 GB;
     - Σ storage ≤ 200 GB;
     - at most 1 reserved IP;
     - backup retention ≤ 5;
     - `deleteBeforeReplace` on every instance;
     - the quota statements match the allow-list exactly.
  3. OCI quotas.
  4. The budget.
- **Quota sketch.** Verify the zero-then-set semantics, and find the LB/NLB quota names
  **(unverified)**.
  ```
  zero compute-core quotas in tenancy
  zero compute-memory quotas in tenancy
  set compute-core quota standard-a1-core-count to 2 in tenancy where request.ad = '<home AD>'
  set compute-memory quota standard-a1-memory-count to 12 in tenancy where request.ad = '<home AD>'
  zero block-storage quotas in tenancy
  set block-storage quota total-storage-gb to 200 in tenancy where request.ad = '<home AD>'
  set block-storage quota backup-count to 5 in tenancy where request.region = 'us-ashburn-1'
  zero vcn quotas in tenancy
  set vcn quota vcn-count to 2 in tenancy where request.region = 'us-ashburn-1'
  set vcn quota reserved-public-ip-count to 1 in tenancy where request.region = 'us-ashburn-1'
  zero load-balancer quotas in tenancy
  ```

## E. Azure fallback and automated failover

**The Azure VM:**

- One Arm VM in **East US 2** on the Visual Studio subscription, with the **spending limit on**.
- At least 2 GB RAM. B2pts v2 has 1 GB, so pick a B2pls v2 or similar and check it fits the credit.
- It has a static public IP and an NSG for 80/tcp, 443/tcp, 443/udp and 3478/udp.
- It runs **`netbirdio/relay` all the time**, and holds the full server compose **stopped**.
- It is in `stacks/netbird-edge`, with the `azure-native` provider constructed in `components/globals.ts`.

**Fencing: DNS is the lease.**

- Each server runs a small fence loop. It starts NetBird management only while `netbird.<root domain>` resolves to
  its own public IP, and stops management otherwise.
- Resolution is checked against Cloudflare's authoritative answer, not a local cache.
- The upshot: a rebuilt or un-reclaimed OCI VM never comes up as a second management while DNS points at Azure.

**Watchdog in Equestria (CronJob, every minute).**

- It probes `https://<OCI IP>` management health.
- After **N consecutive failures**, and only if it can still reach the Azure VM and Cloudflare (so a home-internet
  outage never triggers it), it rewrites the `netbird.<root domain>` A record to the Azure IP. It uses the
  existing Cloudflare token.
- It alerts on every flip.

**Promotion on Azure.** The fence loop sees DNS pointing at itself. It pulls the newest backup from Garage, over
the tailnet, then starts management. Peers reconnect without re-enrolling, because the domain, encryption key and
relay secret are the same.

**Loss window:** ≤ 15 minutes of changes, mostly peer metadata and any policy edits. Pulumi re-applies policy on
its next run.

**Failback is manual and runbooked:**

1. Back up Azure.
2. Restore on OCI.
3. Flip DNS with the Pulumi config switch.
4. The fence loops stop Azure's management and start OCI's.

Doing it by hand avoids flapping.

**Unverified:** clients' DNS re-resolution of the management URL after the TTL expires, and Let's Encrypt cert
availability on Azure before its first promotion. Pre-issue it with DNS-01.

## F. NetBird server

- **What runs:** the combined `netbird-server` (management, signal, relay, STUN), the dashboard, and Traefik
  ≥ 3.7.12 with `aliasHeadersStrategy=delete`. Images are pinned for Renovate.
- **Store:** SQLite. Postgres buys nothing without the Enterprise HA licence.
- **Deployment:** the same compose and config go to both OCI and Azure through `remote.Command`.
- **Overlay range: `10.100.0.0/16`,** set before any peer enrols. It avoids Tailscale's 100.64/10 on dual-mesh
  desktops and stays inside `internal-network`'s 10/8.
- **IdP:**
  - embedded Dex with **Authentik as a connector**. `stacks/authentik` gets an OAuth2 provider `netbird` with
    `groups` in the id_token;
  - **JWT group sync** on, with allow groups admins/family/friends/media-managers;
  - one **local break-glass admin**.
- **Secrets:** the store encryption key, relay secret and local admin are generated once. They go to OpenBao and
  1Password and are recorded in `bootstrap/INVENTORY.md`, but are not part of any recovery path.
- **Backups:** an **every-15-minutes** SQLite online backup (`.backup`, no stack stop) plus config, uploaded to
  Garage S3 over the tailnet, with retention. An empty data directory triggers an automatic restore. That covers
  both OCI rebuild and Azure promotion.

## G. Relays and gateways

- **Relays:**
  - OCI's embedded relay;
  - the Azure relay;
  - a **`netbird-relay` Docker stack in `docker/_common`** on every Dockge host (alpha-site, celestia, luna,
    skystar). Each needs a WAN port-forward for 443/tcp, 443/udp and 3478/udp at its site. Use the UniFi
    port-forward pattern where UniFi is the router, and check what fronts the gulf-of-mexico site.

  All are listed in `server.relays.addresses`. Whether the embedded relay stays on once external relays are
  listed is **(unverified)**.
- **Gateways:**
  - a **`netbird-gateway` Docker stack** (`netbirdio/netbird`, host networking, `NET_ADMIN`, `/dev/net/tun`) on each
    site's Dockge host(s). Each is a routing peer for its site LAN and an **exit node**;
  - home has two Dockge hosts (alpha-site and celestia), so home gets two gateways at different metrics, which
    gives HA;
  - the gulf-of-mexico subnet is not in the repo yet; the gateway ticket finds it;
  - gateways advertise routes but never accept them.
- **Equestria:** the NetBird operator runs `NetworkRouter` pods as a second route to the `internal` Gateway IP and
  the Authentik VIP. It does nothing else.

## H. Dockge hosts publish LAN IPs

Celestia, luna and skystar get their LAN `ipAddress`, as alpha-site already does.

**Audit cross-site consumers first:**

- **Cluster workloads are safe:** CoreDNS rewrites `dockge-*.<root domain>` to tailnet names.
- **Not yet checked:** Dockge-to-Dockge, Prometheus, Backrest and Garage traffic by name.
- **Fallback if the audit finds a blocker:** Technitium-only LAN answers.

## I. Pulumi owns the account: `stacks/netbird`

**Provider.** The official Terraform provider (`netbirdio/netbird`, 0.0.x), bridged through the root
`Pulumi.yaml` `packages:` like tailscale and authentik. Gaps fall back to raw-API dynamic resources. It
authenticates with an admin service-user PAT from OpenBao.

**The stack manages:**

- **Account:** the range, peer DNS domain (`nb.<root domain>`), login expiry and JWT settings; the `Default` policy
  deleted.
- **Groups and setup keys:** one key per gateway and per operator, plus a reusable `apple-tv` key, stored in
  OpenBao.
- **Networks:** site LAN resources, routing peers and exit routes.
- **DNS:** the Technitium nameserver group.
- **Policy:** the client-access policy (§J).

## J. Client-access policy

| Group | Can reach |
|---|---|
| `members` | Authentik, the k8s `internal` Gateway, Technitium DNS |
| `admins` | All routed site LANs and every exit node |
| family / friends / media-managers | Mirror their Tailscale user grants |
| `apple-tv` | Media services only |

**Checks:**

- **Allow/deny tests** in vitest.
- **CI drift check** over **user-facing** Tailscale grants only (those whose `src` includes `autogroup:member` or a
  user group). Each one needs a NetBird twin or a reasoned `TAILSCALE_ONLY` exemption.
- **Live check** after deploy, for canary peers.

## K. Identity for apps: nbidp

NetBird-only clients lose Authentik's passwordless "Tailscale" button, so nbidp replaces it.

```
NetBird client ─▶ private proxy (Equestria, NB_PROXY_PRIVATE, group: members)
                    │ X-NetBird-User / X-NetBird-Groups (client copies stripped)
                    ▼
                  Dex (authproxy connector) ──OIDC──▶ Authentik source "NetBird" (email_link / name_link)
```

- Dex is reachable only from the proxy pods, enforced by a NetworkPolicy.
- The proxy uses DNS-01 static certs.
- Access is limited to `members`, because tagged peers would otherwise show up as users under their peer names.
- PVE and PBS keep their tsidp realms.

## L. Devices and onboarding

- **Apple TVs:** all of them enrol with the `apple-tv` **setup key**. The tvOS app is beta, and SSO device-code
  login needs a Dex device grant that is **(unverified)**.
- **Phones and laptops:** a one-page guide in `docs/`:
  1. Install NetBird.
  2. Change the server to `https://netbird.<root domain>`.
  3. Log in through Authentik.
  4. Turn Tailscale off on that device.

## M. Decision log

| # | Date | Decision |
|---|---|---|
| D1 | 10-24 | Tailscale stays primary for servers, backplane and break-glass |
| D2 | 11-02 | NetBird is client entry and access only; servers are not peers |
| D3 | 11-02 | **Self-hosted** on an OCI free-only tenancy, Ashburn, A1 2/12, memory ballast |
| D4 | 11-02 | Quotas + budget + CrossGuard pack; one `netbird-edge` stack holds OCI and Azure |
| D5 | 11-02 | Azure East US 2 VM (VS credits): relay always on + fenced standby server |
| D6 | 11-02 | **Automated failover**: Equestria watchdog flips DNS; DNS is the lease (each server self-fences) |
| D7 | 11-02 | Backups every 15 minutes to Garage; automatic restore |
| D8 | 11-02 | Manual, runbooked failback |
| D9 | 11-02 | Login via Authentik connector + JWT group sync + local break-glass admin |
| D10 | 11-02 | Relays: OCI embedded, Azure, and a Docker relay on every Dockge host |
| D11 | 11-02 | Gateways: Docker stacks on each site's Dockge host(s), each an exit node |
| D12 | 11-02 | Equestria operator = a second route to the internal Gateway + Authentik |
| D13 | 11-02 | Clients run NetBird only; admin work stays on Tailscale |
| D14 | 11-02 | Celestia/luna/skystar Dockge publish LAN IPs (after a consumer audit) |
| D15 | 11-02 | No bridge into tailnet-only services |
| D16 | 11-02 | Client-access policy + tests + drift check on user-facing grants |
| D17 | 11-02 | All Apple TVs enrol by setup key |
| D18 | 11-02 | nbidp kept (private proxy + Dex authproxy → Authentik source) |
| D19 | 11-02 | Overlay `10.100.0.0/16`; peer domain `nb.<root domain>` |
| D20 | 11-02 | Manual onboarding with a one-page guide |
