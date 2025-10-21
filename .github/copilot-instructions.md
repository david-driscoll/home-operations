# GitHub Copilot Guide for home-operations

Purpose: Pulumi TypeScript monorepo for homelab infrastructure and cluster-specific stacks.

Big picture

- Pulumi stacks are in `stacks/*`; reusable Pulumi component code lives in `components/` (ComponentResource patterns).
- `components/globals.ts` centralizes provider construction and credentials fetched via OnePassword Connect (`components/op.ts`).
- `sdks/*` contains vendor SDK wrappers (Unifi, Backblaze helpers); `dynamic/` contains code that generates dynamic/custom resources (e.g., OnePassword items).
- Data flow: 1Password Connect -> `OPClient` -> `GlobalResources` (providers) -> components -> Pulumi resources in stacks -> optional outputs written back to 1Password (see `stacks/authentik/index.ts`).

Quick developer workflow

- Install dev toolchain: `curl https://mise.run | sh` ; `mise trust` ; `mise install` (see `.mise.toml`).
- Install Node workspaces: run `npm ci` at repo root (workspaces: `components/`, `stacks/*`, `sdks/*`).
- Run a stack:
  - cd into the stack folder (e.g. `cd stacks/home`)
  - ensure required env vars are available (`CONNECT_HOST`, `CONNECT_TOKEN`, `PULUMI_CONFIG_PASSPHRASE`) — `.mise.toml` documents these.
  - preview: `pulumi preview`
  - deploy: `pulumi up --yes`
- Use `pulumi preview` liberally when changing providers or DNS, and test against a non-production stack first.

Project-specific conventions

- Centralize provider creation in `components/globals.ts`; stacks should consume those providers instead of creating duplicates.
- Use `OPClient` (`components/op.ts`) to read/write 1Password programmatically. Outputs are commonly stored as `OnePasswordItem` objects (see `stacks/authentik/index.ts`).
- Add reusable infra to `components/` as a Pulumi `ComponentResource` and wire it into stacks, not the other way around.
- Pulumi runtime runs TypeScript via `tsx` (see `Pulumi.yaml` nodeargs). Most stacks don't require a separate compile step.

Integration points & external deps

- Primary integrations: Proxmox VE, TrueNAS, Tailscale, Cloudflare, Unifi, Minio, Backblaze B2, AdGuard, 1Password Connect.
- Look for provider initializers to find touch points: `new CloudflareProvider`, `new TailscaleProvider`, `new BackblazeProvider`, `new TailnetKey`.

Safety checklist (must follow)

- NEVER commit plaintext credentials. `.mise.toml` uses `op://` references; `Pulumi.*.yaml` include `encryptionsalt` — keep secrets out of git.
- Code can create/modify OnePassword items; be intentional when modifying `OPClient` or stacks that persist outputs to 1Password.
- When changing DNS/ingress or provider settings, run `pulumi preview` and validate on a non-production stack.

Key files to inspect first

- `components/globals.ts` — provider wiring and shared credentials
- `components/op.ts` — OnePassword Connect client and mapping helpers
- `stacks/home/index.ts` and `stacks/authentik/index.ts` — canonical stack usage examples
- `sdks/unifi/*` — example vendor SDK wrappers

If any section is unclear or you want a short example ("add a new provider", "add a new stack", or "write Pulumi outputs to 1Password"), tell me which example to add.

MCP servers (tools) agents should use

- mcp_context7_resolve-library-id + mcp_context7_get-library-docs

  - Use for authoritative library documentation and code examples (Pulumi providers, SDKs like `@1password/connect`, Unifi SDKs). Always call `resolve-library-id` first unless the caller supplies a Context7-compatible ID (`/org/project`).

- mcp_microsoft-doc_microsoft_docs_search + mcp_microsoft-doc_microsoft_code_sample_search + mcp_microsoft-doc_microsoft_docs_fetch

  - Use for Microsoft/Azure docs and official code samples. Prefer `code_sample_search` with `language` set when you need runnable snippets. For Azure-related generation or deployment plans, call the Azure best-practice tool (get_bestpractices) first as required by repo rules.

- mcp_duckduckgo_search + mcp_duckduckgo_fetch_content

  - General web search and page fetching for vendor docs, blog posts, or quick troubleshooting. Use when library-specific or vendor-specific MCPs do not return sufficient context.

- mcp_github_pull_request_read, mcp_github_list_discussions, mcp_github_search_issues, mcp_github_list_projects

  - Use to inspect PRs, changed files, discussions and project context in the target repo. Prefer `mcp_github_pull_request_read(method: get_files|get_diff|get)` to obtain exact diffs and changed file lists before editing code or proposing PR changes.

- mcp_flux-operator_get_flux_instance

  - Use to get a report of Flux controllers/CRDs and their status when investigating GitOps/Flux issues.

- mcp_kubernetes_namespaces_list + mcp_kubernetes_resources_create_or_update/get/delete

  - Use for cluster-aware workflows (listing namespaces, creating or updating resources). Only call resource-changing tools when the user explicitly asks to modify a cluster; otherwise prefer read-only queries and local validation (`flux-local`).

- mcp_pulumi_neo-task-launcher

  - Use to launch Pulumi Neo tasks (automated infra work) when the user requests an automated Pulumi operation. Always supply clear context and expected artifacts.

- activate\_\* tools (activate_kubernetes_resource_management, activate_pulumi_deployment_tools, activate_flux_reconciliation_tools, etc.)
  - Call the appropriate `activate_` tool before using specialized domain tools; they ensure the agent has access to the right capabilities and permissions.

Quick rules

- Prefer specialized MCP tools (Context7, Microsoft-doc, GitHub, Flux) over a generic web search when authoritative docs are available.
- Resolve library IDs with `mcp_context7_resolve-library-id` before fetching library docs.
- Never call cluster-modifying tools or Pulumi/Pulumi-Neo tasks without explicit user consent.
