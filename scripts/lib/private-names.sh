# shellcheck shell=bash
#
# private-names.sh -- sourced, not run.
#
#   source "<repo>/scripts/lib/private-names.sh"
#   private_names || exit 1
#
# Sets and exports ROOT_DOMAIN and TAILSCALE_DOMAIN for a script that needs the
# estate's root domain or tailnet, which the repo never writes
# (docs/plans/private-domain-scrub.md).
#
# - A value already in the environment wins: mise exports both from
#   .config/domains.sops.yaml.
# - Otherwise it is decrypted from the source Flux reads,
#   kubernetes/flux/meta/shared-secrets.sops.yaml. So a break-glass run needs
#   the age key, not mise.
# - An unresolved vals reference (`ref+...`) does not count as a value.
# - It fails closed. If either name is still empty it returns non-zero and
#   says why on STDERR. It never writes to stdout, so it is safe inside a
#   script whose output is eval'd (bootstrap/openbao/pulumi-env.sh).

private_names() {
  local repo secrets name value
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  secrets="${repo}/kubernetes/flux/meta/shared-secrets.sops.yaml"
  # Like .config/mise.toml: the repo's gitignored age.key when nothing is set.
  if [[ -z "${SOPS_AGE_KEY_FILE:-}" && -z "${SOPS_AGE_KEY:-}" && -r "${repo}/age.key" ]]; then
    export SOPS_AGE_KEY_FILE="${repo}/age.key"
  fi
  for name in ROOT_DOMAIN TAILSCALE_DOMAIN; do
    value="${!name:-}"
    if [[ -z "${value}" || "${value}" == ref+* ]]; then
      value="$(sops --decrypt --extract "[\"stringData\"][\"${name}\"]" "${secrets}" 2>/dev/null)" || value=""
    fi
    if [[ -z "${value}" ]]; then
      printf 'private_names: %s is not set and could not be decrypted from %s (is the age key available?)\n' \
        "${name}" "${secrets#"${repo}"/}" >&2
      return 1
    fi
    printf -v "${name}" '%s' "${value}"
    export "${name?}"
  done
}
