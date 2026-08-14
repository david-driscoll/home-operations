#!/bin/sh
# Periodic logical dumps of every application database on this node.
#
# WHY THIS EXISTS. The celestia dockge backrest plan (stacks/backups/index.ts)
# rclone-pulls /opt/stacks-data/ from each Dockge host and restic-snapshots the
# result. For almost every stack a file copy is a fine backup. For Postgres it
# is not: copying a running cluster's data directory yields torn pages and a
# WAL that does not match, so the snapshot may restore to nothing. The live
# PGDATA is therefore excluded from that plan and these dumps are the real
# backup source — each one a consistent snapshot taken inside a single
# transaction, written to a path that IS in backup scope.
#
# WHY IT REPORTS. restic snapshotting a dumps directory succeeds whether the
# directory holds last night's dumps or a fortnight-old set, so the backrest
# plan's own success hook cannot tell you the dumps stopped being produced.
# Everything below therefore ends each cycle by pushing the result to a Gatus
# external endpoint whose heartbeat expires if no push arrives — the same
# dead-man's-switch shape BackupPlanDirector gives every backrest plan, and the
# closest docker-side equivalent of a failed Kubernetes CronJob. A cycle that
# dumps nothing, or that cannot reach the server at all, now reports failure
# instead of printing a warning into a log nobody reads.
#
# NOTE FOR EDITORS: this file is run through the Pulumi variable substitution
# in components/DockgeLxc.ts. Do not introduce shell variables named host,
# hostname, ipAddress, searchDomain, APP, STACK_NAME, CLUSTER_*, DOCKGE_NAME,
# TIMEZONE, or UPTIME_API_URL — those tokens are rewritten in transit.
set -eu

interval="${POSTGRES_DUMP_INTERVAL_SECONDS:-86400}"
keep_days="${POSTGRES_DUMP_KEEP_DAYS:-14}"
out_dir=/dumps

# Last-cycle result, as `<epoch> <ok|failed>`. Read by the container
# healthcheck in compose.yaml, and readable straight off the host when
# something looks wrong. It lives in /dumps deliberately: the retention sweep
# below only matches *.dump/*.sql/*.tmp, so it is never swept, and being inside
# the backed-up directory means a restored snapshot carries the evidence of
# when its dumps were actually taken.
status_file="${out_dir}/.last-run"

# Push target. Both are set in .env, from the DOCKGE_NAME and UPTIME_API_URL
# substitutions -- named without their sigils here on purpose, because a
# comment is rewritten in transit exactly like code is (see the editor note
# above). If either is empty the reporting is skipped and the loop still dumps.
# Gatus uses the endpoint token as both the path segment and the bearer.
uptime_url="${POSTGRES_DUMP_UPTIME_URL:-}"
uptime_token="${POSTGRES_DUMP_UPTIME_TOKEN:-}"

echo "[backup] every ${interval}s, keeping ${keep_days} days, into ${out_dir}"
if [ -n "$uptime_url" ] && [ -n "$uptime_token" ]; then
  echo "[backup] reporting to ${uptime_url} as ${uptime_token}"
else
  echo "[backup] WARN: POSTGRES_DUMP_UPTIME_URL/TOKEN unset — no failure reporting" >&2
fi

# The postgres:18-alpine image has no curl; busybox wget does have --header and
# --post-data, and ssl_client + ca-certificates for the TLS leg. Verified
# against the pinned digest. A push that fails is only a warning: losing the
# report is not a reason to lose the dumps, and a missing push already reads as
# failure at the Gatus end once the heartbeat expires.
report() {
  [ -n "$uptime_url" ] && [ -n "$uptime_token" ] || return 0
  wget -q -T 15 -O /dev/null \
    --header="Authorization: Bearer ${uptime_token}" \
    --post-data="" \
    "${uptime_url}/api/v1/endpoints/${uptime_token}/external?success=$1" \
    || echo "[backup] WARN: could not report success=$1 to uptime" >&2
}

while true; do
  stamp=$(date +%Y%m%dT%H%M%S)
  failures=0

  # Roles and their passwords live outside any single database, so a per-database
  # dump alone is not restorable on a fresh cluster. --globals-only captures them.
  if pg_dumpall --globals-only >"${out_dir}/globals-${stamp}.sql.tmp"; then
    mv "${out_dir}/globals-${stamp}.sql.tmp" "${out_dir}/globals-${stamp}.sql"
  else
    rm -f "${out_dir}/globals-${stamp}.sql.tmp"
    echo "[backup] ERROR: globals dump failed" >&2
    failures=$((failures + 1))
  fi

  # Template databases and the maintenance database carry nothing worth keeping.
  #
  # The list is captured into a variable rather than inlined as `for db in
  # $(psql ...)`: `set -e` does not check the exit status of a command
  # substitution in a `for` list, so a server that is down or refusing
  # connections used to yield an empty list, iterate zero times, and complete
  # the cycle as a success. That was the single worst failure mode here —
  # a total outage looked exactly like a host with no application databases.
  if db_list=$(psql -tA -d postgres \
      -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres'"); then
    for db_name in $db_list; do
      # -Fc is the custom format: compressed, and restorable selectively with
      # pg_restore rather than only as a whole-file replay.
      if pg_dump -Fc -d "$db_name" -f "${out_dir}/${db_name}-${stamp}.dump.tmp"; then
        # Rename only after a clean exit, so a dump interrupted mid-write is never
        # mistaken for a good one by the retention sweep or by a restore.
        mv "${out_dir}/${db_name}-${stamp}.dump.tmp" "${out_dir}/${db_name}-${stamp}.dump"
        echo "[backup] dumped ${db_name}"
      else
        rm -f "${out_dir}/${db_name}-${stamp}.dump.tmp"
        echo "[backup] ERROR: dump of ${db_name} failed" >&2
        failures=$((failures + 1))
      fi
    done
  else
    echo "[backup] ERROR: could not list databases — server unreachable?" >&2
    failures=$((failures + 1))
  fi

  # Retention. Restic keeps its own history of these files, so this only bounds
  # what sits on the host between snapshots.
  find "$out_dir" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.sql' \) \
    -mtime "+${keep_days}" -delete 2>/dev/null || true
  find "$out_dir" -maxdepth 1 -type f -name '*.tmp' -mtime +1 -delete 2>/dev/null || true

  # A host with no application databases is a SUCCESS, not an empty failure:
  # the globals dump still ran, and luna/skystar/alpha-site legitimately
  # declare no PGAPP_* consumers today.
  if [ "$failures" -eq 0 ]; then
    printf '%s ok %s\n' "$(date +%s)" "$stamp" >"$status_file"
    echo "[backup] cycle ${stamp} ok"
    report true
  else
    printf '%s failed %s\n' "$(date +%s)" "$stamp" >"$status_file"
    echo "[backup] cycle ${stamp} FAILED — ${failures} error(s)" >&2
    report false
  fi

  sleep "$interval"
done
