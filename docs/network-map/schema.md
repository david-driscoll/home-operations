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

## The declared layer

The loader (`images/network-map/declared`, run by `.forgejo/workflows/network-map-declared.yml`)
reads these, and writes everything with `layer: declared`, `source: repo`:

| Source | Becomes |
|---|---|
| `definition.yaml` under `kubernetes/apps`, with its `ks.yaml` | `App` (`appId` = the ks's `APP`), `appRoute`/`tailnetRoute`/`appService`; `Group authentik:<g>` `REACHES` it via `Policy authentik:access-policy:<app>` |
| `docker/<host>` plus `docker/_common`, less `*.ignore` | `App` per stack (`appId` = stack name), names from Traefik `Host()` rules; the host's LXC `RUNS` it |
| `new ProxmoxHost/DockgeLxc/TalosVm/TruenasVm` in `stacks/{home,gulf-of-mexico,ocracoke}` (literal args only), `talos/topf.yaml` `nodes` (`host`, `ip`, `role`, `data.mac`), `clusters/*.yaml` | `Machine repo:<hostname>` with `ips[]`, `macs[]`, `cluster`; `HOSTED_ON`; the Tailscale `Route`s a host advertises |
| `stacks/netbird` `policy.ts`, `sites.ts` | NetBird `Group`s, `Policy netbird:client-<rule>`, `REACHES`, `Route`s to `Network site-lan:<site>`, gateway `Machine`s |
| `components/constants.ts` | Tailscale tag and group `Group`s, subnet and cluster `Route`s |
| `images/network-map/declared/unifi-zones.yaml` | `Zone unifi-fw:<zone>`, `Network unifi:name:<name>`, `IN_ZONE` |

Each load replaces the whole declared layer in one transaction and never touches `observed`.
A source that is missing or does not parse is logged as a problem and only its nodes are left
out; the rest still load.

`DECLARES` (`src/declares.ts`) is re-derived from scratch by BOTH writers, the loader on each
push and the collector every hour, so something first observed after a push is linked within the
hour. The edge carries `by`, the rule that made it:

| Declared | Observed | `by` |
|---|---|---|
| `App`, `Group`, `Route`, `Network` | same label, same key | `key` |
| `Network {system: unifi}` | `Network {source: unifi}` with the same `name` | `name` |
| `Policy {system: netbird}` | `Policy {system: netbird}` named `policyName` or `policyName/<rule>` | `name` |
| `Machine` | a `Machine` with one of `macs` on an interface or as its device MAC | `mac` |
| `Machine` with no edge yet | a `Machine` with one of `ips` on an interface | `ip` |
| `Machine` with no edge yet | a `Machine` whose `hostnames` hold `hostname` | `hostname` |

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
gateways), at its LAN address, at home or at a remote site (Equestria reaches every site LAN; a pod has no route into either overlay). Clients and
peers take their status from the source APIs.

The sync (`images/network-map/src/homelable/`) runs in the collector's CronJob, right after the
write. Some rules it follows:

- **Drift** is marked with a border colour and a `drift` property: amber for an observed node that
  nothing `DECLARES`, red for a declared node that `DECLARES` nothing. For App, Group, Route and
  Network a shared key also counts as a match, as the drift alerts treat it. Declared-only
  machines are drawn in a "Declared, not observed" zone, placed by their declared addresses and
  groups (they have no Interfaces). Drift is only judged for labels the declared layer has at
  least one node of, and UniFi gear is judged as a `Device`, which the repo never declares. A
  client Machine (`kind: client`: phones, laptops, IoT) is never amber; a new unknown client is
  the `NetworkMapUnknownClient` alert's to report. A matched node lists its DECLARES `by` as a
  "declared by" property.
- **One parent per node.** Homelable nests a node in one zone only, so a device in several groups
  or tags sits in the first one and lists the rest as a property.
- **Inventory rows.** Homelable keeps device facts (label, type, ip, status, properties) on an
  inventory row shared across designs by IP, then MAC. So a Machine's label and node type depend
  on the Machine alone, never on the design, and each save sends back the `device_id` each node
  already has. Every node the sync draws carries a hidden `managed-by: network-map` property, and
  so does its row. After a run in which every design saved, the sync deletes the rows with that
  exact property that no design draws any more (`canvas_count` 0). It deletes none in a run that
  would remove more than a quarter of its own rows (at least 3 may always go), and never touches
  a row without the property.
- **Designs** are found by name. The UniFi design takes over Homelable's starting design,
  "Network Topology", by renaming it, but only while that design is empty.
