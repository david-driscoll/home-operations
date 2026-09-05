# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Developer Workflow

```bash
# One-time setup
curl https://mise.run | sh
mise trust
mise install          # installs Node 24, kubectl, flux2, pulumi, sops, age, etc.
npm ci                # install all workspace dependencies from repo root

# Run a stack
cd stacks/<stack-name>
pulumi preview        # always preview before deploying
pulumi up --yes       # deploy

# Required env vars (provided by .mise.toml via 1Password op:// references)
# CONNECT_HOST, CONNECT_TOKEN, PULUMI_CONFIG_PASSPHRASE
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (Minio)
# AUTHENTIK_TOKEN, AUTHENTIK_URL
```

## Architecture

Pulumi TypeScript monorepo managing homelab infrastructure across multiple clusters and services.

```
bootstrap/      # Bootstrap-tier secrets (SOPS) + INVENTORY/RUNBOOK: the OpenBao seal chain, recovery shares, Pulumi AppRole/passphrase
components/     # Shared Pulumi ComponentResource code (providers, helpers)
stacks/         # Deployable Pulumi stacks (home, authentik, applications, backups, unifi-network, system, vault, ...)
sdks/           # Vendor SDK wrappers (unifi, authentik, adguard, b2, pbs, terrifi)
dynamic/        # Code-generated Pulumi resources (1Password item types)
docker/         # Docker/Dockge stack configs per cluster
```

**Data flow:** 1Password Connect → `OPClient` (`components/op.ts`) → `GlobalResources` (`components/globals.ts`) → providers → ComponentResources in stacks → optional outputs written back to 1Password.

**Clusters managed:** Equestria (Kubernetes); Celestia, Luna, Skystar, Alpha Site (Dockge/Docker). Each is defined by a `clusters/<key>.yaml` file whose `type:` field is authoritative.

## Conventions

- **Provider centralization:** All providers are constructed in `components/globals.ts` and consumed by stacks — never create duplicate providers in a stack.
- **ComponentResource pattern:** Reusable infra goes in `components/` as a `ComponentResource` (e.g., `ProxmoxHost`, `DockgeLxc`), then wired into stacks.
- **1Password integration:** Use `OPClient` from `components/op.ts` for reading/writing secrets. Outputs are stored as `OnePasswordItem` objects (see `stacks/authentik/index.ts` for the canonical pattern).
- **TypeScript execution:** Pulumi runs TS directly via `tsx` ESM loader — no separate compile step needed.
- **Path aliases:** `@components/*`, `@dynamic/*`, `@openapi/*` (configured in `tsconfig.json`).

## Key Files

| File                        | Purpose                                    |
| --------------------------- | ------------------------------------------ |
| `components/globals.ts`     | Provider wiring and shared credentials     |
| `components/op.ts`          | 1Password Connect client                   |
| `stacks/home/index.ts`      | Canonical stack usage example              |
| `stacks/authentik/index.ts` | Example: writing outputs back to 1Password |
| `.mise.toml`                | Tool versions and env var setup            |
| `bootstrap/INVENTORY.md`    | Every secret needed to bring the estate up from nothing, and where it lives |
| `bootstrap/RUNBOOK.md`      | Break-glass procedures (OpenBao sealed, cluster gone, rebuild) |

## MCP tools when running under agentboard

If you are running **inside the agentboard pod** — `env | grep -q STAKATER_AGENTBOARD`,
or `/etc/resolv.conf` searches `agents.svc.cluster.local` — then **use the
`agent-tools` MCP server available inside that container**. It is ~357 tools
across GitHub, Kubernetes, Proxmox (x5), UniFi, Docker (x4), Tailscale, Pulumi,
OpenBao and Postgres, and it is the intended way to reach the estate from here.

- The pod resolves `agent-tools` to a cluster-internal, **unauthenticated**
  Service. Off-cluster clients keep the authenticated external hostname; the
  same committed `.mcp.json` covers both via `AGENT_TOOLS_MCP_URL`.
- **`Needs authentication` on `agent-tools` in this pod is never a login
  problem.** The external door needs a browser-based OAuth flow that cannot be
  completed here — that status means the client resolved the wrong URL.
- The standalone `kubernetes` and `crew_state` MCP entries are expected to fail
  in this image. Use `toolhive-kubernetes_*` from `agent-tools` instead.

Full detail, tool inventory and troubleshooting: `docs/kubernetes/agentboard-mcp.md`.

## Safety

- Never commit plaintext credentials. `.mise.toml` uses `op://` references; `Pulumi.*.yaml` files use `encryptionsalt`.
- Run `pulumi preview` before every `pulumi up`, especially for DNS/provider changes.
- Test risky changes against a non-production stack (alpha-site) first.
- Code can create/modify 1Password items — be intentional when touching `OPClient` or stacks that persist outputs.
- Never run a formatter or editor auto-fix over a `*.sops.yaml`; `bootstrap/openbao/` holds the estate's recovery material and a corrupted MAC is unrecoverable.

## See also

Read AGENTS.md

<!-- crew:begin -->
## Crew — your AI team

This repository is managed by Crew, a multi-agent team runtime that works with
both Claude Code and GitHub Copilot.

- **Coordinator agent:** `.claude/agents/crew.md` (protocol source:
  `.github/agents/crew.agent.md`). For team work — building features,
  triage, standups, roster changes — act as (or delegate to) the crew
  coordinator rather than working solo.
- **Command catalog:** invoke the `crew` skill (/crew) for the interactive
  command menu.
- **Team state:** lives in `.crew/` (roster: `team.md`, decisions:
  `decisions.md`, per-agent charters under `agents/`). Respect the
  state-backend rules in the coordinator protocol before writing there.
- **MCP tools:** `.mcp.json` at the repo root exposes crew's state tools;
  Claude Code loads it automatically.
<!-- crew:end -->

### Agent comment signing (estate rule)

Crew agents post through `gh` with David's credentials, so **every comment an agent
leaves on a `vault` issue or a PR is authored by `david-driscoll`** — the same account
as David's own replies. Sign yours so the two can be told apart:

```
<!-- crew:agent={member} -->
```

Last line of every comment you post to an issue or PR. Anything unsigned is a human
comment by definition, and that inverse is the only reason Ralph can detect David's
replies at all. When your comment answers something David wrote, extend the marker
with `seen={ISO-8601 timestamp of the comment you are answering}`.

Read `.crew/comment-watch.md` before posting comments programmatically, before
changing Ralph's scan, or when a human reply needs routing. The convention is proposed
upstream in [Blacklite/crew#3](https://github.com/Blacklite/crew/pull/3); the local
file stays authoritative for the estate-specific parts (tracker, adoption cutoff,
scope).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
