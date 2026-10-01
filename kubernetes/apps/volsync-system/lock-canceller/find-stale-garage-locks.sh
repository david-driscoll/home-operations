#!/bin/sh
# The `find` init container of the `lock-canceller-garage` CronJob
# (helmrelease-garage.yaml). kustomization.yaml mounts it at /script with Flux
# substitution disabled, for the same reason as unlock-stale-locks.sh: the
# expansions below are shell, and strict envsubst would fail the build on them.
#
# The Garage half of the lock canceller. Repositories that moved to Garage
# (VOLSYNC_BACKEND: garage, docs/plans/host-owned-backups.md phase 3) strand
# their locks exactly like the NFS ones: a mover killed mid-forget leaves its
# lock behind, and every later run fails at retention.
#
# This container only finds them. It lists every restic repository in the
# VolSync bucket and writes those holding a lock older than STALE_MINUTES to
# /work/stale. rclone does the listing because restic cannot list a bucket.
# The restic container (unlock-stale-garage-locks.sh) then unlocks only those,
# so a lock is removed only when restic itself judges it stale, as on NFS.
set -u

# The same threshold, and the same reasoning, as unlock-stale-locks.sh. A live
# restic process rewrites its lock every 5 minutes, so on S3 a live lock's
# object is never more than minutes old either.
STALE_MINUTES=360

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

bucket=":s3:${GARAGE_BUCKET}"
: >/work/stale

echo "$(stamp) scanning ${GARAGE_BUCKET} for restic locks older than ${STALE_MINUTES}m"

# A bucket that cannot be listed fails the Job: the movers cannot reach it
# either, and the failed-Job alert is the signal.
if ! entries=$(rclone lsf --dirs-only "${bucket}"); then
  echo "$(stamp) ERROR: could not list ${GARAGE_BUCKET}"
  exit 1
fi

scanned=0
failed=0
for entry in ${entries}; do
  repo=${entry%/}
  if ! top=$(rclone lsf "${bucket}/${repo}"); then
    echo "${repo}: ERROR: could not list"
    failed=$((failed + 1))
    continue
  fi

  # Skips any prefix that is not an initialised repository.
  printf '%s\n' "${top}" | grep -qx 'config' || continue
  scanned=$((scanned + 1))

  # S3 has no empty directories, so locks/ is listed only while a lock exists.
  printf '%s\n' "${top}" | grep -qx 'locks/' || continue

  if ! stale=$(rclone lsl --min-age "${STALE_MINUTES}m" "${bucket}/${repo}/locks"); then
    echo "${repo}: ERROR: could not list locks"
    failed=$((failed + 1))
    continue
  fi
  [ -n "${stale}" ] || continue

  echo "${repo}: lock(s) held longer than ${STALE_MINUTES}m:"
  echo "${stale}"
  echo "${repo}" >>/work/stale
done

# `tr -d` because busybox `wc -l` right-aligns its count.
echo "$(stamp) scanned ${scanned} repositories; $(wc -l </work/stale | tr -d '[:space:]') have stale locks; ${failed} could not be listed"
[ "${failed}" -eq 0 ]
