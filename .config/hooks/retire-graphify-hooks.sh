#!/bin/sh
# Retires the DETACHED graphify rebuilds from this clone's .git/hooks, and
# keeps graph.json's union merge driver registered.
#
# graphify-out/ is now kept current by .config/hk.pkl's pre-commit `graphify`
# step (.config/hooks/graphify-precommit.sh), which rebuilds synchronously and
# stages the result INTO the commit. The three blocks removed below all ran
# after the fact and could only ever leave the graph as working-tree dirt:
#   post-commit    # graphify-hook-start ... end            (`graphify hook install`)
#   post-checkout  # graphify-checkout-hook-start ... end   (`graphify hook install`)
#   post-commit    # graphify-sweep-hook-start ... end      (this script, formerly)
# crew's sections in the same files are left untouched.
#
# NOT `graphify hook uninstall`: that also unregisters the merge driver, and
# the driver is still wanted -- a `pull --rebase` of a local main commit over
# a remote one that also moved graph.json union-merges instead of conflicting.
# It is registered here the way `graphify hook install` does it: git config
# only, pinned to graphifyy's own venv python (a global dotnet:graphify-dotnet
# also ships a `graphify` binary, so the bare name is not safe). The
# `graphify-out/graph.json merge=graphify` line is already in .gitattributes.
#
# Run by `mise install`'s [hooks] postinstall on every fresh clone or
# reinstall -- see .config/mise.toml. Idempotent.
set -eu

TOPLEVEL=$(git rev-parse --show-toplevel)
cd "$TOPLEVEL"

HOOKS_DIR=$(git rev-parse --git-common-dir)/hooks

strip_block() { # <hook file> <start marker> <end marker>
    [ -f "$1" ] || return 0
    grep -qxF "$2" "$1" || return 0
    awk -v start="$2" -v end="$3" '
        $0 == start { skip = 1; next }
        skip && $0 == end { skip = 0; next }
        !skip { print }
    ' "$1" > "$1.tmp"
    # Keep the file's mode (it is executable); only its content changes.
    cat "$1.tmp" > "$1"
    rm -f "$1.tmp"
    echo "[graphify-hooks] removed '$2' block from $1"
}

strip_block "$HOOKS_DIR/post-commit" "# graphify-hook-start" "# graphify-hook-end"
strip_block "$HOOKS_DIR/post-checkout" "# graphify-checkout-hook-start" "# graphify-checkout-hook-end"
strip_block "$HOOKS_DIR/post-commit" "# graphify-sweep-hook-start" "# graphify-sweep-hook-end"

GRAPHIFY_BIN=$(mise which graphify 2>/dev/null) || GRAPHIFY_BIN=""
if [ -z "$GRAPHIFY_BIN" ]; then
    echo "[graphify-hooks] graphifyy not installed; merge driver not registered" >&2
    exit 0
fi
GRAPHIFY_PYTHON="$(dirname "$(realpath "$GRAPHIFY_BIN")")/python"
git config merge.graphify.name "graphify graph.json union merge"
git config merge.graphify.driver "\"$GRAPHIFY_PYTHON\" -m graphify merge-driver %O %A %B"
echo "[graphify-hooks] merge driver registered ($GRAPHIFY_PYTHON)"
