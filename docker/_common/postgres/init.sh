#!/usr/bin/env bash
# Pre-create the data directories with the ownership the Postgres containers
# need. All three services run as uid/gid 70 (the postgres user in the Alpine
# image) with cap_drop: ALL, so they cannot chown anything themselves — the
# directories have to be right before the containers start.
#
# components/DockgeLxc.ts runs this on every deploy, so it must stay idempotent.
set -euo pipefail

for dir in /opt/stacks-data/postgres/pgdata /opt/stacks-data/postgres/dumps; do
  mkdir -p "$dir"
  chown 70:70 "$dir"
done

# initdb refuses to run in a directory with group/world permissions.
chmod 700 /opt/stacks-data/postgres/pgdata
chmod 750 /opt/stacks-data/postgres/dumps

echo "Shared Postgres data directories ready."
