#!/bin/sh
# Render keepalived.conf for THIS node (init container). Every node runs the same
# DaemonSet but needs its own source address, interface and peer list.
#
# Inputs: NODE_IP / NODE_NAME (Downward API), VRRP_PASSWORD (secret),
# VRRP_PEERS (every participant's address, this node included -- it is removed
# here, because a node listing itself as a unicast peer talks to itself).
set -eu

: "$NODE_IP" "$NODE_NAME" "$VRRP_PASSWORD" "$VRRP_PEERS"

# The interface that carries the node's own address. Talos nodes differ
# (ens*, enp*s*, eth*), so it is discovered rather than configured. Parsed from
# the multi-line form: busybox `ip` has no reliable one-line output.
iface=$(ip -4 addr show | awk -v ip="$NODE_IP" '
  /^[0-9]+: / { name = $2; sub(/:$/, "", name); sub(/@.*/, "", name) }
  $1 == "inet" { split($2, a, "/"); if (a[1] == ip) { print name; exit } }
')
if [ -z "$iface" ]; then
  echo "render: no interface carries $NODE_IP" >&2
  ip -4 addr show >&2
  exit 1
fi

peers=""
for peer in $VRRP_PEERS; do
  [ "$peer" = "$NODE_IP" ] && continue
  peers="${peers}        ${peer}
"
done

umask 077
awk -v peers="$peers" '{ if ($0 == "@PEERS@") printf "%s", peers; else print }' /config/keepalived.conf.tmpl \
  | sed -e "s|@NODE_IP@|$NODE_IP|g" \
        -e "s|@NODE_NAME@|$NODE_NAME|g" \
        -e "s|@IFACE@|$iface|g" \
        -e "s|@VRRP_PASSWORD@|$VRRP_PASSWORD|g" \
  > /etc/keepalived/keepalived.conf

echo "render: $NODE_NAME $NODE_IP on $iface, peers:$(echo "$peers" | tr -s ' \n' ' ')"
