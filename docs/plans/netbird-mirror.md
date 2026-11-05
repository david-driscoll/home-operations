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
 domain> ──DNS──┤ + Traefik + built-in IdP (embedded Dex)     │      │ server compose ready, idle (fenced) │
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
  2. A CrossGuard pack, `policies/oci-free-tier` (#2882), every rule mandatory. It checks:
     - Σ A1 ≤ 2 OCPU / 12 GB;
     - Σ boot + block storage ≤ 200 GB;
     - every shape on the Always Free allow-list;
     - at most 1 reserved IP;
     - at most one load balancer, flexible at 10/10 Mbps;
     - backup retention ≤ 5 (schedules × assignments + manual backups), and no Oracle-defined policy;
     - `deleteBeforeReplace` on every instance;
     - the quota statements match `freeTierQuotaStatements(<the instance AD>)` exactly.

     **Where it runs.** CI (`.github/workflows/oci-free-tier-policy.yaml`) cannot reach the state
     backend or OpenBao, which are tailnet-only. So CI runs the rules' unit tests and a smoke test that
     loads the pack under the Pulumi CLI. The preview against the live stack is local:

     ```bash
     # repo root; PULUMI_BACKEND_URL etc. as in kubernetes/apps/pulumi/netbird-edge/stack.yaml
     fnox exec -- sh -c 'cd stacks/netbird-edge && pulumi preview --stack netbird-edge --policy-pack ../../policies/oci-free-tier'
     ```

     **The operator cannot run it.** Pulumi Kubernetes Operator v2.10.0 has no policy-pack field on
     `Stack`, and its agent leaves `// TODO:PolicyPack` in both the preview and up paths
     (pulumi/pulumi-kubernetes-operator#366). The operator's `up` on merge is guarded by layers 1, 3
     and 4 only. Preview locally with the pack before merging a netbird-edge change.
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
- **IdP:** NetBird's **built-in** one (embedded Dex, local users), decided 2026-11-03 (D25):
  - no external connector. Authentik is LAN/tailnet-only and the server runs in the cloud, so the server could
    not reach Authentik's issuer, and nor could a NetBird-only phone away from home;
  - people join by **invite** (`mise run netbird:invite`, D27), set their own NetBird password, and are placed
    in one Pulumi-created user group (D26). JWT group sync is off;
  - one **local break-glass admin**, the owner `/api/setup` created.
- **Secrets:** the store encryption key, relay secret and local admin are generated once. They go to OpenBao and
  1Password and are recorded in `bootstrap/INVENTORY.md`, but are not part of any recovery path.
- **Backups:** an **every-15-minutes** SQLite online backup (`.backup`, no stack stop) plus config and Traefik's
  `acme.json`, uploaded to Garage S3 over the tailnet, with retention. An empty data directory triggers an
  automatic restore, which also puts `acme.json` back (mode 600) when Traefik's volume has none, so a rebuilt
  VM serves its certificate instead of asking Let's Encrypt again. That covers both OCI rebuild and Azure
  promotion. TrueNAS pulls the `netbird-backups` bucket daily with the other restic buckets; it holds
  ciphertext only.

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
  - **As built (#2889):** the operator's `NetworkResource` (v0.9.0) can only publish a Service's ClusterIP, and
    IP/CIDR targets are an open upstream issue (netbirdio/kubernetes-operator#305). So `stacks/netbird` owns the
    `equestria` network, its two /32 resources (group `equestria-entry`), its router (peer group `k8s-routers`) and
    the DNS zone the operator requires. `kubernetes/apps/netbird-system/router` owns only the pods, which enrol with
    the `k8s-router` setup key through a `workloadOverride.podTemplate` patch.

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

- **Account:** the range, peer DNS domain (`nb.<root domain>`), peer login expiry off (D28) and JWT group sync off;
  the `Default` policy deleted.
- **Groups and setup keys:** the four user groups invites place people in; one key per gateway and per operator,
  plus a reusable `apple-tv` key, stored in OpenBao.
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

**As built (#2891).** Code: `components/netbird/nbidp.ts` (the chain, Dex's config), `stacks/netbird/nbidp.ts`
(the private service), `components/authentik/flows.ts` (the source), `kubernetes/apps/netbird-system/nbidp`.

- **`members` is the four user groups** stacks/netbird creates. The private service's `access_groups` are admins,
  family, friends and media-managers, never `All` or a device group.
- **The proxy registers with an account-scoped token** (`POST /api/reverse-proxies/proxy-tokens`, minted by
  `dynamic/netbird/NetbirdProxyToken`, stored at `third-party-tokens/netbird/nbidp-proxy`). Its cluster address is
  `ek.<root domain>` (D38). `nbidp.<root domain>` is a custom domain on that cluster, validated by a public
  Cloudflare CNAME `validation.nbidp` → `ek.<root domain>` (`stacks/netbird/proxyDomains.ts`). Until D38 the cluster
  address was `nbidp.<root domain>` itself, which left the proxy able to serve that one name only.
- **A cluster change re-creates the services.** Management pins a service's proxy cluster at create and keeps it on
  every update with the same domain, so `NetbirdPrivateService` replaces a service whose target cluster changed,
  deleting first, and its create deletes one it finds stranded on another cluster. Custom domains replace the same
  way (`replaceOnChanges: targetCluster`). While the old and new clusters are both connected, a create that lands on
  the old one is deleted again and the run fails, to be retried.
- **No public DNS name and no inbound path.** A private service is served only on the proxy's WireGuard listener.
  Management pushes the record (to the proxy peers' tunnel IPs) only to peers in the access groups, and creates the
  80/443 policy itself. The certificate is DNS-01.
- **The provider cannot declare a private service** (0.0.11 has no `private`/`access_groups`), so
  `dynamic/netbird/NetbirdPrivateService` calls the API. Management only accepts it once the proxy is connected and
  the domain validated. The stack always declares it, so a run that has to create it while the proxy is down fails
  and the Stack retries within a minute.
- **Every Dex identity header is `X-NetBird-User`.** Dex's authproxy connector reads five headers and four default to
  names the proxy passes through, which would let a user name someone else's email.
- **Authentik's server calls Dex over a LAN back-channel** (decided 2026-11-03). Authentik isn't a NetBird peer, and
  the alpha-site instance can't resolve in-cluster names. So the token exchange and userinfo go to
  `nbidp-backchannel.<root domain>` on the internal Gateway, which:
  - routes only `POST /token` and `GET /userinfo`;
  - is IP-allow-listed to the two Authentik hosts;
  - is matched by the CiliumNetworkPolicy to the same two paths.

  Only the proxy reaches `/auth` and `/callback`.
- **No groups come back from Dex.** Authentik stays the source of groups.
- **Enrollment works like the Tailscale source** (decided 2026-11-03). An identity whose email matches nobody goes
  through the shared enrollment flow. Ownerless peers never get that far, because the private service admits only the
  four user groups.
- **It survives the built-in login** (D25). The proxy stamps the NetBird user's email, and everyone is invited under
  their Authentik email, so `email_link` still finds the right Authentik user.

## L. Devices and onboarding

- **Apple TVs:** all of them enrol with the `apple-tv` **setup key**. The tvOS app is beta, and SSO device-code
  login needs a Dex device grant that is **(unverified)**.
- **Phones and laptops:** by invite, with a one-page guide in
  [`docs/runbooks/netbird-client-onboarding.md`](../runbooks/netbird-client-onboarding.md):
  1. An admin runs `mise run netbird:invite <email> "<name>" <group>` and sends the printed link.
  2. The person opens it from anywhere and sets a NetBird password.
  3. Turn Tailscale off on that device, install NetBird, and change the server to `https://netbird.<root domain>`.
  4. Log in with the NetBird email and password.

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
| D9 | 11-02 | Login via Authentik connector + JWT group sync + local break-glass admin (superseded by D25–D29) |
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
| D21 | 11-03 | Server deployment is **pushed over SSH** from the in-cluster operator via a `netbird-edge` tailnet egress Service. `tag:egress` may SSH to `tag:netbird-edge` as root (`accept`) |
| D22 | 11-03 | Tailscale stays on the OCI/Azure VMs for admin and backup traffic; NetBird is for clients only |
| D23 | 11-03 | Pure seams tested with `node --test`; Pulumi wiring validated by `pulumi preview`, live behaviour by each ticket's acceptance criteria |
| D24 | 11-03 | One PR per ticket, stacked in dependency order |
| D25 | 11-03 | **NetBird's built-in IdP** (embedded Dex, local users) replaces the Authentik login: the cloud server could not reach Authentik's issuer, and nor could NetBird-only devices away from home |
| D26 | 11-03 | User groups (admins, family, friends, media-managers) are NetBird API groups that `stacks/netbird` creates; JWT group sync is off |
| D27 | 11-03 | People join by invite: `mise run netbird:invite <email> "<name>" <group>` prints a 72-hour link; invite under the person's Authentik email so nbidp's `email_link` matches |
| D28 | 11-03 | No peer login expiry; a device is removed by deleting its peer |
| D29 | 11-03 | The Authentik `netbird` OAuth2 provider and application (`netbird-edge/definition.yaml`) and NetBird's Authentik connector are removed; nbidp stays |
| D30 | 11-04 | `admins` invites create NetBird admin-role users; the other groups stay regular users with no dashboard |
| D31 | 11-04 | A person's own devices reach each other (NetBird has no `autogroup:self`): `stacks/netbird` reads users live and gives each human user a `self-<name>` auto group and a group-to-itself policy (`selfAccess.ts`, `NetbirdUserAutoGroup`) |
| D38 | 11-04 | The private proxy's cluster address is `ek.<root domain>`; `nbidp.<root domain>` becomes a custom domain on it (public CNAME `validation.nbidp` → `ek`), so the proxy can serve other names. The nbidp service is deleted and re-created on the new cluster: management never moves a service |
| D39 | 11-04 | The `*.app` certificate (`netbird-system/netbird-app-wildcard-tls`) is pushed to OpenBao `secrets/apps/netbird/app-wildcard-tls` (`tls_crt`, `tls_key`) by an ESO PushSecret. `eso-equestria` is widened to create/read/update that one path's data and metadata, a deliberate exception to its read-only rule: a public, reissued certificate, not worth a second store and role. No Pulumi copy, so the key is not in Pulumi state |
| D40 | 11-04 | A tailnet app whose definition grants NetBird user groups is also a NetBird **private** service at `<app>.app.<root domain>`, same `<app>` as its tailnet name, on the ek proxy (§N) |
| D41 | 11-04 | `app.<root domain>` is a custom domain on the ek cluster; public DNS is Cloudflare-only grey CNAMEs `*.app` and `validation.app` to `ek.<root domain>` |
| D42 | 11-04 | The proxy serves `*.app` from its one static certificate (`nbidp-tls`: nbidp, ek, `*.app`); `NB_PROXY_WILDCARD_CERT_DIR` is ACME-mode only. The separate `*.app`-only certificate is what D39 pushes |
| D43 | 11-04 | Services target Traefik's new ClusterIP-only `netbird` entrypoint with Host kept; a deny-only CiliumNetworkPolicy admits only the proxy pods, and `netbird-as-<TAILSCALE_MIDDLEWARE>` mirrors each app's tailnet chain |
| D44 | 11-04 | Access groups are exactly the definition's `access_policy.groups` that are NetBird user groups; `admins` is not added. `users` means all four (no app lists it today). No service, with a warning, for an app with no ApplicationDefinition, no `access_policy`, or no group that maps |
| D45 | 11-04 | `stacks/netbird` discovers the apps live (tailnet Ingresses in `network`, ApplicationDefinitions) with read-only RBAC; the Stack keeps its daily resync, so a new app appears on the next run (daily, or the next merge) |

### Azure primary (#3001, 2026-11-03)

OCI's Ashburn has had no free-tier compute for this tenancy in any AD (#3037), so David moved the primary to
Azure. §C, §D and §E describe the OCI-primary plan; this is what is built instead.

- **Hosts.** `stacks/netbird-edge` runs a `Standard_B2pls_v2` (Arm, 2 vCPU / 4 GB, Ubuntu 24.04 arm64, 30 GB
  Standard SSD) in **East US 2** as the primary, through `components/azure/AzureEdgeVm.ts` and
  `globals.azureProvider` (OpenBao `third-party-tokens/azure/netbird-edge`). A static Standard IPv4 and an NSG
  for 80/tcp, 443/tcp, 443/udp, 3478/udp; Azure's default rules deny every other inbound, so no public 22.
- **One resource group per region** (`netbird-eus2`, `netbird-cus`). A group's metadata lives in its region,
  and an outage there blocks changes to everything in it, which is the outage the standby exists for.
- **Tailnet identity:** `tag:netbird-edge` for every host, so the existing grants apply unchanged. Hostnames
  `netbird-azure-eus2` and `netbird-azure-cus` give egress Services of the same names
  (`stacks/unifi-network/tailnet-egress.ts`); both are in `remoteServers`.
- **cloud-init** has an `oci` and an `azure` variant: only OCI gets the iptables ACCEPT rules and the memory
  ballast.
- **`netbird-edge:primary`** (default `azure-eus2`) picks the host `netbird.<root domain>` points at. Setup and
  the owner write are pinned to `azure-eus2` (`SETUP_HOST`), never to "the primary", so a failback can never
  run `/api/setup` a second time.
- **The record is Cloudflare only** (`netbird-lease`, TTL 60, grey cloud), not StandardDns: UniFi and
  Technitium copies would keep LAN clients on a dead primary after a repoint. LAN DNS forwards the name
  upstream.
- **One backup heartbeat** (`netbird-server`) for the service, not one per host: the backup script reports
  only while `netbird-server` runs.
- **Cost:** about $64 a month at list price for both VMs, their IPs and disks
  (`components/azure/edgeVm.ts`), plus egress past 100 GB.

### Standby, fence and watchdog (#3001, 2026-11-03)

- **The standby** is the same VM in **Central US** (`netbird-azure-cus`, resource group `netbird-cus`). It
  reboots for kernel updates at 10:00 UTC, an hour after the primary, so they are never down together.
- **Relays: standalone on both Azure hosts, none embedded.** Listing anything in `server.relays` turns off the
  combined server's embedded relay **and its embedded STUN** (`combined/cmd/config.go` `applyRelayDefaults`,
  v0.82.0). So "the Azure relay beside the embedded one" can't be configured. Instead each Azure host runs
  `netbirdio/relay` (compose profile `relay`) as `relay-eus2.<root domain>` / `relay-cus.<root domain>`, and
  every server lists both in `server.relays` and their STUN in `server.stuns`.
  - **TLS:** the host's Traefik terminates it on 443 with a second resolver (`relay`, storage `relay-acme.json`,
    TLS-ALPN). The relay listens on plain :80 and advertises `rels://<name>:443`, the same shape upstream uses for
    the embedded relay. That avoids a second 443 listener, and the relay's certificate never mixes with the
    management one that moves between hosts.
  - **STUN** is the relay container's, on 3478/udp; `netbird-server` no longer binds it.
  - **QUIC** isn't served, because the relay would need its own certificate on 443/udp. Clients use WebSocket.
- **Fence** (`components/netbird/fence.ts`, a systemd timer every 15 s on every host). It asks the zone's NS set
  (through 1.1.1.1, then 8.8.8.8), then each nameserver without recursion, and accepts only an authoritative
  NOERROR. The outcomes:

  | The record says | Running | Not running |
  | --- | --- | --- |
  | only our IP | keep | start (restore first) |
  | another IP | demote | standby |
  | ours and another | stop | idle |
  | nothing, or no answer | hold 120 s, then stop | idle |

  - Demote and standby move any store and `acme.json` aside, so a later promotion always restores the newest
    snapshot.
  - `netbird-server` runs with `restart: no` on fenced hosts, so a reboot never starts management before the
    fence has looked.
  - The backup timer follows management.
- **Watchdog** (`kubernetes/apps/netbird-system/failover-watchdog`). A Node CronJob every minute. It checks
  `/oauth2/.well-known/openid-configuration` at the lease's address, with the certificate verified for the
  management name. It flips after 5 failures in a row, only if Cloudflare and a standby (TLS on 443) both answer,
  never twice within an hour, and never from a management it has not once seen answer.
  - The count lives in a ConfigMap. Hosts are found through their relay records.
  - Flips page straight to Alertmanager. A PrometheusRule pages if the CronJob stops succeeding.
- **Two writers on one record, no fight.** The `cloudflare.DnsRecord` ignores `content` after create.
  `dynamic/cloudflare/DnsLeaseAssignment.ts` PATCHes it only when `netbird-edge:primary` (or that host's
  address) changes, and never diffs against the live record. A watchdog flip therefore stands until a human
  acknowledges it by setting `primary`, and failback is the same switch. The stack warns while the live lease
  and `primary` disagree.
- **acme.json on promotion** (the open question from #3033): the snapshot's replaces the host's
  (`NETBIRD_RESTORE_ACME=replace`). See [the runbook](../runbooks/netbird-failback.md#acmejson-on-promotion).
- **Runbook:** [`docs/runbooks/netbird-failback.md`](../runbooks/netbird-failback.md).

### Implementation notes (2026-11-03)

These came out of building #3000, #2885, #2887 and #2888, and they amend the sections above.

**Bootstrap needs no human.** The server runs with `NB_SETUP_PAT_ENABLED=true`, so a one-time `POST /api/setup` creates the break-glass owner and returns a 365-day PAT. `stacks/netbird-edge` writes both to OpenBao:
- `third-party-tokens/netbird/owner`;
- `apps/netbird/server`, which holds the store, relay and cookie keys.

`stacks/netbird` drives the account with that PAT only on its first run. That run mints an `automation` service user for machines, and from the next run on Pulumi uses the automation user's PAT (see "PATs and their rotation").

**PATs and their rotation.** Pulumi holds three NetBird PATs. Each has a path in OpenBao's `secrets` mount:

| Path | Whose | Written by | Used for |
| --- | --- | --- | --- |
| `third-party-tokens/netbird/automation` | the `automation` service user (admin) | `stacks/netbird` | every API call Pulumi makes; the operator (#2889) |
| `third-party-tokens/netbird/owner-pat` | the break-glass owner | `stacks/netbird` | minting the owner's next PAT; the fallback below |
| `third-party-tokens/netbird/owner` | the break-glass owner, plus its login and the server URL | `stacks/netbird-edge` (`/api/setup`) | the first run only; never rotated |

- **One credential.** `globals.netbirdApi` is the credential the provider, the dynamic resources and the raw `fetch`es all use. It takes the first token in the order automation, owner-pat, owner that exists in OpenBao and has more than an hour left (`components/netbird/tokens.ts`). The run that creates the automation user cannot depend on its token, so that run falls through to the owner's. Skipping an expired token means a missed alert cannot lock Pulumi out of the rotation that would fix it.
- **The owner needs its own provider.** NetBird lets a user manage only its own PATs and its service users' PATs, so the automation user cannot mint the owner's PAT. `globals.netbirdOwnerProvider` (owner-pat, then owner) is used for that one `netbird.Token` and nothing else.
- **No replaces.** Switching the provider's token is an in-place provider update. Checked with a throwaway stack: changing `token` shows `~ pulumi:providers:netbird (update)` and no replace. The bridged provider marks no config key as forcing replacement, so no NetBird resource is replaced. `NetbirdDefaultPolicyRemoval` re-runs on a token change, by design and idempotently.
- **Alert.** `stacks/netbird` exports `tokenExpiresAtSeconds` (`automation`, `owner`), taken from each `netbird.Token`'s `expirationDate`. kube-state-metrics reads that value off the Stack CR as `kube_stack_output_token_expires_timestamp_seconds{token=…}`. `PulumiStackTokenExpiring` pages 30 days before either token expires, and `NetbirdTokenExpiryUnknown` fires if the series go missing (`kubernetes/apps/pulumi/pulumi-operator/prometheusrule.yaml`). The run also logs a warning inside that window. The setup PAT's expiry was never recorded anywhere (`/api/setup` returns only the token), which is one reason the owner gets a managed PAT.
- **Rotating.** In `stacks/netbird/index.ts`, set `AUTOMATION_TOKEN_GENERATION` or `OWNER_TOKEN_GENERATION` to the current month and merge. The generation is in the Pulumi name, so the run creates the new token, rewrites its OpenBao path, and deletes the old token last. The operator's ExternalSecret picks the new automation PAT up on its next refresh. Rotate one token at a time, in a run that changes nothing else: the run authenticates with the token it is deleting, so a delete scheduled after that one fails, and the next run (which reads the new token) completes it.
- **Both expired.** Log in to the dashboard as the owner (email and password at `third-party-tokens/netbird/owner`) and create a PAT for the owner. Write it with `bao kv patch secrets/third-party-tokens/netbird/owner-pat personal_access_token=<pat> expires=<RFC 3339>`, then bump `OWNER_TOKEN_GENERATION` so Pulumi takes over again.

**User groups are Pulumi's** (D26, replacing the JWT-synced groups of D9).
- `stacks/netbird` creates admins, family, friends and media-managers as ordinary API groups, so every rule and the nbidp private service have their groups from the first run; nothing is looked up live or waits for a login.
- An invite names one of them as the user's auto group, and with group propagation on, every peer the user registers joins it. Moving someone is an edit of their groups in the dashboard.
- `stacks/netbird` refuses to run if `policy.ts` names a source group it does not create (`unresolvedSources`).
- The plan's separate `members` group is dropped: the four user groups are the membership.

**Invites** (D27). `mise run netbird:invite` (`.config/mise/tasks/netbird/invite`, `scripts/netbird-invite.ts`, pure half in `stacks/netbird/invite.ts`) calls `POST /api/users/invites` with role `user`, the group's id as the only auto group and `expires_in` 259200. The response's `invite_token` is a bare token; the link is the dashboard's `/invite?token=<token>` on the management host. The credential comes from fnox's `netbird` profile, in `globals.netbirdApi`'s order. Invites exist only with the embedded IdP (HTTP 412 otherwise).

**Gateways are keyed per Dockge host.** Each host gets a `gateway-<cluster key>` setup key and group; `stacks/netbird/sites.ts` decides which hosts route which site LAN. Today all four hosts (alpha-site, celestia, luna and skystar) sit on the home LAN, so `home` is the only routed site.

**Overlay range ordering.** `10.100.0.0/16` is applied before any setup key or invite exists, so no peer can take an address from the default range.

**The CrossGuard pack does not run in-cluster.** Pulumi Kubernetes Operator v2.10 has no policy-pack support (pulumi/pulumi-kubernetes-operator#366). The pack runs in CI as unit tests plus a smoke test, and locally with `--policy-pack`. In-cluster, the component check, OCI quotas and the budget remain.

## N. Tailnet apps on NetBird: `<app>.app.<root domain>`

The NetBird counterpart of `<app>.<tailnet>` (D32–D37). A NetBird-only device reaches every app that has a tailnet
name, under the same `<app>`, without a route into the LAN.

```
NetBird peer ─WireGuard─▶ private proxy (netbird-system/nbidp)     TLS: nbidp-tls, which also covers *.app
                            │ peer in the service's access groups, or 403
                            │ X-NetBird-User / X-NetBird-Groups deleted and re-stamped
                            ▼ Host kept (pass_host_header), direct_upstream from the proxy pod
                          traefik-netbird.network:8446 (`netbird` entrypoint, ClusterIP only)
                            │ CiliumNetworkPolicy: only the proxy pods may connect
                            ▼ IngressRoute <app>-netbird: Host(<app>.app.<root domain>), netbird-as-<TAILSCALE_MIDDLEWARE>
                          the app's Service (TAILSCALE_SERVICE / TAILSCALE_PORT)
```

**Code.** `stacks/netbird/apps.ts` (pure: discovery, naming, groups, the request) and `app-services.ts` (§11 of the
stack); `kubernetes/components/tailscale/netbird-ingressroute.yaml` (and `api-key/`); Traefik's `ports.netbird`,
`middleware/netbird.yaml` and `netbird-door.yaml`; `apps/netbird-system/nbidp` (certificates and the one-Secret grant);
`apps/pulumi/netbird/rbac.yaml`.

- **Host header.** The proxy rewrites Host to the target's unless the service sets `pass_host_header`
  (`rewriteFunc`, proxy/internal/proxy/reverseproxy.go, v0.82.0). Every app service sets it, so Traefik routes on
  the client's name exactly as on the tailnet (the Tailscale operator keeps Host too). nbidp's own service does not
  need it and keeps `false`.
- **Forwarded headers.** With `NB_PROXY_TRUSTED_PROXIES` empty the proxy SETS `X-Forwarded-For` to the client's
  tunnel address and `X-Forwarded-Proto` to `https`. The `netbird` entrypoint trusts forwarded headers from the pod
  CIDR, and `netbird-network` allow-lists `10.100.0.0/16` at depth 1, the shape `tailscale-network` has.
- **Identity headers.** The proxy deletes and re-stamps `X-NetBird-User` / `X-NetBird-Groups` on every request,
  and the door's CiliumNetworkPolicy (deny-only, port 8446, as the Funnel door's) keeps every other source off the
  entrypoint, so on that path they are the proxy's. No app reads them today; Authentik identity on the
  forward-auth chain comes from the outpost, as on the tailnet.
- **Gates mirror the tailnet.** The route names `netbird-as-${TAILSCALE_MIDDLEWARE:=tailscale-local}`, one Middleware
  per tailnet chain with `tailscale-network` swapped for `netbird-network`, so no app needs a second variable. The
  api-key component and the two hand-written tailnet carve-outs (navidrome `/rest/`, lazylibrarian `/api`) have
  NetBird twins.
- **Forward-auth apps.** `netbird-as-tailscale-user` puts the Authentik outpost in front, which answers only for a
  hostname a proxy provider is registered against. The tailnet name has a provider twin (`components/authentik.ts`,
  `spec.tailnetUrl`), but its Application has been disabled since 2026-09-15; `<app>.app` has neither yet. Until
  that is decided those apps answer 400 "no app for hostname" on the NetBird name: closed, not open. Their API
  carve-outs work.
- **The domain.** `app.<root domain>` is a custom domain (`netbird.ReverseProxyDomain`) targeting the nbidp cluster.
  Management validates it by a CNAME lookup on `validation.app.<root domain>`, which must name the cluster address,
  once at create, and drops it if still unvalidated after 48 hours; the stack creates the two Cloudflare CNAMEs
  first and asks again on every `up` while it is unvalidated. Peers never use the public records: management
  synthesizes `app.<root domain>` (a match-only zone) with each service's name pointing at the proxy peers, for
  peers in that service's groups only. The CNAMEs point at a name with no public address, so on the internet they
  resolve to nothing.
- **Certificates.** With ACME off the proxy loads one certificate pair and serves it for every SNI, checking each
  service domain against its SANs (`staticCertCovers`); `NB_PROXY_WILDCARD_CERT_DIR` is read only in ACME mode,
  and ACME would try to issue nbidp's name over a challenge that cannot reach the proxy. So `nbidp-tls` carries
  `nbidp` and `*.app`. A second certificate, `*.app` alone, is copied into OpenBao at
  `secrets/apps/netbird/app-wildcard-tls` (`tls_crt`, `tls_key`) by `stacks/netbird`, which may read that one Secret;
  ESO's OpenBao identity is read-only on purpose, and nbidp's key never leaves the cluster.
- **Discovery.** Live, from the Kubernetes API: the Ingresses in `network` whose Flux ks is `<APP>-tailnet-ingress`
  (app, namespace and resolved `TAILSCALE_HOST` are on the object) and every ApplicationDefinition, matched by
  namespace and name. That is what Flux applied, substitutions done, so no list or re-implemented substitution. In
  the cluster the Stack's ServiceAccount reads them (list only); locally, the tailnet kubeproxy. An empty answer
  fails the run rather than delete every service. A new app appears on the next run (hourly resync); a removed
  app's service is deleted.
- **Access groups** (D36). `access_policy.groups` intersected with the four user groups, plus `admins`, who
  administer every app (the app's own login or Authentik still decides; this opens only the network path). No
  groups, or `users`, is all four, no wider than Tailscale's `default-apps-access`. An unknown
  group (`editors`) is skipped with a warning; an app left with nothing, or with no definition (thanos,
  meilisearch), is admins only. Never a device group, for nbidp's reason.
- **Ordering.** Like nbidp's service: the domain waits for the proxy to be online, and the services wait for the
  domain to be validated, so the first rollout takes two runs. A service that exists stays declared through a
  proxy restart.
- **Native OIDC apps** list their redirect URIs per hostname in `definition.yaml`; a login started on
  `<app>.app` needs its own. See the stacks/system change that adds them centrally.
