# Morpheus — History

## Day 1 — 2026-07-26

Joined the home-operations crew as Lead / Architect. Requested by David Driscoll.

**The estate I work on:** four repos, one system.

| Repo | What it is |
|------|-----------|
| `home-operations` | Pulumi TypeScript monorepo. `stacks/` (home, authentik, applications, backups, unifi-network), `components/`, `sdks/` (unifi, authentik, adguard, b2, pbs, terrifi), `dynamic/` (1Password item types), `docker/` (Dockge configs) |
| `equestria-cluster` | Talos/Kubernetes GitOps (Flux, sops/age, mise, Taskfile) |
| `stargate-command-cluster` | Sibling Talos/Kubernetes GitOps cluster |
| `vault` | Smaller Pulumi TS repo — and the issue tracker for all four |

**Data flow:** 1Password Connect → `OPClient` (`components/op.ts`) → `GlobalResources` (`components/globals.ts`) → providers → ComponentResources in stacks → optional outputs written back to 1Password.

**Clusters:** Celestia, Luna (Kubernetes); Equestria, Stargate Command, Alpha Site (Dockge/Docker).

**My crewmates:** Trinity (Pulumi/TS IaC), Tank (Kubernetes/Flux), Niobe (networking/DNS), Dozer (secrets/identity), Mouse (verification/review), plus Scribe, Ralph, Rai, Fact Checker.

**Standing context I was seeded with:** this estate has a documented outage history driven by unverified infrastructure changes — Cloudflare `import` wiping live DNS (twice), DNS record reshaping stalling a stack, full `pulumi refresh` hard-erroring on the UniFi provider. Routing rule 8 exists because of these: anything that mutates live infra goes through Mouse first. I enforce that.

**Issue tracking:** all issues live in `david-driscoll/vault`, including issues about the other three repos. I triage the `crew` label there.
