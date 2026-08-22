# OpenBao migration — status and handoff

> **Moved here from `david-driscoll/vault` on 2026-08-22.** This is a historical record of
> the 1Password → OpenBao migration, kept verbatim. "This repo" / "the vault repo" in the
> text below refers to `david-driscoll/vault` as it was at the time; the `bootstrap/` and
> `docs/openbao-migration/` paths it names now resolve inside home-operations, and its
> `stacks/vault` is now `stacks/vault` here. The vault repo's own code (`components/store`,
> its parity script) was a trimmed copy of this repo's and was not carried over.

Where the 1Password → OpenBao migration actually stands, and what a fresh session (or a
human coming back to this in a month) needs to know to continue.

`PLAN.md` alongside this file is the full design. This file is the current state.

**Last updated:** 2026-08-12, verified against the live server throughout.

**PHASE 8 IS COMPLETE AND LIVE (2026-08-12).** `BAO_STORE_READS=1` on all eight
home-operations Stack CRs and in `.config/mise.toml`; all nine operator stacks Ready on
the full new path; `scripts/bao-store-parity.ts` **fully green, every section**: 12
literal titles, `getDockgeInstances` (4), 6 cluster definitions, `Authentik Outputs`,
`getTailscaleExports` (3 stacks / 13 hosts), `getBackupPlans` (52 plans). The `vals`
resolver runs live inside the operator's workspace pods (a mise initContainer installs
the pinned binary), all 8 `docker/` `op://` refs and the plex ApplicationDefinition ref
are `ref+openbao://`, and every previously-frozen 1Password inventory item updates again.

Landed 2026-08-11/12: home-operations #718–#727, #737, #738 (plus #723/#724, which exist
because stacked-PR merges land in their BASE branch unless the branch is deleted — three
"merged" PRs never reached main until consolidated), equestria-cluster#3105, vault#175.
Read "What completing Phase 8 flushed out" below before Phase 9 — four of those PRs fix
estate bugs the migration exposed rather than migration code itself.

Local runs now REQUIRE `eval "$(bootstrap/openbao/pulumi-env.sh)"` (this repo) — without
BAO credentials, `GlobalResources` fails loudly at construction rather than silently
reading a different store than the operator.

**PHASE 11 IS COMPLETE AND LIVE (2026-08-12) — THE MIGRATION IS DONE.** Pulumi
reads NOTHING from 1Password: `VaultStore` is abstract, `BaoStore` is the only
implementation, and a preview run with `CONNECT_*` set to EMPTY gets 64
resources in before failing on a WRITE — which is the proof, not an inference.
Zero live `op://` references remain under `docker/` (37 converted, one turned
into config). All ten Pulumi stacks succeeded. See "Phase 11 — the hand-over"
below.

**PHASE 10 IS COMPLETE AND LIVE (2026-08-12).** **Zero PushSecrets remain in the
estate** — the round-trip-through-1Password pattern is gone. Verified live on both
clusters, end to end: manual backup runs succeeded with no 1Password involvement at
all (equestria 16 databases + 2 skipped, SGC 3), and Authentik itself reports
`healthy: true` dialling both remote clusters with the kubeconfig Pulumi now builds
from the cluster-issued credential. Landed as equestria-cluster#3127/#3128,
stargate-command-cluster#1810/#1811, home-operations#740, vault#181. See "Phase 10 —
the PushSecrets are retired" below, including the two orphaned databases and the
wrong-cluster restore script it flushed out.

**Only Phase 11 remains.**

**PHASE 9 IS COMPLETE AND LIVE (2026-08-12).** This repo's own stack has the same
`components/store` seam — `BaoStore` behind `BAO_STORE_READS`, checked-in cluster
YAML, its own parity script (**fully green on the first live run**: 5 literal titles,
`getDockgeInstances` 4, all 6 cluster definitions) — and the operator has RUN it:
vault#179 + home-operations#739 merged, the vault Stack reconciled `main@18accff`
with the flag set and **succeeded, 0 failures**, and a post-run flag-on preview is
back to the stack's standing 7-change baseline with ZERO `~cluster` diffs — the
one-time shape change applied and converged. See "Phase 9 — this repo's own stack"
below, including the fifth estate bug the port review found (the section-blind
parity comparator, fixed in BOTH repos).

**Remaining in the plan: Phase 10** (retire the PushSecrets), **Phase 11** (stop
writing 1Password; retire `dynamic/1password/` and the `op://` resolver — the last live
`op://` in docker/ is the bao-transit seal key, gated on the Phase 2 leftover below).

**PLAN §G's "inventory → stack outputs + StackReference" is impossible as written** — every
stack has its own DIY backend. The estate decision is to route inventory through OpenBao
and make cluster definitions code. See "Phase 8 — the read seam" below.

**Phases 0–5 and 8a are complete. Phase 6's ExternalSecret half is done** — **zero live
ExternalSecrets declare `onepassword-connect`**, checked against the server, so
`meilisearch-env` landed too.

**PHASE 7 IS ALL BUT COMPLETE (2026-08-10).** SGC now runs **44 ExternalSecrets on
OpenBao and ZERO `OnePasswordItem` CRs**, with 3 left on 1Password — and those three are
a *removal*, not a migration. See "Phase 7 — SGC" below.

**PHASE 6 IS COMPLETE (2026-08-10 ~14:10Z).** All 21 convertible `OnePasswordItem` CRs are
ExternalSecrets, merged and applied — equestria-cluster#3099, #3100, #3101, #3102 and
home-operations#709. Verified live: **one** OnePasswordItem left estate-wide
(`pulumi/pulumi-operator-passphrase`, bootstrap-tier, stays forever), 111 ExternalSecrets on
`openbao`, **zero unhealthy**, and every Kustomization/HelmRelease/ExternalSecret in the
cluster Ready with `lastAppliedRevision == lastAttemptedRevision`. See `PHASE6.md`.

**OIDC login is LIVE.** Both roles exist, the policies are correct, and
`auth/oidc/oidc/auth_url` returns an Authentik authorize URL for `admin` and `family`.
The only step not machine-verifiable is a human browser login — see "OIDC is live".

Phase 8a's `stacks/home` half also works: `secrets/hosts/pbs/` and the
`clusters/celestia/apps/*` paths are populated.

The bigger find along the way: **break-glass did not work and never had.** That is now
fixed and the generate-root listener toggle is retired permanently — see
"Break-glass was broken".

---

## Done and merged

| Phase | What | Where |
|---|---|---|
| 0 | Collapsed the duplicate `OPClient` (`components/op.ts` ↔ `components/store/op.ts`) | home-operations#676 |
| 0b | Fixed the import cycle that collapse introduced | home-operations#676 |
| 1 | `vault` became the SOPS home: `.sops.yaml`, `bootstrap/INVENTORY.md`, `bootstrap/RUNBOOK.md` | vault#145 |
| 2 | `bao-transit` compose stack on alpha-site | home-operations#676 |
| 4 | `op-to-bao` conversion tool (`--plan` / `--apply` / `--verify`, 23 tests) | home-operations#676 |
| 2 | `bootstrap/openbao/bao-transit.sh` | vault#146 |
| 3 | OpenBao HA manifests for equestria, still `suspend: true` | equestria-cluster#3045 |
| 3 | **`bao-transit` initialised** — transit key, policy, seal token all live | this repo |
| 3 | equestria unsuspend + `equestria-init.sh init` — 3/3 unsealed, mounts, policies | equestria-cluster#3061, vault#147 |
| 5 | Break-glass replication manifests — dump + restore-test CronJobs | equestria-cluster#3071 |
| 5 | `bao-standby` compose stack + dump receiver for alpha-site | home-operations#685 |
| 5 | RUNBOOK Scenarios B/D + `bootstrap/openbao/restore-test.sh` | vault#151 |
| — | Reloader annotation + `RollingUpdate` — ConfigMap changes now actually roll the pods | equestria-cluster#3072, #3075 |
| — | generate-root listener toggle opened, then reverted; confirmed 403 again | equestria-cluster#3067, #3070 |
| 8a | OIDC moved out of `equestria-init.sh oidc` into `components/openbao/oidc.ts` | home-operations#688 |
| 8a | Generated-credential dual-write via the official Pulumi Vault provider | home-operations#683, #689 |
| 8a | Pulumi authenticates with the `pulumi` AppRole instead of a hand-minted token | home-operations#692, vault#153 |
| 8a | Dual-write gate accepts the AppRole — without it every write silently skipped | home-operations#694 |
| 8a | `pulumi` policy reaches `sys/mounts/auth/oidc`, unblocking the OIDC roles | vault#155 |
| 8a | **OIDC login live** — `admin`/`family` roles created and verified | this session |
| — | DockgeLxc file-copy trigger no longer encodes the checkout path | home-operations#693 |
| — | `root-ceremony.sh` + break-glass AppRole; generate-root toggle retired for good | vault#156, equestria-cluster#3079 |
| 5 | restore-test AppRole credentials replace the PROVISION-ME placeholders | equestria-cluster#3080 |
| 6 | `ClusterSecretStore/openbao` + the `eso-equestria` kubernetes auth role | equestria-cluster#3082, vault#159 |
| 6 | **89 ExternalSecrets migrated** across ~12 PRs in both repos | equestria-cluster#3084–3094, home-operations#699–708 |
| 6 | Backblaze Database dropped for TrueNAS Minio; dead tailscale volsync ES deleted | equestria-cluster#3092, #3093 |
| — | `grafana` Kustomization unstuck — `DS_PROMETHEUS` escaped in two dashboards | equestria-cluster#3095 |

**Merged ≠ applied**, and this bit hard: for most of 2026-08-08 the 8a code was all on
`main` while almost none of it had executed. A `pulumi up` reporting success was not
evidence it had — see the gate bug in "OIDC is live". Check the live KV tree, not the
merge history.

---

## Phase 11 — the hand-over (2026-08-12)

PLAN §G row 11 called this "hand over, don't tear down", and that is what it
turned out to be — 1Password keeps running, keeps its items, and keeps being
written for exactly one family.

### What actually moved

| | |
|---|---|
| `op://` references under `docker/` | **37 converted to `ref+openbao://`, 0 live remain** |
| Pulumi reads from 1Password | **none** — `VaultStore` is abstract, `BaoStore` is the only store |
| Pulumi writes to 1Password | the PBS items only (estate decision: they are a human LXC login) |
| `dynamic/1password/`, `OPClient`, `CONNECT_*` | **stay**, because that write stays |

The seal key left 1Password separately: it lives at `/var/local/unseal-key` on
dockge-as, root-owned 0400, with its durable copy at
`bootstrap/openbao/alpha-site-static-unseal.sops.yaml` — the SOPS home
INVENTORY §2 named for it since Phase 1 and which had never been created. Until
then that key existed in exactly two places with no backup surviving the loss
of either.

### The reference conversion, and the one that could not convert

The mapping was explicit, not a regex sweep: every item title mapped by hand,
every target verified against the live server (path exists, carries every field
referenced) BEFORE anything was written. Two of my own tools lied along the way
— an extraction regex that excluded spaces (missing `Docker Postgres` and
friends) and a verification script whose shell quoting reported four healthy
paths as missing fields. Both failed safe; the second one nearly did not.

One reference could not become a reference at all:

```
op://Eris/Cluster: ${CLUSTER_TITLE}/icon
```

That is a CLUSTER DEFINITION field, not a credential. `resolveBaoPath` refuses
`Cluster: ` titles by design, so no OpenBao path exists or should. It became a
`${CLUSTER_ICON}` substitution alongside `${CLUSTER_TITLE}`. A blind conversion
would have pointed it at a path that can never exist.

### Removing the fallback was the point, not a side effect

`VaultStore`'s 1Password implementations were reachable whenever
`BAO_STORE_READS` was unset. They are gone, and the enumerated exceptions in
`getSecretByTitle` THROW rather than falling back.

The reason is the one this migration has now met four times: **once Pulumi
stops writing 1Password, its copies are frozen, so falling back to them means
authenticating with a stale credential and seeing no symptom.** A fallback
nobody exercises is a trap, not insurance. `BAO_STORE_READS` went with it — an
env var that looks like a switch but is not is worse than none.

`scripts/bao-store-parity.ts` was retired for the same reason: it proved the
two stores agreed, and it cannot do that once one side stops being written.
That supersedes the earlier note about keeping it — it caught real bugs
precisely because BOTH sides were live.

### Cluster definitions: one source, published

The vault repo carried a byte-identical copy of `/clusters/*.yaml` under a
"`diff -r` must come back empty" convention introduced in Phase 9. That was a
maintenance trap of exactly the kind this migration keeps finding. New
`stacks/system` in home-operations publishes the checked-in YAML to
`clusters/<key>/details`; both repos read from there; the vault copies are
deleted. The two stores are now byte-identical files apart from the YAML loader
(which lives where the YAML lives) and the write path (which vault does not
have).

Hazards handled explicitly in the reader, each worth keeping:

- a directory under `clusters/` proves nothing — `_inventory/` is not a cluster
  and `twilight-sparkle/` has app credentials but no definition. Only a
  readable `details` path counts.
- an EMPTY result THROWS (`assertClustersFound`). Consumers turn this list into
  DNS records, ACL grants and backup plans, so "no clusters" reads as "remove
  everything".
- `parseClusterDetails` checks the `key` field against the path it came from,
  because `clusterSecretPath` derives from that key and a mismatch would read
  another cluster's credential.

### Three bugs this phase exposed in code that predated it

1. **The `OnePasswordItem` diff planned DELETE + RECREATE on every preview.**
   During preview an unresolved input arrives as `pulumi.runtime.unknownValue`
   — an ordinary 36-character string. `sections` WAS that string, and
   `Object.entries()` over a string yields one numeric key per character, so
   the item appeared to lose all seven named sections and gain 36 empty ones.
   That patch populated `replaces`, and the resource declares
   `deleteBeforeReplace: true`. Nothing distinguishes the sentinel from data by
   shape — a real UUID is also 36 characters — so `diff` now refuses to diff
   when any input contains it. **Second time this provider's diff was
   confidently wrong** (the first froze every value-only update for months).

2. **Three writers declared no `concealed_fields`** while writing credentials —
   including the OIDC `client_secret`, which is READ live. It stayed out of
   state in the clear only because @pulumi/vault declares its own field
   sensitive: provider luck, not design. `baoKvSecret` now REQUIRES a
   `concealedFields` declaration; `[]` is how you say "nothing here is secret".

3. **`shared/thanos-s3-storage` was a frozen twin, live.** Two ExternalSecrets
   read it while the only producer wrote 1Password — they were reading the
   one-time op-to-bao copy from 2026-08-08, never refreshed.

### Two mistakes of mine worth recording

- **A defanged scheme in prose is not defanged if it is well-formed.** The
  comment I wrote explaining that the seal key can never become an OpenBao
  reference contained a well-formed `ref+openbao` scheme, and the residue guard
  failed every home-operations run until it was reworded — in the same sentence
  that correctly broke `op://` apart, citing the lesson that produced the rule.
- **`system:auth-delegator` is not about what a stack reaches.** I removed it
  from the new stack's ServiceAccount as "least privilege"; it is how the
  OPERATOR authenticates the workspace's gRPC connection. The stack sat
  Reconciling forever, `1/1 Running`, producing no state at all — a failure
  that does not error, it just never starts.

### What 1Password still does

Runs, holds every item, and receives the PBS writes. Nothing reads it from
code. The `op://` references in `.mise.toml` files are local developer env,
resolved by `op run` on a laptop — explicitly out of scope and staying.

---

## Phase 10 — the PushSecrets are retired (2026-08-12)

PLAN §G row 10 said "retire the 256 PushSecrets". The live count was **31** (22
equestria + 9 SGC); 256 was never re-checked after the estate shrank. All 31 are gone.

Three families, and only one of them was what the plan described:

| family | count | what it actually was |
|---|---|---|
| `<app>-postgres` + `postgres-user`/`-superuser` | 23 | a true round trip: the backup CronJob read back Secrets a PushSecret had pushed **from its own namespace** 24h earlier |
| `definition-crds` | 4 | a kubeconfig pushed to 1Password that **nothing consumed** — swept all four repos, only op-to-bao mapping rows referenced it |
| `authentik-outpost` | 4 | a genuine cluster→Pulumi handoff, not a round trip — needed a real replacement |

### The postgres round trip

`App.cs` now reads `database/<db>-postgres` and `database/postgres-user` through the
Kubernetes API. `KubernetesClient` was **already a declared package in that file and
unused**. The CronJob gained a ServiceAccount and a namespace-scoped Role and lost the
ExternalSecret that existed only to hand it a `CONNECT_TOKEN`.

RBAC came out exactly least-privilege, confirmed against the live cluster with
`kubectl auth can-i --as`: `get secrets` in `database` **yes**, `list` **no** (the code
only reads by name), `get` in `kube-system` **no**.

### What the round trip was hiding

**`keeper` and `vikunja` were being backed up every night from FROZEN 1Password
items.** Their apps were removed 2026-03-26 and 2026-07-27, their PushSecrets went with
them, and nothing noticed for months — because **a stale credential still
authenticates**. The k8s Secrets were gone; only the 1Password copies kept the job
green.

Estate decision: retire them explicitly. They are named in `DECOMMISSIONED_DATABASES`
(per-cluster config in `cronjob.yaml`, carrying the date each app was removed), skipped
by name, printed every run. Deliberately an **explicit allowlist**, never "skip anything
with no Secret" — that rule is precisely how a *live* database would drop out of the
backup set silently, which is the failure this phase existed to end. Nothing was
deleted: both databases (7.6 MB / 10 MB) and every existing dump stay.

**The general rule this makes concrete:** reading a credential from a copy means a
DELETED producer is indistinguishable from a healthy one. Phase 8 bug 3 (`hosts/dockge`
froze at Phase 4) is the same shape from the write side; this is it from the read side.

### The wrong-cluster restore script

`scripts/restore-databases.sh` in stargate-command-cluster was **byte-identical** to
equestria's: it read `op://Eris/equestria-postgres-superuser/public-uri` AND set
`APP_NAMESPACE=equestria`, so a restore run from the SGC repo would have suspended
**equestria's** HelmReleases and restored into **equestria's** postgres. Both now read
`postgres-superuser` with kubectl from whatever cluster the current context points at,
so the credential and the target can no longer name different clusters. SGC's
`DATABASES` list was emptied rather than left carrying equestria's app names.

### authentik-outpost — the one that needed a design, not a deletion

Its 1Password item fed `stacks/applications/kubernetes.ts` through
`VaultStore.getKubeConfig`. Two things made the fix obvious once looked at:

- **Only 2 of its 5 fields were secrets.** `sa` is a literal, `cluster` is the cluster
  key, `cluster_api` is `apiserver.<rootDomain>` — config Pulumi already had, being
  laundered through a secret store to travel from the cluster to Pulumi.
- **The consumer was already talking to that cluster.** `coreApi` lists namespaces and
  ApplicationDefinitions over the tailnet kubeproxy ~100 lines above the call site, and
  `tailnet-cluster-ops` (the ClusterRole it is impersonated as) already grants
  `secrets: get`. Reading the Secret cost no new provider, no new network path and **no
  RBAC change**.

Repointing the push at OpenBao was rejected: `eso-<cluster>` is **read-only**, so it
would have meant granting every consuming cluster WRITE access to the shared store, and
would have kept a second copy of the credential forever. Reading from source keeps zero
copies in either store.

**`getKubeConfig` was deleted with its last caller, in both repos — that was the point.**
`BaoStore` never overrode it, so under `BAO_STORE_READS` it read 1Password **silently,
with no warning**: the one fallback class the flag exists to eliminate. Dead code that
quietly reads the wrong store is a trap for the next caller.

The riskiest line in the whole phase is the `pulumi.secret()` wrapper on the token. It
came from a Concealed 1Password field, so `getSecretItem` marked it and the kubeconfig
inherited that; reading the API directly loses the marker, and an unmarked kubeconfig
writes a cluster-scoped token into Pulumi state in the clear — **no symptom until
`pulumi stack export`**.

### How it was proved, in order of strength

1. **Authentik reports `healthy: true`** on both remote-cluster ServiceConnections,
   returning `v1.36.3` — the CONSUMER authenticating with the new credential, not
   Pulumi exiting 0.
2. **Manual backup runs on both clusters succeeded** with no 1Password anywhere in the
   path (equestria 16 + 2 skipped, SGC 3). Run deliberately at 15:05Z rather than
   waiting for the 02:00 schedule to discover a failure.
3. **The kubeconfig built from the cluster is identical field-for-field** to the one
   built from the 1Password item, on both clusters, with the secret marker preserved.
4. **`pulumi preview` matched a control run of the pre-change tree** (16 to update /
   360 unchanged both ways; `ServiceConnectionKubernetes` in neither) — the Phase 8
   procedural rule applied.
5. `flate test all` green in both repos; the pre-change credential path was dry-run
   against both live clusters before any manifest changed.

### Left behind deliberately

The 31 1Password items freeze rather than disappear — every PushSecret carried
`deletionPolicy: None`, which is the Phase 11 hand-over policy applied early. Nothing
reads them; nothing writes them.

---

## Phase 9 — this repo's own stack (2026-08-12)

`stacks/vault` reads five literal credentials plus the kubernetes cluster
definitions, all through `globals.store` — the same seam Phase 8 cut in
home-operations, which is why the port is small. What landed, on
`claude/phase9-vault-stack-cutover`:

- **`components/bao.ts`** — a READ-ONLY BaoClient (read + list + `baoSlug`).
  The write half is deliberately absent: this repo produces no credentials and
  no inventory, and porting an unexercised write path invites the Phase 8
  "frozen twin" bug in reverse. The header says where to get it if a producer
  ever appears.
- **`components/store/bao.ts`** — `BaoStore` trimmed to this repo's reads:
  the resolver ported WHOLE (a resolver that diverged would send the same
  title to different paths depending on which repo asked), cluster
  definitions from `/clusters/*.yaml` + credential hydration, and
  `getDockgeInstances` as a parity-checkable canary. The unported inventory
  reads (`getTailscaleExports`, `getBackupPlans`) **throw** — inheriting the
  1Password read under `BAO_STORE_READS` would be a silent store fallback,
  the exact failure mode the flag exists to prevent.
- **`/clusters/*.yaml` + `components/store/clusters.ts`** — verbatim copies;
  **home-operations is the canonical set**. `diff -r` between the two repos'
  `/clusters` must come back empty; a cluster add/rename there gets mirrored
  here in the same estate change.
- **The base `VaultStore` picked up the two Phase 8 fixes it predated**: the
  constructor read `this.getSecretByTitle` (the virtual-dispatch trap —
  subclass dispatch before subclass fields exist; `tailscaleDomain` is a lazy
  getter now), and `replaceOnePasswordPlaceholders` resolved `op://` through
  the subclass (now a protected `getOnePasswordItemByTitle`). Also dropped:
  an unused `@components/globals.ts` import in `store/index.ts` that was the
  Phase 0b import cycle waiting to happen.

### The gates, all green (2026-08-12)

- **`scripts/bao-store-parity.ts` fully green on the first live run**: 5/5
  literal titles, `getDockgeInstances` (4), all 6 cluster definitions —
  values, key sets, `secret()` markers, `meta.title`.
- **Preview pairs per the Phase 8 procedural rule.** Control (1Password ×2):
  identical, 7 changes / 28 unchanged — the standing churn of this stack (the
  always-replacing tailscale access tokens, their SecretPatches, the github
  provider's `-token` diff). Cutover (OpenBao ×2): identical op lines, the
  baseline plus five `~ custom:* [diff: ~cluster]` component updates.
- **The `~cluster` diff was pulled apart with `--diff`, not inferred**: the
  only property changes are `- meta.category`, `- meta.urls`, and
  `- notesPlain` — the three fields OpenBao does not carry BY DESIGN. Every
  consumed field (including `secret` and the kubeConfig) is byte-identical.
  One-time component-input update, cascades to no child resource.

### The port review found a fifth estate bug — the parity gate itself

An adversarial review of the port against the canonical copy confirmed:
**`canonical()` compared with `JSON.stringify(value, sortedKeyArray)`, and a
replacer ARRAY filters keys at EVERY depth** — any field that exists only
inside a section (`ssh.username`, `backrest.privateKey`…) was dropped from
BOTH serializations, so section-level drift compared equal. The
`getDockgeInstances` check — items that are exactly the sectioned shape —
was hollow, in this port AND in the merged Phase 8 script it was copied
from. Both scripts now deep-sort recursively, and both were re-run live
against both stores with the honest comparator: **fully green, all
sections** (home-operations: 12 titles, dockge 4, 6 clusters, Authentik
Outputs, 3-stack/13-host exports, 52 plans). So the blindness was latent,
not an incident — but "the gate passed" and "the gate could fail" had been
different claims since Phase 8 landed.

Also fixed in passing: `types/aliases.d.ts` imported `@components/op.ts`, a
path that never existed in this repo (`OPClient` lives at
`components/store/op.ts`) — dead since the initial commit, masked by
`skipLibCheck`, surfaced by the same review.

### Operational facts from the verification runs

- **Anything exported BEFORE `mise exec` is clobbered by `[env]`.** The mise
  env sets `AWS_ACCESS_KEY_ID` etc. to literal `op://…` strings, so
  `export AWS_…=real && mise exec -- pulumi` hands Minio the LITERAL string
  and fails `InvalidAccessKeyId` — which reads like a wrong credential, not
  like no credential at all. Inject overrides AFTER: `mise exec -- env K=V
  pulumi …`, or use `op run` as the wrapper.
- **`op run` needs the 1Password desktop app to approve, and that
  authorization lapses.** Two runs died on `authorization timeout` with
  nobody at the keyboard. The estate-native fallback needs no 1Password at
  all: `pulumi-env.sh` for BAO creds, then Connect token + backend creds
  from the equestria cluster
  (`pulumi/pulumi-operator-connect-token`, `pulumi/truenas-home-operations`,
  `pulumi/pulumi-operator-passphrase` — the passphrase is bootstrap-tier and
  deliberately NOT in OpenBao). `shared/minio-root-user` in OpenBao is a
  DIFFERENT Minio identity than `truenas-home-operations`; both are valid,
  they are not interchangeable evidence about each other.

### The flip — executed 2026-08-12 ~02:15Z

Both PRs merged (vault#179, then home-operations#739). How the live run went,
and what to expect from the next one of these:

- Flux applied the Stack CR change fast, but the Stack's `fluxSource` reads
  the `pulumi/vault` GitRepository, which was still on the pre-#179 commit —
  its interval had not elapsed. One `reconcile.fluxcd.io/requestedAt`
  annotation advanced it, one `pulumi.com/reconciliation-request` annotation
  ran the Stack (see [[pulumi-stack-reconcile-trigger]] in memory).
- The run reconciled `main@18accff` and **succeeded, failures 0**.
- `workspaceReclaimPolicy: Delete` reclaims the pod on success, so the
  "Secret reads: OpenBao" log line is NOT retrievable after the fact. The
  proof is structural instead: the flag is in the CR, the code at that commit
  either serves every read from OpenBao or fails the run loudly, and the run
  succeeded — plus the check below.
- **Convergence check:** a fresh local flag-on preview from `main` after the
  run logs `Secret reads: OpenBao (BAO_STORE_READS)` and shows exactly the
  stack's standing baseline (7 changes / 28 unchanged — the always-replacing
  tailscale access tokens and their dependents) with **zero `~cluster`
  diffs**: the one-time shape change is in state, and OpenBao reads are now a
  no-op against it.
- `.config/mise.toml` sets `BAO_STORE_READS=1`, so local runs match the
  operator and REQUIRE `eval "$(bootstrap/openbao/pulumi-env.sh)"`.

---

## Phase 8 — the read seam (2026-08-10)

`BaoStore` (home-operations `components/store/bao.ts`) is PLAN §D.3's seam, built: it
extends `VaultStore` and overrides only what OpenBao can serve, so the other reads keep
working untouched and move in their own commits. `BAO_STORE_READS=1` flips every
`globals.store` read; unset, nothing changes. `GlobalResources` logs which store a run used.

Also landed: `bootstrap/openbao/pulumi-env.sh`, which `components/globals.ts:175` and its
error message at `:187` have been telling operators to run since Phase 8a and which was
never written. Verified: `eval "$(…)"` → AppRole login → a token with `["default","pulumi"]`.
It parses with `sops --extract`, not grep/sed — the unquoted-scalar trap that made
`regen_root` read zero recovery shares — and prints nothing on stdout on any failure, so a
partial credential cannot reach the environment.

### PLAN's StackReference design cannot work — inventory goes through OpenBao instead

**Every stack has its own DIY backend.** `stacks/home` is
`s3://home-operations/home`, `stacks/authentik` is `s3://home-operations/authentik`, and so
on; confirmed with `pulumi stack ls` in each, where `stacks/home` sees only
`home-operations`. A `StackReference` resolves inside the current backend only, and all
three inventory flows cross backends: `Authentik Outputs` (authentik → four stacks),
`tailscale-export` (home/ocracoke/gulf-of-mexico → unifi-network), `backup-plan`
(backups/applications → the three directors). Worse, `stacks/applications`,
`stacks/authentik` and `stacks/unifi-network` all declare `name: applications`, so
consolidating backends also means renaming projects, which is state surgery.

Estate decision 2026-08-10: **route stack-produced inventory through
`secrets/clusters/_inventory/*`** — paths `mapping.yaml` already reserves — written by the
producing stack via the Vault provider that already works, read back through `BaoStore`.
**Cluster definitions become checked-in TypeScript** instead: nothing generates them, they
are hand-maintained non-secret config (key, title, rootDomain, authentikDomain, icon,
background, favicon, location), and only their `secret` / `arcane_token` fields are
credentials. Backend consolidation is not a prerequisite for anything and is deferred.

### `getSecretByTitle` needs a resolver, not the default rule

A `pulumi preview` of `stacks/home` against OpenBao is what found this, and it is the
single most useful thing that ran this session. `shared/<slug(title)>` — mapping.ts's
`default` rule — covers every credential the repo names as a string literal and **nothing
else**. Four more shapes turned up, each wrong for a different reason:

- **`<cluster>-<app>-oidc-credentials`** lives at `clusters/<key>/apps/<app>/oidc`; Phase 4
  skipped the family deliberately. Note `alpha-site-technitium-oidc-credentials` splits at
  the *wrong dash* under `/^(.+?)-(.+)-/`, so the cluster key is matched against the known
  set, longest first — the same ambiguity `oidcBaoPath` dodges by taking separate arguments.
- **bare 26-character UUIDs.** Some call sites address an item by id, not title (these are
  the four `UNRESOLVED-` rows mapping.ts flagged). `soz3lyvs6k24e5gh3udqp4sngi` is
  `Cluster: Alpha Site`; `7ntcze3fqqzun7huc7vyoirco4` is `Cloudflare (driscoll.tech)`.
  Slugging a UUID yields the UUID, i.e. a path that cannot exist.
- **`Cluster: …`** — inventory, above.
- **`OpenBao Alpha Site Static Unseal`** — and this one is a *category error*, not a gap.

That last one deserves its own note. **`replaceOnePasswordPlaceholders` called
`this.getSecretByTitle`, which virtual dispatch sends to the subclass**, so every
`op://Eris/…` reference in a Dockge compose file started resolving against OpenBao — a
syntax that names 1Password by construction. The first casualty was the seal chain:
INVENTORY §2 forbids the static unseal key from ever entering OpenBao, so "look it up in
OpenBao" is not a lookup that failed, it is a question that must never be asked. The
resolver now names it `never`, separately from the `later` cases, and the placeholder
resolver reads through a `protected getOnePasswordItemByTitle` that no subclass overrides.

**Fallbacks are enumerated and warn, never inferred.** A blanket "try OpenBao, fall back on
404" would turn a typo'd path — or a secret deleted from OpenBao — into a silent read of a
stale 1Password copy. Each exception is a named entry with a stated reason, logged at warn
on every read.

### What is proved — all eight stacks

`scripts/bao-store-parity.ts` (home-operations) answers the question `op-to-bao --verify`
does not. `--verify` compares the two stores' DATA; this compares the OBJECT each store
hands a stack — key set, values, and the `secret()` markers, which is where a credential
silently reaches Pulumi state in the clear with no symptom until `pulumi stack export`.
**19/19 in parity**: 12 literal-title credentials, 4 `getDockgeInstances` entries, and 6
cluster definitions with their credential fields and `meta.title` included.

Every stack previewed against both stores, comparing resource-operation lines:

| Stack | Result |
|---|---|
| `home` | identical (161 non-`mkdir` ops) |
| `backups` | identical |
| `applications` / equestria | identical |
| `applications` / sgc | identical |
| `authentik` | identical |
| `unifi-network` | identical |
| `ocracoke` | identical |
| `gulf-of-mexico` | identical, after the trigger-ordering fix |

Zero OpenBao errors anywhere. The only remaining warning is
`Authentik Outputs: reading from 1Password`, which home-operations#717 is the first half of
clearing.

### Three ordering bugs this sweep flushed out — none of them the migration

Each looked at first like the cutover had broken something. They are recorded together
because they share one shape: **a Pulumi input whose ORDER is decided by async resolution
timing.** Changing where secrets come from changes that timing, which makes a store swap an
unusually good detector for them.

- **`mkdirOutput` named resources nondeterministically** (`components/helpers.ts`). It
  memoises one `remote.Command` per (host, *directory*) but named it after whichever *file*
  reached that directory first. Every preview invented a few create/delete pairs and the set
  changed run to run. **Fixed and merged.**
- **`triggers: [...copyFiles.map(f => f.id)]`** (`components/DockgeLxc.ts`) is an ORDERED
  array, partly populated by `push` inside an `.apply()`. The two stores have consistently
  different latency profiles, so each landed on its own STABLE order — which is why a single
  control run per store does *not* expose it. **Fixed and merged.**
- **`redirect_uris` in the tailscale dynamic-registration body** was built from
  `getAllClusters()` order, so a permanent `~body` diff appeared the moment cluster ordering
  changed. It is a set; it is now deduped after resolution and sorted. The original
  `new Set` was over *Outputs*, comparing object identity — it never removed a duplicate at
  all. **Fixed and merged (#715).**

**The procedural rule, which cost three separate investigations to learn:** never judge a
store cutover on this repo from a single pair of previews. Run the same store twice as a
control, and compare resource-operation lines with `*-mkdir` excluded. Where a difference
survives that, look for an ordered input before blaming the value.

### What changed in live OpenBao

Additive, all of it, with 1Password untouched and still authoritative:

```
secrets/clusters/equestria/cluster        secret         (kubernetes substitution key)
secrets/clusters/sgc/cluster              secret
secrets/clusters/alpha-site/arcane-agent  arcane_token
secrets/clusters/luna/arcane-agent        arcane_token
secrets/clusters/skystar/arcane-agent     arcane_token
```

Written by `scripts/migrate-cluster-secrets.ts` with **CAS 0**, so it creates and refuses to
clobber. Paths are named for the CONSUMER, matching `clusters/<key>/apps/<app>/oidc`: a
single `clusters/<key>/cluster` holding both would force anything needing the arcane token
to be granted the cluster-wide Flux substitution key as well, and an ACL cannot separate
them once they share a path. Three superseded arcane-only `clusters/<key>/cluster` paths
were deleted after the new ones were verified.

`clusters/_inventory/cluster-alpha-site` is deliberately untouched — `dynacat-env` reads it
through ESO, so it is a live consumer contract, not a leftover.

### Cluster definitions are config, not secrets, and now live in git

`/clusters/<key>.yaml` at the home-operations repo root, one file per cluster, loaded by
`components/store/clusters.ts`. Nothing generates them, so PLAN §G's "stack outputs" had
nothing to reference even setting the backend problem aside.

Three things about that loader are load-bearing:

- **Validation replaces the compiler.** As TypeScript literals these were typechecked; YAML
  is not, and a mistyped key would surface as `undefined` inside a provider call or render
  an empty string into a URL. `parseCluster` checks required fields, enum ranges, and
  rejects unknown fields rather than ignoring them.
- **The filename must equal `key`.** That is what stops one cluster reading another's
  credential, since `clusterSecretPath` derives from the key.
- **`domainPrefix`, not `rootDomain`.** The YAML carries `skystar`; the loader appends
  `driscoll.tech`. A prefix containing a dot is rejected by name, because pasting the old
  value back yields `skystar.driscoll.tech.driscoll.tech` — resolves nowhere, looks fine in
  a diff. `ROOT_DOMAIN` is a literal rather than `GlobalResources.searchDomain`: that is a
  Pulumi `Output` on the class that CONSTRUCTS the store, and these definitions must parse
  with no Pulumi runtime at all. The two are duplicates that must agree.

### Drift `--verify` found, not yet investigated

```
MISSING  secrets/clusters/_inventory/cluster-alpha-site
MISSING  secrets/shared/maddie
DRIFT    secrets/shared/media-management-secrets    only in OpenBao: omdb_apikey
DRIFT    secrets/shared/meilisearch-secret-key      only in OpenBao: password
```

189/193 in sync. The meilisearch one is expected — it is the deliberate Phase 6 holdout
waiting on exactly that key. **The other three are unexamined.** This is the recurring drift
check that has been item 6 since Phase 4, and running it once already earned its keep.

### Unexplained, flagged not chased

`stacks/home` planned **107 changes / 779 unchanged** on the morning of 2026-08-10 and
**207 / 743** the same evening. The jump appears IDENTICALLY in both stores, so it is not the
migration — but a hundred extra planned changes appearing within hours deserves an
explanation before the next `up`.

### Phase 8 closed 2026-08-12 — what completing it flushed out

The slices all landed (#718–#724 as planned, plus #3105 and the vals rework in #722).
What matters for the future is the FOUR estate bugs the completion exposed, none of them
migration code:

1. **The 1Password write-back had been silently dead for months** (home-operations#725).
   `OnePasswordItem.diff` filtered the jsonpatch with `z.op === "add" && z.value !== null`
   — keeping ONLY adds, discarding every replace/remove — so value-only changes reported
   "no changes detected" and never updated. Backup Plan items froze 2026-06-09, Tailscale
   Exports 2026-07-27 (the last structural add), while Authentik Outputs kept updating
   because new scope mappings are adds. Found by the parity gate comparing the frozen
   items against fresh KV dual-writes from the very same runs. Corollary: **a "both sides
   agree" check can be satisfied by both sides being equally frozen** — the dual-write is
   what made the staleness visible.

2. **The June volsync rename was a loaded gun the diff bug kept holstered** (also #725).
   ced3c316 renamed volsync plans to `Equestria autobrr` style, but `BackupPlanDirector`
   uses `plan.name` as the backrest repo id, plan id, AND `/data/backup/<name>/` path —
   had the write-back worked, every volsync backup would have re-rooted into a fresh
   restic history under a space-containing id. `name` reverted to the id-safe slug
   production carries; the nice name is a display-only `title` field.

3. **`hosts/dockge/` froze at Phase 4** (home-operations#738). The one-time migration
   seeded it and nothing wrote it again — DockgeLxc's item was the only tag family
   `BaoStore` lists whose producer had no dual-write twin. Invisible while bug #1 froze
   1Password equally; the day the write-back revived, `DockgeLxc: Luna`'s corrected
   ipAddress reached 1Password while BAO_STORE_READS consumers kept reading the Phase 4
   copy. **Rule: every `OnePasswordItem` whose family `BaoStore` reads MUST have a
   `baoKvSecret` twin** — a one-time seed is a freeze, not a source.

4. **vals expands references in comments** (home-operations#737) — the Phase 6
   envsubst-in-comments lesson one layer up. bao-transit's `.env` carried a well-formed
   `ref+sops://` example in a MIGRATION NOTE; the whole-document resolver handed it to
   vals, which tried to expand it and failed every home-operations run (no vault checkout
   or age key in the pod — and had it been readable, the SEAL-CHAIN KEY would have baked
   into a rendered file instead). Write broken-apart schemes in prose
   (`<ref+sops scheme>://…`), never the real thing.

Operational facts that will bite again if forgotten:

- **Stacked-PR merges land in the BASE BRANCH unless it was deleted first.** Three
  "merged" PRs (#719/#720/#721) sat in their stack branches while main ran only #718 —
  everything looked green because nothing had actually changed. Consolidated by #723/#724.
  Delete stacked branches on merge, or verify `origin/main` moved.
- **The operator's workspace pods pin `runAsUser 1000/runAsNonRoot`, and a kubelet-created
  hostPath is root-owned 0755 — unwritable at uid 1000, deterministically**
  (home-operations#727). The misleading part: pods created from a PRE-change Workspace
  spec kept running without the new initContainer at all, which made a deterministic
  failure look node-dependent. Check `initContainers` names on the pod before comparing
  pods. (#726's data/cache split — pod-local installs, shared download cache — stays,
  correct regardless.)
- **`vals eval` of raw non-YAML exits 0 with EMPTY output.** The resolver wraps every
  document as one YAML value (`content: <file>`) for exactly this reason; the wrapped
  round-trip is guarded.
- **The §G-8 consumer guards worked**: during the brief window when KV held pre-#725
  plan names, no director run succeeded, so nothing bad reached backrest — the
  torn-inventory refusals plus operator retries converged the race by themselves.

### The Phase 8 slices as they landed (2026-08-11, superseded record)

Merge order is enforced by PR stacking; each PR's body carries its own gate. The
branches build on each other, so out-of-order merges are structurally impossible.

1. **Inventory flows — PRs #718/#719/#720.**

   - **`Authentik Outputs` → #718.** The producer had already run (verified live:
     `_inventory/authentik-outputs` v1, written by the authentik stack), so this is the
     read route: `BaoStore` resolves the title to the _inventory path instead of warning.
     Parity ran 20/20 with the route in place, `notesPlain` deliberately dropped.
   - **`tailscale-export` → #719.** `TailscaleMonitor` takes `globals` (three construction
     sites) and dual-writes `_inventory/tailscale-export-<stack>`. The read REFUSES a torn
     or empty set rather than returning fewer stacks — this feeds unifi-network's ACL and
     DHCP generation, where a smaller estate means REMOVING live config. The shaping is one
     shared function so the stores cannot drift in transform, only in data.
   - **`backup-plan` → #720.** Same pattern: `BackupPlanOrchestrator.savePlan` dual-writes
     `_inventory/<slug(title)>`, one `jsonStringify` feeds both stores byte-identically,
     `concealed_fields: plan` keeps the secret() marker, and the read refuses a torn set
     (the directors would silently back up less).

   The parity script now checks both tag-shaped reads. **Those sections stay RED until
   every producing stack has run the merged dual-write** — that is the §G-8 gate working,
   not a bug. Producers: home-operations, ocracoke, gulf-of-mexico (exports); backups,
   applications/equestria, applications/sgc (plans).

2. **Flip `BAO_STORE_READS` — #721, draft on purpose.** One env var in two places: the
   eight home-operations Stack CRs and `.config/mise.toml` (local runs then REQUIRE
   `pulumi-env.sh` — a missing credential fails loudly rather than silently reading a
   different store than the operator). `vault/stack.yaml` deliberately untouched: Phase 9
   owns that repo's cutover and pre-setting the flag would arm it unproven. The PR body
   carries the merge-gate checklist; the short form is *parity fully green, then flip*,
   and re-read "the procedural rule" above before judging the first cutover preview.

3. **`ref+openbao://` references — #722 plus equestria-cluster#3105.** PLAN §D.1
   delivered with one deviation, argued in the PR body: resolution is in-process through
   the existing `BaoClient`, not a `vals eval` subprocess, because the stacks run in stock
   `pulumi-nodejs` operator pods where no vals binary exists (and `vals` stays out of
   `[tools]`). Kept from the plan: the exact syntax, batched reads (one KV read per path
   per process), `secret()` on every resolved document, and unresolved references FAILING
   the run — stronger than the op:// resolver's log-and-pass-through. All 8 `op://` refs
   under `docker/` convert (the three arcane-agent ones addressed items by UUID; they now
   name `clusters/<key>/arcane-agent`). Both resolvers chain during the transition — each
   syntax names its store by construction, so they cannot cross-resolve. #3105 converts
   the last ApplicationDefinition ref (plex) and must merge AFTER #722, or the old
   resolver passes the ref+ literal into the rendered Gatus config. Verified end-to-end
   against the live server: all six target paths resolve with the real AppRole.

4. **Retire `dynamic/1password/`.** Unchanged: PLAN §G puts it with Phase 11 — do it
   last, treat the two as one decision. Deleting `replaceOnePasswordPlaceholders` joins
   this slice once #3105 lands (nothing will carry `op://` into a resolver after that).

---

## Phase 7 — SGC (2026-08-10)

| Check | Result |
|---|---|
| `ClusterSecretStore/openbao` in SGC | **Valid** — the only real proof the cross-cluster login works, since the store validates by authenticating |
| ExternalSecrets on `openbao` | **44** |
| `OnePasswordItem` CRs in SGC | **0** — none remain |
| Still on 1Password | **3**, all Backblaze, all a removal (below) |
| Unhealthy ExternalSecrets / HelmReleases / Kustomizations | **0** |

Landed as stargate-command-cluster#1793 (store + RBAC) → #1794 (both components, 21
ExternalSecrets in two files) → #1795 (10 app secrets) → #1796 (all 13 CRs), on top of
vault#170 and home-operations#711.

### The auth design, and what it costs the next cluster

One OpenBao serves the estate; one `kubernetes` auth mount cannot. The mount config pins
a single `kubernetes_host` and OpenBao validates each login by calling TokenReview
against that API server, so `auth/kubernetes` — pointed at
`https://kubernetes.default.svc:443`, equestria's own — can only ever validate
equestria's tokens. Pointing SGC at it fails at **login** with "service account name not
authorized", which reads like a role misconfiguration rather than a wrong cluster.

`kubernetes-sgc` therefore exists, dialled at `https://10.10.209.201:6443`. Three things
about it are worth not rediscovering:

- **No reviewer JWT.** OpenBao reviews the *client's own* token, so the only grant is
  `system:auth-delegator` on SGC's `external-secrets` ServiceAccount. Delete that
  ClusterRoleBinding and every SGC ExternalSecret fails at login, from the TokenReview
  call, in a way that never names the binding.
- **`disableLocalCaJwt: true` is mandatory.** Left false, OpenBao prefers the CA and
  token mounted in its own pod — equestria's — and every SGC login fails TLS.
- **The CA cannot come from the stored cluster definition.** `getKubernetesCluster`
  synthesises a kubeconfig pointing at the tailnet kubeproxy with **no
  `certificate-authority-data` at all**, so scraping it silently yields nothing. It is
  read live from SGC's `kube-system/kube-root-ca.crt`, which was verified byte-identical
  to the CA in SGC's own kubeconfig, with `IP Address:10.10.209.201` in the API server
  cert's SANs.

The mount is cluster-agnostic Pulumi code, so **adding any future cluster is one root
ceremony** (the `pulumi` policy grant for a new mount is an admin write) plus a stack
line.

### The one that would have broken, and why review would not have caught it

`sgc/home-assistant-ssh`'s template read `{{ .known_hosts }}`, but OpenBao stores that
field as `known hosts` — **with a space** — and the Vault provider returns key names
verbatim. It worked only because the **ESO 1Password provider silently sanitises spaces
to underscores in `extract` keys**. On OpenBao the reference renders nothing and, under
`missingkey=error`, fails the whole ExternalSecret.

This is a *different layer* from the Phase 6 finding, which was the 1Password **Operator**
sanitising Secret keys. Two providers, two sanitisers, same class of silent dependency.
The fix was not a rewrite: the manifest already carried an explicit `data:` mapping
naming the property (`knownhosts <- known hosts`), so the template now reads
`.knownhosts` and depends on no provider's mangling.

That file also addresses its item through a **YAML anchor** (`&ssh-key`), so the literal
1Password title survived the first rewrite pass in three `data:` entries even though the
`dataFrom` had already been changed. Grep for the title, not just for the store name.

### The three Backblaze ones are a REMOVAL — verified, not assumed

Checked against what equestria actually did, because "switch them to Minio" was the wrong
guess:

- **`tailscale-resources-secret` → delete** (equestria #3093). It renders a restic B2
  config nothing has consumed since 2026-03-12. Confirmed identically dead in SGC: no
  ReplicationSource or ReplicationDestination, no pod volume, no manifest reference
  outside its own file, and `recorder.yaml` — the one thing that would need backups —
  commented out of the kustomization.
- **`postgres-backup-config` + `postgres-values` → drop the Backblaze extract**
  (equestria #3092). Not a switch: the endpoint was *already* Minio
  (`http://truenas.driscoll.tech:9000` in both clusters). Only the bucket NAME still came
  from the Backblaze item while pointing at a Minio endpoint — the vault#119 mismatch.
  The fix is to delete the `${BACKBLAZE_DATABASE}` extract and the `[backblaze]` rclone
  block, and replace `{{ .backblaze_bucket }}-restore` with `${BACKBLAZE_DB_BUCKET}-restore`.

The substitution is byte-safe: SGC's `BACKBLAZE_DB_BUCKET` is `stargate-command-db` and
the live rendered bucket is `stargate-command-db-restore`. SGC has no equivalent of the
empty `backblaze-db-access-key` Secret equestria deleted separately.

**So the 2026-08-07 B2 exclusion never needs reversing for SGC** — these three stop
referencing Backblaze rather than importing a B2 credential.

---

## Phase 6 — the OnePasswordItem CRs are done (2026-08-10)

21 CRs became ExternalSecrets across five PRs; `pulumi/pulumi-operator-passphrase` stays.
Verified after the rollout, against the live server:

| Check | Result |
|---|---|
| `OnePasswordItem` CRs estate-wide | **1** — the retained passphrase |
| ExternalSecrets on `openbao` / unhealthy | **111 / 0** |
| Kustomizations, HelmReleases, ExternalSecrets not Ready | **0**, and `lastAppliedRevision == lastAttemptedRevision` everywhere |
| Secret ownership | all 21 now `ownerReferences: ExternalSecret` |
| Secret **values** vs OpenBao | sha256-identical, every key of every one |
| Key deltas | exactly the 3 predicted `website` drops and 1 `omdb_apikey` gain — nothing else |

Consumers re-exercised the credentials for real, not just rendered them:

- `cloudflare-dns` restarted onto the new Secret and reports `All records are already up to
  date`, 0 errors — which also clears the cert-manager copy of that token.
- `technitium-dns` restarted and wrote **1608** records successfully, so the TSIG key is good.
- **8 of 9 Pulumi Stacks reconciled `succeeded` after the swap**, covering
  `truenas-home-operations`, `pulumi-operator-connect-token`, `pulumi-operator-github` and
  `authentik-secret` in one stroke. (`vault` last ran before it; same credentials.)
- ClusterIssuers Ready, every Certificate Ready, traefik and crowdsec-lapi 0 errors, all
  four ARC listeners 0 auth errors, `dispatcharr` restarted clean.
- Alertmanager: nothing firing that relates to this. The two standing warnings —
  `volsync-src-plex` and `CNPGClusterInstancesOnSameNode` — predate it.

**The tailscale operator never restarted**, so its OAuth credential is unexercised. That is
fine and expected: `reloader.stakater.com/auto` on a *Secret* does nothing (reloader reads
it on the workload), the old CR carried the same ineffective annotation, and the values are
byte-identical, so helm-controller's `valuesFrom` digest did not change. Worth knowing
before someone reads the annotation as proof of a restart.

### The one thing that looked like a regression and was not

Both external-dns pods restarted at the cutover and began logging errors *immediately* —
`technitium` with `RFC2136 … i/o timeout`, `unifi` with `code 500`. Coincident with the
change, and the pod logs only start at the restart, so the pod's own logs cannot settle it.

**Loki can, and did.** Both errors are present well before the cutover — technitium's
identical `i/o timeout` to `10.196.230.60:53` at 13:37:50Z from the *previous* pod IP, and
unifi's `code 500` repeatedly. Neither is authentication either: an i/o timeout is a
transport failure, and the unifi 500 turned out to wrap a `400 Invalid Hostname` on
`*.code.driscoll.tech`. A direct probe with the migrated key returned 200 where an
unauthenticated control returned 401.

**The lesson is procedural: after a cutover that restarts pods, the workload's own logs
cannot distinguish "new" from "pre-existing", because they begin at the restart. Query Loki
across the boundary before blaming the change.**

---

## Phase 6 — the ExternalSecrets are done (2026-08-10)

**89 on OpenBao, 1 on 1Password, 0 unhealthy.** Full inventory and order in `PHASE6.md`.
The holdout is `equestria/meilisearch-env`: `secrets/shared/meilisearch-secret-key` has no
fields, and migrating before the key is written turns a silent empty value into a hard
`SecretSyncedError`. The value it needs is the `password` from
`secrets/shared/karakeep-secret-key` (42 bytes) — karakeep is hardcoded to authenticate
with it, and Meilisearch currently runs unauthenticated in-cluster.

Done in order: `obsidian-sync` (pilot) → `coder` → `kometa`/`playerr` → the `volsync`
component (39 in one edit, two repos) → `github-status-token` (17 namespaces, two repos) →
10 infrastructure manifests → the split-ref/substitution/vestigial cases → the equestria app
group → `dynacat-env`. Plus two blockers cleared: Backblaze Database removed for Minio, and
a dead tailscale volsync ExternalSecret deleted.

### What this phase taught, beyond the migration

Every one of these cost real time and would be expensive to rediscover.

1. **`secretStoreRef` does not tell you where an ExternalSecret reads from.** A
   `dataFrom`/`data` entry overrides it per-reference via `sourceRef.storeRef`. Of 93
   declaring `onepassword-connect`, only **78** actually read from it; 12 were mixed and 3
   never touched 1Password at all. Tooling that filters on the top-level field migrates the
   wrong set.
2. **Empty is not missing.** 1Password carries fields with empty values; Phase 4 did not
   migrate those, so the key is *absent* in OpenBao, and ESO renders with
   `missingkey=error` — failing the whole ExternalSecret. **Prefer populating the field**
   over defaulting to `""`; an empty credential is usually a bug the migration surfaced.
3. **`kubernetes/components/` exists in BOTH repos**, and 16 equestria Kustomizations
   source from the home-operations copy. Editing one repo moved 38 of 39 volsync secrets
   and left `dynacat` behind — with a Kustomization reporting perfectly healthy.
4. **A key built from a substitution may be an item TITLE, not a path.**
   `'${CLUSTER_TITLE} Pushover Key'` and `'${CLUSTER_CNAME}-${APP}-oidc-credentials'` both
   look "already templated" and are not migrated by a literal-title rewrite. Worse, the
   variable itself can change: `CLUSTER_TITLE` is display-cased because it addressed a
   1Password title, while an OpenBao slug is lowercase — that is `CLUSTER_CNAME`. Carrying
   it across yields `shared/Equestria-pushover-key` and a 403. **Assert every migrated key
   starts with a mount prefix**; do not pattern-match for "looks unmigrated".
5. **Flux `postBuild` envsubst expands inside comments, and inside dashboard JSON.** Three
   separate instances this session. A comment naming a variable bakes the live value in; a
   Grafana `${DS_PROMETHEUS}` placeholder fails the whole Kustomization in strict mode.
   `eso-values-lint` catches the values-file case only.
6. **A Kustomization can report `Ready=True` while stuck on a two-day-old revision.**
   `grafana` did, because Ready reflects the last *successful* apply while
   `lastAttemptedRevision` tracks HEAD. Two migrated ExternalSecrets sat unapplied behind a
   broken dashboard, which no ExternalSecret status would ever have revealed. **Compare
   `lastAppliedRevision` against the source revision**, not the Ready condition.

Also fixed in passing: `coder/coder-oidc-secret` had been failing since 2026-08-08 because
`ClusterSecretStore/cluster` reads from `remoteNamespace: equestria` and Coder lives in its
own namespace — **any app outside `equestria` breaks that way**; OpenBao is
namespace-independent, so moving it fixed the class rather than the case.

---

## bao-transit is initialised

Done on 2026-08-07. `bao-transit.sh init` completed against
`https://bao-transit.opossum-yo.ts.net`, and both bootstrap files are committed:

- `bootstrap/openbao/recovery-keys.sops.yaml` — 5 recovery shares, threshold 3
- `bootstrap/openbao/transit-token.sops.yaml` — the seal token

Verified after the fact, against the live server:

- seal type `static`, `initialized: true`, `sealed: false`, recovery 3-of-5
- the seal token round-trips encrypt→decrypt on `openbao-equestria-unseal`
- it **cannot** list engines, read the key, or export it
- it carries `default` + `equestria-unseal`, is orphan, renewable, period 768h,
  `explicit_max_ttl: 0`, and `renew-self` succeeds

The initial root token was minted and revoked inside the same run; regenerate one from the
recovery shares if ever needed.

---

## The immediate next action

Phase 4 is applied and verified; dual-run is live. All openbao code is merged. What is
left is execution, in dependency order:

1. ~~Convert the `OnePasswordItem` CRs~~ — **done and verified 2026-08-10.** See
   "Phase 6 — the OnePasswordItem CRs" below for the post-rollout verification.

   Both follow-ups it left behind are **also done** (2026-08-10):
   - ~~Delete `CLOUDFLARE_SECRET` / `CLOUDFLARE_TUNNEL_SECRET`~~ — equestria-cluster#3104,
     home-operations#710. **SGC keeps both** until Phase 7; `shared-secrets.sops.yaml` is a
     hand-synced triplicate, so it is deliberately divergent until then — do not "fix" it
     by copying SGC's copy back.

     Two things worth knowing before the next sops key removal. **`sops unset` rewrites the
     whole document**, and all three files were stored 4-space indented while every repo's
     own `.sops.yaml` declares `stores.yaml.indent: 2`, so the diff is ~300 lines for a
     one-line change. Prove it is cosmetic rather than asking a reviewer to trust it: strip
     leading whitespace from both revisions' `KEY: ENC[...]` lines and diff — the only
     difference should be the removed key. And **editing a substitution Secret restarts
     essentially the whole cluster's reconciliation**: every Kustomization that
     `substituteFrom`s it re-runs, so `kubectl get kustomization -A` briefly showed 70 not
     Ready with `HealthCheckCanceled: New reconciliation triggered by Secret/…`. It settled
     in 60s. That is a storm, not a failure — but it looks alarming and it is worth timing
     such a change accordingly.
   - ~~`unifi-dns` cannot write any record~~ — equestria-cluster#3103. Pre-existing and
     unrelated to the migration; found by it, and worth reading before Phase 7.

     UniFi's static-DNS API cannot store a wildcard (`400 Invalid Hostname`; none of the 235
     live entries is one). The reason that became an outage is that **external-dns applies a
     batch atomically** — the webhook fails the whole `ApplyChanges` on the first rejected
     name and returns 500 — so one unstorable record blocked every UniFi write for two days,
     silently. `*.code.driscoll.tech` (the `coder-apps` HTTPRoute) was created at
     18:25:09Z on 08-08; the first rejection is at 18:25:13Z.

     Fixed as a property of the provider, not a named exception for Coder, so the next
     wildcard route cannot repeat it: `--regex-domain-exclusion=\*` plus
     `--regex-domain-filter=(\A|\.)${ROOT_DOMAIN}\z`. Note that **`--regex-domain-filter`
     overrides `domainFilters`**, which is therefore deleted rather than left looking
     load-bearing, and that the anchors are `\A`/`\z` — `MatchString` is unanchored so
     anchors are required, and avoiding `$` keeps a regex metacharacter away from Flux's
     `postBuild` envsubst. Cloudflare and Technitium both keep the record, so resolution is
     unaffected. The first `policy: sync` run after the fix was a **no-op** — 235 records
     before, 235 after, zero creates and zero deletes — so the two-day "backlog" was that
     one record and nothing else had drifted.

2. **`technitium-dns` is in a permanent rewrite loop.** Found while clearing the above;
   nothing to do with OpenBao, not fixed, and it should be. Its AXFR against
   `dns-celestia` is REFUSED — `AXFR error: dns: bad xfr rcode: 5` — continuously since at
   least 2026-08-07T14:13Z, which is the edge of Loki's retention, so probably longer.
   Without a zone transfer external-dns cannot see what already exists, so it re-creates
   every record every cycle: **2546 `Adding RR` in ten minutes**, against a DNS server that
   also intermittently times out under it (`i/o timeout` to the egress proxy at
   `10.196.230.60:53`, ~19 per 10 min). The writes succeed, so nothing alerts and DNS is
   correct — it is pure, invisible, continuous load. Fixing the AXFR permission on the
   Technitium side should collapse both symptoms.

3. ~~**Phase 7 — SGC**~~ — **all but done**, see the Phase 7 section above. What is left:

   - **The Backblaze three** — a removal, not a migration. `tailscale-resources-secret`
     gets deleted (dead since 2026-03-12, verified in SGC); `postgres-backup-config` and
     `postgres-values` drop their `${BACKBLAZE_DATABASE}` extract and `[backblaze]` rclone
     block, with `{{ .backblaze_bucket }}-restore` becoming `${BACKBLAZE_DB_BUCKET}-restore`.
     Mirrors equestria#3092/#3093 exactly.
   - **Delete SGC's now-unreferenced `CLOUDFLARE_SECRET` / `CLOUDFLARE_TUNNEL_SECRET`**
     from its sops files, as was done for equestria and home-operations. Note `sops unset`
     rewrites the whole document and renormalises indentation, so prove the diff is
     cosmetic by comparing whitespace-stripped `KEY: ENC[...]` lines.
   - **Fix `root-ceremony.sh`** to pin one standby pod, or at minimum stop telling the
     operator to land a listener toggle that is not the cause. See the corrected entry in
     "facts established the hard way".
   - **RUNBOOK Scenarios B/C** still describe the break-glass flow around
     `bao operator generate-root`, which cannot work, and still assert the unauthenticated
     endpoint is closed.
2. **Confirm OIDC in a browser** — `https://bao.equestria.driscoll.tech/ui`, method OIDC,
   once as an `admins` member and once as `family`. Everything below the browser is
   verified; this is the last human step. Note `default_role` is `family`, so type `admin`
   in the Role field or you get the read-only `viewer` policy.
2. ~~tcp:2023 grant~~ — **done.** The operator applied home-operations#695 itself
   (`+0-0~8`); `dockge-as:2023` probes OPEN from an openbao pod, so the nightly dump path
   is complete end to end.
4. **Watch the first nightly dump (03:00) and the monthly restore test (05:00 on the 1st).**
   Both now have real credentials for the first time, so these are genuine first runs.
5. Fix or delete `equestria-init.sh regen_root` — superseded by `root-ceremony.sh` and
   broken two ways (see "Break-glass was broken"). RUNBOOK Scenarios B/C still describe
   the CLI flow that cannot work.
6. Schedule `op-to-bao --verify` as the recurring drift check for the dual-run window.

The hand-created `*PBS Backup User` items are NOT in Phase 8a scope — no Pulumi code
generates them and they stay in 1Password (estate decision 2026-08-08).

---

## OIDC is live (2026-08-08 ~21:00Z)

Verified against `https://bao.equestria.driscoll.tech`:

```console
$ bao list auth/oidc/role          →  ["admin","family"]
admin   policies ["admin"]   bound_claims {"groups":["admins"]}  ttl 28800
family  policies ["viewer"]  bound_claims {"groups":["family"]}  ttl 28800
        both redirect URIs present, user_claim "email"

$ POST auth/oidc/oidc/auth_url role=admin   →  https://authentik.driscoll.tech/application/o/authorize/…
$ POST auth/oidc/oidc/auth_url role=family  →  https://authentik.driscoll.tech/application/o/authorize/…
```

That endpoint returned `permission denied` before, because the mount did not exist.

The `viewer` boundary, read back from the server: `list` on `secrets/metadata/*`,
read on `docs/*`, and **no capability whatsoever on `secrets/data/*`** — so a family token
can browse the tree and read no secret value. Worth re-proving as a real token once:

```bash
bao kv list secrets/shared/                          # PASS
bao kv get  secrets/shared/cloudflare-driscoll-tech  # MUST FAIL 403
```

**Remaining step:** a browser login at `/ui` as an `admins` member and as `family`.
Everything short of the browser is verified.

### What it took

Three blockers, found in this order:

1. **`@pulumi/vault` was never installed** — declared at `package.json:43` and in the
   lockfile, absent from `node_modules`. The run died at import. `npm install` fixed it.
2. **The dual-write gate ignored the AppRole** (home-operations#694) — `globals.ts:150`
   checked only `BAO_TOKEN`, so every Phase 8a write silently skipped while `up` reported
   success. The `isDryRun()` arm made preview advertise creates the apply would drop.
3. **The `pulumi` policy was missing `sys/mounts/auth/oidc`** (vault#155) —
   `sys/auth/oidc` and `sys/mounts/auth/oidc` are separate ACL paths, and the provider
   uses the second for the backend's `tune` block. The 403 there failed the `AuthBackend`
   update, which the two roles depend on.

A fourth thing was noise: the UniFi provider aborted three consecutive runs
(`403 api.err.NoPermission`, then `502`) before clearing on its own. The API key returns
200 on the failing path, 20/20, and does not expire until 2028; the controller answers 200
on `/`. Treat it as controller flakiness under concurrent API load and retry.

---

## Break-glass was broken (2026-08-08)

The most important finding of the day, and unrelated to OIDC except that both needed an
admin token.

**`equestria-init.sh regen_root` could never have worked.** OpenBao 2.6.1 has two
root-generation APIs:

| Path | Auth | Gated by |
|---|---|---|
| `sys/generate-root/*` | unauthenticated, deprecated | `disable_unauthed_generate_root_endpoints` |
| `sys/generate-root-token/*` | authenticated | a policy grant — which nothing had |

`bao operator generate-root` speaks **only the second**, including `-status` and `-decode`,
which both contact the server. The listener toggle ungates the **first**. So flipping the
toggle produces this, which reads like the toggle did not work:

```console
$ bao operator generate-root -init
URL: PUT .../v1/sys/generate-root-token/attempt
Code: 403.  * permission denied

$ curl .../v1/sys/generate-root/attempt
{"started":false,"progress":0,"required":3,"complete":false}    # open
```

`regen_root` has a second, independent bug: it parses shares with
`sed -n 's/^  - "\(.*\)"$/\1/p'`, which requires quotes. sops writes them **unquoted**, so
it reads zero shares and dies claiming the shares are wrong.

### What replaced it

`bootstrap/openbao/root-ceremony.sh` (vault#156) drives the raw API: `probe` (read-only,
consumes nothing), `run`, `breakglass`. The decode is local — XOR the base64-decoded token
against the OTP — with a self-test that caught its own first bug.

**The toggle is retired for good** (equestria-cluster#3079). A `break-glass` AppRole now
holds the one capability needed to open an attempt on the authenticated endpoint:

```
policies: ["break-glass","default"]
GET  sys/generate-root-token/attempt          -> 200, attempt opens and cancels
secrets/data/shared/cloudflare-driscoll-tech  -> ["deny"]
sys/policies/acl/admin                        -> ["deny"]
```

Completing an attempt still needs 3 of 5 recovery shares, so the AppRole alone mints
nothing. Caveat: it lives in the same SOPS store as the shares, so one age key still
reaches both — no worse than before, but not key separation.

⚠️ **RUNBOOK Scenarios B/C still describe the CLI flow that cannot work.** Fixing them,
and fixing or deleting `regen_root`, is outstanding.

---

<details><summary>Why OIDC login used to fail (historical, resolved)</summary>

### Why OIDC login failed (2026-08-08, updated after the first run)

The original cause was simply that **`stacks/home` had never been run** since
home-operations#688 added `components/openbao/oidc.ts`. Before the run:

```console
$ curl -H "X-Vault-Token: …" …/v1/auth/oidc/config
{"errors":["no handler for route \"auth/oidc/config\". route entry not found."]}
$ curl -H "X-Vault-Token: …" …/v1/sys/policies/acl/viewer
{"errors":[]}          # 404
```

Unauthenticated probes are misleading here — `auth/oidc/oidc/auth_url` answers
`permission denied` whether or not the mount exists, and a nonexistent mount path answers
identically. Judge this only from an authenticated read.

### State after the first run

`pulumi up --stack home-operations` completed once
(`+2 created, ~11 updated, +-139 replaced, 707 unchanged, 2 errored`, 3m36s):

| Resource | State |
|---|---|
| `sys/policies/acl/viewer` | ✅ created |
| `auth/oidc` method | ✅ created — correct `oidc_discovery_url`, `oidc_client_id`, `default_role: family` |
| `auth/oidc/role/{admin,family}` | ❌ **absent** — `LIST auth/oidc/role` returns `[]` |
| `secrets/hosts/pbs/`, app `…/oidc` paths | ❌ still empty |

**Login cannot work without the roles**, so OIDC is still down. Three further `up` attempts
never reached them — each aborted earlier, on the UniFi provider (blocker 1 below).

The 139 replaces were the DockgeLxc path-trigger migration and are a one-time cost; they
carried identical file content and the triggers are now machine-independent.

### Everything the old runbook was blocked on is now resolved

The "OIDC bootstrap — executable runbook" that used to occupy this space is obsolete. Each
of its blockers was re-checked against the live estate:

| Old blocker | State at 18:15Z |
|---|---|
| Pods never rolled on a ConfigMap-only change | **Fixed.** Reloader + `RollingUpdate` (#3072, #3075). `currentRevision == updateRevision`, all 3 pods restarted 17m ago |
| generate-root 403s, so no root token | **Moot.** The toggle was opened, used, and reverted (#3070); `generate-root -status` 403s again, as intended. Pulumi does not need it |
| `pulumi` policy too narrow for `sys/auth/*` | **Applied.** `capabilities-self` on the live token returns `["create","delete","read","sudo","update"]` on `sys/auth/oidc`, and the grants on `sys/policies/acl/viewer`, `auth/oidc/config`, `auth/oidc/role/*` are all present |
| Authentik provider + client credentials | **Live.** 1Password item `equestria-openbao-oidc-credentials` has all 9 fields; `issuer` is `https://authentik.driscoll.tech/application/o/equestria-kube-system-openbao-wolf/` and its discovery document resolves |
| Pod egress to Authentik | **Verified.** `openbao-0` fetches the discovery document over the public hostname |
| Run `equestria-init.sh oidc` | **Superseded** by Pulumi — running it now would create the same objects outside Pulumi's state and the next `up` would fight it. Break-glass only |

### How to run it

The stack is `home-operations`, not `home` (`stacks/home/Pulumi.home-operations.yaml`):

```bash
cd home-operations/stacks/home
# BAO_ADDR + BAO_ROLE_ID + BAO_SECRET_ID from bootstrap/openbao/pulumi-approle.sops.yaml
mise exec -- op run --no-masking -- pulumi up --stack home-operations --non-interactive
```

⚠️ **`bootstrap/openbao/pulumi-env.sh` does not exist.** `components/globals.ts:175` and its
error message at `:187` both tell you to run `eval "$(bootstrap/openbao/pulumi-env.sh)"` to
export `BAO_ADDR`/`BAO_ROLE_ID`/`BAO_SECRET_ID` — that script was never written in this
repo. Until it is, export the three by hand from `pulumi-approle.sops.yaml`.

⚠️ **`@pulumi/vault` may not be installed locally.** It is declared at `package.json:43`
and is in the lockfile, but a checkout predating home-operations#683 will fail the run at
import with `Cannot find package '@pulumi/vault'`. `npm install` at the repo root fixes it.

---

### Two blockers found during the first run (2026-08-08)

### Blocker 1 — the UniFi provider aborts the whole stack

```
error: failed getting server info: Server error (403 then 502) for GET
  https://unifi.driscoll.tech/proxy/network/api/s/default/stat/sysinfo
  old API returned empty server info: Failed to create UniFi client
```

This kills the run before it reaches `stacks/home/index.ts:333`, which is why the OIDC
roles never get created. **It is not the credential and not the controller** — both were
tested directly:

- the API key from `Unifi Api Key Eris Cluster` returns **200 on that exact path**, 20/20
  rapid sequential calls, and 401 without it. Its `expires` field is epoch 1839672060
  (2028), so it has not lapsed.
- the controller answers 200 on `/` and a clean 401 on unauthenticated
  `/proxy/network/status`.

The provider's own wording — *"old API returned empty server info"* — says it is probing a
legacy path during Configure and failing there, even though the modern path works with the
same key. Chain: `components/globals.ts:56` reads the credential →
`components/globals.ts:82-89` constructs `UnifiProvider` (the failing step) →
`components/StandardDns.ts:109-122` is the resource that surfaces it →
`components/DockgeLxc.ts:209-220` creates it as `alpha-site-dockge`. Needs its own
investigation; it is not an OpenBao problem, it just blocks this stack.

### Blocker 2 — the dual-write gate does not recognise the AppRole

```
warning: BAO_TOKEN is not set — skipping the OpenBao dual-write for celestia.
```

`components/globals.ts:150`:

```ts
return !!process.env.BAO_TOKEN || runtime.isDryRun();
```

home-operations#692 made the AppRole the normal authentication path, but this gate still
only recognises `BAO_TOKEN`. An AppRole run authenticates fine — `baoProvider` accepts it
at `globals.ts:196-205` — and then silently skips every Phase 8a dual-write. That is why
`secrets/hosts/pbs/` and the app `…/oidc` paths are still empty after a run that appeared
to succeed.

Worse, the `isDryRun()` arm makes **preview advertise 12 creates that `up` will never
perform**. A clean preview is not evidence the dual-write will happen. The gate needs the
same AppRole check the provider already does.

### Verify after the run

```bash
bao login -method=oidc role=admin     # admins member
bao login -method=oidc role=family    # family member
bao token lookup -format=json | jq '.data.policies'
# family → ["default","viewer"]      admin → ["default","admin"]
```

The `viewer` boundary is the thing worth proving. As a **family** token, browsing must work
and reading a value must fail:

```bash
bao kv list secrets/shared/                          # PASS  — viewer has list on secrets/metadata/*
bao kv get  secrets/shared/cloudflare-driscoll-tech  # MUST FAIL 403 — no capability on secrets/data/*
```

If that last command returns data, the policy is wrong — stop and fix it before declaring
go-live. As an **admin** token the same `kv get` must succeed.

<details><summary>The manual bootstrap runbook this section replaced (historical)</summary>

### OIDC was Pulumi-managed as of 2026-08-08

home-operations#688 replaced `equestria-init.sh oidc` with
`components/openbao/oidc.ts` (wired into `stacks/home`): the `viewer` policy, the `oidc`
auth method and the `admin`/`family` roles are resources, so they are reviewable in git
and drift-checked on every preview. The Authentik client credentials come from the
`applications` stack rather than being pasted into env vars for a script run.

**The `oidc` subcommand in this repo is superseded.** It still works, but running it now
would create the same objects outside Pulumi's state and the next `pulumi up` would fight
it. Leave it for break-glass only.

### One thing had to be widened for this to work

The `pulumi` policy granted only `secrets/*`, `docs/*` and `meta/*` — explicitly "no auth
administration". The provider needs more, and `sys/auth/:path` is **root-protected**:
enabling, reading *or* deleting an auth method requires `sudo`, so the refresh on a plain
`pulumi preview` fails too, not just the apply. Grants added (narrowly — the single `oidc`
path and the single `viewer` policy, never `sys/auth/*`):

```
sys/auth/oidc            create read update delete sudo
sys/policies/acl/viewer  create read update delete
auth/oidc/config         create read update
auth/oidc/role/*         create read update delete list
```

### Applying it needs one admin token, once

The policy that grants this is itself written by an admin-capable token, so the chain is:

1. **Roll the openbao pods** so the generate-root listener toggle finally loads —
   `kubectl -n kube-system rollout restart statefulset/openbao`. This works now that
   equestria-cluster#3075 set `updateStrategyType: RollingUpdate`; before it, kubectl
   refused outright on an OnDelete StatefulSet.
2. **Re-apply the policies** with a root token regenerated from the recovery shares:
   `BAO_ADDR=… SOPS_AGE_KEY_FILE=… ./bootstrap/openbao/equestria-init.sh resume`
   (`resume` regenerates root itself, re-runs the idempotent setup including
   `write_policies`, and revokes the token at the end).
3. **Merge equestria-cluster#3070** to close the generate-root toggle again. Reloader
   plus RollingUpdate now make that revert actually reach the pods.
4. **`pulumi up` on `stacks/home`** with `BAO_ADDR`/`BAO_TOKEN` from the `pulumi`
   AppRole — this is what actually configures OIDC, and every run after it is a drift
   check.
5. **Verify** UI login at `https://bao.equestria.driscoll.tech/ui` as an `admins` member
   (policy `admin`) and a `family` member (policy `viewer`: can browse `secrets/` and read
   `docs/`, cannot read any secret value).

---

### OIDC bootstrap — executable runbook (2026-08-08)

Human OIDC login: Authentik `admins` → policy `admin`, `family` → read-only policy
`viewer`. Both code halves are **merged** (equestria-cluster#3067, vault#150). What
remains is a live sequence with one open blocker.

### State as of 2026-08-08 16:00Z

| Step | What | State |
|---|---|---|
| 1 | equestria-cluster#3067 merged; Flux applied the ConfigMap | ⚠️ **half-done — see blocker** |
| 2 | `applications` stack → Authentik provider + 1Password item | ✅ **done** |
| 3 | `equestria-init.sh oidc` | ⛔ blocked on step 1 |
| 4 | Revert the listener toggle (equestria-cluster#3070, draft) | pending |
| 5 | Verify admin + family login | pending |

**BLOCKER — the openbao pods never rolled.** #3067 changed only the chart's ConfigMap,
not the pod template, so the StatefulSet's `currentRevision` still equals its
`updateRevision` and the three pods are running config they read at startup ~15h ago.
The toggle is present in the file mounted inside the pod, but the *process* has not
loaded it:

```console
$ kubectl -n kube-system exec openbao-0 -- \
    sh -c 'BAO_ADDR=http://127.0.0.1:8200 bao operator generate-root -status'
Code: 403. Errors:
* permission denied
```

So step 3 cannot mint its root token yet. The pods must be restarted by hand — Flux will
not do it for a ConfigMap-only change. That restart is step 1b below.

### Common environment

Every step below assumes:

```bash
export KUBECONFIG=/Users/david/Development/david-driscoll/equestria-cluster/kubeconfig
export SOPS_AGE_KEY_FILE=/Users/david/Development/david-driscoll/equestria-cluster/age.key
export BAO_ADDR=https://bao.equestria.driscoll.tech
```

### Step 1b — roll the pods so the toggle takes effect

Auto-unseal is via the `bao-transit` seal, so each pod unseals itself on restart; no
manual unseal ceremony. Roll one at a time and wait for HA to settle.

```bash
kubectl -n kube-system rollout restart statefulset/openbao
kubectl -n kube-system rollout status  statefulset/openbao --timeout=10m
```

Confirm the toggle is actually live before going further — this must **not** 403:

```bash
kubectl -n kube-system exec openbao-0 -- \
  sh -c 'BAO_ADDR=http://127.0.0.1:8200 bao operator generate-root -status'
```

From here the unauthenticated `sys/generate-root/*` endpoints are open. Steps 3 and 4
should follow immediately — do not leave the cluster parked in this state.

### Step 2 — already done, nothing to run

The `applications` Pulumi stack ran at 15:51Z on 2026-08-08 (≈2 min after #3067 merged)
and produced both artefacts:

- Authentik `ProviderOauth2` id **1102**, name `equestria-kube-system-openbao-92e22d9`,
  confidential, `subMode=user_email`, `includeClaimsInIdToken=true`, both redirect URIs
  present, 3 property mappings bound.
- 1Password item `equestria-openbao-oidc-credentials` (vault **Eris**, id
  `7sriuxu44ckvkecdpt7xcpzohy`).

To re-verify without changing anything:

```bash
cd /Users/david/Development/david-driscoll/home-operations/stacks/applications
mise exec -- op run --no-masking -- pulumi preview --stack equestria --non-interactive
```

Expect `equestria-kube-system-openbao` as `~ update`, never `+ create`, and
`equestria-openbao-oidc-credentials … no changes detected`.

> The preview reports `~ update` for **all 14** OAuth2/proxy providers with no field-level
> diff — a standing no-op churn in the Authentik provider (the write-only `clientSecret`
> defeats its comparison), not openbao drift. An `up` is not required for this workstream
> and would touch all 14; don't run one just for OIDC.

### Step 3 — run the OIDC setup

Source the three values from the 1Password item. `--reveal` is required for the
concealed `client_secret`. Assign into exported variables and never echo them: the
script reads them via `jq -n 'env.*'` so the secret never reaches argv, the process
table, or a temp file.

```bash
cd /Users/david/Development/david-driscoll/vault

export OPENBAO_OIDC_CLIENT_ID="$(op item get equestria-openbao-oidc-credentials \
  --vault Eris --fields label=client_id --reveal)"
export OPENBAO_OIDC_CLIENT_SECRET="$(op item get equestria-openbao-oidc-credentials \
  --vault Eris --fields label=client_secret --reveal)"
export OPENBAO_OIDC_DISCOVERY_URL="$(op item get equestria-openbao-oidc-credentials \
  --vault Eris --fields label=issuer --reveal)"
```

Sanity-check without printing anything sensitive (expect `16 / 32 / non-empty`):

```bash
printf 'id=%s secret=%s\n' "${#OPENBAO_OIDC_CLIENT_ID}" "${#OPENBAO_OIDC_CLIENT_SECRET}"
echo "discovery=${OPENBAO_OIDC_DISCOVERY_URL}"
# discovery=https://authentik.driscoll.tech/application/o/equestria-kube-system-openbao-wolf/
```

`issuer` is the correct field: OpenBao's `oidc_discovery_url` wants the issuer and
appends `.well-known/openid-configuration` itself. Do **not** use the item's
`openid_configuration_url` field. The slug (`…-openbao-wolf`) is a `RandomPet` chosen by
the stack, so it is not predictable — always read it from the item rather than
hand-writing it.

Then:

```bash
./bootstrap/openbao/equestria-init.sh oidc
```

It regenerates a root token from the recovery shares (or reuses `BAO_TOKEN` if you set
one), writes the `viewer` policy, enables and configures `oidc` with
`default_role=family`, writes the `admin` and `family` roles, and revokes the root token
it minted.

### Step 4 — revert the toggle, immediately

Draft PR **equestria-cluster#3070** is already open with exactly this revert. Mark it
ready, merge it, then roll the pods again (same ConfigMap-only caveat as step 1b):

```bash
kubectl -n kube-system rollout restart statefulset/openbao
kubectl -n kube-system rollout status  statefulset/openbao --timeout=10m
```

Confirm generate-root is closed again — this **must** 403:

```bash
kubectl -n kube-system exec openbao-0 -- \
  sh -c 'BAO_ADDR=http://127.0.0.1:8200 bao operator generate-root -status'
```

### Step 5 — verify

Script-level:

```bash
./bootstrap/openbao/equestria-init.sh status
```

UI login at `https://bao.equestria.driscoll.tech/ui`, method **OIDC**, as an `admins`
member (role `admin`) and a `family` member (role `family`).

CLI equivalent, per role:

```bash
bao login -method=oidc role=admin     # admins member
bao login -method=oidc role=family    # family member
```

The `viewer` boundary is the thing worth proving. As a **family** token, browsing must
work and reading a value must fail:

```bash
# PASS — viewer has `list` on secrets/metadata/*
bao kv list secrets/shared/

# PASS — viewer has read+list on docs/
bao kv list secrets/

# MUST FAIL with 403 permission denied — viewer has NO capability on secrets/data/*
bao kv get secrets/shared/cloudflare-driscoll-tech
```

If that last command returns data, the policy is wrong — stop and fix it before
declaring go-live. As an **admin** token the same `kv get` must succeed.

Check the token actually carries the expected policy:

```bash
bao token lookup -format=json | jq '.data.policies'
# family → ["default","viewer"]      admin → ["default","admin"]
```

</details>

</details>

---

## Phase 5 — complete (tcp:2023 applied 2026-08-09)

All three deliverables are **merged and reconciled**. In equestria:

```console
$ kubectl get kustomization -A | grep openbao
kube-system   openbao           25h    True   Applied revision: …@263ae6f8
kube-system   openbao-replica   126m   True   Applied revision: …@263ae6f8

$ kubectl -n kube-system get cronjob | grep openbao
openbao-replica-dump           0 3 * * *     False   0   <none>
openbao-replica-restore-test   0 5 1 * *     False   0   <none>
```

**Done.** The Pulumi operator applied home-operations#695 itself (`+0-0~8`, zero deletes)
and `dockge-as:2023` probes OPEN from an openbao pod. A manual VolSync run then proved the
whole path end to end — `lastSyncTime 2026-08-10T02:38:42Z`, 1m42s — so restic can open the
repository with the OpenBao-sourced password, which a rendered Secret alone does not show.

Everything else was checked and is in place:

| Piece | State |
|---|---|
| receiver on dockge-as | ✅ `bao-standby-dump-sftp  Up  100.111.10.9:2023->2023/tcp` |
| egress Service ports | ✅ `https=443 ssh=22 adguard=4000 bao=8200 bao-dumps=2023` |
| host dumps directory | ✅ `/opt/stacks-data/bao-standby/dumps` (nobody:nogroup) |
| restore-test AppRole | ✅ minted; placeholders replaced (equestria-cluster#3080) |
| **tcp:2023 ACL grant** | ❌ **missing** — the only blocker |

```console
$ kubectl -n kube-system exec openbao-0 -- sh -c 'nc -z -w5 dockge-as.opossum-yo.ts.net 2023 …'
2023 CLOSED
8200 OPEN        # bao-transit, for contrast — the egress path itself works
```

8200 is open because `openbao-transit-unseal` grants it; 2023 has no grant, so the egress
proxy forwards the port and the connection dies in the ACL. **This presents as a plain
connection refused, which reads like the receiver is down — it is not.** That grant's own
comment predicted exactly this: *"the egress Service forwards the port and the connection
still dies in the ACL, which looks exactly like a misconfigured seal address."*

The earlier reading of this section — "nothing is listening", "the stack was never
deployed" — was wrong. The `bao-standby` stack deployed with the first `stacks/home` run
and the receiver has been up since; only the ACL was ever missing.

Dumps are decryptable ONLY off-host (estate age recipients); the restore test therefore
runs in equestria, where `sops-age` already lives, never on alpha-site.

## Phase 8a — the stacks/home half is applied (2026-08-08 21:00Z)

Every code half is on `main` — the official Pulumi Vault provider (home-operations#683),
the conditional dual-write (#689), the AppRole authentication (#692, vault#153), and the
gate fix that made any of it actually execute (#694).

The `stacks/home` half is now applied:

```console
$ bao kv list secrets/hosts
dockge/  pbs/                       # pbs/ written by the dual-write

$ bao kv list secrets/clusters/celestia/apps
arcane/ forgejo/ hermes/ homelable/ pbs/ pdm/ pve-celestia/ technitium/
```

**Phase 8a is COMPLETE as of 2026-08-09.** The blocker was never a missing local run —
every stack runs under the Pulumi Kubernetes Operator, which had no OpenBao credentials, so
`baoDualWriteEnabled` was false on every 300s resync and each write was silently skipped
while the run reported success. Fixed by home-operations#699 (the AppRole as a SOPS secret
plus `BAO_*` envRefs on all nine Stack CRs). Counted live afterwards:

```
alpha-site          2 apps,  2 with oidc/
celestia            8 apps,  8 with oidc/
equestria          34 apps, 14 with oidc/
luna                3 apps,  3 with oidc/
sgc                11 apps,  3 with oidc/
skystar             3 apps,  3 with oidc/
twilight-sparkle    1 apps,  1 with oidc/
TOTAL: 62 apps, 34 with oidc/          (was 11)
```

**All 28 apps without an oidc path are correctly without one** — each was classified
individually rather than assumed: 17 have no `definition.yaml`, 3 declare
`authentik: none`, 5 use a proxy provider (no OAuth2 client), and 3 are disabled apps
(`outline`, `retrom`, `oxycloud` — commented out in their parent kustomization, no
`ApplicationDefinition` CR, no workloads).

That last group is worth remembering: **`stacks/applications` discovers apps from live
`ApplicationDefinition` CRs in the cluster** (`kubernetes.ts:35-49`,
`listNamespacedCustomObject`), NOT from `definition.yaml` in git. Checking git will show
apps that declare `oauth2` and look wrongly skipped. Judge from the cluster.

Minor residue: those three still have `postgres` paths in OpenBao, faithfully migrated by
Phase 4 from their 1Password items, so OpenBao carries DB credentials for three undeployed
apps. Harmless, but `--verify` will report them in sync forever.

Note the app paths that predate this all contain `postgres` and carry
`custom_metadata.migrated_at`, i.e. they came from the Phase 4 `op-to-bao --apply` rather
than from a stack — a useful way to tell the two sources apart.

## Phase 4 is COMPLETE (2026-08-07, re-applied 2026-08-08)

`--apply` ran against `https://bao.equestria.driscoll.tech` with the `pulumi` AppRole:
**188 written, 0 failed; `--verify` reports 188/188 in sync.** 1Password stays
authoritative until Phase 11 — this is the start of dual-run, not a cutover.

It was re-applied on 2026-08-08 — every migrated key carries
`created_time: 2026-08-08T15:14Z` and `custom_metadata.migrated_at: 2026-08-08T15:14…`
at `current_version: 1`, so the earlier 08-07 data was replaced rather than versioned
over. Live shape as of 18:15Z: `secrets/{clusters,hosts,shared}`, 142 keys under
`secrets/shared/`, 28 app paths under `clusters/equestria/apps/` and 8 under
`clusters/sgc/apps/`, `hosts/dockge/` only, 6 documents in `docs/`, `meta/` empty.

`mapping.yaml` is committed in home-operations as the record: 259 items, 71 skipped.
Skips are classifier policies (not hand edits), in `scripts/op-to-bao/mapping.ts`:
the generated oidc/PBS families (→ Phase 8a; the PBS pattern is case-insensitive
because the live vault has "Luna PBS backup user"), B2/Backblaze/Authentik Outputs/
Backup Plan/user-tagged entries (estate decision 2026-08-07), the seal-chain and
pre-auth material INVENTORY §2 forbids from ever entering OpenBao (alpha-site static
unseal key, Pulumi passphrase), and the personal-scope GitHub PAT.

**Path scheme note:** the applied layout is FLAT — `secrets/shared/<slug>` — not the
`shared/providers/…` / `shared/<family>/…` grouping PLAN §A sketched. The mapping was
reviewed and accepted that way; the canary read in PLAN §Verification and RUNBOOK
Scenario B now points at `secrets/shared/cloudflare-driscoll-tech`. If grouping is ever
wanted, it is a KV move + mapping.yaml edit, best done before Phases 6–8 wire consumers
to the flat paths.

## Phase 4 in progress (2026-08-07)

The first live `--plan` run happened (the tool had only ever run against its no-network
tests before). State:

- **Live-run bug found and fixed:** Connect 500s on `title co ""` — the tool's full-vault
  read via `listItemsByTitleContains("")` never worked against a real server. `OPClient`
  gained `listAllItems()` (the unfiltered list endpoint) and the tool now uses it.
- **First plan: 260 items, 187 review, 2 collisions** — both collisions literal duplicate
  titles in Eris.
- **Estate skip policies encoded in the classifier** (`scripts/op-to-bao/mapping.ts`,
  decided 2026-08-07, David) so `--plan` re-runs reproduce them: `*-oidc-credentials`
  and PBS credentials (`Proxmox Backup Server*`, `*PBS Backup User`) — the Pulumi stacks
  will create these in OpenBao directly (see Phase 8a in PLAN.md §G); `Authentik Outputs`,
  `B2 Database*`, `B2 Backup*`, `Backblaze*`, `Backup Plan`; and everything tagged
  `opossum-yo.ts.net/user`. Skipped entries keep their would-be path so the mapping stays
  a complete record. The collision check now ignores skips (--apply never writes them).
- **Still blocking `--apply`:** the `ProxmoxHost: Alpha Site` duplicate (uuids
  `6eufaqmj…` / `xm4gaahu…`) — a real duplicate pair, dedupe in the 1Password UI; and the
  post-policy `--plan` re-run, which is waiting on 1Password CLI authorization (the
  desktop app locks its `op` session aggressively; runs fail with "authorization
  timeout" until it is unlocked).

**New Phase 8a scope this created** (PLAN.md §G updated): because the generated oidc/PBS
families are not migrated, the stacks must write them to the canonical paths *before*
Phases 6–7 cut ESO consumers over — until then those OpenBao paths are empty.

## Phase 3 is COMPLETE (2026-08-07)

The unsuspend merged (equestria-cluster#3061), and after the storage-wipe detour
recorded under "facts established the hard way", `bootstrap/openbao/equestria-init.sh
init` ran clean end to end. Verified live:

- 3/3 pods, 1 active + 2 standbys, all unsealed via transit against bao-transit
- `https://bao.equestria.driscoll.tech/v1/sys/health` answers through the internal
  gateway (external-dns published the record from the HTTPRoute)
- mounts `secrets/` `docs/` `meta/` (kv-v2); auth `kubernetes` + `approle`;
  policies `admin` / `pulumi` / `eso-equestria` / `eso-sgc`
- `equestria-recovery-keys.sops.yaml` (3-of-5) and `pulumi-approle.sops.yaml`
  committed; root token revoked

Deliberately not done yet: the `ci` policy (scope undefined in PLAN.md — add it with
its first consumer) and `oidc` auth (needs an Authentik provider/client first).

<details><summary>The pre-go-live checklist this section used to be (historical)</summary>

Everything it was waiting on is now done (branch `claude/openbao-seal-address` in
equestria-cluster):

- seal address fixed — see below
- port 8200 declared on the dockge-as egress Service
- `secret.sops.yaml` created with the transit token
- `externalsecret.yaml` supplies the Postgres connection URL
- `dependsOn` extended to `external-secrets-stores` and `tailscale-services`

Validated with `flate test all` (327 passed, 2 skipped, 0 errors — the openbao skip is
gone) and `eso-values-lint` (0 findings) with `suspend` temporarily flipped locally.

This is a genuine go-live: it creates the StatefulSet, initialises the `openbao` database,
and takes the transit seal live. Past that point, rollback is no longer just `git revert`.

Still outstanding from Phase 2: the static unseal key is *still* an `op://` reference in
`home-operations/docker/alpha-site/bao-transit/.env`. Until it moves to
`bootstrap/openbao/alpha-site-static-unseal.sops.yaml`, 1Password remains a root of trust
for the whole estate.

### One thing that could not be verified in advance

The egress port could not be tested before merge — patching the live Service was declined
by the sandbox, and Flux will not create the port until the branch lands. So the first
real proof that the unseal path works is the pods coming up. If they crash-loop on the
seal, check in this order: the Service actually has the `bao` port
(`kubectl -n tailscale-system get svc dockge-as -o jsonpath='{.spec.ports[*].name}'`),
then reachability from a pod
(`nc -z dockge-as.opossum-yo.ts.net 8200`), then the token.

(Resolved: the unseal path worked on the first live attempt — the transit seal
encrypted the root key against bao-transit during `operator init` and all three
pods auto-unsealed.)

</details>

---

## The seal address was wrong (resolved — kept for the reasoning)

Merged and live: the running pods' config reads
`address = "http://dockge-as.opossum-yo.ts.net:8200"`, the egress Service carries
`bao=8200`, and `nc -z dockge-as.opossum-yo.ts.net 8200` from `openbao-0` succeeds. The
rest of this section is why, and it is the template for the tcp:2023 gap in Phase 5.

`kubernetes/apps/kube-system/openbao/helmrelease.yaml:83` dialed

```hcl
address = "http://${ALPHA_SITE_TAILSCALE_IP}:8200"
```

This is wrong twice over, and both had to be found by probing from inside the cluster.

**Wrong host.** `ALPHA_SITE_TAILSCALE_IP` is `100.111.10.200`, the `alpha-site` *Proxmox
host*. `bao-transit` does not run there — it runs in the `dockge-as` LXC, whose compose
publishes the port on that node's own tailnet address:

```
100.111.10.9:8200->8200/tcp     # docker-proxy on dockge-as
```

**Wrong form.** Even the corrected IP would not work: equestria pods have no route to the
tailnet at all. Confirmed by probing both addresses from a pod in `kube-system` — both
`100.111.10.9:8200` and `100.111.10.200:8200` are unreachable. Pods reach tailnet hosts
only through the tailscale-operator egress `ExternalName` Services in `tailscale-system`.
`Update.cs` in that directory states the rationale outright: "the `dockge-*` DNS names
resolve to tailnet IPs that SGC nodes cannot route."

An egress Service for `dockge-as` already exists — but it forwards only the ports declared
in `spec.ports`. Port-scanned from a pod:

```
443=OPEN  22=OPEN  4000=CLOSED  8200=CLOSED
```

**Fixed** on branch `claude/openbao-seal-address`, in two edits:

1. `kubernetes/apps/tailscale-system/services/Update.cs` — added `8200` to the `as` /
   `ServiceKind.Dockge` `extraPorts` entry, alongside the existing `adguard` 4000. The
   `luna` entry (llm/stt/tts on 8080/10300/10200) is the precedent for arbitrary TCP.
   `services/as.yaml` says "do not edit manually", so this went through the generator.
   Regenerating touched only that one file (+3 lines) — the generator is byte-stable
   otherwise. Run it alone rather than via `task update`, which fires *every* `Update.cs`
   in the repo:
   `mise exec -- op run --no-masking -- dotnet run kubernetes/apps/tailscale-system/services/Update.cs`
   (plain `op run` is not enough — mise has to supply the `op://` literals first). No
   probe on the port: the probe helper always builds an `https://` URL and bao-transit runs
   `tls_disable`, so it would report a false failure. Health is already covered by the
   Gatus check in the bao-transit stack definition.
2. `kubernetes/apps/kube-system/openbao/helmrelease.yaml` — seal address is now
   `http://dockge-as.${TAILSCALE_DOMAIN}:8200`.

The MagicDNS name works from inside the cluster because the tailscale operator's
nameserver resolves it to the egress proxy's ClusterIP — from a pod,
`dockge-as.opossum-yo.ts.net` and `dockge-as.tailscale-system.svc.cluster.local` both
answer `10.196.81.163`. `${TAILSCALE_DOMAIN}` is in scope for every app Kustomization via
the global `substituteFrom` patch at `kubernetes/flux/cluster/ks.yaml`.

Do **not** simply repoint `ALPHA_SITE_TAILSCALE_IP`: it is a shared substitution in
`kubernetes/components/common/shared-secrets.sops.yaml` and other things legitimately use
it for the Proxmox host. It is now unreferenced by openbao but stays defined — Phase 5's
replication CronJob needs it.

---

## The Postgres credential is referenced, not copied

The original plan had `pg-connection-url` hand-written into `secret.sops.yaml` and the
password mirrored into `bootstrap/openbao/postgres-openbao.sops.yaml`. Both are copies of
a value that `task update` regenerates, so both would have drifted silently on the next
rotation. Neither exists now.

Instead `kubernetes/apps/kube-system/openbao/externalsecret.yaml` pulls the ready-made
`uri` key out of the generated `openbao-postgres` secret through
`ClusterSecretStore/database`, which already carries exactly the right form:

```
postgres://openbao:<pw>@postgres-rw.database.svc.cluster.local:5432/openbao?sslmode=disable
```

**This does not reintroduce the bootstrap cycle.** `ClusterSecretStore/database` is a
`kubernetes` provider reading the `database` namespace directly — it is not backed by
1Password today and will not be backed by OpenBao later, so OpenBao is never a link in the
chain that starts OpenBao. The only new coupling is ordering, handled by `dependsOn`.

One wrinkle: `external-secrets-stores` currently `dependsOn` `onepassword-connect`, so
until Phase 11 removes that, OpenBao transitively waits on 1Password Connect at boot.
Irritating, not circular, and it resolves itself at cutover.

The transit token stays in `secret.sops.yaml` — nothing in the cluster can mint it.

---

## Facts established the hard way

Each of these cost real effort to pin down and would be expensive to rediscover. Several
contradict the published documentation.

- **The transit seal reads `VAULT_TRANSIT_SEAL_TOKEN` / `_ADDR` / `_KEY_NAME` /
  `_MOUNT_PATH` — not `VAULT_ADDR` / `VAULT_TOKEN` as the website says.** Env beats config.
  Source: `go-kms-wrapping/wrappers/transit/transit_client.go:20-35`.
- **The transit seal takes a token, not an AppRole.** The stanza has no AppRole path.
- **`BAO_PG_CONNECTION_URL` overrides `connection_url`** — `physical/postgresql/postgresql.go:282`.
- **The seal address must be set explicitly.** Left unset, the wrapper falls back to
  `api.DefaultConfig()`, which reads `BAO_ADDR`/`VAULT_ADDR` — pointing the seal at the
  pod's own listener and deadlocking the unseal.
- **Static seal keys are exactly 32 bytes**, AES-256-GCM-96. No other algorithm. Inline
  base64/hex, or `env://` / `file://`.
- **A static seal is an Auto Unseal, so `bao operator init` yields *recovery* keys.** Pass
  neither `-key-shares` nor `-recovery-shares`; the server picks.
- **`bao status` exits 2 when sealed or uninitialised but still prints valid JSON.** Judge
  reachability by parseable output, never the exit code.
- **The init response field is `recovery_keys_threshold`, not `recovery_threshold`.**
  `bao operator init -format=json` on 2.6.1 returns `unseal_keys_b64` / `unseal_keys_hex` /
  `unseal_shares` / `unseal_threshold` / `recovery_keys_b64` / `recovery_keys_hex` /
  `recovery_keys_shares` / `recovery_keys_threshold` / `root_token`. Reading the wrong name
  falls through to `unseal_threshold`, which under an auto seal is the threshold of the
  empty, unused unseal-key family — always `1`. The script recorded `threshold: 1` against
  5 recovery shares on the real run before this was caught; both the script and the file
  are now corrected to `3`. The server is authoritative: `bao status` reports `t`/`n`.
- **The transit seal renews its own token.** `transit_client.go:167-204` calls
  `RenewTokenAsSelf` on startup and then runs a `LifetimeWatcher`. This only works if the
  token can `renew-self` — which it gets from the `default` policy, attached because
  `bao token create` was not given `-no-default-policy`. If renewal fails the wrapper logs
  "unable to renew token, disabling renewal" and carries on, so the token then dies
  silently at the end of its period and the failure only surfaces on the next pod restart.
  Do not add `-no-default-policy` to that token.
- **The `bao-transit` data volume must be chowned to uid 100 / gid 1000.** The image runs
  as the non-root `openbao` user; the host directory is created root-owned, so the first
  `bao operator init` fails with `failed to persist keyring: mkdir /openbao/data/core:
  permission denied`. It fails atomically — no keys are minted — so it is a clean retry
  after `chown -R 100:1000 /opt/stacks-data/bao-transit/data`. This is currently a manual
  fix on the host and will not survive a re-provision; it belongs in the Pulumi
  `DockgeLxc` definition.
- **Port 8200 is not reachable across the tailnet from a user device**, only from tagged
  nodes. Use the Traefik route for CLI work: `BAO_ADDR=https://bao-transit.opossum-yo.ts.net`.
  The `http://<ip>:8200` form in the script header and README only works from a tagged host.
- **The 1Password Operator SANITISES Secret keys; OpenBao stores field names verbatim.**
  A field named `valid from` or `one-time password` arrives from OpenBao with the space
  intact, and a space is not a legal Kubernetes Secret key — so a bare `dataFrom.extract`
  makes the API server reject the **entire** Secret, not just that entry. The operator
  replaced illegal characters with `-`; `rewrite: [^-._a-zA-Z0-9] -> -` reproduces its
  output byte for byte. The repo's usual `[\W] -> _` also produces a legal key, but a
  differently-named one. Four of the 21 CRs need this. SGC will hit it again in Phase 7.
- **The operator also INVENTS a `website` key** from the 1Password item's URL. A URL is not
  a field, so `op-to-bao` never migrated it and no OpenBao path has it. Three Secrets lose
  the key on conversion. Check consumption across pods, `valuesFrom`, `secretKeyRef` and
  all four repos before assuming it is inert — it was, here.
- **Every operator-created Secret carries an `ownerReferences` entry pointing at its CR**,
  so removing the CR garbage-collects the Secret. That is what makes an in-place conversion
  safe: ESO cannot adopt a Secret owned by another controller, but it does not have to —
  Flux prunes the CR, the Secret goes with it, and ESO recreates it on retry. The cost is a
  few seconds of absence and one transient `SecretSyncedError`.
- **`vals` cannot read KV v2 `custom_metadata`** — only `/data/`. ESO *can*, via
  `metadataPolicy: Fetch`. Hence values live in data; metadata carries provenance only.
  `custom_metadata` is also key-scoped (doesn't roll back with a version) and capped at
  64 keys / 128-char keys / 512-char values.
- **SOPS encrypts values only — key names stay plaintext.** There is no mode that hides
  them. Don't encode anything sensitive into a key name.
- **`components/postgres/Update.cs` discovers databases by scanning `ks.yaml` for the
  `components: - ../../../components/postgres` entry.** Removing that entry as a tidy-up
  makes an app invisible to the generator; its rows then survive only until someone re-runs
  `task update`. This silently dropped crowdsec's entire database provisioning once already
  (equestria#3045, fixed in `e118e83`). **Do not remove that entry to tidy up.**
- **The OpenBao Helm chart is not on a reachable path from restricted networks**
  (`openbao.github.io` blocked, `pkg-containers.githubusercontent.com` blocked). The Go
  module proxy *is* reachable and serves the full OpenBao source including its vendored
  docs — that is how the above was verified.
- **sops resolves `.sops.yaml` from the current directory, not from
  `--filename-override`.** Run a bootstrap script from outside the repo and the encrypt
  fails — *after* `bao operator init` has minted keys, which then die with the process.
  This initialised the real cluster once with unrecoverable keys; the storage had to be
  wiped (truncate `openbao.openbao_kv_store` + `openbao.openbao_ha_locks` — note the
  tables live in the `openbao` schema, not `public` — with the STS scaled to 0). Both
  bootstrap scripts now `cd` to the repo root **and canary-encrypt in preflight**, so the
  encrypt path is proven before anything irreversible runs.
- **For ~30s after transit auto-unseal, every non-status request 500s** with "local node
  not active but active cluster node not found" while leader election completes against
  the postgres ha table. A script that proceeds straight from unseal to setup dies here
  and strands its root token — `equestria-init.sh` now waits for `leader_address` before
  touching mounts.
- **OpenBao 2.6.1 has TWO root-generation APIs and the CLI only speaks one.**
  `sys/generate-root/*` is unauthenticated + deprecated and is what the
  `disable_unauthed_generate_root_endpoints` listener flag ungates.
  `sys/generate-root-token/*` is authenticated and is what `bao operator generate-root`
  calls — `-init`, `-status` AND `-decode`, all of which contact the server. So flipping
  the flag opens an endpoint the CLI never touches, and the failure looks like the flag
  did not work. Drive the raw API (`bootstrap/openbao/root-ceremony.sh`) or hold a token
  with capabilities on the authenticated path (the `break-glass` AppRole).
- **The authenticated attempt endpoint wraps its payload in `.data`;** the deprecated
  unauthenticated one returns `nonce`/`otp` at the top level. A parser written against one
  silently reads nothing from the other.
- **sops writes YAML list scalars UNQUOTED.** `equestria-init.sh regen_root` parses the
  recovery shares with `sed -n 's/^  - "\(.*\)"$/\1/p'`, which requires quotes, so it
  reads zero shares and then blames the shares. Any parser over a sops-written list must
  tolerate both forms.
- **A stale root-generation attempt blocks the next one** with "root generation already in
  progress for this namespace". Always `DELETE` the attempt endpoint before starting, and
  cancel on the error path — an aborted script leaves one live.
- **Unauthenticated `sys/generate-root/*` is served ONLY by STANDBY pods — and is NOT
  disabled here.** This corrects an earlier entry that claimed it "403s even from
  localhost" and needs the `disable_unauthed_generate_root_endpoints` listener toggle.
  Measured live 2026-08-10: `openbao-0` and `openbao-1` (standbys) answer
  `{"required":3,…}`; `openbao-2` (**active**) answers
  `{"errors":["unsupported operation"]}`. The listener config carries no toggle at all.
  The old "confirmed 403 again" was almost certainly measured with
  `bao operator generate-root -status`, which speaks the *authenticated*
  `sys/generate-root-token/*` path and 403s regardless — exactly the confusion
  `root-ceremony.sh`'s own header documents, then repeated elsewhere as fact.

  Consequences: `bao.equestria.driscoll.tech` load-balances across all three pods, so the
  ceremony **fails roughly 1 run in 3**, and its error tells you to land the toggle, which
  is neither the cause nor needed. Worse, the ceremony makes several requests (open
  attempt, then three share submissions) that can land on *different* pods, so recovery
  shares could be spent against an attempt living on another node. **Pin one standby**:
  `kubectl -n kube-system port-forward pod/openbao-0 18200:8200` with
  `BAO_ADDR=http://127.0.0.1:18200`. Exposure is LAN/tailnet only — the route is on the
  internal gateway.
- **Use `root-ceremony.sh resume`, not `run`, for a policy or auth-role edit.** `run` also
  calls `restore-test.sh init`, which refuses to overwrite the existing approle file and
  fails the whole ceremony *after* minting. The probe's own success message says
  "Run: … run" and is wrong for that case.
- **Unauthenticated probes cannot tell you whether an auth mount exists.**
  `POST /v1/auth/<anything>/oidc/auth_url` answers `{"errors":["permission denied"]}`
  identically for a live mount, a disabled one, and a path that was never mounted —
  verified against `auth/doesnotexist/`. `GET /v1/sys/internal/ui/mounts` likewise returns
  `{"auth":{},"secret":{}}` unauthenticated unless a mount sets
  `listing_visibility: unauth`. Diagnose OIDC only from an authenticated read of
  `auth/oidc/config`, where a missing mount says `no handler for route`.

---

## Known issues, not yet fixed

- **RUNBOOK Scenarios B/C describe a break-glass flow that cannot work.** They are written
  around `bao operator generate-root`, which only speaks the authenticated endpoint. Rewrite
  them against `root-ceremony.sh` / the `break-glass` AppRole. Same for
  `equestria-init.sh regen_root`, which should be fixed or deleted.
- ~~`bootstrap/openbao/pulumi-env.sh` does not exist~~ — **written 2026-08-10**, see
  "Phase 8 — the read seam". `eval "$(bootstrap/openbao/pulumi-env.sh)"` now exports
  `BAO_ADDR`/`BAO_ROLE_ID`/`BAO_SECRET_ID`, and `--print` gives a redacted summary.
- **The tcp:2023 ACL grant is written but not applied.** home-operations#695 adds it;
  it needs `pulumi up` on `stacks/unifi-network` to take effect. Until then the nightly
  dump cannot reach dockge-as, and it fails looking like a network problem rather than an
  ACL one.
- ~~`restore-test.sh init` needs an admin token~~ — **resolved.** Provisioned during the
  #3078 window; credentials landed in equestria-cluster#3080. Future admin work uses the
  `break-glass` AppRole, no listener toggle required.
- **`Update.cs` strips comments from `resources/values.yaml`** — ~17 lines per run,
  including the `vault#119` warning about not reintroducing a backblaze-prefixed bucket
  reference ("nothing downstream will catch the mismatch"). Recurs on every `task update`.
  Deserves its own issue.
- **`bao-transit` and the future break-glass standby will share a host.** That puts the
  ciphertext and the key that decrypts it in one place, weakening the point of transit
  unseal. Mitigations chosen: the standby stays stopped by default, and the replication
  dump carries an independent age layer.
- **equestria's OpenBao runs in `kube-system`**, which is `pod-security: privileged` for
  the whole namespace. Fine for cilium/multus; more privilege than OpenBao needs.
- **`tls_disable = true` on bao-transit.** Only reachable over Tailscale (WireGuard, so not
  plaintext on the wire), but the transit token crosses that hop. Terminating TLS is worth
  doing.
- **Codacy is noisy on these repos** and has been ruled non-blocking. The repo deliberately
  has no JS/TS linter (`.config/hk.pkl` says so explicitly) and a scoped `.yamllint`; Codacy
  applies cloud-side defaults over both. A `.codacy.yml` mirroring that scoping would settle
  it.

---

## Phase 6 has unbuilt groundwork (2026-08-08)

`ClusterSecretStore/openbao` **does not exist.** Phase 3 enabled the `kubernetes` auth
method on the server, but no store was ever created:

```console
$ kubectl get clustersecretstore
backup  cluster  database  network  onepassword-connect     # no openbao
```

`PLAN.md` §B reads as though it exists. Three things are missing before any ExternalSecret
can name OpenBao:

1. a `kubernetes` auth **role** binding the ESO ServiceAccount to the `eso-equestria`
   policy — the policy exists, the role does not
2. the `ClusterSecretStore` manifest
3. the same for SGC (`eso-sgc`), pointing at equestria's OpenBao over the tailnet rather
   than a cluster-local Service

Scope also grew since PLAN was written: **93 ExternalSecrets on `onepassword-connect` and
22 `OnePasswordItem` CRs** in equestria, against the 44/19 the plan assumed.

---

## Still to do

Phases 0–4 are done. Phase 5 and 8a are written and merged but not executed. In dependency
order:

1. **`pulumi up` on `stacks/home`** — creates the `oidc` auth method, the `viewer` policy
   and the `admin`/`family` roles (fixes OIDC login), and dual-writes `secrets/hosts/pbs/`
   (Phase 8a, second half)
2. **`pulumi up` on `stacks/applications`** — dual-writes
   `secrets/clusters/<key>/apps/<app>/oidc` (Phase 8a, first half). Hard prerequisite for
   Phases 6–7
3. **Finish Phase 5** — deploy the alpha-site `bao-standby` stack, add the tcp:2023 ACL
   grant, run `restore-test.sh init`, chown the dumps directory on dockge-as
4. Write `bootstrap/openbao/pulumi-env.sh`, which two code paths already reference
5. ESO cutover in equestria, then SGC — including the 19 `OnePasswordItem` CRs, which have
   no OpenBao equivalent and must become ExternalSecrets (Phases 6–7)
6. Pulumi: `BaoStore` replaces `VaultStore`; `vals` replaces the bespoke resolver; split
   write-back so inventory goes to stack outputs (Phase 8, the rest of it)
7. ~~`vault` repo Pulumi stack cutover (Phase 9)~~ — **gates green 2026-08-12**, see "Phase 9 — this repo's own stack"
8. ~~Retire the PushSecrets (Phase 10)~~ — **complete 2026-08-12**; the live count was 31, not 256
9. ~~Stop writing to 1Password (Phase 11)~~ — **complete 2026-08-12.** 1Password is
   retained, not decommissioned: it keeps browser-fill and personal-scope
   credentials, and Pulumi still writes the PBS items a human logs in with.

---

## Note on environments

Part of this work was done from a remote environment whose egress proxy denies private
destination IPs (`x-deny-reason: private_dest_ip`), so it could not reach alpha-site,
either cluster, or 1Password Connect. Anything requiring live access — `pulumi preview`,
`task update`, `bao` commands, `op-to-bao --apply` — has to run somewhere with network
reach. That is why several steps above are written as "run this and paste the output"
rather than being already done.
