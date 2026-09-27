// Tdarr flow "Direct Play HEVC" -- the Custom JS Function that decides what
// happens to one file. It runs after "Begin Command" and edits
// args.variables.ffmpegCommand in place; see ../../tdarr.md for the policy and
// why each rule exists.
//
// Outputs:
//   1  re-encode video to HEVC Main10, QSV decode   -> Set Video Encoder (hw)
//   2  re-encode video to HEVC Main10, CPU decode   -> Set Video Encoder (sw)
//   3  keep the video, remux (audio/subtitle/container fixes)
//   4  nothing to do                                -> end ("Not required")
//
// Keep it plain CommonJS with no dependencies: Tdarr writes this text to
// script.js in the worker's cache and require()s it.
module.exports = async args => {
  const cmd = args.variables.ffmpegCommand;
  const file = args.inputFileObj;
  const log = m => args.jobLog(`[direct-play] ${m}`);
  const lc = v => String(v == null ? "" : v).toLowerCase();
  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const lang = s => lc(s.tags?.language) || "und";
  const title = s => lc(s.tags?.title);
  const bps = s => num(s.bit_rate) || num(s.tags && (s.tags.BPS || s.tags["BPS-eng"]));
  const done = outputNumber => {
    // Execute only notices removed streams and container changes on its own;
    // a codec change on a kept stream (DTS -> EAC3 in an MKV) would be skipped
    // as "No need to process" without this.
    if (outputNumber !== 4) cmd.shouldProcess = true;
    return { outputFileObj: file, outputNumber, variables: args.variables };
  };

  const live = () => cmd.streams.filter(s => !s.removed);
  const ofType = type => live().filter(s => lc(s.codec_type) === type);
  let remux = false;

  // --- Streams MKV can't carry or no player here uses ----------------------
  // ffmpegCommandStart has already turned cover art into codec_type
  // "attachment"; real attachments (ASS fonts) have no attached_pic flag.
  for (const s of cmd.streams) {
    const type = lc(s.codec_type);
    const codec = lc(s.codec_name);
    const cover = s.disposition && Number(s.disposition.attached_pic) === 1;
    if (type === "data" || cover || ["eia_608", "timed_id3", "bin_data"].includes(codec)) {
      s.removed = true;
      remux = true;
      log(`drop stream ${s.index} (${type}/${codec || "none"}${cover ? ", cover art" : ""})`);
    }
  }

  // --- Subtitles -----------------------------------------------------------
  // mov_text/tx3g only exist in MP4 and MKV cannot hold them; WebVTT made Plex
  // on Apple TV transcode. SRT keeps the same text. ASS, PGS and VobSub are
  // left as they are: converting them loses styling or needs OCR.
  for (const s of ofType("subtitle")) {
    if (["mov_text", "tx3g", "webvtt"].includes(lc(s.codec_name))) {
      s.outputArgs.push("-c:{outputIndex}", "srt");
      remux = true;
      log(`subtitle ${s.index}: ${s.codec_name} -> srt`);
    }
  }

  // --- Audio ---------------------------------------------------------------
  // Apple TV direct-plays AAC, AC3, EAC3, FLAC, ALAC, Opus, MP3. DTS, TrueHD,
  // MP2 and PCM get transcoded by Plex. Every audio LANGUAGE is kept: a bad
  // track is only dropped when a direct-playable track in the same language
  // with at least as many channels (5.1 max) already exists -- a remux's AC3
  // core next to its TrueHD, say -- and is otherwise converted.
  const incompatible = s => {
    const c = lc(s.codec_name);
    return ["dts", "truehd", "mlp", "mp1", "mp2"].includes(c) || c.startsWith("pcm_");
  };
  const extra = s => /comment|descri|narrat|\bad\b/.test(title(s)) || (s.disposition && (Number(s.disposition.comment) === 1 || Number(s.disposition.visual_impaired) === 1));
  const allAudio = ofType("audio");
  // Channels a stream will have in the output, or 0 if it won't direct-play.
  const outChannels = t => t.dpChannels || (incompatible(t) ? 0 : num(t.channels) || 2);
  for (const s of allAudio) {
    if (!incompatible(s)) continue;
    const ch = num(s.channels) || 2;
    // A commentary or description track is content, never a duplicate.
    const twin = extra(s) ? undefined : ofType("audio").find(t => t !== s && !extra(t) && lang(t) === lang(s) && outChannels(t) >= Math.min(ch, 6));
    remux = true;
    if (twin) {
      s.removed = true;
      if (s.disposition && Number(s.disposition.default) === 1) {
        twin.outputArgs.push("-disposition:{outputIndex}", "default");
      }
      log(`audio ${s.index}: drop ${s.codec_name} ${ch}ch, ${twin.codec_name} ${twin.channels}ch (stream ${twin.index}) covers ${lang(s)}`);
      continue;
    }
    const outCh = Math.min(ch, 6);
    s.dpChannels = outCh;
    if (outCh > 2) {
      s.outputArgs.push("-c:{outputIndex}", "eac3", "-b:{outputIndex}", "640k", "-ac:{outputIndex}", String(outCh));
    } else {
      s.outputArgs.push("-c:{outputIndex}", "aac", "-b:{outputIndex}", "192k", "-ac:{outputIndex}", String(outCh));
    }
    // A title like "DTS-HD MA 7.1" would now be a lie; keep ones that say what the track IS.
    if (/dts|truehd|atmos|lpcm|pcm|mp2|[57]\.1|kbps|mbps/.test(title(s)) && !extra(s)) {
      s.outputArgs.push("-metadata:s:{outputIndex}", "title=");
    }
    log(`audio ${s.index}: ${s.codec_name} ${ch}ch -> ${outCh > 2 ? "eac3 640k" : "aac 192k"} ${outCh}ch`);
  }

  // --- Video ---------------------------------------------------------------
  const video = ofType("video")[0];
  const container = lc(file.container);
  if (!["mkv", "mp4", "m4v"].includes(container)) remux = true;
  if (!video) {
    log("no video stream");
    return done(remux ? 3 : 4);
  }

  const vcodec = lc(video.codec_name);
  const pix = lc(video.pix_fmt);
  const profile = lc(video.profile);
  const sideData = (video.side_data_list || []).map(d => lc(d.side_data_type)).join(",");
  const hdr = ["smpte2084", "arib-std-b67"].includes(lc(video.color_transfer)) || sideData.includes("dovi") || /^dv/.test(lc(video.codec_tag_string));
  const width = num(video.width);
  const interlaced = ["tt", "bb", "tb", "bt"].includes(lc(video.field_order));

  // Bitrate ceilings for keeping an HEVC encode as-is. Past these it is a
  // remux-grade file and worth shrinking; 4K is never touched (it is HDR here).
  const ceiling = width >= 3000 ? Infinity : width >= 1700 ? 8e6 : width >= 1100 ? 5e6 : 2.5e6;
  let vbr = bps(video);
  if (!vbr) {
    const overall = num(file.ffProbeData?.format?.bit_rate) || num(file.bit_rate);
    vbr = Math.max(0, overall - allAudio.reduce((n, a) => n + bps(a), 0));
  }

  let encode = false;
  if (hdr) {
    log(`video: ${vcodec} is HDR/Dolby Vision -- never re-encoded, copied`);
  } else if (vcodec !== "hevc") {
    encode = true;
    log(`video: ${vcodec} -> hevc main10`);
  } else if (vbr > ceiling) {
    encode = true;
    log(`video: hevc at ${(vbr / 1e6).toFixed(1)} Mbps is over the ${ceiling / 1e6} Mbps ceiling -> re-encode`);
  }

  if (!encode) {
    if (!remux) log("already direct-play HEVC, nothing to do");
    return done(remux ? 3 : 4);
  }

  // QSV on these Iris Xe iGPUs decodes 8-bit 4:2:0 H.264 and 4:2:0 HEVC/AV1.
  // Everything else -- Xvid, MPEG-1/2, VC-1, Hi10P H.264, 4:2:2 -- decodes on
  // the CPU and still encodes on the GPU.
  const hwPix = {
    h264: ["yuv420p", "yuvj420p"],
    hevc: ["yuv420p", "yuv420p10le"],
    av1: ["yuv420p", "yuv420p10le"],
  }[vcodec];
  let hw = false;
  if (hwPix && pix) hw = hwPix.includes(pix);
  else if (hwPix) hw = !/4:2:2|4:4:4|rext/.test(profile) && !(vcodec === "h264" && /10/.test(profile));

  const filter = hw ? `vpp_qsv=${interlaced ? "deinterlace=2:" : ""}format=p010le` : `${interlaced ? "bwdif=mode=send_frame," : ""}format=p010le`;
  video.outputArgs.push("-filter:v:{outputTypeIndex}", filter, "-profile:v:{outputTypeIndex}", "main10");
  if (/avc|h\.?264|x264|hevc|h\.?265|x265|xvid|divx|vc-?1|mpeg|kbps|mbps|\d{3,4}p/.test(title(video))) {
    video.outputArgs.push("-metadata:s:{outputIndex}", "title=");
  }
  // Files with dozens of PGS tracks overflow ffmpeg's default mux queue.
  cmd.overallOuputArguments.push("-max_muxing_queue_size", "9999");
  log(`decode on ${hw ? "QSV" : "CPU"} (${pix || profile || "unknown format"}), ${interlaced ? "deinterlace, " : ""}filter ${filter}`);
  return done(hw ? 1 : 2);
};
