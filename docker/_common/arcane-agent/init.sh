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

RESPONSE="$(curl -fsS -X POST "https://arcane.${searchDomain}/api/environments" \
  -H "X-Api-Key: op://Eris/Arcane/api_key" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg name "${host}" --arg apiUrl "http://${ipAddress}:3553" \
    '{name: $name, apiUrl: $apiUrl, isEdge: true, useApiKey: true}')")"

TOKEN="$(jq -r '.data.apiKey // empty' <<<"${RESPONSE}")"

if [ -z "${TOKEN}" ]; then
  echo "Failed to obtain agent token from manager response: ${RESPONSE}" >&2
  exit 1
fi

echo "AGENT_TOKEN=${TOKEN}" > "${TOKEN_FILE}"
echo "Agent token written to ${TOKEN_FILE}"
