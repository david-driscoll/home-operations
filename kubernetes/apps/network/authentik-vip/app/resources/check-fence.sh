#!/bin/sh
# keepalived track script: the split-brain fence (PLAN.md decision 10).
#
# The alpha-site standby publishes its role -- "standby" or "primary" -- on the
# Pi's LAN address (docker/alpha-site/authentik-pg-standby, the role sidecar).
#
#   "primary"             -> FAIL. The Pi was promoted; equestria's authentik-pg
#                            is stale, and this site must not take the VIP back.
#   "standby"             -> pass.
#   unreachable / garbage -> pass. A dead Pi is not a promoted Pi, and failing
#                            here would let a Pi outage take the VIP off
#                            equestria too.
role=$(wget -q -T 4 -O - http://10.10.10.9:5480/role 2>/dev/null | tr -d '[:space:]')
[ "$role" != "primary" ]
