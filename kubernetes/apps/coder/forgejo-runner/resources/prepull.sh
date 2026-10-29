#!/bin/sh
# Run in the background by the janitor sidecar (./janitor.sh): pull the job
# images into this pod's Docker daemon while the runner waits for a job, so
# the job does not start with a 1.5 GB download.
#
# ONLY FOR A POD THAT IS STILL WAITING. It first gives the runner
# PREPULL_DELAY_SECONDS to take a job, watching the log run-job.sh writes to
# the shared /data. A pod that gets a job in that time pulls nothing here: the
# job pulls the one image it names, and a job that names a small image (or is
# cancelled before it starts, as most github-sync runs in a merge streak are)
# never writes the 1.5 GB act image at all. On 2026-10-28 every pod pulled it
# regardless, 38 times in twenty minutes, and the unpacking saturated the SATA
# /var on fluttershy and kerfuffle. The two spares KEDA keeps waiting are the
# pods that get past the delay, and those are the ones a job lands on first.
#
# PREPULL_IMAGES is a space-separated list. Docker is already up when this
# starts: the dind sidecar's startup probe gates every other container.
#
# ALWAYS EXITS 0: a pull that did not work only means the runner pulls the
# image itself. If a job arrives mid-pull, Docker serves both from the one
# download. A pod reused for later jobs keeps what was pulled
# (./run-job.sh), so this matters only for a pod's first job.
set -u

log=/data/one-job.log
took_job() { grep -q 'successfully fetched one task' "$log" 2>/dev/null; }

waited=0
while [ "$waited" -lt "${PREPULL_DELAY_SECONDS:-60}" ]; do
  if took_job; then
    echo "prepull: the runner took a job within ${waited}s; it pulls what that job needs"
    exit 0
  fi
  sleep 2
  waited=$((waited + 2))
done

for image in ${PREPULL_IMAGES:-}; do
  if docker pull --quiet "$image"; then
    echo "prepull: ${image} is ready"
  else
    echo "prepull: could not pull ${image}; the runner will pull it when a job needs it"
  fi
done
exit 0
