---
status: accepted
---

# NetBird uses its own login, not Authentik

NetBird signs people in with its built-in identity provider (local users, invited one at a time), not with Authentik, even though Authentik is the estate's identity provider for everything else. The management server runs on Azure, and Authentik is reachable only from the LAN and the tailnet. So neither the server nor a NetBird-only phone away from home could ever reach Authentik's issuer. Exposing Authentik publicly just for this was rejected. The cost is a second password per person. nbidp narrows that gap in the other direction: a NetBird device can log in to Authentik without a password.

## Consequences

- Group membership lives in NetBird (user groups the `netbird` stack creates, assigned by invite), not in Authentik group claims. JWT group sync is off.
- Invites are sent under the person's Authentik email, because nbidp matches people by it.
- Decision log: D25–D29 in `docs/plans/netbird-mirror.md`. They supersede D9, the Authentik connector.
