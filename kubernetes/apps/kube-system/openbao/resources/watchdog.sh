#!/usr/bin/env bash
# OpenBao stale-standby watchdog.
#
# THE FAILURE (2026-11-07): openbao-0 stayed unsealed, Running and Ready while
# answering every request it could not serve itself with
#
#   local node not active but active cluster node not found
#
# Its log repeated, about once a second:
#
#   failed to begin streaming invalidations: ... x509: certificate is valid
#   for fw-<A>, not fw-<B>
#
# It held the request-forwarding cert identity of an EARLIER leadership epoch,
# so its TLS dial to the real active node on :8201 could never verify, and it
# never learned who the leader was. DNS was correct, and openbao-1 and
# openbao-2 were healthy. The chart's readiness probe counts any unsealed
# standby as ready, so the pod stayed behind the `openbao` Service and about
# one request in three failed. Deleting the pod fixed it: transit auto-unseal
# brings it back, and a fresh process reads the current leader advertisement.
#
# WHAT THIS DOES: every run, it reads the unauthenticated sys/seal-status and
# sys/leader of each server pod (through the apiserver pod proxy, so the same
# code runs in-cluster and from a laptop) and classifies each pod as one of:
#
#   active    is_self=true
#   standby   unsealed, knows a leader_address
#   stale     unsealed, ha_enabled, NO leader_address  <- the failure above
#   sealed / unreachable   not this job's problem; ignored
#
# It acts only when EVERY probe round agrees that:
#   - exactly one pod is active. With no active node there is nothing for a
#     standby to have gone stale against: that is a whole-cluster outage
#     (Postgres HA lock, seal, network), and restarting pods would only add
#     churn. The job FAILS loudly instead and touches nothing.
#   - the pod was stale in every round. During a normal failover every standby
#     briefly lacks a leader; PROBES x PROBE_INTERVAL rides that out.
#   - its container has been running longer than MIN_AGE_SECONDS, which covers
#     the ~30s leader discovery after a fresh transit unseal.
#
# Then it EVICTS (never deletes) at most ONE stale pod per run. Eviction goes
# through the PodDisruptionBudget (maxUnavailable: 1), so if any other pod is
# already down the API refuses with 429 and nothing happens. The active pod is
# never a candidate.
set -euo pipefail

NAMESPACE="${NAMESPACE:-kube-system}"
SELECTOR="${SELECTOR:-app.kubernetes.io/name=openbao,component=server}"
BAO_PORT="${BAO_PORT:-8200}"
MIN_AGE_SECONDS="${MIN_AGE_SECONDS:-600}"
PROBES="${PROBES:-3}"
PROBE_INTERVAL="${PROBE_INTERVAL:-30}"
DRY_RUN="${DRY_RUN:-false}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

bao_get() {
  kubectl get --raw "/api/v1/namespaces/${NAMESPACE}/pods/${1}:${BAO_PORT}/proxy/v1/${2}" 2>/dev/null
}

pod_state() {
  local pod=$1 seal leader
  if ! seal=$(bao_get "$pod" sys/seal-status); then
    echo unreachable
    return
  fi
  if [[ $(jq -r '.sealed' <<<"$seal") != false ]]; then
    echo sealed
    return
  fi
  if ! leader=$(bao_get "$pod" sys/leader); then
    echo unreachable
    return
  fi
  if [[ $(jq -r '.is_self // false' <<<"$leader") == true ]]; then
    echo active
  elif [[ -n $(jq -r '.leader_address // ""' <<<"$leader") ]]; then
    echo standby
  elif [[ $(jq -r '.ha_enabled // false' <<<"$leader") == true ]]; then
    echo stale
  else
    echo unreachable
  fi
}

# name<TAB>seconds the server container has been running. Pods being deleted,
# or not running yet, are left out entirely.
mapfile -t PODS < <(
  kubectl get pods -n "$NAMESPACE" -l "$SELECTOR" -o json | jq -r '
    .items[]
    | select(.metadata.deletionTimestamp == null and .status.phase == "Running")
    | (.status.containerStatuses // [] | map(select(.state.running)) | first) as $c
    | select($c != null)
    | [.metadata.name, ((now - ($c.state.running.startedAt | fromdateiso8601)) | floor)]
    | @tsv'
)

if ((${#PODS[@]} == 0)); then
  log "no running pods match ${SELECTOR} in ${NAMESPACE}; nothing to check"
  exit 0
fi

declare -A STALE_ROUNDS AGE
for line in "${PODS[@]}"; do
  IFS=$'\t' read -r name age <<<"$line"
  AGE[$name]=$age
  STALE_ROUNDS[$name]=0
done

for ((round = 1; round <= PROBES; round++)); do
  active=0
  summary=""
  for name in "${!AGE[@]}"; do
    state=$(pod_state "$name")
    summary+=" ${name}=${state}"
    case "$state" in
      active) active=$((active + 1)) ;;
      stale) STALE_ROUNDS[$name]=$((STALE_ROUNDS[$name] + 1)) ;;
    esac
  done
  log "round ${round}/${PROBES}:${summary}"

  if ((active != 1)); then
    log "expected exactly one active node, found ${active}."
    log "That is a whole-cluster problem, not a stale standby. Not restarting anything."
    exit 1
  fi
  if ((round < PROBES)); then
    sleep "$PROBE_INTERVAL"
  fi
done

target=""
settling=0
for name in $(printf '%s\n' "${!AGE[@]}" | sort); do
  ((STALE_ROUNDS[$name] == PROBES)) || continue
  if ((AGE[$name] < MIN_AGE_SECONDS)); then
    log "${name} is stale but its container started only ${AGE[$name]}s ago (< ${MIN_AGE_SECONDS}s); leaving it to settle"
    settling=$((settling + 1))
    continue
  fi
  target=$name
  break
done

if [[ -z $target ]]; then
  if ((settling == 0)); then
    log "no stale standby; all healthy"
  fi
  exit 0
fi

log "${target} has been unsealed with no known leader for ${PROBES} rounds while another node is active"
if [[ $DRY_RUN == true ]]; then
  log "DRY_RUN: would evict ${NAMESPACE}/${target}"
  exit 0
fi

# Through the PDB, never a bare delete: a 429 here means another pod is already
# disrupted, and this run backs off rather than taking a second one down.
if kubectl create --raw "/api/v1/namespaces/${NAMESPACE}/pods/${target}/eviction" -f - >/dev/null <<EOF; then
{"apiVersion":"policy/v1","kind":"Eviction","metadata":{"name":"${target}","namespace":"${NAMESPACE}"}}
EOF
  log "evicted ${NAMESPACE}/${target}; the StatefulSet recreates it and transit auto-unseal brings it back"
else
  log "eviction of ${NAMESPACE}/${target} was refused (PDB, or another pod already disrupted); retrying next run"
  exit 1
fi
