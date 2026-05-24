# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type | Purpose | Auth model | Criticality | Evidence |
|--------|------|---------|------------|-------------|----------|
| 1Password Connect | REST API | Secret store for all credentials; also used as stack output store | Bearer token (`CONNECT_TOKEN`) via env | **Critical** — everything depends on it | `components/op.ts` |
| Proxmox VE | REST API + SSH | VM/LXC lifecycle management | API key per host (from 1Password) | **Critical** | `components/ProxmoxHost.ts` |
| TrueNAS | REST API | NAS storage management; NFS/Minio endpoint | Credentials from 1Password | **Critical** | `components/truenas/` |
| Cloudflare | REST API | DNS record management, zone management | API token from 1Password | **Critical** | `components/globals.ts` |
| Tailscale | REST API (OAuth) | VPN device registration, subnet routing, ACL management | OAuth client ID/secret from 1Password | **Critical** | `components/tailscale.ts` |
| Unifi | REST API | Network/VLAN/firewall management | API key from 1Password | High | `components/unifi.ts`, `sdks/unifi/` |
| Minio (TrueNAS) | S3 API | Object storage (Thanos, backup data, stack state) | Username/password from 1Password | High | `components/globals.ts` |
| Authentik | REST API | IdP — SSO flows, groups, application registration | Token + URL from 1Password/env | High | `components/authentik/`, `sdks/authentik/` |
| AdGuard Home | REST API | DNS filtering and upstream configuration | Username/password from 1Password | Medium | `components/globals.ts` |
| Proxmox Backup Server (PBS) | REST API | Backup job management | Credentials from 1Password | Medium | `sdks/pbs/`, `components/ProxmoxBackupServerLxc.ts` |
| Backblaze B2 | S3-compatible API | Off-site backup storage | Application key (currently disabled/commented) | Low | `package.json` (commented out in globals) |
| GitHub | REST API | GitHub resource management via Pulumi | [ASK USER] — token not visible in scanned files | Low | `package.json` (`@pulumi/github`) |
| Remote hosts (SSH) | SSH | Direct command execution on Proxmox/LXC hosts | SSH key (from 1Password `sftpKey`) | High | `components/DockgeLxc.ts`, `@pulumi/command` |
| Kubernetes clusters | K8s API | Reading ApplicationDefinition CRDs; creating Volsync secrets | Kubeconfig stored in 1Password per cluster | High | `stacks/applications/kubernetes.ts` |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| 1Password vault "Eris" | All credentials + stack outputs | `OPClient` (`components/op.ts`) | Single point of failure; if Connect is down, all stacks fail | `components/op.ts` |
| Minio (TrueNAS S3) | Pulumi stack state, Thanos metrics, backup data | `@pulumi/minio`, direct S3 API | Data loss if TrueNAS is unreachable; `retainOnDelete: true` set on critical buckets | `stacks/home/index.ts` |
| Tailscale state | Device registry, ACL, subnet routes | `@pulumi/tailscale` | ACL misconfiguration can cut off all remote access | `components/tailscale.ts` |
| Cloudflare DNS | Public DNS records for all services | `@pulumi/cloudflare` | DNS misconfiguration breaks external access | `components/StandardDns.ts` |
| Kubernetes etcd | ApplicationDefinition CRDs | `@kubernetes/client-node` direct API | External dependency; stacks/applications requires live cluster access | `stacks/applications/kubernetes.ts` |

### 3) Secrets and Credentials Handling

- **Credential source:** All credentials are fetched from 1Password Connect at Pulumi run time via `OPClient.getItemByTitle()`. No credentials are hardcoded.
- **Env var injection:** `.mise.toml` uses `op://Eris/<item>/<field>` references, resolved by the 1Password CLI when running `mise` commands. The resolved values are injected as env vars (`CONNECT_HOST`, `CONNECT_TOKEN`, `PULUMI_CONFIG_PASSPHRASE`, etc.).
- **Pulumi secret encryption:** `Pulumi.*.yaml` files use `encryptionsalt` for encrypting sensitive config values at rest in the Pulumi stack state.
- **Hardcoding check:** No plaintext credentials found in source. Two hardcoded network values exist: gateway `10.10.0.1` and search domain `driscoll.tech` in `components/globals.ts` (infrastructure constants, not credentials).
- **Rotation:** Managed entirely within 1Password vault. No automated rotation tooling configured in this repo.

### 4) Reliability and Failure Behavior

- **Retry/backoff:** `OPClient` wraps all calls in try/catch but does not implement retry. `getItemByTitle` falls back to `getItemById` on title-lookup failure (`components/op.ts:106`).
- **Timeout policy:** No explicit timeouts configured; dependent on `@1password/connect` defaults and Pulumi provider timeouts.
- **Circuit-breaker:** None implemented — if 1Password Connect is unavailable, the entire stack execution fails immediately.
- **`keepAlive: true`** set on the 1Password Connect HTTP client to reuse TCP connections.

### 5) Observability for Integrations

- **Gatus uptime monitoring:** Every deployed service registers a health check via `addUptimeGatus()` in `components/helpers.ts`. Config is written via SSH to the uptime host at `/opt/stacks-data/uptime/config/uptime-<name>.yaml`.
- **Prometheus:** Deployed on Dockge clusters via `docker/_common/prometheus/`; scrapes node/container metrics.
- **Logging around external calls:** `console.error()` on all `OPClient` failures. Pulumi deployment-time `pulumi.log.info()` used in `stacks/applications/kubernetes.ts` for namespace enumeration.
- **Missing visibility:** No distributed tracing, no APM, no alerting on Pulumi stack failures.

### 6) Tailscale Detail

**Tailnet domain:** `opossum-yo.ts.net`

All SSH management connections use `${name}.opossum-yo.ts.net` — no direct IPs are used for host management.

**Home subnet routed via Tailscale:** `10.10.0.0/16`

**ACL tags** (from `components/constants.ts`):
`dockge`, `proxmox`, `k8s`, `observability`, `backups`, `egress`, `ingress`, `management`, `operator`, `sgc`, `equestria`, `exit-node`, `peer-relay`, `recorder`, `shared-drive`, `apps`, `media-device`

**Named port groups** (from `components/constants.ts`):

| Group | Ports |
|-------|-------|
| `web` | 80, 443 |
| `ssh` | 22 |
| `dockgeManagement` | 5001, 9595, 2375, 8082 |
| `observability` | 9093, 9090, 3100, 8266, 1883 |
| `proxmoxManagement` | 8006 |
| `proxmoxBackupServer` | 8007 |

### 7) Alertmanager

Alertmanager runs in the **Equestria** cluster, `observability` namespace.

| Endpoint | URL |
|----------|-----|
| Public HTTPS alerts | `https://alertmanager.driscoll.tech/api/v2/alerts` |
| Tailscale alerts | `http://alertmanager.opossum-yo.ts.net:9093/api/v2/alerts` |
| Silences | `/api/v2/silences` (append to either base URL) |

**Alert rules cover:** container down, OOM kills, high CPU/memory (>80%), restart loops.

**Agents should query the Alertmanager endpoint when troubleshooting infrastructure issues** — it is the authoritative source for active firing alerts.

## Vendor SDK Reference

| SDK | Provider var | Credential Source | Status | Used In |
|-----|-------------|-------------------|--------|---------|
| `sdks/unifi/` | `unifiProvider` | "Unifi Api Key Eris Cluster" | Active | `stacks/unifi-network` |
| `sdks/authentik/` | (standard) | Authentik system | Active | `stacks/authentik` |
| `sdks/adguard/` | `adguardProvider` | "AdGuard Home" | Active | `stacks/home` |
| `sdks/pbs/` | `pbsProvider` | "Proxmox Backup Server" | Active | `stacks/backups` |
| `sdks/terrifi/` | `unifiFirewallProvider` | "Unifi Api Key Eris Cluster" | Active | `stacks/unifi-network` |
| `sdks/b2/` | (commented out) | Not configured | **Disabled** | None |

### 8) Evidence

- `components/op.ts` — 1Password integration
- `components/globals.ts` — all provider initializations
- `components/helpers.ts` — Gatus uptime integration
- `components/constants.ts` — Tailscale ACL tags and port groups
- `components/tailscale.ts` — Tailscale integration
- `stacks/applications/kubernetes.ts` — K8s API usage
- `.mise.toml` — env var injection pattern
- `docker/_common/prometheus/` — Prometheus monitoring
- `sdks/` — vendor SDK wrappers
