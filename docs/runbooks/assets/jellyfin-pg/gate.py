#!/usr/bin/env python3
"""Refuse the load if production's schema is AHEAD of the PostgreSQL target's.

THE CHECK THIS RE-RUN EXISTS FOR. On 2026-09-16 both servers were Jellyfin 12.0
and the question did not arise. On 2026-09-21 they are not:

    jellyfin      12.1.0   ghcr.io/jellyfin/jellyfin:12.1
    jellyfin-pg   12.0.0   git.nicholstech.org/.../jellyfin.pgsql:12.0-nichols.68

Both numbers read off /System/Info/Public on the live servers. A 12.1 SQLite
database carries every EF migration 12.1 added, and the fork's 12.0 PostgreSQL
schema has none of them. pgloader is told `create no tables`, so it loads into
whatever columns already exist: a column the target lacks fails that table and
leaves the rest of the load reporting success. That is the same shape as the
Devices and KeyframeData losses §3.3 of the runbook was written about -- a green
run with two empty tables. This stage turns it into a refusal before anything is
written.

WHY IT COMPARES SCHEMAS AND NOT MIGRATION IDs. The obvious gate -- "every
MigrationId in the source must also be in the target" -- does not work here. The
provider's PostgreSQL migrations are its own: different timestamps, partly
different names from the SQLite ones. The two histories legitimately never match
and a set comparison is all false positives. Columns are the ground truth, they
are what pgloader actually fails on, and they catch drift whatever caused it --
a version gap, a hand-applied migration, a fork rebase.

Inputs, all produced by earlier stages. Standard library only: no database
driver, no network.

  /work/jellyfin.db             restored, and WAL-checkpointed by render.py
  /work/target-schema.tsv       table|column|data_type|char_max_len|is_nullable|has_default
  /work/target-migrations.txt   one MigrationId per line from the target

Exit 0 means the load may proceed. Anything else means it may not.
"""
import collections
import pathlib
import re
import sqlite3
import sys

WORK = pathlib.Path("/work")
DB = WORK / "jellyfin.db"
SCHEMA = WORK / "target-schema.tsv"
MIGRATIONS = WORK / "target-migrations.txt"

# Mirrors `excluding table names like ...` in jellyfindb.load. pgloader never
# touches these, so a difference in them is not a reason to stop.
EXCLUDED = re.compile(r"^(__EFMigrationsHistory|__EFMigrationsLock|sqlite_)")

failures = []
warnings = []


def fail(msg):
    failures.append(msg)
    print(f"  FAIL  {msg}")


def warn(msg):
    warnings.append(msg)
    print(f"  warn  {msg}")


# --------------------------------------------------------------- target side
if not SCHEMA.exists():
    print(f"FAIL: {SCHEMA} missing -- run the target-dump stage first", file=sys.stderr)
    sys.exit(1)

target = collections.defaultdict(dict)
for line in SCHEMA.read_text().splitlines():
    if not line.strip():
        continue
    # Extra trailing fields are tolerated so this stays readable by preclean.py,
    # which splits the same file and takes only the first four columns.
    f = (line.split("|") + [""] * 6)[:6]
    table, column, dtype, maxlen, nullable, has_default = f
    target[table][column] = {
        "type": dtype,
        "maxlen": maxlen,
        "nullable": nullable.upper() != "NO",
        "has_default": has_default.strip().lower() in ("t", "true", "yes", "1"),
    }
print(f"target: {len(target)} tables, {sum(len(c) for c in target.values())} columns")

target_migrations = [
    line.strip()
    for line in (MIGRATIONS.read_text().splitlines() if MIGRATIONS.exists() else [])
    if line.strip()
]
print(f"target: {len(target_migrations)} rows in __EFMigrationsHistory")

# --------------------------------------------------------------- source side
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
source_tables = [
    r[0] for r in con.execute("select name from sqlite_master where type='table' order by name")
]
loadable = [t for t in source_tables if not EXCLUDED.match(t)]
print(f"source: {len(source_tables)} tables, {len(loadable)} of them loadable")

versions = sorted(
    {r[0] for r in con.execute('select distinct "ProductVersion" from "__EFMigrationsHistory"')}
)
source_migrations = sorted(
    r[0] for r in con.execute('select "MigrationId" from "__EFMigrationsHistory"')
)
print(
    f"source: EF ProductVersion {', '.join(versions)}, "
    f"{len(source_migrations)} migrations, newest {source_migrations[-1]}"
)

# ------------------------------------------------------ the comparison itself
print("\n=== schema compatibility ===")
for table in loadable:
    if table not in target:
        # pgloader reports `relation does not exist` for this one table and
        # carries on with the others: a whole table lost, loud in the log and
        # invisible in the result.
        fail(f"table {table!r} exists in the source and NOT in the target")
        continue

    src_cols = {r[1]: {"notnull": r[3], "default": r[4]} for r in con.execute(f'PRAGMA table_info("{table}")')}

    for column in src_cols:
        if column not in target[table]:
            # THE 12.1-ADDED-A-COLUMN CASE. This is the one that matters.
            fail(
                f"column {table}.{column!r} exists in the source and NOT in the target "
                f"-- the target's schema is older than the source's"
            )

    for column, spec in target[table].items():
        if column in src_cols:
            continue
        # A column the TARGET has and the source does not is the reverse gap.
        # Harmless when it is nullable or defaulted -- pgloader just never
        # writes it -- and fatal when it is neither, because every single row
        # would violate the constraint and the table would load zero rows.
        if spec["nullable"] or spec["has_default"]:
            warn(
                f"column {table}.{column!r} exists only in the target ({spec['type']}) "
                f"-- it will be left at its default"
            )
        else:
            fail(
                f"column {table}.{column!r} exists only in the target, and is NOT NULL "
                f"with no default -- every row would violate it"
            )

for table in sorted(set(target) - set(loadable)):
    if not EXCLUDED.match(table):
        warn(f"table {table!r} exists only in the target -- nothing will be loaded into it")

print("\n=== migration history (informational) ===")
print(f"  source newest: {source_migrations[-1]}")
if target_migrations:
    print(f"  target newest: {sorted(target_migrations)[-1]}")
print(
    "  The two sets are NOT expected to match -- the provider's PostgreSQL\n"
    "  migrations are its own. The schema comparison above is the gate."
)

con.close()

print("\n=== gate ===")
if failures:
    print(
        f"gate: REFUSED -- {len(failures)} blocking difference(s), {len(warnings)} warning(s)",
        file=sys.stderr,
    )
    print(
        "\nThe target's schema does not cover the source's. Loading now would lose\n"
        "whole tables without failing the job.\n\n"
        "The fix is to bring jellyfin-pg up to a fork build that matches\n"
        "production's Jellyfin version, let it run its EF migrations against an\n"
        "EMPTY database, and re-run this job. NOT to add the missing columns by\n"
        "hand: the provider's next migration will fight them.",
        file=sys.stderr,
    )
    sys.exit(1)

print(f"gate: OK -- the source's schema is covered by the target ({len(warnings)} warning(s))")
