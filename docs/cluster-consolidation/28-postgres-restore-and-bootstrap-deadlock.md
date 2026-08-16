# 28 — Restoring CNPG postgres, and the OpenBao bootstrap deadlock

New, 2026-08-13. **Unfiled** — standalone, like [24](24-power-states.md),
[25](25-unseal-key-scope.md), [26](26-bootstrap-apps-to-pulumi.md) and
[27](27-migration-churn-failure-modes.md).

Written from an actual restore performed on 2026-08-13, not from theory.
Everything below was executed live and the failures are real ones that were
hit, not anticipated ones.

## What happened

At **21:40Z** a Helm uninstall of `external-secrets` deleted its own CRDs
(the failure class in [26](26-bootstrap-apps-to-pulumi.md)), and the cascade
took the `database/postgres` CNPG `Cluster` CR **and its PVCs** with it. Only
`valkey`'s PVC survived in that namespace. `kube-system/openbao` was
separately uninstalled in the same window (`Helm uninstall succeeded for
release kube-system/openbao.v9`).

**The data survived.** CNPG archives via the barman-cloud plugin to Minio —
object storage, entirely independent of the PVC lifecycle. The
`ObjectStore/postgres-backups` CR also survived, and its status is the
authoritative proof of restorability:

```console
kubectl get objectstores.barmancloud.cnpg.io -n database postgres-backups \
  -o jsonpath='{.status.serverRecoveryWindow}'
# firstRecoverabilityPoint: 2026-08-03T16:01:09Z
# lastSuccessfulBackupTime: 2026-08-13T16:01:43Z
```

**Check that field first in any future incident.** It answers "is this
recoverable" in one command, and it survives the loss of the Cluster CR.
The absence of `Backup`/`ScheduledBackup` CRs is *not* evidence of a problem:
those are created by the Cluster CR and die with it.

## Two things were wrong with the restore path before it could be used

### 1. The `recovery:` block pointed at the wrong place, by the wrong mechanism

It read `method: object_store`, bucket `<db>-restore`, path `/`,
`clusterName: "restore"`. Backups actually go to `cnpg-<cluster>` at
`/barman/<cluster>` — a bucket nothing had ever written to, via the
deprecated in-core `barmanObjectStore` path rather than the plugin the
backups have used since chart 0.8.x. The chart routes the two through
entirely different templates (`_external_clusters.tpl`:
`objectStoreRecoveryCluster` vs `pluginRecoveryCluster`), so this would not
have worked even with the bucket corrected.

Fixed in this piece's companion commit: `method: plugin`,
`clusterName: "postgres"` (the serverName the archive is keyed by — read it
off `status.serverRecoveryWindow`, which is a map keyed by server name), and
the same bucket/path the backups block writes to.

### 2. The archive-collision trap — the one that actually blocks a restore

This is the important one, and it is not obvious.

`barman-cloud-check-wal-archive` runs before the restored cluster is allowed
to archive anything, and **requires an empty destination for the new
cluster's serverName**. The plugin defaults serverName to the cluster name,
`postgres` — which is the same lineage being recovered from. So the first
restore attempt died at:

```
Checking backup destination with barman-cloud-wal-archive  serverName=postgres
WAL archive check failed for server postgres: Expected empty archive
options: [--endpoint-url http://truenas... s3://cnpg-equestria/barman/equestria postgres]
```

It fails closed — the source archive is not corrupted — but the cluster
never becomes healthy.

**The obvious fix does not work.** Setting
`backups.pluginConfiguration.parameters.serverName` has no effect: chart
0.8.1 emits only `barmanObjectName` into `.spec.plugins[]` and silently drops
the rest of `parameters`. Verified against the rendered Cluster CR:

```console
kubectl get cluster -n database postgres -o jsonpath='{.spec.plugins}'
# [{"name":"barman-cloud...","isWALArchiver":true,
#   "parameters":{"barmanObjectName":"postgres-backups"}}]   <- no serverName
```

**What works: move the destination instead of the serverName.** Point
`backups.s3.path` at a fresh path for the restore:

```yaml
backups:
  s3:
    path: "/barman/${CLUSTER_CNAME}-<stamp>"   # fresh, empty -> check passes
recovery:
  s3:
    path: "/barman/${CLUSTER_CNAME}"           # the existing archive, read-only
```

The chart renders these into two separate ObjectStore CRs
(`postgres-backups` and `postgres-recovery`), so read and write genuinely
separate:

```console
postgres-backups   s3://cnpg-equestria/barman/equestria-20260813
postgres-recovery  s3://cnpg-equestria/barman/equestria
```

This is almost certainly what the old `-restore` bucket was working around —
the same collision, solved by separating read from write. Separating only the
*write* path is the cheaper half of that trick: no bucket copy needed.

### Result

Second attempt restored cleanly: recovery pod `Completed`, cluster reached
`3/3 Cluster in healthy state` in ~3 minutes, and every database came back —
`immich` 626 MB, `windmill` 104 MB, `romm` 59 MB, `freshrss`, `tandoor`,
`crowdsec`, `coder`, `grafana`, `n8n`, `pulsarr`, `pinepods`, `outline`,
`vikunja`, `openbao`, and the rest. A fresh backup
(`backup-20260813224535`) was taken to the new lineage immediately, so
archiving works on the new path.

## The bootstrap deadlock — NOT resolved, deliberately deferred

Restoring the database did **not** bring the estate back, because of a
circular dependency that outlives the data loss:

```
kustomization/database/postgres   wait: true, so it blocks on its own
                                  ExternalSecrets (postgres-values,
                                  postgres-backup-config)
        │                         ...which need ClusterSecretStore/openbao
        ▼
ClusterSecretStore/openbao        needs the openbao pods
        │
        ▼
kustomization/kube-system/openbao dependsOn database/postgres  ──┐
        ▲                                                        │
        └────────────────────────────────────────────────────────┘
```

`kube-system/external-secrets-stores` is caught in the same loop — it
health-checks `ClusterSecretStore/openbao`.

Note what is **not** the problem: OpenBao has everything it materially needs.
Its Postgres connection URL comes from `ClusterSecretStore/database` (a
`kubernetes` provider reading the `database` namespace directly, `Valid`
throughout, and deliberately never backed by OpenBao — see the comment block
in `kube-system/openbao/ks.yaml`), the `openbao-postgres` Secret is present,
`tailscale-services` is Ready so `bao-transit` is reachable, and its database
is restored. It is blocked purely by Flux dependency ordering that is
circular on itself.

**A live patch is not sufficient.** Removing the circular `dependsOn` with
`kubectl patch` does break the cycle, but `cluster-apps` reconciles the
Kustomization back from git within ~a minute — faster than OpenBao can
deploy — and the deadlock re-forms. Confirmed live.

Options, none taken yet:

- **Break it in git**, not live: a commit that drops `database/postgres` from
  OpenBao's `dependsOn`. The dependency is arguably wrong anyway — OpenBao
  needs the *database* reachable, which is `ClusterSecretStore/database` plus
  the `openbao-postgres` Secret, not the *Kustomization* being Ready. The
  Kustomization readiness is what drags the ExternalSecrets (and therefore
  OpenBao itself) into the loop.
- **Drop `wait: true`** on `database/postgres`, or narrow it to explicit
  `healthChecks` on the Cluster CR only. Today it waits on everything it
  applies, including ExternalSecrets that can never sync while OpenBao is
  down. This is probably the smaller and more correct change.
- **Suspend `cluster-apps`** for the duration of a manual break, then resume.
  Effective but heavy-handed, and easy to forget to undo.
- **Restore OpenBao from the alpha-site break-glass standby** instead
  (`vault/bootstrap/RUNBOOK.md` Scenario B) and point the store there
  temporarily. Note the caveat: `ClusterSecretStore/openbao` authenticates
  via Kubernetes auth (`role: eso-equestria`), so the standby must be able to
  reach equestria's API server to validate ServiceAccount tokens — verify
  `kubernetes_host` in the restored standby before committing to this path.

This is the OpenBao-shaped version of the bootstrap catch-22 that
[03](03-secrets-bootstrap-independence.md) already tracks, made concrete. It
should be resolved there rather than patched around next time.

## Manual state to unwind once OpenBao is back

Two Secrets in `database` were hand-created during the restore and are
annotated `driscoll.dev/provenance`. ESO should reclaim both once
`ClusterSecretStore/openbao` is Ready; verify rather than assume:

- `postgres-backup-s3-creds` — copied from `admin@sgc` (same Minio server,
  `truenas.driscoll.tech:9000`, same estate-shared credentials).
- `postgres-values` — hand-rendered with `mode: recovery` and the fresh
  archive path. **This one matters:** git says `mode: standalone`, so when
  ESO overwrites it the rendered values revert. That is correct and harmless
  (CNPG `bootstrap` only applies at cluster creation), but the fresh
  `backups.s3.path` reverts too — meaning the restored cluster would go back
  to archiving at `/barman/equestria`, which now collides again. **Land the
  new path in git before ESO reclaims the Secret**, or the next restore hits
  the same wall from the other direction.

## Cross-references

- [26-bootstrap-apps-to-pulumi.md](26-bootstrap-apps-to-pulumi.md) — the CRD
  cascade that destroyed the cluster in the first place
- [27-migration-churn-failure-modes.md](27-migration-churn-failure-modes.md) —
  sibling incidents from the same afternoon
- [03-secrets-bootstrap-independence.md](03-secrets-bootstrap-independence.md) —
  where the OpenBao bootstrap catch-22 belongs
- `vault/bootstrap/RUNBOOK.md` — Scenario B (break-glass standby), Scenario D
  (backup verification)
