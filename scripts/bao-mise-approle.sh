#!/usr/bin/env bash
#
# bao-mise-approle.sh — the AppRole that `.config/mise.toml` authenticates with.
#
#   ./scripts/bao-mise-approle.sh create    # first run: role + credentials
#   ./scripts/bao-mise-approle.sh verify    # log in with the sealed file, no writes
#   ./scripts/bao-mise-approle.sh rotate    # new secret_id, then destroy the old one
#
# Until now every `ref+openbao://` value in .config/mise.toml needed a manual
# `eval "$(bootstrap/openbao/pulumi-env.sh)"` first, which mints a
# VAULT_TOKEN out of the `pulumi` AppRole (then in the vault repo, now under
# bootstrap/ here). That works, but it puts a shell-eval between the operator
# and every command, and the token expires mid-session. This role is the same credential shape
# reachable from home-operations alone: the sealed file lives here, and
# .config/mise.toml points BAO_ROLE_ID / BAO_SECRET_ID at it.
#
# `vals` resolves those two through its sops provider (age key only — no
# OpenBao), then uses them for AppRole login on every `ref+openbao://`. The
# ordering is enforced by .config/mise/tasks/vals-run, which resolves the
# BAO_* bootstrap references in a first pass before anything else.
#
# ## Policy
#
# `pulumi` — the same policy the operator's pulumi AppRole carries: create/
# read/update/delete/list on secrets/, docs/ and meta/, plus the OIDC auth
# management paths. A separate ROLE rather than a copy of the pulumi
# credential, so this one can be rotated or revoked without touching what the
# Pulumi operator runs as.
#
# Note what that means: the sealed file in this repo unlocks everything Pulumi
# can reach, so it is exactly as sensitive as vault:pulumi-approle.sops.yaml
# and is protected only by the age key. Rotate it (`rotate`) if a workstation
# with the age key is lost.
#
# ## Requirements
#
# - BAO_ADDR and a PRIVILEGED BAO_TOKEN. Writing auth/approle/role/* is beyond
#   the `pulumi` policy itself, so this needs `admin` — i.e. a root ceremony
#   (bootstrap/openbao/root-ceremony.sh) or an OIDC login in the admin
#   group. Run it, then revoke.
# - SOPS_AGE_KEY_FILE (or ~/.config/sops/age/keys.txt) holding one of the
#   recipients in .sops.yaml.
set -Eeuo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly ROLE="mise"
readonly POLICY="pulumi"
readonly APPROLE_FILE=".config/bao-approle.sops.yaml"

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '3,8p' "${BASH_SOURCE[0]}" >&2
  exit 2
}

preflight() {
  local missing=()
  for c in bao sops jq; do command -v "${c}" >/dev/null || missing+=("${c}"); done
  [[ ${#missing[@]} -eq 0 ]] || die "missing command(s): ${missing[*]}"
  [[ -n "${BAO_ADDR:-}" ]] || die "BAO_ADDR is not set"

  if [[ -z "${SOPS_AGE_KEY:-}" ]]; then
    if [[ -n "${SOPS_AGE_KEY_FILE:-}" ]]; then
      [[ -f "${SOPS_AGE_KEY_FILE}" ]] || die "SOPS_AGE_KEY_FILE points at ${SOPS_AGE_KEY_FILE}, which does not exist"
    else
      [[ -f "${HOME}/.config/sops/age/keys.txt" ]] || die "no age key — set SOPS_AGE_KEY_FILE or populate ~/.config/sops/age/keys.txt"
    fi
  fi

  # sops walks up from the CURRENT DIRECTORY to find .sops.yaml and its
  # creation rules, not from the path it is handed. equestria-init.sh learned
  # this the expensive way (equestria-init.sh's comment: an encrypt that
  # failed AFTER keys were minted cost a re-initialised cluster).
  cd "${REPO_ROOT}"
}

# Prove the encrypt path works before anything mints a credential — a failure
# after `secret-id` is issued leaves a live credential nobody holds.
sops_canary() {
  printf 'canary: ok\n' \
    | sops --encrypt --filename-override "${APPROLE_FILE}" /dev/stdin >/dev/null \
    || die "sops cannot encrypt ${APPROLE_FILE} (checked before touching the server) — is there a creation_rule in .sops.yaml matching it?"
  ok "sops can encrypt ${APPROLE_FILE}"
}

# Encrypt stdin to a repo-relative path. No plaintext ever reaches the disk:
# sops writes to a sibling temp file, which is moved into place only on
# success — redirecting straight at the destination would leave an empty file
# behind on failure, which then reads as a written credential.
seal_to() {
  local rel="$1" abs="${REPO_ROOT}/$1" tmp
  mkdir -p "$(dirname "${abs}")"
  tmp="$(mktemp "${abs}.XXXXXX")"
  if sops --encrypt --filename-override "${rel}" /dev/stdin > "${tmp}"; then
    mv "${tmp}" "${abs}"
    ok "wrote ${rel}"
  else
    rm -f "${tmp}"
    die "sops failed to encrypt ${rel} — nothing was written"
  fi
}

seal_credentials() {
  local role_id="$1" secret_id="$2"
  {
    printf '# AppRole for local/CI tooling in home-operations, against equestria OpenBao.\n'
    printf '# Consumed by .config/mise.toml as BAO_ROLE_ID / BAO_SECRET_ID via ref+sops://,\n'
    printf '# resolved by .config/mise/tasks/vals-run before any ref+openbao:// value.\n'
    printf '# Role: %s. Policy: %s (rw secrets/, docs/, meta/).\n' "${ROLE}" "${POLICY}"
    printf '# Create/rotate with scripts/bao-mise-approle.sh — never by hand.\n'
    printf 'role_id: "%s"\n' "${role_id}"
    printf 'secret_id: "%s"\n' "${secret_id}"
  } | seal_to "${APPROLE_FILE}"
}

require_privileged_token() {
  [[ -n "${BAO_TOKEN:-}" ]] || die "BAO_TOKEN is not set — this needs an admin token (root ceremony or OIDC admin login)"
  bao token lookup >/dev/null 2>&1 || die "BAO_TOKEN is not valid against ${BAO_ADDR}"
  # Ask the server rather than parsing policy names: a token can reach this
  # path through admin, a root token, or any future policy, and guessing which
  # is how a check like this ends up rejecting a credential that works.
  local caps
  caps="$(bao write -field=capabilities sys/capabilities-self paths="auth/approle/role/${ROLE}" 2>/dev/null || true)"
  case "${caps}" in
    *root* | *create* | *update*) ok "token can write auth/approle/role/${ROLE}" ;;
    *) die "BAO_TOKEN cannot write auth/approle/role/${ROLE} (capabilities: ${caps:-none}) — needs admin" ;;
  esac
}

ensure_role() {
  bao policy read "${POLICY}" >/dev/null 2>&1 \
    || die "policy '${POLICY}' does not exist on ${BAO_ADDR} — binding a role to a missing policy yields a token that can read nothing"

  if bao read "auth/approle/role/${ROLE}" >/dev/null 2>&1; then
    ok "approle role ${ROLE} already exists"
    return
  fi
  # TTLs match the operator's pulumi role: a long-lived secret_id because
  # nothing is resident to renew one between runs, and short TOKEN lifetimes
  # because each command logs in afresh.
  bao write "auth/approle/role/${ROLE}" \
    token_policies="${POLICY}" \
    token_ttl=1h token_max_ttl=4h \
    secret_id_ttl=0 secret_id_num_uses=0 >/dev/null
  ok "wrote approle role ${ROLE} (policy ${POLICY})"
}

cmd_create() {
  preflight
  [[ ! -e "${REPO_ROOT}/${APPROLE_FILE}" ]] \
    || die "${APPROLE_FILE} already exists — use 'rotate' to replace its secret_id, or move it aside"
  require_privileged_token
  sops_canary
  ensure_role

  local role_id secret_id
  role_id="$(bao read -field=role_id "auth/approle/role/${ROLE}/role-id")"
  secret_id="$(bao write -f -field=secret_id "auth/approle/role/${ROLE}/secret-id")"
  [[ -n "${role_id}" && -n "${secret_id}" ]] || die "failed to mint approle credentials"
  seal_credentials "${role_id}" "${secret_id}"
  unset secret_id

  cat <<'NEXT'

Done. Next:
  1. Commit .config/bao-approle.sops.yaml (encrypted; the age key stays out of git).
  2. Revoke the admin token you ran this with: bao token revoke -self
  3. Check it: ./scripts/bao-mise-approle.sh verify
  4. Use it: mise run vals-run pulumi preview
     — no `eval "$(bootstrap/openbao/pulumi-env.sh)"` needed any more.
NEXT
}

# Decrypt one key out of the sealed file. --extract rather than grep: sops
# writes YAML scalars unquoted, and a parser that assumes quotes is the bug
# that made equestria-init.sh's regen_root read zero recovery shares and then
# blame the shares.
extract() {
  local key="$1" value
  value="$(sops --decrypt --extract "[\"${key}\"]" "${APPROLE_FILE}" 2>/dev/null)" \
    || die "could not decrypt ${APPROLE_FILE} — is the age key the one it was encrypted to?"
  [[ -n "${value}" ]] || die "${key} is empty in ${APPROLE_FILE}"
  printf '%s' "${value}"
}

cmd_verify() {
  preflight
  [[ -f "${REPO_ROOT}/${APPROLE_FILE}" ]] || die "${APPROLE_FILE} not found — run 'create' first"
  local role_id secret_id token
  role_id="$(extract role_id)"
  secret_id="$(extract secret_id)"

  # Log in with the sealed credential exactly as vals will, rather than with
  # whatever BAO_TOKEN happens to be exported — the point is to test the file.
  token="$(bao write -field=token auth/approle/login role_id="${role_id}" secret_id="${secret_id}" 2>/dev/null)" \
    || die "AppRole login failed — the secret_id may have been destroyed by a rotate elsewhere. Re-run 'rotate'."
  ok "login succeeded (role_id ${role_id:0:8}…)"
  BAO_TOKEN="${token}" bao token lookup -format=json \
    | jq -r '"  ✓ policies: \(.data.policies | join(", "))  ttl: \(.data.ttl)s"'
  BAO_TOKEN="${token}" bao token revoke -self >/dev/null 2>&1 \
    && ok "revoked the test token"
}

cmd_rotate() {
  preflight
  [[ -f "${REPO_ROOT}/${APPROLE_FILE}" ]] || die "${APPROLE_FILE} not found — run 'create' first"
  require_privileged_token
  sops_canary
  ensure_role

  local old_secret_id role_id new_secret_id
  old_secret_id="$(extract secret_id)"
  role_id="$(bao read -field=role_id "auth/approle/role/${ROLE}/role-id")"
  new_secret_id="$(bao write -f -field=secret_id "auth/approle/role/${ROLE}/secret-id")"
  [[ -n "${role_id}" && -n "${new_secret_id}" ]] || die "failed to mint a new secret_id"

  # Order matters: seal the new credential BEFORE destroying the old one, so a
  # failure anywhere leaves a working credential on disk rather than none.
  rm -f "${REPO_ROOT}/${APPROLE_FILE}"
  seal_credentials "${role_id}" "${new_secret_id}"
  unset new_secret_id

  if bao write "auth/approle/role/${ROLE}/secret-id/destroy" secret_id="${old_secret_id}" >/dev/null 2>&1; then
    ok "destroyed the previous secret_id"
  else
    warn "could not destroy the previous secret_id — it stays valid. Destroy it by hand:"
    warn "  bao list auth/approle/role/${ROLE}/secret-id"
  fi
  unset old_secret_id
  log "Commit the updated ${APPROLE_FILE}, then revoke your admin token."
}

case "${1:-}" in
  create) cmd_create ;;
  verify) cmd_verify ;;
  rotate) cmd_rotate ;;
  *) usage ;;
esac
