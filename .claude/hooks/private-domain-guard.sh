#!/usr/bin/env bash
# PreToolUse hook (Write|Edit|MultiEdit|NotebookEdit): refuse to write the
# estate's root domain or tailnet name in plaintext into this repo, any of its
# worktrees, or this project's Claude memory. The check itself is
# scripts/private-domain-guard (names read from SOPS at run time, never stored).
#
# Exit 2 blocks the tool call and hands stderr back to the agent. Anything the
# hook cannot evaluate -- no jq, no age key, a path outside scope -- passes:
# the commit-time hk step is the second line of defence. Only the NEW text is
# checked, so an Edit that removes a name is always allowed.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
guard="$here/scripts/private-domain-guard"
[[ -x "$guard" ]] && command -v jq >/dev/null 2>&1 || exit 0

input="$(cat)"
path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)"
[[ -n "$path" ]] || exit 0

case "$path" in
  "$here"/*) ;;
  "$HOME"/.claude/projects/*home-operations*/memory/*) ;;
  *) exit 0 ;;
esac
case "$path" in *.sops.*) exit 0 ;; esac

content="$(jq -r '[
    .tool_input.content,
    .tool_input.new_string,
    ((.tool_input.edits // []) | map(.new_string) | join("\n")),
    .tool_input.new_source
  ] | map(select(. != null and . != "")) | join("\n")' <<<"$input" 2>/dev/null)"
[[ -n "$content" ]] || exit 0

# Repo-relative, so the guard can apply .config/private-domain-allow. A target
# in a worktree under this checkout is relative to that worktree's root.
rel="${path#"$here"/}"
[[ "$rel" =~ ^\.claude/worktrees/[^/]+/(.+)$ ]] && rel="${BASH_REMATCH[1]}"
printf '%s' "$content" | "$guard" stdin "$rel"
if [[ $? -eq 1 ]]; then
  cat >&2 <<EOF
private-domain-guard: this write would put the estate's root domain or tailnet
name in plaintext into ${path#"$here"/}. The repo is public and is being
scrubbed of both (docs/plans/private-domain-scrub.md). Write:
  - \${ROOT_DOMAIN} / \${TAILSCALE_DOMAIN} in Flux-rendered values (SOPS-backed),
  - <root domain> / <tailnet> in prose, comments and memory notes,
  - an environment lookup in code -- never the literal.
EOF
  exit 2
fi
exit 0
