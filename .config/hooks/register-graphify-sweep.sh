#!/bin/sh
# Installs graphify-sweep-commit.sh's trigger into .git/hooks/post-commit as
# its own marked, idempotent block -- the SAME file crew's sync hook and
# `graphify hook install` already share (each owns its own marked section;
# see the "--- crew-sync-hook ---" and "# graphify-hook-start" markers
# already in that file). All real logic stays in the repo-tracked
# graphify-sweep-commit.sh; this block only calls it.
#
# NOTE ON MECHANISM: git-config(1) documents an additional hook.<name>.command
# / hook.<name>.event channel (the same one hk registers via `hk install
# --mise`, see .config/hk.pkl's comment), but on the git version this repo
# actually runs (2.50.1 / Apple Git-155) that channel does not fire --
# verified directly: neither a real `git commit` nor an explicit `git hook
# run pre-commit` invokes a hook.*.command entry on this git. Until that
# changes, the only mechanism proven to actually fire here is the classic
# file-based .git/hooks/<name>, so that's what this installs into. Safe to
# re-run: replaces its own block in place rather than duplicating it, and is
# harmless even if a future git version also starts honoring the config
# channel (graphify-sweep-commit.sh is itself idempotent -- a second
# invocation per commit finds nothing dirty and no-ops).
#
# Run by `mise install`'s [hooks] postinstall, right after `graphify hook
# install`, on every fresh clone or reinstall -- see .config/mise.toml.
# `graphify hook install` re-running (e.g. on a graphifyy version bump) only
# rewrites ITS OWN marked section per its own docs ("If a post-commit hook
# already exists, graphify appends to it rather than replacing it"), so our
# block below survives that untouched, and vice versa.
set -eu

TOPLEVEL=$(git rev-parse --show-toplevel)
cd "$TOPLEVEL"

HOOKS_DIR=$(git rev-parse --git-common-dir)/hooks
HOOK_FILE="$HOOKS_DIR/post-commit"
SWEEP_SCRIPT_REL=".config/hooks/graphify-sweep-commit.sh"

mkdir -p "$HOOKS_DIR"
[ -f "$HOOK_FILE" ] || printf '#!/bin/sh\n' > "$HOOK_FILE"

START_MARK="# graphify-sweep-hook-start"
END_MARK="# graphify-sweep-hook-end"

BLOCK=$(cat <<EOF
$START_MARK
# Folds a prior commit's detached graphify rebuild output (graph.json,
# GRAPH_REPORT.md, etc.) into its own commit instead of leaving it as an
# uncommitted working-tree diff. All logic lives in the repo-tracked
# $SWEEP_SCRIPT_REL so it stays reviewable/testable outside this
# generated, multi-owner file.
# Installed by: .config/hooks/register-graphify-sweep.sh
_GFY_SWEEP_TOP=\$(git rev-parse --show-toplevel 2>/dev/null) || _GFY_SWEEP_TOP=""
if [ -n "\$_GFY_SWEEP_TOP" ] && [ -x "\$_GFY_SWEEP_TOP/$SWEEP_SCRIPT_REL" ]; then
    "\$_GFY_SWEEP_TOP/$SWEEP_SCRIPT_REL"
fi
$END_MARK
EOF
)

if grep -qF "$START_MARK" "$HOOK_FILE"; then
    # Idempotent reinstall: replace the existing block in place rather than
    # appending a duplicate. The multi-line $BLOCK is deliberately never
    # passed through awk -v (some awk implementations, including the one on
    # this machine, warn/misbehave on a -v value containing a literal
    # newline) -- awk here only ever sees the single-line marker strings,
    # and $BLOCK is stitched in at the shell level instead.
    awk -v start="$START_MARK" '$0 == start { exit } { print }' "$HOOK_FILE" > "$HOOK_FILE.tmp.before"
    awk -v end="$END_MARK" 'found { print; next } $0 == end { found = 1 }' "$HOOK_FILE" > "$HOOK_FILE.tmp.after"
    {
        cat "$HOOK_FILE.tmp.before"
        printf '%s\n' "$BLOCK"
        cat "$HOOK_FILE.tmp.after"
    } > "$HOOK_FILE.tmp"
    rm -f "$HOOK_FILE.tmp.before" "$HOOK_FILE.tmp.after"
    mv "$HOOK_FILE.tmp" "$HOOK_FILE"
else
    printf '\n%s\n' "$BLOCK" >> "$HOOK_FILE"
fi

chmod +x "$HOOK_FILE"
echo "[graphify-sweep] installed post-commit block in $HOOK_FILE"
