#!/usr/bin/env python3
"""Compare the target's row counts against the source's, table by table.

THE CHECK THAT MATTERS. It is the only one that caught either of the 2026-09-16
defects: pgloader had reported `2` in its error column while two tables sat
empty, and everything else -- the pod being Ready, the UI loading, `GET /Items`
answering -- passed anyway. A per-table comparison against counts taken BEFORE
the load is the thing that does not.

Inputs:
  /work/source-counts.json   written by render.py before anything was loaded
  /work/target-counts.tsv    table<TAB>count, dumped from the target after it

KeyframeData gets a second check. A bigint[] column that loaded as a
present-but-empty array passes a row count and loses every tick value, which is
one of the two ways §3.3 of the runbook describes losing that table.
"""
import json
import pathlib
import sys

WORK = pathlib.Path("/work")
SOURCE = WORK / "source-counts.json"
TARGET = WORK / "target-counts.tsv"

if not SOURCE.exists() or not TARGET.exists():
    sys.exit(f"FAIL: need both {SOURCE} and {TARGET}")

source = json.loads(SOURCE.read_text())
target = {}
for line in TARGET.read_text().splitlines():
    if "\t" not in line:
        continue
    name, _, count = line.partition("\t")
    name, count = name.strip(), count.strip()
    if count.lstrip("-").isdigit():
        target[name] = int(count)

mismatches = []
print(f"{'table':34} {'source':>10} {'target':>10}")
print("-" * 58)
for table, want in sorted(source.items()):
    if want is None:
        print(f"{table:34} {'n/a':>10} {'-':>10}  (not in the source)")
        continue
    got = target.get(table)
    if got is None:
        print(f"{table:34} {want:>10} {'MISSING':>10}  <-- not in the target")
        mismatches.append(table)
    elif got != want:
        print(f"{table:34} {want:>10} {got:>10}  <-- MISMATCH ({got - want:+d})")
        mismatches.append(table)
    else:
        print(f"{table:34} {want:>10} {got:>10}")

ticks = target.get("__KeyframeTicks__")
if ticks is not None:
    print(f"\nKeyframeData tick values in the target: {ticks}")
    if target.get("KeyframeData", 0) > 0 and ticks == 0:
        print("  <-- every KeyframeData row loaded with an EMPTY array. preclean.py's")
        print("      ARRAY conversion did not take. See runbook §3.3.")
        mismatches.append("KeyframeData.KeyframeTicks")

print()
if mismatches:
    sys.exit(f"verify: FAILED -- {len(mismatches)} table(s) differ: {', '.join(mismatches)}")
print(f"verify: OK -- {len([v for v in source.values() if v is not None])} tables match exactly")
