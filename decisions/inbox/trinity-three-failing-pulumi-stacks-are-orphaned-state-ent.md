### 2026-07-29T02-08-33: Three failing Pulumi stacks are orphaned state entries from PR #586, not #592/40158a90; remediation is `pulumi state delete` run locally, never refresh/import
**By:** Trinity
**What:** Three failing Pulumi stacks are orphaned state entries from PR #586, not #592/40158a90; remediation is `pulumi state delete` run locally, never refresh/import
**References:** PR #602, PR #586 (189141b9), PR #582 (81118ad1), PR #592 (46ceb8dd), stacks: gulf-of-mexico, home-operations, ocracoke
**Why:** ## Decision

`gulf-of-mexico`, `home-operations` and `ocracoke` each fail on a `(delete)` of an orphaned
`unifi:dns/record:Record` whose id 404s. Confirmed as orphaned state entries. Remediation is
`pulumi state delete` of the orphan child (and optionally its childless `StandardDns` component
parent), run LOCALLY from `stacks/<dir>` under `op run --no-masking --`. Prepared but NOT executed;
awaiting human approval.

## Corrections to the original diagnosis

- **Ownership moved in 189141b9 (PR #586, 2026-07-27), not 46ceb8dd/#592 and not 40158a90.**
  189141b9 deleted `DockgeLxc.technitiumInit()` — the sole creator of
  `technitium-dns-<host_with_underscores>` — and added `stacks/unifi-network/local-dns.ts` in the
  same commit. 46ceb8dd is a later follow-up.
- **40158a90 "remove dockge" did NOT tear down the DockgeLxc tree.** It only deleted
  `docker/_common/dockge/{compose,definition}.yaml`. `components/DockgeLxc.ts` is intact at HEAD
  and `DockgeLxcDockerParent` is still constructed. 40158a90 explains the *other* 7/18/7
  CopyToRemote deletes, not the DNS delete.
- **225 static-DNS records exist on the controller, not 75.**
- **No `-cloudflare` or `-technitium` siblings exist** under any of the three `StandardDns`
  parents. Each parent has exactly one child, the `-unifi` record. Cloudflare exposure is nil.

## Unanticipated finding

Six *additional* `unifi:dns/record:Record` ids in these states do not exist on the controller, and
the hostnames are absent live entirely: `pbs.luna`, `pbs.celestia`, `netbootxyz`, `arcane`,
`pbs.skystar`, `backrest.skystar` (all `.driscoll.tech`). State claims them, so `up` sees no diff
and will not recreate them — those names have no UniFi record right now. Separate remediation,
separate approval.

## Code fix

The UniFi half of `components/StandardDns.ts` carried the same `import` + `deleteBeforeReplace`
defect removed for Cloudflare in 81118ad1. Provider evidence (filipowm/terraform-provider-unifi
v1.1.0 `ImportIDWithSite`) shows `default:<id>` can never equal the bare `<id>` stored in state.
Disarmed in PR #602. That PR does not fix the three stacks.

## Standing constraints reaffirmed

Never `pulumi refresh` / `import` / re-import these resources — rebinding state to the live ids
would make the pending `(delete)` succeed and wipe the Technitium nameserver A records that
split-horizon DNS depends on.
