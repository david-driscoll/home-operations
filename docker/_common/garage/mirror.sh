#!/bin/sh
# Mirror the in-cluster Garage instances' backed-up buckets into this cluster.
#
# Source: /staging (/data/staging/garage/ on the host) — the local mirror tree
# backrest's pre-sync hooks maintain for every GarageBucket annotated
# `driscoll.dev/backup: "true"`, across both k8s Garage instances
# (garage-system and coder/forgejo-garage; the scan is
# stacks/applications/kubernetes-backups.ts). Destination: the `garage-mirror`
# bucket, through this node's own S3 API, replicated ×3 by the cluster.
#
# ACTIVE ONLY WHERE /gstate/mirror.env EXISTS. stacks/system (garage.ts)
# writes it to celestia alone — the only host with a staging tree — and its
# absence is this loop's signal to idle: an idle cycle still writes an "ok"
# status (the container healthcheck must hold on all three nodes) but pushes
# NO heartbeat, because only celestia has a Gatus endpoint expecting one
# (stacks/backups/index.ts).
#
# NOTE FOR EDITORS: this file is run through the Pulumi variable substitution
# in components/DockgeLxc.ts. Do not introduce shell variables named host,
# hostname, ipAddress, searchDomain, APP, STACK_NAME, CLUSTER_*, DOCKGE_NAME,
# TIMEZONE, or UPTIME_API_URL — those tokens are rewritten in transit.
set -eu

interval="${GARAGE_MIRROR_INTERVAL_SECONDS:-21600}"
bucket="${GARAGE_MIRROR_BUCKET:?GARAGE_MIRROR_BUCKET is not set}"
creds_file=/gstate/mirror.env
state_dir=/gstate/mirror-state
status_file="${state_dir}/.last-run"

uptime_url="${GARAGE_MIRROR_UPTIME_URL:-}"
uptime_token="${GARAGE_MIRROR_UPTIME_TOKEN:-}"

report() {
  [ -n "$uptime_url" ] && [ -n "$uptime_token" ] || return 0
  wget -q -T 15 -O /dev/null \
    --header="Authorization: Bearer ${uptime_token}" \
    --post-data="" \
    "${uptime_url}/api/v1/endpoints/${uptime_token}/external?success=$1" \
    || echo "[mirror] WARN: could not report success=$1 to uptime" >&2
}

mkdir -p "$state_dir"

echo "[mirror] every ${interval}s, /staging -> garage:${bucket} (active only where ${creds_file} exists)"

while true; do
  stamp=$(date +%Y%m%dT%H%M%S)

  if [ ! -f "$creds_file" ]; then
    # Not the mirror node (or the ceremony has not reached step 4 yet). Idle
    # is a healthy state here and must read as one — but say so occasionally
    # rather than silently, because on CELESTIA this same line means the
    # credential delivery is missing.
    echo "[mirror] idle: ${creds_file} does not exist — not the mirror node, or stacks/system has not delivered the key"
    printf '%s ok idle\n' "$(date +%s)" >"$status_file"
    sleep "$interval"
    continue
  fi

  set -a
  # shellcheck disable=SC1090
  . "$creds_file"
  set +a

  # An empty source is never a legitimate mirror run: staging vanishing (a
  # backrest rebuild, a bad mount) would otherwise sync to an empty tree and
  # DELETE the entire mirror while reporting success. Refuse and page instead.
  if [ -z "$(ls -A /staging 2>/dev/null)" ]; then
    echo "[mirror] ERROR: /staging is empty — refusing to sync (a mirror of nothing is a delete of everything)" >&2
    printf '%s failed %s\n' "$(date +%s)" "$stamp" >"$status_file"
    report false
    sleep "$interval"
    continue
  fi

  if rclone sync /staging "garage:${bucket}" --s3-no-check-bucket; then
    echo "[mirror] cycle ${stamp} ok"
    printf '%s ok %s\n' "$(date +%s)" "$stamp" >"$status_file"
    report true
  else
    echo "[mirror] ERROR: rclone sync failed" >&2
    printf '%s failed %s\n' "$(date +%s)" "$stamp" >"$status_file"
    report false
  fi

  sleep "$interval"
done
