#!/usr/bin/env bash
# append-layer.sh <out-dir> <base-ref@digest> <target-ref> -- publish the image
# without a Docker daemon: tar what ./bake.sh laid out in <out-dir> into one
# layer and push <base> + that layer as <target>, with crane (already logged
# in to the target registry). The same reasoning as
# ../pulumi-workspace/append-layer.sh: the forge's job containers have no
# Docker socket, and appending a layer is plain file I/O and an HTTP upload.
#
# The base's config is kept as it is (node:24-alpine: user `node` is uid
# 1000); the CronJob names the command, `node /app/src/main.ts`.
set -euo pipefail

out="${1:?usage: append-layer.sh <out-dir> <base-ref@digest> <target-ref>}"
base="${2:?usage: append-layer.sh <out-dir> <base-ref@digest> <target-ref>}"
target="${3:?usage: append-layer.sh <out-dir> <base-ref@digest> <target-ref>}"

test -f "$out/app/src/main.ts" || { echo "append-layer.sh: no $out/app/src/main.ts; run bake.sh first" >&2; exit 1; }

layer="$(mktemp -d)/layer.tar.gz"
# Root-owned and world-readable, nothing writable: the pod runs as uid 1000
# with a read-only root filesystem and only ever reads /app.
tar --create --gzip --file "$layer" --directory "$out" \
  --owner=0 --group=0 --numeric-owner --mode='u+rwX,go+rX,go-w' --sort=name \
  app
ls -l "$layer"

crane append --platform linux/amd64 --base "$base" --new_layer "$layer" --new_tag "$target"
