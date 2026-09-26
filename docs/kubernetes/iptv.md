# IPTV / Live TV

How the live-TV lineup is put together, what keeps it healthy, and how to fix
it when the guide goes blank, a channel goes dead or a logo disappears. Written
after the 2026-09-24 clean-up, when all three had happened at once. Updated
2026-09-26 with the free stream sources and a guide-coverage pass.

## What is where

| Piece | Where | What it does |
| --- | --- | --- |
| Dispatcharr | [`kubernetes/apps/equestria/pvr/dispatcharr/`](../../kubernetes/apps/equestria/pvr/dispatcharr/) — `dispatcharr.driscoll.tech` | The source of truth: M3U accounts, EPG sources, channels, logos, channel profiles. Serves the M3U/XMLTV/HDHR that Jellyfin reads. |
| ECM (Enhanced Channel Manager) | [`kubernetes/apps/equestria/pvr/ecm/`](../../kubernetes/apps/equestria/pvr/ecm/) — `ecm.driscoll.tech` | Curation UI and automation on top of Dispatcharr. Its MCP sidecar is `toolhive-ecm_*` in agent-tools. |
| Teamarr | [`kubernetes/apps/equestria/pvr/teamarr/`](../../kubernetes/apps/equestria/pvr/teamarr/) — `teamarr.driscoll.tech` | Sports: builds per-game event channels (1000+) and per-team channels (409-422) in Dispatcharr, plus their XMLTV. Its MCP is `toolhive-teamarr_*`. |
| game-thumbs | [`kubernetes/apps/equestria/pvr/game-thumbs/`](../../kubernetes/apps/equestria/pvr/game-thumbs/) — `dispatcharr-thumbs.driscoll.tech` | Renders matchup/team logos. Teamarr's `epg.art_base_url` points here. |
| xcproxy | [`kubernetes/apps/equestria/pvr/xcproxy/`](../../kubernetes/apps/equestria/pvr/xcproxy/) | Besides the VOD proxy, serves static M3Us from [`playlists.sops.yaml`](../../kubernetes/apps/equestria/pvr/xcproxy/playlists.sops.yaml) at `/playlists/<key>`, one file per Secret key. Dispatcharr's USNewsON account reads `http://xcproxy.equestria.svc.cluster.local:8080/playlists/usnewson.m3u`. |
| Teamarr MCP | [`kubernetes/apps/agents/agent-tools-servers/teamarr.yaml`](../../kubernetes/apps/agents/agent-tools-servers/teamarr.yaml) | `ghcr.io/lukeeexd/teamarr-mcp`; writes allowed, destructive tools off. |

All of `equestria` is shed nightly 02:00-09:00 local
([power states](../cluster-consolidation/24-power-states.md)); ECM, Teamarr and
both MCPs are unreachable then. Dispatcharr is excluded from the shed.

## Inputs

**M3U accounts:** one main provider carries almost all live streams, with a
backup provider and a VOD account alongside it. A few older accounts are
disabled or in an error state and unused.

**USNewsON** (MSNOW, CNN, Fox News) has no connection limit, so its stream is
the **primary** on channels 1, 10 and 12. The playlist lives in xcproxy (above).
Its upstream refuses any request without `Referer: https://usnewson.com/`
(403), and Dispatcharr only ever sends a User-Agent. Those three channels
therefore use stream profile 8, **ffmpeg (USNewsON Referer)**: the stock ffmpeg
profile plus `-referer https://usnewson.com/`, which ffmpeg's HLS demuxer also
sends on segment requests. Set it on the channel **and** on the USNewsON
streams. Channel playback uses the channel's profile (Dispatcharr ignores a
per-stream profile there), and failover to the provider's backup streams uses
it too. The UI's direct stream preview uses the stream's profile. The
`#referer=…&origin=…` fragment still on the playlist URLs is harmless to
ffmpeg. The **Wrapper** profile (dispatchwrapparr, `/data/dispatchwrapparr/` on
the PVC) also plays them by turning that fragment into headers, but Dispatcharr
then records no codec, resolution or bitrate, so it is not used. The upstream
hosts (`sN.usnlive.com`) rotate. On 2026-09-24 `s5`
(MSNBC) and `s6` (Fox News) were down while `s15` served all three, so the
playlist carries `s15` alternates. Edit `playlists.sops.yaml` with `sops`; the
pod picks up the change without a restart.

**Free sources** (added 2026-09-25), all `max_streams: 0` (no connection limit):

| Account | Playlist | Refresh |
| --- | --- | --- |
| iptv-org Canada / United States / United Kingdom | `https://iptv-org.github.io/iptv/countries/{ca,us,uk}.m3u` | 24 h |
| Pluto TV United States / Canada | [BuddyChewChew/pluto](https://github.com/BuddyChewChew/pluto) `pluto_us.m3u` / `pluto_ca.m3u` | **6 h** |

They add about 2,700 streams and no channels (auto channel sync is off on every
group). Where one carries exactly what a lineup channel carries, its stream is
first on that channel; see *Free streams first*. Pluto needs the short refresh.
Every Pluto URL carries a session JWT that expires 24 h after it was minted, and
the upstream repo regenerates the playlists every 5-7 h. The URL changing on
every refresh is safe: Dispatcharr's `m3u_hash_key` is `tvg_id,m3u_id,name`, so
a refresh rewrites each stream's URL in place and its stream id, and every
channel link to it, stays. Pluto's Canada streams play from equestria's US
egress.

**EPG sources** — what actually feeds the guide:

| Source | Feeds |
| --- | --- |
| The main provider's own EPG | Its streams, matching its `*.us` tvg-ids. **Refreshes every 6 h**: the file reaches only ~28 h ahead, so at 24 h the guide on ~90 channels ran out around 12:00 UTC every day (fixed 2026-09-26). |
| A secondary national EPG | Most national cable/premium rows, including the `*west.us` rows. **It is a trial feed — if it stops refreshing, most cable/premium channels lose their guide.** |
| Teamarr's XMLTV endpoint | Event + team channels. Teamarr's `dispatcharr.epg_id` must point at **this** source. |
| A West-supplement EPG | The West guides the secondary EPG lacks: `Syfy.HD.(Pacific).us2`, `TNT.HD.(Pacific).us2`, `USA.Network.HD.(Pacific).us2` (added 2026-09-24) |
| Gracenote US Locals | Local stations, keyed by **Gracenote station id** (`21103`, `43730`...) |
| Gracenote US | National channels |
| Gracenote Canada | Canadian channels |
| Gracenote UK | Unused |
| Gracenote Ireland | Unused |
| iptv-epg.org Canada / UK / US (`https://iptv-epg.org/files/epg-{ca,gb,us}.xml.gz`) | Unused (added 2026-09-25). Loaded as a fallback; the free playlists' tvg-ids (`Name.us@SD`) mostly don't match its ids. |
| Pluto TV ([i.mjh.nz](https://github.com/matthuisman/i.mjh.nz) `PlutoTV/all.xml.gz`) | Unused (added 2026-09-25), 6 h refresh. For the 24/7 news channels Pluto streams, its guide is only the channel name every 15 minutes. |
| Twitch | Channel 9000 |

The gracenote sources come from a public EPG aggregator that moved hosts and
renamed every file in 2026-09; the old URLs stopped serving guides while
Dispatcharr kept reporting them as `success` (the sources still carry the old
host's name in Dispatcharr). All of them are on the gracenote flavour now. The
aggregator publishes each guide in a gracenote flavour (channel id = Gracenote
station id) and an iptv flavour (channel id = `name.cc`), plus 14- and 3-day
variants and per-market files. **The flavour decides which tvg-ids match** — a
channel linked to `21103` needs a gracenote file.

## Channel map

| Numbers | Group | What |
| --- | --- | --- |
| 1-22 | United States | News + a few nationals |
| 63-94 | United States | Locals: Raleigh, Wilmington, Greensboro, Minneapolis, Denver, LA, Seattle |
| 103-118 | Canada | Edmonton/Alberta: CTV Comedy (103), locals, CTV2 Alberta, OMNI Prairies, CityNews Alberta, CBC News Edmonton |
| 120-128 | Canada | Toronto/Ontario: OMNI 1/2, CHCH, TVO, YES TV, CP24, CityNews and CBC News Toronto (the big-four Toronto locals stay at 108-113) |
| 130-137 | Canada | National news: CBC News Network, CTV News Channel, Global National, CityNews 24/7, CPAC, BNN Bloomberg, Weather Network, APTN |
| 140-199 | Canada | English specialty: CTV/Corus/Rogers entertainment, lifestyle, factual, Crave/HBO/Starz/Super Channel, kids |
| 200-282 | Movies | HBO/Cinemax/Starz/Showtime/MGM+/MoviePlex etc., **East and West as separate channels** |
| 283-305 | Movies | Added 2026-09-24: The Movie Channel + Xtra, IndiePlex E/W, SundanceTV E/W, IFC, HBO Latino, ScreenPix x4, Showtime/SHOxBET/MGM+ **West** feeds, Cinemax Classics, Cinemax Spanish |
| 409-414 | Sports | Teamarr-managed **team** channels (one per team per league) |
| 512-645 | USA Premium | Cable networks; `(West)` variants next to their East channel |
| 1000+ | Sports | Teamarr **event** channels, created and deleted per game |
| 2009-2032 | Sports | Sports networks (ESPN, FS1, TSN, Sportsnet...) |
| 3000+ | 24/7 Streams | Single-show loop channels; no real guide exists for them |
| 9000 | Twitch | Twitch |

## East / West rules

A West channel is the East network time-shifted 3 hours. To keep them correct:

1. **Streams:** a `(West)` channel takes only streams whose name says `WEST` /
   `(West)`; an East channel never does. Provider naming families that have
   been reliable: `US: <NAME>` (East) and `US: <NAME> WEST` (West), with
   `US <Name> (East) (H)` as a backup.
2. **Guide:** a West channel links to the `<name>west.us` row, never to the
   East row. `ecm_audit_epg_duplicates` lists every set of channels sharing one
   EPG row — that is the fingerprint of a West channel pointed at the wrong
   guide. Intentional shares: alt feeds (`Aspire (A)`, `PixL (S)`...) and
   East/West pairs that have no West row anywhere (below).
3. **Where West rows live.** The secondary national EPG has `<name>west.us` for
   most networks. For the rest, look in **the gracenote US file**: its
   `(Pacific)` rows are keyed by Gracenote station id (VH1 HD (Pacific) is
   `64634`, HBO Movies HD (Pacific) is `59847`, the Showtime family's `*HD
   (Pacific)` rows...). The West-supplement EPG supplies USA/TNT/SYFY West
   (`*.HD.(Pacific).us2`). To search gracenote US, grep the display names;
   don't parse it. It is served **uncompressed, several GB, despite the `.gz`
   name**:

   ```bash
   curl -so gn.xml "<gracenote US source URL from Dispatcharr>"
   LC_ALL=C grep -A3 -iE '<display-name>VH1[^<]*</display-name>' gn.xml
   ```

   Gracenote also tracks **renames**: HBO Family is now *HBO Movies*, Starz
   Kids & Family is *Starz Kids*, 5StarMAX is *Cinemax Classics*, MAX Latino is
   *Cinemax Spanish*, and Showtime's main channel is *Paramount+ with Showtime*.
   ThrillerMAX, OuterMAX and MovieMAX no longer exist.
4. **Some West feeds were dropped upstream.** No source (the secondary EPG, the
   West supplement, gracenote, the provider's own EPG) has a West schedule for
   Starz in Black or the Starz multiplex channels (Cinema, Comedy, Edge, Encore
   Action / Black / Classic / Family / Suspense). The secondary EPG marks their
   `*west.us` rows "Channel No Longer Available". Their `... WEST` streams still
   played, but with no West guide they were just duplicates of East, so
   channels 256, 258, 260, 266, 268, 270, 272, 274 and 278 were **deleted on
   2026-09-24**, along with 280 Starz Kids & Family West (dead stream, network
   renamed). Don't re-add them unless a real West schedule appears.
5. **Check it with `scripts/iptv-audit.py`**, not by eye. It pairs each West
   channel with its East partner and reports any whose guide is not the East
   guide shifted +3h (matched on identically titled programmes that line up to
   the minute). Rerun-heavy channels would match anything on titles alone.
   **Live sports read as +0h.** Both feeds air a live game at the same moment.
   On 2026-09-26 TNT (West) was flagged that way over a weekend of NHL, college
   football and AEW, while its non-live programmes were correctly +3h. Compare
   the non-live rows before relinking a flagged West channel.

## What went wrong in 2026-09 (so it is recognisable next time)

- **Dead channels, especially West and movie channels.** The provider
  re-numbered its streams and dozens of channels were left with zero streams.
  ECM's `match_streams_to_channels` found nothing even at score 0.3, so they
  were re-attached by hand from `bulk_search_streams`.
- **Blank guide on locals.** The EPG aggregator's old URLs stopped serving
  guides (the files moved and were renamed), but Dispatcharr still reports the
  sources as `success` — nothing alerted.
- **Blank guide on cable/premium.** Channels were linked to EPG rows from those
  dead sources, or to rows Dispatcharr never loaded programmes for.
  **Dispatcharr only stores programmes for rows linked to a channel at refresh
  time** — after re-linking, refresh the source or the channel stays blank.
- **West channels linked to the wrong guide** (USA/TV Land/Oxygen West on `nickelodeonwest.us`,
  TNT/VH1 West on `animalplanetwest.us`...), and East channels carrying
  `*west.us` ids (TBS, Bravo, Food, Disney...).
- **Team channels without logos.** 409-421 were hand-made Dispatcharr channels
  with no logo and no owner. They were converted to Teamarr-managed teams
  (template 2, `team_channel_logo_url` → game-thumbs) so Teamarr sets and keeps
  the logo. By the late review only a few of them were still in Teamarr; see
  *State after the 2026-09-24 changes*.
- **Teamarr `dispatcharr.epg_id` pointed at the provider's EPG** instead of
  Teamarr's own, so every generation refreshed the full provider guide and
  looked for its own `teamarr-*` rows there. `cleanup_unused_logos` was off,
  leaving hundreds of per-game logos behind.

## Connection budget (why "West doesn't work")

**The main provider allows `max_streams: 2`, and nearly every premium, movie
and West channel has only that provider's streams.** A third tune fails with
`No stream available for channel ...: All active M3U profiles have reached
maximum connection limits` in the Dispatcharr log and a `503` to the client,
which Jellyfin shows as a channel that will not play. Dispatcharr also keeps a
channel's upstream open for a while after the last client leaves. So hopping
East -> West -> another movie channel can use up both slots with nothing
actually being watched.

On 2026-09-24 a sequential probe of the movie/West channels failed about half
of them with `503`. VH1 West, one of the "dead" ones, played fine after a 60 s
pause. **A channel that 503s is not dead until it fails with nothing else
playing.** `scripts/iptv-audit.py` deliberately does not probe streams for this
reason.

Levers, cheapest first:

- **2 is the plan's real limit** (confirmed 2026-09-24), so `max_streams: 2` on
  the main provider's M3U account is correct. Don't raise it: the provider
  would refuse the third connection instead of Dispatcharr.
- **The backup provider as backup.** It carries a few dozen East/national
  channels and **no West feeds**. On 2026-09-24 its stream was appended as the
  last stream on every lineup channel it carries (including FX/FXX/FXM, Starz
  East, USA, LMN, IFC, TSN 1-5, the LA and NY locals). When both main-provider
  slots are busy, those East channels fail over to the backup instead of
  failing. That leaves the main provider's slots for the West and premium
  channels only it has. When adding a channel the backup carries, add its
  backup stream last.
- **Free streams first.** Eleven channels now start on a verified free stream
  with no connection limit, so watching them uses no main-provider slot unless
  the free stream fails over. See *Free streams first*.
- Dispatcharr's channel shutdown delay (Settings -> Proxy,
  `channel_shutdown_delay`) is already `0` (checked 2026-09-26).

**Stream order on a channel** (failover goes down the list):

1. Unlimited sources: USNewsON, and free streams verified as the same channel
   (see *Free streams first*).
2. Main-provider feeds of that exact network and feed. Existing, proven streams
   come first, then `US: <NAME>`, `(H)`, `USA`, `(S)`/`(A)`, and the
   `(US) (X2)`/`(US) (CX)` families.
3. Prime/Tubi FAST versions. On locals these are usually news-only loops, not
   the station's broadcast, so they are a last resort.
4. The backup provider, highest resolution first.

## State after the 2026-09-24 changes

Applied through the ECM and Teamarr MCPs (`toolhive-ecm_*`, `toolhive-teamarr_*`):

| Area | State |
| --- | --- |
| Backup-provider streams | Backup stream appended to every lineup channel the backup provider carries. See *Connection budget*. |
| Teamarr | `epg.cron_expression` moved from `0 6,18 * * *` (06:00 was inside the shed, so it never ran) to **`0 10,18 * * *`**. The Racing template now has `event_channel_logo_url: {league_code}/leaguelogo.png` and `program_art_url: {league_code}/leaguethumb.png`. game-thumbs serves real league marks there and answers `400` for an unknown league. |
| Team channels | Teamarr owns 409 Hurricanes, 410 Panthers, 411 Hornets, 412 Oilers, 413 Elks and 414 Oil Kings, all with logos. **The Tar Heels were dropped on purpose** (David removed them from Teamarr overnight). The morning re-add of them was a misunderstanding and has been undone: those teams were deleted (Teamarr removed channels 416-422 with them), and the orphan channel at 415 was deleted. Don't bring 415-422 back. |
| Dead guides re-linked (gracenote US) | 643 VH1 West → VH1 HD (Pacific) `64634`, now a real West guide. 222/223 HBO Family E/W → HBO Movies `59845`/`59847`. 279 Starz Kids & Family (East) → `19635`. 623 Smithsonian → Smithsonian HD Network `58532`. The eight Starz multiplex West channels → their national HD rows (see *East / West rules* 4). |
| East/West pairs moved to gracenote US | So each pair's two feeds come from one source and line up at +3h: FX 210/563 → `58574`, FX West 211 → `59814`; HBO Drama 228/229 → `59363`/`59366`; HBO Hits 230/231 → `59368`/`59355` (229-231 had **no link at all**); MoreMAX 237/238 → Cinemax Hits `59373`/`59375` (238 had been linked to an empty provider row). |
| USA West fixed again | 641 had drifted onto a same-named row in the provider EPG (which copies the East schedule) instead of the West supplement's. Now linked by row id to the West-supplement source. See Traps. |
| Starz West | Removed 2026-09-24: 256, 258, 260, 266, 268, 270, 272, 274, 278 (no West schedule anywhere) and 280 (dead stream). See *East / West rules* 4. No West channel now sits on a national guide on purpose; `KNOWN_NO_WEST_GUIDE` in `scripts/iptv-audit.py` is empty and is where one would go. |
| Movies | Channels added at 283-305 (see *Channel map*). Every primary stream was probed OK one at a time before creation. Each has a logo from the guide row, a primary + backup stream where the provider has one, and a guide row from one of the EPG sources above. |
| New-channel gotcha | `ecm_create_channel` puts a new channel in **every** channel profile, including Locals. Movie channels don't belong in Locals, so the new ones were removed from it with `ecm_apply_profile_to_channels(profile_id=<Locals>, enabled=false)`. Do the same for any channel you add. |
| Last guide gaps closed | 103 was named *Comedy Central* but carried **CBS Denver/Greensboro streams**. It is now *CTV Comedy*, with its own CTV Comedy streams, the gracenote Canada row `76863` and its logo. 111 CTV2 Toronto had been linked to CHWI (the Windsor/London CTV2) and is now on *CTV Two - Toronto HD* `72705`. 209 FilmRise Western: no guide source has a `filmrisewestern` id, but the provider EPG has an `US FilmRise Western (S)` row, so that stream is now primary and the channel is linked to that row. 546 CW (Philly) and 2013 ESPN 3 were deleted (no guide exists for either). |
| Renames | 222/223 → *HBO Movies (East/West)*, 279 → *Starz Kids*, matching the networks' current names. |
| Audit | `scripts/iptv-audit.py` is clean: every channel outside 24/7 has a guide and a resolving logo, and every West channel with an East partner is at +3h. |
| Stream review (evening) | Every United States + Movies channel (148) was matched against all ~25k Dispatcharr streams by normalised name, East/West kept apart, with call signs for the locals. 369 missing duplicates were added to 107 channels and each list was reordered per *Stream order on a channel*. 12 streams were removed: MSNBC and a dangling deleted-stream reference on 12 Fox News, CNN International on 10 CNN (moved to 11), a West feed on 224 HBO Signature (East), and a college-football event stream on 67 WRAL. 68/69 WWAY had both held the same mix of ABC and CBS streams; they are now split, ABC-named feeds on 68 and CBS-named ones (incl. `WWAY DT2`) on 69. Renamed multiplex channels carry both names' feeds: ActionMAX + *Cinemax Action*, MoreMAX + *Cinemax Hits*, 5StarMAX + *Cinemax Classics*, HBO Family + *HBO Movies*, BBC World News + *BBC News*. The locals were already complete: every call-sign match was attached. |

## Canada rebuild (2026-09-24, later)

The Canada group was rebuilt from 12 channels to 84: Edmonton + Alberta-wide,
Toronto + Ontario-wide, national news, and English specialty. French and
Calgary/Ottawa/London locals are out of scope on purpose. Station lists came
from [Wikipedia's list of Canadian TV stations](https://en.wikipedia.org/wiki/List_of_television_stations_in_Canada).

- **Streams:** every channel's candidate streams were probed one at a time. Each
  channel has at most 4, with the probe-verified ones first; streams that failed
  a probe were dropped. Only the main provider carries Canadian streams (the
  backup has TSN and nothing else), so no Canada channel has a backup stream.
  Naming families that probed well: `CA <Name> (FL)`, `CA <Name> (D)` and
  `(CA) (PRIME|CITY|GLB) <Name> (FHD)`.
- **Fixed on the old 103-114:**
  - 109 Citytv Toronto carried a *CityNews Toronto* stream (the 24/7 news
    loop, not CITY-DT).
  - 105/112 Global News Edmonton/Toronto were both linked to Global **BC1**'s
    guide.
  - 103's guide link had gone.
  - 111 still pointed at CHWI (Windsor).
  - 107 and 109 had `[Unk]` names.
- **CTV2 Toronto *is* CKVR Barrie.** Gracenote's *CTV Two - Toronto* row is
  CKVR, so 111 carries both the `CTV2 TORONTO` and `CTV2 Barrie` streams. Don't
  add a separate Barrie channel.
- **Guides:**
  - Most channels use Gracenote Canada station ids, linked by `epg_data_id` to
    rows in source 1 (see Traps).
  - HGTV Canada, T+E, Discovery Science, Animal Planet and HBO Canada 2 have no
    Gracenote Canada row and use mybunny's `*.ca` rows.
  - **No guide exists** for the 24/7 news loops: 105 Global News Edmonton, 112
    Global News Toronto, 118 CBC News Edmonton, 128 CBC News Toronto and 132
    Global News National. mybunny maps them onto the over-the-air stations'
    guides, which is the wrong schedule. They are deliberately left unlinked, so
    Dispatcharr gives them its placeholder programmes (titled with the channel
    name). The audit doesn't flag them. Re-checked 2026-09-26: Pluto now
    streams 105, 112, 128 and 132, but its guide rows only repeat the channel
    name. The provider's `CBC News Edmonton Channel` row has no programmes.
    Still no real guide anywhere.
- **Dropped:**
  - OWN Canada (no Canadian guide).
  - ABC Spark (both streams failed their probes).
  - Family Channel (its only guide, mybunny `familychannel.ca`, reads
    "Channel No Longer Available").
  - Yes TV Edmonton (CKES) and OMNI Edmonton (CJEO) as separate feeds (the
    provider has neither; OMNI Prairies is the Alberta OMNI feed).
- **Profiles:** Canada channels are in Plex, UHF and Cable, and not in Locals or
  DebUHF. New channels were set to match.
- **`[Unk]` suffixes:** 156 channel names across all groups ended in `[Unk]`. The
  suffix was stripped by a name-only bulk rename. No current ECM rule, stream
  name or repo file produces it, so it was a leftover from an earlier import.

## Free streams first (2026-09-25)

Every United States and Canada channel was matched against the free sources
(see *Inputs*). A candidate counted only if a frame pulled from it inside the
Dispatcharr pod showed the channel `/output/epg` said was on air at that moment.
Eleven passed, and their free stream now sits first, ahead of the channel's
existing streams, which are unchanged:

| Ch | Channel | Free stream (source) |
| --- | --- | --- |
| 7 | ABC NEWS | ABC News Live (Pluto) |
| 8 | BBC AMERICA | BBC America (iptv-org). MPEG-2 video, so Jellyfin transcodes it. |
| 9 | BBC WORLD NEWS | BBC News (Pluto) |
| 14 | CNBC | CNBC (iptv-org) |
| 20 | SYFY | SYFY East (iptv-org) |
| 105 | Global News Edmonton | Global News Edmonton (Pluto) |
| 112 | Global News Toronto | Global News Toronto (Pluto) |
| 127 | CityNews Toronto | CityNews Toronto (iptv-org, Rogers' own CDN) |
| 128 | CBC News Toronto | CBC News Toronto (Pluto) |
| 132 | Global News National | Global News National (Pluto) |
| 136 | The Weather Network | The Weather Network (Pluto) |

Rejected, and why, so the same candidates aren't re-tried:

- **Local stations' own entries** (iptv-org `ABC KSTP-TV`, `CBS KIRO-TV`,
  `Fox KTTV`...; Pluto `KIRO Seattle`, `FOX LOCAL Los Angeles`, `NBC Los Angeles
  News`) and every `CBS News <city>` are the stations' news-only digital
  streams, not the broadcast. The URLs give it away (`kirobreaking`, Amagi and
  Tubi playout hosts).
- **Labels lie.** iptv-org's "Fox News Channel" is *LiveNOW from Fox*, and its
  "CTV Life Channel" URL is `.../ANIMALPLANETHD/`.
- **Restreams on bare IP addresses** failed or died within minutes (CP24
  answered one probe, then 403'd). MS NOW, Comedy Central, Fox Business, CBS
  East, CTV Toronto, Cottage Life, T+E and CPAC were dead on the day.
- **Geo-blocked:** the CBC local stations (CBXT, CBLT) 403 outside Canada.
- **Right content, wrong presentation:** both sources' *CBC News Network*
  (iptv-org `CBC_News_International`, Pluto *CBC News*) is the live channel
  inside an L-shaped wrapper with a weather sidebar and headline ticker. 130
  kept the provider's full-screen feed first. The same wrapper is the whole
  point of 128 CBC News Toronto, so there it matches.
- **Different feed:** the US History, Nat Geo and C+I feeds for the Canadian
  channels; East-only feeds for 3 Comedy Central (West) and 21 SYFY (West);
  Pluto's own *Comedy Central* and *MTV* channels; CNN Headlines; ABC News
  Live 1-10 (event feeds); APTN Beyond; Super Channel Hearties.

To try another candidate: pull 8-10 s with `ffmpeg -t 8 ... -update 1 x.jpg`
inside the Dispatcharr container (so geo-blocking and reachability match real
playback), look at the frame, and compare it with the channel's current
`/output/epg` programme. Free sources cost no provider connections, so probing
them is safe. Put the stream first with Dispatcharr's API: `PATCH
/api/channels/channels/<id>/ {"streams": [...]}` sets the order exactly. Then
tune the channel through `/proxy/ts/stream/<uuid>`: `/proxy/ts/status` shows
which stream served it.

## Guide pass (2026-09-26)

| Change | Why |
| --- | --- |
| Main-provider EPG refresh 24 h → **6 h** | ~90 channels had only 9-10 h of guide ahead. See *Traps*. |
| 214 FXM → gracenote US FXM `14988` | It had no guide link at all. |
| 644 Viceland → gracenote US *Vice HD* `65732` | It was on mybunny's `vicelandstatic.us`, which is "Viceland Programming" all day. |

After it, every channel outside 24/7 Streams except the five news channels
above has a real guide reaching at least 20 h ahead. The one exception is 635
TV Land (West), via mybunny, at about 19.5 h.

## Plan (open work)

`[UI]` means ECM's MCP cannot do it (see Traps).

1. **Close the audit's blind spots.** `scripts/iptv-audit.py` counts
   Dispatcharr's placeholder programmes as a guide, so an unlinked channel
   passes. It also doesn't check how far ahead a guide reaches, which is how the
   2026-09 part-day blanks went unnoticed. It should flag channels with no
   `epg_data_id` (outside the five known news channels) and guides reaching
   less than ~20 h ahead.
2. **Guardrails.** Rename the gracenote sources off the aggregator's old host
   name and the secondary national EPG off "trial" `[UI]`. Move ECM's 03:00
   probe to after 09:00. Run `scripts/iptv-audit.py` after every change and
   whenever the guide looks off.

## Runbooks

The MCP route (`toolhive-ecm_*`, `toolhive-teamarr_*` from agentboard) is the
quickest; the UI does the same.

**From a laptop where `agent-tools` wants an OAuth login** (or the `toolport-*`
profiles time out), use the in-cluster vMCP. It is unauthenticated and needs
only kubectl:

```bash
kubectl -n agents port-forward svc/vmcp-agent-tools-internal 14483:4483
# then speak streamable-HTTP MCP to http://127.0.0.1:14483/mcp
```

Tools that change several things at once (`apply_profile_to_channels`,
`delete_channel`...) return a preview and a `confirmation_token` first. Repeat
the identical call with the token within 300 s to apply it.

### "Something looks off" -- start here

```bash
python3 scripts/iptv-audit.py
```

It reads the same M3U/XMLTV Jellyfin does (no credentials) and lists channels
with no guide, dead "Channel No Longer Available" guides, West channels not
at +3h, and logos that are missing or 404. It does **not** catch a channel with
no guide link (Dispatcharr fills it with placeholders that the audit counts),
or a guide that runs out part-way through the day; see *Plan* 1.

### "The guide is blank for channel X"

0. **Blank only for part of the day, on many channels at once?** That's a
   source whose file reaches less far ahead than its refresh interval, not a
   bad link. Compare the source's last `<programme stop=...>` with its
   `updated_at` plus `refresh_interval`, and shorten the interval. The main
   provider's EPG did exactly this until 2026-09-26.
1. Get what Jellyfin sees:
   `curl -s http://dispatcharr.equestria.svc.cluster.local:9191/output/epg` and
   count `<programme channel="<number>">` — `ecm_get_epg_grid(channel_id=...)`
   is filtered client-side over a small window and is not reliable for this.
2. `ecm_get_channel` → its tvg-id. Look that id up in the sources (download the
   XMLTV and grep `<channel id="...">`); pick a row with programmes.
3. `ecm_link_channel_epg(channel_id, tvg_id=...)`, then **`ecm_refresh_epg` on
   that row's source** and re-check step 1.
4. If the whole locals block is blank, `curl -sI` the EPG source URLs first — a
   dead source still reports `success` in Dispatcharr.

### "Channel X plays nothing"

0. Stop everything else that is playing and wait a minute, then retry. A `503`
   while two other main-provider channels are open is the connection budget,
   not a dead channel (see *Connection budget*).
1. `ecm_get_streams_for_channel`. Zero streams = provider re-numbering.
2. `ecm_bulk_search_streams` with the network name (and `WEST` for a West
   channel), filtered to the main provider's account. `ecm_add_stream_to_channel`
   a primary and a backup.
3. Probe **one at a time** (`ecm_probe_single_stream`). The provider throttles
   parallel connections: an 8-way bulk probe passes the first 8 streams and
   fails every one after, which looks like a dead lineup but is not.

### "Logo missing"

- A logo URL that 404s (`/api/channels/logos/<id>/cache/`) means the logo
  row is gone, not that the image host is down. Teamarr's
  `cleanup_unused_logos` deletes logos of channels it no longer manages. A
  team/event channel with a 404 logo is usually one Teamarr has lost track of.

- Regular channel: ECM UI → select channels → *Set Logo from EPG*. (The MCP
  `set_logo_from_epg` is broken, see below.)
- Event channel: the event template's `event_channel_logo_url`
  (`{league_code}/{away_team|pascal}/{home_team|pascal}/logo.png?...`) resolved
  against `art_base_url`. A template with an empty logo URL gives a logo-less
  channel.
- Team channel: template 2's `team_channel_logo_url`; run a Teamarr generation.

### Adding a team channel

Expect a logo or two to 404 after the first generation that creates new
channels. That run's `[CLEANUP] Removed N unused logo(s)` step races the
channel creation. Generate again, up to twice, and re-run
`scripts/iptv-audit.py`. game-thumbs itself is fine; test it directly with
`<art_base_url>/<league>/<TeamPascal>/logo.png?style=1&logo=true&fallback=true`.
The team channel `channel_id` convention is `<TeamPascal>.<league slug>`
(e.g. `NorthCarolinaTarHeels.usa.ncaa.w.1`).

`POST /api/v1/teams` (or `toolhive-teamarr_*`) with the provider team id from
`GET /api/v1/cache/teams/search?q=...`, `template_id: 2`,
`managed_channel_enabled: true` and a `managed_channel_number` in 409-4xx. Then
`POST /api/v1/epg/generate` with body `{}`. If it reports *"Requested channel
number N is already occupied"* after you freed the number, Teamarr is using a
stale cached channel list: `GET /api/v1/channels/reconciliation/status` clears
it, then generate again.

## Traps

- **Teamarr settings PUTs are not partial.** `PUT /api/v1/settings/dispatcharr`
  with only the fields you mean to change **nulls `default_channel_profile_ids`
  and `default_channel_group_id`**. Always send the whole block you read back —
  or use teamarr-mcp's `update_settings` tool, which does the read-merge-write.
  The fields that must survive: `epg_id` (the Teamarr source),
  `default_channel_profile_ids`, `default_channel_group_id`,
  `managed_team_channel_group_id`, `managed_team_channel_profile_ids` (the
  Sports group and its profile) and `cleanup_unused_logos: true`.
- **ECM MCP write tools that resolve targets first return
  `401 Not authenticated`** — `update_channel`, `set_logo_from_epg`,
  `match_channels_epg`, `refresh_all_epg`, `reorder_streams` and others. Upstream
  bug in 0.18.x: `guarded_run` resolves targets outside the sidecar's
  `claim_context`, so the backend call goes out without credentials. Workarounds:
  **`bulk_commit_channels`** covers most of them: `updateChannel` (with `data:
  {name, logo_id, ...}`), `addStreamToChannel`, `removeStreamFromChannel` and
  `reorderChannelStreams` (`streamIds`) all work, in one atomic batch behind a
  preview token. Otherwise: `assign_channel_numbers` for renumbering,
  `link_channel_epg` for EPG links, `refresh_epg` (single source), and
  `create_logo` + `updateChannel{logo_id}` for logos.
- **The same `tvg_id` can exist in several EPG sources.** The provider EPG
  re-publishes other guides' ids, e.g. `USA.Network.HD.(Pacific).us2` exists
  in both the provider EPG (with the *East* schedule) and the West supplement.
  `ecm_link_channel_epg(tvg_id=...)` picks one of them without telling you.
  **Link by `epg_data_id`** whenever the id isn't unique, and check the source.
  Read-only: `EPGData.objects.filter(tvg_id=...)` in `manage.py shell` on the
  dispatcharr pod.
- **Gracenote station ids repeat across the gracenote sources.** Canadian
  border stations (CBLT, CFTO, CITY, OMNI, TVO, YES TV) are also in Gracenote
  US and US Locals. On 2026-09-24 a `tvg_id` link sent 7 Canada channels to
  the US sources. Relink by the Canada row's `epg_data_id`.
- **`ecm_match_channels_epg` against the provider/aggregator sources
  OOM-kills ECM.** ECM's limit is 512Mi, and the provider EPG alone is 37k
  channels. While ECM restarts, every call returns "All connection attempts
  failed", and probes report that as an error, not a failure. Match against
  one small source, or grep the XMLTV yourself and use `link_channel_epg`.
- **Linking doesn't load programmes.** After `ecm_link_channel_epg`, run
  `ecm_refresh_epg` on that row's source. Gracenote US takes a few minutes
  because the file is several GB.
- **ECM MCP cannot touch EPG sources, M3U accounts or backups** (403 "a human
  operator admin is required") — deliberate and hard-coded. Use the UI, or
  Dispatcharr's own REST API: port-forward `svc/dispatcharr` 9191 and get a JWT
  from `POST /api/accounts/token/` with the `dispatcharr` Secret's `username` and
  `password`. The 2026-09-25/26 source and guide changes were made that way.
- **A new M3U account stops at `pending_setup`** once its groups load ("Please
  select groups or refresh M3U to complete setup"). No streams arrive until you
  refresh it: `POST /api/m3u/refresh/<id>/`, or the UI's refresh button.
- **A guide source must refresh more often than its file's horizon.** Sources
  differ: gracenote reaches 7 days ahead and mybunny well over a day, but the
  main provider's EPG reaches only ~28 h and Pluto's well under a day, so both
  are on 6 h. Dispatcharr doesn't warn when a guide runs out, so channels just
  go blank until the next refresh.
- **ECM's scheduled probe runs at 03:00**, inside the shed window, so it has
  never run; its EPG/M3U refresh tasks show `last run: None` for the same
  reason. Dispatcharr's own refresh schedules are what actually keep data fresh.
- **ECM's "M3U Change Monitor"** fires every 6 minutes and has left 10k+ unread
  notifications; they are noise.
