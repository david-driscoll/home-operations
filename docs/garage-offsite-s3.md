# Garage offsite S3 — the geo-replicated postgres backup store

A three-node [Garage](https://garagehq.deuxfleurs.fr) cluster on the
**celestia**, **luna** and **skystar** dockge hosts, meshed over the tailnet,
`replication_factor 3` — every object exists on all three machines, across two
sites. It exists to hold postgres backups and nothing else:

- **equestria CNPG** — the barman-cloud plugin's WAL archive + base backups
  (`cnpg-equestria` bucket). This is the cluster's *physical* backup set; the
  nightly pg_dump CronJob (`kubernetes/apps/database/postgres/backups`) is the
  independent *logical* set and is untouched by any of this.
- **dockge postgres instances** — each node's `garage-sync` service mirrors its
  local pg_dump output into `postgres-<cluster>` through its **own** node's S3
  API, and Garage's replication carries the bytes across sites.

This is a distinct system from `kubernetes/apps/garage-system` (the in-cluster
Garage on equestria, operator-managed). That one lives *inside* the cluster it
would be needed to repair, which is why CNPG backups were never allowed to move
there; this one is outside every failure domain it protects except celestia's
own S3 endpoint.

## What is where

| Path | What it is |
| --- | --- |
| `docker/_common/garage/` | The stack: node (`garage.toml`, ports 3900/3901/3903), `garage-sync` dump mirror |
| `docker/alpha-site/garage/.ignore` | alpha-site runs no node — membership is exactly the three hosts |
| `stacks/garage/` | Pulumi: buckets, keys, OpenBao records, per-host `rclone.env` delivery |
| `components/globals.ts` (`garageProvider`) | Admin API provider — `http://dockge-celestia.<tailnet>:3903` |
| `kubernetes/apps/database/postgres/app/` | The barman-cloud `backups:` block now targets this cluster |
| `kubernetes/apps/tailscale-system/services/Update.cs` | Port 3900 on the `dockge-celestia` egress Service |
| `stacks/unifi-network/acl-manager.ts` | `garage-mesh`, `garage-s3-backups`, `garage-admin` grants |
| `stacks/backups/index.ts` | "Dockge Garage Postgres Sync" Gatus heartbeat group |

Storage split per node, per the Garage real-world cookbook: LMDB metadata on
the SSD (`/opt/stacks-data/garage/meta`), block data on the ZFS array
(`/data/garage`). `metadata_auto_snapshot_interval = "6h"` is the local
metadata-corruption recovery path, and the reason this stack needs no backrest
plan (it is also in `BACKUP_OPT_OUT_STACKS` — its contents *are* backups,
already held three times).

## One barman store per cluster — why the minio flip

The barman-cloud plugin serves exactly **one** backup/archive object store per
CNPG cluster: the sidecar resolves the store from the Cluster's own plugin
configuration, and a `ScheduledBackup` carrying a different `barmanObjectName`
parameter is silently ignored ([cloudnative-pg#7778](https://github.com/cloudnative-pg/cloudnative-pg/issues/7778),
confirmed against `plugin-barman-cloud` `internal/cnpgi/instance/backup.go`).
So "add a second ObjectStore" is not a thing that can work today — the Garage
store *replaces* minio as the plugin target, and the minio archive freezes as
readable history behind the (still-minio) `recovery:` block until the first
Garage base backup is verified.

## Bootstrap ceremony — one time, in this order

Everything below is idempotent to re-run except the layout steps, which are
one-shot by design (the Pulumi provider deliberately does not manage layout).

**1. Mint the cluster identity** (before any deploy; the stack's `.env`
references fail the whole site run if these paths are missing):

```bash
bao kv put secrets/docker/apps/garage/rpc-secret  password="$(openssl rand -hex 32)"
bao kv put secrets/docker/apps/garage/admin-token password="$(openssl rand -hex 32)"
```

The rpc secret IS the mesh membership credential — one value, all three nodes.
Losing it loses no data, but no node can rejoin its own cluster without it.

**2. Deploy the three sites** so the nodes come up (order among them does not
matter):

```bash
cd stacks/home && mise run vals-run pulumi up          # celestia
cd stacks/gulf-of-mexico && mise run vals-run pulumi up # luna
cd stacks/ocracoke && mise run vals-run pulumi up       # skystar
```

Expected degraded state at this point: every `garage-sync` container is
running with a red heartbeat ("rclone.env does not exist"), and `garage
status` on any node shows only itself.

**3. Connect the mesh and apply the layout** (from any one node; celestia
shown). Get each node's id first — `garage node id` **on that node** prints
`<id>@<rpc_public_addr>`:

```bash
ssh root@dockge-celestia "docker exec garage /garage node id -q"
ssh root@dockge-luna     "docker exec garage /garage node id -q"
ssh root@dockge-skystar  "docker exec garage /garage node id -q"

# then, on celestia:
docker exec garage /garage node connect <luna-id>@<luna-tailnet-ip>:3901
docker exec garage /garage node connect <skystar-id>@<skystar-tailnet-ip>:3901

# one zone per machine; with replication_factor 3 every node holds everything,
# so capacity only shapes *balance* — size it to the /data space you are
# willing to give Garage on each host, and remember it can grow but the
# usable total is bounded by the smallest node.
docker exec garage /garage layout assign <celestia-id> -z celestia -c 500G
docker exec garage /garage layout assign <luna-id>     -z luna     -c 500G
docker exec garage /garage layout assign <skystar-id>  -z skystar  -c 500G

docker exec garage /garage layout show
docker exec garage /garage layout apply --version 1
```

Peer addresses persist in the metadata dir; `node connect` is not needed again.

**4. Create buckets and keys, and deliver credentials:**

```bash
cd stacks/garage
pulumi stack init garage   # first time only
mise run vals-run pulumi up
```

This creates `cnpg-equestria` + `postgres-{celestia,luna,skystar}` with one
rw key each, records them in OpenBao
(`clusters/equestria/apps/postgres/garage-backup`,
`clusters/<key>/apps/postgres/garage`), and writes each node's
`/opt/stacks-data/garage/rclone.env`. The sync loops pick the file up on their
next cycle — no restart — and their heartbeats go green.

**5. Cut equestria over.** Merging the `kubernetes/apps/database/postgres`
half of this change is safe in any order relative to steps 1–4: until the
`garage-backup` path exists, the `${APP}-values` ExternalSecret stops
refreshing and the cluster keeps archiving to minio (degraded, not
destructive). Once ESO picks up the Garage values:

```bash
# The flip leaves the Garage archive base-less until this succeeds — take it
# immediately, do not wait for the 16:00 UTC schedule:
kubectl cnpg backup postgres --method plugin -n database
# note the fully-qualified resource: bare `kubectl get backup` resolves to
# LONGHORN's Backup CRD, not CNPG's
kubectl -n database get backups.postgresql.cnpg.io --sort-by=.metadata.creationTimestamp | tail -3
```

Verify WAL archiving is flowing (`kubectl cnpg status postgres -n database`
shows the archive as healthy), then **repoint the `recovery:` block in
`app/resources/values.yaml` at the garage_* values** — until you do, a rebuild
restores from the frozen minio archive, which stops being current at the flip.

## Restore notes

- **equestria, cluster gone**: `mode: recovery` with the recovery ObjectStore —
  garage once repointed, minio for pre-flip history. PITR window is the 30d
  `retentionPolicy`, enforced by the plugin against the *active* store only.
- **a dockge database**: the bucket mirror is the same artifact set as the
  host's `dumps/` — `rclone copy garage:postgres-<cluster>/dumps ...` from any
  surviving node (all three hold it), then `pg_restore` per database plus the
  `globals-*.sql` roles dump. The restic/PBS chain remains the deeper-history
  path; the bucket holds the host's 14-day window.
- **celestia down** ≠ data loss: luna+skystar still hold quorum. It does mean
  equestria's backups fail (the egress endpoint is celestia) — that is an
  accepted single-endpoint limitation; the fix in an extended outage is
  pointing the endpoint at another node's egress Service.

## Gotchas

- **`replication_factor` and `s3_region` are effectively immutable** — layout
  rebuild and SigV4 invalidation respectively, same as the in-cluster Garage.
- **Buckets and keys are Pulumi state.** Hand-created ones collide with
  `stacks/garage` later; hand-deleted ones break consumers it thinks are fed.
- **Do not add this stack to backrest.** `BACKUP_OPT_OUT_STACKS` documents why;
  restating it here because the symptom of forgetting is silent triple-storage
  of the estate's largest dataset, not an error.
- **Garage majors are not image bumps** — they carry on-disk migrations with
  their own upgrade procedure; minors are rolling-safe. Renovate proposes both;
  read the release notes on majors.
- The Admin API (3903) is HTTP-with-bearer-token over the tailnet, admin-gated
  by ACL. Do not publish it through traefik.

## Monitoring

- Gatus: per-host `garage-s3`/`garage-rpc` TCP checks (stack definition) and
  the "Dockge Garage Postgres Sync" heartbeat group (dead-man's-switch on the
  mirror, 13h window).
- CNPG: the chart's PrometheusRules cover failed archiving/backups on the
  equestria side, unchanged by the flip.
- Not yet wired: Garage's own metrics (admin API `/metrics`) into the per-host
  prometheus stacks. Worth doing when object counts grow.
