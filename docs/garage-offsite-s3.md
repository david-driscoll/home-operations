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
own S3 endpoint. The in-cluster instances' backed-up buckets land HERE too —
the `garage-mirror` service below.

## What is where

| Path | What it is |
| --- | --- |
| `docker/_common/garage/` | The stack: node (`garage.toml`, ports 3900/3901/3903), `garage-webui` admin UI, `garage-sync` dump mirror, `garage-mirror` in-cluster-bucket mirror |
| `docker/alpha-site/garage/.ignore` | alpha-site runs no node — membership is exactly the three hosts |
| `stacks/system/garage.ts` | Pulumi: buckets + quotas, keys, OpenBao records, per-host credential-file delivery |
| `components/globals.ts` (`garageProvider`) | Admin API provider — `http://dockge-celestia.<tailnet>:3903` |
| `kubernetes/apps/database/postgres/app/` | The barman-cloud `backups:` block now targets this cluster |
| `kubernetes/apps/tailscale-system/services/Update.cs` | Port 3900 on the `dockge-celestia` egress Service |
| `stacks/unifi-network/acl-manager.ts` | `garage-mesh`, `garage-s3-backups`, `garage-admin` grants |
| `stacks/backups/index.ts` | The Gatus heartbeat groups for the sync + mirror loops |

Storage split per node, per the Garage real-world cookbook: LMDB metadata on
the SSD (`/opt/stacks-data/garage/meta`), block data on the ZFS array
(`/data/garage`). `metadata_auto_snapshot_interval = "6h"` is the local
metadata-corruption recovery path, and the reason this stack needs no backrest
plan (it is also in `BACKUP_OPT_OUT_STACKS` — its contents *are* backups,
already held three times).

**The 4T budget.** Each node declares a 4T share of its ZFS array
(`data_dir` capacity in `garage.toml`, matched by `-c 4T` in the layout
ceremony below). Garage treats capacity as a placement *weight*, not a stop,
so the hard enforcement is the per-bucket quotas `stacks/system` sets
(512 GiB cnpg, 128 GiB per dump bucket, 2 TiB mirror — summing well under the
share). Hitting a quota means retention broke, not that the estate grew; grow
all three knobs together, deliberately. A ZFS dataset quota on `/data/garage`
is a reasonable host-side belt on top; that lives on the Proxmox host, not in
this repo.

## The admin UI

`garage-webui` runs next to each node and is published the backrest way:
`https://garage.<cluster>.driscoll.tech` (traefik, LE) and
`https://garage-<host>.<tailnet>` (tailscale service), **both behind authentik
forward-auth** — the UI holds the admin token and its own login is disabled,
so the proxy is the login. The per-host tailscale hostname is deliberate: a
tailscale service name is tailnet-global and a shared `garage` name would
collide across the three site stacks.

## The in-cluster Garage mirror

The `garage-mirror` service (active on **celestia only** — the other nodes
idle) syncs `/data/staging/garage/` into the `garage-mirror` bucket every 6h.
That staging tree is the one backrest's pre-sync hooks already maintain for
every `GarageBucket` annotated `driscoll.dev/backup: "true"`, across **both**
in-cluster instances (garage-system's shared cluster and coder/forgejo-garage;
the scan is `stacks/applications/kubernetes-backups.ts`). Riding it means the
mirror inherits the estate's opt-in contract, exclusion rules, and freshness
(nightly) — and needs no credentials against the k8s clusters at all. The
service refuses to sync an empty staging tree: a mirror of nothing would be a
delete of everything.

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

Run this from a workstation, not from an agent session: step 1 needs an
OpenBao login, and the estate's SSH grant to `tag:dockge` is `action: "check"`,
so the first connection wants an interactive Tailscale re-auth. Everything
below is idempotent to re-run **except** the layout steps, which are one-shot
by design (the Pulumi provider deliberately does not manage layout).

**0. Precheck — the ZFS mount.** `init.sh` hard-fails the stack if `/data` is
missing, and 4T of capacity is about to be declared against it, so look before
deploying:

```bash
for h in celestia luna skystar; do
  echo "== $h"; ssh root@dockge-$h 'df -h /data | tail -1'
done
```

Every host must show a real `/data` filesystem with room to grow into. If one
is missing the mount, stop: its site stack (`addHostMount("/data")`) has not
run, and deploying garage there will crash-loop on `init.sh`.

**1. Mint the cluster identity** — before any deploy. The stack's `.env`
carries `ref+openbao://` references to both paths, and an unresolvable
reference fails the **entire** site run, not just this stack:

```bash
bao kv put secrets/docker/apps/garage/rpc-secret  password="$(openssl rand -hex 32)"
bao kv put secrets/docker/apps/garage/admin-token password="$(openssl rand -hex 32)"
```

The rpc secret IS the mesh membership credential — one value, all three nodes.
Losing it loses no data, but no node can rejoin its own cluster without it.

**2. Deploy the three sites** so the nodes come up. Order among them does not
matter. Preview first, per the estate rule for every stack:

```bash
cd stacks/home            && mise run vals-run pulumi preview && mise run vals-run pulumi up   # celestia
cd ../gulf-of-mexico      && mise run vals-run pulumi preview && mise run vals-run pulumi up   # luna
cd ../ocracoke            && mise run vals-run pulumi preview && mise run vals-run pulumi up   # skystar
```

Checkpoint — expected, correct, degraded state:

```bash
for h in celestia luna skystar; do
  echo "== $h"; ssh root@dockge-$h 'docker ps --format "{{.Names}} {{.Status}}" | grep garage'
done
```

`garage` and `garage-webui` healthy; `garage-sync` (and `garage-mirror` on
celestia) running but **unhealthy** — they are waiting on the credential files
step 4 delivers, and say so in their logs. `garage status` shows each node
alone. Nothing is wrong yet.

**3. Connect the mesh and apply the layout.** Capture the ids into shell
variables rather than copying hex by hand — `garage node id -q` prints
`<id>@<rpc_public_addr>`, which is exactly what `node connect` wants:

```bash
CELESTIA=$(ssh root@dockge-celestia 'docker exec garage /garage node id -q')
LUNA=$(ssh root@dockge-luna         'docker exec garage /garage node id -q')
SKYSTAR=$(ssh root@dockge-skystar   'docker exec garage /garage node id -q')
printf '%s\n' "$CELESTIA" "$LUNA" "$SKYSTAR"   # three distinct <id>@<tailnet-ip>:3901
```

Connect the other two to celestia, then confirm the mesh before touching the
layout:

```bash
ssh root@dockge-celestia "docker exec garage /garage node connect $LUNA"
ssh root@dockge-celestia "docker exec garage /garage node connect $SKYSTAR"
ssh root@dockge-celestia 'docker exec garage /garage status'
```

**Do not proceed until `status` lists all three nodes.** A layout assigned
against a partial mesh is the one thing here that is painful to undo.

```bash
# One zone per machine; with replication_factor 3 every node holds everything,
# so capacity only shapes *balance*. 4T matches the data_dir capacity declared
# in garage.toml — `layout assign` checks against it — and the per-bucket
# quotas are what actually enforce a ceiling (see "The 4T budget" above).
# ${VAR%%@*} strips the @address, leaving the bare node id `assign` expects.
ssh root@dockge-celestia "docker exec garage /garage layout assign ${CELESTIA%%@*} -z celestia -c 4T"
ssh root@dockge-celestia "docker exec garage /garage layout assign ${LUNA%%@*}     -z luna     -c 4T"
ssh root@dockge-celestia "docker exec garage /garage layout assign ${SKYSTAR%%@*}  -z skystar  -c 4T"

ssh root@dockge-celestia 'docker exec garage /garage layout show'
```

`layout show` prints the version the pending change will become — pass **that**
number, which is `1` on a fresh cluster:

```bash
ssh root@dockge-celestia 'docker exec garage /garage layout apply --version 1'
ssh root@dockge-celestia 'docker exec garage /garage status'
```

Peer addresses persist in the metadata dir; `node connect` is not needed again.

**4. Create buckets and keys, and deliver credentials** — a run of the
`system` stack, which owns the garage module (`stacks/system/garage.ts`):

```bash
cd stacks/system && mise run vals-run pulumi preview && mise run vals-run pulumi up
```

This creates `cnpg-equestria`, `postgres-{celestia,luna,skystar}` and
`garage-mirror` (each with a quota and one rw key), records them in OpenBao
(`clusters/equestria/apps/postgres/garage-backup`,
`clusters/<key>/apps/postgres/garage`, `clusters/celestia/apps/garage/mirror`),
and writes each node's `/opt/stacks-data/garage/rclone.env` plus celestia's
`mirror.env`. The loops pick the files up on their next cycle — no restart.

Checkpoint — within one cycle the sync containers should go healthy:

```bash
for h in celestia luna skystar; do
  echo "== $h"; ssh root@dockge-$h 'cat /opt/stacks-data/garage/sync-state/.last-run 2>/dev/null || echo "no cycle yet"'
done
```

**5. Only now, cut equestria over.** This is a separate PR and it must not be
merged before step 4 has run — that ordering is not a nicety. The
`garage-backup` extract makes the `${APP}-values` ExternalSecret fail as a
whole while the path is absent; the postgres Kustomization sets `wait: true`;
and 23 Kustomizations `dependsOn` it. Merging early froze the estate's
reconciliation for 50 minutes on 2026-08-27 (#1233, reverted by #1235) while
postgres itself stayed perfectly healthy — which is exactly what made it easy
to talk myself into. Re-land both halves together:

- the `garage-backup` extract in `app/externalsecret.yaml`
- the `backups:` block in `app/resources/values.yaml` flipped to `garage_*`

Then, immediately — the Garage archive holds WAL with no base to replay onto
until a base backup lands, so do not wait for the 16:00 UTC schedule:

```bash
kubectl cnpg backup postgres --method plugin -n database
# fully-qualified on purpose: bare `kubectl get backup` resolves to LONGHORN's CRD
kubectl -n database get backups.postgresql.cnpg.io --sort-by=.metadata.creationTimestamp | tail -3
kubectl cnpg status postgres -n database | grep -iE 'archiving|backup'
```

**The `recovery:` block is dead configuration under `mode: standalone`** — the
chart renders only the `postgres-backups` ObjectStore (confirm with
`helm get hooks postgres -n database`), so editing `recovery:` changes nothing
live and there is no post-flip action to take there. It is rendered from
whatever the values say at the moment someone sets `mode: recovery`, which is
the moment it starts mattering. See the note in the Restore section.

## Restore notes

- **equestria, cluster gone**: set `mode: recovery` and make sure the
  `recovery:` block names the store you actually want *at that moment* —
  garage after the cutover, minio for pre-flip history. PITR window is the 30d
  `retentionPolicy`, enforced by the plugin against the *active* store only.

  **Know how that block behaves before you rely on it.** Both ObjectStores are
  Helm *hooks* (`helm.sh/hook: pre-install,pre-upgrade,pre-rollback`), and the
  chart renders only `postgres-backups` under `mode: standalone` — verified
  with `helm get hooks postgres -n database`. So the `recovery:` block is inert
  in steady state: edits to it change nothing live, and it takes effect only on
  the upgrade that flips `mode`. A `postgres-recovery` ObjectStore may still be
  sitting in the namespace from an earlier restore (one has been there since
  2026-08-13, frozen at `s3://cnpg-equestria/barman/equestria`, two prefixes
  stale). It is an orphan, not configuration — nothing reads it, and Helm's
  default `hook-delete-policy: before-hook-creation` should replace it when the
  mode flips. Confirm that in a restore drill rather than trusting it on the
  day: check the live CR's `destinationPath` after the flip, before starting a
  restore against it.
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
  `stacks/system` later; hand-deleted ones break consumers it thinks are fed.
  The webui makes hand-creating them one click — resist it.
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
