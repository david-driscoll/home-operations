#!/bin/sh
# keepalived track script: can equestria serve an authentik login right now?
#
# /-/health/ready/ rather than /live/: ready includes the database, and a site
# whose authentik cannot reach authentik-pg must not hold the VIP.
#
# Both checks go to cluster Services from the host network namespace (the pod is
# hostNetwork). Phase 6's gate verifies that path from a keepalived pod before
# the VIP is trusted -- if it ever fails on every node, the effect is safe (the
# Pi keeps the VIP), but it is not the design.
wget -q -T 3 -O /dev/null "http://authentik-server.stargate-command.svc.cluster.local/-/health/ready/" || exit 1
nc -z -w 2 traefik.network.svc.cluster.local 443 || exit 1
