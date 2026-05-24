# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| ComponentResource class files | PascalCase | `ProxmoxHost.ts`, `DockgeLxc.ts`, `TruenasVm.ts` | `components/` |
| Utility/helper files | camelCase | `globals.ts`, `helpers.ts`, `constants.ts`, `op.ts` | `components/` |
| Classes | PascalCase | `GlobalResources`, `OPClient`, `DockgeLxc`, `BackupPlanManager` | `components/globals.ts` |
| Interfaces/types | PascalCase with `I` prefix avoided | `DockgeLxcArgs`, `OPClientItem`, `ClusterDefinition` | `components/globals.ts` |
| Functions | camelCase | `getContainerHostnames`, `copyFileToRemote`, `addUptimeGatus` | `components/helpers.ts` |
| Constants/enums | PascalCase for objects; SCREAMING_SNAKE not used | `Tailscale.tag.dockge`, `Groups.System`, `Roles.Admins` | `components/constants.ts` |
| Pulumi resource names | kebab-case string literals | `"twilight-sparkle"`, `"home-operations-minio-bucket"` | `stacks/home/index.ts` |
| Stack directories | kebab-case | `unifi-network/`, `gulf-of-mexico/` | `stacks/` |
| Docker service directories | kebab-case | `docker-socket-proxy/`, `rclone-sftp/`, `prometheus-exporters/` | `docker/_common/` |

### 2) Formatting and Linting

- **Formatter:** `.editorconfig` (indentation, line endings, charset) — no Prettier config found
- **Linter:** No ESLint config found in repo
- **TypeScript strictness** (`tsconfig.json`):
  - `strict: true` — enables all strict type checks
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`
  - `forceConsistentCasingInFileNames: true`
  - `target: es2024`, `module: nodenext`, `moduleResolution: nodenext`
  - `allowImportingTsExtensions: true` — enables `.ts` explicit extensions in imports
- **Run commands:**
  ```bash
  npx tsc --noEmit   # type-check without emitting (no build step needed)
  ```
- No automated lint/format CI pipeline detected in repo.

### 3) Import and Module Conventions

- **Explicit `.ts` extensions** in all imports (required by NodeNext module resolution + tsx): `import { OPClient } from "./op.ts"`
- **Path aliases** (from `tsconfig.json`):
  - `@components/*` → `./components/*` (preferred for cross-directory imports into components)
  - `@dynamic/*` → `./dynamic/*`
  - `@openapi/*` → `./types/*`
- **Relative imports** used within a stack (`../../components/globals.ts`) or alongside aliases interchangeably
- **No barrel `index.ts` pattern** in components — each file is imported directly by name
- **Standard library imports** via Node.js built-in prefixes: `import { readFile } from "node:fs/promises"`

### 4) Error and Logging Conventions

- **Error strategy:** `OPClient` wraps all API calls in try/catch with `console.error()` + rethrow. No structured error types — raw `Error` objects propagate.
- **Pulumi logging:** `pulumi.log.info()` used for deployment-time diagnostics (e.g., listing Kubernetes namespaces). Most logging is commented out in DockgeLxc to reduce noise.
- **No logging framework** — `console.error` / `pulumi.log` only
- **Sensitive data:** Credentials are never logged; they flow through `Output<T>` (opaque at log time) or are fetched asynchronously inside `.apply()` closures

### 5) Testing Conventions

- **No automated tests exist** — `package.json` scripts.test is `echo "Error: no test specified" && exit 1`
- Infrastructure validation is done via `pulumi preview` against live providers
- No test file naming convention, no mocking strategy, no coverage tooling configured

### 6) Evidence

- `tsconfig.json` — TypeScript strictness settings
- `.editorconfig` — formatting baseline
- `components/op.ts` — error handling pattern
- `components/helpers.ts` — function naming examples
- `components/constants.ts` — constant naming examples
- `package.json` — test script stub
