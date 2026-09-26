#!/usr/bin/env bash
#
# SHELLCHECK CANNOT FULLY READ THIS FILE, and the three codes below are off
# for one specific, provable reason -- not as a severity floor. Every other
# rule, including the rest of the error and warning tiers, stays on, matching
# ../../../../.shellcheckrc's stance of justifying each disable at its site.
#
# This file is a TEMPLATE, not a script as committed. It is delivered through
# a ConfigMap and Flux runs envsubst over it (../ks.yaml `postBuild`), so
# every shell variable is written `$$VAR` and only becomes `$VAR` at apply
# time. shellcheck analyses the pre-substitution text, where `$$VAR` parses as
# `$$` (the PID) followed by the literal string `VAR`. That single
# misreading produces all three:
#
#   SC2034  "appears unused" -- the assignment is seen, the `$$VAR` uses are
#           not, so every variable here looks write-only.
#   SC2157  "argument to -n is always true due to literal strings" -- `[ -n
#           "$$X" ]` looks like a non-empty literal rather than a variable.
#   SC2170  "invalid number for -gt" -- `[ "$$N" -gt 0 ]` looks like a
#           comparison against text.
#
# Rewriting the tests as `case` would silence two of them but not SC2034, and
# would trade readable code for appeasing a parser that is reading the wrong
# document. What actually validates this file is running shellcheck (and
# `bash -n`) against the SUBSTITUTED form:
#
#   sed 's/\$\$/$/g' entrypoint.sh | shellcheck -
#
# Do that after editing. The other `$$` templates in this repo
# (kubernetes/apps/kube-system/openbao-replica/resources/) need no directive
# only because none of them puts `$$VAR` inside a `[ ... ]` test.
# shellcheck disable=SC2034,SC2157,SC2170
# Bootstrap + entrypoint for the agentboard pod, run as `command` against a
# STOCK debian:13-slim image (see ../helmrelease.yaml) -- there is no
# agentboard-specific Dockerfile or CI build in this repo. That is a
# deliberate simplification, not an oversight: everything this pod needs
# beyond a bare Debian base is either something mise installs at runtime
# (../resources/mise.toml -- node, kubectl, pulumi, gh, claude
# code, agentboard itself) or a handful of apt packages, and maintaining a
# Dockerfile + registry + build pipeline for that little was judged not
# worth it. The cost is a slower pod start (apt-get + the mise installer run
# on every restart, not just once at image-build time) in exchange for zero
# image maintenance.
set -euo pipefail

echo "==> installing OS packages"
# `tini` and `procps` are for the process hygiene at the bottom of this file:
# tini becomes PID 1 so exited children are reaped, and procps supplies the
# pgrep/pkill the orphaned-provider sweep runs on (the slim image has no ps).
#
# `ripgrep` is agentboard's, and its README does not list it. agentboard shells
# out to a bare `rg` to tie each tmux window to the Claude transcript running
# in it; without one on PATH every match attempt failed with `Executable not
# found` -- 722 times in ~/.agentboard/agentboard.log by 2026-09-25 -- and a
# window could only be matched to its session by NAME. That fallback is the
# only reason the resume block below ever worked: it names each window after
# the session's display_name.
apt-get update -qq
apt-get install -y --no-install-recommends \
    tmux git openssh-client ca-certificates curl build-essential \
    tini procps ripgrep \
    >/dev/null
rm -rf /var/lib/apt/lists/*

echo "==> installing mise"
if ! command -v mise >/dev/null 2>&1; then
  curl -fsSL https://mise.run | sh
fi

echo "==> configuring git"
# Authored as David, not a separate bot identity -- this repo's own
# convention (see CLAUDE.md's "Agent comment signing" rule): Claude-driven
# changes are attributed via a `Co-Authored-By: Claude Sonnet 5` trailer on
# the commit, same as every other Claude Code session against this repo, not
# via a distinct git identity.
git config --global user.name "David Driscoll"
git config --global user.email "david.driscoll@gmail.com"
# Auth: `github-token`, the estate's own GitHub App installation token
# (kubernetes/apps/kube-system/secrets/github-app-token/), mounted below by
# ../helmrelease.yaml at /var/run/secrets/github-token/token -- as a VOLUME,
# deliberately, not the plain env var most other consumers in this repo use.
# That token is re-minted every 30m against a 60m life; an env var sourced
# via `secretKeyRef` is resolved ONCE at pod start and never updates without
# a pod restart, which is fine for the short-lived Jobs that pattern usually
# feeds (../../coder/renovate/renovatejob.yaml explains why there) and wrong
# here -- this pod's tmux/Claude Code session is meant to run for days. A
# volume mount updates its file content in place as the Secret rotates, so
# reading it fresh on every `git` invocation, rather than once, is what
# keeps `git push` working three days into an agent session instead of one
# hour into it. `x-access-token` is GitHub's own fixed username for App
# installation tokens over HTTPS -- not a placeholder.
# Single-quoted ON PURPOSE. `$(cat ...)` must stay literal here and be
# evaluated by git's OWN shell each time it invokes this helper, not
# expanded once by this script at config-time -- that lazy re-read on every
# invocation is the entire point (see the comment above).
# shellcheck disable=SC2016
git config --global credential."https://github.com".helper \
  '!f() { echo username=x-access-token; echo "password=$(cat /var/run/secrets/github-token/token)"; }; f'

echo "==> cloning home-operations"
# The working checkout the agent actually operates against, pre-seeded here
# so a fresh session does not start by asking someone to clone it by hand.
# /root/home-operations sits on the persistent `home` PVC
# (../helmrelease.yaml's `persistence.home`), so the clone is a one-time
# cost -- every restart after the first takes the fetch branch below.
#
# HTTPS, not SSH: the credential helper configured just above is this pod's
# ONLY GitHub auth (no ssh key is mounted anywhere, and no known_hosts is
# seeded), and it answers for `https://github.com` alone.
#
# Deliberately NOT fatal. `set -euo pipefail` is in force, so an unguarded
# failure here would take the whole pod into CrashLoopBackOff over a
# transient GitHub outage or an expired token -- and agentboard's actual job
# (serving the terminal UI, below) does not depend on this checkout
# existing. A warning in the pod log, with `git` still usable from the
# agent's own pane to retry by hand, is the right failure mode.
if [ ! -d /root/home-operations/.git ]; then
  git clone https://github.com/david-driscoll/home-operations.git \
    /root/home-operations \
    || echo "WARNING: clone of home-operations failed; continuing without it"
else
  # `fetch`, NOT `pull`. This checkout survives restarts, so it may well be
  # sitting on an agent's in-progress branch with uncommitted work; fetching
  # refreshes origin/* without touching the working tree, the current
  # branch, or anything an agent left mid-task.
  git -C /root/home-operations fetch --prune origin \
    || echo "WARNING: fetch of home-operations failed; checkout may be stale"
fi

# Resolves from the exact versions pinned in ../resources/mise.toml. There is
# no lockfile any more: `lockfile`/`locked` and mise.lock were dropped in
# dd2663ee, so a version bump is a one-line pin change with nothing to
# regenerate beside it.
#
# The two references to MISE_CONFIG_DIR below are DOUBLE-DOLLAR-escaped
# (bash sees a normal single-dollar expansion once Flux is done) -- this
# whole script is also a configMapGenerator input (../kustomization.yaml),
# and components/common's substituteFrom patch scans the RAW TEXT of every
# generated ConfigMap for a dollar-brace pattern at BUILD time, comments
# included. MISE_CONFIG_DIR is meant to expand at RUNTIME instead, from
# ../helmrelease.yaml's pod env -- an unescaped reference here looks
# identical to a Flux substitution to that patch, and since MISE_CONFIG_DIR
# is never one of the actual cluster-secrets/shared-secrets variables,
# strict mode hard-fails the whole Kustomization with `variable not set
# (strict mode): "MISE_CONFIG_DIR"`. Confirmed live TWICE: once for the
# unescaped functional references (fixed first), and once more for this
# very explanation, which named the broken pattern by writing it out
# unescaped in prose -- Flux's scan does not know a comment from code, so
# read this whole block as a warning not to reintroduce either mistake, and
# double-escape any future dollar-brace example added here too. `$$` is
# Flux's own escape for a literal `$` in its output.
echo "==> mise install (config: $${MISE_CONFIG_DIR}/config.toml)"
mise trust "$${MISE_CONFIG_DIR}/config.toml"
mise install

# THEN THE REPO'S OWN TOOLS, which are a DIFFERENT SET from the one above.
# ../resources/mise.toml pins the ~11 things the pod itself needs to boot
# (node, kubectl, pulumi, gh, claude code, agentboard). The checkout's
# .config/mise.toml pins the ~33 this repo's work needs -- hk, flate, biome,
# yamllint, actionlint, shellcheck, typos, python, graphify and the rest.
# Only the first was ever installed, and the gap was invisible because both
# configs are trusted, so `mise ls --current` lists all 33 and marks most
# "(missing)" rather than erroring.
#
# What that cost, concretely: `hk install --mise` in the repo's
# [hooks].postinstall could never run, so NO git hooks were registered and
# every check in .config/hk.pkl was inactive in this pod -- detect-private-key
# and check-added-large-files included, in a repo whose CLAUDE.md warns never
# to commit plaintext credentials. `graphify hook install` failed the same way,
# and both printed a bare `not found` + exit 127 on every `mise install` an
# agent ran for some unrelated tool.
#
# THE WHOLE SET, not a curated subset. A hand-picked "just what the hooks need"
# list is a second inventory that drifts from .config/mise.toml the first time
# a hk step gains a tool -- and pin drift is already this estate's recurring
# bug. One list cannot drift.
# The cost is a slower FIRST boot and a few GB; both are one-time, because
# ~/.local/share/mise is on the /root PVC and a restart with tools already
# there is a no-op.
#
# NON-FATAL on purpose. This script is `set -euo pipefail`, and a bare
# `mise install` here would turn one bad pin -- a yanked release, an upstream
# 404, a pin Renovate bumped to a release that never published -- into a pod that
# cannot start at all. A pod with an incomplete toolchain is recoverable from
# the terminal; a pod stuck in CrashLoopBackOff is not.
echo "==> mise install (repo: /root/home-operations/.config/mise.toml)"
if ! (cd /root/home-operations && mise install); then
  echo "WARNING: repo mise install failed; some tooling and git hooks may be missing." >&2
  echo "         Investigate with: cd /root/home-operations && mise ls --current" >&2
fi

# PRUNE WHAT THE INSTALLS ABOVE SUPERSEDED. `mise install` only ever adds: a
# Renovate bump to a pin installs the new version beside the old one and
# nothing removes the old one. On 2026-09-12 the 20Gi /root PVC reached 100%
# holding six claude-code versions, five agentboard, four graphify and three
# pulumi (~200-300M each), plus a 1.9G npm cache -- and the pod crash-looped
# at `git config` above, which cannot write ~/.gitconfig.lock on a full disk.
# The trigger was simply the next claude-code bump rolling the pod.
#
# `mise prune` deletes every installed version that is not the one pinned by
# some config in ~/.local/state/mise/tracked-configs. That set includes each
# agent worktree's .config/mise.toml, so a long-lived worktree on an old
# branch keeps ITS pins alive until the worktree is removed -- intended, since
# that worktree may still be in use. Links to configs that no longer exist
# (removed worktrees) are pruned too, which is what releases their pins.
#
# `mise cache prune` and `npm cache clean` drop download caches only; the next
# install re-fetches what it needs. Everything here is NON-FATAL for the same
# reason the repo install above is: housekeeping must never be the thing that
# keeps the pod from starting.
echo "==> pruning superseded tool versions and caches"
mise prune --yes || echo "WARNING: mise prune failed; old tool versions remain on the PVC" >&2
mise cache prune || true
npm cache clean --force >/dev/null 2>&1 || true

# User-wide skills (~/.claude/skills/toolport/SKILL.md) are NOT installed here
# any more: ../helmrelease.yaml mounts them from the `-skills` ConfigMap, built
# from the repo's .claude/skills/ at the deployed revision. They used to be
# curl'd from main at boot, which could drift from what was deployed and
# failed on an offline boot.

# REMOTE CONTROL ON AT STARTUP, SET EXPLICITLY AT USER SCOPE.
#
# Every Claude Code session in this pod is meant to be reachable from the
# phone, and for a while that happened without anything here asking for it.
# It was never configured: on 2026-09-26 neither ~/.claude/settings.json nor
# ~/.claude.json, nor any of the rolling ~/.claude.json backups kept in
# ~/.claude/backups, carried `remoteControlAtStartup`. What turned it on was
# Claude Code's own DEFAULT for an unset key -- org policy, else a server-side
# feature flag (`tengu_cobalt_harbor`, default false), read off the 2.1.283
# bundle -- and the `remote-control-auto-on` notice counted in ~/.claude.json
# is the disclosure it shows when that default is what applied. When the
# default stopped resolving to true, Remote Control stopped starting, with
# nothing in this repo having changed.
#
# An explicit `true` skips that default entirely. It has to be USER scope:
# `remoteControlAtStartup` is a security-sensitive key that the repo's
# .claude/settings.json and settings.local.json may only switch OFF -- Claude
# Code logs "repo-scoped settings cannot enable Remote Control; set it at user
# scope (/config)" and ignores a `true` there. And it has to be a setting, not
# a `--remote-control` flag: a flag would need adding to ../resources/bashrc's
# wrapper, the resume command below, and agentboard's own Wake (which runs
# CLAUDE_RESUME_CMD through tmux, outside any of those), while a setting
# reaches all of them.
#
# ~/.claude/settings.json is on the PVC and is yours -- theme, autoMode and the
# rest -- so this MERGES one key and rewrites nothing else. It only ever adds
# the key: if it is already there, true or false, it is left alone, so turning
# Remote Control off with /config survives the next boot. Non-fatal, like the
# rest of the housekeeping above.
echo "==> Remote Control at startup (user settings)"
if ! CLAUDE_SETTINGS=/root/.claude/settings.json bun -e '
  import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
  import { dirname } from "node:path";
  const p = process.env.CLAUDE_SETTINGS;
  const s = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  if (Object.hasOwn(s, "remoteControlAtStartup")) {
    console.log("    remoteControlAtStartup is already " + s.remoteControlAtStartup + " in " + p + "; leaving it");
  } else {
    s.remoteControlAtStartup = true;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p + ".tmp", JSON.stringify(s, null, 2) + "\n");
    renameSync(p + ".tmp", p);
    console.log("    set remoteControlAtStartup: true in " + p);
  }
'; then
  echo "WARNING: could not set remoteControlAtStartup; sessions will not start Remote Control on their own" >&2
fi

# NO TMUX SESSION IS CREATED HERE, and that is a deliberate reversal. This
# used to be
#
#   if ! tmux has-session -t main 2>/dev/null; then
#     tmux new-session -d -s main -n shell
#   fi
#
# carrying the comment "agentboard polls for windows, it does not start the
# server itself". That premise was wrong, and believing it cost the UI its
# kill button.
#
# WHAT IT COST. agentboard tags every window it can see `managed` or
# `external` and REFUSES to kill an external one -- "Cannot kill external
# sessions". Classification is by tmux SESSION NAME: anything under
# `agentboard` is managed, anything else is not. `main` was ours, so every
# window in it was permanently unkillable from the phone. Ten failed attempts
# are recorded in ~/.agentboard/agentboard.log.
#
# WHY THE PREMISE WAS WRONG. Verified 2026-09-06 rather than reasoned about:
# agentboard was run against a completely empty TMUX_TMPDIR -- its own HOME
# and port as well, so the live server was never touched -- and it started a
# tmux server there on its own, creating its `agentboard` session in it. The
# bootstrap was never load-bearing. What it actually did was guarantee that
# the first session on the socket was one agentboard would not manage.
#
# The giveaway had been sitting in ~/.agentboard/tmux-server.pid the whole
# time: it pointed at the pid of OUR `tmux new-session`, not at a server
# agentboard had spawned. Adoption, not creation -- which reads identically
# from the outside until you take the bootstrap away.
#
# A terminal now opens into agentboard's own root window, in its own session,
# which it will kill on request like any other.


# NO CLAUDE SESSION IS AUTO-STARTED FROM SCRATCH, EITHER. This used to be
#
#   tmux send-keys -t main:claude "mise exec -- claude" C-m
#
# and that line is what made every pod restart lose the thread. A restart
# kills the tmux server and every process in it, so `has-session` always
# missed and this always ran -- minting a BRAND-NEW Claude Code session each
# time. The previous session was not gone (its transcript is on the home PVC
# under /root/.claude, which is exactly what that PVC is for), but nothing
# ever went back for it, so from the outside a restart looked like amnesia.
#
# tmux cannot fix that for us: the claude PROCESS is dead, only its
# transcript survives, and there is no attach-to-a-dead-pid. Resuming is a
# decision with a choice in it -- which session -- so it belongs to whoever
# opens the terminal, not to a boot script guessing. From any agentboard
# pane:
#
#   claude --continue    # pick the most recent session in this directory
#   claude --resume      # choose from the list of past sessions
#   claude               # start fresh -- IN ITS OWN GIT WORKTREE
#
# That last one is not quite plain `claude`. ../resources/bashrc wraps a
# BARE invocation to add `--worktree`, so two panes never end up editing
# /root/home-operations at the same time -- which has already happened once,
# and is written up in that file. Anything with arguments passes through
# untouched, so the two resume forms above still land in the directory their
# transcripts belong to.
#
# Plain `claude`, no `mise exec --` prefix needed any more: ../resources/bashrc
# puts the mise shims back on PATH for the login shells tmux hands out. See
# that file for what /etc/profile was doing to them.

# RESUME THE MOST RECENT SESSIONS, IN AGENTBOARD'S OWN TMUX SESSION.
#
# Not a reversal of the "nothing is started on purpose" block above -- read
# both. That block warns against starting a BRAND-NEW session every boot,
# minting a fresh id and orphaning the transcript that mattered. This starts
# no new sessions: it reattaches to specific existing ids and does nothing
# when there are none, so a fresh PVC still comes up with nothing but
# agentboard's own root window.
#
# WHY THE WINDOWS GO IN `agentboard`, which is the whole reason they are
# opened down here in the background rather than earlier in this script.
# agentboard tags every window it can see as `managed` or `external`, and
# REFUSES to kill an external one -- "Cannot kill external sessions".
# Classification is by tmux SESSION NAME: anything under `agentboard` is
# managed, anything else is not. Ten failed kill attempts in
# ~/.agentboard/agentboard.log are what surfaced this, back when the bootstrap
# above still created a `main` session for these windows to land in.
#
# Verified live 2026-09-05 rather than assumed: a window created with a plain
# `tmux new-window -t agentboard` -- no agentboard involvement at all -- came
# back from GET /api/sessions as `source=managed`, while every `main:@N`
# window reported `external`. So placing them here is sufficient; they do not
# have to be launched BY agentboard to be killable.
#
# Hence the wait: agentboard creates that session itself, a few seconds after
# this script execs it, so there is nothing to attach to until it does. The
# subshell backgrounds so `exec` below still replaces this process as PID 1.
#
# NAMES, PATHS AND ORDERING COME FROM agentboard's OWN DATABASE, not from the
# transcript directory. ~/.claude/projects/<slashes-as-dashes>/ is a lossy
# encoding -- `-root-home-operations` could be /root/home-operations or
# /root/home/operations, and this repo has a literal hyphen -- whereas
# agent_sessions carries `project_path` verbatim, `display_name` as the UI
# shows it (`pure-star`, not `a882e2df`), and `last_activity_at` for a
# truthful "most recent". A row with no project_path, or one pointing at a
# directory that no longer exists (a removed worktree), is skipped rather than
# resumed into the wrong place.
#
# `$$` throughout is Flux's escape for a literal `$`; `$(...)` needs none.
# See the mise block above for the warning this follows.
AGENTBOARD_RESUME_SESSIONS="$${AGENTBOARD_RESUME_SESSIONS:-3}"
# `-` not `:-`: unset gets the default, explicitly EMPTY means resume in
# silence. That is the off switch and it needs no rebuild. No single quotes in
# it -- it is interpolated into a single-quoted `bash -lc` string below.
AGENTBOARD_RESUME_PROMPT="$${AGENTBOARD_RESUME_PROMPT-continue from where you left off}"

# FIRST, SETTLE agentboard's DATABASE AGAINST THE NEW TMUX SERVER -- here, in
# the foreground, BEFORE agentboard starts and reads it.
#
# A pod restart always means a fresh tmux server, so every `current_window` in
# agent_sessions at this point names a window that died with the old one. And
# agentboard does not clear them itself. Read off its 0.15.0 bundle: its
# reconcile only probes a remembered window once the new server has at least
# one real window, and with nothing but `__agentboard_root__` it keeps every
# stale row "active" at status unknown. The browser is handed that phantom,
# selects it, and gets `ERR_TMUX_SWITCH_FAILED: can't find window: @2` -- which
# is what every restart showed, and what `branch-management` sat in for eight
# hours on 2026-09-25. tmux also numbers windows from @1 again on a new server,
# so the first real window can REUSE a stale id and be claimed by the wrong
# session. The two failures share a cause, and clearing it here fixes both.
#
# What this writes is exactly what agentboard's own `orphanSession` would, on
# the first reconcile that could see the window was gone: `current_window =
# NULL, is_hibernating = 1`. It only happens sooner, before any of it can reach
# a browser. The rows keep their names and land under Hibernating, where the
# UI offers a one-click Wake for any that are not resumed below.
#
# WHICH SESSIONS ARE RESUMED is decided here too, from the same read. It has to
# be here, not after: past this point the difference between "was running when
# the pod went down" and "was hibernated on purpose" is gone. The rule:
#
#   current_window IS NOT NULL               running when the pod went down
#   is_hibernating = 1 AND wake_started_at   a Wake still in flight -- the
#     IS NOT NULL                            UI's, or this block's on a boot
#                                            that died before it finished
#
# A session hibernated from the UI on purpose is NOT resumed. agentboard's
# README describes Hibernate as closing the window while "keeping them visible
# across restarts for manual Wake", and resurrecting them every boot would
# undo that. History (Move to History, or killed from the UI) is excluded for
# the same reason it always was: someone is finished with it.
#
# THE RESUMED ROWS GET agentboard's OWN WAKE MARKER, `wake_started_at = now`,
# which its Wake button sets before opening a window. That is not bookkeeping:
# agentboard will not attach a window to a hibernating session unless the
# marker is under 10 minutes old (`canAttemptDormantRematch`, and
# WAKE_PENDING_REMATCH_TTL_MS). Without it the resumed `claude` would run in a
# window the UI never connects to its session. The log poller clears the
# marker when it claims the window; markers on rows NOT resumed are cleared
# here, as agentboard's own `recordWakeFailure` does for a Wake that failed.
#
# THE HIBERNATION COLUMN WAS `is_pinned` UNTIL agentboard 0.12. Somewhere
# between 0.5.4 and 0.12.2 a migration renamed it (`ALTER TABLE agent_sessions
# RENAME COLUMN is_pinned TO is_hibernating`; the meaning did not change), and
# the resume query, still naming the old column, threw `no such column:
# is_pinned` on every boot from the 0.12.2 rollout on 2026-09-23 until
# 2026-09-25. Nobody saw it: stderr went to /dev/null, the loop got zero rows,
# and "could not look" printed exactly the same nothing as "found nothing to
# resume". Hence the WARNING path and the lines saying what was found. Note
# that this runs BEFORE agentboard's own migrations, so it always sees the
# PREVIOUS version's schema: the boot that rolls out a rename still works, and
# the WARNING appears on the boot after it.
#
# Runs even with resuming switched off (N=0) -- the phantom windows are there
# either way. NON-FATAL, like everything after the base `mise install`: a
# failure leaves agentboard exactly as it was before this block existed.
resume_n=0
if [ "$$AGENTBOARD_RESUME_SESSIONS" -gt 0 ] 2>/dev/null; then
  resume_n="$$AGENTBOARD_RESUME_SESSIONS"
fi
resume_rows=""
settled=0
db=/root/.agentboard/agentboard.db
if [ ! -f "$$db" ]; then
  echo "==> no agentboard.db yet; nothing to settle or resume"
elif resume_rows=$(DB="$$db" N="$$resume_n" bun -e '
  import { Database } from "bun:sqlite";
  import { existsSync } from "node:fs";
  const n = parseInt(process.env.N, 10) || 0;
  const picked = [];
  try {
    const db = new Database(process.env.DB);
    db.transaction(() => {
      const candidates = db.query(
        "SELECT session_id, display_name, project_path FROM agent_sessions " +
        "WHERE project_path IS NOT NULL AND project_path != \x27\x27 " +
        "AND (current_window IS NOT NULL " +
        "OR (is_hibernating = 1 AND wake_started_at IS NOT NULL)) " +
        "ORDER BY last_activity_at DESC").all();
      const stale = db.query(
        "UPDATE agent_sessions SET current_window = NULL, is_hibernating = 1 " +
        "WHERE current_window IS NOT NULL").run().changes;
      db.query("UPDATE agent_sessions SET wake_started_at = NULL " +
        "WHERE wake_started_at IS NOT NULL").run();
      const mark = db.query("UPDATE agent_sessions SET wake_started_at = ?1, " +
        "last_resume_error = NULL WHERE session_id = ?2");
      const now = new Date().toISOString();
      for (const r of candidates) {
        if (picked.length >= n) break;
        if (!existsSync(r.project_path)) {
          console.error("==> not resuming " + r.display_name + ": " + r.project_path + " is gone");
          continue;
        }
        mark.run(now, r.session_id);
        picked.push(r);
      }
      console.error("==> agentboard.db: hibernated " + stale +
        " session(s) whose windows died with the last pod");
    })();
  } catch (e) {
    console.error("    " + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
  // agentboard names its own Wake windows this way (createWindow: trim, then
  // whitespace to "-"), and its log poller copies the window name back into
  // display_name when it claims the window -- so anything else renames the
  // session. The id prefix only covers a row with no name at all.
  for (const r of picked) {
    const wname = (r.display_name || "").trim().replace(/\s+/g, "-") || r.session_id.split("-")[0];
    console.log([r.session_id, wname, r.project_path].join("\t"));
  }
'); then
  settled=1
else
  echo "==> WARNING: could not settle $$db; nothing resumed, and stale windows may show as \"can't find window\" (error above)" >&2
  resume_rows=""
fi

if [ -n "$$resume_rows" ]; then
(
  # agentboard creates its session shortly after start; give it a minute.
  i=0
  while [ "$$i" -lt 60 ]; do
    tmux has-session -t agentboard 2>/dev/null && break
    i=$((i + 1))
    sleep 1
  done
  tmux has-session -t agentboard 2>/dev/null || {
    echo "==> agentboard tmux session never appeared; not resuming"
    exit 0
  }

  printf '%s\n' "$$resume_rows" | while IFS="$$(printf '\t')" read -r id wname path; do
      [ -n "$$id" ] || continue
      cmd="claude --resume $$id"
      if [ -n "$$AGENTBOARD_RESUME_PROMPT" ]; then
        cmd="$$cmd \"$$AGENTBOARD_RESUME_PROMPT\""
      fi
      echo "==> resuming $$wname ($${id%%-*}) in $$path"
      # A login shell, so ./bashrc restores the mise shims on PATH. The
      # `claude` wrapper there passes arguments through untouched, so this
      # resumes in place instead of being rewritten into a new worktree.
      tmux new-window -d -t agentboard -n "$$wname" -c "$$path" \
        "exec bash -lc '$$cmd'"
    done
) &
elif [ "$$settled" -eq 1 ] && [ "$$resume_n" -gt 0 ]; then
  echo "==> no in-progress sessions to resume"
fi

# SWEEP ORPHANED PULUMI PROVIDERS.
#
# A `pulumi` CLI that dies abruptly -- a tool-call timeout, a killed pane, a
# Ctrl-C at the wrong moment -- leaves its provider plugins running. They are
# reparented to PID 1 and nothing ever stops them. On 2026-09-15 this pod held
# 77 orphaned `pulumi-resource-terraform-provider` trees (166 processes with
# their `terraform-provider-*` children, ~5.9G RSS, 1.6G of anonymous memory)
# from eleven runs one to two days earlier, with no pulumi running at all.
# That pushed the 12Gi cgroup to 11.1G, and Claude Code began killing every
# background task seconds after it started: "the system is running low on
# memory".
#
# The selector is exactly "provider-shaped AND parented to PID 1 AND older
# than 10 minutes". A provider serving a live run is a child of that run's
# `pulumi` CLI, never of PID 1, so it cannot match. Killing only a tree's root
# is enough: its child is reparented to PID 1 and matches on the next pass.
# Verified live before this was written, against a fake orphan and a fake
# same-named child of a live parent.
#
# `-f` matches the command line, which a zombie no longer has, so this never
# wastes signals on the defunct -- reaping those is tini's job, below.
(
  while sleep 300; do
    pkill -TERM -P 1 -O 600 -f '(^|/)(pulumi-resource-|terraform-provider-)' || true
  done
) &

# TINI AS PID 1, not agentboard. `exec agentboard` made node PID 1, and node
# does not reap children it did not spawn -- every process orphaned into this
# pod (the providers above, finished tmux panes, dead shells) became a zombie
# that lived until the pod restarted: ~150 of them after two days, 298 once
# the sweep above had run. `-g` forwards SIGTERM to agentboard's whole process
# group so a pod shutdown still reaches it.
echo "==> starting agentboard on :4040"
exec tini -g -- agentboard --port 4040 --hostname 0.0.0.0
