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
