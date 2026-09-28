#!/bin/sh
# Off-site copy of the Pulumi state, main Garage cluster -> this alpha-site node.
#
#   mirror/                 hourly `rclone sync` of every stack's checkpoints
#                           (<prefix>/.pulumi/meta.yaml + <prefix>/.pulumi/stacks/**)
#   snapshots/YYYY-MM-DD/   the same set, copied once per UTC day, kept for
#                           BACKUP_SNAPSHOT_RETENTION_DAYS
#
# Garage has no object versioning and the mirror propagates deletes, so the
# dated snapshots are what survive a bad `pulumi up` or an accidental
# `stack rm` being mirrored over the good copy. history/ is deliberately left
# out: it holds a full checkpoint copy per update (gigabytes a day for a stack
# that resyncs every 300s) and pulumi needs none of it to operate.
#
# On every start it also makes sure THIS node is usable -- layout assigned,
# bucket created with its quota, backup key imported and granted -- so the
# stack bootstraps itself from the OpenBao paths .env references. Every step
# checks before it acts; a restart is a no-op.
#
# NOTE FOR EDITORS: this file is run through the Pulumi variable substitution
# in components/DockgeLxc.ts. Do not introduce shell variables named host,
# hostname, ipAddress, searchDomain, APP, STACK_NAME, CLUSTER_*, DOCKGE_NAME,
# TIMEZONE, or UPTIME_API_URL -- those tokens are rewritten in transit.
set -eu

interval="${BACKUP_MIRROR_INTERVAL_SECONDS:-3600}"
keep_days="${BACKUP_SNAPSHOT_RETENTION_DAYS:-30}"
src_bucket=pulumi-state
dst_bucket=pulumi-state-backup
# 5 GiB: the checkpoints are tens of MB, so this only bites on a runaway.
quota_bytes=5368709120
# garage.toml's data_dir capacity, in bytes (Garage counts 1 GB = 10^9).
capacity_bytes=20000000000

admin="${GARAGE_ADMIN_URL:?GARAGE_ADMIN_URL is not set}"
admin_token="${GARAGE_ADMIN_TOKEN:?GARAGE_ADMIN_TOKEN is not set}"
dest_key_id="${BACKUP_DEST_ACCESS_KEY_ID:?BACKUP_DEST_ACCESS_KEY_ID is not set}"
dest_key_secret="${BACKUP_DEST_SECRET_ACCESS_KEY:?BACKUP_DEST_SECRET_ACCESS_KEY is not set}"

state_dir="${BACKUP_STATE_DIR:-/state}"
status_file="$state_dir/.last-run"
snapshot_marker="$state_dir/.last-snapshot"
uptime_url="${BACKUP_UPTIME_URL:-}"
uptime_token="${BACKUP_UPTIME_TOKEN:-}"

log() { echo "[pulumi-state-backup] $*"; }

# Same contract as docker/_common/garage/mirror.sh: $1 = true|false, $2 = a
# fixed, URL-safe reason token when $1 is false. Gatus renders a push with no
# error= as a blank red row, so every failure names itself.
report() {
  [ -n "$uptime_url" ] && [ -n "$uptime_token" ] || return 0
  _query="success=$1"
  if [ "$1" = false ] && [ -n "${2:-}" ]; then
    _query="${_query}&error=$2"
  fi
  wget -q -T 15 -O /dev/null \
    --header="Authorization: Bearer ${uptime_token}" \
    --post-data="" \
    "${uptime_url}/api/v1/endpoints/${uptime_token}/external?${_query}" \
    || log "WARN: could not report success=$1 to uptime" >&2
}

fail() {
  log "ERROR: $1" >&2
  printf '%s failed %s\n' "$(date +%s)" "$1" >"$status_file"
  report false "$1"
}

# --- admin API (v2) over the container network ------------------------------
# busybox wget: exits non-zero on any non-2xx, which is exactly the existence
# test the bootstrap needs. The image has no JSON parser, so fields are pulled
# out with grep/sed -- tolerant of the whitespace Garage pretty-prints with
# (`"version": 0`), which a compact-only pattern would silently never match.
api_get() {
  wget -q -T 15 -O - --header="Authorization: Bearer ${admin_token}" "${admin}/v2/$1"
}
api_post() {
  wget -q -T 15 -O - --header="Authorization: Bearer ${admin_token}" \
    --header="Content-Type: application/json" --post-data="$2" "${admin}/v2/$1"
}
first_field() { # <json> <field> -> first string value of "field"
  printf '%s' "$1" | grep -o "\"$2\": *\"[^\"]*\"" | head -n 1 | sed 's/^[^:]*: *"\(.*\)"$/\1/'
}
first_number() { # <json> <field> -> first numeric value of "field"
  printf '%s' "$1" | grep -o "\"$2\": *[0-9]*" | head -n 1 | sed 's/^[^:]*: *//'
}

bootstrap() {
  # 1. Layout: a fresh node has no role and refuses every S3 request until it
  #    gets one. One node, one zone, applied as the next layout version.
  _layout="$(api_get GetClusterLayout)" || { log "cannot read the cluster layout"; return 1; }
  if ! printf '%s' "$_layout" | grep -q '"zone": *"alpha-site"'; then
    _node="$(first_field "$(api_get GetClusterStatus)" id)"
    [ -n "$_node" ] || { log "cannot read this node's id"; return 1; }
    # `{"roles": [...]}` -- verified against v2.4.1; the bare array the
    # published OpenAPI schema describes is rejected ("expected a sequence").
    api_post UpdateClusterLayout "{\"roles\":[{\"id\":\"${_node}\",\"zone\":\"alpha-site\",\"capacity\":${capacity_bytes},\"tags\":[]}]}" >/dev/null \
      || { log "UpdateClusterLayout failed"; return 1; }
    _version="$(first_number "$_layout" version)"
    api_post ApplyClusterLayout "{\"version\":$(( ${_version:-0} + 1 ))}" >/dev/null \
      || { log "ApplyClusterLayout failed"; return 1; }
    log "layout assigned: zone alpha-site, node ${_node%"${_node#????????????????}"}"
  fi

  # 2. The bucket, and its quota (UpdateBucket is idempotent, so always set it).
  _bucket="$(api_get "GetBucketInfo?globalAlias=${dst_bucket}" 2>/dev/null)" \
    || _bucket="$(api_post CreateBucket "{\"globalAlias\":\"${dst_bucket}\"}")" \
    || { log "cannot create bucket ${dst_bucket}"; return 1; }
  _bucket_id="$(first_field "$_bucket" id)"
  [ -n "$_bucket_id" ] || { log "no id for bucket ${dst_bucket}"; return 1; }
  api_post "UpdateBucket?id=${_bucket_id}" "{\"quotas\":{\"maxSize\":${quota_bytes},\"maxObjects\":null}}" >/dev/null \
    || { log "cannot set the quota on ${dst_bucket}"; return 1; }

  # 3. The key: imported with the material from OpenBao, never generated here,
  #    so the reference in .env is valid before this node exists.
  if ! api_get "GetKeyInfo?id=${dest_key_id}" >/dev/null 2>&1; then
    api_post ImportKey "{\"accessKeyId\":\"${dest_key_id}\",\"secretAccessKey\":\"${dest_key_secret}\",\"name\":\"${dst_bucket}\"}" >/dev/null \
      || { log "ImportKey failed (is the backup-key material a GK-prefixed id and a 64-hex secret?)"; return 1; }
    log "imported key ${dest_key_id%"${dest_key_id#??????????}"}..."
  fi
  api_post AllowBucketKey "{\"bucketId\":\"${_bucket_id}\",\"accessKeyId\":\"${dest_key_id}\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":false}}" >/dev/null \
    || { log "AllowBucketKey failed"; return 1; }
  return 0
}

# The only objects that matter: each stack's meta.yaml and its checkpoints.
# `*` does not cross `/`, so these match <prefix>/.pulumi/... and nothing deeper.
filters="--include */.pulumi/meta.yaml --include */.pulumi/stacks/**"

prune_snapshots() {
  # Compared as YYYYMMDD integers rather than parsed back into epochs: busybox
  # `date -d` is picky about input formats, but `-d @<seconds>` always works.
  _cutoff="$(date -u -d "@$(( $(date -u +%s) - keep_days * 86400 ))" +%Y%m%d)"
  rclone lsf --dirs-only "dst:${dst_bucket}/snapshots/" 2>/dev/null | while read -r _dir; do
    _day="${_dir%/}"
    _num="$(printf '%s' "$_day" | tr -d '-')"
    # Only directories this script created (YYYY-MM-DD); anything else is left alone.
    case "$_num" in [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;; *) continue ;; esac
    if [ "$_num" -lt "$_cutoff" ]; then
      log "pruning snapshot ${_day}"
      rclone purge "dst:${dst_bucket}/snapshots/${_day}" || log "WARN: could not prune ${_day}" >&2
    fi
  done
}

mkdir -p "$state_dir"
log "every ${interval}s: src:${src_bucket} -> dst:${dst_bucket}/mirror, daily snapshots kept ${keep_days}d"
bootstrapped=false

while true; do
  if [ "$bootstrapped" != true ]; then
    if bootstrap; then
      bootstrapped=true
    else
      fail bootstrap-failed
      sleep 300
      continue
    fi
  fi

  # An empty source is never a legitimate run: a wrong key, a wrong endpoint or
  # a lost bucket would otherwise sync to nothing and DELETE the mirror while
  # reporting success. Refuse and page instead. The dated snapshots are not at
  # risk either way -- nothing but the prune ever deletes them.
  # shellcheck disable=SC2086
  count="$(rclone lsf -R --files-only $filters "src:${src_bucket}" 2>/dev/null | wc -l)" || count=0
  if [ "$count" -eq 0 ]; then
    fail source-empty-or-unreachable
    sleep "$interval"
    continue
  fi

  # shellcheck disable=SC2086
  if ! rclone sync "src:${src_bucket}" "dst:${dst_bucket}/mirror" $filters --s3-no-check-bucket; then
    fail rclone-sync-failed
    sleep "$interval"
    continue
  fi

  today="$(date -u +%Y-%m-%d)"
  if [ "$(cat "$snapshot_marker" 2>/dev/null || true)" != "$today" ]; then
    # shellcheck disable=SC2086
    if rclone copy "src:${src_bucket}" "dst:${dst_bucket}/snapshots/${today}" $filters --s3-no-check-bucket; then
      echo "$today" >"$snapshot_marker"
      log "snapshot ${today}: ${count} objects"
      prune_snapshots
    else
      fail rclone-snapshot-failed
      sleep "$interval"
      continue
    fi
  fi

  log "cycle ok: ${count} objects mirrored"
  printf '%s ok %s\n' "$(date +%s)" "$(date -u +%Y%m%dT%H%M%S)" >"$status_file"
  report true
  sleep "$interval"
done
