# Holm: the family home page

[Holm](https://github.com/man15h/holm) is a multi-user start page. Each family
member signs in with authentik and gets their own layout, bookmarks and
wallpaper, built from a catalog of apps the operator publishes. Its search bar
also searches inside Immich, Nextcloud, Jellyfin, Seerr, Navidrome, Mealie and
the Nextcloud calendar, each with that person's own login.

- **Deployed at** `https://apps.<root domain>`, internal only (LAN and
  Tailscale, where the device is `apps` too), behind the `local-user`
  middleware. Holm signs people in itself over OIDC; access is limited to the
  `family` group, the same audience as the setup guide.
- **Alias:** `https://holm.<root domain>` 302-redirects to the apps address,
  keeping the path. It is a redirect rather than a second served hostname
  because Holm's sign-in only works on its `redirect_base` host: the OIDC state
  cookies and the session cookie are per-host. Moving the main address means
  changing `redirect_base` (`config.yml`), `ORIGIN` and both routes
  (`helmrelease.yaml`), the redirect URI (`definition.yaml`) and
  `TAILSCALE_HOST` (`ks.yaml`) together.
- **Manifests:** [`kubernetes/apps/equestria/home/holm/`](../../kubernetes/apps/equestria/home/holm/).
- **Configuration:** one file,
  [`resources/config.yml`](../../kubernetes/apps/equestria/home/holm/resources/config.yml),
  started from upstream's
  [`config.example.yml`](https://github.com/man15h/holm/blob/main/config.example.yml).
  All options are in upstream's
  [`docs/configuration.md`](https://github.com/man15h/holm/blob/main/docs/configuration.md#reference).

## The app list comes from the setup guide

Holm's apps are the family setup guide's apps. Each tile's `id` is the guide
page's slug. Each tile's store links and **Getting started** card come from that
page. The onboarding slides reuse the guide's blurbs.

The guide lives in the **Forgejo repo `docs/setup`**, at
`https://git.<root domain>/docs/setup` (branch `main`). It is published at
`https://setup.<root domain>`; see "the family setup guide" in
[git-pages.md](git-pages.md).

| In `docs/setup` | Feeds in `config.yml` |
| --- | --- |
| `src/data/services.ts`: slug, title, address, blurb | `apps[].id` / `name` / `url`, `onboarding.services[].desc` |
| `src/data/apps.ts`: every App Store / Play Store link | `apps[].app_store` |
| `src/content/docs/<slug>.mdx`: the page | `apps[].setup_guide` (3 to 5 steps plus a "Full guide" link back to the page) |
| `astro.config.mjs`: sidebar order | order of `apps` |

### Reviewing after a guide change

1. List what changed in `docs/setup` since `config.yml` was last updated.
   `git log -1 --format=%cs -- kubernetes/apps/equestria/home/holm/resources/config.yml`
   gives that date.
2. **New or removed page:** add or remove the matching entry under `apps:`, and
   under `onboarding.services` if it is an app. Never reuse or rename an
   existing `id`, because each person's layout is keyed on it.
3. **Changed address:** update `url`. If the app has an integration, also
   update `integrations.<id>.default_url`, because Holm's server sends each
   person's credentials there.
4. **Changed store link:** copy it from `apps.ts` into `app_store`. Holm takes
   only `ios` and `android`.
5. **Changed steps:** re-condense the page into `setup_guide.steps`. Keep the
   steps plain text with no Markdown. Write addresses as
   `<name>.${ROOT_DOMAIN}`, which Holm expands itself, and never use a tailnet
   address.
6. Holm rereads the file within seconds of the ConfigMap updating. A bad edit
   (invalid YAML, or an unset `${VAR}`) makes every request fail and the
   probes restart the pod. Check `kubectl -n equestria logs deploy/holm` after
   merging.

The guide writes its own copy of the steps with pictures. Holm's cards are a
summary that always ends by linking to the page, so small wording changes in
the guide do not need a Holm change.

## Secrets

| Secret | From | Holds |
| --- | --- | --- |
| `holm-oidc` | `holm-oidc-credentials` (cluster store), written by `stacks/system` from `definition.yaml` | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` |
| `holm-secret-key` | in-cluster `Password` generator, `refreshPolicy: CreatedOnce` | `HOLM_SECRET_KEY`: encrypts each person's integration logins and signs sessions |

On a first deploy the pod waits in `CreateContainerConfigError` until
`stacks/system` has created the authentik provider. Then force-sync
`externalsecret/holm-oidc` (the command is in `externalsecret.yaml`).

Losing `holm-secret-key` costs no layouts or bookmarks. Everyone is signed out
and has to reconnect their integrations.

## Things upstream defaults that are changed here

- **Search** falls back to Degoog (`search.<root domain>`), not Google.
- **Update notice is off**, because Renovate owns the image tag.
- **Privacy notice is off.** Upstream's sections are promises about backups and
  retention, so they need writing for this estate before being turned on.
- **The security onboarding slide is dropped.** Its password-manager and 2FA
  advice does not fit a family sign-in that is one Tailscale tap.
