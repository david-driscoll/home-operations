# 1Password → OpenBao migration

> **Moved here from `david-driscoll/vault` on 2026-08-22.** This is a historical record of
> the 1Password → OpenBao migration, kept verbatim. "This repo" / "the vault repo" in the
> text below refers to `david-driscoll/vault` as it was at the time; the `bootstrap/` and
> `docs/openbao-migration/` paths it names now resolve inside home-operations, and its
> `stacks/vault` is now `stacks/vault` here. The vault repo's own code (`components/store`,
> its parity script) was a trimmed copy of this repo's and was not carried over.

## Context

Today 1Password is the source of truth for every secret in the estate, and the dependency is
deeper than "a secret store". Across four repos it is doing five different jobs:

1. **Secret storage** — ~55–60 items in vault `Eris`, ~78 literal `op://` reference strings.
2. **Cross-stack state** — Pulumi writes `Authentik Outputs`, `Tailscale Export - *`,
   `* Backup Plan`, and Dockge/Proxmox/TrueNAS host inventory back into 1Password, and other
   stacks read them back by tag. 1Password is being used as a distributed state store.
3. **A bespoke template engine** — `replaceOnePasswordPlaceholders` in
   `home-operations/components/store/index.ts:115-148`, a regex resolver wired as the last
   stage of an ordered pipeline over every file in every Docker stack.
4. **In-cluster injection** — ESO `ClusterSecretStore/onepassword-connect` *plus*
   `OnePasswordItem` CRs served by the 1Password Operator, a second parallel mechanism with
   no OpenBao equivalent. Counted live on 2026-08-08: **93 ExternalSecrets and 22
   OnePasswordItem CRs in equestria**, plus SGC's. (The original 44/19 figures are from
   2026-08-06 and the estate has grown since — re-count before scoping Phases 6–7.)
5. **Bootstrap** — the Connect token itself is a SOPS secret in each cluster repo, and the two
   clusters point at each other's Connect host, so the dependency is circular.

The goal is to bring this in-house on OpenBao (KV v2), replace the bespoke resolver with
`helmfile/vals`, and pull every genuinely bootstrap-critical secret out into SOPS files in the
`vault` repo so a cluster can be rebuilt from nothing without OpenBao being available.

### Decisions already made

| Decision | Choice |
|---|---|
| Reference documents | Separate `docs/` KV mount; body in a **data** field. `custom_metadata` is for provenance labels only. |
| Unseal | `seal "transit"` against a small OpenBao on alpha-site. |
| Pulumi write-back | Split: true secrets → OpenBao; non-secret inventory → Pulumi stack outputs via `StackReference`. |
| Break-glass | Encrypted `pg_dump` shipped to alpha-site **plus** a warm standby OpenBao container there. |
| Namespace | OpenBao lives in `kube-system`, alongside ESO and the existing 1Password Connect app. |
| SGC | One OpenBao in equestria serves both clusters. SGC is being folded into equestria, so the dependency is intended. |
| 1Password | **Stays.** It stops being infrastructure source of truth but is not decommissioned. |
| `Development` vault | The one personal-scope reference (`dashboard/.mise.toml:19`) stays on 1Password, unmigrated. |

### Constraint discovered during research — read this first

**`vals` cannot read KV v2 metadata.** Its Vault/OpenBao provider only ever builds `/data/`
paths (`addPrefixToVKVPath(key, mountPath, "data")`) and documents exactly one query parameter
(`version`). This is why reference documents get their own mount with the body in a data field
rather than living in metadata as originally imagined.

**ESO, however, can.** Its Vault/OpenBao provider supports `metadataPolicy: Fetch`, which reads
`custom_metadata` plus system metadata (`created_time`, `current_version`,
`delete_version_after`) — KV v2 only. So metadata is reachable for all ~69 in-cluster
ExternalSecrets; the gap is only at the `vals` seam (laptop env + the Pulumi/Dockge resolver).

**We still put values in `data`, and no alternative tool changes that.** Alternatives that *can*
read metadata are all poor fits: OpenBao Agent templating (embeds consul-template, reads
`/metadata/` fine, but is a sidecar/daemon renderer — wrong shape for a laptop pipeline),
argocd-vault-plugin (explicit paths, so `/metadata/` is reachable — but ArgoCD-shaped, and this
estate runs Flux), and helm-secrets (wraps `vals`, same limitation). `bao kv metadata get` or a
direct REST call remains the escape hatch for the rare case.

The decisive reasons are properties of `custom_metadata` itself, not of tooling:

1. **Key-scoped, not version-scoped.** It is written via `/metadata/` and applies to every
   version, so rolling a secret back does not roll its metadata back. Anything that must stay in
   sync with the secret value does not belong there.
2. **Hard caps: 64 keys, 128-char keys, 512-char values.** A reference document exceeds 512
   characters immediately — this alone kills "docs in metadata" regardless of tooling.
3. **Separate ACL path.** `metadata/` and `data/` are governed by different policy rules, so
   anything stored in metadata needs a second grant on every consumer.

Worth knowing for later: KV v2's normal data read (`GET /:mount/data/:path`) already returns
`custom_metadata` inside `data.metadata`. `vals` simply projects `data.data` and drops the rest,
so upstream metadata support would be a small patch if it ever becomes worth doing.

The other useful find: `vals` also ships a **SOPS provider** (`ref+sops://path#/key`).
So one reference syntax covers both tiers — `ref+openbao://…` for runtime secrets and
`ref+sops://…` for bootstrap secrets — and the bespoke resolver is replaced by a single
mechanism rather than two.

---

## Target architecture

```
                    alpha-site (Docker/Dockge)
   ┌──────────────────────────┐   ┌──────────────────────────┐
   │ bao-transit              │   │ bao-standby  (stopped)   │
   │ seal "static" ←SOPS key  │   │ restores nightly pg_dump │
   │ transit engine only      │   │ sealed until break-glass │
   └────────────┬─────────────┘   └────────────▲─────────────┘
                │ transit unseal (Tailscale)   │ age-encrypted dump
   ┌────────────▼──────────────────────────────┴─────────────┐
   │ equestria cluster                                        │
   │   openbao (HA, 3 replicas)  ──storage──▶ CNPG `openbao`  │
   │        ▲          ▲                                       │
   │   ESO  │          │ kubernetes auth                       │
   │  ClusterSecretStore/openbao                               │
   └────────┼──────────┼───────────────────────────────────────┘
            │          │ approle
    SGC cluster    Pulumi (home-operations, vault) + laptops + CI via vals
```

---

## A. KV v2 layout

Three mounts. Everything is `kv-v2`.

| Mount | Contents |
|---|---|
| `secrets/` | Real secrets. Every field is treated as secret by default. |
| `docs/` | Reference documents. Body in a data field named `content`; `format` field records `markdown`/`json`/etc. |
| `meta/` | Migration bookkeeping only (mapping table, run receipts). Not read by any workload. |

### Path scheme

```
secrets/shared/providers/{cloudflare,unifi,tailscale,proxmox,technitium,truenas,minio}
secrets/shared/{authentik,github,pushover,backblaze,media-management,...}/<name>
secrets/clusters/<cluster-key>/apps/<app>/{oidc,postgres,config}
secrets/clusters/<cluster-key>/{kubeconfig,tunnel,...}
secrets/hosts/{dockge,pbs,proxmox,truenas}/<host-key>        # SSH creds only
docs/<slug>
```

`<cluster-key>` is the existing `CLUSTER_KEY` / `CLUSTER_CNAME` value (`equestria`, `sgc`,
`celestia`, `luna`, `skystar`, `alpha-site`).

**Title → path slug rule:** lowercase, non-alphanumerics → `-`, collapse repeats, trim. So
`Github Actions Runner (david-driscoll)` → `secrets/shared/github/actions-runner-david-driscoll`.
The mapping is *generated then hand-reviewed* (see §F) — never applied blind, because titles
like `Cluster: Alpha Site` and `Cloudflare (driscoll.tech)` collide badly under naive slugging.

**Tag queries → path prefixes.** The five tag queries in `VaultStore` become `LIST` calls:

| Today | Replacement |
|---|---|
| `findItemsByTag("dockge")` | `LIST secrets/hosts/dockge/` |
| `findItemsByTag("pbs")` | `LIST secrets/hosts/pbs/` |
| `findItemsByTag("cluster-definition")` | Inventory → Pulumi stack outputs; only `kubeconfig` stays in `secrets/clusters/<key>/` |
| `findItemsByTag("backup-plan")` | Inventory → Pulumi stack outputs |
| `findItemsByTag("tailscale-export")` | Inventory → Pulumi stack outputs; auth keys → `secrets/clusters/<key>/tailscale` |

Preserve the byte-stable sort at `components/op.ts:129` — `LIST` ordering is not guaranteed, so
sort keys explicitly before use or Pulumi diffs will churn.

### Field-level details

- **Concealed vs plain.** KV v2 has no per-field type, and `getSecretItem`
  (`components/store/index.ts:163-176`) uses `TypeEnum.Concealed` to decide Pulumi `secret()`
  marking. Rule: **everything under `secrets/` is marked secret.** The split in §C moves the
  plain fields (hostnames, usernames-as-identifiers, host inventory) out to stack outputs, so
  the residual mixed cases are few. For those, a nested `public: {}` object in the data is the
  escape hatch — it lives in *data*, not metadata, so `vals` and Pulumi can both read it.
- **Item files** (first-class in the 1Password model, carry binary `content`) become
  `{content_b64, filename, sha256}` under `secrets/…/files/<name>`. Encoding info goes in
  **data**, not metadata, for the same reason.
- **Sections** become nested objects. The magic `"add more"` section
  (`components/op.ts:212,216,229`) is hoisted to root during conversion and then no longer exists.
- **`custom_metadata`** carries only: `source_title`, `source_uuid`, `source_tags`,
  `concealed_fields`, `migrated_at`, `contains_secrets`. Read by humans, the `bao` UI, and the
  conversion/verify script — never by `vals`, ESO, or a workload.

---

## B. OpenBao in equestria

Namespace: **`kube-system`** — alongside `external-secrets` and the existing `1password` app, so
no new namespace and no bootstrap-script change.

**New files** — follow the app pattern exactly as `kubernetes/apps/database/postgres/backups/`
does (`ks.yaml` with `dependsOn` + `postBuild.substitute: {APP, NAMESPACE}`, `kustomization.yaml`,
`helmrelease.yaml`), and add the app to the existing
`kubernetes/apps/kube-system/kustomization.yaml`:

```
kubernetes/flux/meta/repos/openbao.yaml                  # HelmRepository → openbao.github.io/openbao-helm
                                                         #   (prefer an OCIRepository if the chart is published
                                                         #    to OCI — the repo already uses OCIRepository for
                                                         #    app-template and external-secrets; verify first)
kubernetes/apps/kube-system/openbao/ks.yaml              # dependsOn: postgres(database), external-secrets(kube-system)
kubernetes/apps/kube-system/openbao/kustomization.yaml
kubernetes/apps/kube-system/openbao/helmrelease.yaml
kubernetes/apps/kube-system/openbao/externalsecret.yaml  # renders server config → Secret → valuesFrom
kubernetes/apps/kube-system/openbao/httproute.yaml       # bao.${CLUSTER_DOMAIN}
kubernetes/apps/kube-system/openbao/uptime.yaml          # ApplicationDefinition, Gatus on /v1/sys/health
kubernetes/apps/kube-system/openbao/resources/config.hcl # configMapGenerator input
```

Co-locating with ESO means the `ClusterSecretStore/openbao` `kubernetes` auth path and the
OpenBao service are in the same namespace — the store can use the in-cluster service address
directly, mirroring how `onepassword-store.yaml` points at
`onepassword-connect.kube-system.svc.cluster.local` today.

⚠️ **`ClusterSecretStore/openbao` does not exist yet.** Phase 3 enabled the `kubernetes`
auth *method* on the server, but no store resource was ever created — equestria has
`backup`, `cluster`, `database`, `network` and `onepassword-connect`, and nothing else
(checked live 2026-08-08). Phase 6 therefore starts with creating it, and that needs three
things that do not exist either:

- a `kubernetes` auth **role** binding the ESO ServiceAccount to the `eso-equestria` policy
  (the policy exists; the role does not),
- the `ClusterSecretStore` manifest itself,
- the same again for SGC (`eso-sgc`), whose store must point at equestria's OpenBao over
  the tailnet rather than a cluster-local Service.

Until that exists, no ExternalSecret can reference OpenBao at all, so it gates every part
of Phases 6–7.

**Server config** (HA, Postgres storage, transit seal):

```hcl
ui = true
listener "tcp" { address = "0.0.0.0:8200"  tls_disable = true }

storage "postgresql" {
  connection_url = "{{ .postgres_uri }}"
  table          = "openbao_kv_store"
  ha_enabled     = "true"
  ha_table       = "openbao_ha_locks"
}

seal "transit" {
  address    = "http://{{ .alpha_site_ip }}:8200"
  key_name   = "openbao-equestria-unseal"
  mount_path = "transit/"
}

service_registration "kubernetes" {}
```

with Helm values `server.ha.enabled: true`, `server.ha.replicas: 3`,
`server.ha.raft.enabled: false`, and `server.ha.config` supplied from the rendered Secret.

**Deliver the config via the repo's existing idiom, not env vars.** Put `config.hcl` through
`configMapGenerator` → ExternalSecret `templateFrom` + `templateAs: Values` → Secret →
`HelmRelease.valuesFrom` — the same four-stage pattern documented in
`scripts/eso-values-lint/main.go` and used by
`kubernetes/apps/database/postgres/app/externalsecret.yaml`. That keeps the Postgres URI and
transit token out of the manifest and keeps `eso-values-lint` covering the new file.

**Database.** Add `- ../../../components/postgres` to `openbao/ks.yaml` with
`POSTGRES_NAME: openbao`, then `task update`. ⚠️ `kubernetes/components/postgres/Update.cs`
also generates PushSecrets that write back into 1Password — during dual-run that is fine, but it
means **OpenBao's own DB credential is provisioned by the 1Password-era generator**. It must be
copied into the `vault` repo's SOPS bootstrap set (§C), because OpenBao cannot hold the password
to its own storage.

**Auth methods to enable:**

| Method | Consumer |
|---|---|
| `kubernetes` | ESO `ClusterSecretStore/openbao` in both clusters; in-cluster workloads |
| `approle` | Pulumi (`home-operations`, `vault`), GitHub Actions runners |
| `oidc` | Humans, against the existing Authentik — the UI login path |

**Policies:** `admin`, `pulumi` (rw on `secrets/*` + `docs/*`), `eso-equestria` /
`eso-sgc` (read on `secrets/shared/*` + `secrets/clusters/<key>/*`), `ci` (read-only, narrow).

**SGC access.** SGC's ESO points at equestria's OpenBao over the internal/Tailscale address —
one OpenBao serves both clusters. SGC is slated to be folded into equestria, so this is the
intended end state rather than a stopgap, and no second OpenBao is planned.

---

## C. Bootstrap set and the `vault` repo

`vault` has **no SOPS setup today** — no `.sops.yaml`, no age keys, no `*.sops.*` files — but it
is pre-wired for them: `sops 3.13.3` + `age 1.3.1` pinned in `.config/mise.toml`, a top-level
linter exclusion for `**/*.sops.{yaml,yml,json,env,toml}` and `**/*.agekey` at
`.config/hk.pkl:40-56`, and `**/*.sops.*` in `.github/renovate.json5:8`. Those exclusions are
load-bearing — byte rewrites invalidate a SOPS MAC.

**New `vault/.sops.yaml`** mirroring `equestria-cluster/.sops.yaml`, using the **same three age
recipients** so the existing `age.key` works unchanged:

```yaml
creation_rules:
  - path_regex: bootstrap/.*\.sops\.ya?ml
    mac_only_encrypted: true
    key_groups:
      - age:
        - age1eurl2t7pepw66guv8m7lxh5fjhs4t4frsntqjp08lmypwudlsp7qdusgnf
        - age1klzrc4tp666ykn8u4y2nt80n0tcx52lvezrr54zswz55w2pdsgyqhcdfyr
        - age150z0s36kl9vud8728c5e4zqq6nmyywekk76rwvjclcsfc8mrxuuqr0qfg6
stores:
  yaml:
    indent: 2
```

**New layout:**

```
vault/bootstrap/
  INVENTORY.md                          # authoritative index: every bootstrap secret, where it lives, who needs it
  RUNBOOK.md                            # rebuild-from-nothing + break-glass procedures
  openbao/
    alpha-site-static-unseal.sops.yaml  # the static seal key file for bao-transit
    transit-approle.sops.yaml           # credentials equestria uses to reach the transit engine
    recovery-keys.sops.yaml             # OpenBao recovery shares
    pulumi-approle.sops.yaml            # Pulumi's approle role_id/secret_id
    postgres-openbao.sops.yaml          # the CNPG credential for OpenBao's own storage
  equestria/
    github-deploy-key.sops.yaml
  sgc/
    github-deploy-key.sops.yaml
```

Cluster-applied bootstrap secrets (`sops-age`, `cluster-secrets`, `shared-secrets`,
`talsecret`) **stay in their cluster repos** — Flux and `scripts/bootstrap-apps.sh` need them
in-tree. `INVENTORY.md` is what makes `vault` authoritative: it indexes them rather than
duplicating them, so there is one place to look and no divergent copies.

### The irreducible set — what can NEVER live in OpenBao

| # | Secret | Home | Why it can't be in OpenBao |
|---|---|---|---|
| 1 | `age.key` | operator laptop, gitignored | Decrypts everything below |
| 2 | `talos/talsecret.sops.yaml` | cluster repo | Cluster PKI — predates any workload |
| 3 | `Secret/sops-age` | cluster repo | Flux cannot decrypt anything without it |
| 4 | `cluster-secrets` / `shared-secrets` | cluster repo | Flux `postBuild` substitution source |
| 5 | GitHub deploy key | `vault/bootstrap/<cluster>/` | Flux cannot sync git without it |
| 6 | alpha-site static unseal key | `vault/bootstrap/openbao/` | Unseals the thing that unseals OpenBao |
| 7 | transit approle | `vault/bootstrap/openbao/` | Needed *to* unseal |
| 8 | OpenBao recovery shares | `vault/bootstrap/openbao/` | Root-token regeneration |
| 9 | CNPG credential for the `openbao` DB | `vault/bootstrap/openbao/` | OpenBao cannot hold the password to its own storage |
| 10 | Pulumi approle + `PULUMI_CONFIG_PASSPHRASE` | `vault/bootstrap/openbao/` | Pulumi must authenticate before it can read anything |

---

## D. vals adoption

### What changes

**Reference syntax.** `op://Eris/<Item>/<field>` → `ref+openbao://secrets/<path>#/<field>`.
Bootstrap-tier values use `ref+sops://bootstrap/<file>.sops.yaml#/<key>`. One syntax, two tiers.

**1. The Docker/Dockge pipeline** (`home-operations`). The pipeline at
`components/DockgeLxc.ts:616-639`, reduced over every file at `DockgeLxc.ts:847`, keeps its
shape. Only the *last* stage changes: `replaceOnePasswordPlaceholders` is replaced by a batched
`vals eval` pass.

⚠️ **Preserve the two-phase ordering.** `${APP}` and `${CLUSTER_KEY}` are prepended at
`DockgeLxc.ts:792` and must substitute *before* the reference resolver, because paths like
`ref+openbao://secrets/clusters/${CLUSTER_KEY}/apps/${APP}/oidc#/client_id` are composed
dynamically. This is documented in-code at `DockgeLxc.ts:788-791` and is the single easiest
thing to break.

Implementation: collect all `ref+` strings across a stack's files into one YAML doc, invoke
`vals eval` **once**, map results back, and wrap every resolved value in `pulumi.secret()`.
One subprocess per stack, not per file.

Keep the guard at `docker/_common/postgres/provision.sh:48-56` — retarget it from `op://` to
`ref+` so an unresolved reference still fails loudly instead of becoming a literal password.

**2. Laptop / CI env.** `op run --no-masking -- dotnet run` in
`equestria-cluster/.mise/tasks/do-update.cs` becomes `vals exec -f env.yaml -- dotnet run`.
`.config/mise.toml` `[env]` values change from `op://Eris/…` to `ref+openbao://…`, except
`PULUMI_CONFIG_PASSPHRASE` and the OpenBao approle themselves, which become `ref+sops://`.
Same change in `home-operations/.config/mise.toml`, `home-operations/dashboard/.mise.toml`
(22 refs, including the one `op://Development/…` from a second vault), and
`vault/.config/mise.toml`.

**3. Pulumi reads.** `VaultStore` (`components/store/index.ts`) is the correct seam — every stack
goes through `globals.store`, so reimplementing its ~12 public methods against OpenBao covers all
reads without touching a single stack file. Collapse the duplicate OPClient
(`components/op.ts` ↔ `components/store/op.ts`, near-verbatim copies, both live) **before**
porting, or the work doubles.

### What vals does NOT replace

- **In-cluster injection stays ESO.** `vals` is a CLI/library; it does not run in the cluster.
  ExternalSecrets keep their shape and only swap `secretStoreRef` and the key.
- **Flux `postBuild` envsubst stays.** The `${VAR}` layer is orthogonal and still needed.
- **`scripts/eso-values-lint` stays** and must keep covering the new OpenBao-era manifests.

---

## E. Break-glass to alpha-site

**Two separate containers on alpha-site**, not one:

- **`bao-transit`** — single-node, `seal "static"` (key file from
  `vault/bootstrap/openbao/alpha-site-static-unseal.sops.yaml`), transit engine only, tiny
  storage. Unseals equestria.
- **`bao-standby`** — **stopped by default.** Started only during break-glass, restores the
  nightly dump, unseals via transit, serves reads.

**Replication CronJob** — new `kubernetes/apps/kube-system/openbao-replica/`, modeled directly on
`kubernetes/apps/database/postgres/backups/` (app-template `type: cronjob`, `configMapGenerator`
script mount, NFS persistence). Schedule `0 3 * * *`. Steps:

1. `pg_dump` the `openbao` database.
2. Pipe through `age -r <the three estate recipients>`.
3. Write to alpha-site over Tailscale using `${ALPHA_SITE_TAILSCALE_IP}` — already present in
   `shared-secrets.sops.yaml` and referenced nowhere else in `kubernetes/` today.
4. Prune to a 30-day retention.
5. Emit a success timestamp for a Gatus/Prometheus check.

**Why age-encrypt a dump that is already ciphertext:** OpenBao encrypts values before they reach
Postgres, so the dump is not plaintext. The age layer is a second, independent lock so that
possession of alpha-site alone — which also hosts the transit key — is not sufficient. This is
the mitigation for the residual risk in §H.

**Monthly verification job** — restore into a scratch Postgres, start a throwaway bao, unseal via
transit, read a canary KV key, report. An unverified backup is not a backup.

**Runbook** at `vault/bootstrap/RUNBOOK.md`: the exact sequence to bring `bao-standby` up, the
order of key material required, and how to re-point ESO at it.

---

## F. Conversion script

**Placement:** `home-operations/scripts/op-to-bao/` in TypeScript, reusing the existing
`OPClient` (it already has `findItemsByTag`, `getItemByTitle`, `listItemsByTitleContains`) plus
a new `BaoClient`.

**Two-step, never blind:**

1. `--plan` → walks vault `Eris`, emits `mapping.yaml` with one row per item:
   source title/UUID/tags → proposed path, field list, concealed-field list, file list.
   **This file is committed and hand-reviewed.** Slug collisions and the awkward titles
   (`Cluster: Alpha Site`, `Cloudflare (driscoll.tech)`, the four UUID-addressed items) get
   fixed here by a human.
2. `--apply` → reads `mapping.yaml`, writes to OpenBao. Idempotent via KV v2 CAS. Handles
   sections → nested objects, `"add more"` hoisting, files → `{content_b64, filename, sha256}`,
   tags → path prefix, concealed fields → `custom_metadata.concealed_fields`.

Plus `--verify`: reads both sides and diffs, field by field. This is what gates each cutover
phase and what runs on a schedule during dual-run to catch drift.

---

## G. Staged migration

Dual-run throughout: **1Password stays authoritative and untouched until Phase 11.** Rollback for
Phases 1–10 is `git revert`.

| Phase | Work | Verify |
|---|---|---|
| **0** | Collapse duplicate OPClient; retarget the `provision.sh` guard; no behavior change | `pulumi preview` clean on all stacks |
| **1** | `vault` becomes a SOPS repo: `.sops.yaml`, `bootstrap/`, `INVENTORY.md`, `RUNBOOK.md` | `sops -d` round-trip; `hk` pre-commit passes (exclusions hold) |
| **2** | `bao-transit` on alpha-site; static seal; transit key created; key material → `vault/bootstrap/` | `bao status` from equestria over Tailscale |
| **3** | CNPG `openbao` DB (`components/postgres` + `task update`); OpenBao HelmRelease; init; auth methods; policies. **No consumers yet.** | `flux-local test --enable-helm --all-namespaces --path ./kubernetes/flux/cluster`; `bao status` shows 3 nodes, 1 active |
| **4** | Conversion script; `--plan`; review `mapping.yaml`; `--apply`. Dual-run begins. | `--verify` clean |
| **5** | Replication CronJob + `bao-standby` + monthly restore test | First restore test green |
| **6** | equestria ESO cutover. ~~6a: `ClusterSecretStore/openbao` + the `eso-equestria` kubernetes auth role~~ ✅. ~~Migrate the ExternalSecret refs~~ ✅ **89 on OpenBao, 1 left** (`meilisearch-env`, pending its master key). Remaining: **convert the 22 `OnePasswordItem` CRs** | `flux-local test`; `kubectl get externalsecret -A` all `SecretSynced`; `eso-values-lint` green. Also compare each Kustomization's `lastAppliedRevision` against the source — Ready=True can hide a stuck apply |
| **7** | SGC cutover. ~~`ClusterSecretStore/openbao` + a SECOND kubernetes auth mount~~ ✅ — one mount pins one `kubernetes_host`, so it cannot be shared with equestria. ~~34 ExternalSecrets~~ ✅ **31 done, 3 left**. ~~13 `OnePasswordItem` CRs~~ ✅ **all 13, none remain**. Remaining: the 3 Backblaze consumers, which are a REMOVAL not a migration — see §G-7 below | same, plus `kubectl get clustersecretstore openbao` = `Valid`, which is the only proof the cross-cluster login works |
| **8** | `home-operations` Pulumi: ~~`BaoStore` replaces `VaultStore`~~ ✅ (#713, behind `BAO_STORE_READS`, all 8 stacks verified identical); `vals` replaces the resolver; **split write-back** — secrets → OpenBao, ~~inventory → stack outputs + `StackReference`~~ **impossible, see §G-8** → inventory goes to `secrets/clusters/_inventory/*` and cluster definitions become checked-in YAML ✅ (#715); retire `dynamic/1password/`. **8a (early, before 6–7):** the stacks that *generate* credentials write them straight into OpenBao at the canonical paths — `*-oidc-credentials` → `secrets/clusters/<key>/apps/<app>/oidc`, PBS users (`Proxmox Backup Server*`, `*PBS Backup User`) → `secrets/hosts/pbs/…` — because Phase 4 deliberately does not migrate these families (estate decision 2026-08-07) | `pulumi preview` per stack, diff-by-diff; for 8a, `bao kv list secrets/clusters/<key>/apps` shows every generated oidc path |
| **9** | `vault` repo Pulumi stack cutover (same `components/store/` shape) | `pulumi preview` |
| **10** | Retire the 256 PushSecrets — point `App.cs` (both clusters) and `scripts/restore-databases.sh` at CNPG secrets / OpenBao directly instead of round-tripping through a secret store | Backup job runs green |
| **11** | **Hand over, don't tear down.** Stop *writing* to 1Password; remove `ClusterSecretStore/onepassword-connect` from all `secretStoreRef`s; leave the Connect HelmReleases, the `1password` HelmRepository, and the `Eris` items running as a frozen fallback | No manifest references `onepassword-connect`; `pulumi preview` shows no `OnePasswordItem` resources |

**1Password is not being decommissioned.** It stays for browser-fill logins, recovery codes, and
personal-scope credentials — it simply stops being infrastructure source of truth. Consequences:

- The Connect HelmReleases in both clusters, `kubernetes/flux/meta/repos/1password.yaml`, and the
  `onepassword-connect` bootstrap secret all **stay**.
- The `op://Development/GitHub Personal Access Token/token` reference at
  `home-operations/dashboard/.mise.toml:19` **stays as-is** — personal-scope, out of scope.
- No mass credential rotation. Items that were infrastructure source of truth now exist in both
  stores; freeze them (stop writing) rather than deleting, and let them age out. Rotate
  individually only where a credential's exposure actually warrants it.
- Because both stores stay live, mark the 1Password side clearly as historical — a tag or title
  prefix — so nobody re-adopts a stale item six months from now.

### §G-7 — SGC's auth, and the three that are not migrations

**SGC needs its own auth mount, and every future cluster will too.** A `kubernetes`
auth mount pins a single `kubernetes_host` and OpenBao validates each login by calling
TokenReview against exactly that API server, so one mount cannot serve two clusters.
`auth/kubernetes` is configured with `https://kubernetes.default.svc:443` — equestria's
own API server — so SGC gets `kubernetes-sgc`, dialled at SGC's API server by IP.

It carries **no `token_reviewer_jwt`**. The usual cross-cluster recipe stores a
long-lived `system:auth-delegator` token inside the auth config, which is a permanent
credential in the place this migration exists to empty. Omitting it makes OpenBao review
the *client's own* token, so the only grant needed is `system:auth-delegator` on the
consuming ServiceAccount, declared in that cluster's repo. `disableLocalCaJwt: true` is
required alongside it — left false, OpenBao prefers the CA and token in its own pod,
which belong to equestria, and every SGC login fails TLS.

The mount is a Pulumi resource (`home-operations components/openbao/clusterAuth.ts`),
cluster-agnostic: the stack supplies key, title and API address. **Adding any future
cluster costs one root ceremony**, because the `pulumi` policy grant for a new mount is
an admin write.

**The three remaining SGC ExternalSecrets are a REMOVAL, not a Minio switch.** Verified
against what equestria actually did rather than assumed:

| ExternalSecret | equestria precedent | Why |
|---|---|---|
| `tailscale-system/tailscale-resources-secret` | **deleted** (#3093) | Rendered a restic B2 config nothing has consumed since 2026-03-12. Confirmed identically dead in SGC: no ReplicationSource/Destination, no pod volume, no manifest reference outside its own file, and `recorder.yaml` — the only thing that would need backups — commented out of the kustomization. |
| `database/postgres-backup-config` | **Backblaze extract dropped** (#3092) | Not switched to Minio — it was *already* Minio. `endpointURL` is `http://truenas.driscoll.tech:9000` in both clusters; only the bucket NAME still came from the Backblaze item, pointed at a Minio endpoint. That is the vault#119 mismatch. |
| `database/postgres-values` | same | Same file, same fix: drop the `${BACKBLAZE_DATABASE}` extract and the `[backblaze]` rclone block, and replace `{{ .backblaze_bucket }}-restore` with `${BACKBLAZE_DB_BUCKET}-restore`. |

The substitution is byte-safe in SGC exactly as it was in equestria:
`BACKBLAZE_DB_BUCKET` is `stargate-command-db` and the live rendered bucket is
`stargate-command-db-restore`. (equestria's pair: `equestria-db` → `equestria-db-restore`.)
SGC has no equivalent of the empty `backblaze-db-access-key` Secret equestria deleted
separately.

So the B2/Backblaze exclusion decided on 2026-08-07 never needs reversing for SGC —
these three stop referencing Backblaze rather than importing a B2 credential.

### §G-8 — why inventory cannot use `StackReference`, and what replaced it

PLAN was written assuming one Pulumi backend. There are seven: **every stack directory sets
its own `PULUMI_BACKEND_URL`** (`s3://home-operations/home`, `.../authentik`, and so on).
Confirmed with `pulumi stack ls` in each — `stacks/home` sees only `home-operations`, and
`stacks/authentik` only `authentik`. A `StackReference` resolves inside the CURRENT backend,
so no consumer can reference a producer. All three inventory flows cross backends:

| Inventory | Produced by | Consumed by |
|---|---|---|
| `Authentik Outputs` | `stacks/authentik` | home, ocracoke, gulf-of-mexico, applications |
| `tailscale-export` | `components/tailscale.ts` (home, ocracoke, gulf-of-mexico) | unifi-network |
| `backup-plan` | `BackupPlanOrchestrator` (backups, applications) | the three directors |

Consolidating is not a config edit either: `stacks/applications`, `stacks/authentik` and
`stacks/unifi-network` all declare `name: applications`, so one backend also means renaming
projects, which is state surgery on twelve stacks.

**Estate decision 2026-08-10:** route stack-produced inventory through
`secrets/clusters/_inventory/*` — the paths `mapping.yaml` already reserves — written by the
producing stack via the Vault provider, read back through `BaoStore`. **Cluster definitions
are not inventory at all**: nothing produces them, so they became checked-in YAML at
`/clusters` in home-operations, with only their two credential fields (`secret`,
`arcane_token`) in OpenBao. Backend consolidation is deferred; nothing depends on it.

**The ordering constraint this creates:** a stack-produced inventory value cannot be seeded
by a one-time copy without being stale by design. The dual-write must land AND the producing
stack must actually run before any consumer is switched — a consumer switched first reads an
empty object rather than erroring.

**Ordering constraints that must not be reordered:**

- Phase 2 before Phase 3 — equestria cannot unseal without the transit key existing.
- Phase 4 before Phases 6–9 — nothing can read OpenBao before data is in it.
- **Phase 8a before Phases 6–7** — the conversion skips the generated `*-oidc-credentials`
  and PBS families (the stacks will create them in OpenBao directly), so until the stacks
  actually do, those paths are EMPTY. Cutting an ESO consumer of an oidc secret over to
  `ClusterSecretStore/openbao` before 8a lands breaks that app's next secret refresh.
- Phase 6 before Phase 7 — SGC's store points at equestria's OpenBao.
- Phase 8 before Phase 10 — the PushSecrets exist to feed consumers that Phase 8 rewires.
- **Within Phase 8: dual-write, then `pulumi up` on the producer, THEN switch the reader.**
  See §G-8. This does not apply to static values (the cluster credentials), which a
  one-time script can seed safely.

**Non-Pulumi consumers that cannot use `StackReference`** and need explicit handling in Phase 8:
`kubernetes/apps/database/postgres/backups/resources/App.cs` in both clusters (uses the
`1Password.Connect.Sdk` NuGet package directly), `scripts/restore-databases.sh` (`op read`), and
any ExternalSecret pointing at a written-back item.

---

## H. Risks and open questions

1. **equestria's startup now depends on alpha-site.** With transit unseal, already-unsealed pods
   keep serving through an alpha-site outage, but restarting or newly-scheduled pods cannot
   unseal. Needs: retry/backoff on the seal stanza, a Gatus/Prometheus alert on `bao-transit`
   health, and a documented manual override. This is a real availability regression traded for
   key separation — worth accepting, worth monitoring.
2. **Co-location weakens the transit story.** `bao-transit` and `bao-standby` on the same host
   means possession of alpha-site yields both the ciphertext and the key that decrypts it. The
   mitigations are: `bao-standby` stays stopped by default, and the dump carries an independent
   age layer. The honest framing is that transit-unseal here buys *availability separation from
   the k8s cluster*, not key separation from the ciphertext.
3. **The transit key is now the estate's most critical secret.** Recommend backing up
   `bao-transit`'s entire storage plus its static unseal key into `vault/bootstrap/`, rather than
   creating the transit key `exportable = true` — an exportable key is retrievable by anyone with
   a read token, which is a strictly worse blast radius.
4. **SGC depends on equestria's OpenBao — accepted.** SGC is being folded into equestria, so a
   single OpenBao is the intended end state, not a compromise. It replaces today's circular
   `op-connect.sgc` ↔ `op-connect.equestria` arrangement with a directed one. The only standing
   requirement is that SGC's own bootstrap SOPS set stays sufficient to bring it up cold. No
   second OpenBao in SGC.
5. **`OnePasswordItem` CRs have no OpenBao equivalent** — 22 in equestria plus SGC's. All must
   become ExternalSecrets. This is mechanical but touches cert-manager, cloudflare-tunnel,
   external-dns, traefik/crowdsec, the tailscale operator, and the ARC runners — i.e. things that
   break loudly. Note this is the one place where keeping 1Password does *not* help: the
   1Password Operator and OpenBao cannot both serve the same resource, so these are a hard cutover
   even though Connect stays running.
6. **`custom_metadata` is a dead end for `vals` specifically.** ESO can read it via
   `metadataPolicy: Fetch`; `vals` cannot. The risk is someone later designing a `vals`-resolved
   value against metadata. Worth a comment in the KV layout doc.
7. **Both stores stay live, so drift is now a standing concern.** With 1Password retained, the
   same credential can exist in two places and diverge silently. The `--verify` mode of the
   conversion script (§F) should keep running on a schedule past Phase 11, or the 1Password side
   must be made demonstrably read-only.

---

## Verification

Per phase, in order of cheapness:

```sh
# equestria / sgc — before every push touching kubernetes/
flux-local test --enable-helm --all-namespaces --path ./kubernetes/flux/cluster -v

# ESO health after Phases 6/7
kubectl get externalsecret -A          # every one SecretSynced
kubectl get clustersecretstore openbao # Valid

# OpenBao health after Phase 3
bao status                             # 3 nodes, 1 active, unsealed
bao kv get secrets/shared/cloudflare-driscoll-tech

# home-operations / vault — before every deploy
pulumi preview                         # per stack; expect zero diffs where none intended

# data parity during dual-run (Phases 4–10, and on a schedule after)
npm run op-to-bao -- --verify

# end state — 1Password stays running, so this checks that nothing *depends* on it,
# not that it is gone. Expect hits only in the retained Connect app and the
# personal-scope Development reference in dashboard/.mise.toml.
grep -rn 'onepassword-connect' --include='*.yaml' kubernetes/   # no secretStoreRef / OnePasswordItem hits
grep -rn 'op://Eris' .                                          # empty across all four repos
```

The CI jobs in `.github/workflows/flux-local.yaml` — including `eso-values-lint`, which guards
the four-stage templating interaction — must stay green throughout and must be extended to cover
the new OpenBao manifests.
