# Private names: scrub the root domain and tailnet from the repo

Status 2026-09-29: audit done, phase 1 in its PR. Owner: David.

This repository is public. It names the estate's **root domain** and its
**tailnet** (the MagicDNS suffix) in hundreds of places. The goal is that
neither appears in any tracked file, then to rewrite history so no past
commit carries them either. Where a value is actually needed, it comes from
SOPS: `ROOT_DOMAIN` and `TAILSCALE_DOMAIN` in
`kubernetes/flux/meta/shared-secrets.sops.yaml`.

This document itself uses only placeholders: `<root domain>` and `<tailnet>`
(the whole suffix), `<root-domain-slug>` for the hyphenated form.

## A. What this does and does not buy

**It does:** remove the repo as a map. Today it lists the internal hostname
inventory, the split-horizon zones, which service runs where, and ties the
tailnet to this estate and its owner.

**It does not make either name secret:**

- The root domain is in public DNS, certificates and the Cloudflare zone.
- The tailnet has HTTPS on (J3 of the Funnel plan), and every HTTPS machine
  certificate is published, full name included, in the public Certificate
  Transparency logs. Funnel names are handed out by design (GitHub webhooks,
  media URLs given to Meta and TikTok).
- History already published stays published somewhere: existing clones, GH
  Archive (push events, commit messages), search and code-archive caches.
  GitHub also keeps `refs/pull/*` and cached commit views after a force-push
  until GitHub Support purges them.
- Tailscale cannot re-roll a generated tailnet name once HTTPS certificates
  have used it; the only switch is back to the default `tailNNNN` name. After
  this plan that would be one SOPS change, but it is **not** planned.

## B. Audit (main at #2188, 2026-09-29)

| | |
| --- | --- |
| Occurrences | 614 in 156 tracked files |
| Spellings | dotted, regex-escaped (`\.`), double-escaped in YAML strings (`\\.`), hyphen/underscore slug, and the bare tailnet label |
| Inside `*.sops.*` | none |
| History | 4,537 commits across all refs; 121 commit **messages** name one |

The only file the first, fixed-string pass missed was a CORS regex written
with `\\.`. The guard's pattern is therefore "each label of the root domain,
joined by any one to four non-alphanumerics".

## C. Conventions

| Where | Write |
| --- | --- |
| Flux-rendered values (manifests, HelmRelease values, ConfigMap sources) | `${ROOT_DOMAIN}` / `${TAILSCALE_DOMAIN}` |
| Comments in files Flux renders | `<root domain>` / `<tailnet>` (a `${…}` in a comment is substituted too; `eso-values-lint`) |
| Prose, runbooks, plans, PR text | `<root domain>` / `<tailnet>`; `${ROOT_DOMAIN}` inside shell snippets |
| Code, scripts, tooling | an environment lookup, never a literal or a default |
| Test fixtures | `example.com` / `example.ts.net` |

## D. Enforcement (phase 1)

- **`scripts/private-domain-guard`**. It reads both names from SOPS at run time
  (so it never contains them) and prints only paths and line numbers.
  - `check [--cached]` scans every tracked file except `*.sops.*`. It fails on
    any hit in a file not in the baseline.
  - `stdin` exits 1 if the text contains a name.
  - Without the age key it skips with a warning; there is nothing to compare
    against.
- **hk step `private-domains`** (`.config/hk.pkl`). It is whole-repo, so it
  also scans `.claude/`, `.apm/`, `.crew/` and `.vscode/`, which the top-level
  hk `exclude` hides from every other step.
- **Claude Code PreToolUse hook** (`.claude/hooks/private-domain-guard.sh`) on
  Write, Edit, MultiEdit and NotebookEdit.
  - It checks only the new text, so an edit that removes a name always passes.
  - Its scope is this repo, its worktrees, and this project's Claude memory.
- **`.config/private-domain-baseline`** lists the files still pending, grouped
  by phase. It only shrinks; the guard reports entries that have come clean.
- **Rules** in `CLAUDE.md`, `.github/instructions/private-domains.instructions.md`
  (and its compiled section in `AGENTS.md`), `.github/copilot-instructions.md`,
  and the `create-k8s-deployment` skill checklist.
- **Known gaps:**
  - Files written through the Bash tool are not checked by the hook.
  - A commit that touches only the hk-excluded trees does not trigger the hk
    step.

  Both are caught by the next commit, because the scan is whole-repo.

## E. Phases

Each phase is its own PR, and each removes its lines from the baseline.

### Phase 1: prose, comments, rules, guard

- **370 replacements in 93 files:**
  - Markdown prose becomes placeholders; fenced code becomes `${…}`.
  - Everywhere else, only lines that are wholly comments are touched.
  - The old `<tailnet>.ts.net` placeholder is normalised to `<tailnet>`.
- **Checked:** every changed YAML/JSON file parses to identical data.
- **Reverted:** one file. A `//` line inside OpenBao's HCL block is data, not
  a comment, and editing it would change OpenBao's config.
- **Not touched:** values, test fixtures, ConfigMap-slurped `resources/`
  files, notebooks, generated files, and the slug form.
- **Regenerated:** the tracked graph (`graphify update .`). It still quotes
  code that holds a name, and stale doc-derived nodes, so it stays in the
  baseline until phase 6.

### Phase 2: Flux-rendered values

The files are in the baseline's phase-2 section. Literal values become
`${ROOT_DOMAIN}` / `${TAILSCALE_DOMAIN}`. For each file, first confirm the Flux
Kustomization that renders it actually substitutes from `shared-secrets`. A
Kustomization emitted by an app component does not inherit
`components/common`.

- **CoreDNS:** zones and two rewrite regexes. `${ROOT_DOMAIN}` inside a regex
  leaves its dot unescaped, so it matches any character. That is harmless
  inside an exact zone. Otherwise add a `ROOT_DOMAIN_RE` key to shared-secrets.
- **agentboard `known_hosts` and `ssh_config`** are slurped into a ConfigMap,
  so this rolls agentboard and ends every live agent session. Merge it when
  none are running.
  - Hash the `known_hosts` entry (`ssh-keygen -H`) rather than substituting
    it: a hashed line carries no hostname at all.
- **OpenBao's HCL comment:** decide whether a config roll is worth one comment
  line. The alternative is to leave it until a planned OpenBao change.
- **Other files:**
  - traefik's CORS regex (`default-cors.yaml`);
  - forgejo's admin email and the forgejo-runner config;
  - the five proxmox MCP host values;
  - the blackbox DNS probe;
  - the tailscale bootstrap probe URL;
  - dashboard's ExternalSecret (rendered by the dynacat Kustomization);
  - two runbook assets, which are applied by hand, so their runbooks gain an
    `envsubst` step.

### Phase 3: the Cloudflare token's OpenBao path and 1Password title

The token lives at `third-party-tokens/cloudflare/<root-domain-slug>`, and the
store maps it from the 1Password title `Cloudflare (<root domain>)`. Both are
identifiers, not values, so they get **renamed** (for example to
`third-party-tokens/cloudflare/dns-zone`) rather than substituted.

1. Copy the secret to the new path. A human does this, with kv-v2 `cas=0`.
2. Switch every reference in one PR: the two ExternalSecrets, the
   openbao-replica canary path, `components/store` (mapping and title),
   `globals.ts`, docker traefik `.env`, the bao-standby restore, `restore-test.sh`,
   dashboard's ExternalSecret, and the tests.
3. Verify ESO syncs and the replica canary is green.
4. Delete the old path later.

Historical docs (`openbao-migration/`, `openbao-shared-secrets-reorg.md`) and
the finished `scripts/bao-reorg/` use `<root-domain-slug>`. The finished
scripts are candidates for deletion.

### Phase 4: Pulumi code and cluster definitions

- **Where the values come from:**
  - locally, from mise's SOPS env file (phase 5);
  - in-cluster, the Stack CRs get them through `envRefs` from a new
    SOPS-encrypted Secret in `pulumi`.
- **Code changes:**
  - `globals.searchDomain` and the `ROOT_DOMAIN` constant in
    `components/store/clusters.ts` read the environment.
  - `clusters/*.yaml` keep only the label (`authentikDomain: canterlot`), and
    the loader appends the root.
  - The authentik flow URL, the OpenBao OIDC default, and the StandardDns,
    local-dns and applications literals.
  - `technitium-zone.ts`: its Pulumi resource **name** is the slug. Rename it,
    with an `aliases` entry computed from the environment, so the URN does not
    change and no literal survives.
  - `ProxmoxBackupServerLxc.ts` emits `apiVersion: home.<root domain>/v1`.
    Find its consumer before changing the group.
  - Test fixtures move to `example.com`.
- **Gate:** every affected Stack previews with **zero diff**. The Stacks are
  preview-only during the Garage move, which suits this.

### Phase 5: tooling and hosts outside Flux

- **mise:** a flat SOPS env file (`.config/domains.sops.yaml`: `ROOT_DOMAIN`,
  `TAILSCALE_DOMAIN`), loaded by mise's `[env] _.file` and templated into:
  - `BAO_ADDR` and `CONNECT_HOST`;
  - every Stack's `PULUMI_BACKEND_URL`;
  - the Docker hosts' `DOCKER_HOST`;
  - the dashboard dev env.
- **MCP config:**
  - `.mcp.json` drops its default URLs. `TOOLPORT_*_URL` come from mise off
    cluster and from the pod env in agentboard.
  - `.vscode/mcp.json` uses `${env:…}`.
- **Bootstrap scripts** require `ROOT_DOMAIN` instead of defaulting to it. The
  break-glass path already assumes SOPS and the age key.
- **Talos:** `talos/talenv.sops.yaml`. talhelper decrypts it and substitutes
  into `talconfig.yaml` and `@`-referenced patches. Gate: `talhelper genconfig`
  output is unchanged.
- **Docker:** `.env`, compose and config files go through the DockgeLxc deploy
  path; confirm its substitution first.
- **Notebooks, `scripts/iptv-audit.py`, and a runbook asset:** read the
  environment, or delete the stale ones.

### Phase 6: strict

- The baseline is empty, so delete it; any hit now fails.
- Run a semantic `graphify --update` to drop the doc-derived nodes that still
  quote old text.
- Scan all branches, not just HEAD.

### Phase 7: history rewrite (later; needs an explicit go)

**Preconditions:**

- The guard is clean at HEAD. The rewrite must leave HEAD's tree **unchanged**:
  every live identifier has already been renamed in phases 2–5, so no
  reference breaks.
- No open PRs. They would be orphaned.
- No live agent sessions or worktrees; Renovate and crew are paused.
- A `git clone --mirror` backup, kept off the repo.

**Steps:**

1. Run `git filter-repo --replace-text <expr> --replace-message <expr>`, with
   one regex per spelling mapped to its placeholder. The expressions file
   holds the names, so build it from SOPS at run time, outside the repo, and
   delete it after.
2. Verify:
   - `git log --all -p` piped through the guard's pattern finds nothing;
   - HEAD's tree hash is unchanged.
3. Force-push every branch and tag, and delete stale remote branches.
4. Ask GitHub Support to purge cached views and `refs/pull/*` (GitHub's
   "Removing sensitive data from a repository").
5. Re-clone everywhere: the agentboard checkout and its worktrees, laptops.
   - Flux and the Pulumi Stack CRs track the branch, so they need nothing.
   - Commit SHAs cited in docs and memory stop resolving.

**Outside the rewrite:**

- PR and issue titles, bodies and comments: a separate API job.
- Actions logs.
- The other repos: equestria-cluster, stargate-command-cluster, docs-setup,
  and the `vault` issues.

## F. Open decisions

- Delete the stale notebooks and finished migration scripts, or parametrize
  them (phase 5)?
- The neutral name for the Cloudflare token path (phase 3).
- Whether OpenBao's HCL comment is worth a config roll (phase 2).
