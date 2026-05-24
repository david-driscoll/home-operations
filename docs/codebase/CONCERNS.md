# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| High | No automated tests — all validation requires live `pulumi preview` | `package.json` test stub | A bug in `components/globals.ts` or `DockgeLxc.ts` silently breaks all stacks | Adopt Pulumi Testing SDK for unit tests on helper functions and ComponentResource logic |
| High | `DockgeLxc.ts` is a 32KB God class with 54 commits in 90 days | `.codebase-scan.txt` churn data | High blast radius — changes to LXC provisioning, docker-compose deployment, Tailscale, DNS, and Authentik are all coupled | Extract discrete concerns (docker-compose sync, Tailscale registration, Authentik wiring) into focused sub-components |
| High | 1Password Connect is a single point of failure for all stack operations | `components/op.ts`, `components/globals.ts` | If Connect is unreachable, no stack can run — credentials, kubeconfigs, and outputs are all gated behind it | Add health check / retry logic in OPClient; consider caching non-secret credentials locally |
| Medium | Hardcoded network constants in `GlobalResources` | `components/globals.ts:135-136` | Changing the gateway or search domain requires code changes and a redeploy of all stacks | Move to 1Password item or Pulumi config values (the existing TODO agrees) |
| Medium | Cross-stack dependency via 1Password item names | `stacks/home/index.ts`, `stacks/authentik/index.ts` | If an 1Password item is renamed, dependent stacks fail at runtime with no compile-time warning | Document all cross-stack item name contracts; consider a typed manifest |
| Medium | Kubernetes kubeconfig stored in 1Password — no expiry handling | `stacks/applications/kubernetes.ts` | If a kubeconfig rotates, the stack silently uses a stale credential until it fails | [ASK USER] Is kubeconfig rotation automated? |
| Low | No APM or distributed tracing for Pulumi stack failures | `components/op.ts`, Pulumi logs | Failures are silent beyond console errors | Alertmanager IS available for active infrastructure alert queries at `https://alertmanager.driscoll.tech/api/v2/alerts` — agents should query this when diagnosing failures. Pulumi itself still lacks APM. |
| Low | Backblaze B2 integration is commented out | `components/globals.ts` (commented), `package.json` | Dead code; dependency is still installed | Decide: remove the package and code, or re-enable |
| Low | One `.cs` file (`docker/_common/backups/Playground.cs`) — a C# script in an otherwise TypeScript repo | `.codebase-scan.txt` code metrics | Inconsistency; likely a scratch file | Review and remove if not used |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| No tests | Infrastructure repos are hard to unit test; team prioritized velocity | Entire `components/` and `stacks/` | Regressions are only caught in production | Adopt Pulumi Testing SDK; start with pure helper functions in `components/helpers.ts` |
| `DockgeLxc.ts` oversized | Accumulated features over time (54 commits) | `components/DockgeLxc.ts` (32KB) | Hard to reason about; high churn = high risk | Decompose into focused sub-classes/functions |
| Hardcoded gateway/search domain | Quick start; TODO exists in code | `components/globals.ts:135-136` | Manual edit required for infra changes | Move to Pulumi config or 1Password item |
| `// TODO: clear out old keys` | K8s secret cleanup not implemented | `stacks/applications/kubernetes.ts:29`, `stacks/backups/kubernetes-backups.ts:26` | Orphaned secrets accumulate in clusters | Implement cleanup logic using list + diff |
| `// TODO: Google Drive?` | Backup destination not yet decided | `stacks/backups/BackupPlanManager.ts:107` | Missing backup redundancy | Decide on Google Drive or another off-site target |
| `// TODO: make work at somepoint` | Incomplete ProxmoxHost feature | `components/ProxmoxHost.ts:137` | Unknown functionality gap | [ASK USER] What is this TODO referring to? |
| `// TODO: Pull from tailscale???` in constants | DNS/subnet constants hardcoded | `components/constants.ts:1` | Changes to Tailscale config require code edits | Fetch dynamically from Tailscale API |

### 3) Security Concerns

| Risk | OWASP category | Evidence | Current mitigation | Gap |
|------|----------------|----------|--------------------|-----|
| No credentials in code | A02 (Cryptographic Failures) | `.mise.toml` uses `op://`; `Pulumi.*.yaml` uses encryptionsalt | All secrets in 1Password; Pulumi encrypts stack state | No gap observed |
| 1Password Connect token in env | A02 | `CONNECT_TOKEN` in env at runtime | Injected at runtime via mise, not committed | Token exposure in process environment; acceptable for homelab |
| AdGuard insecure HTTP | A02 | `components/globals.ts` — `insecure: true, scheme: "http"` | Internal network only | Unencrypted API traffic to AdGuard on internal network |
| SSH key handling | A07 (Identification/Auth) | `sftpKey` from 1Password; used for remote commands | Key fetched at runtime from 1Password | [ASK USER] Are SSH keys rotated? |
| No input validation on CRD data | A03 (Injection) | `stacks/applications/kubernetes.ts` | Data comes from own K8s cluster | Trust boundary is internal cluster — acceptable risk |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|-------------|-----------------------|
| Sequential 1Password lookups at stack init | `stacks/home/index.ts` — multiple `op.getItemByTitle()` calls | Adds latency per lookup to stack startup | At ~10+ items, adds several seconds to startup | Batch with `Promise.all()` where items are independent |
| `DockgeLxc` reads entire `docker/` directory at deploy time | `components/DockgeLxc.ts` uses `glob()` | Scales with number of services | Large number of services could slow deploys | Pre-index or cache service discovery |
| K8s namespace enumeration is sequential | `stacks/applications/kubernetes.ts` uses `concatMap` (sequential) | One API call per namespace | Many namespaces = slow | Switch to `mergeMap` for parallel namespace queries |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|-------------|----------------------|
| `components/DockgeLxc.ts` | God class; many concerns; remote SSH side effects | 54 commits in 90 days | Always `pulumi preview` first; test on alpha-site cluster before production |
| `.mise.toml` | Env var injection for all stacks; tool version changes affect everyone | 48 commits in 90 days | Version-pin all tools; test locally with `mise install` after changes |
| `stacks/home/index.ts` | Wires together all physical infrastructure | 24 commits in 90 days | Preview on non-production first; avoid bulk changes |
| `components/helpers.ts` | Shared utility used by all components | 21 commits in 90 days | Changes cascade to all consumers; type-check carefully |
| `components/tailscale.ts` | Tailscale ACL/device management; misconfiguration = network outage | 18 commits in 90 days | Preview carefully; have alternative network access before applying ACL changes |
| `docker/_common/traefik/` and `prometheus/` | Core networking and monitoring for all Dockge clusters | 17 and 16 commits in 90 days | Test on alpha-site; validate routing before pushing to production clusters |

### 6) `[ASK USER]` Questions

1. [ASK USER] What does `// TODO: make work at somepoint` in `components/ProxmoxHost.ts:137` refer to?
2. [ASK USER] Is kubeconfig rotation for the Kubernetes clusters (Equestria, Stargate Command) automated, and how is the 1Password item updated when it rotates?
3. [ASK USER] Are SSH keys (the `sftpKey`) rotated, and is there a process for key rotation across all Dockge hosts?
4. [ASK USER] Is the Backblaze B2 integration (currently commented out) planned for removal, or will it be re-enabled?
5. [ASK USER] Is there a plan to adopt Pulumi Testing SDK or any other approach to automated testing for this infrastructure repo?
6. [ASK USER] What is the `ocracoke` and `gulf-of-mexico` stack managing? These stack names don't match the documented cluster names (Equestria, Stargate Command, Celestia, Luna, Skystar, Alpha Site).

### 7) Evidence

- `.codebase-scan.txt` — TODO/FIXME list and high-churn files
- `components/DockgeLxc.ts` — God class analysis
- `components/globals.ts` — hardcoded constants
- `stacks/applications/kubernetes.ts` — sequential namespace queries
- `package.json` — missing test script
