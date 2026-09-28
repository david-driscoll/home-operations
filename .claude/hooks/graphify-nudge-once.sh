#!/usr/bin/env bash
# PreToolUse wrapper around `graphify hook-guard <kind>` that forwards its
# "use graphify query first" nudge at most ONCE per session (per subagent, per
# kind) instead of on every matching Bash/Grep/Read/Glob call.
#
# Why: each nudge is ~50 tokens of additionalContext that stays in the
# transcript and is re-sent on every later turn. Unwrapped, it fired 3,796 times
# across 136 sessions -- median 42, max 384 in one session (~19K tokens of the
# same sentence) -- and every call paid ~340 ms for `mise x` to start graphify.
# Once the marker exists, this exits before mise is ever spawned.
#
# Fails open like hook-guard itself: any error prints nothing and exits 0.
set -u

kind=${1:-}
[[ $kind == search || $kind == read ]] || exit 0

input=$(cat)

# Hook input is single-line JSON; session_id / agent_id are plain UUID-ish ids.
field() {
  printf '%s' "$input" |
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([A-Za-z0-9_-]*\)\".*/\1/p" |
    head -n1
}

marker="${TMPDIR:-/tmp}/graphify-nudge-$(field session_id)-$(field agent_id)-$kind"
[[ -e $marker ]] && exit 0

out=$(printf '%s' "$input" | mise x -- graphify hook-guard "$kind" 2>/dev/null) || exit 0
[[ -n $out ]] || exit 0

: >"$marker" 2>/dev/null
printf '%s\n' "$out"
