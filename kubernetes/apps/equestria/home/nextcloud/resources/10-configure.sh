#!/bin/sh
# shellcheck shell=sh
#
# Nextcloud `before-starting` hook (/docker-entrypoint-hooks.d/before-starting/).
# The image's entrypoint runs it on EVERY start, as www-data, AFTER its own
# install-or-upgrade step and before Apache starts. Everything here is
# idempotent; it is the declarative half of the deployment.
#
# A non-zero exit aborts the container start, so only the config copy -- which
# the instance cannot run correctly without -- is allowed to fail the pod.
# Everything that talks to the network (app store, Collabora) only warns.
#
# Variables are written as plain `$VAR`, never the braced form, anywhere in
# this file. Flux substitution is disabled for the ConfigMap (see
# ../kustomization.yaml), and keeping braces out means that stays true even if
# the annotation is ever lost.

occ() { php /var/www/html/occ "$@"; }

# --- 1. config.php overlays -------------------------------------------------
# Mounted at /opt/nextcloud rather than into config/ -- see ../kustomization.yaml.
cp -f /opt/nextcloud/zz-*.config.php /var/www/html/config/ || exit 1
# Pretty URLs need htaccess.RewriteBase (zz-app.config.php) written into
# .htaccess; on first boot the overlay did not exist yet when the image ran its
# own htaccess update.
occ maintenance:update:htaccess >/dev/null || echo "WARN: htaccess update failed"

# --- 2. apps ----------------------------------------------------------------
# Installed apps persist in custom_apps/ on the PVC, so the app store is only
# needed the first time. It returned 503 for much of 2026-09-26: warn, move on,
# and the next restart tries again.
#
# Deck is deliberately absent: its Nextcloud 35 build (stable35) was still
# 1.19.0-dev when this was written. Add it here once it is in the store.
for app in user_oidc calendar contacts notes richdocuments; do
  occ app:enable "$app" >/dev/null 2>&1 \
    || occ app:install "$app" \
    || echo "WARN: could not enable or install $app"
done

# cron.php is driven by the `cron` sidecar in ../helmrelease.yaml.
occ background:cron

# --- 3. metrics -------------------------------------------------------------
# serverinfo ships enabled; the exporter sidecar authenticates with this token
# (NC-Token header), so no admin credential is handed to it.
if [ -n "$NC_METRICS_TOKEN" ]; then
  occ config:app:set serverinfo token --value="$NC_METRICS_TOKEN" >/dev/null
fi

# --- 4. SSO via authentik ---------------------------------------------------
# OIDC_* come from the `nextcloud-oidc` Secret, which does not exist until
# `stacks/system` has read ../definition.yaml and created the provider.
# Until then this block is skipped and the local login form stays available;
# Reloader restarts the pod when the Secret lands and this block runs.
if [ -n "$OIDC_CLIENT_ID" ] && [ -n "$OIDC_DISCOVERY_URL" ]; then
  # --unique-uid=0 + preferred_username: the Nextcloud user id IS the authentik
  # username (what OpenCloud used), so do not rename people in authentik.
  # Group provisioning mirrors ONLY groups matching the whitelist: family,
  # admins and admin are added AND removed to match the claim on every web
  # login, while hand-made sharing groups in Nextcloud are left alone. `admin`
  # is Nextcloud's own administrators group; the nextcloud_groups claim adds it
  # for members of authentik's `admins`, so admin rights follow authentik. The
  # local break-glass `ncadmin` never logs in via OIDC and keeps its membership.
  # --clientsecret-env keeps the secret off the command line; output is
  # discarded because the command echoes the provider back.
  occ user_oidc:provider authentik \
    --clientid="$OIDC_CLIENT_ID" \
    --clientsecret-env=OIDC_CLIENT_SECRET \
    --discoveryuri="$OIDC_DISCOVERY_URL" \
    --scope="openid email profile groups nextcloud_groups" \
    --unique-uid=0 \
    --mapping-uid=preferred_username \
    --mapping-display-name=name \
    --mapping-email=email \
    --mapping-groups=nextcloud_groups \
    --group-provisioning=1 \
    --group-whitelist-regex='/^(family|admins|admin)$/' \
    --group-restrict-login-to-whitelist=1 \
    --send-id-token-hint=1 \
    --check-bearer=0 >/dev/null \
    || echo "WARN: user_oidc provider not configured"
  # Send the login page straight to authentik. The break-glass `ncadmin`
  # account still signs in at /login?direct=1.
  occ config:app:set user_oidc allow_multiple_user_backends --value=0 >/dev/null
fi

# --- 5. Nextcloud Office (Collabora) ----------------------------------------
# Both URLs are the public one: the server fetches /hosting/discovery through
# the gateway exactly as OpenCloud did, and the browser loads the editor from
# the same origin. Collabora is shed overnight by the downscaler while this pod
# is not, so activate-config failing at 3am is expected -- warn only.
if [ -n "$COLLABORA_URL" ]; then
  occ config:app:set richdocuments wopi_url --value="$COLLABORA_URL" >/dev/null
  occ config:app:set richdocuments public_wopi_url --value="$COLLABORA_URL" >/dev/null
  occ richdocuments:activate-config >/dev/null 2>&1 \
    || echo "WARN: Collabora discovery failed (is nextcloud-collabora up?)"
fi

exit 0
