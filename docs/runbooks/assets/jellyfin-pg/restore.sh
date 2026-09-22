#!/bin/sh
# Restore production Jellyfin's SQLite database AND its whole config tree from
# the volsync restic repository. Read-only against the repository; writes only
# into /work.
#
# THE SNAPSHOT'S ROOT IS THE VOLUME'S ROOT. VolSync's mover mounts the source
# PVC at /data and runs `restic backup .` from inside it, so the paths `restic
# ls` prints are relative to the volume, not to the mount -- production's
# /config/data/jellyfin.db is /data/jellyfin.db in the snapshot, and its
# /config/config/system.xml is /config/system.xml. Confirmed against the live
# pod and snapshot 14be3af9 on 2026-09-21. It reads like a mount path and is
# not one, which is why the database is LOCATED here rather than assumed, and
# why the config tree is checked for after the restore rather than trusted.
#
# Requires, from the jellyfin-volsync-secret Secret:
#   RESTIC_REPOSITORY   /repository/jellyfin
#   RESTIC_PASSWORD
# and the repository NFS export mounted read-only at /repository
# (10.10.10.10:/mnt/stash/backup/equestria/volsync).
#
# --no-lock on EVERY invocation. The repository is shared with the nightly
# ReplicationSource; a lock left behind by this pod breaks production's backups
# and its forget/prune, which is the failure mode components/volsync's
# `unlock` schedule exists to clean up. Do not make more of that work.
set -eu

WORK="${WORK:-/work}"
SNAP="${SNAP:-latest}"
mkdir -p "$WORK"

echo "=== snapshot ==="
restic --no-lock snapshots --latest 1 --json > "$WORK/snapshot.json"
cat "$WORK/snapshot.json"

echo "=== locating jellyfin.db in the snapshot ==="
restic --no-lock ls "$SNAP" > "$WORK/snapshot-files.txt"
DB_PATH="$(grep -E '/jellyfin\.db$' "$WORK/snapshot-files.txt" | head -1 || true)"
if [ -z "$DB_PATH" ]; then
  echo "FAIL: no jellyfin.db in snapshot $SNAP" >&2
  echo "      candidates:" >&2
  grep -E '\.db$' "$WORK/snapshot-files.txt" | head -20 >&2
  exit 1
fi
# Everything else is addressed relative to the data directory that holds it, so
# a layout change moves one variable rather than six paths.
DATA_DIR="$(dirname "$(dirname "$DB_PATH")")"
[ "$DATA_DIR" = "/" ] && DATA_DIR=""
echo "database:  $DB_PATH"
echo "data dir:  ${DATA_DIR:-/}"

echo "=== dumping the database (+ WAL) ==="
# The WAL matters: this is a HOT copy, taken while Jellyfin was serving. Without
# it render.py's wal_checkpoint has nothing to fold in and pgloader silently
# reads the pre-WAL state. The WAL may legitimately be absent if Jellyfin
# checkpointed before the snapshot, so that is not fatal.
#
# NOT the -shm. It is a shared-memory index into the WAL, and a hot copy of one
# can disagree with the WAL it was copied beside; SQLite rebuilds it from the
# WAL when it is missing, which is the safe direction. The proven 2026-09-16
# run took the .db and the -wal only.
dump_with_wal() {  # $1 = path in the snapshot, $2 = local destination
  restic --no-lock dump "$SNAP" "$1" > "$2"
  if grep -qxF "${1}-wal" "$WORK/snapshot-files.txt"; then
    restic --no-lock dump "$SNAP" "${1}-wal" > "${2}-wal"
    echo "dumped $1 (+ WAL)"
  else
    echo "dumped $1 (no WAL in the snapshot)"
  fi
}
dump_with_wal "$DB_PATH" "$WORK/jellyfin.db"

echo "=== dumping the config tree ==="
# THE HALF THE 2026-09-16 RUN SKIPPED. `restic restore --target` rather than
# `dump`, because these are directories: the server XMLs (system.xml carries
# <PluginRepositories>), every installed plugin and its configuration, the
# library definitions under root/, and the plugins' own SQLite databases.
#
# metadata/, cache/, log/ and transcodes/ are deliberately NOT in the include
# list -- metadata alone is tens of gigabytes of artwork, and all four are
# regenerable. config-sync.py decides what of this actually lands on the target.
#
# Includes ONLY. restic refuses `--include` and `--exclude` together ("exclude
# and include patterns are mutually exclusive") -- which is how the first live
# run of this script died, 2026-09-21. None of these directories holds
# jellyfin.db, so there was never anything to exclude.
mkdir -p "$WORK/snapshot"
restic --no-lock restore "$SNAP" --target "$WORK/snapshot" \
  --include "${DATA_DIR}/config" \
  --include "${DATA_DIR}/plugins" \
  --include "${DATA_DIR}/root" \
  --include "${DATA_DIR}/data/ScheduledTasks" \
  --include "${DATA_DIR}/data/collections" \
  --include "${DATA_DIR}/data/playlists"

# FAIL CLOSED ON AN EMPTY RESTORE. An include that matches nothing is not an
# error to restic, so a layout this script misreads would restore nothing and
# config-sync.py would then carry nothing -- a green run with none of the
# settings or plugins this run exists for.
for must in config/system.xml plugins root; do
  if [ ! -e "$WORK/snapshot${DATA_DIR}/$must" ]; then
    echo "FAIL: $must did not restore -- the snapshot layout is not what this script expects." >&2
    echo "      top level of the snapshot:" >&2
    grep -E '^/[^/]+$' "$WORK/snapshot-files.txt" >&2 || true
    exit 1
  fi
done

# The plugin SQLite databases sit loose in data/ beside jellyfin.db, so they
# cannot be pulled in by a directory include without dragging the library
# database along with them. One dump each -- WITH its WAL, for the same reason
# as jellyfin.db: on 2026-09-21 infuse_sync.db had a 3.9 MB WAL beside it, and
# copying the .db alone would have dropped those writes. config-sync.py
# checkpoints each one before it copies it.
mkdir -p "$WORK/snapshot${DATA_DIR}/data"
grep -E "^${DATA_DIR}/data/[^/]+\.db$" "$WORK/snapshot-files.txt" \
  | grep -vE '/(jellyfin|library)\.db$' \
  | while IFS= read -r f; do
      dump_with_wal "$f" "$WORK/snapshot${f}"
    done

# Where config-sync.py should look. Written rather than recomputed so the two
# scripts cannot disagree about the layout.
printf '%s\n' "$WORK/snapshot${DATA_DIR}" > "$WORK/config-root"

echo "=== restored ==="
ls -l "$WORK/jellyfin.db"*
du -sh "$WORK/snapshot${DATA_DIR}"/* 2>/dev/null || true
echo "config root: $(cat "$WORK/config-root")"
echo "restore: OK"
