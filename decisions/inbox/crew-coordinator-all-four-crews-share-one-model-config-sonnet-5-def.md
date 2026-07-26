### 2026-07-26T22-28-35: All four crews share one model config: sonnet-5 default, opus-5 for the coordinator
**By:** Crew (Coordinator)
**What:** All four crews share one model config: sonnet-5 default, opus-5 for the coordinator
**References:** .crew/config.json, home-operations, equestria-cluster, stargate-command-cluster, vault
**Why:** **Decision.** All four crews in the estate use identical model configuration, so behavior and cost are uniform regardless of which repo a session starts in.

```json
{
  "version": 1,
  "stateBackend": "two-layer",
  "defaultModel": "claude-sonnet-5",
  "agentModelOverrides": { "crew": "claude-opus-5" }
}
```

Applied to `.crew/config.json` in `home-operations` (pre-existing), and written to `equestria-cluster`, `stargate-command-cluster`, and `vault`. The peers were initialized with `crew init --state-backend two-layer`, which seeds only `version` and `stateBackend`; the two model fields were added afterward.

**Rationale.** Sonnet-5 handles specialist domain work; the coordinator gets Opus-5 because routing and cross-repo triage decisions are the highest-leverage, lowest-volume calls in the system — getting routing wrong wastes an entire downstream agent run.

**State backend note.** All four crews run `two-layer`, so mutable state (agent history, decisions, logs) MUST go through the `crew_state_*` / `memory_*` MCP tools, never direct file writes. Confirmed during bootstrap: the runtime rejects `crew_state_write` for `casting/*.json`, classifying it as static config — so casting registry/history are written to disk directly, while `agents/*/history.md` goes through the state tools. This is narrower than the path list in the coordinator protocol; the runtime is authoritative.

**Workflow install note.** `equestria-cluster` and `stargate-command-cluster` were initialized with `--no-workflows` (their issues live in vault, so local workflows would be dead weight). `vault` was initialized WITH workflows, since it is the issue tracker.