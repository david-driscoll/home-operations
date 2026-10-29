# Jellyfin: sign-in through authentik

How Jellyfin users sign in with authentik, what the plugin does to their
permissions, and how that reaches the apps that cannot do OIDC themselves
(Moonfin, Neptune and the other TV apps). Written 2026-10-29 against
Jellyfin 12.4 and SSO-Auth 6.1.0.0.

## What is where

| Piece | Where | What it does |
| --- | --- | --- |
| authentik provider + application | [`jellyfin/definition.yaml`](../../kubernetes/apps/equestria/media/jellyfin/definition.yaml) `authentik.oauth2`, applied by the `system` Pulumi stack | Confidential client, slug `jellyfin`. The definition's `access_policy` (`family`, `friends`) alone decides who may sign in. Client id, secret and issuer also go to OpenBao at `secrets/clusters/equestria/apps/jellyfin/oidc`. |
| SSO-Auth and JavaScript Injector plugins | Jellyfin's plugin directory on the `jellyfin` PVC, **installed by hand** | [MaxRink/jellyfin-plugin-sso](https://github.com/MaxRink/jellyfin-plugin-sso) and JavaScript Injector. Installed and updated through Jellyfin's plugin UI, like Meilisearch. |
| Plugin settings, login button, QR script | [`stacks/system/jellyfin-sso.ts`](../../stacks/system/jellyfin-sso.ts), applied in the same run as the authentik client | Writes the SSO-Auth provider and plugin-wide settings, the branding login disclaimer and CSS, and one JavaScript Injector script, through Jellyfin's API. |
| Button and script sources | [`jellyfin/resources/`](../../kubernetes/apps/equestria/media/jellyfin/resources/) | `login-disclaimer.html`, `custom.css` and `sso-return.js`, read by the stack at run time. |
| Read-modify-write resource | [`dynamic/jellyfin/JellyfinConfiguration.ts`](../../dynamic/jellyfin/JellyfinConfiguration.ts) | A dynamic provider for any Jellyfin JSON configuration document. See [How the stack writes it](#how-the-stack-writes-it). |

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

1. **Install the plugins before merging.** Without them, the `system` stack's
   run fails (see below). It is safe to install the SSO plugin early: with no
   provider configured, it does nothing.
   - Dashboard → Plugins → Repositories → add
     `https://raw.githubusercontent.com/MaxRink/jellyfin-plugin-sso/manifest-release/manifest.json`,
     then install **SSO Authentication**.
   - JavaScript Injector is already installed.
   - Restart Jellyfin.
2. **Merge.** Flux applies the definition. On its next run, the `system` stack
   creates the authentik client and writes Jellyfin's settings from it.
3. **Check sign-in before anyone else uses it.** Open
   `https://jellyfin.<root domain>/sso/OID/start/authentik` as `david`. You
   should land on the existing `david` account, still an admin. Dashboard →
   Users → david should still show administrator, all libraries and Live TV. If
   admin is gone, the `groups` claim is not arriving: see
   [Permissions](#permissions).

There is nothing to paste. The settings page, Branding and JavaScript Injector
all show what the stack wrote.

### How the stack writes it

Every one of these Jellyfin endpoints takes the whole document on POST. The
SSO plugin's document also holds state the plugin writes itself (the account
links saved at every first login), and JavaScript Injector holds other people's
scripts. So `JellyfinConfiguration` never posts blind. It reads the live
document, lays the owned fields over it, and posts only when something
differs:

- Objects merge key by key. Owning `OidConfigs.authentik.AdminRoles` leaves
  `OidConfigs.authentik.CanonicalLinks` and `UsernameMappings` as they are.
- Arrays and scalars replace.
- The script is matched by its name, "SSO return (managed by Pulumi)". Other
  scripts are not touched.
- **Owned fields edited in Jellyfin's UI are put back on the next run**, about
  every 10 minutes. Change them in `jellyfin-sso.ts` or `resources/` instead.
  That includes the **whole** Branding CSS (Dashboard → Branding → Custom CSS):
  to add CSS, add it to `resources/custom.css`.
- **The run fails** if Jellyfin is down, a plugin is missing, or the API key is
  rejected. That is deliberate: those are faults worth seeing.
- Removing a resource from the stack leaves the settings in Jellyfin.

The admin API key is the one at `clusters/equestria/apps/jellyfin/api-key`,
also used by the dashboard and setup-status. The stack calls Jellyfin at
`jellyfin.equestria.svc.cluster.local:8096`, so Traefik and DNS play no part.

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
  Password sign-in keeps working throughout.
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
stores a link keyed by the authentik `sub`. Adopted accounts keep their
password, watch history and every permission the plugin does not manage.

Accounts on 2026-10-29:

| Jellyfin | authentik | After their first SSO login |
| --- | --- | --- |
| `david` | `david` | Linked, still admin |
| `Abbie` | `Abbie` | Linked |
| `Nat` | `nat` | Linked (case-insensitive match) |
| `Tami` | `tami` | Linked (case-insensitive match) |
| `Maddie` | none | Never linked, password only |
| `Deborah` | none | Never linked, password only |

If an authentik username differs from the Jellyfin one by more than case, add a
`UsernameMappings` entry on the provider (`"<authentik username>": "<jellyfin
username>"`) in the plugin's settings page **before** that person's first SSO
login. Otherwise they get a new, empty account. The stack does not own this
field, so the entry stays. A signed-in user can also link their own account at
`/SSOViews/linking`.

To give Maddie or Deborah SSO, create their authentik account under the same
username and put them in `family` or `friends`.

### SSO-only: off for now

`EnforceSsoOnly` is `false`. Linked accounts keep their passwords, so password-only
apps keep working. The main one is Infuse: Jellyfin sign-in there is username
and password only, and Firecore has not answered the
[Quick Connect request](https://community.firecore.com/t/add-jellyfin-quickconnect-login-feature/49024)
since 2024.

`SsoOnlyExemptUsernames: ["david"]` is already set. Turning SSO-only on is a
one-line change in `jellyfin-sso.ts`. When it is on:

- Every linked account's password stops working. Existing app sessions are not
  revoked, but any app that has to sign in again fails if it uses a password.
- Apps that keep working, through Quick Connect: Jellyfin web (SSO button),
  Moonfin, Neptune, Jellyfin Android TV, Seerr 3.4+ (its Quick Connect option)
  and Moonfin's Seerr tab (Moonbase's Quick Connect bridge).
- Apps that stop working: Infuse.
- Turning it on applies at once to accounts that are already linked. The plugin
  runs its enforcement whenever the setting changes.

## Quick Connect and the QR code

Quick Connect is on (`QuickConnectAvailable` in `system.xml`). Keep it on: it is
how SSO users get into TV and phone apps without a password, and the only way
once SSO-only is enabled.

Moonfin's login screen shows a code and a QR code linking to
`<server>/web/#/quickconnect?code=<code>`. That URL is hard-coded in Moonfin
(`lib/util/server_url.dart`) and cannot be changed. The code is after the `#`,
so it never reaches the server and Traefik cannot redirect it.
[`sso-return.js`](../../kubernetes/apps/equestria/media/jellyfin/resources/sso-return.js)
handles it in the browser:

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

- **Plugin settings, button, CSS, script:** edit `stacks/system/jellyfin-sso.ts`
  or `kubernetes/apps/equestria/media/jellyfin/resources/`, then merge. Edits in
  Jellyfin's UI to fields the stack owns are reverted.
- **The provider name** (`authentik`) must change in four places together:
  `SSO_PROVIDER_NAME` in `jellyfin-sso.ts`, the redirect URIs in
  `definition.yaml`, `login-disclaimer.html`, and `START_PATH` in
  `sso-return.js`. It is case-sensitive.
- **Plugin updates:** through Jellyfin's plugin UI. The settings survive
  updates.
