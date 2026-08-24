# Postgres Component

Relative Location: `kubernetes/components/postgres`

Referencing this component from an app's `ks.yaml` provisions that app a PostgreSQL database,
a login role and a credential Secret on the shared CNPG cluster in the `database` namespace.

```yaml
spec:
  components:
    - ../../../components/postgres
  postBuild:
    substitute:
      APP: *app
```

## How it works

The component emits a nested Flux `Kustomization`, `${APP}-postgres`, into the app's namespace.
That Kustomization has `targetNamespace: database` and renders three objects there:

- `DatabaseRole/${APP}` — the login role. Requires CNPG >= 1.30.
- `Database/${APP}` — the database, owned by that role, with `public` and `${APP}` schemas.
- `ExternalSecret/${APP}-postgres` — the credential Secret, templated through the
  `pgsql-user-template` ConfigMap in `kubernetes/apps/database/postgres/app/user-template.yaml`.

The indirection through a nested Kustomization is required: CNPG's `Database` and
`DatabaseRole` must live in the same namespace as the `Cluster`, and Flux's `targetNamespace`
overrides any namespace a component tries to set on its own resources.

## Consuming the credential

The Secret name is `${APP}-postgres`, in the `database` namespace. Apps read it through
`ClusterSecretStore/database`:

```yaml
  dataFrom:
    - extract:
        key: '${APP}-postgres'
```

Available keys: `username`, `password`, `database`, `hostname`, `public-hostname`, `port`,
`pgpass`, `uri`, `uriql`, `jdbc-uri`, `connection-string`, and `public-` variants of the last
four. The list is defined once, in `user-template.yaml`.

## Adding a new app

1. Add the component to the app's `ks.yaml`.
2. Add a `${APP}-postgres-password` Secret document to
   `kubernetes/apps/database/postgres/app/passwords.sops.yaml`. Its `username` must equal the
   app name.
3. If the app needs a superuser role, add `../../../../components/postgres/superuser` to `spec.components` as well (a component, not a substitution — booleans cannot pass through `postBuild.substitute`).

Step 2 goes away in phase 4 of [the plan](../../postgres-credentials/PLAN.md), when OpenBao's
database secrets engine takes over password ownership.

See also: `kubernetes/components/postgres/AGENTS.md`.
