#!/bin/bash
# The runner container's command (../scaledjob.yaml): take one job, run it,
# exit.
#
# Two cases end here with exit 0 and no job run, because neither is a failure:
#
# - queue-check.sh found nothing waiting and left /data/skip. Nothing was
#   started for this pod; leave straight away.
# - a job WAS waiting a moment ago, but another pod took it first. The runner
#   says "no task received" and exits non-zero, which showed every such pod as
#   Error.
#
# Anything else keeps the runner's own exit status. A workflow job that fails
# is not one of those: the runner reports that to Forgejo and still exits 0.
set -u -o pipefail

if [ -f /data/skip ]; then
  echo "run-job: no job was waiting when this pod started; nothing to do"
  exit 0
fi

log=/data/one-job.log
forgejo-runner one-job --config /config/config.yml 2>&1 | tee "$log"
status="${PIPESTATUS[0]}"

if [ "$status" -ne 0 ] && grep -q 'no task received' "$log"; then
  echo "run-job: the job was taken by another runner first; nothing to do"
  exit 0
fi
exit "$status"
