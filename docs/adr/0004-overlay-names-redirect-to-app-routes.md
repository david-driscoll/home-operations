---
status: accepted
---

# Tailnet routes and app services redirect to the app route

Every app had up to three working names: its app route (`<app>.<root domain>`), its tailnet route (`<app>.<tailnet>`) and its NetBird app service (`<app>.nb.<root domain>`). Each overlay name needed its own hidden authentik twin (D45 in docs/plans/netbird-mirror.md) and, for OIDC apps, extra redirect URIs. We decided the overlay names redirect to the app route instead of serving the app, extending ADR 0003 (a short name means the app route) to every name. Both overlays already reach every app route, so one URL, one login and one authentik application per app work everywhere, and the twins can go. The redirect runs before any gate, so the authentik outpost never sees an overlay name.

## Considered options

- **Keep serving on every name (the twins):** works, but triples the authentik applications and makes each overlay name a separate login surface to keep in step.
- **Serve the overlay names without authentik:** drops the twins, but on Tailscale any tailnet member would reach every app with no per-app check.

## Consequences

- Every cluster app redirects, with no opt-out: nobody uses the overlay names directly. crowdsec-ui and meilisearch have no app route, so their overlay names now lead nowhere. An app that ever needs to serve on an overlay name again needs a non-redirecting router and, for authentik forward-auth, its `tailnetUrl` back.
- The *arr API-key route on the tailnet (`components/tailscale/api-key`) keeps serving, so API clients configured with a tailnet name are unaffected.
- Dockge: only the user-facing UI routers redirect (backrest, garage, alloy, prometheus, the Traefik dashboard, uptime, zwave). Backplane and API names keep serving: OpenBao (`bao-standby`, `bao-transit`), `garage-s3` and `garage-admin`, the registry, authentik and its outposts, and the llama APIs. Gatus (`uptime`) redirects its UI but keeps serving its heartbeat push API (`/api/v1/endpoints/<key>/external`) on the tailnet name, because tailnet-only pushers such as the NetBird edge hosts cannot follow the redirect.
- `TAILSCALE_MIDDLEWARE` in a ks.yaml no longer has any effect: its gate sits behind the redirect, and the API-key route names its own.
- The NetBird private service still checks each app's access policy before the redirect; the app route then applies its own login.
- The redirects are permanent (301, or 308 for a non-GET), so browsers cache them.
