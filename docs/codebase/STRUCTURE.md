# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `components/` | Shared Pulumi ComponentResource code — all providers, helpers, and reusable infra abstractions | `components/globals.ts`, `components/DockgeLxc.ts` |
| `stacks/` | Deployable Pulumi stacks — each subdirectory is a standalone stack | `stacks/home/index.ts` |
| `sdks/` | Vendor SDK wrappers generated/maintained locally (adguard, authentik, b2, pbs, terrifi, unifi) | `sdks/authentik/index.ts` |
| `dynamic/` | Code-generated Pulumi dynamic resource types (currently 1Password item) | `dynamic/1password/OnePasswordItem.ts` |
| `docker/` | Docker Compose stack configs per Dockge cluster | `docker/_common/`, `docker/alpha-site/` |
| `types/` | OpenAPI-generated TypeScript type definitions (Tailscale grants, application-definition schema) | `types/tailscale.d.ts` |
| `docs/` | Documentation (codebase knowledge, development guide, Docker, Kubernetes) | `docs/codebase/`, `docs/DEVELOPMENT_GUIDE.md` |
| `.mise.toml` | Tool versions + secret-injected env vars via `op://` | `.mise.toml` |
| `.github/` | Copilot instructions, agents, skills, Renovate config | `.github/copilot-instructions.md` |
| `.config/mise/tasks/` | Mise shortcut tasks (pulumi-up, pulumi-cancel, pulumi-refresh) | `.config/mise/tasks/` |

#### Stacks (`stacks/`)

| Stack | Purpose |
|-------|---------|
| `home/` | Proxmox hosts, TrueNAS VMs, Dockge LXC containers, Minio buckets — the primary infra stack |
| `authentik/` | Authentik IdP instance, groups, flows, applications; writes outputs back to 1Password |
| `applications/` | Kubernetes application definitions (reads CRDs from live clusters via kubeconfig) |
| `backups/` | Backup plan management across PBS and Dockge clusters |
| `unifi-network/` | Unifi network config and Tailscale firewall rules |
| `ocracoke/` | Ocracoke cluster management |
| `gulf-of-mexico/` | Gulf of Mexico cluster management |

#### Docker (`docker/`)

| Path | Type | Purpose |
|------|------|---------|
| `_common/` | Templates | Shared compose configs reused across Dockge clusters |
| `alpha-site/` | Dockge cluster | Testing/development environment |
| `celestia/` | Dockge cluster | Production Docker services |
| `luna/` | Dockge cluster | Production Docker services |
| `skystar/` | Dockge cluster | Production Docker services |

### 2) Entry Points

- **Per-stack entry:** `stacks/<stack-name>/index.ts` — each stack is independently deployed via `cd stacks/<name> && pulumi up`
- **No single monolithic entry point** — Pulumi treats each stack directory as its own program
- **How entry is selected:** The `Pulumi.yaml` in each stack directory names the runtime as `nodejs` (no loader `nodeargs` — Node strips types itself); Pulumi resolves `index.ts` as the entry point

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|-----------------------|
| `components/` | Reusable `ComponentResource` classes, provider initialization (`GlobalResources`), `OPClient`, helper functions | Direct stack-specific resource instantiation; business logic unique to one stack |
| `stacks/*/index.ts` | Stack-specific resource wiring — instantiates components, sets outputs | Provider construction (must come from `GlobalResources`); reusable abstractions |
| `sdks/` | Generated or vendor-maintained API clients wrapped as Pulumi providers | Business logic; stack resources |
| `dynamic/` | Custom Pulumi dynamic resource implementations (e.g., OnePasswordItem with CRUD logic) | Reusable ComponentResources |
| `docker/` | Docker Compose YAML and cluster-specific service configs | TypeScript/Pulumi code |
| `types/` | OpenAPI-generated type definitions only | Runtime logic |

### 4) Naming and Organization Rules

- **File naming:** PascalCase for ComponentResource class files (`ProxmoxHost.ts`, `DockgeLxc.ts`, `TruenasVm.ts`); camelCase for utility/helper files (`globals.ts`, `helpers.ts`, `constants.ts`, `op.ts`)
- **Directory organization:** Feature/domain-based at the top level (`components/authentik/`, `components/tailscale/`, `components/truenas/`); flat within a domain
- **Imports across directories:** `components/*` and `dynamic/*` by npm-workspace name (resolved by Node via `node_modules/` symlinks). `@openapi/*` → `./types/*` remains a tsconfig alias for `import type` only.
- **Relative imports within stacks:** stacks use relative paths (`../../components/globals.ts`) or the workspace name (`components/globals.ts`) interchangeably
- **TypeScript file extensions in imports:** `.ts` extensions are explicit in import statements (required by NodeNext module resolution and Node type stripping)

## Component Hierarchy

### ComponentResource Tree

```
ComponentResource Hierarchy:
├── ProxmoxHost              (components/ProxmoxHost.ts — Proxmox VE host management)
│   ├── tailscale integration
│   ├── DNS configuration (StandardDns)
│   └── LXC/VM provisioning
├── DockgeLxc                (components/DockgeLxc.ts — Dockge LXC container)
│   ├── Docker runtime
│   ├── Service discovery
│   └── Docker Compose stacks
├── TruenasVm                (components/TruenasVm.ts — TrueNAS storage VM)
│   ├── NFS exports
│   ├── SMB shares
│   └── S3 (Minio)
├── ProxmoxBackupServerLxc   (components/ProxmoxBackupServerLxc.ts — PBS backup server)
│   └── Proxmox backup targets
├── StandardDns              (components/StandardDns.ts — DNS record management)
│   └── Cloudflare DNS zones
└── Helper Components
    ├── tailscale.ts — Tailscale node/device utilities
    ├── authentik.ts — AuthentikApplicationManager, AuthentikOutputs
    ├── lxc.ts      — LXC container utilities
    ├── unifi.ts    — Unifi network management
    └── helpers.ts  — copyFileToRemote, addUptimeGatus, etc.
```

### File Dependency Graph

```
globals.ts
├── op.ts (OPClient)
├── constants.ts (Tailscale config, ACL tags, port groups)
└── helpers.ts

ProxmoxHost.ts
├── globals.ts
├── StandardDns.ts
├── tailscale.ts
├── authentik.ts
└── helpers.ts

DockgeLxc.ts
├── ProxmoxHost.ts
├── StandardDns.ts
├── tailscale.ts
├── lxc.ts
├── authentik.ts
└── helpers.ts

TruenasVm.ts
└── ProxmoxHost.ts
```

### Stacks Quick Reference

| Stack | Purpose | Key Resources |
|-------|---------|---------------|
| `home/` | Core infrastructure | ProxmoxHost (twilight-sparkle, celestia, alpha-site), TruenasVm (spike), DockgeLxc (celestia-dockge, alpha-site-dockge), Minio buckets |
| `authentik/` | IdP management | Authentik groups/roles/flows; outputs written to 1Password "Authentik Outputs" |
| `applications/` | Kubernetes app deployment | Helm releases, Authentik app registration, Volsync secrets on Equestria + Stargate Command |
| `backups/` | Backup automation | PBS backup jobs, B2 targets, retention policies |
| `unifi-network/` | Network management | Unifi firewall rules, Tailscale drop rules (ACL manager) |
| `ocracoke/` | Ocracoke cluster | Cluster node and network management |
| `gulf-of-mexico/` | Gulf of Mexico cluster | Cluster node and network management |

### 5) Evidence

- `.codebase-scan.txt` — directory tree
- `package.json` — workspace definitions
- `tsconfig.json` — path aliases
- `stacks/home/index.ts` — canonical stack entry
- `components/globals.ts` — canonical component entry
- `docs/codebase/COMPONENTS.md` — component hierarchy and API reference
- `docs/codebase/DOCKER.md` — Docker services reference
