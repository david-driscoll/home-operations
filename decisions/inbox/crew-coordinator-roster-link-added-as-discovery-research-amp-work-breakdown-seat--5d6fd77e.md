---
id: 5d6fd77e-8229-4c8f-8f63-56b82be7c6c8
class: DECISION
loadGuidance: [ALWAYS]
title: "Roster: Link added as Discovery Research &amp; Work Breakdown (seat 11)"
author: "Crew (Coordinator)"
createdAt: 2026-07-29T01:07:07.517Z
metadata: {}
---

Link joined the home-operations crew on 2026-07-28 as Discovery Research & Work Breakdown — the seat that turns a raw idea into a researched, dependency-ordered sub-issue tree in `david-driscoll/vault`.

Routing rule: an idea with no issue yet goes to Link FIRST, not straight to a domain owner. Link researches prior art across the four repos plus upstream docs/source, then files a `type:epic` parent with linked sub-issues — each carrying scope, acceptance criteria, `Depends on:` ordering, and a `Suggested owner:` line.

Hard boundary against Morpheus: Link applies `crew`, `type:*`, `repo:*`, and `go:needs-research` only. He NEVER applies a `crew:{member}` label. Morpheus remains the sole authority on owner assignment, priority, scope, and architecture. Link fires when no issue exists; Morpheus fires on issues that already carry `crew`. Link's tree lands in Morpheus's inbox — it is an input to triage, never a bypass.

Link never implements (no Pulumi, manifests, network, DNS, or secrets) and never picks up his own sub-issues. Factual uncertainty escalates to Fact Checker; scope uncertainty to Morpheus.

Casting: The Matrix universe was at 10/10 capacity, so Overflow Handling step 1 (diegetic expansion, same universe) was applied. Future additions continue overflow from The Matrix — never switch universes, never rename an existing agent.

Outstanding: the `crew:link` label does not yet exist in `david-driscoll/vault`; Morpheus cannot label-route to Link until it is created.
