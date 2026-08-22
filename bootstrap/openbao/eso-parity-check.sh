#!/usr/bin/env bash
#
# eso-parity-check.sh — run BEFORE each Phase 6 batch.
#
# Finds every ExternalSecret whose template references a field that is ABSENT
# in OpenBao. That is the "empty is not missing" trap:
#
#   1Password carried the field with an EMPTY value, so {{ .foo }} rendered "".
#   Phase 4 did not migrate empty-valued fields, so in OpenBao the key is
#   ABSENT. ESO renders with missingkey=error, so the whole ExternalSecret
#   fails — not just that entry.
#
#   unable to mutate secret X: could not apply template:
#   executing "Y" at <.foo>: map has no entry for key "foo"
#
# It broke equestria/kometa on KOMETA_OMDB_APIKEY (equestria-cluster#3087).
# The fix is `{{ index . "foo" | default "" }}`, which yields the zero value
# instead of erroring and renders byte-identically to the 1Password era.
#
# Requires: kubectl (equestria), sops + age key, jq, curl, python3.
# Prints field NAMES only, never values.
set -Eeuo pipefail
# KUBECONFIG follows the ambient context (point it at equestria first).
# The age key defaults to this repo's gitignored ./age.key, like .config/mise.toml.
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${REPO_ROOT}/age.key}"
BAO="${BAO_ADDR:-https://bao.equestria.driscoll.tech}"
cd "${REPO_ROOT}"

creds="$(sops -d bootstrap/openbao/pulumi-approle.sops.yaml)"
rid="$(awk '/^role_id:/{print $2}' <<<"$creds")"; sid="$(awk '/^secret_id:/{print $2}' <<<"$creds")"
T="$(jq -nc --arg r "$rid" --arg s "$sid" '{role_id:$r,secret_id:$s}' \
  | curl -sS -m 20 -X POST "$BAO/v1/auth/approle/login" --data-binary @- | jq -r '.auth.client_token')"
export BAO T

kubectl get externalsecret -A -o json > /tmp/all-es.json

python3 - <<'PY'
import json, os, re, subprocess, urllib.request

BAO, T = os.environ["BAO"], os.environ["T"]
data = json.load(open("/tmp/all-es.json"))

def bao_fields(path):
    req = urllib.request.Request(f"{BAO}/v1/secrets/data/{path}")
    req.add_header("X-Vault-Token", T)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return set((json.loads(r.read())["data"]["data"] or {}).keys())
    except Exception:
        return None

def apply_rewrite(name, rules):
    # ESO uses Go ReplaceAllString, but a `(.*)` source also matches the empty
    # string at the end, which duplicates the prefix and produced false
    # positives on every prefixing rule. count=1 models the intent.
    for r in rules:
        rx = r.get("regexp")
        if not rx: continue
        target = re.sub(r"\$(\d)", r"\\\1", rx["target"])
        count = 1 if rx["source"].strip() in ("(.*)", "^(.*)$") else 0
        name = re.sub(rx["source"], target, name, count=count)
    return name

risky, checked = [], 0
for es in data["items"]:
    spec = es["spec"]; md = es["metadata"]
    tmpl = ((spec.get("target") or {}).get("template") or {}).get("data") or {}
    refs = set()
    for v in tmpl.values():
        refs |= set(re.findall(r"\{\{\s*\.([A-Za-z0-9_]+)", str(v)))
    if not refs: continue
    for df in (spec.get("dataFrom") or []):
        ex = df.get("extract") or {}
        key = ex.get("key")
        store = ((df.get("sourceRef") or {}).get("storeRef") or {}).get("name") or spec["secretStoreRef"]["name"]
        if store != "openbao" or not key: continue
        checked += 1
        have = bao_fields(key)
        if have is None:
            risky.append((md["namespace"], md["name"], key, "PATH MISSING")); continue
        rules = df.get("rewrite") or []
        have_rw = {apply_rewrite(h, rules) for h in have}
        missing = sorted(r for r in refs if r not in have_rw)
        if missing:
            risky.append((md["namespace"], md["name"], key, "refs absent: " + ", ".join(missing)))

print(f"checked {checked} openbao-backed extracts\n")
if not risky:
    print("  no template references an absent field — nothing else exposed to the kometa trap")
for ns, name, key, why in risky:
    print(f"  {ns}/{name}\n      {key}\n      {why}")
PY
