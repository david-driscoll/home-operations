# PatchMon

Linux patch monitoring. The server runs in `equestria`
(`kubernetes/apps/equestria/utils/patchmon`); every Proxmox host gets an agent
from `ProxmoxHost` (`components/patchmon.ts`), so a new host is enrolled by the
same `pulumi up` that creates it.

| | |
| --- | --- |
| UI | `https://patchmon.<root domain>`: authentik OIDC, `admins` only |
| Agent URL | `https://patchmon.<tailnet>`. Must equal Settings -> Server URL |
| Image | `ghcr.io/patchmon/patchmon-server` (2.x: one Go binary with the UI embedded) |
| State | Postgres (`components/postgres`) and Redis (shared valkey, database 7). Nothing on disk |
| OpenBao | `clusters/equestria/apps/patchmon/keys` (`encryption_key`), `.../enrollment` (`token_key`, `token_secret`) |

## Bring-up

### 1. Seed the encryption key (once, before merging)

```bash
bao kv put secrets/clusters/equestria/apps/patchmon/keys \
  encryption_key="$(openssl rand -hex 32)"
```

Exactly 64 hex characters. It encrypts data at rest and must never change:
without it PatchMon derives a key from `DATABASE_URL`, whose password rotates
every 30 days. `patchmon-env` stays NotReady until this path exists.

### 2. Merge; expect the new-app Postgres race

`stacks/system` usually reaches the merge commit before Flux has created the
`patchmon` role, and fails with `role "patchmon" does not exist`. That is
expected. Recover in this order (from `components/postgres/ks.yaml`):

```bash
flux -n flux-system reconcile ks cluster-apps
kubectl -n database get databaserole patchmon -w        # wait for status.applied
kubectl annotate stack -n pulumi system \
  pulumi.com/reconciliation-request=$(date +%s) --overwrite
kubectl -n database annotate externalsecret patchmon-postgres \
  force-sync=$(date +%s) --overwrite
kubectl -n equestria annotate externalsecret patchmon-env \
  force-sync=$(date +%s) --overwrite
```

The pod runs its migrations before it opens its port. The startup probe allows
400s for that.

### 3. Claim the instance immediately

Until a first admin exists, `POST /api/v1/auth/setup-admin` is unauthenticated
and hands the instance to whoever calls it first. The route is LAN- and
tailnet-only (`local-user`), but do not leave it open.

Open `https://patchmon.<root domain>`. The setup wizard appears even with OIDC
configured:

1. Create a **local** admin. This is the break-glass account for when authentik
   is down. Store the username and password at
   `secrets/clusters/equestria/apps/patchmon/admin`.
2. When the wizard asks for the **Server URL**, enter `https://patchmon.<tailnet>`.
   The agent installer bakes this value into every agent's config, so getting
   it wrong breaks enrollment. The enrollment script refuses to install against
   a mismatch and names the value it expected.
3. Settings: turn off anonymous metrics (`metrics_enabled`; it is on by
   default and posts to `metrics.patchmon.cloud`).
4. Sign out, then sign in with authentik. `OIDC_SYNC_ROLES` maps `admins` to
   superadmin on every login.

### 4. Create the enrollment token

The API that mints tokens needs a logged-in session, so this step stays manual.
Do it once; it covers every host from then on.

1. Optional: create a host group (e.g. `Proxmox`) under Host Groups.
2. Settings -> Integrations -> Auto-Enrollment & API -> new token. Type
   **direct-host**. Default host group: the one above.
   - Leave **Allowed IP ranges** empty. I have not checked which source address
     PatchMon sees after the tailnet ingress proxy and Traefik.
3. Copy the secret. It is shown once.

```bash
bao kv put secrets/clusters/equestria/apps/patchmon/enrollment \
  token_key=patchmon_ae_... token_secret=...
bao kv metadata put \
  -custom-metadata=contains_secrets=true \
  -custom-metadata=concealed_fields=token_secret \
  secrets/clusters/equestria/apps/patchmon/enrollment
```

### 5. Enroll the hosts

Each `<host>-patchmon-agent` command runs a no-op until the token exists.
Writing the token changes the command's stdin, so the next run of each
Proxmox-owning stack enrolls its hosts. `pulumi preview` shows them as updates:

| Stack | Hosts |
| --- | --- |
| `home-operations` (`stacks/home`) | twilight-sparkle, celestia, alpha-site |
| `ocracoke` | skystar |
| `gulf-of-mexico` | luna |

All three are operator-managed. Nudge each one with
`kubectl annotate stack -n pulumi <stack> pulumi.com/reconciliation-request=$(date +%s) --overwrite`,
or run `pulumi up` locally. Each command logs `patchmon: enrolled <host>`, and
the host appears in the UI with its first agent report. The operator stacks do
not notice an OpenBao write on their own (`resyncFrequencySeconds: 86400`),
which is why the nudge is needed.

## How enrollment works

`components/patchmon.ts`, run over SSH on each host as `sh -s` with the script
on stdin:

1. **Already healthy?** If `/etc/patchmon/config.yml` points at the agent URL
   and `patchmon-agent ping` succeeds, it exits. This is the steady state.
2. **Repair.** If credentials for this server are on disk but the agent is not
   healthy, it reinstalls with those credentials and does not enroll again.
3. **Enroll.** `POST /api/v1/auto-enrollment/enroll` with the token in
   **headers**, then upstream's per-host installer
   (`/api/v1/hosts/install`, using the new host's own X-API-ID/X-API-KEY).

Upstream's UI one-liner (`/auto-enrollment/script?token_secret=...`) is
deliberately not used. Traefik's access log records the full request line, so
the enrollment secret would end up in Loki on every run.

The command re-runs only when its inputs change: a token rotation, or a new
host. To force a re-check on one host:
`pulumi up --target-replace '<urn of the <host>-patchmon-agent command>'`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| 403 `host_mismatch` / `cors_mismatch` | The Host used is not in `CORS_ORIGIN`. Both hostnames are listed in `helmrelease.yaml`. A third one (a new alias) must be added there. |
| Pod never Ready, probe 403 | A probe lost its `Host: localhost` header. The kubelet sends the pod IP, which fails the same check. |
| `patchmon: PatchMon's Settings -> Server URL is '...'` | Step 3.2 was skipped or changed. Fix the setting and re-run; the host is enrolled without a duplicate, because the script left a `host_id` stub. |
| `patchmon: PatchMon already lists <host> but this machine holds no working credentials` (409) | The host's `/etc/patchmon` was wiped but the PatchMon record survived. Delete the host in the UI and re-run. |
| Every host offline at once | Redis. `/health` reports `database` and `redis` separately with `?format=json`. |
| Notification secrets unreadable after a restore | `encryption_key` changed. Restore the old value from OpenBao history (`bao kv get -version=N`). |

## Not covered

- **LXC containers.** PatchMon's `proxmox-lxc` integration enrolls every
  running container on a node via `pct exec`. It is a separate token type, and
  it would overlap with the Dockge and PBS LXCs that Pulumi already manages.
  `installPatchmonAgent()` takes any SSH connection, so wiring it into
  `DockgeLxc` is the direct route if that is wanted.
- **Decommissioning.** Removing a host from Pulumi does not remove it from
  PatchMon. Delete it in the UI.
