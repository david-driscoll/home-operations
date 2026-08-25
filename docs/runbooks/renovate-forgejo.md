# Renovate for Forgejo

Stands up dependency updates for the repositories on `git.driscoll.tech`, using
the [mogenius renovate-operator](https://github.com/mogenius/renovate-operator)
to schedule Renovate runs from inside the cluster.

Two apps, both in the existing `coder` namespace next to the forge they serve:

| App | Path | What it is |
| --- | --- | --- |
| `renovate-operator` | `kubernetes/apps/coder/renovate-operator` | the operator, its CRD, and the web UI at `renovate.driscoll.tech` |
| `renovate` | `kubernetes/apps/coder/renovate` | one `RenovateJob` — the schedule, the Forgejo endpoint and the Renovate config |

They are split for the same reason `garage-system` splits `cluster` from
`operator`: the second contains nothing but a custom resource, and the CRD that
admits it ships with the first's chart.

A third piece is not in Kubernetes at all: `stacks/system/forgejo-renovate.ts`
creates the bot account on the forge, mints its token, grants it access to
repositories, and writes the result to OpenBao — so the ExternalSecrets above
have something to read. It uses the `svalabs/forgejo` Terraform provider,
bridged into `sdks/forgejo` and pinned in the root `Pulumi.yaml`.

**This does not touch the GitHub side.** `.github/renovate.json5` and the
Mend-hosted app that reads it keep managing `david-driscoll/home-operations`
exactly as before. The only thing the two share is a habit.

## What the manifests already do

Anything not listed under [Manual steps](#manual-steps) is declarative and lands
with the merge:

- **The operator** — chart `oci://ghcr.io/mogenius/helm-charts/renovate-operator`
  6.0.1, one replica, image tag inherited from the chart's `appVersion` so there
  is a single version to bump. The CRD is installed in `template` mode, making
  it an ordinary Flux-owned manifest instead of a Helm hook Job that would need
  cluster-scoped CRD write rights.
- **Repository access** — reconciled by `stacks/system` on every run: a
  `renovate` team per organization (`includesAllRepositories`, so future
  repositories are covered), plus a collaborator grant per user-owned
  repository. Archived repositories, mirrors and forks are skipped.
- **Scope** — `rbac.ownNamespaceOnly: true`. The operator watches `coder` and
  nothing else, so a RenovateJob created elsewhere in the estate cannot borrow
  its credentials.
- **The policy engine** — on, though the chart ships it off. It bounds every URL
  taken from a RenovateJob: `policy.allowedHosts` admits only Forgejo's
  ClusterIP name and `git.driscoll.tech` (the webhook host is appended by the
  chart), `policy.allowedImages` admits only `ghcr.io/renovatebot/renovate`, and
  `policy.requireSecretRefOptIn` means a Secret must label itself
  `renovate-operator.mogenius.com/allow-ref: "true"` before the operator will
  read it at a caller-chosen key.
- **The UI** — `renovate.${ROOT_DOMAIN}` through the `internal` Gateway with the
  `local-user` middleware, plus a Tailscale Ingress at
  `renovate.${TAILSCALE_DOMAIN}`. Login is authentik OIDC handled by the
  operator itself, and the `admins` group maps to full access via
  `authorization.defaults.adminGroups`.
- **The RenovateJob** — 03:00 nightly, parallelism 2, platform `forgejo`,
  endpoint `http://forgejo-http.coder.svc.cluster.local:3000/api/v1` (the same
  in-cluster Service `forgejo-runner` uses) with `publicEndpoint` set to
  `https://git.driscoll.tech` for UI links. No discovery filter: what Renovate
  manages is decided by which repositories the bot account can see.
- **Webhooks** — the operator runs a receiver on its ClusterIP and syncs a hook
  onto every discovered repository itself, so the Dependency Dashboard
  checkboxes and per-PR "rebase" boxes act immediately rather than at 03:00
  tomorrow. This is also why `kubernetes/apps/coder/forgejo/helmrelease.yaml`
  now sets `[webhook] ALLOWED_HOST_LIST` — see
  [The Forgejo-side change](#the-forgejo-side-change).
- **The house Renovate config** — the RenovateJob's inline config sets
  `globalExtends` to
  `github>david-driscoll/home-operations//.github/renovate.json5`, the same file
  GitHub's Renovate reads for this estate, so both bots share one set of
  grouping rules, semantic-commit scopes and package rules. It is a bot-level
  default, so a repository's own `renovate.json` still merges on top. The
  onboarding PR proposes the same preset rather than bare `config:recommended`.
- **Log storage and the repository cache** — a `renovate` bucket and key on the
  Forgejo Garage cluster already in this namespace
  (`kubernetes/apps/coder/forgejo-garage/bucket.yaml`), serving two prefixes:
  `renovate-logs/` keeps each project's last run readable in the UI after the
  Job's pod is gone, and `renovate-cache/` is forwarded to every Renovate Job so
  dependency metadata survives between runs. Deliberately a second bucket, not
  a prefix in `forgejo` — that one is backed up nightly and everything here is
  rebuildable. Size tracks the number of repositories, not the number of runs,
  because both prefixes are keyed by identity and each run overwrites the last.
- **Monitoring** — the chart's `ServiceMonitor`, a Grafana dashboard imported
  through grafana-operator, four alerts in `prometheusrule.yaml`, and a Gatus
  check on `/health`.

## Manual steps

### 1. Nothing — repository access reconciles itself

`stacks/system` enumerates the forge on every run and grants the bot access two
ways, because Forgejo has two kinds of owner:

| owner | mechanism | covers repositories created later? |
| --- | --- | --- |
| organization | a `renovate` team with `includesAllRepositories`, bot as its only member | **yes** — no commit, no run needed |
| user | one `forgejo_collaborator` grant per repository | no — picked up by the next `stacks/system` run, which the Stack CR does daily |

**Today every repository is in the second row.** The forge has no
organizations, so the team half reconciles nothing; it is there for when one
appears, at which point its repositories move to the first row automatically
and stop needing a run per repository.

The grant is `write` on code, issues and pull requests and nothing else:
branch, open a PR, keep the Dependency Dashboard issue current. No wiki, no
releases, no actions, no repository settings. That is separate from the token's
`write:repository` **scope**, which is what additionally lets the operator sync
its own webhook onto each repository.

Three kinds of repository are deliberately skipped, and none of them is a gap:

- **archived** — Forgejo refuses every modification to an archived repository,
  so a grant would fail the apply rather than widen access.
- **mirrors** — read-only, so Renovate could not open a PR against one.
- **forks** — dropped at discovery anyway by `skipForks: true` on the
  RenovateJob, so a grant would buy nothing.

Two properties of the discovery worth knowing before they surprise you:

- **Empty is a legitimate answer for both lists, and neither is guarded on
  length.** There are no organizations on the forge today, so every repository
  is user-owned and the team half does nothing. What protects the lists is that
  a failed lookup *raises* rather than resolving short: a forge that is down, a
  rotated admin password, a 403 all fail the stack. An empty array means the
  API said "none". The gap that leaves — a 200 carrying fewer entries than
  really exist — would silently drop the corresponding grants, and nothing in
  the API distinguishes it from the truth.
- **Both are resolved before the Pulumi graph is built**, with `await` in
  `index.ts`, not inside an `.apply()`. Resources registered inside an apply are
  invisible to `pulumi preview` — the same shape that makes `stacks/home`
  invent ~40 phantom deletions on every preview.

### 2. What Pulumi already does

Nothing below is a step — it is what `stacks/system` does on its next
reconcile, listed so the OpenBao paths have an owner on paper.

Note the app prefix: **both** Kubernetes apps read out of
`clusters/equestria/apps/renovate-operator/`, including the one called
`renovate`. Two halves of one deployment, one Pulumi writer, one prefix. The
ExternalSecrets spell it literally rather than using `${APP}` for exactly this
reason.

| path | field | written by | read by |
| --- | --- | --- | --- |
| `clusters/equestria/apps/renovate-operator/credentials` | `forgejo_token` | `forgejo_personal_access_token` | `RENOVATE_TOKEN` on both Renovate pods, and the operator's Forgejo client for `skipForks` and webhook sync |
| | `webhook_token` | generated | the `Authorization: Bearer` header, in **both** directions — the operator verifies incoming deliveries with it and writes it onto every repository hook it syncs |
| | `bot_password` | generated | nothing. The provider authenticates as the admin and Renovate authenticates with the token; this is stored only so a human has a way back into the account |
| `clusters/equestria/apps/renovate-operator/session_secret` | `session_secret` | generated | UI session encryption. Its own path, not a field on `credentials`, because a different resource writes it |
| `clusters/equestria/apps/renovate-operator/oidc` | (several) | `stacks/applications` | the operator's OIDC login — see step 3 |
| `clusters/equestria/apps/forgejo/admin-token` | `token` | `forgejo_personal_access_token` for the admin | nothing yet. Filed in OpenBao rather than written as a Kubernetes Secret because this stack has no Kubernetes provider and its ServiceAccount holds only `system:auth-delegator` — it cannot create a Secret in any namespace |

The stack authenticates to Forgejo as the **break-glass admin**, reading
`clusters/equestria/apps/forgejo/credentials` — the same path the forge's own
chart reads. Username and password, not a token: Forgejo's
`/users/{username}/tokens` route is `reqBasicOrRevProxyAuth()`, so a
token-authenticated request cannot mint a token at all, and it is
`reqSelfOrAdmin()`, which is what lets the admin mint one belonging to the bot.

Rotating that admin password is a Forgejo operation followed by a `bao kv put`,
in that order. Do it the other way round and this stack authenticates with a
password the forge no longer accepts.

**There is no github.com credential to create.** Renovate needs one — release
notes and every `github-releases` / `github-tags` lookup go to api.github.com,
and unauthenticated that is 60 requests an hour for the cluster's whole egress
IP — but it is already in the namespace. `github-token` is the GitHub App
installation token `stacks/vault/KubernetesGithubAppToken.ts` mints and
emberstack reflects everywhere; the RenovateJob reads it straight into
`GITHUB_COM_TOKEN` via `extraEnv`. It expires hourly and is re-minted, which is
harmless here because every Renovate pod is a short-lived Job that reads the
current value at startup.

### 3. Merge, then let Pulumi do the rest

**The first reconcile of `renovate-operator` is expected to fail, and that is
the mechanism, not a fault.** The chain is circular by construction and resolves
itself in one pass:

1. Flux applies the Kustomization. The `ApplicationDefinition` lands; the
   `HelmRelease` cannot render, because its `valuesFrom` Secret
   (`renovate-operator-values`, carrying the OIDC issuer and client id) does not
   exist yet. Both ExternalSecrets sit in `SecretSyncedError` —
   "could not get secret data from provider" — because the OpenBao OIDC path is
   empty.
2. The `pulumi/equestria` Stack (`stacks/applications`) reconciles every 300s,
   lists every `ApplicationDefinition` in the cluster, finds the new one,
   creates the authentik application and provider, and writes the credential to
   `secrets/clusters/equestria/apps/renovate-operator/oidc`.
3. The ExternalSecrets pick it up within their 4m refresh, the HelmRelease
   renders, and `renovate` unblocks behind it.

`forgejo` and `coder` both bootstrapped this way.

**`stacks/system` is the other half and it is independent.** It runs on its own
commit-driven schedule, creates the bot and writes
`clusters/equestria/apps/renovate/credentials`, and does not care what the
operator is doing. So the two Kustomizations unblock separately: the operator
waits on `pulumi/equestria` (OIDC), and `renovate` waits on `pulumi/system` (the
bot token). Neither ordering is enforced and neither needs to be.

To stop waiting on either:

```bash
kubectl -n pulumi annotate stack equestria \
  pulumi.com/reconciliation-request="$(date +%s)" --overwrite
kubectl -n pulumi annotate stack system \
  pulumi.com/reconciliation-request="$(date +%s)" --overwrite
kubectl -n pulumi get stack equestria system -w
flux -n coder reconcile kustomization renovate-operator --with-source
flux -n coder reconcile kustomization renovate --with-source
```

### 4. Verify

```bash
# The operator is up and its RenovateJob passed policy. `Accepted: True` is the
# thing to look at -- a policy denial leaves the job silently idle, and the
# reason column names the value to fix.
kubectl -n coder get renovatejob renovate
kubectl -n coder get renovatejob renovate \
  -o jsonpath='{.status.conditions[?(@.type=="Accepted")]}' | jq

# Discovery found repositories. Empty means the bot is a collaborator on
# nothing, or the token is wrong -- those look identical from here.
kubectl -n coder get renovatejob renovate -o jsonpath='{.status.projects[*].name}'

# Force a run rather than waiting for 03:00. Two separate annotations, and the
# operator REMOVES each one once it has acted on it -- so a value that never
# clears means the operator is not watching this object.
#   /discovery    re-enumerate repositories
#   /schedule-all set every non-running project to Scheduled
kubectl -n coder annotate renovatejob renovate \
  renovate-operator.mogenius.com/discovery=true --overwrite
kubectl -n coder annotate renovatejob renovate \
  renovate-operator.mogenius.com/schedule-all=true --overwrite
kubectl -n coder logs -l job-name --tail=100 --prefix
```

Check the forge side too — `stacks/system` should have produced an account and
a token:

```bash
# The bot exists and is not an administrator.
curl -s -H "Authorization: token $ADMIN_TOKEN" \
  https://git.driscoll.tech/api/v1/users/renovate | jq '{login, is_admin, active}'

# Its token carries the five scopes, and nothing else.
kubectl -n coder get secret renovate-secret \
  -o jsonpath='{.data.RENOVATE_TOKEN}' | base64 -d | head -c 8; echo '…'
```

Project links in the operator UI point at the in-cluster Forgejo endpoint, not
at the public hostname — `provider.publicEndpoint` is deliberately unset. That
is cosmetic; see the note on `policy.allowedHosts` in
`kubernetes/apps/coder/renovate-operator/helmrelease.yaml` for why.

Then open <https://renovate.driscoll.tech>, sign in through authentik, and
confirm the job is visible — an empty job list on a successful login means the
`groups` claim did not carry `admins`.

Finally, check one repository's `Settings → Webhooks` in Forgejo: the operator
should have added a hook pointing at
`http://renovate-operator.coder.svc.cluster.local:8082/webhook/v1/forgejo`, and
its delivery history should show a 2xx.

## The Forgejo-side change

`kubernetes/apps/coder/forgejo/helmrelease.yaml` gains one line:

```ini
[webhook]
ALLOWED_HOST_LIST = renovate-operator.coder.svc.cluster.local
```

Forgejo's default for that setting is `external` — "valid non-private unicast
IPs only" — so without it every delivery to the operator's ClusterIP is dropped
**before it leaves the Forgejo pod**. The failure is visible only in Forgejo's
own delivery history; the operator sees nothing at all, which makes it a slow
thing to diagnose from the receiving end.

It names the exact host rather than the built-in `private` group on purpose.
`private` would re-open webhook delivery to every RFC1918 address, which turns
any repository's webhook settings into an SSRF primitive against the rest of the
estate.

This value and the operator's `webhook.baseUrl` are two spellings of the same
destination. Change them together.

## Troubleshooting

**`Accepted: False` on the RenovateJob, nothing runs.** The policy engine
refused something. The condition's `reason` and `message` name the value. The
three live constraints are `policy.allowedHosts` (both `provider.endpoint` and
`provider.publicEndpoint` hosts must be listed), `policy.allowedImages` (matched
on the repository, tag ignored), and `policy.requireSecretRefOptIn` — the last
one bites if `renovate-webhook` loses its
`renovate-operator.mogenius.com/allow-ref: "true"` label, and it fails the whole
job rather than just the webhook.

**Discovery returns nothing.** The bot has been granted no repositories —
usually because `stacks/system` has not run since this landed. A token missing
`read:user` presents identically: an empty project list, no error. Check the
grant before the token, in the forge itself: the bot should appear under the
repository's `Settings → Collaborators`, or in the org's `renovate` team.

**A new user-owned repository is not being picked up.** Expected until the next
`stacks/system` run — collaborator grants are per repository and cannot cover
one that did not exist when the stack last ran. Organization repositories do
not have this delay. To stop waiting, reconcile the stack (step 3).

**The executor fails on every repository while discovery looks healthy.** Check
the executor Job's log for:

```
fatal: could not read Password for 'https://**redacted**@git.driscoll.tech'
```

Renovate keys its git credential to the host of `endpoint`, which here is the
in-cluster Service — but Forgejo advertises a public `clone_url`, so the two
hosts differ and no credential matches. `gitUrl: 'endpoint'` in the RenovateJob
config makes Renovate clone from the host it authenticates against. Discovery
never notices, because it only calls the API and never clones.

**Renovate runs but every lookup is `no-result`.** Almost always the github.com
rate limit — check the run log for `Response code 403 (rate limit exceeded)`.
That means `GITHUB_COM_TOKEN` did not reach the pod: either emberstack has not
reflected `github-token` into `coder`, or the App installation token was not
re-minted and the reflected copy has lapsed.

```bash
kubectl -n coder get secret github-token \
  -o jsonpath='{.metadata.annotations.driscoll\.dev/token-expires-at}'
```

That annotation is the only non-secret evidence the value underneath is
current — it exists precisely because a Secret carrying only secret fields does
not reliably show that it changed.

**Login succeeds but the UI is empty.** Authentication worked and authorization
did not: the id token carried no `groups` claim containing `admins`. The claim
rides on the `profile` property mapping in `definition.yaml`.

**Run logs are empty in the UI after the Job is gone.** The log store could not
write to Garage. It fails quietly — a log-store failure does not fail the
Renovate run it was recording — so check the operator's own log for S3 errors.
Usual causes: `s3.region` not matching the GarageCluster's `s3Api.region` (every
request 403s with SignatureDoesNotMatch), or the
`forgejo-garage-renovate-credentials` Secret not existing yet because
`forgejo-garage` had not reconciled.

**Sessions drop on every config change.** `session_secret` is missing from
`clusters/equestria/apps/renovate-operator/credentials` — which means
`stacks/system` has not run since this landed. The `reloader` annotation
restarts the operator whenever its Secrets change, and without a stored key each
start mints a new one.

**Every repository errors with `preset not found`.** The preset chain reached a
`local>` reference. `local>` resolves against whatever platform the bot is on,
so on the Forgejo bot it looks for the repo on `git.driscoll.tech` instead of
GitHub. `.github/renovate.json5` therefore names its shared preset as
`github>david-driscoll/.github:renovate-config`, not `local>` — identical
behaviour on GitHub, and the only spelling that survives being consumed from a
second platform. If a new `local>` appears anywhere in that chain it will break
the Forgejo side and nothing on the GitHub side.

**`stacks/system` fails on the Forgejo provider.** This stack is a dependency
root, so it is worth knowing the blast radius: the `clusters/<key>/details`
paths every other stack reads are already written and a failed apply does not
unwrite them — what stops is publishing updates. The usual causes are the forge
being down, or the break-glass admin password having been rotated in Forgejo
without a matching `bao kv put`. `BOT_ENABLED` at the top of
`stacks/system/forgejo-renovate.ts` is the kill switch: turn it off and the
module makes no call at all.

## Keeping the Terraform provider up to date

The provider is pinned once, in the root `Pulumi.yaml`:

```yaml
  forgejo:
    source: terraform-provider
    version: 0.14.0
    parameters: [registry.terraform.io/svalabs/forgejo, 1.6.0]
```

`version` is the **bridge plugin**; the second parameter is the **provider**.
Renovate now tracks the latter for all seven bridged providers through a
customManager in `.github/renovate.json5` — before this they were pinned by hand
and updated only when someone noticed.

**A Renovate bump is half a change, and the missing half is silent.** The
generated `sdks/forgejo/package.json` restates the version inside a base64
`pulumi.parameterization.value`, and that blob is what the bridge actually
resolves the provider from. No regex can re-encode it, so a merged bump that has
not been regenerated produces a diff reading `1.6.0 → 1.7.0` while `pulumi up`
keeps running 1.6.0, with no error anywhere.

**Nothing enforces this**, so it is on whoever merges the PR. Regenerate before
merging a provider bump:

```bash
pulumi package add terraform-provider registry.terraform.io/svalabs/forgejo 1.7.0
```

That rewrites `sdks/forgejo/` and the `Pulumi.yaml` entry together, and it is
idempotent — running it for the version already pinned reproduces the same
bytes. Commit whatever `git status sdks/` shows, then `npm ci` so the workspace
picks up the regenerated package.

Two things to check afterwards:

- `pulumi package add` rewrites its own `Pulumi.yaml` entry as a **block
  sequence** while every existing entry uses flow style. Put it back —
  the Renovate customManager matches the flow form, so left as a block the
  provider silently stops being tracked.
- The generated `package.json` pins `"@types/node": "^20"`, where the other six
  SDKs are on `^24.0.0` (Renovate moved them). Match the siblings, or expect a
  dependency PR immediately.

To confirm the regeneration actually took, decode the blob — it is the field
that decides which provider binary runs:

```bash
python3 -c "import base64,json,sys; print(base64.b64decode(json.load(open('sdks/forgejo/package.json'))['pulumi']['parameterization']['value']).decode())"
```

## See also

- [`docs/runbooks/forgejo-equestria-cutover.md`](./forgejo-equestria-cutover.md) — how the forge itself got here
- [Renovate's Forgejo platform docs](https://docs.renovatebot.com/modules/platform/forgejo/)
- [renovate-operator docs](https://github.com/mogenius/renovate-operator/tree/main/docs)
