#!/bin/sh
# The region exit's routing init container (docs/plans/region-exits.md §D2, §G).
# It runs once per pod sandbox, before gluetun and tailscaled, in the network
# namespace they share. Technitium's tailscale-routing init is the precedent
# (kubernetes/apps/equestria/dns/technitium/helmrelease.yaml).
#
# Unlike Technitium's, it FAILS CLOSED: any failed step exits non-zero, so the
# pod never starts and tailscaled never advertises an exit node without the
# kill switch below. Flux substitution is disabled on this ConfigMap, so `$` is
# safe here.
set -eu

# Exit-node forwarding. Talos's kubelet allows no unsafe sysctls, so this
# privileged container sets them. Loose rp_filter (2) because forwarded
# replies arrive on tun0 for flows that entered on tailscale0;
# src_valid_mark so marked packets pass the reverse-path check.
sysctl -w net.ipv4.ip_forward=1
sysctl -w net.ipv4.conf.all.src_valid_mark=1
sysctl -w net.ipv4.conf.all.rp_filter=2
sysctl -w net.ipv4.conf.default.rp_filter=2

# --- ip rules ---------------------------------------------------------------
# Priorities in this namespace (§G2, read from the pinned sources):
#   0       local table
#   90      ours: tailscaled's own packets (fwmark 0x80000/0xff0000) -> table 100
#   91      reserved: NetBird's own packets (fwmark 0x1bd00) -> table 100 (#3139)
#   95      ours: to 100.64.0.0/10 -> table 52 (tailscaled's peer routes)
#   98      gluetun: to each local network -> main (routing/local.go)
#   99      gluetun: to FIREWALL_OUTBOUND_SUBNETS -> table 199 (routing/outbound.go)
#   100     gluetun: from the pod IP -> table 200 (routing/inbound.go)
#   101     gluetun: not fwmark 0xca6c (51820) -> table 51820, i.e. tun0,
#           only while the tunnel is up (provider/utils/wireguard.go)
#   105,110 NetBird (client/internal/routemanager/systemops/systemops_linux.go)
#   5210+   tailscaled: mark -> main, default, unreachable; then table 52
#           (wgengine/router/osrouter/router_linux.go)
# Technitium's 100/101 would collide with gluetun's, hence 90 and up.

# Table 100 holds only eth0's routes. Twice: the default route is listed
# before the link route to its gateway, and cannot be added until it exists.
# shellcheck disable=SC2086 # each route line is split into ip arguments
ip -4 route show table main dev eth0 | while read -r route; do
  ip route replace $route dev eth0 table 100 2>/dev/null || true
done
# shellcheck disable=SC2086 # each route line is split into ip arguments
ip -4 route show table main dev eth0 | while read -r route; do
  ip route replace $route dev eth0 table 100
done

# 90: tailscaled's own sockets (WireGuard to peers, DERP, control) leave over
# eth0 to the home WAN, so peers connect directly instead of through DERP.
# Without it gluetun's rule 101 would send them into the tunnel before
# tailscaled's own 5210 is ever reached.
ip rule del priority 90 2>/dev/null || true
ip rule add priority 90 fwmark 0x80000/0xff0000 lookup 100

# 95: replies to Tailscale clients. Forwarded traffic is masqueraded out tun0;
# the replies are de-NATed to the client's 100.x address, and without this
# rule gluetun's 101 would route them back into the tunnel instead of
# tailscale0. If table 52 has no route, the lookup falls through.
ip rule del priority 95 2>/dev/null || true
ip rule add priority 95 to 100.64.0.0/10 lookup 52

# --- kill switch (§G7) --------------------------------------------------------
# tailscaled's nftables mode puts its ts-forward chain in the SAME `filter`
# table and FORWARD chain that gluetun's iptables-nft uses, jumped from the top
# (util/linuxfw/nftables_runner.go AddChains/AddHooks). ts-forward marks and
# ACCEPTS everything arriving on tailscale0, and an accept is final within
# that chain, so gluetun's FORWARD policy DROP never sees client traffic. With
# the tunnel down gluetun deletes rule 101, main's default route via eth0
# applies, and ts-postrouting masquerades it out the home WAN.
#
# So the kill switch lives in the mangle table's FORWARD chain: another base
# chain on the forward hook, where a DROP is final whatever filter accepts.
# Neither gluetun (which only flushes `filter`) nor tailscaled touches it, so it
# survives every reconnect and region switch without a reapply loop (§G3).
# The tunnel is IPv4 only, so IPv6 from tailscale0 is never forwarded at all.
iptables-nft -t mangle -C FORWARD -i tailscale0 ! -o tun0 -j DROP 2>/dev/null \
  || iptables-nft -t mangle -A FORWARD -i tailscale0 ! -o tun0 -j DROP
ip6tables-nft -t mangle -C FORWARD -i tailscale0 -j DROP 2>/dev/null \
  || ip6tables-nft -t mangle -A FORWARD -i tailscale0 -j DROP

# --- local services stay off the overlays -------------------------------------
# tailscaled's ts-input accepts everything arriving on tailscale0 the same way,
# so gluetun's INPUT policy cannot keep overlay clients off the pod's own
# ports either. Drop them in mangle INPUT: gluetun's control server (8000) and
# health server (9999), and the region picker's port (8080, #3140), which is
# meant to be reached only through the internal Gateway behind Authentik.
# wt0 is NetBird's interface (#3139); a rule naming an absent interface is
# valid and matches once it exists. A new pod-local listener goes in this list.
for iface in tailscale0 wt0; do
  for port in 8000 8080 9999; do
    iptables-nft -t mangle -C INPUT -i "$iface" -p tcp --dport "$port" -j DROP 2>/dev/null \
      || iptables-nft -t mangle -A INPUT -i "$iface" -p tcp --dport "$port" -j DROP
    ip6tables-nft -t mangle -C INPUT -i "$iface" -p tcp --dport "$port" -j DROP 2>/dev/null \
      || ip6tables-nft -t mangle -A INPUT -i "$iface" -p tcp --dport "$port" -j DROP
  done
done

echo "table 100:"; ip -4 route show table 100
echo "rules:"; ip rule show
echo "mangle:"; iptables-nft -t mangle -S; ip6tables-nft -t mangle -S
