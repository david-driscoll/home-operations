# Arcane + PDM: celestia → equestria cutover

Moves two services off the celestia Dockge host, to free memory there for the
replacement control-plane VM:

| Service | Was | Is |
|---|---|---|
| Arcane manager | `docker/celestia/arcane` | `kubernetes/apps/equestria/utils/arcane` |
| Proxmox Datacenter Manager | `docker/celestia/pdm` | `kubernetes/apps/equestria/utils/pdm` |

An **Arcane agent stays on celestia** (`docker/celestia/arcane-agent`, which was
`.ignore`d while the manager ran there and drove celestia's Docker directly).

**This is a data migration, not a re-create.** Arcane's SQLite databases hold
the four environments and their agent tokens, users, API keys and settings; PDM's
`/etc/proxmox-datacenter-manager` holds every remote's API token and the
certificate fingerprints. Neither is reproducible from git.

## What changes for users

| | Before | After |
|---|---|---|
| Arcane | `https://arcane.<root domain>` (celestia) | `https://arcane.<root domain>` (equestria) |
| Arcane, tailnet | `https://arcane.<tailnet>` | gone until [step 8](#8-follow-up-pr-tailnet-hostnames), then the same |
| PDM | `https://pdm.<root domain>` (celestia) | `https://pdm.<root domain>` (equestria) |
| PDM, tailnet | `https://pdm.<tailnet>` | gone until [step 8](#8-follow-up-pr-tailnet-hostnames), then the same |

Hostnames do not change: celestia and equestria share one root domain, so only
what answers on them moves. Logins are unchanged too: Arcane through authentik
OIDC (a new `equestria-arcane-*` application replaces `celestia-arcane-*`), and
PDM as `root@pam` with the same password. The PDM authentik client is carried
over, but PDM has no OpenID realm configured, then or now.

**PDM was already down on celestia.** Both daemons had been crash-looping since
at least 2026-11-01 on `bad owner on "/etc/proxmox-datacenter-manager" (33 != 0)`:
the directory had become `www-data`-owned. The config itself is intact, and the
new entrypoint fixes the ownership on every start.

## How the agents change: direct → edge

On celestia the manager dialled each agent at `https://arcane-agent-<host>.<tailnet>`.
Equestria pods have no route to the tailnet (only the egress Services in
`tailscale-system`, and no agent hostname is one of them). So every agent becomes an
**edge agent**: it dials OUT to `MANAGER_API_URL` (`https://arcane.<root domain>`,
already in `docker/_common/arcane-agent/.env`) and the manager drives it through
that tunnel.

- **Tokens do not change.** An edge agent authenticates with the environment's
  access token, which is exactly the `AGENT_TOKEN` each host already has in
  OpenBao. Arcane's own "deployment snippet" for the migrated Luna environment
  emits that same token with `EDGE_AGENT=true`.
- **Transport is `websocket`.** Through Traefik the gRPC tunnel is accepted at TLS
  and never answered, so `auto` wastes 10s before falling back.
- **The environment rows flip to `is_edge=1`** in the migrated database
  ([step 4](#4-restore-the-data)), and the built-in local environment `0`
  (celestia's own Docker socket, which a pod does not have) is disabled and
  hidden. It only carried event/activity history.
- **celestia gets an environment of its own**, with a token minted in
  [step 1](#1-before-merging-openbao).
- All four hosts were checked from the host itself: each reaches the equestria
  internal gateway (`patchmon.<root domain>/health` → 200), skystar included.

## Pre-flight: what was already proven (2026-11-02)

In a throwaway namespace, deleted afterwards, the rendered manifests ran against
copies of the live data:

- Arcane opened the migrated DB as uid 1000 (goose at v94, no migration needed),
  listed Skystar/Luna/Alpha Site as edge environments, and kept environment 0
  disabled across a restart.
- An environment created through the API with a chosen `accessToken` went
  `online` once a test edge agent used that token, both direct to the Service
  (gRPC) and through the internal gateway (websocket fallback).
- PDM started without systemd, accepted `root@pam` with the migrated password,
  and listed all six remotes. The remotes needed the fixes in step 4. Once they
  were applied, the three PVE remotes were `Good` and 4/4 nodes online.
- Both apps answered through the internal gateway, PDM's HTTPS backend via
  `appProtocol: https`.

It also found that `ADMIN_STATIC_API_KEY` never worked on celestia: Arcane wants
`arc_<64 hex>` and OpenBao holds the bare hex. `externalsecret.yaml` adds the
prefix.

## 1. Before merging: OpenBao

ESO fails a whole ExternalSecret on one missing path, and `stacks/home` fails a
whole run on one unresolvable `ref+openbao://`. So all three writes land **before**
the merge.

```bash
fnox exec -- npx tsx scripts/bao-move.ts clusters/celestia/apps/arcane/credentials clusters/equestria/apps/arcane/credentials --apply
fnox exec -- npx tsx scripts/bao-move.ts clusters/celestia/apps/pdm/root clusters/equestria/apps/pdm/root --apply
```

Copies, not moves, so the celestia stacks keep working until step 2. The celestia
paths are destroyed in [step 9](#9-soak-then-clean-up).

Then mint celestia's agent token. `docker/celestia/arcane-agent/token.env` and
`clusters/celestia.yaml`'s `secretField: arcane_token` both read it:

```bash
fnox exec -- sh -c 'bao kv put -mount=secrets clusters/celestia/arcane-agent arcane_token="arc_$(openssl rand -hex 32)"'
```

## 2. Stop the celestia containers and take the data

```bash
ssh root@dockge-celestia.<tailnet> 'docker stop arcane pdm'
```

Stop, not remove: the volume and `/opt/stacks-data/pdm` stay on disk and are the
rollback (`docker start arcane pdm`). Both instances answering one hostname is
the state to avoid.

With arcane stopped, its SQLite files are consistent. Tar them on the host, so
macOS tar adds no `._*` files:

```bash
ssh root@dockge-celestia.<tailnet> 'tar -C /var/lib/docker/volumes/arcane_arcane-data/_data -czf /tmp/arcane-data.tgz . && tar -C /opt/stacks-data -czf /tmp/pdm-etc.tgz --numeric-owner pdm'
scp root@dockge-celestia.<tailnet>:/tmp/{arcane-data,pdm-etc}.tgz .
```

## 3. Merge

Flux creates both apps in `equestria`. Their PVCs come up empty (VolSync has no
backup to bootstrap from yet). Arcane waits in `CreateContainerConfigError` until
`stacks/system` writes `arcane-oidc-credentials`. **PDM starts at once, on the
empty volume, and initialises a fresh config.** Step 4 overwrites it.

The same merge drives both Pulumi Operator stacks:

- **`system`** creates the `equestria-arcane-*` and `equestria-pdm-*` authentik
  applications and writes `arcane-oidc-credentials` / `pdm-oidc-credentials`.
- **`home-operations`** (stacks/home) retires the two Docker stacks:
  - it stops and removes the containers;
  - it deletes the `arcane`/`pdm` CNAMEs → `dockge-celestia`. external-dns then
    publishes the equestria records on its next loop; it will not take over a
    record it does not own;
  - it deletes the `svc:arcane`/`svc:pdm` Tailscale Services and the
    `celestia-arcane-*`/`celestia-pdm-*` authentik applications;
  - it rolls the edge-mode agent config to all four hosts and starts celestia's
    new agent.

**Seen at the 2026-11-02 cutover:** the first `home-operations` run failed on
`Server error (404) for DELETE .../static-dns/<id>: Static DNS Record not found`.
`arcane.<root domain>`'s UniFi record had already disappeared from the
controller, and the unifi provider treats a 404 on delete as an error. It was
fixed by dropping that one URN from state in the workspace pod
(`pulumi state delete --yes '<urn>'`) and re-requesting the run.

Nudge either one if it does not pick the merge up:

```bash
kubectl -n pulumi annotate stack home-operations pulumi.com/reconciliation-request="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite
```

## 4. Restore the data

For each app: suspend, scale to zero, load, then edit. The HelmRelease must be
suspended first, or drift detection scales it straight back up.

```bash
flux -n equestria suspend helmrelease arcane pdm
kubectl -n equestria scale deploy arcane pdm --replicas=0
```

Load both volumes from one pod (both are RWO, and nothing else holds them now):

```bash
kubectl -n equestria apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: arcane-pdm-restore}
spec:
  containers:
    - name: restore
      image: docker.io/library/alpine:3.22
      command: [sleep, "3600"]
      volumeMounts: [{name: arcane, mountPath: /arcane}, {name: pdm, mountPath: /pdm}]
  volumes:
    - {name: arcane, persistentVolumeClaim: {claimName: arcane}}
    - {name: pdm, persistentVolumeClaim: {claimName: pdm}}
EOF
kubectl -n equestria wait --for=condition=Ready pod/arcane-pdm-restore
kubectl -n equestria cp arcane-data.tgz arcane-pdm-restore:/tmp/
kubectl -n equestria cp pdm-etc.tgz arcane-pdm-restore:/tmp/
```

Inside the pod (`kubectl -n equestria exec -it arcane-pdm-restore -- sh`):

```sh
apk add -q sqlite
# Arcane: replace whatever is there, wholesale.
find /arcane -mindepth 1 -maxdepth 1 ! -name lost+found -exec rm -rf {} +
tar -C /arcane -xzf /tmp/arcane-data.tgz
sqlite3 /arcane/arcane.db "
  UPDATE environments SET enabled = 0, hidden = 1 WHERE id = '0';
  UPDATE environments SET is_edge = 1 WHERE id IN (
    '18e02156-2ce3-421b-92c7-2041275ba375',  -- Skystar
    '497d8d7d-a642-4b00-8dec-031df78dd4a5',  -- Luna
    '92c33968-d6e9-46e2-81c9-07952fdc37f1'); -- Alpha Site
  SELECT id, name, enabled, hidden, is_edge FROM environments;"
chown -R 1000:1000 /arcane

# PDM: config into etc/; lib/ (RRD history) starts fresh.
rm -rf /pdm/etc && mkdir -p /pdm/etc /pdm/lib
tar -C /tmp -xzf /tmp/pdm-etc.tgz --numeric-owner
cp -a /tmp/pdm/. /pdm/etc/
```

Two fixes to `remotes.cfg`, both found in pre-flight:

- **Drop the `skystar.host.<root domain>` node.** That name resolves to a tailnet
  IP, which a pod cannot route to. skystar's other node, `skystar.<tailnet>`, is
  an egress Service and answers.
- **Update skystar's pinned fingerprint.** skystar's certificate changed while
  the host was dark (2026-09-15 → 2026-11-01). The new one was read on the host
  over Tailscale SSH and matched what the egress serves, so this is a verified
  update, not trust-on-first-use. Re-read it at cutover time:

  ```bash
  ssh root@skystar.<tailnet> 'f=/etc/pve/local/pveproxy-ssl.pem; [ -f $f ] || f=/etc/pve/local/pve-ssl.pem; openssl x509 -in $f -noout -fingerprint -sha256'
  ```

```sh
cfg=/pdm/etc/remotes.cfg
sed -i '/nodes skystar\.host\./d' "$cfg"
sed -i -E '/^pve: skystar$/,/^$/ s/(nodes skystar\.[^,]+,fingerprint=)[0-9A-F:]+/\1<NEW FINGERPRINT>/' "$cfg"
```

Then put the apps back:

```bash
kubectl -n equestria delete pod arcane-pdm-restore
flux -n equestria resume helmrelease arcane pdm
kubectl -n equestria scale deploy arcane pdm --replicas=1
```

The explicit scale is needed. The cluster's HelmRelease defaults tell drift
detection to ignore `/spec/replicas`, so resuming does not undo the scale-to-0.

**Seen at the 2026-11-02 cutover:** pdm crash-looped once on `bad permissions on
"/var/lib/proxmox-datacenter-manager" (0o2755 != 0o755)`. The fresh PVC's root
is setgid (2775), directories made on it inherit the bit, and GNU `chmod 1770`
leaves setgid on a directory. The entrypoint now uses the 5-digit modes that
clear it (`01770`, `00755`). That run was fixed by hand with `chmod g-s` on the
volume.

## 5. Add celestia to Arcane

The manager is up with the migrated data. Create celestia's edge environment
with the token minted in step 1:

```bash
KEY="arc_$(fnox exec -- bao kv get -mount=secrets -field=api_key clusters/equestria/apps/arcane/credentials)"
TOKEN="$(fnox exec -- bao kv get -mount=secrets -field=arcane_token clusters/celestia/arcane-agent)"
curl -s -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -X POST "https://arcane.$ROOT_DOMAIN/api/environments" \
  -d "{\"name\":\"Celestia\",\"isEdge\":true,\"enabled\":true,\"apiUrl\":\"https://arcane-agent.celestia.$ROOT_DOMAIN\",\"accessToken\":\"$TOKEN\"}"
```

`apiUrl` is required by the API but unused for an edge environment.

## 6. Remove the PBS remotes from PDM

The three PBS LXCs are being retired in parallel (they never held a datastore),
and two were already unreachable at pre-flight. In the PDM UI, remove
`celestia-pbs`, `luna-pbs` and `skystar-pbs`. Deleting through the UI or API
clears `remotes.shadow` along with `remotes.cfg`.

## 7. Verify

- `https://arcane.<root domain>` → authentik login → all four environments
  (Celestia, Luna, Skystar, Alpha Site) **online**, with containers listed.
  If one stays offline, read that host's agent log:
  `docker logs arcane-agent | grep -i tunnel`. It should say
  `Edge tunnel connected ... transport=websocket`.
- `https://pdm.<root domain>` → `root@pam` → the three PVE remotes `Good`.
- Gatus: `Arcane` (`/api/health`) and `Proxmox Datacenter Manager` green.
- On celestia: `docker ps -a | grep -E 'arcane|pdm'` shows **only**
  `arcane-agent`. `stacks/home` stops removed stacks
  ([#2312](https://github.com/david-driscoll/home-operations/pull/2312)), but
  check `docker ps -a`, not the absence of `/opt/stacks/<stack>`.

## 8. Follow-up PR: tailnet hostnames

Once `stacks/home` has run, `svc:arcane` and `svc:pdm` no longer exist, and
`components/tailscale` can be added to both `ks.yaml` files (with
`TAILSCALE_PORT: https` for PDM). Done in the PR that followed the cutover.

## 9. Soak, then clean up

- **First VolSync backup** of each PVC (`ReplicationSource/<app>` `lastSyncTime`)
  is the exit gate. Until then the data lives on one Longhorn volume and on
  celestia's disk.
- Then on celestia: `docker volume rm arcane_arcane-data`,
  `rm -rf /opt/stacks-data/pdm`, and the `/tmp/*.tgz` files.
- Destroy the celestia OpenBao paths. This is the same script plus `--move`; it
  re-verifies the destination before deleting:

  ```bash
  fnox exec -- npx tsx scripts/bao-move.ts clusters/celestia/apps/arcane/credentials clusters/equestria/apps/arcane/credentials --move --apply
  fnox exec -- npx tsx scripts/bao-move.ts clusters/celestia/apps/pdm/root clusters/equestria/apps/pdm/root --move --apply
  ```
- The agents' Traefik routers in `docker/_common/arcane-agent/compose.yaml` are
  inert now. Removing them deletes the `arcane-agent.*` StandardDns records; read
  the warning in `components/StandardDns.ts` first.
