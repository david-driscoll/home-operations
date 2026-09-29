/**
 * Which Backrest plans and repos a BackupPlanDirector run owns, so the next run
 * can remove the ones it stopped emitting.
 *
 * WHY THIS EXISTS. `updateBackrestConfiguration` MERGES its plans and repos
 * into the config.json it reads back from the host: it adds and updates, and it
 * has no notion of one going away. A plan the inventory stops emitting -- a
 * stack that lost its `stacks-data` mount, a stack that was opted out, a plan
 * that moved to another host -- therefore stays in config.json forever, still
 * scheduled, still running its hooks, still failing. On 2026-09-29 four of them
 * were doing exactly that on celestia every night (the three `*-dockge-docker-
 * prune` plans and `alpha-site-dockge-pecron-monitor`), each pushing its error
 * to a Gatus endpoint that no longer existed, so nothing alerted.
 *
 * The ledger is the list of ids the director wrote last time, kept next to
 * config.json on the host. An id that was in the ledger and is not emitted now
 * is the director's own leftover, and is removed. Anything the director never
 * recorded -- a plan or repo a human added in Backrest's UI -- is never
 * touched. That asymmetry is the point: the failure this can cause is leaving
 * something behind, never deleting something it did not create.
 *
 * Removing a repo from config.json does not delete its data. The restic
 * repository stays on disk under /data/backup/<id>/; Backrest just stops
 * scheduling prune/check against it and stops listing it. That matters for
 * docs/plans/host-owned-backups.md phase 1: when a plan moves to the host that
 * owns the stack, celestia's copy of the repo becomes a copy-job mirror, and a
 * prune from celestia's Backrest would be rewriting a repo another host now
 * writes.
 *
 * Everything here is pure and synchronous so it can be unit-tested without a
 * Pulumi runtime or a host (backrestLedger.test.ts). The SSH read, the file
 * write and the ordering between them live in BackupPlanDirector.
 */

/** The file's shape on the host. `version` only changes if the shape does. */
export interface BackrestLedger {
  version: 1;
  plans: string[];
  repos: string[];
}

/**
 * Where the ledger lives. Next to config.json, in the directory the backrest
 * container mounts as /config: Backrest reads only config.json there, and the
 * backrest stack is in BACKUP_OPT_OUT_STACKS, so nothing snapshots it either.
 */
export const BACKREST_LEDGER_PATH = "/opt/stacks-data/backrest/config/pulumi-ledger.json";

/**
 * What a host with no ledger yet is treated as having emitted before.
 *
 * Every host starts without a ledger, so on its own the ledger could only ever
 * clean up leftovers created AFTER it shipped. These are the ones that already
 * existed, found in celestia's Backrest log for 2026-09-27 → 09-29:
 *
 *   *-dockge-docker-prune  docker-prune mounts no stacks-data and stopped
 *                          qualifying in #1890; the plans stayed and fail
 *                          nightly with "path ... does not exist".
 *   alpha-site-dockge-pecron-monitor
 *                          opted out in BACKUP_OPT_OUT_STACKS; same failure.
 *   alpha-site-dockge-garage-backup
 *                          opted out alongside this change: it is the
 *                          off-site Pulumi-state Garage, and a file copy of its
 *                          live LMDB is torn (the reason `garage` is opted out).
 *                          Seeded rather than left to the ledger because the
 *                          backups stack may drop it from the inventory before
 *                          any director run has recorded it.
 *
 * Their repos hold nothing worth browsing (the first four never produced a
 * snapshot), so the repo entries go too. The data, if any, stays on disk.
 *
 * Inert once every host has written a ledger: the seed is only consulted when
 * the file is missing, and none of these ids will be emitted again. Delete it
 * in any later change.
 */
export const BACKREST_LEDGER_SEED: BackrestLedger = {
  version: 1,
  plans: ["alpha-site-dockge-docker-prune", "alpha-site-dockge-garage-backup", "alpha-site-dockge-pecron-monitor", "celestia-dockge-docker-prune", "luna-dockge-docker-prune"],
  repos: ["alpha-site-dockge-docker-prune", "alpha-site-dockge-garage-backup", "alpha-site-dockge-pecron-monitor", "celestia-dockge-docker-prune", "luna-dockge-docker-prune"],
};

/**
 * Parses the ledger file as read over SSH.
 *
 * An empty string is "no ledger yet" (the file is missing: `cat` printed
 * nothing). Anything else that is not a well-formed ledger is reported as a
 * `problem` rather than thrown, and the caller falls back to the seed. That is
 * the fail-safe direction: a corrupt ledger can only make the director remove
 * LESS -- leftovers it would have cleaned up stay until a human notices -- and
 * never makes it remove something it should not.
 */
export function parseBackrestLedger(text: string): { ledger?: BackrestLedger; problem?: string } {
  if (text.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { problem: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  const candidate = parsed as Partial<BackrestLedger> | null;
  if (!candidate || typeof candidate !== "object") return { problem: "not a JSON object" };
  if (candidate.version !== 1) return { problem: `unsupported version ${JSON.stringify(candidate.version)}` };
  if (!isStringArray(candidate.plans) || !isStringArray(candidate.repos)) return { problem: "`plans` and `repos` must both be arrays of strings" };

  return { ledger: { version: 1, plans: candidate.plans, repos: candidate.repos } };
}

/**
 * The ledger to write after this run: exactly what was emitted, sorted and
 * de-duplicated so an unchanged set renders byte-identical output.
 * copyFileToRemote keys its resource on the content hash, and the plan order
 * upstream comes from namespace and directory listings that are not guaranteed
 * stable.
 */
export function renderBackrestLedger(emitted: { plans: readonly string[]; repos: readonly string[] }): string {
  const ledger: BackrestLedger = {
    version: 1,
    plans: sortedUnique(emitted.plans),
    repos: sortedUnique(emitted.repos),
  };
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

export interface LedgerRemovals {
  /** Plan ids to drop from config.json. */
  plans: string[];
  /** Repo ids to drop from config.json. */
  repos: string[];
  /** Repos the ledger would have dropped, kept because a remaining plan still uses them. */
  keptRepos: { id: string; usedBy: string[] }[];
}

/**
 * What to remove from a host's config.json: the ids the previous run emitted
 * (or the seed, when there is no previous run) that this run does not.
 *
 * Throws, rather than removing, when a host that emitted plans or repos last
 * time emits none of that kind now. An empty set is far more likely a broken
 * inventory read than a real decision to back nothing up, and acting on it
 * would unschedule every backup on the host at once -- the failure with no
 * symptom until a restore, the same reasoning `getBackupPlans` and
 * `dockerHostDirectory` use. Doing it on purpose means deleting the ledger file
 * first. The seed never trips this: it is only a list of known leftovers.
 */
export function planLedgerRemovals(args: {
  previous: BackrestLedger | undefined;
  emitted: { plans: readonly string[]; repos: readonly string[] };
  config: { plans: readonly { id?: string; repo?: string }[]; repos: readonly { id?: string }[] };
  host: string;
}): LedgerRemovals {
  const { previous, emitted, config, host } = args;

  if (previous) {
    for (const kind of ["plans", "repos"] as const) {
      if (previous[kind].length > 0 && emitted[kind].length === 0) {
        throw new Error(
          `The backup director for ${host} emitted no ${kind} this run, but its ledger (${BACKREST_LEDGER_PATH}) records ${previous[kind].length} from the last one. Refusing to remove all of them: an empty set is far more likely a broken inventory read than a real change. If the host really should have no Backrest ${kind}, delete the ledger file and run again.`,
        );
      }
    }
  }

  const owned = previous ?? BACKREST_LEDGER_SEED;
  const emittedPlans = new Set(emitted.plans);
  const emittedRepos = new Set(emitted.repos);
  const ownedPlans = new Set(owned.plans);
  const ownedRepos = new Set(owned.repos);

  const plans = sortedUnique(config.plans.map(p => p.id ?? "").filter(id => id !== "" && ownedPlans.has(id) && !emittedPlans.has(id)));
  const removedPlans = new Set(plans);

  // A repo can only go when nothing that stays behind still points at it -- a
  // plan a human added in the UI against a repo the director manages, say.
  // Removing the repo out from under it would leave Backrest with a plan it
  // cannot run.
  const usersByRepo = new Map<string, string[]>();
  for (const plan of config.plans) {
    if (!plan.repo || !plan.id || removedPlans.has(plan.id)) continue;
    usersByRepo.set(plan.repo, [...(usersByRepo.get(plan.repo) ?? []), plan.id]);
  }

  const repos: string[] = [];
  const keptRepos: LedgerRemovals["keptRepos"] = [];
  for (const id of sortedUnique(config.repos.map(r => r.id ?? "").filter(id => id !== "" && ownedRepos.has(id) && !emittedRepos.has(id)))) {
    const usedBy = usersByRepo.get(id);
    if (usedBy?.length) {
      keptRepos.push({ id, usedBy: usedBy.sort() });
    } else {
      repos.push(id);
    }
  }

  return { plans, repos, keptRepos };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === "string");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
