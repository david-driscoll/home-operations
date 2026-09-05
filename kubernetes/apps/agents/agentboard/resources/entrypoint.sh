#!/usr/bin/env bash
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

# tmux needs a running server before anything can attach a window to it.
# `new-session -d` backgrounds it; agentboard polls for windows, it does not
# start the server itself. The window is a bare login shell -- see the block
# below for why nothing is sent to it.
if ! tmux has-session -t main 2>/dev/null; then
  tmux new-session -d -s main -n shell
fi

# NOTHING IS STARTED IN THAT WINDOW ON PURPOSE. This used to be
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
#   claude               # deliberately start fresh
#
# Plain `claude`, no `mise exec --` prefix needed any more: ../resources/bashrc
# puts the mise shims back on PATH for the login shells tmux hands out. See
# that file for what /etc/profile was doing to them.

echo "==> starting agentboard on :4040"
exec agentboard --port 4040 --hostname 0.0.0.0
