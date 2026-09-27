#!/usr/bin/env bash
# Pre-create this stack's directories with the ownership the containers need.
# Both services run with cap_drop: ALL and cannot chown anything themselves, so
# a path that is mounted but not prepared here crash-loops on a permission
# error -- the same contract as docker/_common/garage/init.sh.
#
# components/DockgeLxc.ts runs this on every deploy, so it must stay idempotent.
# Under /opt/stacks-data, never /opt/stacks: DockgeLxc rm -rf's the definition
# directory when a stack is deleted, and this one holds the only off-site copy
# of the Pulumi state.
set -euo pipefail

root=/opt/stacks-data/garage-backup

# uid 3900 is the garage service account, shared with the backup loop
# (compose.yaml `user:`). It exists nowhere in /etc/passwd and does not need to.
mkdir -p "$root/meta" "$root/data" "$root/state"
chown 3900:3900 "$root/meta" "$root/data" "$root/state"
chmod 700 "$root/meta" "$root/data" "$root/state"

echo "garage-backup directories ready."
