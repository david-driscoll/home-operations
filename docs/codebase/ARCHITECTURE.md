# Architecture

## Core Sections (Required)

### 1) Architectural Style

- **Primary style:** Provider-singleton + ComponentResource composition (IaC-specific layering)
- **Why this classification:** All external-service providers are constructed once in `GlobalResources` (a singleton `ComponentResource`) and consumed by all other components. Infrastructure abstractions are built as `ComponentResource` subclasses that encapsulate related Pulumi resources. Stacks are thin wiring layers that instantiate and connect components.
- **Primary constraints:**
  1. No provider duplication — providers are created exclusively in `components/globals.ts`
  2. All secrets flow through 1Password Connect (`OPClient`), never from environment files or plaintext config
  3. Pulumi `Output<T>` laziness — values are resolved at apply-time; code must use `.apply()` chains rather than direct synchronous access

### 2) System Flow

```text
.mise.toml (op:// secret resolution via 1Password CLI)
    ↓
Stack entry: stacks/<name>/index.ts
    ↓
GlobalResources (components/globals.ts)
  ├── OPClient (components/op.ts) → 1Password Connect API → credentials
  ├── CloudflareProvider, TailscaleProvider, UnifiProvider, AdguardProvider, MinioProvider, PbsProvider
  └── Exports provider singletons + credential Outputs
    ↓
ComponentResources (components/ProxmoxHost.ts, DockgeLxc.ts, etc.)
  ├── Consume GlobalResources providers
  ├── Issue remote SSH commands via @pulumi/command
  ├── Register Tailscale devices, DNS records, Authentik applications
  └── Write connection info back to 1Password as OnePasswordItem resources
    ↓
Pulumi state backend
  └── Outputs optionally stored back to 1Password vault "Eris" via OPClient
```

**Concrete example — provisioning a Dockge LXC:**
1. `stacks/home/index.ts` instantiates `new DockgeLxc("celestia", { globals, host, cluster, ... })`
2. `DockgeLxc` checks if LXC container exists on Proxmox host via `remote.Command` (SSH)
3. If missing, runs Proxmox community LXC script to create the container
4. Installs Tailscale, registers the device, and stores connection details in 1Password
5. Copies docker-compose files from `docker/<cluster>/` to the remote host via `remote.CopyToRemote`
6. Registers Authentik application, DNS records, and Gatus uptime endpoints

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `components/globals.ts` | Provider construction, credential fetching from 1Password, `ClusterDefinition` type | Stack-specific resource instantiation | `components/globals.ts` |
| `components/op.ts` | 1Password Connect client, CRUD for vault items, field/section mapping | Provider initialization | `components/op.ts` |
| `components/DockgeLxc.ts` | LXC lifecycle, docker-compose deployment, Tailscale registration, Authentik wiring for Dockge clusters | ProxmoxHost creation, provider construction | `components/DockgeLxc.ts` |
| `components/ProxmoxHost.ts` | Proxmox VE host management, VM ID allocation, Tailscale subnet routing | Dockge-specific logic | `components/ProxmoxHost.ts` |
| `components/authentik/` | Authentik IdP resource builders (flows, stages, applications, policies) | Network/infra provisioning | `components/authentik/` |
| `components/helpers.ts` | Pure utility functions: file copy, hostname generation, Gatus config, temp file management | Stateful resources | `components/helpers.ts` |
| `stacks/home/index.ts` | Instantiates ProxmoxHost, DockgeLxc, TruenasVm; wires them together | Reusable abstractions, provider creation | `stacks/home/index.ts` |
| `stacks/applications/` | Reads K8s CRDs from live clusters; creates Authentik apps, Volsync secrets | Host/network provisioning | `stacks/applications/kubernetes.ts` |
| `stacks/backups/` | Backup plan management across PBS and Backrest | Application deployment | `stacks/backups/BackupPlanManager.ts` |
| `dynamic/1password/` | Custom dynamic Pulumi resource for 1Password item CRUD with diff tracking | Any non-1Password resource | `dynamic/1password/OnePasswordItem.ts` |
| `docker/` | Docker Compose definitions and cluster-specific service configs | TypeScript/Pulumi logic | `docker/_common/`, `docker/alpha-site/` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| **Provider singleton** | `components/globals.ts` → `GlobalResources` class | Prevents credential duplication; ensures one provider instance per external service |
| **ComponentResource composition** | `ProxmoxHost`, `DockgeLxc`, `TruenasVm`, `BackupPlanManager` | Encapsulates related Pulumi resources into reusable, self-contained units |
| **Output chaining** | Throughout — `.apply()` on every credential/hostname/IP | Required by Pulumi's lazy evaluation model; values are only known at deploy time |
| **1Password as state store** | `stacks/authentik/index.ts`, `stacks/home/index.ts` | Stack outputs (hostnames, credentials, kubeconfig) are persisted to 1Password for cross-stack consumption |
| **Remote SSH command execution** | `components/DockgeLxc.ts`, `components/ProxmoxHost.ts` | Proxmox and LXC management APIs are insufficient; SSH + shell commands fill the gap |
| **ClusterDefinition discriminated union** | `components/globals.ts` — `DockgeClusterDefinition | KubernetesClusterDefinition` | Type-safe handling of Dockge vs. Kubernetes cluster config differences |
| **ApplicationDefinition CRD** | `stacks/applications/kubernetes.ts` — reads `driscoll.dev/v1/applicationdefinitions` | Custom CRDs drive Authentik application registration from within the cluster |
| **Gatus uptime integration** | `components/helpers.ts` → `addUptimeGatus()` | Every service registers its health check endpoint centrally via SSH to the uptime host |

## Provider Reference

| Provider | Purpose | Credential Source |
|----------|---------|-------------------|
| CloudflareProvider | DNS & CDN | "Cloudflare (driscoll.tech)" |
| UnifiProvider | Network management | "Unifi Api Key Eris Cluster" |
| UnifiFirewallProvider | Firewall rules (Terrifi) | "Unifi Api Key Eris Cluster" |
| AdguardProvider | DNS filtering | "AdGuard Home" |
| TailscaleProvider | VPN & subnet routing | "Tailscale Terraform OAuth Client" |
| ProxmoxVEProvider | VM/LXC management | "Proxmox" (per-host) |
| MinioProvider | S3 storage (TrueNAS) | "minio root user" |
| PbsProvider | Proxmox Backup Server | "Proxmox Backup Server" |
| KubernetesProvider | K8s clusters | Per-cluster kubeconfig from 1Password |

All providers are constructed once in `components/globals.ts` (`GlobalResources`) and injected into components — never constructed in stacks directly.

## Cluster Definitions

### Kubernetes Clusters
- **Equestria** — Primary Kubernetes cluster (hosts `observability` namespace, Alertmanager, etc.)
- **Stargate Command** — Secondary Kubernetes cluster

### Dockge Clusters (Docker/LXC)
- **Celestia** — Production Dockge cluster (LXC on Proxmox)
- **Luna** — Production Dockge cluster (LXC on Proxmox)
- **Skystar** — Production Dockge cluster (LXC on Proxmox)
- **Alpha Site** — Testing/development Dockge cluster (LXC on Proxmox)

### Proxmox Hosts (physical/hypervisor nodes)
- **Twilight Sparkle** — Entry-point Proxmox host; hosts TrueNAS VM (Spike)
- **Celestia** — Proxmox host for the Celestia Dockge cluster
- **Luna** — Proxmox host for the Luna Dockge cluster
- **Skystar** — Proxmox host for the Skystar Dockge cluster
- **Alpha Site** — Proxmox host for the Alpha Site cluster

> Note: The `ClusterDefinition` discriminated union in `components/globals.ts` distinguishes `DockgeClusterDefinition` from `KubernetesClusterDefinition` at the type level.

### 5) Known Architectural Risks

- **No test suite** — infrastructure changes cannot be validated without a live `pulumi preview`. Regressions in shared components (`DockgeLxc`, `GlobalResources`) affect all stacks simultaneously.
- **`DockgeLxc.ts` is the highest-churn file (54 commits)** — it handles LXC creation, docker-compose deployment, Tailscale, Authentik, DNS, and Gatus in one class. Growing complexity increases the blast radius of changes.
- **Synchronous 1Password lookups at stack init** — `OPClient.getItemByTitle()` is async but called with `output()` at module load time. If 1Password Connect is unreachable, all stacks fail immediately.
- **Hardcoded network constants** — `gateway: "10.10.0.1"` and subnet `"10.10.0.0/16"` are hardcoded in `GlobalResources` (with a TODO to pull from Tailscale). Changes require code edits.
- **Cross-stack secret sharing via 1Password** — stacks communicate by reading/writing 1Password items. If an item is renamed or deleted, dependent stacks fail at runtime (no compile-time detection).

### 6) Evidence

- `components/globals.ts` — provider singleton and credential flow
- `components/op.ts` — 1Password Connect client
- `components/DockgeLxc.ts` — most complex ComponentResource
- `stacks/home/index.ts` — canonical stack wiring
- `stacks/applications/kubernetes.ts` — K8s CRD-driven application registration
- `components/helpers.ts` — Gatus and utility patterns
