#!/bin/sh
# First container in every runner pod (../scaledjob.yaml). Asks Forgejo whether
# any job is still WAITING before the pod spends ten seconds starting a Docker
# daemon to find out the hard way.
#
# KEDA starts a pod for every job the forge reports, and by the time a pod is
# up another one has sometimes taken the job it was started for. Such a pod
# used to start dockerd, ask for a task, get "no task received" and exit 2.
#
# This never fails the pod. When it is SURE nothing is waiting it leaves
# /data/skip behind: the dind sidecar then does not start dockerd, and
# run-job.sh exits 0 at once. On any doubt (the request failed, the answer was
# not what was expected) it leaves nothing and the pod carries on as before.
#
# FORGEJO_URL, RUNNER_LABELS and QUEUE_TOKEN come from the pod spec. The
# endpoint lists waiting AND running jobs; only the waiting ones count here.
set -u

url="${FORGEJO_URL}/api/v1/admin/runners/jobs?labels=${RUNNER_LABELS}"
if ! body="$(wget -q -T 10 -O - --header "Authorization: token ${QUEUE_TOKEN}" "$url")"; then
  echo "queue-check: could not read the queue; carrying on as if a job is waiting"
  exit 0
fi

case "$body" in
  "[]" | "null") waiting=0 ;;
  \[*) waiting="$(printf '%s' "$body" | grep -oE '"status": *"waiting"' | wc -l)" ;;
  *)
    echo "queue-check: unexpected answer from the forge; carrying on"
    exit 0
    ;;
esac

if [ "$waiting" -eq 0 ]; then
  echo "queue-check: no job is waiting; this pod has nothing to do"
  : >/data/skip
else
  echo "queue-check: ${waiting} job(s) waiting"
fi
exit 0
