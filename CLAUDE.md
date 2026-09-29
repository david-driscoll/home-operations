# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
It is sent with every prompt, including every subagent's, so it keeps rules and drops the stories;
the incidents behind them live in [`docs/agents/claude-code.md`](docs/agents/claude-code.md).

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

# Required env vars are `vals` refs in .config/mise.toml (`ref+openbao://`,
# `ref+sops://`, … -- not op:// any more), resolved per command by
# `mise run vals-run <cmd>`. See that file's [env] header.
# CONNECT_HOST, CONNECT_TOKEN, PULUMI_CONFIG_PASSPHRASE
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (Garage `pulumi-state` key, the state backend)
# AUTHENTIK_TOKEN, AUTHENTIK_URL
```

### Every CLI this repo uses comes from mise

`flux`, `kubectl`, `talosctl`, `sops`, `yq`, `jq`, `pulumi`, `age`, `gh`, `tsc`,
`biome`, `yamllint`, `shellcheck`, `typos`, `actionlint` and the rest are pinned in
**`.config/mise.toml`**. There is no `.mise.toml` at the repo root -- the ones under
`docker/*/`, `stacks/*/` and `dashboard/` cover only those subtrees. Almost nothing
is on the system PATH.

**A tool that looks missing is almost never absent** -- an uninstalled pin, an
untrusted config and the wrong working directory all fail silently, looking exactly
like a tool that does not exist. Before reporting one as unavailable:

```bash
mise ls --current        # what is pinned here, and which are "(missing)"
mise install <tool>      # e.g. `flux2`, `npm:typescript` -- a bare `mise install` pulls ~30 tools incl. dotnet
mise trust               # only if a config is reported untrusted
cd <the checkout>        # shims resolve against the CURRENT dir, so /tmp can fail with "No version is set for shim"
```

In the agentboard pod `/root` is already trusted and every pin is installed at boot,
so `(missing)` there means the boot install failed or the pin is newer than the pod.
`mise use -g` is not a workaround: the pod's global config is a read-only ConfigMap
and the write fails with EBUSY.

**There is no standalone `kustomize`** -- `kubectl kustomize <dir>` is it. For a
Flux-rendered check (labels, `postBuild` substitution) `flux build` runs offline,
but only when handed the Kustomization CR:

```bash
flux build kustomization <name> -n <ns> --path <dir> \
  --kustomization-file <dir>/ks.yaml --dry-run
```

## Architecture

Pulumi TypeScript monorepo managing homelab infrastructure across multiple clusters and services.

```
bootstrap/      # Bootstrap-tier secrets (SOPS) + INVENTORY/RUNBOOK: the OpenBao seal chain, recovery shares, Pulumi AppRole/passphrase
components/     # Shared Pulumi ComponentResource code (providers, helpers)
stacks/         # Deployable Pulumi stacks (home, authentik, backups, unifi-network, system, vault, ...)
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
| `.config/mise.toml`         | Tool versions and env var setup (NOT `.mise.toml`) |
| `bootstrap/INVENTORY.md`    | Every secret needed to bring the estate up from nothing, and where it lives |
| `bootstrap/RUNBOOK.md`      | Break-glass procedures (OpenBao sealed, cluster gone, rebuild) |

## MCP tools when running under agentboard

Inside the agentboard pod (`env | grep -q STAKATER_AGENTBOARD`) reach the estate
through the **`toolport-*` MCP servers**, one per profile: `toolport-infrastructure`
(Kubernetes, Proxmox x4, Docker x3, GitHub, Forgejo, Pulumi, OpenBao),
`toolport-networking` (UniFi, Tailscale, homelable), `toolport-home` (Home
Assistant), `toolport-media` (the *arr stack, ECM, Teamarr, Tdarr — IPTV in
`docs/kubernetes/iptv.md`), `toolport-postgres` (every database) and
`toolport-research` (docs search, Context7, Microsoft Learn). Load the `toolport`
skill first: discovery is lazy, so you search a profile's tools and then call them.

- **`Needs authentication` on a `toolport-*` server in this pod is never a login
  problem** — the client resolved the wrong URL (in-pod it is
  `TOOLPORT_<PROFILE>_URL`). All six timing out at once usually means a stale
  checkout whose `.mcp.json` predates the per-profile doors.
- The `agent-tools` server and its `toolhive-*_` tool prefix are retired.

Full detail, tool inventory and troubleshooting: `docs/kubernetes/agentboard-mcp.md`.

### Work in a git worktree, not the shared checkout

`/root/home-operations` in the agentboard pod is **one checkout on one PVC** shared
by every terminal, so another session may be live in it -- and a reflexive
`git add -A` can sweep up its work, `*.sops.yaml` included.

- A bare `claude` in an agentboard pane already gets `--worktree` (wrapper in
  `agentboard/resources/bashrc`); `--continue` and `--resume` pass through
  untouched, because a resumed session belongs where its transcript came from.
- **If you are already running in the shared checkout, use `EnterWorktree`
  before editing anything.** `git status --short` showing files you did not
  touch means another session is live in there.
- New worktrees branch from `origin/main` and symlink `node_modules` (the
  `worktree` block in `.claude/settings.json`), so no `npm ci` per worktree.
  `git worktree add <path> origin/main` is the manual equivalent.

Never `git add -A` in the shared checkout without reading `git status` first.

## Safety

- Never commit plaintext credentials. `.config/mise.toml` uses `vals` references (`ref+openbao://`, `ref+sops://`, …); `Pulumi.*.yaml` files use `encryptionsalt`.
- Run `pulumi preview` before every `pulumi up`, especially for DNS/provider changes.
- Test risky changes against a non-production stack (alpha-site) first.
- Code can create/modify 1Password items — be intentional when touching `OPClient` or stacks that persist outputs.
- Never run a formatter or editor auto-fix over a `*.sops.yaml`; `bootstrap/openbao/` holds the estate's recovery material and a corrupted MAC is unrecoverable.
- **Never write the root domain or the tailnet name literally** — not in code, manifests, docs, comments, commit messages, PR/issue text or memory. The repo is public and its history is being scrubbed of both ([`docs/plans/private-domain-scrub.md`](docs/plans/private-domain-scrub.md)). Their only home is SOPS: `ROOT_DOMAIN` / `TAILSCALE_DOMAIN` in `kubernetes/flux/meta/shared-secrets.sops.yaml`. Write `${ROOT_DOMAIN}` / `${TAILSCALE_DOMAIN}` in Flux-rendered values, `<root domain>` / `<tailnet>` in prose and in comments (a `${…}` in a comment gets substituted), and an environment lookup in code. `scripts/private-domain-guard` enforces it at commit (hk) and on every agent Write/Edit (a PreToolUse hook).

## See also

- **Don't read `AGENTS.md` whole.** It is APM's Copilot build of `.github/instructions/`
  -- ~64 KB (~16K tokens) of generic DevOps, C# and HTML guidance. The one
  estate-specific file there, `.github/instructions/docker-dockge-memory.instructions.md`,
  is not even in it: read that when working under `docker/`.
- **Before adding a skill, plugin, MCP server, hook or CLAUDE.md section**, read the
  context-budget part of [`docs/agents/claude-code.md`](docs/agents/claude-code.md):
  each one is paid by every agent on every spawn.

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
