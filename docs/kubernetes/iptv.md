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
| 409-422 | Sports | Teamarr-managed **team** channels (one per team per league) |
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
3. **No West row exists** in either mybunny source for USA Network, TNT, VH1 and
   SYFY. USA, TNT and SYFY West now use epgshare01 (source 11)'s
   `*.HD.(Pacific).us2` rows and check out at +3h. That file also has
   `FXX.HD.(Pacific).us2`, `HBO.Drama.us2`, `HBO.Hits.us2`,
   `Starz.in.Black.HD.us2` and `MGM+.Drive-In.us2`. Nothing found has a VH1
   West guide, so VH1 West still shows the East guide (3 hours early).
4. **Check it with `scripts/iptv-audit.py`**, not by eye. It pairs each West
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
  *State after the 2026-09-24 late review*.
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
- Give single-stream West channels a second stream from **TvPass (M3U 10, 3
  connections)** where it carries the network. Failover then has somewhere to go.
- Lower Dispatcharr's channel shutdown delay (Settings -> Proxy) so a slot is
  released soon after the viewer leaves.

## State after the 2026-09-24 late review

`scripts/iptv-audit.py` against the live output, plus Dispatcharr's DB:

| Area | Finding |
| --- | --- |
| Guide, regular channels | 5 channels with no guide: 103 Comedy Central (CA), 111 CTV2 Toronto, 209 FilmRise Western, 546 CW (Philly), 2013 ESPN 3. |
| Guide, dead rows | The linked row's programmes all read **"Channel No Longer Available"** on 222 HBO Family (East), 279 Starz Kids & Family (East), 623 Smithsonian, and **seven Starz West channels** (256, 258, 260, 266, 268, 270, 272). mybunny (source 9) is marking those feeds as discontinued. Check whether the streams still carry them before re-linking; if they don't, retire the channels. |
| West guides | Still wrong: 643 VH1 West and 278 Starz in Black West show the East schedule (+0h). No East overlap to compare (check by hand): 223 HBO Family W, 229 HBO Drama W, 231 HBO Hits W, 280 Starz Kids & Family W. 238 MoreMAX West has no guide at all. The other 20 West channels are correct at +3h. |
| West streams | Most West channels have **one** stream, all from IPTorrents. See *Connection budget*. |
| Logos | All channels outside 24/7 have a resolving logo (228 HBO Drama (East) had none overnight and had one by 09:00). |
| Teamarr teams | During the late review Teamarr had only **4** teams (Hurricanes 409, Oilers 412, Elks 413, Oil Kings 414). The Panthers (410), Hornets (411) and Tar Heels (415-422) channels had 404 logos, and were then deleted from Dispatcharr overnight; team ids 16-25 had been created and deleted. The 10 teams were re-added on 2026-09-24 09:00 (ids 26-35, template 2). All 14 channels are Teamarr-managed with working logos, **except 415**: a bare orphan channel (Dispatcharr id 301105, no EPG, no streams, profile 3 only) holds the number, so Teamarr reports *"Requested channel number 415 is already occupied"*. Delete that channel and generate again. |
| Teamarr schedule | `cron_expression: 0 6,18 * * *`, but 06:00 is inside the 02:00-09:00 shed, so only the 18:00 run ever happens. Event channels for early games are created at most once a day. |
| Movies | 81 channels. The provider also carries, not in the lineup: The Movie Channel + TMC Xtra, IndiePlex East/West, Hallmark Movies & Mysteries (East/West), Sundance (+West), IFC, AMC, HBO Latino, ScreenPix (x4), Showtime **West** variants, MGM+ West, Lifetime Movie Favorites. |
| Auto channel sync | M3U 5 has auto channel sync on: it created 132 channels at 00:04. Check which group they land in before they turn into unguided clutter. |

## Plan (open work)

Ordered by what the user notices first. `[UI]` means ECM's MCP cannot do it (see Traps).

1. **Playback of West/premium: connection budget.** The IPTorrents plan is 2
   connections and `max_streams` already matches, so the fix is spreading load
   and freeing slots sooner: shorten the proxy shutdown delay `[UI]`, and add a
   TvPass (3 connections) backup stream to every West/premium channel it carries
   (`ecm_bulk_search_streams`, `provider_id=10`), ordered after the IPTorrents
   stream. Dispatcharr then fails over when both IPTorrents slots are busy.
2. **Team channels.** ~~Re-add Panthers, Hornets and the Tar Heels to
   Teamarr~~ (done 2026-09-24). Remaining: delete the bare channel 301105 at
   415 and generate. Move Teamarr's cron to `0 10,18 * * *` so both runs
   happen outside the shed.
3. **Event-channel logos.** Give template 13 (Racing Event) an
   `event_channel_logo_url`. It is the only event template without one.
4. **Guide gaps.** For each row in *Guide, dead rows*, check whether the
   stream still carries that feed. If it does, re-link to a live row (for
   Starz West, epgshare01 or the IPTorrents EPG `*west.us`). If it doesn't,
   delete the channel. Link VH1 West / Starz in Black West to a real West row
   (`Starz.in.Black.HD.us2` exists; VH1 has none, so accept the East guide or
   drop the channel). Fix the five unguided regular channels, then
   `ecm_refresh_epg` each touched source.
5. **Logos.** Clean as of 2026-09-24 09:15. Keep it that way with the audit script; *Set Logo from EPG* in the ECM UI `[UI]` for regular channels.
6. **Movies.** Add the missing networks in *Movies* at 283+ (TMC, IndiePlex,
   Hallmark M&M, Sundance, IFC, AMC, HBO Latino, ScreenPix, Showtime West,
   MGM+ West), each with an East/West pair where the provider has one, a
   primary + backup stream, and a guide row checked by the audit script.
7. **Guardrails.** Rename EPG sources 1-4/10 off "epg.jesmann.com" and
   source 9 off "trial" `[UI]`. Move ECM's 03:00 probe to after 09:00. Run
   `scripts/iptv-audit.py` after every change and whenever the guide looks off.

## Runbooks

The MCP route (`toolhive-ecm_*`, `toolhive-teamarr_*` from agentboard) is the
quickest; the UI does the same.

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
  `assign_channel_numbers` for renumbering, `link_channel_epg` for EPG links,
  `refresh_epg` (single source), and the UI for logos.
- **ECM MCP cannot touch EPG sources, M3U accounts or backups** (403 "a human
  operator admin is required") — deliberate and hard-coded. Those are UI jobs.
- **ECM's scheduled probe runs at 03:00**, inside the shed window, so it has
  never run; its EPG/M3U refresh tasks show `last run: None` for the same
  reason. Dispatcharr's own refresh schedules are what actually keep data fresh.
- **ECM's "M3U Change Monitor"** fires every 6 minutes and has left 10k+ unread
  notifications; they are noise.
