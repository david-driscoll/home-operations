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
# start the server itself.
if ! tmux has-session -t main 2>/dev/null; then
  tmux new-session -d -s main -n claude
fi

# The long-running Claude Code session agentboard's UI attaches to. `mise
# exec` guarantees this sees the mise-installed `claude`, not a stray one
# from the base image's PATH.
tmux send-keys -t main:claude "mise exec -- claude" C-m

echo "==> starting agentboard on :4040"
exec agentboard --port 4040 --hostname 0.0.0.0
