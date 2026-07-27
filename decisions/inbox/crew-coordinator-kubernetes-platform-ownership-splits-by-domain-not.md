### 2026-07-27T03-28-16: Kubernetes platform ownership splits by domain, not per-cluster; Tank narrowed to Flux delivery + workloads; four seats added (Seraph, Roland, Oracle, Sparks) and The Matrix is now at capacity
**By:** Crew (Coordinator)
**What:** Kubernetes platform ownership splits by domain, not per-cluster; Tank narrowed to Flux delivery + workloads; four seats added (Seraph, Roland, Oracle, Sparks) and The Matrix is now at capacity
**References:** Seraph, Roland, Oracle, Sparks, Tank, Niobe, Dozer, david-driscoll/vault#81, .crew/team.md, .crew/routing.md, .crew/casting/registry.json, .crew/casting/history.json
**Why:** ## Decision 1 — Split cluster ownership by DOMAIN, not per-cluster

`equestria-cluster` and `stargate-command-cluster` are platform twins. Every platform
namespace exists in both at near-identical HelmRelease counts: cert-manager 2/2,
cloudnative-pg 1/1, database 3/3, longhorn-system 1/1, nfs-system 1/1, openebs-system 1/1,
network 10/10, volsync-system 2/2, system-upgrade 1/1, flux-system 3/3. They diverge only
in workload namespaces (`equestria` 61 vs `sgc` 11) plus equestria's extra `github-actions`
and `pulumi`.

Rejected: casting an "Equestria agent" and an "SGC agent". That would encode the same
Longhorn/CNPG/VolSync/Talos knowledge twice, and both seats would become obsolete the
moment the clusters move into `home-operations` — which is the stated plan and the reason
the new agents were cast into the hub repo rather than the spokes. Domain seats survive
that merge unchanged; they just gain a repo path.

Namespace ownership map now lives in `.crew/team.md` under "Platform domain ownership".

## Decision 2 — Rebalance Tank

Tank's original charter claimed Flux + Talos + CNPG + Longhorn + node health + upgrades +
HelmReleases + Kustomizations across both clusters — 100+ HelmReleases and every platform
concern in the estate. Narrowed to **Kubernetes Workloads & Flux Delivery**:

Keeps: Flux itself (`flux-system`, Flux Operator, Kustomizations, HelmReleases,
ResourceSets, variable substitution, `versions.env`), reconciliation debugging, and the
`equestria` (61) / `sgc` (11) workload namespaces with the `deploy-app` flow.

Moved off Tank:
- Storage & data protection (longhorn-system, openebs-system, nfs-system, volsync-system,
  cloudnative-pg, database, snapshot-controller) → **Seraph** (new)
- Node lifecycle & upgrades (Talos, talhelper, system-upgrade/tuppr, drain/cordon, etcd,
  bootstrap, cold-start sequencing) → **Roland** (new)
- Observability (`observability` ns, Prometheus/Alertmanager/Grafana/Loki/Tempo/Thanos,
  ServiceMonitors, PrometheusRules, Gatus, alert triage) → **Oracle** (new)
- In-cluster networking (`network` ns, cert-manager, tailscale-system, coredns, Cilium
  policy/L2/BGP) → **Niobe** (scope extension, no new seat)
- In-cluster secret plumbing (1password, external-secrets, `secrets`, reflector in
  kube-system) → **Dozer** (scope extension, no new seat)
- `github-actions` ns / ARC runners → **Sparks** (new)

No separate "workloads" seat was cast: stripping the platform off Tank already leaves a
coherent, appropriately-sized role, and a fifth new name would have pushed the universe
into overflow.

## Decision 3 — kube-system is owned by function, not wholesale

`kube-system` genuinely spans domains (cilium, coredns, descheduler, etcd, metrics-server,
multus, spegel, reloader, registry, headlamp, features, snapshot-controller, 1password,
external-secrets, secrets, reflector). Settled split, written into all affected charters
so it does not get relitigated:

- **Roland** — Cilium agent health and node readiness, plus default ownership of anything
  unclaimed. Grounded in the SGC full-shutdown cascade, which was a boot-order problem.
- **Niobe** — Cilium network policy, L2 announcements, BGP, coredns.
- **Dozer** — 1password, external-secrets, `secrets`, reflector.
- **Seraph** — snapshot-controller.

## Decision 4 — Casting capacity

Cast is now 10/10 for The Matrix (Scribe/Ralph/Rai/Fact Checker are built-ins, exempt).
The next roster addition triggers Overflow Handling per `crew.agent.md`: diegetic expansion
to peripheral characters from the same universe, then thematic promotion, then structural
mirroring. Do not switch universes. Never rename an existing agent. Recorded in
`.crew/casting/history.json`.

## Rationale grounding

Seraph's domain contains every logged incident in this estate: CNPG WAL-fill stuck-slot
cascade, CNPG replica recovery, AdGuard VolSync re-bootstrap, Longhorn instance-manager PDB
drain block. Roland's contains the two upgrade/boot incidents (tuppr drain block, SGC
full-shutdown Cilium zombie-node cascade). Sparks covers GitHub-as-infrastructure, which no
prior charter mentioned at all — including the ARC personal-account-vs-org constraint that
caused a listener crash-loop outage (commit 0c1dad94, since reverted).