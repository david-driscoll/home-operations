#!/usr/bin/env bash
# The `apm` sidecar (../helmrelease.yaml): keep the user-scope agent packages
# in ./apm.yml -- skills, instructions and the mise MCP server, for every
# Claude Code and Codex session on the pod -- installed and current. A sidecar
# rather than a step in ./install-tools.sh so the daemon never waits on ~180
# GitHub fetches: agents start at once and pick packages up as they land.
#
# Not substituted by Flux (../kustomization.yaml), so plain shell variables are
# safe here.
set -uo pipefail

# Between refreshes. The container has to stay up regardless (a regular
# container that exits is restarted), so it may as well keep refreshing.
interval="${APM_REFRESH_INTERVAL:-86400}"
token_file=/var/run/secrets/github-token/token

while true; do
  # Copied, not mounted: an agent's own `apm install -g <pkg>` writes
  # ~/.apm/apm.yml, and a read-only mount would fail it -- the copy just
  # resets it to ./apm.yml each pass.
  mkdir -p "$HOME/.apm"
  cp /opt/paseo/apm.yml "$HOME/.apm/apm.yml"
  # Re-read every pass: the token rotates every 30 minutes.
  if [ -r "$token_file" ]; then
    GITHUB_APM_PAT="$(cat "$token_file")"
    export GITHUB_APM_PAT
  fi
  # `--refresh` installs what is missing and moves what is already there to
  # its latest upstream ref. apm rolls back the whole install when one package
  # fails, so a failure only waits for the next pass.
  echo "==> apm install -g --refresh ($HOME/.apm/apm.yml)"
  "$MISE_INSTALL_PATH" exec -- apm install --global --refresh \
    || echo "WARNING: apm install failed; packages stay as they were on the volume" >&2
  sleep "$interval"
done
