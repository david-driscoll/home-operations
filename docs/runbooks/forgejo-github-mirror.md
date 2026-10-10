# The Forgejo copy of this repository

`david-driscoll/home-operations` on GitHub also exists on the forge, as
`github-mirror/home-operations`, so that the in-cluster Renovate
([renovate-forgejo.md](./renovate-forgejo.md)) can work on it — open pull
requests, run the checks, merge, and have the result land on GitHub. The two
`main` branches are kept identical. **Only `main`** — no other branch, and no
tag, ever crosses in either direction after the first import.

GitHub stays the source of truth: Flux and the Pulumi operator still read from
it, and when the two sides disagree GitHub's history is the one that is kept.

## How a change travels

```
GitHub -> Forgejo                           Forgejo -> GitHub

push to main on GitHub                      a pull request merges on Forgejo
  -> GitHub's existing webhook                -> `push` starts github-sync
  -> Flux Receiver `github-webhook`           -> each new commit is checked
  -> GitRepository `forgejo-github-sync`      -> GitHub's main is fast-forwarded
     fetches, raises `NewArtifact`               over SSH, with a deploy key
  -> Alert/Provider `forgejo-github-sync`
  -> the relay dispatches github-sync
  -> Forgejo's main is fast-forwarded
```

Both columns end in the same workflow, `.forgejo/workflows/github-sync.yml`,
which runs `scripts/forgejo-github-sync`. It also runs hourly, so a dispatch
that never arrived costs at most an hour.

Nothing new is reachable from outside. GitHub's side of this is the webhook
Flux already had (`stacks/vault/KubernetesFluxWebhooks.ts`).

| Piece | Where | What it does |
| --- | --- | --- |
| the repository, its owner, the keys | `stacks/system/forgejo-github-mirror.ts` | creates `github-mirror/home-operations` as a one-time import, the `github-mirror` account that owns it, the repository's Actions secrets and variables, and a deploy key pair — the private half into those secrets, the public half onto GitHub |
| the sync workflow | `.forgejo/workflows/github-sync.yml` | decides when to run and hands over credentials |
| the sync | `scripts/forgejo-github-sync` | compares the two branches and moves whichever is behind |
| the labels | `scripts/forgejo-github-labels` | copies GitHub's labels to the forge after each sync; Renovate there only attaches labels that already exist. It creates and updates, and never deletes |
| the pull request checks | `.forgejo/workflows/flate.yml`, `image-check.yml` | the forge's copies of GitHub's two checks; see [Checks](#checks-on-a-forge-pull-request) |
| the source | `kubernetes/apps/coder/forgejo-github-sync/gitrepository.yaml` | a view of GitHub's `main` that changes on every commit |
| the relay | `kubernetes/apps/coder/forgejo-github-sync` | turns that source's "new artifact" event into a workflow dispatch |

Two of those exist only because of how Flux works:

- **The relay.** Flux cannot dispatch the workflow by itself: its `generic`
  provider POSTs a fixed event body, and Forgejo's dispatch endpoint requires
  `{"ref": ...}`.
- **The extra GitRepository.** source-controller raises `NewArtifact` when the
  artifact's *content* changes, and by default leaves `.github/`, images and
  archives out of the artifact. The cluster's own GitRepositories therefore say
  nothing about a commit that only touches `.github/`. This one sets `ignore`,
  which replaces the default exclusions, so every commit is a new artifact.

## Manual steps

Everything else lands with the merge.

### 1. Let deploy keys past the `main` ruleset

`main` requires a pull request and the `flate Success` check. The mirror pushes
commits directly, so GitHub refuses it (`GH013`) until **Deploy keys** is on the
ruleset's bypass list: *Settings → Rules → Rulesets → main → Bypass list → Add
bypass → Deploy keys*. Until then GitHub's commits still reach the forge; only
publishing fails, and the failed run says why.

`stacks/system` registers the deploy key itself. This click is left to a person
on purpose: it is what lets something push to the branch the cluster deploys
from without a GitHub pull request.

A bypass covers every rule in its ruleset, and `main`'s also blocks deletion
and force pushes. The mirror never forces a push to GitHub, but there is no
reason to let the key do it: move **Restrict deletions** and **Block force
pushes** into a second ruleset with no bypass, and leave the pull request and
status check rules in the one that has it.

### 2. Delete the imported branches (optional, once)

The repository is created by importing GitHub's, and an import cannot be
limited to one branch: the forge starts with every branch GitHub had that day,
several hundred of them, and nothing ever updates them. On the forge, *Actions →
github-sync → Run workflow* with **prune_branches** ticked deletes everything
but `main`.

Do it before Renovate's first run there, or not at all. Later it would also
delete Renovate's own open branches; that closes their pull requests, and
Renovate reopens them on its next run. Leaving the branches is harmless: the
forge's Renovate commits with the identity Mend used, so it treats the
`renovate/*` ones as its own.

## Checks on a forge pull request

**A change merged on the forge reaches GitHub's `main` without a GitHub pull
request**, so none of GitHub's workflows ever see it. The forge runs its own
copies instead, on the estate's runner:

| GitHub | Forge | What runs |
| --- | --- | --- |
| `.github/workflows/flux-local.yaml` | `.forgejo/workflows/flate.yml` | `flate test`, `flate diff` (posted as a comment), `scripts/image-check flate` on the rendered diff, and `eso-values-lint` |
| `.github/workflows/image-check.yaml` | `.forgejo/workflows/image-check.yml` | `scripts/image-check compose` for `docker/**` |

Same commands, same scripts, same pinned actions. They are still two files per
check, kept in step by hand — Forgejo reads `.forgejo/workflows` and GitHub
reads `.github/workflows`, and neither reads the other's. A check added on one
side only is a check half the pull requests skip. The header of `flate.yml`
lists where the forge copy differs and why.

Two GitHub workflows have **no** copy on the forge:

- **`renovate-watchdog`**, the post-merge half of the automerge gate
  (`docs/renovate-automerge.md`). It finds the pull request to revert by
  searching GitHub's, and an update merged on the forge has none. A HelmRelease
  that fails after a forge automerge still raises the usual Flux alert, but
  nothing reverts it or puts the app on the hold list. The hold list itself
  applies to both copies.
- **`pulumi-sdk-regen`**, which completes a provider bump in the root
  `Pulumi.yaml`. Rather than raise half a change, the forge's Renovate does not
  raise those at all (the last rule in `.github/renovate.json5`); Mend's pull
  request on GitHub for the same bump is completed as before.

The runner's Docker-in-Docker container is allowed 16Gi for this
(`kubernetes/apps/coder/forgejo-runner/helmrelease.yaml`): a cold `flate`
render of this repository peaks near 4 GB and four jobs can run at once.

## What is checked before anything is published

Separately from the pull request checks, and for a different reason: GitHub's
repository is public and the forge is not. Before a commit is pushed to GitHub,
`scripts/private-domain-guard` — GitHub's own copy of it, not the one in the
commits under test — reads:

- the commit's author and committer, names and addresses;
- its message;
- every line it adds, and the paths it adds them to.

One hit stops the run. Nothing is published, including clean commits that come
after the bad one, and the log names the commit ids and nothing else.

Three settings exist only so that an ordinary Renovate update passes:

- **Renovate commits as GitHub's `renovate[bot]`**
  (`gitAuthor` in `kubernetes/apps/coder/renovate/renovatejob.yaml`), not as
  its account address under the root domain. An update therefore reads the same
  in GitHub's history whichever bot raised it. On the forge the address belongs
  to no account, so those commits show without an avatar.
- **Forgejo's `NO_REPLY_ADDRESS` is `noreply.forgejo.invalid`**
  (`kubernetes/apps/coder/forgejo/helmrelease.yaml`). Forgejo writes
  `<login>@<NO_REPLY_ADDRESS>` as the committer whenever it rebases a pull
  request, and the default put the forge's hostname there.
- **The repository allows only "Rebase then fast-forward" and "Fast-forward
  only".** A merge commit or a squash is a commit Forgejo composes, and from the
  web UI it carries a `Reviewed-on:` link back to the forge.

If your own Forgejo account does not hide its email address, a pull request you
rebase by hand is committed with that address. It is published if it does not
name the domain and blocked if it does.

### When a run is blocked

The commit is on Forgejo's `main` and cannot be published, so it has to come
off. Run the workflow by hand (*Actions → github-sync → Run workflow*) with
**discard_local** ticked: Forgejo's `main` is reset to GitHub's and every
commit that existed only on the forge is dropped. Then redo the change without
the name. Renovate reopens what it still wants on its next run.

## Renovate on the copy

The forge's Renovate discovers the repository like any other: `stacks/system`
grants the bot a collaborator on the run after the repository is created. It
runs hourly and reads the same `.github/renovate.json5` that Mend's hosted
Renovate reads on GitHub.

**The same rules apply on both copies, automerge included.** Every rule in that
file that is scoped to this repository names both: `david-driscoll/home-operations`
and `github-mirror/home-operations`. A rule added with only the first would not
exist on the forge — and for the "no automerge unless a rule opts in" rule,
that would mean every patch merging itself there.

So **both bots open pull requests for the same updates**, one set on each side,
and whichever sees its own checks green inside the overnight window merges
first. The other side's pull request is closed by its bot on its next run. If
both merge the same update before the sync has run, the forge's copy of the
commit is recognised as already applied and dropped.

An update the forge merges is pushed to GitHub by the sync within a minute or
so. Renovate merges with **Rebase then fast-forward**, the repository's default
and the only style offered besides fast-forward.

## When the two sides diverge

It happens when a commit lands on GitHub while the forge holds one that has not
been published yet. The sync replays the forge's commits onto GitHub's `main`,
fast-forwards GitHub, and moves Forgejo's `main` to the replayed history. The
replayed commits keep their author and get `github-mirror` as committer.

It gives up, loudly, instead of guessing when:

- a forge commit does not apply on top of GitHub's `main` (a real conflict);
- the two sides share no history, or the forge is more than 50 commits ahead —
  what a history rewrite on GitHub looks like from here.

All of these are cleared the same way as a blocked run: **discard_local**.

## Verify

```bash
# The relay is up and has its token; the source is fetching.
kubectl -n coder get helmrelease,externalsecret,gitrepository forgejo-github-sync

# Flux is forwarding. Each push to GitHub's main logs one `dispatched` line
# carrying the revision; `dispatch refused` with a status is Forgejo saying no.
kubectl -n coder logs deploy/forgejo-github-sync --tail=20
kubectl -n coder get alert,provider forgejo-github-sync

# The deploy key is on GitHub, with write access.
gh repo deploy-key list --repo david-driscoll/home-operations
```

On the forge, *github-mirror/home-operations → Actions* shows a `github-sync`
run per push to either side, and one an hour. A green run's log ends with what
it did: `in sync at …`, `Forgejo is behind GitHub: … -> …`, or
`publishing N commit(s) to GitHub`. A pull request there shows `flate` (two
jobs) and, when it touches `docker/**`, `Image Check`.

## Troubleshooting

**The relay's pod will not start; the ExternalSecret is in `SecretSyncedError`.**
`stacks/system` has not written
`clusters/equestria/apps/forgejo-github-sync/credentials` yet. Expected for a
few minutes after the first merge; reconcile the Stack to stop waiting (step 3
of [renovate-forgejo.md](./renovate-forgejo.md)).

**`stacks/system` fails on `github:index:RepositoryDeployKey`.** The estate's
GitHub App may not manage deploy keys on that repository (it needs the
Administration permission, read and write), or GitHub was unreachable. Until it
is fixed nothing else in that stack is published either. To get the stack green
first, remove the `RepositoryDeployKey` from
`stacks/system/forgejo-github-mirror.ts` and add the key by hand.

**`dispatch refused` with `status: 404` in the relay's log.** The repository or
the workflow file is not there, or the token has lost access. Check that the
repository exists and that `.forgejo/workflows/github-sync.yml` is on its
`main`.

**A run fails with `GitHub did not accept the deploy key`.** The key on GitHub
is not the one in the repository's Actions secrets. Both come from one Pulumi
resource, so this means a `stacks/system` run stopped half way; reconcile it.

**A run fails with `a GitHub ruleset turned the push away`.** Manual step 1.

**A run fails naming commit ids that "carry the root domain or the tailnet
name".** See [When a run is blocked](#when-a-run-is-blocked).

**Pushes to GitHub are not showing up on the forge until the hour.** The
dispatch is not arriving. In order: the Receiver (`flux -n flux-system get
receivers`), the GitRepository, Alert and Provider in `coder` (above), then the
relay's log. An event the relay logs as `ignored` is one that was not a new
artifact.

**Every job on the forge fails at once, mid-run.** The runner's Docker-in-Docker
container was killed for memory; `kubectl -n coder describe pod forgejo-runner-0`
shows `OOMKilled` on `dind`. Several cold `flate` renders at the same moment
are the usual cause.

**A pull request on the forge never merges itself.** Renovate needs every
status on the branch green and at least one status to exist. A job that failed
stays red until the branch is pushed again. Otherwise check the rule that
should match names `github-mirror/home-operations`, and that a run happened
inside its `automergeSchedule`.

**Every GitHub workflow starts running on the forge.** `.forgejo/workflows` has
gone missing from `main`. Forgejo falls back to `.github/workflows` only when
that directory does not exist.

**Renovate leaves a branch alone as "edited".** Its last commit has an author
that is neither `gitAuthor` nor in `gitIgnoredAuthors`
(`kubernetes/apps/coder/renovate/renovatejob.yaml`).

## Taking it out

Take Deploy keys off the bypass list first; that alone stops anything being
published. Then delete `kubernetes/apps/coder/forgejo-github-sync`, its entry in
the Receiver, and the component in `stacks/system/index.ts` — which removes the
deploy key from GitHub and archives the repository on the forge rather than
deleting it — and `.forgejo/workflows` last, since without that directory a
surviving copy would start running GitHub's workflows.
