### 2026-07-26T22-28-23: All crew issues for all four repos are tracked in david-driscoll/vault
**By:** Crew (Coordinator)
**What:** All crew issues for all four repos are tracked in david-driscoll/vault
**References:** david-driscoll/vault, .github/workflows/sync-crew-labels.yml, .crew/routing.md
**Why:** **Decision.** `david-driscoll/vault` is the single issue tracker for the entire estate. It is private with issues enabled, which keeps homelab infrastructure issues out of public view.

**Implemented:**
- Every crew's `.crew/manifest.json` sets `contact.repo: "david-driscoll/vault"` — including vault's own crew. Verified via `crew discover`: all three peers resolve to `david-driscoll/vault`.
- Created 11 labels in `david-driscoll/vault`: `crew` (triage inbox), `crew:{morpheus,trinity,tank,niobe,dozer,mouse,ralph,rai,fact-checker}`, and `crew:claude`. Names match the `slugify()` output of `sync-crew-labels.yml` so the workflow updates rather than duplicates them. Scribe is intentionally excluded — the workflow skips it.
- Issue routing is documented in `.crew/routing.md`: Morpheus triages the `crew` label, identifies which of the four repos the issue targets, then assigns a `crew:{member}` label.

**Consequence for CI — the non-obvious part.** GitHub fires `issues:` events only in the repository that OWNS the issue. The four issue-driven workflows (`crew-triage`, `crew-issue-assign`, `crew-heartbeat`, `crew-claude`) therefore CANNOT function in `home-operations` — nothing would ever trigger them. They must live in `vault`, where `context.repo` already resolves correctly and no rewriting is needed. `crew init` installed them there.

Only `sync-crew-labels.yml` is genuinely cross-repo: it is triggered by a roster push in `home-operations` but writes labels into vault. It was rewritten to use a `CREW_ISSUE_REPO` env var and needs a `CREW_ISSUE_REPO_TOKEN` PAT, because the default `GITHUB_TOKEN` cannot write to another repository.

**Open gap.** `crew-claude.yml` running in vault checks out vault. An issue about `home-operations` or a cluster repo gives the agent the wrong working tree. Cross-repo issue execution needs an explicit checkout of the target repo plus a push-capable token. Left unresolved for David.