#!/bin/sh
# keepalived track script: can the Pi serve an authentik login right now?
#
# 127.0.0.1:9000 is authentik-server's loopback-only publish
# (docker/alpha-site/authentik/compose.yaml) -- this container is on the host
# network and cannot resolve dockge_default names. /-/health/ready/ includes
# the database; /live/ would pass with the database gone.
wget -q -T 3 -O /dev/null http://127.0.0.1:9000/-/health/ready/ || exit 1
nc -z -w 2 127.0.0.1 443 || exit 1
