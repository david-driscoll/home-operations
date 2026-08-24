# Postgres roles and credentials — retiring `components/postgres/Update.cs`

Planning set for moving the estate's PostgreSQL role/database/credential provisioning off a
code generator and onto declarative CRDs, then onto OpenBao-managed credentials.

Written 2026-08-24. Every "verified" claim below was checked against the live equestria
cluster or against upstream source on that date — see [Verified facts](#verified-facts).

## The problem in one paragraph

[`kubernetes/components/postgres/Update.cs`](../../kubernetes/components/postgres/Update.cs)
(314 lines of C#) walks every `ks.yaml` looking for apps that reference
`components/postgres`, and splices what it finds into three central files: 17 role entries in
the CNPG cluster's `values.yaml`, 19 `ExternalSecret` + 17 `Database` documents in
`users.yaml` (1700 lines), and 19 secrets in `passwords.sops.yaml` (740 lines). It exists
because until CNPG 1.30 there was no per-role custom resource — roles could only be declared
inline in `Cluster.spec.managed.roles`, so *something* had to do the splicing. That constraint
is gone.

## Target architecture

| Concern | Today | Target |
|---|---|---|
| Role exists, with the right attributes | `Cluster.spec.managed.roles` (generated) | `DatabaseRole` CR, rendered per app from the component |
| Database + schemas exist | `Database` CR in generated `users.yaml` | `Database` CR, rendered per app from the component |
| App-facing credential Secret | `ExternalSecret` in generated `users.yaml` | same `ExternalSecret`, rendered per app from the component |
| The password itself | random GUID in `passwords.sops.yaml` (generated) | OpenBao `database/static-roles/<app>`, rotated |
| `openbao`'s own DB credential | same generated path | **client certificate** — no password at all |
| `baoadmin` (the engine's root connection) | does not exist | **client certificate**, superuser |

The end state has **no generated files, no passwords in git, and no `Update.cs`.**

### Why the component needs a nested Flux Kustomization

`Database`, `DatabaseRole` and the `passwordSecret` are namespace-scoped and must live in the
`Cluster`'s namespace (`database`). A Kustomize component rendered inside an app's build cannot
put them there: Flux's `spec.targetNamespace` uses Kustomize's namespace transformer, which
**overrides** an explicitly-set `metadata.namespace` (verified — see below).

So `components/postgres` emits a *nested* Flux `Kustomization` named `${APP}-postgres`. The
Kustomization object itself lands in the app's namespace; its `spec.targetNamespace: database`
puts the resources it renders in the right place. This is the same shape used by
[`eleboucher/homelab`](https://github.com/eleboucher/homelab/tree/main/kubernetes/components/postgres),
[`tholinka/home-ops`](https://github.com/tholinka/home-ops/tree/main/kubernetes/components/cnpg/app),
`tuilakhanh/home-ops` and `ToaHartor/maisonneux`.

**Gotcha, already accounted for:** `ks.yaml` files are collected by the *umbrella*
kustomization (`kubernetes/apps/<group>/kustomization.yaml`), which is where
`components/common` is applied. A component-emitted nested ks is built from the *app* path, so
it does **not** inherit common's `decryption` + `substituteFrom: cluster-secrets` patch. Both
must be written into the component's `ks.yaml` explicitly or `${CLUSTER_DOMAIN}` and friends
silently fail to resolve.

## Phases

| Phase | Scope | Blast radius | Status |
|---|---|---|---|
| **1a** | Prune-protect the objects that are about to change owner | none | |
| **1b** | Component emits `DatabaseRole`/`Database`/`ExternalSecret`; delete `Update.cs`, `users.yaml`, the 17 `values.yaml` roles | 17 apps, credential values unchanged | |
| **2** | `openbao` role → CNPG client certificate; storage `connection_url` goes password-free | OpenBao storage — the estate's secret store | |
| **3** | `baoadmin` superuser role (cert-auth) + OpenBao `database` secrets engine, wired from Pulumi | new machinery, no app impact yet | |
| **4** | Move apps onto `database/static-roles/<app>`, in tranches; delete `passwords.sops.yaml` | 16 apps, rotating credentials | |

`passwords.sops.yaml` survives phase 1 unchanged and hand-maintained. Phase 1 is purely about
*who declares what* — not a single credential value changes.

---

## Phase 1a — prune guard

Moving a resource between Flux Kustomizations means the old owner's inventory still lists it.
Flux transfers ownership via the `kustomize.toolkit.fluxcd.io/name` / `/namespace` labels and
should skip pruning an object another Kustomization has adopted, but this estate has already
lost PVCs to exactly this class of event
([27](../cluster-consolidation/27-migration-churn-failure-modes.md),
[28](../cluster-consolidation/28-postgres-restore-and-bootstrap-deadlock.md)), so we do not
rely on it.

The specific hazard: the generated `ExternalSecret`s use `creationPolicy: Owner`, so the Secret
they produce carries an `ownerReference` back to them. Pruning the ExternalSecret garbage-
collects the Secret — which is both the app's credential and (via `*-postgres-password`) the
input CNPG reads. `target.deletionPolicy: Retain` does **not** cover this; it governs the
provider-side key disappearing, not the ExternalSecret being deleted.

1a adds a Kustomize patch to
`kubernetes/apps/database/postgres/app/kustomization.yaml` stamping
`kustomize.toolkit.fluxcd.io/prune: disabled` onto every `ExternalSecret` and `Database` in
that build. It touches the app's own kustomization rather than the generator, so
`mise run update` stays a no-op against it.

**Gate before 1b merges:** every `Database` and `ExternalSecret` in `database` carries the
annotation.

```bash
kubectl -n database get externalsecrets,databases \
  -o custom-columns=KIND:.kind,NAME:.metadata.name,PRUNE:.metadata.annotations.kustomize\\.toolkit\\.fluxcd\\.io/prune
```

## Phase 1b — declarative roles, databases and credentials

```
kubernetes/components/postgres/
├── kustomization.yaml        # Component: commonLabels + resources: [./ks.yaml]
├── ks.yaml                   # nested Flux Kustomization → targetNamespace: database
└── database/
    ├── kustomization.yaml
    ├── database.yaml         # existing file, moved down one level
    ├── databaserole.yaml     # new
    └── credentials.yaml      # new — the ExternalSecret Update.cs used to generate
```

Deletions: `Update.cs`, `kubernetes/apps/database/postgres/app/users.yaml`, the 17 app role
entries in `resources/values.yaml`, and `postgres-user-template.yaml` (it existed only as the
generator's input template; its live `postgres-user` ExternalSecret moves into the postgres app
directory as a plain resource).

Retained in the postgres app, deliberately:

- `passwords.sops.yaml` — hand-maintained until phase 4.
- `user-template.yaml` — the `pgsql-user-template` ConfigMap the ExternalSecrets template from.
  It stays in the `database` namespace and the component's ExternalSecrets reference it by name.
- The `${CLUSTER_CNAME}` and `postgres-superuser` roles. They are not app-scoped and
  `enableSuperuserAccess`/`superuserSecret` still points at the sops secret. **Never move the
  `postgres` superuser under OpenBao's control** — it is the break-glass path for the phase 4
  split-brain failure mode below.

### Design decisions and why

**`dependsOn: postgres-operator` in `cloudnative-pg`, *not* the `postgres` cluster ks.**
There is a live readiness cycle: the postgres ks reads its Helm values through
`ClusterSecretStore/openbao`, and openbao reads its storage URL out of the `database`
namespace. `kube-system/openbao/ks.yaml` breaks it by *deliberately commenting out* its
`dependsOn: postgres`. A nested ks that depended on the postgres cluster ks would reintroduce
that cycle through the back door. `postgres-operator` has no `dependsOn` at all and is safe.

**`wait: false` on the nested ks.** With `wait: true` the app's own ks (most have `wait: true`)
would transitively block on the `Database` reaching `status.applied` — which needs a healthy
CNPG cluster, which on a cold boot needs OpenBao. Same cycle. `wait: false` reproduces today's
behaviour exactly: no gating, no new deadlock surface. Per-app `wait: true` plus
`healthCheckExprs` on `status.applied` is a worthwhile follow-up, but it is opt-in, not the
default.

**`passwordSecret` keeps pointing at `${APP}-postgres-password`.** The collapse to a single
secret is tempting — CNPG does not check the Secret's `type`, only that `username` and
`password` keys exist — but it changes CNPG's password source in the same change that moves
ownership. Phase 4 removes `passwordSecret` from the `DatabaseRole` entirely, so the question
dissolves; do not solve it twice.

**`superuser` is a substitution.** `${POSTGRES_SUPERUSER:=false}`, set to `true` only in
`immich`'s `ks.yaml`. This is load-bearing: creating a `DatabaseRole` for an existing role
**adopts** it, and the operator forces *every* attribute to match the manifest including the
ones you omit. Omitting `superuser` on immich would silently demote it.

### Rollout gates

1. Before merge: `kubectl kustomize` clean, `mise run flate` clean.
2. After merge, all 17 `DatabaseRole`s report `status.applied: true` and
   `observedGeneration == metadata.generation`.
3. `\du` diff against a pre-change capture — no attribute drift, `immich` still superuser.
4. No `ExternalSecret` in `database` goes `SecretSyncedError`; no Secret's
   `resourceVersion`-backed password changes (the values are identical by construction).
5. `kubectl -n database get cluster postgres -o jsonpath='{.status.managedRolesStatus}'` no
   longer lists the 17 app roles under `byStatus.reconciled`.

### Rollback

`git revert`. The `DatabaseRole` CRs are `databaseRoleReclaimPolicy: retain`, so deleting them
leaves the PostgreSQL roles untouched, and restoring the `values.yaml` entries puts CNPG back
in charge — the Cluster spec takes precedence over a `DatabaseRole` for the same role name, so
the two can even coexist during the revert.

---

## Phase 2 — OpenBao onto a client certificate

See [PHASE2.md](PHASE2.md), which now carries the results of the design spike. The three
findings that matter: pgx caches the client certificate at process start, so the Secret must be
mounted as a volume and renewal rides on reloader rolling the StatefulSet; pgx does **not**
enforce private-key file permissions, so that is not a blocker; and the certificate's CN comes
from `DatabaseRole.spec.name` while the Secret is named after `metadata.name`.

## Phase 3 — the OpenBao database secrets engine

`baoadmin`: a CNPG `DatabaseRole` with `superuser: true` and
`clientCertificate: {enabled: true}`. Superuser is not optional — **PostgreSQL 16+ restricts
`CREATEROLE` to roles the user created or holds `ADMIN OPTION` on**, CNPG creates every role as
`postgres`, and CNPG's `inRoles` issues a plain `GRANT` with no `ADMIN OPTION`. There is no
declarative path to a least-privilege rotator on PG 17.

Pulumi (`@pulumi/vault` v7, already a dependency) configures the mount and one static role per
app:

```ts
new vault.database.SecretsMount("postgres", {
  path: "database",
  postgresqls: [{
    name: "postgres",
    pluginName: "postgresql-database-plugin",
    connectionUrl: "postgresql://baoadmin@postgres-rw.database.svc.cluster.local:5432/postgres"
      + "?sslmode=verify-full&sslcert=/etc/pg-certs/tls.crt&sslkey=/etc/pg-certs/tls.key"
      + "&sslrootcert=/etc/pg-ca/ca.crt",
    passwordAuthentication: "scram-sha-256",
    allowedRoles: APPS,
  }],
}, { provider: globals.baoProvider });
```

**Do not set `selfManagedPassword`, `passwordWo` or `skipImportRotation`** — all three are
Vault-Enterprise-only and OpenBao rejects them.

**Static roles, never dynamic.** `database/creds/<role>` mints a new PostgreSQL user per lease;
every object that user creates is owned by it, and lease expiry either fails the `DROP ROLE` or
orphans the objects. With `Database.spec.owner: ${APP}` the apps own their own schemas, so
dynamic roles are structurally wrong here. Static roles rotate the password of an existing role
and compose exactly with a `DatabaseRole` that declares no `passwordSecret` — verified as an
accepted CNPG configuration, and documented as "the instance manager will not `CREATE`/`ALTER`
the role with a password".

**`APPS` should be discovered, not listed.** A hand-maintained TypeScript array is a lateral
move from a C# generator. The Pulumi stack should glob `kubernetes/apps/**/ks.yaml` for
`components/postgres` so that adding the component to a `ks.yaml` remains the only edit.

## Phase 4 — apps onto rotating credentials

Per app: drop `passwordSecret` from the `DatabaseRole`, point the `ExternalSecret` at a
`VaultDynamicSecret` generator reading `database/static-creds/<app>`, delete the sops entry.

### The constraint to sit with

**Rotation cannot be switched off.** `rotation_period` is mandatory (minimum 5s), OpenBao has
no `skip_import_rotation`, and creating a static role rotates the password immediately.
[openbao#284](https://github.com/openbao/openbao/issues/284) — the request to disable auto
rotation — is still open. Every app in the tranche becomes a rotating-credential app,
permanently, with reloader-driven restarts on the rotation cadence. Choose `rotation_period`
accordingly (720h is a reasonable start) and roll in tranches, tolerant apps first.

### OpenBao policy

ESO's AppRole is read-only over `secrets/data/*` prefixes today
([`bootstrap/openbao/equestria-init.sh`](../../bootstrap/openbao/equestria-init.sh)). Phase 4
needs `read` on `database/static-creds/*` — a new mount, so a policy edit either way. Note this
is *narrower* than option B's alternative (`create`/`update` on `secrets/data/clusters/*`).

### Split-brain on restore

Restore Postgres from Barman and roles come back with backup-time passwords while OpenBao holds
snapshot-time ones — every app locks out. Recovery is a loop of
`bao write -f database/rotate-role/<name>`, which is clean, but it must be written into
[`bootstrap/RUNBOOK.md`](../../bootstrap/RUNBOOK.md) *before* phase 4 ships. This is also the
reason the `postgres` superuser stays in sops and outside OpenBao's reach.

---

## Verified facts

Checked 2026-08-24 against live equestria and upstream source.

| Claim | Evidence |
|---|---|
| CNPG operator is 1.30.0 | `cloudnative-pg:1.30.0`; chart 0.29.0 has `appVersion: "1.30.0"` |
| `DatabaseRole` CRD is installed | `databaseroles.postgresql.cnpg.io`, created 2026-07-05 |
| A `DatabaseRole` with no `passwordSecret` and no `disablePassword` is valid | server-side dry-run accepted |
| `clientCertificate: {enabled: true}` is valid; requires `login: true` | dry-run accepted; without login the webhook rejects it with `clientCertificate requires the role to have login enabled` |
| CNPG can sign client certs for this cluster | `status.certificates.clientCASecret: postgres-ca`, and that Secret holds both `ca.crt` and `ca.key` |
| Cert auth is already in use here | `postgres-replication` is a live `kubernetes.io/tls` client cert for `streaming_replica` |
| CNPG does **not** validate the password Secret's `type` | `internal/management/utils/secrets.go` `GetUserPasswordFromSecret` checks only for the `username`/`password` keys |
| CNPG **does** require `secret.username == role.name` | `internal/management/controller/roles/runnable.go` `getPassword`: "the username in secret %q does not match role %q" |
| Kustomize's namespace transformer overrides an explicit `metadata.namespace` | built a two-document fixture with `namespace: database` set; both came out `appns` |
| The nested-ks-from-component pattern renders correctly in *this* repo | built `components/postgres` prototype against `apps/observability/grafana`; nested Kustomization emitted into `observability` with `targetNamespace: database` and `${APP}` intact |
| ESO is v2.9.0 with `Password`, `ClusterGenerator`, `VaultDynamicSecret`, `PushSecret` | CRDs present; `ClusterGenerator.spec.kind` enum includes `Password` and `VaultDynamicSecret` |
| reflector and reloader are deployed | `kube-system/reflector`, `kube-system/reloader` |
| Flux is 2.9.4 | `kustomize-controller:v1.9.4` — `healthCheckExprs` available |
| OpenBao is 2.6.2 and its Postgres storage uses pgx | `quay.io/openbao/openbao:2.6.2`; `internal/physical/postgresql/postgresql.go` does `sql.Open("pgx", connURL)` |
| OpenBao has static roles but **not** rootless rotation | `internal/builtin/logical/database/path_roles.go` handles `static-roles`; `self_managed_password` has zero hits in the repo — it is Vault Enterprise 1.18+ |
| Rotation cannot be disabled | [openbao#284](https://github.com/openbao/openbao/issues/284) open since 2024-04 |
| PG 16+ restricts `CREATEROLE` password changes to `ADMIN OPTION` holders | [PostgreSQL 16 ALTER ROLE](https://www.postgresql.org/docs/16/sql-alterrole.html) |
| `POSTGRES_NAME` (the generator's role-name override) is dead | zero `ks.yaml` set it |

## References

- [Declarative role management](https://cloudnative-pg.io/docs/1.30/declarative_role_management) · [Declarative database management](https://cloudnative-pg.io/docs/1.30/declarative_database_management/) · [CNPG 1.30 release](https://cloudnative-pg.io/releases/cloudnative-pg-1-30.0-released/)
- [CNPG Recipe 25 — declarative roles and passwordless TLS](https://www.gabrielebartolini.it/articles/2026/07/cnpg-recipe-25-declarative-roles-and-passwordless-tls-in-cloudnativepg-1.30/)
- [OpenBao PostgreSQL secrets engine](https://openbao.org/docs/secrets/databases/postgresql/) · [database API](https://openbao.org/docs/api/secret/databases/) · [Postgres storage backend](https://openbao.org/docs/configuration/storage/postgresql/)
- [ESO Password generator](https://external-secrets.io/latest/api/generator/password/) · [ESO PushSecrets](https://external-secrets.io/latest/guides/pushsecrets/)
- Prior art: [eleboucher/homelab](https://github.com/eleboucher/homelab/tree/main/kubernetes/components/postgres) · [tholinka/home-ops](https://github.com/tholinka/home-ops/tree/main/kubernetes/components/cnpg/app) · [zebernst/homelab](https://github.com/zebernst/homelab/tree/main/kubernetes/components/cnpg-database) · [Tanguille/cluster](https://github.com/Tanguille/cluster/blob/main/kubernetes/apps/database/cloudnative-pg/databases/resourceset.yaml)
