#!/usr/bin/env bash
# Fetch the itsaplan source tree that compose.yaml builds from.
#
# WHY A FETCH AND NOT AN IMAGE PIN. itsaplan publishes no container images.
# Its AGENTS.md says so in as many words — "Images are not published to a
# registry: every deploy builds from source (docker compose up -d --build)" —
# and .github/workflows/ (ci, cla, codeql, pr-title, release) contains no build
# or push job; `ghcr.io` appears nowhere in the repository. There is no tag to
# pin, so the pinned thing is the *source revision* instead.
#
# The estate's Dockge flow copies files from git to the host rather than
# cloning anything, so there is no source tree on celestia to build against —
# this script is what puts one there. Both halves of that already exist as
# estate practice: components/DockgeLxc.ts:1012 runs `docker compose build`
# before `up -d` on every stack, and docker/_common/backups/init.sh already
# downloads a release artifact from the internet at deploy time.
#
# components/DockgeLxc.ts:995 runs init.sh with `triggers: [Date.now()]`, i.e.
# on EVERY apply. It must therefore be cheap when nothing changed — hence the
# version stamp, which turns a re-apply into a no-op and lets Docker's layer
# cache make the subsequent `compose build` a no-op too.
set -euo pipefail

# renovate: datasource=github-releases depName=croffasia/itsaplan
ITSAPLAN_VERSION=v0.6.0

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src_dir="${script_dir}/src"
stamp_file="${src_dir}/.itsaplan-version"

if [[ -f "$stamp_file" && "$(cat "$stamp_file")" == "$ITSAPLAN_VERSION" ]]; then
  echo "itsaplan source already at ${ITSAPLAN_VERSION}"
  exit 0
fi

echo "Fetching itsaplan ${ITSAPLAN_VERSION} ..."
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

curl -fsSL "https://github.com/croffasia/itsaplan/archive/refs/tags/${ITSAPLAN_VERSION}.tar.gz" \
  -o "${tmp_dir}/itsaplan.tar.gz"

# Extract to a staging path first so a failed download never leaves a
# half-populated src/ that the next build would happily compile.
mkdir -p "${tmp_dir}/extract"
tar -xzf "${tmp_dir}/itsaplan.tar.gz" -C "${tmp_dir}/extract" --strip-components=1

rm -rf "$src_dir"
mv "${tmp_dir}/extract" "$src_dir"
echo "$ITSAPLAN_VERSION" >"$stamp_file"

echo "itsaplan source ready at ${ITSAPLAN_VERSION}"
