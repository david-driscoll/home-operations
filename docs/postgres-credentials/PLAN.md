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
| **1a** | Prune-protect the objects that are about to change owner | none | **done** (#1085) |
| **1b** | Component emits `DatabaseRole`/`Database`/`ExternalSecret`; delete `Update.cs`, `users.yaml`, the 17 `values.yaml` roles | 17 apps, credential values unchanged | **done** (#1086, #1099) |
| **2** | `openbao` role → CNPG client certificate; storage `connection_url` goes password-free | OpenBao storage — the estate's secret store | **done** — 2.1–2.3b (#1102, #1106), 2.4a, prerequisite (#1172), 2.4b (#1174) verified 2026-08-26 |
| **3** | `baoadmin` superuser role (cert-auth) + OpenBao `database` secrets engine, wired from Pulumi | new machinery, no app impact yet | **done** — engine live, `ENGINE_ENABLED = true` since 2026-08-24 |
| **4** | Move apps onto `database/static-roles/<app>`, in tranches; delete `passwords.sops.yaml` | 13 live apps, rotating credentials | **done** — tranches 1–9, and no app password remains in `passwords.sops.yaml` |

`passwords.sops.yaml` survives phase 1 unchanged and hand-maintained. Phase 1 is purely about
*who declares what* — not a single credential value changes.

---

## Phase 1 outcome — verified 2026-08-24

All four gates passed after #1099.

| Gate | Result |
| --- | --- |
| `DatabaseRole`s applied | **14/14** `applied: true`, `observedGeneration == generation` |
| `\du` attribute drift | none — every app role at PostgreSQL defaults; `immich` still `rolsuper=t`; `equestria` and `postgres` unchanged; windmill's own `windmill_admin`/`windmill_user` roles untouched |
| ExternalSecret health | 21 in `database`, 0 not Ready |
| Cluster `managedRolesStatus` | `reconciled: [equestria]` only; all 17 app roles moved to `not-managed`; `cannotReconcile` empty |

**14, not 17.** Three of the `ks.yaml` files that reference `components/postgres` —
`outline`, `retrom`, `strmgen` — are **not listed in the equestria umbrella kustomization**, so
they have never been deployed. The old generator provisioned roles, databases and passwords for
them anyway, because it discovered apps by scanning `ks.yaml` files on disk regardless of
whether Flux ever applied them. The component only provisions what is actually deployed, which
is the better behaviour but leaves three orphans behind:

- Roles `outline`, `retrom`, `strmgen` (plus older leftovers `app`, `keeper`, `vikunja`) exist
  in PostgreSQL, unmanaged and retained.
- Their `passwords.sops.yaml` documents and `<app>-postgres` Secrets are likewise orphaned.

None of it is harmful — the roles have no grants beyond their own databases — but it is dead
weight to reap once someone confirms those three apps are not coming back.

Also worth carrying forward: **`flate` cannot catch a bad `postBuild.substitute` value.** It
renders the placeholder, not the substituted result, which is how a boolean got into a
`map[string]string` field and stalled 17 Kustomizations (#1099). The check that works is in
`kubernetes/components/postgres/AGENTS.md`.

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

Split the same way phase 2 was: land the Kubernetes-side scaffolding inert, then make the
OpenBao-side change on its own.

### 3a — the rotation identity *(done)*

`baoadmin`: a CNPG `DatabaseRole` with `superuser: true` and `clientCertificate: enabled`, and
**no password at all** — no `passwordSecret`, no `disablePassword`. The certificate is the only
way in from the moment the role exists, so there is no bootstrap password to rotate away and no
`rotate-root` ceremony. That is the main thing choosing certificates over a root credential buys
here.

Plus `hostssl postgres baoadmin all cert` in `pg_hba` (inert — `hostssl` cannot match a non-SSL
connection, and nothing connects as `baoadmin` yet), and the certificate projected into
`kube-system` and mounted at `/etc/pg-admin-certs`.

**Separate Secret, separate mount** from the storage certificate. `openbao-pg-client-cert` is
the unprivileged `openbao` identity; `openbao-pg-admin-cert` is a PostgreSQL superuser. Sharing
a directory would put a superuser key one `sslcert=` typo away from the storage connection.

**Superuser is not a choice.** PostgreSQL 16+ restricts `CREATEROLE` to roles the user created
or holds `ADMIN OPTION` on; CNPG creates every role as `postgres`, and CNPG's `inRoles` issues a
plain `GRANT` with no `ADMIN OPTION`. A least-privilege rotator is not reachable declaratively
on PG 17 — a `CREATEROLE`-only `baoadmin` gets `permission denied to alter role` on every
static-role rotation. The mitigation is that it is a *second* superuser: `postgres` stays
sops-backed and outside OpenBao's reach as break-glass, so revoking `baoadmin` is a one-line
change that cannot lock anybody out.

**3a outcome — verified 2026-08-24.** `baoadmin-client-cert` issued with subject `/CN=baoadmin`,
issuer `OU=database, CN=postgres`, valid to 2026-11-22. Both certificates mounted and distinct
(`/etc/pg-certs` and `/etc/pg-admin-certs`). All three replicas rolled and came back unsealed —
quickly this time, ~15s each with none of the slow `Terminating` seen on earlier rolls. The
storage connection was untouched throughout (`openbao | 6 | ssl=t | /CN=openbao`), 110
ExternalSecrets Ready, 180/180 Kustomizations Ready, 15/15 DatabaseRoles applied.

The identity was then proven from a throwaway pod using the projected certificate, before
anything depends on it:

```
ADMIN_CERT_OK as baoadmin ssl=true dn=/CN=baoadmin superuser=true can_alter_roles=true
```

> **Budget ~5 minutes for a `resources/values.yaml` change to reach the Cluster CR, and do not
> conclude it failed.** The path is not direct: `configMapGenerator` builds the
> `postgres-values` ConfigMap, an ExternalSecret templates that into the `postgres-values`
> Secret on a **4-minute** `refreshInterval`, and only then does the HelmRelease see new values.
> During 3a the ConfigMap had both `pg_hba` rules while the Secret and the live Cluster still
> had one, for about three minutes. That looks exactly like a broken change and is not one.

### 3b — configure the engine from Pulumi

Lives in `stacks/system` — the stack whose whole job is estate configuration written into
OpenBao, and which deliberately builds its own Vault provider rather than going through
`GlobalResources`. The code is `stacks/system/postgres-rotation.ts`.

**Two switches, meaning different things.**

`ENGINE_ENABLED` decides whether the mount exists. It is **off** until the `pulumi` policy has
been widened, because with it on and the grant missing the run 403s — and `stacks/system`
publishes `clusters/<key>/details`, which every other stack reads. A missing grant must not be
able to break that. With it off the module makes no API call at all.

`ROTATION_TRANCHE` decides which apps get a static role. **Creating one rotates that app's
password immediately**, with no opt-out, so it grows a couple of apps at a time.

Sequence, and the order matters:

1. Merge the widened `pulumi` policy (below) — script change only, applies nothing.
2. **Root ceremony** to apply it: `root-ceremony.sh resume`, then `equestria-init.sh`'s
   `write_policies` with `BAO_TOKEN` set, then revoke. Note `sys/generate-root/*` is
   standby-only, so pin a standby and use `resume`, not `run`.
3. Flip `ENGINE_ENABLED`. The run creates the mount and, because `verifyConnection` defaults
   true, **proves OpenBao can reach Postgres as `baoadmin` over the client certificate without
   touching a single password.** That checkpoint is why these are two switches.
4. Add the first app or two to `ROTATION_TRANCHE`.

**The policy grant.** The `pulumi` policy has no capability on `sys/mounts/database` or
`database/*` — its comment says so deliberately: *"No mount management — creating or moving a
KV mount stays a bootstrap-time decision."* Phase 3b adds named grants for
`sys/mounts/database` (+`/tune`, both needing `sudo` — enabling and tuning a secrets engine is
root-protected, exactly like the existing oidc grants), `database/config/*`,
`database/static-roles/*` and `database/rotate-role/*`.

`database/creds/*` is deliberately withheld, so reaching for dynamic roles is a 403 rather than
a silent design drift.

**The app list is discovered, not typed.** `discoverPostgresApps()` globs
`kubernetes/apps/**/ks.yaml` for a `ks.yaml` referencing `components/postgres`, matching the
path exactly so the `superuser` and `client-cert` siblings are not double-counted. Verified
against the live tree: 16 apps, with `openbao` correctly absent (carved out in 2.4a) and
`autobrr` correctly absent (its component line is commented out). A tranche entry that is not a
discovered app throws, rather than creating a static role for a role that does not exist.

This works in-cluster because the `home-operations` GitRepository sets neither `ignore` nor
`include`, so the Pulumi operator checks out the whole repository; `spec.fluxSource.dir` only
selects the working directory.

**Certificate paths, not inline PEM.** The provider offers `tlsCertificate`/`privateKey` fields
that take PEM inline. Using them would put the `baoadmin` superuser private key into Pulumi
state and therefore into the Minio backend. The `connectionUrl` form points at the files phase
3a mounts into the OpenBao pods instead, so Pulumi only ever writes a path string.

**3b engine outcome — verified 2026-08-24.** The root ceremony applied the widened policy, and
flipping `ENGINE_ENABLED` created the mount on a clean state. The `system` stack run succeeded,
which is itself the proof — `verifyConnection` defaults true, so the apply opened a connection.
Confirmed live from the database side:

```
baoadmin | 1 | ssl=t | TLSv1.3 | /CN=baoadmin     <- the rotation connection
openbao  | 6 | ssl=t | TLSv1.3 | /CN=openbao      <- storage, unaffected
```

and from OpenBao: mount `database/` present, `allowed_roles: []`, no static roles, connection
URL carrying the certificate paths with `password_authentication: scram-sha-256`. **No password
was touched.** 181/181 Kustomizations Ready.

> **A capabilities check is the wrong way to verify a policy mid-ceremony.** `bao token
> capabilities` reports what the *current token* can do. Immediately after a ceremony that token
> is the OIDC admin (`policies: ['admin','default']`), so every path — including the ones
> deliberately withheld — comes back with full access and `sudo`. It reported
> `database/creds/*` as writable when the policy grants nothing there. Read the policy document
> itself: `bao policy read pulumi`.

**Static roles, never dynamic.** `database/creds/<role>` mints a new PostgreSQL user per lease;
every object that user creates is owned by it, and lease expiry either fails the `DROP ROLE` or
orphans the objects. With `Database.spec.owner: ${APP}` the apps own their own schemas, so
dynamic roles are structurally wrong here. Static roles rotate the password of an existing role
and compose exactly with a `DatabaseRole` that declares no `passwordSecret`.

**`APPS` should be discovered, not listed.** A hand-maintained TypeScript array is a lateral
move from a C# generator. The Pulumi stack should glob `kubernetes/apps/**/ks.yaml` for
`components/postgres` so that adding the component to a `ks.yaml` remains the only edit.

## Phase 4 — apps onto rotating credentials

Per app: drop `passwordSecret` from the `DatabaseRole`, point the `ExternalSecret` at a
`VaultDynamicSecret` generator reading `database/static-creds/<app>`, delete the sops entry.

### Tranche log

Rotation is irreversible per app, so this grows a couple of apps at a time and each entry
records what was actually observed rather than what was expected.

Tranche 3 added a gate the first two did not need: **check that the app can survive a cold
boot inside its own liveness budget.** A rotation is a forced restart, and a restart is where
latent startup fragility surfaces. Reloader firing correctly is necessary but not sufficient.

| # | apps | PR | outcome |
|---|---|---|---|
| 1 | `grafana` | #1127 | **verified.** 32 → 20-char password, reloader restarted the pod, 4 connections re-established. Took three attempts to get the ESO generator's identity right — a namespaced `VaultDynamicSecret` cannot resolve a cross-namespace ServiceAccount, ESO ignores `serviceAccountRef.namespace` for generators, and the SA and the OpenBao role have to be changed together. All three rendered perfectly and failed live. |
| 2 | `freshrss` | #1138 | **verified.** 20-char password, `esReady=True`, pod restarted with 0 restarts since. Persistent connections stay at 0 because FreshRSS is PHP and connects per request — proof came from `pg_stat_database.xact_commit` advancing with `xact_rollback` flat, not from `pg_stat_activity`. |
| 3 | `tandoor`, `crowdsec` | #1141 | **verified, with an incident.** Both went 32 → 20 chars and both ExternalSecrets synced. `crowdsec` was clean — lapi restarted once, all 7 agents stayed up untouched and registered, bouncers intact — and it is the first app proven to rotate through `valueFrom.secretKeyRef` rather than `envFrom`. `tandoor` crash-looped through 6 restarts, but **not** on the credential: every attempt logged `Database is ready` and `No migrations to apply`. Its cold boot runs `collectstatic` for ~2m40s against a 40s liveness budget with no startup probe, so the restart the rotation forced was simply the first one in days. Fixed in #1142. |
| 4 | `coder`, `pulsarr`, `n8n` | #1146 | **verified.** All three 32 → 20 chars, fresh pods with **0 restarts**, backends re-established (coder 4, pulsarr 2, n8n 1). The first tranche chosen *by* the boot-budget gate, and the first with no restart trouble at all. `coder` proved the connection-**URI** path: it takes `CODER_PG_CONNECTION_URL` rather than a bare password, and the rotated value arrived embedded in `uri`. Two things learned, both below: the propagation lag is real, and the cutover is not seamless for a pooled app. |
| 5 | `romm` | #1152 | **verified.** 32 → 20 chars, pod rebuilt in **43s with 0 restarts** — matching the boot measured before rotating, so the widened probe did exactly what it was added for. **Zero** auth failures during the cutover, unlike coder: romm connects per request, so no pooled connection was holding a dead credential. Proof came from `xact_commit` advancing with `xact_rollback` flat, since `numbackends` sits at 0. |
| 6 | `questarr`, `forgejo` | #1155 | **verified.** Both 32 → 20 chars, both pods rebuilt with **0 restarts**. `questarr` connects per request (proof via `xact_commit`); `forgejo` holds a pool and took **1** auth failure in the cutover window, none after. `forgejo` also proved the initContainer path: `init-app-ini` bakes the password into `app.ini`, and Reloader rolled the workload as its source says it would. Delayed several hours by the mount-URN incident below. |

### Two things tranche 4 measured

**Propagation lag is ~3 minutes, and looks like failure while you wait.** Pulumi created the
static roles at 13:40:17Z; the passwords were still the old 32-character values for the next
few minutes because ESO re-invokes a generator only on its own `refreshInterval` (4m here). It
self-heals — `pulsarr` and `n8n` rotated with no intervention. Do not diagnose inside that
window. If a nudge is genuinely needed, `kubectl -n database annotate externalsecret
<app>-postgres force-sync=$(date +%s) --overwrite` re-invokes the generator immediately.

**The cutover is not seamless for a pooled app.** OpenBao invalidates the old password the
instant it rotates, and the running pod keeps using it until ESO refreshes and Reloader
restarts. `coder` logged 8 `password authentication failed` errors in an 8-second window
(13:40:20 → 13:40:28) and none after. This is inherent to rotate-then-propagate, not a
misconfiguration, and it will recur on **every scheduled rotation** — currently every 30 days,
per app. Apps that open a connection per request ride it out invisibly; pooled and
long-connection apps will drop queries for a few seconds. Worth knowing before choosing a
shorter `rotation_period`.
| 7 | `pinepods` | #1164 | pending merge. Closes group C/D. Split in two like romm: #1161 added the startup probe first. That rollout earned its keep — the boot came back at **156s**, not the 144s measured beforehand, an 8% spread against what had been a 210s budget. The 66s margin was never real. |
| 8 | `windmill` | #1169 | **verified.** 32 → 20 chars, all 6 pods recycled with 0 restarts, 49 backends re-established. Needed #1168 first: `DATABASE_URL` was a literal in every pod spec, so no pod referenced the Secret and Reloader had nothing to watch. Corrected a prediction — see the cutover note below. |
| 9 | `immich` | #1170 | **verified.** 32 → 20 chars, pod up in 9s with 0 restarts, 4 backends, 0 auth failures. `rolsuper` stayed **true** through the rotation, and all 8 extensions (including `vector`) survived — `ALTER ROLE … PASSWORD` touches nothing else, as expected. The two-sibling composition rendered exactly as designed: 3 patches appended, none overwritten. |

### The mount-URN incident (2026-08-25)

Tranche 6 merged correctly and then sat un-rotated for hours, because the Pulumi `system` stack
could not complete. Worth recording, because the near-miss was serious and the fix is
non-obvious.

#1149 refactored this file into a `PostgresRotationComponent`. Re-parenting the
`SecretsMount` to that component changed its URN, and Pulumi reads a changed URN as a different
resource: **create the new one, delete the old one.** The create failed —

    POST /v1/sys/mounts/database → 400: path is already in use at database/

— which was the lucky outcome. Had it succeeded, the paired delete would have unmounted
`database/` and taken every static role with it, leaving the then-eight rotating apps holding
credentials nothing could rotate or verify. **Never resolve this class of conflict by
unmounting the path to "clear" it.**

The fix took two attempts, and the difference matters:

| attempt | form | result |
|---|---|---|
| #1154 | `aliases: [{ noParent: true }]` | **did not work** — Pulumi still planned a create |
| #1156 | `aliases: ["urn:pulumi:system::system::vault:database/secretsMount:SecretsMount::postgres-rotation"]` | worked |

The spec form should be equivalent and is not, at least for a re-parented resource with
children. Use the full old URN string. During the failure the state was intact throughout — the
old parentless mount and all its static roles were still present and unmarked — so no state
surgery was needed, and none was performed.
### passwords.sops.yaml is down to two documents (2026-08-26)

Every app password is out of the file. What remains is `postgres-user-password` and
`postgres-superuser-password` — the CNPG cluster's own bootstrap and superuser credentials,
consumed by `cluster-users.yaml` and `resources/values.yaml`. Neither is an app credential, and
neither is rotated by OpenBao, so the file does not disappear entirely. 19 documents down to 2,
46471 bytes down to 4943.

It went in four steps rather than one, deliberately:

| step | documents | why separate |
|---|---|---|
| `openbao` | 19 → 18 | phase 2.4b; its password was already NULL |
| group E (`outline`, `retrom`, `strmgen`) | 18 → 15 | dropped apps; orphaned ExternalSecrets deleted first so they would not error against a vanished source |
| **rehoming** (#1176) | — | the enabling change: `hostname`/`port`/`database`/`username` now come from `${APP}-postgres-conn`, so a rotating app reads this file not at all |
| the 13 app documents | 15 → 2 | only safe once every app had actually repointed |

That last gate mattered. Immediately after #1176 merged only **4 of 13** apps had repointed,
and deleting the documents then would have broken the other nine. The cause was not the
rehoming: it was 08:38, inside the `02:00-09:00` downscale window, with `garage-operator` at
zero replicas and its `failurePolicy: Fail` PVC webhook failing every dry-run — so
`volsync-system/volsync` was not Ready and every app that depends on it was gated. The nested
`<app>-postgres` Kustomizations reported the current revision throughout, because they
re-render their own path; what was stale was `spec.patches`, written by the blocked parent.
Forcing `reconcile.fluxcd.io/requestedAt` on the parents did nothing. It resolved on its own at
09:00.

Credentials were fingerprinted before the rehoming and compared after: **13/13 byte-identical**,
zero auth failures. Same values, different source.

### Phase 4 tranches complete — and why the last step is not a deletion

All **13 live consumers** now take their password from OpenBao: `coder`, `crowdsec`, `forgejo`,
`freshrss`, `grafana`, `immich`, `n8n`, `pinepods`, `pulsarr`, `questarr`, `romm`, `tandoor`,
`windmill`. Verified estate-wide: 13/13 at 20 characters, zero auth failures. The only
`<app>-postgres` ExternalSecrets not on a generator are `openbao` (client certificate, phase 2)
and the three dropped orphans.

**`passwords.sops.yaml` is still load-bearing, so the phase 4 line "delete
`passwords.sops.yaml`" is wrong as written.** Each `<app>-postgres-password` Secret carries
five keys:

    database, hostname, password, port, username

and the OpenBao generator returns only **username and password**. `database`, `hostname` and
`port` reach the app from the sops document and nowhere else, so deleting the file today strips
the connection metadata out of all 13 apps at once.

None of those three are secrets. Retiring the file therefore needs the metadata rehomed first —
a ConfigMap, the CNPG-generated `<app>-app` Secret, or the component rendering them literally —
and only then can the sops document go. Treat it as its own piece of work, not a cleanup step.

**Group E is fully cleaned up (2026-08-26).** The orphaned `ExternalSecret`s for `outline`,
`retrom` and `strmgen` were deleted directly — unowned, nothing recreated them — which
garbage-collected their generated Secrets, and their three documents were removed from
`passwords.sops.yaml`, so Flux prunes the `-password` Secrets too. Nothing of those three
remains.

That leaves **15 documents** in the file: the 13 rotating apps plus `postgres-user-password`
and `postgres-superuser-password`. The 13 are **not** dead — see above; they still carry
`hostname`, `port` and `database`, which the OpenBao generator does not supply. Retiring the
file is still the rehoming job, not a deletion.

### What the cutover burst actually tracks (corrected)

#1147 recorded that pooled apps take a cluster of auth failures at rotation and per-request
apps take none. Tranche 8 refined it, by contradicting a prediction made in #1169.

`windmill` holds ~51 pooled connections, so the expectation was the loudest cutover of the
migration — `coder` had logged 8 failures with only 4 backends. It logged **4, inside 3
milliseconds**.

The reason is that **PostgreSQL does not terminate existing sessions when a role's password
changes.** Those 49 live connections went right on working; only attempts to open a *new*
connection during the gap failed. So the burst size tracks connection **churn** in the seconds
between rotation and the Reloader restart — not pool size. A large idle pool is quiet; a small
busy one is not.

Practical consequence: pool size is the wrong thing to look at when judging how disruptive a
rotation will be. Reconnect rate is the right one.

### Group E dropped (2026-08-25)

`outline`, `retrom` and `strmgen` are gone: `Database` CR, database and role each removed.

They were disabled apps, not live ones. All three are commented out of their parent
kustomization (`# - ./outline/ks.yaml` and so on), so no Flux Kustomization managed them — but
their CNPG `Database` CRs survived anyway, because `components/postgres` sets
`deletionPolicy: Orphan` on its nested Kustomization. **Disabling an app in the repo therefore
leaves its database behind, silently.** That is the mechanism worth remembering; it will happen
again for the next app that gets commented out.

Verified empty before dropping anything, because `DROP DATABASE` has no undo. `n_live_tup`
reported 0 rows for all three, but that is a stats estimate, so exact counts were taken across
every table: `outline` had 44 tables of which only `SequelizeMeta` held rows (276 — the
migration ledger, so it had migrated once and never been used), and `retrom` and `strmgen` were
entirely empty. `outline`'s 10 MB was schema; the 7619 kB on the other two is PostgreSQL's
empty-database baseline.

Order matters. The CRs carry `databaseReclaimPolicy: retain`, so deleting them does **not**
drop the database — the CRs went first (safe, nothing recreates them), then `DROP DATABASE`,
then `DROP ROLE`. Reversed, the CNPG controller recreates the database underneath you.

**`discoverPostgresApps()` still counts all three.** It globs `kubernetes/apps/**/ks.yaml` and
parses `spec.components`; it never checks whether a parent kustomization actually includes that
`ks.yaml`. So it reports 16 consumers when 13 are live. Harmless for the existing guard, which
compares two lists derived the same way — but adding `./rotate` to a commented-out app would
create a static role for a PostgreSQL role that does not exist, and every scheduled rotation
would then fail in a log nobody reads. Worth a guard if group E ever recurs.

### Group D, measured (2026-08-25)

The sweep grouped by *probe shape*; these are the actual boots, taken from each pod's own
`Initialized → ContainersReady`. Having no startup probe mattered far less than the ratio of
boot to budget:

| app | boot | liveness budget | margin | verdict |
|---|---|---|---|---|
| `pinepods` | 144s | 210s | **1.5×** | needs a startup probe first |
| `questarr` | 51s | 180s | 3.5× | rotate directly (tranche 6) |
| `forgejo` | 11s | 300s | 27× | rotate directly (tranche 6) |

The two that actually broke or nearly did had *negative* margin: tandoor 160s against 40s,
romm 49s against 30s.

`pinepods` needs a different mechanism than tandoor and romm got. Its chart exposes no probe
values at all — the reloader annotation already reaches it through a post-render kustomize
patch — so a startup probe has to travel the same way.

**Correction to the sweep above:** it originally listed `autobrr` and `forgejo-runner` in
group D. Neither is a Postgres consumer. `autobrr`'s component line is commented out and
`forgejo-runner` has no `components/postgres` at all; both were picked up by a shell `grep`
that happily counts commented lines, where `discoverPostgresApps()` parses YAML and correctly
excludes them. The real count is **16 consumers**, not 17. Take the app list from the
discovery function, never from grep.

### Boot-budget sweep of the remaining apps

Run 2026-08-25 against the live cluster, after tandoor. A rotation is a forced restart, so the
question for each app is whether it can finish booting before something kills it.

| group | apps | finding | consequence |
|---|---|---|---|
| **A** | `coder`, `pulsarr`, `immich` (app + ML), `windmill-extra`, `windmill-workers-*`, `forgejo-garage-storage` | **no liveness probe at all** | cannot be probe-killed mid-boot; safe from tandoor's failure mode |
| **B** | `n8n` (~600s), `windmill-app` (~600s) | generous startup probe | protected |
| **C** | `romm` (~30s) | startup probe present but **short** | check its real boot time before opting in |
| **D** | `questarr`, `pinepods`, `forgejo` | **no startup probe**; the liveness budget is all the boot time they get | see the measurements below — only `pinepods` is actually tight |
| **E** | `outline`, `retrom`, `strmgen` | orphaned `Database` CRs, no workload | **dropped 2026-08-25** — see below |

Tandoor's cold boot measured ~2m40s, so a budget under ~180s is not obviously safe — group D is
ordered by how little room it has.

Suggested order, safest first: **A** (`coder`, `pulsarr`) → **B** (`n8n`) → **C** (`romm`, after
timing its boot) → **D** (each preceded by a startup probe) → `windmill` (its rotation path runs
only through a Helm re-render, still untested) → `immich` last, since it composes a second
sibling component. Group **E** is a cleanup decision, not a tranche.

### The constraint to sit with

**Rotation cannot be switched off.** `rotation_period` is mandatory (minimum 5s), OpenBao has
no `skip_import_rotation`, and creating a static role rotates the password immediately.
[openbao#284](https://github.com/openbao/openbao/issues/284) — the request to disable auto
rotation — is still open. Every app in the tranche becomes a rotating-credential app,
permanently, with reloader-driven restarts on the rotation cadence. Choose `rotation_period`
accordingly (720h is a reasonable start) and roll in tranches, tolerant apps first.

### How an app opts in

It does not — rotation is what `components/postgres` **is**, since the fold-in below. One line
in its `ks.yaml`:

```yaml
components:
  - ../../../components/postgres
```

That renders a `DatabaseRole` with no `passwordSecret` (otherwise CNPG and OpenBao fight —
OpenBao rotates, CNPG's role sync sees the role's transaction ID move and re-applies its own
value, OpenBao rotates again), plus a credential ExternalSecret whose password comes from the
`VaultDynamicSecret` generator over `database/static-creds/<app>`. The same component is what
the Pulumi stack discovers to create the static role. Both halves derive from one signal on
purpose: the Kubernetes half makes the app able to read a rotated password, the OpenBao half
rotates it, and if only one landed the app would hold a credential it cannot use. A
hand-maintained list in the stack could disagree; a discovered one cannot.

### `rotate` folded into `postgres` (2026-08-26)

`components/postgres/rotate` is gone. Its two patches were moved into the base component's
`./database` manifests — `databaserole.yaml` simply has no `passwordSecret`, and
`credentials.yaml` reads the generator directly — and the `rotate` line was removed from all 14
app `ks.yaml`s.

The staging it provided had done its job: rotation is irreversible per app, so it was rolled out
in nine tranches, and once all 13 live consumers plus `degoog` had migrated the sibling only
described a set that was already universal. More to the point, **`components/postgres` alone was
by then a broken configuration**: `passwords.sops.yaml` holds no `<app>-postgres-password`
document any more (#1177), so the base component's `passwordSecret` pointed at a Secret that
could not exist and its ExternalSecret extracted a key that was not there. A new app that forgot
the `rotate` line would silently never get a role.

Two things had to be handled for the fold-in to be a no-op:

- **The Pulumi discovery collapsed to one function.** `discoverRotationOptIns()` is gone;
  `discoverPostgresApps()` is the tranche. The cross-check it used to guard (`./rotate` present
  without `./postgres`) became unrepresentable.
- **The three group-E apps had to be disabled first.** `outline`, `retrom` and `strmgen` still
  carried a live `components/postgres` line even though their role and database were dropped on
  2026-08-25 — they are commented out of their parent kustomizations, which the YAML-parsing
  discovery cannot see. Folding without touching them would have put three roles that do not
  exist into the tranche and failed `stacks/system` on the first run with the exact 42704 error
  below. Their component line is now commented out, matching how `autobrr` already carried one.

Verified before and after: the discovered tranche is byte-identical either way —
`coder, crowdsec, degoog, forgejo, freshrss, grafana, immich, n8n, pinepods, pulsarr, questarr,
romm, tandoor, windmill`. No static role is created or deleted by this change.

### Ordering: two constraints, opposite directions

The guidance above — *merge the Kubernetes half before the Pulumi run picks the app up* — is
correct for a **migrated** app and incomplete for a **new** one. It cost a stalled stack when
`degoog` was deployed (#1180).

| case | constraint | failure if violated |
| --- | --- | --- |
| migrated app | Kubernetes half **before** the Pulumi run | the reverse rotates a password the app cannot yet read: an outage |
| **brand-new app** | the PostgreSQL login role **before** the Pulumi run | `stacks/system` fails outright |

The first works because the generator reads a `static-creds` path that does not exist yet, ESO
errors, and `deletionPolicy: Retain` keeps the existing Secret so the app rides through on its
current password until the static role appears.

The second is new, and it is not an ordering anyone gets to choose. Creating
`database/static-roles/<app>` immediately issues `ALTER ROLE ... PASSWORD` against PostgreSQL,
so if CNPG has not created the login role yet:

```
Code: 500 ... error setting credentials: failed to execute query:
ERROR: role "degoog" does not exist (SQLSTATE 42704)
```

Migrated apps never hit this — their role already existed from the sops era. A new app ships
both halves in **one commit**, the Pulumi operator reconciles that merge within seconds, and
Flux's `cluster-apps` runs on its own interval, so **Pulumi reliably wins the race**. After 3
failures the Stack goes `Stalled/UpdateFailed`, and with `continueResyncOnCommitMatch: false`
and `resyncFrequencySeconds: 86400` it will not retry for a day.

Recovery, in order:

```bash
flux -n flux-system reconcile ks cluster-apps
kubectl -n database get databaserole <app> -w        # wait for status.applied
kubectl annotate stack -n pulumi system pulumi.com/reconciliation-request=$(date +%s) --overwrite
kubectl -n database annotate externalsecret <app>-postgres force-sync=$(date +%s) --overwrite
```

**That last step is a real third-order symptom, not belt-and-braces.** After the static role
lands and the `database`-namespace `<app>-postgres` ExternalSecret goes `Ready=True`, the app's
own `<app>-env` ExternalSecret can stay stuck on a cached
`error processing spec.dataFrom[N].extract, err: Secret does not exist`, leaving the pod in
`CreateContainerConfigError` until it is forced to re-resolve.

**Why this is not made self-healing in `stacks/system`.** Skipping an app whose PostgreSQL role
does not exist yet — so the run succeeds and the role appears on the next pass — was considered
and rejected. The stack holds no PostgreSQL client by design (baoadmin's key never enters Pulumi
state or the Minio backend), so the check would have to read the live CNPG `DatabaseRole` CR.
That makes a plan currently derived from repository files depend on cluster state, and the
failure mode inverts badly: an app omitted from the tranche is not skipped, it is **deleted** —
Pulumi would destroy the static role of a live rotating app on any transient read failure,
leaving a password nothing owns. Weighed against a stalled run that one `kubectl annotate`
clears, loud-and-stuck is the better failure. If the day-long stall itself becomes the problem,
the honest fix is on the Stack CR (`resyncFrequencySeconds` / `continueResyncOnCommitMatch`), so
the run retries and converges — not a conditional resource.

**The sops document is no longer read.** `hostname`/`port`/`database`/`username` come from
`<app>-postgres-conn` since #1176; a `static-creds` response carries only `username` and
`password`, and the generator is listed second so its password wins.

### Prerequisite: every consuming workload must see a rotated password

A rotated password only reaches an app if *something* makes it take effect. Re-audited properly
on 2026-08-24, and there are **three** mechanisms in play, not one — an earlier version of this
table assumed only the first and got two apps wrong.

| Mechanism | How it works | Needs |
| --- | --- | --- |
| Stakater Reloader | restarts the workload when a Secret it references changes | `reloader.stakater.com/auto: "true"` **on the workload**, not the pod template |
| Helm `valuesFrom` | helm-controller re-renders the release when a referenced Secret changes | nothing — automatic |
| ESO reloader | annotates *downstream ExternalSecrets* so a chained sync re-runs | the `Config` CR, already deployed |

Per app:

| App | Mechanism | State |
| --- | --- | --- |
| coder, crowdsec (lapi + ui), freshrss, grafana, immich, n8n, openbao, pulsarr, questarr, romm, tandoor | Stakater, annotation present on the Deployment | fine |
| **windmill** | **Helm `valuesFrom`** — `windmill-pguser-secret.uri` → `targetPath: windmill.databaseUrl` | **fine, and Reloader is the wrong tool**: its pods reference no Secrets at all, so the annotation would be inert. A rotation changes the ExternalSecret, helm-controller re-renders, the Deployment's literal `DATABASE_URL` changes and the pods roll. |
| **pinepods** | Stakater — `envFrom: pinepods-env`, which carries `DB_PASSWORD` | **was the only real gap.** Fixed by a `postRenderers` patch; the chart offers no Deployment-annotation value. |
| forgejo, outline, retrom, strmgen | — | no running workload; `outline`/`retrom`/`strmgen` are not deployed at all (see the phase 1 outcome) |

Two things worth carrying forward:

- **The annotation must be on the Deployment.** Windmill's chart puts `windmill.app.annotations`
  on the *pod template*, which is why the estate looked like it had reloader coverage there and
  did not. Check `metadata.annotations` on the workload, never the values file.
- **Windmill's password ends up as a plaintext literal in the Deployment's pod spec**, because
  `valuesFrom`/`targetPath` injects it into Helm values at render time. That is pre-existing and
  out of scope here, but it means `kubectl get deploy windmill-app -o yaml` prints a live
  database password.

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
