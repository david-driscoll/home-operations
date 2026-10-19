#!/usr/bin/env bash
# Pins the six toolport MCP door URLs into the user's Claude Code settings, so
# sessions that do not inherit mise's environment can still expand the
# `${TOOLPORT_<PROFILE>_URL}` references in the committed .mcp.json.
#
# The Claude desktop app is the case this exists for: it launches every Code
# session from launchd with a fixed environment (PATH and its own CLAUDE_*
# variables, nothing from mise), so all six servers fail with INVALID_CONFIG
# "'url' is not a valid URL". The `env` block of ~/.claude/settings.json is
# applied to every local session before .mcp.json is expanded, which fixes it
# without the domain ever being written into the repo: mise resolves the URLs
# from .config/domains.sops.yaml when this task runs, and they land only in the
# user's own settings file. Run it once per machine, and again if the domain or
# a profile changes:
#
#   mise run claude:toolport-env
#
# Only the profiles' OAuth doors are accepted. An agentboard, paseo or
# kube-coder pod sets TOOLPORT_<PROFILE>_URL to its in-cluster proxy already
# (docs/kubernetes/agentboard-mcp.md), and pinning those into a settings file
# would outlive the pod's own wiring, so the script refuses them.
set -euo pipefail

SETTINGS="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
PROFILES=(INFRASTRUCTURE NETWORKING HOME MEDIA POSTGRES RESEARCH)

env_json='{}'
for profile in "${PROFILES[@]}"; do
  var="TOOLPORT_${profile}_URL"
  url="${!var:-}"
  # tr, not ${profile,,}: macOS's /bin/bash is 3.2.
  door="^https://toolport-$(tr '[:upper:]' '[:lower:]' <<<"$profile")\.agents\.[^/]+/mcp$"
  if [[ ! "$url" =~ $door ]]; then
    echo "error: $var is not a toolport OAuth door (unset, or an in-cluster proxy)." >&2
    echo "       Run this through mise from the repo, with the age key present: mise run claude:toolport-env" >&2
    exit 1
  fi
  env_json=$(jq --arg k "$var" --arg v "$url" '. + {($k): $v}' <<<"$env_json")
done

mkdir -p "$(dirname "$SETTINGS")"
[[ -s "$SETTINGS" ]] || echo '{}' >"$SETTINGS"

# Merge into the existing `env` and write back through the same inode, so the
# file keeps its mode (0600) and a symlinked settings file stays a symlink.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
jq --argjson add "$env_json" '.env = ((.env // {}) + $add)' "$SETTINGS" >"$tmp"
cat "$tmp" >"$SETTINGS"

echo "Pinned ${#PROFILES[@]} TOOLPORT_*_URL variables into $SETTINGS."
echo "Start a new Claude session (or reconnect the servers in /mcp) to pick them up."
