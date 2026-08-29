# agent-mcp-tools

Every MCP server (`MCPServer` or `MCPRemoteProxy`) that joins the shared
`agent-tools` `MCPGroup` (`../toolhive-agent-tools/`) lives here, one
directory per backend, grouped once the roster grew past what fit
comfortably as flat siblings of the ToolHive control-plane pieces in
`../` (`toolhive-operator`, `toolhive-operator-crds`, `toolhive-valkey`,
`toolhive-registry`, `toolhive-ui`, `toolhive-docs`, and
`toolhive-agent-tools` itself — the group/front door, not a server, so it
stays at the top level rather than moving in here).

Two of these are `base/` + per-instance overlay pairs, not flat
directories, because the underlying servers differ from each other in only
one or two fields:

- `toolhive-docker/` — one `MCPServer` per Dockge host
  (`docker-socket-proxy:2375`), overlays patch only `DOCKER_HOST`.
- `toolhive-proxmox/` — one `MCPServer` per Proxmox hypervisor, overlays
  patch `PROXMOX_HOST`; `alpha-site` additionally patches its
  `ExternalSecret`'s OpenBao path (the one host on a separate credential).

Everything else here is a flat directory: `ks.yaml` + `kustomization.yaml`
+ `mcpserver.yaml`/`mcpremoteproxy.yaml` (+ `externalsecret.yaml` where a
credential is needed), same shape `../toolhive-docs/` uses, just without
its own hostname/OIDC config — see any one `mcpserver.yaml`'s header for
why (`groupRef: {name: agent-tools}` instead).
