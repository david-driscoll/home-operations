#!/usr/bin/env bash
# crew-sync-regression.sh — regression guard for crew two-layer state sync.
#
# WHY THIS EXISTS
#   Crew installs six git hooks. Five are load-bearing STATE SYNC, not guards:
#     post-commit                    -> crew sync --quiet
#     pre-push                       -> push refs/heads/crew-state* + refs/notes/crew*
#     post-checkout/merge/rewrite    -> fetch + fast-forward crew-state
#   Every one ends in `|| true`. If a hook manager (hk, husky, lefthook) takes
#   over the hook channel, or a migration drops one, crew-state sync stops
#   SILENTLY. `git commit` stays green. Agent histories and decisions diverge
#   across machines with zero signal.
#
#   Therefore this script NEVER asserts "the hook ran" or "the hook file
#   exists". It asserts the OBSERVABLE EFFECT: that refs/heads/crew-state and
#   refs/notes/crew actually moved to a value only a working sync could
#   produce. Each assertion plants a unique token, so we know WHICH hook moved
#   the ref -- not merely that something did.
#
#   Every positive assertion is paired with a NEGATIVE CONTROL: the same
#   scenario re-run with the hook channel neutered (core.hooksPath repointed at
#   an empty dir -- the exact shape of a hook-manager takeover). If a negative
#   control PASSES, the assertion cannot detect a regression and the script
#   exits 2 saying so. A probe that cannot fail is worse than no probe.
#
# KNOWN-BROKEN BASELINE (found by this probe on 2026-07-28, PRE-migration)
#   post-commit is ALREADY a permanent silent no-op, in all four repos, and has
#   nothing to do with hk. The hook does:
#       export CREW_SYNC_ACTIVE=1
#       crew sync --quiet 2>/dev/null || true
#   and `crew sync` itself treats CREW_SYNC_ACTIVE=1 as "a sync is already in
#   flight, do nothing" -- it returns 0 with no output. The hook suppresses the
#   very command it exists to run. Verified against crew 0.11.0-build.6.
#   That assertion is therefore marked XFAIL: it does not fail the run, but if
#   it ever starts PASSING (crew fixes it) the script says so loudly, because
#   the baseline then needs updating.
#
# MODES
#   probe     Hermetic end-to-end harness in a temp dir. Touches no real repo.
#   baseline  Read-only inventory of real repos -> JSON. Run BEFORE migration.
#   verify    Re-inventory and diff against a baseline.
#
# EXIT  0 pass   1 regression   2 probe has no teeth   3 usage/env error

set -uo pipefail

CREW_HOOKS="pre-commit post-commit pre-push post-checkout post-merge post-rewrite"
CREW_MARKER='--- crew-sync-hook ---'

PASS=0; FAIL=0; TOOTHLESS=0; XFAIL=0; UNEXPECTED_PASS=0
KEEP=0; WITH_HK=0; VERBOSE=0; ROOT=""; HUSKY_SHAPE=0

c_red() { printf '\033[31m%s\033[0m\n' "$*"; }
c_grn() { printf '\033[32m%s\033[0m\n' "$*"; }
c_yel() { printf '\033[33m%s\033[0m\n' "$*"; }
c_dim() { printf '\033[2m%s\033[0m\n' "$*"; }
hdr()   { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

ok()   { PASS=$((PASS+1)); c_grn "  PASS  $*"; }
bad()  { FAIL=$((FAIL+1)); c_red "  FAIL  $*"; }
note() { [ "$VERBOSE" = 1 ] && c_dim "        $*"; return 0; }

# ---------------------------------------------------------------- helpers ---

# Advance refs/heads/crew-state in $1 by one commit carrying token $2 in
# probe-marker.txt. Pure plumbing: never checks out the branch, never touches a
# working tree, never runs `git notes`.
advance_crew_state() {
  local repo=$1 token=$2 parent tree blob idx new
  parent=$(git -C "$repo" rev-parse -q --verify refs/heads/crew-state) || return 1
  idx=$(mktemp -u)
  blob=$(printf '%s\n' "$token" | git -C "$repo" hash-object -w --stdin) || return 1
  GIT_INDEX_FILE=$idx git -C "$repo" read-tree "$parent^{tree}" || return 1
  GIT_INDEX_FILE=$idx git -C "$repo" update-index --add \
      --cacheinfo "100644,$blob,probe-marker.txt" || return 1
  tree=$(GIT_INDEX_FILE=$idx git -C "$repo" write-tree) || return 1
  rm -f "$idx"
  new=$(git -C "$repo" commit-tree "$tree" -p "$parent" -m "probe $token") || return 1
  git -C "$repo" update-ref refs/heads/crew-state "$new"
}

# Advance refs/heads/main on the bare remote, so a subsequent `git pull` in the
# clone performs a real merge and therefore fires post-merge.
advance_remote_main() {
  local repo=$1 parent tree blob idx new
  parent=$(git -C "$repo" rev-parse -q --verify refs/heads/main) || return 1
  idx=$(mktemp -u)
  blob=$(printf 'upstream %s\n' "$RANDOM" | git -C "$repo" hash-object -w --stdin)
  GIT_INDEX_FILE=$idx git -C "$repo" read-tree "$parent^{tree}"
  GIT_INDEX_FILE=$idx git -C "$repo" update-index --add \
      --cacheinfo "100644,$blob,upstream.txt"
  tree=$(GIT_INDEX_FILE=$idx git -C "$repo" write-tree)
  rm -f "$idx"
  new=$(git -C "$repo" commit-tree "$tree" -p "$parent" -m "upstream work")
  git -C "$repo" update-ref refs/heads/main "$new"
}

read_marker() { git -C "$1" show "refs/heads/crew-state:probe-marker.txt" 2>/dev/null | tr -d '\n'; }

# Effective hooks directory, honouring core.hooksPath. Always absolute.
hooks_dir() {
  local repo=$1 hp gd
  hp=$(git -C "$repo" config --get core.hooksPath 2>/dev/null)
  if [ -n "$hp" ]; then
    case "$hp" in /*) printf '%s' "$hp";; *) printf '%s/%s' "$(cd "$repo" && pwd)" "$hp";; esac
  else
    gd=$(git -C "$repo" rev-parse --absolute-git-dir 2>/dev/null)
    printf '%s/hooks' "$gd"
  fi
}

# Does a crew-owned hook body reach git through ANY channel?
#   channel 1 (file)  : hook FILE in the effective hooks dir carrying the marker
#   channel 2 (config): git-config-registered hook -- git >= 2.55 runs BOTH,
#                       e.g. hook.hk-pre-commit.event=pre-commit
# Prints: file | config | file+config | none
hook_channels() {
  local repo=$1 hook=$2 hd out="" f
  hd=$(hooks_dir "$repo"); f="$hd/$hook"
  # NOTE: `--` is required; the marker begins with '---' and grep would
  # otherwise parse it as options.
  if [ -f "$f" ] && grep -qF -e "$CREW_MARKER" "$f" 2>/dev/null; then out="file"; fi
  if git -C "$repo" config --get-regexp '^hook\..*\.event$' 2>/dev/null \
       | awk -v h="$hook" '$2==h{f=1} END{exit !f}'; then
    [ -n "$out" ] && out="$out+config" || out="config"
  fi
  printf '%s' "${out:-none}"
}

# ------------------------------------------------------------------ probe ---

setup_harness() {
  local root=$1
  mkdir -p "$root"
  git init -q --bare "$root/remote.git"
  git -C "$root/remote.git" symbolic-ref HEAD refs/heads/main
  git clone -q "$root/remote.git" "$root/a" 2>/dev/null
  git -C "$root/a" config user.email probe@local
  git -C "$root/a" config user.name  probe
  git -C "$root/a" config commit.gpgsign false
  printf 'probe\n' > "$root/a/README.md"
  git -C "$root/a" add README.md
  git -C "$root/a" commit -qm seed
  git -C "$root/a" branch -M main
  git -C "$root/a" push -q -u origin main

  ( cd "$root/a" && crew init --state-backend two-layer --no-workflows </dev/null ) \
      >"$root/crew-init.log" 2>&1
  git -C "$root/a" rev-parse -q --verify refs/heads/crew-state >/dev/null || {
    c_red "environment: crew init did not create refs/heads/crew-state"
    c_dim "see $root/crew-init.log"; return 3; }

  git -C "$root/a" add -A >/dev/null 2>&1
  CREW_SYNC_ACTIVE=1 git -C "$root/a" commit -qm "crew scaffold" >/dev/null 2>&1
  CREW_SYNC_ACTIVE=1 git -C "$root/a" push -q origin main
  # publish crew-state if the scaffold commit's hooks did not already
  git -C "$root/a" push -q --force origin \
      refs/heads/crew-state:refs/heads/crew-state 2>/dev/null
  git -C "$root/a" rev-parse -q --verify refs/remotes/origin/crew-state >/dev/null \
      || git -C "$root/a" fetch -q origin
  return 0
}

# Neuter every hook channel exactly as a hook-manager takeover would.
neuter_on()  { mkdir -p "$ROOT/no-hooks"; git -C "$1" config core.hooksPath "$ROOT/no-hooks"; }
neuter_off() {
  if [ "$HUSKY_SHAPE" = 1 ]; then git -C "$1" config core.hooksPath .husky
  else git -C "$1" config --unset core.hooksPath 2>/dev/null; fi
  return 0
}

resync() { git -C "$1" fetch -q origin '+refs/heads/crew-state:refs/heads/crew-state' 2>/dev/null; return 0; }

# One scenario: put a unique token on the REMOTE crew-state, run the action in
# the clone, and report whether the clone's crew-state picked that token up.
scenario() {
  local repo=$1 token=$2; shift 2
  advance_crew_state "$ROOT/remote.git" "$token" || return 1
  "$@" >/dev/null 2>&1
  [ "$(read_marker "$repo")" = "$token" ]
}

# assert_sync <label> <repo> [--xfail] -- <cmd...>
assert_sync() {
  local label=$1 repo=$2 xfail=0; shift 2
  [ "${1:-}" = "--xfail" ] && { xfail=1; shift; }
  [ "${1:-}" = "--" ] && shift          # separator, not part of the command
  local tp="pos-$RANDOM$RANDOM" tn="neg-$RANDOM$RANDOM"

  if scenario "$repo" "$tp" "$@"; then
    if [ "$xfail" = 1 ]; then
      UNEXPECTED_PASS=$((UNEXPECTED_PASS+1))
      c_yel "  UNEXPECTED PASS  $label -- known-broken assertion now works; UPDATE THE BASELINE"
    else
      ok "$label -- crew-state advanced to $tp"
    fi
  else
    if [ "$xfail" = 1 ]; then
      XFAIL=$((XFAIL+1))
      c_yel "  XFAIL  $label -- silent no-op (known broken pre-migration, see header)"
    else
      bad "$label -- crew-state did NOT advance (SILENT NO-OP; local='$(read_marker "$repo")' remote='$(read_marker "$ROOT/remote.git")')"
    fi
  fi

  # Negative control: same scenario, hooks neutered. Must NOT succeed.
  neuter_on "$repo"
  if scenario "$repo" "$tn" "$@"; then
    TOOTHLESS=$((TOOTHLESS+1))
    c_yel "  TOOTHLESS  $label -- negative control PASSED; assertion cannot detect a regression"
  else
    note "$label: negative control failed as expected"
  fi
  neuter_off "$repo"
  resync "$repo"
}

do_probe() {
  ROOT=$1
  hdr "environment"
  printf '  git   %s\n  crew  %s\n  hk    %s\n  root  %s\n' \
    "$(git --version | awk '{print $3}')" \
    "$(crew --version 2>/dev/null | head -1)" \
    "$(hk --version 2>/dev/null || echo 'not on PATH')" "$ROOT"

  hdr "harness setup"
  setup_harness "$ROOT" || return 3
  ok "hermetic bare remote + clone + crew init (two-layer)"
  local A="$ROOT/a" h ch

  hdr "hook registration inventory (both channels)"
  for h in $CREW_HOOKS; do
    ch=$(hook_channels "$A" "$h")
    [ "$ch" = none ] && bad "hook $h registered on NO channel" \
                     || ok "hook $h reachable via: $ch"
  done

  hdr "observable sync effects (each paired with a negative control)"

  # Actions run as shell functions (not `bash -c`) so they share $ROOT and can
  # call the plumbing helpers directly.
  act_commit()   { date >> "$A/README.md"; git -C "$A" add README.md
                   git -C "$A" commit -qm probe-commit; }
  act_pull()     { advance_remote_main "$ROOT/remote.git"
                   git -C "$A" pull -q --no-rebase origin main; }
  act_checkout() { git -C "$A" checkout -q -B "probe-$RANDOM"; git -C "$A" checkout -q main; }
  act_amend()    { git -C "$A" commit -q --amend --no-edit; }

  assert_sync "post-commit pulls crew-state"          "$A" --xfail -- act_commit
  assert_sync "post-merge fast-forwards crew-state"    "$A" -- act_pull
  assert_sync "post-checkout fast-forwards crew-state" "$A" -- act_checkout
  assert_sync "post-rewrite fast-forwards crew-state"  "$A" -- act_amend

  # pre-push runs in the opposite direction: local -> remote.
  hdr "pre-push publishes crew-state (reverse direction)"
  local tok="push-$RANDOM$RANDOM"
  advance_crew_state "$A" "$tok"
  ( cd "$A" && date >> README.md && git add README.md \
      && CREW_SYNC_ACTIVE=1 git commit -qm push-probe && git push -q origin main ) >/dev/null 2>&1
  [ "$(read_marker "$ROOT/remote.git")" = "$tok" ] \
      && ok "pre-push -- remote crew-state advanced to $tok" \
      || bad "pre-push -- remote crew-state did NOT advance (SILENT NO-OP)"

  neuter_on "$A"; tok="pushneg-$RANDOM"
  advance_crew_state "$A" "$tok"
  ( cd "$A" && date >> README.md && git add README.md \
      && git commit -qm push-neg && git push -q origin main ) >/dev/null 2>&1
  if [ "$(read_marker "$ROOT/remote.git")" = "$tok" ]; then
    TOOTHLESS=$((TOOTHLESS+1)); c_yel "  TOOTHLESS  pre-push -- negative control PASSED"
  else
    note "pre-push: negative control failed as expected"
  fi
  neuter_off "$A"; resync "$A"

  hdr "refs/notes/crew propagation"
  if git -C "$A" rev-parse -q --verify refs/notes/crew >/dev/null 2>&1; then
    git -C "$ROOT/remote.git" rev-parse -q --verify refs/notes/crew >/dev/null 2>&1 \
      && ok "refs/notes/crew reached the remote" \
      || bad "refs/notes/crew exists locally but never reached the remote"
  else
    c_dim "  SKIP  crew created no refs/notes/crew in this harness"
  fi

  hdr "pre-commit guard still blocks two-layer state"
  mkdir -p "$A/.crew"; printf 'probe\n' >> "$A/.crew/decisions.md"
  git -C "$A" add -f .crew/decisions.md >/dev/null 2>&1
  ( cd "$A" && git commit -qm should-be-blocked ) >/dev/null 2>&1 \
      && bad "pre-commit guard did NOT block a staged .crew/decisions.md" \
      || ok "pre-commit guard blocked a staged .crew/decisions.md"
  git -C "$A" reset -q -- .crew/decisions.md 2>/dev/null

  # ---- husky-shaped repo rehearsal ----------------------------------------
  # equestria-cluster and stargate-command-cluster do NOT use .git/hooks.
  # They set core.hooksPath=.husky, and crew's six hook bodies were appended
  # into .husky/* by the bootstrap. Removing husky therefore removes ALL SIX
  # crew hooks in one move. This section rehearses that exact shape.
  hdr "husky-shaped repo (core.hooksPath=.husky) -- the cluster repos"
  local GH; GH=$(git -C "$A" rev-parse --absolute-git-dir)/hooks
  mkdir -p "$A/.husky" "$ROOT/hooks-backup"
  for h in $CREW_HOOKS; do
    cp "$GH/$h" "$ROOT/hooks-backup/$h" 2>/dev/null
    # MOVE, not copy: the cluster repos have crew's hooks ONLY in .husky/.
    # A copy would leave .git/hooks/* as a silent safety net that those repos
    # do not actually have, and the removal rehearsal below would prove nothing.
    mv "$GH/$h" "$A/.husky/$h" 2>/dev/null
    chmod +x "$A/.husky/$h" 2>/dev/null
  done
  git -C "$A" config core.hooksPath .husky
  HUSKY_SHAPE=1

  for h in $CREW_HOOKS; do
    ch=$(hook_channels "$A" "$h")
    [ "$ch" = none ] && bad "husky shape: hook $h registered on NO channel" \
                     || ok "husky shape: hook $h reachable via: $ch"
  done
  # Sync must still work when the hooks live in .husky/ rather than .git/hooks/.
  # NOTE: neuter_on/neuter_off manipulate core.hooksPath, so the negative
  # control below restores .husky (not "unset") -- handled by husky_neuter_off.
  assert_sync "husky shape: post-checkout FFs crew-state" "$A" -- act_checkout

  # The migration's real danger: husky goes away and nothing re-homes crew's
  # hooks. Assert that this probe SCREAMS when that happens.
  hdr "husky removal rehearsal (must be detected)"
  rm -rf "$A/.husky"
  git -C "$A" config --unset core.hooksPath
  local lost=0
  for h in $CREW_HOOKS; do
    [ "$(hook_channels "$A" "$h")" = none ] && lost=$((lost+1))
  done
  if [ "$lost" -gt 0 ]; then
    ok "removing husky was detected: $lost/6 crew hooks lost every channel"
  else
    bad "removing husky was NOT detected -- the inventory check is blind to it"
  fi
  # restore the .git/hooks shape for anything that follows
  for h in $CREW_HOOKS; do cp "$ROOT/hooks-backup/$h" "$GH/$h" 2>/dev/null; chmod +x "$GH/$h" 2>/dev/null; done
  HUSKY_SHAPE=0

  # ---- hk co-existence -----------------------------------------------------
  if [ "$WITH_HK" = 1 ]; then
    hdr "hk co-existence (git-config channel)"
    if ! command -v hk >/dev/null 2>&1; then
      c_yel "  SKIP  hk not on PATH"
    else
      printf 'amends "package://github.com/jdx/hk/releases/download/v1.53.0/hk@1.53.0#/Config.pkl"\nhooks {\n    ["pre-commit"] { steps { ["noop"] { glob = "*.md"; check = "true" } } }\n}\n' > "$A/hk.pkl"
      ( cd "$A" && hk install ) >"$ROOT/hk-install.log" 2>&1
      if git -C "$A" config --get-regexp '^hook\.' >/dev/null 2>&1; then
        ok "hk registered via git config (channel 2 active)"
        note "$(git -C "$A" config --get-regexp '^hook\.' | tr '\n' ' ')"
      else
        c_yel "  SKIP  hk install registered nothing (see $ROOT/hk-install.log)"
      fi
      for h in $CREW_HOOKS; do
        ch=$(hook_channels "$A" "$h")
        [ "$ch" = none ] && bad "after hk install: hook $h lost ALL channels" \
                         || ok "after hk install: hook $h reachable via: $ch"
      done
      local hp; hp=$(git -C "$A" config --get core.hooksPath 2>/dev/null)
      [ -n "$hp" ] \
        && bad "hk set core.hooksPath=$hp -- REPOINTS the file channel away from crew's hooks" \
        || ok "core.hooksPath still unset -- crew's file channel intact"
      assert_sync "post-checkout FFs crew-state WITH hk installed" "$A" -- act_checkout #
          bash -c "cd '$A' && git checkout -q -B hk-\$RANDOM && git checkout -q main"
    fi
  fi
}
export -f advance_remote_main 2>/dev/null || true

# --------------------------------------------------------------- inventory ---

inventory_repo() {
  local repo=$1 h ch hd first=1
  hd=$(hooks_dir "$repo")
  printf '    {\n      "repo": "%s",\n' "$repo"
  printf '      "head": "%s",\n' "$(git -C "$repo" symbolic-ref --short -q HEAD)"
  printf '      "core_hooksPath": "%s",\n' "$(git -C "$repo" config --get core.hooksPath 2>/dev/null)"
  printf '      "hooks_dir": "%s",\n' "$hd"
  # hk's registered command contains embedded double quotes -- must be escaped
  # or the emitted JSON is invalid.
  printf '      "config_hooks": "%s",\n' \
    "$(git -C "$repo" config --get-regexp '^hook\.' 2>/dev/null \
       | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ';')"
  printf '      "hooks": {\n'
  for h in $CREW_HOOKS; do
    ch=$(hook_channels "$repo" "$h")
    [ $first = 1 ] || printf ',\n'; first=0
    printf '        "%s": { "channels": "%s", "sha256": "%s" }' "$h" "$ch" \
      "$( [ -f "$hd/$h" ] && shasum -a 256 "$hd/$h" 2>/dev/null | awk '{print $1}')"
  done
  printf '\n      },\n      "refs": {\n'
  printf '        "crew_state_local": "%s",\n'  "$(git -C "$repo" rev-parse -q --verify refs/heads/crew-state)"
  printf '        "crew_state_remote": "%s",\n' "$(git -C "$repo" rev-parse -q --verify refs/remotes/origin/crew-state)"
  printf '        "notes_crew": "%s"\n'         "$(git -C "$repo" rev-parse -q --verify refs/notes/crew)"
  printf '      }\n    }'
}

do_baseline() {
  local out=$1; shift
  local first=1 r
  { printf '{\n  "captured_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  "git": "%s",\n  "crew": "%s",\n  "hk": "%s",\n' \
      "$(git --version | awk '{print $3}')" "$(crew --version 2>/dev/null | head -1)" \
      "$(hk --version 2>/dev/null || echo none)"
    printf '  "repos": [\n'
    for r in "$@"; do
      git -C "$r" rev-parse --git-dir >/dev/null 2>&1 || { c_yel "skip (not a repo): $r" >&2; continue; }
      [ $first = 1 ] || printf ',\n'; first=0
      inventory_repo "$r"
    done
    printf '\n  ]\n}\n'; } > "$out"
  c_grn "baseline written: $out"
}

do_verify() {
  local base=$1; shift
  [ -f "$base" ] || { c_red "baseline not found: $base"; return 3; }
  hdr "hook channel regression (baseline -> now)"
  local r h was is
  for r in "$@"; do
    for h in $CREW_HOOKS; do
      was=$(python3 - "$base" "$r" "$h" <<'PY' 2>/dev/null
import json,sys
d=json.load(open(sys.argv[1]))
for x in d["repos"]:
    if x["repo"]==sys.argv[2]:
        print(x["hooks"][sys.argv[3]]["channels"]); break
else: print("ABSENT")
PY
)
      is=$(hook_channels "$r" "$h")
      [ "$was" = ABSENT ] && continue
      if [ "$is" = none ] && [ "$was" != none ]; then
        bad "$(basename "$r"): $h lost ALL registration channels ($was -> none)"
      elif [ "$was" != "$is" ]; then
        c_yel "  CHANGED  $(basename "$r"): $h  $was -> $is"
      else
        ok "$(basename "$r"): $h  $is"
      fi
    done
  done
  c_yel "NOTE: channel inventory proves REGISTRATION, not EFFECT."
  c_yel "      Only 'probe' proves the refs actually move. Run both."
}

# ------------------------------------------------------------------- main ---

usage() { cat <<'U'
crew-sync-regression.sh <mode> [options]

  probe [--with-hk] [--keep] [-v]
      Hermetic end-to-end harness in a temp dir. Touches no real repo.
      Proves crew-state / refs-notes actually MOVE, and proves each assertion
      can fail (negative controls). Run after any hook-management change.

  baseline --out FILE REPO...      Read-only inventory. Run BEFORE migration.
  verify --baseline FILE REPO...   Re-inventory and diff registration channels.

Exit: 0 pass  1 regression  2 probe has no teeth  3 usage/env error
U
}

MODE=${1:-}; shift 2>/dev/null || true
OUT=""; BASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --with-hk) WITH_HK=1 ;; --keep) KEEP=1 ;; -v) VERBOSE=1 ;;
    --out) shift; OUT=${1:-} ;; --baseline) shift; BASE=${1:-} ;;
    *) break ;;
  esac; shift
done

case "$MODE" in
  probe)
    T=$(mktemp -d "${TMPDIR:-/tmp}/crew-sync-probe.XXXXXX")
    do_probe "$T"; rc=$?
    [ "$KEEP" = 1 ] && c_dim "harness kept at $T" || rm -rf "$T"
    [ "$rc" = 3 ] && exit 3 ;;
  baseline) [ -n "$OUT" ] || { usage; exit 3; }; do_baseline "$OUT" "$@"; exit 0 ;;
  verify)   [ -n "$BASE" ] || { usage; exit 3; }; do_verify "$BASE" "$@" ;;
  *) usage; exit 3 ;;
esac

hdr "result"
printf '  pass=%d  fail=%d  xfail=%d  toothless=%d  unexpected-pass=%d\n' \
  "$PASS" "$FAIL" "$XFAIL" "$TOOTHLESS" "$UNEXPECTED_PASS"
if [ "$TOOTHLESS" -gt 0 ]; then
  c_red "PROBE HAS NO TEETH: $TOOTHLESS assertion(s) passed with hooks disabled."
  c_red "Fix the probe before trusting any green run."; exit 2
fi
if [ "$FAIL" -gt 0 ]; then
  c_red "REGRESSION: crew-state sync is silently no-op'ing on $FAIL path(s)."; exit 1
fi
[ "$UNEXPECTED_PASS" -gt 0 ] && c_yel "known-broken assertion started passing -- update the baseline note."
[ "$XFAIL" -gt 0 ] && c_yel "$XFAIL known-broken path(s) still broken (post-commit; see script header)."
c_grn "crew-state sync verified end-to-end on every non-xfail path."
exit 0
