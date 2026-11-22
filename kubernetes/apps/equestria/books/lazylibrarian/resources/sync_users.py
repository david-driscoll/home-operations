#!/usr/bin/env python3
"""Mirror authentik's `media-managers` into LazyLibrarian's `users` table.

Run daily by ../user-sync.yaml. LazyLibrarian's PROXY_AUTH logs a request in as
the `users` row whose UserName equals X-Authentik-Username
(lazylibrarian/webServe.py, serve_template). The row has to exist first, and
LazyLibrarian will not create it without email: both PROXY_REGISTER and the
admin page's "add user" (webServe.py admin_users) INSERT only after the
welcome email sends, and the estate gives it no SMTP. There is no API command
for users either (lazylibrarian/api.py). So this writes the rows itself.

Rules (authentik is the source of truth; `admin` is never read or written):
  - Every ACTIVE member of GROUP gets a row: UserName = the authentik username
    exactly, Name and Email copied, a random UserID like LazyLibrarian's own
    pwd_generator(), and a password that can never match (UNUSABLE_PASSWORD).
  - Perms is set on every run, so change someone's level in authentik, not in
    LazyLibrarian's user page (the next run undoes that):
      authentik superuser (the `admins` group) -> perm_all
      everyone else                            -> perm_friend, the level
                                                  PROXY_REGISTER itself grants
  - A row whose user left GROUP, was deactivated or renamed is DISABLED
    (Perms = 0, which LazyLibrarian treats as logged out), never deleted: the
    row holds that user's read/to-read lists and feed subscriptions, and
    rejoining the group restores the right level on the next run. The
    authentik access policy already stops them at the outpost; this is the
    second gate.

Idempotent: a run with nothing to change writes nothing and says so. Every
change is printed, one line each, for the Job's log.
"""

import json
import os
import secrets
import sqlite3
import string
import sys
import urllib.parse
import urllib.request

AUTHENTIK_URL = os.environ["AUTHENTIK_URL"].rstrip("/")
AUTHENTIK_TOKEN = os.environ["AUTHENTIK_TOKEN"]
GROUP = os.environ.get("SYNC_GROUP", "media-managers")
DB_PATH = os.environ.get("LAZYLIBRARIAN_DB", "/config/lazylibrarian.db")
DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")

# LazyLibrarian's break-glass account. Never selected, updated or disabled,
# and an authentik user of the same name is refused rather than merged into it.
PROTECTED_USER = "admin"

# lazylibrarian/__init__.py. Copied, not imported: importing the package starts
# its config machinery. perm_friend = perm_guest + perm_search + perm_status,
# perm_guest = download + series + audio + ebook + magazines + comics.
PERM_ALL = 65535
PERM_FRIEND = 4096 + 128 + 32 + 64 + 16 + 8192 + 512 + 1024  # 14064
PERM_DISABLED = 0

# The stored Password is md5_utf8(<typed password>), 32 lowercase hex chars, so
# a value with a `!` can never equal it: the form and basic-auth logins stay shut
# for these accounts and only the authentik headers get in.
UNUSABLE_PASSWORD = "!authentik-proxy-auth-only"

# authentik user types that are not people; never given an account.
SERVICE_TYPES = {"service_account", "internal_service_account"}


def log(message: str) -> None:
    print(message, flush=True)


def authentik_get(path: str, params: dict[str, str]) -> dict:
    url = f"{AUTHENTIK_URL}/api/v3{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {AUTHENTIK_TOKEN}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def group_members() -> dict[str, dict]:
    """username -> authentik user, for the active human members of GROUP."""
    # A misspelt group must not read as "nobody is a member" and disable
    # everyone, so prove the group exists before trusting an empty answer.
    groups = authentik_get("/core/groups/", {"name": GROUP, "include_users": "false"})
    if not any(g.get("name") == GROUP for g in groups.get("results", [])):
        raise SystemExit(f"authentik has no group named {GROUP!r}; refusing to sync")

    members: dict[str, dict] = {}
    page = 1
    while page:
        body = authentik_get(
            "/core/users/",
            {
                "groups_by_name": GROUP,
                "is_active": "true",
                "include_groups": "false",
                "page_size": "100",
                "page": str(page),
            },
        )
        for user in body.get("results", []):
            if user.get("type") in SERVICE_TYPES or not user.get("is_active"):
                continue
            members[user["username"]] = user
        page = body.get("pagination", {}).get("next") or 0
    return members


def new_user_id(db: sqlite3.Connection) -> str:
    """A fresh UserID in LazyLibrarian's own shape (10 alphanumerics)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        candidate = "".join(secrets.choice(alphabet) for _ in range(10))
        if not db.execute("SELECT 1 FROM users WHERE UserID=?", (candidate,)).fetchone():
            return candidate


def sync(db: sqlite3.Connection, members: dict[str, dict]) -> list[str]:
    changes: list[str] = []
    rows = {
        row["UserName"]: row
        for row in db.execute("SELECT UserID, UserName, Name, Email, Perms FROM users WHERE UserName != ?", (PROTECTED_USER,))
    }

    for username, user in sorted(members.items()):
        if username.lower() == PROTECTED_USER:
            log(f"WARNING: authentik user {username!r} collides with LazyLibrarian's {PROTECTED_USER!r}; skipped")
            continue
        name = (user.get("name") or "").strip() or username
        email = (user.get("email") or "").strip()
        perms = PERM_ALL if user.get("is_superuser") else PERM_FRIEND

        row = rows.get(username)
        if row is None:
            db.execute(
                "INSERT INTO users (UserID, UserName, Name, Password, Email, SendTo, Perms) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (new_user_id(db), username, name, UNUSABLE_PASSWORD, email, "", perms),
            )
            changes.append(f"created {username} (perms {perms})")
            continue

        updates: dict[str, object] = {}
        if row["Name"] != name:
            updates["Name"] = name
        if (row["Email"] or "") != email:
            updates["Email"] = email
        if row["Perms"] != perms:
            updates["Perms"] = perms
        if updates:
            assignments = ", ".join(f"{column}=?" for column in updates)
            db.execute(f"UPDATE users SET {assignments} WHERE UserID=?", (*updates.values(), row["UserID"]))
            detail = ", ".join(f"{column} {row[column]!r} -> {value!r}" for column, value in updates.items())
            changes.append(f"updated {username}: {detail}")

    for username, row in sorted(rows.items()):
        if username in members or row["Perms"] == PERM_DISABLED:
            continue
        db.execute("UPDATE users SET Perms=? WHERE UserID=?", (PERM_DISABLED, row["UserID"]))
        changes.append(f"disabled {username}: no longer an active member of {GROUP} (perms {row['Perms']} -> 0)")

    return changes


def main() -> int:
    members = group_members()
    log(f"authentik: {len(members)} active member(s) of {GROUP}")
    if not members:
        # The group exists but is empty. Possible, but far likelier a broken
        # filter than a real purge, so stop before disabling every account.
        log("refusing to sync an empty group; nothing changed")
        return 1

    # One short IMMEDIATE transaction against the live database. LazyLibrarian
    # keeps it in WAL mode and this pod shares its node and filesystem (see
    # ../user-sync.yaml), so SQLite's own locking arbitrates; busy_timeout
    # waits out LazyLibrarian's own writes instead of failing on them.
    db = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").fetchone():
            log(f"{DB_PATH} has no users table yet (LazyLibrarian not initialised); nothing changed")
            return 1
        db.execute("BEGIN IMMEDIATE")
        changes = sync(db, members)
        db.execute("ROLLBACK" if DRY_RUN else "COMMIT")
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()

    prefix = "[dry run] " if DRY_RUN else ""
    for change in changes:
        log(prefix + change)
    log(f"{prefix}{len(changes)} change(s)" if changes else "already in sync; nothing changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
