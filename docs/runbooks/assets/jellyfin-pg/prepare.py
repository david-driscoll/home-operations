#!/usr/bin/env python3
"""Gate the restored SQLite copy, then stage what pgloader and psql need.

Runs between the restic dump and pgloader. Everything lands in /work.
Fail-closed: every check exits non-zero rather than letting a later stage load
questionable data into PostgreSQL.
"""
import hashlib, json, os, pathlib, sqlite3, subprocess, sys, urllib.parse, urllib.request

WORK = pathlib.Path("/work")
DB = WORK / "jellyfin.db"
REQUIRED = "20260815063607_RemoveOrphanedUserPermissionsAndPreferences"

FORK = "https://git.nicholstech.org/Nichols-HomeLab/Jellyfin.Pgsql/raw/commit/460d74ac"
# SHA256 of the two fork scripts as fetched and reviewed on 2026-09-15. Fetching
# rather than embedding keeps them byte-identical to upstream; verifying means a
# moved tag or a tampered mirror fails loudly instead of silently changing the
# conversion.
FORK_FILES = {
    "jellyfindb.load": "8e06bfa5bb5c3665f12f80659140cea824792c45e6b3c30f14d29865aa7c6973",
    "export-code-migrations.py": "20a151db82c456809e13f8c69f52679e669d1a0dc3020b5707da0db949a50209",
}

SERVER_API = "https://git.nicholstech.org/api/v1/repos/Nichols-HomeLab/jellyfin"
SERVER_REF = "d20f97d32b102f5c9be370d8041759e69671ad31"

COUNT_TABLES = [
    "BaseItems", "Users", "UserData", "MediaStreams", "People", "PeopleBaseItemMap",
    "ItemValues", "ItemValuesMap", "AncestorIds", "Chapters", "MediaSegments",
    "ImageInfos", "BaseItemProviders", "BaseItemTrailerTypes", "DisplayPreferences",
    "CustomItemDisplayPreferences", "Devices", "DeviceOptions", "ActivityLogs",
    "TrickplayInfos", "KeyframeData", "LinkedChildren", "Permissions", "Preferences",
    "AccessSchedules", "AttachmentStreamInfos", "ItemDisplayPreferences",
]


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def fetch(url, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def get_fork_scripts():
    for name, want in FORK_FILES.items():
        blob = fetch(f"{FORK}/docker/{name}")
        got = hashlib.sha256(blob).hexdigest()
        if got != want:
            fail(f"{name} checksum mismatch: expected {want}, got {got}")
        (WORK / name).write_bytes(blob)
        print(f"fetched {name} ({len(blob)} bytes, sha256 verified)")


def verify_sqlite():
    if not DB.exists():
        fail(f"{DB} not restored")
    print(f"restored database: {DB.stat().st_size} bytes")
    con = sqlite3.connect(str(DB))
    try:
        # The snapshot is a HOT copy: volsync backed it up while Jellyfin was
        # running, so a 36 MiB WAL came with it. Checkpointing folds those
        # committed pages into the main file. Without it pgloader reads the
        # pre-WAL state and silently loses the most recent writes.
        print("journal_mode:", con.execute("PRAGMA journal_mode").fetchone()[0])
        busy, log, ckpt = con.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        print(f"wal_checkpoint: busy={busy} log={log} checkpointed={ckpt}")
        if busy != 0:
            fail("wal_checkpoint busy; the copy is not standalone")

        quick = con.execute("PRAGMA quick_check").fetchone()[0]
        print("quick_check:", quick)
        if quick != "ok":
            fail("quick_check failed -- the hot copy is torn. Stop production "
                 "Jellyfin and take a clean snapshot.")

        fks = con.execute("PRAGMA foreign_key_check").fetchall()
        print("foreign_key_check violations:", len(fks))
        if fks:
            for row in fks[:10]:
                print("  ", row)
            fail("foreign_key_check found violations; repair the source first")

        hist = dict(con.execute('SELECT "MigrationId","ProductVersion" FROM "__EFMigrationsHistory"'))
        print("source migrations:", len(hist))
        if REQUIRED not in hist:
            fail(f"source is not at the Jellyfin 12 schema ({REQUIRED} missing)")
        print("gate passed:", REQUIRED)

        counts = {}
        for t in COUNT_TABLES:
            try:
                counts[t] = con.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
            except sqlite3.Error:
                counts[t] = None
        (WORK / "source-counts.json").write_text(json.dumps(counts, indent=2))
        print("source row counts:")
        for t, c in counts.items():
            if c is not None:
                print(f"  {t:34} {c}")
    finally:
        con.close()


def write_load_file():
    """Render the fork's jellyfindb.load against this target.

    The password is percent-encoded: pgloader takes its target as a URI, and a
    `/`, `@`, `:` or `#` in an OpenBao password re-parses it into something else
    without complaining.
    """
    parts = {}
    for chunk in os.environ["POSTGRES_CONNECTION_STRING"].split(";"):
        if "=" in chunk:
            k, _, v = chunk.partition("=")
            parts[k.strip().lower()] = v.strip()
    q = lambda s: urllib.parse.quote(s, safe="")
    port = parts.get("port", "5432")
    target = f"pgsql://{q(parts['username'])}:{q(parts['password'])}@{parts['host']}:{port}/{q(parts['database'])}"

    tpl = (WORK / "jellyfindb.load").read_text()
    # Only the two endpoints change. `create no tables`, `truncate`, the excluded
    # migration tables and the identity-sequence reset stay the fork's own file.
    out = tpl.replace("from sqlite:///config/data/jellyfin.db", f"from sqlite://{DB}")
    out = out.replace(
        "into pgsql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}",
        f"into {target}")
    if "${POSTGRES_" in out or "/config/data/jellyfin.db" in out:
        fail("jellyfindb.load did not render; upstream template changed shape")
    (WORK / "rendered.load").write_text(out)
    print("--- rendered load file (password redacted) ---")
    print(out.replace(q(parts["password"]), "***"))

    (WORK / "pg.env").write_text(
        f"PGHOST={parts['host']}\nPGPORT={port}\nPGUSER={parts['username']}\n"
        f"PGDATABASE={parts['database']}\nPGPASSWORD={parts['password']}\n")


def fetch_server_migrations():
    """Download Jellyfin.Server/Migrations from the pinned submodule commit.

    export-code-migrations.py scans these for [JellyfinMigration(...)] attributes
    to tell SERVER CODE migrations from provider schema migrations. That
    distinction is what keeps the provider's PostgreSQL history intact while
    carrying the source's completed routines across.
    """
    root = WORK / "jellyfin"
    n = 0

    def walk(path):
        nonlocal n
        entries = json.loads(fetch(f"{SERVER_API}/contents/{urllib.parse.quote(path)}?ref={SERVER_REF}"))
        for e in entries:
            if e["type"] == "dir":
                walk(e["path"])
            elif e["type"] == "file" and e["name"].endswith(".cs"):
                dest = root / e["path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(fetch(e["download_url"]))
                n += 1

    walk("Jellyfin.Server/Migrations")
    print(f"fetched {n} server migration sources at {SERVER_REF[:8]}")
    if n == 0:
        fail("no server migration sources fetched")


def export_code_migrations():
    r = subprocess.run([sys.executable, str(WORK / "export-code-migrations.py"),
                        str(DB), "--server-source", str(WORK / "jellyfin")],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr, file=sys.stderr)
        fail("export-code-migrations.py refused the source")
    (WORK / "code-migrations.sql").write_text(r.stdout)
    print(f"code-migrations.sql: {len(r.stdout)} bytes, "
          f"{r.stdout.count('INSERT INTO')} history rows to carry across")


if __name__ == "__main__":
    get_fork_scripts()
    verify_sqlite()
    write_load_file()
    fetch_server_migrations()
    export_code_migrations()
    print("prepare: OK")
