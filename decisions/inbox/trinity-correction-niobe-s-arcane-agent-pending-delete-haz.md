### 2026-07-29T02-13-28: CORRECTION: Niobe's arcane-agent pending-delete hazard is REAL. Remediation must be export/filter/import (not state delete), and PR #602 must merge BEFORE any un-stall.
**By:** Trinity
**What:** CORRECTION: Niobe's arcane-agent pending-delete hazard is REAL. Remediation must be export/filter/import (not state delete), and PR #602 must merge BEFORE any un-stall.
**References:** PR #602, Niobe verification pass, stacks: gulf-of-mexico, home-operations, ocracoke, supersedes prior Trinity decision d15ca9b9
**Why:** ## Correction to my earlier decision

Niobe is **right** and I missed it. My "no `delete: true` twins" statement was scoped to the
`technitium-dns-*` URNs and is true there, but I did not sweep the rest of the state.

Verified on fresh exports: each of the three stacks holds a `delete: true` pending-delete entry
for `arcane-agent.*` whose **URN and id are byte-identical** to a surviving `delete: false` entry:

| Stack | Hostname | id (both entries) |
|---|---|---|
| gulf-of-mexico | arcane-agent.luna.driscoll.tech | 6a681f41f95f1e0084e38b42 |
| home-operations | arcane-agent.as.driscoll.tech | 6a681f48f95f1e0084e38b46 |
| ocracoke | arcane-agent.skystar.driscoll.tech | 6a681f4df95f1e0084e38b4b |

All three are **live** on the controller as CNAMEs to `dockge-{luna,as,skystar}.driscoll.tech`.
They are the ONLY non-`command:remote:*` pending deletes in any of the three stacks.

The discriminator: the many `command:remote:CopyToRemote` duplicates carry *different* ids per
entry (normal replacement residue, harmless). The arcane-agent entries carry the *same* id — the
pending delete points at the record the surviving entry still claims. Next successful `up` flushes
it, DELETE returns 200, live record gone, state still claims the id, `up` sees no diff, never
self-heals. Identical to how the six `pbs.*`/`netbootxyz`/`arcane`/`backrest.skystar` records were
already destroyed.

## Consequences for the plan

1. **`pulumi state delete` cannot fix arcane-agent** — duplicate URN triggers "URN ambiguously
   referred to multiple resources" and there is no disambiguation flag (`--help` confirms only
   `--all`, `--force`, `--stack`, `--target-dependents`, `--yes`). **Export / filter / import is
   required.** A validated filter removes exactly 3 entries per stack with zero dangling refs.
2. **ORDERING IS LOAD-BEARING: state surgery FIRST, then merge #602.** If the stacks are un-stalled
   before #602 lands, `StandardDns.create` still runs the UniFi lookup, finds the live
   arcane-agent record, sets `import: default:<id>` != state `<id>`, and re-arms the same
   destroy/recreate. Do **not** annotate `pulumi.com/reconciliation-request` before #602 merges;
   merging #602 both disarms the bug and un-stalls the stacks on its own.

## Six missing records

Still recommend separate approval, but they are safe: all six URNs are unique (so `state delete`
works), none of the six names exist live, so recreation cannot collide. Their code paths
(`${opts.name}-dns-service`, and the generic `${stackName}-dns-${host}` loop) still exist at HEAD,
so the next `up` recreates them. Order-independent w.r.t. #602 — the lookup returns nothing for an
absent record either way.
