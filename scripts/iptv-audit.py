#!/usr/bin/env python3
"""Audit the live-TV lineup exactly as Jellyfin sees it.

Reads Dispatcharr's public M3U + XMLTV output (no credentials needed) and
reports, for every channel outside the 24/7 loop block:

  * no guide in the next 24h
  * logo missing or not resolving (Dispatcharr's logo cache 404s when the
    logo row was cleaned up -- e.g. Teamarr's cleanup_unused_logos)
  * West channels whose guide is not the East guide shifted +3h
  * guides that only say "Channel No Longer Available"

It does NOT probe streams: the main provider allows 2 connections and Dispatcharr
keeps a channel's upstream open after the client leaves, so a sweep reads as
a wall of 503s. See docs/kubernetes/iptv.md.

Usage: python3 scripts/iptv-audit.py [--base https://dispatcharr.driscoll.tech]
"""

import argparse
import collections
import concurrent.futures
import datetime
import io
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

SKIP_GROUPS = {"24/7 Streams"}
WEST_SHIFT_HOURS = 3

# West channels whose network no longer publishes a West schedule anywhere
# (in any EPG source), so they carry the national
# guide on purpose. Reported separately instead of as mislinks. Keyed by
# channel number; see docs/kubernetes/iptv.md "East / West rules".
KNOWN_NO_WEST_GUIDE: set[int] = set()


def fetch(url: str, expect: bytes, timeout: int = 180) -> bytes:
    # Dispatcharr occasionally answers with the error-pages HTML while it
    # regenerates output; retry rather than parse a 404 page as XMLTV.
    for attempt in range(3):
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = r.read()
        if expect in body[:512]:
            return body
        time.sleep(10 * (attempt + 1))
    raise SystemExit(f"{url} did not return {expect!r} after 3 attempts")


def parse_m3u(text: str) -> list[dict]:
    channels = []
    for line in text.splitlines():
        if not line.startswith("#EXTINF"):
            continue
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', line))
        attrs["name"] = attrs.get("tvg-name", "").split(" : ", 1)[-1]
        attrs["number"] = float(attrs.get("tvg-chno") or 0)
        channels.append(attrs)
    return channels


def parse_epg(xmltv: bytes) -> dict[str, list[tuple[datetime.datetime, str]]]:
    programmes = collections.defaultdict(list)
    for _, el in ET.iterparse(io.BytesIO(xmltv)):
        if el.tag == "programme":
            start = datetime.datetime.strptime(el.get("start"), "%Y%m%d%H%M%S %z")
            programmes[el.get("channel")].append((start, el.findtext("title") or ""))
            el.clear()
    return programmes


def base_name(name: str) -> str:
    name = re.sub(r"\[.*?\]|\((east|west)\)|&amp;", "", name, flags=re.I)
    return re.sub(r"\s+", " ", name).strip().lower()


def west_offset(west, east) -> int | None:
    """Most common whole-hour offset between identically titled programmes."""
    by_title = collections.defaultdict(list)
    for start, title in east:
        by_title[title].append(start)
    offsets = collections.Counter()
    for start, title in west:
        for east_start in by_title.get(title, []):
            seconds = (start - east_start).total_seconds()
            hours = round(seconds / 3600)
            # Exact alignment only: rerun-heavy channels (Comedy Central,
            # TV Land) repeat titles every hour and would match anything.
            if -1 <= hours <= WEST_SHIFT_HOURS + 1 and abs(seconds - hours * 3600) < 300:
                offsets[hours] += 1
    return offsets.most_common(1)[0][0] if offsets else None


def logo_status(url: str) -> str:
    if not url:
        return "none"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return "ok" if r.status == 200 else str(r.status)
    except Exception as ex:  # noqa: BLE001 -- report, don't crash the audit
        return str(ex)[:40]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://dispatcharr.driscoll.tech")
    args = parser.parse_args()

    channels = [c for c in parse_m3u(fetch(f"{args.base}/output/m3u", b"#EXTM3U").decode()) if c.get("group-title") not in SKIP_GROUPS]
    programmes = parse_epg(fetch(f"{args.base}/output/epg", b"<tv"))
    now = datetime.datetime.now(datetime.timezone.utc)
    horizon = now + datetime.timedelta(hours=24)

    print(f"{len(channels)} channels outside {', '.join(SKIP_GROUPS)}\n")

    print("== No guide in the next 24h")
    for c in channels:
        upcoming = [p for p in programmes[c["tvg-id"]] if now - datetime.timedelta(hours=4) < p[0] < horizon]
        if not upcoming:
            print(f"  {c['number']:>6.0f}  {c['name']}")
        elif {t for _, t in upcoming} == {"Channel No Longer Available"}:
            print(f"  {c['number']:>6.0f}  {c['name']}  (guide says: Channel No Longer Available)")

    print("\n== West channels vs their East partner")
    known: list[str] = []
    east = {base_name(c["name"]): c for c in channels if not re.search(r"\bwest\b", c["name"], re.I)}
    for c in channels:
        if not re.search(r"\(west\)", c["name"], re.I):
            continue
        partner = east.get(base_name(c["name"]))
        if not partner:
            print(f"  {c['number']:>6.0f}  {c['name']:<36} no East partner in lineup")
            continue
        offset = west_offset(programmes[c["tvg-id"]], programmes[partner["tvg-id"]])
        if offset != WEST_SHIFT_HOURS and int(c["number"]) in KNOWN_NO_WEST_GUIDE:
            known.append(f"{c['number']:.0f}")
        elif offset != WEST_SHIFT_HOURS:
            print(f"  {c['number']:>6.0f}  {c['name']:<36} offset {'none' if offset is None else f'{offset:+d}h'} (want +{WEST_SHIFT_HOURS}h) -- check its EPG link")

    if known:
        print(f"  (no West guide exists upstream, national guide on purpose: {', '.join(known)})")

    print("\n== Logos missing or not resolving")
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        for c, status in zip(channels, pool.map(lambda c: logo_status(c.get("tvg-logo", "")), channels)):
            if status != "ok":
                print(f"  {c['number']:>6.0f}  {c['name']:<45} {status}")


if __name__ == "__main__":
    main()
