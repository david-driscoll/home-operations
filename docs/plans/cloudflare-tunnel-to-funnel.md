# Cloudflare Tunnel → Tailscale Funnel

**Status:** plan, 2026-09-27. Step 1 is #2162; nothing else is built yet. Decisions marked ✅ were taken by
David on 2026-09-27. The only item still open in [§J](#j-open-questions) is J4 (TikTok), which
can wait until a TikTok app exists.
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
- **What the backend sees from Funnel traffic:**
  - `Host` is the ts.net name.
  - `X-Forwarded-For` is the real client IP.
  - `Tailscale-Funnel-Request: ?1` is added.
  - tailnet identity headers are stripped.
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
                                          │  serve: /hook/ → http://webhook-receiver:80/hook/
                                          ▼
                                   flux-system/webhook-receiver

TikTok/Meta/browsers ──▶ Funnel relay ──▶ ts-…-0 ── /uploads/ → http://postiz-cdn:8080/uploads/
postiz pod ──(CoreDNS: that one name → Quad9 → relay IP)──▶ same path, public IP ⇒ passes SSRF guard
```

**Public traffic no longer touches Traefik.** Each Funnel proxy maps exactly one path to exactly
one Service, and an admission policy pins that (§C2). There is no shared entrypoint, so the
2026-09-15 failure mode is gone: a public request can no longer land on an internal route.

Several pieces become unnecessary:

- the `tunnel` entrypoint;
- the `external` Gateway;
- the `..` deny rules in `tunnelRules.ts`. tailscaled's path cleaning does that job.

The cost is Traefik access logs and CrowdSec detection on these two paths. The bouncer already
ships `enabled: false`.

### C1. Tailnet policy (`stacks/unifi-network`)

- **New tag.** `components/constants.ts` gains `funnel: "tag:funnel"`. In
  `stacks/unifi-network/acl-manager.ts:787`, add `tag.funnel` to the tags `tag:operator` owns, so
  the operator's OAuth client can mint it.
- **Who may Funnel is owned by code, and nothing else about nodeAttrs changes.** nodeAttrs are
  *not* reset on each run (`acl-manager.ts:83-88` blanks tagOwners, grants, tests, ssh, sshTests
  and hosts, but not nodeAttrs), and the live policy has hand-set entries that must survive (see
  J1). So:
  - before `new TailscaleAclManager(...)`, rewrite `nodeAttrs` to the live array **minus any
    entry whose `attr` contains `funnel`**, keeping every other entry;
  - then change `:788` to `setNodeAttr({ target: [tag.funnel], attr: ["funnel"] })`.

  This removes the stale, unused `tag:operator` funnel grant. A funnel grant hand-added later is
  removed on the next run that *writes* the policy. The Stack does not refresh, so a run whose
  stripped output matches state sends no PUT. Until a write happens the stray stays live, and a
  `pulumi.log.warn` names it on every resync. `tag:apps` must **not** get the attribute: tsnet
  apps on the shared authkey (golink, tsidp, tsiam) could then self-enable Funnel.
- **Member grant.** Grant `autogroup:member → tag:funnel tcp:443`. On the tailnet, MagicDNS
  resolves a Funnel name to the device's 100.x address, and postiz's UI loads media previews
  from it.

### C2. `kubernetes/components/funnel/` (new, reusable) and its admission gate

A kustomize `Component` renders one standalone Funnel Ingress in the **app's own namespace**,
pointed straight at the app's Service. The backend is local, so it needs no nested Kustomization
(unlike `components/tailscale/`).

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${APP}-funnel
  labels:
    tailscale.com/proxy-class: ${FUNNEL_PROXY_CLASS:=control-plane-tolerant}
  annotations:
    tailscale.com/funnel: "true"
    tailscale.com/tags: "tag:funnel"
spec:
  ingressClassName: tailscale
  tls:
    - hosts: ["${FUNNEL_HOST}"]
  rules:
    - http:
        paths:
          - path: /${FUNNEL_PATH}/
            pathType: Prefix
            backend:
              service:
                name: ${FUNNEL_SERVICE}
                port:
                  name: ${FUNNEL_PORT:=http}
```

Template rules. Each one is a real failure mode found in review:

- **Fail closed.** `FUNNEL_PATH` and `FUNNEL_SERVICE` have no defaults. An unset path renders as
  `//` and an unset service as an empty name, and the API rejects both. Flux's `${VAR:?}` does
  *not* fail, it falls through, so do not rely on it. There is no `/` default, because that would
  publish a whole app.
- **No `defaultBackend`, and no `host` on the rule.** A rule host that differs from
  `tls.hosts[0]` is dropped silently, and the proxy then serves nothing (`ingress.go:375`).
- **No `tailscale.com/proxy-group`**, or Funnel is ignored.
- **No `experimental-forward-cluster-traffic-via-ingress`.** The tailnet template carries it
  (`components/tailscale/ingress/ingress.yaml:16`); it switches the proxy to kernel mode and turns
  off ProxyClass metrics.
- **The ProxyClass label is required.** Without it the proxy gets *no* ProxyClass: no toleration
  and no metrics. `operator/helmrelease.yaml:62` sets `defaultProxyClass` under `operatorConfig`,
  which chart 1.102.4 ignores (it reads `proxyConfig.defaultProxyClass`), so there is no working
  default today. `cloudflared` carried the control-plane toleration as Tier 1, and
  `control-plane-tolerant` keeps that.
- **No `commonLabels`.** kustomize would also rewrite NetworkPolicy `podSelector`s, and
  flux-instance's `policies.yaml:7-10` would silently stop selecting source-controller. The
  parent `commonMetadata` already labels the Ingress.
- **Tags are exactly `tag:funnel`, with no spaces.** A malformed value fails the key mint. Only
  an *absent* annotation falls back to `tag:apps`.

**Admission gate: `kubernetes/apps/tailscale-system/funnel-policy/` (new app).** It is a
Kustomization of its own, listed in `tailscale-system/kustomization.yaml` and modelled on
`agents/agent-debug-rbac/`. It must **not** live in the component: two Kustomizations would then
render and prune the same cluster-scoped objects. It holds two policies, each with its
`ValidatingAdmissionPolicyBinding` (`validationActions: [Deny]`; a VAP without a binding enforces
nothing and reports no error):

1. **`funnel-ingress-shape`.** Makes the public surface an explicit, reviewed list. This is what
   the 8444 entrypoint was.
   - **Scope:**
     - `networking.k8s.io/ingresses`, on CREATE and UPDATE;
     - matches any Ingress with a `tailscale.com/funnel` annotation, or with `tag:funnel` in
       `tailscale.com/tags`;
     - exempts objects that have a `deletionTimestamp`, so a later tightening can never strand
       the operator's finalizer-removal UPDATE.
   - **Requires:**
     - `tailscale.com/funnel == "true"` (opt.Bool treats only the literal `true` as on);
     - tags exactly `tag:funnel`;
     - no proxy-group or experimental-forward annotation;
     - the `tailscale.com/proxy-class` label present;
     - `ingressClassName: tailscale`;
     - no `defaultBackend`;
     - **exactly one host-less rule with exactly one `Prefix` path**;
     - **`<namespace>/<service> <path>` in an allow-list**: `flux-system/webhook-receiver /hook/`
       and `equestria/postiz-cdn /uploads/`.

   A new public endpoint is therefore a one-line, reviewed change here. The component alone would
   not bound it: `equestria` has 79 apps, and any of them could otherwise be published by a
   hand-written Ingress. Follow `agent-debug-rbac`'s conventions: every field read is
   `has()`-guarded, and there are no ternaries over maps (under `failurePolicy: Fail` a
   type-check surprise denies everything).
2. **`tailscale-proxies-secret-scope`.** The Funnel proxy is the first *internet-facing* process
   running as `system:serviceaccount:tailscale-system:proxies`. That account has create, update
   and delete on **every** Secret in `tailscale-system` (`proxy-rbac.yaml:15-18`, no
   resourceNames). Those Secrets include `sops-age`, `cluster-secrets` and `shared-secrets`, the
   decryption key and substitution source of every tailscale-system Kustomization, plus
   `tailscale-oauth` and `operator-oauth`. Reads are no worse than today: Traefik already has
   cluster-wide Secret read. Write is new.
   - The policy denies that user CREATE, UPDATE or DELETE on a Secret unless the Secret (or the
     old object, for a DELETE) carries `tailscale.com/managed: "true"`. The proxies' own state and
     cert Secrets carry that label; the sensitive Secrets do not.
   - The existing standalone proxies (for example `ts-mosquitto-…`) also use `proxies`. Ship this
     binding with `[Audit]` first, check the audit log for denials, then switch it to `[Deny]`.

No Cilium change is needed. `enable-policy=default`, and no CNP or NetworkPolicy selects
`tailscale-system`, notification-controller or `postiz-cdn` (checked live).

### C3. Consumers

| | Flux webhook | Postiz media |
|---|---|---|
| Host | `flux-equestria-webhook.opossum-yo.ts.net` | `postiz-media.opossum-yo.ts.net` |
| Wiring | **new** Kustomization `kubernetes/apps/flux-system/flux-webhook-funnel/`, `dependsOn: [{name: tailscale-operator, namespace: tailscale-system}, {name: funnel-policy, namespace: tailscale-system}]` | `components:` + `postBuild.substitute` in `equestria/home/postiz/ks.yaml`, plus the same `dependsOn: funnel-policy` |
| Vars | `APP: flux-webhook`, `NAMESPACE: flux-system`, `FUNNEL_HOST: flux-${CLUSTER_CNAME}-webhook`, `FUNNEL_PATH: hook`, `FUNNEL_SERVICE: webhook-receiver`, `FUNNEL_PORT: http` | existing `APP`/`NAMESPACE`, plus `FUNNEL_HOST: postiz-media`, `FUNNEL_PATH: uploads`, `FUNNEL_SERVICE: postiz-cdn` (**literal**), `FUNNEL_PORT: http` |

- **The webhook gets its own Kustomization**, not flux-instance's. A fail-closed render or an
  Ingress apply error must not block reconciliation of the FluxInstance itself.
- **`APP` is required.** The Ingress is named `${APP}-funnel`, and without `APP` it renders
  `-funnel`, which the API rejects. `CLUSTER_CNAME` comes from `cluster-secrets`, which the
  parent `cluster-apps` expands.
- **Write `postiz-cdn` literally.** `cluster-apps`' own postBuild
  (`kubernetes/flux/cluster/ks.yaml:111-116`) substitutes only from cluster-secrets and
  shared-secrets, neither of which has `APP`, so `${APP}-cdn` renders `-cdn` and fails the whole
  postiz apply. `degoog ks.yaml:60-63` uses the same literal-override pattern.
- **No name collisions.** No `postiz-media` or `flux-equestria-webhook` device exists today, so
  there is no `-1` rename (live `tailscale__list_devices`).

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
2. **Funnel component, `funnel-policy`, and the webhook Funnel** (§C2, §C3). This runs in parallel
   with the tunnel. Nothing is attached to the `external` Gateway, and the ts.net hostname must
   never go on a route attached to it: `deriveTunnelRules` has no domain filter and would push the
   name into the Cloudflare config.
   - **Admission checks:**
     - `kubectl get validatingadmissionpolicybinding` shows both bindings;
     - the policies' `.status.typeChecking` shows no warnings;
     - `kubectl apply --dry-run=server` of a funnel Ingress is **denied** in each of these cases:
       - in namespace `default`;
       - with a second path;
       - with backend `postiz`;
       - with a proxy-group annotation.
   - **External probes, run from outside the cluster.** An in-cluster probe resolves via the
     operator nameserver instead.
     - `curl https://flux-equestria-webhook.opossum-yo.ts.net/hook/` returns a 404 with an
       **empty body**, which is the receiver's. tailscaled's own 404 says "404 page not found".
     - `/` returns tailscaled's 404.
     - `curl --path-as-is …/hook/../x` and `…/hook/%2e%2e/x` both return tailscaled's 404.
       Without `--path-as-is`, curl removes the dot segments itself and the probe proves nothing.
   - **Proxy checks:**
     - the Ingress status hostname has no `-1`;
     - the device carries `tag:funnel`;
     - the proxy pod is on `control-plane-tolerant`.
3. **Webhook URL** (vault, §D) plus the webhook Gatus probe (§G).
   - **Verify:** the next push shows a 200 on the new URL in GitHub's "Recent deliveries", and hits
     on the Traefik `tunnel` entrypoint for `/hook/` drop to zero.
   - This is the only step that touches GitHub.
4. **CoreDNS carve-out** (§E3). It is harmless on its own: the name is NXDOMAIN publicly until step
   5.
5. **Postiz** (§E2–§E4). The change:
   - the patch initContainer and the canary;
   - `UPLOAD_PUBLIC_URL`;
   - the Funnel component on `postiz-cdn`;
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
     - the `external` Gateway, and the Traefik `tunnel` entrypoint and port;
     - the unattached `cloudflare-ips` and `github-hook-ips` middlewares;
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
       - traefik `values.yaml:99-112`; the `141-171` tunnel block goes with the port;
       - `middleware/crowdsec.yaml:103`;
       - `crowdsec/values.yaml:51`;
       - `docker/_common/traefik/config.yaml:29`;
       - technitium;
       - `services/bootstrap.yaml`.
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
  1. Find the proxy with `kubectl -n tailscale-system get pods -l tailscale.com/parent-resource=<ingress>`.
  2. Delete that pod.
  3. If the endpoint is still red after about 10 minutes (#21114), delete the Ingress and its
     `ts-*` Secret, and let Flux recreate them.
  4. If the device was removed in the admin console, step 3 is also the only fix (#20744).
  5. The webhook falls back to polling, so this is never urgent.

## H. Security posture, before and after

| | Cloudflare Tunnel (today) | Funnel (target) |
|---|---|---|
| Boundary | shared Traefik, dedicated `tunnel` entrypoint | one proxy per endpoint; one `(namespace, Service, path)` per endpoint from an allow-list, enforced by `funnel-ingress-shape` |
| Path traversal | cloudflared `..` deny rule, plus Traefik path cleaning | tailscaled `path.Clean` before the mount match |
| Edge | Cloudflare DDoS protection, HSTS and nosniff headers | Tailscale relays, with no WAF or DDoS promise; add HSTS at the cdn if wanted |
| Internet-facing process's credentials | Traefik: cluster-wide Secret **read** | the `proxies` SA: read, plus write limited to its own `tailscale.com/managed` Secrets by `tailscale-proxies-secret-scope` |
| Tailnet reach of the internet-facing device | none; cloudflared is not a tailnet node | none: `tag:funnel` is left out of every former `autogroup:tagged` grant, and a policy test pins that (J6) |
| Client IP | XFF from the cloudflared pod | XFF from tailscaled, plus `Tailscale-Funnel-Request` |
| Names in CT logs | `*.driscoll.tech` | `*.opossum-yo.ts.net`, already public through the tailnet certs |
| New credential | tunnel token in OpenBao (removed) | none; the operator OAuth client mints `tag:funnel` |

## I. Out of scope, noted

- **The operator's `defaultProxyClass` is inert.** It is set under `operatorConfig`, which chart
  1.102.4 ignores. Moving it to `proxyConfig.defaultProxyClass` is a separate fix; this plan sets
  the label explicitly either way.
- **Some skills describe infrastructure this repo doesn't have.** The `network-policy`,
  `gateway-routing` and `security-testing` skills describe Istio, Coraza and
  `kubernetes/platform/`. They are APM-vendored from another repo, so they are not edited here.
- **The qBittorrent WAN forward (18289) is not in Pulumi.**
- **`stargate-command-cluster` archival (doc 22) unblocks once step 9 lands.** That step removes
  its dead `CLOUDFLARE_*` dependencies.

## J. Open questions

- ✅ **J1. Live tailnet nodeAttrs.** Answered 2026-09-27 from a live policy read.
  - There is **no** `autogroup:member` funnel default, so members cannot self-publish today.
  - The stale `tag:operator` funnel entry **is** live; §C1's filter removes it.
  - nodeAttrs also carry hand-set entries that code does not manage: 7 per-IP `mullvad` entries,
    and the `autogroup:member`, `group:family`, `group:friends` and `group:admins` drive entries.
    So **do not** add nodeAttrs to the blanked sections at `acl-manager.ts:83-88`; the targeted
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
