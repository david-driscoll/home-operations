/**
 * The UniFi design (docs/network-map/schema.md "Homelable projection"): the
 * gateway, switches and APs as a tree along their UPLINKs, and below it one
 * zone per UniFi network (VLAN) holding the clients on it. A wired client is
 * joined to its switch (the Port it UPLINKs to), a Wi-Fi client to its AP.
 *
 * Infrastructure (the UniFi devices, and the Proxmox and Dockge hosts among
 * the clients) is pinged by Homelable at its LAN address; every other client
 * takes its status from UniFi.
 */
import { type Canvas, canvasBuilder, type NodeSpec, type ZoneSpec } from "./canvas.ts";
import { type MapGraph, type MapNode, num, preferredIp, str, strs } from "./graph.ts";
import { NODE_HEIGHT, treeLayout, ZONE_GAP } from "./layout.ts";
import { declaredIpsIn, declaredMachineSpec, declaredMachinesWhere, interfaceSpec, interfacesOf, isDevice, machineLabel, machineOf, machineType, statusOf } from "./machines.ts";

const DEVICE_RANK: Record<string, number> = { gateway: 0, switch: 1, ap: 2 };
const isUnifiNetwork = (g: MapGraph, n: MapNode) => g.key(n).startsWith("unifi:");

/** `10000` (Mbps) -> `10 Gbps`. */
export function speedLabel(mbps: number | undefined): string | undefined {
  if (!mbps) return undefined;
  return mbps >= 1000 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`;
}

export function networkLabel(net: MapNode): string {
  const vlan = num(net.props.vlan);
  return [str(net.props.name) ?? "network", vlan !== undefined ? `VLAN ${vlan}` : undefined, str(net.props.cidr)].filter(Boolean).join(" · ");
}

export function projectUnifi(g: MapGraph): Canvas {
  const c = canvasBuilder("UniFi");
  const devices = g.find("Device");
  const deviceByMac = new Map(devices.map(d => [str(d.props.mac), d]));
  const deviceKey = (d: MapNode) => `device:${str(d.props.mac) ?? g.key(d)}`;
  const uplinkOf = (d: MapNode) => g.out(d.id, "UPLINK").find(h => isDevice(h.node));
  const rank = (d: MapNode) => DEVICE_RANK[str(d.props.type) ?? ""] ?? 3;
  const order = (a: MapNode, b: MapNode) => rank(a) - rank(b) || machineLabel(a, g).localeCompare(machineLabel(b, g)) || g.key(a).localeCompare(g.key(b));

  // ── The infrastructure tree ──
  const childrenOf = new Map<string, MapNode[]>();
  const roots: MapNode[] = [];
  for (const d of devices) {
    const up = uplinkOf(d);
    if (up) childrenOf.set(up.node.id, [...(childrenOf.get(up.node.id) ?? []), d]);
    else roots.push(d);
  }
  roots.sort(order);
  for (const list of childrenOf.values()) list.sort(order);
  const tree = treeLayout(
    roots.map(d => d.id),
    id => (childrenOf.get(id) ?? []).map(d => d.id),
  );
  for (const d of devices) {
    const lanIface = interfacesOf(g, d)[0];
    const ip = lanIface ? preferredIp(strs(lanIface.props.ips)) : undefined;
    const spec: NodeSpec = {
      type: machineType(d),
      label: machineLabel(d, g),
      ip,
      mac: str(d.props.mac),
      status: statusOf(undefined, d.props.status),
      ping: ip,
      drift: g.drift(d.id),
      properties: { model: str(d.props.model), role: str(d.props.type) },
    };
    c.node(deviceKey(d), spec, tree.positions.get(d.id) ?? { x: 0, y: 0 });
  }
  for (const d of devices) {
    const up = uplinkOf(d);
    if (!up) continue;
    const port = num(up.rel.props.port);
    c.edge(deviceKey(up.node), deviceKey(d), { type: "ethernet", label: [port !== undefined ? `port ${port}` : undefined, speedLabel(num(up.rel.props.speed))].filter(Boolean).join(" · ") || undefined });
  }

  // ── One zone per UniFi network, its clients inside ──
  const networks = g.find("Network").filter(n => isUnifiNetwork(g, n));
  networks.sort((a, b) => (num(a.props.vlan) ?? 0) - (num(b.props.vlan) ?? 0) || networkLabel(a).localeCompare(networkLabel(b)) || g.key(a).localeCompare(g.key(b)));
  const zones: ZoneSpec[] = [];
  const clientIfaces: MapNode[] = [];
  for (const net of networks) {
    const ifaces = g
      .in(net.id, "ON")
      .map(h => h.node)
      .filter(i => {
        const m = machineOf(g, i);
        return !m || !isDevice(m);
      });
    const labelled = ifaces.map(i => ({ i, label: interfaceSpec(g, i).label }));
    labelled.sort((a, b) => a.label.localeCompare(b.label) || g.key(a.i).localeCompare(g.key(b.i)));
    clientIfaces.push(...labelled.map(x => x.i));
    zones.push({
      key: `zone:${g.key(net)}`,
      label: networkLabel(net),
      description: str(net.props.purpose) ? `UniFi network, purpose ${str(net.props.purpose)}` : "UniFi network",
      drift: g.drift(net.id),
      members: labelled.map(({ i }) => ({ key: `iface:${g.key(i)}`, spec: interfaceSpec(g, i, { properties: { network: str(net.props.name) } }) })),
    });
  }

  // Declared, not observed: UniFi networks the zone map names that UniFi does
  // not report (declared/zones.ts, `system: unifi`, joined by name), and
  // machines whose declared address is on one of UniFi's networks.
  for (const net of g.find("Network", "declared").filter(n => g.drift(n.id) === "unobserved" && (str(n.props.system) === "unifi" || str(n.props.kind) === "vlan"))) {
    zones.push({ key: `zone:declared:${g.key(net)}`, label: networkLabel(net), description: "Declared UniFi network", drift: "unobserved", members: [] });
  }
  const unifiCidrs = networks.map(n => str(n.props.cidr)).filter((c): c is string => !!c);
  const ghosts = declaredMachinesWhere(g, m => declaredIpsIn(m, unifiCidrs));
  if (ghosts.length > 0) {
    zones.push({
      key: "zone:declared-machines",
      label: "Declared, not observed",
      description: "Machines the repo puts on a UniFi network that UniFi does not report",
      drift: "unobserved",
      members: ghosts.map(m => ({ key: `declared:${g.key(m)}`, spec: declaredMachineSpec(g, m) })),
    });
  }

  const top = tree.size.height > 0 ? tree.size.height + ZONE_GAP * 2 : 0;
  c.zones(zones, { x: 0, y: top + NODE_HEIGHT / 2 });

  // Wired clients to their switch, Wi-Fi clients to their AP.
  for (const iface of clientIfaces) {
    const key = `iface:${g.key(iface)}`;
    for (const up of g.out(iface.id, "UPLINK")) {
      const sw = deviceByMac.get(str(up.node.props.deviceMac));
      const port = num(up.rel.props.port) ?? num(up.node.props.idx);
      if (sw) c.edge(deviceKey(sw), key, { type: "ethernet", label: port !== undefined ? `port ${port}` : undefined });
    }
    for (const assoc of g.out(iface.id, "ASSOCIATED")) {
      c.edge(deviceKey(assoc.node), key, { type: "wifi", label: [str(assoc.rel.props.essid), str(assoc.rel.props.band)].filter(Boolean).join(" · ") || undefined });
    }
  }
  return c.build();
}
