#!/usr/bin/env bash
#
# SHELLCHECK CANNOT FULLY READ THIS FILE, and the three codes below are off
# for one specific, provable reason -- not as a severity floor. Every other
# rule, including the rest of the error and warning tiers, stays on, matching
# ../../../../.shellcheckrc's stance of justifying each disable at its site.
#
# This file is a TEMPLATE, not a script as committed. It is delivered through
# a ConfigMap and Flux runs envsubst over it (../ks.yaml `postBuild`), so
# every shell variable is written `$$VAR` and only becomes `$VAR` at apply
# time. shellcheck analyses the pre-substitution text, where `$$VAR` parses as
# `$$` (the PID) followed by the literal string `VAR`. That single
# misreading produces all three:
#
#   SC2034  "appears unused" -- the assignment is seen, the `$$VAR` uses are
#           not, so every variable here looks write-only.
#   SC2157  "argument to -n is always true due to literal strings" -- `[ -n
#           "$$X" ]` looks like a non-empty literal rather than a variable.
#   SC2170  "invalid number for -gt" -- `[ "$$N" -gt 0 ]` looks like a
#           comparison against text.
#
# Rewriting the tests as `case` would silence two of them but not SC2034, and
# would trade readable code for appeasing a parser that is reading the wrong
# document. What actually validates this file is running shellcheck (and
# `bash -n`) against the SUBSTITUTED form:
#
#   sed 's/\$\$/$/g' entrypoint.sh | shellcheck -
#
# Do that after editing. The other `$$` templates in this repo
# (kubernetes/apps/kube-system/openbao-replica/resources/) need no directive
# only because none of them puts `$$VAR` inside a `[ ... ]` test.
# shellcheck disable=SC2034,SC2157,SC2170
# Bootstrap + entrypoint for the agentboard pod, run as `command` against a
# STOCK debian:13-slim image (see ../helmrelease.yaml) -- there is no
# agentboard-specific Dockerfile or CI build in this repo. That is a
# deliberate simplification, not an oversight: everything this pod needs
# beyond a bare Debian base is either something mise installs at runtime
# (../resources/mise.toml/./mise.lock -- node, kubectl, pulumi, gh, claude
# code, agentboard itself) or a handful of apt packages, and maintaining a
# Dockerfile + registry + build pipeline for that little was judged not
# worth it. The cost is a slower pod start (apt-get + the mise installer run
# on every restart, not just once at image-build time) in exchange for zero
# image maintenance.
set -euo pipefail

echo "==> installing OS packages"
apt-get update -qq
apt-get install -y --no-install-recommends \
    tmux git openssh-client ca-certificates curl build-essential \
    >/dev/null
rm -rf /var/lib/apt/lists/*

echo "==> installing mise"
if ! command -v mise >/dev/null 2>&1; then
  curl -fsSL https://mise.run | sh
fi

echo "==> configuring git"
# Authored as David, not a separate bot identity -- this repo's own
# convention (see CLAUDE.md's "Agent comment signing" rule): Claude-driven
# changes are attributed via a `Co-Authored-By: Claude Sonnet 5` trailer on
# the commit, same as every other Claude Code session against this repo, not
# via a distinct git identity.
git config --global user.name "David Driscoll"
git config --global user.email "david.driscoll@gmail.com"
# Auth: `github-token`, the estate's own GitHub App installation token
# (kubernetes/apps/kube-system/secrets/github-app-token/), mounted below by
# ../helmrelease.yaml at /var/run/secrets/github-token/token -- as a VOLUME,
# deliberately, not the plain env var most other consumers in this repo use.
# That token is re-minted every 30m against a 60m life; an env var sourced
# via `secretKeyRef` is resolved ONCE at pod start and never updates without
# a pod restart, which is fine for the short-lived Jobs that pattern usually
# feeds (../../coder/renovate/renovatejob.yaml explains why there) and wrong
# here -- this pod's tmux/Claude Code session is meant to run for days. A
# volume mount updates its file content in place as the Secret rotates, so
# reading it fresh on every `git` invocation, rather than once, is what
# keeps `git push` working three days into an agent session instead of one
# hour into it. `x-access-token` is GitHub's own fixed username for App
# installation tokens over HTTPS -- not a placeholder.
# Single-quoted ON PURPOSE. `$(cat ...)` must stay literal here and be
# evaluated by git's OWN shell each time it invokes this helper, not
# expanded once by this script at config-time -- that lazy re-read on every
# invocation is the entire point (see the comment above).
# shellcheck disable=SC2016
git config --global credential."https://github.com".helper \
  '!f() { echo username=x-access-token; echo "password=$(cat /var/run/secrets/github-token/token)"; }; f'

echo "==> cloning home-operations"
# The working checkout the agent actually operates against, pre-seeded here
# so a fresh session does not start by asking someone to clone it by hand.
# /root/home-operations sits on the persistent `home` PVC
# (../helmrelease.yaml's `persistence.home`), so the clone is a one-time
# cost -- every restart after the first takes the fetch branch below.
#
# HTTPS, not SSH: the credential helper configured just above is this pod's
# ONLY GitHub auth (no ssh key is mounted anywhere, and no known_hosts is
# seeded), and it answers for `https://github.com` alone.
#
# Deliberately NOT fatal. `set -euo pipefail` is in force, so an unguarded
# failure here would take the whole pod into CrashLoopBackOff over a
# transient GitHub outage or an expired token -- and agentboard's actual job
# (serving the terminal UI, below) does not depend on this checkout
# existing. A warning in the pod log, with `git` still usable from the
# agent's own pane to retry by hand, is the right failure mode.
if [ ! -d /root/home-operations/.git ]; then
  git clone https://github.com/david-driscoll/home-operations.git \
    /root/home-operations \
    || echo "WARNING: clone of home-operations failed; continuing without it"
else
  # `fetch`, NOT `pull`. This checkout survives restarts, so it may well be
  # sitting on an agent's in-progress branch with uncommitted work; fetching
  # refreshes origin/* without touching the working tree, the current
  # branch, or anything an agent left mid-task.
  git -C /root/home-operations fetch --prune origin \
    || echo "WARNING: fetch of home-operations failed; checkout may be stale"
fi

# `locked = true` in ../resources/mise.toml means this resolves ONLY through
# ../resources/mise.lock's pinned checksums/URLs -- see that file's header
# for how to regenerate it after a version bump.
#
# The two references to MISE_CONFIG_DIR below are DOUBLE-DOLLAR-escaped
# (bash sees a normal single-dollar expansion once Flux is done) -- this
# whole script is also a configMapGenerator input (../kustomization.yaml),
# and components/common's substituteFrom patch scans the RAW TEXT of every
# generated ConfigMap for a dollar-brace pattern at BUILD time, comments
# included. MISE_CONFIG_DIR is meant to expand at RUNTIME instead, from
# ../helmrelease.yaml's pod env -- an unescaped reference here looks
# identical to a Flux substitution to that patch, and since MISE_CONFIG_DIR
# is never one of the actual cluster-secrets/shared-secrets variables,
# strict mode hard-fails the whole Kustomization with `variable not set
# (strict mode): "MISE_CONFIG_DIR"`. Confirmed live TWICE: once for the
# unescaped functional references (fixed first), and once more for this
# very explanation, which named the broken pattern by writing it out
# unescaped in prose -- Flux's scan does not know a comment from code, so
# read this whole block as a warning not to reintroduce either mistake, and
# double-escape any future dollar-brace example added here too. `$$` is
# Flux's own escape for a literal `$` in its output.
echo "==> mise install (config: $${MISE_CONFIG_DIR}/config.toml)"
mise trust "$${MISE_CONFIG_DIR}/config.toml"
mise install

# THEN THE REPO'S OWN TOOLS, which are a DIFFERENT SET from the one above.
# ../resources/mise.toml pins the ~11 things the pod itself needs to boot
# (node, kubectl, pulumi, gh, claude code, agentboard). The checkout's
# .config/mise.toml pins the ~33 this repo's work needs -- hk, flate, biome,
# yamllint, actionlint, shellcheck, typos, python, graphify and the rest.
# Only the first was ever installed, and the gap was invisible because both
# configs are trusted, so `mise ls --current` lists all 33 and marks most
# "(missing)" rather than erroring.
#
# What that cost, concretely: `hk install --mise` in the repo's
# [hooks].postinstall could never run, so NO git hooks were registered and
# every check in .config/hk.pkl was inactive in this pod -- detect-private-key
# and check-added-large-files included, in a repo whose CLAUDE.md warns never
# to commit plaintext credentials. `graphify hook install` failed the same way,
# and both printed a bare `not found` + exit 127 on every `mise install` an
# agent ran for some unrelated tool.
#
# THE WHOLE SET, not a curated subset. A hand-picked "just what the hooks need"
# list is a second inventory that drifts from .config/mise.toml the first time
# a hk step gains a tool -- and lockfile/pin drift is already this estate's
# recurring bug (see that file's `locked = true` note). One list cannot drift.
# The cost is a slower FIRST boot and a few GB; both are one-time, because
# ~/.local/share/mise is on the /root PVC and a restart with tools already
# there is a no-op.
#
# NON-FATAL on purpose. This script is `set -euo pipefail`, and a bare
# `mise install` here would turn one bad pin -- a yanked release, an upstream
# 404, a lockfile that Renovate bumped without regenerating -- into a pod that
# cannot start at all. A pod with an incomplete toolchain is recoverable from
# the terminal; a pod stuck in CrashLoopBackOff is not.
echo "==> mise install (repo: /root/home-operations/.config/mise.toml)"
if ! (cd /root/home-operations && mise install); then
  echo "WARNING: repo mise install failed; some tooling and git hooks may be missing." >&2
  echo "         Investigate with: cd /root/home-operations && mise ls --current" >&2
fi

# PRUNE WHAT THE INSTALLS ABOVE SUPERSEDED. `mise install` only ever adds: a
# Renovate bump to a pin installs the new version beside the old one and
# nothing removes the old one. On 2026-09-12 the 20Gi /root PVC reached 100%
# holding six claude-code versions, five agentboard, four graphify and three
# pulumi (~200-300M each), plus a 1.9G npm cache -- and the pod crash-looped
# at `git config` above, which cannot write ~/.gitconfig.lock on a full disk.
# The trigger was simply the next claude-code bump rolling the pod.
#
# `mise prune` deletes every installed version that is not the one pinned by
# some config in ~/.local/state/mise/tracked-configs. That set includes each
# agent worktree's .config/mise.toml, so a long-lived worktree on an old
# branch keeps ITS pins alive until the worktree is removed -- intended, since
# that worktree may still be in use. Links to configs that no longer exist
# (removed worktrees) are pruned too, which is what releases their pins.
#
# `mise cache prune` and `npm cache clean` drop download caches only; the next
# install re-fetches what it needs. Everything here is NON-FATAL for the same
# reason the repo install above is: housekeeping must never be the thing that
# keeps the pod from starting.
echo "==> pruning superseded tool versions and caches"
mise prune --yes || echo "WARNING: mise prune failed; old tool versions remain on the PVC" >&2
mise cache prune || true
npm cache clean --force >/dev/null 2>&1 || true

# NO TMUX SESSION IS CREATED HERE, and that is a deliberate reversal. This
# used to be
#
#   if ! tmux has-session -t main 2>/dev/null; then
#     tmux new-session -d -s main -n shell
#   fi
#
# carrying the comment "agentboard polls for windows, it does not start the
# server itself". That premise was wrong, and believing it cost the UI its
# kill button.
#
# WHAT IT COST. agentboard tags every window it can see `managed` or
# `external` and REFUSES to kill an external one -- "Cannot kill external
# sessions". Classification is by tmux SESSION NAME: anything under
# `agentboard` is managed, anything else is not. `main` was ours, so every
# window in it was permanently unkillable from the phone. Ten failed attempts
# are recorded in ~/.agentboard/agentboard.log.
#
# WHY THE PREMISE WAS WRONG. Verified 2026-09-06 rather than reasoned about:
# agentboard was run against a completely empty TMUX_TMPDIR -- its own HOME
# and port as well, so the live server was never touched -- and it started a
# tmux server there on its own, creating its `agentboard` session in it. The
# bootstrap was never load-bearing. What it actually did was guarantee that
# the first session on the socket was one agentboard would not manage.
#
# The giveaway had been sitting in ~/.agentboard/tmux-server.pid the whole
# time: it pointed at the pid of OUR `tmux new-session`, not at a server
# agentboard had spawned. Adoption, not creation -- which reads identically
# from the outside until you take the bootstrap away.
#
# A terminal now opens into agentboard's own root window, in its own session,
# which it will kill on request like any other.


# NO CLAUDE SESSION IS AUTO-STARTED FROM SCRATCH, EITHER. This used to be
#
#   tmux send-keys -t main:claude "mise exec -- claude" C-m
#
# and that line is what made every pod restart lose the thread. A restart
# kills the tmux server and every process in it, so `has-session` always
# missed and this always ran -- minting a BRAND-NEW Claude Code session each
# time. The previous session was not gone (its transcript is on the home PVC
# under /root/.claude, which is exactly what that PVC is for), but nothing
# ever went back for it, so from the outside a restart looked like amnesia.
#
# tmux cannot fix that for us: the claude PROCESS is dead, only its
# transcript survives, and there is no attach-to-a-dead-pid. Resuming is a
# decision with a choice in it -- which session -- so it belongs to whoever
# opens the terminal, not to a boot script guessing. From any agentboard
# pane:
#
#   claude --continue    # pick the most recent session in this directory
#   claude --resume      # choose from the list of past sessions
#   claude               # start fresh -- IN ITS OWN GIT WORKTREE
#
# That last one is not quite plain `claude`. ../resources/bashrc wraps a
# BARE invocation to add `--worktree`, so two panes never end up editing
# /root/home-operations at the same time -- which has already happened once,
# and is written up in that file. Anything with arguments passes through
# untouched, so the two resume forms above still land in the directory their
# transcripts belong to.
#
# Plain `claude`, no `mise exec --` prefix needed any more: ../resources/bashrc
# puts the mise shims back on PATH for the login shells tmux hands out. See
# that file for what /etc/profile was doing to them.

# RESUME THE MOST RECENT SESSIONS, IN AGENTBOARD'S OWN TMUX SESSION.
#
# Not a reversal of the "nothing is started on purpose" block above -- read
# both. That block warns against starting a BRAND-NEW session every boot,
# minting a fresh id and orphaning the transcript that mattered. This starts
# no new sessions: it reattaches to specific existing ids and does nothing
# when there are none, so a fresh PVC still comes up with nothing but
# agentboard's own root window.
#
# WHY THE WINDOWS GO IN `agentboard`, which is the whole reason this runs down
# here in the background rather than earlier in this script. agentboard tags
# every window it can see as `managed` or `external`, and REFUSES to kill an
# external one -- "Cannot kill external sessions". Classification is by tmux
# SESSION NAME: anything under `agentboard` is managed, anything else is not.
# Ten failed kill attempts in ~/.agentboard/agentboard.log are what surfaced
# this, back when the bootstrap above still created a `main` session for these
# windows to land in.
#
# Verified live 2026-09-05 rather than assumed: a window created with a plain
# `tmux new-window -t agentboard` -- no agentboard involvement at all -- came
# back from GET /api/sessions as `source=managed`, while every `main:@N`
# window reported `external`. So placing them here is sufficient; they do not
# have to be launched BY agentboard to be killable.
#
# Hence the wait: agentboard creates that session itself, a few seconds after
# this script execs it, so there is nothing to attach to until it does. The
# subshell backgrounds so `exec` below still replaces this process as PID 1.
#
# NAMES, PATHS AND ORDERING COME FROM agentboard's OWN DATABASE, not from the
# transcript directory. ~/.claude/projects/<slashes-as-dashes>/ is a lossy
# encoding -- `-root-home-operations` could be /root/home-operations or
# /root/home/operations, and this repo has a literal hyphen -- whereas
# agent_sessions carries `project_path` verbatim, `display_name` as the UI
# shows it (`pure-star`, not `a882e2df`), and `last_activity_at` for a
# truthful "most recent". A row with no project_path, or one pointing at a
# directory that no longer exists (a removed worktree), is skipped rather than
# resumed into the wrong place.
#
# `$$` throughout is Flux's escape for a literal `$`; `$(...)` needs none.
# See the mise block above for the warning this follows.
AGENTBOARD_RESUME_SESSIONS="$${AGENTBOARD_RESUME_SESSIONS:-3}"
# `-` not `:-`: unset gets the default, explicitly EMPTY means resume in
# silence. That is the off switch and it needs no rebuild. No single quotes in
# it -- it is interpolated into a single-quoted `bash -lc` string below.
AGENTBOARD_RESUME_PROMPT="$${AGENTBOARD_RESUME_PROMPT-continue from where you left off}"

if [ "$$AGENTBOARD_RESUME_SESSIONS" -gt 0 ] 2>/dev/null; then
(
  # agentboard creates its session shortly after start; give it a minute.
  i=0
  while [ "$$i" -lt 60 ]; do
    tmux has-session -t agentboard 2>/dev/null && break
    i=$((i + 1))
    sleep 1
  done
  tmux has-session -t agentboard 2>/dev/null || {
    echo "==> agentboard tmux session never appeared; not resuming"
    exit 0
  }

  db=/root/.agentboard/agentboard.db
  [ -f "$$db" ] || exit 0

  # ONLY IN-PROGRESS SESSIONS. A session the UI has moved to History is one
  # someone has finished with, and resurrecting it every boot is noise -- worse,
  # it competes for the N slots with the sessions that were actually mid-task.
  #
  # THE PREDICATE IS agentboard's OWN, not one invented here. Read off the
  # prepared statements in its bundle (0.4.27, `bin/agentboard`), which is also
  # what the sidebar groups by:
  #
  #   active       current_window IS NOT NULL
  #   hibernating  current_window IS NULL AND is_pinned = 1
  #   history      current_window IS NULL AND is_pinned = 0
  #
  # So `NOT (current_window IS NULL AND is_pinned = 0)` is exactly "not in
  # History", and it covers BOTH remaining states -- which matters, because
  # which one a restarted session is sitting in is a RACE. This block runs the
  # moment `tmux has-session -t agentboard` succeeds, and agentboard's own
  # startup reconcile -- the pass that notices the pre-restart `current_window`
  # values point at windows the dead tmux server took with it, and rewrites them
  # to hibernating -- may or may not have run yet. Before it: stale
  # `current_window`, non-NULL, kept. After it: `is_pinned = 1`, kept. Either
  # way the row survives the filter and the answer does not depend on who won.
  #
  # `is_pinned` is a hibernation marker here, NOT the UI's pin: agentboard sets
  # it on any window that goes away on its own (`orphanSession` defaults to
  # `hibernate: true`) and clears it on the two paths that mean "I am done with
  # this" -- Move to History, and killing the window from the UI. That second one
  # is why a killed session stays dead across a restart instead of coming back.
  #
  # Read-only, and tab-separated so a display_name with spaces survives.
  DB="$$db" N="$$AGENTBOARD_RESUME_SESSIONS" bun -e '
    import { Database } from "bun:sqlite";
    const db = new Database(process.env.DB, { readonly: true });
    const n = parseInt(process.env.N, 10);
    const rows = db.query(
      "SELECT session_id, display_name, project_path FROM agent_sessions " +
      "WHERE project_path IS NOT NULL AND project_path != \x27\x27 " +
      "AND NOT (current_window IS NULL AND is_pinned = 0) " +
      "ORDER BY last_activity_at DESC LIMIT ?1").all(n);
    for (const r of rows) console.log([r.session_id, r.display_name, r.project_path].join("\t"));
  ' 2>/dev/null | while IFS="$$(printf '\t')" read -r id name path; do
      [ -n "$$id" ] || continue
      if [ ! -d "$$path" ]; then
        echo "==> skipping $$name: $$path is gone"
        continue
      fi
      # tmux window names cannot contain ':' or '.'; fall back to the id.
      wname=$(printf '%s' "$${name:-$$id}" | tr ':.' '__' | cut -c1-24)
      [ -n "$$wname" ] || wname="$${id%%-*}"
      cmd="claude --resume $$id"
      if [ -n "$$AGENTBOARD_RESUME_PROMPT" ]; then
        cmd="$$cmd \"$$AGENTBOARD_RESUME_PROMPT\""
      fi
      echo "==> resuming $$wname ($${id%%-*}) in $$path"
      # A login shell, so ./bashrc restores the mise shims on PATH. The
      # `claude` wrapper there passes arguments through untouched, so this
      # resumes in place instead of being rewritten into a new worktree.
      tmux new-window -d -t agentboard -n "$$wname" -c "$$path" \
        "exec bash -lc '$$cmd'"
    done
) &
fi

echo "==> starting agentboard on :4040"
exec agentboard --port 4040 --hostname 0.0.0.0
