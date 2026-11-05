# Getting onto the estate with NetBird

For family and friends on phones and laptops (#2887). The design is in
[`docs/plans/netbird-mirror.md`](../plans/netbird-mirror.md).

NetBird has its own login with its own password, separate from Authentik. You join
with an invite link from an admin, and it works from anywhere: the server is public,
so you don't need to be at home or on Tailscale.

## For the admin: send an invite

```bash
mise run netbird:invite <email> "<name>" <group>
# e.g. mise run netbird:invite pinkie@example.com "Pinkie Pie" family
```

- **`<group>`** is one of `admins`, `family`, `friends` or `media-managers`. It decides
  what the person's devices can reach (`stacks/netbird/policy.ts`). Each person gets
  exactly one. `admins` invites are NetBird **admins** and get the dashboard; everyone
  else is a regular user with no dashboard.
- A person's own devices reach each other, and nobody else's: `stacks/netbird` gives
  every user a `self-<name>` group and policy on its next run (`selfAccess.ts`). Until
  that run, a new person's phone and laptop cannot see each other.
- **`<email>`** should be the person's **Authentik email**. NetBird doesn't need it,
  but the passwordless **NetBird** button on Authentik's login page matches people by
  that email (nbidp, #2891). With any other email they would arrive at Authentik as a
  stranger.
- The task prints the invite link. Send it to the person yourself; NetBird emails
  nothing. The link expires after **72 hours**.
- `--dry-run` (anywhere in the arguments) checks the group and shows the request
  without sending it.

The task reads the NetBird API credential from OpenBao through fnox's `netbird`
profile (`.config/fnox.toml`), the same automation → owner-pat → owner chain Pulumi
uses. It needs the OpenBao AppRole that every `fnox exec` uses.

| Message | Meaning |
|---|---|
| `"x" is not a user group` | Typo in the group; it lists the four |
| `NetBird has no group "family" yet` | `stacks/netbird` hasn't created the user groups; let it run |
| `HTTP 409` | A user or invite for that email already exists: Team → Users in the dashboard |
| `No usable NetBird PAT` | Every PAT has expired: see "Both expired" in the plan's implementation notes |

**A lost or expired link:** in the dashboard, Team → Users → Invites, regenerate it
(that invalidates the old one), or delete the invite and run the task again.

**Changing someone's group:** Team → Users → the person → edit their groups. Their
devices follow (group propagation is on).

**Removing a device:** delete its peer (Peers → the device → Delete). Logins never
expire, so a device stays on until then. Removing a person: block or delete the user,
then delete their peers.

## For the person: set it up

1. **Open the invite link** and choose a password. This is your NetBird password; it
   is not your Authentik one. Any network works.
2. **Turn Tailscale off on this device.** Phones and tablets only allow one VPN at a
   time. Two meshes on one laptop also route the same LAN twice. Admins who need both
   on one laptop can keep them, because the NetBird range (10.100.0.0/16) doesn't
   clash with Tailscale's.
3. **Install NetBird.**
   - iPhone/iPad and Mac: the App Store.
   - Android: Google Play.
   - Windows and Linux: [netbird.io/download](https://netbird.io/download).
4. **Point it at our server, not NetBird's cloud.** This is the step people miss.
   - **Phone:** open the menu → **Change Server**, then enter
     `https://netbird.<root domain>`. Use the real domain; the admin sends it with the
     invite (it's the start of the invite link).
   - **Laptop:** run `netbird up --management-url https://netbird.<root domain>`.
5. **Log in** with the email and the password you just set.
6. **Connect.** The app shows the site gateways as routes. Leave them on.

Once a device is connected, the **NetBird** button on Authentik's login page signs you
in to the estate's apps without a password (#2891).

## What works

- **App names:** the usual `<app>.<root domain>` names open: Jellyfin, Home Assistant,
  Authentik, and so on. Lookups go to the estate's DNS through the gateways.
- **NetBird app names:** every app with a Tailscale name, `<app>.<tailnet>`, that your group may use is also
  at **`<app>.app.<root domain>`**, with the same `<app>` (for example `sonarr.app.<root domain>`,
  or `git.app.<root domain>` for Forgejo). These names work only with NetBird
  connected, and only for apps your group may use; any other name resolves to
  nothing or answers 403. Apps that log you in themselves need their login
  allowed for the new name first; until an admin has done that, use `<app>.<root domain>`.
- **Exit nodes (optional):** under **Exit node**, pick a gateway to send all traffic
  through home, e.g. on hotel Wi-Fi. Leave it off otherwise.
- **Staying signed in:** NetBird never asks you to log in again on a connected device.

## Apple TV

TVs don't log in. An admin enrols them with the `apple-tv` setup key; see #2886.

## When it doesn't work

| Symptom | Check |
|---|---|
| The invite page says the link is invalid or expired | Ask the admin for a new link (72 hours, one use) |
| The app opens NetBird's cloud login | The server wasn't changed (step 4) |
| Login rejected | You're using your Authentik password; use the NetBird one from step 1 |
| Connected, but names don't resolve | The app's DNS setting must be on; reconnect |
| Names resolve but pages time out | No gateway is up; tell an admin (gateways are the `netbird-gateway` stack on the Dockge hosts) |
| Pages are blocked that others can open | Your group; an admin checks it under Team → Users |
| `<app>.app.<root domain>` doesn't resolve or answers 403 | Your group isn't in that app's `access_policy` (its `definition.yaml`), or the app is new and `stacks/netbird` hasn't run since (daily, or after the next merge) |
| `<app>.app.<root domain>` answers 400 "no app for hostname" | An Authentik-gated app with no proxy provider for the NetBird name yet; use `<app>.<root domain>` |
| A phone shows Tailscale "connected" too | Turn Tailscale off; only one VPN can be active |
