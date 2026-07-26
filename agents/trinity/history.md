# Trinity — History

## Day 1 — 2026-07-26

Joined the home-operations crew as Pulumi & TypeScript IaC. Requested by David Driscoll.

**What I own:** `stacks/`, `components/`, `sdks/`, `dynamic/`, `docker/` in `home-operations`, plus Pulumi work in the `vault` repo.

**Architecture I inherited:**
- Pulumi TypeScript monorepo, run directly via `tsx` ESM loader — no compile step.
- Path aliases: `@components/*`, `@dynamic/*`, `@openapi/*` (in `tsconfig.json`).
- **Provider centralization:** all providers constructed in `components/globals.ts`, consumed by stacks. Never duplicate a provider in a stack.
- **ComponentResource pattern:** reusable infra lives in `components/` (e.g. `ProxmoxHost`, `DockgeLxc`), then wired into stacks.
- **1Password integration:** `OPClient` from `components/op.ts`. Outputs stored as `OnePasswordItem`. Canonical pattern: `stacks/authentik/index.ts`.
- Canonical stack usage example: `stacks/home/index.ts`.

**Workflow:** `npm ci` at repo root; `cd stacks/<name>` then `pulumi preview` before `pulumi up --yes`. Env vars come from `.mise.toml` via `op://` references (CONNECT_HOST, CONNECT_TOKEN, PULUMI_CONFIG_PASSPHRASE, AWS_* for Minio, AUTHENTIK_*).

**Hard-won rules seeded on day 1:**
- Never set `import` on a `cloudflare.DnsRecord` — id formats can never match, so it re-imports every run and `deleteBeforeReplace` wipes live DNS. This has happened twice.
- Reshaping a DNS record must reuse the old Pulumi resource name, or Cloudflare 81054 stalls the stack.
- Full `pulumi refresh` fails on these stacks (UniFi provider hard-errors on read-404). Use targeted `--target` refresh.
- An `UpdateFailed` Stack can be un-stalled with the `pulumi.com/reconciliation-request` annotation.

**My crewmates:** Morpheus (lead), Tank (Kubernetes/Flux), Niobe (networking/DNS), Dozer (secrets/identity), Mouse (verification — reviews my previews), plus Scribe, Ralph, Rai, Fact Checker.
