#!/bin/sh
# The restore drill against TrueNAS's copy of the VolSync bucket:
# docs/plans/host-owned-backups.md §E, run at each phase exit. For each app in
# APPS it restores the latest snapshot from the copy, read over the copy's
# read-only NFS export with --no-lock. Garage plays no part in the restore.
# It also prints Garage's own newest snapshot beside the copy's, so a copy
# that has fallen behind shows. That comparison is the only Garage call, and
# the drill passes without it.
set -u

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

failed=""
for app in ${APPS}; do
  copy="/copy/${app}"
  target="/scratch/${app}"
  echo "$(stamp) ${app}"

  if [ ! -f "${copy}/config" ]; then
    echo "  no restic repository at ${copy}; has TrueNAS pulled it yet?"
    failed="${failed} ${app}"
    continue
  fi

  echo "  newest snapshot in the TrueNAS copy:"
  restic --repo "${copy}" --no-lock snapshots --latest 1 --compact
  echo "  newest snapshot in Garage:"
  restic --repo "${GARAGE_REPOSITORY_BASE}/${app}" --no-lock snapshots --latest 1 --compact ||
    echo "  (Garage could not be read; the drill does not need it)"

  if restic --repo "${copy}" --no-lock restore latest --target "${target}"; then
    # `tr -d` because busybox `wc -l` right-aligns its count.
    files=$(find "${target}" -type f | wc -l | tr -d '[:space:]')
    size=$(du -sh "${target}" | cut -f1)
    echo "  restored ${files} files (${size}) from the TrueNAS copy"
  else
    echo "  restore failed"
    failed="${failed} ${app}"
  fi
  rm -rf "${target}"
done

if [ -n "${failed}" ]; then
  echo "$(stamp) failed:${failed}"
  exit 1
fi
echo "$(stamp) every app restored from the TrueNAS copy"
