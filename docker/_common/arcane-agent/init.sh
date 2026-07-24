#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/opt/stacks-data/${APP}"
TOKEN_FILE="${DATA_DIR}/agent-token.env"

mkdir -p "${DATA_DIR}"

if [ -s "${TOKEN_FILE}" ]; then
  echo "Agent token already provisioned at ${TOKEN_FILE}"
  exit 0
fi

echo "Registering ${host} as a new Arcane remote environment..."

BODY="$(jq -n --arg name "${host}" --arg apiUrl "http://${ipAddress}:3553" \
  '{name: $name, apiUrl: $apiUrl, isEdge: true, useApiKey: true}')"

TOKEN=""
for attempt in 1 2 3; do
  RESPONSE="$(curl -fsS --max-time 10 -X POST "https://arcane.${searchDomain}/api/environments" \
    -H "X-Api-Key: op://Eris/Arcane/api_key" \
    -H "Content-Type: application/json" \
    -d "${BODY}")" && TOKEN="$(jq -r '.data.apiKey // empty' <<<"${RESPONSE}")" || true

  if [ -n "${TOKEN}" ]; then
    break
  fi

  echo "Attempt ${attempt}/3 to register with Arcane manager failed${RESPONSE:+ (response: ${RESPONSE})}" >&2
  sleep 5
done

if [ -z "${TOKEN}" ]; then
  echo "WARNING: could not register ${host} with the Arcane manager after 3 attempts; skipping agent token provisioning (non-fatal)" >&2
  exit 0
fi

echo "AGENT_TOKEN=${TOKEN}" > "${TOKEN_FILE}"
echo "Agent token written to ${TOKEN_FILE}"
