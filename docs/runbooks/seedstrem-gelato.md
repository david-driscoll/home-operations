# seedstrem + AIOStreams + Gelato: on-demand torrent streaming in Jellyfin

On-demand torrent streaming inside Jellyfin with **no debrid service**. Search in
Jellyfin, pick a stream, and qBittorrent starts downloading while Jellyfin plays
the partial file.

```
Jellyfin + Gelato plugin
   │  one manifest URL (Gelato supports exactly one)
   ▼
AIOStreams            media/aiostreams       http://aiostreams.equestria.svc.cluster.local:3000
   ├── TMDB addon     search catalogs + metadata (built-in preset)
   └── seedstrem      downloads/seedstrem    http://seedstrem.equestria.svc.cluster.local:8080/stremio/manifest.json
          ├── search ──► Prowlarr            http://prowlarr.equestria.svc.cluster.local:9696
          └── add    ──► qBittorrent         http://qbittorrent.equestria.svc.cluster.local:8080
                         writes /media/downloads/{torrents,completed} on truenas-media;
                         seedstrem reads the same path read-only and serves it with Range support
```

## Why AIOStreams is in the chain

Gelato reads a single `Url` and fetches `catalog/`, `meta/` and `stream/` all
from it (`GelatoStremioProvider.cs`). seedstrem only serves `stream` for IMDb ids
(no catalogs, no meta). Something has to merge a TMDB addon with seedstrem
behind one URL; AIOStreams' "custom addon" does that without a debrid service.
StremThru's Wrap addon can also merge addons, but it requires a store token and
is built around debrid, so it was not used.

All addon traffic stays in the cluster. Gelato proxies playback through the
Jellyfin server, so the `svc.cluster.local` stream URLs only need to be reachable
from the Jellyfin pod. The public hostnames (`seedstrem.`, `aiostreams.`) exist
only for the admin UIs, behind authentik (`media-managers`).

## Configuration

### seedstrem (`kubernetes/apps/equestria/downloads/seedstrem`)

| Setting | Where | Value |
|---|---|---|
| `SEEDSTREM_SERVER_EXTERNAL_URL` | env | in-cluster Service URL |
| `SEEDSTREM_QBITTORRENT_URL` / `_CATEGORY` | env | qbittorrent Service / `seedstrem` |
| `SEEDSTREM_PROWLARR_URL` | env | prowlarr Service |
| `SEEDSTREM_PROWLARR_API_KEY` | ExternalSecret | `clusters/equestria/apps/prowlarr/api-key` → `apikey` |
| `SEEDSTREM_SERVER_ADMIN_PASSWORD` | ExternalSecret | `clusters/equestria/apps/seedstrem/admin-password` → `password` |
| `SEEDSTREM_META_TMDB_API_KEY` | ExternalSecret | `third-party-tokens/tmdb/api-key` → `password` (the estate's shared TMDB key). Lets indexers that search by TMDb id, not IMDb id, be queried by id instead of free text. |
| `SEEDSTREM_ADDON_ENABLE_MOVIES/SERIES/ANIME` | env | true / true / true |
| `SEEDSTREM_RSS_ENABLED` / `_FREELEECH_ONLY` | env | true / true (see below) |
| `SEEDSTREM_PATHS_MAPPINGS` | env | `/media/downloads:/media/downloads` (identity: both pods mount the same path) |
| `PROWLARR_SEARCH_TIMEOUT` | env | `8s` (no `SEEDSTREM_` prefix upstream) |
| `SEEDSTREM_STORAGE_MAX_DISK_USAGE_PERCENT` | env | `90` |
| `filters.*` (min seeders 5, 200 MB – 30 GB, 20 results) | `resources/config.yaml` | no env override exists upstream |

`resources/config.yaml` is copied over `/config/config.yaml` on every start, so
changes made in seedstrem's Settings page are reverted on restart. Change the
file in git instead. Upstream defaults apply to everything else. Two of them are
worth knowing:

- `cleanup.seed_time: 72h`: seedstrem removes its torrents **and their files**
  after 72h of seeding.
- `seeding.full: true`: the whole torrent is downloaded, played file first. For
  a season pack that means the whole pack.

**The RSS grabber is on**, so seedstrem also downloads **without** anyone
pressing play. Every 15 minutes it polls the Prowlarr indexers for new releases
and adds up to 5 of them (round-robin across indexers), to build seeding ratio
and pre-warm streams. With `SEEDSTREM_RSS_FREELEECH_ONLY` it only grabs
freeleech releases, so the downloads don't count against ratio, and it still
honours the `filters.min_seeders` floor. What bounds it:

- the 90% disk-usage gate (`SEEDSTREM_STORAGE_MAX_DISK_USAGE_PERCENT`);
- the 72h `cleanup.seed_time`, which removes grabbed torrents and their files.

It has no size cap of its own: `rss.filters.max_size_mb` is 0 (unbounded) and
the on-demand `filters.*` do not apply to it. Set
`SEEDSTREM_RSS_FILTERS_MAX_SIZE_MB` if grabs get too large, or
`SEEDSTREM_RSS_MAX_GRABS_PER_CYCLE` to slow it down.

**Queue bypass.** qBittorrent queues downloads (20 active). The `force-start`
sidecar in the seedstrem pod force-starts every downloading torrent in the
`seedstrem` category every 5s, and clears the flag once it completes, so seeding
returns to the normal limits. It changes nothing in qBittorrent's own config.
Side effect: a seedstrem torrent stopped by hand in qBittorrent while still
downloading is started again. Remove it rather than stopping it.

### AIOStreams (`kubernetes/apps/equestria/media/aiostreams`)

| Setting | Value |
|---|---|
| `BASE_URL` | `http://aiostreams.equestria.svc.cluster.local:3000`, so the manifest URL it generates is the one Gelato can use |
| `SECRET_KEY` | ExternalSecret `clusters/equestria/apps/aiostreams/secret-key` → `key`. **Never change it**: it encrypts the stored configs. |
| `AIOSTREAMS_AUTH` | Rendered `username:password` from `clusters/equestria/apps/aiostreams/credentials`. The app's own login, behind authentik. |
| `DATABASE_URI` | `sqlite://./data/db.sqlite` on the volsync-backed PVC |

**Logging in to AIOStreams** takes two steps: authentik (group `media-managers`),
then AIOStreams' own username and password from that OpenBao path:

```bash
bao kv get -field=password secrets/clusters/equestria/apps/aiostreams/credentials
```

A saved addon configuration also carries a password **you choose** when saving
it. That is a lock on that one config, not an account, and it is what reopens it
for editing later.

### qBittorrent

- Category `seedstrem` was created through the API on 2026-09-16 (save path
  `seedstrem`). With automatic torrent management off and
  `use_category_paths_in_manual_mode: false`, that path is **not** applied today.
  seedstrem torrents land in `/media/downloads/completed` like everything else.
- Sequential download and first/last piece priority are set per torrent by
  seedstrem when it adds one (`internal/torrents/service.go`). qBittorrent 5.2
  has no global default for either.
- No NetworkPolicy exists in `equestria`, and qBittorrent's auth subnet whitelist
  covers the pod network, so no credentials are needed.

## Bring-up

### 1. Create the two OpenBao values (once, before merging)

```bash
bao kv put secrets/clusters/equestria/apps/seedstrem/admin-password \
  password="$(openssl rand -base64 24)"
bao kv put secrets/clusters/equestria/apps/aiostreams/secret-key \
  key="$(openssl rand -hex 32)"
```

The AIOStreams key must be exactly 64 hex characters.

### 2. Merge; Flux deploys `seedstrem` and `aiostreams`

```bash
flux -n equestria get ks seedstrem aiostreams
kubectl -n equestria logs deploy/seedstrem -c force-start   # prints only when it acts
```

### 3. seedstrem UI (`https://seedstrem.<domain>`)

Log in with the admin password. On the **Dashboard**, both the Prowlarr and
qBittorrent connection tests should pass. The manifest is
`http://seedstrem.equestria.svc.cluster.local:8080/stremio/manifest.json`.

### 4. AIOStreams UI (`https://aiostreams.<domain>/stremio/configure`)

Menu names below are approximate; AIOStreams' UI changes often.

1. Add the **TMDB Addon** preset. No key is needed. It defaults to the public
   `tmdb.elfhosted.com` instance.
2. Add a **Custom** addon. Its fields, from the preset definition
   (`packages/core/src/presets/custom.ts`):
   - **Name**: `seedstrem`.
   - **Manifest URL**: seedstrem's manifest above.
   - **Timeout (ms)**: `12000`. The field is in **milliseconds**, so typing
     `12` gives 12ms and every search times out. It must be above seedstrem's
     8s Prowlarr search budget, and Gelato itself gives up at 30s. Leave the
     TMDB addon at about `5000`.
   - **Resources**: leave empty to inherit `stream` from the manifest, or tick
     only **Stream**.
   - **Media Types**: leave empty for all, or tick Movie, Series and Anime. All
     three are enabled in seedstrem.
   - **Pin Position**: optional. `Top` lists seedstrem's streams first.
3. Leave all services (debrid) unconfigured.
4. **Filters**: keep them permissive to start. AIOStreams parses release names,
   and over-strict filters can hide seedstrem results.
5. Save with a password, then copy the **manifest URL**. It starts with
   `http://aiostreams.equestria.svc.cluster.local:3000/stremio/...`.

### 5. Gelato: test on `jellyfin-pg` first, then production

`jellyfin-pg` (`https://jellyfin-pg.<domain>`) is the trial Jellyfin 12.0
instance holding a copy of production's library. Gelato writes items into
Jellyfin's database, so prove it there first.

1. **Dashboard → Plugins → Repositories → +**:
   `https://raw.githubusercontent.com/lostb1t/Gelato/refs/heads/gh-pages/repository.json`
2. **Catalog → Gelato → install 0.26.18.0**. 0.26.19.0 and later target
   Jellyfin 12.1 and will not load on 12.0. Restart Jellyfin.
3. **Plugins → Gelato → settings**:
   - URL: the AIOStreams manifest URL from step 4.
   - Movie path: `/config/gelato/movies`. Series path: `/config/gelato/series`.
     The defaults under `/tmp` do not survive a restart. `/config` is the app's
     own PVC.
   - Save, then restart Jellyfin. Gelato only rereads the manifest on restart.
4. **Libraries**: add a Movies library on `/config/gelato/movies` and a Shows
   library on `/config/gelato/series`, then scan.
5. For the Shows library, enable the **"Gelato missing season/episode fetcher"**
   metadata downloader and move it to the top.
6. Search for a well-seeded film. Results should come from the TMDB catalog.

### 6. Optional: browse finished downloads

A plain library on `/media/downloads/completed` also shows Radarr and Sonarr
downloads before import, and seedstrem deletes its own files after 72h. A clean
seedstrem-only library needs the category path above to take effect, which
means turning on qBittorrent's `use_category_paths_in_manual_mode` (a global
preference). Not done yet.

## Verification

- [ ] seedstrem Dashboard: Prowlarr and qBittorrent both pass.
- [ ] Browsing and searching in Jellyfin adds nothing to qBittorrent **on its
      own**. The RSS grabber still adds freeleech releases every 15 minutes, so
      to check this, look for a torrent matching what you searched, not for an
      empty `seedstrem` category.
- [ ] Playing a seedstrem stream adds a torrent in category `seedstrem`.
      `force-start` logs `force_start=true <hash>`, and playback starts before
      the download completes.
- [ ] Seeking works (Range requests).
- [ ] After playback the torrent keeps seeding; `force-start` logs
      `force_start=false` once it completes.
- [ ] A torrent that completes mid-playback moves from `torrents/` to
      `completed/` without breaking the stream.

**Slow torrents / ffprobe stalls.** Gelato probes streams that lack media info
(probe size 40M), and seedstrem answers 503 until metadata arrives (60s). If
playback hangs on "loading", raise `filters.min_seeders`, lower
`filters.max_size_mb`, or lower `SEEDSTREM_META_METADATA_TIMEOUT` so the player
retries sooner. Rather than lowering `PROWLARR_SEARCH_TIMEOUT`, narrow
`SEEDSTREM_PROWLARR_INDEXER_IDS` to the fast indexers.

**Overnight.** seedstrem, AIOStreams, qBittorrent and Prowlarr are all shed
02:00–09:00 while Jellyfin stays up. Gelato search and playback of undownloaded
items fail in that window. That is expected.

## Rollback

None of this touches Jellyfin's, qBittorrent's or Prowlarr's own volumes.

1. **Gelato**, per Jellyfin instance: **Scheduled tasks → Gelato purge**. This
   removes Gelato items and their watch state. Then remove the two Gelato
   libraries, uninstall the plugin, and restart. Optionally delete
   `/config/gelato` and the plugin repository entry.
2. **Apps**: remove `./seedstrem/ks.yaml` and `./aiostreams/ks.yaml` from the
   `downloads` and `media` kustomizations and delete both directories. Flux
   prunes the Deployments, Services, routes and ExternalSecrets. If the PVCs are
   left behind:
   `kubectl -n equestria delete pvc seedstrem aiostreams`.
3. **qBittorrent**, optional: remove torrents in category `seedstrem` (with or
   without files), then delete the category. Other categories are untouched.
4. **OpenBao**, optional:
   `bao kv metadata delete secrets/clusters/equestria/apps/seedstrem/admin-password`
   and the same for `aiostreams/secret-key`. The Prowlarr key is shared; leave it.
