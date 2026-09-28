// Tdarr flow "Direct Play HEVC" -- the size check on the ENCODE path, after
// ffmpeg, mkvpropedit and the duration check. stream-policy.cjs records why
// the file was encoded in args.variables.user.dpEncodeReason; see
// ../../tdarr.md for the pilot numbers behind the limits.
//
//   compat   (AV1, Xvid, MPEG-2, VC-1, Hi10P, legacy containers): keep the
//            encode at up to 120% of the original. The source can't
//            direct-play, so a same-size HEVC file is the goal.
//   storage  (8-bit H.264, oversized HEVC): keep only at 85% or less. The
//            source already direct-plays; a 95% encode costs a generation of
//            quality for nothing.
//
// Anything under 3% is a broken encode either way.
//
// Outputs: 1 = keep (replace the original), 2 = reject (Fail Flow, original
// kept). Same file_size fields the stock compareFileSizeRatio plugin reads.
module.exports = async args => {
  const reason = args.variables.user?.dpEncodeReason === "compat" ? "compat" : "storage";
  const upper = reason === "compat" ? 120 : 85;
  const lower = 3;
  const oldMB = Number(args.originalLibraryFile?.file_size);
  const newMB = Number(args.inputFileObj?.file_size);
  const pct = (newMB / oldMB) * 100;
  const keep = Number.isFinite(pct) && pct >= lower && pct <= upper;
  args.jobLog(
    `[size-guard] ${reason}: new ${newMB.toFixed(1)} MB is ${pct.toFixed(1)}% of ${oldMB.toFixed(1)} MB ` +
      `(keep ${lower}-${upper}%) -> ${keep ? "keep" : "reject, original kept"}`,
  );
  return { outputFileObj: args.inputFileObj, outputNumber: keep ? 1 : 2, variables: args.variables };
};
