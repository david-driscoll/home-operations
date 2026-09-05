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
| `toolhive-github_` | 401 after ~1h; fixed by a periodic restart |
| `toolhive-tailscale_` | API calls failed on two counts — wrong tailnet name and a stale key; both fixed |
| `toolhive-pulumi_` | read-only plugin cache; fixed by setting `PULUMI_HOME` |

### One trap worth knowing about

Two of the three failures reported a cause that was not the cause.

`list_devices` returned `spawn tailscale ENOENT`, which reads as "this image
needs a Tailscale binary". It does not. That package calls the REST API first
and only shells out to the CLI **when the API call fails**, so the ENOENT was
the fallback failing and its message had replaced the API error that actually
mattered. `get_version` reports `cliAvailable: false` and is perfectly content.

Underneath it were **two** faults, not one, and each was individually enough to
break the API call — which is why the first two attempts at a single root cause
both looked right and both were incomplete:

1. **The tailnet name was wrong.** `TAILSCALE_TAILNET` was a `${ROOT_DOMAIN}`
   substitution, resolving to `driscoll.tech`. The estate's tailnet is actually
   `opossum-yo.ts.net` — visible in every device name `list_devices` now
   returns — so that value could never have matched.
2. **The API key was stale.** It is re-minted every 5 minutes against a ~1h
   lifetime, and the pod had held one from container start for nearly seven
   hours.

Likewise `github_get_me` returning `401 Bad credentials` invites you to go
looking for a bad token. The token is fine — it is *stale*, because an env var
resolves once at container start and that credential is re-minted hourly.

When a backend misbehaves, prefer the tool whose failure is **not** wrapped in a
fallback: `get_version` over `list_devices`, a direct `curl` probe over either.

### The three fixes

- **`toolhive-github_`** — `GITHUB_PERSONAL_ACCESS_TOKEN` comes from a
  `secretKeyRef`, resolved once at start, while `github-token` is an App
  installation token re-minted every 30m against a 60m life. The image has no
  file-based credential, so the `gh`/`GH_CONFIG_DIR` trick cannot apply — the
  pod has to be restarted when the token rotates. Reloader does that, driven by
  a `reloader.stakater.com/auto` annotation declared on
  `podTemplateSpec.metadata` in
  [`github.yaml`](../../kubernetes/apps/agents/agent-tools-servers/github.yaml).

  The annotation goes on the **pod template**, not the StatefulSet, because the
  StatefulSet belongs to the operator. That works because Reloader falls back to
  pod-template annotations when the workload carries none
  (`pkg/common/common.go`), and the operator propagates what you write in
  `podTemplateSpec.metadata.annotations` onto that template
  (`pkg/container/kubernetes/client.go`). Note the annotation on the
  `github-token` Secret does nothing on its own — Reloader keys off the
  workload.
- **`toolhive-tailscale_`** — `TAILSCALE_TAILNET` was a `${ROOT_DOMAIN}`
  substitution that the file itself flagged as never verified. Now `-`,
  Tailscale's alias for the credential's default tailnet, matching what
  `stacks/unifi-network/tailscale-drop-firewall-rule.ts` already does against
  the same endpoint.
- **`toolhive-pulumi_`** — the `pulumi` CLI resolved its plugin root to
  `/home/node/.pulumi` on a read-only rootfs despite `HOME=/tmp`. `PULUMI_HOME`
  now points into the writable emptyDir. Whether plugin *download* then
  succeeds depends on egress and is unverified.


### The option not taken: a remote backend with header injection

Worth knowing about, because it would delete the CronJob above entirely.

ToolHive can register a backend that runs **no pods at all**. `MCPServerEntry`
(v1beta1, installed here and the stored version) is a "zero-infrastructure
catalog entry": the vMCP connects straight to a remote URL, and headers can be
injected from a Secret.

```yaml
apiVersion: toolhive.stacklok.dev/v1beta1
kind: MCPServerEntry
metadata:
  name: toolhive-github
spec:
  remoteUrl: https://api.githubcopilot.com/mcp
  transport: streamable-http
  groupRef:
    name: agent-tools
  headerForward:
    addHeadersFromSecret:
      - headerName: Authorization
        valueSecretRef:
          name: github-token
          key: authorization      # would need to render "Bearer <token>"
```

That removes the pod whose env var goes stale, which is the entire bug. Three
things stopped it being the fix here, and all three are checkable:

1. **Does the vMCP re-read the Secret?** If it caches at startup, the staleness
   has just moved to the vMCP — which fronts *every* backend, making it strictly
   worse than a pod that only serves GitHub.
2. **Does GitHub's hosted MCP accept a GitHub App installation token?** The
   estate's credential is an App token, not a user PAT, and the hosted endpoint
   is documented with PATs.
3. **`headerForward` has no format string.** It injects a raw Secret value, so
   the Secret would need a key already containing `Bearer <token>` — a fourth
   rendering in the `github-token` ExternalSecret, which already renders the
   same token four ways.

Do **not** go looking for `VirtualMCPServer.outgoingAuth` with
`type: service_account`, `credentialsRef` and `headerFormat: "Bearer {token}"`
to solve point 3. That shape appears in an example in ToolHive's own
`docs/operator/virtualmcpserver-api.md`, but **it does not exist in the API, in
any version** — and upgrading will not bring it:

- The backend `type` enum has been `discovered;externalAuthConfigRef` in
  `virtualmcpserver_types.go` continuously from **v0.28.0** (2026-05-19)
  through `main`. `service_account` appears zero times in those Go types at
  every version checked.
- That same upstream doc contradicts its own example: the `BackendAuthConfig`
  field reference printed directly beneath it lists only `discovered` and
  `externalAuthConfigRef`, and no `serviceAccount` field at all.

So it is upstream documentation drift, not a feature behind a version gate.
`outgoingAuth` itself is long-standing and is present here; only that backend
type is fictional. This cluster runs **v0.46.0**, the current release.


### The Secret-level Reloader annotation is inert

Every server here annotates its ExternalSecret and target Secret with
`reloader.stakater.com/auto: "true"`. **That does nothing on its own.** Reloader
keys off the *workload*, and a Secret carrying the annotation is not a workload.

The consequence went unnoticed for a long time: no MCP server had a working
reload path, so each ran whatever its Secret contained at pod start,
indefinitely. Harmless for static credentials — the Secret's content never
changes — but silently fatal for anything that rotates:

- `toolhive-tailscale` — its API key is re-minted **every 5 minutes** by
  `stacks/unifi-network/tailscale-api-token.ts` against a ~1h lifetime, so a pod
  more than an hour old is holding an expired key. This was one of the two
  faults behind its `spawn tailscale ENOENT`; the other was a wrong tailnet
  name. See [One trap worth knowing about](#one-trap-worth-knowing-about).
- `toolhive-openbao` — a `VaultDynamicSecret`, dynamic by definition.
- `toolhive-pulumi` — pulls the same hourly `github-token` via `secretKeyRef`.

The fix is `reloader.stakater.com/auto` on `spec.podTemplateSpec.metadata.annotations`,
which reaches the operator-owned StatefulSet's pod template. It is applied to
every MCPServer that consumes a Secret. Servers consuming none (`degoog`,
`docs`, `kubernetes`, `nuget`) are deliberately left alone.

**Not applied cluster-wide, deliberately.** Reloader's chart has
`reloader.autoReloadAll`, which would remove the need for any annotation. Turning
it on would also restart every workload referencing `github-token` — agentboard,
eight Pulumi Stack workspaces, renovate, maintainerr, dynacat — **every 30
minutes**, which is exactly the restart loop `agentboard/helmrelease.yaml`
records as having been removed on purpose. If it is ever enabled, those
workloads need `reloader.stakater.com/ignore: "true"` first.

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
