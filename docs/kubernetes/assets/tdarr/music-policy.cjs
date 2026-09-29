// Tdarr flow "Music AAC" -- the Custom JS Function that decides what happens
// to one music file. It runs after "Begin Command" and edits
// args.variables.ffmpegCommand in place; see ../../tdarr.md ("Music") for the
// policy and why each rule exists.
//
// Outputs:
//   1  lossless -> AAC 256k in .m4a   -> Execute
//   2  nothing to do                  -> end ("Not required")
//
// Keep it plain CommonJS with no dependencies: Tdarr writes this text to
// script.js in the worker's cache and require()s it.
module.exports = async args => {
  const cmd = args.variables.ffmpegCommand;
  const file = args.inputFileObj;
  const log = m => args.jobLog(`[music] ${m}`);
  const lc = v => String(v == null ? "" : v).toLowerCase();
  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const done = outputNumber => ({ outputFileObj: file, outputNumber, variables: args.variables });

  // Lossless codecs as ffprobe names them. MP3, AAC, Opus and Vorbis are
  // already lossy: re-encoding them only loses quality, so they are left be.
  const lossless = c => ["flac", "alac", "wavpack", "ape", "tta", "tak", "mlp", "truehd"].includes(c) || c.startsWith("pcm_");
  const audio = cmd.streams.filter(s => lc(s.codec_type) === "audio");
  if (!audio.length || !audio.some(s => lossless(lc(s.codec_name)))) {
    log(`already lossy (${audio.map(s => s.codec_name).join(", ") || "no audio"}), nothing to do`);
    return done(2);
  }

  for (const s of cmd.streams) {
    const type = lc(s.codec_type);
    const codec = lc(s.codec_name);
    if (type === "audio") {
      // 256k AAC is the "AAC-256" quality in Lidarr; Lidarr has no Opus
      // quality at all, so an Opus file would be "Unknown" there. The native
      // encoder is transparent at this rate for stereo; >48 kHz hi-res masters
      // are resampled because AAC gains nothing above that.
      const ch = num(s.channels) || 2;
      const rate = ch > 2 ? `${Math.min(ch, 6) * 96}k` : "256k";
      s.outputArgs.push("-c:{outputIndex}", "aac", "-b:{outputIndex}", rate);
      if (num(s.sample_rate) > 48000) s.outputArgs.push("-ar:{outputIndex}", "48000");
      log(`audio ${s.index}: ${codec} ${ch}ch ${num(s.sample_rate) / 1000 || "?"} kHz -> aac ${rate}`);
    } else if (type === "attachment" && ["mjpeg", "png"].includes(codec) && !cmd.streams.some(o => o !== s && !o.removed && o.keptCover)) {
      // Embedded cover art (ffmpegCommandStart retyped it "attachment"). MP4
      // holds one JPEG/PNG cover as an attached picture; copy the first.
      s.keptCover = true;
      s.outputArgs.push("-disposition:{outputIndex}", "attached_pic");
      log(`cover ${s.index}: ${codec}, kept`);
    } else {
      // Extra pictures, data streams, anything MP4 cannot carry.
      s.removed = true;
      log(`drop stream ${s.index} (${type}/${codec || "none"})`);
    }
  }

  // Global tags (title, artist, album, track, disc, date...) are copied by
  // ffmpeg's default -map_metadata. The MusicBrainz IDs are not: MP4 keeps
  // them in iTunes freeform atoms that ffmpeg does not write. Lidarr
  // (writeaudiotags: Sync) writes them back when it imports the new file.
  cmd.container = "m4a";
  cmd.shouldProcess = true;
  return done(1);
};
