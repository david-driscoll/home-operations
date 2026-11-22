#!/bin/sh
# Copies every FINISHED ebook2audiobook output into the shared media library,
# one folder per book, so audiobookshelf (or anything else on the share) can
# serve it:
#
#   /app/audiobooks/gui/gradio/<session>/<Book>.m4b
#     -> /media/ai-audiobooks/<Book>/<Book>.m4b
#   /app/audiobooks/.../<Book>_part01.m4b, <Book>_part02.m4b   (split output)
#     -> /media/ai-audiobooks/<Book>/<Book>_part01.m4b, ...
#
# "Finished" is the <stem>.vtt beside the audio file. lib/core.py
# (_export_audio) writes the audio with ffmpeg, tags it with mutagen, and only
# then builds the .vtt -- and treats a failed .vtt as a failed export. So the
# .vtt existing means the audio next to it is complete and tagged, and a book
# still being encoded is never copied half-written.
#
# Runs as the `publish` sidecar (busybox sh, uid 568). Flux substitution is
# disabled on this ConfigMap, so the braced shell expansions below are safe.
set -u
umask 002

src=/app/audiobooks
dest=/media/ai-audiobooks
interval="${PUBLISH_INTERVAL:-60}"
# lib/conf.py output_formats.
formats="m4b m4a mp3 aac flac ogg mp4 mov wav webm"

mkdir -p "$dest" || {
  echo "cannot create $dest" >&2
  exit 1
}

publish() {
  find "$src" -type f -name '*.vtt' | while IFS= read -r vtt; do
    dir=$(dirname "$vtt")
    stem=$(basename "$vtt" .vtt)
    # Split output shares one folder: strip lib/core.py's `_partNN` suffix.
    book=$(printf '%s\n' "$stem" | sed 's/_part[0-9][0-9]*$//')
    for ext in $formats; do
      audio="$dir/$stem.$ext"
      [ -f "$audio" ] || continue
      target="$dest/$book/$stem.$ext"
      # Same size = already published. A different size is a re-conversion of
      # the same book, which replaces the earlier copy.
      if [ -f "$target" ] && [ "$(stat -c %s "$target")" = "$(stat -c %s "$audio")" ]; then
        continue
      fi
      mkdir -p "$dest/$book" || continue
      # Copy under a hidden name, then rename: the library scanner never sees a
      # partial file, and an interrupted copy is retried on the next pass.
      tmp="$dest/$book/.$stem.$ext.partial"
      if cp "$audio" "$tmp" && mv -f "$tmp" "$target"; then
        echo "published $target"
      else
        rm -f "$tmp"
        echo "failed to publish $audio" >&2
      fi
    done
  done
}

echo "watching $src every ${interval}s, publishing to $dest"
while :; do
  publish
  sleep "$interval"
done
