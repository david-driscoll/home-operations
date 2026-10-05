# MCP under agentboard

How an agent running **inside the agentboard pod** (or a kube-coder workspace)
reaches the estate's MCP tools, why that path is different from the one a
laptop takes, and what to do when it looks broken.

Deployment: [`kubernetes/apps/agents/agentboard/`](../../kubernetes/apps/agents/agentboard/).
Gateway: [`kubernetes/apps/agents/toolport/`](../../kubernetes/apps/agents/toolport/)
and its doors, [`toolport-mcp/`](../../kubernetes/apps/agents/toolport-mcp/).
Backends: [`agent-tools-servers/`](../../kubernetes/apps/agents/agent-tools-servers/).

The `agent-tools` VirtualMCPServer that used to front these backends (one
~1000-tool catalogue at `agent-tools-mcp.agents.<root-domain>`, plus an
anonymous in-cluster twin) is **retired**. toolport is the only front door.
Only its MCPGroup survives, in `agent-tools-mcp/`, because every backend names
it in `groupRef`.

## The one rule

**If you are running under agentboard, use the `toolport-<profile>` MCP servers
that are already reachable from inside the container. Do not try to
authenticate to the external doors, and do not reach for `kubectl`/`curl`
wrappers for something a profile already exposes.** Load the `toolport` skill
(`.claude/skills/toolport/SKILL.md`, also mounted user-wide in agentboard) for
the search-then-call workflow.

You are under agentboard if any of these hold:

```bash
env | grep -q STAKATER_AGENTBOARD   # set by the pod
test -f /root/.mcp.json             # the mounted in-cluster MCP config
grep -q agents.svc.cluster.local /etc/resolv.conf
```

## Profiles, and two doors each

toolport splits the backends into six profiles, one MCP server entry each:
`toolport-{infrastructure,networking,home,media,postgres,research}`. Membership
is in [`toolport/resources/registry.json`](../../kubernetes/apps/agents/toolport/resources/registry.json);
the `toolport` skill lists it too. Every profile has two doors onto the same
gateway, and what differs is only who is allowed to knock:

| | External (OAuth) | Internal |
|---|---|---|
| Object | VirtualMCPServer `toolport-<profile>-mcp` | MCPRemoteProxy `toolport-<profile>` |
| Address | `https://toolport-<profile>.agents.<root-domain>/mcp` | `http://mcp-toolport-<profile>-remote-proxy.agents.svc.cluster.local:8080/mcp` |
| Auth | OAuth, browser authorization-code flow via authentik | none asked of the caller; the proxy adds the profile's bearer |
| Exposure | HTTPRoute on the internal gateway, LAN + tailnet | ClusterIP, no hostname, no certificate |
| Guarded by | authentik | [`toolport-mcp/networkpolicy.yaml`](../../kubernetes/apps/agents/toolport-mcp/networkpolicy.yaml) — agentboard, named kube-coder workspaces, and the six OAuth vMCPs |

Both files for a profile are `toolport-mcp/<profile>.yaml`.

The external doors are unusable from the pod and always will be: completing an
authorization-code flow needs a browser and a human, and this container has
neither. **A `Needs authentication` status on a `toolport-*` server inside
agentboard is not something to fix by logging in — it means the client resolved
the wrong URL.** See [Troubleshooting](#troubleshooting).

The internal door's *only* access control is that NetworkPolicy. The proxies
carry bearers for OpenBao, Kubernetes, Proxmox (x5), UniFi, Postgres (as
superuser) and Docker (x4), so read that policy's header before changing
anything about it.

## How the URL gets chosen

The repo's committed [`.mcp.json`](../../.mcp.json) sets each `toolport-<profile>`
URL from `TOOLPORT_<PROFILE>_URL`, which Claude Code expands when it connects.
There is no default in the file, because a default would name the domain
([private-domain-scrub](../plans/private-domain-scrub.md)).

- **Laptop, Codespace** — [`.config/mise.toml`](../../.config/mise.toml) sets
  all six to the profiles' OAuth doors, building them from the root domain it
  decrypts. Start Claude Code from a shell where mise is active in the repo,
  with the age key present. Needs the LAN or Tailscale, and one authentik
  login per profile through `/mcp`.
- **agentboard** — [`helmrelease.yaml`](../../kubernetes/apps/agents/agentboard/helmrelease.yaml)
  sets all six `TOOLPORT_<PROFILE>_URL` to the internal proxies, so the same
  committed file resolves to the in-cluster doors.
- **kube-coder workspaces** — the opt-in
  [`components/toolport`](../../kubernetes/apps/coder/kube-coder/components/toolport/)
  sets the same six variables and the egress policy; the workspace must also be
  named in `toolport-mcp/networkpolicy.yaml`.

There is also [`resources/mcp.json`](../../kubernetes/apps/agents/agentboard/resources/mcp.json)
mounted at `/root/.mcp.json` with the internal URLs hardcoded. It is a genuine
fallback but a *narrow* one, and the reason the env vars exist:

> **Claude Code resolves `.mcp.json` from the session's working directory only.**
> It does not fall back to `$HOME`, and it does not walk parent directories.

An agent works in `/root/home-operations`, which ships its own `.mcp.json`, so
the mounted `$HOME` copy is shadowed the moment you `cd` into the checkout. The
env vars are what make the repo copy resolve correctly too; the mount still
covers sessions started from `$HOME` or from a directory with no `.mcp.json`.

**A stale checkout breaks this silently.** Before #2092 the repo's `.mcp.json`
used one `TOOLPORT_URL` and per-profile `TOOLPORT_TOKEN_*` bearers; the pod no
longer sets either, and the old address times out (`CONNECT_TIMEOUT` on all six
profiles). If every `toolport-*` fails at once, check `git log -1 -- .mcp.json`
against `origin/main` before anything else.

## What is behind the doors

Each profile exposes toolport's meta-tools (`toolport_search_tools`,
`toolport_call_tool`, `toolport_run_script`, `toolport_fetch_result`,
`toolport_status`), not the backends' tools directly. Backend tools are named
`<server id>__<tool>`, e.g. `kubernetes__list_resources`; `toolport_status` in a
profile lists its servers and their tool counts.

| Profile | Servers |
|---|---|
| `infrastructure` | `kubernetes`, `proxmox-{twilight-sparkle,celestia,luna,alpha-site}`, `docker-{celestia,luna,alpha-site}`, `github`, `forgejo`, `pulumi`, `openbao` |
| `networking` | `unifi-{network,protect,access}`, `tailscale`, `homelable` |
| `home` | `home-assistant`, `ha-mcp` |
| `media` | `arr-plex`, `arr-jellyfin`, `ecm`, `teamarr`, `tdarr` |
| `postgres` | `postgres` — every database, tools per database |
| `research` | `context7`, `microsoft-docs`, `nuget`, `degoog` |

`teamarr`'s tool set is built from Teamarr's live `/openapi.json` when its pod
starts (destructive tools hidden), so the count moves with Teamarr's version.
`home-assistant`'s depends on what Home Assistant exposes: it is Assist, so
intents over the exposed entities and nothing about how Home Assistant is set
up. `ha-mcp` is the admin surface next to it -- integrations, the device and
entity registries, automations, helpers, dashboards, history, logs -- with
writes on and the irreversible tools off (`agent-tools-servers/ha-mcp.yaml`).
Its endpoint has no auth of its own, so a NetworkPolicy in that file admits
only toolport. `tdarr` is 66 of
tdarr-mcp's 105 tools, cut down by an `MCPToolConfig` allow-list in
`agent-tools-servers/tdarr.yaml`: nothing that deletes media from disk or
touches users or plugin code. The one raw DB tool, `tdarr_cruddb`, is allowed
because it is the only way to manage flows, and it reaches every collection
in every mode; see [tdarr.md](tdarr.md). `ecm`, `arr-*`, `teamarr` and
`tdarr` all front `equestria` apps and fail 02:00-09:00, when that namespace is
shed. `forgejo` is the in-cluster forge as the `claude-code` account (created
by `stacks/system`): in every organization repository it can write code,
issues, pull requests, Actions (logs, re-run, dispatch), releases and wiki, and
read packages; it has nothing in user-owned repositories, no repository
creation, and no repo-admin. For what the ECM and Teamarr tools are for — and
which ECM write tools currently fail with a 401 — see [iptv.md](iptv.md).

Note the `infrastructure` profile's `kubernetes` server is the working
Kubernetes path from this pod. The separate `kubernetes` entry in `.mcp.json` is
an `npx kubernetes-mcp-server` stdio server and is **known to fail here** with
`CONNECTION_CLOSED`; the `crew_state` entry likewise fails with `ENOENT` because
`crew` is not installed in this image. Neither is a reason to distrust toolport.

## Backend health

toolport aggregates independent backends, and a broken one fails *through* it:
the gateway proxies the call and hands back the backend's own error. **A tool
error is therefore not evidence the MCP path is broken** — check this section
before diagnosing routing.

Verified by direct read-only tool calls on 2026-09-05, through the since-retired
`agent-tools` vMCP (hence the `toolhive-` prefixes):

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
   substitution, resolving to `<root domain>`. The estate's tailnet is actually
   `<tailnet>` — visible in every device name `list_devices` now
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

Worth knowing about, because it would delete the CronJob above entirely. It was
weighed while the `agent-tools` vMCP was the front door; toolport calls
backends directly, so point 1 below would now be asked of toolport instead.

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

### No Python server runs over stdio

Every Python MCP server here serves Streamable HTTP from its own process:
`openbao`, the three `docker-*` and the three `unifi-*`. Adding one as
`transport: stdio` brings back a failure that looks like a healthy server: the
MCPServer is Ready, and every call returns -32602 `Invalid request parameters`
(toolport: `'<name>' failed`; vMCP: `Backend unavailable`).

Three things combine to cause it:

1. **ToolHive's stdio proxy caches `initialize`.** It puts every client on one
   backend session, forwards the first handshake, and answers every later one
   from a cache (`pkg/transport/proxy/streamable/initialize_cache.go`, v0.51.2).
   When the backend container restarts, the proxy re-attaches to the new
   process (`pkg/transport/stdio.go`, `attemptReattachment`) and keeps the
   cache, so the new process never sees `initialize`.
2. **The Python MCP SDK enforces the handshake.** It refuses every request but
   `ping` on a session that has not seen `initialize`. mcp 1.x does this in
   `mcp/server/session.py` (`_received_request`) and logs `Received request
   before initialization was complete`. mcp 2.x moved it to
   `mcp/server/runner.py` (`ServerRunner._on_request`) and **logs nothing**, so
   the only trace in the backend log is the error response itself. The Go and
   TypeScript SDKs do not check, which is why github, pulumi and tailscale
   survive the same restarts under stdio. context7 and tdarr are TypeScript
   too. nuget (.NET) has not been restart-tested.
3. **Anything that restarts only the backend pod triggers it**: a node drain,
   an OOM kill, a Reloader roll. Restarting the proxy Deployment clears the
   cache. So the failure comes and goes, and a server works exactly as long as
   its proxy pod is newer than its backend pod.

Reproduced 2026-09-26 on a copy of the docker server (mcp 2.2.0): 19 tools
before the `-0` pod was deleted, then -32602 on both an existing session and a
new one. The manual fix is `kubectl -n agents rollout restart deploy/<name>`.

**HTTP alone is not enough; the server must also be stateless.** The HTTP
proxy polls the backend StatefulSet's `readyReplicas` and exits if it sees 0
(`pkg/container/runtime/monitor.go`, then `pkg/runner/runner.go`). So a backend
restart often restarts the proxy too: 8 of 12 times in testing. A restarted
proxy has forgotten its sessions, and vMCP never re-initializes a backend
session (`pkg/vmcp/session/internal/backend/mcp_session.go`, "no
reconnection"). A stateful backend then returns `404 Session not found` to
every client that held a session, until that client reconnects. A stateless
one has no session to lose. How each server gets there:

| Server | How it runs stateless |
|---|---|
| `openbao` | `FASTMCP_STATELESS_HTTP=true`, read by the image's FastMCP 3 |
| `docker-*` | The package's CLI is stdio-only, so `python -c` calls its exported `app.run("streamable-http", stateless_http=True)` |
| `unifi-*` | Upstream's image with `UNIFI_MCP_HTTP_ENABLED`. The package has no stateless switch, so a `python -c` wrapper sets the SDK's `stateless_http` default before calling its `main()` |

This proxy behaviour applies to **every** HTTP MCPServer here, Python or not.
Whether the others (degoog, docs, kubernetes, postgres, proxmox, teamarr, ...)
are stateless has not been checked.

**To check a server**, delete its `-0` pod (not the proxy) and call `tools/list`
through `mcp-<name>-proxy:<proxyPort>/mcp` with no handshake and no session
header. A stateless server answers 200 once its pod is back. The docker and
unifi servers took 14-45s.

**Stateless is not the whole story, though.** That check sends no session
header, so it skips the check toolport actually hits. The `404 Session not
found` comes from the **proxy's own session store**
(`transparent_proxy.go`, and `streamable_proxy.go` for stdio servers), before
the backend is asked. A proxy fronting a stdio server always issues a session
id, stateless backend or not. Since 2026-09-28 the operator gives every proxy
a Valkey session store (`toolhive-operator` `defaultRedis`), so a restarted
proxy still knows the session.

### toolport never re-initializes

toolport opens one session per backend when it starts. When a backend later
answers `404 Session not found`, toolport treats that as fatal and never
re-initializes (upstream `downstream.rs`: `TransportError::Fatal` is not a
health failure, so its reconnect path never runs). From then on **every** call
it forwards to that backend fails until toolport restarts. The same happens to
a backend that failed while toolport started: it is listed with 0 tools and
never retried.

A ToolHive proxy forgets a session in two ways:

1. **After 2h idle.** `DefaultSessionTTL` is 2h, sliding
   (`pkg/transport/session/proxy_session.go`). toolport never pings.
2. **When it restarts** -- which, before the Valkey store, was every time its
   backend restarted. The github, pulumi, openbao and tailscale backends
   restart every 20-60 minutes by design: Reloader rolls them as their
   short-lived tokens rotate.

The **session watchdog** sidecar in the toolport pod
(`toolport/resources/watchdog.mjs`) handles both. Every 10 minutes it calls one
read-only canary per backend through toolport
(`toolport/resources/watchdog-canaries.json`), which keeps every session warm.
It serves `:8766/healthz` as toolport's liveness probe, and fails it only for
what a restart fixes:

- a stale session;
- a 0-tool backend that answers now;
- toolport not accepting connections for 5 minutes.

A backend that is merely down, such as `equestria`'s nightly shed, never fails
it. At most one restart per 30 minutes. Its verdicts are JSON lines in the
`watchdog` container's log.

**Adding a server** to `registry.json` means adding a canary for it too. Any
read-only tool works, and so do wrong arguments: a validation error still
proves the session is alive.

**The real fix is upstream**: toolport should clear the session and re-run
`initialize` on a 404, as the MCP spec requires of clients. When a release
does that, the watchdog can go.

## Backend paths through toolport

toolport reaches a backend one of two ways, and a new server has to pick:

- **MCPServer backends** (stdio or HTTP) through their ToolHive proxy Services
  (`mcp-toolhive-<name>-proxy`), which hold the credentials inside the pod. The
  Service listens on the MCPServer's **`proxyPort`**, not always 8080: proxmox
  and teamarr use 8000, degoog uses 4443. Copy the port from the server's
  manifest when adding one to `registry.json`.
- **Remote backends with a bearer** (`arr-plex`, `arr-jellyfin`, `ecm`,
  `home-assistant`) **directly**, with toolport's own copy of the credential
  (`toolport/externalsecret.yaml`, `toolport-backends`, sent as
  `Authorization: Bearer`). A ToolHive MCPRemoteProxy applies its
  `MCPExternalAuthConfig` only when a VirtualMCPServer calls it; a direct call
  gets a 401 from the backend, so these backends have no ToolHive proxy at
  all. `toolport-backends` is also where each key's rotation steps live
  (ECM's is human-minted). `microsoft-docs` is called the same way, at
  Microsoft's public endpoint, with no credential.
- **A remote backend that needs a different header** — `homelable`, which
  demands `X-API-Key` — goes through its MCPRemoteProxy with `headerForward`
  instead, which applies to every request including direct ones. toolport can
  only send `Authorization: Bearer` (upstream `remote.rs`,
  `first_vaulted_secret`). That makes the proxy's Service a credential, so
  `agent-tools-servers/homelable.yaml` carries a NetworkPolicy admitting only
  toolport. Any future header-auth backend needs the same pair.

`toolport/networkpolicy.yaml` admits only the six profile proxies to the
gateway. Each door's OAuth server has its own redirect URI in
`toolhive/definition.yaml`, and a door's login fails at authentik until an
`applications` stack run registers that URI.

New entries in the repo's `.mcp.json` need the same one-time project-server
approval as the `Pending approval` row below.

## Troubleshooting

Check what the client actually resolved — the URL, not just the status:

```bash
claude mcp list 2>&1 | grep toolport
claude mcp get toolport-infrastructure
```

| Symptom | Cause | Fix |
|---|---|---|
| All six `CONNECT_TIMEOUT`, URL shows `TOOLPORT_URL` | Stale checkout: its `.mcp.json` predates the per-profile doors | Update the checkout to `origin/main`, restart `claude` |
| URL is the `https://` hostname, status `Needs authentication` | `TOOLPORT_<PROFILE>_URL` not set in the pod, or a stale pod predating it | Confirm `env \| grep TOOLPORT_`; restart the pod to pick up the HelmRelease change |
| Status `Pending approval` | Changing `.mcp.json` re-triggers project-server approval | Run `claude` once and approve, or add the entry to `.claude/settings.local.json`'s `enabledMcpjsonServers` |
| Connection refused / timeout on an internal URL | NetworkPolicy no longer selects this pod, or the proxy is down | Check the `app.kubernetes.io/name: agentboard` selector in `toolport-mcp/networkpolicy.yaml`; check the `toolport-<profile>` proxy pods |
| A profile connects but a server is missing from `toolport_status` | It is in another profile, or failed discovery | Check `registry.json`; `toolport_status` in the right profile |
| `toolport_status` lists a server under "exposing 0 tools" | It failed while toolport started, and toolport never retries | The watchdog restarts toolport once the backend answers; see "toolport never re-initializes" |
| `HTTP 404 {"code":-32001,"message":"Session not found"}` from a backend's tools | toolport holds a session that backend's proxy has forgotten | The watchdog restarts toolport within ~15 min; to do it now, restart `deploy/toolport` in `agents` (below) |

**Break glass: restarting toolport without toolport.** When every backend is
stale, the `kubernetes` tools you would restart it with are stale too. The
kubernetes MCP server's proxy answers directly from agentboard:
`initialize` → `notifications/initialized` → `tools/call delete_resource`
on the toolport pod, all against
`http://mcp-toolhive-kubernetes-proxy.agents.svc.cluster.local:8080/mcp`.

Probe a door directly, bypassing the MCP client entirely:

```bash
curl -sS -D - -X POST http://mcp-toolport-infrastructure-remote-proxy.agents.svc.cluster.local:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"probe","version":"1"}}}'
```

A healthy reply is a 200 with an `Mcp-Session-Id` header. Pass that header back
(plus a `notifications/initialized` notification) to call `tools/list` — seven
`toolport_*` meta-tools — or `tools/call` `toolport_status`. That proves the
door and the gateway, **not** the backends: `toolport_status` reads toolport's
cache, and a backend whose session went stale still shows its full tool count.
Only a real tool call reaches a backend. If this succeeds while `claude mcp get`
shows a failure, the endpoint is fine and the problem is client-side URL
resolution.
