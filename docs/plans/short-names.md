# Short names: `jellyfin` works on the LAN, Tailscale and NetBird

**Status:** live, 2026-11-06. C1 on every Traefik (#3104), C2 (#3105), C3 and C5 (#3106), C2b (#3109); C4, C6 and C7 (#3111). E5 (Dockge apps on Tailscale) in this PR. Owner: David. Decisions marked ✅ were taken
by David on 2026-11-05, after a read-only look at the live UniFi, Tailscale and NetBird DNS
settings and a probe of the cluster Traefik (§A):

- ✅ A short name (GLOSSARY.md) means the app's app route, `<name>.<root domain>`, on every
  network, LAN and both overlays. It does not mean the tailnet route (`<name>.<tailnet>`) or the
  app service (`<name>.nb.<root domain>`).
- ✅ The IoT network is left alone: nothing that needs short names lives there.

Taken in a second review the same day (decision 1 is also
[ADR 0003](../adr/0003-short-names-complete-to-app-routes.md)):

- ✅ Traefik redirects any dotless host on port 80, not a list of apps. A name that does not exist
  never resolves, so it never reaches Traefik.
- ✅ The redirect stays a 302. It is never made permanent, so a renamed app never leaves a stale
  redirect cached in a browser.
- ✅ NetBird hands the search domain to client devices only: the four user groups and `apple-tv`,
  not the gateways, in-cluster routers or DNS sidecars.
- ✅ The Tailscale search path is tailnet-wide (it cannot be scoped). Servers that accept tailnet
  DNS (the Dockge hosts, ocracoke, gulf-of-mexico) get it too. There are no wildcard records under
  `<root domain>`, and Docker's user networks try a name as-is first, so nothing they use changes.
- ✅ Apple TVs on NetBird get port 80 to the media apps, so the redirect reaches them.
- ✅ Gatus watches the redirect on every Traefik.
- ✅ The NetBird onboarding runbook explains short names once they are verified.

The goal: on iPhones, Apple TVs, Windows PCs and Macs, typing `jellyfin` (or any other app behind
Traefik) reaches the app, at home, on Tailscale and on NetBird. Infrastructure that is not behind
Traefik is out of scope (§C8).

## A. What is there today (2026-11-05)

| Network | Search domain a client gets | Short name |
| --- | --- | --- |
| UniFi Home | `<root domain>` (`domain_name`, DHCP option 15); DNS is Technitium x3 + 10.10.10.9 | resolves: `jellyfin` -> `jellyfin.<root domain>` -> CNAME -> 10.10.206.101 |
| UniFi IoT | `iot.<root domain>` | fails (`jellyfin.iot.<root domain>` is empty). Out of scope (decision above) |
| Tailscale | `<tailnet>` only. MagicDNS on, `overrideLocalDns: true`, Technitium nameservers, `searchPaths: []` | fails for `<root domain>` names, and the override drops the LAN's search domain even at home |
| NetBird | none. One primary nameserver group `Technitium`, no match domains, `search_domains_enabled: false` | fails |

Technitium already answers every `<app>.<root domain>` name, and both overlays already route to
the LAN Traefik (10.10.206.101): the cluster's LAN entry addresses are NetBird network resources
(`stacks/netbird/index.ts`, `homeResourceGroups`), and the Tailscale subnet routers carry the home
subnet. So reaching an app by its full name from an overlay works today.

### A1. DNS alone cannot make a browser work

A request for `http://jellyfin/` against the cluster Traefik:

```
Host: jellyfin                 -> 301 https://jellyfin/
https://jellyfin/ (SNI jellyfin) -> self-signed default certificate, 404
```

The `web` entrypoint's HTTP->HTTPS redirect (`kubernetes/apps/network/traefik/values.yaml`,
`web.http.redirections`) keeps the host it was given. No router matches a dotless host and no
certificate can cover one, so even a perfect search-domain setup ends at a certificate error.
C1 fixes this, and every other phase depends on it.

## B. The design

Each network hands out `<root domain>` as a search domain. Each Traefik turns a dotless `Host`
on port 80 into a redirect to the full name:

```
jellyfin  --search domain-->  jellyfin.<root domain>  --Technitium-->  Traefik :80
          --short-name redirect-->  https://jellyfin.<root domain>/  -->  the app, with its real cert
```

Why the app route rather than each network's own name: Technitium already answers app routes
everywhere, both overlays already reach them, and one name and one bookmark work wherever the
device is. Overlay clients that use the full name already reach the app route today, so short names add
no new exposure.

## C. Phases

Each phase is its own PR and is safe alone: the redirect does nothing until a short name reaches
it, and a search domain without the redirect only changes what a lookup resolves to.

### C0. Checks before building (no changes)

1. **Does MagicDNS already answer the short name?** On a Mac with Tailscale up, run
   `dscacheutil -q host -a name jellyfin`. Plain `nslookup` and `dig` ignore the search list, so
   they cannot answer this. MagicDNS always puts `<tailnet>` first in the search list, and it
   cannot be reordered. If `jellyfin` comes back as a 100.x address, a short name on Tailscale
   lands on the app's Tailscale Service (`kubernetes/components/tailscale/ingress`). That service
   serves only 443, so the short name fails there whatever C2 does. In that case, either have
   the ingress serve an HTTP redirect, if the operator in use supports one (verify), or accept that
   Tailscale short names go to the Service.
2. Confirm the Apple TVs and iPhones are on the Home network (the IoT decision assumes they are).

### C1. Short-name redirect in every Traefik

**Cluster Traefik** (`kubernetes/apps/network/traefik/`):

- A `Middleware` `short-name-redirect`, `redirectRegex`:
  regex `^http://([a-z0-9-]+)(:[0-9]+)?(/.*)?$`, replacement `https://$${1}.${ROOT_DOMAIN}$${3}`.
  The `$$` escapes Traefik's capture groups from Flux's `postBuild` substitution. Only
  `${ROOT_DOMAIN}` is meant to be substituted. Verify the result with `flux build ... --dry-run`.
- An `IngressRoute` on the `web` entrypoint only, matching `HostRegexp(`^[a-zA-Z0-9-]+$`)`,
  priority `2147482647`. That is the highest a user router may have: Traefik reserves everything
  above MaxInt32-1000 for its internal routers. The entrypoint redirect is one of those, at
  MaxInt-1 by default, so no user route can outrank it as it stands. `values.yaml` therefore
  pins `ports.web.http.redirections.entryPoint.priority` to `"2147482646"`, one below the short-name
  route and still far above every other router. It has to be a string, because Helm prints a
  large YAML integer as `2.147482646e+09`. The route matches only hosts without a dot, so every
  existing router is untouched.
- `permanent: false` (302), for good. Browsers cache a 301 indefinitely.
- Exclude `localhost` from the match, in case anything on the node calls Traefik by it.

**Dockge Traefik** (`docker/_common/traefik/dynamic/`): the same router and middleware as file
provider config, on `web`. Dockge apps such as `uptime` resolve to their host's own Traefik, not
the cluster one. `DockgeLxc` substitutes `${ROOT_DOMAIN}` in these files
(`components/DockgeLxc.ts`), and only the variables it names, so `${1}` and `${3}` reach Traefik
as written. The file is mounted on its own, like `middlewares.yaml`. That `web` entrypoint has no
global redirect, so priority only has to beat the per-app routers.

Verify against each Traefik:

```bash
curl -sI -H 'Host: jellyfin' http://10.10.206.101/   # Location: https://jellyfin.<root domain>/
curl -sI -H 'Host: uptime'   http://10.10.10.9/
```

### C2. Tailscale search path

Add `searchPaths: [rootDomain()]` to the `tailscale.DnsConfiguration` in
`stacks/unifi-network/acl-manager.ts`. Tailscale pushes it to iOS, tvOS, macOS and Windows. The
tailnet domain stays first in the search list.

Verify on a Mac with Tailscale up, away from home: `dscacheutil -q host -a name jellyfin` returns
10.10.206.101, and `curl -sI http://jellyfin/` returns the C1 redirect.

**Result (2026-11-06):** it doesn't, for any app with a tailnet route. MagicDNS answers
`jellyfin` itself with the app's Tailscale Service (`jellyfin.<tailnet>`, a 100.x address), so the
search path is never reached (E1). The browser tried `https://jellyfin/`, the Service's TLS
refused the name (`SSL_ERROR_INTERNAL_ERROR_ALERT`), and there was nothing on :80 to fall back to.
C2b fixes it at the Service.

### C2b. Tailscale Services serve port 80, and Traefik redirects it

✅ Decided 2026-11-06: port 80 on every tailnet Ingress, redirected to the app route (ADR 0003
unchanged).

- `kubernetes/components/tailscale/ingress/ingress.yaml`: `tailscale.com/http-endpoint: enabled`.
  tailscaled (v1.104.4) completes a dotless plain-HTTP `Host` with `.<tailnet>` to find the
  Service, then forwards it to the same backend, Traefik's `tailscale` entrypoint, with the Host
  kept. Not `tailscale.com/http-redirect`: that redirects to `https://<same host>`, which is
  `https://jellyfin/` again.
- `kubernetes/apps/network/traefik/short-names.yaml`, IngressRoute `short-names-tailscale`: on the
  `tailscale` entrypoint, any request without `X-Forwarded-Proto: https` came in on :80. tailscaled
  sets that header only over TLS, and the entrypoint trusts the proxy pods' headers. A short name
  is redirected to its app route, anything else to https on the same host. Nothing is ever served
  over plain HTTP.
- The ACL needs nothing: `default-apps-access` already gives members `ports.web` (80 included)
  on `tag:apps`.

Verify, on a Mac with Tailscale up: `curl -sI http://jellyfin/` returns 302 to
`https://jellyfin.<root domain>/`; `curl -sI http://jellyfin.<tailnet>/` returns a redirect to
`https://jellyfin.<tailnet>/`; the browser opens `jellyfin/`.

**Dockge apps** are Tailscale Services too (`svc:<app>`, `components/DockgeLxc.ts`, 443 only), so
`uptime` on Tailscale has the same problem. Not in C2b: adding a port to a `tailscale.Service`
there replaces it (`replaceOnChanges: ["*"]`, delete before replace), which recreates every Dockge
Service at once. Decide separately (E5).

✅ Decided 2026-11-06: do it. Ten Dockge Services have plain names that collide with a short name
(`authentik`, `uptime`, `zwave`, `registry`, `llama-agent`, `llama-voice`, `garage-admin`,
`garage-s3`, `bao-standby`, `bao-transit`); the `<app>-${host}` ones don't, but share the code.
`components/DockgeLxc.ts` gives every Service `tcp:80` and a second `tailscale serve --http=80`
to the same loopback entrypoint, and `docker/_common/traefik/dynamic/short-names.yaml` adds the
same two `tailscale`-entrypoint routes as the cluster. The port change replaces every Dockge
Service once (a brief outage per app).

### C3. NetBird search domain

NetBird hands out search domains only from nameserver groups with match domains, so the existing
primary group cannot carry one. Add a second `netbird.NameserverGroup` next to `technitium` in
`stacks/netbird/index.ts`:

- `domains: [rootDomain()]`, `searchDomainsEnabled: true`, `primary: false`;
- the same `nameservers` (from `selectNameservers`), so the two groups can never disagree;
- groups: the four user groups (`USER_GROUPS`) and `apple-tv`. Not `all`: the gateways, in-cluster
  routers and DNS sidecars are servers and keep resolving as they do today.

Risk to test: the new `<root domain>` match domain must not capture the names the NetBird client
answers itself, `<device>.nbd.<root domain>` and `<app>.nb.<root domain>` (D56). The more
specific zone should win. After the change, confirm on a NetBird client that both still resolve.

### C4. UniFi Home: pin what is already there

Home already hands out `<root domain>`. Add `domain_name: rootDomain()` to the home network's
partial PUT in `stacks/unifi-network/local-dns.ts`, so a hand edit shows up as drift. The IoT PUT
stays as it is (decision above).

### C5. Apple TVs on NetBird: port 80

`apple-tv-media` in `stacks/netbird/policy.ts` allows only TCP 443 to `home-media`. Add 80, so
`http://<app>` reaches the redirect, and update its test in `policy.test.ts`. The rule mirrors no
Tailscale grant, so `policyDrift.ts` is unaffected.

### C6. Gatus watches the redirect

In each Traefik's own definition, so every Dockge host gets its check from `_common`:

- `kubernetes/apps/network/traefik/definition.yaml`: `http://internal.<cluster domain>/` and
  `:8443/` (the tailnet entrypoint);
- `docker/_common/traefik/definition.yaml`: `http://internal.<cluster domain>/` on each host.

Each sends `Host: gatus-short-name` (any dotless name works) with `client.ignore-redirect`, and
expects `[STATUS] == 302`. Gatus can't check a header, but 302 alone tells them apart: on `web` the
entrypoint's own redirect is a 301, so a 301 means the short-name route stopped matching. All six
probes returned 302 when this was written.

### C7. Tell people (last, after C1–C6 are verified on each platform)

In `docs/runbooks/netbird-client-onboarding.md`:

- under **What works**: short names, typed as `jellyfin/` or `http://jellyfin` (a bare word goes to
  the search engine), and the full name for apps on a TV;
- under **When it doesn't work**: "a short name searches instead of opening" -> add the trailing
  `/`; "a short name doesn't resolve" -> the app's DNS setting, as for full names.

### C8. Out of scope: names that are not behind Traefik

These resolve as short names but go straight to the device, so there is no redirect and the
device's own HTTPS shows a certificate mismatch: `unifi` (10.10.0.1), `truenas` (10.10.10.10), the
Proxmox hosts, `authentik` (its VIP). Keep full-name bookmarks for them, or put one behind Traefik
later.

## D. What to expect on each device

- **Windows, macOS (Chrome, Edge, Safari):** type `jellyfin/` (trailing slash) or
  `http://jellyfin`. A bare word goes to the search engine. Chrome and Edge also show a "did you
  mean http://jellyfin/" prompt. Command-line tools (`ping`, `curl`) take the bare name.
- **iPhone:** Safari searches a single word. `http://jellyfin` works, but Home Screen bookmarks to
  the full name are the better habit.
- **Apple TV:** there is no browser, and the apps (Jellyfin, Infuse, ...) want a server address.
  Enter `https://jellyfin.<root domain>` once. Short names add little on tvOS, but C5 lets
  `http://<app>` redirect there too.
- **One overlay per device.** iOS and tvOS run one VPN at a time. On a Mac or Windows PC, Tailscale
  and NetBird compete for DNS when both are on.
- **Chrome's HTTPS upgrade** tries `https://jellyfin/` first, hits the certificate error, and should
  fall back to HTTP and the redirect. Test this on each browser in C1.

## E. Open questions

- ~~E1. Does MagicDNS answer short names for Tailscale Services?~~ Yes (2026-11-06): `jellyfin`
  resolves to its Tailscale Service before the search path is tried. C2b.
- E2. Does the NetBird client keep `nbd`/`nb` names on its local resolver once a `<root domain>`
  match domain exists (C3)?
- ~~E3. Does NetBird ship a tvOS client?~~ Yes: Apple TVs enrol into the `apple-tv` device group
  (docs/runbooks/netbird-client-onboarding.md, #2886).
- ~~E4. Does Gatus treat a `Host` header as the request host (C6)?~~ Yes: `request.Host` is set from it
  (TwiN/gatus `config/endpoint/endpoint.go`).
- ~~E5. Dockge apps' Tailscale Services: add :80?~~ Yes, see C2b.
