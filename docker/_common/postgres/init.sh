#!/usr/bin/env bash
# Pre-create the data directories with the ownership the Postgres containers
# need. All three services run as uid/gid 70 (the postgres user in the Alpine
# image) with cap_drop: ALL, so they cannot chown anything themselves — the
# directories have to be right before the containers start.
#
# uid/gid 70 is `postgres` in postgres:18-alpine — verified directly against the
# image, not inherited from 17 (`id postgres` -> uid=70(postgres) gid=70(postgres)
# on both 17.10 and 18.4), so the 17 -> 18 move did not shift it.
#
# Every path here must match the bind mounts in compose.yaml exactly. Docker
# auto-creates a missing bind source as root:root 0755 at `up` time, which uid 70
# cannot write, so a path that is mounted but not prepared here crash-loops the
# container on "mkdir: can't create directory ...: Permission denied".
#
# components/DockgeLxc.ts runs this on every deploy, so it must stay idempotent.
set -euo pipefail

data_root=/opt/stacks-data/postgres

# pgdata is the bind *mount root* (/var/lib/postgresql/data). PGDATA itself is
# the `pgdata` subdirectory inside it, which the container creates on first init
# — it can only do that if the mount root is owned by 70. Pre-creating the inner
# directory too makes that independent of the parent's mode.
for dir in "$data_root/pgdata" "$data_root/pgdata/pgdata" "$data_root/dumps"; do
  mkdir -p "$dir"
  chown 70:70 "$dir"
done

# initdb refuses to run in a directory with group/world permissions.
chmod 700 "$data_root/pgdata" "$data_root/pgdata/pgdata"
chmod 750 "$data_root/dumps"

# Commit 2b99cb93 briefly mounted PGDATA from /opt/stacks/postgres/pgdata — the
# Dockge *definition* directory, which DockgeLxc.ts:810 `rm -rf`s on stack delete.
# Clear the empty husk Docker left behind on the hosts that ran that revision.
# rmdir, never rm -rf: if anything is actually in there it is a real data
# directory from that revision and must be looked at by a human, not deleted.
rmdir /opt/stacks/postgres/pgdata 2>/dev/null \
  && echo "Removed stray PGDATA directory from the Dockge definition dir." \
  || true

echo "Shared Postgres data directories ready."
