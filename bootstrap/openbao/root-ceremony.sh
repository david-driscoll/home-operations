#!/usr/bin/env bash
# The backticks in the messages below are literal (they quote command names for
# a human), not command substitutions -- single quotes are the point.
# shellcheck disable=SC2016
#
# root-ceremony.sh — regenerate a root token from the recovery shares, do the
# work that only `admin` can do, and revoke the token again.
#
#   ./bootstrap/openbao/root-ceremony.sh probe   read-only checks; consumes nothing
#   ./bootstrap/openbao/root-ceremony.sh run     the real thing
#
# ── Why this exists, and why equestria-init.sh cannot do it ──────────────────
#
# OpenBao 2.6.1 has TWO root-generation APIs:
#
#   sys/generate-root/*         unauthenticated, DEPRECATED. Nominally gated by the
#                               listener flag disable_unauthed_generate_root_endpoints,
#                               which is NOT set here — but served only by STANDBY
#                               nodes; the active node says "unsupported operation".
#                               So BAO_ADDR must be pinned to one standby pod, not
#                               pointed at the load-balanced ingress. See
#                               check_endpoint_open().
#   sys/generate-root-token/*   authenticated. 403s without a token that has
#                               capabilities on it — and no such policy exists
#                               here, which is the whole reason we are locked out.
#
# `bao operator generate-root` speaks ONLY the second one — including `-status`
# and `-decode`, which contact the server too. So with the listener flag flipped
# you get this, which reads like the flag did not work:
#
#   $ bao operator generate-root -init
#   URL: PUT .../v1/sys/generate-root-token/attempt
#   Code: 403.  * permission denied
#
#   $ curl .../v1/sys/generate-root/attempt
#   {"started":false,"progress":0,"required":3,"complete":false}      <-- open
#
# equestria-init.sh `regen_root` is built on that CLI end to end, so it can
# never succeed on this version. Hence: raw API, and a local decode.
#
# ── Secret hygiene ───────────────────────────────────────────────────────────
#
# Recovery shares and the root token stay in shell variables and are fed to
# curl/bao via stdin or env — never argv, never a temp file, never stdout. The
# only things printed are progress lines and non-secret status.
#
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HERE
REPO_ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly RECOVERY_FILE="bootstrap/openbao/equestria-recovery-keys.sops.yaml"
readonly ATTEMPT_URL_PATH="/v1/sys/generate-root/attempt"
readonly UPDATE_URL_PATH="/v1/sys/generate-root/update"

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

MINTED_ROOT=""
# Best-effort revoke on any exit path, so an error between mint and revoke does
# not strand a root token with no TTL.
cleanup() {
  if [[ -n "${MINTED_ROOT}" ]]; then
    if BAO_TOKEN="${MINTED_ROOT}" bao token revoke -self >/dev/null 2>&1; then
      ok "root token revoked"
    else
      warn "COULD NOT REVOKE THE ROOT TOKEN — revoke it by hand immediately"
    fi
    MINTED_ROOT=""
  fi
}
trap cleanup EXIT

preflight() {
  local missing=()
  for c in bao sops jq curl python3; do command -v "$c" >/dev/null || missing+=("$c"); done
  [[ ${#missing[@]} -eq 0 ]] || die "missing command(s): ${missing[*]}"
  [[ -n "${BAO_ADDR:-}" ]] || die "BAO_ADDR is not set"
  [[ -n "${SOPS_AGE_KEY_FILE:-}" && -f "${SOPS_AGE_KEY_FILE}" ]] \
    || die "SOPS_AGE_KEY_FILE is unset or missing"
  # sops resolves .sops.yaml by walking up from the CURRENT directory, not from
  # the file argument. Same trap that once initialised this cluster with
  # unrecoverable keys (see STATUS.md) — so anchor the cwd before anything else.
  cd "${REPO_ROOT}"
  [[ -f "${RECOVERY_FILE}" ]] || die "${RECOVERY_FILE} not found"
  ok "preflight ok (repo root: ${REPO_ROOT})"
}

# Print the recovery shares on stdout, one per line. Callers must consume this
# in-process — never redirect it to a file or the terminal.
#
# Parses the `shares:` block only, and tolerates quoted OR unquoted scalars.
# equestria-init.sh uses `sed -n 's/^  - "\(.*\)"$/\1/p'`, which requires
# quotes — sops writes these unquoted, so that expression silently yields ZERO
# shares and the ceremony dies claiming the shares are wrong. Stopping at the
# next top-level key also keeps the `sops:` block's `- enc: |` entries out.
read_shares() {
  sops --decrypt "${REPO_ROOT}/${RECOVERY_FILE}" | awk '
    /^shares:[[:space:]]*$/ { in_shares = 1; next }
    /^[^[:space:]]/         { in_shares = 0 }
    in_shares && /^[[:space:]]*-[[:space:]]+/ {
      sub(/^[[:space:]]*-[[:space:]]+/, "")
      sub(/^"/, ""); sub(/"$/, "")
      sub(/^'"'"'/, ""); sub(/'"'"'$/, "")
      if (length($0)) print
    }'
}

# XOR-decode the encoded root token against the OTP, locally. `bao operator
# generate-root -decode` cannot be used: it calls the server first, on the
# authenticated path, and 403s.
#
# Encoding has varied across versions (raw vs padded base64), so try both and
# accept whichever yields printable ASCII.
decode_token() {
  local encoded="$1" otp="$2"
  ENCODED="${encoded}" OTP="${otp}" python3 - <<'PY'
import base64, os, sys

encoded = os.environ["ENCODED"]
otp = os.environ["OTP"].encode()

for decoder in (base64.urlsafe_b64decode, base64.b64decode):
    for candidate in (encoded, encoded + "=" * (-len(encoded) % 4)):
        try:
            raw = decoder(candidate)
        except Exception:
            continue
        if len(raw) != len(otp):
            continue
        token = bytes(a ^ b for a, b in zip(raw, otp))
        if all(32 <= c < 127 for c in token):
            sys.stdout.write(token.decode())
            sys.exit(0)
sys.exit(1)
PY
}

# Prove the decode maths before trusting it with the real ceremony.
self_test_decode() {
  # The OTP is exactly as long as the token — the server sizes it that way and
  # reports it as otp_length. Generating a shorter one here made zip() silently
  # truncate and the self-test fail, which is precisely the class of bug this
  # exists to catch, so keep the lengths tied together.
  local token="s.SelfTestToken12345" otp encoded got
  otp="$(TOKEN_LEN="${#token}" python3 -c '
import os, secrets, string
n = int(os.environ["TOKEN_LEN"])
print("".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(n)))')"
  encoded="$(TOKEN="${token}" OTP="${otp}" python3 -c '
import base64, os
t = os.environ["TOKEN"].encode(); o = os.environ["OTP"].encode()
print(base64.b64encode(bytes(a ^ b for a, b in zip(t, o))).decode())')"
  got="$(decode_token "${encoded}" "${otp}")" || die "decode self-test threw"
  [[ "${got}" == "${token}" ]] || die "decode self-test mismatch"
  ok "decode self-test passed"
}

attempt_status() { curl -sS -m 20 "${BAO_ADDR}${ATTEMPT_URL_PATH}"; }

# ── The endpoint is STANDBY-ONLY, and BAO_ADDR must be pinned to ONE pod ─────
#
# Measured on OpenBao 2.6.1, 2026-08-10: `sys/generate-root/*` is served by
# STANDBY nodes and the ACTIVE node answers {"errors":["unsupported operation"]}.
# It is NOT gated by disable_unauthed_generate_root_endpoints here — the live
# listener config carries no such flag. An earlier note in STATUS.md claimed the
# endpoint 403s by default; that was measured with `bao operator generate-root
# -status`, which speaks the AUTHENTICATED sys/generate-root-token/* path and
# 403s regardless. This function used to repeat that mistake and told the
# operator to land the listener toggle, which is neither the cause nor a fix.
#
# Why pinning matters more than reachability: mint_root makes FOUR-PLUS requests
# (cancel, open attempt, then one per share). Through an ingress that
# load-balances across three pods, those can land on DIFFERENT nodes — so the
# attempt lives on one pod while recovery shares are submitted to another. That
# spends shares for nothing and leaves a stale attempt behind.
#
# So this probes repeatedly and refuses to continue unless EVERY response is
# consistent, which is only true when BAO_ADDR reaches exactly one pod.
readonly PIN_PROBES=5
check_endpoint_open() {
  local body good=0 bad=0 required=""
  local i
  for ((i = 0; i < PIN_PROBES; i++)); do
    body="$(attempt_status)" || die "cannot reach ${BAO_ADDR}"
    if jq -e 'has("required")' >/dev/null 2>&1 <<<"${body}"; then
      good=$((good + 1)); required="$(jq -r '.required' <<<"${body}")"
    else
      bad=$((bad + 1))
    fi
  done

  if (( good > 0 && bad > 0 )); then
    die "BAO_ADDR is load-balanced across pods (${good}/${PIN_PROBES} responses served the
    endpoint, ${bad}/${PIN_PROBES} did not). DO NOT CONTINUE: the attempt and the share
    submissions would land on different nodes and spend recovery shares for nothing.

    Pin ONE STANDBY pod and point BAO_ADDR at it:
      kubectl -n kube-system port-forward pod/openbao-0 18200:8200
      export BAO_ADDR=http://127.0.0.1:18200
    Pick a pod whose label openbao-active is false — the ACTIVE node does not serve
    this endpoint. Then re-run."
  fi

  if (( good == 0 )); then
    die "this endpoint is not served here (got: $(head -c 120 <<<"${body}")).
    Most likely BAO_ADDR is pinned to the ACTIVE node, which answers 'unsupported
    operation' for sys/generate-root/*. Port-forward a STANDBY pod instead:
      kubectl -n kube-system get pods -l app.kubernetes.io/name=openbao \\
        -o custom-columns=NAME:.metadata.name,ACTIVE:.metadata.labels.openbao-active
      kubectl -n kube-system port-forward pod/<a-standby> 18200:8200
      export BAO_ADDR=http://127.0.0.1:18200"
  fi

  ok "generate-root reachable and BAO_ADDR is pinned to one pod (threshold ${required})"
}

# Mint a root token into MINTED_ROOT. Never prints it.
mint_root() {
  curl -sS -m 20 -X DELETE "${BAO_ADDR}${ATTEMPT_URL_PATH}" >/dev/null 2>&1 || true

  local attempt nonce otp
  attempt="$(curl -sS -m 20 -X PUT "${BAO_ADDR}${ATTEMPT_URL_PATH}")" \
    || die "could not start a root-generation attempt"
  nonce="$(jq -r '.nonce // empty' <<<"${attempt}")"
  otp="$(jq -r '.otp // empty' <<<"${attempt}")"
  [[ -n "${nonce}" && -n "${otp}" ]] || die "attempt returned no nonce/otp"
  ok "attempt started (nonce ${nonce:0:8}…)"

  local encoded="" fed=0 share out
  while IFS= read -r share; do
    [[ -n "${share}" ]] || continue
    out="$(jq -nc --arg key "${share}" --arg nonce "${nonce}" '{key:$key,nonce:$nonce}' \
      | curl -sS -m 20 -X PUT "${BAO_ADDR}${UPDATE_URL_PATH}" --data-binary @-)" \
      || die "share submission failed after ${fed} share(s)"
    fed=$((fed + 1))
    if jq -e '.errors? | length > 0' >/dev/null 2>&1 <<<"${out}"; then
      die "server rejected share #${fed}: $(jq -rc '.errors' <<<"${out}")"
    fi
    log "fed share ${fed} (progress $(jq -r '.progress // "?"' <<<"${out}")/$(jq -r '.required // "?"' <<<"${out}"))"
    encoded="$(jq -r '.encoded_token // .encoded_root_token // empty' <<<"${out}")"
    [[ -n "${encoded}" ]] && break
  done < <(read_shares)

  [[ -n "${encoded}" ]] || die "fed ${fed} share(s) but got no encoded token — wrong or insufficient shares?"

  MINTED_ROOT="$(decode_token "${encoded}" "${otp}")" || die "could not decode the root token"
  [[ -n "${MINTED_ROOT}" ]] || die "decoded an empty root token"

  BAO_TOKEN="${MINTED_ROOT}" bao token lookup -format=json >/dev/null 2>&1 \
    || die "the decoded token does not authenticate — decode is wrong, token NOT revoked automatically"
  ok "root token minted and verified"
}

probe() {
  preflight
  self_test_decode
  check_endpoint_open
  local n
  n="$(read_shares | grep -c . || true)"
  [[ "${n}" -ge 3 ]] || die "only ${n} recovery share(s) readable — need at least the threshold"
  ok "recovery file decrypts; ${n} shares readable"
  printf '\nprobe clean — nothing was consumed.\n'
  printf '  policy / auth-role edit (the usual case):  %s resume\n' "$0"
  printf '  full first-time setup:                    %s run\n' "$0"
  printf '  provision the break-glass AppRole:        %s breakglass\n' "$0"
  printf '\nUse `resume` after editing write_policies or the auth-role block:\n'
  printf '`run` also calls restore-test.sh init, which refuses to overwrite an existing\n'
  printf 'approle file and fails the whole ceremony AFTER minting a root token.\n'
}

run() {
  preflight
  self_test_decode
  check_endpoint_open
  mint_root

  export BAO_TOKEN="${MINTED_ROOT}"

  printf '\n── re-writing policies (equestria-init.sh resume) ──\n'
  "${HERE}/equestria-init.sh" resume

  printf '\n── provisioning the restore-test AppRole ──\n'
  "${HERE}/restore-test.sh" init

  printf '\nDone. The root token is revoked on exit.\n'
  printf 'NEXT: revert the generate-root listener toggle in equestria-cluster and roll the pods.\n'
}

# Provision the `break-glass` AppRole: a credential whose ONLY power is to open
# a root-generation attempt on the authenticated endpoint.
#
# This is what retires the listener toggle. `bao operator generate-root` speaks
# sys/generate-root-token/*, which needs a token with capabilities there; no
# policy had any, so the only way in was exposing the deprecated
# unauthenticated endpoint and rolling every pod twice.
#
# It grants no read access to any secret. Completing an attempt still requires
# the recovery shares (threshold 3), so possession of this AppRole alone mints
# nothing — it only removes the need to make the endpoint public first.
#
# Honest caveat: this AppRole lives in the same SOPS store as the recovery
# shares, so one age key still reaches both. That was already true before this
# change; it is not made worse, but it is not key separation either.
breakglass() {
  bao policy write break-glass - >/dev/null <<'EOF'
# Opens a root-generation attempt. Grants NOTHING else — no secret reads.
# Completing an attempt still needs the recovery shares (threshold 3).
path "sys/generate-root-token/attempt" {
  capabilities = ["create", "read", "update", "delete", "sudo"]
}
path "sys/generate-root-token/update" {
  capabilities = ["create", "update", "sudo"]
}
EOF
  ok "wrote policy break-glass"

  bao write auth/approle/role/break-glass \
    token_policies="break-glass" token_ttl=30m token_max_ttl=2h \
    secret_id_ttl=0 secret_id_num_uses=0 >/dev/null
  ok "wrote approle role break-glass"

  local out rid sid
  rid="$(bao read -field=role_id auth/approle/role/break-glass/role-id)"
  sid="$(bao write -f -field=secret_id auth/approle/role/break-glass/secret-id)"
  [[ -n "${rid}" && -n "${sid}" ]] || die "approle returned empty credentials"

  out="bootstrap/openbao/break-glass-approle.sops.yaml"
  [[ -e "${REPO_ROOT}/${out}" ]] && die "${out} already exists — move it aside to re-mint"
  local tmp
  tmp="$(mktemp "${REPO_ROOT}/${out}.XXXXXX")"
  if printf '# AppRole whose only capability is opening a root-generation attempt on\n# sys/generate-root-token/*. Grants no secret reads. Completing an attempt\n# still requires 3 of the 5 recovery shares in equestria-recovery-keys.sops.yaml.\n#\n# This is what makes the TEMPORARY generate-root listener toggle unnecessary:\n#   eval "$(printf %%s "export BAO_ROLE_ID=... BAO_SECRET_ID=...")"\n#   bao write -field=token auth/approle/login role_id=... secret_id=...\n#   BAO_TOKEN=<that> bao operator generate-root -init\nrole_id: %s\nsecret_id: %s\n' "${rid}" "${sid}" \
      | sops --encrypt --filename-override "${out}" /dev/stdin > "${tmp}"; then
    mv "${tmp}" "${REPO_ROOT}/${out}"
    ok "wrote ${out}"
  else
    rm -f "${tmp}"
    die "sops failed to encrypt ${out} — the AppRole exists but its credentials are LOST; delete the role and re-run"
  fi
}

run_breakglass() {
  preflight
  self_test_decode
  check_endpoint_open
  mint_root
  export BAO_TOKEN="${MINTED_ROOT}"
  printf '\n── provisioning the break-glass AppRole ──\n'
  breakglass
  printf '\nDone. The root token is revoked on exit.\n'
}

# Mint a root token, re-run the idempotent server setup, revoke. This is the
# one to reach for after editing write_policies or the auth-role block in
# equestria-init.sh — `run` also calls restore-test.sh init, which refuses to
# overwrite an existing approle file and would fail the whole ceremony.
run_resume() {
  preflight
  self_test_decode
  check_endpoint_open
  mint_root
  export BAO_TOKEN="${MINTED_ROOT}"
  printf '\n── re-running server setup (equestria-init.sh resume) ──\n'
  "${HERE}/equestria-init.sh" resume
  printf '\nDone. The root token is revoked on exit.\n'
}

case "${1:-}" in
  probe)      probe ;;
  run)        run ;;
  resume)     run_resume ;;
  breakglass) run_breakglass ;;
  *)          printf 'usage: %s {probe|run|resume|breakglass}\n' "$0" >&2; exit 64 ;;
esac
