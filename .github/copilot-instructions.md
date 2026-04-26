# GitHub Copilot Instructions — home-operations

> Primary guides: [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md). Read those first.
> Domain-specific instructions are in [`.github/instructions/`](.github/instructions/).

---

## Cluster & Node Topology

| Name | Type | Role |
|---|---|---|
| **Celestia** | Kubernetes | Primary k8s cluster |
| **Luna** | Kubernetes | Secondary k8s cluster |
| **Equestria** | Dockge/Docker | Docker host |
| **Stargate Command (SGC)** | Dockge/Docker | Docker host; hosts Authentik, 1Password Connect |
| **Alpha Site** | Dockge/Docker | Non-production / test host |

Proxmox nodes have MLP-themed hostnames (e.g. `twilight-sparkle`). The 1Password vault for all secrets is **`Eris`**.

---

## Pulumi Patterns

### ComponentResource hierarchy

```
GlobalResources
  └── ProxmoxHost (one per physical node)
        └── DockgeLxc (one per Dockge LXC on that node)
              └── StandardDns, OnePasswordItem, Tailscale device …
        └── TruenasVm
```

Always pass `{ parent: this }` through the `cro` pattern to preserve the resource tree.

### `StandardDns` — always use for DNS entries

`StandardDns` creates records in **Unifi + Cloudflare + AdGuard** atomically. Never create individual DNS records with a raw provider call.

```ts
new StandardDns("my-service", {
  hostname: interpolate`my-service.${globals.searchDomain}`,
  ipAddress: "10.10.x.x",
  type: "A",
}, globals, { parent: this });
```

### Writing stack outputs back to 1Password

Use the generated `OnePasswordItem` dynamic resource (from `@dynamic/1password/OnePasswordItem.ts`) — see `stacks/authentik/index.ts` for the canonical pattern. Never hand-write credentials to files.

### `AuthentikOutputs` — reading structured 1Password data

`AuthentikOutputs` maps 1Password item *sections* into typed TypeScript fields. When consuming Authentik IDs in another stack, load the item and pass it to `new AuthentikOutputs(item)`.

### Hostname conventions

| Context | Pattern | Example |
|---|---|---|
| Proxmox host | `{name}.host.driscoll.tech` | `twilight-sparkle.host.driscoll.tech` |
| Container / Dockge | `{cluster}.driscoll.tech` subdomain | `celestia.driscoll.tech` |
| Tailscale | `{name}.{tailscaleDomain}` | `dockge-celestia.<tailnet>` |

Use `getHostnames` / `getContainerHostnames` from `@components/helpers.ts` — do not interpolate these manually.

### `constants.ts` — use typed references

Import `Tailscale`, `dns`, `Roles`, `Groups` from `@components/constants.ts` for type-safe Tailscale tags, port groups, and role names. Never hard-code tag strings like `"tag:dockge"`.

---

## Docker / Dockge Patterns

> See [docker-dockge-memory.instructions.md](instructions/docker-dockge-memory.instructions.md) for variable scoping and Traefik routing rules.

### Every service needs a `definition.yaml`

Place a `definition.yaml` alongside `compose.yaml`. It is the source of truth for Authentik SSO config, Gatus uptime checks, and homepage metadata.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/david-driscoll/stargate-command-cluster/refs/heads/main/schemas/definition.schema.json
apiVersion: driscoll.dev/v1
kind: ApplicationDefinition
metadata:
  name: my-service
spec:
  name: My Service
  category: ${CLUSTER_TITLE}
  url: &url https://${APP}.${CLUSTER_DOMAIN}
  icon: https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/my-service.svg
  access_policy:
    groups:
      - admins          # or users, family, friends, media-managers
  authentik:
    proxy:
      mode: "forward_single"
      externalHost: *url
  gatus:
    - url: *url
      conditions:
        - "[STATUS] == 200"
```

### Standard Compose conventions

- **Image pinning**: Always pin images with a SHA256 digest (`image: org/img:tag@sha256:…`).
- **`autoheal: true` label**: Add to any container that should be auto-restarted by the autoheal sidecar.
- **Authentik middleware**: Public-facing services use `traefik.http.routers.<name>.middlewares: authentik-outpost@docker`.
- **Entrypoints**: Use `websecure,tailscale` for internet + Tailscale access; `tailscale` alone for internal-only.
- **Network**: All services join `dockge_default` (external). Declare it at the bottom of `compose.yaml`:
  ```yaml
  networks:
    dockge_default:
      external: true
  ```
- **`x-dockge.urls`**: List the service's public URLs so Dockge shows them in the dashboard.

---

## Safety Rules (summary)

- Never commit plaintext secrets — use `op://Eris/…` references in `.mise.toml`, encrypted config in `Pulumi.*.yaml`.
- Always run `pulumi preview` before `pulumi up`, especially for DNS or provider changes.
- Test destructive changes on **Alpha Site** before Celestia/Luna/SGC.
- `OPClient` writes to the live `Eris` vault — be intentional about create/update/delete calls.
- Never call cluster-modifying MCP tools or `pulumi up` without explicit user consent.