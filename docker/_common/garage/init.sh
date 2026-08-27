#!/usr/bin/env bash
# Pre-create the Garage directories with the ownership the containers need.
# Both services run with cap_drop: ALL and cannot chown anything themselves, so
# a path that is mounted but not prepared here crash-loops on a permission
# error — the same contract as the postgres stack's init.sh, and the same
# reason every path here must match the bind mounts in compose.yaml exactly.
#
# components/DockgeLxc.ts runs this on every deploy, so it must stay idempotent.
# Note DockgeLxc's chown pass re-chowns /opt/stacks-data/garage to the compose
# services' users after this runs; the uids here agree with those on purpose.
set -euo pipefail

ssd_root=/opt/stacks-data/garage
zfs_data=/data/garage

# uid 3900 is the garage service account (compose.yaml `user:`). It exists
# nowhere in /etc/passwd and does not need to.
mkdir -p "$ssd_root/meta" "$ssd_root/sync-state" "$ssd_root/mirror-state"
chown 3900:3900 "$ssd_root/meta" "$ssd_root/mirror-state"
# gid 70 (postgres): garage-sync runs 3900:70 and writes its cycle marker here.
chown 3900:70 "$ssd_root/sync-state"
chmod 700 "$ssd_root/meta"
chmod 770 "$ssd_root/sync-state" "$ssd_root/mirror-state"

# Block data on the ZFS array. /data is the host mount every garage node's
# LXC carries (addHostMount("/data") in the site stacks); if it is missing this
# is the wrong host to be deploying the garage stack on, so fail loudly rather
# than silently putting object data on the SSD.
if [ ! -d /data ]; then
  echo "ERROR: /data is not mounted in this LXC — the garage stack requires the ZFS array host mount." >&2
  exit 1
fi
mkdir -p "$zfs_data"
chown 3900:3900 "$zfs_data"
chmod 700 "$zfs_data"

echo "Garage data directories ready."
