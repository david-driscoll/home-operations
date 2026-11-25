#!/bin/sh
# Installed by ./bake.sh as /pulumi/bin/pulumi, the first `pulumi` on the
# workspace's PATH. The real CLI sits beside it as pulumi.real.
#
# Every run of a terraform-provider (parameterized) package leaves the Terraform
# provider it started running after the run ends: its parent, the
# pulumi-resource-terraform-provider plugin, exits without stopping it, and it
# is reparented to the container's PID 1 (the operator's tini). A retained
# workspace pod collects them for as long as it lives -- unifi-network, resyncing
# every 5 minutes, gained ~44 processes and ~415 MiB an hour. At the 6Gi limit
# the pod is not OOM-killed; it thrashes, re-reading the leaked processes' text
# pages from the node's /var at several GB/s. On 2026-11-21 that saturated
# shining-armor's disk, stalled authentik-pg-3, and took the Authentik VIP down
# for ~50 minutes.
#
# The PKO agent runs this CLI several times per update, so killing the leaked
# processes before each call bounds the leak to one update's worth. A plugin
# process whose parent is PID 1 has no pulumi left to talk to: a live plugin's
# parent is the pulumi engine (or, for a Terraform provider, the
# terraform-provider plugin) of a run still in progress, so concurrent runs are
# never touched. Nothing here is fatal: whatever happens, the real CLI runs.

reap_orphaned_plugins() {
  for proc in /proc/[0-9]*; do
    exe="$(readlink "$proc/exe" 2>/dev/null)" || continue
    case "$exe" in
      */.pulumi/dynamic_tf_plugins/* | */.pulumi/plugins/*) ;;
      *) continue ;;
    esac
    # 2>/dev/null first: the process may have exited since the readlink.
    read -r stat 2>/dev/null <"$proc/stat" || continue
    # Field 2 (comm) may hold spaces; everything after its closing ") " is
    # "state ppid ...". `set --` here only replaces this function's arguments.
    # shellcheck disable=SC2086
    set -- ${stat##*) }
    [ "${2:-}" = 1 ] && kill -KILL "${proc#/proc/}" 2>/dev/null
  done
  return 0
}

reap_orphaned_plugins
exec /pulumi/bin/pulumi.real "$@"
