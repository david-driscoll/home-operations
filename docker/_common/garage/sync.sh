#!/bin/sh
# Mirror this node's pg_dump output into its Garage bucket.
#
# The source is /dumps (docker/_common/postgres backup.sh's output, mounted
# read-only); the destination is postgres-<cluster> through THIS node's S3 API
# (rclone remote "garage", configured by env in compose.yaml). `rclone sync` is
# a mirror: the bucket tracks the host's 14-day dump window, deletions
# included, and Garage's replication_factor 3 is what carries the bytes to the
# other two machines — so luna and skystar never push their dumps over the WAN
# themselves.
#
# CREDENTIALS ARE READ EVERY CYCLE from /gstate/rclone.env, which
# stacks/system (garage.ts) writes onto the host (see the garage-sync service
# comment in compose.yaml for why this is a file and not a ref+openbao
# reference). A cycle before that file exists reports failure and tries again
# — bootstrap converges without a container restart, and so does a key
# rotation.
#
# WHY IT REPORTS: same dead-man's-switch shape as backup.sh next door. restic
# and Garage both happily hold a stale mirror forever; the Gatus heartbeat
# expiring is what makes "the sync stopped happening" a page instead of a log
# line. Registered per garage host in stacks/backups/index.ts.
#
# NOTE FOR EDITORS: this file is run through the Pulumi variable substitution
# in components/DockgeLxc.ts. Do not introduce shell variables named host,
# hostname, ipAddress, searchDomain, APP, STACK_NAME, CLUSTER_*, DOCKGE_NAME,
# TIMEZONE, or UPTIME_API_URL — those tokens are rewritten in transit.
set -eu

interval="${GARAGE_SYNC_INTERVAL_SECONDS:-21600}"
bucket="${GARAGE_SYNC_BUCKET:?GARAGE_SYNC_BUCKET is not set}"
creds_file=/gstate/rclone.env
state_dir=/gstate/sync-state
status_file="${state_dir}/.last-run"

uptime_url="${GARAGE_SYNC_UPTIME_URL:-}"
uptime_token="${GARAGE_SYNC_UPTIME_TOKEN:-}"

echo "[sync] every ${interval}s, /dumps -> garage:${bucket}/dumps"
if [ -n "$uptime_url" ] && [ -n "$uptime_token" ]; then
  echo "[sync] reporting to ${uptime_url} as ${uptime_token}"
else
  echo "[sync] WARN: GARAGE_SYNC_UPTIME_URL/TOKEN unset — no failure reporting" >&2
fi

# rclone's image is alpine; busybox wget has --header/--post-data and the TLS
# leg via ssl_client, same as the postgres image. A failed push is only a
# warning — a missing push already reads as failure once the heartbeat expires.
report() {
  [ -n "$uptime_url" ] && [ -n "$uptime_token" ] || return 0
  wget -q -T 15 -O /dev/null \
    --header="Authorization: Bearer ${uptime_token}" \
    --post-data="" \
    "${uptime_url}/api/v1/endpoints/${uptime_token}/external?success=$1" \
    || echo "[sync] WARN: could not report success=$1 to uptime" >&2
}

mkdir -p "$state_dir"

while true; do
  stamp=$(date +%Y%m%dT%H%M%S)
  ok=true

  if [ ! -f "$creds_file" ]; then
    # First-deploy state: the cluster is up but stacks/system has not minted
    # and delivered this node's key yet. Say exactly what is missing.
    echo "[sync] ERROR: ${creds_file} does not exist — run stacks/system (garage.ts writes this node's S3 key); see docs/garage-offsite-s3.md" >&2
    ok=false
  else
    # set -a exports everything the file assigns, so the rclone invocation
    # below sees RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID / _SECRET_ACCESS_KEY
    # without this script naming them.
    set -a
    # shellcheck disable=SC1090
    . "$creds_file"
    set +a

    # Exclusions: in-flight dumps, and backup.sh's own cycle marker — that
    # file is rewritten daily and belongs to the OTHER pipeline's evidence
    # trail. Bare-filename patterns match files, which is exactly right here.
    if rclone sync /dumps "garage:${bucket}/dumps" \
      --exclude "*.tmp" --exclude ".last-run" \
      --s3-no-check-bucket; then
      echo "[sync] cycle ${stamp} ok"
    else
      echo "[sync] ERROR: rclone sync failed" >&2
      ok=false
    fi
  fi

  if [ "$ok" = true ]; then
    printf '%s ok %s\n' "$(date +%s)" "$stamp" >"$status_file"
    report true
  else
    printf '%s failed %s\n' "$(date +%s)" "$stamp" >"$status_file"
    echo "[sync] cycle ${stamp} FAILED" >&2
    report false
  fi

  sleep "$interval"
done
