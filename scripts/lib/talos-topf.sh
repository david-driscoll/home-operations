# shellcheck shell=bash
#
# talos-topf.sh -- sourced, not run, by the talos:* mise tasks.
#
#   source "${MISE_CONFIG_ROOT}/scripts/lib/talos-topf.sh"
#   topf_preflight || exit 1
#   host="$(topf_host_for_ip "${usage_ip}")" || exit 1
#   topf --nodes-filter "$(topf_node_filter "${host}")" apply --dry-run
#
# Everything TOPF needs before it may touch talos/topf.yaml, checked by name so
# a failure says what is missing instead of surfacing as a template error or a
# bare sops "no matching keys". Expects to run from talos/ (every talos:* task
# sets `dir`).
#
# topf_preflight (all fail closed, return non-zero, explain on STDERR):
#   - topf.yaml is here.
#   - The secrets bundle topf.yaml's `secretsPath` names EXISTS and sops reports
#     it ENCRYPTED. A missing bundle is the dangerous case: TOPF offers to
#     generate a new one (a new cluster's CAs) and, if no .sops.yaml rule
#     matches, writes it in plaintext.
#   - The age key exists (SOPS_AGE_KEY_FILE) -- it is gitignored, so a fresh
#     clone or worktree has none.
#   - ROOT_DOMAIN is set (scripts/lib/private-names.sh: mise's export, else
#     decrypted from shared-secrets). The registry mirrors and cert SANs are
#     under it; the templates refuse to render without it too.
#   - Exports TALOS_SECRETBOX_ENCRYPTION_SECRET from the bundle, for
#     control-plane/30-etcd-encryption.yaml.tpl. TOPF templates cannot read the
#     bundle themselves, and keeping a second encrypted copy could drift.
#
# Never run topf with --confirm=false from here: the confirmation prompt is
# the last line of defence against generating a fresh secrets bundle.

# shellcheck disable=SC2016  # backticks in the messages below are prose
#                            emphasis, not command substitution.

# shellcheck source=scripts/lib/private-names.sh
source "${MISE_CONFIG_ROOT:-$(git rev-parse --show-toplevel)}/scripts/lib/private-names.sh"

topf_preflight() {
  local secrets_path

  if [[ ! -f topf.yaml ]]; then
    printf 'talos: topf.yaml is not in %s -- run this through `mise run talos:...`.\n' "${PWD}" >&2
    return 1
  fi

  secrets_path="$(yq '.secretsPath // "secrets.yaml"' topf.yaml)"
  if [[ ! -f "${secrets_path}" ]]; then
    printf 'talos: the secrets bundle %s is missing.\n' "talos/${secrets_path}" >&2
    printf 'talos: refusing to run TOPF, which would offer to GENERATE a new one -- a different cluster.\n' >&2
    return 1
  fi

  if [[ ! -f "${SOPS_AGE_KEY_FILE:-}" ]]; then
    printf 'talos: no age key at %s (SOPS_AGE_KEY_FILE).\n' "${SOPS_AGE_KEY_FILE:-<unset>}" >&2
    printf 'talos: it is gitignored, so a fresh clone or a git worktree will not have it.\n' >&2
    return 1
  fi

  if [[ "$(sops filestatus "${secrets_path}" 2>/dev/null | jq -r '.encrypted')" != "true" ]]; then
    printf 'talos: %s is not sops-encrypted. It holds the cluster PKI; encrypt it before anything else.\n' "talos/${secrets_path}" >&2
    return 1
  fi

  private_names || return 1

  TALOS_SECRETBOX_ENCRYPTION_SECRET="$(sops -d --extract '["secrets"]["secretboxencryptionsecret"]' "${secrets_path}")"
  if [[ -z "${TALOS_SECRETBOX_ENCRYPTION_SECRET}" ]]; then
    printf 'talos: %s has no secrets.secretboxencryptionsecret.\n' "talos/${secrets_path}" >&2
    return 1
  fi
  export TALOS_SECRETBOX_ENCRYPTION_SECRET
}

# topf_host_for_ip <ip> -- the topf.yaml `host` whose `ip` is <ip>. The tasks
# keep taking an IP, as they did under talhelper; TOPF selects by host.
topf_host_for_ip() {
  local host
  host="$(IP="$1" yq '.nodes[] | select(.ip == strenv(IP)) | .host' topf.yaml)"
  if [[ -z "${host}" ]]; then
    printf 'talos: no node in talos/topf.yaml has ip %s.\n' "$1" >&2
    return 1
  fi
  printf '%s\n' "${host}"
}

# topf_node_filter <host> -- an anchored --nodes-filter regex for exactly one
# host. TOPF matches the regex anywhere in the name, so an unanchored `pegasus`
# would also select a future `pegasus-2`.
topf_node_filter() {
  printf '^%s$\n' "${1//./\\.}"
}

# topf_first_control_plane_ip -- the first control plane's IP, for the
# talosctl commands that talk to one control plane (upgrade-k8s).
topf_first_control_plane_ip() {
  yq '[.nodes[] | select(.role == "control-plane")][0].ip' topf.yaml
}
