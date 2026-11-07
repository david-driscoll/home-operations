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

# No IPv6 in this namespace (§G). The tunnel is IPv4 only (WIREGUARD_ADDRESSES
# is a /32), but gluetun decides IPv6 support from whether ANY non-loopback
# IPv6 route exists (internal/netlink/ipv6.go, v3.41.3), and eth0's fe80::/64
# is one. It then picked IPv6 Mullvad endpoints and added an IPv6 rule 101
# that a restart trips over ("file exists"). With IPv6 off on every interface,
# present and future, there are no such routes and gluetun stays IPv4 only;
# it has no setting to force that otherwise.
sysctl -w net.ipv6.conf.all.disable_ipv6=1
sysctl -w net.ipv6.conf.default.disable_ipv6=1

# --- ip rules ---------------------------------------------------------------
# Priorities in this namespace (§G2, read from the pinned sources):
#   0       local table
#   90      ours: tailscaled's own packets (fwmark 0x80000/0xff0000) -> table 100
#   91      ours: NetBird's own packets (fwmark 0x1bd00) -> table 100 (#3139)
#   95      ours: to 100.64.0.0/10 -> table 52 (tailscaled's peer routes)
#   96      ours: to 10.100.0.0/16 -> main, minus its default (wt0's link route)
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

# 91: the same for NetBird (#3139). Its control, signal, relay and WireGuard
# sockets carry 0x1bd00, so P2P to its peers starts from the home WAN.
ip rule del priority 91 2>/dev/null || true
ip rule add priority 91 fwmark 0x1bd00 lookup 100

# 95: replies to Tailscale clients. Forwarded traffic is masqueraded out tun0;
# the replies are de-NATed to the client's 100.x address, and without this
# rule gluetun's 101 would route them back into the tunnel instead of
# tailscale0. If table 52 has no route, the lookup falls through.
ip rule del priority 95 2>/dev/null || true
ip rule add priority 95 to 100.64.0.0/10 lookup 52

# 96: replies to NetBird clients, de-NATed to their 10.100.x address, for the
# same reason. In kernel mode wt0's /16 link route is in main; suppressing
# main's default route makes the lookup fall through while wt0 is down,
# rather than leave by eth0.
ip rule del priority 96 2>/dev/null || true
ip rule add priority 96 to 10.100.0.0/16 lookup main suppress_prefixlength 0

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

# NetBird (#3139) does the same to filter FORWARD: it inserts `-i wt0 -j
# ACCEPT` at position 1, with iptables or else nftables
# (client/firewall/nftables/chains_linux.go acceptFilterTableRules, v0.82.0),
# and its own `netbird` table has forward chains too. It adds accepts to
# other tables' forward chains, but never to iptables-managed ones such as
# mangle (isIptablesTable), so this drop is untouched and final as above.
# IPv6 from wt0 (management routes ::/0 to an exit for peers with an overlay
# IPv6 address) is dropped too, so those clients fall back to IPv4.
iptables-nft -t mangle -C FORWARD -i wt0 ! -o tun0 -j DROP 2>/dev/null \
  || iptables-nft -t mangle -A FORWARD -i wt0 ! -o tun0 -j DROP
ip6tables-nft -t mangle -C FORWARD -i wt0 -j DROP 2>/dev/null \
  || ip6tables-nft -t mangle -A FORWARD -i wt0 -j DROP

# --- the pod's own traffic out eth0 ---------------------------------------------
# gluetun's OUTPUT policy is DROP, so tailscaled's and NetBird's own packets
# (rules 90 and 91) need an accept out eth0. It cannot match their marks in
# filter OUTPUT: whenever gluetun removes one of its own OUTPUT rules (every
# reconnect and region switch) it lists the whole chain and parses each line,
# and its parser knows only tcp/udp dpt, ctstate and redir ports, and only
# ACCEPT/DROP/REJECT/REDIRECT targets (internal/firewall/list.go, v3.41.3). A
# `mark match` line, or a jump to a chain of ours, fails the parse, the
# removal is skipped, and its rules pile up. So post-rules.txt accepts all of
# eth0 in filter, which parses, and this mangle chain is the real filter: a
# DROP here is final whatever filter accepts, and gluetun never touches mangle.
#
# What may leave by eth0: replies; tailscaled's and NetBird's own packets;
# gluetun's WireGuard to the Mullvad server (marked with its fwmark 51820,
# 0xca6c); and gluetun's FIREWALL_OUTBOUND_SUBNETS (change both together).
# Everything else - gluetun's DNS and public-IP lookups, the picker - must go
# through tun0, and is dropped while the tunnel is down.
iptables-nft -t mangle -N region-exit-out 2>/dev/null \
  || iptables-nft -t mangle -F region-exit-out
iptables-nft -t mangle -A region-exit-out -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables-nft -t mangle -A region-exit-out -m mark --mark 0x80000/0xff0000 -j RETURN
iptables-nft -t mangle -A region-exit-out -m mark --mark 0x1bd00 -j RETURN
iptables-nft -t mangle -A region-exit-out -m mark --mark 0xca6c -j RETURN
for subnet in 10.206.0.0/16 10.196.0.0/16 10.10.206.0/24; do
  iptables-nft -t mangle -A region-exit-out -d "$subnet" -j RETURN
done
iptables-nft -t mangle -A region-exit-out -j DROP
iptables-nft -t mangle -C OUTPUT -o eth0 -j region-exit-out 2>/dev/null \
  || iptables-nft -t mangle -A OUTPUT -o eth0 -j region-exit-out

# --- masquerade into the tunnel ------------------------------------------------
# Clients leave with the tunnel's address. tailscaled masquerades its
# forwarded traffic too (ts-postrouting), and NetBird its route's in its own
# table; these keep it so if either changes. Here rather than in gluetun's
# post-rules.txt because gluetun cannot guard a line with -C, and never removes
# nat rules, so each gluetun restart in the pod would add another copy. A rule
# naming tun0 before it exists is valid and matches once it does.
iptables-nft -t nat -C POSTROUTING -s 100.64.0.0/10 -o tun0 -j MASQUERADE 2>/dev/null \
  || iptables-nft -t nat -A POSTROUTING -s 100.64.0.0/10 -o tun0 -j MASQUERADE
iptables-nft -t nat -C POSTROUTING -s 10.100.0.0/16 -o tun0 -j MASQUERADE 2>/dev/null \
  || iptables-nft -t nat -A POSTROUTING -s 10.100.0.0/16 -o tun0 -j MASQUERADE

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
echo "nat:"; iptables-nft -t nat -S POSTROUTING
