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
| 3 | US Locals — `cdn.epg.guru/7daygracenote/UnitedStates-Locals.xml.gz` | Local stations, keyed by **Gracenote station id** (`21103`, `43730`...) |
| 2 | US — `cdn.epg.guru/7dayiptv/UnitedStates.xml.gz` | National channels, keyed `name.us` |
| 1 | Canada — `cdn.epg.guru/7daygracenote/Canada.xml.gz` | Canadian locals (103-114), keyed by Gracenote station id. The `7dayiptv/` flavour keys by name (`2MMaroc(2MAROC).ca`) and matches none of them. |
| 4 | UK — `cdn.epg.guru/7dayiptv/UnitedKingdom.xml.gz` | Unused |
| 7 | Twitch (Twitcharr) | Channel 9000 |

Sources 1-4 were epg.jesmann.com until 2026-09-24 (still named that in
Dispatcharr). jesmann moved to epg.guru and renamed everything; the old URLs
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
   SYFY. Those West channels currently share the East guide, which is **3 hours
   early**. epgshare01's `epg_ripper_US2.xml.gz` has `USA.Network.HD.(Pacific).us2`,
   `TNT.HD.(Pacific).us2`, `Syfy.HD.(Pacific).us2` and `FXX.HD.(Pacific).us2`
   (plus `HBO.Drama.us2`, `HBO.Hits.us2`, `Starz.in.Black.HD.us2`,
   `MGM+.Drive-In.us2`). Nothing found has a VH1 West guide.

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
  with no logo and no owner. They are now Teamarr-managed teams (template 2,
  `team_channel_logo_url` → game-thumbs), so Teamarr sets and keeps the logo.
- **Teamarr `dispatcharr.epg_id` was 5** (IPTorrents EPG) instead of 6, so every
  generation refreshed the 35k-channel provider guide and looked for its own
  `teamarr-*` rows there. `cleanup_unused_logos` was off, leaving hundreds of
  per-game logos behind.

## Runbooks

The MCP route (`toolhive-ecm_*`, `toolhive-teamarr_*` from agentboard) is the
quickest; the UI does the same.

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

1. `ecm_get_streams_for_channel`. Zero streams = provider re-numbering.
2. `ecm_bulk_search_streams` with the network name (and `WEST` for a West
   channel), `provider_id=5`. `ecm_add_stream_to_channel` a primary and a backup.
3. Probe **one at a time** (`ecm_probe_single_stream`). The provider throttles
   parallel connections: an 8-way bulk probe passes the first 8 streams and
   fails every one after, which looks like a dead lineup but is not.

### "Logo missing"

- Regular channel: ECM UI → select channels → *Set Logo from EPG*. (The MCP
  `set_logo_from_epg` is broken, see below.)
- Event channel: the event template's `event_channel_logo_url`
  (`{league_code}/{away_team|pascal}/{home_team|pascal}/logo.png?...`) resolved
  against `art_base_url`. A template with an empty logo URL gives a logo-less
  channel — the Racing template does.
- Team channel: template 2's `team_channel_logo_url`; run a Teamarr generation.

### Adding a team channel

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
