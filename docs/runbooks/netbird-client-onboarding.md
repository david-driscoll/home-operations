# Getting onto the estate with NetBird

For family and friends on phones and laptops (#2887). The design is in
[`docs/plans/netbird-mirror.md`](../plans/netbird-mirror.md).

## Before you start

- **Your Authentik account must be in one of these groups:** admins, family, friends or
  media-managers. Anyone else can't sign in to NetBird at all.
- **Turn Tailscale off on this device.** Phones and tablets only allow one VPN at a time.
  Two meshes on one laptop also route the same LAN twice. Admins who need both on one
  laptop can keep them, because the NetBird range (10.100.0.0/16) doesn't clash with
  Tailscale's.

## Set it up

1. **Install NetBird.**
   - iPhone/iPad and Mac: the App Store.
   - Android: Google Play.
   - Windows and Linux: [netbird.io/download](https://netbird.io/download).
2. **Point it at our server, not NetBird's cloud.** This is the step people miss.
   - **Phone:** open the menu → **Change Server**, then enter
     `https://netbird.<root domain>`. Use the real domain; it's in the admin's
     password manager.
   - **Laptop:** run `netbird up --management-url https://netbird.<root domain>`.
3. **Sign in.**
   - Choose **Authentik**, then use your usual login.
   - On a NetBird-only device, the **NetBird** button on Authentik's login page signs you
     in without a password once it exists (#2891).
4. **Connect.** The app shows the site gateways as routes. Leave them on.

## What works

- **App names:** the usual `<app>.<root domain>` names open: Jellyfin, Home Assistant,
  Authentik, and so on. Lookups go to the estate's DNS through the gateways.
- **Exit nodes (optional):** under **Exit node**, pick a gateway to send all traffic
  through home, e.g. on hotel Wi-Fi. Leave it off otherwise.
- **Signing in again:** NetBird asks you to sign in every 30 days.

## Apple TV

TVs don't sign in. An admin enrols them with the `apple-tv` setup key; see #2886.

## When it doesn't work

| Symptom | Check |
|---|---|
| "No account" or a login loop | Your Authentik user is not in an allowed group |
| Connected, but names don't resolve | The app's DNS setting must be on; reconnect |
| Names resolve but pages time out | No gateway is up; tell an admin (gateways are the `netbird-gateway` stack on the Dockge hosts) |
| A phone shows Tailscale "connected" too | Turn Tailscale off; only one VPN can be active |
