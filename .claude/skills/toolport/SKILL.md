---
name: toolport
description: Use when you need homelab tools through toolport -- the toolport-infrastructure, toolport-networking, toolport-home, toolport-media, toolport-postgres or toolport-research MCP servers (Kubernetes, Proxmox, Docker, UniFi, Tailscale, GitHub, Pulumi, OpenBao, Home Assistant, the *arr stack, ECM, every Postgres database, docs search). Covers the search-then-call workflow toolport's lazy discovery requires; search a profile before concluding a capability is unavailable.
---

<!--
Vendored from upstream. Renovate bumps the version in the URL below together
with the ghcr.io/btsouth/toolport-gateway image (the `toolport` group in
.github/renovate.json5); `mise run toolport-skill-sync` then replaces
everything between the BEGIN/END markers with that version's text, and
.github/workflows/toolport-skill-sync.yaml does it on Renovate's PR for you.
Edit ONLY outside the markers: the frontmatter above and the estate section
below are ours; the body in between is overwritten on every bump.

agentboard installs this same file user-wide at boot, from main
(TOOLPORT_SKILL_URL in kubernetes/apps/agents/agentboard/helmrelease.yaml).

renovate: datasource=github-releases depName=btsouth/toolport
source: https://raw.githubusercontent.com/btsouth/toolport/v1.20.0/packaging/agent-plugin/toolport/skills/toolport/SKILL.md
-->

<!-- BEGIN upstream -->
# Working through Toolport

Toolport is a local gateway that aggregates every MCP server the user has set
up. Instead of hundreds of tool definitions, you see a few meta-tools and
discover the real tools on demand.

## Core workflow

1. **Search first.** For any external action, call `toolport_search_tools` with
   keywords describing the capability (`"list emails"`, `"create payment"`,
   `"recent deployments"`). If the service is connected, its tool is here, so do
   not tell the user a capability is unavailable until you have searched.
2. **Call it.** The first matching result includes its exact name and full input
   schema and is ready to use: call `toolport_call_tool` with that `name` and
   all parameters inside the `arguments` object. Don't keep searching for a
   better match, and never invent identifiers (teamId, projectId, and so on). Fetch
   them with a list/get tool on the same server first.
3. **Orient when needed.** `toolport_status` lists every connected server, its
   tool count, and the tokens Toolport has saved. Pass `server` to
   `toolport_search_tools` (with an empty `query`) to list one server's full
   tool set.

## Search tips

- Tool names are namespaced per server: `stripe__create_refund`.
- If the result says more tools matched than were shown, narrow with `server`
  or raise `limit` before concluding anything is missing.
- Many servers expose a generic API bridge (one write/create tool), so search
  by capability, not exact operation names.

## Multi-step work: `toolport_run_script`

When you already know the steps, run ONE JavaScript orchestration script
server-side instead of many round-trips: `servers.stripe.create_refund({...})`
(sync) or `.async({...})` with `Promise.all` to fan out. Intermediate results
stay full-sized inside the script; only your returned value is shaped for
context. Pass `validate: true` for a dry run that compiles the script and
returns the plan without executing. If a script fails partway,
`structuredContent.toolportScript.progress` lists which calls already ran
(their side effects are committed), so resume by index, not tool name.

## Results, approvals, and errors

- **Truncated results:** a `[Toolport shaped this result]` marker means the
  result was cut for context, not lost. Page the rest with
  `toolport_fetch_result` using the marker's `cursor`/`offset`, or pass
  `projection` (a dot path like `data.items.0.name`) to pull one field.
- **Destructive calls:** Toolport may intercept a destructive call and return a
  preview with a `token`. Confirm with `toolport_confirm` within 60 seconds to
  execute it unchanged, or a human approves it in the Toolport app. A denied
  call is a decision, not an error, so don't retry it verbatim.
- **Server management:** when the user has allowed agent control,
  `toolport_enable_server` / `toolport_disable_server` turn servers on or off
  by id or name (see `toolport_status` for the list).
- **Gateway not found:** if the Toolport server itself fails to start, the
  desktop app isn't installed. The user can get it at https://toolport.app.
<!-- END upstream -->

## In this estate

Toolport here is **not** the desktop app. It is a headless gateway in the
`agents` namespace (`kubernetes/apps/agents/toolport`) in front of the same
ToolHive-run MCP backends `agent-tools` aggregates. So:

- **Pick the MCP server for the domain.** There is one toolport entry per
  _profile_, and each sees only its own servers -- `toolport_status` in one
  profile will not list another's. A capability missing from one profile is
  usually just in a different one:
  - `toolport-infrastructure`: `kubernetes`,
    `proxmox-{twilight-sparkle,celestia,luna,alpha-site}`,
    `docker-{celestia,luna,alpha-site}`, `github`, `pulumi`, `openbao`
  - `toolport-networking`: `unifi-{network,protect,access}`, `tailscale`
  - `toolport-home`: `home-assistant`
  - `toolport-media`: `arr-plex`, `arr-jellyfin`, `ecm`
  - `toolport-postgres`: `postgres` -- every database in the estate, one
    DBHub source each. Its tools are per database:
    `postgres__execute_sql_<db>` and `postgres__search_objects_<db>`, with `-`
    in a database name written `_` (e.g. `execute_sql_jellyfin_pg`). Search
    `toolport_search_tools` with the database name. `authentik` (the SSO
    database, on its own cluster) is read-only; the rest are read-write as
    the cluster superuser, so be deliberate with anything but SELECT.
  - `toolport-research`: `context7`, `microsoft-docs`, `nuget`, `degoog`

  Tool names are `<server id>__<tool>`, e.g. `kubernetes__list_resources`.
  `homelable` is not in toolport (it needs an `X-API-Key` header toolport cannot
  send) -- use `agent-tools` for it.

- **There is no human approval step.** `humanApproval` is off, so ignore the
  "a human approves it in the Toolport app" and "the desktop app isn't
  installed" lines above. Destructive calls go straight through: be as careful
  as you would calling the backend directly.
- **Do not call `toolport_enable_server` / `toolport_disable_server`.** Agent
  control is off, and the registry is rendered from git by External Secrets
  anyway -- servers and profiles are changed in
  `kubernetes/apps/agents/toolport/resources/registry.json`.
- **Where it is reachable.** In agentboard the profile entries are already in
  `.mcp.json`, each sending its profile's bearer. Off-cluster, the tailnet-only
  OAuth door is `https://toolport-mcp.<tailnet>/mcp`; there every profile
  appears at once, prefixed `toolport-<profile>_`.
