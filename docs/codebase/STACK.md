# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area                | Value                                                                         | Evidence                                |
| ------------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| Primary language    | TypeScript                                                                    | `tsconfig.json`, `package.json`         |
| Runtime + version   | Node.js 24.15.0                                                               | `.mise.toml`                            |
| Package manager     | npm (workspaces)                                                              | `package-lock.json` (lockfileVersion 3) |
| Module/build system | ESM (`"type": "module"`); Pulumi runs TS via `tsx` — no separate compile step | `package.json`, `Pulumi.yaml`           |
| TypeScript version  | 5.9.3                                                                         | `.mise.toml`                            |

### 2) Production Frameworks and Dependencies

**Root workspace (shared across all stacks):**

| Dependency                   | Version             | Role                                                 | Evidence                              |
| ---------------------------- | ------------------- | ---------------------------------------------------- | ------------------------------------- |
| `@pulumi/pulumi`             | (peer)              | IaC engine — ComponentResource, Output, etc.         | `stacks/*/package.json`               |
| `@pulumi/kubernetes`         | ^4.23.0             | Kubernetes resource management                       | `package.json`                        |
| `@pulumi/cloudflare`         | ^6.10.0             | DNS and CDN management                               | `components/package.json`             |
| `@pulumi/tailscale`          | ^0.27.0             | VPN / subnet routing                                 | `components/package.json`             |
| `@pulumi/minio`              | ^0.16.6             | S3-compatible object storage (TrueNAS)               | `components/package.json`             |
| `@pulumi/random`             | ^4.18.4             | Generating random passwords/strings                  | `components/package.json`             |
| `@pulumi/tls`                | ^5.2.2              | TLS certificate resources                            | `components/package.json`             |
| `@pulumi/github`             | ^6.8.0              | GitHub resource management                           | `package.json`                        |
| `@pulumi/http`               | ^0.2.0              | HTTP-based resource fetching                         | `package.json`                        |
| `@pulumi/command`            | (peer)              | Remote SSH command execution                         | `components/DockgeLxc.ts`             |
| `@pulumiverse/unifi`         | ^0.2.0              | Unifi network management                             | `components/package.json`             |
| `@pulumiverse/purrl`         | ^0.6.2              | HTTP resource provider                               | `package.json`                        |
| `@pulumi/adguard`            | file:sdks/adguard   | AdGuard Home management (local SDK)                  | `package.json`                        |
| `@pulumi/authentik`          | file:sdks/authentik | Authentik IdP management (local SDK)                 | `package.json`                        |
| `@pulumi/b2`                 | file:sdks/b2        | Backblaze B2 storage (local SDK, currently disabled) | `package.json`                        |
| `@pulumi/pbs`                | file:sdks/pbs       | Proxmox Backup Server (local SDK)                    | `package.json`                        |
| `@pulumi/terrifi`            | file:sdks/terrifi   | Unifi firewall rules via Terraform bridge            | `package.json`                        |
| `@pulumi/unifi`              | file:sdks/unifi     | Unifi SDK wrapper                                    | `package.json`                        |
| `@1password/connect`         | ^1.4.2              | 1Password Connect API client                         | `components/package.json`             |
| `@goauthentik/api`           | ^2026.2.3-rc1       | Authentik REST API client                            | `components/package.json`             |
| `@muhlba91/pulumi-proxmoxve` | (transitive)        | Proxmox VE resource provider                         | `components/ProxmoxHost.ts`           |
| `openapi-fetch`              | ^0.17.0             | Type-safe fetch client for OpenAPI SDKs              | `components/package.json`             |
| `moderndash`                 | ^4.0.0              | Utility functions (kebabCase, unique, etc.)          | `package.json`                        |
| `yaml`                       | (transitive)        | YAML serialization for compose/config files          | `components/DockgeLxc.ts`             |
| `confbox`                    | ^0.2.2              | Config parsing                                       | `package.json`                        |
| `crypto-js`                  | ^4.2.0              | Cryptographic utilities                              | `package.json`                        |
| `jsondiffpatch`              | ^0.7.3              | JSON diffing (used in dynamic resources)             | `package.json`                        |
| `rxjs`                       | (transitive)        | Reactive streams for parallel K8s queries            | `stacks/applications/kubernetes.ts`   |
| `ssh2-sftp-client`           |                     | SSH connections for backup management                | `stacks/backups/BackupPlanManager.ts` |

### 3) Development Toolchain

| Tool                   | Purpose                                              | Evidence                                  |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `tsx`                  | Run TypeScript directly (ESM, no compile step)       | `.mise.toml`, `Pulumi.yaml`               |
| `typescript` 5.9.3     | Type checking                                        | `.mise.toml`, `tsconfig.json`             |
| `pulumi` 3.242.0       | IaC CLI (preview/up/destroy)                         | `.mise.toml`                              |
| `mise`                 | Tool version manager + env var injection via `op://` | `.mise.toml`                              |
| `1password-cli` 2.34.0 | Resolve `op://` secret references in `.mise.toml`    | `.mise.toml`                              |
| `kubectl` 1.36.1       | Kubernetes cluster management                        | `.mise.toml`                              |
| `flux2` 2.8.8          | Flux GitOps operator CLI                             | `.mise.toml`                              |
| `sops` 3.13.1          | Secrets encryption                                   | `.mise.toml`                              |
| `age` 1.3.1            | Key-based encryption (used with sops)                | `.mise.toml`                              |
| `apm` 0.14.1           | Agent Package Manager (skills/agents)                | `.mise.toml`                              |
| `dotnet` 10.0.203      | .NET SDK (used for backup playground script)         | `.mise.toml`                              |
| `yq` / `jq`            | YAML/JSON processing in scripts                      | `.mise.toml`                              |
| `openapi-typescript`   | Generate TypeScript types from OpenAPI specs         | `components/package.json` devDependencies |

### 4) Key Commands

```bash
# One-time setup
curl https://mise.run | sh && mise trust && mise install
npm ci

# Deploy a stack
cd stacks/<stack-name>
pulumi preview          # always before up
pulumi up --yes

# Type-check only (no separate build needed for Pulumi)
npx tsc --noEmit

# Mise tasks (shortcuts)
mise run pulumi-up      # .config/mise/tasks/pulumi-up
mise run pulumi-cancel  # .config/mise/tasks/pulumi-cancel
mise run pulumi-refresh # .config/mise/tasks/pulumi-refresh
```

### 5) Environment and Config

- Config sources: `.mise.toml` (primary — injects env vars via `op://` references resolved by 1Password CLI)
- Required env vars (all resolved from 1Password vault "Eris" at runtime):
  - `CONNECT_HOST` — 1Password Connect server URL (`https://op-connect.sgc.driscoll.tech/`)
  - `CONNECT_TOKEN` — 1Password Connect API token
  - `CONNECT_VAULT` — Vault name (`Eris`)
  - `PULUMI_CONFIG_PASSPHRASE` — Stack encryption passphrase
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — Minio S3 credentials
  - `AWS_REGION` — Set to `home`
  - `AUTHENTIK_TOKEN` / `AUTHENTIK_URL` — Authentik API access
- Deployment constraint: Pulumi stacks must be run from within the stack directory; `tsx` ESM loader is required (configured in `Pulumi.yaml` via `nodeargs: [--loader=tsx]`)

### 6) Evidence

- `package.json` — root workspace manifest
- `components/package.json` — component-level deps
- `.mise.toml` — tool versions and env injection
- `tsconfig.json` — TypeScript config
- `.config/mise/tasks/` — mise task shortcuts
