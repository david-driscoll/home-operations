#!/usr/bin/env python3
"""Reconcile a Jellyfin SQLite copy with the PostgreSQL provider's stricter schema.

Runs against the RESTORED COPY (/work/jellyfin.db), never production, using
/work/target-schema.tsv dumped from the live target:

    psql -At -F'|' -c "select table_name, column_name, data_type,
      coalesce(character_maximum_length::text,'')
      from information_schema.columns where table_schema='public'
      order by table_name, ordinal_position;" > /work/target-schema.tsv

WHY THIS EXISTS. Without it, pgloader reports 2 errors and silently loads ZERO
rows into two tables. Both classes were found on 2026-09-16 converting a real
122k-item library:

  1. varchar(n) -- SQLite does not enforce declared lengths, PostgreSQL does.
     One device carried a 48-char AppVersion ('develop-e53c2a34...') into a
     varchar(32) column. One bad value aborts the whole COPY batch, so 84 of 84
     device registrations were lost.

  2. ARRAY -- EF stores a list of longs as a JSON string in SQLite
     ('[0,83420000,...]') while the PostgreSQL provider declares bigint[].
     PostgreSQL wants '{0,83420000,...}' and rejects the JSON form with
     'malformed array literal'. All 3,863 KeyframeData rows were lost.

Both are schema-driven rather than hardcoded, so anything else with the same
shape is caught too instead of surfacing one table at a time.

⚠️ THE varchar FIX IS LOSSY. An over-length value is truncated to fit, because
the alternative is losing the whole table. The other option is widening the
column in PostgreSQL, which diverges from the fork's schema and will fight its
EF migrations. Decide deliberately; the script prints every value it truncates.
"""
import pathlib, sqlite3

WORK = pathlib.Path("/work")
DB = WORK / "jellyfin.db"
SCHEMA = WORK / "target-schema.tsv"

con = sqlite3.connect(str(DB))
tables = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}

truncated = converted = 0
reports = []

for line in SCHEMA.read_text().splitlines():
    if not line.strip():
        continue
    table, column, dtype, maxlen = (line.split("|") + ["", "", "", ""])[:4]
    if table not in tables:
        continue
    cols = {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
    if column not in cols:
        continue

    if dtype == "ARRAY":
        n = con.execute(f'select count(*) from "{table}" where "{column}" like \'[%\'').fetchone()[0]
        if n:
            con.execute(
                f'update "{table}" set "{column}" = \'{{\' || substr("{column}", 2, length("{column}") - 2) || \'}}\' '
                f'where "{column}" like \'[%\'')
            reports.append(f"  ARRAY   {table}.{column}: converted {n} JSON literals to PostgreSQL array form")
            converted += n
    elif maxlen.isdigit():
        m = int(maxlen)
        n = con.execute(f'select count(*) from "{table}" where length("{column}") > ?', (m,)).fetchone()[0]
        if n:
            worst = con.execute(f'select max(length("{column}")) from "{table}"').fetchone()[0]
            sample = con.execute(
                f'select "{column}" from "{table}" where length("{column}") > ? limit 1', (m,)).fetchone()[0]
            con.execute(
                f'update "{table}" set "{column}" = substr("{column}", 1, ?) where length("{column}") > ?', (m, m))
            reports.append(
                f"  VARCHAR {table}.{column} varchar({m}): truncated {n} rows "
                f"(longest was {worst}, e.g. {sample[:48]!r})")
            truncated += n

con.commit()
con.close()

print("=== preclean ===")
for r in reports:
    print(r)
if not reports:
    print("  nothing to fix")
print(f"preclean: {truncated} overlong values truncated, {converted} array literals converted")
