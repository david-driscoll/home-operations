### 2026-07-29T02-02-03: Hold all four TypeScript 7.0.2 Renovate PRs — blocked upstream by @pulumi/pulumi peerOptional typescript &lt;7
**By:** Crew (Coordinator)
**What:** Hold all four TypeScript 7.0.2 Renovate PRs — blocked upstream by @pulumi/pulumi peerOptional typescript &lt;7
**References:** david-driscoll/home-operations#513, david-driscoll/home-operations#512, david-driscoll/vault#62, david-driscoll/vault#61, Sparks, Trinity
**Why:** ## Decision

Hold (do not merge) all four TypeScript 7.0.2 Renovate PRs: home-operations #513/#512 and vault #62/#61. Treat them as one unit gated on an upstream change.

## Root cause of the renovate/artifacts FAILURE on home-operations#513

`@pulumi/pulumi` declares `peerDependencies.typescript = ">= 3.8.3 < 7"` (peerOptional). Verified on the installed 3.250.0 AND on the current latest 3.255.0 — the ceiling has NOT moved. Bumping root `package.json` to `^7.0.0` makes `npm install` fail ERESOLVE, so Renovate could not regenerate `package-lock.json`. PR #513 therefore contains a `package.json` change with NO matching lockfile update.

## Why two PRs per repo

Two different Renovate *managers*, not an npm alias:
- npm manager -> root `package.json` `devDependencies.typescript` (`^6.0.3`) -> #513 / vault#62
- mise manager -> `.config/mise.toml` `[tools] "npm:typescript" = "5.9.3"` -> #512 / vault#61

They were already drifted (6.0.3 vs 5.9.3) before the bump. No packageRule links them in `.github/renovate.json5` or the shared `local>david-driscoll/.github:renovate-config` preset.

## Compatibility finding (reframes the risk)

TypeScript 7 is the native Go port: ships platform binaries via 20 optionalDependencies, `exports["."]` resolves to `lib/version.cjs` only (no compiler API), and no `lib.*.d.ts` stdlib ships in the package.

BUT this estate is nearly immune to that:
- `tsx@4.23.1` depends only on `esbuild ~0.28.0`. It does not depend on, peer-depend on, or use the `typescript` package. It strips types; it never type-checks.
- Every `Pulumi.yaml` sets `runtime.options.typescript: false` with `nodeargs: "--import tsx/esm"`, so Pulumi's own TS/ts-node path is disabled — which is why the peer constraint blocking the lockfile is functionally irrelevant here.
- Nothing in `components/`, `stacks/`, or `dynamic/` imports the TypeScript compiler API.

## Type-check gating: there is none

- `.github/workflows/` contains only `label-sync.yaml`. No build, no `npm ci`, no `tsc`.
- Root `package.json` scripts contain only a stub `test` that exits 1.
- `tsc` is invoked nowhere in any repo config. No `core.hooksPath`, no husky/hk config present.
- `tsconfig.json` `include` is only `components/**` and `types/**` — `stacks/` and `dynamic/` would not be checked even if `tsc` were run.

So "CI is green" carries no information about TypeScript at all. Equally, TS 7 cannot introduce new runtime failures, because nothing type-checks before or after.

## Side findings (separate from the upgrade)

1. Root `package.json` declares `@pulumi/adguard: file:sdks/adguard` and `@pulumi/b2: file:sdks/b2`. Both directories are absent from disk and untracked in git; `node_modules` holds dangling symlinks; both appear in `package-lock.json`. A clean checkout + `npm ci` would break.
2. `tsconfig.json` excludes `stacks/` and `dynamic/` from `include`.

## Renovate config

The manager split is real but the fix is not obviously "group them" — grouping would couple the green mise PR to the hard-blocked npm PR without unblocking anything. No config PR opened. Recommended follow-up is a temporary `allowedVersions: "<7"` constraint on `typescript` across both managers so Renovate stops re-raising these four PRs weekly; that is a human call and was not made unilaterally.

## Gate status

Sparks (Renovate owner) diagnosed and held. Trinity (designated technical reviewer) did not return an assessment in session; the coordinator completed the compatibility analysis directly at the requester's instruction. The reviewer gate on any config change is therefore NOT satisfied — no PR opened, nothing merged.