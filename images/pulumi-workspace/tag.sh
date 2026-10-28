#!/usr/bin/env bash
# tag.sh <repo-root> -- the tag the pulumi-workspace image built from this tree
# gets: <pulumi-nodejs version>-<12 hex of a hash over ./inputs.sh's files>.
#
#   3.270.0-1f2e3d4c5b6a
#
# The version half is read from the Dockerfile's FROM line, which is what
# Renovate bumps. The hash half changes when package-lock.json, any workspace
# package.json, this directory or the pinned vals asset does -- and for nothing
# else, so a commit that only touches stacks/*.ts or kubernetes/ reuses the
# image already in the registry (the workflow checks before it builds).
#
# .config/mise.lock is not hashed whole: every tool bump rewrites it, and only
# vals' two platform entries reach the image. bake.sh's `vals_asset` is the
# same extraction.
set -euo pipefail

root="${1:?usage: tag.sh <repo-root>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

base_version="$(sed -nE 's#^FROM ghcr\.io/pulumi/pulumi-nodejs:([^@[:space:]]+).*#\1#p' images/pulumi-workspace/Dockerfile | head -n1)"
if [ -z "$base_version" ]; then
  echo "tag.sh: no 'FROM ghcr.io/pulumi/pulumi-nodejs:<version>' in images/pulumi-workspace/Dockerfile" >&2
  exit 1
fi

# sha256sum on Linux, shasum on a Mac.
sha256() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; }

hash="$(
  "$here/inputs.sh" "$root" | while IFS= read -r file; do
    printf '%s\n' "$file"
    if [ "$file" = .config/mise.lock ]; then
      awk '/^\[tools\.vals\."platforms\.linux-(x64|arm64)"\]$/ { f = 1; print; next } /^\[/ { f = 0 } f' "$file"
    else
      cat "$file"
    fi
  done | sha256 | cut -c1-12
)"

echo "${base_version}-${hash}"
