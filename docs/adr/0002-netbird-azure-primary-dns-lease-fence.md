---
status: accepted
---

# NetBird's management server runs on Azure, with a DNS lease as the fence

The plan put the management server on OCI's Always Free tier, with Azure as the fenced standby (D3, D5). OCI never had Arm capacity in the tenancy's only region, and a free-only tenancy cannot use another region. So Azure East US 2 became the primary host and Azure Central US the standby. The OCI VM is parked (`ociVm: false`), and the OCI quota, budget and network stay ready for it to rejoin as a standby. At most one host may run the management server: two at once would split the account. The arbiter is the public DNS record for its name, not a lock service. Each host starts the management server only if that record resolves to its own address, and failover is a watchdog in Equestria moving the record. A consensus store or a shared database were rejected, because DNS is the thing clients follow anyway. A host that disagrees with DNS is useless to clients even if it runs.

## Consequences

- The Azure VMs cost about $64 a month out of a credit-limited subscription with its spending limit on. Exceeding the limit stops every VM, so exit nodes on Azure are held off.
- Failback is manual and runbooked (`docs/runbooks/netbird-failback.md`, D8).
- A host that boots while the lease points elsewhere stays passive by design.
- Decision log: D3–D8 in `docs/plans/netbird-mirror.md`, plus D48 ("Azure primary, OCI parked").
- **2026-11-07 (#3161): the watchdog flips only on a failure it can see past its own route.** Equestria is the only vantage point, so a dead primary VM and Equestria losing just its route to the primary look the same. The candidate second signals were all weighed and none is independent of that route:
  - Gatus checks `relay-eus2`/`relay-cus` from alpha-site, which shares Equestria's home WAN. It also checks the relay, not management.
  - The relay probes (`components/netbird/relayProbe.ts`) run on the Azure hosts but probe the *home* relay. They say the hosts can reach home, not that clients can reach the primary, and their heartbeat goes stale after 15 minutes, slower than the 5-minute flip.
  - The standby has no view of the primary at all: its fence asks only the nameservers.

  So the watchdog alerts instead of flipping. It flips only when the holder still answers TLS on 443, which proves the route works and pins the failure on management (the #2892 drill's case, and a crashed or stopped `netbird-server`). A holder that answers nothing holds and pages `NetbirdFailoverBlocked`, and a person promotes the standby with the config switch. That gives up automatic failover for a whole-VM or whole-region outage, which is rare, in exchange for never splitting clients over a route problem on our side. The fix for that gap is a real second vantage point, for example the standby probing the primary's management and reporting it. That would be new code on the hosts, and is out of scope here. In the same change: a run that cannot read Cloudflare pages `NetbirdFailoverWatchdogBlind` after 5 in a row and never flips, and only unbroken streaks of failures count.
