#!/usr/bin/env bash
# append-layer.sh <base-ref@digest> <target-ref> -- publish the image without a
# Docker daemon: tar what ./bake.sh wrote in THIS container into one layer and
# push <base> + that layer as <target>.
#
# Run in the container bake.sh just ran in, which must be <base> itself -- the
# Forgejo workflow makes it the job container -- so the layer lands on exactly
# the filesystem it was baked against. Needs `crane`, already logged in to the
# target registry.
#
# This is why the forge's runner needs no change for this image: building a
# Dockerfile needs a Docker daemon or BuildKit, which on these runners means
# either the privileged dind sidecar (root on the node to any job that can reach
# it) or user namespaces plus an unconfined seccomp profile. Appending a layer
# is plain file I/O and an HTTP upload. The config, entrypoint, user and env all
# come from the base unchanged, which is what ./Dockerfile does too.
set -euo pipefail

base="${1:?usage: append-layer.sh <base-ref@digest> <target-ref>}"
target="${2:?usage: append-layer.sh <base-ref@digest> <target-ref>}"

# Every path bake.sh writes. A path missing here is simply not in the image (the
# workspace then downloads it, as before); a path bake.sh no longer writes makes
# tar fail, which is the point.
paths=(
  home/node/.pulumi
  home/node/.npm
  home/node/.npmrc
  opt/npm
  usr/local/bin/npm
  usr/local/bin/npx
  usr/local/bin/vals
)

layer="$(mktemp -d)/layer.tar.gz"
# Numeric owners exactly as on disk: bake.sh chowns /home/node's trees to 1000,
# the uid the workspace pod runs as, and leaves the rest root's.
tar --create --gzip --file "$layer" --directory / --numeric-owner --sort=name "${paths[@]}"
ls -l "$layer"

crane append --platform "linux/$(dpkg --print-architecture)" --base "$base" --new_layer "$layer" --new_tag "$target"
