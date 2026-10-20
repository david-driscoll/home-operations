# Renovate automerge gate

Renovate merges a narrow set of its own updates without a human. All of it
happens on the forge's copy of this repository, `github-mirror/home-operations`,
and what merges there is pushed to `main` here
([runbook](./runbooks/forgejo-github-mirror.md)). Mend's bot on GitHub skips
those updates entirely: no pull request, no label, no branch automerge (the
last packageRule in `.github/renovate.json5`). Everything outside that set gets
a pull request on both copies and waits for review.

Three layers sit around an automerge: checks before the merge, required
statuses at the merge, and a revert after it. The third is currently dormant
([below](#layer-3-after-merge)).

## What automerges

The rules are in `.github/renovate.json5`: "Automerge app image ..." (one rule
for patch/digest, one for minor), "Automerge named dependencies" and "Auto-merge
GitHub Actions". The first three name only `github-mirror/home-operations`.
The Actions rule names no repository; the GitHub bot's skip rule is what keeps
it off GitHub.

| Automerges | Never automerges |
| --- | --- |
| `docker`/`helm` patch, digest and minor bumps under `kubernetes/apps/{equestria,stargate-command,agents}/**` and `docker/**` | majors; minors of `0.x`; Home Assistant minors (the monthly release) |
| named dependencies, minor/patch/digest, under "Automerge named dependencies": external-dns (chart + mirror), yq, pulumi, gh, hk, the UniFi network/protect/access MCP images, pulumi-nodejs, renovate-operator, renovate, unpoller, claude-code, biome, the mise image, 1password-cli, Dumpify, kube-prometheus-stack, immich server + machine-learning (its database stays manual), the Forgejo Helm chart (not the server image), dynacat, blackbox-exporter (the docker image and the Helm chart), k8s-sidecar, the openebs chart, dispatcharr, the alloy chart mirror, the coder chart, typos, graphify, and the npm Pulumi providers `@axnic/pulumi-garage` and `@pulumi/cloudflare` | the `Pulumi.yaml` provider pins: a bump there needs an SDK regeneration that automerge would skip |
| GitHub Actions minor/patch/digest (the older rule, `automergeType: branch`) | databases and anything that migrates on start (postgres, timescale, CNPG, mongo, couchdb, valkey/redis, mariadb/mysql, neo4j, meilisearch, immich's database, nextcloud, opencloud) |
| | identity, secrets, ingress, DNS, tailnet, storage, backups, registry (authentik, openbao, garage, traefik, tailscale, technitium, keepalived, zot, docker-socket-proxy, backrest, rclone, arcane, toolport) |
| | everything else: Talos, Kubernetes, Flux, CRDs, cluster infrastructure, mise tools, npm, Pulumi |

Before this gate, the shared preset's `:automergePatch` automerged **every**
patch in the repo, Talos and Traefik included. The rule "No automerge in this
repo unless a rule below opts in" turns that off. It names **both** copies:
naming only the GitHub one would leave every patch automerging on the forge.

Every update on the forge waits `minimumReleaseAge: 1 days` before Renovate
opens it, and carries the `renovate/stability-days` status (the first
packageRule, "Forgejo copy: ..."). The wait only works where a release has a
date. ghcr.io images pinned to a full `X.Y.Z` get one from the forge's
`custom.ghcr` datasource; anything still undated is let through at once by
`minimumReleaseAgeBehaviour: timestamp-optional`, rather than held forever.

## Layer 1: before merge

The forge's copies of the GitHub checks, run on the estate's own runner. A check
changed in `.github/workflows` has to be changed in `.forgejo/workflows` too.

| Check | Workflow | What it catches |
| --- | --- | --- |
| flate test + diff | `.forgejo/workflows/flate.yml` | manifests that don't render or build |
| rendered images | `flate.yml` → `scripts/image-check flate` | a tag or digest that does not exist, or no linux/amd64 build |
| compose + images | `.forgejo/workflows/image-check.yml` → `scripts/image-check compose` | a compose file that no longer parses, and the same image problems for `docker/**` |

## Layer 2: the merge

`automergeType: pr` with `platformAutomerge: true`. Renovate labels the pull
request `renovate/automerge`, turns on Forgejo's **Merge when checks succeed**,
and leaves the merge to Forgejo. Forgejo merges once every **required** status
is green. Branch protection on the forge's `main`
(`stacks/system/forgejo-github-mirror.ts`) requires three:

- **`merge-window`**, `success` only from 00:00 to 08:00 New York time on
  pull requests labelled `renovate/automerge`
  ([runbook](./runbooks/forgejo-merge-window.md)). This is the only time
  limit. There is no `automergeSchedule` any more (removed 2026-10-18), so a
  green pull request merges as the window opens, not at Renovate's next
  hourly run.
- **`flate*`**, layer 1's render and diff.
- **`renovate/stability-days`**, the one-day wait above.

**Forgejo waits for required statuses only.** `Image Check` is not one: it runs
for `docker/**` alone, and a required check that never posts blocks every
other pull request. So a `docker/**` update can merge with `Image Check` red or
still running. Until 2026-10-18 a rule handed `docker/**` updates back to
Renovate's own merge, which waits for every status; that rule is gone.

**Merge style.** `automergeStrategy: auto` (in "Settings for the Forgejo copy
of this repository") uses the repository's default, rebase then fast-forward.
The shared preset's `rebase` becomes `rebase-merge` on Forgejo, which the
forge's copy does not allow, to keep `main` linear for the push to GitHub.

**Automerge PRs rebase only on conflict** (`rebaseWhen: conflicted` on all three
PR rules). The default for an automerge PR is to rebase whenever it falls behind
`main`, so each merge left every other green PR behind; Renovate rebased them
instead of merging, and a run merged one PR. On 2026-10-02 two runs merged two
of 31 ready PRs. The forge's branch protection does not require an up-to-date
branch, so a green PR merges as it is.

**GitHub Actions updates** automerge as a branch, not a pull request
(`automergeType: branch`, `ignoreTests: true`). The `renovate` account pushes
straight to the forge's `main`, which branch protection allows it. A required
status gates merging a pull request, not a push, so these wait for no check
and no window.

## Layer 3: after merge

`kubernetes/components/alerts/github-dispatch` adds a Flux `githubdispatch`
Alert to every namespace that includes `components/alerts`. It forwards each
HelmRelease or Kustomization **error** to `.github/workflows/renovate-watchdog.yaml`.
The watchdog then:

1. maps the failing object to its app directory, skipping aggregates such as
   `cluster-apps`;
2. looks for a **GitHub** PR in that directory that carries
   `renovate/automerge`, was merged **by Renovate**, and was merged in the last
   24 hours. If there is none, it logs the failure and stops;
3. pushes `renovate-revert/pr-<N>` with the revert, plus the app directory
   added to the **hold list**, the last automerge-related packageRule in
   `renovate.json5`. Without the hold, Renovate would raise the same update
   again and merge it;
4. opens a PR for that branch, or an issue linking it if Actions may not
   create PRs here, and labels the original PR `renovate/reverted`.

**This is dormant now.** Every automerge happens on the forge, and a forge
merge reaches GitHub as a push from the sync, with no GitHub PR behind it. Step
2 never finds one, so a failed HelmRelease after an automerge raises the Flux
alert and nothing reverts it. Hold an app by hand ([below](#operating-it)).

Even when it worked, layer 3 covered `kubernetes/**` only. The Docker hosts have
no Flux to report failures, so for them it is layer 1, autoheal, and Gatus.

## Operating it

- **Stop all automerge:** set `automerge: false` on the two "Automerge app
  image" rules, "Automerge named dependencies" and "Auto-merge GitHub Actions".
  Check the open pull requests on the forge afterwards: one already set to
  merge when checks succeed may keep that setting until it is cancelled there.
- **Hold one app:** add `"<app dir>/**",` between the `automerge-hold` markers.
  **Release it:** delete the line. Held PRs carry `renovate/automerge-hold`,
  and `merge-window` stops gating them.
- **Opt in one dependency:** add its Renovate `packageName` to "Automerge named
  dependencies". For mise tools that is the upstream repo (`cli/cli` for
  `gh`), not the tool name.
- **Group PR titles** carry the versions in the group's `commitMessageTopic`,
  with `commitMessageExtra: ""`. Renovate drops `commitMessageExtra` from a
  group whose members' versions differ, even by a `v` prefix, so the versions
  have to go in the topic. The title shows the first member's versions.
- **Add an app area:** extend `matchFileNames` in **both** app-image rules. The
  negated `matchPackageNames` lists must also stay identical between the two
  rules.
- **Change when merges happen:** change the merge window
  ([runbook](./runbooks/forgejo-merge-window.md#changing-the-window)), not
  Renovate.
- **Test a rule change:** feed the config through Renovate's package-rule
  engine, the same `applyPackageRules`, update-type merge, `applyPackageRules`
  sequence as `workers/repository/updates/flatten`. A plain
  `renovate-config-validator` run only checks syntax.
