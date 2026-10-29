#!/bin/bash
# The runner container's command (../scaledjob.yaml): run jobs one after
# another for as long as there are jobs, then exit.
#
# Each job is one `forgejo-runner one-job --wait`. After it, the janitor
# sidecar (./janitor.sh) clears what the job left in Docker -- containers,
# networks, volumes, dangling images -- but keeps the pulled job images, so
# the next job on this pod starts without a 1.5 GB pull. The two hand over
# through marker files in /data/.reuse: this script writes done-N, the
# janitor answers clean-N with `ok`, or `full` if the scratch volume is still
# nearly full after pruning.
#
# WHY NOT ONE JOB PER POD ANY MORE. On 2026-10-28 a merge streak started 38
# pods in twenty minutes, most of them for a job that finished or was
# cancelled within a minute, and every one pulled and unpacked the act image.
# A pod that stays for the next job is one pull and one scratch volume attach
# for the whole streak. KEDA counts a pod waiting between jobs as an
# unfinished Job and starts that many fewer, so a finished pod takes the next
# job instead of a new pod.
#
# HOW LONG A POD STAYS:
#  - a fresh pod waits IDLE_MAX_SECONDS for its first job (it is one of the
#    two spares KEDA keeps);
#  - after a job, it waits REUSE_IDLE_SECONDS for another and exits if none
#    comes, which is how the pool shrinks once the queue is empty;
#  - it never starts waiting past IDLE_MAX_SECONDS of age, so a job taken
#    then still has its 3h plus 30m shutdown inside activeDeadlineSeconds;
#  - SIGTERM lets the current job finish and starts no other.
# Leaving is also how a pod ever picks up a new image, config or
# registration, since changes to the ScaledJob leave existing pods alone.
#
# An idle wait is ended with a SIGTERM, sent only after checking the log that
# no job has been taken. A job handed over in the instant between that check
# and the signal would be cut short; Forgejo shows such a job as failed, not
# as lost.
#
# Exit status: 0 when the pod leaves after its jobs or an idle wait (whatever
# the jobs' own results -- the runner reports those to Forgejo); the runner's
# own status when it fails without having taken a job.
set -u

# Every job's runner output, in order. ./prepull.sh reads it to tell a pod
# started for a job from a spare.
log=/data/one-job.log
markers=/data/.reuse
: >"$log"
mkdir -p "$markers"

idle_max=${IDLE_MAX_SECONDS:-21600}
reuse_idle=${REUSE_IDLE_SECONDS:-300}
janitor_wait=${JANITOR_WAIT_SECONDS:-180}
started=$(date +%s)
last_wait=$((started + idle_max))

took_job() { grep -q 'successfully fetched one task' "$1"; }

stopping=0
runner=
trap 'stopping=1; [ -n "$runner" ] && kill -TERM "$runner" 2>/dev/null' TERM INT

jobs=0
while [ "$stopping" -eq 0 ]; do
  now=$(date +%s)
  if [ "$jobs" -eq 0 ]; then
    deadline=$last_wait
    limit=$idle_max
  else
    deadline=$((now + reuse_idle))
    [ "$deadline" -gt "$last_wait" ] && deadline=$last_wait
    limit=$reuse_idle
  fi
  if [ "$now" -ge "$deadline" ]; then
    echo "run-job: pod is $((now - started))s old; not waiting for another job"
    exit 0
  fi

  this="$markers/job-$((jobs + 1)).log"
  : >"$this"
  # No connection flags here (`--url`, `--label`, `--fetch-interval`, ...): any
  # one of them makes the runner refuse the server.connections in the config.
  forgejo-runner one-job --wait --config /config/config.yml > >(tee -a "$log" "$this") 2>&1 &
  runner=$!

  idled_out=0
  while kill -0 "$runner" 2>/dev/null; do
    if [ "$idled_out" -eq 0 ] && [ "$(date +%s)" -ge "$deadline" ] && ! took_job "$this"; then
      echo "run-job: no job in ${limit}s; leaving"
      idled_out=1
      kill -TERM "$runner" 2>/dev/null
    fi
    # In the background and waited on, so the trap above runs straight away.
    sleep 5 &
    wait $!
  done
  wait "$runner"
  status=$?
  runner=

  if ! took_job "$this"; then
    if [ "$idled_out" -eq 1 ] || [ "$stopping" -eq 1 ]; then
      exit 0
    fi
    exit "$status"
  fi
  jobs=$((jobs + 1))
  if [ "$status" -ne 0 ]; then
    echo "run-job: the runner exited ${status} after job ${jobs}; not reusing this pod"
    exit "$status"
  fi
  [ "$stopping" -eq 1 ] && exit 0

  touch "$markers/done-$jobs"
  waited=0
  until [ -e "$markers/clean-$jobs" ]; do
    if [ "$waited" -ge "$janitor_wait" ] || [ "$stopping" -eq 1 ]; then
      echo "run-job: Docker was not cleaned up after job ${jobs} within ${janitor_wait}s; leaving"
      exit 0
    fi
    sleep 2 &
    wait $!
    waited=$((waited + 2))
  done
  if [ "$(cat "$markers/clean-$jobs")" = full ]; then
    echo "run-job: the scratch volume is still nearly full after job ${jobs}; leaving"
    exit 0
  fi
  echo "run-job: job ${jobs} done; waiting up to ${reuse_idle}s for another"
done
exit 0
