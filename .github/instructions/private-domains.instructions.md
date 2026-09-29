---
description: "Never write the estate's root domain or tailnet name in plaintext"
applyTo: "**"
---

# Private names: root domain and tailnet

This repository is public, and its history is being scrubbed of the estate's
root domain and tailnet name (`docs/plans/private-domain-scrub.md`). Do not
re-add either one, in any form, anywhere: code, manifests, docs, comments,
test fixtures, commit messages, PR and issue text.

Their only home is SOPS: `ROOT_DOMAIN` and `TAILSCALE_DOMAIN` in
`kubernetes/flux/meta/shared-secrets.sops.yaml`.

| Where | Write |
| --- | --- |
| Flux-rendered values (manifests, HelmRelease values, ConfigMap sources) | `${ROOT_DOMAIN}` / `${TAILSCALE_DOMAIN}` |
| Comments in files Flux renders | `<root domain>` / `<tailnet>` (a `${…}` in a comment is substituted too) |
| Prose, runbooks, plans, PR text | `<root domain>` / `<tailnet>`; `${ROOT_DOMAIN}` inside shell snippets |
| Code, scripts, tooling | read them from the environment; never a literal or a default |
| Test fixtures | `example.com` / `example.ts.net` |

`scripts/private-domain-guard` enforces this at commit time (the
`private-domains` hk step) and on every agent Write/Edit (a Claude Code
PreToolUse hook). Files still waiting on a later phase of the plan are listed
in `.config/private-domain-baseline`, which only shrinks.
