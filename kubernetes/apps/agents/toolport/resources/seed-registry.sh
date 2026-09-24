#!/bin/sh
# Builds toolport's live registry from the git-managed template, once per pod
# start. Runs as the `seed-registry` initContainer in ../helmrelease.yaml, in
# toolport's own image (debian-slim: sh, sed, sha256sum are all there).
#
# Why this exists at all:
#   * toolport REWRITES its registry (saves, .bak backups, quarantine), so it
#     cannot read it from a read-only ConfigMap mount -- it gets a copy on the
#     /data emptyDir instead. Every restart re-seeds from git, so git stays
#     authoritative and nothing toolport wrote survives a restart.
#   * `httpClients[].tokenSha256` has to be the hash of a token ESO minted
#     in-cluster (../externalsecret.yaml), which git cannot know. The template
#     carries `__SHA256_<PROFILE>__` placeholders; the tokens arrive here as
#     TOKEN_<PROFILE> env vars and only their hashes are written out.
#
# Mounted from a ConfigMap annotated `kustomize.toolkit.fluxcd.io/substitute:
# disabled` (../kustomization.yaml) -- Flux's envsubst would otherwise eat the
# shell variables below.
set -eu

src=/config/registry.json
dst=/data/registry.json

cp "$src" "$dst"

for profile in POSTGRES INFRASTRUCTURE MEDIA RESEARCH; do
  token=$(printenv "TOKEN_${profile}" || true)
  if [ -z "$token" ]; then
    echo "seed-registry: TOKEN_${profile} is empty -- refusing to start with an unauthenticated client slot" >&2
    exit 1
  fi
  hash=$(printf '%s' "$token" | sha256sum | cut -d' ' -f1)
  sed -i "s/__SHA256_${profile}__/${hash}/" "$dst"
done

if grep -q '__SHA256_' "$dst"; then
  echo "seed-registry: unfilled placeholder left in $dst:" >&2
  grep -o '__SHA256_[A-Z_]*__' "$dst" >&2
  exit 1
fi

echo "seed-registry: wrote $dst"
