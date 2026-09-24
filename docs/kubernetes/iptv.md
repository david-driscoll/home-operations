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

**M3U accounts:** one main provider carries almost all live streams, with a
secondary provider and a VOD account alongside it. A few older accounts are
disabled or in an error state and unused.

**EPG sources** — what actually feeds the guide:

| Source | Feeds |
| --- | --- |
| The main provider's own EPG | Its streams, matching its `*.us` tvg-ids |
| A secondary national EPG | Most national cable/premium rows, including the `*west.us` rows. **It is a trial feed — if it stops refreshing, most cable/premium channels lose their guide.** |
| Teamarr's XMLTV endpoint | Event + team channels. Teamarr's `dispatcharr.epg_id` must point at **this** source. |
| US Locals (gracenote flavour) | Local stations, keyed by **Gracenote station id** (`21103`, `43730`...) |
| US (iptv flavour) | National channels, keyed `name.us` |
| Canada (iptv flavour) | Canadian channels, keyed `name.ca` |
| UK (iptv flavour) | Unused |
| Twitch | Channel 9000 |

The US/Canada/UK sources come from a public EPG aggregator that moved hosts and
renamed every file in 2026-09; the old URLs stopped serving guides while
Dispatcharr kept reporting them as `success`. The aggregator publishes each
guide in a gracenote flavour (channel id = Gracenote station id) and an iptv
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
3. **No West row exists** in either provider EPG for USA Network, TNT, VH1 and
   SYFY. Those West channels currently share the East guide, which is **3 hours
   early**. At least one third-party EPG carries Pacific rows for USA Network,
   TNT, Syfy and FXX (plus HBO Drama, HBO Hits, Starz in Black and MGM+
   Drive-In). Nothing found has a VH1 West guide.

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
  with no logo and no owner. They are now Teamarr-managed teams (template 2,
  `team_channel_logo_url` → game-thumbs), so Teamarr sets and keeps the logo.
- **Teamarr `dispatcharr.epg_id` pointed at the provider's EPG** instead of
  Teamarr's own, so every generation refreshed the full provider guide and
  looked for its own `teamarr-*` rows there. `cleanup_unused_logos` was off,
  leaving hundreds of per-game logos behind.

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
4. If the whole locals block is blank, `curl -sI` the EPG source URLs first — a
   dead source still reports `success` in Dispatcharr.

### "Channel X plays nothing"

1. `ecm_get_streams_for_channel`. Zero streams = provider re-numbering.
2. `ecm_bulk_search_streams` with the network name (and `WEST` for a West
   channel), filtered to the main provider's account. `ecm_add_stream_to_channel`
   a primary and a backup.
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
  The fields that must survive: `epg_id` (the Teamarr source),
  `default_channel_profile_ids`, `default_channel_group_id`,
  `managed_team_channel_group_id`, `managed_team_channel_profile_ids` (the
  Sports group and its profile) and `cleanup_unused_logos: true`.
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
