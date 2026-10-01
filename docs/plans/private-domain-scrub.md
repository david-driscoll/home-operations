# Private names: scrub the root domain and tailnet from the repo

Status 2026-10-01: phases 1–4 merged (phase 4 as 4a #2282 and 4b #2285). The old Cloudflare token path is deleted, and the login titles stay, allow-listed. Phase 5 is done: 5a #2292 (mise and the MCP clients), 5b #2293 (scripts, Docker configs, notebooks) and 5c (Talos). What remains in the baseline is OpenBao's HCL comment (deferred from phase 2) and the generated graph, both phase 6. Owner: David.

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
  - `stdin [path]` exits 1 if the text contains a name. Given the target's
    repo-relative path, it applies the allow-list as `check` does.
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
- **`.config/private-domain-allow`** names files that may spell the root
  domain as plain words (its labels separated only by whitespace), for a
  display name David chose to keep.
  - In those files every other spelling is still a hit, and the tailnet is
    never allowed.
  - It lists decisions, not pending work, so it does not shrink by phase. The
    guard warns when an entry stops being needed.
  - The hook passes the target path, so it applies the same rule.
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

The token lived at `third-party-tokens/cloudflare/<root-domain-slug>`, and the
store mapped it from the 1Password title `Cloudflare (<root domain>)`. Both are
identifiers, not values, so they are **renamed** to
`third-party-tokens/cloudflare/dns-zone`, in two steps.

- **3a (done):** the secret was copied (kv-v2, `cas=0`, identical hash), and
  every consumer moved: the ExternalSecrets, Pulumi (now `getSecretByPath`),
  the Dockge Traefik `.env`.
- **3b (done):** the break-glass canary moved in its four lockstep places.
  Then `bootstrap/openbao/restore-test.sh init` re-ran with an admin token,
  so the live `restore-test` policy grants the new path.
  - Order mattered: the daily canary-check (04:00 UTC) tests the live grant,
    the nightly dump (03:00) must carry the new path, and the monthly
    restore test (1st, 05:00) restores that dump.
  - The 2026-10-01 restore test passed on the new path.
  - The old path was deleted on 2026-10-01, on David's go, after these checks:
    - `dns-zone` held identical data;
    - nothing had written the old path since the 08-22 reorg;
    - no estate repo referenced it;
    - nothing had read it since the canary moved.

The original design notes follow.

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

Two PRs, because the code fails closed without the value: the variable goes
live first.

- **4a (#2282): every run gets `ROOT_DOMAIN`.**
  - In the cluster, each Stack CR carries `envRefs.ROOT_DOMAIN`, a `Literal`
    that Flux substitutes from `shared-secrets`. No new Secret was needed.
  - Locally, `.config/mise.toml` declares it as a `ref+sops://` that
    `mise run vals-run` resolves.
- **4b: the code reads it** through `rootDomain()` in `components/domains.ts`,
  which throws when the value is unset.
  - `globals.searchDomain`, the cluster loader's suffix, the authentik flow
    URL, the OpenBao address and OIDC defaults, and the StandardDns, local-dns
    and applications literals.
  - `clusters/*.yaml` keep only the label, renamed to match `domainPrefix`
    (`authentikPrefix: canterlot`). The loader appends the root and still
    emits `authentikDomain` in the same key position, because stacks/system
    publishes the parsed object as order-sensitive JSON.
  - `technitium-zone.ts`: the resource **name** is `rootDomainSlug()`, the
    slug it always was. The URN is unchanged and no alias is needed.
  - `ProxmoxBackupServerLxc.ts` computes `apiVersion: home.<root domain>/v1`.
    The group itself is unchanged.
  - Test fixtures moved to `example.com`. The loader's tests accept any
    `ROOT_DOMAIN` and read it back.
  - The login flows' display titles, which spell the name as words, stay.
    That was David's decision on 2026-10-01. `.config/private-domain-allow`
    lets that one file use that one spelling (section D).
- **Gate:** zero diff. The Stacks run `up` every five minutes, so 4b was
  proven by evaluation rather than preview, with the real value:
  - the new loader's output is byte-identical JSON to the old one's;
  - every other changed file, with each computed expression replaced by the
    literal it evaluates to, is identical to its pre-4b version.

### Phase 5: tooling and hosts outside Flux

- **5a: mise and the MCP clients.**
  - `.config/domains.sops.yaml` holds `ROOT_DOMAIN` and `TAILSCALE_DOMAIN`
    flat, and `.config/mise.toml` loads it with `[env] _.file`.
    - It is the one exception to resolving values per command: mise decrypts
      it on every load.
    - The file is local, so no network is involved.
    - `sops.strict = false` leaves the names empty instead of breaking mise
      wherever there is no age key (CI, Renovate).
  - The file is a copy of the two `shared-secrets` values. Only
    `mise run private-names-sync` writes it, and the guard fails a commit
    where the two disagree.
  - Templated from it:
    - `BAO_ADDR` and `CONNECT_HOST`;
    - every Stack's `PULUMI_BACKEND_URL`;
    - the Docker hosts' `DOCKER_HOST`;
    - the dashboard dev env;
    - the six `TOOLPORT_*_URL`, where a pod's own value wins (`get_env`).
  - `.mcp.json` has no default URLs. `.vscode/mcp.json` uses
    `${env:ROOT_DOMAIN}`.
  - Gate: in every directory, `mise env` renders each value byte-identical to
    the old literal.
- **5b: scripts, Docker configs, notebooks.**
  - `scripts/lib/private-names.sh` (sourced) provides `private_names`. It keeps
    real values from the environment and otherwise decrypts both names from
    `shared-secrets`, so a break-glass run needs the age key, not mise.
    - A `ref+` value does not count as set.
    - It fails closed, writing only to stderr, so it is safe inside the
      eval'd `pulumi-env.sh`.
  - The four `bootstrap/openbao` scripts use it; the three that take an
    address override (`BAO_ADDR`, `BAO_TRANSIT_HOST`) call it only when the
    override is unset. The dashboard's `resources/test.sh` uses it too.
  - The three Docker configs use `${ROOT_DOMAIN}`, which DockgeLxc substitutes
    (from `globals.searchDomain`) into every file of a stack.
  - Notebooks (David, 2026-10-01): the two stale `.dib` notebooks are deleted,
    and `volsync.ipynb` reads `$env:ROOT_DOMAIN`. `scripts/iptv-audit.py`
    defaults `--base` from `ROOT_DOMAIN` and refuses to guess without it.
  - Gate: each output is identical to the old one, namely
    - `pulumi-env.sh`'s `BAO_ADDR` line;
    - `equestria-init.sh`'s closing instructions;
    - `test.sh`'s kubeconfig;
    - each Docker file after substitution.
- **5c: Talos.** No `talenv.sops.yaml` was needed. talhelper already
  substitutes `${VAR}` from the process environment into `talconfig.yaml` and
  `@`-referenced patches (the secretbox key in `etcd-encryption.yaml` works
  that way), and mise exports `ROOT_DOMAIN` since 5a.
  - The API server's certSAN (in `talconfig.yaml` and
    `patches/controller/cluster.yaml`) and the 14 registry mirror endpoints
    use `${ROOT_DOMAIN}`.
  - `talos:genconfig` refuses to render with an empty `ROOT_DOMAIN`.
  - Gate: `talhelper genconfig --offline-mode` renders all seven machine
    configs byte-identical, and `talosconfig` identical apart from the client
    certificate it mints fresh on every run.

### Phase 6: strict

- The baseline is empty, so delete it. Any hit now fails, except the words
  spelling in the files `.config/private-domain-allow` names.
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
   - The words spelling gets no expression. The allow-listed titles keep it
     at HEAD, so rewriting it would change HEAD's tree.
2. Verify:
   - `git log --all -p` piped through the guard's patterns finds nothing
     except the allow-listed titles;
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
  - stargate-command-cluster's `cloudflare-default-domain` ExternalSecret
    still names `shared/cloudflare-<root-domain-slug>`. That path has not
    existed since the 2026-08-22 reorg, so the ExternalSecret cannot sync;
    the Secret it last synced is all that cluster has.

## F. Open decisions

- Delete the finished migration scripts (`scripts/bao-reorg/`)? They name
  nothing private any more, so this is housekeeping, not scrub work.
- Whether OpenBao's HCL comment is worth a config roll (phase 2).
