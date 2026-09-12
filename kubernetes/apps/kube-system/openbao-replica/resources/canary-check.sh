#!/usr/bin/env bash
#
# canary-check.sh — daily proof that the restore-test AppRole can still READ the
# canary, tested against the LIVE server.
#
# WHY THIS EXISTS SEPARATELY FROM ./restore-test.sh
#
# The monthly restore test proves the whole break-glass chain: dump leaves the
# building, comes back, decrypts, restores, unseals via transit, and serves a
# read. Its LAST step -- the canary read -- is the only one that depends on
# server-side GRANT state rather than on the dump, and that grant is the one
# piece of the chain that can rot without anybody touching this repo.
#
# It did, on 2026-09-05: the shared/ -> third-party-tokens/ reorganisation moved
# the canary and reaped the old path, while the live `restore-test` POLICY went
# on granting the destroyed one. The role could read nothing. Nothing noticed
# until the monthly job ran and failed at step 6, and it would have stayed
# unnoticed until 2026-10-01 had the alert not been looked at by hand.
#
# A month of silence is too long for "the break-glass credential is dead". This
# job closes that window to a day by testing the ONE thing that rots, and only
# that thing.
#
# WHY NOT `bootstrap/openbao/restore-test.sh status`
#
# That is the obvious candidate and it does not work here. `status` reads the
# policy DOCUMENT (`bao policy read restore-test`) and string-matches
# CANARY_PATH in it, which needs the `admin` policy -- so scheduling it would
# mean parking an admin token in the cluster, a strictly worse problem than the
# drift it detects. It also only proves the policy TEXT names the path, not that
# a login through the AppRole can actually read it.
#
# Logging in as the role and reading the path needs only the role's own
# credential -- the same one the monthly job already carries, already in this
# namespace -- and tests the grant end to end instead of by proxy. `status`
# stays the right tool for a human with an admin token in hand.
#
# WHAT THE RESULT MEANS, which is the whole point of splitting the codes apart:
#
#   200  grant intact. Nothing to do.
#   403  THE DRIFT. Policy no longer covers CANARY_PATH. Fix with
#        `./bootstrap/openbao/restore-test.sh init` (needs admin).
#   404  the canary itself is gone from the live server -- a path move that
#        did not update this env var, or a deletion.
#   anything else, or a failed login: this job or the server, NOT the grant.
#        Says so rather than blaming the backup.
#
# Environment (set in helmrelease.yaml): BAO_ADDR, BAO_ROLE_ID, BAO_SECRET_ID,
# CANARY_PATH, GATUS_URL/CONNECT_TO/TOKEN.
#
# NOTE for editors: delivered through a Flux-substituted ConfigMap -- keep
# shell expansions $unbraced so no $${UPPERCASE} can collide with a cluster
# substitution variable.
set -Eeuo pipefail

report() {
  local success="$1" msg="${2:-}"
  local url="$GATUS_URL/api/v1/endpoints/$GATUS_TOKEN/external?success=$success"
  if [ "$success" != "true" ] && [ -n "$msg" ]; then
    url="$url&error=$(printf '%s' "$msg" | head -c 512 | od -An -tx1 -v | tr -d ' \n' | sed 's/../%&/g')"
  fi
  curl -sf -X POST \
    --connect-to "$GATUS_CONNECT_TO" \
    -H "Authorization: Bearer $GATUS_TOKEN" \
    "$url" >/dev/null || echo "WARN: failed to report to Gatus"
}

fail() {
  echo "CANARY CHECK FAILED: $*" >&2
  report false "$*"
  exit 1
}
trap 'fail "canary-check.sh aborted at line $LINENO"' ERR

# ── Log in with the restore-test AppRole ────────────────────────────────────
# Status captured rather than piped into a bare assignment: under `set -e` a
# non-2xx on `x=$(curl -sf ...)` aborts on that line and the explanatory
# `fail` never runs, which is the trap ./restore-test.sh documents at length
# after hitting it twice. Same reasoning, same shape.
login_code="$(curl -s -o /tmp/login.json -w '%{http_code}' -X POST "$BAO_ADDR/v1/auth/approle/login" \
  -d "{\"role_id\":\"$BAO_ROLE_ID\",\"secret_id\":\"$BAO_SECRET_ID\"}" || echo 000)"
[ "$login_code" = "200" ] || fail "approle login returned HTTP $login_code: $(head -c 300 /tmp/login.json 2>/dev/null) — the ROLE or its secret_id is gone, not the policy. Re-mint with bootstrap/openbao/restore-test.sh (needs admin)."

token="$(jq -r '.auth.client_token // empty' /tmp/login.json 2>/dev/null || true)"
[ -n "$token" ] || fail "approle login returned HTTP 200 but no client_token: $(head -c 300 /tmp/login.json 2>/dev/null)"

# ── Read the canary ─────────────────────────────────────────────────────────
canary_code="$(curl -s -o /tmp/canary.json -w '%{http_code}' -H "X-Vault-Token: $token" "$BAO_ADDR/v1/$CANARY_PATH" || echo 000)"

case "$canary_code" in
  200) : ;;
  403) fail "POLICY DRIFT: restore-test can log in but is DENIED on $CANARY_PATH (HTTP 403). The live policy no longer grants the canary — the monthly restore test will fail at step 6 and the backup is formally UNTRUSTED (RUNBOOK Scenario D). Fix: ./bootstrap/openbao/restore-test.sh init with an admin token." ;;
  404) fail "CANARY MISSING: $CANARY_PATH does not exist on the live server (HTTP 404). Either the path moved without this env var following it, or the secret was deleted. Check CANARY_PATH against bootstrap/openbao/restore-test.sh." ;;
  *)   fail "canary read of $CANARY_PATH returned HTTP $canary_code: $(head -c 300 /tmp/canary.json 2>/dev/null) — this is the checker or the server, not the grant." ;;
esac

fields="$(jq -r '.data.data | length // 0' /tmp/canary.json 2>/dev/null || echo 0)"
[ "$fields" -gt 0 ] || fail "canary read of $CANARY_PATH returned HTTP 200 but no fields: $(head -c 300 /tmp/canary.json 2>/dev/null)"

echo "canary check PASSED: restore-test reads $CANARY_PATH ($fields field(s))"
report true
