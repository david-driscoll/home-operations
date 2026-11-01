# Proxmox host certificates, tailnet :443, and LAN/tailnet DNS

Status 2026-10-29: implemented on branch `proxmox-host-certs-and-dns`, **not yet applied anywhere**.
PBS is deliberately held (section 6), and skystar is offline (section 7).

This document uses only the placeholders `<root domain>` and `<tailnet>`.

## 1. Why

Two separate problems, one branch:

1. **Containers published the wrong address.** A Dockge LXC's DNS record always pointed at its
   tailscale IP. Local services (behind the UCG-Max) should answer with their `10.10.x.x` address;
   only tailnet-primary ones should answer with `100.x`.
2. **A Proxmox web UI could not serve both of its names.** `pveproxy` serves exactly one
   certificate (`/etc/pve/local/pveproxy-ssl.pem`) and has no SNI, so `<name>.<tailnet>:8006` and
   `<name>.host.<root domain>:8006` could not both be valid. Reaching the UI over the tailnet on
   `:8006` was never wanted anyway.

## 2. Design

```text
browser ──► <name>.<tailnet>:443         tailscale serve ──► 127.0.0.1:8006   (Tailscale's own certificate)
browser ──► <name>.host.<root domain>:8006   pveproxy                         (*.host.<root domain> wildcard)

cert-manager (equestria)  ClusterIssuer letsencrypt-production, Cloudflare DNS-01
  └─ Certificate host-wildcard (ns pulumi)  ─►  Secret host-wildcard-tls
        └─ read by the host Pulumi stacks over their own service account (Role: get that one Secret)
              └─ remote.Command on each host:  pvenode cert set <fullchain> <key> --force --restart
                    trigger = sha256(public certificate), so a renewal re-pushes it
```

Every Proxmox host gets the same treatment, including alpha-site (hand-installed Tailscale) and
skystar once it is back. There is no opt-out.

### Decisions, and why

| Decision | Why |
|---|---|
| One wildcard from cert-manager, not Proxmox's built-in ACME per host | Five hosts ordering the identical wildcard exhaust Let's Encrypt's 5-per-week limit for one identifier set, and the Cloudflare token would sit on every hypervisor |
| `*.host.<root domain>` is a **new** SAN | `le-production`'s `*.<root domain>` matches one label, and `<name>.host.<root domain>` has two |
| `rotationPolicy: Always` | One private key lands on every host, including off-site ones; a fresh key each renewal bounds how long a leaked one is useful |
| Hosts read the Secret **directly from the cluster**, not via OpenBao | The retired PushSecret path would need a new write role and a root ceremony. Trade-off: the host stacks now depend on cluster API access |
| Plain in-cluster REST read (`components/kubernetes-secret.ts`), not `k8s.core.v1.Secret.get` | A failed resource read aborts the whole update. An unreadable Secret must instead warn and skip, so a certificate can never stall host management |
| Role scoped by `resourceNames` to `host-wildcard-tls` | Those service accounts otherwise hold no Kubernetes API access |
| `tcp:443` added to `proxmoxManagement` and `proxmoxBackupServer` | Parity with 8006/8007 everywhere they were granted, including machine-to-machine tags. 443 on those nodes is the same UI and API |
| `setGrant` dedupes `ip` | Several grants already carry 443 via `ports.proxmox` |
| `dnsIpAddress` separate from `ipAddress` on `DockgeLxc` | `ipAddress` is also the `${ipAddress}` compose variable and must keep meaning the LAN address (luna's bindings and URLs depend on it) |
| `ProxmoxHost.tailnetPrimary` decides the DNS address | A container can never disagree with its host (luna is local but tailnet-primary until it moves) |
| LAN IP from the default route's source address | `hostname -I` also lists docker0 and tailscale0, and which is first is only convention |
| `DOCKER_HOST` keeps the internal name | The Mac has subnet routers |

## 3. What changes, in merge order

Each step is meant to be merged and confirmed healthy before the next. The operator runs every
stack, so there is no `--target`; an unhealthy stack stalls instead of failing a command.

| # | Change | Files | Gate before the next |
|---|---|---|---|
| 1 | **DNS.** `docker.<prefix>.<root domain>`, LAN/tailnet addresses, default-route discovery, app CNAMEs depend on the A record | `components/helpers.ts`, `DockgeLxc.ts`, `ProxmoxBackupServerLxc.ts`, `ProxmoxHost.ts`, `docker/**/.mise.toml`, `docker/celestia/hermes/config.seed.yaml` | UniFi, Technitium and Cloudflare agree after 2-3 resync cycles of 5 minutes |
| 2 | **ACL.** `tcp:443` for `proxmoxManagement` / `proxmoxBackupServer`; `setGrant` dedupe | `components/constants.ts`, `components/tailscale/manager.ts` | unifi-network stack healthy; `tests` in the policy pass |
| 3 | **Serve.** `tailscale serve` on 443 for every Proxmox host | `components/ProxmoxHost.ts` | `https://<name>.<tailnet>/` loads **and noVNC / console WebSockets work through it** (unverified, see section 8) |
| 4 | **Certificate.** `host-wildcard` Certificate, Role and RoleBinding in `pulumi` | `kubernetes/apps/pulumi/host-certificate/**` | `kubectl -n pulumi get certificate host-wildcard` is Ready; Secret has `tls.crt` and `tls.key` |
| 5 | **Flip.** Hosts install the certificate; the provider endpoint, Authentik/tsidp/Gatus URLs, MCP port and egress probes move to 443 | `components/ProxmoxHost.ts`, `globals.ts`, `kubernetes-secret.ts`, `stacks/unifi-network/tailnet-egress.ts`, `kubernetes/apps/agents/agent-tools-servers/proxmox/base/mcpserver.yaml` | Each host serves the wildcard on `:8006`; MCP and probes green; OIDC login works on both URLs |

Step 4 can ship any time before step 5. Steps 3 and 5 both edit `ProxmoxHost.ts`, so they must
land in order.

### Ordering trap in step 5

The Pulumi Proxmox provider's endpoint moves to `https://<name>.<tailnet>/`. That is served by step
3, which is why 3 must be applied first. Do not merge 5 without 3.

## 4. Behaviour to know about

- **Unreadable certificate.** If the Secret cannot be read (laptop preview, not issued yet, API
  blip), the stack logs a warning and does not create the install command. A later successful run
  recreates it and re-runs `pvenode cert set`, which restarts `pveproxy` once.
- **Renewal.** cert-manager renews 30 days before expiry. The host stacks resync every 1 to 24
  hours (home-operations 24h, gulf-of-mexico 1h), so a renewed certificate reaches hosts well
  inside the window. Each push restarts `pveproxy`, which drops open consoles for a moment.
- **Old cron.** The install command deletes `/etc/cron.weekly/tailscale` and the old key files only
  after `pvenode cert set` succeeds, so a failed install leaves the old certificate and its renewal.
- **State.** The install script is marked secret, so the private key is encrypted in Pulumi state.
- **DNS rename.** The app CNAMEs `dependsOn` the Dockge A record. Pulumi's docs say a
  delete-before-replace also deletes and recreates dependents, so renaming a Dockge host's record
  recreates **every app CNAME on that host** in UniFi, Technitium and Cloudflare. Accepted; watch
  step 1. A DNS-rename stall on 2026-07-24 took three stacks down for about 15 hours (Cloudflare
  error 81054, a CNAME and an A record on one name).
- **Probe blip.** The egress probes (unifi-network) and the certificate flip (home stacks) are
  different stacks, so there can be a few minutes of failing `pve`/`pbs` probes during step 5.

## 5. Rollback

Each step reverts independently. Reverting step 5 restores the old behaviour on the next run only
if the cron-based certificate code is also restored, which a plain `git revert` does. Step 3's
`delete` runs `tailscale serve --https=443 off`.

## 6. Held: PBS

Not changed in this PR. PBS keeps its Tailscale certificate and weekly cron.

The intended change is: `tailscale serve` on 443 in the PBS LXC, and PBS goes back to its own
self-signed certificate on `:8007` (the root-domain name is already served by Traefik, which does
not verify its backend). That breaks any client dialling `<pbs>.<tailnet>:8007` and relying on the
CA-valid certificate, and those clients are not defined in this repo.

**Needed from the hosts before this can ship:**

```text
# every live PVE host (twilight-sparkle, celestia, alpha-site, luna; skystar once online)
grep -B1 -A8 '^pbs:' /etc/pve/storage.cfg

# every PBS LXC (celestia-pbs, luna-pbs, skystar-pbs once online)
proxmox-backup-manager remote list
proxmox-backup-manager sync-job list
proxmox-backup-manager cert info
```

| Found in `storage.cfg` / remotes | Meaning | Fix |
|---|---|---|
| `fingerprint` present | Already pinned | Update the pinned value once, after the swap |
| tailnet name, port 8007, no fingerprint | Relies on the CA-valid certificate | Add the fingerprint, or move the entry to port 443 |
| IP or internal name | Never validated against the tailnet certificate | Nothing |

## 7. Pending: skystar

Offline. The ocracoke Stack is commented out of `kubernetes/apps/pulumi/kustomization.yaml`
("disabled due to ocracoke being offline") and `clusters/skystar.yaml` is `.disabled`.

When it comes back:

1. Uncomment `./ocracoke/ks.yaml` in `kubernetes/apps/pulumi/kustomization.yaml`.
2. `RoleBinding/host-wildcard-reader` already names the `ocracoke` service account, so the stack can
   read the certificate immediately.
3. Skystar's first run installs the `tailscale serve` listener and the certificate, and restarts
   `pveproxy` once. The ocracoke Stack resyncs every 24 hours.
4. The skystar MCP overlay follows the base (port 443), so nothing extra is needed.
5. Collect the PBS output from section 6 for `skystar-pbs` at the same time.

## 8. Not verified

- The `https+insecure://` target is documented by Tailscale, but WebSocket (noVNC) pass-through
  through `tailscale serve` was not tested. This is the step 3 gate.
- `pvenode cert set` with a wildcard fullchain follows the Proxmox docs; not run against a host.
- No `pulumi preview` was run. Typecheck shows the same 9 pre-existing errors as `main`, none new.
- The pre-commit hook could not run when this was written: `.config/mise.toml` pins `hk` 2.10.0 and
  `fnox` v1.44.0, neither of which has a signed packslip yet.

## 9. Follow-ups after this lands

- Remove the tailnet `:8006` redirect URI from Authentik and tsidp (`pveLegacyTailnetUri` in
  `components/ProxmoxHost.ts`) once nothing uses it.
- Decide PBS (section 6).
- The external Gatus check keeps `insecure: true`; it can go once the wildcard is confirmed live.
