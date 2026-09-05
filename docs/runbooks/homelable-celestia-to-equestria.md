# Homelable: celestia → equestria cutover

Moves the network topology map from the Docker stack on celestia
(`docker/celestia/homelable`, retired in the same commit as this file) to
Kubernetes on equestria (`kubernetes/apps/equestria/home/homelable`).

**This is a re-create, not a data migration** — David's call, 2026-09-05: the
celestia canvas holds little enough that starting fresh is cheaper than moving
it. Nothing is exported and nothing is imported. The new instance discovers the
network on its first scan and the canvas is re-curated by hand from there.

Two consequences worth stating, because both were the other way round in the
first draft of this file:

- **The `SCANNER_*` values in `helmrelease.yaml` are live first-run config, not
  inert defaults.** They only lose to `scan_config.json`, and on a fresh volume
  that file does not exist yet — so what is in git is what the first scan
  actually uses. Read them before the first start, not after.
- **The empty-PVC window stops being load-bearing.** The pod still cannot start
  until the OIDC Secret exists, but nothing has to be smuggled in during that
  gap any more.

If the canvas stops being cheap to rebuild before this runs — someone spends an
afternoon laying it out — stop and plan a real data move instead: `homelab.db`
is not reproducible from git or from a rescan, and it would have to be copied
into the PVC before the pod first writes to it.

Public hostnames do not change, with one deliberate exception.
`celestia` and `equestria` share one root domain, so `homelable.driscoll.tech`
and `homelable.<tailnet>` are the same names before and after — only what
answers on them moves. That is why the OIDC redirect URIs, the Gatus checks and
the dashboard widget need no hostname edits.

**`homelable-mcp.<tailnet>` goes away and is not replaced.** The MCP surface
moves into ToolHive's `agent-tools` group, so clients reach it through the
VirtualMCPServer's one hostname and one OIDC surface instead of a bespoke
tailnet host whose only credential was a static `X-API-Key`. Any MCP client
config pointing at `https://homelable-mcp.<tailnet>/mcp` has to be repointed —
see [step 4](#4-let-it-start-and-check-the-whole-chain).

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
- **MCP through ToolHive** — `kubernetes/apps/agents/agent-tools-servers/homelable.yaml`
  adds an `MCPRemoteProxy` to the `agent-tools` group, dialling the
  `homelable-mcp` Service over the cluster network, plus an
  `MCPExternalAuthConfig` of type `headerInjection` that supplies the
  `X-API-Key` the server demands. The mcp CONTAINER stays in homelable's pod:
  it reaches the backend with a header that bypasses OIDC by design, and that
  is a loopback hop only while the two are siblings. Running the image in
  `agents` instead would mean giving the backend a ClusterIP — turning a
  pod-private, OIDC-bypassing API into a cluster-wide one. Only the
  client-facing surface moved.
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
  [step 6](#6-verify-the-scanner-actually-reaches-the-target-vlans). This is the
  one change with real teeth now that there is no data to compare against: a
  dropped sweep and a genuinely quiet VLAN both render as an empty canvas.

## Manual steps

Run them in this order. Steps 1–4 are the cutover; 5–7 close it out.

### 1. Stop the celestia stack

```bash
ssh dockge-celestia 'cd /opt/stacks/homelable && docker compose down'
```

Stop rather than delete. Both instances answering on the same hostname is the
one state to avoid, and until [step 5](#5-run-the-pulumi-home-stack-to-release-the-dns-name)
runs, `homelable.driscoll.tech` still resolves to this host.

Take the data tarball anyway — it costs one command and this is the only moment
it is available, since the stack directory is deleted by this commit and there
is nothing to scale back up:

```bash
ssh dockge-celestia 'tar -C /opt/stacks-data -czf /tmp/homelable-data.tgz homelable' && scp dockge-celestia:/tmp/homelable-data.tgz .
```

Nothing in this runbook restores it. It is there so that "start fresh" stays a
decision rather than becoming irreversible the moment the stack comes down —
`docker compose down` with the volume still on disk is recoverable; a wiped LXC
is not. Discard it at [step 7](#7-soak-then-clean-up).

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
[step 7](#7-soak-then-clean-up). It also means this step could safely run before
the merge — which matters, because ESO fails the *whole* ExternalSecret on one
missing `extract` path, and two of them read this item: homelable's own
`homelable-env`, and `dashboard/externalsecret.yaml`. Merging against a
half-done move would have taken the dashboard down along with homelable.

No consumer still resolves the celestia path — both ExternalSecrets are updated
in this commit. Verify that stays true before step 8:

```bash
rg -n 'clusters/celestia/apps/homelable' --glob '!docs/**'
```

Two hits are expected and neither is a consumer — both are prose. One is the
provenance comment in `homelable/externalsecret.yaml`. The other is the comment
above `scripts/bao-reorg/plan.ts`'s `shared/homelable` entry, whose `to:` was
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

**Do not let this sit. It is not a passive wait — there is a clock on it.**

Until this runs, `homelable-env` cannot resolve, the pod sits in
`CreateContainerConfigError`, and the HelmRelease's `install` never goes
healthy. That trips its own remediation:

```
Released=False   InstallFailed: timeout waiting for:
                 [Deployment/equestria/homelable status: 'InProgress']
Remediated=True  UninstallSucceeded: Helm uninstall remediation ... succeeded
```

`timeout: 10m` and `install.remediation.retries: 7` means it uninstalls and
reinstalls every ten minutes, about seven times, and then **stalls** — after
which the Pulumi run alone will not revive it. Nothing is lost when it does
(the PVC is `existingClaim`, created by `components/volsync`, so Helm never
owns it and the uninstall does not touch it), but the release needs a nudge:

```bash
flux -n equestria reconcile helmrelease homelable --reset --with-source
```

`--reset` is the part that matters: it clears the failure counters, without
which the stalled release will not attempt another install.

Observed on the first rollout — one `InstallFailed`/`UninstallSucceeded` cycle
inside the first ten minutes. The earlier draft of this file called this gap
"just a wait", which was wrong.

### 4. Let it start, and check the whole chain

Once step 3's Secret exists, reloader restarts the pod and the backend
initialises an empty `homelab.db` on the fresh PVC. Verify in this order — each
check covers a hop the previous one does not:

```bash
kubectl -n equestria logs -l app.kubernetes.io/name=homelable -c backend --tail=50
```

- `https://homelable.driscoll.tech/api/v1/health` returns `{"status":"ok"}` —
  proves frontend → nginx → `backend:8000` through the hostAliases entry.
- The canvas loads empty, then fills after the first scan. An empty map is the
  expected starting state here, not a failure — see the re-create note at the
  top. What is worth checking instead is that the scan ran at all, which
  [step 6](#6-verify-the-scanner-actually-reaches-the-target-vlans) covers.
- `https://homelable.driscoll.tech/view` returns **not 200** — proves the
  live-view block. This is the Gatus "Live View Blocked" check; if it returns
  200, the HTTPRoute rule lost its precedence and the key is being written to
  Traefik's access log on every successful load.
- `https://homelable.<tailnet>/view?key=...` **does** load — proves the block is
  scoped to the LAN hostname and did not take live view out entirely.
- `kubectl -n agents get mcpremoteproxy toolhive-homelable` reports `Ready`,
  and homelable's tools appear through the `agent-tools` VirtualMCPServer.
  Two distinct failures, which look nothing alike:
  - **`phase: Failed`, never serves at all** — read
    `status.conditions[ConfigurationValid].message`. If it names a "blocked
    internal hostname", `allowPrivateEndpoint` is missing from the CR; the guard
    rejects any `cluster.local` remote. This happened on the first rollout, and
    a `kubectl apply --dry-run=server` does not catch it — the check is
    controller-side, not an admission webhook.
  - **`Ready`, but 401 on every call** — the injected `X-API-Key` and the
    server's `MCP_API_KEY` have diverged. They read the same OpenBao field, so
    that should only happen mid-rotation.
- `https://homelable-mcp.<tailnet>/mcp` no longer resolves. That hostname was
  retired with the move; repoint any MCP client that still has it.

### 5. Run the Pulumi home stack to release the DNS name

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

### 6. Verify the scanner actually reaches the target VLANs

The scan now originates from an equestria node's `10.10.206.x` address instead
of celestia's. Any UniFi inter-VLAN rule written against the *source* address
rather than a broad `10.10.0.0/16` will silently drop the sweep, and the symptom
is indistinguishable from "those hosts are down" — the map fills with offline
nodes and nothing errors.

Trigger a scan of `192.168.100.0/24` (IoT) and `10.1.0.0/24` (Guest) from the
UI. Guest is very likely to return nothing regardless, because of client
isolation — that is expected and was true before the move.

**There is no celestia baseline to compare against**, so do not look for one.
Verified from the final tarball taken at cutover: `nodes` and `edges` were both
**empty**, with 55 `device_inventory` rows and three `scan_runs` total. An
earlier draft of this step said to "confirm the online counts match what
celestia last recorded" — there were no recorded counts.

**The new instance also scans a narrower set than celestia did**, so even a
healthy scan will find less. celestia's `scan_config.json` had been overridden
through the UI to:

```json
"scanner_ranges": ["192.168.100.0/24", "10.1.0.0/16", "10.10.0.0/16"]
```

— a `/16` for Guest rather than the `/24` in the env, and the flat Home
`10.10.0.0/16` that this repo's config comments say is deliberately excluded
(a scheduled sweep of 65,536 addresses, against a gateway with a load-spiral
outage in its history). Documented intent and running system had diverged, and
the UI override was winning. On a fresh volume the env wins instead.

So the check here is **"did anything answer at all"**, not "did the count
match". If IoT comes back empty, that is the SNAT/firewall failure this step
exists to catch. Widening to the Home `/16` is a separate, deliberate decision
— make it from the UI with the gateway watched, not by quietly editing
`SCANNER_RANGES`.

### 7. Soak, then clean up

- **Backrest on celestia** keeps the now-orphaned `homelable` plan: the
  generator in `components/dockerStackBackups.ts` discovers plans from compose
  files, but backrest's config is merged rather than pruned, so a plan whose
  stack no longer exists is not removed by a Pulumi run. Delete it by hand once
  the new instance has a canvas worth keeping.
- **`/opt/stacks-data/homelable/` on celestia and the step 1 tarball** stay until
  the same point. Nothing restores them, but they are what makes "start fresh"
  reversible, and they cost nothing to keep for a soak.
- **The celestia OpenBao path** is still populated — step 2 copied rather than
  moved. Once the soak clears, destroy it, which is the same script with the
  same arguments plus `--move`: it re-verifies the destination before deleting
  anything, and reports `SAME` on the copy it already made.

  ```bash
  mise run vals-run -- npx tsx scripts/bao-move.ts clusters/celestia/apps/homelable/keys clusters/equestria/apps/homelable/keys --move --apply
  ```
- **The first VolSync run** is the real exit gate, and it matters more here than
  it would after a data migration, not less: the canvas that needs protecting is
  the one about to be built by hand on this cluster, and until the first
  `ReplicationSource/homelable-src` `lastSyncTime` lands it exists on exactly one
  Longhorn volume with no second copy anywhere.
