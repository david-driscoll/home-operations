#!/usr/bin/env python3
"""Post a `merge-window` commit status on every open pull request.

The status is `success` while the configured window is open and `pending`
while it is closed. With `merge-window` required by branch protection, a pull
request set to "Merge when checks succeed" waits for the window and then
merges by itself: Forgejo re-checks a scheduled merge whenever a status is
posted on its head commit. docs/runbooks/forgejo-merge-window.md is the long
version.

The window gates only what merges unattended: a pull request labelled
`renovate/automerge` (and not `renovate/automerge-hold`). Every other one is
`success` at any hour -- a person merging it is the gate.

Two things keep those unattended merges from being lost:

* One at a time. Turning every pull request green in the same second sent
  Forgejo into all their merges at once; the first moved `main` and the rest
  failed (`PushRejected`, `PushOutOfDate`). So inside the window, after a
  status that leaves a pull request ready to merge, this waits for the merge
  to land before it touches the next one.
* Scheduled again. A merge that fails makes Forgejo drop the pull request's
  "Merge when checks succeed" without a word, and Renovate sets it only when
  it opens the pull request. With MERGE_WINDOW_MERGE_TOKEN set, every gated
  pull request is scheduled again on each run (a 409 means it still is).

Run by .forgejo/workflows/merge-window.yml. Standard library only, so it runs
on the runner image as it is. Configured by environment variables (each one
also a flag, see --help):

  MERGE_WINDOW_SERVER      the forge's base URL; /api/v1 is appended
  MERGE_WINDOW_TOKEN       a token that can write commit statuses
  MERGE_WINDOW_REPOS       owner/name, several separated by spaces or commas
  MERGE_WINDOW_DAYS        the days a window OPENS on: Mon,Wed / Mon-Fri / Sat,Sun
  MERGE_WINDOW_START       HH:MM, local time, inclusive
  MERGE_WINDOW_END         HH:MM, local time, exclusive. At or before START the
                           window runs past midnight; equal to START it lasts 24h
  MERGE_WINDOW_TZ          an IANA zone, e.g. America/New_York
  MERGE_WINDOW_CONTEXT     the status context (default merge-window)
  MERGE_WINDOW_TARGET_URL  the link on the status, normally this workflow run
  MERGE_WINDOW_PULL        one pull request number: bring only that one up to
                           date (needs exactly one repository). Unset: all open
  MERGE_WINDOW_DRY_RUN     true: report what would change and post nothing
  MERGE_WINDOW_MERGE_TOKEN a real account's token with write on the repository,
                           to schedule "Merge when checks succeed" with. Unset:
                           nothing is scheduled. Not the job token: Forgejo
                           stores the scheduler and merges as it later, and the
                           Actions user (-2) cannot push to a protected branch
  MERGE_WINDOW_MERGE_STYLE the style to schedule with (default rebase)
  MERGE_WINDOW_PROTECTION  the branch rule as JSON (its status_check_contexts
                           decide when a pull request is ready). Unset: ready
                           when every status on it is green
  MERGE_WINDOW_MERGE_WAIT  seconds to wait for one merge to land (default 120)

Tests: python3 -m unittest discover -s .forgejo/scripts
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import fnmatch
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable, Iterator
from typing import Any, Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
DEFAULT_CONTEXT = "merge-window"
# The labels the automerge rules in .github/renovate.json5 add. A held update
# can carry both: the hold rule turns automerge off, but `addLabels` only adds,
# so it cannot take back the label an earlier rule gave it.
AUTOMERGE_LABEL = "renovate/automerge"
HOLD_LABEL = "renovate/automerge-hold"
PAGE_SIZE = 50
HTTP_TIMEOUT_SECONDS = 30
DEFAULT_MERGE_STYLE = "rebase"
DEFAULT_MERGE_WAIT_SECONDS = 120
MERGE_POLL_SECONDS = 5
# All the waiting one run may do, so a night of merges that never land still
# finishes inside the job's timeout-minutes (merge-window.yml). Past it the
# rest are posted without waiting, as before.
MERGE_WAIT_BUDGET_SECONDS = 25 * 60


# --- The window --------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class Window:
    """A weekly window in local wall-clock time.

    `days` are the weekdays (Monday = 0) a window opens on. A window that runs
    past midnight belongs to the day it opened: Fri 22:00-02:00 is open in the
    small hours of Saturday, not of Friday.
    """

    days: frozenset[int]
    start: dt.time
    end: dt.time
    tz: str

    @property
    def length(self) -> dt.timedelta:
        start = dt.timedelta(hours=self.start.hour, minutes=self.start.minute)
        end = dt.timedelta(hours=self.end.hour, minutes=self.end.minute)
        if end <= start:
            end += dt.timedelta(days=1)
        return end - start


@dataclasses.dataclass(frozen=True)
class Verdict:
    is_open: bool
    description: str

    @property
    def state(self) -> str:
        return "success" if self.is_open else "pending"


UNGATED = Verdict(True, "Not set to automerge: no merge window")


def is_gated(pull: dict[str, Any]) -> bool:
    """Does the window apply? Only to a pull request that will merge itself."""
    labels = {label.get("name") for label in pull.get("labels") or []}
    return AUTOMERGE_LABEL in labels and HOLD_LABEL not in labels


def parse_days(spec: str) -> frozenset[int]:
    """`Mon,Wed`, `Mon-Fri`, `Fri-Mon` (wraps), `Sat Sun`, or `*` for all."""
    if spec.strip() == "*":
        return frozenset(range(7))
    lookup = {name.lower(): index for index, name in enumerate(DAY_NAMES)}

    def day(token: str) -> int:
        key = token.strip().lower()[:3]
        if key not in lookup:
            raise ValueError(f"unknown day {token!r}; use {', '.join(DAY_NAMES)}")
        return lookup[key]

    days: set[int] = set()
    for part in re.split(r"[\s,]+", spec.strip()):
        if not part:
            continue
        if "-" in part:
            first, last = (day(token) for token in part.split("-", 1))
            span = (last - first) % 7
            days.update((first + offset) % 7 for offset in range(span + 1))
        else:
            days.add(day(part))
    if not days:
        raise ValueError("no days given")
    return frozenset(days)


def parse_time(spec: str) -> dt.time:
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", spec.strip())
    if not match:
        raise ValueError(f"time {spec!r} is not HH:MM")
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        raise ValueError(f"time {spec!r} is out of range")
    return dt.time(hour, minute)


def parse_window(days: str, start: str, end: str, tz: str) -> Window:
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError(
            f"time zone {tz!r} not found (is tzdata installed on this machine?)"
        ) from error
    return Window(parse_days(days), parse_time(start), parse_time(end), tz)


def _label(moment: dt.datetime, window: Window) -> str:
    return f"{DAY_NAMES[moment.weekday()]} {moment:%H:%M} {window.tz}"


def evaluate(now: dt.datetime, window: Window) -> Verdict:
    """Is the window open at `now` (an aware datetime, any zone)?

    Everything is compared as naive local wall-clock time, so "02:00-06:00"
    means what the clock on the wall says, either side of a DST change. On
    the spring-forward day a window starting in the skipped hour opens when
    the clock jumps past it; on the fall-back day the repeated hour is
    inside a window both times round.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    local = now.astimezone(ZoneInfo(window.tz)).replace(tzinfo=None)
    today = local.date()

    # A window lasts at most 24 hours, so only one that opened yesterday or
    # today can still be open.
    for opened_on in (today - dt.timedelta(days=1), today):
        if opened_on.weekday() not in window.days:
            continue
        opens = dt.datetime.combine(opened_on, window.start)
        closes = opens + window.length
        if opens <= local < closes:
            return Verdict(True, f"Merge window open until {_label(closes, window)}")

    for ahead in range(8):
        opens_on = today + dt.timedelta(days=ahead)
        opens = dt.datetime.combine(opens_on, window.start)
        if opens_on.weekday() in window.days and opens > local:
            return Verdict(False, f"Merge window opens {_label(opens, window)}")
    raise AssertionError("a window with at least one day opens within a week")


# --- The forge ---------------------------------------------------------------


class ApiError(RuntimeError):
    def __init__(self, method: str, url: str, status: int | None, detail: str):
        super().__init__(f"{method} {url}: {status or 'no response'} {detail}".strip())
        self.status = status


class Forge(Protocol):
    def open_pulls(self, repo: str) -> Iterable[dict[str, Any]]: ...

    def pull(self, repo: str, number: int) -> dict[str, Any]: ...

    def statuses(self, repo: str, sha: str) -> Iterable[dict[str, Any]]: ...

    def post_status(self, repo: str, sha: str, body: dict[str, str]) -> None: ...

    def schedule_merge(self, repo: str, number: int, style: str) -> bool: ...


class ForgejoApi:
    """The calls this needs from Forgejo's v1 API."""

    def __init__(self, server: str, token: str):
        self.base = server.rstrip("/") + "/api/v1"
        self.token = token

    def _request(
        self, method: str, path: str, query: dict[str, Any] | None = None, body: Any = None
    ) -> tuple[Any, str]:
        url = self.base + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Accept", "application/json")
        request.add_header("Authorization", f"token {self.token}")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                raw = response.read()
                link = response.headers.get("Link", "")
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")[:200]
            raise ApiError(method, url, error.code, detail) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise ApiError(method, url, None, str(error)) from error
        return (json.loads(raw) if raw else None), link

    def _paginate(self, path: str, query: dict[str, Any]) -> Iterator[dict[str, Any]]:
        page = 1
        while True:
            items, link = self._request("GET", path, {**query, "page": page, "limit": PAGE_SIZE})
            items = items or []
            yield from items
            # Follow the Link header when there is one: the server may cap
            # `limit` below what was asked for.
            more = 'rel="next"' in link if link else len(items) == PAGE_SIZE
            if not items or not more:
                return
            page += 1

    @staticmethod
    def _repo_path(repo: str) -> str:
        owner, name = repo.split("/", 1)
        return f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(name)}"

    def open_pulls(self, repo: str) -> Iterator[dict[str, Any]]:
        return self._paginate(f"{self._repo_path(repo)}/pulls", {"state": "open"})

    def pull(self, repo: str, number: int) -> dict[str, Any]:
        pull, _ = self._request("GET", f"{self._repo_path(repo)}/pulls/{number}")
        return pull

    def statuses(self, repo: str, sha: str) -> Iterator[dict[str, Any]]:
        return self._paginate(f"{self._repo_path(repo)}/commits/{sha}/statuses", {})

    def post_status(self, repo: str, sha: str, body: dict[str, str]) -> None:
        self._request("POST", f"{self._repo_path(repo)}/statuses/{sha}", body=body)

    def schedule_merge(self, repo: str, number: int, style: str) -> bool:
        """Set "Merge when checks succeed". True if it was not set before.

        Forgejo always schedules here, even on a pull request that is already
        green -- it does not merge on the spot -- and answers 201. 409 is its
        "already scheduled". Anything else (405: conflicting, closed, no
        permission) is raised.
        """
        try:
            self._request(
                "POST",
                f"{self._repo_path(repo)}/pulls/{number}/merge",
                body={"Do": style, "merge_when_checks_succeed": True},
            )
        except ApiError as error:
            if error.status == 409:
                return False
            raise
        return True


# --- Reconciling -------------------------------------------------------------


def status_state(status: dict[str, Any]) -> str | None:
    """A status's state. Forgejo's statuses list calls it `status`; only the
    combined status says `state`. Reading `state` alone found nothing, so
    every run took each pull request for one without a status."""
    return status.get("status") or status.get("state")


def newest_by_context(statuses: Iterable[dict[str, Any]]) -> dict[str, str | None]:
    """Each context's newest state (highest id wins)."""
    newest: dict[str, dict[str, Any]] = {}
    for status in statuses:
        context = status.get("context") or ""
        if context not in newest or status.get("id", 0) > newest[context].get("id", 0):
            newest[context] = status
    return {context: status_state(status) for context, status in newest.items()}


def latest_state(statuses: Iterable[dict[str, Any]], context: str) -> str | None:
    """The state of the newest status with this context, or None."""
    return newest_by_context(statuses).get(context)


def required_contexts(protection: str) -> list[str]:
    """The status patterns a branch rule (Forgejo's JSON) requires."""
    if not protection.strip():
        return []
    rule = json.loads(protection)
    if not rule.get("enable_status_check"):
        return []
    return [pattern for pattern in rule.get("status_check_contexts") or [] if pattern]


def ready_to_merge(states: dict[str, str | None], required: list[str]) -> bool:
    """Would Forgejo merge with these statuses? As it decides it: each
    required pattern must match a status, and every match must be green.
    With no rule to go by, every status must be green."""
    if not required:
        return bool(states) and all(state == "success" for state in states.values())
    for pattern in required:
        matched = [state for context, state in states.items() if fnmatch.fnmatchcase(context, pattern)]
        if not matched or any(state != "success" for state in matched):
            return False
    return True


@dataclasses.dataclass
class Merging:
    """How a scheduled run hands the open window's merges to Forgejo.

    `scheduler` sets "Merge when checks succeed" (None: leave it to
    Renovate). `wait` > 0 makes the run wait for each merge it sets off
    before the next status, so the merges land one at a time.
    """

    scheduler: Forge | None = None
    style: str = DEFAULT_MERGE_STYLE
    required: list[str] = dataclasses.field(default_factory=list)
    wait: float = 0
    budget: float = MERGE_WAIT_BUDGET_SECONDS
    poll: float = MERGE_POLL_SECONDS
    sleep: Callable[[float], None] = time.sleep
    clock: Callable[[], float] = time.monotonic


def wait_for_merge(forge: Forge, repo: str, number: int, merging: Merging, prefix: str, log: Any) -> None:
    deadline = merging.clock() + min(merging.wait, merging.budget)
    started = merging.clock()
    try:
        while True:
            merging.sleep(merging.poll)
            pull = forge.pull(repo, number)
            if pull.get("merged"):
                log(f"{prefix} merged")
                return
            if pull.get("state", "open") != "open":
                log(f"{prefix} closed without merging")
                return
            if merging.clock() >= deadline:
                # Forgejo said nothing: checks it waits for that this did not
                # see, or a merge that failed and unscheduled itself. The
                # next run schedules it again.
                log(f"{prefix} not merged after {merging.clock() - started:.0f}s, moving on")
                return
    finally:
        merging.budget -= merging.clock() - started


def reconcile_repo(
    forge: Forge,
    repo: str,
    verdict: Verdict,
    context: str,
    target_url: str,
    dry_run: bool,
    log: Any = print,
    only: int | None = None,
    merging: Merging | None = None,
) -> int:
    """Bring every open, non-draft pull request to `verdict`, or to `UNGATED`
    if it is not set to automerge. Returns failures.

    `only` narrows that to one pull request, as a `pull_request` run does: it
    has one new head commit to label, not the whole list to re-read.

    `merging`, for the scheduled runs: schedule each gated pull request's
    merge again, and inside the window let one merge land before the next.
    """
    merging = merging or Merging()
    failures = 0
    pulls = [forge.pull(repo, only)] if only is not None else forge.open_pulls(repo)
    for pull in pulls:
        number = pull.get("number")
        sha = (pull.get("head") or {}).get("sha", "")
        prefix = f"{repo}#{number} {sha[:7]}"
        if pull.get("state", "open") != "open":
            log(f"{prefix} {pull.get('state')}, skipped")
            continue
        if pull.get("draft"):
            log(f"{prefix} draft, skipped")
            continue
        gated = is_gated(pull)
        wanted = verdict if gated else UNGATED
        desired = wanted.state
        try:
            # Scheduled first, so the status below is what sets it off.
            newly_scheduled = False
            if gated and merging.scheduler is not None:
                if dry_run:
                    log(f"{prefix} would schedule its merge (dry run)")
                else:
                    try:
                        newly_scheduled = merging.scheduler.schedule_merge(repo, number, merging.style)
                    except ApiError as error:
                        # Conflicting, or otherwise not mergeable: Renovate's
                        # to sort out, not a failure of this run.
                        log(f"{prefix} cannot schedule its merge: {error}")
                    else:
                        if newly_scheduled:
                            log(f"{prefix} merge scheduled again")

            states = newest_by_context(forge.statuses(repo, sha))
            current = states.get(context)
            # Scheduling sets nothing off by itself; Forgejo looks again only
            # when a status lands. So a pull request already green gets its
            # status again.
            repost = newly_scheduled and verdict.is_open and current == desired
            if current == desired and not repost:
                log(f"{prefix} {desired} unchanged")
                continue
            if not dry_run:
                forge.post_status(
                    repo,
                    sha,
                    {
                        "context": context,
                        "state": desired,
                        "description": wanted.description,
                        "target_url": target_url,
                    },
                )
            log(f"{prefix} {current or 'none'} -> {desired}{' (dry run)' if dry_run else ''}")
            states[context] = desired
            if (
                gated
                and verdict.is_open
                and not dry_run
                and merging.wait > 0
                and merging.budget > 0
                and ready_to_merge(states, merging.required)
            ):
                wait_for_merge(forge, repo, number, merging, prefix, log)
        except ApiError as error:
            failures += 1
            hint = ""
            if error.status in (401, 403):
                hint = " (this token cannot write statuses here; set MERGE_WINDOW_TOKEN)"
            log(f"{prefix} FAILED: {error}{hint}")
    return failures


def parse_repos(spec: str) -> list[str]:
    repos = [repo for repo in re.split(r"[\s,]+", spec.strip()) if repo]
    for repo in repos:
        if not re.fullmatch(r"[^/\s]+/[^/\s]+", repo):
            raise ValueError(f"repository {repo!r} is not owner/name")
    return repos


def parse_pull(spec: str) -> int | None:
    if not spec.strip():
        return None
    if not spec.strip().isdigit():
        raise ValueError(f"pull request {spec!r} is not a number")
    return int(spec)


def main(argv: list[str] | None = None) -> int:
    env = os.environ.get
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--server", default=env("MERGE_WINDOW_SERVER", ""))
    parser.add_argument("--repos", default=env("MERGE_WINDOW_REPOS", ""))
    parser.add_argument("--days", default=env("MERGE_WINDOW_DAYS", "Mon-Sun"))
    parser.add_argument("--start", default=env("MERGE_WINDOW_START", "00:00"))
    parser.add_argument("--end", default=env("MERGE_WINDOW_END", "08:00"))
    parser.add_argument("--tz", default=env("MERGE_WINDOW_TZ", "America/New_York"))
    parser.add_argument("--context", default=env("MERGE_WINDOW_CONTEXT") or DEFAULT_CONTEXT)
    parser.add_argument("--target-url", default=env("MERGE_WINDOW_TARGET_URL", ""))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=env("MERGE_WINDOW_DRY_RUN", "").lower() == "true",
    )
    parser.add_argument("--pull", default=env("MERGE_WINDOW_PULL", ""), help="one pull request number")
    parser.add_argument("--now", help="ISO 8601 instant to evaluate instead of the clock")
    parser.add_argument("--merge-style", default=env("MERGE_WINDOW_MERGE_STYLE") or DEFAULT_MERGE_STYLE)
    parser.add_argument(
        "--merge-wait",
        type=float,
        default=float(env("MERGE_WINDOW_MERGE_WAIT") or DEFAULT_MERGE_WAIT_SECONDS),
        help="seconds to wait for each merge to land; 0 to not wait",
    )
    args = parser.parse_args(argv)

    try:
        window = parse_window(args.days, args.start, args.end, args.tz)
        repos = parse_repos(args.repos)
        only = parse_pull(args.pull)
        if only is not None and len(repos) != 1:
            raise ValueError("a single pull request needs exactly one repository")
        now = dt.datetime.fromisoformat(args.now) if args.now else dt.datetime.now(dt.timezone.utc)
        if now.tzinfo is None:
            raise ValueError("--now needs an offset, e.g. 2026-10-17T02:00:00-04:00")
        required = required_contexts(env("MERGE_WINDOW_PROTECTION", ""))
    except ValueError as error:
        print(f"merge-window: {error}", file=sys.stderr)
        return 2
    token = env("MERGE_WINDOW_TOKEN", "")
    if not args.server or not repos or not token:
        print(
            "merge-window: MERGE_WINDOW_SERVER, MERGE_WINDOW_REPOS and MERGE_WINDOW_TOKEN are required",
            file=sys.stderr,
        )
        return 2

    verdict = evaluate(now, window)
    print(f"{verdict.state}: {verdict.description}")
    forge = ForgejoApi(args.server, token)
    merge_token = env("MERGE_WINDOW_MERGE_TOKEN", "")
    merging = Merging(
        scheduler=ForgejoApi(args.server, merge_token) if merge_token else None,
        style=args.merge_style,
        required=required,
        # One pull request's run has no next one to keep apart from.
        wait=args.merge_wait if only is None else 0,
    )
    failures = 0
    for repo in repos:
        try:
            failures += reconcile_repo(
                forge, repo, verdict, args.context, args.target_url, args.dry_run, only=only, merging=merging
            )
        except ApiError as error:
            # Reading the pull requests failed: nothing in this repository was touched.
            failures += 1
            print(f"{repo} FAILED: {error}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
