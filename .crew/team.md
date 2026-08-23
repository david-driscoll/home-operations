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
| Link | Discovery Research & Work Breakdown | `.crew/agents/link/charter.md` | active |
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
| Ghost | Verifier (Devil's Advocate) | `.crew/agents/fact-checker/charter.md` | active |

## Project Context

- **Project:** home-operations
- **Owner:** David Driscoll
- **Created:** 2026-07-26
- **Primary crew:** Yes — and the only one. The estate consolidated from four
  repositories into `home-operations`; there are no peer crews left to delegate to.
- **Issue tracker:** `david-driscoll/vault` (private). It holds no code any more, but it
  remains the tracker and hosts the crew workflows. File issues there, not in
  `home-operations`. Moving the tracker is outstanding work.

### Repository

| Repo | Local path | What it is |
|------|-----------|------------|
| `home-operations` | `~/Development/david-driscoll/home-operations` | The whole estate: Pulumi stacks/components/sdks/dynamic, the Flux tree (`kubernetes/`), Talos config (`talos/`, `clusters/`), Dockge compose (`docker/`), bootstrap secrets (`bootstrap/`) |

The `equestria-cluster`, `stargate-command-cluster` and `vault` code trees were merged in
during the cluster-consolidation work; see `docs/cluster-consolidation/`. Their GitHub
repositories may still exist as history — they are not live sources for anything.

### Stack

- **IaC:** Pulumi (TypeScript, run via `tsx` ESM loader — no compile step)
- **GitOps:** Flux CD on Talos Kubernetes
- **Clusters:** Equestria (Kubernetes — the only one; SGC folded into it); Celestia, Luna, Skystar, Alpha Site (Dockge/Docker)
- **Secrets:** 1Password Connect (`OPClient`), sops/age, Authentik for identity
- **Networking:** UniFi, Cloudflare DNS, AdGuard
- **Tooling:** mise (tool versions, tasks under `.config/mise/tasks/`, `op://` env refs), npm workspaces, `hk` git hooks

### Platform domain ownership

There is one Kubernetes cluster, `equestria` — SGC folded into it during the
consolidation. Ownership is split **by domain**, which is why it survived the merge
intact: per-cluster seats would not have.

| Namespace | Owner |
|-----------|-------|
| `flux-system`, `equestria`, `stargate-command` | Tank |
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

None. There was a hub-and-spoke topology while the estate spanned four repositories —
`home-operations` as hub, with `equestria-cluster`, `stargate-command-cluster` and
`vault` crews registered as peers. Consolidation removed the spokes; `crew-registry.json`
is now empty and `crew delegate` has no target. See `.crew/manifest.json`.
