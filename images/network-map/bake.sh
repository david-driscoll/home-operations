#!/usr/bin/env bash
# bake.sh <repo-root> <out-dir> -- lay out the network-map collector's image
# filesystem under <out-dir>, ready for ./append-layer.sh:
#
#   <out-dir>/app/package.json     this package's (type: module)
#   <out-dir>/app/src/**.ts        the collector, tests left out; Node strips the types
#   <out-dir>/app/node_modules/    neo4j-driver and its dependencies, from the ROOT lockfile
#
# Unlike ../pulumi-workspace/bake.sh this does not run inside the base image:
# the layer is plain JavaScript (neo4j-driver has no native code), so any
# Node with the repo's npm builds it, and the workflow runs it on the runner
# with the Node .config/mise.toml pins. Needs node and npm >= 11 (npm 10 does
# not apply the root package.json `overrides` to workspaces and `npm ci`
# refuses this lockfile; see ../pulumi-workspace/bake.sh).
set -euo pipefail

root="$(cd "${1:?usage: bake.sh <repo-root> <out-dir>}" && pwd)"
out="${2:?usage: bake.sh <repo-root> <out-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

npm_major="$(npm --version | cut -d. -f1)"
if [ "$npm_major" -lt 11 ]; then
  echo "bake.sh: npm $(npm --version) is too old; this lockfile needs npm 11 or newer" >&2
  exit 1
fi

# Only ./inputs.sh's files, so nothing outside them can reach the image.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
(cd "$root" && "$here/inputs.sh" "$root" | while IFS= read -r file; do
  install -D -m 0644 "$file" "$stage/$file"
done)

# Only this workspace's production dependencies, hoisted to $stage/node_modules.
# --ignore-scripts: neo4j-driver needs none, and nothing else is installed.
(cd "$stage" && npm ci --workspace images/network-map --omit=dev --ignore-scripts --no-audit --no-fund)

rm -rf "$out"
install -d "$out/app"
install -m 0644 "$stage/images/network-map/package.json" "$out/app/package.json"
(cd "$stage/images/network-map" && find src -type f -name '*.ts' ! -name '*.test.ts' | while IFS= read -r file; do
  install -D -m 0644 "$file" "$out/app/$file"
done)
cp -R "$stage/node_modules" "$out/app/node_modules"
# The workspace's own link back to itself (node_modules/network-map -> ../images/network-map) points nowhere in the image.
rm -f "$out/app/node_modules/network-map"
find "$out/app/node_modules" -name '.package-lock.json' -delete

test -f "$out/app/node_modules/neo4j-driver/package.json" || { echo "bake.sh: neo4j-driver did not install" >&2; exit 1; }
echo "neo4j-driver $(node -p "require('$out/app/node_modules/neo4j-driver/package.json').version")"
du -sh "$out/app"
