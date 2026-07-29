### 2026-07-29T01-16-53: Casting: Fact Checker cast as Ghost (seat 12); charter directory deliberately not renamed
**By:** Crew (Coordinator)
**What:** Casting: Fact Checker cast as Ghost (seat 12); charter directory deliberately not renamed
**References:** Ghost, Fact Checker, Link, Morpheus, .crew/agents/fact-checker/charter.md, .crew/fact-checker/policy.md, .crew/team.md, .crew/routing.md, .crew/casting/registry.json, .crew/casting/history.json
**Why:** ### 2026-07-28: Fact Checker cast as **Ghost**

**By:** David Driscoll (approved), Crew (Coordinator) (executed)

**What:** Allocated the Matrix persona name **Ghost** to the Devil's Advocate & Verification seat. Role identity unchanged — still Devil's Advocate & Verification Agent, still advisory-by-default with the two blocking exceptions in `.crew/fact-checker/policy.md`.

**Why this is not a prohibited rename.** The casting note says "never rename an existing agent." That rule comes from `crew.agent.md`'s Overflow Handling, where the sentence reads "Existing agents are NEVER renamed **during overflow**" — it exists to stop name churn when a universe runs dry. This seat had *no* cast name; it was running on its literal role label as a placeholder, and its own charter line 10 stated from init that it "Gets a universe name like any other agent (not exempt like Scribe/Ralph)." This completes a skipped allocation rather than changing a made one. Scribe, Ralph, and Rai remain deliberately exempt built-ins (Rai has no casting line and presents as a built-in policy role).

**Why Ghost.** Peripheral Matrix character (*Enter the Matrix* / *Revolutions*) — precise, introspective, questions everything, which is the closest fit in the roster to a devil's advocate. The name also resonates with the charter's explicit hallucination-detection duty. This is Overflow Handling step 1 (diegetic expansion, same universe), continuing from Link — no universe switch.

**Collision check run before choosing** (this estate is full of technical vocabulary):
- `apoc` — REJECTED, collides with the Neo4j APOC plugin, live in the `database` namespace
- `vector` — REJECTED, log shipper in Oracle's observability domain
- `switch` — REJECTED, network switches in Niobe's domain
- `binary` — REJECTED, too generic
- `ghost` — ACCEPTED. Only appearance in the estate is a commented-out `# TEMPLATE_NAME: "ghost"` placeholder in `docker/_common/traefik/compose.yaml`. Well inside house tolerance: this crew cast **Oracle** while running a `database` namespace with postgres.

**Directory NOT renamed — deliberate.** `.crew/agents/fact-checker/` and `.crew/fact-checker/` stay put. The string `fact-checker` is load-bearing: `.crew/fact-checker/audit-trail.md` is named literally in `crew.agent.md`'s runtime-managed path list (the HARD RULE section), and both the `coordinator-source-of-truth` and `coordinator-init-mode` skills reference the path. Renaming for cosmetic consistency would break protocol references for zero functional gain. Display name and storage path are allowed to differ, and this is now documented in the charter, the registry entry, and the routing table so nobody "fixes" it later.

**Files changed:**
- `.crew/agents/fact-checker/charter.md` — heading, `**Name:**`, Casting line rewritten to record the allocation, plus a Boundaries note explaining the name/path split. Also corrected the stale decision-write instruction (it pointed at `.crew/decisions/inbox/` directly, which is wrong under the `two-layer` backend).
- `.crew/fact-checker/policy.md` — naming note at the top; body still says "Fact Checker" as the role, which is accurate.
- `.crew/team.md` — row now `| Ghost | Verifier (Devil's Advocate) | .crew/agents/fact-checker/charter.md | active |`
- `.crew/routing.md` — routing row
- `.crew/agents/morpheus/charter.md`, `.crew/agents/link/charter.md` — cross-references updated to "Ghost"
- `.crew/casting/registry.json` — new `verification-devils-advocate` entry with `charter_dir` recorded
- `.crew/casting/history.json` — `home-operations-2026-07-28-verification-casting` snapshot

**NOT touched:** `.crew/fact-checker/audit-trail.md` (append-only, runtime-managed).

**Label action needed — for David, not executed here.** `david-driscoll/vault` has `crew:fact-checker` ("Assigned to Fact Checker (Verifier)"). **Zero issues carry it, open or closed** — verified via `gh issue list --label "crew:fact-checker" --state all`, which returned `[]`. Because nothing references it, the clean operation is a **rename in place**: `crew:fact-checker` → `crew:ghost`, description → "Assigned to Ghost (Verifier / Devil's Advocate)", color unchanged at `9B8FCC`. No migration, no dual-label period, no risk to existing issues.