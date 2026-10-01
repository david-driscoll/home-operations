/**
 * A Docker host's backrest repos in the geo Garage (docs/plans/host-owned-backups.md
 * §C2): where the host finds its key, how it reaches Garage, and how a repo is
 * addressed there.
 *
 * The key is a file. stacks/system (garage.ts) writes it; a Garage-backed repo
 * names it in its env, so restic's credential chain reads it (minio-go's
 * FileAWSCredentials) and no key lands in config.json or in Backrest's UI. The
 * directory is under /opt/stacks-data, which the backrest container mounts
 * read-only at the same path (docker/_common/backrest/compose.yaml), so the
 * path is the same inside and out. The file is root's, mode 600: backrest runs
 * as uid 0.
 */
export const BACKREST_CREDENTIALS_DIR = "/opt/stacks-data/backrest";
export const BACKREST_CREDENTIALS_FILE = "aws-credentials";

/** The profile in that file. */
export const BACKREST_CREDENTIALS_PROFILE = "backrest";

/** SigV4 region; must match s3_api.s3_region in docker/_common/garage/garage.toml. */
const GARAGE_REGION = "garage";

/**
 * Where a host's backrest reaches Garage. A garage host uses the node on its own
 * container network. alpha-site has no node and reaches celestia's over the
 * tailnet, the path its garage-backup loop already takes (the `garage-mesh`
 * grant, tag:dockge to tag:dockge on 3900). The garage-s3 VIP would follow
 * whichever node is up, but no grant lets a dockge host reach it.
 */
export function backrestGarageEndpoint(host: string, tailscaleDomain: string): string {
  return host === "alpha-site" ? `http://dockge-celestia.${tailscaleDomain}:3900` : "http://garage:3900";
}

/** A host's bucket: one per host, every repo of that host under its own prefix. */
export function backrestGarageBucket(host: string): string {
  return `backrest-${host}`;
}

/** The restic URI of a repo in Garage: the host's bucket, with the repo id as its prefix. */
export function backrestGarageRepoUri(repo: { endpoint: string; bucket: string }, repoId: string): string {
  return `s3:${repo.endpoint.replace(/\/+$/, "")}/${repo.bucket}/${repoId}`;
}

/** The env every Garage-backed repo runs restic with: the key file and its profile. */
export const BACKREST_GARAGE_REPO_ENV: readonly string[] = [`AWS_SHARED_CREDENTIALS_FILE=${BACKREST_CREDENTIALS_DIR}/${BACKREST_CREDENTIALS_FILE}`, `AWS_PROFILE=${BACKREST_CREDENTIALS_PROFILE}`];

/**
 * The restic flags every Garage-backed repo runs with. Garage signs as its own
 * region, and path-style lookup is the only style it serves without a wildcard
 * certificate. Backrest shell-splits each entry (internal/orchestrator/repo),
 * so `-o value` stays one option.
 */
export const BACKREST_GARAGE_REPO_FLAGS: readonly string[] = [`-o s3.region=${GARAGE_REGION}`, "-o s3.bucket-lookup=path"];
