# 04 — Pulumi state backend: Minio-on-truenas → Postgres DIY on celestia

Piece **D** of [vault#84](https://github.com/david-driscoll/vault/issues/84) ·
[Decision D2](README.md#decision-ledger) · depends on
[03 — secrets bootstrap independence](03-secrets-bootstrap-independence.md) (the `op`
break-glass path is what makes a mid-migration backend failure recoverable at all) · read
[README.md](README.md) first for the overall plan and cross-cutting rules.

> **Standalone note.** This file assumes nothing from vault#84 beyond what's quoted here. Every
> repo claim below was re-verified live against this worktree and the `vault` repo on
> **2026-08-13**; anything from the discovery comments (2026-07-29 / 2026-07-31) is labelled
> with its source and re-checked against today's tree, not copied forward blind.

## 1. What this delivers

Move the Pulumi state backend for every stack from the Minio bucket on `truenas.driscoll.tech`
to a Postgres database on **celestia's** Dockge LXC, using Pulumi's `postgres://` DIY backend
(`[PREVIEW]` in the CLI, shipped since `v3.176.0`). Minio is **not** decommissioned — it becomes
a periodic `pulumi stack export` checkpoint archive, versioned, kept as the belt-and-braces
path back to a known-good file backend for as long as the Postgres backend carries the
`[PREVIEW]` label.

**Why this is worth doing at all**, verified as of today: `spike` (the TrueNAS VM behind
`truenas.driscoll.tech`, provisioned at `stacks/home/index.ts:64-70`) currently hosts the Pulumi
state Minio bucket, the VolSync restic repository, the `nfs-csi` backing share, the Thanos
object-storage bucket, and `/spike/data/pgdump/` / `/spike/backup` (celestia's PBS datastore
mount). **No `stacks/backups/index.ts` backup plan references the Minio dataset** — verified
below (§2.4). If spike is the thing being rebuilt, the estate has neither the Pulumi state nor a
backup of it. That single-machine fate-sharing is the actual argument for this move, independent
of direction (SGC→equestria or the reverse) and independent of the merge happening at all.

## 2. Current state — verified 2026-08-13

### 2.1 Every Stack CR, and what it points at today

Ten `kind: Stack` custom resources exist, **all in `home-operations`**
(`kubernetes/apps/pulumi/`), even though one of them (`vault`) sources its Pulumi *program*
from the separate `vault` repo:

| Stack CR | `dir:` | `stack:` | `backend:` (today) |
|---|---|---|---|
| `kubernetes/apps/pulumi/authentik/stack.yaml` | `stacks/authentik` | `authentik` | `s3://home-operations/authentik?...` |
| `kubernetes/apps/pulumi/backups/stack.yaml` | `stacks/backups` | `backups` | `s3://home-operations/backups?...` |
| `kubernetes/apps/pulumi/gulf-of-mexico/stack.yaml` | `stacks/gulf-of-mexico` | `gulf-of-mexico` | `s3://home-operations/gulf-of-mexico?...` |
| `kubernetes/apps/pulumi/home-operations/stack.yaml` | `stacks/home` | `home-operations` | `s3://home-operations/home?...` |
| `kubernetes/apps/pulumi/ocracoke/stack.yaml` | `stacks/ocracoke` | `ocracoke` | `s3://home-operations/ocracoke?...` |
| `kubernetes/apps/pulumi/system/stack.yaml` | `stacks/system` | `system` | `s3://home-operations/backups?...` **← see §2.2** |
| `kubernetes/apps/pulumi/unifi-network/stack.yaml` | `stacks/unifi-network` | `unifi-network` | `s3://home-operations/unifi-network?...` |
| `kubernetes/apps/pulumi/applications/equestria.yaml` | `stacks/applications` | `equestria` | `s3://home-operations/applications?...` |
| `kubernetes/apps/pulumi/applications/sgc.yaml` | `stacks/applications` | `sgc` | `s3://home-operations/applications?...` |
| `kubernetes/apps/pulumi/vault/stack.yaml` | `stacks/vault` (in the **`vault`** repo) | `vault` | `s3://home-operations/vault?...` |

All ten resolve to `endpoint=truenas.driscoll.tech:9000&s3ForcePathStyle=true&disableSSL=true`
against a single bucket, `home-operations`, with different key prefixes per stack (`equestria`
and `sgc` deliberately share the `applications` prefix — they are two stacks of one Pulumi
*project*, distinguished by stack name inside it, exactly as Postgres will distinguish them by
row rather than by prefix). This matches the "ten stacks" figure in [Expansion
v2.1](https://github.com/david-driscoll/vault/issues/84) §1.3 — re-counted directly against the
tree today, not taken on faith.

The operator is **`pulumi-kubernetes-operator` v2.8.0**
(`kubernetes/apps/pulumi/pulumi-operator/helmrelease.yaml:11`, `oci://ghcr.io/pulumi/helm-charts/pulumi-kubernetes-operator`).
The repo pins Pulumi CLI `3.256.0` in `.config/mise.toml:20` and workspace pods run
`ghcr.io/pulumi/pulumi-nodejs:3.254.0` (every `stack.yaml`) — both comfortably past the
`postgres://` backend's introducing version.

### 2.2 A live discrepancy, found during verification — resolve before migrating

`kubernetes/apps/pulumi/system/stack.yaml:18` sets the **operator's** backend for the `system`
stack to `s3://home-operations/backups?...` — the same prefix the `backups` stack uses. But
`stacks/system/.mise.toml:3` sets `PULUMI_BACKEND_URL = "s3://home-operations/system?..."` for
**local** runs of the same stack — a different prefix. Every other stack's local `.mise.toml`
matches its operator `stack.yaml` exactly (`authentik`, `backups`, `gulf-of-mexico`, `home`,
`ocracoke`, `unifi-network`, `applications`, and the `vault` repo's own `stacks/vault/.mise.toml`
all agree with their Stack CR). Only `system` disagrees.

This means the operator's in-cluster reconciliation of `system` and a local `pulumi up
--stack system` run today write to **two different state locations** in the same bucket. One of
them holds the real, current `system` state (it publishes `clusters/<key>/details`, which
`BaoStore.getAllClusters` and every other stack read — see `stack.yaml`'s own comment on why it
has no `prerequisites`); the other is either stale or empty. **Determine which with `mc ls` or
`pulumi stack export` against both `home-operations/system/` and `home-operations/backups/` in
the truenas bucket before this stack's state moves** — migrating the wrong one silently loses
the `clusters/*` outputs every other stack depends on. This is exactly the kind of
prefix-collision trap the `import:` audit in [05](05-import-audit.md) exists to catch, found one
piece early because the backend migration reads every `backend:`/`PULUMI_BACKEND_URL` pair
directly.

### 2.3 The local-run mechanism today, and its trap

Root `.config/mise.toml [env]` sets the Minio credentials for every local run —
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` as `ref+openbao://secrets/shared/minio-root-user#/…`
literals (`.config/mise.toml:67-68`) — plus `PULUMI_CONFIG_PASSPHRASE` the same way (line 79) and
`CONNECT_HOST = "https://op-connect.sgc.driscoll.tech/"` (line 80, **still SGC-pointed as of
today** — the repoint [03](03-secrets-bootstrap-independence.md) makes). Each stack directory
additionally carries its own `stacks/<name>/.mise.toml` with a stack-specific
`PULUMI_BACKEND_URL` literal (§2.1's table) and `PULUMI_STACK`.

**The trap, confirmed against the actual mechanism**: mise's `[env]` table is re-evaluated on
every shell load with no caching (`.config/mise.toml:58-61`, comment is explicit about why), so
`ref+openbao://…` values are deliberately left **unresolved** in the environment — running
`pulumi` directly sees the literal string `ref+openbao://secrets/shared/minio-root-user#/username`
as its access key, not a real credential. The actual entrypoint is the mise task at
`.config/mise/tasks/vals-run` (`mise run vals-run -- pulumi preview`), which harvests every
`ref+…` value out of the environment into a temp file and hands it to `vals exec` before
running the wrapped command. **The comment inside `.config/mise.toml` itself is stale** — it
says `scripts/vals-run`, but that file does not exist; the real one is the mise task
(confirmed via `find`: no `scripts/vals-run`, only `.config/mise/tasks/vals-run`). A second,
compounding trap: exporting a variable by hand and then invoking `mise exec`/`mise run` does
**not** protect it — mise's own `[env]` re-application can clobber a manually-exported value of
the same name, so a smoke test that hand-exports `PULUMI_BACKEND_URL=postgres://…` and then
calls `mise run vals-run -- pulumi …` may see the *old* `.mise.toml` value win instead. The safe
way to change what a local run sees is to edit the `.mise.toml` file itself, not to export
around it.

For a laptop with `KUBECONFIG` unset and both clusters down, the additional prerequisite is
`bootstrap/openbao/pulumi-env.sh` in the **vault** repo — `eval
"$(../vault/bootstrap/openbao/pulumi-env.sh)"` exports `BAO_ADDR`/`BAO_ROLE_ID`/`BAO_SECRET_ID`
(from `vault/bootstrap/openbao/pulumi-approle.sops.yaml`, decrypted with the local age key) plus
a minted `VAULT_TOKEN`, which `vals` needs to resolve `ref+openbao://` at all. This is the
break-glass path [03](03-secrets-bootstrap-independence.md) hardens; this piece depends on it
being in place, because a Postgres-backend smoke test run from a laptop needs exactly the same
bootstrap.

### 2.4 The backup story, verified end to end

`stacks/backups/index.ts` builds one backrest plan **per Dockge host** (the `dockgeInstances`
loop, lines 10-59) that rsync-pulls `/opt/stacks-data/` from each host over SFTP and
restic-snapshots it, excluding a fixed list of paths — `/postgres/pgdata` among them (line 37,
with a comment explaining why: a file-level copy of a running Postgres data directory is torn,
not crash-consistent). **`/postgres/dumps` is deliberately not excluded.**

`docker/_common/postgres/compose.yaml` runs three services alongside the celestia (and
alpha-site/luna/skystar) shared Postgres: `postgres` itself, `postgres-provision` (idempotent
role+database reconciler, `docker/_common/postgres/provision.sh`), and `postgres-backup`
(`docker/_common/postgres/backup.sh`) — the last one runs `pg_dumpall --globals-only` plus a
`pg_dump -Fc` of **every non-template database on the instance**, nightly, into
`/opt/stacks-data/postgres/dumps`, with 14-day local retention (restic keeps the long tail).

**The consequence that matters for this piece: adding a new database to celestia's shared
Postgres instance requires zero changes to `stacks/backups/index.ts`.** The per-host backrest
plan already covers `/opt/stacks-data/` wholesale (minus the excluded live `pgdata`), and
`postgres-backup` already dumps every database on the instance without per-database
configuration. `docker/celestia/postgres/.env-local` already provisions one consumer this way —
`PGAPP_FORGEJO_PASSWORD` — which is the worked, live example this piece follows for `pulumi`.
This is a stronger and more precise finding than "a two-line addition to
`stacks/backups/index.ts`" (the framing in the discovery comments) — verified against the actual
file, the addition needed there is **zero lines**; the addition needed is one line in
`docker/celestia/postgres/.env-local`.

A second, separate backrest plan (`stacks/backups/index.ts:74-82`, source `celestia`, path
`/spike/data/pgdump/`) backs up CNPG's (Kubernetes-side) logical dumps and is unrelated to this
piece — see §7 for why that Postgres is a different database entirely.

### 2.5 Reachability — the gap the discovery comments didn't check

`docker/_common/postgres/compose.yaml` publishes **no ports** for the `postgres` service — its
own `.env` file says so explicitly: "no published ports and no traefik labels... reachable only
from `dockge_default`", i.e. only from other containers on the same Docker host. Today's only
consumer (forgejo) runs as a container on celestia itself, so this has never mattered. A Pulumi
workspace pod (running in equestria's `pulumi` namespace) and a laptop running `pulumi preview`
are both **outside** that Docker network — neither can reach `postgres:5432` as it stands. This
is a real gap the design must close, not a detail the discovery comments verified; §4 below is
the concrete fix, built entirely from precedent already in this repo.

## 3. Design decisions

Recapping [Decision D2](README.md#decision-ledger) with the reasoning, re-verified today:

- **Postgres over Minio.** Converts an unbacked-up blob directory into a database the estate's
  existing `pgdump`/backrest/PBS chain covers automatically (§2.4). Locking and transactional
  writes are a bonus, not the argument.
- **celestia over alpha-site.** alpha-site is the documented non-production test target
  (`CLAUDE.md`: "Test risky changes against a non-production stack (alpha-site) first") and,
  once [07](07-authentik-to-alpha-site.md) lands authentik there, alpha-site is also the
  estate's identity tier. [Expansion v2.1](https://github.com/david-driscoll/vault/issues/84)
  §1.4 measured that the Pi + USB SSD could technically carry both authentik's database and a
  Pulumi Postgres backend, then rejected doing so anyway: *"you can put identity on the Pi, or
  state on the Pi, but not both"* — concentrating the artifact needed to rebuild everything onto
  the box deliberately used for risky experiments (and, after 07, also holding SSO) repeats the
  §1 spike-concentration mistake this piece exists to fix. celestia is x86, 16 cores / 12 GiB
  total (8.3 GiB available, 2.5% CPU per the same measurement pass), and already runs backrest
  and the PBS datastore.
- **`spec.backend` omitted, `envRefs.PULUMI_BACKEND_URL` used instead — not a preference, a
  constraint.** A `postgres://user:pass@host/db` URL embeds the password; the operator's
  `backend:` field is a literal string that lands in git. [Expansion
  v2.1](https://github.com/david-driscoll/vault/issues/84) §1.5 verified this is safe against
  the operator's actual Go source (`pulumi-kubernetes-operator` v2.8.0,
  `internal/controller/pulumi/stack_controller.go`): `setupWorkspace` only appends a
  `PULUMI_BACKEND_URL` env var from `sess.stack.Backend` **when that field is non-empty**, and
  `SetEnvRefsForWorkspace` unconditionally appends every `envRefs` entry to the same env slice
  afterward — so an omitted `backend:` plus an `envRefs.PULUMI_BACKEND_URL` of type `Secret`
  lands cleanly with no conflict and no duplicate. This is a **source read, not a live test**,
  and the source itself says so; §5 makes the one-stack smoke test the literal first action of
  the migration, not an afterthought.
- **Minio retained as a `stack export` archive, not decommissioned.** `[PREVIEW]` status on the
  Postgres backend deserves a documented path back to a known-good file backend. §6 designs the
  periodic export job.

## 4. Making celestia reachable — built entirely from existing precedent

Every piece below mirrors a pattern that already exists in this repo for a different consumer;
none of it is invented from scratch.

### 4.1 Provision the database — the "estate way", already proven on this exact host

`docker/celestia/postgres/.env-local` today contains exactly one line:

```
PGAPP_FORGEJO_PASSWORD="ref+openbao://secrets/shared/forgejo#/postgres_password"
```

`components/DockgeLxc.ts:704` merges `docker/_common/<stack>/` and `docker/<host>/<stack>/` by
relative path per file (`getStackFiles`, lines 803-849: host files win per-path, common files
fill the rest), so this one line is layered onto the common `compose.yaml`/`provision.sh`
unchanged. `provision.sh` (docker/_common/postgres/provision.sh:30-32) turns
`PGAPP_<NAME>_PASSWORD` into a login role and database both named `<name>` lowercased. Add:

```
PGAPP_PULUMI_PASSWORD="ref+openbao://secrets/shared/celestia-pulumi-postgres#/password"
```

This creates role+database `pulumi` on the next `postgres-provision` run (every stack start,
idempotent) — no `compose.yaml` change needed for provisioning itself.

### 4.2 Publish the port — a host-level override, matching the documented pattern

The shared `docker/_common/postgres/compose.yaml`'s own comment anticipates this: *"A host that
does have consumers overrides this whole file... `docker/celestia/postgres/.env` is the worked
example"* (the comment is slightly stale — today celestia only overrides `.env-local`, not a
full `.env` — but the override mechanism it describes is real and file-scoped). Publishing
`5432` only for celestia, not for every `_common/postgres` consumer (alpha-site, luna, skystar),
means adding a **celestia-specific `docker/celestia/postgres/compose.yaml`** — a full copy of
the common file with one addition to the `postgres` service, following the exact style already
used for forgejo's SSH port (`docker/celestia/forgejo/compose.yaml:92-95`, published
`"2222:2222"` with no traefik label, admin-only ACL grant) and zot's registry port
(`docker/celestia/zot/compose.yaml:4-5`):

```yaml
    ports:
      - "5432:5432"
```

Publishing binds to all of the LXC's interfaces, including its Tailscale one — the estate's
existing convention (forgejo's `2222` is bound the same unrestricted way; access is controlled
by the ACL grant, not by the docker bind address). **Maintenance note, stated up front because
it bit the `.env` example already**: this is a whole-file override, so it must be kept in sync
with `docker/_common/postgres/compose.yaml` by hand — a future edit to the common file (a new
healthcheck, a resource limit change) will not propagate here automatically.

### 4.3 Route the Pulumi workspace pod to it — the exact mechanism already in use

`kubernetes/apps/pulumi/kubeproxies/services.yaml` exists **for this purpose already**, verified
by its own comments: *"Allows pulumi workspace pods to reach the equestria Kubernetes API server
over Tailscale"*, via an `ExternalName` Service in the `pulumi` namespace annotated
`tailscale.com/tailnet-fqdn` + `tailscale.com/proxy-group: tailnet-inbound`. Add a third entry:

```yaml
---
# ExternalName service routing to celestia's shared Postgres via the tailnet-inbound egress
# ProxyGroup. Allows pulumi workspace pods to reach the Pulumi state backend over Tailscale.
apiVersion: v1
kind: Service
metadata:
  name: celestia-pulumi-postgres
  namespace: pulumi
  annotations:
    tailscale.com/tailnet-fqdn: "dockge-celestia.${TAILSCALE_DOMAIN}"
    tailscale.com/proxy-group: tailnet-inbound
spec:
  type: ExternalName
  externalName: celestia-pulumi-postgres
  ports:
    - name: postgres
      port: 5432
      targetPort: 5432
```

`dockge-celestia` is celestia's Dockge LXC's own Tailscale device name, derived directly from
`components/helpers.ts:68-73` (`getContainerHostnames("dockge", host, globals)` →
`` `${name}-${host.shortName ?? host.name}` ``; celestia's `ProxmoxHost` sets no `shortName`, so
it falls back to `celestia`). No new Kustomization is needed — `kubernetes/apps/pulumi/kubeproxies/kustomization.yaml`
already lists `services.yaml` as its only resource, and `ks.yaml` already substitutes
`${TAILSCALE_DOMAIN}` from the `shared-secrets` Secret.

Workspace pods then reach the backend at
`celestia-pulumi-postgres.pulumi.svc.cluster.local:5432` — in-cluster DNS resolves the
`ExternalName`, and the `tailnet-inbound` ProxyGroup (whose devices carry `tag:egress` —
`stacks/unifi-network/acl-manager.ts:418`) carries the connection onto the tailnet from there.

### 4.4 Grant the ACL — mirrors the existing `openbao-dump-replication` grant exactly

Today's Tailscale ACL grants no port `5432` to `tag:dockge` from anywhere (verified against
`components/constants.ts:64-96` and every `manager.setGrant` call in
`stacks/unifi-network/acl-manager.ts`). Two additions, both modelled on grants that already
exist for the same shape of problem:

In `components/constants.ts`, alongside `baoDumps: ["tcp:2023"]` (added for exactly this reason
— a Dockge-hosted service a cluster CronJob needs to reach, kept as its own capability rather
than folded into the broad `dockgeManagement` set):

```ts
pulumiPostgres: ["tcp:5432"] as TailscaleNetworkCapability[],
```

In `stacks/unifi-network/acl-manager.ts`, a grant shaped exactly like
`openbao-dump-replication` (lines 444-452 — same `src`/`dst`, same reasoning: *"the traffic
leaves through the tailnet-inbound ProxyGroup carrying `tag:egress`... without this grant the
connection is forwarded and then dies in the ACL"*):

```ts
manager.setGrant(
  "pulumi-postgres-egress",
  { src: [tag.egress], dst: [tag.dockge], ip: ports.pulumiPostgres },
  { accept: [] },
);
```

Local/break-glass runs need their own grant — today's admin grant
(`stacks/unifi-network/acl-manager.ts:155-162`) covers SSH, Proxmox, `dockgeManagement`,
Technitium, and PBS management ports on `tag.dockge`, but not `5432`. Add `...ports.pulumiPostgres`
to that grant's `ip` array (admin-only, matching the reasoning already given for `git`: this
port reaches a credential store for the entire estate's infrastructure, not a general service).

### 4.5 The secret, and the pattern it follows

`kubernetes/apps/pulumi/secrets/externalsecret.yaml` is the live, in-use pattern for exactly this
kind of secret — `truenas-home-operations` (lines 112-131) extracts `shared/minio-root-user`
from OpenBao via `ClusterSecretStore/openbao` into a Secret the Stack CRs' `envRefs` already
consume. `kubernetes/apps/pulumi/secrets/secret.yaml` documents why `PULUMI_CONFIG_PASSPHRASE`
is the **one** exception that must stay 1Password/SOPS-sourced (it's bootstrap-tier — Pulumi
needs it to decrypt its own state before it can authenticate to anything else). `PULUMI_BACKEND_URL`
is not in that category: it only says *where* to fetch the (still-encrypted) state blob from,
exactly the same tier as the `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair it replaces. So the
new secret follows `truenas-home-operations`, not `pulumi-operator-passphrase`:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: celestia-pulumi-postgres
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: openbao
  target:
    name: celestia-pulumi-postgres
    creationPolicy: Owner
    template:
      metadata:
        annotations:
          reloader.stakater.com/auto: "true"
      data:
        url: 'postgres://pulumi:{{ .password }}@celestia-pulumi-postgres.pulumi.svc.cluster.local:5432/pulumi?sslmode=disable'
  dataFrom:
    - extract:
        key: shared/celestia-pulumi-postgres
```

`sslmode=disable` mirrors the existing decision for the S3 backend
(`disableSSL=true` — the connection is already encrypted at the Tailscale/WireGuard layer, the
same reasoning that made `disableSSL=true` acceptable for the Minio endpoint). The OpenBao
secret at `shared/celestia-pulumi-postgres` (field `password`) is new — mint it the same way
`shared/docker-postgres` (the shared superuser password) and `shared/forgejo` were minted, and
reuse the **same value** for `docker/celestia/postgres/.env-local`'s `PGAPP_PULUMI_PASSWORD` in
§4.1, so both sides of the connection agree.

Every Stack CR's `envRefs` then gets:

```yaml
    PULUMI_BACKEND_URL:
      type: Secret
      secret:
        name: celestia-pulumi-postgres
        key: url
```

with the `backend:` line deleted.

## 5. Migration runbook

**Do not touch a stack's `backend:` before the ACL, the port, and the secret exist and have been
proven reachable.** Order:

1. **Land the plumbing with zero behavior change.** §4.1-§4.5, plus the ACL/constants changes,
   all merge and deploy while every `stack.yaml` still says `backend: s3://...`. Nothing reads
   `PULUMI_BACKEND_URL` yet.
2. **The live smoke test — the literal first action, not a formality.** From a laptop, with the
   OpenBao break-glass env exported (§2.3). Run this from **outside** the repo's working
   directory (e.g. `$HOME`, not a `home-operations` checkout) — mise's shell hook re-applies
   `[env]` by directory, and running it inside the repo tree is exactly the clobber trap §2.3
   warns about:
   ```
   PULUMI_BACKEND_URL='postgres://pulumi:<password>@dockge-celestia.driscoll.tech:5432/pulumi?sslmode=disable' \
     pulumi stack ls
   ```
   confirming reachability and auth outside the cluster, then repoint exactly **one**
   low-consequence stack's `.mise.toml` (e.g. `ocracoke` or `gulf-of-mexico` — not `system`,
   which §2.2 must resolve first, and not `home-operations`, `authentik`, or `applications`,
   which the rest of the plan is more sensitive to) and run a full local
   `pulumi preview`/`pulumi up` cycle through it. Only after this succeeds, flip that same
   stack's `stack.yaml` — `backend:` omitted, `envRefs.PULUMI_BACKEND_URL` added — and let the
   operator reconcile it. **This closes the one gap [Expansion
   v2.1](https://github.com/david-driscoll/vault/issues/84) §1.5 explicitly left open**: a
   source read proved the operator wiring is sound; this step proves the network path and the
   Postgres backend itself are too.
3. **Resolve the `system`/`backups` prefix mismatch (§2.2)** before migrating either. Export
   both `home-operations/system/` and `home-operations/backups/` from the Minio bucket, confirm
   which one is `system`'s real state, migrate that one, and archive the other under its own
   name rather than deleting it (it may be a stale write, but "stale" is a hypothesis, not a
   verified fact, until someone has looked).
4. **Migrate the remaining eight stacks one at a time**: `pulumi stack export --file
   <stack>.json` against the old Minio backend, `pulumi login postgres://...` then `pulumi stack
   import --file <stack>.json` against the new one (per-stack, so a bad import is caught before
   the next stack starts), then flip that stack's `.mise.toml` and `stack.yaml` together. Order
   by blast radius, cheapest first: `unifi-network`, `authentik`, `backups`, `applications`
   (`equestria` then `sgc`), `home-operations`, `vault` last (it also needs a
   `stacks/vault/.mise.toml` edit **in the `vault` repo**, a separate PR).
5. **Retire `kubernetes/apps/pulumi/history-pruner/cronjob.yaml`** once all ten stacks are on
   Postgres. It nightly-prunes `.pulumi/history/` under seven of the eight Minio prefixes it
   knows about (`applications authentik gulf-of-mexico home ocracoke unifi-network vault` —
   verified from the CronJob's own `PREFIXES` list; note it never covered `backups` or `system`
   either, a second small pre-existing gap, not one this piece needs to fix). Once nothing
   writes new update history to those prefixes, the job has nothing left to do; either delete it
   or repoint it at whatever Postgres-native history growth needs pruning later — out of scope
   for this piece, flagged for whoever owns steady-state operation after the migration.
6. **Confirm the `home-operations` Minio bucket resource is untouched.** `stacks/home/index.ts:33-45`
   creates it with `protect: true, retainOnDelete: true, import: "home-operations"` — none of
   that changes; the bucket keeps existing, it just stops being live per-stack state and starts
   being the export archive (§6).

## 6. Minio as the export archive

`stacks/home/index.ts:33-45` already declares the bucket that becomes the archive target;
nothing about the resource itself changes. What's new is a periodic job, following the same
shape as `history-pruner` (in-cluster CronJob, Minio client, credentials from
`truenas-home-operations`):

- **Schedule**: nightly, after the Postgres `pg_dump` on celestia (§2.4) but before
  `history-pruner`'s old slot, if it survives — no ordering dependency exists today between them,
  since after step 5 above one of the two is retired.
- **Mechanism**: for each of the ten stacks, `pulumi login postgres://...`, `pulumi stack export
  --stack <project>/<stack> --file -`, upload to
  `s3://home-operations/archive/<project>/<stack>/<timestamp>.json` via `mc pipe` or an
  equivalent S3 PUT. Requires the same `pulumi` CLI and Postgres credentials the workspace pods
  already have — this job's container image should match `ghcr.io/pulumi/pulumi-nodejs` rather
  than reinvent an export path in `mc`.
- **Versioning**: `stacks/home/index.ts` uses `@pulumi/minio` `^0.17.0`
  (`components/package.json:24`). No existing resource in this repo enables bucket versioning on
  any Minio bucket — **this is new territory, not a two-line change on a pattern already in
  use.** Confirm the exact resource/argument name against the installed `@pulumi/minio` provider
  schema before implementing (`pulumi package get-schema minio` or the registry docs); do not
  assume the S3-standard `versioning: {enabled: true}` shape carries over untested.
- **Off-box replication**: the discovery comments recommended B2. **Verified: this repo has no
  B2 integration today** — `sdks/` contains `authentik`, `pbs`, `tailscale`, `technitium`,
  `terrifi`, `unifi`; no `b2` directory exists despite `CLAUDE.md`'s directory listing mentioning
  one (aspirational, not built). Recommend the export archive ride celestia's **existing**,
  already-verified backrest→PBS chain instead (§2.4 — the same one that already covers celestia's
  Postgres dumps with zero new tooling) rather than standing up a new B2 path for this alone. If
  off-estate replication independent of celestia specifically is wanted later, that is a
  reasonable follow-on, not a prerequisite for closing this piece.
- **Import audit**: the bucket's permanent `import: "home-operations"` (`stacks/home/index.ts:43`)
  is [05](05-import-audit.md)'s concern, not this piece's — noted here only so nothing in this
  migration touches that line.

## 7. Not to be confused with: OpenBao's Postgres

This piece's database is **celestia's Docker-hosted Postgres** — a new, separate instance
reached over Tailscale, existing today only to serve forgejo. It has nothing to do with
**OpenBao's** Postgres, which is the shared **CNPG cluster running inside equestria**
(Kubernetes), completed in the 1Password→OpenBao migration
(`vault:docs/openbao-migration/STATUS.md`, phases 0-11 complete as of 2026-08-12 per repo memory)
and unrelated to Pulumi state. Do not route Pulumi state through the equestria CNPG cluster —
that would recreate exactly the single-point-of-fate-sharing problem (§1) this piece exists to
break, just against equestria instead of spike.

## 8. Rollback

Every step in §5 is reversible up to and including step 4 for any individual stack: `pulumi
stack export`/`import` back onto the Minio backend, revert that one stack's `.mise.toml` and
`stack.yaml`, and the operator reconciles against Minio again on its next resync. Nothing in
this piece deletes the Minio bucket, its data, or the S3 credentials — §5 step 6 is explicit that
the bucket resource is untouched. The failure mode to actually worry about is **corrupted or
diverged state**, not backend unavailability: if a `stack import` lands wrong (e.g., §2.2's
prefix confusion applied to the wrong side), the Minio primary is still there, untouched, as the
last-known-good copy, independent of whether the export-archive CronJob (§6) has run yet.

## 9. Exit criteria

- All ten Stack CRs have `backend:` omitted and `envRefs.PULUMI_BACKEND_URL` set; the operator
  reconciles each successfully at least once post-migration.
- A local `pulumi preview` against at least one migrated stack succeeds from a laptop with
  `KUBECONFIG` unset, through `mise run vals-run`, over the Tailscale path in §4.3/§4.4 — not
  just from inside the cluster.
- `docker/celestia/postgres` shows a `pulumi` database and role (`docker compose exec postgres
  psql -U postgres -c '\l'` on celestia), and a same-day `pulumi-*.dump` file appears under
  `/opt/stacks-data/postgres/dumps` after the next `postgres-backup` cycle.
- §2.2's `system`/`backups` prefix question is answered and recorded, not left ambiguous going
  into the merge.
- `history-pruner`'s CronJob is either retired or explicitly re-scoped (§5 step 5) — not left
  running against prefixes nothing writes to anymore, where its silence would look like health.
- The export-archive CronJob (§6) has produced at least one successful nightly run against every
  stack before this piece is called done.

## 10. Open items carried forward

1. **Bucket versioning's exact provider API** (§6) — needs a schema check against
   `@pulumi/minio ^0.17.0`, not assumed.
2. **Whether `history-pruner`'s replacement (if any) is this piece's responsibility or
   steady-state operations'** — flagged, not resolved, in §5 step 5.
3. **The `dockge-celestia.driscoll.tech` FQDN** (§4.3) is derived from
   `components/helpers.ts:68-73` and celestia's `ProxmoxHost` args, not read off a live DNS
   record — confirm it resolves as expected in step 2 of §5 before depending on it further.

## See also

- [README.md](README.md) — the full plan, decision ledger, and sequencing diagram.
- [03-secrets-bootstrap-independence.md](03-secrets-bootstrap-independence.md) — the `op`
  break-glass path this piece's local smoke test depends on.
- [05-import-audit.md](05-import-audit.md) — audits the Minio bucket's permanent `import:` and
  the `StandardDns` records; this piece deliberately leaves that resource untouched.
- [22-decommission-sgc.md](22-decommission-sgc.md) — retires the `sgc` Stack CR (and its share of
  the `applications` project) once SGC itself is gone; this piece migrates it, that piece deletes
  it.
