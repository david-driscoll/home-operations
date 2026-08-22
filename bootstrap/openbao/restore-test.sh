#!/usr/bin/env bash
#
# restore-test.sh — one-time provisioning for the Phase 5 monthly restore
# test (RUNBOOK Scenario D): a `restore-test` policy that can read exactly one
# canary path, and an AppRole carrying it.
#
#   ./restore-test.sh status    report where things stand; changes nothing
#   ./restore-test.sh init      write policy + role, mint credentials
#
# Why this exists: the monthly job in equestria restores the nightly dump
# into a scratch server and must prove a KV read works. OpenBao ≥ 2.5.3
# disables unauthenticated generate-root, so "just make a root token against
# the restored copy" is not a plan — instead the job logs in with an AppRole
# minted here against the LIVE cluster. The credential rides along inside
# every dump, so it works against the restored copy by construction, and a
# successful login doubles as proof the auth backends survived the round trip.
#
# `init` is idempotent: each step checks first and skips what is already done.
#
# Requires: bao, sops, jq, an age key, BAO_ADDR at the equestria cluster
# (https://bao.equestria.driscoll.tech), and BAO_TOKEN holding a token with
# the `admin` policy — policy and approle writes are beyond the pulumi role.
# If no admin token exists, regenerating one from the recovery shares needs
# the listener's `disable_unauthed_generate_root_endpoints` flipped first
# (see docs/openbao-migration/STATUS.md, "facts established the hard way").
#
# After `init`, copy the two values into the equestria repo secret the job
# reads — the script prints the exact commands. Two encrypted copies, two
# repos, ONE minting event: if the role is ever re-minted, update both.
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HERE
REPO_ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly APPROLE_FILE="bootstrap/openbao/restore-test-approle.sops.yaml"

# The canary is the same key PLAN §Verification and RUNBOOK Scenario B read.
# If it ever moves, change it here, in the equestria helmrelease
# (CANARY_PATH), and in the RUNBOOK together.
readonly CANARY_PATH="secrets/data/shared/cloudflare-driscoll-tech"

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

preflight() {
  local missing=()
  for c in bao sops jq; do command -v "$c" >/dev/null || missing+=("$c"); done
  [[ ${#missing[@]} -eq 0 ]] || die "missing command(s): ${missing[*]}"
  [[ -n "${BAO_ADDR:-}" ]] || die "BAO_ADDR is not set — use https://bao.equestria.driscoll.tech"
  [[ -n "${SOPS_AGE_KEY_FILE:-}" && -f "${SOPS_AGE_KEY_FILE}" ]] \
    || die "SOPS_AGE_KEY_FILE is unset or missing — required to write ${APPROLE_FILE}"
  # sops resolves .sops.yaml from the CURRENT DIRECTORY (see equestria-init.sh
  # for the scar tissue behind this), and prove the encrypt path before
  # minting anything.
  cd "${REPO_ROOT}"
  printf 'canary: ok\n' \
    | sops --encrypt --filename-override "bootstrap/openbao/preflight-canary.sops.yaml" /dev/stdin >/dev/null \
    || die "sops cannot encrypt (checked before touching the server) — fix this first"
}

seal_to() {
  local rel="$1" abs="${REPO_ROOT}/$1"
  [[ -e "${abs}" ]] && die "${rel} already exists — refusing to overwrite. Move it aside first."
  mkdir -p "$(dirname "${abs}")"
  local tmp
  tmp="$(mktemp "${abs}.XXXXXX")"
  if sops --encrypt --filename-override "${rel}" /dev/stdin > "${tmp}"; then
    mv "${tmp}" "${abs}"
    ok "wrote ${rel}"
  else
    rm -f "${tmp}"
    die "sops failed to encrypt ${rel} — nothing was written"
  fi
}

status() {
  preflight
  log "server: ${BAO_ADDR}"
  if bao policy read restore-test >/dev/null 2>&1; then ok "policy restore-test exists"; else warn "policy restore-test missing"; fi
  if bao read auth/approle/role/restore-test >/dev/null 2>&1; then ok "approle role restore-test exists"; else warn "approle role restore-test missing"; fi
  if [[ -f "${REPO_ROOT}/${APPROLE_FILE}" ]]; then ok "${APPROLE_FILE} exists"; else warn "${APPROLE_FILE} not written yet"; fi
}

init() {
  preflight
  [[ -n "${BAO_TOKEN:-}" ]] || die "BAO_TOKEN is not set — needs the admin policy (see header)"

  # Read-only on the one canary path, nothing else. The restored copy this
  # role is used against contains every estate secret; the role must not.
  if bao policy read restore-test >/dev/null 2>&1; then
    ok "policy restore-test already exists"
  else
    bao policy write restore-test - >/dev/null <<EOF
# Monthly restore test (vault/bootstrap/RUNBOOK.md Scenario D): the single
# canary read that proves a restored dump serves secrets. Deliberately not a
# path glob — widening this widens what a leaked cluster Secret can read.
path "${CANARY_PATH}" {
  capabilities = ["read"]
}
EOF
    ok "wrote policy restore-test (read on ${CANARY_PATH})"
  fi

  if bao read auth/approle/role/restore-test >/dev/null 2>&1; then
    ok "approle role restore-test already exists"
  else
    # secret_id_ttl=0: the credential must stay valid inside months-old dumps.
    # Short token TTL: each test logs in afresh and needs minutes, not hours.
    bao write auth/approle/role/restore-test \
      token_policies="restore-test" \
      token_ttl=15m token_max_ttl=1h \
      secret_id_ttl=0 secret_id_num_uses=0 >/dev/null
    ok "wrote approle role restore-test"
  fi

  if [[ -f "${REPO_ROOT}/${APPROLE_FILE}" ]]; then
    warn "${APPROLE_FILE} exists — leaving it alone. Delete it first to mint fresh credentials."
  else
    local role_id secret_id
    role_id="$(bao read -field=role_id auth/approle/role/restore-test/role-id)"
    secret_id="$(bao write -f -field=secret_id auth/approle/role/restore-test/secret-id)"
    [[ -n "${role_id}" && -n "${secret_id}" ]] || die "failed to mint approle credentials"

    {
      printf '# AppRole for the monthly restore test (RUNBOOK Scenario D). Policy:\n'
      printf '# restore-test — read on %s only.\n' "${CANARY_PATH}"
      printf '# The applied copy lives in this repo at\n'
      printf '# kubernetes/apps/kube-system/openbao-replica/secret.sops.yaml; if this is\n'
      printf '# ever re-minted, update both in the same sitting.\n'
      printf 'role_id: "%s"\n' "${role_id}"
      printf 'secret_id: "%s"\n' "${secret_id}"
    } | seal_to "${APPROLE_FILE}"

    log ""
    log "Now copy the credentials into the applied copy (from this repo root;"
    log "sops set takes a JSON-encoded value, hence the escaped quotes):"
    log "  rid=\"\$(sops -d --extract '[\"role_id\"]' ${APPROLE_FILE})\""
    log "  sid=\"\$(sops -d --extract '[\"secret_id\"]' ${APPROLE_FILE})\""
    log "  sops set kubernetes/apps/kube-system/openbao-replica/secret.sops.yaml '[\"stringData\"][\"role-id\"]' \"\\\"\$rid\\\"\""
    log "  sops set kubernetes/apps/kube-system/openbao-replica/secret.sops.yaml '[\"stringData\"][\"secret-id\"]' \"\\\"\$sid\\\"\""
    unset role_id secret_id
  fi

  ok "done"
}

case "${1:-}" in
  status) status ;;
  init)   init ;;
  *) die "usage: $(basename "$0") status|init" ;;
esac
