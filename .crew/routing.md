# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Pulumi stacks & TypeScript IaC | Trinity | `stacks/*`, `components/*`, `sdks/*`, `dynamic/*`, ComponentResources, provider wiring in `globals.ts`, new stack scaffolding, `vault` repo Pulumi work |
| Kubernetes workloads & Flux delivery | Tank | Flux itself (`flux-system`, Kustomizations, HelmReleases, ResourceSets, variable substitution, `versions.env`), the `equestria` and `sgc` application namespaces, app-template deployments, `deploy-app`, reconciliation debugging |
| Storage & data protection | Seraph | Longhorn, OpenEBS, NFS, VolSync/restic, CNPG clusters and backups, `database` ns (postgres/valkey/neo4j), PVCs, StorageClasses, snapshot-controller, disk-pressure incidents |
| Node lifecycle & cluster upgrades | Roland | Talos config and talhelper, `system-upgrade`/tuppr, Kubernetes and Talos version rollouts, node drain/cordon/reboot, etcd, bootstrap and cold-start sequencing, Cilium agent health and node readiness, unclaimed `kube-system` add-ons |
| Observability & SRE | Oracle | `observability` ns (Prometheus, Alertmanager, Grafana, Loki, Tempo, Thanos, Alloy, exporters), ServiceMonitors, PrometheusRules, dashboards, Gatus, alert triage and runbooks |
| Networking & DNS | Niobe | UniFi (network/protect/access), Cloudflare DNS records, AdGuard, firewall rules, gateways, routing, VPN, port forwards, `unifi-network` stack; **in-cluster:** `network` ns (traefik, k8s-gateway, external-dns, cloudflare-tunnel, crowdsec), cert-manager, tailscale-system, coredns, Cilium network policy / L2 / BGP |
| Secrets & identity | Dozer | 1Password Connect / `OPClient` / `OnePasswordItem` outputs, Authentik, sops/age keys, credential rotation, `authentik` stack, secret hygiene review; **in-cluster:** 1password, external-secrets, `secrets`, reflector |
| CI/CD & GitHub automation | Sparks | `.github/workflows` in all four repos, ARC self-hosted runners and the `github-actions` ns, crew workflow plumbing, Renovate, GitHub Apps and token wiring, cross-repo dispatch, label plumbing, pre-commit/`hk` |
| Verification & review | Mouse | `pulumi preview` diffing, drift detection, `flux diff`/dry-run, PR review, regression guards, pre-deploy blast-radius checks |
| Scope, architecture & priorities | Morpheus | Cross-repo trade-offs, what to build next, architecture decisions, issue triage, deciding which repo a change belongs in |
| Docker / Dockge stacks | Trinity | `docker/` compose configs per cluster, `DockgeLxc`, `ProxmoxHost` |
| Session logging | Scribe | Automatic — never needs routing |
| Work queue / backlog | Ralph | Keep-alive, idle triage, picking up open issues |
| RAI review | Rai | Content safety, bias checks, credential detection, ethical review |
| Verification / devil's advocate | Fact Checker | Claim verification, challenging assumptions in proposals |

## Repo Routing

All four repos are managed by this crew. Route by *subject matter*, not by repo —
then confirm the target repo with Morpheus if it is ambiguous.

| Repo | Primary owners |
|------|----------------|
| `home-operations` | Trinity (IaC), Niobe (networking stacks), Dozer (authentik/1Password stacks), Sparks (workflows) |
| `equestria-cluster` | Tank (Flux + apps), Seraph (storage/CNPG), Roland (Talos/nodes), Oracle (observability), Niobe (network/ingress/DNS), Dozer (sops/age, external-secrets), Sparks (`github-actions` ns / ARC runners) |
| `stargate-command-cluster` | Tank (Flux + apps), Seraph (storage/CNPG), Roland (Talos/nodes), Oracle (observability), Niobe (network/ingress/DNS), Dozer (sops/age, external-secrets) |
| `vault` | Trinity, with Dozer for anything secret-bearing and Sparks for the crew workflows |

**Cluster work routes by domain, not by cluster.** The two clusters are platform twins;
the owners above cover their domain in both. See the Platform domain ownership table in
`team.md` for the namespace-level map, including the shared `kube-system` split.

Cross-repo work is delegated to the peer crew via `crew delegate {crew-name} "..."`
when the change is self-contained in that repo. When a change spans repos, Morpheus
sequences it and this crew owns the whole chain.

## Issue Routing

**All issues live in `david-driscoll/vault`** — including issues about the other three
repos. Name the target repo in the issue title or body; do not open issues in the
individual repos.

| Label | Action | Who |
|-------|--------|-----|
| `crew` | Triage: analyze issue, assign `crew:{member}` label | Morpheus |
| `crew:{name}` | Pick up issue and complete the work | Named member |
| `crew:claude` | Claude Code agent picks up the issue autonomously | Claude agent workflow |

### How Issue Assignment Works

1. When an issue in `david-driscoll/vault` gets the `crew` label, **Morpheus** triages it —
   analyzing content, identifying which repo it targets, assigning the right
   `crew:{member}` label, and commenting with triage notes.
2. When a `crew:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `crew` label is the "inbox" — untriaged issues waiting for Morpheus.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "which cluster runs AdGuard?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a stack change is being built, spawn Mouse to prepare the preview/diff check simultaneously.
7. **Issue-labeled work** — when a `crew:{member}` label is applied to an issue in `vault`, route to that member. Morpheus handles all `crew` (base label) triage.
8. **Anything that mutates live infrastructure goes through Mouse first.** `pulumi up`, `flux reconcile`,
   firewall changes, and DNS record changes require a reviewed preview/diff before execution.
   This rule exists because unverified changes have caused production DNS outages in this estate before.
9. **Never let an agent invent a secret value.** Secret-bearing work routes through Dozer,
   and Rai screens output for credential leakage.
