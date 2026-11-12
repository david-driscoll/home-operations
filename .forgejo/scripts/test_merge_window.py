"""Offline tests for merge-window.py.

python3 -m unittest discover -s .forgejo/scripts

Instants are written in UTC on purpose: what is under test is the conversion
to local wall-clock time, DST included, so the input must not already be it.
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import pathlib
import sys
import unittest

_SPEC = importlib.util.spec_from_file_location(
    "merge_window", pathlib.Path(__file__).with_name("merge-window.py")
)
assert _SPEC and _SPEC.loader
mw = importlib.util.module_from_spec(_SPEC)
# Registered first: dataclasses resolves annotations through sys.modules.
sys.modules[_SPEC.name] = mw
_SPEC.loader.exec_module(mw)

NEW_YORK = "America/New_York"


def utc(text: str) -> dt.datetime:
    return dt.datetime.fromisoformat(text).replace(tzinfo=dt.timezone.utc)


def window(days: str, start: str, end: str, tz: str = NEW_YORK):
    return mw.parse_window(days, start, end, tz)


AUTOMERGE = [{"name": "renovate/automerge"}]


def pr(number: int, sha: str, labels=AUTOMERGE, **extra):
    """An open pull request, set to automerge unless `labels` says otherwise."""
    return {"number": number, "head": {"sha": sha * 40}, "labels": labels, **extra}


class InsideOutside(unittest.TestCase):
    # The default: every night, 00:00-07:00 New York (EDT, UTC-4, in October).
    nightly = window("Mon-Sun", "00:00", "07:00")

    def test_inside(self):
        verdict = mw.evaluate(utc("2026-10-16T05:00"), self.nightly)  # Fri 01:00
        self.assertTrue(verdict.is_open)
        self.assertEqual(verdict.state, "success")
        self.assertEqual(verdict.description, f"Merge window open until Fri 07:00 {NEW_YORK}")

    def test_outside(self):
        verdict = mw.evaluate(utc("2026-10-16T12:00"), self.nightly)  # Fri 08:00
        self.assertFalse(verdict.is_open)
        self.assertEqual(verdict.state, "pending")
        self.assertEqual(verdict.description, f"Merge window opens Sat 00:00 {NEW_YORK}")

    def test_weekend_only_waits_through_the_week(self):
        weekend = window("Sat,Sun", "02:00", "06:00")
        verdict = mw.evaluate(utc("2026-10-19T14:00"), weekend)  # Mon 10:00
        self.assertFalse(verdict.is_open)
        self.assertEqual(verdict.description, f"Merge window opens Sat 02:00 {NEW_YORK}")
        self.assertTrue(mw.evaluate(utc("2026-10-18T09:59"), weekend).is_open)  # Sun 05:59


class CrossingMidnight(unittest.TestCase):
    # Opens Friday 22:00, closes Saturday 02:00.
    friday_night = window("Fri", "22:00", "02:00")

    def test_open_after_midnight_on_the_next_day(self):
        verdict = mw.evaluate(utc("2026-10-17T05:00"), self.friday_night)  # Sat 01:00
        self.assertTrue(verdict.is_open)
        self.assertEqual(verdict.description, f"Merge window open until Sat 02:00 {NEW_YORK}")

    def test_open_before_midnight(self):
        self.assertTrue(mw.evaluate(utc("2026-10-17T03:59"), self.friday_night).is_open)  # Fri 23:59

    def test_closed_either_side(self):
        self.assertFalse(mw.evaluate(utc("2026-10-17T01:59"), self.friday_night).is_open)  # Fri 21:59
        self.assertFalse(mw.evaluate(utc("2026-10-17T06:00"), self.friday_night).is_open)  # Sat 02:00

    def test_belongs_to_the_day_it_opened(self):
        # 23:00 on a Saturday is not inside: only Friday opens a window.
        verdict = mw.evaluate(utc("2026-10-18T03:00"), self.friday_night)  # Sat 23:00
        self.assertFalse(verdict.is_open)
        self.assertEqual(verdict.description, f"Merge window opens Fri 22:00 {NEW_YORK}")

    def test_equal_start_and_end_is_a_whole_day(self):
        monday = window("Mon", "09:00", "09:00")
        self.assertTrue(mw.evaluate(utc("2026-10-19T13:00"), monday).is_open)  # Mon 09:00
        self.assertTrue(mw.evaluate(utc("2026-10-20T12:59"), monday).is_open)  # Tue 08:59
        self.assertFalse(mw.evaluate(utc("2026-10-20T13:00"), monday).is_open)  # Tue 09:00


class DayBoundary(unittest.TestCase):
    # Sunday 20:00 to midnight: the end is 00:00 on Monday.
    sunday_evening = window("Sun", "20:00", "00:00")

    def test_start_is_inclusive(self):
        self.assertTrue(mw.evaluate(utc("2026-10-19T00:00"), self.sunday_evening).is_open)  # Sun 20:00

    def test_last_minute_of_sunday_is_inside(self):
        verdict = mw.evaluate(utc("2026-10-19T03:59"), self.sunday_evening)  # Sun 23:59
        self.assertTrue(verdict.is_open)
        self.assertEqual(verdict.description, f"Merge window open until Mon 00:00 {NEW_YORK}")

    def test_end_is_exclusive(self):
        verdict = mw.evaluate(utc("2026-10-19T04:00"), self.sunday_evening)  # Mon 00:00
        self.assertFalse(verdict.is_open)
        self.assertEqual(verdict.description, f"Merge window opens Sun 20:00 {NEW_YORK}")

    def test_later_today_opens_today(self):
        verdict = mw.evaluate(utc("2026-10-18T23:00"), self.sunday_evening)  # Sun 19:00
        self.assertEqual(verdict.description, f"Merge window opens Sun 20:00 {NEW_YORK}")


class DaylightSaving(unittest.TestCase):
    def test_spring_forward(self):
        # 2026-03-08: 02:00 EST jumps to 03:00 EDT, at 07:00 UTC.
        sunday = window("Sun", "02:00", "06:00")
        self.assertFalse(mw.evaluate(utc("2026-03-08T06:59"), sunday).is_open)  # 01:59 EST
        self.assertTrue(mw.evaluate(utc("2026-03-08T07:00"), sunday).is_open)  # 03:00 EDT
        self.assertTrue(mw.evaluate(utc("2026-03-08T09:59"), sunday).is_open)  # 05:59 EDT
        # 06:00 EDT. A fixed EST offset would read 05:00 and call it open.
        self.assertFalse(mw.evaluate(utc("2026-03-08T10:00"), sunday).is_open)

    def test_fall_back(self):
        # 2026-11-01: 02:00 EDT falls back to 01:00 EST, at 06:00 UTC.
        nightly = window("Mon-Sun", "00:00", "07:00")
        self.assertTrue(mw.evaluate(utc("2026-11-01T05:30"), nightly).is_open)  # 01:30 EDT
        self.assertTrue(mw.evaluate(utc("2026-11-01T06:30"), nightly).is_open)  # 01:30 EST
        # 06:30 EST. A fixed EDT offset would read 07:30 and call it closed.
        self.assertTrue(mw.evaluate(utc("2026-11-01T11:30"), nightly).is_open)
        verdict = mw.evaluate(utc("2026-11-01T12:00"), nightly)  # 07:00 EST
        self.assertFalse(verdict.is_open)
        self.assertEqual(verdict.description, f"Merge window opens Mon 00:00 {NEW_YORK}")

    def test_other_zone(self):
        london = window("Sat", "02:00", "06:00", "Europe/London")
        self.assertTrue(mw.evaluate(utc("2026-10-17T02:00"), london).is_open)  # 03:00 BST
        self.assertFalse(mw.evaluate(utc("2026-10-17T05:00"), london).is_open)  # 06:00 BST


class Parsing(unittest.TestCase):
    def test_days(self):
        self.assertEqual(mw.parse_days("Mon-Fri"), frozenset(range(5)))
        self.assertEqual(mw.parse_days("Fri-Mon"), frozenset({4, 5, 6, 0}))
        self.assertEqual(mw.parse_days("sat, SUNDAY"), frozenset({5, 6}))
        self.assertEqual(mw.parse_days("*"), frozenset(range(7)))
        self.assertEqual(mw.parse_days("Mon-Sun"), frozenset(range(7)))

    def test_bad_input(self):
        for bad in ("", "Funday", "Mon-Xyz"):
            with self.assertRaises(ValueError, msg=bad):
                mw.parse_days(bad)
        for bad in ("24:00", "7", "07:60", "seven"):
            with self.assertRaises(ValueError, msg=bad):
                mw.parse_time(bad)
        with self.assertRaises(ValueError):
            window("Mon", "00:00", "01:00", "Mars/Olympus_Mons")
        with self.assertRaises(ValueError):
            mw.parse_repos("not-a-repo")

    def test_repos(self):
        self.assertEqual(mw.parse_repos("a/b, c/d\ne/f"), ["a/b", "c/d", "e/f"])

    def test_naive_now_is_refused(self):
        with self.assertRaises(ValueError):
            mw.evaluate(dt.datetime(2026, 10, 16, 1), window("Mon", "00:00", "01:00"))


class FakeForge:
    def __init__(self, pulls, statuses):
        self.pulls = pulls
        self._statuses = statuses
        self.posted = []

    def open_pulls(self, repo):
        return [pull for pull in self.pulls if pull.get("state", "open") == "open"]

    def pull(self, repo, number):
        return next(pull for pull in self.pulls if pull["number"] == number)

    def statuses(self, repo, sha):
        return self._statuses.get(sha, [])

    def post_status(self, repo, sha, body):
        self.posted.append((sha, body))


class Reconcile(unittest.TestCase):
    open_verdict = mw.Verdict(True, "Merge window open until Fri 07:00 America/New_York")
    closed_verdict = mw.Verdict(False, "Merge window opens Sat 00:00 America/New_York")

    def run_once(self, forge, dry_run=False, only=None, verdict=None):
        lines = []
        failures = mw.reconcile_repo(
            forge,
            "o/r",
            verdict or self.open_verdict,
            "merge-window",
            "https://forge/run/1",
            dry_run,
            lines.append,
            only=only,
        )
        return failures, lines

    def test_only_automerge_waits_for_the_window(self):
        forge = FakeForge(
            pulls=[
                pr(1, "a"),
                pr(2, "b", labels=[]),
                pr(3, "c", labels=None),
                # Held: both labels, and Renovate will not merge it.
                pr(4, "d", labels=AUTOMERGE + [{"name": "renovate/automerge-hold"}]),
                pr(5, "e", labels=[{"name": "renovate/automerge-hold"}, {"name": "dependencies"}]),
            ],
            statuses={"b" * 40: [{"id": 1, "context": "merge-window", "state": "pending"}]},
        )
        _, lines = self.run_once(forge, verdict=self.closed_verdict)
        self.assertEqual(
            [(sha[0], body["state"], body["description"]) for sha, body in forge.posted],
            [
                ("a", "pending", self.closed_verdict.description),
                ("b", "success", mw.UNGATED.description),
                ("c", "success", mw.UNGATED.description),
                ("d", "success", mw.UNGATED.description),
                ("e", "success", mw.UNGATED.description),
            ],
        )
        self.assertEqual(lines[1], "o/r#2 bbbbbbb pending -> success")

    def test_losing_the_label_ends_the_wait(self):
        # Pending from when it was set to automerge; the label is gone now.
        forge = FakeForge(
            pulls=[pr(1, "a", labels=[])],
            statuses={"a" * 40: [{"id": 1, "context": "merge-window", "state": "pending"}]},
        )
        self.run_once(forge, only=1, verdict=self.closed_verdict)
        self.assertEqual([body["state"] for _, body in forge.posted], ["success"])

    def test_posts_only_what_changed(self):
        forge = FakeForge(
            pulls=[pr(1, "a"), pr(2, "b"), pr(3, "c"), pr(4, "d", draft=True)],
            statuses={
                # Newest (highest id) wins, and other contexts are ignored.
                "a" * 40: [
                    {"id": 1, "context": "merge-window", "state": "success"},
                    {"id": 2, "context": "merge-window", "state": "pending"},
                    {"id": 3, "context": "flate", "state": "success"},
                ],
                "b" * 40: [{"id": 4, "context": "merge-window", "state": "success"}],
            },
        )
        failures, lines = self.run_once(forge)
        self.assertEqual(failures, 0)
        self.assertEqual([sha for sha, _ in forge.posted], ["a" * 40, "c" * 40])
        self.assertEqual(
            forge.posted[0][1],
            {
                "context": "merge-window",
                "state": "success",
                "description": self.open_verdict.description,
                "target_url": "https://forge/run/1",
            },
        )
        self.assertEqual(
            lines,
            [
                "o/r#1 aaaaaaa pending -> success",
                "o/r#2 bbbbbbb success unchanged",
                "o/r#3 ccccccc none -> success",
                "o/r#4 ddddddd draft, skipped",
            ],
        )

    def test_dry_run_posts_nothing(self):
        forge = FakeForge(pulls=[pr(1, "a")], statuses={})
        _, lines = self.run_once(forge, dry_run=True)
        self.assertEqual(forge.posted, [])
        self.assertEqual(lines, ["o/r#1 aaaaaaa none -> success (dry run)"])

    def test_one_pull_request_only(self):
        forge = FakeForge(
            pulls=[pr(1, "a"), pr(2, "b")],
            statuses={},
        )
        _, lines = self.run_once(forge, only=2)
        self.assertEqual([sha for sha, _ in forge.posted], ["b" * 40])
        self.assertEqual(lines, ["o/r#2 bbbbbbb none -> success"])

    def test_one_pull_request_that_has_closed(self):
        # A run queued behind a merge can find its pull request already closed.
        forge = FakeForge(pulls=[pr(1, "a", state="closed")], statuses={})
        _, lines = self.run_once(forge, only=1)
        self.assertEqual(forge.posted, [])
        self.assertEqual(lines, ["o/r#1 aaaaaaa closed, skipped"])

    def test_parse_pull(self):
        self.assertIsNone(mw.parse_pull(""))
        self.assertEqual(mw.parse_pull("42"), 42)
        with self.assertRaises(ValueError):
            mw.parse_pull("#42")

    def test_one_pull_request_needs_one_repository(self):
        self.assertEqual(mw.main(["--repos", "a/b c/d", "--pull", "1"]), 2)

    def test_a_failure_does_not_stop_the_rest(self):
        class Refusing(FakeForge):
            def post_status(self, repo, sha, body):
                if sha.startswith("a"):
                    raise mw.ApiError("POST", "u", 403, "forbidden")
                super().post_status(repo, sha, body)

        forge = Refusing(
            pulls=[pr(1, "a"), pr(2, "b")],
            statuses={},
        )
        failures, lines = self.run_once(forge)
        self.assertEqual(failures, 1)
        self.assertEqual([sha for sha, _ in forge.posted], ["b" * 40])
        self.assertIn("set MERGE_WINDOW_TOKEN", lines[0])


    def test_reads_forgejos_status_field(self):
        # Forgejo's statuses list says `status`, not `state`. Read wrongly,
        # every pull request looked like one without a status and was posted
        # again on every run.
        forge = FakeForge(
            pulls=[pr(1, "a")],
            statuses={"a" * 40: [{"id": 7, "context": "merge-window", "status": "success"}]},
        )
        _, lines = self.run_once(forge)
        self.assertEqual(forge.posted, [])
        self.assertEqual(lines, ["o/r#1 aaaaaaa success unchanged"])


PROTECTION = (
    '{"enable_status_check": true,'
    ' "status_check_contexts": ["merge-window", "flate*", "renovate/stability-days"]}'
)
GREEN = [
    {"id": 1, "context": "flate / Test and Diff (pull_request)", "status": "success"},
    {"id": 2, "context": "flate / ESO Values Lint (pull_request)", "status": "success"},
    {"id": 3, "context": "renovate/stability-days", "status": "success"},
]


class MergingForge(FakeForge):
    """Schedules merges, and merges a scheduled pull request a little after a
    status lands on it -- the way Forgejo does, in the background."""

    def __init__(self, pulls, statuses, scheduled=(), refuse=()):
        super().__init__(pulls, statuses)
        self.scheduled = set(scheduled)
        self.refuse = set(refuse)
        self.events = []

    def schedule_merge(self, repo, number, style):
        if number in self.refuse:
            raise mw.ApiError("POST", "u", 405, "PR not in mergeable state")
        self.events.append(("schedule", number, style))
        if number in self.scheduled:
            return False
        self.scheduled.add(number)
        return True

    def post_status(self, repo, sha, body):
        super().post_status(repo, sha, body)
        self.events.append(("status", sha[0], body["state"]))
        pull = next(pull for pull in self.pulls if pull["head"]["sha"] == sha)
        others = mw.newest_by_context(self._statuses.get(sha, []))
        others[body["context"]] = body["state"]
        if pull["number"] in self.scheduled and mw.ready_to_merge(
            others, mw.required_contexts(PROTECTION)
        ):
            pull["_merges_after_polls"] = 1

    def pull(self, repo, number):
        pull = super().pull(repo, number)
        if pull.get("_merges_after_polls") is not None:
            if pull["_merges_after_polls"] <= 0:
                pull["merged"] = True
                self.events.append(("merged", number))
            pull["_merges_after_polls"] -= 1
        return pull


class Merges(unittest.TestCase):
    open_verdict = Reconcile.open_verdict
    closed_verdict = Reconcile.closed_verdict

    def merging(self, forge, **kwargs):
        clock = {"now": 0.0}

        def sleep(seconds):
            clock["now"] += seconds

        options = {
            "scheduler": forge,
            "required": mw.required_contexts(PROTECTION),
            "wait": 120,
            "sleep": sleep,
            "clock": lambda: clock["now"],
        }
        options.update(kwargs)
        return mw.Merging(**options), clock

    def run_once(self, forge, merging, verdict=None, dry_run=False):
        lines = []
        failures = mw.reconcile_repo(
            forge, "o/r", verdict or self.open_verdict, "merge-window", "u", dry_run, lines.append,
            merging=merging,
        )
        return failures, lines

    def test_merges_land_one_at_a_time(self):
        forge = MergingForge(
            pulls=[pr(1, "a"), pr(2, "b")],
            statuses={"a" * 40: list(GREEN), "b" * 40: list(GREEN)},
            scheduled={1, 2},
        )
        merging, _ = self.merging(forge)
        failures, lines = self.run_once(forge, merging)
        self.assertEqual(failures, 0)
        # b's status waits until a has merged.
        self.assertEqual(
            [event for event in forge.events if event[0] != "schedule"],
            [("status", "a", "success"), ("merged", 1), ("status", "b", "success"), ("merged", 2)],
        )
        self.assertIn("o/r#1 aaaaaaa merged", lines)

    def test_a_dropped_schedule_is_set_again(self):
        # Green, inside the window, status already success -- but a failed
        # merge left it unscheduled. Scheduling alone sets nothing off, so the
        # status goes up again.
        forge = MergingForge(
            pulls=[pr(1, "a")],
            statuses={"a" * 40: GREEN + [{"id": 9, "context": "merge-window", "status": "success"}]},
        )
        merging, _ = self.merging(forge)
        _, lines = self.run_once(forge, merging)
        self.assertEqual(forge.events[0], ("schedule", 1, "rebase"))
        self.assertEqual(
            lines,
            [
                "o/r#1 aaaaaaa merge scheduled again",
                "o/r#1 aaaaaaa success -> success",
                "o/r#1 aaaaaaa merged",
            ],
        )

    def test_already_scheduled_and_unchanged_is_left_alone(self):
        forge = MergingForge(
            pulls=[pr(1, "a")],
            statuses={"a" * 40: GREEN + [{"id": 9, "context": "merge-window", "status": "success"}]},
            scheduled={1},
        )
        merging, _ = self.merging(forge)
        _, lines = self.run_once(forge, merging)
        self.assertEqual(forge.posted, [])
        self.assertEqual(lines, ["o/r#1 aaaaaaa success unchanged"])

    def test_scheduled_outside_the_window_but_not_waited_for(self):
        forge = MergingForge(pulls=[pr(1, "a")], statuses={"a" * 40: list(GREEN)})
        merging, clock = self.merging(forge)
        _, lines = self.run_once(forge, merging, verdict=self.closed_verdict)
        self.assertEqual(forge.scheduled, {1})
        self.assertEqual(lines, ["o/r#1 aaaaaaa merge scheduled again", "o/r#1 aaaaaaa none -> pending"])
        self.assertEqual(clock["now"], 0)

    def test_only_gated_pull_requests_are_scheduled(self):
        forge = MergingForge(pulls=[pr(1, "a", labels=[])], statuses={"a" * 40: list(GREEN)})
        merging, _ = self.merging(forge)
        self.run_once(forge, merging)
        self.assertEqual(forge.scheduled, set())

    def test_no_wait_for_one_that_is_not_ready(self):
        pending_flate = [dict(GREEN[0], status="pending")] + GREEN[1:]
        forge = MergingForge(pulls=[pr(1, "a")], statuses={"a" * 40: pending_flate}, scheduled={1})
        merging, clock = self.merging(forge)
        _, lines = self.run_once(forge, merging)
        self.assertEqual(lines, ["o/r#1 aaaaaaa none -> success"])
        self.assertEqual(clock["now"], 0)

    def test_a_missing_required_status_is_not_ready(self):
        # #910: no flate status at all. Forgejo counts that as pending.
        self.assertFalse(
            mw.ready_to_merge(
                {"merge-window": "success", "renovate/stability-days": "success"},
                mw.required_contexts(PROTECTION),
            )
        )
        # A check the rule does not require does not hold it.
        self.assertTrue(
            mw.ready_to_merge(
                {**mw.newest_by_context(GREEN), "merge-window": "success", "Image Check": "failure"},
                mw.required_contexts(PROTECTION),
            )
        )

    def test_without_a_rule_every_status_must_be_green(self):
        self.assertEqual(mw.required_contexts(""), [])
        self.assertTrue(mw.ready_to_merge({"a": "success", "b": "success"}, []))
        self.assertFalse(mw.ready_to_merge({"a": "success", "b": "failure"}, []))

    def test_a_merge_that_never_lands_is_given_up_on(self):
        forge = MergingForge(pulls=[pr(1, "a"), pr(2, "b")], statuses={"a" * 40: list(GREEN), "b" * 40: list(GREEN)})
        forge.schedule_merge = lambda repo, number, style: False  # "scheduled", but nothing merges
        merging, clock = self.merging(forge, wait=30)
        failures, lines = self.run_once(forge, merging)
        self.assertEqual(failures, 0)
        self.assertIn("o/r#1 aaaaaaa not merged after 30s, moving on", lines)
        self.assertEqual(clock["now"], 60)

    def test_the_budget_caps_all_waiting(self):
        pulls = [pr(number, chr(ord("a") + number)) for number in range(4)]
        forge = MergingForge(pulls=pulls, statuses={pull["head"]["sha"]: list(GREEN) for pull in pulls})
        forge.schedule_merge = lambda repo, number, style: False
        merging, clock = self.merging(forge, wait=30, budget=45)
        self.run_once(forge, merging)
        self.assertEqual(len(forge.posted), 4)
        self.assertEqual(clock["now"], 45)

    def test_cannot_schedule_is_not_a_failure(self):
        forge = MergingForge(pulls=[pr(1, "a")], statuses={}, refuse={1})
        merging, _ = self.merging(forge)
        failures, lines = self.run_once(forge, merging, verdict=self.closed_verdict)
        self.assertEqual(failures, 0)
        self.assertTrue(lines[0].startswith("o/r#1 aaaaaaa cannot schedule its merge: "))

    def test_dry_run_schedules_nothing(self):
        forge = MergingForge(pulls=[pr(1, "a")], statuses={"a" * 40: list(GREEN)})
        merging, _ = self.merging(forge)
        _, lines = self.run_once(forge, merging, dry_run=True)
        self.assertEqual((forge.scheduled, forge.posted), (set(), []))
        self.assertEqual(lines[0], "o/r#1 aaaaaaa would schedule its merge (dry run)")

    def test_a_bad_rule_is_refused(self):
        with self.assertRaises(ValueError):
            mw.required_contexts("{not json")


if __name__ == "__main__":
    unittest.main()
