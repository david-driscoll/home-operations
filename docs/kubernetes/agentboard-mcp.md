# MCP under agentboard

How an agent running **inside the agentboard pod** reaches the estate's MCP
tools, why that path is different from the one a laptop takes, and what to do
when it looks broken.

Deployment: [`kubernetes/apps/agents/agentboard/`](../../kubernetes/apps/agents/agentboard/).
Servers: [`kubernetes/apps/agents/agent-tools-mcp/`](../../kubernetes/apps/agents/agent-tools-mcp/)
and [`agent-tools-servers/`](../../kubernetes/apps/agents/agent-tools-servers/).

## The one rule

**If you are running under agentboard, use the `agent-tools` MCP server that is
already reachable from inside the container. Do not try to authenticate to the
external one, and do not reach for `kubectl`/`curl` wrappers for something
`agent-tools` already exposes.**

You are under agentboard if any of these hold:

```bash
env | grep -q STAKATER_AGENTBOARD   # set by the pod
test -f /root/.mcp.json             # the mounted in-cluster MCP config
grep -q agents.svc.cluster.local /etc/resolv.conf
```

## Two front doors, one set of backends

Both doors aggregate the **same** [`MCPGroup`](../../kubernetes/apps/agents/agent-tools-mcp/mcpgroup.yaml),
with `conflictResolution: prefix`, so **tool names are identical on both**. What
differs is only who is allowed to knock.

| | External | Internal |
|---|---|---|
| Object | [`virtualmcpserver.yaml`](../../kubernetes/apps/agents/agent-tools-mcp/virtualmcpserver.yaml) | [`virtualmcpserver-internal.yaml`](../../kubernetes/apps/agents/agent-tools-mcp/virtualmcpserver-internal.yaml) |
| Address | `https://agent-tools-mcp.agents.<root-domain>/mcp` | `http://vmcp-agent-tools-internal.agents.svc.cluster.local:4483/mcp` |
| Auth | OIDC, browser authorization-code flow | `anonymous` |
| Exposure | HTTPRoute, LAN + tailnet | ClusterIP, no hostname, no certificate |
| Guarded by | Authentik | [`networkpolicy.yaml`](../../kubernetes/apps/agents/agent-tools-mcp/networkpolicy.yaml) — agentboard pods only |

The external door is unusable from the pod and always will be: completing an
authorization-code flow needs a browser and a human, and this container has
neither. **A `Needs authentication` status on `agent-tools` inside agentboard is
not something to fix by logging in — it means the client resolved the wrong
URL.** See [Troubleshooting](#troubleshooting).

The internal door's *only* access control is that NetworkPolicy. It fronts
OpenBao, Kubernetes, Proxmox (x5), UniFi, Postgres and Docker (x4) with no token
and no user identity, so read that policy's header before changing anything
about it.

## How the URL gets chosen

The repo's committed [`.mcp.json`](../../.mcp.json) sets the `agent-tools` URL
from an env template — `AGENT_TOOLS_MCP_URL`, defaulting to the external
hostname. Claude Code expands that template when it connects.

- **Laptop, CI, Codespace** — variable unset, default applies, external
  authenticated door, unchanged from before.
- **agentboard** — [`helmrelease.yaml`](../../kubernetes/apps/agents/agentboard/helmrelease.yaml)
  sets `AGENT_TOOLS_MCP_URL` to the internal Service, so the same committed file
  resolves to the anonymous in-cluster endpoint.

There is also [`resources/mcp.json`](../../kubernetes/apps/agents/agentboard/resources/mcp.json)
mounted at `/root/.mcp.json` with the internal URL hardcoded. It is a genuine
fallback but a *narrow* one, and the reason the env var exists:

> **Claude Code resolves `.mcp.json` from the session's working directory only.**
> It does not fall back to `$HOME`, and it does not walk parent directories.

An agent works in `/root/home-operations`, which ships its own `.mcp.json`, so
the mounted `$HOME` copy is shadowed the moment you `cd` into the checkout. The
env var is what makes the repo copy resolve correctly too; the mount still
covers sessions started from `$HOME` or from a directory with no `.mcp.json`.

## What is behind the door

~357 tools, prefixed by backend. Names are the same on both doors:

| Prefix | Tools | Prefix | Tools |
|---|---|---|---|
| `toolhive-proxmox-{twilight-sparkle,luna,celestia,alpha-site}_` | 47 each | `toolhive-pulumi_` | 12 |
| `toolhive-github_` | 44 | `toolhive-nuget_` | 6 |
| `toolhive-tailscale_` | 19 | `toolhive-unifi-{network,protect,access}_` | 5 each |
| `toolhive-docker-{luna,celestia,alpha-site}_` | 19 each | `toolhive-kubernetes_` | 5 |
| `toolhive-microsoft-docs_` | 3 | `toolhive-{postgres,openbao,degoog,context7}_` | 2 each |

Note `toolhive-kubernetes_*` is the working Kubernetes path from this pod. The
separate `kubernetes` entry in `.mcp.json` is an `npx kubernetes-mcp-server`
stdio server and is **known to fail here** with `CONNECTION_CLOSED`; the
`crew_state` entry likewise fails with `ENOENT` because `crew` is not installed
in this image. Neither is a reason to distrust `agent-tools`.

## Backend health

The vMCP aggregates independent backends, and a broken one fails *through* it:
the aggregator proxies the call and hands back the backend's own error. **A tool
error is therefore not evidence the MCP path is broken** — check this section
before diagnosing routing.

Verified by direct read-only tool calls on 2026-09-05:

| Backend | State |
|---|---|
| `toolhive-kubernetes_` | ✅ live cluster reads |
| `toolhive-proxmox-*_` | ✅ node status across hosts |
| `toolhive-docker-*_` | ✅ container listings |
| `toolhive-postgres_` | ✅ schema search |
| `toolhive-unifi-*_` | ✅ tool index |
| `toolhive-context7_` | ✅ library resolve + docs query |
| `toolhive-microsoft-docs_` | ✅ docs search |
| `toolhive-openbao_` | not probed — both tools read secret material |
| `toolhive-github_` | ⚠️ 401s ~1h after each pod start |
| `toolhive-tailscale_` | ⚠️ CLI-backed tools fail; API-backed tools work |
| `toolhive-pulumi_` | ⚠️ registry tools failed on a read-only plugin cache |

### `toolhive-github_` — 401 Bad credentials

`GITHUB_PERSONAL_ACCESS_TOKEN` comes from a `secretKeyRef`, which resolves **once
at container start**. `github-token` is an App installation token re-minted every
30m against a 60m life, so the baked-in value dies about an hour in and the pod
keeps presenting it. Diagnosis and the rejected fixes are in
[`agent-tools-servers/github.yaml`](../../kubernetes/apps/agents/agent-tools-servers/github.yaml).

**Workaround:** use `gh` from the agentboard pane instead — it reads
`GH_CONFIG_DIR` and is fresh per invocation.

### `toolhive-tailscale_` — `spawn tailscale ENOENT`

The package mixes REST-backed and CLI-backed tools; the CLI-backed half tries to
exec a `tailscale` binary absent from `node:22-alpine`. The API key is minted
correctly and is not the problem. See
[`agent-tools-servers/tailscale.yaml`](../../kubernetes/apps/agents/agent-tools-servers/tailscale.yaml).

### `toolhive-pulumi_` — read-only plugin cache

The `pulumi` CLI resolved its plugin root to `/home/node/.pulumi` on a read-only
rootfs despite `HOME=/tmp`. Addressed by setting `PULUMI_HOME` at
[`agent-tools-servers/pulumi.yaml`](../../kubernetes/apps/agents/agent-tools-servers/pulumi.yaml);
whether plugin *download* then succeeds depends on egress and is unverified.

## Troubleshooting

Check what the client actually resolved — the URL, not just the status:

```bash
claude mcp get agent-tools
```

| Symptom | Cause | Fix |
|---|---|---|
| URL is the `https://` hostname, status `Needs authentication` | `AGENT_TOOLS_MCP_URL` not set in the pod, or a stale pod predating it | Confirm `env \| grep AGENT_TOOLS_MCP_URL`; restart the pod to pick up the HelmRelease change |
| Status `Pending approval` | Changing the URL in `.mcp.json` re-triggers project-server approval | Run `claude` once and approve, or add `agent-tools` to `.claude/settings.local.json`'s `enabledMcpjsonServers` |
| Connection refused / timeout on the internal URL | NetworkPolicy no longer selects this pod, or the vMCP is down | Check the `app.kubernetes.io/name: agentboard` selector in `networkpolicy.yaml`; check the `agent-tools-internal` pods |

Probe the endpoint directly, bypassing the MCP client entirely:

```bash
curl -sS -X POST http://vmcp-agent-tools-internal.agents.svc.cluster.local:4483/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"probe","version":"1"}}}'
```

A healthy reply carries `"serverInfo":{"name":"agent-tools-internal",...}` and an
`Mcp-Session-Id` header. Pass that header back (plus a
`notifications/initialized` notification) to call `tools/list` or `tools/call`.
If this succeeds while `claude mcp get` shows a failure, the endpoint is fine and
the problem is client-side URL resolution — the first row of the table above.
