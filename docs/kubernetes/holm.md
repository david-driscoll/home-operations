# Holm: the family home page

[Holm](https://github.com/man15h/holm) is a multi-user start page. Each family
member signs in with authentik and gets their own layout, bookmarks and
wallpaper, built from a catalog of apps the operator publishes. Its search bar
also searches inside Immich, Nextcloud, Jellyfin, Seerr, Navidrome, Mealie and
the Nextcloud calendar, each with that person's own login.

- **Deployed at** `https://apps.<root domain>`, internal only (LAN, Tailscale,
  where the device is `apps` too, or NetBird), behind the `local-user`
  middleware. Holm signs people in itself over OIDC; access is limited to the
  `family` group, the same audience as the setup guide.
- **Alias:** `https://holm.<root domain>` 302-redirects to the apps address,
  keeping the path. It is a redirect rather than a second served hostname
  because Holm's sign-in only works on its `redirect_base` host: the OIDC state
  cookies and the session cookie are per-host. Moving the main address is
  under "Changing an address or the main host" below.
- **Manifests:** [`kubernetes/apps/equestria/home/holm/`](../../kubernetes/apps/equestria/home/holm/).
- **Configuration:** not in this repo. Holm's `config.yml` is built by the
  family setup guide, Forgejo repo **`docs/setup`**
  (`https://git.<root domain>/docs/setup`), from the guide's own data. See the
  next section. All options are in upstream's
  [`docs/configuration.md`](https://github.com/man15h/holm/blob/main/docs/configuration.md#reference).

## The config comes from the setup guide

Holm's apps are the setup guide's pages, one tile per page, so the guide
builds Holm's config. A page added there becomes a tile here with no change
in this repo. The guide is published at `https://setup.<root domain>`; see
"the family setup guide" in [git-pages.md](git-pages.md).

| In `docs/setup` | Becomes in Holm's config |
| --- | --- |
| `src/data/services.ts`: slug, title, address, blurb, group | `apps[].id` / `name` / `url`, tile order, `onboarding.services`, the "Do these first" slide |
| `src/data/apps.ts`: App Store / Google Play links | `apps[].app_store` |
| `src/data/holm.ts`: icon, tags, 3 to 5 card steps per page | `apps[].icon` / `tags` / `on_click` / `setup_guide` (plus a "Full guide" step) |
| `holm/base.yml`: branding, auth, search, integrations, onboarding text | everything else, as is |

`npm run holm` (`scripts/holm-config.ts` there) joins them and refuses to write
a config with a page missing from `holm.ts`, a `${VAR}` that Holm's container
doesn't set, Markdown in a card step, or the root domain or a tailnet name
written out. Every `${VAR}` in it is Holm's own, expanded at startup from the
container's environment (`ROOT_DOMAIN`, `OIDC_*`), so a new variable needs an
`env:` entry in `helmrelease.yaml` first.

### How a guide change reaches Holm

1. A push to `docs/setup` `main` runs its CI: build, checks, `npm run holm`.
   If the result changed, CI force-pushes a single parentless commit to the
   **`deploy/holm`** branch holding `config.yml` and the `kustomization.yaml`
   that turns it into the `holm-config` ConfigMap (`holm/kustomization.yaml`
   there).
2. The `setup-guide` GitRepository
   ([`holm-config/source.yaml`](../../kubernetes/apps/equestria/home/holm-config/source.yaml))
   polls that branch every 2 minutes over the in-cluster Forgejo Service, as
   the forge's read-only `flux` account. `stacks/system/forgejo-renovate.ts`
   creates that account, restricted, with a read grant on `docs/setup` only, and
   writes its token to `clusters/equestria/apps/forgejo/flux`.
3. The `holm-config` Kustomization
   ([`holm-config/app/holm-config.yaml`](../../kubernetes/apps/equestria/home/holm-config/app/holm-config.yaml))
   applies the branch. Holm rereads the file within seconds, and Reloader
   restarts the pod, which `auth.oidc` and `database` need.

`holm-config` never prunes, so a broken pipeline leaves Holm on the last good
ConfigMap. `holm` waits on `holm-config`, so the app never starts before its
config exists, and changes to `holm` itself wait while `holm-config` is
failing. A config that gets past the
generator but that Holm can't load makes every request fail and the probes
restart the pod: check `kubectl -n equestria logs deploy/holm`, fix it in
`docs/setup`, and the next push replaces it.

### The first rollout (2026-11-05)

Moving the ConfigMap from `holm` to `holm-config` pruned it for about a
minute. Both changes, and `holm`'s new `dependsOn`, were in one commit. `holm`
reconciled that revision with its old spec, before `cluster-apps` applied the
`dependsOn`. Holm kept serving from the files already mounted in its pod. The
ConfigMap was re-created by hand with `holm-config`'s owner labels, and
`holm-config` adopted it once the forge credential existed. Moving a live
object between Kustomizations needs two PRs, or a
`kustomize.toolkit.fluxcd.io/prune: disabled` annotation on it in the old
owner first.

### The trust boundary

`docs/setup` has more writers than this repo (its CI token, the `claude-code`
and `renovate` accounts), and `holm-config` applies whatever `deploy/holm`
holds. Two things keep a bad push to the contents of one ConfigMap:

- **`holm-config` impersonates the `holm-config` ServiceAccount**
  ([`rbac.yaml`](../../kubernetes/apps/equestria/home/holm-config/app/rbac.yaml)),
  which can create ConfigMaps in `equestria` and change only `holm-config`.
  Any other kind, or any other existing ConfigMap, is refused.
- **`holm-config` gets no postBuild substitution.** It is rendered by the
  `holm-guide` Kustomization, not `cluster-apps`, so the cluster-wide patch in
  `kubernetes/flux/cluster/ks.yaml` (substituteFrom `cluster-secrets` and
  `shared-secrets`, SOPS decryption) never reaches it. Otherwise a push could
  expand those secrets into the ConfigMap, where Holm would show them.

An ArtifactGenerator copying only `config.yml` next to a `kustomization.yaml`
from this repo would be tighter, but the pinned flate (0.6.5) cannot resolve a
Kustomization fed by an ExternalArtifact, and then the `flate` hk step fails
every Kustomization in the repo. For the same reason the GitRepository is in
`holm-config/source.yaml`, applied straight from `home/kustomization.yaml`:
flate aliases a source it only meets inside a render to the working tree.

### Changing an address or the main host

`url`s come from `services.ts`. If an app with an integration moves, also
update its `integrations.<id>.default_url` in `holm/base.yml`: Holm's server
sends each person's credentials there. Moving Holm's own address means
changing `redirect_base` (`holm/base.yml` in `docs/setup`), `ORIGIN` and both
routes (`helmrelease.yaml`), the redirect URI (`definition.yaml`) and
`TAILSCALE_HOST` (`ks.yaml`) together.

Never rename a guide slug: it is the tile `id`, and each person's layout is
keyed on it.

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

All in `holm/base.yml` in `docs/setup`.

- **Search** falls back to Degoog (`search.<root domain>`), not Google.
- **Update notice is off**, because Renovate owns the image tag.
- **Privacy notice is off.** Upstream's sections are promises about backups and
  retention, so they need writing for this estate before being turned on.
- **The security onboarding slide is dropped.** Its password-manager and 2FA
  advice does not fit a family sign-in that is one Tailscale (or NetBird) tap.
