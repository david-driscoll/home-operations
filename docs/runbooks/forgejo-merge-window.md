# The merge window on the forge

Forgejo's **Merge when checks succeed** merges a pull request the moment it
becomes mergeable. It has no setting for *when*. The merge window adds one: a
commit status, `merge-window`, that is `success` only inside a configured time
window. With branch protection requiring it, a pull request set to merge when
checks succeed waits for the window to open, then merges by itself.

It runs on the forge's copy of this repository, `github-mirror/home-operations`
([forgejo-github-mirror.md](./forgejo-github-mirror.md)).

| Piece | Where |
| --- | --- |
| the schedule and the configuration | `.forgejo/workflows/merge-window.yml` |
| the logic | `.forgejo/scripts/merge-window.py` (Python, standard library only) |
| its tests | `.forgejo/scripts/test_merge_window.py` |
| the requirement | branch protection on the forge's `main` (set by hand, [below](#turning-it-on)) |

## How it works

Every five minutes the workflow runs the script, which:

1. works out whether the window is open right now, in local wall-clock time in
   the configured time zone;
2. lists the open pull requests of each repository it is given, skipping
   drafts;
3. reads the newest `merge-window` status on each pull request's head commit,
   and posts a new one **only if the state has to change**: `success` with
   "Merge window open until Sun 07:00 America/New_York", or `pending` with
   "Merge window opens Sat 00:00 America/New_York". Each status links to the
   run that posted it.

So a pull request gets two statuses a day: one when the window opens and one
when it closes. Each run logs one line per pull request:

```text
success: Merge window open until Sat 07:00 America/New_York
github-mirror/home-operations#412 3f9c2ab pending -> success
github-mirror/home-operations#415 81d07e4 success unchanged
github-mirror/home-operations#416 c04e1d9 draft, skipped
```

Forgejo re-checks every scheduled merge on a commit whenever a status is posted
on that commit. The `pending` → `success` flip is what sets the merge off; nothing
else has to poll.

The window can run past midnight: a window that opens Friday 22:00 and ends
02:00 is open in the small hours of Saturday. Daylight saving changes follow
the wall clock. On the spring-forward day a window that starts in the skipped
hour opens when the clock jumps past it. On the fall-back day the repeated hour
counts as inside the window both times.

**Scheduled workflows run only from the default branch.** A change to the
workflow does nothing until it is on the forge's `main`. A copy on a branch or
in a pull request never runs on the schedule.

## Changing the window

Set the repository's Actions variables (*Settings → Actions → Variables* on the
forge). No commit is needed: the next run picks them up. Any variable left
unset falls back to the default in the workflow.

| Variable | Meaning | Default |
| --- | --- | --- |
| `MERGE_WINDOW_DAYS` | the days a window **opens** on: `Sat,Sun`, `Mon-Fri`, `Fri-Mon`, `*` | `Mon-Sun` |
| `MERGE_WINDOW_START` | `HH:MM`, local, inclusive | `00:00` |
| `MERGE_WINDOW_END` | `HH:MM`, local, exclusive. At or before the start, the window ends the next day; equal to the start, it lasts 24 hours | `07:00` |
| `MERGE_WINDOW_TZ` | an IANA zone | `America/New_York` |
| `MERGE_WINDOW_REPOS` | `owner/name`, several separated by spaces | the workflow's own repository |

The defaults match Renovate's `automergeSchedule` (00:00–06:59 New York, every
night; [renovate-automerge.md](../renovate-automerge.md)).

To check a window before you set it, run the script against a given moment
with `--dry-run`. It reads and reports, and posts nothing:

```bash
MERGE_WINDOW_TOKEN=<token> python3 .forgejo/scripts/merge-window.py --dry-run --server <forge URL> --repos github-mirror/home-operations --days Sat,Sun --start 02:00 --end 06:00 --now 2026-10-17T03:00:00-04:00
```

On the forge the same is *Actions → merge-window → Run workflow* with
**dry_run** ticked, using the configured window and the current time.

## Using it on a pull request

Once branch protection requires `merge-window` ([below](#turning-it-on)):

1. Open the pull request on the forge. Outside the window it shows
   `merge-window` as pending, with the time the window next opens.
2. Choose the merge style. **Rebase then fast-forward** is the safe one here:
   **Fast-forward only** fails if `main` has moved by the time the window
   opens. The repository allows only those two.
3. Pick **Merge when checks succeed**. The pull request merges on the first
   run after the window opens, provided every other required check is green.

**A new push resets the wait.** A push creates a new head commit, and the new
commit has no `merge-window` status until the next run, at most five minutes
later. Outside the window that run posts `pending`, as you would expect. Inside
the window the new commit is not green until that run posts `success`. A
scheduled merge waits for it.

### Renovate

Renovate on the forge doesn't use this button. It merges the pull request
itself (`platformAutomerge: false`), only when **every** status is green and
only inside its own `automergeSchedule`. This status is one of those, so it
gates Renovate as soon as the workflow is on `main`, before branch protection
is involved at all. Renovate merges only where its window and this one overlap.
With the defaults the two are the same window, and nothing changes for Renovate.

## Turning it on

The workflow posts statuses whether or not anything requires them. The gate
only takes effect once the forge's `main` **requires** `merge-window`. That is
set by hand, by an administrator of the repository.

Pushes to `main` must stay enabled. `.forgejo/workflows/github-sync.yml` pushes
GitHub's commits straight to the forge's `main` with the job token, and so does
Renovate's branch automerge for GitHub Actions updates. A rule left on
Forgejo's default of *Disable push* stops both.

**In the UI:** *Settings → Branches* on `github-mirror/home-operations`. Then
**Add new rule**, or **Edit** on an existing rule for `main`:

- **Protected branch name pattern:** `main`
- **Push:** *Enable push* (anyone with write access). Not *Disable push*.
- **Enable status check:** ticked. In **Status check patterns**, add
  `merge-window` on its own line, keeping any patterns already there.
- Leave approvals, signed commits and *Block merge if pull request is
  outdated* as they are.
- **Save rule.**

**Or with the API**, as a repository administrator. See what is there first:

```bash
curl -fsS -H "Authorization: token $FORGEJO_TOKEN" "$FORGEJO_URL/api/v1/repos/github-mirror/home-operations/branch_protections"
```

With no rule for `main`, create one:

```bash
curl -fsS -X POST -H "Authorization: token $FORGEJO_TOKEN" -H "Content-Type: application/json" "$FORGEJO_URL/api/v1/repos/github-mirror/home-operations/branch_protections" --data '{"rule_name": "main", "enable_push": true, "enable_status_check": true, "status_check_contexts": ["merge-window"]}'
```

With a rule already there, edit it. `status_check_contexts` **replaces** the
list, so send the existing contexts as well as `merge-window`:

```bash
curl -fsS -X PATCH -H "Authorization: token $FORGEJO_TOKEN" -H "Content-Type: application/json" "$FORGEJO_URL/api/v1/repos/github-mirror/home-operations/branch_protections/main" --data '{"enable_status_check": true, "status_check_contexts": ["merge-window"]}'
```

Afterwards, check two things:

- the next `github-sync` run still publishes, or reports `in sync`;
- a pull request outside the window shows the merge as blocked on
  `merge-window`.

**To turn it off**, remove `merge-window` from the status check patterns, and
either delete the workflow or set `MERGE_WINDOW_DAYS` to `*` with the start
equal to the end (always open). As long as the workflow posts `pending`,
Renovate waits for it.

## The token

The job's own token (`github.token`) can write commit statuses on the
repository the workflow runs in, and that is what it uses. Set a repository
secret `MERGE_WINDOW_TOKEN` to use another token instead. You need one when
`MERGE_WINDOW_REPOS` names any other repository, which the job token cannot
reach. Use an access token from an account with write access to every
repository listed, with the **`write:repository`** scope. That is Forgejo's
scope for commit statuses, the equivalent of GitHub's `repo`.

A run whose token is refused logs `FAILED: ... 403 ... set MERGE_WINDOW_TOKEN`
for each pull request and fails. It carries on with the rest first.

## When it goes wrong

**Every pull request is `pending` in the middle of the window.** Look at the
latest run. A failed run posts nothing, so the statuses are the last good run's.
The first line of the log says what the script decided and why
(`pending: Merge window opens …`).

**Merges stop entirely.** Look at the runs list. With no runs, the schedule is
not firing. It runs only from `main`, and only where `MIRROR_UPSTREAM` is set,
the same guard `github-sync` uses. The log of a run that found nothing to do
says so.

**`time zone 'X' not found`.** `MERGE_WINDOW_TZ` is misspelled, or the runner
image has lost its tzdata.

**Tests.** They need no network:

```bash
python3 -m unittest discover -s .forgejo/scripts
```
