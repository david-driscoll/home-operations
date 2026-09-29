#!/bin/sh
# graphify-precommit.sh -- the `graphify` step of .config/hk.pkl's pre-commit
# hook. Rebuilds graphify-out/ for the commit being made and stages it, so the
# graph lands IN that commit instead of as a working-tree diff afterwards.
#
# WHY NOT graphify's OWN HOOKS. `graphify hook install` adds a post-commit and a
# post-checkout rebuild that run DETACHED. Their output can only ever land after
# the commit, as dirt against tracked files -- that is what kept showing up in
# `git status`. graphify-sweep-commit.sh tried to fold it into a follow-up
# commit, but only on the NEXT commit and only when nothing else was dirty, so
# the last commit of a session (or a `pull --rebase` that raced the rebuild)
# always left it behind. Both are retired: .config/mise.toml's postinstall runs
# retire-graphify-hooks.sh. An incremental rebuild takes ~7-12s, cheap
# enough to do synchronously.
#
# MAIN ONLY. graph.json is ~25 MiB of generated JSON. Rebuilt on every branch,
# every pair of parallel PRs would conflict on it, and GitHub cannot run a
# merge driver to resolve that. So branches never touch the graph; main owns
# it. The rebuild is fed every file changed since the last commit that touched
# graph.json -- not just the staged files -- so the first commit on main after
# a PR merge (or a GitHub squash) also catches the graph up on everything that
# landed without it.
#
# FAILS OPEN. The graph is a convenience; a broken or slow graphify must never
# block a commit. Every failure below warns and exits 0.
#
# Writes only graphify-out/ -- generated, never hand-edited -- and stages only
# files git already tracks there (`git add -u`). That is the one deliberate
# exception to hk.pkl's "never mutate during a commit" posture; see the step.
set -u

warn() { printf '[graphify pre-commit] %s\n' "$*" >&2; }

[ "${GRAPHIFY_SKIP_HOOK:-0}" = "1" ] && exit 0

TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$TOPLEVEL" || exit 0
[ -f graphify-out/graph.json ] || exit 0

[ "$(git symbolic-ref --short -q HEAD 2>/dev/null)" = "main" ] || exit 0

# The last commit whose tree carries an updated graph. Diffed against the
# INDEX, so this is exactly "what the graph has not seen yet, as committed".
BASE=$(git log -1 --format=%H -- graphify-out/graph.json 2>/dev/null)
[ -n "$BASE" ] || exit 0
CHANGED=$(git diff --cached --name-only --no-renames "$BASE" -- . ':(exclude)graphify-out' 2>/dev/null)
[ -n "$CHANGED" ] || exit 0

# Resolve graphifyy's own venv python. NOT `graphify` off PATH: a global
# dotnet:graphify-dotnet also ships a `graphify` binary and wins on some PATHs.
# `mise which` answers from this repo's .config/mise.toml pin; the launcher is
# a symlink into the venv, whose bin/python must NOT itself be realpath'd (that
# would escape the venv to the bare interpreter).
GRAPHIFY_BIN=$(mise which graphify 2>/dev/null) || GRAPHIFY_BIN=""
GRAPHIFY_PYTHON=""
if [ -n "$GRAPHIFY_BIN" ]; then
    GRAPHIFY_PYTHON="$(dirname "$(realpath "$GRAPHIFY_BIN")")/python"
fi
if [ ! -x "$GRAPHIFY_PYTHON" ]; then
    warn "graphifyy not installed (mise install pipx:graphifyy) -- graph not updated"
    exit 0
fi

# A deleted file removes nodes, and graphify refuses to write a graph that
# shrank unless forced ("accept a shrink"). The deletions are real -- git says
# so -- so force exactly then.
FORCE=0
if [ -n "$(git diff --cached --name-only --no-renames --diff-filter=D "$BASE" -- . ':(exclude)graphify-out' 2>/dev/null)" ]; then
    FORCE=1
fi

# Same determinism pin as graphify's own hook: louvain's community order
# follows PYTHONHASHSEED, and an unpinned seed churns every output file.
# block_on_lock: wait out a concurrent rebuild rather than queue and return
# False (the non-blocking default would leave this commit's graph stale).
# stdout goes to stderr so hk shows graphify's own notices if the step fails.
if ! GRAPHIFY_CHANGED="$CHANGED" GRAPHIFY_FORCE_SHRINK="$FORCE" PYTHONHASHSEED=0 \
    "$GRAPHIFY_PYTHON" -c '
import os, sys
from pathlib import Path
from graphify.watch import _rebuild_code
changed = [Path(p) for p in os.environ["GRAPHIFY_CHANGED"].splitlines() if p.strip()]
ok = _rebuild_code(Path("."), changed_paths=changed, block_on_lock=True,
                   force=os.environ["GRAPHIFY_FORCE_SHRINK"] == "1")
sys.exit(0 if ok else 1)
' >&2; then
    warn "rebuild failed -- committing without a graph update (the next commit on main retries)"
    exit 0
fi

git add -u -- graphify-out || warn "could not stage graphify-out/"
exit 0
