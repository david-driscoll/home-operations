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

> The Secret is named `<metadata.name>-client-cert` (`GetClientCertSecretName` is
> `r.Name + clientCertSecretSuffix`), but the certificate's **CN comes from `spec.name`** --
> `issueClientCertificate` calls `generateCertificateFromCA(caSecret, role.Spec.Name, ...)`.
> PostgreSQL `cert` auth maps CN onto the role name, so `spec.name` is the one that has to be
> right. Confirmed against the live `postgres-replication` cert, whose subject is exactly
> `/CN=streaming_replica`.

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
        defaultMode: 0400          # hardening, not required — see the spike findings
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

Mounting as a **volume** is load-bearing, not a style choice: pgx caches the certificate in
memory at process start, so reloader watching the mounted Secret is the only thing that makes
renewal take effect. See [the spike findings](#findings-from-the-spike) below.

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

## Findings from the spike

Three of the four open questions are settled from source and from the live cluster. One needs a
hands-on check.

### The certificate is read once, at process start — so renewal needs a restart

This is the finding that changes the design, and it is not in anyone's documentation.

pgx builds the client certificate into `tlsConfig.Certificates` inside `configTLS`, which runs
during `ParseConfig` — once, when `sql.Open("pgx", connURL)` is called. Every connection the
pool opens afterwards reuses that in-memory `tls.Config`. **A renewed certificate on disk is
invisible to a running OpenBao process.** Left alone, the mounted files would rotate at day 83
while the process kept presenting the old certificate until it expired at day 90, and then new
connections would start failing.

The fix is already in this estate's toolkit, and it is why the certificate must be mounted as a
**volume** rather than read some other way: the OpenBao StatefulSet carries
`reloader.stakater.com/auto: "true"` and `updateStrategyType: RollingUpdate`, so reloader sees
the mounted Secret change and rolls the three replicas one at a time. Renewal becomes one
rolling restart roughly every 83 days, through the same mechanism a config change already uses.

Verify after 2.3 that reloader actually lists the cert Secret among what it is watching — a
mounted-but-unwatched Secret is the failure mode here, and it would stay silent for 83 days.

### pgx does not check private-key file permissions

`configTLS` does `os.ReadFile(sslkey)` straight into `tls.X509KeyPair` — no `os.Stat`, no mode
check anywhere in the path. libpq's "permissions are too open" refusal has no pgx equivalent.
`defaultMode: 0400` in 2.3 is therefore hardening, not a prerequisite, and the phase cannot fail
on it.

Two incidental constraints from the same function: `sslcert` and `sslkey` must be given
**together** (pgx errors with `both "sslcert" and "sslkey" are required` if only one appears),
and the key must be PEM.

### The CN is right, and cert auth is already proven here

`postgres-replication`, live in the `database` namespace today, has subject `/CN=streaming_replica`
and issuer `/OU=database/CN=postgres`, valid 2026-08-13 to 2026-11-11. So CNPG's client certs
carry the bare role name and nothing else, signed by the cluster CA — exactly what PostgreSQL
`cert` auth maps on.

### Still to check by hand

**Break-glass.** Confirm the `postgres` superuser path works from a debug pod *before* adding
`hostnossl ... reject` in the hardening step. This is the credential that recovers the estate if
the cert path breaks, and it must never be the thing under test.

## Two hazards found while reading the controller

**The cert Secret is owned by the DatabaseRole.** `issueClientCertificate` sets a controller
`ownerReference` (`ctrl.SetControllerReference(role, newSecret, r.Scheme)`), and
`deleteOwnedCertSecret` removes the Secret outright when `clientCertificate.enabled` goes false.
So deleting or disabling the DatabaseRole garbage-collects OpenBao's only credential. Give the
`openbao` DatabaseRole `kustomize.toolkit.fluxcd.io/prune: disabled` for the same reason the
credential ExternalSecret has it — and note the operator refuses to touch a same-named Secret it
does not own, reporting the conflict in `status.clientCertificate.message` instead, so a manual
pre-seed would silently win.

**The client CA expires 2026-11-11.** `clientCertSignedByCurrentCA` detects a CA rotation and
re-issues the leaf, so the cert side is automatic — but `sslrootcert` is the CA, and OpenBao has
it mounted too. Both Secrets change, both are reflector-mirrored, both are reloader-watched, so
the rotation should carry itself. It is still the first real test of this path and worth
watching rather than assuming, given it lands ~2.5 months out.

## What this unlocks

Phase 3's `baoadmin` — the superuser connection the OpenBao database secrets engine uses — is
the identical pattern, one role over. Doing `openbao` first means phase 3 inherits a proven
mount, a proven `pg_hba` rule shape, and a proven renewal story, and the engine never needs a
root password either.
