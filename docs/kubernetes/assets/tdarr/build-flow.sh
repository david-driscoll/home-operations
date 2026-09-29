#!/usr/bin/env bash
# Render an importable Tdarr flow to stdout, with its Custom JS Functions
# inlined. The output is what goes into FlowsJSONDB (tdarr_cruddb) or
# Tdarr -> Flows -> Import.
#
#   build-flow.sh [video]  flow.template.json: stream-policy.cjs (dp-policy)
#                          and size-guard.cjs (dp-enc-size)
#   build-flow.sh music    music-flow.template.json: music-policy.cjs
#                          (mu-policy)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "${1:-video}" in
video)
  jq --rawfile policy "${here}/stream-policy.cjs" \
    --rawfile guard "${here}/size-guard.cjs" \
    '(.flowPlugins[] | select(.id == "dp-policy") | .inputsDB.code) = $policy
     | (.flowPlugins[] | select(.id == "dp-enc-size") | .inputsDB.code) = $guard' \
    "${here}/flow.template.json"
  ;;
music)
  jq --rawfile policy "${here}/music-policy.cjs" \
    '(.flowPlugins[] | select(.id == "mu-policy") | .inputsDB.code) = $policy' \
    "${here}/music-flow.template.json"
  ;;
*)
  echo "usage: $0 [video|music]" >&2
  exit 2
  ;;
esac
