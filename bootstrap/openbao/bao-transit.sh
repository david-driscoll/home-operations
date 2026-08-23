#!/usr/bin/env bash
#
# bao-transit.sh — status and one-time initialisation of the seal root on alpha-site.
#
#   ./bao-transit.sh status    report where things stand; changes nothing
#   ./bao-transit.sh init      initialise, set up transit, issue the seal token
#
# `init` is idempotent: every step checks first and skips what is already done,
# so a re-run after a partial failure resumes rather than starting over.
#
# Secrets never touch the disk in plaintext and are never printed. Everything is
# piped straight into sops. The only things this prints are paths and states.
#
# Requires: bao, sops, jq, an age key, and BAO_ADDR pointing at bao-transit.
#
# From a user device use the Traefik route — port 8200 is published only to the
# tailnet address of the dockge-as LXC and tailnet ACLs do not open it to user
# devices, so the raw-port form works only from a tagged host:
#
#   export BAO_ADDR=https://bao-transit.opossum-yo.ts.net   # from anywhere
#   export BAO_ADDR=http://100.111.10.9:8200                # from a tagged host
#
set -Eeuo pipefail

readonly KEY_NAME="openbao-equestria-unseal"
readonly POLICY_NAME="equestria-unseal"
readonly TOKEN_PERIOD="768h"

# Assigned separately from `readonly` on purpose: `readonly X="$(cmd)"` swallows
# cmd's exit status, so a failed rev-parse would leave REPO_ROOT empty and
# seal_to would happily write to the filesystem root.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HERE
REPO_ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly RECOVERY_FILE="bootstrap/openbao/recovery-keys.sops.yaml"
readonly TOKEN_FILE="bootstrap/openbao/transit-token.sops.yaml"

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

preflight() {
  local missing=()
  for c in bao sops jq; do command -v "$c" >/dev/null || missing+=("$c"); done
  [[ ${#missing[@]} -eq 0 ]] || die "missing command(s): ${missing[*]}"
  [[ -n "${BAO_ADDR:-}" ]] || die "BAO_ADDR is not set. export BAO_ADDR=http://<alpha-site-tailscale-ip>:8200"
  # sops needs a key to encrypt for; the recipients come from .sops.yaml.
  [[ -n "${SOPS_AGE_KEY_FILE:-}" && -f "${SOPS_AGE_KEY_FILE}" ]] \
    || die "SOPS_AGE_KEY_FILE is unset or missing — required to write the bootstrap files"
  # sops resolves .sops.yaml by walking up from the CURRENT DIRECTORY, not from
  # --filename-override — run from outside the repo and the encrypt fails only
  # AFTER `bao operator init` has minted keys, which then die with this
  # process. equestria-init.sh hit exactly this against the real cluster.
  cd "${REPO_ROOT}"
  printf 'canary: ok\n' \
    | sops --encrypt --filename-override "bootstrap/openbao/preflight-canary.sops.yaml" /dev/stdin >/dev/null \
    || die "sops cannot encrypt (checked before touching the server) — fix this first"
}

# Encrypt stdin to a repo-relative path. Nothing unencrypted is written.
#
# Encrypts to a sibling temp file and moves it into place only on success.
# Redirecting straight at the destination would create the file before sops
# runs, so a failed encrypt would leave an empty file behind — which then trips
# the overwrite guard on every retry and, worse, reads as a written secret.
# The temp file only ever holds sops output, so no plaintext hits the disk.
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

# Exits 0 only when everything is set up; non-zero otherwise, so it can drive a
# wait loop:  until ./bao-transit.sh status; do sleep 10; done
status() {
  log "BAO_ADDR = ${BAO_ADDR}"
  local ready=0

  # `bao status` exits 0 unsealed, 2 sealed, 1 on error — and PRINTS regardless
  # of seal state, including when uninitialised. So reachability is decided by
  # whether we got parseable JSON back, never by the exit code. Treating any
  # non-zero exit as unreachable reports a live-but-uninitialised server as
  # down, which is the one distinction this command exists to make.
  local s
  s="$(bao status -format=json 2>/dev/null)" || true
  jq -e . >/dev/null 2>&1 <<<"${s}" \
    || die "cannot reach ${BAO_ADDR}. Is the bao-transit stack deployed and running on alpha-site?"

  local initialized sealed type
  initialized="$(jq -r '.initialized' <<<"${s}")"
  sealed="$(jq -r '.sealed' <<<"${s}")"
  type="$(jq -r '.type // "?"' <<<"${s}")"

  log "reachable, seal type: ${type}"
  if [[ "${type}" != "static" && "${type}" != "?" ]]; then
    warn "seal type is '${type}', expected 'static' — the seal stanza may not have taken effect"
    ready=1
  fi

  if [[ "${initialized}" == "true" ]]; then ok "initialised"; else warn "NOT initialised — run: $0 init"; ready=1; fi

  if [[ "${sealed}" == "false" ]]; then
    ok "unsealed"
  elif [[ "${initialized}" != "true" ]]; then
    log "sealed, as expected before init"
    ready=1
  else
    warn "SEALED — the static seal did not unseal it. Check that BAO_UNSEAL_KEY reached the container"
    warn "  and that the key is exactly 32 bytes (AES-256-GCM-96); no other size is accepted."
    ready=1
  fi

  # File state is independent of the server, so report it either way.
  for f in "${RECOVERY_FILE}" "${TOKEN_FILE}"; do
    if [[ -f "${REPO_ROOT}/${f}" ]]; then ok "${f} present"; else warn "${f} MISSING"; ready=1; fi
  done

  if [[ "${initialized}" != "true" || "${sealed}" != "false" ]]; then return 1; fi
  if [[ -z "${BAO_TOKEN:-}" ]]; then log "set BAO_TOKEN to inspect transit setup"; return 1; fi

  if bao secrets list -format=json 2>/dev/null | jq -e '."transit/"' >/dev/null
  then ok "transit engine enabled"; else warn "transit engine NOT enabled"; ready=1; fi

  if bao read "transit/keys/${KEY_NAME}" >/dev/null 2>&1
  then ok "key ${KEY_NAME} exists"; else warn "key ${KEY_NAME} does NOT exist"; ready=1; fi

  if bao policy read "${POLICY_NAME}" >/dev/null 2>&1
  then ok "policy ${POLICY_NAME} exists"; else warn "policy ${POLICY_NAME} does NOT exist"; ready=1; fi

  return "${ready}"
}

init() {
  local s root_token=""
  # Same reasoning as status(): judge reachability by parseable JSON, not by the
  # exit code, which is 2 for a live-but-sealed/uninitialised server.
  s="$(bao status -format=json 2>/dev/null)" || true
  jq -e . >/dev/null 2>&1 <<<"${s}" \
    || die "cannot reach ${BAO_ADDR}. Is bao-transit deployed and running?"

  if [[ "$(jq -r '.initialized' <<<"${s}")" != "true" ]]; then
    log "initialising..."
    # No -key-shares / -recovery-shares: the server knows its own seal type and
    # picks the right mode. A static seal is an Auto Unseal, so this yields
    # RECOVERY keys (recovery_keys_b64), not unseal keys — passing the wrong
    # flag family is an error, so we pass neither.
    local out
    out="$(bao operator init -format=json)"

    root_token="$(jq -r '.root_token' <<<"${out}")"
    [[ -n "${root_token}" && "${root_token}" != "null" ]] || die "init returned no root token"

    # Take whichever key family came back rather than assuming.
    local keys kind
    if [[ "$(jq -r '.recovery_keys_b64 | length' <<<"${out}")" != "0" ]]; then
      keys="$(jq -c '.recovery_keys_b64' <<<"${out}")"; kind="recovery"
    else
      keys="$(jq -c '.unseal_keys_b64' <<<"${out}")"; kind="unseal"
      warn "server returned UNSEAL keys, not recovery keys — the static seal may not be active."
      warn "  Verify the seal stanza took effect before relying on auto-unseal."
    fi

    {
      printf '# %s keys for bao-transit on alpha-site. See ../RUNBOOK.md.\n' "${kind}"
      printf '# The root token is deliberately NOT stored: it is revoked at the end of init.\n'
      printf '# Regenerate one on demand via "bao operator generate-root" using these shares.\n'
      printf 'kind: %s\n' "${kind}"
      # The field is recovery_keys_threshold, NOT recovery_threshold. Getting
      # this wrong falls through to unseal_threshold, which under an auto seal
      # is the Shamir threshold of the empty, unused unseal-key family — always
      # 1, and meaningless here. Recording 1 against 5 recovery shares tells a
      # future break-glass operator that one share is enough; it is not.
      # Verified against `bao operator init -format=json` on 2.6.1.
      printf 'threshold: %s\n' "$(jq -r '.recovery_keys_threshold // .unseal_threshold' <<<"${out}")"
      printf 'shares:\n'
      jq -r '.[]' <<<"${keys}" | while IFS= read -r k; do printf '  - "%s"\n' "${k}"; done
    } | seal_to "${RECOVERY_FILE}"

    unset out
  else
    ok "already initialised"
    [[ -n "${BAO_TOKEN:-}" ]] || die "already initialised — set BAO_TOKEN to a root-capable token to continue"
  fi

  export BAO_TOKEN="${root_token:-${BAO_TOKEN}}"

  if [[ "$(bao status -format=json | jq -r '.sealed')" == "true" ]]; then
    die "sealed. The static seal should have unsealed it automatically — check BAO_UNSEAL_KEY in the container."
  fi

  if bao secrets list -format=json | jq -e '."transit/"' >/dev/null; then
    ok "transit already enabled"
  else
    bao secrets enable transit >/dev/null && ok "enabled transit"
  fi

  if bao read "transit/keys/${KEY_NAME}" >/dev/null 2>&1; then
    ok "key ${KEY_NAME} already exists"
  else
    # NOT exportable, deliberately: an exportable key can be read out by anyone
    # holding a read token, which is a far worse blast radius than an offline
    # backup of this container's storage. See ../INVENTORY.md.
    bao write -f "transit/keys/${KEY_NAME}" >/dev/null && ok "created key ${KEY_NAME}"
  fi

  # Encrypt/decrypt on this one key and nothing else.
  bao policy write "${POLICY_NAME}" - >/dev/null <<EOF
path "transit/encrypt/${KEY_NAME}" {
  capabilities = ["update"]
}

path "transit/decrypt/${KEY_NAME}" {
  capabilities = ["update"]
}
EOF
  ok "wrote policy ${POLICY_NAME}"

  if [[ -f "${REPO_ROOT}/${TOKEN_FILE}" ]]; then
    warn "${TOKEN_FILE} exists — leaving it alone. Delete it first to issue a fresh token."
  else
    # Orphan so it survives its parent (the root token we are about to revoke);
    # periodic so it renews indefinitely and never expires under the cluster.
    local seal_token
    seal_token="$(bao token create -policy="${POLICY_NAME}" -orphan -period="${TOKEN_PERIOD}" \
      -format=json | jq -r '.auth.client_token')"
    [[ -n "${seal_token}" && "${seal_token}" != "null" ]] || die "failed to create the seal token"

    {
      printf '# Token equestria OpenBao presents to bao-transit to auto-unseal.\n'
      printf '# Consumed as VAULT_TRANSIT_SEAL_TOKEN. Orphan + periodic (%s).\n' "${TOKEN_PERIOD}"
      printf '# Also goes in kubernetes/apps/kube-system/openbao/secret.sops.yaml\n'
      printf '# as openbao-seal/transit-token.\n'
      printf 'token: "%s"\n' "${seal_token}"
    } | seal_to "${TOKEN_FILE}"
    unset seal_token
  fi

  # Only revoke a root token we minted ourselves this run.
  if [[ -n "${root_token}" ]]; then
    if bao token revoke -self >/dev/null 2>&1; then
      ok "revoked the initial root token (regenerate from recovery shares if needed)"
    else
      warn "could not revoke the initial root token — revoke it by hand"
    fi
  fi

  cat <<'NEXT'

Done. Next:
  1. Commit the two new bootstrap/openbao/*.sops.yaml files.
  2. Move the static unseal key off 1Password into
     bootstrap/openbao/alpha-site-static-unseal.sops.yaml, then repoint
     home-operations docker/alpha-site/bao-transit/.env at it. Until that
     happens 1Password is still a root of trust for the whole estate.
  3. Create kubernetes/apps/kube-system/openbao/secret.sops.yaml in this repo
     with Secret `openbao-seal`:
        transit-token       <- token from transit-token.sops.yaml
        pg-connection-url   <- postgres://openbao:<pw>@postgres-rw.database.svc.cluster.local:5432/openbao
                               (<pw> is the openbao entry in passwords.sops.yaml)
     then uncomment it in kustomization.yaml and drop `suspend: true` from
     ks.yaml IN THE SAME COMMIT.
NEXT
}

preflight
case "${1:-}" in
  status) status ;;
  init)   init ;;
  *)      die "usage: $0 status|init" ;;
esac
