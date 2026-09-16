#!/usr/bin/env python3
"""Gate the restored SQLite copy and render the pgloader load file -- OFFLINE.

This is the script the runbook's §3.1 recommends, and the one the successful
2026-09-16 conversion actually ran. It replaces prepare.py's gate + render steps
without any network access.

WHY OFFLINE. prepare.py fetches the fork's scripts and the pinned server sources
from git.nicholstech.org at run time. That host started returning HTTP 403 to
this cluster's egress IP after ~120 requests across three runs -- rate limiting,
not an outage -- and broke a run mid-flight. A conversion must not depend on a
third-party host being reachable at the moment it runs, least of all with
production stopped. So the load template travels WITH this script
(./jellyfindb.load) and is verified by checksum instead of fetched.

What this does NOT do: regenerate the server code-migration history. That needs
export-code-migrations.py plus the pinned server's Migrations/*.cs sources
(prepare.py does both, online). It only has to be applied once -- pgloader
excludes __EFMigrationsHistory, so the history survives any re-load.

Inputs:
  /work/jellyfin.db (+ -wal)     restored by `restic --no-lock dump`
  POSTGRES_CONNECTION_STRING     the target, from the jellyfin-pg-env Secret
  LOAD_TEMPLATE (optional)       path to jellyfindb.load; default /load/jellyfindb.load

Outputs in /work: rendered.load, pg.env, source-counts.json.
"""
import hashlib, json, os, pathlib, sqlite3, sys, urllib.parse

WORK = pathlib.Path("/work")
DB = WORK / "jellyfin.db"
TEMPLATE = pathlib.Path(os.environ.get("LOAD_TEMPLATE", "/load/jellyfindb.load"))
# The fork's docker/jellyfindb.load at commit 460d74ac, byte for byte. The copy
# beside this script matches it. If this assertion fails, the template drifted
# from upstream and the run stops rather than loading with a mutated file.
TEMPLATE_SHA = "8e06bfa5bb5c3665f12f80659140cea824792c45e6b3c30f14d29865aa7c6973"
# The fork's export script refuses a source without this; it is the final SQLite
# migration in stock v12.0-rc7.
REQUIRED = "20260815063607_RemoveOrphanedUserPermissionsAndPreferences"

COUNT_TABLES = [
    "BaseItems", "Users", "UserData", "MediaStreamInfos", "Peoples", "PeopleBaseItemMap",
    "ItemValues", "ItemValuesMap", "AncestorIds", "Chapters", "MediaSegments",
    "BaseItemImageInfos", "BaseItemProviders", "DisplayPreferences", "HomeSection",
    "CustomItemDisplayPreferences", "Devices", "ApiKeys", "ActivityLogs",
    "TrickplayInfos", "KeyframeData", "LinkedChildren", "Permissions", "Preferences",
    "AttachmentStreamInfos", "ItemDisplayPreferences",
]


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


blob = TEMPLATE.read_bytes()
got = hashlib.sha256(blob).hexdigest()
if got != TEMPLATE_SHA:
    fail(f"load template checksum mismatch: expected {TEMPLATE_SHA}, got {got}")
print(f"load template verified against upstream 460d74ac ({len(blob)} bytes)")

if not DB.exists():
    fail(f"{DB} not restored")
print(f"restored database: {DB.stat().st_size} bytes")

con = sqlite3.connect(str(DB))
print("journal_mode:", con.execute("PRAGMA journal_mode").fetchone()[0])
# The volsync snapshot is a HOT copy, so a WAL came with it. Checkpointing folds
# those committed pages into the main file; without it pgloader silently reads
# the pre-WAL state and loses the most recent writes.
busy, log, ckpt = con.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
print(f"wal_checkpoint: busy={busy} log={log} checkpointed={ckpt}")
if busy != 0:
    fail("wal_checkpoint busy; the copy is not standalone")
quick = con.execute("PRAGMA quick_check").fetchone()[0]
print("quick_check:", quick)
if quick != "ok":
    fail("quick_check failed -- the hot copy is torn. Stop production Jellyfin "
         "and take a clean snapshot.")
fks = con.execute("PRAGMA foreign_key_check").fetchall()
print("foreign_key_check violations:", len(fks))
if fks:
    fail("foreign_key_check found violations; repair the source first")
hist = dict(con.execute('SELECT "MigrationId","ProductVersion" FROM "__EFMigrationsHistory"'))
print("source migrations:", len(hist))
if REQUIRED not in hist:
    fail(f"source is not at the Jellyfin 12 schema ({REQUIRED} missing)")
print("gate passed:", REQUIRED)

# Recorded BEFORE the load, so verification compares against the source rather
# than against expectations. A per-table comparison is the only check that
# caught the Devices / KeyframeData losses.
counts = {}
for t in COUNT_TABLES:
    try:
        counts[t] = con.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
    except sqlite3.Error:
        counts[t] = None
(WORK / "source-counts.json").write_text(json.dumps(counts, indent=2))
print("source row counts:")
for t, c in counts.items():
    print(f"  {t:32} {c if c is not None else 'n/a'}")
con.close()

parts = {}
for chunk in os.environ["POSTGRES_CONNECTION_STRING"].split(";"):
    if "=" in chunk:
        k, _, v = chunk.partition("=")
        parts[k.strip().lower()] = v.strip()
# Percent-encoded: pgloader takes a URI, and a `/`, `@`, `:` or `#` in an
# OpenBao-generated password re-parses it into something else silently.
q = lambda s: urllib.parse.quote(s, safe="")
port = parts.get("port", "5432")
target = f"pgsql://{q(parts['username'])}:{q(parts['password'])}@{parts['host']}:{port}/{q(parts['database'])}"

# Only the two endpoints change. `create no tables`, `truncate`, the excluded
# migration tables and the identity-sequence reset stay the fork's own file.
out = blob.decode().replace("from sqlite:///config/data/jellyfin.db", f"from sqlite://{DB}")
out = out.replace(
    "into pgsql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}",
    f"into {target}")
if "${POSTGRES_" in out or "/config/data/jellyfin.db" in out:
    fail("template did not render")
(WORK / "rendered.load").write_text(out)
print("rendered load file written (target redacted):",
      out.split("into ")[1].split("\n")[0].replace(q(parts["password"]), "***"))

(WORK / "pg.env").write_text(
    f"PGHOST={parts['host']}\nPGPORT={port}\nPGUSER={parts['username']}\n"
    f"PGDATABASE={parts['database']}\nPGPASSWORD={parts['password']}\n")
print("render: OK")
