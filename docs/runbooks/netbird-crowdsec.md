# NetBird edge: CrowdSec

CrowdSec on the netbird-edge hosts (Azure eastus2 / centralus, OCI when it is
on). The design is in `components/netbird/crowdsec.ts`; this page covers
turning enforcement on and getting someone unbanned.

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| `netbird-crowdsec` | each edge host, not fenced | Agent + AppSec. No local LAPI. Logs in to Equestria's LAPI as machine `netbird_<id>` |
| `netbird-crowdsec-socket` | each edge host | Read-only Docker API (containers, info). The agent reads `netbird-traefik`'s log through it |
| `netbird-crowdsec` middleware | edge Traefik, file provider | Bouncer plugin. On the dashboard and on `/api` + `/oauth2` only. gRPC and `/relay` are never covered |
| `svc:crowdsec-lapi` | Equestria, `network/crowdsec-lapi-tailnet` | LAPI on 8080, reachable from `tag:netbird-edge` only (`netbird-edge-crowdsec` grant) |
| Identities | OpenBao `clusters/equestria/apps/crowdsec/netbird-edge` | Written by stacks/netbird-edge. Registered by the LAPI: bouncers by the chart entrypoint, machines by `edge-register.sh` |

Bans are one pool. Something the edge agents detect is banned at home
(currently only at the Funnel door, where home enforces), and home and
community bans apply at the edge once enforcement is on. The LAPI allowlist
`driscoll-internal-networks` stops anything banning LAN, cluster or tailnet
addresses.

Every failure fails open. If the LAPI is unreachable, the bouncer keeps its
last decisions and AppSec keeps the keys it has already validated. If AppSec
is unreachable or errors, the request is allowed.

## Step 1: shipped with enforcement off

`netbird-edge:crowdsecEnforce` is unset (false). Everything runs, and the
middleware is attached with `enabled: false`. Before step 2, confirm:

1. **Machines and bouncers exist.** In the LAPI pod, `cscli machines list`
   shows `netbird_azure_eus2` and `netbird_azure_cus` with recent heartbeats,
   and `cscli bouncers list` shows the same two names. If not, grep the LAPI
   log for `CROWDSEC_EDGE_REGISTER`.
2. **Logs are being parsed and decisions fetched.**
   `NetbirdCrowdsecAcquisitionStalled`, `NetbirdCrowdsecNotReporting` and
   `NetbirdCrowdsecBouncerNotPolling` are quiet. The bouncer polls even while
   disabled. Also check that
   `cs_dockersource_hits_total{cluster="netbird-edge"}` is rising for each
   host.
3. **Alerts carry real public client IPs.** `cscli alerts list` shows
   `netbird_*` machines raising alerts against internet addresses, not
   `172.30.0.x`. Each agent parses its own Traefik's access log, so this is
   what proves the edge sees real clients.
4. **The dashboard works with the middleware attached.** Being attached while
   disabled still validates the plugin config and reads the key file. A
   broken key would already have taken the dashboard and `/api` down.

## Step 2: enforce

```bash
cd stacks/netbird-edge
pulumi config set netbird-edge:crowdsecEnforce true
pulumi preview   # only traefik-dynamic.yaml changes on each host
pulumi up --yes
```

Then:

1. **Test a ban.** From a phone off the tailnet and LAN, note its public IP
   and run `cscli decisions add --ip <ip> --duration 3m --reason "edge test"`
   in the LAPI pod. Within a minute the dashboard and `/api` answer 403 for
   that IP, and a NetBird client on the same phone still connects (gRPC is
   not covered). Then `cscli decisions delete --ip <ip>`.
2. **Test AppSec.** From the same phone, request
   `https://netbird.<root domain>/api/.env`. It should be blocked by
   `crowdsecurity/vpatch-env-access`.
3. **Test a cold start with the LAPI down**, the one path that does not fail
   open. AppSec only answers for bouncer keys it has validated. A crowdsec
   container started while the LAPI is unreachable has none, answers 401, and
   the plugin blocks on a 401. Try it on the standby host:
   `docker compose restart crowdsec` with the `netbird-edge-crowdsec` grant
   temporarily removed. If the dashboard 403s, the mitigation is to set
   `crowdsecAppsecEnabled: false` for the outage, or to accept the gap.

## Someone is banned

Unbanning happens at the LAPI, not on the host:

- **crowdsec-ui** (tailnet, admins only): Decisions, then delete.
- **Or in the LAPI pod:** `cscli decisions delete --ip <ip>`.
- **Permanently exempt an address:**
  `cscli allowlists add driscoll-internal-networks <ip> -d "<why>"`.
  `edge-register.sh` only ever adds entries, so manual ones survive LAPI
  restarts.

**Break-glass, if the LAPI itself is unreachable:** the bouncer is still
enforcing its last cache. Set `netbird-edge:crowdsecEnforce false` and run the
stack. If Pulumi can't run either, edit `/opt/netbird/traefik-dynamic.yaml` on
the host over Tailscale SSH and set `enabled: false`. Traefik watches that
file. The next deploy overwrites the edit.
