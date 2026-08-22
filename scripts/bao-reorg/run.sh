#!/usr/bin/env bash
#
# Run bao-reorg with ONLY the OpenBao AppRole resolved.
#
# `mise run vals-run` cannot be used for this, and the reason is the whole point
# of this file: vals-run resolves EVERY `ref+` value in the environment in one
# pass and fails the run if any of them 404s. `.config/mise.toml` names three
# paths this reorganisation moves — the Minio credentials, the Pulumi
# passphrase, and the 1Password Connect token — so the moment the repo rewrite
# lands and before phase 3 runs, vals-run cannot start:
#
#   expand openbao://secrets/third-party-tokens/onepassword/eris-connect#/credential:
#     no secret found for path "secrets/data/third-party-tokens/onepassword/eris-connect"
#
# That is a deadlock, not a bug: vals-run is how you get credentials to run the
# migration, and the migration is what creates the paths vals-run now wants.
#
# So this resolves the AppRole and nothing else. It reads
# `.config/bao-approle.sops.yaml` directly — SOPS, never OpenBao, which is the
# same bootstrap-tier rule vals-run enforces for BAO_ROLE_ID/BAO_SECRET_ID — and
# is therefore immune to the state of the thing it is migrating.
#
#   scripts/bao-reorg/run.sh --phase 3 --apply --policies-widened
#
set -Eeuo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly APPROLE="${REPO_ROOT}/.config/bao-approle.sops.yaml"

[[ -f "${APPROLE}" ]] || { printf 'run.sh: %s is missing\n' "${APPROLE}" >&2; exit 2; }

# Re-exec under mise if we are not already inside its environment.
#
# `mise exec` is safe here where `mise run vals-run` is not: it sets the
# `.config/mise.toml [env]` values as LITERALS and resolves nothing, so the
# `ref+openbao://` strings that currently point at not-yet-created paths are
# just strings. What is needed from it is SOPS_AGE_KEY_FILE (sops cannot decrypt
# the AppRole without it) and node on PATH.
if [[ -z "${SOPS_AGE_KEY_FILE:-}" ]]; then
  exec mise exec -- "${BASH_SOURCE[0]}" "$@"
fi

export BAO_ADDR="${BAO_ADDR:-https://bao.equestria.driscoll.tech}"

# Resolved straight into the child's environment with a command-prefix
# assignment, never into a shell variable that outlives this line and never onto
# stdout.
#
# This deliberately does NOT go through `vals exec` the way
# `.config/mise/tasks/vals-run` does. `vals exec` rebuilds the child environment
# from a fixed allowlist and drops HOME, which mise's npm-cache template needs
# (`{{env.HOME}}/.local/share/mise/npm-cache`) — so the nesting required to put
# node back on PATH fails on a missing HOME instead. One fewer layer is worth
# more here than matching vals-run's shape: the AppRole is bootstrap-tier by
# definition, sops is the bootstrap-tier backend, and this script exists
# precisely for the window where the vals path does not work.
exec env \
  BAO_ROLE_ID="$(sops --decrypt --extract '["role_id"]' "${APPROLE}")" \
  BAO_SECRET_ID="$(sops --decrypt --extract '["secret_id"]' "${APPROLE}")" \
  npx tsx "${REPO_ROOT}/scripts/bao-reorg" "$@"
