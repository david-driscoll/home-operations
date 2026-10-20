#!/usr/bin/env bash
# inputs.sh <repo-root> -- every file the pulumi-workspace image is built from,
# one repo-relative path per line, sorted.
#
# The single list three things agree on:
#   * bake.sh stages exactly these files and nothing else, so a change anywhere
#     else in the tree cannot change what the image holds;
#   * tag.sh hashes exactly these files, so the tag changes exactly when the
#     image would;
#   * Dockerfile.dockerignore lets exactly these through to a local
#     `docker build` (it cannot run a script, so it repeats the globs -- keep
#     the two in step).
#
# The npm workspaces are read from the root package.json rather than listed
# here, so a new stack or SDK is picked up without editing this file. Only each
# workspace's package.json is needed: bake.sh installs with --ignore-scripts,
# so no SDK source is compiled and none is copied.
set -euo pipefail

root="${1:?usage: inputs.sh <repo-root>}"
cd "$root"

{
  echo package.json
  echo package-lock.json
  # vals' download URL and checksum, per platform (bake.sh reads them).
  echo .config/mise.lock
  # The image's own definition: Dockerfile, scripts, ignore file.
  find images/pulumi-workspace -type f
  # Every npm workspace's package.json. `node` and not jq: both images this
  # runs in (pulumi-nodejs, and the runner's ubuntu) have node, not both jq.
  node -e '
    const fs = require("node:fs"), path = require("node:path");
    for (const pattern of JSON.parse(fs.readFileSync("package.json", "utf8")).workspaces ?? []) {
      // Only the two shapes this repo uses: "dir/" and "dir/*".
      const clean = pattern.replace(/\/$/, "");
      const dirs = clean.endsWith("/*")
        ? fs.readdirSync(clean.slice(0, -2), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(clean.slice(0, -2), d.name))
        : [clean];
      for (const dir of dirs) {
        const file = path.join(dir, "package.json");
        if (fs.existsSync(file)) console.log(file);
      }
    }
  '
} | LC_ALL=C sort -u
