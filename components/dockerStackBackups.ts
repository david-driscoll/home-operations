import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unique } from "moderndash";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dockerPath = resolve(__dirname, "../docker");

/**
 * Which docker stacks get a backup, resolved from the repo working tree rather
 * than from anything on the hosts.
 *
 * The rule: a stack is backed up when the compose.yaml that DockgeLxc would
 * actually deploy for it mentions `stacks-data`. That string is the only thing
 * that puts persistent state under `/opt/stacks-data/<stack>/`, so a compose
 * without it has nothing on disk worth snapshotting — the stack's directory
 * exists (createStack mkdir -p's it unconditionally) but stays empty.
 *
 * This deliberately mirrors DockgeLxc's own stack resolution, and has to keep
 * mirroring it: same union of `_common/` and `<host>/`, same `.ignore`
 * suppression, same host-file-wins merge. A stack this module thinks is
 * deployed but isn't produces a plan whose pre-sync pulls an empty directory
 * and whose Gatus heartbeat then goes red forever.
 *
 * KNOWN LIMITATION: the rule proves a stack DECLARES a stacks-data path, not
 * that anything is ever written there. A stack that mounts one and stays empty
 * gets a plan that fails nightly on a staging directory rclone never created
 * (see `pecron-monitor` in BACKUP_OPT_OUT_STACKS). This runs at Pulumi time
 * against the repo, so it cannot check the hosts; the compensating control is
 * that such a plan fails LOUDLY and reports the reason to Gatus, rather than
 * reporting a green backup of nothing.
 */
export interface DockerStackBackupTarget {
  /** Stack directory name — also its `/opt/stacks-data/<stack>/` directory and the suffix of the plan id. */
  stack: string;
  /** Repo-relative path of the compose.yaml that qualified it. Diagnostics only. */
  composePath: string;
  /** rclone `--exclude` patterns, rooted at `/opt/stacks-data/<stack>/`. */
  excludes: string[];
}

/**
 * Stacks that are never backed up even though their compose does reference
 * `stacks-data`. Each of these holds the credentials or transport for the
 * backup system itself:
 *
 *   backrest     `config/config.json` is every repo's restic password, so
 *                snapshotting it into one of those repos makes the archive its
 *                own key escrow. `ssh/` is the pre-sync client key.
 *   backups      `keys/` is the SFTP client key the copy jobs authenticate with.
 *   rclone-sftp  `keys/` is the SFTP host key plus authorized_keys — the thing
 *                that decides who may read every other host's stack data.
 *
 * Everything else the old whole-host exclude list named (authentik-outpost,
 * autoheal, docker-socket-proxy, prometheus, zot) is already skipped by the
 * `stacks-data` rule itself; it keeps its state under `/opt/stacks/<stack>/`
 * with relative compose paths. Those are NOT restated here — restating them
 * would freeze the decision even if one later grew real state.
 */
export const BACKUP_OPT_OUT_STACKS: ReadonlySet<string> = new Set([
  "backrest",
  "backups",
  "rclone-sftp",
  // Not a credential case -- an EMPTY one, and the reason this list needs a
  // second category. pecron-monitor mounts `/opt/stacks-data/${APP}/data` and
  // never writes to it: the source is 0 files over SFTP. `rclone sync` of an
  // empty source creates no destination directory, so restic then fails the
  // plan with "path /data/staging/<host>/pecron-monitor/ does not exist" --
  // every night, forever, with a red heartbeat that looks like a broken backup
  // rather than a stack with nothing to back up.
  //
  // A DECLARED MOUNT IS NOT DATA. That is the limitation of the `stacks-data`
  // rule below, found the hard way on 2026-08-23/24. The rule reads the repo,
  // so it cannot know what a host actually has on disk; a compose can name a
  // path the container never populates. Remove this entry if pecron-monitor
  // ever grows real state.
  "pecron-monitor",
  // Third category: contents that are already backups. The garage stack IS the
  // offsite postgres backup store — every object in it exists on three hosts
  // by replication_factor, and the dumps it mirrors are also restic-snapshotted
  // from each host's postgres stack plan. Backing it up again would triple the
  // estate's largest dataset for no additional restore path. Its stacks-data
  // footprint is the LMDB metadata directory, whose file-level copy is torn
  // anyway; metadata_auto_snapshot_interval in garage.toml is the local
  // recovery mechanism for that (docs/garage-offsite-s3.md).
  "garage",
]);

/**
 * Sub-paths inside a stack that the pre-sync must not copy, rooted at that
 * stack's `/opt/stacks-data/<stack>/`.
 *
 * The `/**` suffix is load-bearing and is the fix for a live bug. rclone
 * matches a pattern without a trailing `/` or `/**` against FILES ONLY, so the
 * old host-rooted list ("/postgres/pgdata", "/technitium/config/stats", …)
 * excluded nothing at all — verified against rclone 1.74: `rclone sync
 * --exclude '/postgres/pgdata'` still copies `postgres/pgdata/base.dat`. Both
 * entries below were therefore being copied every night despite the comments
 * saying otherwise. Do not drop the glob.
 */
export const BACKUP_STACK_EXCLUDES: Readonly<Record<string, string[]>> = {
  // The shared Postgres live data directory (docker/_common/postgres). A
  // file-level copy of a running cluster is torn, not crash-consistent: the
  // data files and the WAL are captured at different instants, so the snapshot
  // can restore to nothing while still looking like a successful backup. That
  // failure is silent until someone needs it. The restorable artifact is the
  // nightly pg_dump output in `dumps/`, which is NOT excluded and is what this
  // plan actually protects. Do not remove this line without replacing it with a
  // proper WAL-archiving setup.
  postgres: ["/pgdata/**"],
  // Technitium's hourly query-statistics files (1103 of them, 222 MB on
  // celestia). The current hour's .stat is appended to for the whole hour, so
  // rclone reliably copies it mid-write and fails the transfer with "corrupted
  // on transfer: md5 hashes differ" — which aborts the ON_ERROR_FATAL pre-sync
  // hook and takes the plan's snapshot with it. Pure telemetry for the DNS
  // dashboards; nothing is reconstructed from it.
  // Second rotation-race exclude, same failure signature as stats, different
  // files. The tailscale sidecar's logs cycle between written and truncated
  // to zero (tailscaled.log1/2.txt), so the sftp server hashes content and
  // then reads an empty file. Reproduced live on skystar 2026-08-26 with the
  // exact presync command: `corrupted on transfer: md5 hashes differ src
  // fd44ef… vs dst d41d8cd98f00b204e9800998ecf8427e` — and that dst IS the
  // md5 of the empty string. rclone retries 3x and loses the race 3x, the
  // ON_ERROR_FATAL presync takes the snapshot with it. In practice only the
  // slow off-site link loses the race (celestia's pull of skystar's
  // technitium failed daily at 15:24 from 2026-08-24) but the race exists on
  // every stack that runs the sidecar; add the same pattern per-stack if one
  // of them starts failing with an empty-string dst hash.
  technitium: ["/config/stats/**", "/tailscale/tailscaled.log*"],

  // Gatus's live SQLite (data.db + -wal/-shm). Same argument as the postgres
  // pgdata exclusion above, at smaller stakes: a file-level copy of a live
  // SQLite database is torn, not crash-consistent — and because Gatus writes
  // every probe cycle, the transfer also randomly loses the changed-during-
  // transfer race and fails the presync outright (alpha-site-dockge-uptime,
  // first lost 2026-08-26 15:24; probabilistic, unlike technitium's
  // deterministic log race). What this backup actually protects is config/,
  // which is Pulumi-generated anyway; the check history is a monitoring
  // cache nobody restores. If history ever matters, the fix is a sqlite
  // .backup dump presync — the pg_dump pattern — not removing this line.
  uptime: ["/data/data.db*"],
};

/**
 * The `docker/<dir>` directory a dockge instance deploys from.
 *
 * `getDockgeInstances()` hands back the DockgeLxc ComponentResource name
 * ("celestia-dockge"), while `docker/` is keyed by `ProxmoxHost.name`
 * ("celestia"). Every instance in the estate is named `<host>-dockge`, so the
 * suffix is the mapping — but it is a convention, not a guarantee, which is why
 * the directory is checked rather than assumed.
 *
 * This throws instead of skipping. A dockge host with no resolvable directory
 * would otherwise contribute zero plans and the backups stack would succeed
 * having quietly stopped backing that host up — the failure mode with no
 * symptom until a restore is needed, same reasoning as `getBackupPlans`.
 */
export function dockerHostDirectory(dockgeName: string): string {
  const hostDir = dockgeName.replace(/-dockge$/, "");
  if (!existsSync(resolve(dockerPath, hostDir))) {
    throw new Error(
      `Dockge instance '${dockgeName}' maps to docker/${hostDir}/, which does not exist. Either the host's stack directory is missing or the instance is no longer named '<host>-dockge' — backups cannot enumerate its stacks.`,
    );
  }
  return hostDir;
}

/**
 * Whether `hostDir` actually deploys `stack`, by the same resolution DockgeLxc
 * uses: present in `_common/` or the host directory, and not suppressed by an
 * `.ignore` in either. stacks/backups uses this to register the garage-sync
 * heartbeats only for the hosts that run a garage node — alpha-site carries
 * docker/alpha-site/garage/.ignore, and an endpoint registered for a host
 * that never pushes would be permanently red by construction.
 */
export function hostHasActiveStack(hostDir: string, stack: string): boolean {
  const commonStack = resolve(dockerPath, "_common", stack);
  const hostStack = resolve(dockerPath, hostDir, stack);
  if (!existsSync(commonStack) && !existsSync(hostStack)) return false;
  return !existsSync(resolve(commonStack, ".ignore")) && !existsSync(resolve(hostStack, ".ignore"));
}

/** Every stack on `hostDir` that qualifies for its own backup plan, sorted by stack name. */
export function listStackBackupTargets(hostDir: string): DockerStackBackupTarget[] {
  const commonPath = resolve(dockerPath, "_common");
  const hostPath = resolve(dockerPath, hostDir);

  const stackNames = unique([...readdirSync(hostPath), ...readdirSync(commonPath)])
    .filter(name => name !== ".keep" && !name.startsWith("."))
    .sort();

  const targets: DockerStackBackupTarget[] = [];
  for (const stack of stackNames) {
    // `.ignore` in either location suppresses the stack entirely — DockgeLxc
    // never deploys it, so there is nothing on the host to back up.
    if (existsSync(resolve(commonPath, stack, ".ignore")) || existsSync(resolve(hostPath, stack, ".ignore"))) continue;

    // Host file wins wholesale, exactly as getStackFiles merges them: the
    // per-host compose.yaml replaces the _common one rather than layering on it.
    const hostCompose = resolve(hostPath, stack, "compose.yaml");
    const commonCompose = resolve(commonPath, stack, "compose.yaml");
    const composeFile = existsSync(hostCompose) ? hostCompose : existsSync(commonCompose) ? commonCompose : undefined;
    if (!composeFile) continue;

    // Matched before ${APP}/${STACK_NAME} substitution, which is fine: the
    // literal "stacks-data" is present either way ("/opt/stacks-data/${APP}/…").
    if (!readFileSync(composeFile, "utf-8").includes("stacks-data")) continue;

    if (BACKUP_OPT_OUT_STACKS.has(stack)) continue;

    targets.push({
      stack,
      composePath: relative(dockerPath, composeFile),
      excludes: BACKUP_STACK_EXCLUDES[stack] ?? [],
    });
  }

  return targets;
}
