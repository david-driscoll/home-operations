# Network map: saved queries

Cypher for the four questions ADR 0006 says the network map answers: where a
thing is, the path from A to B, what a user group can reach, and where the
estate has drifted. Each query starts with the question it answers, in
GLOSSARY.md's words, and is written against [schema.md](schema.md).

Run them through the `neo4j` server in the `toolport-networking` profile
(`neo4j__read_neo4j_cypher`, with the parameters in `params`), or in the Neo4j
browser, where `:param name => value` sets each parameter first.

Three things to know before you read the results:

- **The two layers are separate nodes.** Every node and relationship has
  `layer: 'observed'` (the hourly collector) or `layer: 'declared'` (the
  loader, on push to main). The declared layer is still being built and may be
  empty. Queries marked **needs the declared layer** return nothing useful
  until it is loaded.
- **The key property names are the collector's** (`images/network-map/src/cypher.ts`
  `KEY_PROPERTY`): `machineId`, `ifaceId`, `networkId`, `mac` (Device),
  `portId`, `groupId`, `routeId`, `appId`, `entryId`, `policyId`. schema.md
  gives their value formats.
- **Observed data can be stale.** A source that failed keeps its last good
  nodes. Check [Stale sources](#stale-sources) before trusting what one source
  says.

The queries under [Drift](#drift) feed the drift alerts
(`images/network-map/src/drift.ts`). Their text here is the text that job runs:
`drift.test.ts` fails if the two differ, so change both together.

## Where is it

### Where is a machine

Where is this machine: its interfaces, the network each one is on, the switch
port or AP it reaches that network through, and the machine hosting it? Match
by name, MAC (lowercase, with colons) or IP.

```cypher
// :param q => 'luna-dockge'
MATCH (m:Machine {layer: 'observed'})
WHERE toLower(m.name) CONTAINS toLower($q)
   OR EXISTS {
     MATCH (m)-[:HAS_INTERFACE]->(x:Interface)
     WHERE x.mac = toLower($q) OR $q IN x.ips OR toLower(x.hostname) CONTAINS toLower($q)
   }
OPTIONAL MATCH (m)-[:HOSTED_ON]->(host:Machine)
OPTIONAL MATCH (m)-[:HAS_INTERFACE]->(i:Interface)
OPTIONAL MATCH (i)-[:ON]->(n:Network)
OPTIONAL MATCH (i)-[:UPLINK]->(p:Port)
OPTIONAL MATCH (sw:Device {layer: 'observed', mac: p.deviceMac})
OPTIONAL MATCH (i)-[wifi:ASSOCIATED]->(ap:Device)
RETURN m.name AS machine, m.kind AS kind, m.status AS status, host.name AS hostedOn,
       n.name AS network, n.kind AS networkKind, n.cidr AS cidr,
       i.mac AS mac, i.ips AS ips, i.hostname AS hostname, i.online AS online,
       CASE WHEN sw IS NOT NULL THEN sw.name + ' port ' + toString(p.idx) END AS switchPort,
       CASE WHEN ap IS NOT NULL THEN ap.name + ' (' + coalesce(wifi.essid, '?') + ', ' + coalesce(wifi.band, '?') + ')' END AS accessPoint,
       i.lastSeen AS lastSeen
ORDER BY machine, network
```

UniFi gives a client's switch port and AP only for online clients (schema.md
"What the observed layer can't see"), so an offline client shows neither.

### Where is an app

Which machine runs this app, and which entry points answer on its names?

```cypher
// :param app => 'jellyfin'
MATCH (a:App {layer: 'observed'})
WHERE toLower(a.appId) CONTAINS toLower($app)
OPTIONAL MATCH (m:Machine)-[:RUNS]->(a)
OPTIONAL MATCH (a)-[s:SERVED_BY]->(e:EntryPoint)
RETURN a.appId AS app, a.cluster AS cluster, collect(DISTINCT m.name) AS runsOn,
       collect(DISTINCT CASE WHEN s IS NULL THEN null ELSE {name: s.name, entryPoint: e.entryId, kind: e.kind, address: e.address} END) AS names
ORDER BY app
```

## Path from A to B

Is there a path from machine A to machine B (or to the machines that run app
B): a chain of interfaces and routers in which every hop is routed AND
permitted by reach? Each row is one pair of interfaces, and `verdict` says
which. A route without reach, or reach without a route, is drift, not a path
(GLOSSARY.md "Path").

```cypher
// :param from => 'macbook'
// :param to => 'jellyfin'
MATCH (a:Machine {layer: 'observed'}) WHERE toLower(a.name) = toLower($from)
MATCH (b:Machine {layer: 'observed'})
WHERE toLower(b.name) = toLower($to)
   OR EXISTS { MATCH (b)-[:RUNS]->(app:App {layer: 'observed'}) WHERE toLower(app.appId) = toLower($to) }
MATCH (a)-[:HAS_INTERFACE]->(ai:Interface)-[:ON]->(n1:Network)
MATCH (b)-[:HAS_INTERFACE]->(bi:Interface)-[:ON]->(n2:Network)
WITH a, b, ai, bi, n1, n2,
     COLLECT {
       MATCH (n1)<-[:ON]-(ri:Interface)-[:ADVERTISES {approved: true}]->(r:Route)-[:ROUTES_TO]->(n2)
       WHERE ri.online IS NULL OR ri.online
       RETURN r.cidr + ' via ' + coalesce(ri.hostname, ri.ifaceId) AS hop
     } AS routes,
     COLLECT {
       MATCH (a)-[:HAS_INTERFACE*0..1]->()-[:MEMBER_OF]->(g:Group)-[reach:REACHES]->(dst)
       WHERE dst = b OR dst = n2
          OR EXISTS { MATCH (b)-[:HAS_INTERFACE*0..1]->()-[:MEMBER_OF]->(dst) }
          OR EXISTS { MATCH (b)-[:RUNS]->(dst) }
       RETURN g.groupId + ' -> ' + coalesce(dst.groupId, dst.networkId, dst.appId, dst.machineId) + ' (' + coalesce(reach.via, '?') + ')' AS allowedBy
     } AS reach
WITH a, b, ai, bi, n1, n2, routes, reach, n1 = n2 AS sameNetwork
WITH a, b, ai, bi, n1, n2, routes, reach,
     sameNetwork OR size(routes) > 0 AS routed,
     size(reach) > 0 OR (sameNetwork AND n1.kind IN ['vlan', 'site-lan']) AS permitted
RETURN a.name AS source, n1.networkId AS sourceNetwork, ai.ips AS sourceIps, routes, reach,
       b.name AS target, n2.networkId AS targetNetwork, bi.ips AS targetIps,
       CASE WHEN routed AND permitted THEN 'path'
            WHEN routed THEN 'route without reach (drift)'
            WHEN permitted THEN 'reach without route (drift)'
            ELSE 'no path' END AS verdict
ORDER BY verdict, sourceNetwork, targetNetwork
```

How it decides:

- **Routed**: both interfaces are on the same network, or a live router on the
  source's network (the tailnet, NetBird) advertises an approved route that
  `ROUTES_TO` the target's network. One hop through a router; it does not chain
  two.
- **Permitted**: a group the source machine or one of its interfaces is a
  member of `REACHES` the target machine, its network, a group it is in, or an
  app it runs. Two interfaces on the same UniFi VLAN or site LAN need no
  policy.
- **Not modelled yet**: traffic between two UniFi VLANs. The gateway routes it,
  but the observed layer has no route for that and no UniFi zone policy (the
  API reports no zone membership, so `IN_ZONE` is declared only). Such pairs
  show as `no path` until the declared layer brings the zone map.

## Who can reach what

### What a group can reach

What can this user group reach, in each system? Matches the group's name in
every system at once (`admins` finds `tailscale:group:admins` and
`netbird:admins`), or one full key. Set `layer` to `'declared'` to ask what
the repo grants instead of what the control planes do. Authentik groups come
only from the declared layer: the collector does not read Authentik.

```cypher
// :param group => 'admins'
// :param layer => 'observed'
MATCH (g:Group {layer: $layer})
WHERE g.groupId = $group OR toLower(g.name) = toLower($group)
MATCH (g)-[r:REACHES]->(t)
RETURN g.system AS system, g.groupId AS fromGroup, labels(t)[0] AS targetKind,
       coalesce(t.groupId, t.networkId, t.appId, t.machineId) AS target,
       coalesce(t.name, t.cidr, '') AS targetName, r.via AS policy, r.ports AS ports
ORDER BY system, target
```

### Who can reach a thing

Which groups can reach this machine, app, network or group, and through which
policy?

```cypher
// :param target => 'jellyfin'
// :param layer => 'observed'
MATCH (g:Group {layer: $layer})-[r:REACHES]->(t {layer: $layer})
WHERE toLower(coalesce(t.groupId, t.networkId, t.appId, t.machineId)) CONTAINS toLower($target)
   OR toLower(t.name) CONTAINS toLower($target)
RETURN labels(t)[0] AS targetKind, coalesce(t.groupId, t.networkId, t.appId, t.machineId) AS target,
       g.system AS system, g.groupId AS fromGroup, r.via AS policy, r.ports AS ports
ORDER BY target, system, fromGroup
```

### Who is in a group

Which machines are in this group (directly, or through one of their
interfaces)?

```cypher
// :param group => 'gateways'
// :param layer => 'observed'
MATCH (x {layer: $layer})-[:MEMBER_OF]->(g:Group {layer: $layer})
WHERE g.groupId = $group OR toLower(g.name) = toLower($group)
OPTIONAL MATCH (m:Machine)-[:HAS_INTERFACE]->(x)
RETURN g.groupId AS memberOf, coalesce(m.name, x.name) AS machine, x.hostname AS hostname, x.ips AS ips, x.online AS online
ORDER BY memberOf, machine
```

## Drift

The first five queries are what the drift alerts run every 15 minutes
(`kubernetes/apps/database/network-map/drift.yaml`). Times are epoch
milliseconds; in the browser, wrap one in `datetime({epochMillis: x})` to read
it.

### Declared layer contents

How much of the declared layer is there? Each drift alert that needs the
declared layer stays silent while the part it needs is empty: no declared
machines means no "declared but not observed" machines and no unknown
clients, and reach drift is judged only for the systems listed in
`reachSystems`.

```cypher
RETURN
  COUNT { MATCH (m:Machine {layer: 'declared'}) } AS machines,
  COUNT { MATCH (a:App {layer: 'declared'}) } AS apps,
  COLLECT {
    MATCH (f:Group {layer: 'declared'})-[:REACHES {layer: 'declared'}]->()
    RETURN DISTINCT coalesce(f.system, split(f.groupId, ':')[0]) AS system
  } AS reachSystems
```

### Routes with no live router

Which Tailscale subnet routes, exit nodes, NetBird routes and NetBird network
resources have no live router? Alert `NetworkMapRouteNoLiveRouter`. Observed
layer only.

```cypher
MATCH (r:Route {layer: 'observed'})
OPTIONAL MATCH (i:Interface {layer: 'observed'})-[a:ADVERTISES]->(r)
OPTIONAL MATCH (m:Machine {layer: 'observed'})-[:HAS_INTERFACE]->(i)
WITH r, collect(CASE WHEN i IS NULL THEN null ELSE {machine: coalesce(m.name, i.hostname, i.ifaceId), approved: a.approved, online: i.online} END) AS routers
RETURN r.routeId AS routeId, coalesce(r.system, r.source) AS system, r.cidr AS cidr, coalesce(r.exit, false) AS exit, r.name AS name, routers
ORDER BY routeId
```

The query lists every route with its routers; `drift.ts` (`classifyRoutes`)
decides. A route is in use when a router advertises it approved (enabled in
the Tailscale admin, or an enabled NetBird route or resource). It alerts when
every approved router reports `online: false`, and when a NetBird route has no
router at all (its routing peer group is empty). An unknown online state
counts as live, and an advertised but unapproved route is not in use.

### Declared but not observed

Which declared machines (gateways included) and apps has nothing observed for
6 hours? Alert `NetworkMapDeclaredNotObserved`. **Needs the declared layer.**

```cypher
MATCH (d {layer: 'declared'})
WHERE d:Machine OR d:App
RETURN CASE WHEN d:App THEN 'app' ELSE 'machine' END AS kind,
       coalesce(d.machineId, d.appId) AS nodeKey,
       coalesce(d.name, d.machineId, d.appId) AS name,
       d.firstSeen.epochMillis AS declaredSinceMs,
       COLLECT {
         MATCH (d)-[:DECLARES]->(o {layer: 'observed'}) RETURN o.lastSeen.epochMillis AS seen
         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = d.appId RETURN o.lastSeen.epochMillis AS seen
         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = d.deployedAs RETURN o.lastSeen.epochMillis AS seen
       } AS observedLastSeenMs
ORDER BY kind, nodeKey
```

`observedLastSeenMs` holds when each observed counterpart was last seen: those
a `DECLARES` edge joins, plus (for an app) the observed app with the same
`appId`, or with the declared app's `deployedAs` (the ks's `APP`, when the
definition is named otherwise). The alert fires when the newest is over 6 hours old. With no
counterpart at all, it fires once the declaration itself is 6 hours old, so a
new declaration gets the same grace to be observed.

### Observed but not declared

What is on the estate that the repo does not declare? Not an alert: every
phone and laptop is here. **Needs the declared layer** (without it, this is
everything).

```cypher
MATCH (o {layer: 'observed'})
WHERE (o:Machine OR o:App)
  AND NOT EXISTS { MATCH ({layer: 'declared'})-[:DECLARES]->(o) }
  AND NOT (o:App AND EXISTS { MATCH (d:App {layer: 'declared'}) WHERE d.appId = o.appId OR d.deployedAs = o.appId })
RETURN CASE WHEN o:App THEN 'app' ELSE 'machine' END AS kind,
       coalesce(o.machineId, o.appId) AS nodeKey, o.name AS name, o.kind AS machineKind,
       o.sources AS sources, coalesce(o.joined, true) AS joined, o.lastSeen AS lastSeen
ORDER BY kind, name
```

### Machines the collector could not join

Which observed machines matched no other source's record of them (schema.md
"Joining sources into one machine")? Usually a hostname that differs between
sources. Observed layer only.

```cypher
MATCH (m:Machine {layer: 'observed', joined: false})
OPTIONAL MATCH (m)-[:HAS_INTERFACE]->(i:Interface)
RETURN m.name AS name, m.kind AS kind, m.sources AS sources, m.hostnames AS hostnames,
       collect(CASE WHEN i IS NULL THEN null ELSE {network: i.network, mac: i.mac, ips: i.ips} END) AS interfaces
ORDER BY name
```

### Unknown clients on Home and IoT

Which machines that nothing declares joined the Home or IoT network in the
last 24 hours? Guest is left out. Alert `NetworkMapUnknownClient`, which
clears 24 hours after the client was first seen. **Needs the declared layer**
(it stays silent while there are no declared machines).

```cypher
// :param networks => ['home', 'iot']
// :param sinceMs => datetime().epochMillis - 24 * 3600 * 1000
MATCH (m:Machine {layer: 'observed'})-[:HAS_INTERFACE]->(i:Interface {layer: 'observed'})-[:ON]->(n:Network {layer: 'observed', source: 'unifi'})
WHERE toLower(n.name) IN $networks
  AND m.firstSeen.epochMillis >= $sinceMs
  AND NOT EXISTS { MATCH (:Machine {layer: 'declared'})-[:DECLARES]->(m) }
  AND NOT EXISTS { MATCH ({layer: 'declared'})-[:DECLARES]->(i) }
RETURN m.machineId AS machineId, m.name AS name, m.kind AS kind, m.firstSeen.epochMillis AS firstSeenMs,
       n.name AS network, i.mac AS mac, coalesce(i.ips, []) AS ips, i.hostname AS hostname
ORDER BY firstSeenMs DESC
```

The network names are lowercased. The CronJob sets them with
`UNKNOWN_CLIENT_NETWORKS`.

### Reach drift

Where does the live reach (Tailscale grants, NetBird policies, UniFi zone
policies) differ from the reach the repo declares? Alert
`NetworkMapReachDrift`. **Needs the declared layer.** Two queries: the
declared reach with each end's observed counterparts, and the observed reach
with each end's declared counterparts.

```cypher
MATCH (f:Group {layer: 'declared'})-[r:REACHES {layer: 'declared'}]->(t {layer: 'declared'})
RETURN coalesce(f.system, split(f.groupId, ':')[0]) AS system,
       f.groupId AS fromKey, coalesce(t.groupId, t.networkId, t.appId, t.machineId) AS toKey, r.via AS via, coalesce(r.ports, []) AS ports,
       COLLECT {
         MATCH (f)-[:DECLARES]->(o {layer: 'observed'}) RETURN coalesce(o.groupId, o.networkId, o.appId, o.machineId) AS k
         UNION MATCH (o:Group {layer: 'observed'}) WHERE o.groupId = f.groupId RETURN o.groupId AS k
         UNION MATCH (o:Network {layer: 'observed'}) WHERE o.networkId = f.networkId RETURN o.networkId AS k
         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = f.appId RETURN o.appId AS k
         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = f.deployedAs RETURN o.appId AS k
       } AS fromObserved,
       COLLECT {
         MATCH (t)-[:DECLARES]->(o {layer: 'observed'}) RETURN coalesce(o.groupId, o.networkId, o.appId, o.machineId) AS k
         UNION MATCH (o:Group {layer: 'observed'}) WHERE o.groupId = t.groupId RETURN o.groupId AS k
         UNION MATCH (o:Network {layer: 'observed'}) WHERE o.networkId = t.networkId RETURN o.networkId AS k
         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = t.appId RETURN o.appId AS k
         UNION MATCH (o:App {layer: 'observed'}) WHERE o.appId = t.deployedAs RETURN o.appId AS k
       } AS toObserved
```

```cypher
// :param systems => ['tailscale', 'netbird', 'unifi']
MATCH (f:Group {layer: 'observed'})-[r:REACHES {layer: 'observed'}]->(t {layer: 'observed'})
WHERE r.source IN $systems
RETURN r.source AS system, f.groupId AS fromKey, coalesce(t.groupId, t.networkId, t.appId, t.machineId) AS toKey, r.via AS via, coalesce(r.ports, []) AS ports,
       COLLECT {
         MATCH (o {layer: 'declared'})-[:DECLARES]->(f) RETURN coalesce(o.groupId, o.networkId, o.appId, o.machineId) AS k
         UNION MATCH (o:Group {layer: 'declared'}) WHERE o.groupId = f.groupId RETURN o.groupId AS k
         UNION MATCH (o:Network {layer: 'declared'}) WHERE o.networkId = f.networkId RETURN o.networkId AS k
         UNION MATCH (o:App {layer: 'declared'}) WHERE o.appId = f.appId RETURN o.appId AS k
         UNION MATCH (o:App {layer: 'declared'}) WHERE o.deployedAs = f.appId RETURN o.appId AS k
       } AS fromDeclared,
       COLLECT {
         MATCH (o {layer: 'declared'})-[:DECLARES]->(t) RETURN coalesce(o.groupId, o.networkId, o.appId, o.machineId) AS k
         UNION MATCH (o:Group {layer: 'declared'}) WHERE o.groupId = t.groupId RETURN o.groupId AS k
         UNION MATCH (o:Network {layer: 'declared'}) WHERE o.networkId = t.networkId RETURN o.networkId AS k
         UNION MATCH (o:App {layer: 'declared'}) WHERE o.appId = t.appId RETURN o.appId AS k
         UNION MATCH (o:App {layer: 'declared'}) WHERE o.deployedAs = t.appId RETURN o.appId AS k
       } AS toDeclared
```

An end's counterpart in the other layer is what a `DECLARES` edge joins it to,
or a node of the same label with the same key (an observed App also matches
a declared one's `deployedAs`). `drift.ts` (`classifyReach`)
compares the two per (group, target) pair, with all of a pair's policies
taken together:

- `missing`: declared, and both ends are observed, but no live policy grants it;
- `unexpected`: live, and both ends are declared, but the repo grants nothing between them;
- `ports`: both grant it, on different ports (`*`, `any` and no ports all mean every port).

A pair with an end missing from one layer is machine or app drift, not reach
drift, and is left to the queries above. A system is judged only once the
declared layer has reach for it, so UniFi stays silent until zone policies are
declared. The collector does not read UniFi zone policies yet, so for UniFi
only `missing` can fire.

### Stale sources

Which collector sources have not fully succeeded in the last 6 hours? Their
nodes are as old as that success. Alert `NetworkMapCollectorSourceStale`.
Observed layer only.

```cypher
MATCH (s:CollectorSource)
RETURN s.name AS source, s.status AS status, s.error AS error,
       s.lastRunAt.epochMillis AS lastRunMs, s.lastSuccessAt.epochMillis AS lastSuccessMs
ORDER BY source
```

A source that answered only in part (one Proxmox host down) is `partial` and
does not count as a success. `NetworkMapCollectorNotRunning` covers the
collector as a whole.
