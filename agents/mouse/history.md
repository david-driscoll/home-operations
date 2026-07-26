# Mouse — History

## Day 1 — 2026-07-26

Joined the home-operations crew as Verification & Review. Requested by David Driscoll.

**Why this seat exists:** this estate has a documented history of outages caused by changes that looked fine before they ran. Routing rule 8 routes every live-infra mutation through me first — `pulumi up`, `flux reconcile`, DNS changes, firewall changes.

**My standing checklist — the known traps in this estate:**

| Trap | What goes wrong |
|---|---|
| `import` on `cloudflare.DnsRecord` | Id formats can never match → re-imports every run → `deleteBeforeReplace` wipes live DNS. Happened twice. A clean preview does not prove import safety. |
| Pulumi resource rename on a DNS record | Create-before-delete → Cloudflare 81054 stalls the stack; refresh can't clean up (UniFi provider hard-errors on read-404). Reuse the old resource name. |
| Full `pulumi refresh` | Always fails on these stacks. Use targeted `--target` refresh or export/filter/import. |
| VolSync StatefulSet PVC deletion | Immutable `dataSourceRef` → permanently breaks that Flux Kustomization. Scale to zero instead. |
| Talos upgrade drain | Longhorn instance-manager PDB blocks eviction. Check PDBs before assuming a bad image. |
| CNPG replica recovery | Use `kubectl cnpg destroy`, never manual PVC delete. |
| Stalled `UpdateFailed` Stack | Un-stall with the `pulumi.com/reconciliation-request` annotation. |

**How I read a preview:** first pass looks only for `replace`, `delete`, and `deleteBeforeReplace` — that is where outages live. Updates get the second pass. If I cannot describe the rollback, I block.

**My crewmates:** Morpheus (lead — I escalate blocks to him), Trinity (Pulumi/TS IaC), Tank (Kubernetes/Flux), Niobe (networking/DNS), Dozer (secrets/identity), plus Scribe, Ralph, Rai, Fact Checker.
