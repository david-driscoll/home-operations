# Forgejo: celestia → equestria cutover

Moves the git forge from the Docker stack on celestia
(`docker/celestia/forgejo`, retired in the same commit as this file) to Kubernetes
on equestria (`kubernetes/apps/coder/forgejo`), and stands up Forgejo Actions
runners (`kubernetes/apps/coder/forgejo-runner`) for the first time.

Both land in the existing `coder` namespace rather than getting namespaces of
their own. It is already the Low Power keep-list namespace, and it already
carries the `local-user` middleware and the app-template `OCIRepository` they
need.

**This is a re-create, not a migration.** The celestia instance holds no
repositories, so nothing is exported and nothing is imported — the new instance
starts empty and the old one is destroyed. If that stops being true before the
cutover runs, stop and plan a real data move instead: the volume layout, the
database and the `SECRET_KEY` all differ between the two deployments.

## What the manifests already do

Anything not listed under [Manual steps](#manual-steps) is declarative and lands
with the merge:

- **Forgejo** — chart `oci://data.forgejo.org/forgejo-helm/forgejo`, image
  `data.forgejo.org/forgejo/forgejo:16.0.3-rootless` (the same version celestia
  ran). Tier 1: `longhorn-critical` data volume, `critical-tier` priority class
  and a control-plane toleration. The `coder` namespace is already in
  kube-downscaler's `excludedNamespaces`, so Low Power cannot shed it.
- **The break-glass admin and the authentik auth source** — the chart's
  `configure-gitea` init container reconciles both on every start, which is
  exactly what celestia's `provision.sh` did by hand. Same auth source name
  (`authentik`), same `--group-claim-name groups --admin-group admins`.
- **HTTP** — `git.${ROOT_DOMAIN}` through the `internal` Gateway with the
  `local-user` middleware (network-gated, not authentik-gated), plus a Tailscale
  Ingress at `git.${TAILSCALE_DOMAIN}`.
- **SSH** — a new `gitssh` entrypoint and Gateway listener on 2222 in
  `kubernetes/apps/network/traefik/values.yaml`, and a `TCPRoute` from the
  Forgejo chart. `Tailscale.ports.git` already grants `tcp:2222` to `tag:apps`,
  so the tailnet side needs no ACL change.
- **Object storage** — a dedicated single-node Garage cluster
  (`kubernetes/apps/coder/forgejo-garage`) backs all eight of Forgejo's object
  subsystems via one `[storage] STORAGE_TYPE = minio` block: LFS, packages,
  attachments, avatars, repo avatars, repo archives, Actions logs and Actions
  artifacts. Bare git repositories are **not** among them — Forgejo always keeps
  those on disk, so the PVC is still what a restore rebuilds the forge from.
  `replication.factor: 1`, because a 3x-replicated store in front of an app that
  cannot run two replicas is redundancy that can never be exercised; durability
  comes from `longhorn-critical` underneath instead.
- **Backups** — `components/volsync` gives the data volume a nightly restic
  `ReplicationSource` and, on first deploy, the `ReplicationDestination` that
  lets an empty PVC bind. The Garage bucket is backed up separately, through the
  `driscoll.dev/backup: "true"` annotation and its own read-only GarageKey;
  Actions logs and artifacts are excluded as rebuildable CI output.
- **Database** — `components/postgres` plus the `forgejo` role and password that
  `mise run update` generated into
  `kubernetes/apps/database/postgres/app/{passwords.sops.yaml,users.yaml,resources/values.yaml}`.
- **Runner** — one `forgejo-runner` StatefulSet with a privileged `docker:dind`
  native sidecar. Four concurrent jobs, labels `ubuntu-latest` / `ubuntu-24.04` /
  `ubuntu-22.04` / `docker`. **`replicas` must stay 1**: every replica would read
  the same registration secret and therefore share one runner identity with the
  forge. Storage is entirely ephemeral — `emptyDir` for `/data` (10Gi) and for
  the dind layer store (60Gi), with the `sizeLimit` acting as the disk bound a
  CI workload otherwise has no reason to respect. Nothing is lost when the pod
  moves: the registration lives in the config Secret, and everything else is a
  rebuildable cache. Not Tier 1 — no critical-tier priority and no control-plane
  toleration, so with the workers off it goes Pending until Low Power ends. It
  does inherit `coder`'s downscaler exclusion, because that list is
  namespace-wide with no per-workload opt back in, but the outcome is the same
  either way: CI waits out the window, the call already recorded for
  `github-actions`.

## Manual steps

### 1. Create the OpenBao secrets (before merge)

Two paths under the `secrets` mount. Both are inside `clusters/equestria/*`, which
the `eso-equestria` policy already covers, so no root ceremony is needed.

`clusters/equestria/apps/forgejo/credentials`:

| field | value |
| --- | --- |
| `username` | the break-glass admin login, e.g. `forgejo-admin` |
| `password` | a generated password |
| `secret_key` | `openssl rand -base64 48` — encrypts 2FA seeds, webhook secrets and Actions secrets at rest |
| `jwt_secret` | `openssl rand -base64 32` — signs session and OAuth2 JWTs. **32, not 48** |

`secret_key` and `jwt_secret` must never change after first boot: rotating either
one orphans everything it encrypted or signed.

**The lengths are not interchangeable, and getting `jwt_secret` wrong fails
open.** `[security] SECRET_KEY` is a free-form string of any length, but
`[oauth2] JWT_SECRET` must decode to exactly 32 bytes. Hand it 48 and Forgejo
does not refuse to start — it logs one line and quietly proceeds with a key it
made up:

```
[oauth2] JWT_SECRET or JWT_SECRET_URI failed loading:
  invalid base64 decoded length: 48, expects: 32 - creating new key
```

Because the chart rebuilds `app.ini` from the environment on every boot, that
invented key is different every restart — so Actions task tokens and any
Forgejo-issued OAuth2 tokens silently die with the pod, which is the exact
failure storing the secret was supposed to prevent. Nothing else reports it.

Generating it inside the container avoids the question entirely, since Forgejo
emits the format it wants:

```bash
kubectl -n coder exec deploy/forgejo -- forgejo generate secret JWT_SECRET
```

Verify after the first boot, before anyone depends on it:

```bash
kubectl -n coder logs deploy/forgejo -c configure-gitea | grep -i jwt_secret
```

Silence is success. A `creating new key` line means the stored value was
rejected.

`clusters/equestria/apps/forgejo/runner`:

| field | value |
| --- | --- |
| `token` | a 40-character lowercase hex string — `openssl rand -hex 20` |
| `uuid` | derived from `token`, see step 4 |

And the Garage cluster's own identity. Filed under the **`forgejo`** app prefix
rather than a `forgejo-garage` one, because this cluster is not a service in its
own right — it holds one forge's objects, and its credentials belong next to
that forge's. They are deliberately **not** shared with `garage-system`: two
Garage clusters must never hold the same RPC secret, or a node from one could
join the other's mesh.

```bash
bao kv put secrets/clusters/equestria/apps/forgejo/garage-rpc-secret \
  password="$(openssl rand -hex 32)"
bao kv put secrets/clusters/equestria/apps/forgejo/garage-admin-token \
  password="$(openssl rand -hex 32)"
```

The RPC secret is the node's mesh identity and GarageKey material derives from
it. Losing it after first boot means the object store cannot be reassembled from
its PVCs — every LFS object Forgejo still has listed in its database becomes
unreadable.

The OIDC path (`clusters/equestria/apps/forgejo/oidc`) is **not** hand-made — it
is written by the `applications` Pulumi stack in step 3.

### 2. Merge, and watch two Pulumi stacks race external-dns

**Neither Pulumi stack below is run by hand.** Both are `Stack` CRs driven by the
Pulumi Operator off the `home-operations` GitRepository, which tracks `main`:

| Stack | dir | cadence |
| --- | --- | --- |
| `pulumi/home-operations` | `stacks/home` | on each new commit, then daily |
| `pulumi/equestria` | `stacks/applications` | on each new commit, then every 300s |

So merging is what starts everything. Two things happen concurrently, and the
order is not guaranteed:

- **`stacks/home` deletes the old CNAME.** `DockgeLxc` reads the
  `traefik.http.routers.*.rule` labels out of each compose file and creates a
  matching record, so celestia owns `git.driscoll.tech -> celestia.driscoll.tech`
  today. Removing `docker/celestia/forgejo/` removes that resource.
- **Flux deploys Forgejo, and external-dns tries to claim the same name.** It
  runs `policy: sync` with a `txtOwnerId`, so it will **not** adopt a record it
  does not own — if it gets there first it skips the name entirely.

That resolves itself: external-dns retries on its own interval and picks the name
up once Pulumi has removed the old record. The trap is the window in between,
during which `git.driscoll.tech` still resolves to celestia — where the old
Forgejo is **still running** until step 6. It is entirely possible to log into
the old instance and conclude the new one is broken. Check what you are looking
at before believing anything:

```bash
kubectl -n network logs deploy/external-dns-technitium | grep git.driscoll.tech
dig +short git.driscoll.tech
```

To stop waiting and force the home stack now:

```bash
kubectl -n pulumi annotate stack home-operations \
  pulumi.com/reconciliation-request="$(date +%s)" --overwrite
kubectl -n pulumi get stack home-operations -w
```

> If you do choose to run `stacks/home` from a workstation instead, read
> `pulumi preview` carefully rather than trusting it: on this stack it invents
> deletions for `StandardDns` / `TailnetKey` / `DeviceTags` resources that are
> built inside an `apply()` with an `isDryRun` early return. Those are phantoms.
> The Forgejo CNAME is a real, top-level resource and its deletion is genuine.

### 3. Wait for the OIDC credential

Flux brings up the database role, the PVC and the Deployment. The pod will
crash-loop until this lands, because `forgejo-oauth` has no data yet and the
`configure-gitea` init container fails without it.

Nothing to run: `pulumi/equestria` resyncs every 300s, reads the
`ApplicationDefinition` CR out of the live cluster, creates the authentik
application and provider, and writes `clusters/equestria/apps/forgejo/oidc`. ESO
picks it up within its 4m refresh and the pod settles — so allow up to ~10
minutes end to end.

Verify:

```bash
kubectl -n pulumi get stack equestria
kubectl -n coder get externalsecret
kubectl -n coder logs deploy/forgejo -c configure-gitea
```

The init container should print `...installed.` for both the admin user and the
`authentik` OAuth2 source.

### 4. Register the runner

Offline registration, so the credential is one we chose rather than one pasted
out of the web UI. On the Forgejo pod:

```bash
kubectl -n coder exec deploy/forgejo -- forgejo forgejo-cli actions register --name equestria --scope david-driscoll --secret <the token from step 1>
```

`--scope` is the owner whose repositories this runner serves; drop it entirely to
register an instance-wide runner at `/admin/actions/runners`.

The command prints a UUID. It is not random — it is the hex encoding of the
token's first 16 characters, so it is reproducible, and re-running the command
later with the same first 16 characters and different last 24 **rotates the
secret in place** instead of creating a second runner. Write the printed UUID
into the `uuid` field of `clusters/equestria/apps/forgejo/runner`, then:

```bash
kubectl -n coder rollout restart statefulset/forgejo-runner
kubectl -n coder logs statefulset/forgejo-runner -c app
```

`/admin/actions/runners` should list it as idle.

### 5. Smoke test

```bash
# HTTP + SSO. /api/healthz is unauthenticated and answers even with
# REQUIRE_SIGNIN_VIEW, so a 200 with "status": "pass" proves route, TLS,
# Service endpoints, database and cache in one call.
curl -s https://git.driscoll.tech/api/healthz

# The object store. 403 is the HEALTHY answer -- an unsigned GET / is a
# ListBuckets that Garage rejects. What is being tested is that the name
# resolves and TLS verifies against the *.git.driscoll.tech SAN.
curl -s -o /dev/null -w '%{http_code} tls=%{ssl_verify_result}\n' https://s3.git.driscoll.tech/

# SSH. The port has to be spelled; it is not 22. "Permission denied
# (publickey)" with a host key exchanged is a PASS -- it proves the gitssh
# entrypoint, the Gateway listener, the TCPRoute and Forgejo's Go SSH server.
ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null git@git.driscoll.tech
```

Then Actions, which is the only part that exercises the runner, the
Docker-in-Docker sidecar and the S3 log path together:

```bash
TOK=$(kubectl -n coder exec deploy/forgejo -c forgejo -- forgejo admin user \
  generate-access-token --username forgejo-admin --scopes write:repository --raw)
API=https://git.driscoll.tech/api/v1

curl -s -X POST "$API/user/repos" -H "Authorization: token $TOK" \
  -H 'Content-Type: application/json' \
  -d '{"name":"runner-smoke","private":true,"auto_init":true,"default_branch":"main"}'
```

Commit a `.forgejo/workflows/smoke.yml` with `runs-on: ubuntu-latest` and two
steps: a plain `run:` and an `actions/checkout@v4`. Split them deliberately —
if checkout fails while the echo passes, the fault is action resolution
(`DEFAULT_ACTIONS_URL`), not the runner or Docker.

Expect roughly 100 seconds on the first run; the `catthehacker/ubuntu` image is
about a gigabyte and the layer cache is an `emptyDir`, so it is cold again after
any runner restart.

What a pass looks like, in the runner log:

```
runner: equestria, with version: v13.0.0, with labels: [ubuntu-latest ...]
task 1 repo is forgejo-admin/runner-smoke https://github.com http://forgejo-http.coder.svc.cluster.local:3000/
```

The `https://github.com` in that line is `DEFAULT_ACTIONS_URL` resolving, which
is what lets GitHub-authored workflows run unmodified.

Confirm the logs actually reached S3. Ask Garage, not Kubernetes — the
`GarageBucket` CR's `SIZE`/`OBJECTS` columns refresh on a slow cycle and read
`0 B` long after objects have landed:

```bash
kubectl -n coder exec forgejo-garage-storage-0-0 -- garage bucket info forgejo
```

#### Cleaning up after the smoke test

Delete the repository through the API, then **revoke the token by hand**:

```bash
curl -s -X DELETE "$API/repos/forgejo-admin/runner-smoke" -H "Authorization: token $TOK"
```

Forgejo deliberately refuses to let a token delete tokens — `DELETE
/users/{user}/tokens/{id}` answers 401 when authenticated with one, and there is
no `forgejo admin user delete-access-token` subcommand. The only routes are HTTP
basic auth or the web UI, so finish at
<https://git.driscoll.tech/user/settings/applications> and revoke the token
there. Do not skip it: it is a read/write credential on the admin account, and
nothing expires it.

### 6. Tear down celestia

Deleting `docker/celestia/forgejo/` removes the stack from the Pulumi program,
but **that does not stop the running containers**. Dockge's `.ignore` path
removes `/opt/stacks/<stack>/` and leaves the container running and orphaned,
and `restart: unless-stopped` plus `autoheal` will resurrect it indefinitely. On
celestia:

```bash
docker rm -f forgejo forgejo-provision
```

Then drop the now-orphaned database (the `PGAPP_FORGEJO_PASSWORD` entry is gone
from `docker/celestia/postgres/.env-local`, but `provision.sh` only ever creates,
it never reaps):

```bash
docker exec -it postgres psql -U postgres -c 'DROP DATABASE forgejo;'
docker exec -it postgres psql -U postgres -c 'DROP ROLE forgejo;'
```

Finally, remove the old `clusters/celestia/apps/forgejo/*` paths from OpenBao and
delete the stack's data directory `/opt/stacks-data/forgejo` once you are
satisfied the new instance is good.

## Known gaps

- **Low Power is not actually survivable yet.** Forgejo is Tier 1 on every axis
  it controls — storage class, priority class, toleration, downscaler exclusion —
  but it needs Postgres, and the shared CNPG cluster runs on `longhorn-local`
  with no control-plane toleration. Until that changes, "Tier 1" here means "is
  not shed and is ready to survive", not "keeps serving with the workers off".
  `coder` has the same gap.
- **Job container images are pinned by hand.** The `runner.labels` entries in
  `kubernetes/apps/coder/forgejo-runner/resources/config.yml` sit inside
  a config file rather than a Kubernetes image field, so none of the Renovate
  managers in `.github/renovate.json5` can see them.
- **The runner is only observable while it is failing.** `ForgejoRunnerDown`
  and `ForgejoRunnerFlapping` watch the pod, and Forgejo exports no runner
  metric at all (`modules/metrics/collector.go` has 28 series, none about
  runners), so a runner that is up but no longer accepting jobs — a revoked
  registration, a wedged poller — looks healthy. Closing this needs a canary
  workflow on a schedule with a dead-man's-switch alert, not another rule.
- **Nothing alerts on the 60Gi disk bound.** The runner's `docker-storage`
  `emptyDir` is capped at 60Gi and the kubelet evicts the pod when it is
  exceeded, which `ForgejoRunnerFlapping` would catch after the fact. There is
  no leading indicator: `ephemeral_storage_pod_usage_bytes` and
  `container_fs_usage_bytes` are not scraped here, `kubelet_volume_stats_*` is
  PVC-only, and `kube_pod_status_reason` has zero series. See the note in
  `kubernetes/apps/coder/forgejo-runner/prometheusrule.yaml`.
- **Workflows cannot reach the Docker daemon.** `container.docker_host` is `"-"`,
  so jobs get container and service steps but no socket. Changing it to
  `automount` hands every workflow — including one from a pull request — control
  of a privileged daemon.
