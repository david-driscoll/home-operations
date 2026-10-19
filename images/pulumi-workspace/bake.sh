#!/usr/bin/env bash
# bake.sh <repo-root> -- fill a ghcr.io/pulumi/pulumi-nodejs container with
# everything a Pulumi operator workspace would otherwise download on every run.
#
# Runs AS ROOT INSIDE the base image, in both places the image is built:
#
#   * ./Dockerfile, for a local `docker build` (RUN bake.sh /tmp/bake-context);
#   * .forgejo/workflows/pulumi-workspace-image.yml, where the job container IS
#     the base image and the files this writes are appended to it as one layer
#     with `crane` -- no Docker daemon involved. ./append-layer.sh lists which
#     paths that layer holds; keep it in step with what this writes.
#
# What it writes, and what each replaces in a workspace run (measured on
# pulumi-kubernetes-operator v2.9.3 workspaces, 2026-10-19):
#
#   /home/node/.pulumi/plugins            every provider plugin the lockfile
#                                         pins (~0.9-1.1 GB, downloaded by the
#                                         engine on first use, every run)
#   /home/node/.pulumi/dynamic_tf_plugins the Terraform providers behind the
#                                         sdks/ packages (~60 MB, every run)
#   /home/node/.npm                       a warm npm cache for this lockfile
#                                         (~100-170 MB, every run)
#   /home/node/.npmrc                     prefer-offline, so that cache is used
#                                         without revalidating each package
#   /opt/npm + /usr/local/bin/{npm,npx}   npm 11 (see NPM_VERSION below)
#   /usr/local/bin/vals                   the ref+openbao:// resolver, which a
#                                         jdxcode/mise init container used to
#                                         install into an emptyDir every run
#
# NOT baked: node_modules. The operator extracts the source into /share, an
# emptyDir mounted over whatever the image has there, and `pulumi install`
# runs `npm install` at that workspace root. With the warm cache it is an
# offline extract (prefer-offline in /home/node/.npmrc), not a
# download -- but it is still ~0.5 GB written to the node's disk per run.
set -euo pipefail

root="$(cd "${1:?usage: bake.sh <repo-root>}" && pwd)"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The workspace user, as the base image and the operator's pod template both
# have it (runAsUser 1000, HOME=/home/node).
user=node
home=/home/node

# npm 11, not the npm 10 the base image ships. Root package.json collapses the
# typescript/@types/node every generated SDK in sdks/ depends on with
# `overrides`, and npm 10 does not apply root overrides to a workspace member's
# own dependencies: on the same lockfile its `npm install` puts eight private
# copies back (8 x 67 MB per run) and `npm ci` refuses the lockfile outright.
# Verified with 10.9.8 and 11.21.1 against this repo on 2026-10-19.
#
# Kept equal to the npm bundled with .config/mise.toml's node pin, which is
# what produced package-lock.json.
# renovate: datasource=npm depName=npm
NPM_VERSION=12.2.0

case "$(dpkg --print-architecture)" in
  amd64) platform=linux-x64 ;;
  arm64) platform=linux-arm64 ;;
  *) echo "bake.sh: unsupported architecture $(dpkg --print-architecture)" >&2; exit 1 ;;
esac

as_user() { runuser -u "$user" -- env HOME="$home" PULUMI_SKIP_UPDATE_CHECK=true "$@"; }

# Retries for anything that crosses the network. Three of the providers come
# from api.github.com (`github://` servers), which allows sixty anonymous
# requests an hour per egress IP -- shared with everything else in the cluster.
retry() {
  local attempt
  for attempt in 1 2 3 4; do
    "$@" && return 0
    echo "bake.sh: attempt ${attempt} failed: $*" >&2
    sleep $((attempt * 15))
  done
  return 1
}

echo "::group::npm ${NPM_VERSION}"
# Its own prefix, then symlinks over the base image's. Installing over
# /usr/local/lib/node_modules/npm in place would need whiteouts in an appended
# layer for every file npm 10 had and npm 11 does not; a new directory plus two
# replaced symlinks needs none.
retry npm install --global --prefix /opt/npm --no-audit --no-fund "npm@${NPM_VERSION}"
ln -sfn /opt/npm/bin/npm /usr/local/bin/npm
ln -sfn /opt/npm/bin/npx /usr/local/bin/npx
npm --version
echo "::endgroup::"

echo "::group::vals"
# URL and checksum from .config/mise.lock, the same pin `mise install` uses on a
# workstation -- so Renovate's mise bump moves this too, checksum included.
vals_asset() {
  awk -v section="[tools.vals.\"platforms.${platform}\"]" '
    $0 == section { f = 1; next }
    /^\[/ { f = 0 }
    f && $1 == "'"$1"'" { gsub(/"/, "", $3); print $3 }
  ' "$root/.config/mise.lock"
}
vals_url="$(vals_asset url)"
vals_sha="$(vals_asset checksum)"
vals_sha="${vals_sha#sha256:}"
if [ -z "$vals_url" ] || [ -z "$vals_sha" ]; then
  echo "bake.sh: no vals entry for ${platform} in .config/mise.lock" >&2
  exit 1
fi
tmp="$(mktemp -d)"
retry curl -fsSL -o "$tmp/vals.tar.gz" "$vals_url"
echo "${vals_sha}  $tmp/vals.tar.gz" | sha256sum -c -
tar -xzf "$tmp/vals.tar.gz" -C "$tmp" vals
install -m 0755 "$tmp/vals" /usr/local/bin/vals
rm -rf "$tmp"
vals version
echo "::endgroup::"

echo "::group::npm cache"
# Only the files ./inputs.sh names, so nothing outside them can reach the image.
stage="$(mktemp -d)"
(cd "$root" && "$here/inputs.sh" "$root" | while IFS= read -r file; do
  install -D -m 0644 "$file" "$stage/$file"
done)
chown -R "$user:$user" "$stage"
install -d -o "$user" -g "$user" "$home/.npm" "$home/.pulumi"
# --ignore-scripts: the cache only needs the tarballs. That also skips the
# SDKs' postinstall `tsc` (no SDK source is staged) and the
# install-pulumi-plugin.js scripts, whose plugins are installed below instead.
(cd "$stage" && retry as_user npm ci --ignore-scripts --no-audit --no-fund)

# The workspace's own npm settings, so a pod needs no env for them.
#   prefer-offline  use a cached tarball or packument without revalidating it
#                   against the registry; only a real cache miss goes out.
#   audit, fund,    each a registry round trip (or a nag) on every
#   update-notifier `npm install`, and nobody reads a workspace's output for them.
install -m 0644 -o "$user" -g "$user" /dev/stdin "$home/.npmrc" <<'NPMRC'
prefer-offline=true
audit=false
fund=false
update-notifier=false
NPMRC
echo "::endgroup::"

echo "::group::plugins"
node "$here/list-plugins.mjs" "$stage/node_modules" | tee "$stage/plugins.txt"
while read -r kind name version rest; do
  case "$kind" in
    resource)
      # `rest` is the optional server URL.
      retry as_user pulumi plugin install resource "$name" "$version" ${rest:+--server "$rest"}
      ;;
    parameterized)
      read -r source tf_version <<<"$rest"
      # The schema itself is thrown away; downloading the Terraform provider
      # into ~/.pulumi/dynamic_tf_plugins is the side effect wanted.
      (cd "$stage" && retry as_user pulumi package get-schema "${name}@${version}" "$source" "$tf_version" >/dev/null)
      ;;
  esac
done <"$stage/plugins.txt"
echo "::endgroup::"

echo "::group::tidy"
rm -rf "$stage" "$home/.npm/_logs" "$home/.pulumi/logs" "$home/.pulumi/workspaces" \
  "$home/.pulumi/credentials.json" /root/.npm
# Plugins are 0700 as pulumi creates them; the pod runs as this same uid.
chown -R "$user:$user" "$home/.npm" "$home/.pulumi"
du -sh "$home/.pulumi/plugins" "$home/.pulumi/dynamic_tf_plugins" "$home/.npm" /opt/npm /usr/local/bin/vals
echo "::endgroup::"
