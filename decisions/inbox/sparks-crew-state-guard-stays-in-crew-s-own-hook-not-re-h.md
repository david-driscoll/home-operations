### 2026-07-29T02-08-21: Crew state guard stays in crew's own hook, NOT re-homed into hk — re-homing cannot fix the casting/ bug
**By:** sparks
**What:** Crew state guard stays in crew's own hook, NOT re-homed into hk — re-homing cannot fix the casting/ bug
**References:** david-driscoll/vault#81, david-driscoll/home-operations#601, david-driscoll/vault#87
**Why:** Decision on vault#81's open question ("do we want the crew state guard in hk at all?"): NO.

Evidence gathered 2026-07-28:

1. crew 0.11.0-build.6 STILL emits the buggy glob. The generator at
   packages/crew-cli/src/cli/commands/install-hooks.ts:118 (and the shipped dist)
   contains `^\.crew/(decisions\.md|agents/.+/history\.md|casting/|routing/)`.
2. BUT the hooks currently on disk in all four repos do NOT contain `casting/` —
   they read `^\.crew/(decisions\.md|agents/.+/history\.md|routing/)`, mtimes
   2026-07-26 23:30-23:47. They were locally patched after generation and will be
   overwritten by the next `crew upgrade`, exactly as the issue predicted.

Why hk cannot fix this: git 2.55 runs BOTH hook channels and any hook exiting
non-zero aborts the commit. So an hk step with the corrected glob would run
ALONGSIDE crew's buggy hook, not instead of it. After the next `crew upgrade`,
crew's hook would still block `.crew/casting/` commits regardless of what hk says.
Adding the hk guard buys nothing and creates two sources of truth with two
different error messages for the same condition.

Also: `.crew/decisions.md` and `.crew/agents/*/history.md` are ALREADY in
.gitignore, so they can only be staged with `git add -f`. The guard is a third
layer for those paths. And `.crew/routing/` does not exist (it is routing.md, a
tracked file) — that glob entry is dead either way.

Therefore: fix it upstream in crew (report to Blacklite), keep the local patch as
an interim, use `CREW_SYNC_ACTIVE=1 git commit` as the documented workaround, and
keep hk scoped to linting only. hk.pkl in home-operations and vault deliberately
contains no crew-state-guard step.

Verified working anyway (so the option stays open): the issue's proposed pkl step
validates and behaves correctly in hk 1.53.0 — blocks decisions.md and
agents/*/history.md, stays silent on casting/ and normal files.