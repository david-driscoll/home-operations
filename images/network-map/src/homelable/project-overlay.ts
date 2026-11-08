/**
 * The two overlay designs, Tailscale and NetBird (docs/network-map/schema.md
 * "Homelable projection"). Both are the same picture of a different network:
 *
 *   - every Interface on the overlay, in one zone per group it belongs to
 *     (a Tailscale tag; a NetBird group). Homelable nests a node in one
 *     parent only, so a device in several groups sits in the first, by the
 *     design's order, and lists the rest as a property;
 *   - the routers first, in their own zone: Tailscale's subnet routers and
 *     exit nodes, NetBird's gateways and in-cluster routers;
 *   - what they route to. Tailscale draws each route as an EDGE from its
 *     router to the network it reaches (or to "Internet" for an exit);
 *     NetBird draws its networks as zones of resources, each joined to the
 *     peers that route it. Either way a route not approved/enabled is greyed.
 *
 * Overlay links are `virtual` edges, dashed (Homelable has no VPN type).
 * Pinged: infrastructure with a home LAN address, plus NetBird's gateways at
 * theirs (a pod has no route into either overlay). The rest takes its status
 * from the control plane.
 */
import { type Canvas, canvasBuilder, type DesignName, MUTED_COLOR, type NodeSpec, type ZoneSpec } from "./canvas.ts";
import { type MapGraph, type MapNode, str } from "./graph.ts";
import { ZONE_GAP } from "./layout.ts";
import { declaredMachineSpec, declaredMachinesOn, homeLanIp, interfaceSpec, machineOf } from "./machines.ts";
import { networkLabel } from "./project-unifi.ts";

interface OverlayOptions {
  design: DesignName;
  /** The Network `kind` this design draws. */
  networkKind: "tailnet" | "netbird";
  /** The Group and Route `system`. */
  system: "tailscale" | "netbird";
  /** Groups that place nothing (NetBird's `All`). */
  ignoreGroups: Set<string>;
  /** Groups that are routers by role, as zone label, in order. Members land there even when they advertise nothing. */
  routerGroups: { name: string; label: string; ping?: boolean }[];
  /** The zone for routers no router group names. */
  routersLabel: string;
  /** The zone for devices in no group. */
  ungroupedLabel: string;
  groupZoneLabel: (name: string) => string;
  /** How routes are drawn. */
  routes: "edges" | "zones";
}

interface Peer {
  iface: MapNode;
  machine?: MapNode;
  groups: string[];
  advertises: { route: MapNode; approved: boolean }[];
}

function projectOverlay(g: MapGraph, o: OverlayOptions): Canvas {
  const c = canvasBuilder(o.design);
  const overlays = g.find("Network").filter(n => str(n.props.kind) === o.networkKind);
  const groupName = (n: MapNode) => str(n.props.name) ?? g.key(n).replace(`${o.system}:`, "");

  const peers: Peer[] = overlays
    .flatMap(net => g.in(net.id, "ON").map(h => h.node))
    .map(iface => ({
      iface,
      machine: machineOf(g, iface),
      groups: g
        .out(iface.id, "MEMBER_OF")
        .map(h => h.node)
        .filter(n => str(n.props.system) === o.system)
        .map(groupName)
        .filter(name => !o.ignoreGroups.has(name))
        .sort(),
      advertises: g.out(iface.id, "ADVERTISES").map(h => ({ route: h.node, approved: h.rel.props.approved !== false })),
    }));

  // Zone membership: a router group first, then any router, then the first group.
  const routerGroupNames = o.routerGroups.map(r => r.name);
  const zoneOf = (p: Peer): string => routerGroupNames.find(n => p.groups.includes(n)) ?? (p.advertises.length > 0 ? "routers" : (p.groups[0] ?? "ungrouped"));
  const pingOf = (p: Peer): string | undefined => {
    const byRole = o.routerGroups.find(r => r.ping && p.groups.includes(r.name));
    if (byRole && p.machine) return homeLanIp(g, p.machine);
    return undefined;
  };
  const peerKey = (p: Peer) => `iface:${g.key(p.iface)}`;
  const peerSpec = (p: Peer): NodeSpec => {
    const base = interfaceSpec(g, p.iface);
    return {
      ...base,
      ping: base.ping ?? pingOf(p),
      properties: {
        ...base.properties,
        groups: p.groups,
        routes: p.advertises.map(a => `${str(a.route.props.cidr)}${a.approved ? "" : " (not approved)"}`).sort(),
        "LAN address": p.machine ? homeLanIp(g, p.machine) : undefined,
      },
    };
  };

  const zoneKeys = [...routerGroupNames, "routers"];
  const byZone = new Map<string, Peer[]>();
  for (const p of peers) byZone.set(zoneOf(p), [...(byZone.get(zoneOf(p)) ?? []), p]);
  const groupZoneNames = [...byZone.keys()].filter(k => !zoneKeys.includes(k) && k !== "ungrouped").sort();
  const sortPeers = (list: Peer[]) => list.map(p => ({ p, spec: peerSpec(p) })).sort((a, b) => a.spec.label.localeCompare(b.spec.label) || g.key(a.p.iface).localeCompare(g.key(b.p.iface)));
  const zoneFor = (name: string, label: string, description?: string): ZoneSpec | undefined => {
    const list = byZone.get(name);
    if (!list?.length) return undefined;
    return { key: `zone:${name}`, label, description, members: sortPeers(list).map(({ p, spec }) => ({ key: peerKey(p), spec })) };
  };

  const routerZones = [...o.routerGroups.map(r => zoneFor(r.name, r.label, `${o.system} group ${r.name}`)), zoneFor("routers", o.routersLabel)].filter((z): z is ZoneSpec => !!z);

  // ── What the routers route to ──
  const routeZones: ZoneSpec[] = [];
  const routeEdges: { from: string; to: string; label: string; approved: boolean }[] = [];
  if (o.routes === "edges") {
    const targets = new Map<string, { key: string; spec: NodeSpec }>();
    for (const p of peers) {
      for (const a of p.advertises) {
        const cidr = str(a.route.props.cidr) ?? g.key(a.route);
        const nets = a.route.props.exit === true ? [] : g.out(a.route.id, "ROUTES_TO").map(h => h.node);
        const ends: { key: string; spec: NodeSpec }[] =
          a.route.props.exit === true
            ? [{ key: "internet", spec: { type: "isp", label: "Internet (exit node)", status: "unknown" } }]
            : nets.length > 0
              ? nets.map(n => ({ key: `net:${g.key(n)}`, spec: { type: "generic", label: networkLabel(n), status: "unknown", drift: g.drift(n.id), properties: { cidr: str(n.props.cidr), kind: str(n.props.kind) } } }))
              : [{ key: `cidr:${cidr}`, spec: { type: "generic", label: cidr, status: "unknown", drift: g.drift(a.route.id), properties: { cidr } } }];
        for (const end of ends) {
          if (!targets.has(end.key)) targets.set(end.key, end);
          routeEdges.push({ from: peerKey(p), to: end.key, label: cidr, approved: a.approved });
        }
      }
    }
    for (const r of g.find("Route", "declared").filter(r => str(r.props.system) === o.system && g.drift(r.id) === "unobserved")) {
      const cidr = str(r.props.cidr) ?? g.key(r);
      targets.set(`declared:${g.key(r)}`, { key: `declared:${g.key(r)}`, spec: { type: "generic", label: cidr, status: "unknown", drift: "unobserved", properties: { cidr } } });
    }
    const list = [...targets.values()].sort((a, b) => (a.key === "internet" ? -1 : b.key === "internet" ? 1 : a.spec.label.localeCompare(b.spec.label) || a.key.localeCompare(b.key)));
    if (list.length > 0) routeZones.push({ key: "zone:routed", label: "Routed networks", description: "Where the subnet routers and exit nodes lead", members: list });
  } else {
    // One zone per network (a NetBird Network's resources, or its legacy routes).
    const routes = [...g.find("Route").filter(r => str(r.props.system) === o.system), ...g.find("Route", "declared").filter(r => str(r.props.system) === o.system && g.drift(r.id) === "unobserved")];
    const byNetwork = new Map<string, MapNode[]>();
    for (const r of routes) {
      const name = str(r.props.network) ?? "Routes";
      byNetwork.set(name, [...(byNetwork.get(name) ?? []), r]);
    }
    for (const name of [...byNetwork.keys()].sort()) {
      const members = (byNetwork.get(name) ?? []).map(r => {
        const cidr = str(r.props.cidr) ?? g.key(r);
        const label = str(r.props.name) && str(r.props.name) !== cidr ? `${str(r.props.name)} · ${cidr}` : cidr;
        return {
          key: `route:${r.layer}:${g.key(r)}`,
          spec: { type: r.props.exit === true ? "isp" : "generic", label, status: "unknown", drift: g.drift(r.id), properties: { cidr, description: str(r.props.description) } } satisfies NodeSpec,
        };
      });
      members.sort((a, b) => a.spec.label.localeCompare(b.spec.label) || a.key.localeCompare(b.key));
      routeZones.push({ key: `zone:network:${name}`, label: name === "Routes" ? "Routes" : `Network: ${name}`, description: `${o.system} network`, members });
    }
    for (const p of peers) {
      for (const a of p.advertises) routeEdges.push({ from: peerKey(p), to: `route:observed:${g.key(a.route)}`, label: "", approved: a.approved });
    }
  }

  const groupZones = groupZoneNames.map(name => zoneFor(name, o.groupZoneLabel(name), `${o.system} group ${name}`)).filter((z): z is ZoneSpec => !!z);
  const ungrouped = zoneFor("ungrouped", o.ungroupedLabel);
  if (ungrouped) groupZones.push(ungrouped);

  // Declared, not observed: groups as empty zones, machines in one zone.
  for (const grp of g.find("Group", "declared").filter(n => str(n.props.system) === o.system && g.drift(n.id) === "unobserved")) {
    const name = groupName(grp);
    if (o.ignoreGroups.has(name)) continue;
    groupZones.push({ key: `zone:declared:${g.key(grp)}`, label: o.groupZoneLabel(name), description: `${o.system} group ${name}`, drift: "unobserved", members: [] });
  }
  const ghosts = declaredMachinesOn(g, net => str(net.props.kind) === o.networkKind);
  if (ghosts.length > 0) {
    groupZones.push({
      key: "zone:declared-machines",
      label: "Declared, not observed",
      description: `Machines the repo puts on ${o.system} that it does not report`,
      drift: "unobserved",
      members: ghosts.map(m => ({ key: `declared:${g.key(m)}`, spec: declaredMachineSpec(g, m) })),
    });
  }

  let y = 0;
  const first = [...routerZones, ...routeZones];
  if (first.length > 0) y += c.zones(first, { x: 0, y }) + ZONE_GAP * 2;
  c.zones(groupZones, { x: 0, y });

  for (const e of routeEdges) {
    c.edge(
      e.from,
      e.to,
      { type: "virtual", line: "dashed", label: e.label ? `${e.label}${e.approved ? "" : " (not approved)"}` : e.approved ? undefined : "not enabled", color: e.approved ? undefined : MUTED_COLOR },
      e.label,
    );
  }
  return c.build();
}

export function projectTailscale(g: MapGraph): Canvas {
  return projectOverlay(g, {
    design: "Tailscale",
    networkKind: "tailnet",
    system: "tailscale",
    ignoreGroups: new Set(),
    routerGroups: [],
    routersLabel: "Subnet routers and exit nodes",
    ungroupedLabel: "Untagged (user devices)",
    groupZoneLabel: name => name,
    routes: "edges",
  });
}

export function projectNetbird(g: MapGraph): Canvas {
  return projectOverlay(g, {
    design: "NetBird",
    networkKind: "netbird",
    system: "netbird",
    ignoreGroups: new Set(["All"]),
    // stacks/netbird/index.ts: `gateways` holds the Dockge sites' gateway
    // containers, `k8s-routers` the in-cluster routing peers.
    routerGroups: [
      { name: "gateways", label: "Gateways", ping: true },
      { name: "k8s-routers", label: "In-cluster routers" },
    ],
    routersLabel: "Other routing peers",
    ungroupedLabel: "In no group",
    groupZoneLabel: name => `group ${name}`,
    routes: "zones",
  });
}
