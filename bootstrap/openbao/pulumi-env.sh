#!/usr/bin/env bash
# The backticks in the messages below are literal (they quote command names for
# a human), not command substitutions -- single quotes are the point.
# shellcheck disable=SC2016
#
# pulumi-env.sh — export the OpenBao credentials a Pulumi run authenticates with.
#
#   eval "$(bootstrap/openbao/pulumi-env.sh)"
#
# Two code paths in home-operations already tell the operator to run exactly
# this — `components/globals.ts` (the comment above `baoProvider`) and the
# error it throws when no credential is present — and until now the script did
# not exist, so every OpenBao-touching Pulumi run needed BAO_ADDR/BAO_ROLE_ID/
# BAO_SECRET_ID exported by hand out of pulumi-approle.sops.yaml.
#
# Emits three `export` lines on STDOUT and nothing else, because the whole
# point is to be eval'd. Every diagnostic goes to STDERR. On any failure it
# exits non-zero with an empty stdout, so `eval` exports nothing rather than
# half a credential — a partially-exported AppRole authenticates fine as far
# as `baoDualWriteEnabled` is concerned and then fails at the provider.
#
#   --print   also write a redacted summary to stderr, so a human running it
#             directly can see which file and address were used
#
# The AppRole lives in SOPS rather than in OpenBao on purpose: it is the
# credential Pulumi authenticates WITH, so it cannot live in the store it
# unlocks (INVENTORY.md §2).
#
# Requires: sops, an age key (SOPS_AGE_KEY_FILE or ~/.config/sops/age/keys.txt).
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HERE
REPO_ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly APPROLE_FILE="bootstrap/openbao/pulumi-approle.sops.yaml"

# equestria's OpenBao. Overridable so a break-glass run can point the same
# credential at a restored standby.
readonly DEFAULT_BAO_ADDR="https://bao.equestria.driscoll.tech"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

print_summary=false
case "${1:-}" in
  "") ;;
  --print) print_summary=true ;;
  -h | --help)
    sed -n '3,25p' "${BASH_SOURCE[0]}" >&2
    exit 0
    ;;
  *) die "unknown argument: $1 (expected --print or nothing)" ;;
esac

command -v sops >/dev/null || die "sops is not on PATH"

# sops resolves .sops.yaml from the CURRENT DIRECTORY, not from the file it is
# handed — the scar tissue for that is in equestria-init.sh. Decrypt does not
# strictly need the config, but running from the repo root costs nothing and
# keeps every script here behaving the same way.
cd "${REPO_ROOT}"
[[ -f "${APPROLE_FILE}" ]] || die "${APPROLE_FILE} not found under ${REPO_ROOT}"

if [[ -n "${SOPS_AGE_KEY_FILE:-}" ]]; then
  [[ -f "${SOPS_AGE_KEY_FILE}" ]] || die "SOPS_AGE_KEY_FILE points at ${SOPS_AGE_KEY_FILE}, which does not exist"
elif [[ -z "${SOPS_AGE_KEY:-}" && ! -f "${HOME}/.config/sops/age/keys.txt" ]]; then
  die "no age key — set SOPS_AGE_KEY_FILE (e.g. equestria-cluster/age.key) or populate ~/.config/sops/age/keys.txt"
fi

# --extract rather than grep/sed. sops writes YAML scalars UNQUOTED, and a
# parser that assumes quotes is exactly the bug that made
# `equestria-init.sh regen_root` read zero recovery shares and then blame the
# shares. Let sops do the parsing.
extract() {
  local key="$1" value
  value="$(sops --decrypt --extract "[\"${key}\"]" "${APPROLE_FILE}" 2>/dev/null)" \
    || die "could not decrypt ${APPROLE_FILE} — is the age key the one it was encrypted to?"
  [[ -n "${value}" ]] || die "${key} is empty in ${APPROLE_FILE}"
  printf '%s' "${value}"
}

role_id="$(extract role_id)"
secret_id="$(extract secret_id)"
bao_addr="${BAO_ADDR:-${DEFAULT_BAO_ADDR}}"

# %q quotes for the shell that will eval this. The values are UUIDs today, but
# a re-minted secret_id is not guaranteed to stay shell-safe forever.
printf 'export BAO_ADDR=%q\n' "${bao_addr}"
printf 'export BAO_ROLE_ID=%q\n' "${role_id}"
printf 'export BAO_SECRET_ID=%q\n' "${secret_id}"

# vals speaks the Vault API and cannot do AppRole itself — it needs a token.
# Minting one here keeps ONE bootstrap step for a local run: this script is
# already what a human runs before touching Pulumi, and .config/secrets.yaml's
# `ref+openbao://` references resolve through exactly these two variables.
#
# A failure to mint is NOT fatal: the sops-backed references still resolve, and
# the AppRole exports above are what Pulumi itself uses. Warn on stderr and
# leave VAULT_* unset rather than exporting an empty token, which would fail
# later as an authorization error and look like a policy problem.
if vault_token="$(
  curl -sf --max-time 10 -X POST "${bao_addr}/v1/auth/approle/login" \
    -H 'Content-Type: application/json' \
    -d "{\"role_id\":\"${role_id}\",\"secret_id\":\"${secret_id}\"}" \
    | sed -n 's/.*"client_token":"\([^"]*\)".*/\1/p'
)" && [[ -n "${vault_token}" ]]; then
  printf 'export VAULT_ADDR=%q\n' "${bao_addr}"
  printf 'export VAULT_TOKEN=%q\n' "${vault_token}"
else
  printf 'WARNING: could not mint a VAULT_TOKEN from %s — `vals` will not resolve ref+openbao:// references.\n' "${bao_addr}" >&2
fi

if [[ "${print_summary}" == true ]]; then
  printf '  BAO_ADDR      %s\n' "${bao_addr}" >&2
  printf '  BAO_ROLE_ID   %s…\n' "${role_id:0:8}" >&2
  printf '  BAO_SECRET_ID <%d chars, from %s>\n' "${#secret_id}" "${APPROLE_FILE}" >&2
  printf '  VAULT_ADDR    %s (for vals)\n' "${bao_addr}" >&2
  if [[ -n "${vault_token:-}" ]]; then
    printf '  VAULT_TOKEN   <minted, %d chars>\n' "${#vault_token}" >&2
  else
    printf '  VAULT_TOKEN   <not minted>\n' >&2
  fi
fi
