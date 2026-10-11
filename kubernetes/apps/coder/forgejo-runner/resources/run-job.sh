#!/bin/bash
# The runner container's command (../scaledjob.yaml): wait for one job, run
# it, exit.
#
# `forgejo-runner one-job --wait` does all of that except one thing: it would
# wait for ever. A pod that has waited IDLE_MAX_SECONDS without being given a
# job is told to stop and exits 0, so that KEDA starts a fresh one in its
# place. That is how a waiting pod ever picks up a new image, a changed config
# or a rotated registration, since changes to the ScaledJob leave existing
# pods alone.
#
# The stop is a SIGTERM, sent only after checking the log that no job has
# been taken. A job handed over in the instant between that check and the
# signal would be cut short; the window is milliseconds every six hours, and
# Forgejo shows such a job as failed, not as lost.
#
# Exit status: 0 when a job ran (whatever the job's own result -- the runner
# reports that to Forgejo) and when the idle limit was reached; the runner's
# own status for anything else.
set -u

log=/data/one-job.log
: >"$log"
took_job() { grep -q 'successfully fetched one task' "$log"; }

# 2s, not the 10s in the config: these pods exist to pick a job up quickly,
# and two of them asking is a trivial load.
forgejo-runner one-job --wait --fetch-interval 2s --config /config/config.yml > >(tee "$log") 2>&1 &
runner=$!
trap 'kill -TERM "$runner" 2>/dev/null' TERM INT

deadline=$(($(date +%s) + ${IDLE_MAX_SECONDS:-21600}))
idled_out=0
while kill -0 "$runner" 2>/dev/null; do
  if [ "$idled_out" -eq 0 ] && [ "$(date +%s)" -ge "$deadline" ] && ! took_job; then
    echo "run-job: no job in ${IDLE_MAX_SECONDS:-21600}s; making way for a fresh pod"
    idled_out=1
    kill -TERM "$runner" 2>/dev/null
  fi
  # In the background and waited on, so the trap above runs straight away.
  sleep 5 &
  wait $!
done

wait "$runner"
status=$?
if [ "$idled_out" -eq 1 ] && ! took_job; then
  exit 0
fi
exit "$status"
