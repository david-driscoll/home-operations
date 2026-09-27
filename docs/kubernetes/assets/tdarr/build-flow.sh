#!/usr/bin/env bash
# Render the importable Tdarr flow to stdout: flow.template.json with
# stream-policy.cjs inlined as the Custom JS Function's code. The output is
# what goes into FlowsJSONDB (tdarr_cruddb) or Tdarr -> Flows -> Import.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
jq --rawfile code "${here}/stream-policy.cjs" \
  '(.flowPlugins[] | select(.id == "dp-policy") | .inputsDB.code) = $code' \
  "${here}/flow.template.json"
