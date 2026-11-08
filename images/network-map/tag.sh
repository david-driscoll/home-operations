#!/usr/bin/env bash
# tag.sh <repo-root> -- the tag the network-map image built from this tree
# gets: 12 hex of a hash over ./inputs.sh's files, the Dockerfile's pinned
# base digest included.
#
#   1f2e3d4c5b6a
#
# A commit that touches neither the collector nor the lockfile nor a
# workspace's package.json reuses the image already in the registry (the
# workflow checks before it builds).
set -euo pipefail

root="${1:?usage: tag.sh <repo-root>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

# sha256sum on Linux, shasum on a Mac.
sha256() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; }

"$here/inputs.sh" "$root" | while IFS= read -r file; do
  printf '%s\n' "$file"
  cat "$file"
done | sha256 | cut -c1-12
