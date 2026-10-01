# Renovate automerge gate

Renovate merges a narrow set of its own PRs without a human. Three layers sit
in front of that: one check before the merge, one at the merge, and one after
it. Everything outside that set waits for review, as before.

## What automerges

The rules are in `.github/renovate.json5`, under "Automerge app image ..."
(one rule for patch/digest, one for minor). They apply only to
`david-driscoll/home-operations`, because the Forgejo bot inherits the same
file through `globalExtends`.

| Automerges | Never automerges |
| --- | --- |
| `docker`/`helm` patch, digest and minor bumps under `kubernetes/apps/{equestria,stargate-command,agents}/**` and `docker/**` | majors; minors of `0.x`; Home Assistant minors (the monthly release) |
| GitHub Actions minor/patch/digest (the older rule, `automergeType: branch`) | databases and anything that migrates on start (postgres, timescale, CNPG, mongo, couchdb, valkey/redis, mariadb/mysql, neo4j, meilisearch, immich, nextcloud, opencloud) |
| | identity, secrets, ingress, DNS, tailnet, storage, backups, registry (authentik, openbao, garage, traefik, tailscale, technitium, keepalived, zot, docker-socket-proxy, backrest, rclone, arcane, toolport) |
| | everything else: Talos, Kubernetes, Flux, CRDs, cluster infrastructure, mise tools, npm, Pulumi |

Before this gate, the shared preset's `:automergePatch` automerged **every**
patch in the repo, Talos and Traefik included. The first rule under
"No automerge in this repo unless a rule below opts in" turns that off.

Renovate waits `minimumReleaseAge: 3 days` before it opens these PRs. That wait
only works where the registry publishes release timestamps. Docker Hub does and
GHCR does not, so `minimumReleaseAgeBehaviour: timestamp-optional` lets GHCR
updates through without the wait instead of holding them forever.

## Layer 1: before merge

| Check | Workflow | What it catches |
| --- | --- | --- |
| flate test + diff | `flux-local.yaml` | manifests that don't render or build |
| rendered images | `flux-local.yaml` → `scripts/image-check flate` | a tag or digest that does not exist, or no linux/amd64 build |
| compose + images | `image-check.yaml` → `scripts/image-check compose` | a compose file that no longer parses, and the same image problems for `docker/**` |

## Layer 2: the merge

`automergeType: pr` with `platformAutomerge: false`. `main` has no branch
protection, so GitHub's native auto-merge would merge at once. Renovate merges
the PR itself, and only when every check on it is green. A pending check, such
as Codacy still running, holds the merge until the check finishes.

**Merges happen overnight only.** `automergeSchedule: ["* 1-6 * * *"]` with
`timezone: America/New_York`, the estate's `TIMEZONE`, opens a window from
01:00 to 06:59 local time, through daylight saving changes. PRs still open and
run CI at any hour; a green one waits for the first Renovate run inside the
window. The hosted Renovate app chooses when it runs, so a night with no run in
the window merges nothing, and those PRs wait for the next night. The
`timezone` is set on the two rules, not at the top level, so the rest of the
repo and the Forgejo repos keep scheduling in UTC. GitHub Actions automerge,
the older rule, is not windowed.

## Layer 3: after merge

`kubernetes/components/alerts/github-dispatch` adds a Flux `githubdispatch`
Alert to every namespace that includes `components/alerts`. It forwards each
HelmRelease or Kustomization **error** to `.github/workflows/renovate-watchdog.yaml`.
The watchdog then:

1. maps the failing object to its app directory, skipping aggregates such as
   `cluster-apps`;
2. looks for a PR in that directory that carries `renovate/automerge`, was
   merged **by Renovate**, and was merged in the last 24 hours. If there is
   none, it logs the failure and stops;
3. pushes `renovate-revert/pr-<N>` with the revert, plus the app directory
   added to the **hold list**, the last packageRule in `renovate.json5`.
   Without the hold, Renovate would raise the same update again and merge it;
4. opens a PR for that branch, or an issue linking it if Actions may not
   create PRs here, and labels the original PR `renovate/reverted`.

The watchdog never merges anything. Flux upgrade remediation has usually rolled
the release back already; the revert brings git back in line with the cluster.
CI does not run on a PR opened with `GITHUB_TOKEN`; push a commit or
close and reopen the PR if you want the checks.

Layer 3 covers `kubernetes/**` only. The Docker hosts have no Flux to report
failures, so for them it is layer 1, autoheal, and Gatus.

## Operating it

- **Stop all automerge:** set `automerge: false` on the two "Automerge app
  image" rules.
- **Hold one app:** add `"<app dir>/**",` between the `automerge-hold` markers.
  **Release it:** delete the line. Held PRs carry `renovate/automerge-hold`.
- **Add an app area:** extend `matchFileNames` in **both** rules. The negated
  `matchPackageNames` lists must also stay identical between the two rules.
- **Test a rule change:** feed the config through Renovate's package-rule
  engine, the same `applyPackageRules`, update-type merge, `applyPackageRules`
  sequence as `workers/repository/updates/flatten`. A plain
  `renovate-config-validator` run only checks syntax.
