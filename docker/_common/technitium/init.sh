#!/usr/bin/env bash
# Technitium DNS — init script
# Runs on the DockgeLxc HOST before/after `docker compose up -d`.
# Responsibilities:
#   1. Start the container
#   2. Configure SSO via API (idempotent — always rewrites)
#   3. Initialise or join the cluster (skipped if already in cluster)
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$STACK_DIR"

# Load all resolved env vars (op:// references already expanded by Pulumi)
set -a
# shellcheck disable=SC1091
source .env
set +a

log() { echo "[$(date -u +%T)] $*"; }
die() { echo "[$(date -u +%T)] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Start container
# ---------------------------------------------------------------------------
log "Starting Technitium container..."
docker compose up -d

# ---------------------------------------------------------------------------
# 2. Wait for web service to become ready (up to 5 minutes)
# ---------------------------------------------------------------------------
ADMIN_URL="http://localhost:5380"
READY=false
for i in $(seq 1 60); do
  if curl -sf --max-time 3 "${ADMIN_URL}/api/sso/status" >/dev/null 2>&1; then
    READY=true
    break
  fi
  log "Waiting for Technitium to be ready... (${i}/60)"
  sleep 5
done
$READY || die "Technitium did not become ready within 5 minutes"
log "Technitium is ready."

# ---------------------------------------------------------------------------
# 3. Log in and get auth token
# ---------------------------------------------------------------------------
login_response=$(curl -s --max-time 10 \
  "${ADMIN_URL}/api/user/login?user=admin&pass=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "${DNS_SERVER_ADMIN_PASSWORD}")")
[ -n "$login_response" ] || die "Login failed: no response from server"

TOKEN=$(echo "$login_response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('status') != 'ok':
    print(d.get('errorMessage', 'unknown error'), file=sys.stderr)
    sys.exit(1)
print(d['token'])
") || die "Login failed"
log "Login successful."

_api_call() {
  local max_time="$1" method="$2"; shift 2
  local response curl_exit
  response=$(curl -s --max-time "$max_time" -X POST "${ADMIN_URL}/api/${method}?token=${TOKEN}" "$@")
  curl_exit=$?
  if [ "$curl_exit" -ne 0 ]; then
    log "API call failed (${method}, curl exit ${curl_exit})" >&2
    return "$curl_exit"
  fi
  local api_status err_msg
  api_status=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','ok'))" 2>/dev/null || echo "ok")
  if [ "$api_status" != "ok" ]; then
    err_msg=$(echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('errorMessage', json.dumps(d)))
" 2>/dev/null || echo "$response")
    log "API error (${method}): ${err_msg}" >&2
    return 1
  fi
  echo "$response"
}

api() {
  _api_call 15 "$@"
}

api_slow() {
  # Some endpoints (e.g. admin/sso/set) trigger outbound OIDC discovery requests
  # that can take >15s. Use a longer timeout for those.
  _api_call 60 "$@"
}

# ---------------------------------------------------------------------------
# 4. Configure SSO (always applied to fix/update values at runtime)
# ---------------------------------------------------------------------------
log "Configuring SSO..."
# Build the group map: remoteGroup|localGroup (pipe-separated, using "|" as field sep)
GROUP_MAP="admins|Administrators"

api_slow "admin/sso/set" \
  --data-urlencode "ssoEnabled=true" \
  --data-urlencode "ssoAuthority=${DNS_SERVER_SSO_AUTHORITY}" \
  --data-urlencode "ssoClientId=${DNS_SERVER_SSO_CLIENT_ID}" \
  --data-urlencode "ssoClientSecret=${DNS_SERVER_SSO_CLIENT_SECRET}" \
  --data-urlencode "ssoScopes=openid|profile|email" \
  --data-urlencode "ssoAllowSignup=true" \
  --data-urlencode "ssoAllowSignupOnlyForMappedUsers=true" \
  --data-urlencode "ssoGroupMap=${GROUP_MAP}" \
  >/dev/null || die "SSO configuration failed"
log "SSO configured."

# SSO change triggers a hot-restart of the web service; wait for it to come back
sleep 5
for i in $(seq 1 24); do
  if curl -sf --max-time 3 "${ADMIN_URL}/api/sso/status" >/dev/null 2>&1; then
    break
  fi
  log "Waiting for web service restart after SSO change... (${i}/24)"
  sleep 5
done

# Re-login after restart
login_response=$(curl -s --max-time 10 \
  "${ADMIN_URL}/api/user/login?user=admin&pass=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "${DNS_SERVER_ADMIN_PASSWORD}")")
[ -n "$login_response" ] || die "Re-login after SSO restart failed: no response from server"

TOKEN=$(echo "$login_response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('status') != 'ok':
    print(d.get('errorMessage', 'unknown error'), file=sys.stderr)
    sys.exit(1)
print(d['token'])
") || die "Re-login after SSO restart failed"
log "Re-login successful after SSO restart."

# ---------------------------------------------------------------------------
# 5. Configure forwarders (Quad9 over TLS — always applied to keep in sync)
# ---------------------------------------------------------------------------
log "Configuring forwarders (Quad9 DoT)..."
api_slow "settings/set" \
  --data-urlencode "forwarders=9.9.9.9, 149.112.112.112, [2620:fe::fe], [2620:fe::9]" \
  --data-urlencode "forwarderProtocol=Tls" \
  --data-urlencode "concurrentForwarding=true" \
  >/dev/null || die "Forwarder configuration failed"
log "Forwarders configured."

# ---------------------------------------------------------------------------
# 6. Cluster init or join (idempotent — skipped if already in cluster)
# ---------------------------------------------------------------------------
cluster_status=$(api "admin/cluster/state" || echo '{"status":"error"}')
in_cluster=$(echo "$cluster_status" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('true' if d.get('response',{}).get('clusterInitialized') else 'false')" 2>/dev/null || echo "false")

if [ "$in_cluster" = "true" ]; then
  log "Already in cluster — skipping cluster init/join."
elif [ "${DNS_CLUSTER_IS_PRIMARY:-false}" = "true" ]; then
  log "Initialising as PRIMARY cluster node (domain: ${DNS_CLUSTER_DOMAIN})..."
  api "admin/cluster/init" \
    --data-urlencode "clusterDomain=${DNS_CLUSTER_DOMAIN}" \
    --data-urlencode "primaryNodeIpAddresses=${DNS_CLUSTER_NODE_IP}" \
    >/dev/null || die "Cluster init (primary) failed"
  log "Cluster initialised as primary."
else
  log "Joining cluster as SECONDARY (primary: ${DNS_CLUSTER_PRIMARY_URL})..."
  api "admin/cluster/initJoin" \
    --data-urlencode "primaryNodeUrl=${DNS_CLUSTER_PRIMARY_URL}/" \
    --data-urlencode "primaryNodeIpAddress=${DNS_CLUSTER_PRIMARY_IP}" \
    --data-urlencode "ignoreCertificateErrors=true" \
    --data-urlencode "primaryNodeUsername=admin" \
    --data-urlencode "primaryNodePassword=${DNS_SERVER_ADMIN_PASSWORD}" \
    --data-urlencode "secondaryNodeIpAddresses=${DNS_CLUSTER_NODE_IP}" \
    >/dev/null || die "Cluster join failed"
  log "Successfully joined cluster."
fi

log "Technitium init complete."
