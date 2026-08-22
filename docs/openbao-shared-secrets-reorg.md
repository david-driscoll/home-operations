# OpenBao `secrets/shared/*` reorganisation — worksheet

> **Status: reviewed and encoded.** The `✎ Your call` column is filled in and
> is now the decision of record. It is implemented in
> [`scripts/bao-reorg/plan.ts`](../scripts/bao-reorg/plan.ts) — 146 entries, one
> per live path — with [`scripts/bao-reorg/README.md`](../scripts/bao-reorg/README.md)
> as the operating instructions. **Nothing has moved in OpenBao yet**: the repo
> references are rewritten and the plan is executable, but no phase has run.
>
> This file stays as the RATIONALE. `plan.ts` is the executable form; where they
> disagree, `plan.ts` is what runs. Two rows changed after review — see
> [Amendments](#amendments-after-review).

## How to use this

The tables below record, per path: where it was, what it holds, who reads it,
what was proposed, and what was decided. To act on it, use `scripts/bao-reorg`.

Read [Constraint 1](#constraints-that-shape-the-answer) before anything else —
the decisions introduce three new top-level prefixes, and ESO cannot read any of
them until the `eso-*` policies are widened by a root ceremony.

## Amendments after review

Two `✎ Your call` entries did not survive contact with the live estate. Both are
corrected in `plan.ts`; both are left visible in the tables below rather than
edited in place, so the record shows what was decided and why it changed.

| Row | Decided | Actual | Why |
| --- | --- | --- | --- |
| §H `shared/eris-ssh-key` | `RETIRE` | **move** → `clusters/equestria/apps/home-assistant/ssh-key` | The retirement rested on "its only consumer was `stargate-command/home-assistant`, which goes with SGC". Namespace `stargate-command` runs **on equestria** — SGC's workloads were folded in, the namespace name is all that survived. `home-assistant-ssh` is live, `SecretSynced`, and mounted by the HelmRelease at `helmrelease.yaml:212`. Retiring it would have broken Home Assistant's SSH integration at the next refresh. |
| §B/§F `github-personal-access-token`, `eris-github-access-token` | "come from the clusters `github-token` managed by the vault stack" | **retire**, consumers repointed | Correct as stated, and now verified: `stacks/vault/KubernetesGithubAppToken.ts` mints `kube-system/github-token` from the GitHub App and emberstack reflects it into every namespace. Dynacat takes it as a `secretKeyRef` env var; the nine Pulumi Stack CRs now read `github-token`/`token` directly and the `pulumi-operator-github` ExternalSecret is deleted. The live Secret still carries a March `kubectl apply` annotation, which is why it looks hand-made — Pulumi manages it by `SecretPatch`. |

Everything else was implemented as written.

## Verified against live OpenBao

Read on 2026-08-20 via the `pulumi` AppRole (names and metadata only, no values):

| | count |
| --- | --- |
| Paths under `secrets/shared/` | **146** |
| Referenced somewhere in this repo | **69** |
| **No reference in this repo** — see [§K](#k-unreferenced-paths--77-of-them) | **77** |
| Referenced but absent from OpenBao | **0** |

```bash
bao kv list -format=json secrets/shared | jq -r '.[]' | sort
```

Every path this repo names exists. That includes the eight addressed only by
1Password *title* (`resolveBaoPath` slugs them at runtime, so nothing in the
repo contains the string `shared/…` for them) — all eight are real. Those are
marked 🅟.

The bigger finding is the other half: **more than half of `shared/` is
unreferenced.** 77 paths, all still at version 1 with `updated_time`
2026-08-08 — the `op-to-bao --apply` run — i.e. written once by the migration
and never touched since. Most are retired apps (lldap, zitadel, seafile,
harbor, homarr, outline, vikunja, warpgate, peppermint, opencloud, donetick,
authelia) and SGC-era infrastructure. Draining `shared/` is mostly a *deletion*
job, not a move job.

## Where this came from

`shared/` was never meant to look like this.
[`docs/openbao-migration/PLAN.md` §A](openbao-migration/PLAN.md) specifies the
layout:

```
secrets/shared/providers/{cloudflare,unifi,tailscale,proxmox,technitium,truenas,minio}
secrets/shared/{authentik,github,pushover,backblaze,media-management,...}/<name>
secrets/clusters/<cluster-key>/apps/<app>/{oidc,postgres,config}
secrets/clusters/<cluster-key>/{kubeconfig,tunnel,...}
secrets/hosts/{dockge,pbs,proxmox,truenas}/<host-key>        # SSH creds only
docs/<slug>
```

PLAN even gives the worked example: `Github Actions Runner (david-driscoll)` →
`secrets/shared/github/actions-runner-david-driscoll`.

What actually shipped is `op-to-bao`'s **default** rule — `shared/<slug(title)>`,
flat — because `mapping.yaml` was reviewed for collisions rather than for
grouping. So this reorganisation is finishing Phase 4's intended layout, not
inventing a new one. Two consequences:

- The nesting is **already sanctioned**; no new estate decision is needed for
  `shared/providers/cloudflare` or `shared/github/vault-deploy-key`.
- `hosts/…` is "SSH creds only" by that plan, which settles [§I](#i-pbs-backup-users).

## Conventions

`<cluster-key>` is a bucket, not strictly a Kubernetes cluster:

| key | title | type |
| --- | --- | --- |
| `equestria` | Equestria | kubernetes |
| `sgc` | Stargate Command | kubernetes (**decommissioning**, [piece 22](cluster-consolidation/22-decommission-sgc.md)) |
| `celestia` | Celestia | dockge |
| `luna` | Luna | dockge |
| `skystar` | Skystar | dockge |
| `alpha-site` | Alpha Site | dockge |

Both consumer kinds already read the target shape:
`kubernetes/apps/equestria/dns/technitium/externalsecret.yaml` reads
`clusters/equestria/apps/technitium/oidc`, and `docker/alpha-site/authentik/.env`
reads `ref+openbao://secrets/clusters/alpha-site/apps/authentik/postgres#/password`.

### Leaf naming

In use today: `oidc`, `postgres`, `token`, `admin`, `secret-key`, `devices`,
`cloud`, `details`, `cluster`. Proposals below add `credentials` (a multi-field
blob that is the app's own login), `api-key`, `crypto-key`, `jwt-secret`. Say
the word if you'd rather standardise on fewer.

Field names are given in each table so the leaf can be judged against what the
blob actually holds.

## Constraints that shape the answer

**1. Nesting needs no policy change — verified against the live policy text.**
[`bootstrap/openbao/equestria-init.sh`](../bootstrap/openbao/equestria-init.sh)
writes `eso-<cluster>` as:

```hcl
path "secrets/data/shared/*"       { capabilities = ["read"] }
path "secrets/metadata/shared/*"   { capabilities = ["read", "list"] }
path "secrets/data/clusters/*"     { capabilities = ["read"] }
path "secrets/metadata/clusters/*" { capabilities = ["read", "list"] }
```

A trailing `*` in an OpenBao ACL is a **prefix** glob — it matches across `/`.
So `shared/providers/cloudflare` and `clusters/equestria/apps/n8n/credentials`
are both already covered. `pulumi` holds `secrets/*`, so Pulumi is covered too.
A brand-new *top-level* prefix (`providers/`, `estate/`) would need a grant in
every `eso-*` policy plus the AppRole — an admin write, therefore a root
ceremony. **Nesting under `shared/` avoids that entirely**, which is the second
reason to follow PLAN §A rather than invent.

Note also that `eso-<cluster>` reads **every** cluster subtree, not just its
own — widened deliberately after the alpha-site/authentik 403 took out 15
Kustomizations. So filing a secret under `clusters/celestia/…` does not stop
equestria reading it.

**2. KV v2 has no rename.** Write new → repoint consumers → verify →
`bao kv metadata delete` old. Copy the value, never regenerate: a new
`freshrss-crypto-key` or `tandoor-secret-key` makes stored data unreadable, and
a new session key logs everyone out.

**3. `concealed_fields` must carry over.** `shapeItem` throws on a path marked
`contains_secrets: true` with no `concealed_fields`, and a path that silently
loses the list downgrades every value to plaintext in Pulumi state
(`components/store/bao.ts`, header §"Secrecy comes from custom_metadata").

**4. Pulumi title-addressed reads do not follow the data.** `resolveBaoPath`
(`components/store/bao.ts:409`) derives `shared/<baoSlug(title)>` from a title.
Moving one of those means editing the call site to `getSecretByPath(...)`; the
data moving alone turns into a hard throw. Rows marked 🅟.

**5. Cross-repo consumers.** Three paths are read from outside this repo:

| path | also read by |
| --- | --- |
| `minio-root-user` | `vault/.config/mise.toml` |
| `pulumi-passphrase` | `vault/.config/mise.toml` |
| `tailscale-terraform-oauth-client` 🅟 | `equestria-cluster/.config/mise.toml`, `stargate-command-cluster/.config/mise.toml` (both superseded by the repo consolidation — confirm they are archived before counting them) |

**6. `shared/cloudflare-driscoll-tech` has three non-ESO consumers** that must
change in lockstep:
- `kubernetes/apps/kube-system/openbao-replica/helmrelease.yaml:230` —
  `CANARY_PATH: secrets/data/shared/cloudflare-driscoll-tech` (note the KV v2
  `data/` infix). If it 404s, the replica health check fails.
- `docker/alpha-site/bao-standby/restore.sh:65` and
  `bootstrap/RUNBOOK.md` — the break-glass canary read.
- `components/globals.ts:55` — the Cloudflare provider for every stack.

This is the estate's designated canary. Recommend `KEEP`.

**7. Bootstrap paths are read before anything else exists.** `.config/mise.toml`
resolves `minio-root-user`, `pulumi-passphrase` and
`eris-1password-connect-access-token` through `vals` + the SOPS AppRole before
Pulumi starts. Nesting is in-policy (Constraint 1), so these *can* move — but a
typo takes out every `pulumi` invocation in two repos at env-load time.

**8. `docker/_common/*` deploys to several hosts.** A `_common` `.env` naming
`shared/x` gets the same value everywhere. It can become
`clusters/${CLUSTER_KEY}/apps/${APP}/x` — `docker/_common/technitium/.env:39`
already templates that way — but that is a decision to give each host its own
value, with a copy-per-host migration. Marked 🅒.

**9. SGC is live but being torn down.** Its `CLUSTER_CNAME` is
`stargate-command`, not `sgc` — which is why `stargate-command-pushover-key`,
`stargate-command-cloudflare-tunnel` and friends exist. Six rows have an SGC
consumer; don't let them argue for a path staying put. Marked 🅢.

**10. `baoKvSecret` sets `retainOnDelete: true`.** Removing a Pulumi write does
not delete the KV path. Old paths always need hand-deletion.

---

## A. Equestria apps — move to the app (high confidence)

| Current path | Fields | Read by | Proposed | ✎ Your call |
| --- | --- | --- | --- | --- |
| `shared/freshrss-crypto-key` | `password` | `equestria/home/freshrss` | `clusters/equestria/apps/freshrss/crypto-key` | `clusters/equestria/apps/freshrss/crypto-key` |
| `shared/karakeep-secret-key` | `password` | `equestria/home/karakeep` | `clusters/equestria/apps/karakeep/secret-key` | `clusters/equestria/apps/karakeep/secret-key` |
| `shared/searxng-secret-key` | `password` | `equestria/home/searxng` | `clusters/equestria/apps/searxng/secret-key` | `clusters/equestria/apps/searxng/secret-key` |
| `shared/tandoor-secret-key` | `password` | `equestria/home/tandoor` | `clusters/equestria/apps/tandoor/secret-key` | `clusters/equestria/apps/tandoor/secret-key` |
| `shared/n8n` | `license_key`, `password` | `equestria/home/n8n` | `clusters/equestria/apps/n8n/credentials` | `clusters/equestria/apps/n8n/credentials` |
| `shared/tududi` | `encryption_key`, `session_secret` | `equestria/home/tududi` | `clusters/equestria/apps/tududi/keys` | `clusters/equestria/apps/tududi/keys` |
| `shared/obsidian-sync` | `passphrase`, `password`, `username` | `equestria/home/obsidian-sync` | `clusters/equestria/apps/obsidian-sync/credentials` | `clusters/equestria/apps/obsidian-sync/credentials` |
| `shared/questarr-jwt-secret` | `password` | `equestria/games/questarr` | `clusters/equestria/apps/questarr/jwt-secret` | `clusters/equestria/apps/questarr/jwt-secret` |
| `shared/steamgriddb` | `credential` | `equestria/games/romm` | `clusters/equestria/apps/romm/steamgriddb` | `third-party-tokens/steamgriddb/api-key` |
| `shared/romm-secret-key` | `password` | `equestria/games/romm` | `clusters/equestria/apps/romm/secret-key` | `clusters/equestria/apps/romm/secret-key` |
| `shared/retro-achievements-api-key` | `credential` | `equestria/games/romm` | `clusters/equestria/apps/romm/retro-achievements` | `third-party-tokens/retro-achievements/api-key` |
| `shared/pinepods-admin` | `email`, `name`, `password`, `username` | `equestria/media/pinepods` | `clusters/equestria/apps/pinepods/admin` | `clusters/equestria/apps/pinepods/admin` |
| `shared/xcproxy` | `password`, `username`, `vod_movies`, `vod_tv` | `equestria/pvr/xcproxy` (ES + `.mise.toml`) | `clusters/equestria/apps/xcproxy/credentials` | `clusters/equestria/apps/xcproxy/credentials` |
| `shared/dispatcharr` | `password`, `username` | `equestria/pvr/dispatcharr`, dynacat | `clusters/equestria/apps/dispatcharr/credentials` | `clusters/equestria/apps/dispatcharr/credentials` |
| `shared/crowdsec-ui` | `password` | `network/crowdsec-ui` | `clusters/equestria/apps/crowdsec-ui/credentials` | `clusters/equestria/apps/crowdsec-ui/credentials` |
| `shared/crowdsec-apikey` | `apikey_bouncer`, `credential` | `network/crowdsec`, `network/traefik` | `clusters/equestria/apps/crowdsec/api-key` | `clusters/equestria/apps/crowdsec/api-key` |
| `shared/grafana-credentials` | `password`, `username` | `observability/grafana` | `clusters/equestria/apps/grafana/credentials` | `clusters/equestria/apps/grafana/credentials` |
| `shared/unifipoller` | `password`, `username` | `observability/unpoller` | `clusters/equestria/apps/unpoller/credentials` | `clusters/equestria/apps/unpoller/credentials` |
| `shared/meilisearch-secret-key` | `password` | `equestria/home/meilisearch` **and** `karakeep` | `clusters/equestria/apps/meilisearch/secret-key` | `clusters/equestria/apps/meilisearch/secret-key` |
| `shared/spike-minio-access-token` | `endpoint`, `hostname`, `password`, `port`, `region`, `username` | `database/postgres` ×2 | `clusters/equestria/apps/postgres/minio-backup` | `clusters/equestria/apps/postgres/minio-backup` |
| `shared/eris-tailscale-oauth-operator` | `credential`, `hostname`, `username`, `valid from` | `tailscale-system/operator`, `equestria/shared/secrets` | `clusters/equestria/apps/tailscale-operator/oauth` | `third-party-tokens/tailscale/oauth-operator` |
| `shared/equestria-cloudflare-tunnel` 🅢 | `credential`, `username` | `network/cloudflare-tunnel`, dynacat, `stargate-command/secrets` | `clusters/equestria/apps/cloudflare-tunnel/credentials` | `third-party-tokens/cloudflare/tunnel` |
| `shared/thanos-s3-storage` | `bucket`, `endpoint`, `password`, `username` | `observability/thanos`; **written by** `stacks/home/index.ts:179` | `clusters/equestria/apps/thanos/s3` | `clusters/equestria/apps/thanos/s3` |
| `shared/rclone-web-ui` 🅟 | `password`, `username` | `components/authentik/groups.ts:72` (Admins group attribute) | `clusters/equestria/apps/rclone/web-ui` | `clusters/equestria/apps/rclone/web-ui` |

> `thanos-s3-storage` is the **only** `shared/` path Pulumi writes. The path is a
> literal at `stacks/home/index.ts:183` with a comment block above naming the
> reader — both need editing in the same commit.

## B. Dynacat (the `dashboard/` app) — move to the app

`dashboard/` is dynacat (`kubernetes/apps/equestria/home/dynacat/ks.yaml` points
`path: ./dashboard`). One consumer each: dynacat's ExternalSecret. Your two
worked examples are the first two rows.

| Current path | Fields | Proposed | ✎ Your call |
| --- | --- | --- | --- |
| `shared/glance-secret-key` | `password` | `clusters/equestria/apps/dynacat/glance-secret-key` | `clusters/equestria/apps/dynacat/glance-secret-key` |
| `shared/immich-apikey` | `password` | `clusters/equestria/apps/dynacat/immich-apikey` | `clusters/equestria/apps/dynacat/immich-apikey` |
| `shared/grafana-apikey` | `credential`, `username` | `clusters/equestria/apps/dynacat/grafana-apikey` | `clusters/equestria/apps/dynacat/grafana-apikey` |
| `shared/github-personal-access-token` | `token` | `clusters/equestria/apps/dynacat/github-token` | Lets update this to come from the clusters `github-token` that is managed by the vault stack |

> The last two are the kind of thing that acquires a second consumer.
> `shared/github/personal-access-token` is a defensible alternative for the PAT.

## C. Dockge hosts — move to the host bucket

| Current path | Fields | Read by | Proposed | ✎ Your call |
| --- | --- | --- | --- | --- |
| `shared/arcane` | `api_key`, `encryption_key`, `jwt_secret`, `password`, `username` | `docker/celestia/arcane` | `clusters/celestia/apps/arcane/credentials` | `clusters/celestia/apps/arcane/credentials` |
| `shared/forgejo` | `password`, `postgres_password`, `secret_key`, `username` | `docker/celestia/forgejo`, `docker/celestia/postgres` | `clusters/celestia/apps/forgejo/credentials` | `clusters/celestia/apps/forgejo/credentials` |
| `shared/pdm-root` | `password`, `username` | `docker/celestia/pdm` | `clusters/celestia/apps/pdm/root` | `clusters/celestia/apps/pdm/root` |
| `shared/homelable` | `homepage_api_key`, `live_view_key`, `mcp_api_key`, `mcp_service_key`, `secret_key` | `docker/celestia/homelable` **and** dynacat | `clusters/celestia/apps/homelable/keys` | `clusters/celestia/apps/homelable/keys` |
| `shared/gatus-pushover-key` | `credential`, `username` | `docker/alpha-site/uptime` | `clusters/alpha-site/apps/uptime/pushover` | `third-party-tokens/pushover/gatus` |
| `shared/adguard-home` | `password`, `username` | `docker/alpha-site/prometheus-exporters` | `clusters/alpha-site/apps/prometheus-exporters/adguard` | RETIRED |

> `homelable` is read cross-cluster (celestia's app, equestria's dashboard).
> That is fine — `eso-equestria` reads `clusters/celestia/*`; exactly the
> alpha-site/authentik precedent that forced the policy widening.

## D. `docker/_common/*` — decision required 🅒

Same path, several hosts. Option B means *giving each host its own value*, not
just relocating one. Templating works already.

| Current path | Fields | Deployed to | A: one value | B: per host | ✎ Your call |
| --- | --- | --- | --- | --- | --- |
| `shared/docker-postgres` | `password` | every dockge host | `shared/postgres/dockge-superuser` | `clusters/${CLUSTER_KEY}/apps/postgres/superuser` | `docker/apps/postgres/dockge-superuser` |
| `shared/neo4j-password` | `password` | `_common/neo4j` (alpha-site) | `shared/neo4j/password` | `clusters/${CLUSTER_KEY}/apps/neo4j/password` | `docker/apps/neo4j/password` |
| `shared/technitium-password` | `password`, `username` | `_common/technitium` + `equestria/dns/technitium` | `shared/providers/technitium/admin` | `clusters/${CLUSTER_KEY}/apps/technitium/admin` | `apps/technitium/admin` |

> `docker/_common/postgres/.env` already documents the choice in a comment:
> "One item, reused by every node — the instances are independent and never
> replicate, so a shared superuser secret buys convenience without creating a
> shared blast radius beyond what a Dockge host already has." Option A keeps
> that reasoning; Option B overturns it.

## E. Provider credentials → `shared/providers/<vendor>`

Straight out of PLAN §A. No ceremony (Constraint 1), no cross-cluster surprises — these stay estate-wide, they just stop sitting in a flat pile.

| Current path | Fields | Read by | Proposed | ✎ Your call |
| --- | --- | --- | --- | --- |
| `shared/cloudflare-driscoll-tech` | `accountId`, `credential`, `notesPlain`, `type`, `username`, `zoneId` | traefik (all hosts), cert-issuers, network, dynacat, Pulumi globals, **replica canary**, break-glass runbook | **`KEEP`** — see Constraint 6 | `third-party-tokens/cloudflare/driscoll-tech` |
| `shared/unifi-api-key-eris-cluster` | `credential`, `expires`, `hostname`, `valid from` | external-dns, unpoller, dynacat, Pulumi globals | `shared/providers/unifi/eris` | `third-party-tokens/unifi/api-key` |
| `shared/eris-truenas-credentials` 🅢 | `credential`, `domain`, `hostname`, `username` | `equestria/shared/secrets`, `stargate-command/secrets`, Pulumi globals | `shared/providers/truenas/eris` | `clusters/spike/truenas-credentials` |
| `shared/proxmox-apikey` 🅟 | `arch`, `credential`, `endpoint`, `luna`, `type`, `url`, `username` | dynacat, Pulumi (`"Proxmox ApiKey"` ×3 stacks) | `shared/providers/proxmox/api-key` | `apps/proxmox/api-key` |
| `shared/proxmox` 🅟 | `password`, `view-inputEl` | `components/globals.ts:69` (`"Proxmox"`) | `shared/providers/proxmox/root` — ⚠️ `view-inputEl` is a stray browser-autofill field; drop it | `apps/proxmox/root` |
| `shared/alpha-site-proxmox-apikey` 🅟 | `arch`, `credential`, `endpoint`, `type`, `username` | `stacks/home/index.ts:28` | `clusters/alpha-site/proxmox-api-key` | `apps/proxmox/alpha-site/api-key` |
| `shared/technitium-apikey` 🅟 | `credential`, `hostname`, `type` | `components/globals.ts:65` | `shared/providers/technitium/api-key` | `apps/technitium/api-key` |
| `shared/technitium-tsig-key` | `credential`, `hostname`, `type`, `username` | `network/external-dns/technitium` | `shared/providers/technitium/tsig` | `apps/technitium/tsig` |
| `shared/tailscale-terraform-oauth-client` 🅟 | `credential`, `hostname`, `type`, `username` | `components/globals.ts:49`, `components/tailscale.ts:42`, **two cluster repos** | `shared/providers/tailscale/terraform-oauth` | `third-party-tokens/tailscale/pulumi-oauth` |
| `shared/minio-root-user` | `endpoint`, `password`, `username` | `.config/mise.toml`, `pulumi/secrets`, **`vault` repo** | `shared/providers/minio/root` | `apps/minio/root` |
| `shared/docker-hub` | `password`, `username`, one section | `kube-system/registry`, `kube-system/secrets/docker-hub-auth` | `shared/providers/docker-hub/pull` | `third-party-tokens/docker-hub/api-key` |
| `shared/eris-home-assistant-credentials` 🅢 | `apikey`, `credential`, `one-time password`, `password`, `username` | `equestria/shared/secrets`, `network/secrets`, `stargate-command/secrets` | `shared/providers/home-assistant/eris` | `clusters/equestria/apps/home-assistant/eris-credentials`  |
| `shared/twitch-developer` | `credential`, `hostname`, `token_url`, `type`, `username`, `valid from` | `equestria/games/{playerr,questarr,romm}` | `shared/providers/twitch/developer` | `third-party-tokens/twitch/developer` |
| `shared/tmdb-api-key` | `password` | `equestria/pvr/xcproxy` (ES + `.mise.toml`) | `shared/providers/tmdb/api-key` | `third-party-tokens/tmdb/api-key` |
| `shared/volsync-password` 🅟 | `credential` | `components/volsync`, `kube-system/etcd`, Pulumi `BackupPlanDirector` | `shared/providers/restic/volsync` | `apps/volsync/password` |
| `shared/rclone-sftp-key` 🅟 | `fingerprint`, `key type`, `private key`, `public key` | `kube-system/openbao-replica`, Pulumi (`"Rclone SFTP Key"` ×3 stacks) | `docker/apps/rclone/sftp` | |
| `shared/pulumi-passphrase` | `password` | `.config/mise.toml`, **`vault` repo** | `shared/providers/pulumi/passphrase` | `apps/pulumi/passphrase` |
| `shared/eris-1password-connect-access-token` | `credential`, `valid from` | `.config/mise.toml`, `_common/backups`, `pulumi/secrets` | `shared/providers/onepassword/connect` | `third-party-tokens/onepassword/eris-connect` |
| `shared/dockge-credential` 🅟 | `password`, `username` | `stacks/{home,ocracoke,gulf-of-mexico}` | `shared/providers/dockge/credential` | `docker/apps/dockge/credential` |

## F. Family groupings → `shared/<family>/<name>`

Also straight out of PLAN §A, including its worked example for the ARC runners.

| Current path | Fields | Read by | Proposed | ✎ Your call |
| --- | --- | --- | --- | --- |
| `shared/github-actions-runner-david-driscoll` | `github_app_id`, `github_app_installation_id`, `github_app_private_key`, `githubConfigUrl`, `owner`, 2 controller fields | `github-actions/runners/david-driscoll`, `.../vault`, `components/alerts/github-status` | `shared/github/actions-runner-david-driscoll` | `third-party-tokens/github/actions-runner/david-driscoll` |
| `shared/github-actions-runner-littles-tech` | same shape | `github-actions/runners/littles-tech` | `shared/github/actions-runner-littles-tech` | `third-party-tokens/github/actions-runner/littles-tech` |
| `shared/github-david-driscoll-vault-deploy-key` | `fingerprint`, `key type`, `known_hosts`, `private key`, `public key`, … | `flux-system/repositories/vault`, `pulumi/secrets` | `shared/github/vault-deploy-key` | `third-party-tokens/github/david-driscoll/vault/deploy-key` |
| `shared/eris-github-access-token` | `credential`, `type` | `pulumi/secrets` | `shared/github/pulumi-access-token` | Lets update this to come from the clusters `github-token` that is managed by the vault stack |
| `shared/pushover` | `credential`, `email`, `username` | `equestria/shared/secrets` | `shared/pushover/estate` | `third-party-tokens/pushover/driscoll-alerts` |
| `shared/equestria-pushover-key` | `credential`, `username` | `dashboard/externalsecret.yaml:95`, `observability/alertmanager/alertmanager-secret.yaml:32` (via `${CLUSTER_CNAME}`) | `shared/pushover/equestria` — ⚠️ the templated key becomes `shared/pushover/${CLUSTER_CNAME}` | `third-party-tokens/pushover/alert-manager` |
| `shared/authentik-plex-source` 🅟 | `credential`, `type`, `username`, one section | `components/authentik/flows.ts:160` | `clusters/alpha-site/apps/authentik/plex-source` | `third-party-tokens/plex/authentik-source` |
| `shared/authentik-token` 🅟 | `credential`, `url` | `components/DockgeLxc.ts:856` | ⚠️ **stale**. `clusters/alpha-site/apps/authentik/token` is the live path — dynacat, `.config/mise.toml` and `pulumi/secrets` all read it. Repoint the call site and **`DROP`** this. | RETIRE |
| `shared/unifi-discord` 🅢 | `password`, `username` | `equestria/shared/secrets`, `stargate-command/secrets` | Discord webhook for UniFi alerts → `shared/discord/unifi-webhook` | `third-party-tokens/discord/unifi-webhook` |

## G. Split candidate

| Current path | Why | Proposal | ✎ Your call |
| --- | --- | --- | --- |
| `shared/media-management-secrets` 🅢 | **19 fields in one blob**: `bazarr_apikey`, `emby_token`, `jellyfin_token`, `jellyseerr_apikey`, `lidarr_apikey`, `mdblist_apikey`, `mylar_apikey`, `nzbget_restricted_password`, `omdb_apikey`, `plex_token`, `prowlarr_apikey`, `radarr_apikey`, `sabnzbd_apikey`, `seerr_apikey`, `sonarr_apikey`, `tautulli_token`, `threadfin_token`, `tmdb_apikey`, `watchstate_apikey`. Read by `equestria/shared/secrets`, `media/kometa`, `media/pulsarr`, `media/plex/definition.yaml`, dynacat, `stargate-command/secrets` — most of which take the whole blob via `dataFrom.extract`. | **`KEEP`** as `shared/media-management/secrets`, or **`SPLIT`** into `clusters/equestria/apps/<arr>/api-key`. The ×6 whole-blob fan-out is a real argument for keeping it; note `tmdb_apikey` here duplicates `shared/tmdb-api-key`. | Split into `clusters/equestria/apps/<arr>/api-key`, drop `threadfin_token`, `tmdb_apikey` (use `third-party-tokens/tmdb/api-key` instead) |

## H. SGC-only 🅢 — retire with the cluster

| Current path | Fields | Read by | Proposal | ✎ Your call |
| --- | --- | --- | --- | --- |
| `shared/eris-ssh-key` | `fingerprint`, `key type`, `known hosts`, `private key`, `public key`, `rsa private key` | `stargate-command/home-assistant` only | `DROP` with piece 22, unless something else claims it | RETIRE |

## I. PBS backup users

PLAN §A says `hosts/…` is **SSH creds only**, and `hosts/pbs/` is a LIST prefix:
`BaoStore.proxmoxBackupServers` (`components/store/bao.ts:307`) enumerates it and
**throws for every consumer** on an entry lacking `dockge` and `cluster` title
fields. So `hosts/pbs/` is the wrong home for these.

| Current path | Fields | Read by | Proposed | ✎ Your call |
| --- | --- | --- | --- | --- |
| `shared/celestia-pbs-backup-user` | `password`, `username` | dynacat only | `clusters/celestia/pbs-backup-user` | RETIRE |
| `shared/luna-pbs-backup-user` | `password`, `username` | dynacat only | `clusters/luna/pbs-backup-user` | RETIRE |

## J. Estate-wide, keep as-is

| Current path | Why | ✎ Your call |
| --- | --- | --- |
| `shared/cloudflare-driscoll-tech` | The designated canary in two independent break-glass paths (Constraint 6). Moving it means editing the replica HelmRelease, `restore.sh`, `bootstrap/RUNBOOK.md` and `bootstrap/openbao/restore-test.sh` together. | Use `third-party-tokens/cloudflare/driscoll-tech` |

---

## K. Unreferenced paths — 77 of them

Live in OpenBao, **no reference anywhere in this repo**. All version 1,
`updated_time` 2026-08-08 — written by `op-to-bao --apply` and never touched.
The `vault` repo references only `cloudflare-driscoll-tech`, `minio-root-user`,
`pulumi-passphrase` and `pdm-root` (the last in a unit test), so it does not
account for these.

**Before deleting any of them, check the two archived cluster repos** —
`equestria-cluster` and `stargate-command-cluster` still contain live-looking
`key: shared/…` references (`authentik-secret-key`, `authentik-token`,
`stargate-command-cloudflare-tunnel`, …). If those repos are archived and no
longer reconciled, these are dead; if either still syncs, they are not.

### Almost certainly dead — retired applications

`authelia-database`, `donetick-secret`, `duplicati-password`, `garage-password`,
`ggrequestz-secret-key`, `harbor-admin`, `homarr-api-key`,
`homarr-database-user`, `homarr-encryption-key`, `homepage-secrets`,
`keeper-secret-key`, `lldap-admin`, `lldap-authentik`, `lldap-database`,
`network-ups-tools`, `opencloud-admin`, `outline-secret-key`,
`peppermint-database-user`, `romm` (superseded by `romm-secret-key`),
`seafile-admin`, `seafile-config`, `tivi-login`, `tokra`, `tvheadend`,
`uptime-kuma`, `vikunja-api-token`, `vikunja-database-user`, `warpgate`,
`zitadel-master-key`, `zitadel-super-user`, `mend-token`, `steam-apikey`,
`tmdb-read-only`, `n8n-api-key`, `docktail-credentials`, `discord-oauth2`,
`dynacat-login`, `eris-trakt-tv`, `eris-library-tunnel-read-token`,
`claude-oauth-token`, `alpha-site-chrysalis`, `cloudflare-chrysalis-tunnel`,
`cloudflare-tulip-tunnel`, `cloudflare-tunnel`

Lets move these from `shared/` into `retired/`

### SGC-era — retire with piece 22

`sgc-age-key`, `sgc-authentik-outpost`, `sgc-definition-crds`, `sgc-kuma-sync`,
`sgc-postgres-postgres-user`, `sgc-postgres-superuser`, `sgc-postgres-user`,
`minio-sgc-postgres`, `stargate-command-cloudflare-tunnel`,
`stargate-command-github-deploy-key`,
`stargate-command-github-web-hook-token`, `stargate-command-pushover-key`

We can remove all of these.

### Check before deleting — plausibly still load-bearing

| path | fields | why it needs a look |
| --- | --- | --- |
| `equestria-age-key`, `sgc-age-key` | `public key` | public halves only — harmless, but confirm the private halves live in `bootstrap/` | RETIRE
| `equestria-github-deploy-key`, `github-deploy-key` | `credential`, `public key` | Flux's own git access. If either is what `flux-system` actually uses, this is not dead | RETIRE
| `equestria-github-web-hook-token` | `credential` | receiver token for the Flux webhook | RETIRE
| `equestria-postgres-superuser`, `equestria-postgres-user`, `postgres`, `postgres-user-login` | connection strings ×15 | CNPG creds. Probably superseded by the `database` ClusterSecretStore, but verify | RETIRE
| `equestria-authentik-outpost`, `equestria-definition-crds`, `equestria-kuma-sync` | `certificate`, `cluster`, `cluster_api`, `sa`, `token` | ServiceAccount kubeconfigs. If anything still logs in with these, deleting breaks it silently | DELETE
| `authentik-admin`, `authentik-database-user`, `authentik-secret-key` | | superseded by `clusters/alpha-site/apps/authentik/{admin,postgres,secret-key}` — confirm, then drop | RETIRE
| `david-driscoll-github-app`, `littlestech-github-app` | app id + private key | distinct from the `github-actions-runner-*` pair; check whether Renovate or a workflow uses them | `third-party-tokens/github/david-driscoll/github-app` and `third-party-tokens/github/littlestech/github-app` |
| `tailscale-idp-client-credentials` | `password`, `username` | tsidp/tsiam — that cutover is [its own incident](../CLAUDE.md); confirm dead before deleting | DELETE
| `minio-access-key`, `spike-private-key` | | non-root Minio creds and an SSH key with no visible consumer | RETIRE
| `technitium-k8s-dns-authkey` | `credential` | distinct from `technitium-tsig-key`; one of the two may be the live one | DELETE
| `eris-1password-connect-credentials-file` | **no data fields at all** | an empty path. Delete regardless | DELETE

Suggested first move: **delete the dead ones before moving anything.** It is
the lowest-risk work in this document, it shrinks the problem by more than half,
and a `shared/` with 69 live entries is much easier to reason about than one
with 146.

---

## Migration mechanics

Per path:

```bash
# 1. copy — never regenerate (Constraint 2)
bao kv get -format=json secrets/<old> | jq '.data.data' > /tmp/v.json
bao kv metadata get -format=json secrets/<old> | jq '.data.custom_metadata' > /tmp/m.json
bao kv put secrets/<new> @/tmp/v.json
bao kv metadata put -custom-metadata=concealed_fields=... secrets/<new>   # Constraint 3
# 2. repoint consumers  3. reconcile  4. verify  5. then:
bao kv metadata delete secrets/<old>
```

Verification per consumer kind:

| Kind | Check |
| --- | --- |
| ExternalSecret | `kubectl get externalsecret -A` → all `SecretSynced`; a 404 shows as `SecretSyncedError` |
| `vals` (Dockge) | `mise run vals-run -- <cmd>` on the host — a missing path is a hard error, not an empty string |
| `vals` (mise env) | any `pulumi` invocation; env load fails before the stack starts |
| Pulumi by title 🅟 | `pulumi preview` on the owning stack — a missing path throws by name |

Suggested ordering, riskiest last:

1. **§K deletions** — biggest win, no consumers by definition. Confirm the two
   archived cluster repos first.
2. **§B** (dynacat) — one file, one app, zero cross-consumers. Good pilot.
3. **§A** — the bulk; one app per PR or one PR per namespace.
4. **§C** — Dockge hosts, one host at a time.
5. **§E/§F** — provider and family regrouping; mechanical, but §E touches
   `globals.ts` and the `vault` repo.
6. **§D/§G** — only once you have picked per-host vs shared, and split vs keep.
7. **§H/§I** — folded into piece 22.

## Appendix: how this was gathered

```bash
# live path list (names only, no values)
bao kv list -format=json secrets/shared | jq -r '.[]' | sort

# repo references, all four addressing styles
grep -rIn "key: shared/"                    kubernetes/ dashboard/
grep -rIn "ref+openbao://secrets/shared/"   docker/ .config/ kubernetes/
grep -rIn "getSecretByTitle"                components/ stacks/   # → resolveBaoPath()
grep -rIn "baoKvSecret"                     components/ stacks/   # → the one write
```
