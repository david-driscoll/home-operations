---
status: accepted
---

# A short name completes to the app route on every network

Typing an app's short name (`jellyfin`) should work on the LAN, on Tailscale and on NetBird. Every app has up to three names: its app route (`<app>.<root domain>`), its tailnet route (`<app>.<tailnet>`) and its app service (`<app>.nb.<root domain>`). We decided a short name always means the app route. UniFi DHCP, Tailscale and NetBird all hand out `<root domain>` as the search domain, and each Traefik redirects a dotless host on port 80 to `https://<name>.<root domain>/`. One name and one bookmark then work wherever a device is, and both overlays already reach app routes through Technitium and the gateways. Short names add no access that typing the full app route did not already give.

## Considered options

- **Each network's own name:** `<tailnet>` as the Tailscale search domain, `nb.<root domain>` on NetBird. This would use the identity-aware overlay names, but the same short name would mean a different host depending on which VPN is on, and each name would need its own HTTP redirect.
- **The app service on NetBird only:** short names on NetBird are limited to apps in the person's access policy. Rejected for the same reason: a short name should not change meaning between networks.

## Consequences

- MagicDNS always puts `<tailnet>` first in the search list, and it does answer an app's short name with that app's Tailscale Service. So every tailnet Ingress also serves port 80, and Traefik redirects that to the app route too (docs/plans/short-names.md, C2b). On Tailscale the short name still means the app route; it just gets there through the Service.
- Tailscale search paths cannot be scoped by device, so servers that accept tailnet DNS get the search domain too. The NetBird search domain is scoped to client devices.
- Names that are not behind Traefik (the UniFi console, TrueNAS, the Proxmox hosts) resolve as short names but get no redirect.
- The redirects are permanent (301, or 308 for a non-GET) since 2026-11-06; they started as 302s. Browsers cache them, so renaming an app leaves the old target on devices that used it until their cache is cleared.
- Plan and phases: `docs/plans/short-names.md`.
