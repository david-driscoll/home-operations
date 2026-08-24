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

`openbao` **stays on `components/postgres`**, and gains a sibling component:

```yaml
components:
  - ../../../components/postgres
  - ../../../components/postgres/client-cert
```

`client-cert` patches the nested `${APP}-postgres` Kustomization to set
`DatabaseRole.spec.clientCertificate.enabled: true` — the same shape as `./superuser`, and for
the same reason (a boolean cannot travel through `postBuild.substitute`). CNPG then writes
`openbao-client-cert` into the `database` namespace and renews it on its own.

An earlier draft of this file said `openbao` should be carved out of the component here, with
hand-written `Database` and `DatabaseRole` objects. **That was wrong for this step.** The
component also renders the `openbao-postgres` credential ExternalSecret, and `openbao-storage`
reads that Secret for its connection URL until 2.4 — so carving out now would leave a live
dependency undeclared, held up only by `deletionPolicy: Orphan`. The carve-out belongs in 2.4,
where the ExternalSecret, the sops password document and the component reference all retire
together.

The role keeps its `passwordSecret` throughout. Verified rendering for `openbao`:

```
DatabaseRole openbao | login=True superuser=False
                     | clientCertificate={'enabled': True}
                     | passwordSecret=openbao-postgres-password
                     | prune: disabled
```

> The Secret is named `<metadata.name>-client-cert`, but the certificate's **CN comes from
> `spec.name`** — `issueClientCertificate` calls
> `generateCertificateFromCA(caSecret, role.Spec.Name, ...)`. PostgreSQL `cert` auth maps CN
> onto the role name, so `spec.name` is the one that has to be right. Confirmed against the
> live `postgres-replication` cert, whose subject is exactly `/CN=streaming_replica`.

The `DatabaseRole` already carries `kustomize.toolkit.fluxcd.io/prune: disabled` from phase 1 —
which becomes load-bearing the moment this component is added, because the cert Secret has a
controller `ownerReference` back to the role.

### 2.2 — project the cert into `kube-system` (ESO, not reflector)

`openbao-client-cert` is issued in `database`; OpenBao runs in `kube-system`. The original
plan said reflector. **It cannot be reflector**, and the reason is worth recording:

Both source Secrets — `openbao-client-cert` and `postgres-ca` — are created by the CNPG
operator, not by Flux. Reflector requires `reflector.v1.k8s.emberstack.com/reflection-allowed:
"true"` **on the source**, including in its explicit `reflects:` mode (the estate's own
`technitium/tailscale-authkey.yaml` says as much in its comment, and its source secret carries
the annotation). Nothing in git creates those objects, so nothing in git can annotate them.

`ClusterSecretStore/database` is exactly the answer to that problem — a `kubernetes` provider
reading the `database` namespace directly — and it is already how `openbao-storage` crosses the
same boundary today. So one `ExternalSecret` pulls both sources into a single
`openbao-pg-client-cert` Secret carrying `tls.crt`, `tls.key` and `ca.crt`.

One Secret, deliberately: one volume to mount, and one object for reloader to watch.

> This does **not** cost a new dependency. `kube-system/openbao` already reads its storage URL
> through this same store, which is why `external-secrets` is discussed at length in
> `openbao/externalsecret.yaml`. What it does cost is the claim in 2.4 below that OpenBao's
> storage credential stops passing through ESO — see the correction there.

Renewal timing: CNPG renews at 90 days with a 7-day margin; the ExternalSecret refreshes hourly,
so the new material is on disk long before the old certificate expires.

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

### 2.1–2.3a outcome — verified in production 2026-08-24

Merged as #1102 and reconciled. Everything below was observed, not predicted.

**The certificate.** `openbao-client-cert` issued in `database`:

```
subject = CN=openbao
issuer  = OU=database, CN=postgres
notBefore = Aug 24 18:48:58 2026 GMT
notAfter  = Nov 22 18:48:58 2026 GMT
X509v3 Extended Key Usage: TLS Web Client Authentication
```

CN is the bare role name, which is what PostgreSQL `cert` auth maps on.
`DatabaseRole.status.clientCertificate.expiration` agrees: `2026-11-22T18:48:58Z`.

**The roll.** Reloader saw the new mounted Secret and rolled all three replicas in reverse
ordinal order (2, 1, 0), each back to `1/1` within ~20s. All three came back
`sealed=false initialized=true ha_enabled=true`, and leadership migrated cleanly to
`openbao-2` when the active `openbao-0` rolled last. **110 ExternalSecrets on
`ClusterSecretStore/openbao` stayed Ready throughout** — the estate's secret store never lost
service.

**The mount.** `/etc/pg-certs` carries `tls.crt`, `tls.key`, `ca.crt`.

**`defaultMode: 0400` lands as `0440` — and that is correct, not a chart override.** The
StatefulSet does carry `defaultMode: 256`; kubelet then applies the pod's `fsGroup: 1000` to the
volume, which ORs in group-read. The files end up `r--r-----` owned by group 1000, readable by
the OpenBao process and nothing else. This was the open question flagged earlier about the mode
"interacting with fsGroup"; it does, this is the interaction, and it does not matter — pgx does
`os.ReadFile` straight into `tls.X509KeyPair` with no permission check.

**Inertness proven, not assumed.** `pg_stat_ssl` joined to `pg_stat_activity`:

```
usename  | conns | ssl | tlsver | client_dn
openbao  |   6   |  f  |   -    |     -
```

Six live connections, none using SSL, no client DN presented. The `hostssl openbao openbao all
cert` rule is in `pg_hba` and is matching nothing, exactly as designed — OpenBao is still
falling through to the catch-all with its password. The cutover is now a one-line change with a
database-free rollback.

**One prediction sharpened.** The client certificate expires 2026-11-22, but the client CA
(`postgres-ca`) expires **2026-11-11** — earlier. So the first renewal this path sees will be
CA-driven, around **2026-11-04** (CNPG's 7-day margin), not leaf-driven in mid-November.
`clientCertSignedByCurrentCA` detects the CA change and re-issues the leaf; both Secrets are
projected by the same ExternalSecret and mounted in the same volume, so one reloader roll should
carry both. That is the event to watch.

### 2.4 — remove the password

Once soaked: drop `passwordSecret` from the DatabaseRole, delete the `openbao-postgres-password`
document from `passwords.sops.yaml`, delete the `openbao-storage` ExternalSecret, and move the
now-secretless `connection_url` from `extraSecretEnvironmentVars` into the HCL config in
`helmrelease.yaml`. Optionally add `hostnossl openbao openbao all reject`.

**Correction to an earlier claim.** This does *not* remove the `external-secrets` ordering
dependency. 2.2 established that the client certificate has to reach `kube-system` through
`ClusterSecretStore/database`, because the operator-created source Secrets cannot be annotated
for reflector. So ESO stays in OpenBao's boot path either way.

What 2.4 actually buys is narrower, and still worth having: no password exists for this role
anywhere — not in sops, not in KV, not in the connection URL — and the credential renews and
revokes itself on the cluster's own PKI.

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

This is now verified rather than assumed. Reloader's docs state that `auto` "reloads workload
when any referenced ConfigMap or Secret changes", and that **includes volume mounts** — it is
not limited to `env`/`envFrom`. StatefulSets are a supported workload type, and the live
`reloader` deployment runs cluster-wide with no namespace restriction, so `kube-system` is in
scope.

Two things that follow, and both are easy to get wrong:

- **`reloader.stakater.com/auto` goes on the WORKLOAD, and only there.** It is meaningless on a
  Secret or ConfigMap; the resource-side annotations are `match` (opt-in with `search: "true"`)
  and `ignore`. The estate puts `auto` on a lot of Secrets and ExternalSecrets where it does
  nothing. `StatefulSet/openbao` already carries it correctly, so 2.3 needs no annotation
  change — only the volume mount.
- **Still verify after 2.3 that reloader has actually picked the Secret up.** A
  mounted-but-unwatched Secret is the failure mode, and it would stay silent for 83 days.
  Watch for a reload event, or force it:

  ```bash
  kubectl -n kube-system annotate secret openbao-client-cert reloader-probe="$(date +%s)" --overwrite
  kubectl -n kube-system rollout status statefulset/openbao --timeout=5m
  ```

  Note the hop: CNPG patches `openbao-client-cert` in `database`, ESO re-syncs it into
  `kube-system` on its refresh interval, and only then does reloader see a change. Three links,
  and the timing of the middle one is why the refresh interval is an hour rather than a day.

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

Everything else on this list is now answered — see the 2.1–2.3a outcome above.

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
