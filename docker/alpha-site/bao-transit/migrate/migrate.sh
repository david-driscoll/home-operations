#!/bin/sh
# bao-transit's one-time file -> raft storage migration, idempotent: it runs on
# every deploy (the bao-transit-migrate service) and does the work exactly once.
#
#   raft already initialised  -> nothing to do, exit 0 (the normal case forever after)
#   file storage present      -> `bao operator migrate`, then exit
#   neither                   -> refuse: starting a fresh raft here would mean
#                                a new, EMPTY seal root that equestria's
#                                OpenBao cannot unseal against
#
# Must run on OpenBao 2.6.x: 2.7.0 removed `storage "file"`, so a newer binary
# cannot read the source (the bao-transit outage of 2026-09-24..28).
set -eu

if [ -f /openbao/raft/vault.db ]; then
  echo "[migrate] raft storage already present; nothing to do"
  exit 0
fi

if [ ! -d /openbao/data/core ]; then
  echo "[migrate] ERROR: no raft state and no file storage under /openbao/data -- refusing to" >&2
  echo "[migrate] start an empty seal root. Restore /opt/stacks-data/bao-transit/data first." >&2
  exit 1
fi

echo "[migrate] migrating file storage (/openbao/data) -> raft (/openbao/raft)"
bao operator migrate -config=/openbao/migrate/migrate.hcl
echo "[migrate] done; /openbao/data is left untouched as the rollback"
