#!/usr/bin/env bash
# The ssh command strings below expand ${REMOTE_FILE} on the CLIENT on purpose:
# the path is a local constant and the remote side must see the final string.
# shellcheck disable=SC2029
#
# provision-static-unseal.sh — move bao-transit's static unseal key out of
# 1Password and onto the host that needs it.
#
#   save     1Password  ->  bootstrap/openbao/alpha-site-static-unseal.sops.yaml
#   push     that SOPS file  ->  dockge-as:/var/local/unseal-key   (optional —
#            writing that file by hand is equally fine; this just makes it
#            repeatable and verifies the readback)
#   verify   the two agree, the file is root-only, and bao-transit is unsealed
#
# WHY THIS EXISTS
#
# This key unseals the node that unseals equestria's OpenBao, which holds
# everything else. While it lives in 1Password, 1Password remains a root of
# trust for the whole estate — the one thing INVENTORY.md §2 says must not be
# true. It also cannot move INTO OpenBao (that is the circular dependency the
# seal chain exists to avoid), and it cannot be rendered by the Pulumi operator
# from SOPS: the workspace pods have neither a vault-repo checkout for the
# relative path nor the age key.
#
# So it goes where the recovery shares and the Pulumi passphrase already live:
# bootstrap-tier material, held in SOPS, provisioned onto its host out of band,
# never rendered by anything automated.
#
# ORDER MATTERS. Run `save` then `push` and confirm `verify` is green BEFORE
# merging the home-operations change that stops rendering BAO_UNSEAL_KEY into
# the stack's .env. The compose file declares the host env_file `required:
# true`, so a recreate without this file refuses to start — which is the right
# failure (loud, not a silently sealed root), but only if you have not already
# removed the other source.
#
# The value is never printed and never written to disk in plaintext: it is
# piped from `op` straight into `sops`, and compared by sha256 rather than by
# value.
#
# Requires: op (signed in), sops, an age key, ssh to the dockge host.
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HERE
REPO_ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
readonly REPO_ROOT

readonly SOPS_FILE="bootstrap/openbao/alpha-site-static-unseal.sops.yaml"
readonly OP_REF="op://Eris/OpenBao Alpha Site Static Unseal/current_key"
# The TAILNET name, not the bare hostname. `dockge-as` alone picks up the local
# search domain and resolves to dockge-as.driscoll.tech, whose port 22 is
# refused -- and every ssh here hides stderr, so that surfaced as
# "/var/local/unseal-key MISSING" and "could not read seal status" rather than
# as a connection failure. A verify that reports the key is gone when it is
# actually fine is worse than one that errors.
readonly HOST="${BAO_TRANSIT_HOST:-dockge-as.opossum-yo.ts.net}"
# An env-file on the host, outside every stack directory: nothing that renders
# or syncs the compose stack can touch it, and `docker compose` reads it
# directly via env_file. Estate decision 2026-08-12.
readonly REMOTE_FILE="/var/local/unseal-key"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
ok()  { printf 'ok    %s\n' "$*"; }
warn(){ printf 'warn  %s\n' "$*" >&2; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

# sops resolves .sops.yaml from the CWD, not from --filename-override. Every
# script here cds to the repo root for that reason; getting it wrong produces a
# file encrypted to no recipient, which is unrecoverable.
cd "${REPO_ROOT}"

# A 32-byte AES-256-GCM-96 key, base64-encoded, is 44 characters ending in '='.
# Checked because the seal accepts the value verbatim: a truncated or
# whitespace-wrapped key fails at unseal time, which is the worst place to find
# out.
check_shape() {
  local value="$1" where="$2"
  [[ ${#value} -eq 44 ]] || die "${where}: expected a 44-character base64 key (32 bytes), got ${#value} characters"
  [[ "${value}" == *= ]] || die "${where}: does not look base64-encoded"
}

sha() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }

cmd_save() {
  need op; need sops
  local value
  value="$(op read "${OP_REF}")" || die "could not read ${OP_REF} — is 1Password unlocked?"
  check_shape "${value}" "1Password"

  if [[ -f "${SOPS_FILE}" ]]; then
    local existing
    existing="$(sops --decrypt --extract '["current_key"]' "${SOPS_FILE}")" || die "${SOPS_FILE} exists but will not decrypt"
    if [[ "$(sha "${existing}")" == "$(sha "${value}")" ]]; then
      ok "${SOPS_FILE} already holds this key — nothing to do"
      return 0
    fi
    # Refusing rather than overwriting: the running node is unsealed with ONE
    # of these, and silently replacing the stored copy is how you end up unable
    # to bring it back.
    die "${SOPS_FILE} exists and holds a DIFFERENT key. Resolve by hand — do not overwrite the copy that matches the running node."
  fi

  # Piped, never staged on disk in plaintext.
  #
  # --filename-override is REQUIRED and its absence is why this command had
  # never once succeeded: sops picks its creation_rule by FILENAME, the rule
  # here is `path_regex: bootstrap/.*\.sops\.ya?ml`, and `/dev/stdin` matches
  # no rule at all -- `error loading config: no matching creation rules found`.
  # bf78b76 fixed this same pair of defects in save-pulumi-passphrase.sh and
  # did not reach this script, so the file INVENTORY.md §2 has claimed exists
  # since Phase 1 could never actually be produced.
  #
  # A temp file then mv, rather than redirecting straight at the destination,
  # for the second defect: `> "${SOPS_FILE}"` truncates BEFORE sops runs, so a
  # failed encrypt leaves a zero-byte file behind -- which the guard above then
  # reads as "exists", tries to decrypt, and dies on. One failed run would wedge
  # the command until someone deleted the empty file by hand.
  local tmp
  tmp="$(mktemp "${SOPS_FILE}.XXXXXX")"
  if printf 'current_key: %s\n' "${value}" | sops --encrypt --filename-override "${SOPS_FILE}" /dev/stdin > "${tmp}"; then
    mv "${tmp}" "${SOPS_FILE}"
  else
    rm -f "${tmp}"
    die "sops failed to encrypt ${SOPS_FILE} — nothing was written"
  fi
  sops --decrypt --extract '["current_key"]' "${SOPS_FILE}" >/dev/null || die "wrote ${SOPS_FILE} but it does not decrypt — check .sops.yaml recipients"
  local digest
  digest="$(sha "${value}")"
  ok "wrote ${SOPS_FILE} (sha256 ${digest:0:12})"
}

cmd_push() {
  need sops; need ssh
  [[ -f "${SOPS_FILE}" ]] || die "${SOPS_FILE} does not exist — run '$0 save' first"
  local value
  value="$(sops --decrypt --extract '["current_key"]' "${SOPS_FILE}")" || die "cannot decrypt ${SOPS_FILE}"
  check_shape "${value}" "${SOPS_FILE}"

  # 0400 root-owned: the compose file mounts it read-only into a container that
  # runs as a non-root user, but on the HOST nothing but root should read the
  # key that unseals the estate.
  printf 'BAO_UNSEAL_KEY=%s\n' "${value}" \
    | ssh "${HOST}" "sudo install -m 0400 -o root -g root /dev/stdin '${REMOTE_FILE}'" \
    || die "could not write ${REMOTE_FILE} on ${HOST}"

  local remote_sha local_sha
  remote_sha="$(ssh "${HOST}" "sudo sed -n 's/^BAO_UNSEAL_KEY=//p' '${REMOTE_FILE}' | tr -d '\n' | shasum -a 256 | cut -d' ' -f1")"
  local_sha="$(sha "${value}")"
  [[ "${remote_sha}" == "${local_sha}" ]] || die "readback mismatch on ${HOST}: the file does not hold the key we sent"
  ok "${HOST}:${REMOTE_FILE} matches ${SOPS_FILE}"
}

cmd_verify() {
  need sops; need ssh
  local status=0

  if [[ -f "${SOPS_FILE}" ]]; then ok "${SOPS_FILE} present"; else warn "${SOPS_FILE} MISSING"; status=1; fi

  if ssh "${HOST}" "sudo test -f '${REMOTE_FILE}'" 2>/dev/null; then
    local perms
    perms="$(ssh "${HOST}" "sudo stat -c '%a %U' '${REMOTE_FILE}'")"
    [[ "${perms}" == "400 root" ]] && ok "${REMOTE_FILE} is ${perms}" || { warn "${REMOTE_FILE} is ${perms}, expected '400 root'"; status=1; }
    if [[ -f "${SOPS_FILE}" ]]; then
      local remote_sha local_sha
      remote_sha="$(ssh "${HOST}" "sudo sed -n 's/^BAO_UNSEAL_KEY=//p' '${REMOTE_FILE}' | tr -d '\n' | shasum -a 256 | cut -d' ' -f1")"
      local_sha="$(sha "$(sops --decrypt --extract '["current_key"]' "${SOPS_FILE}")")"
      [[ "${remote_sha}" == "${local_sha}" ]] && ok "host key matches the SOPS copy" || { warn "host key DIFFERS from the SOPS copy"; status=1; }
    fi
  else
    warn "${HOST}:${REMOTE_FILE} MISSING — the compose change must not merge yet"
    status=1
  fi

  # The point of all of it: is the seal root actually unsealed.
  #
  # Via the host's TAILNET address, not 127.0.0.1. The compose stack publishes
  # 8200 on the tailnet IP only -- `ss -ltn` shows `100.111.10.9:8200`, and the
  # header comment at the top of this script says as much -- so the loopback
  # probe this used to do could never answer, and `-sf` made that silent. It
  # reported "could not read seal status" on a perfectly healthy, unsealed node.
  local sealed
  sealed="$(ssh "${HOST}" 'ip="$(tailscale ip -4 2>/dev/null | head -1)"; curl -sf "http://${ip}:8200/v1/sys/seal-status"' 2>/dev/null | sed -n 's/.*"sealed":\([a-z]*\).*/\1/p')" || true
  case "${sealed}" in
    false) ok "bao-transit reports sealed=false" ;;
    true)  warn "bao-transit reports SEALED"; status=1 ;;
    *)     warn "could not read bao-transit seal status from ${HOST}" ;;
  esac

  return "${status}"
}

case "${1:-}" in
  save)   cmd_save ;;
  push)   cmd_push ;;
  verify) cmd_verify ;;
  *) printf 'usage: %s {save|push|verify}\n\n  save    1Password -> %s\n  push    that file -> %s:%s\n  verify  both agree and bao-transit is unsealed\n' "$0" "${SOPS_FILE}" "${HOST}" "${REMOTE_FILE}" >&2; exit 2 ;;
esac
