#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/opt/stacks-data/${APP}"
TOKEN_FILE="${DATA_DIR}/agent-token.env"
API="https://arcane.${searchDomain}/api/environments"
API_KEY="op://Eris/Arcane/api_key"
NAME="${host}"
# Direct mode: the manager dials the agent, so this must be the Traefik ingress
# in front of the agent's :3553, not the container port.
API_URL="https://arcane-agent.${CLUSTER_DOMAIN}"

mkdir -p "${DATA_DIR}"

api() {
  curl -fsS --max-time 10 \
    -H "X-Api-Key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    "$@"
}

# Already bootstrapped: converge the manager-side record rather than exiting
# blind. Registration is one-shot, so without this a host keeps whatever apiUrl
# it was first created with even after this file changes.
if [ -s "${TOKEN_FILE}" ]; then
  echo "Agent token already provisioned at ${TOKEN_FILE}; reconciling manager record..."

  RESPONSE=""
  ENV_JSON=""
  RESPONSE="$(api --get --data-urlencode "search=${NAME}" --data-urlencode "limit=100" "${API}")" \
    && ENV_JSON="$(jq -c --arg name "${NAME}" 'first(.data[]? | select(.name == $name)) // empty' <<<"${RESPONSE}")" || true

  if [ -z "${ENV_JSON}" ]; then
    echo "WARNING: no environment named ${NAME} found on the manager; leaving ${TOKEN_FILE} untouched (non-fatal)" >&2
    exit 0
  fi

  ENV_ID="$(jq -r '.id' <<<"${ENV_JSON}")"

  # PUT /environments/{id} accepts apiUrl/name/enabled/accessToken/regenerateApiKey
  # but not isEdge, so an environment first created as edge cannot be converted
  # to direct in place — it has to be recreated.
  if [ "$(jq -r '.isEdge' <<<"${ENV_JSON}")" = "true" ]; then
    echo "WARNING: environment ${NAME} (${ENV_ID}) is registered as edge, and the API cannot flip isEdge." >&2
    echo "         Delete it in Arcane and remove ${TOKEN_FILE} to re-register in direct mode." >&2
    exit 0
  fi

  CURRENT_URL="$(jq -r '.apiUrl // empty' <<<"${ENV_JSON}")"
  if [ "${CURRENT_URL}" = "${API_URL}" ]; then
    echo "Environment ${NAME} (${ENV_ID}) already points at ${API_URL}"
    exit 0
  fi

  if api -X PUT "${API}/${ENV_ID}" -d "$(jq -n --arg apiUrl "${API_URL}" '{apiUrl: $apiUrl}')" >/dev/null; then
    echo "Updated ${NAME} (${ENV_ID}) apiUrl: ${CURRENT_URL:-<unset>} -> ${API_URL}"
  else
    echo "WARNING: failed to update apiUrl for ${NAME} (${ENV_ID}) (non-fatal)" >&2
  fi

  exit 0
fi

echo "Registering ${NAME} as a new Arcane remote environment..."

BODY="$(jq -n --arg name "${NAME}" --arg apiUrl "${API_URL}" \
  '{name: $name, apiUrl: $apiUrl, isEdge: false, useApiKey: true}')"

RESPONSE=""
TOKEN=""
for attempt in 1 2 3; do
  RESPONSE="$(api -X POST "${API}" -d "${BODY}")" && TOKEN="$(jq -r '.data.apiKey // empty' <<<"${RESPONSE}")" || true

  if [ -n "${TOKEN}" ]; then
    break
  fi

  echo "Attempt ${attempt}/3 to register with Arcane manager failed${RESPONSE:+ (response: ${RESPONSE})}" >&2
  sleep 5
done

if [ -z "${TOKEN}" ]; then
  echo "WARNING: could not register ${NAME} with the Arcane manager after 3 attempts; skipping agent token provisioning (non-fatal)" >&2
  exit 0
fi

echo "AGENT_TOKEN=${TOKEN}" > "${TOKEN_FILE}"
echo "Agent token written to ${TOKEN_FILE}"
