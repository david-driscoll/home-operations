# Network map: graph schema

The network map (GLOSSARY.md) lives in Neo4j (`database/neo4j`). Homelable only displays a
projection of it. ADR 0006 explains that split. This file is the contract that the collector,
the declared-layer loader, the Homelable sync, the saved Cypher queries and the Neo4j MCP's
users all share.

Everything here is in the glossary's language. A **Machine** is a node, its **Interfaces**
are nodes, and an **App** is a node. Reach and paths are relationships and queries over them.

## Two layers, one graph

Every node and relationship carries a `layer` property:

| `layer`    | Written by | When | Source of truth |
|---|---|---|---|
| `observed` | the collector (CronJob, hourly) | each run | what the control planes and hosts report now |
| `declared` | the declared loader (Forgejo workflow) | on push to `main` | what the repo says |

The two layers are separate nodes, joined by `(:Declared…)-[:DECLARES]->(:Observed…)`.
A declared thing with no `DECLARES` edge, or an observed thing nothing declares, is **drift**.
Keeping them separate means each writer replaces only its own layer:
`MATCH (n {layer: $layer, source: $source}) WHERE n.seenRun <> $run DETACH DELETE n`.

Each writer stamps the following on everything it writes:
- `source`: `unifi`, `tailscale`, `netbird`, `kubernetes`, `proxmox`, `docker`, or `repo`
- `seenRun`: the run id
- `firstSeen` / `lastSeen`: taken from the source API where it reports them, otherwise the run time

### Retention

Observed machines that nothing declares are removed 30 days after `lastSeen`. Declared machines
are never removed: if one stops being observed, it simply shows as drift.

## Nodes

| Label | Key (unique per layer) | Main properties | Notes |
|---|---|---|---|
| `Machine` | `machineId` | `name`, `kind` (`physical`/`vm`/`lxc`/`container`/`client`), `os`, `status` | One per computer, however many networks it is on. |
| `Interface` | `ifaceId` = `<network>:<address>` | `network`, `mac`, `ips[]`, `hostname`, `online`, `lastSeen` | One per machine per network. |
| `Network` | `networkId` | `kind` (`vlan`/`tailnet`/`netbird`/`site-lan`/`k8s-pod`/`k8s-svc`), `cidr`, `vlan` | UniFi networks, the tailnet, NetBird, each site LAN. |
| `Device` | `mac` | `model`, `type` (`gateway`/`switch`/`ap`) | UniFi infrastructure; also a `Machine`. |
| `Port` | `<deviceMac>:<idx>` | `idx`, `speed`, `poe` | Switch ports, for uplinks and wired clients. |
| `Group` | `<system>:<name>` | `system` (`tailscale`/`netbird`/`authentik`), `kind` (`user`/`device`/`tag`/`self`) | User groups, device groups and Tailscale tags. |
| `Route` | `<system>:<cidr>` | `cidr`, `exit` (bool) | Tailscale subnet routes and exits; NetBird routes and network resources. |
| `App` | `appId` (the definition name) | `appRoute`, `tailnetRoute`, `appService`, `cluster` | From `definition.yaml`. |
| `EntryPoint` | `entryId` | `kind` (`traefik`/`tailscale-service`/`proxy-cluster`/`gateway`), `address` | What answers on an app's name. |
| `Zone` | `<system>:<name>` | `system` (`unifi-fw`/`technitium`/`cloudflare`) | UniFi firewall zones (with the declared zone-to-network map) and DNS zones. |
| `Policy` | `<system>:<id>` | `system`, `name`, `action`, `ports[]` | A Tailscale grant, NetBird policy rule or UniFi zone policy. |

## Relationships

| Type | From → To | Meaning |
|---|---|---|
| `HAS_INTERFACE` | Machine → Interface | |
| `ON` | Interface → Network | |
| `HOSTED_ON` | Machine → Machine | A VM/LXC on its Proxmox host, or a container on its Dockge host. |
| `UPLINK` | Device → Device, or Interface → Port | `{speed, port}`. Wired topology. |
| `ASSOCIATED` | Interface → Device | A Wi-Fi client to its AP (`{essid, band}`). |
| `MEMBER_OF` | Machine or Interface → Group | Tags, NetBird groups, Authentik groups (for users' devices). |
| `ADVERTISES` | Interface → Route | `{approved}`. A router or exit node offering a route. |
| `ROUTES_TO` | Route → Network | |
| `RUNS` | Machine → App | |
| `SERVED_BY` | App → EntryPoint | `{name}`, one per app name (app route, tailnet route, app service). |
| `REACHES` | Group → Group / Network / App / Machine | `{via: <Policy key>, ports[]}`. **Reach**: what is permitted. |
| `IN_ZONE` | Network → Zone | The UniFi firewall zone map (declared only: the API omits it). |
| `DECLARES` | declared node → observed node | Joins the two layers. |

A **path** (GLOSSARY.md) is a query, not a stored edge. It is a chain of
`HAS_INTERFACE/ON/ADVERTISES/ROUTES_TO/SERVED_BY` hops in which every hop is also covered by a
`REACHES`. If a route exists without reach, or reach exists without a route, that is drift.

## Joining sources into one machine

This is what the 2026-11-07 live inventory found. The collector tries these in order and stops
at the first match:

1. **MAC**, lowercased with colons. It joins UniFi clients, NetBird `network_addresses[].mac`
   and Proxmox `net0` `hwaddr`/`virtio=`. This was confirmed on luna-dockge and gateway-luna.
2. **LAN IP**: the UniFi client `ip`/`fixed_ip`, NetBird `net_ip`, Proxmox `get_container_ip`,
   and UniFi port-forward `fwd_ip`.
3. **Tailscale.** It has no MAC or LAN IP, so it joins through a 100.x address seen on a
   Proxmox guest's `tailscale0`, through a Kubernetes `tailscale.com/tailnet-fqdn`, through
   Traefik `*-tailscale` host rules, and last of all by hostname.
4. **Hostname** is the last resort. It is unreliable: `apple-tv` appears five times on
   Tailscale, and NetBird hostnames are sometimes pod names.

Anything left unmatched stays a separate `Machine` with `joined: false`, which drift queries
flag.

## What the observed layer can't see (yet)

- **UniFi** reports no firewall zone membership, so `IN_ZONE` is declared only. A client's
  switch port, AP and network come only from a separate detail call per client (about 40 online).
- **Tailscale** reports no device owner, online state, split DNS or Tailscale Service VIPs.
  Service names come only from `autoApprovers.services`.
- **NetBird**: the MCP lacks network resource addresses and reverse-proxy services. The
  collector calls the management API directly, which has them.
- **Proxmox** reports no node IPs, and VM IPs only through the guest agent. The collector joins
  VMs by MAC instead.

## Homelable projection

The sync owns four designs and replaces each one entirely every hour through
`/canvas/save`. Node ids are deterministic: UUIDv5 of `<design>:<key>`, namespaced per
design. All four are read-only in the UI, and hand edits are discarded.

| Design | Shows |
|---|---|
| UniFi | Gateway → switches → APs (`UPLINK`), with clients inside one zone per VLAN |
| Tailscale | Devices grouped by tag, subnet routers and exits, with routes as edges |
| NetBird | Peers grouped by group, gateways and in-cluster routers, with networks |
| Apps | Apps grouped by the machine that runs them, entry points, and user groups with reach edges |

Homelable pings infrastructure only (gateway, switches, APs, Proxmox and Dockge hosts, NetBird
gateways). Clients and peers take their status from the source APIs.
