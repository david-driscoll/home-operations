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
# NOTE FOR EDITORS: this file is run through the Pulumi variable substitution
# in components/DockgeLxc.ts. Do not introduce shell variables named host,
# hostname, ipAddress, searchDomain, APP, STACK_NAME, CLUSTER_*, TIMEZONE, or
# UPTIME_API_URL — those tokens are rewritten in transit.
set -eu

interval="${POSTGRES_DUMP_INTERVAL_SECONDS:-86400}"
keep_days="${POSTGRES_DUMP_KEEP_DAYS:-14}"
out_dir=/dumps

echo "[backup] every ${interval}s, keeping ${keep_days} days, into ${out_dir}"

while true; do
  stamp=$(date +%Y%m%dT%H%M%S)

  # Roles and their passwords live outside any single database, so a per-database
  # dump alone is not restorable on a fresh cluster. --globals-only captures them.
  if pg_dumpall --globals-only >"${out_dir}/globals-${stamp}.sql.tmp"; then
    mv "${out_dir}/globals-${stamp}.sql.tmp" "${out_dir}/globals-${stamp}.sql"
  else
    rm -f "${out_dir}/globals-${stamp}.sql.tmp"
    echo "[backup] WARN: globals dump failed" >&2
  fi

  # Template databases and the maintenance database carry nothing worth keeping.
  for db_name in $(psql -tA -d postgres \
      -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres'"); do
    # -Fc is the custom format: compressed, and restorable selectively with
    # pg_restore rather than only as a whole-file replay.
    if pg_dump -Fc -d "$db_name" -f "${out_dir}/${db_name}-${stamp}.dump.tmp"; then
      # Rename only after a clean exit, so a dump interrupted mid-write is never
      # mistaken for a good one by the retention sweep or by a restore.
      mv "${out_dir}/${db_name}-${stamp}.dump.tmp" "${out_dir}/${db_name}-${stamp}.dump"
      echo "[backup] dumped ${db_name}"
    else
      rm -f "${out_dir}/${db_name}-${stamp}.dump.tmp"
      echo "[backup] WARN: dump of ${db_name} failed" >&2
    fi
  done

  # Retention. Restic keeps its own history of these files, so this only bounds
  # what sits on the host between snapshots.
  find "$out_dir" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.sql' \) \
    -mtime "+${keep_days}" -delete 2>/dev/null || true
  find "$out_dir" -maxdepth 1 -type f -name '*.tmp' -mtime +1 -delete 2>/dev/null || true

  sleep "$interval"
done
