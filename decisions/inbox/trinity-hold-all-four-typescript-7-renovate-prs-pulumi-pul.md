### 2026-07-29T02-00-08: HOLD all four TypeScript 7 Renovate PRs — @pulumi/pulumi peer range is `typescript >= 3.8.3 < 7` through latest 3.255.0
**By:** Trinity
**What:** HOLD all four TypeScript 7 Renovate PRs — @pulumi/pulumi peer range is `typescript >= 3.8.3 < 7` through latest 3.255.0
**References:** david-driscoll/home-operations#513, david-driscoll/home-operations#512, david-driscoll/vault#62, david-driscoll/vault#61, Sparks (CI/CD, renovate/artifacts diagnosis)
**Why:** Date: 2026-07-28T21:55:30-0400. Reviewer: Trinity (Pulumi/TS IaC).

DECISION: Hold (do not merge) home-operations #513/#512 and vault #62/#61 until Pulumi widens its TypeScript peer range. No PR state was changed.

ROOT CAUSE (reproduced, not inferred):
- `@pulumi/pulumi` declares `peerDependencies.typescript = ">= 3.8.3 < 7"`. Verified on installed 3.250.0 (home-operations), 3.244.0 (vault), AND on latest published 3.255.0 — the range has NOT been widened. `peerDependenciesMeta.typescript.optional = true`, but npm still enforces the range because typescript IS present as a root devDependency.
- Scratch `npm install --dry-run` with @pulumi/pulumi@3.250.0 + typescript@^7.0.0 fails hard: `ERESOLVE ... peerOptional typescript@">= 3.8.3 < 7"`. This is the `renovate/artifacts` failure on #513 and #62 — the lockfile physically cannot be regenerated.
- TypeScript 7.0.2 is the native-port rewrite: `exports["."]` is `./lib/version.cjs`. The classic `require("typescript")` compiler API is gone, replaced by `typescript/unstable/*` subpaths. ts-node (Pulumi's other peer) consumes that API — hence the `< 7` bound.

WHAT IS **NOT** THE RISK (contrary to initial framing):
- `tsx` 4.23.1 (latest) has exactly one dependency: `esbuild ~0.28.0`. Zero occurrences of the string "typescript" in `node_modules/tsx/dist/*`. tsx never resolves the typescript package. `Pulumi.yaml` sets `runtime.options.typescript: false` + `nodeargs: "--import tsx/esm"`, so the `pulumi up` execution path is esbuild-only. Bumping the typescript devDependency does NOT change runtime transpilation behavior.
- Empirically, TS 7.0.2 produced byte-identical diagnostics to TS 6.0.3 on home-operations (same 6 pre-existing errors) and clean on vault. No tsconfig option was rejected — composite, allowImportingTsExtensions, experimentalDecorators, module/moduleResolution nodenext, target es2024, and the @components/@openapi/@dynamic paths are all accepted by TS 7.

THE REAL RISK: packaging/install breakage, not type regressions. Merging #513 or #62 desyncs package.json from package-lock.json and breaks the documented `npm ci` bootstrap in CLAUDE.md.

TYPE-CHECK GATING: none. No `tsc` script in either package.json, no type-check step in any workflow (home-operations has only label-sync.yaml), and `.config/hk.pkl` pre-commit/pre-push run biome + whitespace/secret linters only — biome is not type-aware. home-operations `main` is ALREADY red under tsc (6 errors), which proves no gate is enforced. tsconfig `include` covers only `components/**` and `types/**` — `stacks/`, `sdks/`, and `dynamic/` are outside the type-check scope entirely.

UNBLOCK CONDITION: a @pulumi/pulumi release whose typescript peer range admits 7.x. Then move all four as ONE unit (both repos, both managers) so the mise-provisioned `tsc` and the npm-provisioned `tsc` never straddle a compiler major.