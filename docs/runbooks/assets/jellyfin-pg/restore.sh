#!/bin/sh
# Restore production Jellyfin's SQLite database AND its whole config tree from
# the volsync restic repository. Read-only against the repository; writes only
# into /work.
#
# WHY A DISCOVERY STEP AND NOT A HARDCODED PATH. The 2026-09-16 run recorded
# `restic dump latest /data/jellyfin.db` in the runbook, but VolSync's restic
# mover mounts the SOURCE PVC at /data, and that PVC is Jellyfin's
# JELLYFIN_DATA_DIR -- so the database is at /data/data/jellyfin.db and the
# config XMLs at /data/config/. One of the two is wrong and a `restic dump` of a
# path that does not exist fails with a message that reads like a broken
# repository. Locating the file in the snapshot costs one `restic ls` and makes
# the script correct under either layout.
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
# reads the pre-WAL state. -wal and -shm may legitimately be absent if Jellyfin
# checkpointed before the snapshot, so those two are not fatal.
restic --no-lock dump "$SNAP" "$DB_PATH" > "$WORK/jellyfin.db"
for suffix in -wal -shm; do
  if grep -qxF "${DB_PATH}${suffix}" "$WORK/snapshot-files.txt"; then
    restic --no-lock dump "$SNAP" "${DB_PATH}${suffix}" > "$WORK/jellyfin.db${suffix}"
    echo "dumped ${DB_PATH}${suffix}"
  else
    echo "no ${DB_PATH}${suffix} in snapshot (Jellyfin checkpointed before the backup)"
  fi
done

echo "=== dumping the config tree ==="
# THE HALF THE 2026-09-16 RUN SKIPPED. `restic restore --target` rather than
# `dump`, because these are directories: the server XMLs (system.xml carries
# <PluginRepositories>), every installed plugin and its configuration, the
# library definitions under root/, and the plugins' own SQLite databases.
#
# metadata/, cache/, log/ and transcodes/ are deliberately NOT in the include
# list -- metadata alone is tens of gigabytes of artwork, and all four are
# regenerable. config-sync.py decides what of this actually lands on the target.
mkdir -p "$WORK/snapshot"
restic --no-lock restore "$SNAP" --target "$WORK/snapshot" \
  --include "${DATA_DIR}/config" \
  --include "${DATA_DIR}/plugins" \
  --include "${DATA_DIR}/root" \
  --include "${DATA_DIR}/data/ScheduledTasks" \
  --include "${DATA_DIR}/data/collections" \
  --include "${DATA_DIR}/data/playlists" \
  --exclude "${DATA_DIR}/data/jellyfin.db*" \
  --exclude "${DATA_DIR}/data/library.db*"

# The plugin SQLite databases sit loose in data/ beside jellyfin.db, so they
# cannot be pulled in by a directory include without dragging the 637 MiB
# library database along with them. One dump each instead.
for f in $(grep -E "^${DATA_DIR}/data/[^/]+\.db$" "$WORK/snapshot-files.txt" \
           | grep -vE '/(jellyfin|library)\.db$' || true); do
  mkdir -p "$WORK/snapshot${DATA_DIR}/data"
  restic --no-lock dump "$SNAP" "$f" > "$WORK/snapshot${f}"
  echo "plugin database: $f"
done

# Where config-sync.py should look. Written rather than recomputed so the two
# scripts cannot disagree about the layout.
printf '%s\n' "$WORK/snapshot${DATA_DIR}" > "$WORK/config-root"

echo "=== restored ==="
ls -l "$WORK/jellyfin.db"*
du -sh "$WORK/snapshot${DATA_DIR}"/* 2>/dev/null || true
echo "config root: $(cat "$WORK/config-root")"
echo "restore: OK"
