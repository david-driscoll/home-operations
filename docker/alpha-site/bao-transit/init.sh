#!/usr/bin/env bash
# Pre-create bao-transit's raft directory with the same ownership as its
# existing data directory. The OpenBao image runs as a non-root user; a bind
# mount Docker auto-creates is root-owned and unwritable to it, which would
# fail the raft migration (and the server) on a permission error.
#
# components/DockgeLxc.ts runs this on every deploy, so it stays idempotent.
# Under /opt/stacks-data, never /opt/stacks: that tree holds the seal root.
set -euo pipefail

root=/opt/stacks-data/bao-transit

mkdir -p "$root/raft"
if [ -d "$root/data" ]; then
  # Copy the owner from the directory the image already writes to, rather than
  # hard-coding the image's uid.
  chown --reference="$root/data" "$root/raft"
fi
chmod 700 "$root/raft"

echo "bao-transit raft directory ready."
