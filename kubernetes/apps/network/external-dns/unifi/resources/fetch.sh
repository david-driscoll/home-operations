#!/bin/sh
# Init container of ../static-dns-check.yaml (curlimages/curl). Fetches the two
# read-only UniFi views that check.jq judges, into the shared /work emptyDir.
# Any HTTP or network failure exits non-zero, which fails the Job: a check that
# cannot read the gateway must not report it healthy.
#
# Env: UNIFI_HOST (https://<gateway>), UNIFI_API_KEY, WINDOW_MINUTES.
set -eu

api="$UNIFI_HOST/proxy/network/v2/api/site/default"

# The gateway answers 503 for a few seconds now and then (2026-10-20 08:00).
# The Job's own retry starts about 10s later and can hit the same window, so
# curl retries inside one attempt: 408/429/5xx and timeouts, for up to a
# minute. A 401/403/404 is not retried and still fails the run. Worst case is
# about 90s per request, well inside the Job's 300s activeDeadlineSeconds.
retry="--retry 4 --retry-delay 10 --retry-max-time 60"

# shellcheck disable=SC2086 # $retry is a list of flags
curl -fsS --max-time 30 $retry -H "X-API-KEY: $UNIFI_API_KEY" \
  -o /work/static-dns.json "$api/static-dns"

# DEVICE_COMMIT_ERROR = "Gateway Config Change Failed". `keys` is the filter the
# endpoint honours (`searchText` matches nothing, `categories` wants more
# fields). The window is a little wider than the schedule so a run that starts
# late does not miss an event.
now_ms=$(($(date +%s) * 1000))
from_ms=$((now_ms - WINDOW_MINUTES * 60 * 1000))
# shellcheck disable=SC2086 # $retry is a list of flags
curl -fsS --max-time 30 $retry -H "X-API-KEY: $UNIFI_API_KEY" \
  -H 'content-type: application/json' -X POST \
  -d "{\"timestampFrom\":$from_ms,\"timestampTo\":$now_ms,\"pageSize\":100,\"pageNumber\":0,\"keys\":[\"DEVICE_COMMIT_ERROR\"]}" \
  -o /work/commit-errors.json "$api/system-log/all"

echo "fetched static-dns and DEVICE_COMMIT_ERROR events for the last $WINDOW_MINUTES minutes"
