#!/bin/sh
# Mounted into the `lock-canceller` CronJob at /script by the configMapGenerator
# in kustomization.yaml, which stamps `kustomize.toolkit.fluxcd.io/substitute:
# disabled` on the generated ConfigMap.
#
# THAT ANNOTATION IS LOAD-BEARING. Flux postBuild envsubst runs over every
# manifest in the Kustomization, and the parameter expansions below are shell,
# not Flux substitutions -- unset ones fail the whole build in strict mode:
#
#   post build failed for 'HelmRelease.../lock-canceller': envsubst error:
#   variable substitution failed: variable not set (strict mode): "STALE_MINUTES"
#
# That is what broke #1279 on merge. ../../pulumi/lock-canceller carries the same
# annotation on its CronJob for the same reason. It could not go on the
# HelmRelease here, because it is per-resource and all-or-nothing and the
# persistence block there needs SPIKE_IP and CLUSTER_CNAME substituted.
#
# NOTE flate does NOT catch a missing annotation: it renders best-effort under
# --allow-missing-secrets and reports unresolved values as placeholders rather
# than failing, so it passes lint and breaks on the cluster.
# A mover that dies mid-`forget` leaves its restic lock behind, and
# the lock outlives the pod. Every later run then backs up fine and
# fails on the forget/prune step:
#
#   === Starting forget ===
#   unable to create lock in backend: repository is already locked
#     by PID 41 on volsync-src-romm-gs6q4
#
# So the failure is RETENTION, not backup -- and because the
# snapshot is already saved by then, it can run for days looking
# like broken backups while the data is fine. It also freezes node
# upgrades: tuppr's TalosUpgrade healthChecks gate on
# ReplicationSource `Synchronizing == False`.
#
# ../../../components/volsync/replicationsource.yaml already has a
# fix for this -- `spec.restic.unlock`, bumped to a new token. That
# is a MANUAL fix and stays the documented one; this CronJob is the
# unattended backstop, and it deliberately does NOT touch the
# ReplicationSource. Patching `spec.restic.unlock` in place would be
# reverted by Flux on the next reconcile, leaving spec and
# `status.restic.lastUnlocked` permanently mismatched -- which makes
# the operator run an unlock on EVERY sync, forever. Going straight
# at the repository has none of that, clears the lock immediately
# instead of waiting for the next nightly sync, and reaches
# repositories no ReplicationSource points at any more (there is an
# eight-month-old pair on /repository/plex-copy as of 2026-08-28).
# Locks younger than this are assumed to belong to a live mover.
# Two independent things already make that true, so 6h is the
# third and loosest guard, not the only one:
#
#   1. restic REFRESHES its lock every 5 minutes while running,
#      writing a new lock file and removing the old one -- so a
#      live mover's lock is never more than minutes old on disk,
#      however long the run takes.
#   2. `restic unlock` removes only locks restic itself judges
#      stale. `--remove-all` is what ignores that judgement, and
#      it is deliberately NOT used here (it is also commented out
#      in VolSync's own mover-restic/entry.sh).
# An unmatched glob stays literal; -f rejects it. This also
# skips any directory that is not an initialised repository.
# `tr -d` because busybox `wc -l` right-aligns its count.
# Two causes, and they are worth telling apart by hand: a
# repository keyed on some other credential, or a lock restic
# does not judge stale. Every repository under /repository is
# on the shared `apps/volsync/password` today -- including
# /repository/etcd, which only LOOKS like an exception because
# it reaches restic through a secret named
# `talos-etcd-restic-keys` -- so in practice this branch means
# the second cause. Neither fails the job; the remaining
# repositories still get scanned.
set -eu

# Locks younger than this are assumed to belong to a live mover.
# Two independent things already make that true, so 6h is the
# third and loosest guard, not the only one:
#
#   1. restic REFRESHES its lock every 5 minutes while running,
#      writing a new lock file and removing the old one -- so a
#      live mover's lock is never more than minutes old on disk,
#      however long the run takes.
#   2. `restic unlock` removes only locks restic itself judges
#      stale. `--remove-all` is what ignores that judgement, and
#      it is deliberately NOT used here (it is also commented out
#      in VolSync's own mover-restic/entry.sh).
STALE_MINUTES=360

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

echo "$(stamp) scanning /repository for restic locks older than ${STALE_MINUTES}m"

scanned=0
stranded=0
cleared=0

for config in /repository/*/config; do
  # An unmatched glob stays literal; -f rejects it. This also
  # skips any directory that is not an initialised repository.
  [ -f "$config" ] || continue
  repo=${config%/config}
  name=${repo##*/}
  scanned=$((scanned + 1))

  [ -d "$repo/locks" ] || continue
  locks=$(find "$repo/locks" -maxdepth 1 -type f -mmin "+${STALE_MINUTES}")
  [ -n "$locks" ] || continue

  stranded=$((stranded + 1))
  echo "${name}: lock(s) held longer than ${STALE_MINUTES}m:"
  echo "$locks" | while read -r lock; do ls -l "$lock"; done

  if restic --repo "$repo" --no-cache unlock; then
    # `tr -d` because busybox `wc -l` right-aligns its count.
    remaining=$(find "$repo/locks" -maxdepth 1 -type f | wc -l | tr -d "[:space:]")
    cleared=$((cleared + 1))
    echo "  unlocked ${name}; ${remaining} lock(s) remain"
  else
    # Two causes, and they are worth telling apart by hand: a
    # repository keyed on some other credential, or a lock restic
    # does not judge stale. Every repository under /repository is
    # on the shared `apps/volsync/password` today -- including
    # /repository/etcd, which only LOOKS like an exception because
    # it reaches restic through a secret named
    # `talos-etcd-restic-keys` -- so in practice this branch means
    # the second cause. Neither fails the job; the remaining
    # repositories still get scanned.
    echo "  WARNING: could not unlock ${name} (different repository password, or restic does not judge the lock stale)"
  fi
done

echo "$(stamp) scanned ${scanned} repositories; ${stranded} had stale locks; ${cleared} unlocked"
