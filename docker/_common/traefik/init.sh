#!/bin/bash
set -euo pipefail

# Restart Traefik when, and ONLY when, its STATIC configuration has changed.
#
# WHY THIS EXISTS. `experimental`, `entryPoints`, `providers` and
# `certificatesResolvers` in ./config.yaml are static configuration: Traefik
# reads the file once, at process start, and never again. The file reaches the
# container as a bind mount, so changing it changes nothing about the compose
# service definition -- and `docker compose up -d`, which is what DockgeLxc runs
# after this script, will NOT recreate a container whose definition is
# unchanged. The new file sits on disk and the old config stays in memory.
#
# That is not theoretical. On 2026-09-05 the sablier plugin was added to
# ./config.yaml, Pulumi copied the file to all four hosts, every stack that
# needed it was deployed -- and Traefik kept running with an 18-hour-old
# process. Every router referencing the plugin was dropped:
#
#   ERR error="plugin: unknown plugin type: sablier" routerName=librespeed@docker
#
# which Gatus saw as a 404 on the speedtest endpoints across celestia and luna.
# The Kubernetes side gets this right by accident -- its values.yaml lives in a
# ConfigMap whose checksum rolls the Deployment -- so the trap is specific to
# the Dockge hosts.
#
# WHY IT IS GUARDED BY A HASH. DockgeLxc runs init.sh with `triggers:
# [Date.now()]`, i.e. on EVERY `pulumi up`, not only when this stack's files
# change (components/DockgeLxc.ts, the `-init` remote.Command). An unconditional
# restart here would bounce ingress on all four hosts every single run, which is
# considerably worse than the problem it fixes.
#
# NOT the dynamic configuration. ./dynamic/ is served by the file provider with
# `watch: true`, so middleware and router changes there are picked up live and
# must NOT trigger a restart. Only config.yaml is hashed, deliberately.
#
# `docker restart` rather than `rm -f` + recreate: the process is replaced and
# re-reads the mount, which is all that is required, and the container, its
# name and its published ports survive. The subsequent `docker compose up -d`
# is then a no-op.

HASH_FILE=/opt/stacks-data/traefik/.static-config.sha256

NEW_HASH=$(sha256sum config.yaml | awk '{print $1}')
OLD_HASH=$(cat "$HASH_FILE" 2>/dev/null || true)

if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  echo "Traefik static config unchanged; leaving the running container alone."
  exit 0
fi

# Record the new hash BEFORE restarting. If the restart fails, the next run
# should not silently retry a bounce on every subsequent `pulumi up` -- a
# Traefik that will not come back is a problem to surface, not to loop on.
mkdir -p /opt/stacks-data/traefik
printf '%s' "$NEW_HASH" > "$HASH_FILE"

# On the very first run after this script lands there is no hash file, so this
# fires once per host. That is intended: it is the only thing that guarantees
# the config currently on disk is the config actually loaded.
if docker ps -q --filter name=traefik --filter status=running | grep -q .; then
  echo "Traefik static config changed; restarting so the new config is read."
  docker restart traefik
else
  echo "Traefik static config changed; container not running, compose will start it."
fi
