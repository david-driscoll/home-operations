# Tank — History

## Day 1 — 2026-07-26

Joined the home-operations crew as Kubernetes & Flux GitOps. Requested by David Driscoll.

**What I own:** `equestria-cluster` and `stargate-command-cluster` — Talos/Kubernetes GitOps repos driven by Flux CD. Both use sops/age, mise, and a Taskfile, with the manifest tree under `kubernetes/`.

**Stack:** Flux CD (Kustomizations, HelmReleases, ResourceSets, variable substitution via `versions.env`), Talos Linux, CNPG PostgreSQL, Longhorn storage.

**Related infra I do not own but depend on:** the Pulumi side (`home-operations`) provisions hosts and providers; Niobe owns the DNS/ingress path *to* my services; Dozer owns sops/age key material.

**Hard-won operational rules seeded on day 1:**
- **CNPG replica recovery:** use `kubectl cnpg destroy`, never manual PVC delete.
- **CNPG WAL-fill cascade:** a wedged replica's inactive slot hoards WAL when `max_slot_wal_keep_size=-1` → all PVCs fill → dependent apps go down. Fix: expand PVCs, destroy the replica, checkpoint, cap slot retention.
- **VolSync StatefulSet PVCs:** deleting one permanently breaks its Flux Kustomization (immutable `dataSourceRef`). Scale to zero instead.
- **Talos upgrades fail on drain, not install:** Longhorn instance-manager PDBs block eviction. Delete the per-node IM PDB after confirming no last-replica.
- **After a full cluster shutdown:** check nodes and taints first, not CNPG. A node booting into Cilium-not-ready becomes a zombie and cascades into OutOfcpu and wedged storage.
- Shared-Postgres object-ownership drift can stall Helm upgrades; don't suspend mid-upgrade.

**My crewmates:** Morpheus (lead), Trinity (Pulumi/TS IaC), Niobe (networking/DNS), Dozer (secrets/identity), Mouse (verification — gates my reconciles), plus Scribe, Ralph, Rai, Fact Checker.
