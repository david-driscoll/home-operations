# The merge window on the forge

Forgejo's **Merge when checks succeed** merges a pull request the moment it
becomes mergeable. It has no setting for *when*. The merge window adds one: a
commit status, `merge-window`, that is `success` only inside a configured time
window. With branch protection requiring it, a pull request set to merge when
checks succeed waits for the window to open, then merges by itself.

Only pull requests that merge unattended wait for it: those labelled
`renovate/automerge` and not `renovate/automerge-hold`. Every other pull
request gets `success` at any hour ("Not set to automerge: no merge window"),
because a person merging it is the gate.

It runs on the forge's copy of this repository, `github-mirror/home-operations`
([forgejo-github-mirror.md](./forgejo-github-mirror.md)).

| Piece | Where |
| --- | --- |
| when it runs, and the window | `.forgejo/workflows/merge-window.yml` |
| the logic | `.forgejo/scripts/merge-window.py` (Python, standard library only) |
| its tests | `.forgejo/scripts/test_merge_window.py` |
| the requirement | branch protection on the forge's `main`, in `stacks/system/forgejo-github-mirror.ts` ([below](#branch-protection)) |

## How it works

The script:

1. works out whether the window is open right now, in local wall-clock time in
   the configured time zone;
2. reads the open pull requests, skipping drafts — all of them, or the one a
   `pull_request` run is about;
3. decides per pull request whether the window applies: only with the
   `renovate/automerge` label and without `renovate/automerge-hold` (a held
   update can carry both, since `addLabels` never removes one);
4. reads the newest `merge-window` status on each pull request's head commit,
   and posts a new one **only if the state has to change**: `success` with
   "Merge window open until Sun 08:00 America/New_York", or `pending` with
   "Merge window opens Sat 00:00 America/New_York" -- or, where the window
   doesn't apply, `success` with "Not set to automerge: no merge window". Each
   status links to the run that posted it.

The workflow runs it only when the answer can change:

| Trigger | When | Covers |
| --- | --- | --- |
| `schedule` | just after the window opens and just after it closes | every open pull request |
| `pull_request` | `opened`, `reopened`, `synchronize` | that pull request's new head commit |
| `pull_request` | `labeled`, `unlabeled` | that pull request, which may have moved in or out of the window's reach |
| `workflow_dispatch` | by hand, optionally a dry run | every open pull request |

`edited` is deliberately not a trigger. Renovate rewrites a pull request's body
as it pushes to it, so with `edited` each push started two runs for the same
commit. The second cancelled the first, and Forgejo shows a cancelled job as a
red `merge-window / Post merge-window statuses (pull_request)` until the next
run finishes. The cost is drafts: a draft (a `WIP:` title prefix here) that is
made ready gets no `merge-window` status until the next scheduled run. *Run
workflow* by hand gives it one at once.

The schedule is `1 0,8 * * *` with `timezone: America/New_York`: 00:01 and
08:01 New York time, following daylight saving by itself. Without `timezone`
Forgejo reads cron in UTC, so until 2026-10-18 each edge was listed at both of
its UTC hours (`1 4,5,12,13 * * *`) to cover the summer and winter offsets.

So a pull request gets two statuses a day, one at each edge, plus one each
time a new commit is pushed to it. Each run logs one line per pull request:

```text
success: Merge window open until Sat 08:00 America/New_York
github-mirror/home-operations#412 3f9c2ab pending -> success
github-mirror/home-operations#415 81d07e4 success unchanged
github-mirror/home-operations#416 c04e1d9 draft, skipped
```

Forgejo re-checks every scheduled merge on a commit whenever a status is posted
on that commit. The `pending` → `success` flip is what sets the merge off;
nothing else has to poll.

The window can run past midnight: a window that opens Friday 22:00 and ends
02:00 is open in the small hours of Saturday. Daylight saving changes follow
the wall clock. On the spring-forward day a window that starts in the skipped
hour opens when the clock jumps past it. On the fall-back day the repeated hour
counts as inside the window both times.

**Scheduled workflows run only from the default branch.** A change to the
schedule does nothing until it is on the forge's `main`. A `pull_request` run
uses the workflow as it is on the pull request's own branch, so a branch cut
before this file existed gets no run until it is rebased. The next edge run
covers it until then.

## Changing the window

**The window is written twice in `.forgejo/workflows/merge-window.yml`.** The
`MERGE_WINDOW_*` values in the step's `env` decide whether it is open. The
cron hours decide only when to look. Change both in the same commit.

| Setting | Meaning | Now |
| --- | --- | --- |
| `MERGE_WINDOW_DAYS` | the days a window **opens** on: `Sat,Sun`, `Mon-Fri`, `Fri-Mon`, `*` | `Mon-Sun` |
| `MERGE_WINDOW_START` | `HH:MM`, local, inclusive | `00:00` |
| `MERGE_WINDOW_END` | `HH:MM`, local, exclusive. At or before the start, the window ends the next day; equal to the start, it lasts 24 hours | `08:00` |
| `MERGE_WINDOW_TZ` | an IANA zone | `America/New_York` |

For the cron, take a minute just after each edge in local time and write it as
is; the schedule's `timezone` must name the same zone as `MERGE_WINDOW_TZ`.
Nothing breaks if the cron is wrong in the safe direction (an extra run posts
nothing). A missing edge leaves the last state in place: a missed opening
skips a night, and a missed close leaves green pull requests mergeable until
the next run.

This window is the only time limit the forge's automerges have. Renovate's
`automergeSchedule` came out of `.github/renovate.json5` on 2026-10-18, so
Renovate sets a pull request to merge at any hour and this status decides when
it lands. Moving the window here is the whole change.

To check a window before you commit it, run the script against a given moment
with `--dry-run`. It reads and reports, and posts nothing:

```bash
MERGE_WINDOW_TOKEN=<token> python3 .forgejo/scripts/merge-window.py --dry-run --server <forge URL> --repos github-mirror/home-operations --days Sat,Sun --start 02:00 --end 06:00 --now 2026-10-17T03:00:00-04:00
```

Add `--pull <number>` to look at one pull request. On the forge, *Actions →
merge-window → Run workflow* with **dry_run** ticked does the same with the
committed window and the current time.

## Using it on a pull request

On this copy branch protection also requires `renovate/stability-days`, which
only Renovate's pull requests carry ([below](#branch-protection)). So in
practice these steps are what Renovate does for itself; by hand they work only
on a Renovate pull request, such as one whose automerge was held.

1. Open the pull request on the forge and add the `renovate/automerge` label.
   Without it `merge-window` is green at any hour and the merge would happen
   at once. With it, outside the window, `merge-window` turns pending within a
   minute or so, with the time the window next opens.
2. Choose the merge style. **Rebase then fast-forward** is the safe one here:
   **Fast-forward only** fails if `main` has moved by the time the window
   opens. The repository allows only those two.
3. Pick **Merge when checks succeed**. The pull request merges when the window
   opens, provided every other required check is green.

**A push gets its status within a minute or so.** A new head commit has no
`merge-window` status until the `pull_request` run for it posts one. Until then
it reads as missing, which blocks a merge the same as `pending`. Inside the
window that run posts `success` and a scheduled merge goes ahead.

### Renovate

Renovate uses the same button. On the forge's copy the rule "Settings for the
Forgejo copy of this repository" in `.github/renovate.json5` sets
`platformAutomerge: true`, so for every update an automerge rule opts in (the
ones it labels `renovate/automerge`) Renovate turns on **Merge when checks
succeed** and leaves the merge to Forgejo. Forgejo merges once every
**required** status is green: `merge-window`, `flate*` and
`renovate/stability-days`. There is no `automergeSchedule`, so the window here
is the only time limit, and the merge happens as soon as the window opens
rather than at Renovate's next hourly run.

Forgejo waits **only** for required statuses. Anything else on the pull
request does not hold the merge:

- **`Image Check`**, the only pre-merge check `docker/**` updates get. It
  cannot be required: it runs for `docker/**` alone, and a required check that
  never posts blocks every other pull request. Until 2026-10-18 a rule handed
  `docker/**` updates back to Renovate's own merge, which waits for every
  status. That rule is gone, so a `docker/**` update can now merge with
  `Image Check` red or still running.
- **The workflow's own job status**, `merge-window / Post merge-window
  statuses (pull_request)`. Red means a run failed; what Forgejo reads is the
  `merge-window` status that run did or did not post.

GitHub Actions updates are the exception to all of this. They automerge as a
branch (`automergeType: branch`): the `renovate` account pushes straight to
`main`, with no pull request and so no window.

## Branch protection

The gate takes effect because the forge's `main` **requires** `merge-window`.
That rule is a `forgejo.BranchProtection` in
`stacks/system/forgejo-github-mirror.ts`, applied with the `system` stack. It
sets every field, so a change made in the forge's UI shows up as drift on the
next `pulumi preview` and is put back by the next `pulumi up`.

What it holds, and why:

- **Required statuses:** `merge-window` (the constant must match the
  workflow's `MERGE_WINDOW_CONTEXT`), `flate*` and `renovate/stability-days`.
  A required pattern that matches no status counts as pending, so each must
  appear on every pull request. That is why `Image Check*` is not on the list:
  it only runs for `docker/**`. `renovate/stability-days` is on every Renovate
  update here and on nothing else, so on this copy only Renovate's pull
  requests can merge.
- **Push is allowed to two accounts only:** `github-mirror-sync`, which
  `.forgejo/workflows/github-sync.yml` uses (as `MIRROR_SYNC_TOKEN`) to
  fast-forward the forge's `main` to GitHub's, and `renovate`, for its branch
  automerge of GitHub Actions updates. A required status gates merging a pull
  request, not a push, so neither waits for the window.
- **Not the job token.** With any rule on a branch, Forgejo's pre-receive hook
  looks the pusher up by id, and the job token pushes as the Actions user
  (`-2`), which isn't in the user table. Every push fails with a 500, logged as
  `Unable to GetUserByID ... user does not exist [uid: -2]`, whatever the rule
  allows. That froze the sync from 2026-10-17 18:47, when the rule first
  landed, until the sync moved to the account's token.
- **No reviews, no up-to-date requirement.** Renovate's pull requests merge
  unreviewed and rebase only on conflict.

### The sync can never force-push here

Forgejo refuses every non-fast-forward update of a protected branch before it
looks at any allow-list, admins included ("branch main is protected from force
push"). Two of the sync's pushes to the forge's `main` are leased force pushes:

- the **replay** after the two `main`s diverge (a forge merge and a GitHub
  commit landed between two syncs), and
- a **`discard_local`** dispatch.

Both fail while the rule exists. The run fails, and the forge's `main` stays
where it was. Fast-forwards in either direction keep working. To get past one:

1. On the forge, *Settings → Branches*, delete the rule for `main`.
2. *Actions → github-sync → Run workflow*, with **discard_local** ticked if
   that is the case, and wait for it to report what it did.
3. Nothing more. The Pulumi operator re-syncs the `system` stack every 5
   minutes and recreates the rule. If the sync has not finished by then,
   delete the rule again.

After an apply, check two things:

- the next `github-sync` run still publishes, or reports `in sync`, and the
  forge's `main` is GitHub's;
- a pull request outside the window shows the merge as blocked on
  `merge-window`.

**To turn it off**, remove `merge-window` from `statusCheckContexts` and apply.
Then delete the workflow, or set `MERGE_WINDOW_DAYS` to `*` with the start
equal to the end (always open). Forgejo stops waiting as soon as the status is
no longer required; the second step keeps a `pending` that means nothing off
the pull requests.

## The token

The job's own token (`github.token`) can write commit statuses on the
repository the workflow runs in, and that is what it uses. That includes a
`pull_request` run for a branch in this repository; for a pull request from a
fork the token is read-only, and the run fails saying so. Set a repository
secret `MERGE_WINDOW_TOKEN` to use another token instead: an access token from
an account with write access, with the **`write:repository`** scope. That is
Forgejo's scope for commit statuses, the equivalent of GitHub's `repo`.

A run whose token is refused logs `FAILED: ... 403 ... set MERGE_WINDOW_TOKEN`
for each pull request and fails. It carries on with the rest first.

## When it goes wrong

**A pull request is `pending` in the middle of the window.** Look at the
latest run for it. A failed run posts nothing, so the status is the last good
run's. The first line of the log says what the script decided and why
(`pending: Merge window opens …`). A *Run workflow* by hand brings every pull
request up to date.

**Green pull requests merged during the day.** The close run did not happen,
or failed. Look for the 08:01 New York run. The next edge, or a run by
hand, posts `pending` again.

**No runs at all.** The schedule runs only from `main`, and only where
`MIRROR_UPSTREAM` is set, the same guard `github-sync` uses. The log of a run
that found nothing to do says so.

**`time zone 'X' not found`.** `MERGE_WINDOW_TZ` is misspelled, or the runner
image has lost its tzdata.

**Tests.** They need no network:

```bash
python3 -m unittest discover -s .forgejo/scripts
```
