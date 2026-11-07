---
status: proposed
---

# The region picker is its own Nuxt app; each region exit keeps a JSON agent

Amends [ADR 0005](0005-region-exits-gluetun-pod.md), which put a small region picker in every
region exit's pod, serving both the pages and the moves.

The pages move out into one Nuxt app (`wonderbolts` in `netbird-system`), and friends can now
see the picker as well as family and admins. The pod keeps a sidecar, but it only answers JSON.
That sidecar can't leave the pod: everything a region exit knows about itself lives in the
pod. That covers gluetun's control API on loopback, Mullvad's server list on a volume shared
with gluetun, the pod's own connection table (where people on the exit are counted), and
tailscaled's socket and NetBird's interface in its network namespace. The pod's ServiceAccount
is also the only thing allowed to write that exit's state. A single app could only read those
things through a sidecar anyway. Splitting along that line lets the UI grow (Nuxt UI,
auto-refresh, a reconnecting state, a visible "last moved by") without shipping it as a
ConfigMap into five privileged pods.

The sidecar decides whether a move needs confirming, because only it can count who is on the
exit. The app decides who may move one: it reads the groups Authentik's forward auth puts on
the request, and refuses a move from anyone outside family and admins. That check is new,
and it exists because friends can now see the page. It holds only because nothing but Traefik
can reach the app, and nothing but the app can post a move to a sidecar (both enforced by
CiliumNetworkPolicy).

The image is built on the forge without a Docker daemon (one layer on `node:24-alpine`,
pushed with crane), like `images/pulumi-workspace`, and pinned by digest. GHCR was turned
down because GitHub is the mirror, not the source of truth.

Plan: [docs/plans/wonderbolts-nuxt.md](../plans/wonderbolts-nuxt.md).
