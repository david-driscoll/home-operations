#!/bin/sh
# Forgejo post-boot provisioner. Runs to completion on every stack start
# (see forgejo-provision in compose.yaml) and reconciles the two pieces of
# state that live in the database rather than app.ini:
#
#   1. the break-glass local admin account
#   2. the authentik OAuth2 authentication source
#
# Both steps are idempotent: existing objects are updated, not duplicated.
# The auth source name ("authentik") is load-bearing — it is baked into the
# OIDC callback path that definition.yaml registers with authentik:
#   https://git.<domain>/user/oauth2/authentik/callback
# Renaming it here without updating definition.yaml breaks login.
set -eu

AUTH_NAME="authentik"

echo "[forgejo-provision] reconciling local admin '${FORGEJO_ADMIN_USER}'"
if forgejo admin user list --admin | awk 'NR > 1 { print $2 }' | grep -qx "${FORGEJO_ADMIN_USER}"; then
  echo "[forgejo-provision] admin already exists — leaving it untouched"
else
  forgejo admin user create \
    --admin \
    --username "${FORGEJO_ADMIN_USER}" \
    --email "${FORGEJO_ADMIN_EMAIL}" \
    --password "${FORGEJO_ADMIN_PASSWORD}" \
    --must-change-password=false
  echo "[forgejo-provision] admin created"
fi

echo "[forgejo-provision] reconciling OAuth2 source '${AUTH_NAME}'"
auth_id="$(forgejo admin auth list | awk -v n="${AUTH_NAME}" 'NR > 1 && $2 == n { print $1 }')"
if [ -n "${auth_id}" ]; then
  forgejo admin auth update-oauth \
    --id "${auth_id}" \
    --name "${AUTH_NAME}" \
    --provider openidConnect \
    --key "${FORGEJO_OIDC_CLIENT_ID}" \
    --secret "${FORGEJO_OIDC_CLIENT_SECRET}" \
    --auto-discover-url "${FORGEJO_OIDC_DISCOVERY_URL}" \
    --scopes "openid profile email"
  echo "[forgejo-provision] OAuth2 source updated (id ${auth_id})"
else
  forgejo admin auth add-oauth \
    --name "${AUTH_NAME}" \
    --provider openidConnect \
    --key "${FORGEJO_OIDC_CLIENT_ID}" \
    --secret "${FORGEJO_OIDC_CLIENT_SECRET}" \
    --auto-discover-url "${FORGEJO_OIDC_DISCOVERY_URL}" \
    --scopes "openid profile email"
  echo "[forgejo-provision] OAuth2 source created"
fi

echo "[forgejo-provision] done"
