# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- **Primary test framework:** None — no test framework is configured
- **Assertion/mocking tools:** None
- **Commands:**
  ```bash
  # No automated tests — this command exits with an error:
  npm test   # → "Error: no test specified"

  # Infrastructure validation substitute:
  cd stacks/<stack-name>
  pulumi preview   # dry-run against live providers
  ```

### 2) Test Layout

- No test files exist in the repository (confirmed by scan — 0 test directories found)
- No naming convention applicable

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | No | — | No unit tests for helper functions, OPClient, ComponentResources |
| Integration | No | — | No integration tests; live `pulumi preview` serves this role informally |
| E2E | No | — | No E2E automation; manual verification against live infrastructure |
| Infrastructure validation | Partial | All stacks | `pulumi preview` catches type errors and provider API mismatches at deploy time |

### 4) Mocking and Isolation Strategy

- No mocking strategy — this is an infrastructure-as-code repo and the team has not adopted Pulumi's testing SDK or any mock providers
- [ASK USER] Is there a plan to adopt `@pulumi/pulumi/automation` or Pulumi testing SDK for unit tests?

### 5) Coverage and Quality Signals

- Coverage tool: None
- Current coverage: 0% (no tests)
- Known gaps: All of `components/`, `stacks/`, `sdks/`, and `dynamic/` are untested
- Quality signal in practice: The TypeScript compiler (`strict: true`) catches type errors; `pulumi preview` catches provider-level errors against live APIs

### 6) Evidence

- `package.json` — `scripts.test` is a stub error
- `.codebase-scan.txt` — "No performance testing configs detected"
- `tsconfig.json` — strict TypeScript as partial quality substitute
