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
login_response=$(curl -sf --max-time 10 \
  "${ADMIN_URL}/api/user/login?user=admin&pass=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "${DNS_SERVER_ADMIN_PASSWORD}")" \
  || die "Login failed")

TOKEN=$(echo "$login_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" \
  || die "Failed to parse login token")
log "Login successful."

api() {
  local method="$1"; shift
  curl -sf --max-time 15 -X POST "${ADMIN_URL}/api/${method}?token=${TOKEN}" "$@"
}

# ---------------------------------------------------------------------------
# 4. Configure SSO (always applied to fix/update values at runtime)
# ---------------------------------------------------------------------------
log "Configuring SSO..."
# Build the group map: remoteGroup|localGroup (pipe-separated, using "|" as field sep)
GROUP_MAP="admins|Administrators"

api "admin/sso/set" \
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
login_response=$(curl -sf --max-time 10 \
  "${ADMIN_URL}/api/user/login?user=admin&pass=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "${DNS_SERVER_ADMIN_PASSWORD}")" \
  || die "Re-login after SSO restart failed")
TOKEN=$(echo "$login_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" \
  || die "Failed to parse re-login token")
log "Re-login successful after SSO restart."

# ---------------------------------------------------------------------------
# 5. Configure forwarders (Quad9 over TLS — always applied to keep in sync)
# ---------------------------------------------------------------------------
log "Configuring forwarders (Quad9 DoT)..."
api "settings/set" \
  --data-urlencode "forwarders=9.9.9.9, 149.112.112.112, [2620:fe::fe], [2620:fe::9]" \
  --data-urlencode "forwarderProtocol=Tls" \
  --data-urlencode "concurrentForwarding=true" \
  >/dev/null || die "Forwarder configuration failed"
log "Forwarders configured."

# ---------------------------------------------------------------------------
# 6. Cluster init or join (idempotent — skipped if already in cluster)
# ---------------------------------------------------------------------------
cluster_status=$(api "admin/cluster/get" || echo '{"status":"error"}')
in_cluster=$(echo "$cluster_status" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('true' if d.get('response',{}).get('enabled') else 'false')" 2>/dev/null || echo "false")

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
    --data-urlencode "primaryNodeUsername=admin" \
    --data-urlencode "primaryNodePassword=${DNS_SERVER_ADMIN_PASSWORD}" \
    --data-urlencode "secondaryNodeIpAddresses=${DNS_CLUSTER_NODE_IP}" \
    >/dev/null || die "Cluster join failed"
  log "Successfully joined cluster."
fi

log "Technitium init complete."
