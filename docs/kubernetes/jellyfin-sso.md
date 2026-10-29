# Jellyfin: sign-in through authentik

How Jellyfin users sign in with authentik, what the plugin does to their
permissions, and how that reaches the apps that cannot do OIDC themselves
(Moonfin, Neptune and the other TV apps). Written 2026-10-29 against
Jellyfin 12.4 and SSO-Auth 6.1.0.0.

## What is where

| Piece | Where | What it does |
| --- | --- | --- |
| authentik provider + application | [`jellyfin/definition.yaml`](../../kubernetes/apps/equestria/media/jellyfin/definition.yaml) `authentik.oauth2`, applied by the `system` Pulumi stack | Confidential client, slug `jellyfin`. The definition's `access_policy` (`family`, `friends`) is the only thing deciding who may sign in. Client id, secret and issuer are written to OpenBao at `secrets/clusters/equestria/apps/jellyfin/oidc`. |
| SSO-Auth plugin | Jellyfin's plugin directory on the `jellyfin` PVC, **not in git** | [MaxRink/jellyfin-plugin-sso](https://github.com/MaxRink/jellyfin-plugin-sso). Installed and updated through Jellyfin's plugin UI, like Meilisearch. |
| Plugin config | `/config/plugins/configurations/SSO-Auth.xml`, **not in git** | The provider named `authentik`, plus the plugin-wide SSO-only setting. The plugin rewrites this file itself whenever it links an account, so it cannot be a read-only mount or a ConfigMap. |
| Reviewed copies | [`assets/jellyfin-sso/`](assets/jellyfin-sso/) | `provider.json` (no secret), `login-disclaimer.html`, `custom.css`, `sso-return.js`. Whatever is in Jellyfin is what runs; these are what was reviewed, and the setup below pastes from them. |
| Login button | Dashboard → Branding, **not in git** | "Sign in with authentik" in the login disclaimer. Web UI only: other clients show the disclaimer as plain text, or not at all. |
| QR / deep-link script | Dashboard → JavaScript Injector, **not in git** | [`sso-return.js`](assets/jellyfin-sso/sso-return.js). Sends Moonfin's Quick Connect QR through authentik, and keeps deep links across the login button. |

### Why this fork

The plugin most guides name, [9p4/jellyfin-plugin-sso](https://github.com/9p4/jellyfin-plugin-sso),
was archived on 2026-05-12. Its last release targets ABI 10.11, and it does not
load on Jellyfin 12, which moved to .NET 10 and changed the auth-provider
interfaces. Jellyfin 12 has no OIDC of its own: [jellyfin#17271](https://github.com/jellyfin/jellyfin/pull/17271)
was closed unmerged.

MaxRink's fork keeps the same plugin GUID and config file, targets ABI 12.0,
and its release tests run against authentik with Jellyfin 12. It also has the
features used here: `UsernameMappings`, the `?qc=` Quick Connect hand-off,
`returnUrl`, and `EnforceSsoOnly`. The other fork that runs on 12, K0lin's,
has an open bug where the callback page hangs inside the Android app (K0lin#79).

If you ever switch forks, delete the old plugin folder from `/config/plugins/`
first. Two copies register the same routes, and `/sso/OID/start` then fails
with `AmbiguousMatchException`.

## Setup

These steps run once, after the definition change has merged and the `system`
stack has run. Do them in this order. SSO-only is on from day one (see
[Accounts](#accounts)), so tell Abbie, Nat and Tami about Quick Connect before
step 7.

1. **Check the client exists.** `secrets/clusters/equestria/apps/jellyfin/oidc`
   in OpenBao should hold `client_id`, `client_secret` and `issuer`.
2. **Install the plugin.** Dashboard → Plugins → Repositories → add
   `https://raw.githubusercontent.com/MaxRink/jellyfin-plugin-sso/manifest-release/manifest.json`,
   install **SSO Authentication**, then restart Jellyfin.
3. **Add the provider** from [`provider.json`](assets/jellyfin-sso/provider.json)
   with the three OpenBao values filled in. You need an admin API key
   (Dashboard → API Keys). Jellyfin 12 rejects `?api_key=`, so send the key as
   a header:

   ```bash
   oidc=$(bao kv get -format=json secrets/clusters/equestria/apps/jellyfin/oidc | jq '.data.data')
   jq --argjson o "$oidc" \
     '.OidEndpoint = $o.issuer | .OidClientId = $o.client_id | .OidSecret = $o.client_secret' \
     docs/kubernetes/assets/jellyfin-sso/provider.json |
   curl -fsS -X POST "https://jellyfin.<root domain>/sso/OID/Add/authentik" \
     -H 'Authorization: MediaBrowser Token="<api key>"' \
     -H 'Content-Type: application/json' --data-binary @-
   ```

   ⚠️ **`OID/Add` replaces the whole provider object, its saved account links
   (`CanonicalLinks`) included.** Use it to create the provider, never to edit
   it once people have signed in. For later changes, use the plugin's settings
   page.
4. **Check sign-in before anyone else uses it.** Open
   `https://jellyfin.<root domain>/sso/OID/start/authentik` as `david`. You
   should land on the existing `david` account, still an admin.
   Dashboard → Users → david should still show administrator, all libraries and
   Live TV. If admin is gone, the `groups` claim is not arriving: see
   [Permissions](#permissions).
5. **Add the button.** Dashboard → Branding:
   - Login disclaimer: [`login-disclaimer.html`](assets/jellyfin-sso/login-disclaimer.html).
     It uses a `<form>` rather than a link because jellyfin-web opens disclaimer
     links in a new tab.
   - Custom CSS: [`custom.css`](assets/jellyfin-sso/custom.css).
6. **Add the script.** Dashboard → JavaScript Injector → add a script, paste
   [`sso-return.js`](assets/jellyfin-sso/sso-return.js), and leave **Requires
   Authentication unchecked**. Scripts that require authentication are served
   only after login, and this one only does anything before login.
7. **Turn on SSO-only.** SSO-Auth settings page → **Enforce SSO only**: on,
   exempt usernames: `david`.

## Permissions

`EnableAuthorization` is on, so the plugin rewrites the following permissions
on **every** SSO login, from the user's authentik `groups` claim
(`RoleClaim: groups`, sent by authentik's default `profile` mapping):

| Jellyfin permission | Set to | From |
| --- | --- | --- |
| Administrator | on only for members of `admins` | `AdminRoles` |
| Libraries | all | `EnableAllFolders: true` |
| Live TV | on for everyone | `EnableLiveTv: true` |
| Live TV management | on only for members of `media-managers` | `EnableLiveTvRoles`, `LiveTvManagementRoles` |

Everything else (deleting content, downloads, transcoding) is not touched and
stays as set in Jellyfin.

- **Live TV is written on every SSO login even with `EnableAuthorization`
  off.** It comes from `EnableLiveTv`/`EnableLiveTvManagement`, which default
  to `false`. Leave those two settings unset and the first SSO login removes
  Live TV.
- **If `groups` stops arriving** (a property mapping is detached or renamed), the
  next SSO login removes admin from `david`. `PreserveAdminPermissions` is off
  on purpose: with it on, taking someone out of `admins` would never remove
  their admin. Recover by fixing the mapping and signing in through SSO again.
  `david`'s password still works throughout, because the account is exempt from
  SSO-only.
- **Turning `EnableAllFolders` off** means the libraries come from
  `EnabledFolders` and `FolderRoleMapping` (per-group libraries). With both
  empty, every SSO user loses every library at their next login.
- Who can sign in at all is decided in authentik. The plugin's `Roles` is empty,
  and any `preferred_username` is let through. Add a group to the definition's
  `access_policy`, not to the plugin.

## Accounts

On a first login, the plugin looks up the Jellyfin account named by
`preferred_username` (the authentik username) and adopts it. The lookup is
case-insensitive: Jellyfin 12 matches on `NormalizedUsername`. The plugin then
stores a link keyed by the authentik `sub`. Adopted accounts keep their watch
history.

**SSO-only** (`EnforceSsoOnly`, on from day one, `david` exempt) moves every
linked account to an authentication provider that rejects all passwords. It
does not revoke existing sessions. Apps that are already signed in keep
working until they log out or have to sign in again; from then on, the only
ways in are SSO in a browser and Quick Connect.

Accounts on 2026-10-29:

| Jellyfin | authentik | After their first SSO login |
| --- | --- | --- |
| `david` | `david` | Linked, still admin, password still works (exempt) |
| `Abbie` | `Abbie` | Linked, password locked |
| `Nat` | `nat` | Linked (case-insensitive match), password locked |
| `Tami` | `tami` | Linked (case-insensitive match), password locked |
| `Maddie` | none | Never linked, password only, unaffected |
| `Deborah` | none | Never linked, password only, unaffected |

What the locked accounts use:

| App | Under SSO-only |
| --- | --- |
| Jellyfin web | "Sign in with authentik" |
| Moonfin (iOS, iPadOS, tvOS) | Quick Connect: scan its QR (see below) |
| Neptune (Apple TV) | Quick Connect ([docs](https://docs.neptuneplayer.com/getting-started/setup/authentication)) |
| Jellyfin Android TV | Quick Connect (since 0.14) |
| Seerr (3.4.0 and later; 3.5.1 here) | The Jellyfin **Quick Connect** option on Seerr's login page. Its Jellyfin password login fails. |
| Moonfin's Seerr tab (Moonbase) | Its Quick Connect bridge, which needs Quick Connect on in Jellyfin and Moonbase 2.0.1 or later (2.4.0 here) |
| **Infuse** | **Not supported.** Jellyfin login in Infuse is username and password only, and Firecore has not answered the [Quick Connect request](https://community.firecore.com/t/add-jellyfin-quickconnect-login-feature/49024) since 2024. A signed-in Infuse keeps working until it has to sign in again. Abbie has Infuse on the Apple TV (last used 2026-07-14) and moves to Neptune or Moonfin. |

If an authentik username differs from the Jellyfin one by more than case, add a
`UsernameMappings` entry on the provider (`"<authentik username>": "<jellyfin
username>"`) **before** that person's first SSO login. Otherwise they get a new
empty account. A signed-in user can also link their own account at
`/SSOViews/linking`.

To give Maddie or Deborah SSO, create their authentik account under the same
username and put them in `family` or `friends`. Their password stops working
at their first SSO login.

## Quick Connect and the QR code

Quick Connect is on (`QuickConnectAvailable` in `system.xml`). Do not turn it
off: for every locked account it is the only way into a TV or phone app.

Moonfin's login screen shows a code and a QR code linking to
`<server>/web/#/quickconnect?code=<code>`. That URL is hard-coded in Moonfin
(`lib/util/server_url.dart`) and cannot be changed. The code is after the `#`,
so it never reaches the server and Traefik cannot redirect it.
[`sso-return.js`](assets/jellyfin-sso/sso-return.js) handles it in the
browser:

1. The phone opens the QR link. jellyfin-web sees nobody is signed in and
   bounces to `#/login?…&url=/quickconnect?code=<code>`.
2. The script reads that `url` and replaces the page with
   `/sso/OID/start/authentik?qc=<code>`.
3. authentik signs the user in, with no prompt if the phone already has an
   authentik session.
4. The plugin lands on Jellyfin's Quick Connect page with the code filled in.
   The user taps **Authorize**.

The script never presses Authorize. Jellyfin cannot show which device a code
belongs to, so that tap is the only consent step there is. Auto-approving would
let anyone who gets a user to open a crafted link sign a device in as them.

Each code is redirected at most once per browser tab in five minutes. Someone
without an authentik account (Maddie, on Moonfin) who scans the QR lands on
authentik: pressing **Back** returns to the normal Jellyfin login page with the
code kept, and signing in with a password continues to Quick Connect as before.
Typing the password on the TV works too.

On any other signed-out page, the script adds the page the visitor was trying
to reach to the button's form as `returnUrl`, so "Sign in with authentik" lands
there rather than on the home page.

A Moonfin, Neptune or web session that is already signed in can approve codes
too: user menu → Quick Connect.

## Changing things later

- **Provider settings:** the SSO-Auth settings page. Never re-post
  `provider.json` to `OID/Add` once people have signed in: it would erase their
  links. Update `provider.json` in the repo to match.
- **The provider name** (`authentik`) is in four places that must change
  together: the redirect URIs in `definition.yaml`, the `OID/Add` URL,
  `login-disclaimer.html` and `START_PATH` in `sso-return.js`. It is
  case-sensitive.
- **Plugin updates:** through Jellyfin's plugin UI. The config file survives
  updates.
