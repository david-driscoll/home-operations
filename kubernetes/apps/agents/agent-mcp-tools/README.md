# agent-mcp-tools

Two pieces, two Flux Kustomizations:

- **`agent-tools-mcp/`** — the front door: the `agent-tools` `MCPGroup`,
  its `VirtualMCPServer`, the shared hostname's `HTTPRoute`, and the
  authentik `ApplicationDefinition`. Renamed from `toolhive-agent-tools`
  when this moved in.
- **`agent-tools-servers/`** — every MCP server (and `MCPRemoteProxy`)
  that joins that group via `groupRef: {name: agent-tools}`, plus the
  shared `agent-debug` ClusterRole (`rbac.yaml`) and `toolhive-docs`
  (`docs.yaml`, the one pre-agent-tools server, still on its own nested
  hostname pattern rather than the shared group). All installed by ONE
  Flux Kustomization instead of one per server — see that directory's own
  `kustomization.yaml`/`ks.yaml` headers for why, and for what that meant
  for `${APP}` naming (every resource now has a literal `metadata.name`
  instead).

Most servers are a single flat file, named after the server with no
`toolhive-` prefix (`context7.yaml`, `degoog.yaml`, `unifi-access.yaml`,
...) — a server needing more than one manifest (an `ExternalSecret`, a
`ServiceAccount`, ...) just has more than one YAML document in that same
file, `---`-separated. Two exceptions stay directories, not files:
`docker/` and `proxmox/` are kustomize base+overlay pairs (one MCPServer
definition parameterized per host via a JSON6902 patch), because
collapsing four or five near-identical instances into flat copies would
have reintroduced the exact duplication kustomize patches exist to avoid.
