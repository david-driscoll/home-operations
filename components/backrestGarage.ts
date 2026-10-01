/**
 * Where a Docker host's backrest finds its Garage key (docs/plans/host-owned-backups.md
 * §C2). stacks/system (garage.ts) writes the file; a Garage-backed repo names
 * it in its env, so restic's credential chain reads it and no key lands in
 * config.json or in Backrest's UI.
 *
 * The directory is under /opt/stacks-data, which the backrest container mounts
 * read-only at the same path (docker/_common/backrest/compose.yaml), so the
 * path is the same inside and out. The file is root's, mode 600: backrest runs
 * as uid 0.
 */
export const BACKREST_CREDENTIALS_DIR = "/opt/stacks-data/backrest";
export const BACKREST_CREDENTIALS_FILE = "aws-credentials";

/** The profile in that file. */
export const BACKREST_CREDENTIALS_PROFILE = "backrest";
