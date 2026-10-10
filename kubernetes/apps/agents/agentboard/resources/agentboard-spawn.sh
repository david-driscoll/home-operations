#!/usr/bin/env bash
#
# agentboard-spawn -- start a NEW Claude Code session in its own agentboard
# window, in its own git worktree, and hand it its first prompt.
#
#   agentboard-spawn [-C DIR] [--no-worktree] NAME PROMPT
#
# Mounted at /opt/agentboard/bin/agentboard-spawn from the `agentboard-bin`
# ConfigMap (../kustomization.yaml, ../helmrelease.yaml's `persistence.bin`).
# Unlike ./entrypoint.sh this is NOT a Flux template: that ConfigMap has
# substitution disabled, so dollar signs here are plain shell and shellcheck
# reads the file as it runs. It is also a directory mount, not a subPath, so
# an edit reaches the running pod in about a minute without a restart.
#
# THE WINDOW GOES IN THE `agentboard` TMUX SESSION, for the reason
# ./entrypoint.sh's resume block gives: agentboard classifies a window by the
# name of the tmux session it lives in, and only one under `agentboard` is
# `managed` -- visible in the UI as its own and killable from it.
#
# THE PROMPT IS AN ARGUMENT, NOT `send-keys`. Keys typed at a window land on
# whatever is on screen, and a `claude` that is still starting, or is showing
# a trust or permission dialog, is not the prompt box. An argument cannot
# arrive early. Follow-up prompts have no such option; see the hint printed
# at the end.
#
# NO QUOTING LAYER. tmux runs a multi-argument command directly, without
# `sh -c`, so NAME and PROMPT reach bash as positional parameters and are
# never re-parsed. Quotes, dollars and newlines in a prompt are all safe.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: agentboard-spawn [-C DIR] [--no-worktree] NAME PROMPT

Start a new Claude Code session in a new agentboard window and give it PROMPT.

  NAME            window name, and the worktree's name. Letters, digits, `-`
                  and `_` only; it becomes the session's name in the UI.
  PROMPT          the first message. One argument -- quote it.
  -C DIR          directory to start in (default: /root/home-operations)
  --no-worktree   start in DIR itself instead of a new worktree of it
EOF
}

die() {
  echo "agentboard-spawn: $*" >&2
  exit 1
}

dir=/root/home-operations
worktree=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    -C)
      [ "$#" -ge 2 ] || die "-C needs a directory"
      dir=$2
      shift 2
      ;;
    --no-worktree)
      worktree=0
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      usage >&2
      die "unknown option: $1"
      ;;
    *) break ;;
  esac
done

if [ "$#" -ne 2 ]; then
  usage >&2
  exit 2
fi
name=$1
prompt=$2

# `.` and `:` are tmux's own target separators, and the name is also a
# directory under .claude/worktrees/.
[[ $name =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] ||
  die "NAME must be letters, digits, '-' or '_': $name"
[ -n "$prompt" ] || die "PROMPT is empty"
# `claude` would read it as one of its own options.
case "$prompt" in
  -*) die "PROMPT cannot start with '-'" ;;
esac
[ -d "$dir" ] || die "no such directory: $dir"

tmux has-session -t '=agentboard' 2>/dev/null ||
  die "no 'agentboard' tmux session; is agentboard running?"
if tmux list-windows -t '=agentboard' -F '#{window_name}' | grep -Fxq -- "$name"; then
  die "a window named '$name' is already open"
fi

# `--worktree` takes an OPTIONAL value, so it is always given one here: a bare
# `claude --worktree "$prompt"` makes the prompt the worktree's name.
#
# `exec claude` skips the `claude` shell function in ./bashrc, which is fine:
# all that function does is add the `--worktree` this spells out.
if [ "$worktree" -eq 1 ]; then
  git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 ||
    die "$dir is not a git checkout; use --no-worktree"
  # An existing worktree of that name is someone's work -- a finished session's
  # or a live one's. Landing a new session in it is the shared-checkout
  # collision ./bashrc's wrapper exists to prevent.
  [ ! -e "$dir/.claude/worktrees/$name" ] ||
    die "worktree already exists: $dir/.claude/worktrees/$name"
  # shellcheck disable=SC2016  # expanded by the bash tmux starts, not here
  launch='exec claude --worktree "$1" "$2"'
  by_hand="claude --worktree $name"
else
  # shellcheck disable=SC2016  # as above
  launch='exec claude "$2"'
  by_hand="command claude"
fi

# A login shell, so ./bashrc puts the mise shims back on PATH.
window=$(tmux new-window -d -P -F '#{window_id}' -t '=agentboard:' -n "$name" -c "$dir" \
  -- bash -lc "$launch" agentboard-spawn "$name" "$prompt")

# `-d` reports nothing, and a window whose command exits is closed at once and
# takes its error message with it.
sleep 2
if ! tmux list-windows -t '=agentboard' -F '#{window_id}' | grep -Fxq -- "$window"; then
  die "window '$name' closed within 2s -- claude exited at once. Run it by hand to see why: cd $dir && $by_hand"
fi

echo "spawned '$name' as agentboard:$name ($window)"
if [ "$worktree" -eq 1 ]; then
  echo "  worktree:  $dir/.claude/worktrees/$name"
fi
echo "  read it:   tmux capture-pane -p -t agentboard:$name"
echo "  follow up: tmux send-keys -t agentboard:$name -l 'text' && tmux send-keys -t agentboard:$name Enter"
