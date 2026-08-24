# Phase 2 — OpenBao's Postgres credential becomes a client certificate

Prerequisite: [phase 1](PLAN.md#phase-1b--declarative-roles-databases-and-credentials) merged
and reconciled.

## Why this phase exists, and why it comes before the secrets engine

OpenBao stores its own state in the shared CNPG cluster, which makes its database credential
the one credential in the estate that cannot come from OpenBao. Phase 3 will hand every *other*
app's password to OpenBao's database secrets engine; `openbao` itself has to be carved out.

The obvious carve-out is "generate a strong password and push it into OpenBao KV" (option B in
the original analysis). A client certificate is strictly better:

- **Nothing to store.** No password in sops, no password in KV, no bootstrap secret. The
  credential is a file CNPG issues and renews on its own.
- **It deletes objects rather than adding them.** `openbao-postgres` (ExternalSecret),
  `openbao-storage` (ExternalSecret), and the `openbao-postgres-password` sops document all
  go away. The storage `connection_url` becomes a static string with no secret in it, which
  means it can move from an ExternalSecret into the HelmRelease.
- **It is not exotic here.** CNPG already authenticates `streaming_replica` with a client
  certificate signed by this cluster's own CA — `postgres-replication` is a live
  `kubernetes.io/tls` Secret in the `database` namespace today.

## What makes it possible

| Fact | Evidence |
| --- | --- |
| OpenBao's Postgres storage backend speaks libpq DSN options | `internal/physical/postgresql/postgresql.go` does `sql.Open("pgx", connURL)`; pgx parses `sslmode` / `sslcert` / `sslkey` / `sslrootcert` |
| CNPG can issue and auto-renew the cert | `DatabaseRole.spec.clientCertificate.enabled: true`, accepted by the live webhook |
| CNPG holds the signing key | `status.certificates.clientCASecret: postgres-ca`, and that Secret contains `ca.key` as well as `ca.crt` |
| The chart can mount it with tight permissions | the OpenBao chart exposes `server.volumes[].secret.defaultMode` and `server.volumeMounts[]` |
| User `pg_hba` rules land where they need to | CNPG writes fixed rules, then `spec.postgresql.pg_hba`, then the catch-all `host all all all scram-sha-256` |

## The property that makes this safe

`pg_hba` matches on connection type. A `hostssl` rule **does not match a non-SSL connection**,
and the current `BAO_PG_CONNECTION_URL` ends in `?sslmode=disable`.

So adding

```yaml
pg_hba:
  - hostssl openbao openbao all cert
```

changes nothing about the running system: OpenBao keeps connecting without SSL, keeps falling
through to the catch-all, and keeps authenticating with its password. The cert path only
activates when the connection URL is changed to ask for SSL. **Rollback is a one-line revert of
the connection URL**, with no database-side change — the password rule is still there.

Closing the password path (`hostnossl openbao openbao all reject`) is a separate, later step,
taken only once the cert path has soaked.

## Steps

### 2.1 — issue the certificate

`openbao` moves out of `components/postgres` and into a hand-written pair of resources in the
postgres app. After this phase it needs no credential Secret at all, so the component's
password-shaped `ExternalSecret` is dead weight for it:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: DatabaseRole
metadata:
  name: openbao
spec:
  cluster: { name: postgres }
  name: openbao
  login: true
  clientCertificate:
    enabled: true          # → Secret openbao-client-cert (tls.crt, tls.key)
  databaseRoleReclaimPolicy: retain
  passwordSecret:
    name: openbao-postgres-password   # kept until 2.4
```

Plus the `Database/openbao` the component used to render.

> The Secret is named after the **`metadata.name`** of the DatabaseRole, not `spec.name`. They
> are equal here; keep them equal. PostgreSQL `cert` auth maps the certificate CN onto the role
> name, so a mismatch fails at connection time, not at apply time.

Drop `../../../components/postgres` from `kubernetes/apps/kube-system/openbao/ks.yaml` in the
same change, or the component will keep rendering a competing `Database/openbao`.

### 2.2 — mirror the cert into `kube-system`

`openbao-client-cert` is issued in `database`; OpenBao runs in `kube-system`. Reflector is
already deployed. Annotate the source (via `commonMetadata` on the postgres app, or directly)
and add the pull annotations in `kube-system`. `postgres-ca` needs the same treatment for
`sslrootcert`.

CNPG renews the cert at 90 days with a 7-day margin, and reflector re-mirrors on change — well
inside kubelet's projected-secret refresh window.

### 2.3 — allow cert auth, then use it

Add the `hostssl` rule to `cluster.postgresql.pg_hba` in
`kubernetes/apps/database/postgres/app/resources/values.yaml` (currently `[]`). Reconcile and
confirm nothing changed — this is the no-op step described above.

Then mount and switch:

```yaml
server:
  volumes:
    - name: pg-client-cert
      secret:
        secretName: openbao-client-cert
        defaultMode: 0400          # see the open question below
    - name: pg-ca
      secret:
        secretName: postgres-ca
        defaultMode: 0444
  volumeMounts:
    - name: pg-client-cert
      mountPath: /etc/pg-certs
      readOnly: true
    - name: pg-ca
      mountPath: /etc/pg-ca
      readOnly: true
```

```
postgres://openbao@postgres-rw.database.svc.cluster.local:5432/openbao
  ?sslmode=verify-full
  &sslcert=/etc/pg-certs/tls.crt
  &sslkey=/etc/pg-certs/tls.key
  &sslrootcert=/etc/pg-ca/ca.crt
```

`postgres-rw.database.svc.cluster.local` is already in the server certificate's
`serverAltDNSNames`, so `verify-full` will pass.

Note the config is delivered as a ConfigMap that OpenBao reads once at process start, and the
StatefulSet is `updateStrategyType: RollingUpdate` with reloader watching it — so this rolls the
three replicas one at a time on its own. Watch replica 0 come back **unsealed and joined**
before trusting the change.

### 2.4 — remove the password

Once soaked: drop `passwordSecret` from the DatabaseRole, delete the `openbao-postgres-password`
document from `passwords.sops.yaml`, delete the `openbao-storage` ExternalSecret, and move the
now-secretless `connection_url` from `extraSecretEnvironmentVars` into the HCL config in
`helmrelease.yaml`. Optionally add `hostnossl openbao openbao all reject`.

This also removes the `external-secrets` ordering dependency that
`kubernetes/apps/kube-system/openbao/externalsecret.yaml` documents at length — after 2.4,
OpenBao's storage credential does not pass through ESO at all.

## Open questions to settle before starting

1. **Does pgx enforce private-key file permissions?** libpq refuses a group-readable `sslkey`;
   Go's `tls.LoadX509KeyPair`, which pgx uses, is not believed to. `defaultMode: 0400` above
   makes the question moot, but verify the mount actually lands at 0400 (a projected Secret's
   mode interacts with `fsGroup`) rather than assuming.
2. **Does the CNPG-issued client cert carry CN=`openbao`?** Read it off the Secret before
   switching the URL: `openssl x509 -noout -subject`.
3. **What happens to an in-flight connection at renewal?** pgx reads the key files at connection
   setup, so new connections pick up the new cert and existing ones are unaffected. Confirm by
   watching a renewal, or force one.
4. **Break-glass.** Confirm the `postgres` superuser path still works from a debug pod before
   closing `hostnossl`. This is the credential that recovers the estate if the cert path breaks,
   and it must never be the thing being changed.

## What this unlocks

Phase 3's `baoadmin` — the superuser connection the OpenBao database secrets engine uses — is
the identical pattern, one role over. Doing `openbao` first means phase 3 inherits a proven
mount, a proven `pg_hba` rule shape, and a proven renewal story, and the engine never needs a
root password either.
