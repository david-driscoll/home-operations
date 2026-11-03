#!/usr/bin/env bash
# Proves the pack loads under the real Pulumi CLI and blocks a preview.
#
# The unit tests exercise checks.ts directly; this catches what they cannot:
# the entry point (index.js, see its header), the PolicyPack wiring in
# pack.ts, and mandatory enforcement. It previews smoke/, an empty program on
# a throwaway local backend, which holds no free-tier quota, so the preview
# must fail with that violation. Needs `pulumi` and `node` on PATH and the
# repo's node_modules installed (`npm ci --ignore-scripts` is enough).
set -euo pipefail

pack_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$pack_dir/smoke/Pulumi.yaml" "$work/"

export PULUMI_BACKEND_URL="file://$work/state"
export PULUMI_CONFIG_PASSPHRASE="smoke-test"
export PULUMI_SKIP_UPDATE_CHECK=1
mkdir -p "$work/state"
cd "$work"
pulumi stack init smoke --non-interactive >/dev/null

if pulumi preview --stack smoke --non-interactive --policy-pack "$pack_dir" >"$work/preview.log" 2>&1; then
  cat "$work/preview.log"
  echo "FAIL: the preview passed, so the pack did not enforce anything" >&2
  exit 1
fi
cat "$work/preview.log"
if ! grep -q "\[mandatory\]  oci-quota-allowlist" "$work/preview.log"; then
  echo "FAIL: the preview failed, but not on the pack's mandatory quota check" >&2
  exit 1
fi
echo "OK: the pack loaded and blocked the preview"
