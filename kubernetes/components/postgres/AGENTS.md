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
| `APP` | — | required; already set by every app's `ks.yaml`. The only one. |

Anything that is not a string is a **sibling component**, not a variable:

| Component | Effect |
| --- | --- |
| `../../components/postgres/superuser` | `DatabaseRole.spec.superuser: true` — used by `immich` only |

**Why:** `postBuild.substitute` is typed `map[string]string`, and the parent resolves these
values before the child Kustomization is applied. A boolean-valued variable therefore lands as
a bare `false` and the CRD rejects the whole object:

```
spec.postBuild.substitute.POSTGRES_SUPERUSER: Invalid value: "boolean": must be of type string
```

Quoting the source does not help — kustomize re-emits `"${X:=false}"` as bare `${X:=false}`,
because at build time that scalar is an ordinary string needing no quotes. Verified: double,
single and bare all render identically.

## Things that will bite you

- **A `DatabaseRole` adopts an existing role and forces every attribute to match the
  manifest, including the ones you omit.** Never drop the `superuser` component from an app
  that needs it — the live role is demoted silently.
- **`flate` cannot catch a bad `postBuild.substitute` value.** It renders the placeholder, not
  the substituted result, so a type error only appears when Flux applies the child object for
  real. To check by hand, build the app, apply Flux's `${VAR:=default}` semantics to the output,
  and `kubectl apply --dry-run=server` the nested Kustomization that falls out. That is exactly
  what the controller does.
- **The password is still hand-maintained.** `${APP}-postgres-password` is a document in
  `kubernetes/apps/database/postgres/app/passwords.sops.yaml`. Adding a new app means adding
  one Secret document there until phase 4 moves this to OpenBao. The `username` key in it
  **must equal the role name** — CNPG rejects the secret otherwise, with
  "the username in secret does not match role".
- **Nothing here ever deletes anything.** That is a deliberate, consistent policy, not three
  unrelated settings: the nested ks is `deletionPolicy: Orphan`, both CRs carry `retain`
  reclaim policies, and all three rendered objects carry
  `kustomize.toolkit.fluxcd.io/prune: disabled`. Removing the component from an app, or a file
  from `database/`, leaves the live objects alone. Cleaning up for real is a manual job.
- **Do not enable `clientCertificate` on a role without that prune guard.** A `DatabaseRole`
  with client certificates owns the generated `<name>-client-cert` Secret through a controller
  `ownerReference`, so pruning the role garbage-collects the credential — and CNPG's
  `deleteOwnedCertSecret` removes it outright the moment `enabled` goes false.
- **`reloader.stakater.com/auto` belongs on the WORKLOAD, not on a Secret.** It is present on
  the rendered `ExternalSecret` because the generator put it there and churning it would break
  the byte-for-byte match with the live object, but it does nothing where it sits. What makes
  an app pick up a changed password is the annotation on the app's own Deployment/StatefulSet.
  This matters from phase 4 onward, when passwords start rotating.
- **The nested ks does not inherit `components/common`.** Its `decryption` and
  `substituteFrom` are spelled out in `ks.yaml`; `common` is applied by the umbrella
  kustomization and never sees this object. If you add a new cluster-wide substitution source,
  add it there too.
