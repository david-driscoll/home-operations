#!/bin/sh
# The main container of the `lock-canceller-garage` CronJob
# (helmrelease-garage.yaml), mounted the same way as find-stale-garage-locks.sh
# and for the same reason.
#
# Runs `restic unlock` on each repository the find container listed in
# /work/stale. Plain `unlock`, never `--remove-all`: restic removes only the
# locks it judges stale itself, the second of the guards unlock-stale-locks.sh
# relies on.
set -u

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

cleared=0
failed=0
while read -r repo; do
  [ -n "${repo}" ] || continue
  repository="${GARAGE_REPOSITORY_BASE}/${repo}"
  if restic --repo "${repository}" --no-cache unlock; then
    # `tr -d` because busybox `wc -l` right-aligns its count.
    remaining=$(restic --repo "${repository}" --no-cache --no-lock list locks | wc -l | tr -d '[:space:]')
    cleared=$((cleared + 1))
    echo "  unlocked ${repo}; ${remaining} lock(s) remain"
  else
    # Does not fail the Job, as on NFS: the cause is a repository on another
    # credential, or a lock restic does not judge stale, and either is a
    # question for a human. The remaining repositories still get unlocked.
    failed=$((failed + 1))
    echo "  WARNING: could not unlock ${repo} (different repository password, or restic does not judge the lock stale)"
  fi
done </work/stale

echo "$(stamp) ${cleared} unlocked; ${failed} could not be"
