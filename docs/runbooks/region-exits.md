# Appearing to be somewhere else: region exits

For family and friends. This page explains how to make your internet traffic look like it comes
from another country, for example to watch another country's streaming catalogue or to see what
a site shows abroad. The design is in [`docs/plans/region-exits.md`](../plans/region-exits.md).

It replaces Tailscale's Mullvad exit nodes, which stop working at the end of November 2026.

## The five region exits

There are five shared region exits, named after the Wonderbolts. Each one is somewhere in the
world at any moment:

| Region exit | Usually in |
|---|---|
| spitfire | United States |
| soarin | Canada |
| fleetfoot | United Kingdom |
| misty-fly | Germany |
| high-winds | Japan |

"Usually" because family can move them. Check where each one is right now at
**`wonderbolts.<root domain>`** before you pick one.

## Use one (family and friends)

You need NetBird or Tailscale already set up on your device
([NetBird onboarding](netbird-client-onboarding.md)).

- **NetBird:** open the NetBird app, open **Exit node** (on phones, under **Networks**) and pick
  `region-spitfire` (or another). Pick **None** to stop.
- **Tailscale:** open the Tailscale app, open **Exit node** and pick `spitfire` (or another).
  Pick **None** to stop.

To check it worked, open a "what is my IP" site. It should show the region exit's country and
Mullvad as the provider.

Only use a region exit when you need it. Everything you do goes through it, and it is slower
than your normal connection.

## Move one to another country (family only)

1. Open **`wonderbolts.<root domain>`** and sign in with your usual account.
2. The front page shows every region exit, where it is, and how many people are using it.
3. Click the one to move, choose a country (and a city, if you care), and confirm.

**Moving a region exit moves everyone on it.** If the page says someone is using it, pick
another region exit or ask first. The move takes a few seconds. Your region exit stays where you
put it until someone moves it again.

## If something seems wrong

- **No internet while a region exit is on:** its tunnel is down or still reconnecting. It
  deliberately cuts you off rather than letting traffic out from home. Pick another region exit
  or **None**, and tell David.
- **A site still thinks you're at home:**
  - **On NetBird,** your device still looks up website names at home, and IPv6 traffic skips the
    region exit. Both are known limitations. Try Tailscale instead, or turn off IPv6 or Wi-Fi
    calling on that network.
  - **On Tailscale,** clear the site's cookies or use a private window. Many sites remember
    where you were last time.
- **The region picker says "not allowed":** only family can move region exits. Friends can use
  them as they are.
