#!/bin/bash
# Publish this server's replication role for equestria's keepalived fence
# (kubernetes/apps/network/authentik-vip, check-fence.sh; PLAN.md decision 10).
#
# Writes "standby", "primary" or "unknown" to /status/role every 10 seconds;
# the role-http container serves that file on the Pi's LAN address.
#
# "unknown" (server down, socket missing) deliberately reads as NOT promoted on
# the other side: a stopped standby is not a promoted one, and the fence must
# not turn a Pi outage into an equestria outage.
#
# Over the shared unix socket with peer auth -- no password, and nothing on the
# network can ask this question except by reading the published answer.
set -uo pipefail

while true; do
  role=$(psql -h /var/run/postgresql -U postgres -d postgres -tAc \
    "select case when pg_is_in_recovery() then 'standby' else 'primary' end" 2>/dev/null) || role=unknown
  [ -n "$role" ] || role=unknown
  printf '%s\n' "$role" >/status/role.tmp && mv -f /status/role.tmp /status/role
  sleep 10
done
