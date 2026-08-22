#!/usr/bin/env bash
#
# save-pulumi-passphrase.sh — give the Pulumi state passphrase a SOPS home.
#
# It is the one value a local run needs that can NEVER come from OpenBao:
# it decrypts the Pulumi state, and INVENTORY.md §2 bars it from the store
# Pulumi unlocks. Until now it existed only in 1Password and as a Kubernetes
# Secret, so `mise` had to resolve it through `op run` — the last reason the
# local workflow needed 1Password at all.
#
# Source of truth is the live cluster Secret (pulumi/pulumi-operator-passphrase),
# because that is what every operator run actually decrypts state with. Reading
# it from there rather than from 1Password means the copy we store is the one
# in use, not one that agreed with it at some point.
#
# The value is never printed and never written to disk in plaintext: piped
# straight from kubectl into sops, and compared by sha256.
#
# Requires: kubectl (equestria), sops, an age key.
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
readonly HERE REPO_ROOT
readonly SOPS_FILE="bootstrap/openbao/pulumi-passphrase.sops.yaml"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
ok()  { printf 'ok    %s\n' "$*"; }
sha() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }

cd "${REPO_ROOT}"
command -v sops >/dev/null || die "sops is required"
command -v kubectl >/dev/null || die "kubectl is required"

value="$(kubectl -n pulumi get secret pulumi-operator-passphrase -o jsonpath='{.data.password}' | base64 -d)" \
  || die "could not read pulumi/pulumi-operator-passphrase — is KUBECONFIG pointed at equestria?"
[[ -n "${value}" ]] || die "the cluster Secret is empty"

if [[ -f "${SOPS_FILE}" ]]; then
  existing="$(sops --decrypt --extract '["passphrase"]' "${SOPS_FILE}")" || die "${SOPS_FILE} exists but will not decrypt"
  if [[ "$(sha "${existing}")" == "$(sha "${value}")" ]]; then ok "${SOPS_FILE} already matches the cluster"; exit 0; fi
  # Refusing rather than overwriting: state encrypted with the OTHER value is
  # unreadable without it, and this file may be the only copy left.
  die "${SOPS_FILE} holds a DIFFERENT passphrase than the cluster. Resolve by hand — do not overwrite the one that decrypts existing state."
fi

# --filename-override so sops matches this repo's creation_rule (path_regex
# bootstrap/...), and a temp file so a failed encrypt cannot leave an empty
# file that trips the guard above forever. Same shape as seal_to() in
# bao-transit.sh.
tmp="$(mktemp "${SOPS_FILE}.XXXXXX")"
if printf 'passphrase: %s\n' "${value}" | sops --encrypt --filename-override "${SOPS_FILE}" /dev/stdin > "${tmp}"; then
  mv "${tmp}" "${SOPS_FILE}"
else
  rm -f "${tmp}"; die "sops failed to encrypt ${SOPS_FILE} — nothing was written"
fi
sops --decrypt --extract '["passphrase"]' "${SOPS_FILE}" >/dev/null || die "wrote ${SOPS_FILE} but it does not decrypt"
digest="$(sha "${value}")"
ok "wrote ${SOPS_FILE} (sha256 ${digest:0:12})"
