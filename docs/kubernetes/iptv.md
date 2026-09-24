# IPTV / Live TV

How the live-TV lineup is put together, what keeps it healthy, and how to fix
it when the guide goes blank, a channel goes dead or a logo disappears. Written
after the 2026-09-24 clean-up, when all three had happened at once.

## What is where

| Piece | Where | What it does |
| --- | --- | --- |
| Dispatcharr | [`kubernetes/apps/equestria/pvr/dispatcharr/`](../../kubernetes/apps/equestria/pvr/dispatcharr/) — `dispatcharr.driscoll.tech` | The source of truth: M3U accounts, EPG sources, channels, logos, channel profiles. Serves the M3U/XMLTV/HDHR that Jellyfin reads. |
| ECM (Enhanced Channel Manager) | [`kubernetes/apps/equestria/pvr/ecm/`](../../kubernetes/apps/equestria/pvr/ecm/) — `ecm.driscoll.tech` | Curation UI and automation on top of Dispatcharr. Its MCP sidecar is `toolhive-ecm_*` in agent-tools. |
| Teamarr | [`kubernetes/apps/equestria/pvr/teamarr/`](../../kubernetes/apps/equestria/pvr/teamarr/) — `teamarr.driscoll.tech` | Sports: builds per-game event channels (1000+) and per-team channels (409-422) in Dispatcharr, plus their XMLTV. Its MCP is `toolhive-teamarr_*`. |
| game-thumbs | [`kubernetes/apps/equestria/pvr/game-thumbs/`](../../kubernetes/apps/equestria/pvr/game-thumbs/) — `dispatcharr-thumbs.driscoll.tech` | Renders matchup/team logos. Teamarr's `epg.art_base_url` points here. |
| Teamarr MCP | [`kubernetes/apps/agents/agent-tools-servers/teamarr.yaml`](../../kubernetes/apps/agents/agent-tools-servers/teamarr.yaml) | `ghcr.io/lukeeexd/teamarr-mcp`; writes allowed, destructive tools off. |

All of `equestria` is shed nightly 02:00-09:00 local
([power states](../cluster-consolidation/24-power-states.md)); ECM, Teamarr and
both MCPs are unreachable then. Dispatcharr is excluded from the shed.

## Inputs

**M3U accounts (Dispatcharr ids):** IPTorrents (5, the main provider, ~25k
streams), TvPass (10), IPTorrents VOD (18). `USNewsON` (9) and `CNN` (11) are
disabled; `custom` (1) is in an error state and unused.

**EPG sources (Dispatcharr ids)** — what actually feeds the guide:

| id | Source | Feeds |
| --- | --- | --- |
| 5 | IPTorrents EPG (`epg.mybunny.tv/ipt/...`) | The provider's own guide, matching its `*.us` tvg-ids |
| 9 | mybunny.tv trial (`mybunny.tv/epg.xml`) | Most national cable/premium rows, including the `*west.us` rows. **Named "trial" — if it stops refreshing, ~150 channels lose their guide.** |
| 6 | Teamarr (`teamarr.driscoll.tech/api/v1/epg/xmltv`) | Event + team channels. Teamarr's `dispatcharr.epg_id` must be **6**. |
| 11 | epgshare01 — `epgshare01.online/epgshare01/epg_ripper_US2.xml.gz` | The West guides mybunny lacks: `Syfy.HD.(Pacific).us2`, `TNT.HD.(Pacific).us2`, `USA.Network.HD.(Pacific).us2` (added 2026-09-24) |
| 3 | US Locals — `cdn.epg.guru/7daygracenote/UnitedStates-Locals.xml.gz` | Local stations, keyed by **Gracenote station id** (`21103`, `43730`...) |
| 2 | US — `cdn.epg.guru/7daygracenote/UnitedStates.xml.gz` | National channels |
| 1 | Canada — `cdn.epg.guru/7daygracenote/Canada.xml.gz` | Canadian channels |
| 4 | UK — `cdn.epg.guru/7daygracenote/UnitedKingdom.xml.gz` | Unused |
| 10 | Ireland — `cdn.epg.guru/7daygracenote/Ireland.xml.gz` | Unused |
| 7 | Twitch (Twitcharr) | Channel 9000 |

Sources 1-4 and 10 were epg.jesmann.com until 2026-09-24 (still named that in
Dispatcharr). All of them are on the `7daygracenote/` flavour now. jesmann moved to epg.guru and renamed everything; the old URLs
answer `300 Multiple Choices`. epg.guru publishes each guide in a
`7daygracenote/` flavour (channel id = Gracenote station id) and a `7dayiptv/`
flavour (channel id = `name.cc`), plus 14- and 3-day variants and per-market
files. **The flavour decides which tvg-ids match** — a channel linked to
`21103` needs a gracenote file.

## Channel map

| Numbers | Group | What |
| --- | --- | --- |
| 1-22 | United States | News + a few nationals |
| 63-94 | United States | Locals: Raleigh, Wilmington, Greensboro, Minneapolis, Denver, LA, Seattle |
| 103-114 | Canada | Toronto + Edmonton locals |
| 200-282 | Movies | HBO/Cinemax/Starz/Showtime/MGM+/MoviePlex etc., **East and West as separate channels** |
| 283-305 | Movies | Added 2026-09-24: The Movie Channel + Xtra, IndiePlex E/W, SundanceTV E/W, IFC, HBO Latino, ScreenPix x4, Showtime/SHOxBET/MGM+ **West** feeds, Cinemax Classics, Cinemax Spanish |
| 409-414 | Sports | Teamarr-managed **team** channels (one per team per league) |
| 512-645 | USA Premium | Cable networks; `(West)` variants next to their East channel |
| 1000+ | Sports | Teamarr **event** channels, created and deleted per game |
| 2009-2032 | Sports | Sports networks (ESPN, FS1, TSN, Sportsnet...) |
| 3000+ | 24/7 Streams | ~1,650 single-show loop channels; no real guide exists for them |
| 9000 | Twitch | Twitcharr |

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
3. **Where West rows live.** mybunny (source 9) has `<name>west.us` for most
   networks. For the rest, look in **epg.guru's gracenote US file (source 2)**:
   its `(Pacific)` rows are keyed by Gracenote station id (VH1 HD (Pacific) is
   `64634`, HBO Movies HD (Pacific) is `59847`, the Showtime family's `*HD
   (Pacific)` rows...). epgshare01 (source 11) supplies USA/TNT/SYFY West
   (`*.HD.(Pacific).us2`). To search source 2, grep the display names; don't
   parse it. It is served **uncompressed, ~3.2 GB, despite the `.gz` name**:

   ```bash
   curl -so gn.xml https://cdn.epg.guru/7daygracenote/UnitedStates.xml.gz
   LC_ALL=C grep -A3 -iE '<display-name>VH1[^<]*</display-name>' gn.xml
   ```

   Gracenote also tracks **renames**: HBO Family is now *HBO Movies*, Starz
   Kids & Family is *Starz Kids*, 5StarMAX is *Cinemax Classics*, MAX Latino is
   *Cinemax Spanish*, and Showtime's main channel is *Paramount+ with Showtime*.
   ThrillerMAX, OuterMAX and MovieMAX no longer exist.
4. **Some West feeds were dropped upstream.** No source (mybunny, epgshare01,
   gracenote, the provider's own EPG) has a West schedule for Starz in Black
   or the Starz multiplex channels (Cinema, Comedy, Edge, Encore Action / Black
   / Classic / Family / Suspense). mybunny marks their `*west.us` rows
   "Channel No Longer Available". Their `... WEST` streams still played, but
   with no West guide they were just duplicates of East, so channels 256, 258,
   260, 266, 268, 270, 272, 274 and 278 were **deleted on 2026-09-24**, along
   with 280 Starz Kids & Family West (dead stream, network renamed). Don't
   re-add them unless a real West schedule appears.
5. **Check it with `scripts/iptv-audit.py`**, not by eye. It pairs each West
   channel with its East partner and reports any whose guide is not the East
   guide shifted +3h (matched on identically titled programmes that line up to
   the minute). Rerun-heavy channels would match anything on titles alone.

## What went wrong in 2026-09 (so it is recognisable next time)

- **Dead channels, especially West and movie channels.** The provider
  re-numbered its streams; ~80 channels were left with zero streams. ECM's
  `match_streams_to_channels` found nothing even at score 0.3, so they were
  re-attached by hand from `bulk_search_streams`.
- **Blank guide on locals.** epg.jesmann.com now answers every file with
  `300 Multiple Choices` (the files moved to epg.guru and were renamed), but
  Dispatcharr still reports the sources as `success` — nothing alerted.
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
  the logo. By the late review only 4 of them were still in Teamarr; see
  *State after the 2026-09-24 changes*.
- **Teamarr `dispatcharr.epg_id` was 5** (IPTorrents EPG) instead of 6, so every
  generation refreshed the 35k-channel provider guide and looked for its own
  `teamarr-*` rows there. `cleanup_unused_logos` was off, leaving hundreds of
  per-game logos behind.

## Connection budget (why "West doesn't work")

**IPTorrents (M3U 5) allows `max_streams: 2`, and nearly every premium, movie
and West channel has only IPTorrents streams.** A third tune fails with
`No stream available for channel ...: All active M3U profiles have reached
maximum connection limits` in the Dispatcharr log and a `503` to the client,
which Jellyfin shows as a channel that will not play. Dispatcharr also keeps a
channel's upstream open for a while after the last client leaves. So hopping
East -> West -> another movie channel can use up both slots with nothing
actually being watched.

On 2026-09-24 a sequential probe of the 88 movie/West channels gave 45 OK and
43 `503`. VH1 West, one of the "dead" ones, played fine after a 60 s pause.
**A channel that 503s is not dead until it fails with nothing else playing.**
`scripts/iptv-audit.py` deliberately does not probe streams for this reason.

Levers, cheapest first:

- **2 is the plan's real limit** (confirmed 2026-09-24), so `max_streams: 2` on
  M3U account 5 is correct. Don't raise it: the provider would refuse the
  third connection instead of Dispatcharr.
- **TvPass (M3U 10, 3 connections) as backup.** TvPass carries ~50
  East/national channels and **no West feeds**. On 2026-09-24 its stream was
  appended as the last stream on every lineup channel it carries (34 channels,
  including FX/FXX/FXM, Starz East, USA, LMN, IFC, TSN 1-5, the LA and NY
  locals). When both IPTorrents slots are busy, those East channels fail over
  to TvPass instead of failing. That leaves the IPTorrents slots for the West
  and premium channels only IPTorrents has. When adding a channel TvPass
  carries, add its TvPass stream last.
- Lower Dispatcharr's channel shutdown delay (Settings -> Proxy) so a slot is
  released soon after the viewer leaves.

## State after the 2026-09-24 changes

Applied through the ECM and Teamarr MCPs (`toolhive-ecm_*`, `toolhive-teamarr_*`):

| Area | State |
| --- | --- |
| TvPass backups | TvPass stream appended to 28 more channels (6 already had one). See *Connection budget*. |
| Teamarr | `epg.cron_expression` moved from `0 6,18 * * *` (06:00 was inside the shed, so it never ran) to **`0 10,18 * * *`**. Racing template (13) now has `event_channel_logo_url: {league_code}/leaguelogo.png` and `program_art_url: {league_code}/leaguethumb.png`. game-thumbs serves real league marks there and answers `400` for an unknown league. |
| Team channels | Teamarr owns 409 Hurricanes, 410 Panthers, 411 Hornets, 412 Oilers, 413 Elks and 414 Oil Kings, all with logos. **The Tar Heels were dropped on purpose** (David removed them from Teamarr overnight). The morning re-add of them was a misunderstanding and has been undone: teams 28-35 were deleted (Teamarr removed channels 416-422 with them), and the orphan channel at 415 (Dispatcharr 301105) was deleted. Don't bring 415-422 back. |
| Dead guides re-linked (source 2) | 643 VH1 West → VH1 HD (Pacific) `64634`, now a real West guide. 222/223 HBO Family E/W → HBO Movies `59845`/`59847`. 279 Starz Kids & Family (East) → `19635`. 623 Smithsonian → Smithsonian HD Network `58532`. The eight Starz multiplex West channels → their national HD rows (see *East / West rules* 4). |
| East/West pairs moved to gracenote (source 2) | So each pair's two feeds come from one source and line up at +3h: FX 210/563 → `58574`, FX West 211 → `59814`; HBO Drama 228/229 → `59363`/`59366`; HBO Hits 230/231 → `59368`/`59355` (229-231 had **no link at all**); MoreMAX 237/238 → Cinemax Hits `59373`/`59375` (238 had been linked to an empty provider row). |
| USA West fixed again | 641 had drifted onto a same-named row in the provider EPG (source 5, which copies the East schedule) instead of epgshare01's. Now linked by row id to source 11. See Traps. |
| Starz West | Removed 2026-09-24: 256, 258, 260, 266, 268, 270, 272, 274, 278 (no West schedule anywhere) and 280 (dead stream). See *East / West rules* 4. No West channel now sits on a national guide on purpose; `KNOWN_NO_WEST_GUIDE` in `scripts/iptv-audit.py` is empty and is where one would go. |
| Movies | 23 channels added at 283-305 (see *Channel map*). Every primary stream was probed OK one at a time before creation. Each has a logo from the guide row, a primary + backup stream where the provider has one, and a gracenote/mybunny/epgshare01 guide row. |
| New-channel gotcha | `ecm_create_channel` puts a new channel in **every** channel profile, including Locals (2). Movie channels belong in 1/3/4/7, so the 23 were removed from Locals with `ecm_apply_profile_to_channels(profile_id=2, enabled=false)`. Do the same for any channel you add. |
| Last guide gaps closed | 103 was named *Comedy Central* but carried **four CBS Denver/Greensboro streams**. It is now *CTV Comedy*, with three CTV Comedy streams, the gracenote Canada row `76863` and its logo. 111 CTV2 Toronto had been linked to CHWI (the Windsor/London CTV2) and is now on *CTV Two - Toronto HD* `72705`. 209 FilmRise Western: no guide source has a `filmrisewestern` id, but the provider EPG (source 5) has an `US FilmRise Western (S)` row, so that stream is now primary and the channel is linked to that row. 546 CW (Philly) and 2013 ESPN 3 were deleted (no guide exists for either). |
| Renames | 222/223 → *HBO Movies (East/West)*, 279 → *Starz Kids*, matching the networks' current names. |
| Audit | `scripts/iptv-audit.py` is clean: every channel outside 24/7 has a guide and a resolving logo, and every West channel with an East partner is at +3h. |

## Plan (open work)

`[UI]` means ECM's MCP cannot do it (see Traps).

1. Shorten Dispatcharr's proxy shutdown delay `[UI]` so IPTorrents slots free
   sooner after a viewer leaves.
2. **Guardrails.** Rename EPG sources 1-4/10 off "epg.jesmann.com" and
   source 9 off "trial" `[UI]`. Move ECM's 03:00 probe to after 09:00. Run
   `scripts/iptv-audit.py` after every change and whenever the guide looks off.

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
at +3h, and logos that are missing or 404.

### "The guide is blank for channel X"

1. Get what Jellyfin sees:
   `curl -s http://dispatcharr.equestria.svc.cluster.local:9191/output/epg` and
   count `<programme channel="<number>">` — `ecm_get_epg_grid(channel_id=...)`
   is filtered client-side over a small window and is not reliable for this.
2. `ecm_get_channel` → its tvg-id. Look that id up in the sources (download the
   XMLTV and grep `<channel id="...">`); pick a row with programmes.
3. `ecm_link_channel_epg(channel_id, tvg_id=...)`, then **`ecm_refresh_epg` on
   that row's source** and re-check step 1.
4. If the whole locals block is blank, `curl -sI` the epg.guru URLs first — a
   dead source still reports `success` in Dispatcharr.

### "Channel X plays nothing"

0. Stop everything else that is playing and wait a minute, then retry. A `503`
   while two other IPTorrents channels are open is the connection budget, not
   a dead channel (see *Connection budget*).
1. `ecm_get_streams_for_channel`. Zero streams = provider re-numbering.
2. `ecm_bulk_search_streams` with the network name (and `WEST` for a West
   channel), `provider_id=5`. `ecm_add_stream_to_channel` a primary and a backup.
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
  channel — the Racing template does.
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
  The values that must survive: `epg_id: 6`, `default_channel_profile_ids: [3]`,
  `default_channel_group_id: 92`, `managed_team_channel_group_id: 92`,
  `managed_team_channel_profile_ids: [3]`, `cleanup_unused_logos: true`.
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
  (source 5) re-publishes other guides' ids, e.g. `USA.Network.HD.(Pacific).us2`
  exists in both source 5 (with the *East* schedule) and epgshare01 (source 11).
  `ecm_link_channel_epg(tvg_id=...)` picks one of them without telling you.
  **Link by `epg_data_id`** whenever the id isn't unique, and check the source.
  Read-only: `EPGData.objects.filter(tvg_id=...)` in `manage.py shell` on the
  dispatcharr pod.
- **Linking doesn't load programmes.** After `ecm_link_channel_epg`, run
  `ecm_refresh_epg` on that row's source. Source 2 (gracenote US) takes a few
  minutes because the file is ~3.2 GB.
- **ECM MCP cannot touch EPG sources, M3U accounts or backups** (403 "a human
  operator admin is required") — deliberate and hard-coded. Those are UI jobs.
- **ECM's scheduled probe runs at 03:00**, inside the shed window, so it has
  never run; its EPG/M3U refresh tasks show `last run: None` for the same
  reason. Dispatcharr's own refresh schedules are what actually keep data fresh.
- **ECM's "M3U Change Monitor"** fires every 6 minutes and has left 10k+ unread
  notifications; they are noise.
