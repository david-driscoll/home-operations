### 2026-07-29T01-58-58: Held on TypeScript 7 Renovate PRs — root cause is Pulumi's peer-dep ceiling, not a grouping defect worth fixing blind
**By:** sparks
**What:** Held on TypeScript 7 Renovate PRs — root cause is Pulumi's peer-dep ceiling, not a grouping defect worth fixing blind
**References:** david-driscoll/home-operations#513, david-driscoll/home-operations#512, david-driscoll/vault#62, david-driscoll/vault#61
**Why:** Investigated the renovate/artifacts FAILURE on home-operations#513 and the four related TypeScript-major PRs (home-operations#513/#512, vault#62/#61).

Root cause of the artifacts failure: @pulumi/pulumi@3.244.0-3.250.0 declares `peerOptional typescript ">= 3.8.3 < 7"`. Bumping the root package.json `typescript` devDependency to ^7.0.0 makes `npm install` hit ERESOLVE against every transitive @pulumi/pulumi consumer (proxmoxve, cloudflare, command, github, http, etc.) in both repos. This is a hard upstream compatibility ceiling, not a Renovate misconfiguration — it will keep failing on every retry until Pulumi's own peerDependencies allow TS 7.

Why 4 PRs instead of 2: each repo has two independent Renovate-tracked TypeScript entries that have always drifted independently (6.0.3 vs 5.9.3 pre-bump):
  - npm manager: root `package.json` `devDependencies.typescript` (project compiler used by tsx to run Pulumi TS)
  - mise manager: `.config/mise.toml` (`npm:typescript`), and in vault also `.mise.toml` — a globally mise-installed CLI tool
Neither the repo-level renovate.json5 (home-operations, vault — identical) nor the shared `local>david-driscoll/.github:renovate-config` preset has any packageRule grouping npm-manager `typescript` with mise-manager `npm:typescript`, so they move as four unlinked majors.

Whether to fix: held, did not open a PR. Grouping the two entries per repo would only change PR/merge granularity — it would not unblock the artifact failure, since the npm-manager half is blocked on Pulumi regardless. Forcing them into one PR would also make the mise.toml half (which currently succeeds and is independently mergeable) inherit the lockfile failure, removing an option David currently has (bump the global tsc tool ahead of the project pin). Whether the mise-managed global tsc and the project's package.json-pinned tsc are *meant* to move in lockstep is a product/compatibility judgment I can't make unilaterally — flagging for Trinity/David rather than guessing.

No PR state changes made to #513, #512, #62, #61 (read-only per task constraints). Stayed out of vault#81 hk-migration scope entirely (no .husky/, git hook, or .crew/ files touched — .crew/decisions/inbox is the runtime-tool write path, not a hand-edit).