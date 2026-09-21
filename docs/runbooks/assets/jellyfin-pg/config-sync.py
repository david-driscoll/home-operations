#!/usr/bin/env python3
"""Carry production's plugins, plugin repositories and server settings across.

THE HALF THE 2026-09-16 TRIAL DID NOT DO. §3.6 of the runbook restored the
config XMLs and skipped `/config/plugins` outright, so that instance ran with
production's settings and none of production's plugins. This script does the
whole config volume, plugins included, and is the part of the re-run that is new.

WHAT IT CARRIES

  config/              every server setting: system.xml (which is also where
                       <PluginRepositories> lives -- the repository list is a
                       server setting, not a per-plugin one), encoding.xml,
                       network.xml, branding.xml, livetv.xml, notifications.xml
  plugins/             the installed plugin assemblies, AND plugins/configurations/
                       which is where each plugin's own settings XML lives
  root/                the LIBRARY DEFINITIONS -- root/default/<Library>/options.xml
                       and the .mblink files that point at /media. Without these
                       the loaded BaseItems rows belong to libraries the server
                       does not know it has.
  data/ScheduledTasks/ task triggers and their last-run state
  data/collections/    collection and playlist definitions
  data/playlists/
  data/*.db            the plugins' OWN SQLite databases -- playback_reporting.db,
                       infuse_sync.db, streamyfin_plugin.db and anything like
                       them. These are outside the PostgreSQL provider's scope
                       entirely: they stay SQLite files on the volume, and item 6
                       of the runbook's "what a real cutover would need" is
                       exactly this decision. --no-plugin-data leaves them behind.

WHAT IT REFUSES TO CARRY, AND WHY EACH ONE WOULD BREAK THINGS

  config/database.xml  production's names the SQLite provider, and the fork's
                       entrypoint hard-aborts (exit 2) when that file does not
                       say PostgreSQL. It rewrites <ConnectionString> on every
                       start from the environment, so the target's own copy is
                       the correct one and must survive.
  plugins/<provider>   the entrypoint manages the PostgreSQL provider's plugin
                       directory itself, and the provider moves as a unit with
                       the server. Production has no such directory; the target
                       does, and wiping plugins/ must not take it.
  data/jellyfin.db     the thing pgloader is converting.
  data/library.db      superseded, and large.
  metadata/ cache/     regenerable, and metadata alone is tens of gigabytes.
  log/ transcodes/

THREE PATHS THAT DO NOT EXIST ON THE TARGET

Production Jellyfin has mounts jellyfin-pg does not, and a setting that names a
path the pod cannot write is not a degraded feature -- it is a server that dies
before it serves anything:

    Unhandled exception. System.UnauthorizedAccessException:
      Access to the path '/metadata' is denied.
        at ServerConfigurationManager.UpdateMetadataPath()

  MetadataPath    production mounts NFS at /metadata; jellyfin-pg mounts nothing
                  there. --metadata-path is REQUIRED for that reason: there is no
                  safe default, and guessing one is how the above happens.
                  ⚠️ Image paths are stored ABSOLUTE in the database, so moving
                  this orphans existing artwork -- posters 404 until a refresh.
  network.xml     production's pod carries an ipvlan interface on the Home LAN
                  (jellyfin-lan-net, 10.10.206.20). If LocalNetworkAddresses
                  names that address, jellyfin-pg cannot bind it. Reported, and
                  cleared by --clear-bind-addresses.
  subtitles/      production mounts NFS over data/subtitles and data/trickplay.
  trickplay/      Not carried; Jellyfin recreates both as ordinary directories.

PLUGIN SETTINGS THAT NAME PRODUCTION

A plugin configuration copied from production still points at production --
jellyfin.equestria.svc.cluster.local, jellyfin.driscoll.tech. --rewrite-host
OLD=NEW rewrites those in the text files under plugins/ (settings XML/JSON, never
assemblies), matching whole hostnames only. The same hostnames under config/ and
in the plugins' SQLite databases are reported, not rewritten.

Run it with jellyfin-pg SCALED TO ZERO and its config PVC mounted at --target.
Everything outside the carry list is left exactly as it was.
"""
import argparse
import json
import os
import pathlib
import re
import shutil
import sqlite3
import sys
import xml.etree.ElementTree as ET

# Directories carried wholesale, relative to the source config root.
CARRY_DIRS = [
    "config",
    "plugins",
    "root",
    "data/ScheduledTasks",
    "data/collections",
    "data/playlists",
]

# Never copied from the source, AND held aside on the target across the replace.
#
# Both halves are required and the second is the one that is easy to miss: a
# carried directory is REPLACED, so simply declining to copy production's
# database.xml still destroys the target's own copy when config/ is wiped -- and
# a jellyfin-pg with no database.xml is a container that exits 2 on its next
# start. Caught by the fixture in the scratchpad tests, not by reasoning.
PRESERVE = {"config/database.xml"}

# Never copied and never wiped from the target: the entrypoint owns it, and the
# provider moves as a unit with the server.
PROVIDER_PLUGIN = re.compile(r"(pgsql|postgres)", re.IGNORECASE)

# Plugin SQLite databases live loose in data/ beside the library database.
NOT_PLUGIN_DATA = {"jellyfin.db", "library.db"}


def log(msg=""):
    print(msg, flush=True)


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", help="restored config root; default: the path in /work/config-root")
    p.add_argument("--target", required=True, help="jellyfin-pg's config volume, mounted (e.g. /target)")
    p.add_argument(
        "--metadata-path",
        required=True,
        help="what to rewrite <MetadataPath> to. For jellyfin-pg: /config/metadata. "
        "Required on purpose -- see the module docstring.",
    )
    p.add_argument(
        "--server-version",
        default="",
        help="target server version, e.g. 12.0.0, for the plugin targetAbi check",
    )
    p.add_argument("--no-plugin-data", action="store_true", help="leave the plugins' own SQLite databases behind")
    p.add_argument("--clear-bind-addresses", action="store_true", help="empty LocalNetworkAddresses in network.xml")
    p.add_argument("--strict-abi", action="store_true", help="fail, rather than warn, on a plugin the target cannot load")
    p.add_argument(
        "--rewrite-host",
        action="append",
        default=[],
        metavar="OLD=NEW",
        help="rewrite hostname OLD to NEW in plugin settings (repeatable), "
        "e.g. jellyfin.driscoll.tech=jellyfin-pg.driscoll.tech",
    )
    p.add_argument("--chown", default="", help="uid:gid to apply to everything written (e.g. 568:568)")
    p.add_argument("--dry-run", action="store_true", help="report what would happen and write nothing")
    return p.parse_args()


def resolve_source(args):
    if args.source:
        return pathlib.Path(args.source)
    marker = pathlib.Path("/work/config-root")
    if marker.exists():
        return pathlib.Path(marker.read_text().strip())
    sys.exit("FAIL: no --source and no /work/config-root -- run restore.sh first")


def version_tuple(v):
    parts = re.findall(r"\d+", v or "")
    return tuple(int(x) for x in parts[:4]) + (0,) * (4 - len(parts[:4]))


# ---------------------------------------------------------------- inventories
def report_plugins(src, server_version, strict):
    """List what is about to be carried, and whether the target can load it.

    A Jellyfin plugin declares the server ABI it was built against in its
    meta.json. The server refuses to load a plugin whose targetAbi is ahead of
    itself -- quietly, in the log, with the plugin simply absent from the UI.
    Carrying production's plugins onto an OLDER server is the normal way to hit
    that, which is precisely the situation this re-run is in until jellyfin-pg
    catches up to production's version.
    """
    plugins_dir = src / "plugins"
    if not plugins_dir.is_dir():
        log("plugins: none in the snapshot")
        return []

    found, blocked = [], []
    for entry in sorted(plugins_dir.iterdir()):
        if not entry.is_dir() or entry.name == "configurations":
            continue
        meta_file = entry / "meta.json"
        meta = {}
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text())
            except (ValueError, OSError) as exc:
                log(f"  ! {entry.name}: unreadable meta.json ({exc})")
        name = meta.get("name", entry.name)
        version = meta.get("version", "?")
        abi = meta.get("targetAbi", "")
        note = ""
        if server_version and abi and version_tuple(abi) > version_tuple(server_version):
            note = f"  ⚠️ targetAbi {abi} > target server {server_version}: WILL NOT LOAD"
            blocked.append(name)
        elif PROVIDER_PLUGIN.search(entry.name):
            note = "  (provider plugin -- NOT carried, the entrypoint owns it)"
        found.append((name, version, abi, note))
        log(f"  {name:38} {version:14} abi={abi or '-':12}{note}")

    configs = plugins_dir / "configurations"
    if configs.is_dir():
        xmls = sorted(p.name for p in configs.glob("*.xml"))
        log(f"  plugin configurations: {len(xmls)} file(s) -> {', '.join(xmls) or 'none'}")

    if blocked:
        msg = f"{len(blocked)} plugin(s) the target cannot load: {', '.join(blocked)}"
        if strict:
            sys.exit(f"FAIL: {msg} (--strict-abi)")
        log(f"  warn: {msg}")
    return found


def report_repositories(src):
    """Print <PluginRepositories> from system.xml.

    Repositories are a SERVER setting inside system.xml, not a per-plugin one,
    so they travel with that file rather than needing their own step. Printed
    because "the repositories came across" is otherwise invisible until someone
    opens the catalogue and finds it empty.
    """
    system = src / "config" / "system.xml"
    if not system.exists():
        log("repositories: no config/system.xml in the snapshot")
        return
    try:
        root = ET.parse(system).getroot()
    except ET.ParseError as exc:
        log(f"repositories: system.xml does not parse ({exc})")
        return
    repos = root.findall(".//RepositoryInfo")
    if not repos:
        log("repositories: none configured (the built-in catalogue only)")
        return
    for repo in repos:
        name = (repo.findtext("Name") or "?").strip()
        url = (repo.findtext("Url") or "?").strip()
        enabled = (repo.findtext("Enabled") or "true").strip()
        log(f"  {name:32} {url}  enabled={enabled}")


# ------------------------------------------------------------------- rewrites
def rewrite_system_xml(path, metadata_path, dry_run):
    """Repoint <MetadataPath> at somewhere the target pod can actually write."""
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        sys.exit(f"FAIL: {path} does not parse ({exc})")
    root = tree.getroot()
    node = root.find("MetadataPath")
    before = node.text if node is not None else None
    if node is None:
        node = ET.SubElement(root, "MetadataPath")
    node.text = metadata_path
    log(f"  MetadataPath: {before!r} -> {metadata_path!r}")
    if before and before != metadata_path:
        log("  ⚠️ image paths are stored ABSOLUTE in the database -- existing artwork")
        log("     will 404 on this instance until a metadata refresh rebuilds it.")
    if not dry_run:
        tree.write(path, encoding="utf-8", xml_declaration=True)


def rewrite_network_xml(path, clear, dry_run):
    """Report, and optionally clear, bind addresses the target cannot hold."""
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        log(f"  network.xml does not parse ({exc}) -- left alone")
        return
    root = tree.getroot()
    node = root.find("LocalNetworkAddresses")
    addresses = [e.text for e in node.findall("string")] if node is not None else []
    if not addresses:
        log("  LocalNetworkAddresses: empty (binds every interface) -- nothing to do")
        return
    log(f"  LocalNetworkAddresses: {addresses}")
    if not clear:
        log("  ⚠️ jellyfin-pg has NO ipvlan interface on the Home LAN. If any address above")
        log("     belongs to jellyfin-lan-net, this server will fail to bind and never start.")
        log("     Re-run with --clear-bind-addresses to empty the list.")
        return
    for e in list(node.findall("string")):
        node.remove(e)
    log("  cleared -- the server will bind every interface it has")
    if not dry_run:
        tree.write(path, encoding="utf-8", xml_declaration=True)


# ---------------------------------------------------------------------- copy
def preserved_paths(dst, rel):
    """Target-side paths under `rel` that must survive the replace."""
    out = []
    for keep in PRESERVE:
        if keep.startswith(rel + "/") and (dst / keep).exists():
            out.append(keep)
    if rel == "plugins" and (dst / rel).is_dir():
        # The provider's plugin directory belongs to the target, not the source.
        for entry in (dst / rel).iterdir():
            if entry.is_dir() and PROVIDER_PLUGIN.search(entry.name):
                out.append(f"{rel}/{entry.name}")
    return sorted(out)


def carry(src, dst, dry_run):
    """Replace dst with src, one carried subtree at a time.

    Replace rather than merge: a merge leaves whatever a previous run or a
    running server put there, and "the plugin is an old version because the
    directory from the last attempt is still present" is not a failure anyone
    enjoys diagnosing.

    Nothing outside CARRY_DIRS is touched, and nothing in PRESERVE is lost: each
    preserved path is moved out of the way, the subtree is replaced, and it is
    moved back.
    """
    copied = skipped = 0
    stash_root = dst / ".config-sync-stash"

    for rel in CARRY_DIRS:
        s = src / rel
        d = dst / rel
        if not s.is_dir():
            log(f"  {rel:24} absent in the snapshot -- skipped")
            continue

        keep = preserved_paths(dst, rel)
        for k in keep:
            log(f"  KEEP {k} -- the target's own copy, held across the replace")

        def ignore(directory, names):
            """Never copy the source's version of anything preserved."""
            nonlocal skipped
            out = []
            for name in names:
                path = os.path.join(directory, name)
                rel_path = os.path.relpath(path, src)
                if rel_path in PRESERVE:
                    log(f"  SKIP {rel_path} (source's copy) -- the target's own must win")
                    out.append(name)
                    skipped += 1
                elif rel == "plugins" and os.path.isdir(path) and PROVIDER_PLUGIN.search(name):
                    log(f"  SKIP plugins/{name} -- the entrypoint manages the provider plugin")
                    out.append(name)
                    skipped += 1
            return out

        if dry_run:
            n = sum(1 for p in s.rglob("*") if p.is_file() and str(p.relative_to(src)) not in PRESERVE)
            log(f"  {rel:24} would carry {n} file(s)")
            copied += n
            continue

        for k in keep:
            stashed = stash_root / k
            stashed.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(dst / k), str(stashed))

        if d.exists():
            shutil.rmtree(d)
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(s, d, ignore=ignore, symlinks=True)
        n = sum(1 for p in d.rglob("*") if p.is_file())
        copied += n
        log(f"  {rel:24} carried {n} file(s)")

        for k in keep:
            target_path = dst / k
            if target_path.exists():
                # copytree's ignore should have prevented this; if the source
                # grew a path that collides with a preserved one, the target's
                # copy still wins.
                if target_path.is_dir():
                    shutil.rmtree(target_path)
                else:
                    target_path.unlink()
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(stash_root / k), str(target_path))

    if stash_root.exists():
        shutil.rmtree(stash_root, ignore_errors=True)
    return copied, skipped


def checkpoint(db):
    """Fold a hot copy's WAL into the .db, so the .db alone is complete.

    These came out of a snapshot taken while Jellyfin was running, so recent
    writes may still be in the -wal beside them -- 3.9 MB of them for
    infuse_sync.db on 2026-09-21. Copying the .db without doing this silently
    drops those writes. Runs against the restored COPY in /work, never the
    target. Returns a short status for the log line.
    """
    wal = db.with_name(db.name + "-wal")
    if not wal.exists():
        return "no WAL"
    wal_size = wal.stat().st_size
    con = sqlite3.connect(str(db))
    try:
        busy, _, _ = con.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if busy:
            sys.exit(f"FAIL: {db.name}: wal_checkpoint busy -- the copy is not standalone")
        quick = con.execute("PRAGMA quick_check").fetchone()[0]
        if quick != "ok":
            sys.exit(f"FAIL: {db.name}: quick_check {quick!r} -- the hot copy is torn")
    finally:
        con.close()
    return f"WAL {wal_size / 1048576:.1f} MiB folded in, quick_check ok"


def carry_plugin_databases(src, dst, dry_run):
    """The plugins' own SQLite files, which the provider never sees."""
    s = src / "data"
    if not s.is_dir():
        return 0
    n = 0
    for db in sorted(s.glob("*.db")):
        if db.name in NOT_PLUGIN_DATA:
            continue
        if dry_run:
            wal = db.with_name(db.name + "-wal")
            status = f"WAL {wal.stat().st_size / 1048576:.1f} MiB to fold in" if wal.exists() else "no WAL"
        else:
            status = checkpoint(db)
        size = db.stat().st_size
        log(f"  {db.name:38} {size / 1048576:8.1f} MiB  ({status})")
        if not dry_run:
            (dst / "data").mkdir(parents=True, exist_ok=True)
            # Clear any stale sidecars a previous run or server left, so the
            # target's copy is not paired with somebody else's WAL.
            for sidecar in ("-wal", "-shm"):
                stale = dst / "data" / (db.name + sidecar)
                if stale.exists():
                    stale.unlink()
            shutil.copy2(db, dst / "data" / db.name)
        n += 1
    if n == 0:
        log("  none found")
    return n


# Plugin settings files worth rewriting. Assemblies and anything else binary
# are never touched -- a byte substitution inside a DLL is a corrupt DLL.
TEXT_SUFFIXES = {".xml", ".json", ".yaml", ".yml", ".txt", ".conf", ".ini"}


def host_pattern(host):
    """Match `host` as a whole hostname, never as part of a longer one.

    Without the boundaries, `jellyfin.driscoll.tech` would also match inside
    `myjellyfin.driscoll.tech` or `jellyfin.driscoll.tech.example`, and the
    already-correct `jellyfin-pg.driscoll.tech` is kept safe only by accident.
    Bytes, not str: the XML is rewritten in place without a decode/encode round
    trip, so a BOM or an odd encoding .NET wrote comes through unchanged.
    """
    return re.compile(
        rb"(?<![A-Za-z0-9.-])" + re.escape(host.encode()) + rb"(?![A-Za-z0-9-]|\.[A-Za-z0-9])",
        re.IGNORECASE,
    )


def rewrite_hosts(root, pairs, dry_run):
    """Point plugin settings at THIS instance instead of production.

    A carried plugin configuration still names production: a webhook's server
    URL, a sync plugin's callback, Streamyfin's published address. Left alone,
    jellyfin-pg's plugins would talk to -- or hand clients links to --
    production Jellyfin. Only plugins/ is rewritten; server settings under
    config/ and the plugins' own SQLite databases are scanned and REPORTED, so
    a reference there is visible rather than silently changed or silently kept.
    """
    patterns = [(host_pattern(old), new.encode(), old, new) for old, new in pairs]
    total = 0

    plugins_dir = root / "plugins"
    files = []
    if plugins_dir.is_dir():
        files = sorted(
            p for p in plugins_dir.rglob("*")
            if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES and not PROVIDER_PLUGIN.search(str(p.relative_to(root)))
        )
    for path in files:
        blob = path.read_bytes()
        out = blob
        hits = []
        for rx, new_b, old, new in patterns:
            out, n = rx.subn(new_b, out)
            if n:
                hits.append(f"{old} -> {new} x{n}")
                total += n
        if hits:
            log(f"  {path.relative_to(root)}: {', '.join(hits)}")
            if not dry_run:
                path.write_bytes(out)
    if total == 0:
        log("  no plugin setting names a production hostname")
    else:
        log(f"  {total} reference(s) {'would be ' if dry_run else ''}rewritten")

    # Report-only: outside the plugin settings the rewrite was asked for.
    report = []
    config_dir = root / "config"
    if config_dir.is_dir():
        report += sorted(p for p in config_dir.rglob("*") if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES)
    data_dir = root / "data"
    if data_dir.is_dir():
        report += sorted(p for p in data_dir.glob("*.db") if p.name not in NOT_PLUGIN_DATA)
    for path in report:
        blob = path.read_bytes()
        found = [old for rx, _, old, _ in patterns if rx.search(blob)]
        if found:
            log(f"  warn: {path.relative_to(root)} still names {', '.join(found)} -- NOT rewritten")
    return total


def apply_ownership(dst, spec, dry_run):
    uid, _, gid = spec.partition(":")
    uid, gid = int(uid), int(gid)
    n = 0
    for path in [dst, *dst.rglob("*")]:
        if not dry_run:
            os.chown(path, uid, gid, follow_symlinks=False)
        n += 1
    log(f"  {n} path(s) -> {uid}:{gid}")


def main():
    args = parse_args()
    src = resolve_source(args)
    dst = pathlib.Path(args.target)

    if not src.is_dir():
        sys.exit(f"FAIL: source {src} is not a directory")
    if not dst.is_dir():
        sys.exit(f"FAIL: target {dst} is not a directory -- mount jellyfin-pg's config PVC there")
    if not (dst / "config" / "database.xml").exists():
        # The single clearest signal that --target is the right volume: only a
        # started jellyfin-pg has this file, and only its own copy names the
        # PostgreSQL provider. Writing production's config onto the wrong volume
        # -- production's own, say -- is the one unrecoverable mistake here.
        sys.exit(
            f"FAIL: {dst}/config/database.xml is missing.\n"
            f"      That file is written by the fork's entrypoint on every start, so a\n"
            f"      jellyfin-pg config volume always has one. Either --target is not\n"
            f"      jellyfin-pg's volume, or jellyfin-pg has never started. Refusing to write."
        )

    log(f"source: {src}")
    log(f"target: {dst}")
    if args.dry_run:
        log("DRY RUN -- nothing will be written")

    log("\n=== plugins in the snapshot ===")
    report_plugins(src, args.server_version, args.strict_abi)

    log("\n=== plugin repositories (system.xml) ===")
    report_repositories(src)

    log("\n=== carrying config, plugins, libraries ===")
    copied, skipped = carry(src, dst, args.dry_run)

    if args.no_plugin_data:
        log("\n=== plugin databases: skipped (--no-plugin-data) ===")
    else:
        log("\n=== plugin databases ===")
        carry_plugin_databases(src, dst, args.dry_run)

    log("\n=== rewrites on the target ===")
    # A dry run copied nothing, so the rewrites are shown against the SOURCE's
    # copies -- same values, and nothing is written either way.
    xml_root = src if args.dry_run else dst
    system_xml = xml_root / "config" / "system.xml"
    if system_xml.exists():
        rewrite_system_xml(system_xml, args.metadata_path, args.dry_run)
    else:
        log(f"  no config/system.xml under {xml_root} -- nothing was carried?")
    network_xml = xml_root / "config" / "network.xml"
    if network_xml.exists():
        rewrite_network_xml(network_xml, args.clear_bind_addresses, args.dry_run)

    if args.rewrite_host:
        pairs = []
        for spec in args.rewrite_host:
            old, sep, new = spec.partition("=")
            if not sep or not old or not new:
                sys.exit(f"FAIL: --rewrite-host {spec!r} is not OLD=NEW")
            pairs.append((old.strip(), new.strip()))
        log("\n=== hostnames in plugin settings ===")
        rewrite_hosts(xml_root, pairs, args.dry_run)

    if args.chown:
        log("\n=== ownership ===")
        apply_ownership(dst, args.chown, args.dry_run)

    log(f"\nconfig-sync: OK -- {copied} file(s) carried, {skipped} deliberately skipped")
    log("jellyfin-pg may be scaled back up. Its entrypoint rewrites database.xml on start.")


if __name__ == "__main__":
    main()
