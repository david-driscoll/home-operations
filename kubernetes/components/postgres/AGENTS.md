# Postgres component

Adding `../../../components/postgres` to an app's `ks.yaml` `spec.components` is the **only**
edit needed to give that app a PostgreSQL database, a login role, a credential Secret and an
OpenBao-owned password that rotates every 30 days. There is no generator step any more —
`Update.cs` was retired in phase 1 of
[docs/postgres-credentials/PLAN.md](../../../docs/postgres-credentials/PLAN.md), and the
`rotate` sibling that used to make rotation opt-in was folded in here once phase 4 finished.

## What it renders

The component itself emits one object into the app's namespace: a nested Flux `Kustomization`
named `${APP}-postgres`. That Kustomization renders `./database/` into the **`database`**
namespace, where the CNPG `Cluster` lives:

| Object | Name | Purpose |
| --- | --- | --- |
| `DatabaseRole` | `${APP}` | the login role (CNPG >= 1.30), with **no** `passwordSecret` |
| `Database` | `${APP}` | the database, with `public` and `${APP}` schemas |
| `ExternalSecret` | `${APP}-postgres` | the credential Secret apps read back |
| `ExternalSecret` | `${APP}-postgres-conn` | connection metadata, derived not stored |
| `ClusterGenerator` | `${APP}-postgres-rotation` | reads `database/static-creds/${APP}` from OpenBao |

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
| `../../components/postgres/client-cert` | certificate auth instead of a password |

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
- **Two systems have to converge, and there are TWO ordering constraints pointing in opposite
  directions.** This is the part that bites; the full write-up with the recovery commands is in
  [`ks.yaml`](ks.yaml). Short version:

  | case | constraint | what goes wrong |
  | --- | --- | --- |
  | migrated app | merge the Kubernetes half **before** the Pulumi run picks it up | reverse order rotates a password the app cannot yet read — an outage |
  | **brand-new app** | the login role must exist **before** the Pulumi run | `stacks/system` dies on `ERROR: role "x" does not exist (SQLSTATE 42704)` |

  The second one has no ordering you can choose: a new app ships both halves in one commit, the
  Pulumi operator reconciles that merge in seconds, and Flux's `cluster-apps` runs on its own
  interval — so Pulumi reliably wins. After 3 failures the Stack goes `Stalled/UpdateFailed`
  and, with `continueResyncOnCommitMatch: false` and `resyncFrequencySeconds: 86400`, sits there
  for a **day**. Expect it on new-app day; clear it with the runbook in `ks.yaml`. It cost a
  stalled stack on degoog (#1180).

- **`passwords.sops.yaml` holds no app password any more.** Only `postgres-user-password` and
  `postgres-superuser-password` — the CNPG cluster's own bootstrap and superuser credentials.
  Adding a new app needs **no** edit there, and a `DatabaseRole` with a `passwordSecret`
  pointing at a document that does not exist would simply never get a role.
- **Rotation is irreversible, per app, from the moment the component lands.** Creating
  `database/static-roles/${APP}` rotates the password immediately; `rotation_period` is
  mandatory and [openbao#284](https://github.com/openbao/openbao/issues/284) (disable auto
  rotation) is still open. So the app gets a forced restart every 30 days forever, and it must
  be able to survive one: check `reloader.stakater.com/auto` is on the **workload** (not the pod
  template), that the pod actually references the Secret, and that a cold boot fits inside its
  liveness budget. Three of the phase-4 tranches turned up an app that failed one of those.

- **A dropped app leaves a live `components/postgres` line behind, and re-enabling it is not
  free.** `outline`, `retrom` and `strmgen` had their `Database` CR, database and role removed
  in group E; their component line is commented out so the Pulumi discovery does not see them.
  Uncommenting one puts it straight into the new-app case above — CNPG has to recreate the role
  before `stacks/system` can create a static role for it.

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
