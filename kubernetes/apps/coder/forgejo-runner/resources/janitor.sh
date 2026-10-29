#!/bin/sh
# The `janitor` sidecar's command (../scaledjob.yaml). Two jobs, both against
# this pod's Docker daemon, from the dind image for its docker CLI (the runner
# image has neither docker nor curl):
#
#  1. ./prepull.sh, in the background: warm the job image on a pod that is
#     still waiting a minute in.
#  2. Between jobs, clear what the last one left so the next starts clean.
#     ./run-job.sh writes /data/.reuse/done-N when job N has finished and
#     waits for clean-N before taking another. Pruned: stopped containers,
#     networks, every unused volume, dangling images and build cache. Kept:
#     the pulled images, which are the reason a pod is reused at all.
#
# If the scratch volume is still above SCRATCH_PRUNE_PERCENT after that, the
# pulled images go too; above SCRATCH_FULL_PERCENT even then, clean-N says
# `full` and the pod leaves for a fresh one.
#
# A native sidecar: the kubelet stops it once the runner has exited, so it
# loops until SIGTERM and never exits on its own (it would be restarted).
set -u

markers=/data/.reuse
prune_percent=${SCRATCH_PRUNE_PERCENT:-60}
full_percent=${SCRATCH_FULL_PERCENT:-85}

sh /scripts/prepull.sh &

# 0 when df fails, so a broken df never stops a pod being reused.
used_percent() {
  df -P /data 2>/dev/null | awk 'NR == 2 { sub("%", "", $5); p = $5 } END { print p + 0 }'
}

clean() {
  docker container prune --force >/dev/null || true
  docker network prune --force >/dev/null || true
  docker volume prune --all --force >/dev/null || true
  docker image prune --force >/dev/null || true
  docker builder prune --force >/dev/null 2>&1 || true
  used=$(used_percent)
  if [ "$used" -ge "$prune_percent" ]; then
    echo "janitor: scratch volume ${used}% used after job $1; removing pulled images too"
    docker image prune --all --force >/dev/null || true
    docker builder prune --all --force >/dev/null 2>&1 || true
    used=$(used_percent)
  fi
  state=ok
  [ "$used" -ge "$full_percent" ] && state=full
  printf '%s\n' "$state" >"$markers/clean-$1.tmp"
  mv "$markers/clean-$1.tmp" "$markers/clean-$1"
  echo "janitor: cleaned up after job $1; scratch volume ${used}% used (${state})"
}

trap 'exit 0' TERM INT
while :; do
  for done_marker in "$markers"/done-*; do
    [ -e "$done_marker" ] || continue
    n=${done_marker##*/done-}
    [ -e "$markers/clean-$n" ] || clean "$n"
  done
  # In the background and waited on, so the trap above runs straight away.
  sleep 2 &
  wait $!
done
