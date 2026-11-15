#!/usr/bin/env bash
# The `tools` init container (../helmrelease.yaml): install mise and every tool
# ./mise.toml pins onto the home volume. Runs on each start, so a Renovate bump
# to either file lands on the next rollout; a restart with everything already
# installed is a few seconds of no-ops.
#
# Not substituted by Flux (../kustomization.yaml), so plain shell variables are
# safe here.
set -euo pipefail

# Everything below that can be downloaded again lives on the `paseo-toolcache`
# volume (../pvc.yaml), mounted at $PASEO_TOOLCACHE, NOT on the home volume.
# The home volume is under VolSync; these directories were ~38 GiB and ~370k
# files of it, and restic's metadata cache for that many files outgrew its
# volume -- the backup failed `no space left on device` from 2026-11-13.
#
# Symlinks rather than environment variables, so every tool (and every agent's
# own `go`, `npm`, `pulumi`, playwright, ...) follows them without being told.
# Symlinks rather than subPath mounts, because the kubelet creates a missing
# subPath directory as root, which `paseo` then cannot write.
#
# A real directory where a link belongs is the copy from before the move: it
# is all re-downloadable, so delete it rather than spend minutes copying it
# onto the new volume. Only ever a real directory -- a link is left alone.
toolcache="${PASEO_TOOLCACHE:?PASEO_TOOLCACHE is not set}"
for rel in .local/share/mise .cache .npm .pulumi/plugins go/pkg; do
  link="/home/paseo/$rel"
  target="$toolcache/$rel"
  mkdir -p "$target" "$(dirname "$link")"
  if [ -L "$link" ]; then
    [ "$(readlink "$link")" = "$target" ] && continue
    rm -f "$link"
  elif [ -d "$link" ]; then
    echo "==> moving $rel off the backed-up home volume (deleting the old copy)"
    rm -rf -- "$link"
  fi
  ln -s "$target" "$link"
done

mise_bin="$MISE_INSTALL_PATH"
want="${MISE_VERSION#v}"
have="$("$mise_bin" --version 2>/dev/null | awk '{print $1}' || true)"
if [ "$have" != "$want" ]; then
  echo "==> installing mise $want (had: ${have:-none})"
  mkdir -p "$(dirname "$mise_bin")"
  curl -fsSL https://mise.run | MISE_VERSION="v$want" sh
fi

# Node >= 25's official Linux builds -- what mise installs -- link
# libatomic.so.1, which this bookworm image lacks: without it `node` fails to
# load, and with it every `npm:` tool below. There is no root for apt-get
# install, so take the .deb the way ./sshd.sh takes openssh-server: apt as 1000
# into private state (signatures still checked), unpacked onto the home volume.
# LD_LIBRARY_PATH (../helmrelease.yaml) points at it. Kept until a newer one
# lands, so a failed refresh never takes node away.
libatomic_dir=/home/paseo/.local/lib/libatomic
if [ ! -e "$libatomic_dir/libatomic.so.1" ]; then
  echo "==> installing libatomic1 into $libatomic_dir"
  apt_state="$(mktemp -d)"
  mkdir -p "$apt_state/lists/partial" "$apt_state/cache/archives/partial" "$apt_state/debs"
  apt_private() {
    apt-get -o Dir::State::Lists="$apt_state/lists" -o Dir::Cache="$apt_state/cache" \
      -o Debug::NoLocking=1 -o APT::Sandbox::User="$(id -un)" "$@"
  }
  apt_private -qq update
  (cd "$apt_state/debs" && apt_private -qq download libatomic1)
  dpkg-deb -x "$apt_state"/debs/libatomic1_*.deb "$apt_state/root"
  mkdir -p "$libatomic_dir"
  cp -a "$apt_state"/root/usr/lib/x86_64-linux-gnu/libatomic.so.1* "$libatomic_dir/"
  rm -rf "$apt_state"
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

# apm itself installs above; the packages in ./apm.yml are the `apm` sidecar's
# job (./apm-refresh.sh), so the daemon does not wait on them.

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
