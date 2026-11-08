#!/usr/bin/env bash
# inputs.sh <repo-root> -- every file the network-map image is built from, one
# repo-relative path per line, sorted. The same single list as
# ../pulumi-workspace/inputs.sh, for the same three readers:
#
#   * bake.sh stages exactly these files, so nothing else can reach the image;
#   * tag.sh hashes exactly these, so the tag changes exactly when the image would;
#   * Dockerfile.dockerignore lets exactly these through to a local build
#     (it repeats the globs; keep the two in step).
#
# Every workspace's package.json is listed, not only this one's: `npm ci`
# checks the whole lockfile against all of them, even with --workspace. The
# tests (*.test.ts) are not shipped and not hashed, so a test-only change
# reuses the image already in the registry. Nor is ./declared: the
# declared-layer loader runs from a checkout in its own workflow
# (.forgejo/workflows/network-map-declared.yml), never from the image.
set -euo pipefail

root="${1:?usage: inputs.sh <repo-root>}"
cd "$root"

{
  echo package.json
  echo package-lock.json
  find images/network-map -type f ! -name '*.test.ts' ! -path 'images/network-map/declared/*'
  # `node` and not jq, as in ../pulumi-workspace/inputs.sh.
  node -e '
    const fs = require("node:fs"), path = require("node:path");
    for (const pattern of JSON.parse(fs.readFileSync("package.json", "utf8")).workspaces ?? []) {
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
