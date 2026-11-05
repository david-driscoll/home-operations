#!/bin/bash
set -euo pipefail

# Restart the relay when, and only when, its certificate files have changed.
#
# netbirdio/relay reads NB_TLS_CERT_FILE and NB_TLS_KEY_FILE once, at start
# (encryption.LoadTLSConfig, v0.82.0), and never again. The files reach the
# container as a bind mount, so a renewal changes nothing about the compose
# service, and the `docker compose up -d` that DockgeLxc runs after this script
# would leave the old certificate in memory until it expired. The same trap,
# and the same fix, as docker/_common/traefik/init.sh.
#
# Hash-guarded because DockgeLxc runs init.sh on every `pulumi up`
# (`triggers: [Date.now()]`): an unconditional restart would drop every relayed
# connection on every run. A renewal reaches these files when stacks/unifi-network
# has copied cert-manager's new Secret into OpenBao and the next run of this
# stack renders it.

HASH_FILE=/opt/stacks-data/netbird-relay/.tls.sha256

NEW_HASH=$(cat tls/tls.crt tls/tls.key | sha256sum | awk '{print $1}')
OLD_HASH=$(cat "$HASH_FILE" 2>/dev/null || true)

if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  echo "Relay certificate unchanged; leaving the running container alone."
  exit 0
fi

# Recorded before the restart, so a relay that will not come back is surfaced
# once rather than bounced on every later run.
mkdir -p /opt/stacks-data/netbird-relay
printf '%s' "$NEW_HASH" > "$HASH_FILE"

if docker ps -q --filter name=^netbird-relay$ --filter status=running | grep -q .; then
  echo "Relay certificate changed; restarting so the new one is loaded."
  docker restart netbird-relay
else
  echo "Relay certificate changed; container not running, compose will start it."
fi
