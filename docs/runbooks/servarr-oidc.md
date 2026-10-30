# Sonarr / Radarr native OIDC

Sonarr 5 and Radarr 7 sign in through authentik with their own OIDC client
(`AUTH__METHOD: Oidc`), not the forward-auth outpost. Apps:
`kubernetes/apps/equestria/media/{sonarr,radarr}`.

| | |
| --- | --- |
| Who can log in | `media-managers`, through the application's `access_policy` (a policy binding) |
| Identity the app sees | Everyone appears as one user, `media-managers` |
| Scope | `servarr_identity` (`components/authentik/property-mappings.ts`) |
| Client credentials | `<app>-oidc-credentials` (made by `stacks/system`), read into `<app>-oidc` by the ExternalSecret |
| Routes | `local-user` / `tailscale-local`: network gate only. API clients use `X-Api-Key` |
| Callback | `https://<app>.<root domain>/signin-oidc` and the same on the tailnet name |

## Why a shared identity

The apps' OIDC accepts a single user. A login succeeds only when the
**verified** `email` claim (or failing that `sub`) equals
`AUTH__OIDCUSERIDENTIFIER`. Unless userinfo says `email_verified: true`, the
email is ignored. `servarr_identity` returns
`{"email": "media-managers", "email_verified": True}` for every group member
and nothing for anyone else.

Do not attach authentik's built-in `email` scope to these providers. It sends
the real address with `email_verified: False`. `servarr_identity` sorts after
it and would still win, but leave it out anyway.

## Kill switch: log everyone out

Sessions are 7-day sliding cookies, and every one of them carries the same
identity. Taking someone out of `media-managers` stops their **next** login,
but an open session keeps working. To end every session at once, change the
identity in both places in one PR:

1. `servarr_identity` in `components/authentik/property-mappings.ts`, the
   `"email"` value.
2. `SONARR__AUTH__OIDCUSERIDENTIFIER` and `RADARR__AUTH__OIDCUSERIDENTIFIER`
   in the two `helmrelease.yaml` files.

The cookie check compares against the configured identifier, so every existing
cookie stops working as soon as the pods restart.

## Bring-up order

1. The `servarr_identity` mapping exists (the Pulumi operator runs
   `stacks/authentik` on merge).
2. Flux applies the app's `definition.yaml`. `stacks/system` (10-minute
   resync) then creates the OAuth2 provider and `<app>-oidc-credentials`.
3. The `<app>-oidc` ExternalSecret syncs and **creates** the Secret. Reloader
   restarts the pod because it runs with `reloadOnCreate`
   (`kubernetes/apps/kube-system/reloader/helmrelease.yaml`). Before that
   flag, a created Secret never triggered a restart, and the first rollout
   needed `kubectl -n equestria rollout restart deploy/<app>` by hand. To skip
   the ExternalSecret's retry wait:

   ```bash
   kubectl -n equestria annotate externalsecret sonarr-oidc force-sync=$(date +%s) --overwrite
   ```

Until step 3 the `envFrom` is absent (it is `optional`). The app then falls
back to Forms with the form hidden, so the UI stays locked and API keys keep
working. **It fails closed.**

## Troubleshooting

- **authentik: "redirect URI mismatch" / the URI is `http://…`.** The app isn't
  trusting Traefik's `X-Forwarded-*`. Check that `SERVER__TRUSTEDNETWORKS` still
  covers the pod CIDR (`talos/talconfig.yaml` `clusterPodNets`).
- **Login loops back to `/login`.** The identity didn't match. Is the user in
  `media-managers`? Does the provider still have `servarr_identity` attached?
  Do the two values above agree?
- **Any LAN client gets in without logging in.** `AUTH__REQUIRED` has been
  changed back to `DisabledForLocalAddresses`. With trusted forwarded headers
  the app sees the real client IP, so it has to be `Enabled`.
- **Going back to forward auth.** Restore `authentik.proxy` (`forward_single`)
  and `tailnetUrl` in `definition.yaml`, `AUTH__METHOD: External`, the
  `authenticated-user` / `tailscale-user` chains and the two api-key carve-out
  components.
