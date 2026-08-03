#!/usr/bin/env bash
# Forgejo — pre-compose seed. DockgeLxc runs init.sh on every deploy, so this
# must be idempotent. It is: mkdir -p plus a non-recursive chown.
#
# Why the chown is needed at all: DockgeLxc's own `chown -R` pass (driven by
# the `user:` key in compose.yaml) runs BEFORE init.sh in the deploy graph, so
# on the very first deploy the directories this script creates would otherwise
# be left root-owned and the rootless container could not write to them.
# Non-recursive is enough — everything inside is created by uid 1000, and the
# recursive pass covers any strays on the next deploy.
set -euo pipefail

DATA_DIR="/opt/stacks-data/forgejo"

mkdir -p "${DATA_DIR}/data" "${DATA_DIR}/config"
chown 1000:1000 "${DATA_DIR}" "${DATA_DIR}/data" "${DATA_DIR}/config"

echo "[forgejo] init complete."
