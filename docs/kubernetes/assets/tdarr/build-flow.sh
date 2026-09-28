#!/usr/bin/env bash
# Render the importable Tdarr flow to stdout: flow.template.json with the two
# Custom JS Functions inlined -- stream-policy.cjs (dp-policy) and
# size-guard.cjs (dp-enc-size). The output is what goes into FlowsJSONDB
# (tdarr_cruddb) or Tdarr -> Flows -> Import.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
jq --rawfile policy "${here}/stream-policy.cjs" \
  --rawfile guard "${here}/size-guard.cjs" \
  '(.flowPlugins[] | select(.id == "dp-policy") | .inputsDB.code) = $policy
   | (.flowPlugins[] | select(.id == "dp-enc-size") | .inputsDB.code) = $guard' \
  "${here}/flow.template.json"
