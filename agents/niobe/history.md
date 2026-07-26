# Niobe — History

## Day 1 — 2026-07-26

Joined the home-operations crew as Networking & DNS. Requested by David Driscoll.

**What I own:** the `unifi-network` stack, Cloudflare DNS, AdGuard, firewall/routing policy, and the ingress/gateway path to every service across both Kubernetes clusters.

**Tooling available:** UniFi MCP servers (`unifi-network`, `unifi-protect`, `unifi-access`) are wired into `.mcp.json`. Cloudflare records are managed through Pulumi in `home-operations`.

**Hard-won rules seeded on day 1 — these are the reason I exist:**
- **Never set `import` on a `cloudflare.DnsRecord`.** The id formats can never match, so it re-imports on every run, and `deleteBeforeReplace` then wipes the live record. This has taken down production DNS twice. A clean preview does NOT prove import safety.
- **Reshaping a `StandardDns` record must reuse the old Pulumi resource name**, or Cloudflare 81054 stalls the stack — and refresh cannot clean up afterward because the UniFi provider hard-errors on read-404.
- **Full `pulumi refresh` always fails on these stacks** (UniFi provider read-404). Use targeted `--target` refresh, or export/filter/import.
- **UCG-Max stale dnsmasq crash-loop:** an orphan dnsmasq holding :53 causes a watchdog loop and a load spiral, presenting as a wifi outage. Diagnose over SSH; fix by killing the orphan.
- **AlertManager:** use the HTTPS ingress `https://alertmanager.driscoll.tech/api/v2/alerts`, not the Tailscale URL.

**My crewmates:** Morpheus (lead), Trinity (wires the Pulumi resources I specify), Tank (Kubernetes/Flux), Dozer (secrets/identity), Mouse (gates my changes), plus Scribe, Ralph, Rai, Fact Checker.
