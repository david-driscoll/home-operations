#!/usr/bin/env bash
# Hermes Agent — pre-compose seed.
#
# DockgeLxc runs init.sh before `docker compose up` on every deploy
# (components/DockgeLxc.ts uses triggers: [Date.now()], i.e. always), so this
# must be idempotent. It is: every step is guarded.
set -euo pipefail

DATA_DIR="/opt/stacks-data/hermes"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The container starts as root and chowns /opt/data itself via the s6 stage2
# hook (using HERMES_UID/HERMES_GID from compose.yaml), so ownership is not our
# job — but the directory has to exist first, and the workspace subdir needs to
# be there before the agent's first tool call rather than created on demand.
mkdir -p "${DATA_DIR}/workspace"

# Seed config.yaml ONLY on a genuinely fresh volume.
#
# This is a one-way door on purpose. config.yaml is live, self-modifying state:
# `hermes model`, the dashboard settings tab, and the boot-time schema
# migrator (scripts/docker_config_migrate.py; the ladder spans v12 -> v33 at
# the pinned image tag, v12 being upstream's auto-migration support floor and
# 33 the current schema — see config.seed.yaml) all rewrite it. Copying our
# seed over an existing file on every deploy would silently revert David's
# model choice and clobber migrated schema — so if the file exists, we leave it
# completely alone and say so in the log.
if [[ -f "${DATA_DIR}/config.yaml" ]]; then
  echo "[hermes] config.yaml already present — leaving it untouched."
  echo "[hermes] To re-apply the seed, move the existing file aside first."
else
  echo "[hermes] Fresh data volume — seeding config.yaml from config.seed.yaml"
  cp "${SCRIPT_DIR}/config.seed.yaml" "${DATA_DIR}/config.yaml"
  # Match the UID/GID the container remaps its hermes user to (compose.yaml
  # HERMES_UID/HERMES_GID). The stage2 hook would chown this anyway; doing it
  # here keeps the file sane if anyone inspects it before first boot.
  chown 1000:1000 "${DATA_DIR}/config.yaml"
fi

echo "[hermes] init complete."
