#!/bin/sh
# The restore drill for the VolSync bucket: docs/plans/host-owned-backups.md
# §E, run at each phase exit. For each app in APPS it takes the newest
# snapshot in TrueNAS's copy and restores that same snapshot twice:
#   - from Garage, over S3
#   - from the copy, read over its read-only NFS export. Garage plays no part
#     in this one.
# Both restores run with --no-lock, and each one is fingerprinted (a checksum
# of every file, by path) and deleted before the next, so scratch only ever
# holds one. The app passes when both restores succeed and their fingerprints
# match. It also prints each side's newest snapshot, so a copy that has fallen
# behind Garage shows.
set -u

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# restic against one side. The copy is a byte-for-byte copy of the Garage
# repository, so the two share a repository ID, and with one cache directory
# the second restore would read the trees the first one cached. Each side
# gets its own, so each restore reads every pack it needs from its own side.
from_side() {
  side=$1
  shift
  case "${side}" in
    garage) repo="${GARAGE_REPOSITORY_BASE}/${app}" ;;
    copy) repo="/copy/${app}" ;;
  esac
  restic --repo "${repo}" --cache-dir "${RESTIC_CACHE_DIR}/${side}" --no-lock "$@"
}

# Restores snapshot $2 from side $1 into $3 and prints
# "<files> <size> <fingerprint>". Returns non-zero when the restore fails.
restore_and_fingerprint() {
  from_side "$1" restore "$2" --target "$3" >/dev/null || return 1
  # `tr -d` because busybox `wc -l` right-aligns its count.
  files=$(find "$3" -type f | wc -l | tr -d '[:space:]')
  size=$(du -sh "$3" | cut -f1)
  fingerprint=$(cd "$3" && find . -type f -exec md5sum {} + | sort -k2 | md5sum | cut -d' ' -f1)
  echo "${files} ${size} ${fingerprint}"
}

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
  from_side copy snapshots --latest 1 --compact
  echo "  newest snapshot in Garage:"
  from_side garage snapshots --latest 1 --compact

  # `"id":"` cannot match `"short_id":"`: the quote before `id` rules it out.
  snapshot=$(from_side copy snapshots --latest 1 --json | grep -o '"id":"[0-9a-f]*"' | head -n 1 | cut -d'"' -f4)
  if [ -z "${snapshot}" ]; then
    echo "  the TrueNAS copy holds no snapshot"
    failed="${failed} ${app}"
    continue
  fi
  echo "  drilling snapshot ${snapshot}"

  if from_garage=$(restore_and_fingerprint garage "${snapshot}" "${target}"); then
    echo "  from Garage:          ${from_garage}"
  else
    echo "  restore from Garage failed"
    from_garage=""
  fi
  rm -rf "${target}"

  if from_copy=$(restore_and_fingerprint copy "${snapshot}" "${target}"); then
    echo "  from the TrueNAS copy: ${from_copy}"
  else
    echo "  restore from the TrueNAS copy failed"
    from_copy=""
  fi
  rm -rf "${target}"

  if [ -z "${from_garage}" ] || [ -z "${from_copy}" ]; then
    failed="${failed} ${app}"
  elif [ "${from_garage##* }" != "${from_copy##* }" ]; then
    echo "  the two restores differ"
    failed="${failed} ${app}"
  else
    echo "  both restores match"
  fi
done

if [ -n "${failed}" ]; then
  echo "$(stamp) failed:${failed}"
  exit 1
fi
echo "$(stamp) every app restored from Garage and from the TrueNAS copy, identically"
