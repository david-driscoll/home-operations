# Crew Team

> home-operations — primary crew for the David Driscoll homelab estate

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Crew | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Morpheus | Lead / Architect | `.crew/agents/morpheus/charter.md` | active |
| Trinity | Pulumi & TypeScript IaC | `.crew/agents/trinity/charter.md` | active |
| Tank | Kubernetes Workloads & Flux Delivery | `.crew/agents/tank/charter.md` | active |
| Seraph | Storage & Data Protection | `.crew/agents/seraph/charter.md` | active |
| Roland | Node Lifecycle & Cluster Upgrades | `.crew/agents/roland/charter.md` | active |
| Oracle | Observability & SRE | `.crew/agents/oracle/charter.md` | active |
| Niobe | Networking & DNS | `.crew/agents/niobe/charter.md` | active |
| Dozer | Secrets & Identity | `.crew/agents/dozer/charter.md` | active |
| Sparks | CI/CD & GitHub Automation | `.crew/agents/sparks/charter.md` | active |
| Mouse | Verification & Review | `.crew/agents/mouse/charter.md` | active |
| Scribe | Session Logger | `.crew/agents/scribe/charter.md` | active |
| Ralph | Work Monitor | `.crew/agents/ralph/charter.md` | active |
| Rai | RAI Reviewer | `.crew/agents/Rai/charter.md` | active |
| Fact Checker | Verifier | `.crew/agents/fact-checker/charter.md` | active |

## Project Context

- **Project:** home-operations
- **Owner:** David Driscoll
- **Created:** 2026-07-26
- **Primary crew:** Yes — this crew manages all four repositories in the estate.
- **Issue tracker:** `david-driscoll/vault` (private). All crew issues for all four
  repos are filed there, not in the individual repos.

### Repositories managed

| Repo | Local path | What it is |
|------|-----------|------------|
| `home-operations` | `~/Development/david-driscoll/home-operations` | Pulumi TypeScript monorepo — stacks, components, sdks, dynamic, docker |
| `equestria-cluster` | `~/Development/david-driscoll/equestria-cluster` | Talos/Kubernetes GitOps cluster (Flux, sops/age, mise, Taskfile) |
| `stargate-command-cluster` | `~/Development/david-driscoll/stargate-command-cluster` | Sibling Talos/Kubernetes GitOps cluster |
| `vault` | `~/Development/david-driscoll/vault` | Smaller Pulumi TypeScript repo; also the issue tracker for the estate |

### Stack

- **IaC:** Pulumi (TypeScript, run via `tsx` ESM loader — no compile step)
- **GitOps:** Flux CD on Talos Kubernetes
- **Clusters:** Celestia, Luna (Kubernetes); Equestria, Stargate Command, Alpha Site (Dockge/Docker)
- **Secrets:** 1Password Connect (`OPClient`), sops/age, Authentik for identity
- **Networking:** UniFi, Cloudflare DNS, AdGuard
- **Tooling:** mise (tool versions + `op://` env refs), npm workspaces, Taskfile

### Platform domain ownership

The two Kubernetes clusters are **platform twins** — every platform namespace exists in
both at near-identical counts. They diverge only in workload namespaces (`equestria` 61
vs `sgc` 11) and equestria's extra `github-actions` and `pulumi`. Ownership is therefore
split **by domain, not by cluster**: each owner below covers their domain in *both*
clusters. This survives the planned move of the clusters into `home-operations` —
per-cluster seats would not.

| Namespace | Owner |
|-----------|-------|
| `flux-system`, `equestria`, `sgc` | Tank |
| `longhorn-system`, `openebs-system`, `nfs-system`, `volsync-system`, `cloudnative-pg`, `database` | Seraph |
| `system-upgrade`, plus unclaimed `kube-system` platform add-ons | Roland |
| `observability` | Oracle |
| `network`, `cert-manager`, `tailscale-system` | Niobe |
| `github-actions` | Sparks |
| `pulumi` | Trinity |

**`kube-system` is shared by function, not owned wholesale.** Roland owns Cilium agent
health, node readiness, and anything unclaimed (descheduler, metrics-server, multus,
spegel, reloader, registry, headlamp, features, etcd). Niobe owns Cilium network policy,
L2 announcements, BGP, and coredns. Dozer owns 1password, external-secrets, `secrets`,
and reflector. Seraph owns snapshot-controller.

### Cross-crew topology

home-operations is the **hub**. The three peers are registered here for discovery and
delegation only (`crew registry add`); each peer lists home-operations as its
`upstream` so governance flows outward from this crew. See `.crew/manifest.json`
and `.crew/crew-registry.json`.
