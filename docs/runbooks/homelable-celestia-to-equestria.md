# Homelable: celestia → equestria cutover

Moves the network topology map from the Docker stack on celestia
(`docker/celestia/homelable`, retired in the same commit as this file) to
Kubernetes on equestria (`kubernetes/apps/equestria/home/homelable`).

**This is a real data migration, not a re-create.** The SQLite database at
`/opt/stacks-data/homelable/homelab.db` *is* the hand-curated canvas — node
positions, labels, groupings, manual links — and none of it is reproducible from
git or from a rescan. `scan_config.json` beside it holds the persisted scanner
overrides, which take precedence over the `SCANNER_*` environment defaults. Both
have to be copied into the new PVC before the pod first starts, and
[step 4](#4-copy-the-database-into-the-new-pvc) is timed to make that window
exist rather than to race it.

Public hostnames do not change. `celestia` and `equestria` share one root
domain, so `homelable.driscoll.tech`, `homelable.<tailnet>` and
`homelable-mcp.<tailnet>` are the same names before and after — only what
answers on them moves. That is why the OIDC redirect URIs, the Gatus checks and
the dashboard widget need no hostname edits.

## What the manifests already do

Anything not listed under [Manual steps](#manual-steps) is declarative and lands
with the merge:

- **All three containers, in one pod.** frontend (nginx), backend (uvicorn) and
  mcp (uvicorn), pinned to the same `3.3.5` digests celestia ran. The frontend
  image bakes `proxy_pass http://backend:8000` into its nginx config with no
  `resolver` directive, so the pod carries a `hostAliases` entry mapping
  `backend` to `127.0.0.1`. The alternatives were a Service literally named
  `backend` in a namespace shared with ~18 other apps, or forking upstream's
  nginx config into a ConfigMap that Renovate would then silently outdate — the
  reasoning is written out in `helmrelease.yaml` at `defaultPodOptions`.
- **Only two of the three are reachable.** `homelable` (port 80) and
  `homelable-mcp` (port 8001) get Services; the backend gets none, exactly as it
  had no Traefik labels and no published ports on celestia.
- **Auth** — native OIDC (`AUTH_MODE=oidc`) against authentik, so the internal
  route carries `local-user` (network gate) and not the authentik outpost hop.
  `definition.yaml` is what mints the authentik provider and the
  `homelable-oidc-credentials` Secret; see [step 3](#3-run-the-pulumi-applications-stack).
- **Live-view containment** — `/view` and `/api/v1/liveview` are blocked on the
  LAN-facing hostname and served only over the tailnet, carried over from the
  celestia Traefik router. In Kubernetes it is an HTTPRoute rule plus the
  `homelable-liveview-block` middleware; Gateway API's own longest-path
  precedence replaces the `priority: 1000` the Traefik rule needed.
  `/api/v1/liveview/config` stays reachable (it is OIDC-session-guarded and is
  what the UI reads to build a share link), which is why the two liveview
  matches are `Exact` rather than `PathPrefix`.
- **MCP on the tailnet only** — `ingressroute-mcp.yaml` plus the nested
  Kustomization in `mcp-tailnet-ks.yaml`, because `components/tailscale` emits
  one hostname per app and is already spending it on the UI. There is
  deliberately no HTTPRoute for the MCP server: its only credential is a static
  `X-API-Key`, so the boundary has to be network-level.
- **Scanner capability** — `NET_RAW` added back on top of a `drop: ALL`. Note
  this is a real grant in Kubernetes, unlike on Docker where the upstream
  compose's `cap_add: NET_RAW` was a no-op against the default capability set.
- **Backups** — `components/volsync` gives the data volume a nightly restic
  `ReplicationSource`, replacing the celestia backrest plan that existed only
  because the compose file mentioned `stacks-data`. `VOLSYNC_PUID`/`PGID` are
  pinned to `0` because all three upstream images run as root (verified against
  the registry — `.config.User` is null on each), so the mover reads the data as
  the same uid that wrote it.
- **Renovate** — the three images are grouped as `Homelable` in
  `.github/renovate.json5`. They are built and tagged together from one upstream
  release and share a pod, so a bump landing on one and not the others is a
  mixed-version deployment; grouping makes that impossible rather than relying
  on three PRs being merged at once.
- **Dashboard** — the stats widget's fetch moves to a new `HOMELABLE_API_URL`
  pointing at `http://homelable.equestria.svc.cluster.local:80`, now that the two
  are in the same cluster. `HOMELABLE_URL` stays the public name because it is
  the widget's `title-url` and a browser follows it.

## Things that genuinely change

- **Nightly Low Power shed.** `equestria` is the shed-list namespace, so the app
  is scaled to 0 between 02:00 and 09:00 and the scanner does not run in that
  window. That was not true on the Dockge host. The Gatus checks carry a
  matching maintenance window; the disagreement-rate comparison against Gatus
  that `STATUS_CHECKER_INTERVAL` exists to support now has a seven-hour hole in
  it every night.
- **No MagicDNS resolver.** The compose set `dns: 100.100.100.100` on all three
  containers; the pod uses cluster DNS. The scanner targets IP ranges rather
  than tailnet names and OIDC discovery is on `driscoll.tech`, so nothing known
  depends on this — but reverse lookups of `100.64.0.0/10` addresses will now
  fail where they previously resolved.
- **A different source address for the scan.** Probes leave SNATed to an
  equestria node's `10.10.206.x` address, not celestia's LXC address. See
  [step 7](#7-verify-the-scanner-actually-reaches-the-target-vlans).

## Manual steps

Run them in this order. Steps 1–5 are the cutover; 6–8 close it out.

### 1. Snapshot the celestia data and stop the stack

```bash
ssh dockge-celestia 'cd /opt/stacks/homelable && docker compose down'
```

```bash
ssh dockge-celestia 'tar -C /opt/stacks-data -czf /tmp/homelable-data.tgz homelable' && scp dockge-celestia:/tmp/homelable-data.tgz .
```

Stopping first matters: SQLite copied out from under a running writer can carry
a hot WAL. With the stack down, `homelab.db` is quiescent.

Keep this tarball until the soak in [step 8](#8-soak-then-clean-up) clears. It is
the only rollback path — the celestia stack directory is deleted by this commit,
so there is nothing to scale back up.

### 2. Copy the OpenBao item — DONE 2026-09-05

Already run, against the live cluster:

```bash
mise run vals-run -- npx tsx scripts/bao-move.ts clusters/celestia/apps/homelable/keys clusters/equestria/apps/homelable/keys --apply
```

`secrets/clusters/equestria/apps/homelable/keys` is at v1 with all five fields
(`secret_key`, `live_view_key`, `homepage_api_key`, `mcp_api_key`,
`mcp_service_key`) — re-running the script without `--apply` reports `SAME`,
which is the destination read back and canonically compared against the source.
`eso-equestria` already reads its own `clusters/equestria/*` prefix, so no policy
change was needed.

**Copy, not `--move`.** The celestia path is deliberately still populated, which
is the script's own documented advice: a path is a contract with `vals`
templates, ExternalSecrets and `BaoStore` call sites, so cut consumers over
first and delete the source in a second pass. Here that pass is
[step 8](#8-soak-then-clean-up). It also means this step could safely run before
the merge — which matters, because ESO fails the *whole* ExternalSecret on one
missing `extract` path, and two of them read this item: homelable's own
`homelable-env`, and `dashboard/externalsecret.yaml`. Merging against a
half-done move would have taken the dashboard down along with homelable.

No consumer still resolves the celestia path — both ExternalSecrets are updated
in this commit. Verify that stays true before step 8:

```bash
rg -n 'clusters/celestia/apps/homelable' --glob '!docs/**'
```

One hit is expected and is not a consumer: the provenance comment in
`homelable/externalsecret.yaml`.

`scripts/bao-reorg/plan.ts` no longer appears — its `shared/homelable` entry was
retargeted at `clusters/equestria/apps/homelable/keys` in the same commit. That
file is a spec a replay would execute, not a log: nothing reads `to` except as a
replacement string, `rewrite.ts` matches on `from` only, so the edit is inert
today and only matters in the one case that could still run it — a from-scratch
replay against a restored pre-reorg OpenBao, where the old destination would
strand the secret somewhere no consumer looks. The two-hop history is in the
comment above the entry, and `docs/openbao-shared-secrets-reorg.md` carries a
dated correction under the row it signed off; that table itself is left alone,
because its `✎ Your call` column is a decision record.

### 3. Run the Pulumi applications stack

```bash
cd stacks/applications && pulumi preview
```

It reads `ApplicationDefinition` CRs out of the cluster, so the merge has to land
first. The run retires the celestia authentik application and creates the
equestria one, writing `homelable-oidc-credentials` into the `equestria`
namespace where `homelable-env` extracts it.

Until this runs, `homelable-env` cannot resolve and the pod sits in
`CreateContainerConfigError` — which is the window step 4 uses.

### 4. Copy the database into the new PVC

With the pod unable to start, the PVC is bound and empty and nothing can
initialise a fresh `homelab.db` on top of the restore. Confirm that first:

```bash
kubectl -n equestria get pvc homelable && kubectl -n equestria get pods -l app.kubernetes.io/name=homelable
```

Then mount the claim from a scratch pod and unpack the tarball from step 1 into
it, writing as uid 0 to match `VOLSYNC_PUID`. `homelab.db` and
`scan_config.json` both belong at the root of the volume — the backend mounts it
at `/app/data` and `SQLITE_PATH` is `/app/data/homelab.db`.

### 5. Let it start, and check the whole chain

Once step 3's Secret exists, reloader restarts the pod. Verify in this order —
each check covers a hop the previous one does not:

```bash
kubectl -n equestria logs -l app.kubernetes.io/name=homelable -c backend --tail=50
```

- `https://homelable.driscoll.tech/api/v1/health` returns `{"status":"ok"}` —
  proves frontend → nginx → `backend:8000` through the hostAliases entry.
- The canvas shows the migrated nodes, not an empty map — proves step 4.
- `https://homelable.driscoll.tech/view` returns **not 200** — proves the
  live-view block. This is the Gatus "Live View Blocked" check; if it returns
  200, the HTTPRoute rule lost its precedence and the key is being written to
  Traefik's access log on every successful load.
- `https://homelable.<tailnet>/view?key=...` **does** load — proves the block is
  scoped to the LAN hostname and did not take live view out entirely.
- `https://homelable-mcp.<tailnet>/mcp` answers with an `X-API-Key` header, and
  `homelable-mcp.driscoll.tech` does **not** resolve to anything serving it.

### 6. Run the Pulumi home stack to release the DNS name

```bash
cd stacks/home && pulumi preview
```

The stack generates one `StandardDns` CNAME per Traefik `Host()` rule it finds in
a compose file. With `docker/celestia/homelable` deleted, this run destroys
`homelable.driscoll.tech → dockge-celestia.driscoll.tech`.

**Order matters and this cannot be done first.** external-dns on equestria runs
`policy: sync` with a TXT registry: it will not take over a record it does not
own, so it can only create `homelable.driscoll.tech` once Pulumi has removed the
celestia CNAME. Expect a short gap between the two — external-dns picks it up on
its next loop.

### 7. Verify the scanner actually reaches the target VLANs

The scan now originates from an equestria node's `10.10.206.x` address instead
of celestia's. Any UniFi inter-VLAN rule written against the *source* address
rather than a broad `10.10.0.0/16` will silently drop the sweep, and the symptom
is indistinguishable from "those hosts are down" — the map fills with offline
nodes and nothing errors.

Trigger a scan of `192.168.100.0/24` (IoT) and `10.1.0.0/24` (Guest) from the UI
and confirm the online counts match what celestia last recorded. Guest is very
likely to return nothing regardless, because of client isolation — that is
expected and was true before the move.

### 8. Soak, then clean up

- **Backrest on celestia** keeps the now-orphaned `homelable` plan: the
  generator in `components/dockerStackBackups.ts` discovers plans from compose
  files, but backrest's config is merged rather than pruned, so a plan whose
  stack no longer exists is not removed by a Pulumi run. Delete it by hand once
  the tarball from step 1 is no longer the rollback path.
- **`/opt/stacks-data/homelable/` on celestia** stays until the same point.
- **The celestia OpenBao path** is still populated — step 2 copied rather than
  moved. Once the soak clears, destroy it, which is the same script with the
  same arguments plus `--move`: it re-verifies the destination before deleting
  anything, and reports `SAME` on the copy it already made.

  ```bash
  mise run vals-run -- npx tsx scripts/bao-move.ts clusters/celestia/apps/homelable/keys clusters/equestria/apps/homelable/keys --move --apply
  ```
- **The first VolSync run** is the real exit gate. Confirm
  `ReplicationSource/homelable-src` has a `lastSyncTime` and that the snapshot
  contains the migrated `homelab.db` — until that lands, the canvas exists in
  exactly one place.
