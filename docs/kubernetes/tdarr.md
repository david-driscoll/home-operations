# Tdarr: direct play and long-term storage

What Tdarr does to the media library, why, and how the flow that does it is
applied. Written 2026-09-27, when the flow was designed. Nothing in Tdarr had
actually processed a file for nine months at that point (see
[What was wrong](#what-was-wrong-on-2026-09-27)).

## What is where

| Piece | Where | What it does |
| --- | --- | --- |
| Tdarr server + UI | [`kubernetes/apps/equestria/media/tdarr/`](../../kubernetes/apps/equestria/media/tdarr/) — `tdarr.driscoll.tech` | Library scans, the file DB, flows, the job queue. Its config (libraries, flows, node limits) lives in its DB on the `tdarr` PVC, **not in git**. |
| Tdarr nodes | same HelmRelease, controller `tdarr-node`, 2 replicas | Run the jobs. Pinned to `intel.feature.node.kubernetes.io/gpu` nodes: `fluttershy` and `kerfuffle`, UN1290s with Iris Xe. Each registers as a node named after its host. |
| The flow | [`assets/tdarr/`](assets/tdarr/) | `flow.template.json` + `stream-policy.cjs`, rendered by `build-flow.sh`. The copy in Tdarr's DB is the live one; this is the reviewed one. |
| tdarr MCP | [`kubernetes/apps/agents/agent-tools-servers/tdarr.yaml`](../../kubernetes/apps/agents/agent-tools-servers/tdarr.yaml) | `tdarr` in `toolport-media`. `tdarr_cruddb` is allowed so flows can be managed; it writes any collection. |

All of `equestria` is shed nightly 02:00-09:00 local
([power states](../cluster-consolidation/24-power-states.md)), Tdarr and its
MCP included, so encoding only happens 09:00-02:00.

## The target

Playback is almost entirely Apple TV: Plex for Apple TV, Neptune and Moonfin,
then iPhones, the odd Mac and browser. From 14 months of Tracearr and
Streamystats sessions:

- **HEVC direct-plays.** One Apple TV direct-played HEVC with SRT 121 times,
  and the same codec pair transcoded on it 20 times, so transcodes are
  per-file, not a device limit.
- **AV1 does not.** Every AV1 session transcoded (`VideoCodecNotSupported`).
  The iGPUs cannot encode AV1 either (`av1_qsv` fails Tdarr's encoder test), so
  AV1 is not a storage format here, whatever its efficiency.
- DTS, TrueHD and MP2 audio get transcoded by Plex on Apple TV. So do old
  video codecs (Xvid, MPEG-1/2, VC-1) and AVI/MPG containers.

So the target is **HEVC Main10 video, EAC3 or AAC audio, text subtitles as SRT
or ASS, in MKV**, encoded on the iGPU with `hevc_qsv`.

## What the flow does

`Direct Play HEVC`, file by file. The decisions are all in
[`stream-policy.cjs`](assets/tdarr/stream-policy.cjs), a Custom JS Function
right after Begin Command; everything else is stock community plugins.

| Rule | Why |
| --- | --- |
| Video that is not HEVC is re-encoded to HEVC Main10: all H.264, plus AV1, Xvid, MPEG-1/2, VC-1. | H.264 → HEVC is where the storage is (3,143 1080p files, 7.6 TB, median 6.2 Mbps). The rest is compatibility. |
| HEVC is re-encoded only above a bitrate ceiling: 8 Mbps at 1080p, 5 at 720p, 2.5 at SD. | The 14,847 HEVC 1080p files are already at a 2.2 Mbps median. Re-encoding them would only lose quality. |
| HDR10, HLG and Dolby Vision are never re-encoded; 4K is never touched. | QSV re-encoding would drop DV and HDR metadata. |
| `hevc_qsv`, `-global_quality 23`, preset `slow`, 10-bit (`p010le`), deinterlaced when the source is. | 10-bit bands less at the same size. Interlaced MPEG-2 would otherwise keep its combing. |
| Decode on QSV for 8-bit H.264 and 4:2:0 HEVC/AV1; on the CPU for everything else (encode stays on the GPU). | QSV cannot decode Xvid, MPEG-1, Hi10P H.264 or 4:2:2. |
| DTS, TrueHD, MP2, PCM → EAC3 640k (5.1 max) or AAC 192k (stereo). If the file already has a direct-playable track in that language with as many channels, the bad track is dropped instead. | Chosen 2026-09-27: space and direct play over lossless audio the Apple TVs cannot pass through anyway. Atmos in TrueHD is lost. Commentary/description tracks are always converted, never dropped. |
| Every audio **language** is kept. | Tdarr cannot tell which track is the original language, so stripping dubs could delete the only original audio of a foreign film. |
| `mov_text`/`tx3g`/WebVTT → SRT. ASS, PGS and VobSub are left alone. | MKV cannot hold `mov_text`; WebVTT made Plex transcode. ASS would lose styling and PGS needs OCR. |
| Data streams, `eia_608` captions and cover-art streams are dropped. | MKV cannot carry them; players use their own artwork. |
| After ffmpeg, `mkvpropedit --add-track-statistics-tags`. | ffmpeg copies the source's `BPS` tags, and Jellyfin would believe a re-encode is still a 35 Mbps remux. |
| Duration must be within 1.5% and size must be smaller (encode) or 30-105% (remux), or the flow fails with the original untouched. | A failed guard shows up under Transcode errors to look at. |
| Files already fine end at output 4, no ffmpeg run: "Not required". | About 16,000 of 23,218. |

Run over the 2026-09-27 inventory (Tdarr's DB, 23,218 files, 21.6 TB), the
policy sends **~7,080 files (11.4 TB, ~4,300 hours of video) to re-encode**,
~120 to a remux-only pass, and ~16,000 nowhere. Expected saving is about
5-6 TB, but that is an estimate until the pilot measures real ratios. At an
assumed ~300 fps across both nodes it is two to four weeks of the 17 hours a
day Tdarr is up.

## Applying it

Tdarr's config is DB state, so this is done through the tdarr MCP
(`toolport-media`), not Flux. `tdarr_cruddb` writes any collection, so **take
a backup first**, every time.

1. `tdarr_create_backup`, then wait for `tdarr_get_backup_status`.
2. Render and insert the flow:
   `docs/kubernetes/assets/tdarr/build-flow.sh > flow.json`, then
   `tdarr_cruddb` `{collection: "FlowsJSONDB", mode: "insert", docID: "directPlayHevc", obj: <flow.json>}`.
   An existing copy is replaced with `mode: "update"`.
3. Nodes: `transcodegpu: 2`, `transcodecpu: 0` on each (`tdarr_alter_worker_limit`).
   Every job uses QSV whichever worker runs it, so a CPU worker would just be
   a third job on the same iGPU.
4. **Pilot first.** Point a library at a handful of files that covers the
   routes (an H.264 remux, an AV1 episode, an Xvid AVI, a DTS-only HEVC file,
   an interlaced MPEG-2) with `flowId: "directPlayHevc"`, scan it, and read the
   job reports: real fps, output size, and that the file plays on an Apple TV
   in Plex **and** Moonfin without transcoding. Tune `ffmpegQuality` in the
   two Set Video Encoder nodes if the sizes or picture are off.
5. Then set `flowId: "directPlayHevc"` on TV and Movies, and requeue
   (`tdarr_set_all_status`) so the files that went "Not required" or errored
   under the old settings go through the flow too.

Sonarr and Radarr pick up a replaced file (and a changed extension, `.mp4` →
`.mkv`) on their next refresh. Plex and Jellyfin see it on their next scan.

## What was wrong on 2026-09-27

- **No flow was assigned.** All three libraries had Flows enabled and
  `flowId: null`, so 23,004 files sat in "Queued" and nothing ran.
- **Every health check failed.** 22,996 of 23,218 were "Error", all from
  December 2025: the GPU health check ran `-hwaccel cuda` on nodes with Intel
  GPUs and died on `Cannot load libcuda.so.1` in under a second. The files
  were never actually checked; the error says nothing about them.
- **Music was a Tdarr library** with the video plugin stack on it. It matched
  no files. It should be turned off (`processLibrary: false`).
- **Tdarr updates itself.** `autoUpdateServer`/`autoUpdateNodes` are on, so
  the server ran 2.91.01 while the HelmRelease pinned 2.90.01. Renovate and
  the in-app updater are both moving the version.

## Not covered

- **Plex on Apple TV still transcodes some HEVC + SRT files** that direct-play
  elsewhere, and Tracearr does not record Plex's reason. Subtitle burn-in, or
  a client setting, is the likely cause; re-encoding does not fix it. Tautulli
  has the per-session `subtitle_decision` if it needs chasing.
- **Browsers** (Plex Web, Jellyfin Web on Firefox) will still transcode EAC3
  audio. Serving them would mean an AAC track in every file.
- **New downloads.** The flow keeps converting whatever Sonarr and Radarr grab.
  A custom format that scores AV1 down would stop the AV1 half of that at the
  source.
