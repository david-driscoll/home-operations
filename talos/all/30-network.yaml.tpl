# The node's one NIC: selected by hardware address (topf.yaml `data.mac`) and
# aliased `ethSel0`, static address = the node's `ip` with a /16, default route
# via the UCG gateway, MTU 1500. Was talconfig.yaml's `networkInterfaces`
# (deviceSelector.hardwareAddr, dhcp: false, addresses, routes, mtu), which
# talhelper rendered into exactly these two documents.
#
# Every node is /16 inside 10.10.0.0/16 behind gateway 10.10.0.1 — one
# broadcast domain, which is what lets the control planes share the API VIP
# (control-plane/15-vip.yaml binds it to this same `ethSel0`).
apiVersion: v1alpha1
kind: LinkAliasConfig
name: ethSel0
selector:
  match: glob("{{ .Node.Data.mac }}", mac(link.hardware_addr))
---
apiVersion: v1alpha1
kind: LinkConfig
name: ethSel0
mtu: 1500
addresses:
  - address: {{ .Node.IP }}/16
routes:
  - gateway: 10.10.0.1
