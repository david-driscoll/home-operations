#!/bin/sh
# Copies each app's restic history from its NFS repository into its Garage
# repository: docs/plans/host-owned-backups.md phase 3, steps 3 and 4. The Job
# runs it once per batch. APPS lists the batch: the apps whose ks.yaml set
# VOLSYNC_BACKEND: garage in the same change.
#
# Safe to run again, and safe in either order with an app's first Garage
# backup:
#   - init runs only when the Garage repository does not exist yet. It copies
#     the NFS repository's chunker parameters, so restic deduplicates the
#     copied history against every later backup.
#   - copy skips every snapshot it has already copied.
#   - if a mover got there first, its init picked fresh chunker parameters.
#     The copy still works, but that app takes up to twice its size in Garage
#     until the copied snapshots age out of retention.
#
# Both repositories open with the VolSync password: RESTIC_PASSWORD and
# RESTIC_FROM_PASSWORD hold the same credential. The NFS share is mounted
# read-write because restic takes a lock on the source while it reads.
set -u

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
snapshot_count() {
  restic --repo "$1" snapshots --json | grep -o '"short_id"' | wc -l | tr -d '[:space:]'
}

failed=""
for app in ${APPS}; do
  source_repo="/repository/${app}"
  garage_repo="${GARAGE_REPOSITORY_BASE}/${app}"
  echo "$(stamp) ${app}"

  if [ ! -f "${source_repo}/config" ]; then
    echo "  no NFS repository at ${source_repo}"
    failed="${failed} ${app}"
    continue
  fi

  if restic --repo "${garage_repo}" cat config >/dev/null 2>&1; then
    echo "  the Garage repository exists; copying into it"
  elif ! restic --repo "${garage_repo}" init --from-repo "${source_repo}" --copy-chunker-params; then
    echo "  init failed"
    failed="${failed} ${app}"
    continue
  fi

  if ! restic --repo "${garage_repo}" copy --from-repo "${source_repo}"; then
    echo "  copy failed"
    failed="${failed} ${app}"
    continue
  fi

  echo "  snapshots: NFS $(snapshot_count "${source_repo}"), Garage $(snapshot_count "${garage_repo}")"
done

if [ -n "${failed}" ]; then
  echo "$(stamp) failed:${failed}"
  exit 1
fi
echo "$(stamp) every app copied"
