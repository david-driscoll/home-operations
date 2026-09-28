# Claude Code in this repo

`CLAUDE.md` is sent with every prompt, including every subagent's and every
Workflow agent's, so it keeps the rules and leaves the reasons here. The second
half of this file is about that cost: what each agent pays before it does
anything, and the settings that keep the bill down.

## Why the mise rules exist

**Silent failures.** mise will not load a config it does not trust, so no shim is
created and the tool reports exactly what it would if it had never existed. On
2026-09-05 a session concluded from that that the repo had no `flux` and no
`kustomize`, and shipped a PR whose description said the manifest and TypeScript
checks could not be run. Both could: `mise trust` then
`mise install flux2 npm:typescript` took under a minute, and the checks then
showed the one failing `kustomize build` was already failing on `main` -- which
is the answer that PR should have carried.

**Trust in the agentboard pod.** `trusted_config_paths` in
[`agentboard/resources/mise.toml`](../../kubernetes/apps/agents/agentboard/resources/mise.toml)
covers `/root`, and trust inherits by path, so the checkout and every worktree
under it are trusted with nobody at the terminal. A fresh clone elsewhere still
needs `mise trust` once. The pod also installs this config's pins at boot, not
just its own -- `entrypoint.sh` runs `mise install` twice, once per config -- so
a tool being `(missing)` there means the boot install failed or the pin was added
since, rather than the pod never having tried.

**The working directory.** A shim resolves its version from the config covering
the CURRENT directory, so `mise ls --current` run from `/tmp` lists only the
tools `agentboard/resources/mise.toml` pins globally -- not this repo's
`.config/mise.toml`. Most shims fall back to an installed version anyway and work
from anywhere, which is exactly what makes the exceptions confusing. On
2026-09-06 `python3` in an agent's `/tmp` scratchpad hard-failed with
`No version is set for shim: python3`, and that session reported both Python and
`graphify` as unavailable; both were fine, and `cd`-ing into the checkout was the
entire fix. `python` is pinned globally now so that instance is closed, but the
shape is not. `mise use -g` cannot paper over it: the pod's global config is a
read-only ConfigMap mount and the write fails with EBUSY.

## Why the worktree rule exists

On 2026-09-05 a second session in the shared `/root/home-operations` checkout had
138 files modified that the first had never touched, five of them `*.sops.yaml`.
Neither could commit without sweeping up the other's work, and a reflexive
`git add -A` would have staged encrypted material this repo treats as
unrecoverable.

## Context budget

Every agent -- the main session, each `Agent` subagent, each `Workflow` agent --
starts with the same stack before its first tool call: Claude Code's own system
prompt and tool schemas, then this repo's CLAUDE.md, the skill listing, MCP server
instructions and the deferred-tool name list. Parallel agents cannot share the
repo-specific part through the prompt cache (it sits after each agent's own task
prompt), so N agents pay it N times, as 1-hour cache *writes* at twice the input
price.

Measured 2026-09-28 with one headless turn (`claude -p "Reply with exactly: OK"`,
Opus 5.5, Claude Code 2.1.283), first-request input tokens:

| | Before | After |
| --- | ---: | ---: |
| **Total** | **41,773 tokens** | **28,798 tokens** |
| Claude Code's own system prompt + tools | ~56.5K chars | unchanged |
| Skill listing | 30.2K chars | 12.4K chars |
| MCP server instructions | 15.2K chars | 10.3K chars (9.7K of it is toolport, see below) |
| Deferred tool names | 10.5K chars | 4.8K chars |
| CLAUDE.md (+ the auto-memory index in main sessions) | 21.2K chars | 15.3K chars |

Two further costs grew with the session rather than at spawn:

- **`Read AGENTS.md`.** CLAUDE.md used to end with that line. `AGENTS.md` is the
  APM-generated Copilot build of `.github/instructions/` -- 64 KB, ~16K tokens of
  generic DevOps, Kubernetes, C# and HTML guidance -- and agents obeyed it 69
  times in the transcripts on hand. It is also stale:
  `docker-dockge-memory.instructions.md`, the one estate-specific file in that
  directory, is not in it.
- **The graphify PreToolUse nudge.** `graphify hook-guard` prints the same
  "MANDATORY: graphify-out/graph.json exists…" additionalContext on every matching
  Bash/Grep/Read/Glob call, and each copy stays in the transcript for every later
  turn. It fired 3,796 times across 136 sessions -- median 42, max 384 in one
  session (~19K tokens of one sentence) -- and each call paid ~300 ms for
  `mise x` to start graphify. [`.claude/hooks/graphify-nudge-once.sh`](../../.claude/hooks/graphify-nudge-once.sh)
  forwards it once per session (per subagent, per kind) and short-circuits in
  ~15 ms after that.

### What `.claude/settings.json` trims, and why

| Setting | Effect |
| --- | --- |
| `enabledPlugins: { "<name>@synced": false }` | The claude.ai account syncs Cowork plugins (sales, finance, marketing, …) into every session: ~150 namespaced skills plus ~40 plugin MCP servers, each advertising `authenticate`/`complete_authentication` stubs. None were ever used here. `claude plugin list` shows the state. **A newly synced plugin arrives enabled** -- add it here. |
| `disableClaudeAiConnectors: true` | Drops the claude.ai connectors (Figma, Google Drive, Mermaid, Microsoft Learn, Context7, Claude Docs) and their server instructions. Context7 and Microsoft Learn stay reachable through `toolport-research`; the rest had no use in this repo. Project-scoped: other directories keep them. |
| `skillOverrides: { name: "user-invocable-only" }` | Hides a skill from the model's listing while `/name` still works. Used for skills with no footprint in this repo (Terragrunt, OpenTofu, Taskfiles, OCI promotion, instruction-eval, sync-claude -- APM pulls them from another homelab), the Cloudflare Workers skills (only `/build-agent` and `/build-mcp` want them, and those read the files by path), the `unifi-*-setup` skills (toolport replaced the local MCPs), and the account-synced `anthropic-skills:*`. |
| `skillListingMaxDescChars: 300` | Caps each skill's description in the listing (default 1536). Without a cap, hiding skills saves little: the listing has a budget (1% of the context window, 40K chars on a 1M window) and descriptions that were truncated to fit simply grow back into the freed space. 400 left the listing at 15.0K chars; 300 takes it to 12.4K. |
| `.claude/hooks/graphify-nudge-once.sh` | Wraps `graphify hook-guard` so its nudge reaches each session once (above). |

Where the listing budget comes from, and the other knobs (`skillListingBudgetFraction`,
`SLASH_COMMAND_TOOL_CHAR_BUDGET`), is in Claude Code's settings reference.

### Adding things without undoing this

- **Skills.** The model sees the first 300 characters of `description` (plus
  `when_to_use`), so put what the skill is for and when to reach for it first, and
  trigger lists last. A skill only a human should start belongs in
  `skillOverrides` as `user-invocable-only`. APM-installed skills are rewritten by
  `apm install`, which is why the override lives in settings rather than in
  `SKILL.md` frontmatter.
- **MCP servers.** Tool schemas are deferred (loaded on demand), so a server
  mostly costs its `instructions` text and one name per tool. Prefer adding a
  backend to a toolport profile over adding a server to `.mcp.json`. The six
  toolport profiles each send the same ~1.6K-char instructions (~2.4K tokens per
  spawn in all); the text is a constant in toolport-gateway, and a per-profile
  override is requested upstream in
  [btsouth/toolport#971](https://github.com/btsouth/toolport/issues/971). When it
  lands, keep the text on one profile and blank it on the other five in
  `kubernetes/apps/agents/toolport/resources/registry.json`.
- **Hooks.** A hook's `additionalContext` is a per-call cost that never leaves the
  transcript. Emit it once, or only when it changes something.
- **CLAUDE.md.** Rules only; the story goes here or in a `docs/` page it links to.

### Measuring

`/context` in an interactive session breaks the current context down by category.
For a before/after number, run one headless turn from the directory under test
and read `usage` from the JSON:

```bash
claude -p --output-format json "Reply with exactly: OK" </dev/null |
  jq '.usage | .input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens'
```

The transcript (`~/.claude/projects/<dir>/<session_id>.jsonl`) records each
attachment -- `skill_listing`, `instructions`, `mcp_instructions_delta`,
`deferred_tools_delta` -- with its full text, which is where the per-category
figures above came from.
