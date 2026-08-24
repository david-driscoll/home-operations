# Forgejo: celestia → equestria cutover

Moves the git forge from the Docker stack on celestia
(`docker/celestia/forgejo`, retired in the same commit as this file) to Kubernetes
on equestria (`kubernetes/apps/forgejo`), and stands up Forgejo Actions runners
(`kubernetes/apps/forgejo-runner`) for the first time.

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
  ran). Its own `forgejo` namespace, Tier 1: `longhorn-critical` data volume,
  `critical-tier` priority class, control-plane toleration, and `forgejo` added
  to kube-downscaler's `excludedNamespaces` so Low Power cannot shed it.
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
- **Backups** — `components/volsync` gives the data volume a nightly restic
  `ReplicationSource` and, on first deploy, the `ReplicationDestination` that
  lets an empty PVC bind.
- **Database** — `components/postgres` plus the `forgejo` role and password that
  `mise run update` generated into
  `kubernetes/apps/database/postgres/app/{passwords.sops.yaml,users.yaml,resources/values.yaml}`.
- **Runner** — one `forgejo-runner` StatefulSet with a privileged `docker:dind`
  native sidecar, in its own `forgejo-runner` namespace. Four concurrent jobs,
  labels `ubuntu-latest` / `ubuntu-24.04` / `ubuntu-22.04` / `docker`.
  Deliberately *not* Tier 1 and *not* downscaler-excluded — CI can wait out a
  Low Power window, the same call already recorded for `github-actions`.

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
| `jwt_secret` | `openssl rand -base64 48` — signs session and OAuth2 JWTs |

`secret_key` and `jwt_secret` must never change after first boot: rotating either
one orphans everything it encrypted or signed.

`clusters/equestria/apps/forgejo/runner`:

| field | value |
| --- | --- |
| `token` | a 40-character lowercase hex string — `openssl rand -hex 20` |
| `uuid` | derived from `token`, see step 4 |

The OIDC path (`clusters/equestria/apps/forgejo/oidc`) is **not** hand-made — it
is written by the `applications` Pulumi stack in step 3.

### 2. Free `git.driscoll.tech` on the Pulumi side

`DockgeLxc` reads the `traefik.http.routers.*.rule` labels out of each compose
file and creates a matching CNAME, so celestia owns `git.driscoll.tech ->
celestia.driscoll.tech` today. external-dns runs `policy: sync` with a
`txtOwnerId`, which means it will **not** adopt a record it does not own — it
leaves the stale CNAME in place and Forgejo stays unreachable by name.

So run the home stack first, and only then let Flux reconcile:

```bash
cd stacks/home && pulumi preview
```

Confirm the plan deletes `celestia-forgejo-dns-git_driscoll_tech` (and the
Forgejo authentik application, which step 3 recreates against equestria) and
touches nothing else, then `pulumi up`.

> Read `pulumi preview` carefully rather than trusting it: on the home stack it
> invents deletions for `StandardDns` / `TailnetKey` / `DeviceTags` resources
> that are built inside an `apply()` with an `isDryRun` early return. Those are
> phantoms. The Forgejo CNAME is a real, top-level resource and its deletion is
> genuine.

### 3. Merge, then run the applications stack

Flux brings up the namespaces, the database role, the PVC and the Deployment. The
pod will crash-loop until step 3b lands, because `forgejo-oauth` has no data yet
and the `configure-gitea` init container fails without it.

```bash
cd stacks/applications && pulumi up
```

This reads the `ApplicationDefinition` CR out of the live cluster, creates the
authentik application and provider, and writes
`clusters/equestria/apps/forgejo/oidc`. ESO picks it up within its 4m refresh and
the pod settles.

Verify:

```bash
kubectl -n forgejo get externalsecret
kubectl -n forgejo logs deploy/forgejo -c configure-gitea
```

The init container should print `...installed.` for both the admin user and the
`authentik` OAuth2 source.

### 4. Register the runner

Offline registration, so the credential is one we chose rather than one pasted
out of the web UI. On the Forgejo pod:

```bash
kubectl -n forgejo exec deploy/forgejo -- forgejo forgejo-cli actions register --name equestria --scope david-driscoll --secret <the token from step 1>
```

`--scope` is the owner whose repositories this runner serves; drop it entirely to
register an instance-wide runner at `/admin/actions/runners`.

The command prints a UUID. It is not random — it is the hex encoding of the
token's first 16 characters, so it is reproducible, and re-running the command
later with the same first 16 characters and different last 24 **rotates the
secret in place** instead of creating a second runner. Write the printed UUID
into the `uuid` field of `clusters/equestria/apps/forgejo/runner`, then:

```bash
kubectl -n forgejo-runner rollout restart statefulset/forgejo-runner
kubectl -n forgejo-runner logs statefulset/forgejo-runner -c app
```

`/admin/actions/runners` should list it as idle.

### 5. Smoke test

```bash
# HTTP + SSO
open https://git.driscoll.tech

# SSH — the port has to be spelled, it is not 22
git clone ssh://git@git.driscoll.tech:2222/<owner>/<repo>.git
```

Then push a workflow with `runs-on: ubuntu-latest` and confirm it schedules,
pulls its image through the dind sidecar, and reports back.

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
  `kubernetes/apps/forgejo-runner/forgejo-runner/resources/config.yml` sit inside
  a config file rather than a Kubernetes image field, so none of the Renovate
  managers in `.github/renovate.json5` can see them.
- **LFS and the package registry share the data volume.** Both can move to Minio
  natively (`[lfs] STORAGE_TYPE=minio`) without touching the git data if they
  ever outgrow it.
- **Workflows cannot reach the Docker daemon.** `container.docker_host` is `"-"`,
  so jobs get container and service steps but no socket. Changing it to
  `automount` hands every workflow — including one from a pull request — control
  of a privileged daemon.
