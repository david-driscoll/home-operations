/**
 * The `secrets/shared/*` reorganisation, as data.
 *
 * `shared/` was never meant to be flat. The vault repo's PLAN.md §A specifies a
 * grouped layout; what shipped was `op-to-bao`'s DEFAULT rule (`shared/<slug>`)
 * because `mapping.yaml` was reviewed for collisions rather than for grouping.
 * This module is the correction, reviewed and signed off in
 * `docs/openbao-shared-secrets-reorg.md` — that document is the rationale, this
 * file is the executable form of it.
 *
 * It is the SINGLE SOURCE OF TRUTH for two things that must not drift:
 *
 *   1. `index.ts` drives the KV writes from it.
 *   2. `rewrite.ts` rewrites every repo reference from it.
 *
 * A move whose consumers are not also rewritten is an outage, and a rewrite
 * with no move behind it is a 404 — so they read the same array.
 *
 * ## Phases exist because of one ACL fact
 *
 * `eso-<cluster>` grants read on `secrets/data/shared/*` and
 * `secrets/data/clusters/*` and NOTHING ELSE (vault repo,
 * `bootstrap/openbao/equestria-init.sh`, write_policies). A trailing `*` in an
 * OpenBao ACL is a prefix glob, so it spans `/` — which is why
 * `clusters/equestria/apps/n8n/credentials` needs no grant. But
 * `third-party-tokens/`, `apps/` and `docker/` are NEW TOP-LEVEL prefixes, and
 * every ExternalSecret pointed at one of them 403s until those policies are
 * widened. Widening them is an admin write, therefore a root ceremony.
 *
 * Pulumi is unaffected either way: the `pulumi` policy holds `secrets/*`. So do
 * the Dockge `.env` files — they are resolved by the Pulumi-side `vals` pass in
 * `DockgeLxc`, under that same AppRole, never on the host.
 *
 *   phase 1  cleanup      retire/delete. No consumers by definition. No ceremony.
 *   phase 2  clusters/    destinations under `clusters/`. Already in policy.
 *   phase 3  new-prefix   REQUIRES the widened eso-* policies first.
 *   phase 4  split        one blob into per-app paths. Destinations are all
 *                         `clusters/`, so no ceremony — but it depends on
 *                         phase 3 for the third-party fields it hands off.
 */

/** Where a retired secret is parked before it is destroyed for good. */
export const RETIRED_PREFIX = "retired";

export type Phase = 1 | 2 | 3 | 4;

export interface MoveEntry {
  kind: "move";
  phase: Phase;
  from: string;
  to: string;
  /**
   * Fields to strip from the destination after the copy verifies.
   *
   * `bao-move` copies verbatim, deliberately — it is the tool that must not
   * lose data. Pruning is a separate, additive step the driver does afterwards,
   * so a failure between the two leaves a destination with too MUCH in it
   * rather than too little.
   */
  dropFields?: string[];
  /** Why, or what else has to change with it. */
  note?: string;
}

export interface RetireEntry {
  kind: "retire";
  phase: Phase;
  from: string;
  note?: string;
}

export interface DeleteEntry {
  kind: "delete";
  phase: Phase;
  from: string;
  note?: string;
}

export interface SplitEntry {
  kind: "split";
  phase: Phase;
  from: string;
  /**
   * destination path -> which source field it takes, and what to call it there.
   *
   * `as` drops the app prefix the flat layout needed to disambiguate:
   * `prowlarr_apikey` at `clusters/equestria/apps/prowlarr/api-key` says
   * "prowlarr" twice and the path already said it once. What is left is the
   * KIND of credential, which is the part a consumer's `property:` should name.
   */
  into: Record<string, { field: string; as: string }>;
  /** Fields deliberately not carried anywhere. */
  drop: string[];
  note?: string;
}

export type Entry = MoveEntry | RetireEntry | DeleteEntry | SplitEntry;

/** `retired/<slug>` for a `shared/<slug>`. */
export function retiredPath(from: string): string {
  return `${RETIRED_PREFIX}/${from.replace(/^shared\//, "")}`;
}

// ---------------------------------------------------------------------------
// Phase 2 — destinations under `clusters/`, already inside the eso-* policies
// ---------------------------------------------------------------------------

const CLUSTER_MOVES: MoveEntry[] = [
  // §A equestria apps
  { kind: "move", phase: 2, from: "shared/freshrss-crypto-key", to: "clusters/equestria/apps/freshrss/crypto-key" },
  { kind: "move", phase: 2, from: "shared/karakeep-secret-key", to: "clusters/equestria/apps/karakeep/secret-key" },
  { kind: "move", phase: 2, from: "shared/searxng-secret-key", to: "clusters/equestria/apps/searxng/secret-key" },
  { kind: "move", phase: 2, from: "shared/tandoor-secret-key", to: "clusters/equestria/apps/tandoor/secret-key" },
  { kind: "move", phase: 2, from: "shared/n8n", to: "clusters/equestria/apps/n8n/credentials" },
  { kind: "move", phase: 2, from: "shared/tududi", to: "clusters/equestria/apps/tududi/keys" },
  { kind: "move", phase: 2, from: "shared/obsidian-sync", to: "clusters/equestria/apps/obsidian-sync/credentials" },
  { kind: "move", phase: 2, from: "shared/questarr-jwt-secret", to: "clusters/equestria/apps/questarr/jwt-secret" },
  { kind: "move", phase: 2, from: "shared/romm-secret-key", to: "clusters/equestria/apps/romm/secret-key" },
  { kind: "move", phase: 2, from: "shared/pinepods-admin", to: "clusters/equestria/apps/pinepods/admin" },
  { kind: "move", phase: 2, from: "shared/xcproxy", to: "clusters/equestria/apps/xcproxy/credentials" },
  { kind: "move", phase: 2, from: "shared/dispatcharr", to: "clusters/equestria/apps/dispatcharr/credentials" },
  { kind: "move", phase: 2, from: "shared/crowdsec-ui", to: "clusters/equestria/apps/crowdsec-ui/credentials" },
  { kind: "move", phase: 2, from: "shared/crowdsec-apikey", to: "clusters/equestria/apps/crowdsec/api-key" },
  { kind: "move", phase: 2, from: "shared/grafana-credentials", to: "clusters/equestria/apps/grafana/credentials" },
  { kind: "move", phase: 2, from: "shared/unifipoller", to: "clusters/equestria/apps/unpoller/credentials" },
  { kind: "move", phase: 2, from: "shared/meilisearch-secret-key", to: "clusters/equestria/apps/meilisearch/secret-key", note: "karakeep reads it too — both ExternalSecrets move together" },
  { kind: "move", phase: 2, from: "shared/spike-minio-access-token", to: "clusters/equestria/apps/postgres/minio-backup" },
  { kind: "move", phase: 2, from: "shared/thanos-s3-storage", to: "clusters/equestria/apps/thanos/s3", note: "the ONLY shared/ path Pulumi writes — stacks/home/index.ts baoKvSecret literal moves with it" },
  { kind: "move", phase: 2, from: "shared/rclone-web-ui", to: "clusters/equestria/apps/rclone/web-ui", note: "title-addressed: components/authentik/groups.ts asks for 'RClone Web UI'" },
  { kind: "move", phase: 2, from: "shared/eris-home-assistant-credentials", to: "clusters/equestria/apps/home-assistant/eris-credentials" },
  {
    kind: "move",
    phase: 2,
    from: "shared/eris-ssh-key",
    to: "clusters/equestria/apps/home-assistant/ssh-key",
    note: "the worksheet marked this RETIRE on the belief its only consumer left with SGC. It did not: namespace `stargate-command` runs ON equestria, and home-assistant-ssh is live, SecretSynced and mounted by the HelmRelease",
  },

  // §B dynacat
  { kind: "move", phase: 2, from: "shared/glance-secret-key", to: "clusters/equestria/apps/dynacat/glance-secret-key" },
  { kind: "move", phase: 2, from: "shared/immich-apikey", to: "clusters/equestria/apps/dynacat/immich-apikey" },
  { kind: "move", phase: 2, from: "shared/grafana-apikey", to: "clusters/equestria/apps/dynacat/grafana-apikey" },

  // §C dockge hosts
  { kind: "move", phase: 2, from: "shared/arcane", to: "clusters/celestia/apps/arcane/credentials" },
  { kind: "move", phase: 2, from: "shared/forgejo", to: "clusters/celestia/apps/forgejo/credentials", note: "docker/celestia/postgres/.env-local provisions the same password — both files move together" },
  { kind: "move", phase: 2, from: "shared/pdm-root", to: "clusters/celestia/apps/pdm/root" },
  { kind: "move", phase: 2, from: "shared/homelable", to: "clusters/celestia/apps/homelable/keys", note: "read cross-cluster by dynacat; eso-equestria already reads clusters/celestia/*" },

  // §E — the one cluster-scoped provider credential
  { kind: "move", phase: 2, from: "shared/eris-truenas-credentials", to: "clusters/spike/truenas-credentials", note: "spike is the TrueNAS host; `clusters/` here is a bucket, not a k8s cluster" },
];

// ---------------------------------------------------------------------------
// Phase 3 — NEW top-level prefixes. Blocked on the eso-* policy widening.
// ---------------------------------------------------------------------------

const NEW_PREFIX_MOVES: MoveEntry[] = [
  // third-party-tokens/ — credentials issued by someone else's service
  { kind: "move", phase: 3, from: "shared/steamgriddb", to: "third-party-tokens/steamgriddb/api-key" },
  { kind: "move", phase: 3, from: "shared/retro-achievements-api-key", to: "third-party-tokens/retro-achievements/api-key" },
  { kind: "move", phase: 3, from: "shared/eris-tailscale-oauth-operator", to: "third-party-tokens/tailscale/oauth-operator" },
  { kind: "move", phase: 3, from: "shared/tailscale-terraform-oauth-client", to: "third-party-tokens/tailscale/pulumi-oauth", note: "also read by the two archived cluster repos' .config/mise.toml" },
  { kind: "move", phase: 3, from: "shared/equestria-cloudflare-tunnel", to: "third-party-tokens/cloudflare/tunnel" },
  {
    kind: "move",
    phase: 3,
    from: "shared/cloudflare-driscoll-tech",
    to: "third-party-tokens/cloudflare/driscoll-tech",
    note: "THE CANARY. openbao-replica CANARY_PATH, bao-standby/restore.sh and the vault repo's RUNBOOK all name it — all three change in lockstep or break-glass verification fails",
  },
  { kind: "move", phase: 3, from: "shared/unifi-api-key-eris-cluster", to: "third-party-tokens/unifi/api-key" },
  { kind: "move", phase: 3, from: "shared/unifi-discord", to: "third-party-tokens/discord/unifi-webhook" },
  { kind: "move", phase: 3, from: "shared/docker-hub", to: "third-party-tokens/docker-hub/api-key" },
  { kind: "move", phase: 3, from: "shared/twitch-developer", to: "third-party-tokens/twitch/developer" },
  { kind: "move", phase: 3, from: "shared/tmdb-api-key", to: "third-party-tokens/tmdb/api-key" },
  { kind: "move", phase: 3, from: "shared/gatus-pushover-key", to: "third-party-tokens/pushover/gatus" },
  { kind: "move", phase: 3, from: "shared/pushover", to: "third-party-tokens/pushover/driscoll-alerts" },
  {
    kind: "move",
    phase: 3,
    from: "shared/equestria-pushover-key",
    to: "third-party-tokens/pushover/alert-manager",
    note: "consumers spell it `shared/${CLUSTER_CNAME}-pushover-key`; the destination is a FIXED path, so the substitution disappears",
  },
  { kind: "move", phase: 3, from: "shared/authentik-plex-source", to: "third-party-tokens/plex/authentik-source" },
  { kind: "move", phase: 3, from: "shared/eris-1password-connect-access-token", to: "third-party-tokens/onepassword/eris-connect", note: "bootstrap: .config/mise.toml resolves it before Pulumi starts" },
  { kind: "move", phase: 3, from: "shared/github-actions-runner-david-driscoll", to: "third-party-tokens/github/actions-runner/david-driscoll" },
  { kind: "move", phase: 3, from: "shared/github-actions-runner-littles-tech", to: "third-party-tokens/github/actions-runner/littles-tech" },
  { kind: "move", phase: 3, from: "shared/github-david-driscoll-vault-deploy-key", to: "third-party-tokens/github/david-driscoll/vault/deploy-key" },
  { kind: "move", phase: 3, from: "shared/david-driscoll-github-app", to: "third-party-tokens/github/david-driscoll/github-app", note: "unreferenced in-repo; the ARC runners read the actions-runner path instead" },
  { kind: "move", phase: 3, from: "shared/littlestech-github-app", to: "third-party-tokens/github/littlestech/github-app", note: "unreferenced in-repo" },

  // apps/ — estate infrastructure this repo operates itself
  { kind: "move", phase: 3, from: "shared/technitium-password", to: "apps/technitium/admin", note: "read by docker/_common/technitium on every dockge host AND by equestria's technitium — one value, deliberately" },
  { kind: "move", phase: 3, from: "shared/technitium-apikey", to: "apps/technitium/api-key" },
  { kind: "move", phase: 3, from: "shared/technitium-tsig-key", to: "apps/technitium/tsig" },
  {
    kind: "move",
    phase: 3,
    from: "shared/proxmox",
    to: "apps/proxmox/root",
    dropFields: ["view-inputEl"],
    note: "`view-inputEl` is browser-autofill debris that a 1Password web form saved into the item; nothing reads it",
  },
  { kind: "move", phase: 3, from: "shared/proxmox-apikey", to: "apps/proxmox/api-key" },
  { kind: "move", phase: 3, from: "shared/alpha-site-proxmox-apikey", to: "apps/proxmox/alpha-site/api-key", note: "alpha-site's own Proxmox host, not the main one — stacks/home reads both" },
  { kind: "move", phase: 3, from: "shared/minio-root-user", to: "apps/minio/root", note: "bootstrap; also read by the vault repo's .config/mise.toml" },
  { kind: "move", phase: 3, from: "shared/pulumi-passphrase", to: "apps/pulumi/passphrase", note: "bootstrap; also read by the vault repo's .config/mise.toml" },
  { kind: "move", phase: 3, from: "shared/volsync-password", to: "apps/volsync/password" },

  // docker/ — things every Dockge host runs
  { kind: "move", phase: 3, from: "shared/docker-postgres", to: "docker/apps/postgres/dockge-superuser" },
  { kind: "move", phase: 3, from: "shared/neo4j-password", to: "docker/apps/neo4j/password" },
  { kind: "move", phase: 3, from: "shared/rclone-sftp-key", to: "docker/apps/rclone/sftp" },
  { kind: "move", phase: 3, from: "shared/dockge-credential", to: "docker/apps/dockge/credential" },
];

// ---------------------------------------------------------------------------
// Phase 4 — the one blob that becomes many paths
// ---------------------------------------------------------------------------

const SPLITS: SplitEntry[] = [
  {
    kind: "split",
    phase: 4,
    from: "shared/media-management-secrets",
    note:
      "19 fields in one path, fanned out to six consumers. Each destination gets a single `credential` field. " +
      "`spike-management-credentials` is rebuilt from the pieces so the five *arr HelmReleases keep their existing secretKeyRefs.",
    into: {
      "clusters/equestria/apps/prowlarr/api-key": { field: "prowlarr_apikey", as: "apikey" },
      "clusters/equestria/apps/radarr/api-key": { field: "radarr_apikey", as: "apikey" },
      "clusters/equestria/apps/sonarr/api-key": { field: "sonarr_apikey", as: "apikey" },
      "clusters/equestria/apps/lidarr/api-key": { field: "lidarr_apikey", as: "apikey" },
      "clusters/equestria/apps/bazarr/api-key": { field: "bazarr_apikey", as: "apikey" },
      "clusters/equestria/apps/mylar/api-key": { field: "mylar_apikey", as: "apikey" },
      "clusters/equestria/apps/jellyseerr/api-key": { field: "jellyseerr_apikey", as: "apikey" },
      "clusters/equestria/apps/seerr/api-key": { field: "seerr_apikey", as: "apikey" },
      "clusters/equestria/apps/watchstate/api-key": { field: "watchstate_apikey", as: "apikey" },
      "clusters/equestria/apps/sabnzbd/api-key": { field: "sabnzbd_apikey", as: "apikey" },
      "third-party-tokens/omdb/api-key": { field: "omdb_apikey", as: "apikey" },
      "third-party-tokens/mdblist/api-key": { field: "mdblist_apikey", as: "apikey" },
      // `*_token` keeps `token`, by the same rule: strip the app, keep the kind.
      "clusters/equestria/apps/tautulli/api-key": { field: "tautulli_token", as: "token" },
      "clusters/equestria/apps/jellyfin/api-key": { field: "jellyfin_token", as: "token" },
      "clusters/equestria/apps/emby/api-key": { field: "emby_token", as: "token" },
      "clusters/equestria/apps/plex/token": { field: "plex_token", as: "token" },
      "retired/media-management/nzbget": { field: "nzbget_restricted_password", as: "restricted_password" },
    },
    // `tmdb_apikey` duplicates third-party-tokens/tmdb/api-key (same value,
    // two homes, no way to tell which one a rotation updated). `threadfin_token`
    // names an app that does not exist in this repo.
    drop: ["tmdb_apikey", "threadfin_token"],
  },
];

// ---------------------------------------------------------------------------
// Phase 1 — cleanup
// ---------------------------------------------------------------------------

/**
 * Retired: parked under `retired/` rather than destroyed.
 *
 * These have no reference anywhere in this repo and none in the vault repo.
 * They are all still at version 1 with `updated_time` 2026-08-08 — written once
 * by `op-to-bao --apply` and never read since. Parking rather than deleting
 * costs nothing and means a wrong call here is a `bao-move` away from being
 * undone; a destroy is not.
 */
const RETIRE: RetireEntry[] = [
  // Retired applications
  "alpha-site-chrysalis",
  "authelia-database",
  "claude-oauth-token",
  "cloudflare-chrysalis-tunnel",
  "cloudflare-tulip-tunnel",
  "cloudflare-tunnel",
  "discord-oauth2",
  "docktail-credentials",
  "donetick-secret",
  "duplicati-password",
  "dynacat-login",
  "eris-library-tunnel-read-token",
  "eris-trakt-tv",
  "garage-password",
  "ggrequestz-secret-key",
  "harbor-admin",
  "homarr-api-key",
  "homarr-database-user",
  "homarr-encryption-key",
  "homepage-secrets",
  "keeper-secret-key",
  "lldap-admin",
  "lldap-authentik",
  "lldap-database",
  "mend-token",
  "n8n-api-key",
  "network-ups-tools",
  "opencloud-admin",
  "outline-secret-key",
  "peppermint-database-user",
  "romm",
  "seafile-admin",
  "seafile-config",
  "steam-apikey",
  "tivi-login",
  "tmdb-read-only",
  "tokra",
  "tvheadend",
  "uptime-kuma",
  "vikunja-api-token",
  "vikunja-database-user",
  "warpgate",
  "zitadel-master-key",
  "zitadel-super-user",
  // Superseded, confirmed against live consumers
  "adguard-home", //            its only consumer, docker/alpha-site/prometheus-exporters, is deleted in this change
  "authentik-token", //         clusters/alpha-site/apps/authentik/token is the live path
  "authentik-admin", //         -> clusters/alpha-site/apps/authentik/admin
  "authentik-database-user", // -> clusters/alpha-site/apps/authentik/postgres
  "authentik-secret-key", //    -> clusters/alpha-site/apps/authentik/secret-key
  "eris-github-access-token", //          superseded by the reflected kube-system/github-token
  "github-personal-access-token", //      superseded by the reflected kube-system/github-token
  "equestria-age-key", //       public half only; the private half lives in vault/bootstrap/
  "sgc-age-key",
  "equestria-github-deploy-key",
  "github-deploy-key",
  "equestria-github-web-hook-token",
  "equestria-postgres-superuser",
  "equestria-postgres-user",
  "postgres",
  "postgres-user-login",
  "minio-access-key",
  "spike-private-key",
  "celestia-pbs-backup-user", // extracted by dynacat but never templated
  "luna-pbs-backup-user", //     same
].map(slug => ({ kind: "retire" as const, phase: 1 as const, from: `shared/${slug}` }));

/**
 * Destroyed outright.
 *
 * SGC-era paths go here rather than to `retired/` because piece 22 is deleting
 * the cluster they describe — parking them would be parking a description of
 * something that will not exist. The rest are empty, superseded, or were
 * verified dead at the console.
 */
const DELETE: DeleteEntry[] = [
  "sgc-authentik-outpost",
  "sgc-definition-crds",
  "sgc-kuma-sync",
  "sgc-postgres-postgres-user",
  "sgc-postgres-superuser",
  "sgc-postgres-user",
  "minio-sgc-postgres",
  "stargate-command-cloudflare-tunnel",
  "stargate-command-github-deploy-key",
  "stargate-command-github-web-hook-token",
  "stargate-command-pushover-key",
  "equestria-authentik-outpost",
  "equestria-definition-crds",
  "equestria-kuma-sync",
  "tailscale-idp-client-credentials",
  "technitium-k8s-dns-authkey",
  "eris-1password-connect-credentials-file",
].map(slug => ({ kind: "delete" as const, phase: 1 as const, from: `shared/${slug}` }));

// ---------------------------------------------------------------------------

export const PLAN: Entry[] = [...RETIRE, ...DELETE, ...CLUSTER_MOVES, ...NEW_PREFIX_MOVES, ...SPLITS];

/** Every `shared/<slug>` this plan consumes, for the "did we miss one" check. */
export function sources(): string[] {
  return PLAN.map(e => e.from).sort();
}

/**
 * `old path -> new path` for every reference a repo file can contain.
 *
 * Retired and deleted paths are absent on purpose: there is no replacement
 * string for them, and a reference to one is a bug the rewrite must not paper
 * over. Splits are absent for the same reason — a field-level fan-out cannot be
 * expressed as a string substitution.
 */
export function rewrites(): Map<string, string> {
  return new Map(PLAN.filter((e): e is MoveEntry => e.kind === "move").map(e => [e.from, e.to]));
}
