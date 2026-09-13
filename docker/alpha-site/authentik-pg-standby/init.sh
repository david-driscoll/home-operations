#!/usr/bin/env bash
# Prepare the standby's data directory for the Debian postgres image (uid/gid
# 999). The container runs as 999 with cap_drop ALL and cannot chown anything,
# and Docker would otherwise create a missing bind source as root:root.
#
# Only the MOUNT ROOT is created. The PGDATA directory inside it is created by
# pg_basebackup, which requires its target to be empty or absent -- and whose
# absence is exactly how the entrypoint knows a clone is needed.
#
# components/DockgeLxc.ts runs this on every deploy, so it must stay idempotent.
set -euo pipefail

data_root=/opt/stacks-data/authentik-pg-standby

mkdir -p "$data_root/pgdata"
chown 999:999 "$data_root/pgdata"
chmod 700 "$data_root/pgdata"

# The unix socket directory, shared by the server and the role writer (both 999).
mkdir -p "$data_root/run"
chown 999:999 "$data_root/run"
chmod 750 "$data_root/run"

# The published role file: written by 999, served read-only by busybox (65534).
mkdir -p "$data_root/status"
chown 999:999 "$data_root/status"
chmod 755 "$data_root/status"

echo "authentik-pg-standby data directory ready."
