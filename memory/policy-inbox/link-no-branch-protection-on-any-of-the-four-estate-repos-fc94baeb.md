---
id: fc94baeb-31f6-4f2c-8a0d-9fc08ad461a6
class: POLICY
loadGuidance: [ALWAYS]
title: "No branch protection on any of the four estate repos"
author: "link"
createdAt: 2026-08-03T17:49:39.927Z
metadata: {}
---

Verified 2026-08-03 while resolving vault#116 (Coder agent hosting).

`GET /repos/david-driscoll/{repo}/branches/main/protection` returns 404 "Branch not protected"
and `GET /repos/david-driscoll/{repo}/rulesets` returns `[]` for ALL FOUR of:
home-operations, vault, equestria-cluster, stargate-command-cluster.

There is NO PR gate anywhere in the estate. A token with `Contents: write` pushes straight to
`main`, and on `main`: home-operations -> Pulumi Operator applies (9 Stacks); equestria-cluster and
stargate-command-cluster -> Flux applies. The "PR gate" is a human convention, not a control.

Consequences:
- Any design that justifies granting a credential on the grounds that "merge is human" is currently
  unfounded. This includes the agent-workspace credential model in vault#116.
- Issuing any fine-grained PAT or GitHub App installation token with `Contents: write` on these
  repos should be blocked on a ruleset landing first.
- Enabling a ruleset is NOT a one-liner: David pushes to main directly today, as do Renovate and the
  crew workflows. Bypass actors must be decided first or automation breaks.

Related useful property: fine-grained PATs cannot push commits touching `.github/workflows/` without
the `Workflows` permission, and GitHub enforces this at push time. Withholding `Workflows` is
therefore a hard control (not a review convention) against an agent rewriting CI to exfiltrate
secrets. Keep it withheld on every agent role.
