#!/bin/sh
# Init container of ../static-dns-check.yaml (curlimages/curl). Fetches the two
# read-only UniFi views that check.jq judges, into the shared /work emptyDir.
# Any HTTP or network failure exits non-zero, which fails the Job: a check that
# cannot read the gateway must not report it healthy.
#
# Env: UNIFI_HOST (https://<gateway>), UNIFI_API_KEY, WINDOW_MINUTES.
set -eu

api="$UNIFI_HOST/proxy/network/v2/api/site/default"

curl -fsS --max-time 30 -H "X-API-KEY: $UNIFI_API_KEY" \
  -o /work/static-dns.json "$api/static-dns"

# DEVICE_COMMIT_ERROR = "Gateway Config Change Failed". `keys` is the filter the
# endpoint honours (`searchText` matches nothing, `categories` wants more
# fields). The window is a little wider than the schedule so a run that starts
# late does not miss an event.
now_ms=$(($(date +%s) * 1000))
from_ms=$((now_ms - WINDOW_MINUTES * 60 * 1000))
curl -fsS --max-time 30 -H "X-API-KEY: $UNIFI_API_KEY" \
  -H 'content-type: application/json' -X POST \
  -d "{\"timestampFrom\":$from_ms,\"timestampTo\":$now_ms,\"pageSize\":100,\"pageNumber\":0,\"keys\":[\"DEVICE_COMMIT_ERROR\"]}" \
  -o /work/commit-errors.json "$api/system-log/all"

echo "fetched static-dns and DEVICE_COMMIT_ERROR events for the last $WINDOW_MINUTES minutes"
