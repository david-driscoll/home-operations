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

# `locked = true` in ../resources/mise.toml means this resolves ONLY through
# ../resources/mise.lock's pinned checksums/URLs -- see that file's header
# for how to regenerate it after a version bump.
echo "==> mise install (config: ${MISE_CONFIG_DIR}/config.toml)"
mise trust "${MISE_CONFIG_DIR}/config.toml"
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
