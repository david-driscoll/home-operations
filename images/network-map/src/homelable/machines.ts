/**
 * How a Machine and its Interfaces read on a Homelable canvas, shared by all
 * four projections.
 *
 * Label and node type depend on the Machine ALONE, never on the design
 * drawing it: Homelable keeps both on an inventory row shared by every node
 * with the same ip or mac (./canvas.ts), so a design-specific label would
 * flip that row every hour.
 */
import { ipInCidr } from "../normalize.ts";
import type { NodeSpec, NodeStatus, NodeType } from "./canvas.ts";
import { type MapGraph, type MapNode, preferredIp, str, strs } from "./graph.ts";

const observations = (m: MapNode) => strs(m.props.observations);
const hasObservation = (m: MapNode, prefix: string) => observations(m).some(o => o.startsWith(prefix));

export const isDevice = (m: MapNode) => m.labels.includes("Device");
export const isProxmoxHost = (m: MapNode) => hasObservation(m, "proxmox:node:");
export const isDockgeHost = (m: MapNode) => hasObservation(m, "docker:host:");
export const isKubernetesNode = (m: MapNode) => hasObservation(m, "kubernetes:node:");

/** Infrastructure, which Homelable pings (schema.md): the UniFi gateway, switches and APs, and the Proxmox and Dockge hosts. */
export const isInfrastructure = (m: MapNode) => isDevice(m) || isProxmoxHost(m) || isDockgeHost(m);

export const machineLabel = (m: MapNode, g: MapGraph) => str(m.props.name) ?? g.key(m);

const DEVICE_TYPES: Record<string, NodeType> = { gateway: "router", switch: "switch", ap: "ap" };

export function machineType(m: MapNode): NodeType {
  if (isDevice(m)) return DEVICE_TYPES[str(m.props.type) ?? ""] ?? "generic";
  if (isProxmoxHost(m)) return "proxmox";
  if (isDockgeHost(m)) return "docker_host";
  if (isKubernetesNode(m)) return "server";
  switch (str(m.props.kind)) {
    case "vm":
      return "vm";
    case "lxc":
      return "lxc";
    case "container":
      return "docker_container";
    default:
      break;
  }
  const os = str(m.props.os)?.toLowerCase() ?? "";
  if (/ios|ipados|android|tvos/.test(os)) return "mobile";
  if (/mac|darwin|windows/.test(os)) return "computer";
  if (/linux/.test(os)) return "server";
  return "generic";
}

const ONLINE = new Set(["online", "ready", "running"]);
const OFFLINE = new Set(["offline", "not-ready", "exited", "stopped", "dead"]);

export function statusOf(online: unknown, status?: unknown): NodeStatus {
  if (online === true) return "online";
  if (online === false) return "offline";
  const s = typeof status === "string" ? status.toLowerCase() : "";
  if (ONLINE.has(s)) return "online";
  if (OFFLINE.has(s)) return "offline";
  return "unknown";
}

export const interfacesOf = (g: MapGraph, m: MapNode) => g.out(m.id, "HAS_INTERFACE").map(h => h.node);
export const machineOf = (g: MapGraph, iface: MapNode) => g.in(iface.id, "HAS_INTERFACE")[0]?.node;
export const networkOf = (g: MapGraph, iface: MapNode) => g.out(iface.id, "ON")[0]?.node;

/** The machine's address on the home LAN (a UniFi network), which a pod can reach to ping. */
export function homeLanIp(g: MapGraph, m: MapNode): string | undefined {
  for (const iface of interfacesOf(g, m)) {
    const net = networkOf(g, iface);
    if (net && g.key(net).startsWith("unifi:")) {
      const ip = preferredIp(strs(iface.props.ips));
      if (ip) return ip;
    }
  }
  return undefined;
}

/** The ping target for infrastructure on the home LAN; undefined for everything else. */
export const pingTarget = (g: MapGraph, m: MapNode) => (isInfrastructure(m) ? homeLanIp(g, m) : undefined);

/**
 * One Interface as a node: the machine's label and type, this interface's
 * address on the design's network, and the drift of the machine (which is
 * what the declared layer declares).
 */
export function interfaceSpec(g: MapGraph, iface: MapNode, extra: Partial<NodeSpec> = {}): NodeSpec {
  const m = machineOf(g, iface);
  const ips = strs(iface.props.ips);
  const base: NodeSpec = {
    type: m ? machineType(m) : "generic",
    label: m ? machineLabel(m, g) : (str(iface.props.hostname) ?? g.key(iface)),
    hostname: str(iface.props.hostname),
    ip: preferredIp(ips),
    mac: str(iface.props.mac),
    os: m ? str(m.props.os) : undefined,
    status: statusOf(iface.props.online, m?.props.status),
    ping: m ? pingTarget(g, m) : undefined,
    drift: m ? g.drift(m.id) : undefined,
    properties: {
      addresses: ips.length > 1 ? ips : undefined,
      sources: m ? strs(m.props.sources) : strs(iface.props.sources),
      kind: m ? str(m.props.kind) : undefined,
      joined: m?.props.joined === false ? "no (seen by one source only)" : undefined,
      "declared by": m ? g.declaredBy(m.id) : undefined,
      model: m ? str(m.props.model) : undefined,
      "last seen": str(iface.props.lastSeen),
    },
  };
  return { ...base, ...extra, properties: { ...base.properties, ...extra.properties } };
}

/** A declared Machine with nothing observed behind it, for a design's drift zone. */
export function declaredMachineSpec(g: MapGraph, m: MapNode): NodeSpec {
  return {
    type: machineType(m),
    label: machineLabel(m, g),
    hostname: str(m.props.hostname),
    status: "unknown",
    drift: "unobserved",
    properties: { kind: str(m.props.kind), "declared addresses": strs(m.props.ips), "declared MACs": strs(m.props.macs), "declared as": str(m.props.declaredAs) },
  };
}

/**
 * Declared Machines nothing observed stands for, that `belongs` places on a
 * design. The declared layer gives a Machine no Interfaces
 * (declared/machines.ts): what places it is its declared `ips` and the
 * groups it is MEMBER_OF.
 */
export function declaredMachinesWhere(g: MapGraph, belongs: (m: MapNode, groups: MapNode[]) => boolean): MapNode[] {
  return g.find("Machine", "declared").filter(
    m =>
      g.drift(m.id) === "unobserved" &&
      belongs(
        m,
        g.out(m.id, "MEMBER_OF").map(h => h.node),
      ),
  );
}

/** Whether any of a declared Machine's addresses is inside one of `cidrs`. */
export const declaredIpsIn = (m: MapNode, cidrs: string[]) => strs(m.props.ips).some(ip => cidrs.some(c => ipInCidr(ip, c)));
