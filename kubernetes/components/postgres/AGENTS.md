# Postgres component

Adding `../../../components/postgres` to an app's `ks.yaml` `spec.components` is the **only**
edit needed to give that app a PostgreSQL database, a login role and a credential Secret.
There is no generator step any more — `Update.cs` was retired in phase 1 of
[docs/postgres-credentials/PLAN.md](../../../docs/postgres-credentials/PLAN.md).

## What it renders

The component itself emits one object into the app's namespace: a nested Flux `Kustomization`
named `${APP}-postgres`. That Kustomization renders `./database/` into the **`database`**
namespace, where the CNPG `Cluster` lives:

| Object | Name | Purpose |
| --- | --- | --- |
| `DatabaseRole` | `${APP}` | the login role (CNPG >= 1.30) |
| `Database` | `${APP}` | the database, with `public` and `${APP}` schemas |
| `ExternalSecret` | `${APP}-postgres` | the credential Secret apps read back |

Apps consume the credential the same way they always have — through
`ClusterSecretStore/database` with `extract: {key: ${APP}-postgres}`.

## Substitutions

| Variable | Default | Notes |
| --- | --- | --- |
| `APP` | — | required; already set by every app's `ks.yaml` |
| `POSTGRES_SUPERUSER` | `false` | set to `"true"` only for `immich` |
| `POSTGRES_DB_OWNER` | `${APP}` | for the rare case where the database owner is not the app role |

## Things that will bite you

- **A `DatabaseRole` adopts an existing role and forces every attribute to match the
  manifest, including the ones you omit.** Never drop `POSTGRES_SUPERUSER` from an app that
  needs it — the live role is demoted silently.
- **The password is still hand-maintained.** `${APP}-postgres-password` is a document in
  `kubernetes/apps/database/postgres/app/passwords.sops.yaml`. Adding a new app means adding
  one Secret document there until phase 4 moves this to OpenBao. The `username` key in it
  **must equal the role name** — CNPG rejects the secret otherwise, with
  "the username in secret does not match role".
- **Removing the component does not drop anything.** The nested ks is `deletionPolicy: Orphan`
  and both CRs carry `retain` reclaim policies. Cleaning up for real means deleting the
  database by hand.
- **The nested ks does not inherit `components/common`.** Its `decryption` and
  `substituteFrom` are spelled out in `ks.yaml`; `common` is applied by the umbrella
  kustomization and never sees this object. If you add a new cluster-wide substitution source,
  add it there too.
