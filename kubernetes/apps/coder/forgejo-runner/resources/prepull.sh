#!/bin/sh
# The `prepull` container's command (../scaledjob.yaml): pull the job images
# into this pod's Docker daemon while the runner waits for a job, so the job
# does not start with a 1.5 GB download.
#
# PREPULL_IMAGES is a space-separated list. Docker is already up when this
# starts: the dind sidecar's startup probe gates every other container.
#
# ALWAYS EXITS 0. In a Job pod a container that fails fails the pod, and a
# pull that did not work only means the runner pulls the image itself. If a
# job arrives mid-pull, Docker serves both from the one download.
set -u

for image in ${PREPULL_IMAGES:-}; do
  if docker pull --quiet "$image"; then
    echo "prepull: ${image} is ready"
  else
    echo "prepull: could not pull ${image}; the runner will pull it when a job needs it"
  fi
done
exit 0
