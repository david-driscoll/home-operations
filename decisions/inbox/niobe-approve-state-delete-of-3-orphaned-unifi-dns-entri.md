### 2026-07-29T02-02-27: Approve state-delete of 3 orphaned UniFi DNS entries, but BLOCK unblocking the stacks until the UniFi `import` is removed — 3 live arcane-agent records are armed for deletion
**By:** Niobe
**What:** Approve state-delete of 3 orphaned UniFi DNS entries, but BLOCK unblocking the stacks until the UniFi `import` is removed — 3 live arcane-agent records are armed for deletion
**References:** Trinity, components/StandardDns.ts, stacks/unifi-network/local-dns.ts, components/DockgeLxc.ts:948, 46ceb8dd, 40158a90, 81118ad1
**Why:** VERIFIED LIVE (read-only, UniFi controller, 2026-07-28):
- 225 static-DNS records exist (not 75 as reported).
- Stale ids 6a65386add8fb25638ec6016 / 6a653886dd8fb25638ec6031 / 6a65386add8fb25638ec6018 are ABSENT. Confirmed orphans.
- luna.dns.driscoll.tech=6a677f3ff95f1e0084e33297 (100.111.40.101), celestia.dns.driscoll.tech=6a677f3ff95f1e0084e33299 (100.111.30.101), skystar.dns.driscoll.tech=6a677f3ff95f1e0084e3329b (100.111.50.101) — all LIVE at the claimed ids/IPs.
- unifi-network state ids match live exactly for all six dns-node-record-* (alpha-site, celestia, equestria, luna, sgc, skystar). Ownership genuinely moved. unifi-network has 0 pending operations.

DECISION 1 — `pulumi state delete` of the three orphaned `technitium-dns-<node>_dns_driscoll_tech-unifi` entries is APPROVED and is the correct instrument. Each doomed StandardDns has ONLY a `-unifi` child in state (no cloudflare, no technitium child), so the teardown cannot touch Cloudflare or the Technitium zone. Refresh/import are correctly refused: rebinding to the live id would let the pending delete succeed and destroy the Technitium nameserver A records.

DECISION 2 — BLOCKING. Do NOT unblock the three stacks until the UniFi `import` is removed from components/StandardDns.ts. Each of the three stacks holds a `delete:true` pending-delete state entry for a UniFi DNS record whose id is ALSO claimed by a surviving `delete:false` entry:
- gulf-of-mexico: arcane-agent.luna.driscoll.tech id=6a681f41f95f1e0084e38b42
- home-operations: arcane-agent.as.driscoll.tech id=6a681f48f95f1e0084e38b46
- ocracoke: arcane-agent.skystar.driscoll.tech id=6a681f4df95f1e0084e38b4b
All three are LIVE now. They survive only because the 404 is wedging the stacks. The first successful `up` flushes the pending delete and removes a record that state still claims exists — the exact 2026-07-25 Cloudflare wipe mechanism, now on the UniFi provider. These are the ONLY duplicated/pending-delete DNS entries, and UniFi is the ONLY provider still carrying `import:` — causal, not coincidental.

CORRECTION to the stated diagnosis: commit 40158a90 ("remove dockge") only deleted docker/_common/dockge/{compose,definition}.yaml and is unrelated. The real cause is the tailscale sidecar added to docker/_common/technitium/compose.yaml, which trips the `hasTailscaleSidecar` early-`continue` at components/DockgeLxc.ts:948 and stops DockgeLxc from declaring the `technitium-dns-*` StandardDns. Commit 46ceb8dd then re-created the same hostnames in unifi-network; the UniFi controller keys on hostname, so that create displaced the old records and issued new ids, stranding the old ids in the three stacks' state.

ORDERING REQUIREMENT: remove the UniFi import first, then state-delete the three orphans, then run up. Not the reverse.