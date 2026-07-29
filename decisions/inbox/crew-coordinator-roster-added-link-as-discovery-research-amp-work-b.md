### 2026-07-29T01-06-56: Roster: added Link as Discovery Research &amp; Work Breakdown (seat 11, Matrix diegetic overflow)
**By:** Crew (Coordinator)
**What:** Roster: added Link as Discovery Research &amp; Work Breakdown (seat 11, Matrix diegetic overflow)
**References:** Link, Morpheus, Ralph, Fact Checker, Mouse, .crew/agents/link/charter.md, .crew/team.md, .crew/routing.md, .crew/casting/registry.json, .crew/casting/history.json
**Why:** ### 2026-07-28: New seat — Link (Discovery Research & Work Breakdown)

**By:** David Driscoll (requested), Crew (Coordinator) (executed)

**What:** Hired an 11th crew member, **Link**, to own the path from a raw idea to a researched, dependency-ordered sub-issue tree filed in `david-driscoll/vault`.

**Gap this closes (verified against the existing charters, not assumed):**
- **Morpheus** (`.crew/agents/morpheus/charter.md`) triages issues that *already exist* and carry the `crew` label, assigns `crew:{member}`, and makes scope calls. His charter states "I sequence, I don't implement" and lists no upfront research or decomposition duty.
- **Ralph** (`.crew/agents/ralph/charter.md`) is a generic keep-alive/work-monitor seat that picks up already-filed issues.
- **Fact Checker** (`.crew/agents/fact-checker/charter.md`) verifies claims and runs counter-hypotheses; its own Boundaries section says "I review, not create."
- **Mouse** reviews previews/diffs, downstream of implementation.
- Nothing owned: idea → research → decomposed sub-issue tree. Confirmed.

**Link owns:** discovery research (prior art across the four repos, upstream docs/source, constraints, existing `vault` issues); decomposition into scoped sub-issues with acceptance criteria and explicit dependency ordering; filing the `type:epic` parent plus linked sub-issues in `david-driscoll/vault` with the target repo named in title and body; a suggested `crew:{member}` owner per issue; and the open-questions list requiring a Morpheus scope call.

**Link does NOT:** make architecture or priority decisions (Morpheus approves scope and sequencing); implement anything (no Pulumi, no manifests, no network/secret/DNS changes); triage existing `crew`-labeled issues (Morpheus); or pick up his own sub-issues (Ralph pumps the queue, domain owners execute per `.crew/routing.md`). Factual uncertainty escalates to Fact Checker.

**Collision resolved — Link vs Morpheus's triage row.** The two are on opposite sides of one handoff, separated by trigger: Link fires when an idea has *no* issue yet; Morpheus fires when an issue already exists and carries `crew`. Link files into the `crew` inbox and applies only `crew`, `type:*`, `repo:*` (when research is unambiguous), and `go:needs-research`. He **never** applies a `crew:{member}` label — the suggested owner lives in the issue body as a proposal, so Morpheus's triage is a confirmation or override rather than a re-derivation. Link's output is an input to triage, never a bypass of it. A comparison table making this explicit was added to `.crew/routing.md`.

**Casting:** The Matrix was already at its 10/10 policy capacity, so Overflow Handling step 1 — diegetic expansion — was applied. Link is a recurring supporting character from the same universe. No universe switch, no existing agent renamed, per `crew.agent.md`.

**Files changed:**
- `.crew/agents/link/charter.md` (new)
- `.crew/team.md` — Members table
- `.crew/routing.md` — routing-table row, Issue Routing flow, new "Link and Morpheus — no overlap" section, Rules item 10
- `.crew/casting/registry.json`, `.crew/casting/history.json`

**Follow-up not done (needs approval):** the `crew:link` label does not exist in `david-driscoll/vault`. Until it is created, Morpheus cannot route an issue to Link by label. Creating it is a remote repo mutation and was left for the user.

**Backend note:** `stateBackend` is `two-layer` and the `crew_state` bridge answered healthy. `casting/registry.json` and `casting/history.json` returned "State key not found" from the bridge — they exist only on disk, written there by both prior roster expansions. They were edited on disk to stay consistent with that precedent; writing them through the bridge would have created a shadow copy diverging from the file every other read uses.