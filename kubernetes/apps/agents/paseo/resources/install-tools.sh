#!/usr/bin/env bash
# The `tools` init container (../helmrelease.yaml): install mise and every tool
# ./mise.toml pins onto the home volume. Runs on each start, so a Renovate bump
# to either file lands on the next rollout; a restart with everything already
# installed is a few seconds of no-ops.
#
# Not substituted by Flux (../kustomization.yaml), so plain shell variables are
# safe here.
set -euo pipefail

mise_bin="$MISE_INSTALL_PATH"
want="${MISE_VERSION#v}"
have="$("$mise_bin" --version 2>/dev/null | awk '{print $1}' || true)"
if [ "$have" != "$want" ]; then
  echo "==> installing mise $want (had: ${have:-none})"
  mkdir -p "$(dirname "$mise_bin")"
  curl -fsSL https://mise.run | MISE_VERSION="v$want" sh
fi

# Shims FIRST, for the install only. `npm.shell_out` runs whichever `npm` is
# on PATH, and the pod's PATH puts the image's node 22 / npm 10 ahead of the
# shims. mise honours `allow_builds` only with npm >= 11.16; given npm 10 it
# installs with --ignore-scripts, so Claude Code's postinstall never runs and
# `claude` is a stub ("claude native binary not installed") -- seen live
# 2026-10-17. Through the shims mise gets its own node 24's npm 11. Node goes
# first so the `npm` shim exists before any `npm:` tool installs.
export PATH="$MISE_DATA_DIR/shims:$PATH"

echo "==> mise install ($MISE_CONFIG_DIR/config.toml)"
"$mise_bin" trust "$MISE_CONFIG_DIR/config.toml"
"$mise_bin" install node
"$mise_bin" reshim
"$mise_bin" install

# `mise install` skips a version it already has, so a stub left by an earlier
# script-less install would stay forever. Reinstall it if it does not run.
if ! "$mise_bin" exec -- claude --version >/dev/null 2>&1; then
  echo "==> claude does not run; reinstalling with lifecycle scripts"
  "$mise_bin" install --force npm:@anthropic-ai/claude-code
fi

# Housekeeping; never fatal.
"$mise_bin" prune --yes || echo "WARNING: mise prune failed; old versions stay on the volume" >&2
"$mise_bin" cache prune || true

# Before mise, Claude Code and Codex were `npm install -g`'d into
# NPM_CONFIG_PREFIX. That prefix stays (an agent's own `npm install -g` lands
# there), but those two copies go: it sits on PATH, and a stale copy there
# would shadow nothing today but would the moment PATH order changed.
prefix="${NPM_CONFIG_PREFIX:-}"
if [ -n "$prefix" ]; then
  for pkg in @anthropic-ai/claude-code @openai/codex; do
    if [ -d "$prefix/lib/node_modules/$pkg" ]; then
      echo "==> removing pre-mise $pkg from $prefix"
      rm -rf "$prefix/lib/node_modules/$pkg"
    fi
  done
  rm -f "$prefix/bin/claude" "$prefix/bin/codex"
fi

"$mise_bin" ls --current
