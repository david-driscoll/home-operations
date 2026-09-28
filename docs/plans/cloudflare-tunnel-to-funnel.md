# Cloudflare Tunnel → Tailscale Funnel

**Status:** plan, 2026-09-27. Step 1 (#2162) went live 2026-09-28. Step 2 (#2168) is in review, redesigned 2026-09-28 to route Funnel through a dedicated Traefik door with CrowdSec (§C, §C4); nothing else is built yet. Decisions marked ✅ were taken by
David on 2026-09-27 and 2026-09-28. Still open in [§J](#j-open-questions), none of which blocks
step 2:
- J4 (TikTok) can wait until a TikTok app exists.
- J7 (a separate taildrive OAuth client) needs the Tailscale admin console.
- J9, J10 and J13 are refinements.
- J11 lands with step 5.
The research, and an adversarial review of this plan, ran as read-only agent sweeps against the
repo, live cluster, tailnet, Loki and upstream source.

## A. Why, and what actually crosses the tunnel today

Every public name in Equestria reaches the cluster through **one** remotely configured
Cloudflare tunnel (`74761397-…`, named `Equestria`, config version 22):

- `stacks/vault/index.ts` → `components/CloudflareTunnel.ts` adopts it. It writes the ingress
  rules, derived live from HTTPRoutes attached to Gateway `network/external`
  (`stacks/vault/externalHostnames.ts`, `components/tunnelRules.ts`).
- `kubernetes/apps/network/cloudflare-tunnel/` runs the 2-replica `cloudflared` connector.
- Every rule targets Traefik's `tunnel` entrypoint (:8444), which only the `external` Gateway
  listens on. That entrypoint is the boundary added after the 2026-09-15 postiz exposure.

The public surface is small, and one half of it is idle:

| Public name | Path | Backend | Real traffic | Funnel? |
|---|---|---|---|---|
| `flux-equestria-webhook.driscoll.tech` | `^/hook/` | `flux-system/webhook-receiver:80` | 515 GitHub deliveries in 72h, all 200 | ✅ yes, only GitHub ever sees the URL |
| `postiz.driscoll.tech` | `^/uploads/` | postiz `cdn` controller (`equestria/postiz-cdn:8080`) | 0 external fetches in 30d; postiz has 0 integrations, 0 posts, 0 media | ✅ yes, with a postiz patch (§E) |
| `castle-of-friendship.driscoll.tech` (`${EXTERNAL_DOMAIN}`) | — | CNAME hop to the tunnel for the two names above | — | deleted last |
| `destiny`, `flux-sgc-webhook`, `tulip` | — | dead tunnels `d233fc0d…`, `85a16359…` (Cloudflare 1033) | — | stale, delete by hand |
| `www.driscoll.tech` | — | Cloudflare 1016 | — | stale, delete by hand |

These figures come from:

- the live cloudflared config and the Traefik access logs, both via Loki;
- external-dns debug logs, which see only one zone, `driscoll.tech`;
- public DoH lookups plus edge probes;
- the postiz DB, read-only.

Nothing on Celestia, Luna or Alpha Site runs cloudflared, and UniFi shows no 80/443 WAN forwards.

**What stays on Cloudflare afterwards:**

- the `driscoll.tech` DNS zone: external-dns `cloudflare-dns` still publishes about 112 other
  records;
- ACME DNS-01 for cert-manager and the Dockge Traefiks.

This plan removes the **tunnel**, not Cloudflare.

## B. What Funnel can and cannot do (verified 2026-09-27)

- **No custom domains.** Funnel serves only `<name>.opossum-yo.ts.net`
  ([KB 1223](https://tailscale.com/kb/1223/funnel)). Funnel relays route by TLS SNI and never
  decrypt, so a CNAME from `driscoll.tech` still presents the custom SNI and relays drop it.
  - A probe of relays `208.111.34.11` and `199.38.181.54` with `SNI=postiz.driscoll.tech` gets the
    connection closed right after the ClientHello.
  - Node-side bring-your-own-domain plumbing ([#19910](https://github.com/tailscale/tailscale/pull/19910))
    is in 1.102.x, but the relay and control side is not enabled.
  - A July draft by Tailscale product ([#20651](https://github.com/tailscale/tailscale/pull/20651))
    scopes custom domains out, and [#11563](https://github.com/tailscale/tailscale/issues/11563)
    has no ETA.
- Only ports 443, 8443 and 10000. Bandwidth limits are undisclosed and cannot be configured.
- **Operator v1.102.4 serves Funnel only on a _standalone_ Ingress** (`ingress.go:185`). The
  ProxyGroup/HA path (`ingress-for-pg.go`) ignores `tailscale.com/funnel`, and Tailscale
  Services cannot be funneled. Each public endpoint is therefore **one single-replica proxy**
  (`ingress.go:237`) running as the `proxies` ServiceAccount in `tailscale-system`.
- The backend scheme is `https+insecure://` only when the port is 443 or is named `https`;
  otherwise it is `http://` (`ingress.go:364`). The backend Service must be in the Ingress's own
  namespace. **Every** rule and path becomes a handler (`ingress.go:371-391`), so nothing but the
  Ingress spec bounds what gets published.
- **Paths are per mount.** tailscaled tries an exact match, then `path.Clean`, then walks up to
  parent paths. Anything not under a mount gets a 404, so `/uploads/../api/` returns 404 and `/`
  returns 404 (`ipn/ipnlocal/serve.go:804-860`). The backend receives the original path under the
  mount.
- **What the next hop sees from Funnel traffic** (tailscaled's proxy, `ipn/ipnlocal/serve.go`
  v1.102.5):
  - **`Host` is whatever the client sent.** The handler is chosen by TLS SNI (`serve.go:807-818`),
    but the Host header is forwarded verbatim (`:976-978`). Well-behaved clients send the ts.net
    name; a hostile one can name any host, and the device's path mount does not confine it (§C2).
  - **`X-Forwarded-For` is set, not appended,** to the one client address, after Go's ReverseProxy
    has stripped the inbound value (`serve.go:1068-1076`), so a client cannot forge it.
    `X-Forwarded-Proto` is `https`, and `X-Forwarded-Host` is the Host.
  - `Tailscale-Funnel-Request: ?1` is added, and tailnet identity headers are stripped
    (`:1078-1092`).
  - **Not stripped:** client-supplied `X-Real-Ip`, `X-Forwarded-Port/-Prefix/-Uri/-Method`, the
    TLS-client-cert headers, other proxies' client-IP headers (`CF-Connecting-IP`,
    `True-Client-IP` and similar) and underscore aliases. The funnel entrypoint strips them (§C4).
- Tags are fixed when the proxy's auth key is minted. A standalone proxy never gets a new key
  ([#20744](https://github.com/tailscale/tailscale/issues/20744)).
- Open [#21114](https://github.com/tailscale/tailscale/issues/21114): Funnel can go stale after a
  control reconnect while the pod looks healthy. A pod restart only sometimes clears it.
- **What we lose compared with Cloudflare:**
  - edge DDoS absorption;
  - the WAF;
  - caching;
  - the zone-added `HSTS` and `nosniff` headers.

  There were no Access policies to lose. Both public backends are narrow: an HMAC-checked
  webhook, and a read-only static server of unguessable paths.

## C. Target design ✅

```
GitHub ──https──▶ Funnel relay ──SNI──▶ ts-…-0 (tailscale-system, tag:funnel)
                                          │ serve: /hook/ → http://traefik-funnel.network:8445/hook/
                                          ▼
             Traefik entrypoint `funnel` :8445 (plain HTTP, ClusterIP only, not on the LB;
               only Funnel proxy pods may connect -- CiliumNetworkPolicy)
               ├─ entrypoint middlewares: crowdsec-bouncer-funnel (enabled) → funnel-strip-headers
               └─ binds only routes on Gateway network/funnel
                    ▼
               HTTPRoute flux-system/funnel-flux-equestria-webhook → webhook-receiver:80

TikTok/Meta/browsers ──▶ relay ──▶ ts-…-0 ── /uploads/ ──▶ same door ──▶ HTTPRoute equestria/funnel-postiz-media → postiz-cdn:8080
postiz pod ──(CoreDNS: that one name → Quad9 → relay IP)──▶ same path, public IP ⇒ passes SSRF guard
```

**Public traffic goes through Traefik, on a door of its own** (redesigned 2026-09-28, so that
CrowdSec can run on it: the bouncer is a Traefik plugin).
- Each Funnel proxy is a standalone Ingress in `network`, and it may point only at
  `traefik-funnel:funnel`: Traefik's dedicated `funnel` entrypoint, on a ClusterIP-only Service.
- What that door serves is exactly the HTTPRoutes attached to Gateway `network/funnel`, which an
  admission policy pins to a reviewed allow-list (§C2).
- The 2026-09-15 failure mode is closed the way the `tunnel` entrypoint closed it: no internal
  route is bound to the public door. This time it is enforced. `asDefault` keeps default-bound
  routers off it, admission refuses every other way onto it, and a CiliumNetworkPolicy lets only
  the Funnel proxies connect to it (§C4).

The door brings back Traefik access logs and CrowdSec detection on the public paths, and adds
CrowdSec **enforcement** there from day one. The estate-wide kill switch stays off (§C4).

Still unnecessary once the tunnel goes:
- the `tunnel` entrypoint;
- the `external` Gateway;
- the `..` deny rules in `tunnelRules.ts`. tailscaled's `path.Clean`, Traefik's sanitizePath and
  the funnel entrypoint's `encodedCharacters` do that job.

### C1. Tailnet policy (`stacks/unifi-network`)

- **New tag.** `components/constants.ts` gains `funnel: "tag:funnel"`. In
  `stacks/unifi-network/acl-manager.ts` (`setTagOwner(tag.operator, …)` in
  `configureKubernetesAccess`), add `tag.funnel` to the tags `tag:operator` owns, so
  the operator's OAuth client can mint it.
- **Who may Funnel is owned by code, and nothing else about nodeAttrs changes.** nodeAttrs are
  *not* reset on each run (the `applyAllEdits` block under "Initialise ACL manager" blanks tagOwners, grants, tests, ssh, sshTests
  and hosts, but not nodeAttrs), and the live policy has hand-set entries that must survive (see
  J1). So:
  - before `new TailscaleAclManager(...)`, rewrite `nodeAttrs` to the live array **minus any
    entry whose `attr` contains `funnel`**, keeping every other entry;
  - then change the `setNodeAttr({ target: [tag.operator], … })` beside it to
    `setNodeAttr({ target: [tag.funnel], attr: ["funnel"] })`.

  This removes the stale, unused `tag:operator` funnel grant. A funnel grant hand-added later is
  removed on the next run that *writes* the policy. The Stack does not refresh, so a run whose
  stripped output matches state sends no PUT. Until a write happens the stray stays live, and a
  `pulumi.log.warn` names it on every resync. `tag:apps` must **not** get the attribute: tsnet
  apps on the shared authkey (golink, tsidp, tsiam) could then self-enable Funnel.
- **Who can mint `tag:funnel`:** anything holding the operator's OAuth client, because
  `tag:operator` owns the tag. That includes **taildrive**, which mounts `tailscale-oauth` to
  register `tag:shared-drive`. Its HelmRelease, or a compromise of it, could bring up a Funnel node
  with no Ingress at all, and no admission policy would see it. See ❓J7.
- **Member grant.** Grant `autogroup:member → tag:funnel tcp:443`. On the tailnet, MagicDNS
  resolves a Funnel name to the device's 100.x address, and postiz's UI loads media previews
  from it.

### C2. `kubernetes/components/funnel/` (reusable) and its admission gate

The component emits **one** object into the consuming app's build: a nested Flux Kustomization
`funnel-${FUNNEL_HOST}` (`components/funnel/ks.yaml`), with **no** `targetNamespace`. Its path,
`components/funnel/endpoint/`, renders two objects that name their own namespaces:
- **Ingress `network/funnel-${FUNNEL_HOST}`**, the Funnel device. It mounts `/${FUNNEL_PATH}/`
  and points at `traefik-funnel`, port name `funnel`. It has to be in `network`: the operator
  resolves the backend Service in the Ingress's own namespace, and a stub Service does not work
  under Cilium (`components/tailscale/ks.yaml:7-36`).
- **HTTPRoute `${NAMESPACE}/funnel-${FUNNEL_HOST}`** on Gateway `network/funnel`, listener `http`.
  It has one hostname, `${FUNNEL_HOST}.${TAILSCALE_DOMAIN}`; one PathPrefix, `/${FUNNEL_PATH}/`;
  one backendRef, `${FUNNEL_SERVICE}`; and no filters.
  - The port is added by a JSON6902 patch on the nested ks. A postBuild value must be a string, and
    `flux build` shows the parent rendering a quoted port as a bare integer.

The nested ks and its consumers:
- It `dependsOn` tailscale-operator, tailscale-resources, funnel-policy (all `tailscale-system`)
  and funnel-gateway (`network`). It does **not** depend on `network/traefik`
  (`components/tailscale/ks.yaml:62-99`, the 2026-08-28 deadlock).
- It sets `wait: true` with `healthCheckExprs` for both objects: the Ingress status hostname
  starts with `${FUNNEL_HOST}.`, and the HTTPRoute is Accepted and ResolvedRefs on `funnel` at the
  current generation.
- A consumer needs only `components:` and substitutions; its own `wait: true` checks the nested ks.
- **Consume it only from a Kustomization nothing depends on** (like `flux-webhook-funnel`). The
  consumer inherits the nested ks's dependencies and health, so attaching it to an app's main ks
  would make the app's readiness hostage to the Funnel door.

**The mount is not a boundary.** tailscaled checks the mount on the decoded, cleaned path and
forwards the raw path, which Traefik cleans differently. So `/hook/a%2Fb/../../uploads/x` passes a
`/hook/` mount and routes as `/uploads/x`, and a spoofed Host picks the route. **Every route on
the door is reachable from every Funnel device.** The route list is the only boundary, and a
route added to it is public the moment it exists. The mount still keeps scans of `/` from
reaching Traefik.

**Template rules.** Unchanged:
- fail closed on unset vars;
- no defaultBackend and no rule host;
- no proxy-group and no experimental-forward;
- the ProxyClass label is required;
- no commonLabels;
- tags exactly `tag:funnel`.

New:
- the backend is never templated; it is always `traefik-funnel:funnel`;
- never a port number: 443, or a port named `https`, flips the proxy to `https+insecure://`
  (`ingress.go:363-368`).

**Admission gate: `kubernetes/apps/tailscale-system/funnel-policy/`.** Ten policies, each with its
own binding:
1. **`funnel-ingress-shape`** (the devices). The shape checks stay as before. New: namespace
   `network`, backend `traefik-funnel` with port **name** `funnel`, and `"<path> <host>"` on the
   **device list** (`'/hook/ flux-equestria-webhook'`). It also matches **any standalone
   tailscale Ingress in `network`**, because that proxy is what the door's CiliumNetworkPolicy
   admits. The tailnet Ingresses there are ProxyGroup-backed and untouched.
2. **`funnel-httproute-shape`** (the routes). **This is the public surface.** It covers any
   HTTPRoute naming a parent `funnel` and requires:
   - exactly one parentRef: Gateway `network/funnel`, section `http`, no port;
   - one hostname;
   - one rule with one PathPrefix other than `/`;
   - no rule-level or backend-level filters;
   - one same-namespace Service backend with a port;
   - `"<ns> <Service> <port> <path> <hostname>"` on the **route list**
     (`'flux-system webhook-receiver 80 /hook/ flux-equestria-webhook.${TAILSCALE_DOMAIN}'`).
3. **`funnel-gateway-shape`**. Only `network/funnel` (class `traefik`) may listen on 8445,
   because Traefik binds listeners to entrypoints by port alone. It is pinned to exactly one
   listener: `http`, HTTP, 8445, hostname `*.${TAILSCALE_DOMAIN}`, no TLS, kinds `[HTTPRoute]`,
   namespaces `from: Selector` on the apiserver-owned `kubernetes.io/metadata.name` label with
   operator `In`. It also forbids `allowedListeners` and `defaultScope`.
4. **`funnel-listenerset-reserved`**. No ListenerSet may listen on 8445.
5. **`funnel-entrypoint-reserved-traefik`** and 6. **`funnel-entrypoint-reserved-ingress`**.
   These refuse `funnel`, trimmed and lower-cased, in an IngressRoute(TCP/UDP) `spec.entryPoints`
   or in the Ingress `traefik.ingress.kubernetes.io/router.entrypoints` annotation. The annotation
   **key** is matched case-insensitively too: Traefik decodes it with EqualFold, so
   `router.entryPoints: funnel` binds exactly like the lowercase form.
7. **`funnel-middleware-names-reserved`**. Refuses any Middleware, except the two real ones, whose
   **normalized** Traefik key would collide with the door's two middlewares and silently replace
   them. Without safeNaming, Traefik's key is `<ns>-<name>` with every run of non-alphanumerics
   collapsed to one `-`, so `crowdsec.bouncer.funnel` in `network` collides too.
8. **`tailscale-proxies-secret-scope`**. The `proxies` ServiceAccount may only **UPDATE the Secret
   named after its own pod**. The pod name comes from the bound token's `userInfo.extra`, and that
   Secret is `TS_KUBE_SECRET`, which the operator pre-creates. CREATE and DELETE are denied.
   - **Why not a label, as first drafted:** `tailscale.com/managed=true` is caller-written. An
     envtest harness showed that, even under Deny, a proxy could CREATE a labelled
     service-account-token Secret for `kube-apiserver-auth-proxy`, which holds cluster-wide
     impersonate, and become cluster-admin. It could also rewrite another proxy's `serve-config`.
   - **Reads are not covered**, and every `proxies` pod can still read every Secret there (§H, §I).
   - **Audit first.** Switch to `[Deny]` after a week with **no violations in Thanos**, a week that
     includes a restart of every `proxies` pod. A passing check emits no metric, so test for
     presence (`max_over_time`), not `increase()`. The gate and liveness queries are in the policy
     header.
9. **`funnel-tag-reserved-services`** and 10. **`funnel-tag-reserved-tailscale`**. These refuse
   `tag:funnel` on a Service (annotation) or on a ProxyGroup, Connector, Recorder or PeerRelay
   (`spec.tags`, pinned to `v1alpha1` so the apiserver actually type-checks the policy).

A new public endpoint is therefore **three reviewed lines**:
- the device list;
- the route list;
- for a new namespace, the Gateway's selector in `apps/network/funnel-gateway/gateway.yaml`.

Keep the first two in step: the same path, and host + `.` + tailnet.

No VAP can catch a router that names **no** entrypoint, such as the authentik outpost's own
Ingress (51 routers live). `asDefault` closes that (§C4).

### C3. Consumers

| | Flux webhook | Postiz media |
|---|---|---|
| Host | `flux-equestria-webhook.opossum-yo.ts.net` | `postiz-media.opossum-yo.ts.net` |
| Wiring | **new** Kustomization `apps/flux-system/flux-webhook-funnel/`: `dependsOn` flux-instance only; `wait: true`; timeout 10m. The nested ks carries the tailscale-system and funnel-gateway dependsOn and all health checks. | **new** Kustomization `apps/equestria/home/postiz-funnel/` (step 5), `dependsOn` postiz, with the component; postiz's own ks is untouched. Step 5 also adds the device and route lines and `equestria` to the Gateway selector. |
| Vars | `APP: flux-webhook`, `NAMESPACE: flux-system`, `FUNNEL_HOST: flux-equestria-webhook` (literal), `FUNNEL_PATH: hook`, `FUNNEL_SERVICE: webhook-receiver`, `FUNNEL_PORT: "80"` | `APP: postiz`, `NAMESPACE: equestria`, `FUNNEL_HOST: postiz-media`, `FUNNEL_PATH: uploads`, `FUNNEL_SERVICE: postiz-cdn` (**literal**), `FUNNEL_PORT: "8080"` |

- **The webhook gets its own Kustomization**, not flux-instance's. A fail-closed render or an
  Ingress apply error must not block reconciliation of the FluxInstance itself.
- **Objects are named `funnel-${FUNNEL_HOST}`** (nested ks, Ingress and HTTPRoute). A host is
  unique by construction; `APP` is not, and `${APP}-funnel` would collide with the parent
  `flux-webhook-funnel`. `APP` is now labels only, and `NAMESPACE` is required. `FUNNEL_HOST` is a
  literal rather than `flux-` + `CLUSTER_CNAME` + `-webhook`: a missing substitution would render a
  wrong public name silently instead of failing.
- **Write `postiz-cdn` literally.** `cluster-apps`' own postBuild
  (`kubernetes/flux/cluster/ks.yaml:111-116`) substitutes only from cluster-secrets and
  shared-secrets, neither of which has `APP`, so `${APP}-cdn` renders `-cdn` and fails the whole
  postiz apply. `degoog ks.yaml:60-63` uses the same literal-override pattern.
- **No name collisions.** No `postiz-media` or `flux-equestria-webhook` device exists today, so
  there is no `-1` rename (live `tailscale__list_devices`).

### C4. Traefik's `funnel` door and CrowdSec

- **Entrypoint `funnel`, :8445, plain HTTP** (`network/traefik/values.yaml`):
  - `forwardedHeaders.trustedIPs: [${CLUSTER_NETWORK}]` only, never `insecure`. The CrowdSec
    plugin reads XFF without checking who sent it, so this list is what stands between a forged
    XFF and a bouncer bypass;
  - `http.middlewares: [network-crowdsec-bouncer-funnel@kubernetescrd,
    network-funnel-strip-headers@kubernetescrd]`, prepended by Traefik to **every** router on the
    entrypoint (`aggregator.go:323-362`). A missing one fails the door closed and nothing else;
  - `encodedCharacters` refuses encoded slash, backslash, NUL and percent in the routed path;
  - `aliasHeadersStrategy: delete`;
  - Traefik's default 60s readTimeout.
- **Service `traefik-funnel`** (`service.additionalServices.funnel`): ClusterIP, one port `funnel` →
  8445. It is not on the LoadBalancer and not on 10.10.255.10.
- **`asDefault: true` on web, websecure and tailscale**, in the same Helm upgrade. Without it,
  every router that names no entrypoint joins every entrypoint. Live on 2026-09-28, the 51
  authentik-outpost routers sat on all of them, **`tunnel` included**. That was harmless behind
  cloudflared, which pins the Host, but a Funnel door would have inherited them.
- **Gateway `network/funnel`** (`apps/network/funnel-gateway/`):
  - It has its own ks, so a policy denial can never freeze Traefik's.
  - It depends on funnel-policy, so it is never created unchecked. Its health waits for Traefik to
    bind the listener (Accepted and Programmed).
  - One HTTP listener on 8445, `*.${TAILSCALE_DOMAIN}`, HTTPRoute only. Namespaces are selected by
    name: `flux-system` now, and step 5 adds `equestria`.
  - No external-dns annotations; external-dns, k8s-gateway and the vault tunnel rules all ignore it.
- **CiliumNetworkPolicy `traefik-funnel-door`** (same app). Decided 2026-09-28 (J12).
  - It is deny-only on port 8445, and `enableDefaultDeny` is off, so every other Traefik port is
    untouched.
  - It denies every source except pods in `tailscale-system` labelled
    `tailscale.com/parent-resource-type=ingress` and `tailscale.com/parent-resource-ns=network`.
    Those are the standalone proxies for Ingresses in `network`, which `funnel-ingress-shape` makes
    Funnel devices. The namespace label is Cilium's own and cannot be forged.
  - Why it matters: without it, any pod could reach the door and name its own client address.
    That includes the tailscale Connector, which SNATs tailnet subnet traffic to its pod IP, so
    every tailnet principal granted the cluster CIDRs could evade or poison CrowdSec.
- **CrowdSec is enforced at the entrypoint.** It is a second instance of the plugin,
  `network/crowdsec-bouncer-funnel`, with `enabled: true`.
  - The estate-wide `crowdsec-bouncer-plugin` keeps `enabled: false`.
  - The LAPI block is copied verbatim, because the stream, failure counter and cache are
    process-global and owned by whichever instance Traefik builds first.
  - It is **fail-open** (`updateMaxFailure: -1`), decided 2026-09-28. Fail-closed cannot be scoped
    to one instance.
  - `clientTrustedIPs` holds tailnet 100.64/10 and GitHub's hooks ranges. The GitHub exemption
    covers every route on the door and any GitHub-originated request (J9).
  - Stream mode enforces **Ip-scoped decisions only**; a `--range` ban has no effect at the door.
- **Client IP.** tailscaled sets XFF to the real client, and Traefik keeps it only from the pod CIDR,
  which only the Funnel proxies can reach on 8445. The access log's ClientHost is that value, and
  the agents' traefik-logs parser and the bouncer both use it.
  - If the chain ever breaks, the client resolves to a whitelisted pod IP: **a silent pass, never a
    ban-all.**
  - That is why this door can enforce ahead of `docs/crowdsec-enforcement-rollout.md`, which was
    never written (J13). §F step 2 verifies client IPs positively.
- **Alerts** (`network/crowdsec/prometheusrule.yaml`):
  - `FunnelDoorBlocked` fires on any 403 at the door.
  - `CrowdsecBouncerNotPolling` now counts bouncer-authenticated polls, so a rejected bouncer key
    is caught too.
- **AppSec (the WAF) is not deployed**, so Cloudflare's WAF is not replaced. That was decided
  2026-09-28 (J8).

## D. The webhook

`stacks/vault/KubernetesFluxWebhooks.ts:45` becomes:

```ts
const webhookUrl = interpolate`https://flux-${args.cluster.key}-webhook.${args.globals.tailscaleDomain}${webhookPath}`;
```

The next vault run rewrites both GitHub hooks (`home-operations` and `equestria-cluster`). A dead
webhook is a latency problem, not an outage. `flux-system` polls every 1m and
`pulumi/home-operations` every 10m, so GitOps degrades to being at most 1–10 minutes late.

## E. Postiz media on Funnel ✅

### E1. The problem

Postiz v2.24.0 builds every media URL as `process.env.FRONTEND_URL + '/uploads' + path`
(`local.storage.ts`: `newFilePath()` L48, `removeFile()` L142). `FRONTEND_URL` has to stay
`https://postiz.driscoll.tech`:

- the OIDC redirect URI is built from it;
- ts.net is on the Public Suffix List, so a ts.net `FRONTEND_URL` makes the login cookie `.ts.net`
  and browsers drop it (upstream #1143);
- the only workaround, `NOT_SECURED`, turns off cookie security and the OAuth state check.

So postiz has to learn a separate public media base.

### E2. Runtime patch (chosen) and upstream PR

**Why a runtime patch.** The estate has no generic image-build pipeline. home-operations' only
workflows are `flate` and `label-sync`, and agentboard's token cannot push `.github/workflows`.
A derived image would need a new repo, a workflow the human pushes, a public ghcr package, and two
Renovate hops on a weekend schedule. The runtime route has a direct precedent:
`network/crowdsec/helmrelease.yaml:102-160` runs sed over a vendor file at start, uses no bare
`$`, and fails open.

**The initContainer, `patch-media-url`.**

- **Image.** It runs on the same anchored image (`&image` on the image block at
  `helmrelease.yaml:71`, `*image` on both containers, as seedstrem, freshrss and supersync do), so
  one Renovate bump moves both.
- **What it patches.** For each of these two files:
  ```
  /app/apps/backend/dist/libraries/nestjs-libraries/src/upload/local.storage.js
  /app/apps/orchestrator/dist/libraries/nestjs-libraries/src/upload/local.storage.js
  ```
  it checks that `grep -cF "process.env.FRONTEND_URL + '/uploads'"` is exactly 2, writes a sed
  copy to an emptyDir with the text replaced by
  `(process.env.UPLOAD_PUBLIC_URL || process.env.FRONTEND_URL + '/uploads')`, and re-checks that
  the output contains `UPLOAD_PUBLIC_URL` exactly twice.
- **It always fails open.** There is no `set -e`. On any mismatch it copies the original into the
  emptyDir and logs `POSTIZ_MEDIA_PATCH_NOT_APPLIED`. It always creates both output files, so the
  `subPath` mounts never meet a missing entry, and it ends with `exit 0`. Failing closed would turn
  a mismatched Renovate bump into roughly 2h of scheduler outage: Recreate strategy, a 15m timeout
  and 7 rollback retries (`helmrelease.yaml:23,32-34`). Failing open only degrades the providers
  that pull media by URL.
- **It writes the canary.** It also runs `echo ok > /uploads/funnel-canary.txt`, which is
  non-fatal and logs `POSTIZ_FUNNEL_CANARY_NOT_WRITTEN` on failure. That needs its own mount: add
  `persistence.data.advancedMounts.${APP}.patch-media-url: [{path: /uploads, subPath: uploads}]`.
  advancedMounts are per container, and the image has no `/uploads` directory.
- **`$` handling.** There is no bare `$` in the script (the crowdsec convention), or it is
  `$$`-escaped (the vsc-retention convention). Flux substitution runs over the whole manifest.

**The rest of the postiz change.**

- The postiz container mounts the two patched files read-only over the image paths, via `subPath`
  in `advancedMounts`.
- `externalsecret.yaml` gets
  `UPLOAD_PUBLIC_URL: "https://postiz-media.${TAILSCALE_DOMAIN}/uploads"` next to `FRONTEND_URL`
  (L71), with no trailing slash.

**Verified against the real v2.24.0 image layer:**

- the files are plain tsc CommonJS (no webpack), mode 0644, uid 0;
- the base is `node:22.20-bookworm-slim`, so GNU sed and grep are available;
- of the 1,644 non-`node_modules` JS files, only these two contain the text;
- the frontend does not rebuild media URLs, and there is no frontend CSP.

**Renovate.** The shared preset **automerges docker patch bumps** (for example #2144), so add a
rule to `.github/renovate.json5`:

```json5
{ description: "postiz: runtime-patched, never automerge", matchDatasources: ["docker"], matchPackageNames: ["ghcr.io/gitroomhq/postiz-app"], automerge: false }
```

Then every postiz bump is a reviewed PR. In review, stream the new image layer and run the same
grep before merging. A native upstream `UPLOAD_PUBLIC_URL` changes the matched text, the guard
flags it, and the patch can then be deleted.

**Upstream PR** to gitroomhq/postiz-app:

- add a `publicUploadBase()` helper in `local.storage.ts` and use it in `newFilePath()`;
- have `removeFile()` accept either prefix;
- document the variable in `.env.example`.

**David authors and submits it**, because the project needs a CLA and its template asks for a
no-AI attestation.

### E3. SSRF: postiz fetching its own media ✅

Postiz re-reads its media server-side (`mediaSize`, `mediaChunk`, `uploadSimple`) through an SSRF
guard that blocks 10/8, 172.16/12, 192.168/16, 100.64/10 and similar ranges. It checks **every**
resolved address (`ssrf.safe.dispatcher.ts`). The unguarded `readOrFetch` and the PNG→JPEG axios
path also fetch the URL.

- **Today**, `postiz.driscoll.tech` resolves in-cluster to `10.10.206.101` (Technitium split
  horizon). YouTube, TikTok-video, LinkedIn and X media uploads are therefore very likely already
  failing with `Blocked IP`, whether or not the tunnel exists.
- **After §E2**, the media host is `postiz-media.opossum-yo.ts.net`. CoreDNS forwards all of
  `ts.net` to the operator's k8s-nameserver (`coredns/helm/values.yaml:160-178`). That nameserver
  answers with the proxy **pod IP** (`dnsrecords.go:40-57`), and there is no per-Ingress opt-out.
  The pod IP is blocked by the guard, and it is a userspace proxy that does not serve :443 there
  anyway. So the carve-out below is **required**, not optional.
- **The fix** is a more specific CoreDNS server block **before** the `ts.net` block. This one name
  then resolves publicly, to the Funnel relay IPs, and postiz hairpins through the real public
  path:

  ```yaml
    - zones:
        - zone: postiz-media.${TAILSCALE_DOMAIN}
          scheme: dns://
          use_tcp: false
      port: 53
      plugins:
        - name: errors
        - name: cache
          parameters: 30
        - name: forward
          parameters: . 9.9.9.9 149.112.112.112
          configBlock: |-
            policy sequential
  ```

  - Use Quad9, the only upstream DNS egress evidenced
    (`talos/patches/global/machine-network.yaml:14-15`).
  - Keep the `$`-brace form out of comments (`values.yaml:132-134`).
  - The `dns.driscoll.tech` and `dockge-*` blocks already rely on the more specific zone winning.
- **Rejected alternatives:**
  - `DISABLE_SSRF_PROTECTION=true` is too broad, because postiz also fetches webhook URLs that
    users supply.
  - `hostAliases` breaks when relay IPs move.
  - A pod `dnsConfig` doesn't help: glibc only tries the extra servers after kube-dns has already
    answered.
  - The experimental forward annotation means kernel mode, and the name still resolves to a
    10.206.x address.
- **Cleaner but not chosen:** widen the patch so postiz maps `UPLOAD_PUBLIC_URL` paths to its local
  `/uploads` mount for its own reads. That removes the hairpin, but every provider's read path
  would need auditing, which means more patch surface.

### E4. TikTok, Meta, and bandwidth

- **Meta.** Instagram (`image_url`/`video_url`) and Facebook (`url`/`file_url`) need public HTTPS
  only. There is no domain verification.
- **TikTok video** goes by `FILE_UPLOAD` in postiz v2.24.0 (commit 9dd2c62), so it needs no public
  URL.
- **TikTok photo** is `PULL_FROM_URL` only, and needs a verified *URL prefix*. Verify
  `https://postiz-media.opossum-yo.ts.net/uploads/` by serving the portal's `tiktok<token>.txt` at
  that prefix, with no DNS involved. The docs allow it, but no one has published a success on a
  shared host, and one vendor says S3's shared hostnames fail. See ❓J4. The `tiktok-business`
  provider (not enabled) is PULL-only for video too.
- **Bandwidth.** Funnel's caps and the userspace proxy's throughput
  ([#20109](https://github.com/tailscale/tailscale/issues/20109)) hit video twice, because
  postiz's own chunked reads hairpin out and back. Test a large video before relying on it. If it
  is too slow, the fallback is R2 (`STORAGE_PROVIDER=cloudflare`), which `externalsecret.yaml`
  already describes.

## F. Rollout, in order

Each numbered item is one PR unless marked otherwise.

- **The webhook's old path keeps working until 8a.** The retained Cloudflare config still routes
  it after step 7.
- **Postiz's old path ends at step 5.** That is safe because it has no consumers.
- **Steps 2–5 roll back by revert.** For step 5, uploads stored after it carry the Funnel URL and
  break if its Funnel Ingress is reverted.
- **Step 1 is not revert-safe**, and **step 7 must never be reverted** (see each step).

0. **Pre-flight (read-only, human-assisted).**
   - J2 and J3 were confirmed on 2026-09-27.
   - Test pod DNS egress to Quad9:
     `kubectl run -it --rm dnstest --image=busybox -- nslookup example.com 9.9.9.9`.
   - Run a DB check: no `Integration.picture` or `Post.image` references
     `https://postiz.driscoll.tech/uploads`.
1. **Tailnet policy** (`stacks/unifi-network`, §C1).
   - **Order:** keep this before step 2, so the first key mint succeeds. If step 2 lands first, the
     operator keeps retrying the mint until the tag is owned, and no cleanup is needed. #20744 only
     bites when the tags annotation is missing, and the component and VAP forbid that.
   - **Verify:**
     - `tag:funnel` is owned by `tag:operator`;
     - **exactly one** nodeAttr contains `funnel`, and its target is `["tag:funnel"]`;
     - the `tag:operator` funnel entry is gone;
     - the member grant is present;
     - the `mullvad` and drive nodeAttrs are untouched.
   - **Rollback: not revert-safe as a plain revert.** A full revert leaves the live `tag:funnel`
     nodeAttr pointing at a tag that is no longer in tagOwners. Tailscale then rejects every policy
     PUT, and unifi-network stalls (the dangling-tag 400 recorded beside `border0Managed` in
     `components/constants.ts`).
     - **Preferred:** revert everything **except** the `withoutNodeAttr` call. It strips the
       `tag:funnel` entry itself.
     - **To remove all of it:** suspend the Stack, hand-delete the nodeAttr, let the revert sync,
       then resume. A hand-delete made while the old code still runs is undone by its next write.
     - Any Funnel Ingress from step 2 onward has to be reverted first.
2. **Traefik `funnel` door, Funnel component, `funnel-policy`, and the webhook Funnel** (§C2–§C4),
   including the Tier-0 Traefik roll. This runs in parallel
   with the tunnel. Nothing is attached to the `external` Gateway, and the ts.net hostname must
   never go on a route attached to it: `deriveTunnelRules` has no domain filter and would push the
   name into the Cloudflare config.
   - **Traefik first** (the roll is Tier-0; check it before anything Funnel):
     - `kubectl -n network rollout status deploy/traefik` completes;
     - `/api/overview` still shows `http.routers.errors == 0` and `http.middlewares.errors == 0`
       (baseline 0/0), and the new pods log `Plugins loaded.`. If either fails, roll the pods again
       before debugging Funnel: a failed plugin download disables every plugin estate-wide;
     - `/api/entrypoints` shows `funnel` with trustedIPs 10.206.0.0/16, and `asDefault` true on
       web, websecure and tailscale;
     - `/api/http/routers`: `tunnel` now holds only its 2 external routers (it was 53), and the
       only routers on `funnel` are the webhook's Gateway route, none from `@kubernetes` or
       `@kubernetescrd`.
   - **Admission checks** (proven on a 1.37 apiserver in envtest, typeChecking clean):
     - all ten bindings are present, and every policy's `.status.typeChecking` has no warnings;
     - `kubectl apply --dry-run=server` is **denied** for each of these:
       - a funnel Ingress in `flux-system`;
       - one with backend `traefik:websecure`;
       - one with port number 8445;
       - an IngressRoute with `entryPoints: [funnel]`;
       - an Ingress annotated `router.entrypoints: funnel`, `router.entryPoints: funnel` or
         `Router.ENTRYPOINTS: websecure,funnel`;
       - a plain (no funnel annotation, no proxy-group) tailscale Ingress in `network`;
       - a Middleware `crowdsec.bouncer.funnel` in `network`;
       - a Gateway on 8445 in `default`;
       - an HTTPRoute on `funnel` from `equestria`, or with a URLRewrite filter.
   - **Cilium lock** (Hubble): `hubble observe --to-port 8445 --verdict DROPPED` shows
     `DROPPED (Policy denied by denylist)` for a connection from any pod other than the Funnel
     proxy, while the proxy's is `FORWARDED`. The kubelet
     probes on :8080 and all other Traefik ports are unaffected.
   - **External probes, run from outside the cluster.** An in-cluster probe resolves via the
     operator nameserver instead.
     - `curl https://flux-equestria-webhook.opossum-yo.ts.net/hook/` returns a 404 with an
       **empty body**, which is the receiver's. tailscaled's own 404 says "404 page not found".
     - `/` returns tailscaled's 404.
     - `curl --path-as-is …/hook/../x` and `…/hook/%2e%2e/x` both return tailscaled's 404.
       Without `--path-as-is`, curl removes the dot segments itself and the probe proves nothing.
     - `curl --path-as-is …/hook/a%2F..%2Fb` returns **400** (encoded separator refused).
     - `curl --path-as-is …/hook/a%2Fb/../../api` returns Traefik's **404**, not 400. It passes
       the mount and routes as `/api`, which is on no route: the mount is not the boundary (§C2).
     - A cellular client given a 5-minute `cscli decisions add --ip` gets **403** (human-run), and
       `FunnelDoorBlocked` fires.
   - **Proxy checks:**
     - `funnel-flux-equestria-webhook` (the nested ks) and `flux-webhook-funnel` go **Ready**.
       The nested ks passes only once the status hostname starts `flux-equestria-webhook.` (no `-1`
       collision) and Traefik has Accepted and ResolvedRefs the route;
     - the device carries `tag:funnel`;
     - the proxy pod is on `control-plane-tolerant`.
   - **Client IP (Loki):** rows with `entryPointName=funnel` show ClientAddr 10.206.x and a public
     ClientHost.
   - **Start the Audit clock** on `tailscale-proxies-secret-scope` (§C2 item 8). The switch to
     `[Deny]` is a later one-line PR.
3. **Webhook URL** (vault, §D) plus the webhook Gatus probe (§G).
   - **Verify:** the next push shows a 200 on the new URL in GitHub's "Recent deliveries", and hits
     on the Traefik `tunnel` entrypoint for `/hook/` drop to zero, while they appear on the `funnel`
     entrypoint with ClientHost in GitHub's hooks ranges.
   - This is the only step that touches GitHub.
4. **CoreDNS carve-out** (§E3). It is harmless on its own: the name is NXDOMAIN publicly until step
   5.
5. **Postiz** (§E2–§E4). The change:
   - the patch initContainer and the canary;
   - `UPLOAD_PUBLIC_URL`;
   - a new `apps/equestria/home/postiz-funnel/` Kustomization (`dependsOn` postiz) carrying the
     Funnel component for `postiz-cdn`, with `FUNNEL_PORT: "8080"`. Postiz's own ks is untouched
     (§C2);
   - `'/uploads/ postiz-media'` on the device list, and
     `'equestria postiz-cdn 8080 /uploads/ postiz-media.${TAILSCALE_DOMAIN}'` on the route list;
   - `equestria` in the funnel Gateway's namespace selector;
   - the estate's WAN IP in the CrowdSec agents' postoverflow whitelist and in the funnel bouncer's
     `clientTrustedIPs`: postiz's own hairpin fetches arrive from it (J11);
   - the Renovate rule;
   - the postiz Gatus entry and the Loki marker rules;
   - **delete `route.external`**. The tunnel config shrinks to the webhook rule on the next vault
     run.

   Rewrite the comments that this change makes false:
   - `externalsecret.yaml:100-146`, `ks.yaml:69-72` and `helmrelease.yaml:359-405`: "the media host
     cannot be a different origin", "Funnel rejected", "ts.net cannot be verified", "YouTube is
     unaffected", the shared-hostname / `--gateway-name` dependency, and the `v2.23.0` label.

   Verify:
   - a new upload's URL is `https://postiz-media.opossum-yo.ts.net/uploads/…`;
   - that URL fetches from outside the cluster;
   - `getent hosts` in the postiz pod returns public IPs;
   - postiz's own fetch succeeds, with no `Blocked IP`;
   - `/`, `/api/`, `/auth` and `--path-as-is /uploads/../api/` return 404 on the Funnel host;
   - the init log shows the patch applied.

   Public DNS for a new Funnel name can take about 10 minutes, and #20892 and #21156 report
   intermittent NXDOMAIN, so don't judge the first few minutes. The upstream PR (§E2) opens in
   parallel.
6. **Unprotect** (vault). Set `protect: false` on the tunnel and its config
   (`CloudflareTunnel.ts:116`), and keep `retainOnDelete: true`.
   - **Merge it alone.**
   - **Before merging step 7,** first check that `kubectl -n pulumi get stack backups` shows
     succeeded; vault does not run while its prerequisite is failing. Then run:

     ```sh
     kubectl -n pulumi get stack vault -o jsonpath='{.status.lastUpdate.state} {.status.lastUpdate.lastSuccessfulCommit}'
     ```

     It must print `succeeded` and the step-6 merge SHA or a later one. `Ready` alone is not
     enough: vault re-syncs the *previous* revision every 30 minutes.
7. **Remove the tunnel component** (vault). Drop the instantiation in `stacks/vault/index.ts`, and
   delete `externalHostnames.ts`, `components/CloudflareTunnel.ts`, `components/tunnelRules.ts` and
   `components/tunnelRules.test.ts`.
   - **Never batch steps 6 and 7.** A removal that meets `protect: true` in state stalls the Stack.
   - **If it stalls anyway,** revert this step. The component comes back with step 6's
     `protect: false`. Wait for that run to succeed, then re-merge. An unrelated commit does not
     un-stall it.
   - **Once it has succeeded, never revert it.** Pulumi would try to *create* a tunnel. Re-adopting
     needs a CLI `pulumi import`, and the token guard would throw. From here the only rollback is
     not doing 8a: the retained Cloudflare config keeps routing the webhook without Pulumi.
   - `retainOnDelete` leaves the tunnel and the OpenBao item in place until step 9.
8. **Flux cleanup.**
   - **8a:**
     - the `flux-webhook` HTTPRoute;
     - `kubernetes/apps/network/cloudflare-tunnel/` and its line in `network/kustomization.yaml`;
     - `stargate-command/secrets/cloudflare-tunnel.yaml` **and its line in
       `stargate-command/secrets/kustomization.yaml`**. It is a duplicate of Equestria's token that
       nothing consumes, and leaving the line breaks `sgc-secrets` and its dependents;
     - the `castle-of-friendship` DNSEndpoint in `external-dns/records/dnsendpoints.yaml`. Remove
       it with or after the routes, because both public names CNAME through it today;
     - the `cloudflared` GrafanaDashboard document (`observability/grafana/dashboards/network.yaml:26-39`).
   - **8b, after a 7-day soak:**
     - the `external` Gateway, and the Traefik `tunnel` entrypoint and port. Keep the `asDefault`
       flags and the `funnel` door;
     - the unattached `cloudflare-ips` and `github-hook-ips` middlewares. The GitHub list lives on
       in `crowdsec-funnel.yaml`'s `clientTrustedIPs`;
     - the unused `components/ingress/external`;
     - the `*.${EXTERNAL_DOMAIN}` SAN in `certificates/{production,staging}.yaml`;
     - the `TUNNEL_DOMAIN`, `EXTERNAL_DOMAIN` and `EXTERNAL_IP` keys. Optionally also
       `EXTERNAL_CNAME` and `EXTERNAL_TAILSCALE_VIP`, after `git grep` shows no references. Edit
       them **with `sops` only, never a formatter**.
     - **Keep `--gateway-name=external` on external-dns/cloudflare** (`helmrelease.yaml:88`), and
       `--gateway-name=internal` on technitium and unifi. With the Gateway gone, the cloudflare
       instance publishes no route names, which is the intended end state. Removing the flag
       would publish every internal hostname to public DNS. Rewrite only the comments.
     - Rewrite the comments that claim "all external traffic arrives via cloudflared":
       - traefik `values.yaml`, the forwardedHeaders note ("Every external request arrives through
         the in-cluster cloudflare-tunnel pods" ... "which is where cloudflared runs"); the
         `tunnel:` entrypoint and its comment block go with the port;
       - `middleware/crowdsec.yaml` ("All external traffic arrives via cloudflared");
       - `crowdsec/values.yaml:51`;
       - `docker/_common/traefik/config.yaml:29`.
     - Also rewrite `kubernetes/apps/network/external-dns/technitium/helmrelease.yaml` (the
       `--gateway-name=external` pairing that "resolves to the tunnel in public DNS"), beside the
       `--gateway-name` bullet above. `kubernetes/apps/tailscale-system/services/bootstrap.yaml`
       quotes `EXTERNAL_DOMAIN`'s value, so it changes with the key bullet.
9. **Manual cleanup (Cloudflare, OpenBao, GitHub), after the soak.**
   - Cloudflare:
     - delete tunnel `74761397`, the dead `d233fc0d` and `85a16359`, and `chrysalis` if the API
       shows it;
     - delete the stale `destiny`, `flux-sgc-webhook`, `tulip` and `www` records;
     - drop **Cloudflare Tunnel Write** from the API token behind `globals.cloudflareProvider`.
   - OpenBao: delete `third-party-tokens/cloudflare/tunnel`, `retired/cloudflare-tunnel`,
     `retired/cloudflare-tulip-tunnel` and `retired/cloudflare-chrysalis-tunnel`.
   - GitHub: remove the `stargate-command-cluster` repo's webhook, which still posts to
     `flux-sgc-webhook` and gets 530s.
   - `bootstrap/INVENTORY.md`: record that public webhook and media delivery now depend on three
     things:
     - the operator OAuth client being able to mint `tag:funnel`;
     - tailnet HTTPS;
     - Funnel.
10. **Docs.** Add `docs/kubernetes/funnel.md`, covering the component, its rules, `funnel-policy`
    and how to add an endpoint (one allow-list line), and the §G runbook. Update
    `bootstrap/RUNBOOK.md`. **Do not edit the APM-vendored skills** (`apm.lock.yaml`);
    `gateway-routing` and `security-testing` never mention the tunnel. Run `graphify update .`.

## G. Monitoring and runbook

- **Gatus on alpha-site, probing from outside.** Each probe sets
  `client.dns-resolver: tcp://9.9.9.9:53`, so it takes the public Funnel path rather than
  MagicDNS.
  - **Postiz:** a `gatus:` entry in `postiz/definition.yaml`.
    - URL: `https://postiz-media.${TAILSCALE_DOMAIN}/uploads/funnel-canary.txt`.
    - Conditions: `[STATUS] == 200`, `[BODY] == ok`, `[CERTIFICATE_EXPIRATION] > 72h`.
    - The ApplicationDefinition CRD supports `client`, and Pushover is added automatically for
      ApplicationDefinition entries (`components/authentik.ts:557-561`).
  - **Webhook:** added in `KubernetesFluxWebhooks.ts` via `addUptimeGatus`, next to the URL it
    publishes.
    - URL: `…/hook/`.
    - Conditions: `[CONNECTED] == true`, `[STATUS] == 404`, `[BODY] != pat(*page not found*)` (so
      a wrong `FUNNEL_PATH` cannot stay green on tailscaled's 404), and the certificate check.
    - It must carry `alerts: [{ type: "pushover", enabled: true }]` itself, as
      `stacks/backups/index.ts:125-133` does. `addUptimeGatus` adds only `interval`.
- **Loki alerts:** on `POSTIZ_MEDIA_PATCH_NOT_APPLIED` and `POSTIZ_FUNNEL_CANARY_NOT_WRITTEN`.
- **Runbook: "Funnel endpoint red".**
  1. Find the proxy with
     `kubectl -n tailscale-system get pods -l tailscale.com/parent-resource=funnel-<host>,tailscale.com/parent-resource-ns=network`.
  2. Delete that pod.
  3. If the endpoint is still red after about 10 minutes (#21114), delete the Ingress
     `network/funnel-<host>` and its `ts-*` Secret, and let Flux recreate them.
  4. If the device was removed in the admin console, step 3 is also the only fix (#20744).
  5. The webhook falls back to polling, so this is never urgent.
  6. **A legitimate client gets 403** (`FunnelDoorBlocked`). Find its ClientHost in Traefik's access
     log (`entryPointName=funnel`) and run `cscli decisions list --ip <ip>`. The door's kill switch
     is `enabled` in `traefik/middleware/crowdsec-funnel.yaml`; flipping it is a dynamic change
     with no roll.
  7. **Everything 404s at Traefik.** Check `/api/http/routers` for errors on the funnel routers.
     - A missing or misconfigured `network/crowdsec-bouncer-funnel` or `network/funnel-strip-headers`
       fails only the door closed and leaves internal routes alone.
     - A plugin that failed to download or load is **estate-wide**. The pod logs `Plugins are
       disabled because an error has occurred.` instead of `Plugins loaded.`, and every route
       carrying any plugin middleware 404s too: sablier, and the crowdsec-bouncer chain, which is
       whoami today. Check for `Plugins loaded.` first, and roll the Traefik pods (§F step 2)
       before debugging Funnel.

## H. Security posture, before and after

| | Cloudflare Tunnel (today) | Funnel (target) |
|---|---|---|
| Boundary | shared Traefik, dedicated `tunnel` entrypoint (which, it turned out, also carried 51 default-bound outpost routers) | the dedicated Traefik `funnel` entrypoint, not on the LB, reachable only from the Funnel proxies (CiliumNetworkPolicy), serving only HTTPRoutes on Gateway `network/funnel` from the `funnel-httproute-shape` allow-list. Every route there is reachable from every device. `asDefault` and the entrypoint, Gateway, ListenerSet and Middleware-name reservations keep everything else off |
| Path traversal | cloudflared `..` deny rule, plus Traefik path cleaning | tailscaled `path.Clean` before the mount match, then Traefik sanitizePath. An encoded `/`, backslash, `%` or NUL left in the routed path is refused (400). tailscaled and Traefik do **not** see the same path, which is why the mount is not a boundary |
| Edge | Cloudflare DDoS protection, WAF, HSTS and nosniff headers | Tailscale relays, with no WAF or DDoS promise. CrowdSec IP reputation (CAPI plus local scenarios) is enforced at the door, fail-open. No AppSec WAF (J8). Add HSTS at the cdn if wanted |
| Internet-facing processes' credentials | Traefik: cluster-wide Secret **read** | two processes. (1) **Traefik, as today**: cluster-wide Secret **read** (chart ClusterRole). It is the same Deployment, and it now parses every Funnel request and runs the CrowdSec plugin on the `funnel` entrypoint, so a Traefik or plugin bug reachable from the internet still means every Secret in the cluster. The direct design had removed that; it is the price of in-process CrowdSec. (2) **the `proxies` SA**: **read** of every Secret in `tailscale-system` (`operator-oauth` included, which can mint `tag:funnel`); **write** only to its own pod's state Secret once `tailscale-proxies-secret-scope` is on Deny |
| Tailnet reach of the internet-facing device | none; cloudflared is not a tailnet node | none: `tag:funnel` is left out of every former `autogroup:tagged` grant, and a policy test pins that (J6) |
| Client IP | XFF from the cloudflared pod | XFF set by tailscaled, trusted by Traefik only from the pod CIDR, which only the Funnel proxies can reach on 8445; the bouncer and the agents see the real client |
| Names in CT logs | `*.driscoll.tech` | `*.opossum-yo.ts.net`, already public through the tailnet certs |
| New credential | tunnel token in OpenBao (removed) | none. But anything holding the operator OAuth client can mint `tag:funnel`: every `proxies` pod through that read, and taildrive, which mounts it (❓J7) |

## I. Out of scope, noted

- **The operator's `defaultProxyClass` is inert.** It is set under `operatorConfig`, which chart
  1.102.4 ignores. Moving it to `proxyConfig.defaultProxyClass` is a separate fix; this plan sets
  the label explicitly either way.
- **Some skills describe infrastructure this repo doesn't have.** The `network-policy`,
  `gateway-routing` and `security-testing` skills describe Istio, Coraza and
  `kubernetes/platform/`. They are APM-vendored from another repo, so they are not edited here.
- **The qBittorrent WAN forward (18289) is not in Pulumi.**
- **The `proxies` Role's Secret reads.** No admission policy can gate a GET. Closing it means
  narrowing the operator chart's Role (for example with a HelmRelease postRenderer), or an
  upstream request for per-proxy RBAC.
- **API-server proxy impersonation.** `apiServerProxyConfig` (`mode: "true"`,
  `allowImpersonation`) gives the `operator` and `kube-apiserver-auth-proxy` accounts cluster-wide
  impersonate. That is what made a stolen token of theirs equal to cluster-admin in the scenario
  `tailscale-proxies-secret-scope` (§C2 item 8) closes. It is worth revisiting on its own.
- **`stargate-command-cluster` archival (doc 22) unblocks once step 9 lands.** That step removes
  its dead `CLOUDFLARE_*` dependencies.

## J. Open questions

- ✅ **J1. Live tailnet nodeAttrs.** Answered 2026-09-27 from a live policy read.
  - There is **no** `autogroup:member` funnel default, so members cannot self-publish today.
  - The stale `tag:operator` funnel entry **is** live; §C1's filter removes it.
  - nodeAttrs also carry hand-set entries that code does not manage: 7 per-IP `mullvad` entries,
    and the `autogroup:member`, `group:family`, `group:friends` and `group:admins` drive entries.
    So **do not** add nodeAttrs to the blanked sections in `acl-manager.ts`; the targeted
    funnel-only filter is the way.
- ✅ **J2. OAuth client tags.** Confirmed by David on 2026-09-27: the operator's OAuth client
  carries `tag:operator`. Adding `tag:funnel` to `tag:operator`'s owned tags (§C1) is therefore
  enough for the operator to mint Funnel proxy keys.
- ✅ **J3. Tailnet HTTPS certificates.** Confirmed enabled by David on 2026-09-27. This matches
  the Let's Encrypt `*.opossum-yo.ts.net` certificates in CT logs.
- ❓ **J4. TikTok URL prefix on ts.net.** This matters only for TikTok **photo** posts, and only
  once a TikTok app exists. It is a cheap live test: put `tiktok<token>.txt` at the uploads root,
  then verify in the portal. If TikTok rejects it, the options are:
  - live without TikTok photos;
  - use R2 for postiz media;
  - wait for bring-your-own-domain Funnel.
- ✅ **J5. Can the vault Stack write Gatus config?** Very likely yes. The `system` stack
  (`stacks/system/applications.ts:205`) and `backups` (`stacks/backups/index.ts:110,145,182`) do
  this. vault's Stack CR matches system's in serviceAccount, envRefs and workspace pod shape. Step
  3's preview confirms it. The fallback is a static `docker/alpha-site/uptime/config/funnel.yaml`.
- ✅ **J6. `tag:funnel` is excluded from `autogroup:tagged`'s grants.** David decided this on
  2026-09-27, and it shipped in step 1's PR (#2162). Tailscale grants have no deny, so in all nine
  grants whose `src` said `autogroup:tagged`, that is replaced by `taggedExceptFunnel`
  (`Object.values(tag)` minus `tag:funnel`).
  - **Why nothing else changes:** tagOwners is rebuilt from the same constant. On 2026-09-27 all
    16 tags on the 37 tagged live devices were in it, so every other tagged device keeps exactly
    what it had.
  - **How it is locked in:** `member-funnel-access` carries a single `src: tag:funnel` deny test
    with one destination per grant it would have inherited. Tailscale checks it on every PUT, so a
    grant that lets `tag:funnel` back in fails the Stack.
  - **Why a single test:** tests are keyed by `src`, so a second `tag:funnel` test anywhere would
    replace it.
- ❓ **J7. Give taildrive its own OAuth client?** taildrive mounts the operator's `tailscale-oauth`
  only to register `tag:shared-drive`. Since step 1, that client can also mint `tag:funnel` (§C1).
  - **Fix:** a new Tailscale OAuth client scoped to `auth_keys` with tags `[tag:shared-drive]`,
    stored at `third-party-tokens/tailscale/oauth-taildrive`, with an ExternalSecret
    `taildrive-oauth` that the taildrive HelmRelease reads instead.
  - **Needs a human:** the client can only be created in the Tailscale admin console.
  - **Risk if deferred:** low. The route is a reviewed HelmRelease change, or a compromise of
    taildrive, which could already mint every other operator-owned tag.
- ✅ **J8. AppSec (WAF).** Decided 2026-09-28: not deployed. The door enforces IP reputation only,
  so Cloudflare's WAF is not replaced. If it is ever wanted, it is a separate change: chart appsec,
  :7422 acquisition, the appsec collections, and `crowdsecAppsecEnabled` with FailureBlock and
  UnreachableBlock false. Check the plugin README's "align" caveat before enabling it on one
  instance.
- ❓ **J9. GitHub hooks bypass.** GitHub's hooks ranges are in the funnel bouncer's
  `clientTrustedIPs`, so a CAPI listing never 403s a delivery. The cost is that every request from
  GitHub's hook egress skips CrowdSec on every route, and any GitHub user can trigger one. The
  alternative is to move the ranges to the agents' postoverflow whitelist, which stops local bans,
  and enforce CAPI uniformly.
- ❓ **J10. Encoded `;`, `?` and `#`.** Left allowed on the door. Tighten once postiz filenames are
  confirmed; they are 32-hex random names, which suggests it is safe.
- ❓ **J11. The postiz hairpin (step 5).** postiz's own media fetches reach the door from the
  estate's WAN IP. Step 5 adds that IP to the agents' postoverflow whitelist and to the bouncer's
  `clientTrustedIPs`. No WAN-IP variable exists yet.
- ✅ **J12. In-cluster XFF forgery on :8445.** Decided 2026-09-28: closed in step 2 by the deny-only
  CiliumNetworkPolicy `traefik-funnel-door` (§C4), including the Connector path.
- ❓ **J13. `docs/crowdsec-enforcement-rollout.md` does not exist**, and never did (`git log --all`
  is empty), yet five files cite it:
  - `equestria/utils/whoami/helmrelease.yaml`;
  - `network/crowdsec/values.yaml`;
  - `network/traefik/middleware/`: `crowdsec.yaml`, `kustomization.yaml` and `crowdsec-funnel.yaml`.

  This plan cites it too, in §C4. Write it from vault#111 §5.2 plus the Loki evidence, or repoint
  the five references and §C4 (`grep -rl crowdsec-enforcement-rollout`).
