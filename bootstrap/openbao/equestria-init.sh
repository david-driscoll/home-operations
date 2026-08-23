#!/usr/bin/env bash
#
# equestria-init.sh — status and one-time initialisation of the equestria
# OpenBao cluster (Phase 3 of the migration: init, mounts, auth methods,
# policies — no consumers yet).
#
#   ./equestria-init.sh status    report where things stand; changes nothing
#   ./equestria-init.sh init      initialise, mount kv, enable auth, write policies
#   ./equestria-init.sh resume    finish a run that died after init — regenerates
#                                 a root token from the recovery shares first
#   ./equestria-init.sh oidc      enable OIDC login against Authentik: viewer
#                                 policy, oidc auth method, admin + family roles.
#                                 Needs OPENBAO_OIDC_CLIENT_ID,
#                                 OPENBAO_OIDC_CLIENT_SECRET and
#                                 OPENBAO_OIDC_DISCOVERY_URL set (source: the
#                                 equestria-openbao-oidc-credentials 1Password
#                                 item), plus either BAO_TOKEN or a live
#                                 generate-root listener toggle (see regen_root).
#
# `init` is idempotent: every step checks first and skips what is already done,
# so a re-run after a partial failure resumes rather than starting over.
#
# Secrets never touch the disk in plaintext and are never printed. Everything is
# piped straight into sops. The only things this prints are paths and states.
#
# Requires: bao, sops, jq, an age key, and BAO_ADDR pointing at the cluster.
#
# Before the HTTPRoute has a ready backend (i.e. before this script has run),
# reach the API through a port-forward:
#
#   kubectl --kubeconfig <equestria-kubeconfig> -n kube-system port-forward pod/openbao-0 8200:8200 &
#   export BAO_ADDR=http://127.0.0.1:8200
#
# Afterwards the gateway route works from anywhere internal:
#
#   export BAO_ADDR=https://bao.<cluster-domain>
#
# The transit seal is an Auto Unseal, so init yields RECOVERY keys and the
# server unseals itself against bao-transit on alpha-site the moment init
# completes. If init hangs or errors on the seal, that is the first live proof
# the unseal path is broken — check the dockge-as egress Service ports, then
# reachability from a pod, then the token (see docs/openbao-migration/STATUS.md).
#
set -Eeuo pipefail

# Assigned separately from `readonly` on purpose: `readonly X="$(cmd)"` swallows
# cmd's exit status, so a failed rev-parse would leave REPO_ROOT empty and
# seal_to would happily write to the filesystem root.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HERE
REPO_ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly RECOVERY_FILE="bootstrap/openbao/equestria-recovery-keys.sops.yaml"
readonly APPROLE_FILE="bootstrap/openbao/pulumi-approle.sops.yaml"

# The three kv-v2 mounts from PLAN.md §A. meta/ is migration bookkeeping only.
readonly KV_MOUNTS=(secrets docs meta)

# The two OIDC redirect URIs, mirrored EXACTLY from the Authentik client in
# kubernetes/apps/kube-system/openbao/definition.yaml — a
# mismatch fails the login with "unauthorized redirect_uri". The UI path has
# "oidc" twice by design: /auth/<mount-path>/oidc/callback with the default
# mount path "oidc". Port 8250 is the local listener `bao login -method=oidc`
# runs for the CLI flow.
readonly OIDC_REDIRECT_UI="https://bao.equestria.driscoll.tech/ui/vault/auth/oidc/oidc/callback"
readonly OIDC_REDIRECT_CLI="http://localhost:8250/oidc/callback"

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

preflight() {
  local missing=()
  for c in bao sops jq; do command -v "$c" >/dev/null || missing+=("$c"); done
  [[ ${#missing[@]} -eq 0 ]] || die "missing command(s): ${missing[*]}"
  [[ -n "${BAO_ADDR:-}" ]] || die "BAO_ADDR is not set — port-forward openbao-0 or use the gateway route (see header)"
  # sops needs a key to encrypt for; the recipients come from .sops.yaml.
  [[ -n "${SOPS_AGE_KEY_FILE:-}" && -f "${SOPS_AGE_KEY_FILE}" ]] \
    || die "SOPS_AGE_KEY_FILE is unset or missing — required to write the bootstrap files"
  # sops resolves .sops.yaml (and its creation rules) by walking up from the
  # CURRENT DIRECTORY, not from --filename-override. Run from anywhere else and
  # the encrypt fails — which is catastrophic here, because it fails AFTER
  # `bao operator init` has already minted keys that then die with this process.
  # This exact failure initialised the real cluster once with unrecoverable
  # keys; the storage had to be wiped and re-initialised.
  cd "${REPO_ROOT}"
  # And because that failure mode is unrecoverable, prove the encrypt path
  # works BEFORE any step that mints keys. This catches a missing .sops.yaml,
  # a bad age key, or a broken sops install while retrying is still free.
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

# The policies from PLAN.md §B. `ci` is deliberately absent: the plan calls it
# "read-only, narrow" without saying narrow on *what*, and a guessed policy is
# worse than none — add it alongside its first consumer. `oidc` auth lives in
# the `oidc` subcommand, not here: it can only run once the Authentik
# provider/client exists (created by the home-operations `applications` stack).
write_policies() {
  bao policy write admin - >/dev/null <<'EOF'
# Full control. Held by humans via recovery-share root regeneration (and later
# the oidc admin group) — nothing automated runs as admin.
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
EOF
  ok "wrote policy admin"

  bao policy write pulumi - >/dev/null <<'EOF'
# Pulumi (home-operations, vault) and the op-to-bao migration tool.
#
# Data: read/write across all three mounts. No mount management — creating or
# moving a KV mount stays a bootstrap-time decision.
path "secrets/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "docs/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "meta/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# OIDC human login, managed by home-operations components/openbao/oidc.ts.
#
# Scoped to the single `oidc` auth path and the single `viewer` policy rather
# than sys/auth/* and sys/policies/acl/* — Pulumi must be able to manage THIS
# auth method, not to mount arbitrary new ones.
#
# `sudo` is unavoidable on the sys/auth path: enabling, reading or deleting an
# auth method is a root-protected operation in OpenBao, so a plain
# create/update grant is silently insufficient and the provider fails with
# permission denied. Reading is what the provider does on every refresh, so
# this is needed for preview, not just apply.
path "sys/auth/oidc" {
  capabilities = ["create", "read", "update", "delete", "sudo"]
}
# The mount-config (tune) path, which is NOT covered by the grant above.
# `sys/auth/oidc` enables and deletes the method; the provider reads and writes
# the method's tune block through `sys/mounts/auth/oidc`, and those are separate
# ACL paths. Without this, the AuthBackend resource creates fine and then fails
# on its very next update with
#   403 GET /v1/sys/mounts/auth/oidc: permission denied
# which also blocks the two roles, because they depend on the backend. Tuning a
# mount is root-protected in the same way enabling one is, hence `sudo`.
path "sys/mounts/auth/oidc" {
  capabilities = ["read", "update", "sudo"]
}
path "sys/mounts/auth/oidc/tune" {
  capabilities = ["read", "update", "sudo"]
}
path "sys/policies/acl/viewer" {
  capabilities = ["create", "read", "update", "delete"]
}
path "auth/oidc/config" {
  capabilities = ["create", "read", "update"]
}
path "auth/oidc/role/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# SGC's kubernetes auth mount (Phase 7), managed by
# components/openbao/clusterAuth.ts. Same shape and same reasoning as the oidc
# grants above: named paths, never sys/auth/* or sys/mounts/auth/*, so Pulumi
# can manage THIS mount and cannot enable arbitrary others.
#
# It needed a mount of its own because `auth/kubernetes` is configured with
# kubernetes_host="https://kubernetes.default.svc:443" — equestria's own API
# server — so it can only validate equestria ServiceAccount tokens. See the
# warning in configure_kubernetes_auth() below.
#
# ⚠️ VESTIGIAL. SGC was decommissioned 2026-08-17 and equestria is the only
# cluster left, so nothing logs in through `kubernetes-sgc` any more. These
# grants and the `eso-sgc` policy written below are deliberately left in place:
# retiring them is step 4 of Phase 2 in
# docs/cluster-consolidation/22-decommission-sgc.md, which also hand-deletes
# the server-side mount. Do not drop them here in isolation — the mount would
# outlive the grant that lets Pulumi clean it up.
path "sys/auth/kubernetes-sgc" {
  capabilities = ["create", "read", "update", "delete", "sudo"]
}
path "sys/mounts/auth/kubernetes-sgc" {
  capabilities = ["read", "update", "sudo"]
}
path "sys/mounts/auth/kubernetes-sgc/tune" {
  capabilities = ["read", "update", "sudo"]
}
path "auth/kubernetes-sgc/config" {
  capabilities = ["create", "read", "update"]
}
path "auth/kubernetes-sgc/role/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
EOF
  ok "wrote policy pulumi"

  local cluster
  for cluster in equestria sgc; do
    bao policy write "eso-${cluster}" - >/dev/null <<EOF
# ESO ClusterSecretStore/openbao in ${cluster}: read-only over shared plus EVERY
# cluster subtree. kv-v2 data reads hit data/, LIST hits metadata/.
#
# This was once \`clusters/${cluster}/*\` -- each cluster confined to its own
# subtree. That invariant only holds while every consumer of a secret runs on
# the cluster the secret is filed under, and it does not:
#
#   - Not every site is a Kubernetes cluster. alpha-site is a Dockge host, so
#     the loop above never mints an \`eso-alpha-site\` role and nothing can ever
#     be granted \`clusters/alpha-site/*\`. Its secrets are still real and still
#     have readers.
#   - Those readers live on equestria. \`pulumi/authentik-secret\` and
#     \`equestria/dynacat-env\` both extract
#     \`clusters/alpha-site/apps/authentik/token\` -- Authentik runs on
#     alpha-site but is configured by the Pulumi stack on equestria.
#
# Under the old scope those two got a flat 403 (the path exists; the role was
# not scoped for it). ESO surfaced it as SecretSyncedError, which left the
# \`pulumi-secrets\` Kustomization unable to pass health checks and blocked 15
# Kustomizations behind it on DependencyNotReady.
#
# Widened deliberately: one OpenBao serves the whole estate and every cluster
# is trusted equally, so per-cluster read isolation was buying separation
# between components that already share an operator and a network. Still
# read-only -- this is the escape hatch for cross-site reads, not a licence to
# file everything under clusters/.
#
# THE THREE NON-CLUSTER PREFIXES BELOW ARE LOAD-BEARING AND WERE ADDED LATE.
# \`shared/\` was drained into \`third-party-tokens/\`, \`apps/\` and \`docker/\` by
# the reorganisation (docs/openbao-shared-secrets-reorg.md, scripts/bao-reorg).
# A trailing \`*\` is a prefix glob that spans \`/\`, so \`clusters/*\` covers
# everything filed per-site, but NONE of those three. They were applied to the
# live policy by root ceremony at reorg time; this script lagged because it
# lived in another repo and could not be edited in the same change. Re-running
# it without them would NARROW the live policy back and flip ~30
# ExternalSecrets to SecretSyncedError at their next refresh -- up to an hour
# later, with nothing in the run to point at.
#
# \`retired/\` is deliberately absent: nothing reads a retired secret, which is
# what makes it retired. \`shared/\` is now EMPTY -- phase 5 reaped the sources on
# 2026-08-22, confirmed by list -- so its two grants are vestigial and can be
# dropped at the next root ceremony. Left in place rather than removed in the
# same change that fixes the restore-test policy: a grant on an empty prefix
# permits nothing, so removing it buys nothing and costs a second live edit.
path "secrets/data/shared/*" {
  capabilities = ["read"]
}
path "secrets/metadata/shared/*" {
  capabilities = ["read", "list"]
}
path "secrets/data/clusters/*" {
  capabilities = ["read"]
}
path "secrets/metadata/clusters/*" {
  capabilities = ["read", "list"]
}
path "secrets/data/third-party-tokens/*" {
  capabilities = ["read"]
}
path "secrets/metadata/third-party-tokens/*" {
  capabilities = ["read", "list"]
}
path "secrets/data/apps/*" {
  capabilities = ["read"]
}
path "secrets/metadata/apps/*" {
  capabilities = ["read", "list"]
}
path "secrets/data/docker/*" {
  capabilities = ["read"]
}
path "secrets/metadata/docker/*" {
  capabilities = ["read", "list"]
}
EOF
    ok "wrote policy eso-${cluster}"
  done
}

# Exits 0 only when everything is set up; non-zero otherwise, so it can drive a
# wait loop:  until ./equestria-init.sh status; do sleep 10; done
status() {
  log "BAO_ADDR = ${BAO_ADDR}"
  local ready=0

  # `bao status` exits 0 unsealed, 2 sealed, 1 on error — and PRINTS regardless
  # of seal state, including when uninitialised. So reachability is decided by
  # whether we got parseable JSON back, never by the exit code.
  local s
  s="$(bao status -format=json 2>/dev/null)" || true
  jq -e . >/dev/null 2>&1 <<<"${s}" \
    || die "cannot reach ${BAO_ADDR}. Is the StatefulSet up? (kubectl -n kube-system get pods -l app.kubernetes.io/name=openbao)"

  local initialized sealed type
  initialized="$(jq -r '.initialized' <<<"${s}")"
  sealed="$(jq -r '.sealed' <<<"${s}")"
  type="$(jq -r '.type // "?"' <<<"${s}")"

  log "reachable, seal type: ${type}"
  if [[ "${type}" != "transit" && "${type}" != "?" ]]; then
    warn "seal type is '${type}', expected 'transit' — the seal stanza may not have taken effect"
    ready=1
  fi

  if [[ "${initialized}" == "true" ]]; then ok "initialised"; else warn "NOT initialised — run: $0 init"; ready=1; fi

  if [[ "${sealed}" == "false" ]]; then
    ok "unsealed"
  elif [[ "${initialized}" != "true" ]]; then
    log "sealed, as expected before init"
    ready=1
  else
    warn "SEALED — transit auto-unseal did not take. Check bao-transit on alpha-site"
    warn "  (bao-transit.sh status) and the egress path (STATUS.md, 'One thing that"
    warn "  could not be verified in advance')."
    ready=1
  fi

  # File state is independent of the server, so report it either way.
  for f in "${RECOVERY_FILE}" "${APPROLE_FILE}"; do
    if [[ -f "${REPO_ROOT}/${f}" ]]; then ok "${f} present"; else warn "${f} MISSING"; ready=1; fi
  done

  if [[ "${initialized}" != "true" || "${sealed}" != "false" ]]; then return 1; fi
  if [[ -z "${BAO_TOKEN:-}" ]]; then log "set BAO_TOKEN to inspect mounts/auth/policies"; return 1; fi

  local mounts m
  mounts="$(bao secrets list -format=json 2>/dev/null)" || mounts='{}'
  for m in "${KV_MOUNTS[@]}"; do
    if jq -e --arg m "${m}/" '.[$m]' >/dev/null <<<"${mounts}"
    then ok "kv mount ${m}/ present"; else warn "kv mount ${m}/ MISSING"; ready=1; fi
  done

  local auths a
  auths="$(bao auth list -format=json 2>/dev/null)" || auths='{}'
  for a in kubernetes approle; do
    if jq -e --arg a "${a}/" '.[$a]' >/dev/null <<<"${auths}"
    then ok "auth ${a} enabled"; else warn "auth ${a} NOT enabled"; ready=1; fi
  done

  local p
  for p in admin pulumi eso-equestria eso-sgc viewer; do
    if bao policy read "${p}" >/dev/null 2>&1
    then ok "policy ${p} exists"; else warn "policy ${p} MISSING"; ready=1; fi
  done

  # OIDC login (set up by `$0 oidc`). The config is read as JSON and only
  # non-secret fields are extracted — never print the raw read, in case a
  # future server version echoes the client secret back.
  if jq -e '."oidc/"' >/dev/null <<<"${auths}"; then
    ok "auth oidc enabled"
    local oc disc
    oc="$(bao read -format=json auth/oidc/config 2>/dev/null)" || oc='{}'
    disc="$(jq -r '.data.oidc_discovery_url // empty' <<<"${oc}")"
    if [[ -n "${disc}" ]]
    then ok "oidc config present (discovery: ${disc})"
    else warn "oidc config MISSING"; ready=1; fi
    local r
    for r in admin family; do
      if bao read "auth/oidc/role/${r}" >/dev/null 2>&1
      then ok "oidc role ${r} exists"; else warn "oidc role ${r} MISSING"; ready=1; fi
    done
  else
    warn "auth oidc NOT enabled — run: $0 oidc"; ready=1
  fi

  return "${ready}"
}

init() {
  local s root_token=""
  s="$(bao status -format=json 2>/dev/null)" || true
  jq -e . >/dev/null 2>&1 <<<"${s}" \
    || die "cannot reach ${BAO_ADDR}. Is the StatefulSet up?"

  if [[ "$(jq -r '.initialized' <<<"${s}")" != "true" ]]; then
    log "initialising..."
    # No -key-shares / -recovery-shares: the server knows its own seal type and
    # picks the right mode. A transit seal is an Auto Unseal, so this yields
    # RECOVERY keys (recovery_keys_b64), not unseal keys — passing the wrong
    # flag family is an error, so we pass neither. This call is also the first
    # live use of the transit seal: it encrypts the root key against bao-transit.
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
      warn "server returned UNSEAL keys, not recovery keys — the transit seal may not be active."
      warn "  Verify the seal stanza took effect before relying on auto-unseal."
    fi

    {
      printf '# %s keys for the equestria OpenBao cluster. See ../RUNBOOK.md.\n' "${kind}"
      printf '# The root token is deliberately NOT stored: it is revoked at the end of init.\n'
      printf '# Regenerate one on demand via "bao operator generate-root" using these shares.\n'
      printf 'kind: %s\n' "${kind}"
      # The field is recovery_keys_threshold, NOT recovery_threshold. Getting
      # this wrong falls through to unseal_threshold, which under an auto seal
      # is the Shamir threshold of the empty, unused unseal-key family — always
      # 1, and meaningless here. See bao-transit.sh, which hit exactly this.
      printf 'threshold: %s\n' "$(jq -r '.recovery_keys_threshold // .unseal_threshold' <<<"${out}")"
      printf 'shares:\n'
      jq -r '.[]' <<<"${keys}" | while IFS= read -r k; do printf '  - "%s"\n' "${k}"; done
    } | seal_to "${RECOVERY_FILE}"

    unset out
  else
    ok "already initialised"
    [[ -n "${BAO_TOKEN:-}" ]] || die "already initialised — run: $0 resume (it regenerates a root token from the recovery shares)"
  fi

  export BAO_TOKEN="${root_token:-${BAO_TOKEN}}"
  MINTED_ROOT="${root_token}"

  wait_for_ha
  setup
}

# Wait for the transit auto-unseal AND a completed leader election. The gap
# matters: for ~30s after unseal the node answers every non-status request with
# 500 "local node not active but active cluster node not found", and dying
# there strands a freshly minted root token — which is exactly how the first
# real init run ended (recovered via `resume`, but avoidably).
wait_for_ha() {
  local tries=0 s
  while :; do
    s="$(bao status -format=json)"
    if [[ "$(jq -r '.sealed' <<<"${s}")" == "false" \
       && -n "$(jq -r '.leader_address // empty' <<<"${s}")" ]]; then
      break
    fi
    (( tries++ >= 24 )) && die "no unsealed active node after 120s. Check the transit seal (bao-transit, egress path), then leader election (postgres ha locks)."
    log "waiting for unseal + leader election..."
    sleep 5
  done
  ok "unsealed, active node elected"
}

# Regenerate a root token from the sops-encrypted recovery shares. Used by
# `resume` when a previous run minted a root token and died before finishing.
# The token never touches disk or the terminal.
#
# ⚠️ On OpenBao >= 2.5.3 this 403s out of the box: the unauthenticated
# sys/generate-root/* endpoints are disabled by default (see
# openbao.org/docs/deprecation/unauthed-rekey/). Recovering this way requires
# temporarily setting `disable_unauthed_generate_root_endpoints = false` on the
# listener and rolling the pods. If the barrier is still empty (init died
# before setup), wiping storage and re-running `init` is cheaper — truncate
# openbao.openbao_kv_store and openbao.openbao_ha_locks with the StatefulSet
# scaled to 0, and move the now-worthless recovery file aside first.
regen_root() {
  [[ -f "${REPO_ROOT}/${RECOVERY_FILE}" ]] \
    || die "${RECOVERY_FILE} missing — cannot regenerate a root token without the recovery shares"

  # Clear any half-finished attempt so the nonce below is the only live one.
  bao operator generate-root -cancel >/dev/null 2>&1 || true

  local attempt nonce otp
  attempt="$(bao operator generate-root -init -format=json)"
  nonce="$(jq -r '.nonce // empty' <<<"${attempt}")"
  otp="$(jq -r '.otp // empty' <<<"${attempt}")"
  [[ -n "${nonce}" && -n "${otp}" ]] || die "generate-root -init returned no nonce/otp"

  # Feed shares one at a time ("-" = read the share from stdin, keeping it out
  # of argv and the process table) until the server reports completion.
  local encoded="" fed=0 share out
  while IFS= read -r share; do
    out="$(bao operator generate-root -format=json -nonce="${nonce}" - <<<"${share}")"
    (( ++fed ))
    encoded="$(jq -r '.encoded_token // .encoded_root_token // empty' <<<"${out}")"
    [[ -n "${encoded}" ]] && break
  done < <(sops --decrypt "${REPO_ROOT}/${RECOVERY_FILE}" | sed -n 's/^  - "\(.*\)"$/\1/p')
  [[ -n "${encoded}" ]] || die "fed ${fed} share(s) but no encoded token came back — wrong or insufficient shares?"

  MINTED_ROOT="$(bao operator generate-root -decode="${encoded}" -otp="${otp}" -format=json | jq -r '.token // empty')"
  [[ -n "${MINTED_ROOT}" ]] || die "failed to decode the root token"
  export BAO_TOKEN="${MINTED_ROOT}"
  ok "regenerated a root token from recovery shares (revoked again at the end)"
}

# Finish an init that died after `bao operator init` but before the setup
# steps: everything in setup() is idempotent, so this is safe to re-run.
resume() {
  local s
  s="$(bao status -format=json 2>/dev/null)" || true
  jq -e . >/dev/null 2>&1 <<<"${s}" || die "cannot reach ${BAO_ADDR}. Is the StatefulSet up?"
  [[ "$(jq -r '.initialized' <<<"${s}")" == "true" ]] || die "not initialised — run: $0 init"

  wait_for_ha
  [[ -n "${BAO_TOKEN:-}" ]] || regen_root
  setup
}

# Enable and configure OIDC login against Authentik: group `admins` → policy
# admin, group `family` → policy viewer. Prereq: the Authentik provider/client
# must already exist — the home-operations `applications` Pulumi stack creates
# it from the openbao ApplicationDefinition and stores the client credentials
# in the `equestria-openbao-oidc-credentials` 1Password item. Idempotent, like
# everything else here: policy/config/role writes are full overwrites, so a
# re-run converges rather than erroring.
oidc() {
  local s
  s="$(bao status -format=json 2>/dev/null)" || true
  jq -e . >/dev/null 2>&1 <<<"${s}" || die "cannot reach ${BAO_ADDR}. Is the StatefulSet up?"
  [[ "$(jq -r '.initialized' <<<"${s}")" == "true" ]] || die "not initialised — run: $0 init"

  # wait_for_ha also proves the node is unsealed with an elected leader —
  # without it the writes below 500 for ~30s after any pod roll (see the
  # comment on wait_for_ha).
  wait_for_ha

  # All three come from the equestria-openbao-oidc-credentials 1Password item.
  # They are re-exported (not passed as arguments) because jq reads them via
  # env.* below — the client secret must never appear in argv, the process
  # table, or this terminal.
  local v
  for v in OPENBAO_OIDC_CLIENT_ID OPENBAO_OIDC_CLIENT_SECRET OPENBAO_OIDC_DISCOVERY_URL; do
    [[ -n "${!v:-}" ]] || die "${v} is unset. All three of OPENBAO_OIDC_CLIENT_ID, OPENBAO_OIDC_CLIENT_SECRET and OPENBAO_OIDC_DISCOVERY_URL are required — source them from the equestria-openbao-oidc-credentials 1Password item (the discovery URL is the Authentik issuer, https://<authentik-host>/application/o/<slug>/)."
    export "${v?}"
  done

  if [[ -z "${BAO_TOKEN:-}" ]]; then
    # regen_root needs the unauthenticated sys/generate-root/* endpoints,
    # which OpenBao >= 2.5.3 disables by default — they 403 even from
    # localhost (STATUS.md, "facts established the hard way"). Probe first so
    # the failure names the fix instead of dying mid-ceremony.
    bao operator generate-root -status >/dev/null 2>&1 \
      || die "generate-root is unavailable — on OpenBao >= 2.5.3 the unauthenticated endpoints 403 by default. Either export BAO_TOKEN, or land the TEMPORARY listener toggle disable_unauthed_generate_root_endpoints = false in kubernetes/apps/kube-system/openbao/helmrelease.yaml, let the pods roll, run this again — and REVERT the toggle once this completes."
    regen_root
  fi

  oidc_setup

  # Only revoke a root token we minted ourselves this run (same pattern as
  # setup(): a caller-supplied BAO_TOKEN is the caller's to manage).
  if [[ -n "${MINTED_ROOT:-}" ]]; then
    if bao token revoke -self >/dev/null 2>&1; then
      ok "revoked the root token minted for this run (regenerate from recovery shares if needed)"
    else
      warn "could not revoke the root token minted for this run — revoke it by hand"
    fi
  fi

  cat <<'NEXT'

Done. Next:
  1. REVERT the disable_unauthed_generate_root_endpoints listener toggle in
     kubernetes/apps/kube-system/openbao/helmrelease.yaml and let the pods
     roll — do not leave generate-root reachable unauthenticated.
  2. Verify: log in at https://bao.equestria.driscoll.tech/ui with OIDC as an
     `admins` member (expect the admin policy) and a `family` member (expect
     viewer: browse secrets/, read docs/, no secret values).
NEXT
}

# The idempotent body of `oidc`. Split out so a future `resume`-style caller
# can reuse it; everything here assumes BAO_TOKEN is already set.
oidc_setup() {
  # viewer: the read-only tier for the family group. The scope is a deliberate
  # decision — widen it on purpose, never by accident:
  #   secrets/  LIST on metadata only. Family can browse the tree (see what
  #             exists) but CANNOT read any secret value: there is no
  #             capability on secrets/data/* at all. If David later wants
  #             family reading actual values, add read on secrets/data/*
  #             (or a subtree) in a follow-up.
  #   docs/     read + list on data and metadata — household documentation is
  #             meant to be read.
  bao policy write viewer - >/dev/null <<'EOF'
# Read-only tier for the oidc `family` role. Browse secrets/, read docs/.
# Deliberately NO read on secrets/data/* — family sees that a secret exists,
# never its value. Widen deliberately, not by accident.
path "secrets/metadata/*" {
  capabilities = ["list"]
}
path "docs/data/*" {
  capabilities = ["read", "list"]
}
path "docs/metadata/*" {
  capabilities = ["read", "list"]
}
EOF
  ok "wrote policy viewer"

  local auths
  auths="$(bao auth list -format=json)"
  if jq -e '."oidc/"' >/dev/null <<<"${auths}"; then
    ok "oidc auth already enabled"
  else
    bao auth enable oidc >/dev/null && ok "enabled oidc auth"
  fi

  # default_role=family: anything that logs in without naming a role gets the
  # least-privileged one — admins must ask for role=admin explicitly.
  #
  # jq -n reads the three values from the environment (env.*), so the client
  # secret is never in argv, the process table, or a heredoc (bash implements
  # heredocs with temp files, so a substituting heredoc would put the secret
  # on disk). `bao write ... -` takes the JSON body on stdin.
  jq -n '{
    oidc_discovery_url: env.OPENBAO_OIDC_DISCOVERY_URL,
    oidc_client_id:     env.OPENBAO_OIDC_CLIENT_ID,
    oidc_client_secret: env.OPENBAO_OIDC_CLIENT_SECRET,
    default_role:       "family"
  }' | bao write auth/oidc/config - >/dev/null
  ok "configured oidc (discovery: ${OPENBAO_OIDC_DISCOVERY_URL}, default_role: family)"

  # Roles. bound_claims is the security boundary: Authentik puts the user's
  # group memberships in the `groups` claim (a list, via the profile scope
  # mapping with includeClaimsInIdToken), and a role only issues a token when
  # the bound value matches — for a list-valued claim, when any element
  # equals the bound string (bound_claims_type defaults to "string", exact
  # match, no globs). bound_claims is a MAP, which the CLI's key=value form
  # cannot express — the documented form is a JSON body on stdin
  # (openbao.org/docs/auth/jwt, "Configure OIDC role with JSON").
  # No secrets in this heredoc, so substitution is fine here.
  local role group policy
  for role in admin family; do
    case "${role}" in
      admin)  group="admins"; policy="admin"  ;;
      family) group="family"; policy="viewer" ;;
    esac
    bao write "auth/oidc/role/${role}" - >/dev/null <<EOF
{
  "role_type": "oidc",
  "user_claim": "email",
  "groups_claim": "groups",
  "oidc_scopes": ["openid", "profile", "email"],
  "allowed_redirect_uris": ["${OIDC_REDIRECT_UI}", "${OIDC_REDIRECT_CLI}"],
  "bound_claims": { "groups": ["${group}"] },
  "token_policies": ["${policy}"],
  "token_ttl": "8h"
}
EOF
    ok "wrote oidc role ${role} (group ${group} → policy ${policy}, ttl 8h)"
  done
}

setup() {
  local mounts m
  mounts="$(bao secrets list -format=json)"
  for m in "${KV_MOUNTS[@]}"; do
    if jq -e --arg m "${m}/" '.[$m]' >/dev/null <<<"${mounts}"; then
      ok "kv mount ${m}/ already present"
    else
      bao secrets enable -path="${m}" -version=2 kv >/dev/null && ok "mounted ${m}/ (kv-v2)"
    fi
  done

  local auths
  auths="$(bao auth list -format=json)"
  if jq -e '."kubernetes/"' >/dev/null <<<"${auths}"; then
    ok "kubernetes auth already enabled"
  else
    bao auth enable kubernetes >/dev/null && ok "enabled kubernetes auth"
  fi
  # In-cluster host only; OpenBao reviews tokens with its own service account
  # (the chart's authDelegator RBAC).
  bao write auth/kubernetes/config \
    kubernetes_host="https://kubernetes.default.svc:443" >/dev/null
  ok "configured kubernetes auth (in-cluster host)"

  # Phase 6a: the role ClusterSecretStore/openbao authenticates as. Without it
  # the auth method authenticates nobody and the store reports Invalid, which
  # is where Phase 6 previously stopped — the method was enabled in Phase 3 and
  # no role was ever created.
  #
  # Bound to the exact ServiceAccount ESO runs as. `external-secrets` is the
  # controller's SA; the cert-controller and webhook SAs do not read secrets
  # and are deliberately not bound.
  #
  # ttl 1h: ESO re-authenticates per refresh cycle, so a short-lived token is
  # free, and it caps the blast radius of one leaking.
  bao write auth/kubernetes/role/eso-equestria \
    bound_service_account_names="external-secrets" \
    bound_service_account_namespaces="kube-system" \
    token_policies="eso-equestria" \
    token_ttl="1h" >/dev/null
  ok "wrote kubernetes auth role eso-equestria"

  # ⚠️ ONE MOUNT PER CLUSTER. `auth/kubernetes/config` above points at
  # equestria's own API server, so it can only validate equestria
  # ServiceAccount tokens. Any additional cluster needs its own mount,
  # `kubernetes-<key>`, and its own `eso-<key>` policy.
  #
  # Such a mount is NOT created here. It is a Pulumi resource — see
  # `components/openbao/clusterAuth.ts` — for the same reason OIDC moved out of
  # this script: barrier state belongs in git where it is reviewable and drift
  # is caught on every preview. This script only grants `pulumi` the narrow
  # paths it needs to manage it — see write_policies() above.
  #
  # Those mounts carry no reviewer JWT. The client cluster's external-secrets
  # ServiceAccount is bound to `system:auth-delegator` in its own tree, so
  # OpenBao reviews the client's own token and there is no long-lived
  # credential to store or rotate.
  #
  # equestria is the only cluster in the estate today. SGC's `kubernetes-sgc`
  # mount and `eso-sgc` policy/role still exist server-side — they are
  # `retainOnDelete`, so removing the Pulumi resource never reached them. They
  # need hand-deletion: step 4 of Phase 2 in
  # docs/cluster-consolidation/22-decommission-sgc.md.
  #
  # Applying the widened `pulumi` policy needs an admin token, so it takes one
  # root ceremony: `root-ceremony.sh run`, then re-run this script's `resume`
  # (or `write_policies` alone) with BAO_TOKEN set, then revoke.

  if jq -e '."approle/"' >/dev/null <<<"${auths}"; then
    ok "approle auth already enabled"
  else
    bao auth enable approle >/dev/null && ok "enabled approle auth"
  fi

  write_policies

  if [[ -f "${REPO_ROOT}/${APPROLE_FILE}" ]]; then
    warn "${APPROLE_FILE} exists — leaving it alone. Delete it first to mint fresh credentials."
  else
    # Long TTL over unattended renewal: Pulumi runs are short-lived and
    # non-resident, so nothing is around to renew a short token between runs.
    # secret_id_num_uses=0 (unlimited) because every stack run logs in afresh.
    bao write auth/approle/role/pulumi \
      token_policies="pulumi" \
      token_ttl=1h token_max_ttl=4h \
      secret_id_ttl=0 secret_id_num_uses=0 >/dev/null
    ok "wrote approle role pulumi"

    local role_id secret_id
    role_id="$(bao read -field=role_id auth/approle/role/pulumi/role-id)"
    secret_id="$(bao write -f -field=secret_id auth/approle/role/pulumi/secret-id)"
    [[ -n "${role_id}" && -n "${secret_id}" ]] || die "failed to mint approle credentials"

    {
      printf '# AppRole for Pulumi (home-operations, vault) against equestria OpenBao.\n'
      printf '# Consumed via ref+sops:// in the Pulumi runs. Policy: pulumi (rw secrets/, docs/, meta/).\n'
      printf '# PULUMI_CONFIG_PASSPHRASE is NOT minted here — add it manually when Phase 8\n'
      printf '# moves it out of 1Password (see INVENTORY.md §2).\n'
      printf 'role_id: "%s"\n' "${role_id}"
      printf 'secret_id: "%s"\n' "${secret_id}"
    } | seal_to "${APPROLE_FILE}"
    unset role_id secret_id
  fi

  # Only revoke a root token we minted ourselves this run.
  if [[ -n "${MINTED_ROOT:-}" ]]; then
    if bao token revoke -self >/dev/null 2>&1; then
      ok "revoked the initial root token (regenerate from recovery shares if needed)"
    else
      warn "could not revoke the initial root token — revoke it by hand"
    fi
  fi

  cat <<'NEXT'

Done. Next:
  1. Commit the two new bootstrap/openbao/*.sops.yaml files.
  2. Watch the StatefulSet reach 3/3 — pods 1 and 2 unseal via transit on
     their own once pod 0 is ready.
  3. Phase 3 verification: bao status (3 nodes, 1 active, unsealed) and the
     Gatus check on /v1/sys/health going green.
  4. Phase 4: npx tsx scripts/op-to-bao --plan   (in home-operations), review
     mapping.yaml, then --apply with the pulumi approle.
NEXT
}

preflight
case "${1:-}" in
  status) status ;;
  init)   init ;;
  resume) resume ;;
  oidc)   oidc ;;
  *)      die "usage: $0 status|init|resume|oidc" ;;
esac
