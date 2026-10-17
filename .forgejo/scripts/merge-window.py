#!/usr/bin/env python3
"""Post a `merge-window` commit status on every open pull request.

The status is `success` while the configured window is open and `pending`
while it is closed. With `merge-window` required by branch protection, a pull
request set to "Merge when checks succeed" waits for the window and then
merges by itself: Forgejo re-checks a scheduled merge whenever a status is
posted on its head commit. docs/runbooks/forgejo-merge-window.md is the long
version.

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

Tests: python3 -m unittest discover -s .forgejo/scripts
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterable, Iterator
from typing import Any, Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
DEFAULT_CONTEXT = "merge-window"
PAGE_SIZE = 50
HTTP_TIMEOUT_SECONDS = 30


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


class ForgejoApi:
    """The three calls this needs from Forgejo's v1 API."""

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


# --- Reconciling -------------------------------------------------------------


def latest_state(statuses: Iterable[dict[str, Any]], context: str) -> str | None:
    """The state of the newest status with this context, or None."""
    ours = [status for status in statuses if status.get("context") == context]
    if not ours:
        return None
    return max(ours, key=lambda status: status.get("id", 0)).get("state")


def reconcile_repo(
    forge: Forge,
    repo: str,
    verdict: Verdict,
    context: str,
    target_url: str,
    dry_run: bool,
    log: Any = print,
    only: int | None = None,
) -> int:
    """Bring every open, non-draft pull request to `verdict`. Returns failures.

    `only` narrows that to one pull request, as a `pull_request` run does: it
    has one new head commit to label, not the whole list to re-read.
    """
    failures = 0
    desired = verdict.state
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
        try:
            current = latest_state(forge.statuses(repo, sha), context)
            if current == desired:
                log(f"{prefix} {desired} unchanged")
                continue
            if not dry_run:
                forge.post_status(
                    repo,
                    sha,
                    {
                        "context": context,
                        "state": desired,
                        "description": verdict.description,
                        "target_url": target_url,
                    },
                )
            log(f"{prefix} {current or 'none'} -> {desired}{' (dry run)' if dry_run else ''}")
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
    parser.add_argument("--end", default=env("MERGE_WINDOW_END", "07:00"))
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
    failures = 0
    for repo in repos:
        try:
            failures += reconcile_repo(
                forge, repo, verdict, args.context, args.target_url, args.dry_run, only=only
            )
        except ApiError as error:
            # Reading the pull requests failed: nothing in this repository was touched.
            failures += 1
            print(f"{repo} FAILED: {error}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
