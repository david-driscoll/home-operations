### 2026-07-29T02-10-39: crew post-commit state-sync hook is a permanent silent no-op in all four repos (pre-existing, not caused by the hk migration)
**By:** Mouse
**What:** crew post-commit state-sync hook is a permanent silent no-op in all four repos (pre-existing, not caused by the hk migration)
**References:** david-driscoll/vault#81, task-4 regression check, Sparks, crew 0.11.0-build.6, scripts/crew-sync-regression.sh
**Why:** Found 2026-07-28T21:55:00-0400 while building the task-4 regression check for issue david-driscoll/vault#81, against crew 0.11.0-build.6 / git 2.55.0 / hk 1.53.0.

FINDING
crew's post-commit hook does:
    export CREW_SYNC_ACTIVE=1
    crew sync --quiet 2>/dev/null || true
`crew sync` itself treats CREW_SYNC_ACTIVE=1 as "a sync is already in flight, do nothing" and returns 0 with NO output. The hook therefore suppresses the exact command it exists to run. Verified by bisection in a hermetic scratch repo: `crew sync` fast-forwards crew-state normally, and `CREW_SYNC_ACTIVE=1 crew sync` exits 0 having done nothing. The git hook environment (GIT_INDEX_FILE, GIT_EXEC_PATH, GIT_AUTHOR_*, GIT_PREFIX) was ruled out; a throttle/debounce was ruled out.

SCOPE
Identical hook body confirmed in home-operations/.git/hooks/post-commit, vault/.git/hooks/post-commit, equestria-cluster/.husky/post-commit, stargate-command-cluster/.husky/post-commit. post-commit is the ONLY crew hook that delegates to the crew CLI; pre-push, post-checkout, post-merge and post-rewrite do their git work inline in shell and all four VERIFY AS WORKING.

CONSEQUENCE
This is pre-existing and independent of hk. It is why the `|| true` concern in issue #81 is not hypothetical -- the silent-swallow failure it warns about is already live on one of the five sync paths, and nobody noticed because pre-push and post-merge carry crew-state well enough to mask it. Do NOT let the hk migration get blamed for it, and do NOT treat a green post-migration commit as evidence.

DISPOSITION
Reported upstream-worthy alongside the `casting/` glob bug (also confirmed: a fresh `crew init` still writes the over-matching glob including casting/, though the four live repos currently carry a variant without it -- so `crew upgrade` will reintroduce it). Encoded as an XFAIL assertion in scripts/crew-sync-regression.sh so it does not fail CI but shouts if it ever starts passing.