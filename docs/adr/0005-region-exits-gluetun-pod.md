---
status: accepted
---

# Region exits are gluetun pods on Equestria shared by NetBird and Tailscale

Family want to appear to be somewhere else (another country's streaming catalogue, travel, privacy), on whichever overlay their device uses. Tailscale's Mullvad add-on did this for Tailscale only, set by hand per device, and it ends at the end of November 2026. NetBird has no equivalent. We decided to run five region exits (GLOSSARY.md), named spitfire, soarin, fleetfoot, misty-fly and high-winds, as one pod each on Equestria. In each pod gluetun (Mullvad WireGuard), a NetBird client, tailscaled and a small region picker share the pod's network namespace. One Mullvad tunnel therefore serves both overlays, and the region is one setting that both of them follow. Family change a region exit's region at `wonderbolts.<root domain>/<name>`; friends may use the region exits (over NetBird; on Tailscale they are family and admins only, amended 2026-11-07) but not change them.

The design follows [manfredbjorlin/netbird_gluetun_mullvad](https://codeberg.org/manfredbjorlin/netbird_gluetun_mullvad) (Apache-2.0): a NetBird client inside gluetun's network namespace, forwarding its peers out through the tunnel, with a page that calls gluetun's control API to switch city. We keep that idea and change the platform, the second overlay, and how the rules are kept.

## Considered options

- **The reference compose on a Dockge host.** Closest to upstream, but it depends on Docker-bridge details (`172.18.0.1`, `eth0`) and on a privileged loop that reapplies nft rules every 30 s, keyed on NetBird's internal chain names. A pod shares one namespace natively, gets its secrets from OpenBao through ExternalSecrets, and is published through the internal Gateway like any other app. Rejected.
- **Keep Tailscale's Mullvad add-on and build for NetBird only.** The add-on is going away, and it gave the two overlays different region lists and different setup steps. Rejected.
- **One region per node, set in Git.** No page to build, but changing a region would need a commit and an admin. Rejected: the point is that family change it themselves.
- **One region exit per person.** Nobody moves anyone else, but a Mullvad account holds five devices. Rejected in favour of five shared region exits, with the picker showing how many people are on one before it switches.
- **Falling back to the home WAN while the tunnel is down.** Better availability, but the region would silently become home. Rejected: region exits fail closed.

## Consequences

- The pod is privileged (gluetun, NetBird and tailscaled each create a kernel interface and set routing rules). It first lived in its own namespace, `region-exits`, labelled `pod-security.kubernetes.io/enforce: privileged`. Amended 2026-11-07: the namespace is now `netbird-system`, because the region exits are part of the NetBird estate and share its downscaler exclusion (`docs/plans/region-exits.md` §D1, §E1).
- Only forwarded client traffic goes through Mullvad. NetBird's and tailscaled's own sockets (marks `0x1bd00` and `0x80000/0xff0000`) are policy-routed out `eth0` to the home WAN, the same technique Technitium's sidecars use. Peers then connect directly instead of through relays, since Mullvad has no inbound ports.
- Mullvad WireGuard keys are Pulumi resources: generated, registered with Mullvad's device API and written to OpenBao. Replacing or destroying one frees its device slot. All five slots on the account are in use.
- The region a family member picks is stored outside Git, in a ConfigMap Flux does not manage, so it survives a restart. Git holds each region exit's default region (US, Canada, UK, Germany, Japan).
- The Tailscale grant `member-exit-node` gains a `via` listing the existing exit nodes, so that `tag:region-exit` is reachable only through its own grant (`group:fnf` and admins). Before this, every member could use every exit node. Amended 2026-11-07: that grant is `group:family` and admins. Friends use the region exits over NetBird only.
- **Known v1 gaps.** NetBird nameserver groups cannot be scoped to "peers using this route", so a NetBird client on a region exit still resolves DNS at home. The region exits are IPv4 only, and NetBird exit routes are `0.0.0.0/0`, so a NetBird client on a dual-stack network sends IPv6 out of its local connection and reveals where it really is. Tailscale clients get neither gap: the tailnet nameservers have `useWithExitNode: false`, so they resolve through the region exit (gluetun's resolver, over the tunnel), and `::/0` through it fails closed.
- **Amended 2026-11-07: DNS resolves at home on both meshes.** The pod, gluetun and Tailscale clients on a region exit now all resolve through the cluster Technitium: the pod's only nameserver is Technitium's Service, gluetun runs no resolver, and tailscaled answers exit-node DNS from the pod's resolver (`useWithExitNode: false` still applies). Tailscale's DNS no longer follows the region. David accepted the trade-off: geo-DNS answers are home's, because Technitium forwards upstream from the home WAN, while IP geolocation stays on Mullvad. In return both meshes give the same answers and home names resolve on a region exit, and the NetBird DNS gap above is the design rather than a gap. The IPv6 gap stands (`docs/plans/region-exits.md` §A, §D2, §F).
- Plan and phases: `docs/plans/region-exits.md`. Family instructions: `docs/runbooks/region-exits.md`.
