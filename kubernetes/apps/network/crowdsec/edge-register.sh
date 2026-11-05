#!/usr/bin/env bash
# Registers what the LAPI's own entrypoint cannot: the netbird-edge hosts'
# machines, and the LAPI-side allowlist of internal networks.
#
# Started in the background by the crowdsec-lapi container's command
# (helmrelease.yaml postRenderers), before the chart's entrypoint. It waits for
# the LAPI to answer, then:
#
#   - for every EDGE_MACHINE_PASSWORD_<name> in the environment (lapi.envFrom,
#     the crowdsec-netbird-edge Secret), adds machine <name> with that
#     password, --force so a changed password is applied. <name> is the host's
#     tailnet name with underscores for dashes, the same as its bouncer's
#     (BOUNCER_KEY_<name>, which the entrypoint already registers).
#     These are pre-provisioned identities for internet-facing hosts
#     (components/netbird/crowdsec.ts); the auto-registration token stays here.
#   - creates the `driscoll-internal-networks` allowlist and adds every CIDR in
#     EDGE_ALLOWLIST_CIDRS (values.yaml). The agents' s01-whitelist postoverflow
#     drops those addresses on each agent; this drops them at the LAPI too, for
#     an alert from an agent that did not (an edge host is internet-facing),
#     and for blocklist and manual decisions alike. CrowdSec >= 1.6.8.
#
# Never fails the pod: every step logs and carries on. Grep the LAPI log for
# CROWDSEC_EDGE_REGISTER to see what it did.
#
# Shipped in a ConfigMap with Flux substitution disabled
# (kustomization.yaml), so the shell expansions below reach bash untouched.
set -uo pipefail

log() { echo "CROWDSEC_EDGE_REGISTER: $*"; }

ALLOWLIST=driscoll-internal-networks

for _ in $(seq 1 120); do
  cscli lapi status >/dev/null 2>&1 && break
  sleep 5
done
if ! cscli lapi status >/dev/null 2>&1; then
  log "the LAPI never answered; nothing registered"
  exit 0
fi

for var in $(compgen -A variable | grep '^EDGE_MACHINE_PASSWORD_' || true); do
  machine=${var#EDGE_MACHINE_PASSWORD_}
  password=${!var}
  if [ -z "$password" ]; then
    log "machine $machine: empty password, skipped"
    continue
  fi
  # -f /dev/null: write no credentials file; the password goes on the command
  # line only inside this container.
  if cscli machines add "$machine" --password "$password" --force -f /dev/null >/dev/null 2>&1; then
    log "machine $machine registered"
  else
    log "machine $machine FAILED to register"
  fi
done

if ! cscli allowlists inspect "$ALLOWLIST" >/dev/null 2>&1; then
  if cscli allowlists create "$ALLOWLIST" -d "Never ban cluster, LAN or tailnet addresses (edge-register.sh)" >/dev/null 2>&1; then
    log "allowlist $ALLOWLIST created"
  else
    log "allowlist $ALLOWLIST FAILED to create"
  fi
fi
for cidr in ${EDGE_ALLOWLIST_CIDRS:-}; do
  # An entry already present is reported and skipped by cscli; either way the
  # outcome is the same, so only the exit status is logged.
  if cscli allowlists add "$ALLOWLIST" "$cidr" -d "internal network" >/dev/null 2>&1; then
    log "allowlist $ALLOWLIST: $cidr"
  else
    log "allowlist $ALLOWLIST: $cidr not added (already present?)"
  fi
done
log "done"
