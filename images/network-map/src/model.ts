/**
 * The collector's two vocabularies.
 *
 *   1. OBSERVATIONS: what one source reports, before the machine join. Each
 *      source module turns its API's answers into a `SourceResult`.
 *   2. The GRAPH PLAN: the observed layer as docs/network-map/schema.md
 *      defines it -- labelled nodes with their keys, and typed relationships
 *      between them -- which ./cypher.ts turns into parameterised writes.
 *
 * ./join.ts and ./build.ts sit between the two. Types, two shared ids and
 * an empty-result helper; no I/O.
 */

export type SourceName = "unifi" | "tailscale" | "netbird" | "kubernetes" | "proxmox" | "docker";

/** The schema's Machine `kind`. */
export type MachineKind = "physical" | "vm" | "lxc" | "container" | "client";

/** Well-known Network ids the sources share. */
export const TAILNET_NETWORK_ID = "tailscale:tailnet";
export const NETBIRD_NETWORK_ID = "netbird:netbird";

/**
 * Which network an interface is on. A LAN interface names its site, and
 * ./build.ts places it on the UniFi network whose CIDR holds its address (on
 * the home site), or on that site's `site-lan:<site>` network otherwise.
 */
export type NetworkRef = { networkId: string } | { lan: true; site?: string };

export interface InterfaceObservation {
  network: NetworkRef;
  mac?: string;
  ips: string[];
  /** The NIC name where the source gives one (`eth0`, `tailscale0`). */
  nic?: string;
  hostname?: string;
  online?: boolean;
  firstSeen?: string;
  lastSeen?: string;
  /** Group keys (`tailscale:tag:dockge`, `netbird:gateways`) -> MEMBER_OF. */
  groups?: string[];
  /** Route keys this interface offers -> ADVERTISES {approved}. */
  advertises?: { routeId: string; approved: boolean }[];
  /** A wired UniFi client's switch port -> UPLINK {port}. */
  uplinkPort?: { portId: string; port: number };
  /** A Wi-Fi UniFi client's AP -> ASSOCIATED {essid, band}. */
  associated?: { deviceMac: string; essid?: string; band?: string };
}

export interface MachineObservation {
  source: SourceName;
  /** Unique within the run: `<source>:<native id>`. HOSTED_ON and RUNS refer to observations by it. */
  key: string;
  name: string;
  kind?: MachineKind;
  os?: string;
  status?: string;
  firstSeen?: string;
  lastSeen?: string;
  /** Lowercased first labels, for the last-resort hostname join. */
  hostnames: string[];
  /** Tailnet FQDNs (a Tailscale device's `name`), for the tailnet join. */
  tailnetFqdns?: string[];
  interfaces: InterfaceObservation[];
  /** The observation key of the machine this one runs on -> HOSTED_ON. */
  hostedOn?: string;
  /** UniFi infrastructure: the machine is also a Device. */
  device?: { mac: string; model?: string; type?: "gateway" | "switch" | "ap" | string };
}

/**
 * "This tailnet FQDN belongs to that machine": a Kubernetes egress Service's
 * `tailscale.com/tailnet-fqdn`, or a Docker host's Traefik `*-tailscale` Host
 * rule. Either `observationKey` (exact) or `hostname` (a host machine by name).
 */
export interface TailnetAlias {
  fqdn: string;
  observationKey?: string;
  hostname?: string;
}

/** A node of any non-Machine label, as a source states it. */
export interface PlainNode {
  key: string;
  props: Record<string, Prop>;
  firstSeen?: string;
  lastSeen?: string;
}

/** Where a REACHES edge lands. A CIDR is resolved by ./build.ts to a Machine, a Network or a CIDR network. */
export type ReachTarget = { group: string } | { cidr: string } | { app: string };

export interface ReachObservation {
  from: string;
  to: ReachTarget;
  via: string;
  ports: string[];
}

export interface SourceResult {
  source: SourceName;
  machines: MachineObservation[];
  networks: PlainNode[];
  ports: PlainNode[];
  groups: PlainNode[];
  routes: PlainNode[];
  policies: PlainNode[];
  apps: PlainNode[];
  entryPoints: PlainNode[];
  reaches: ReachObservation[];
  /** Device -> Device UPLINK, by MAC. */
  deviceUplinks: { from: string; to: string; speed?: number; port?: number }[];
  /** App -> EntryPoint, one per name. */
  servedBy: { app: string; entryPoint: string; name: string }[];
  /** Machine observation -> App. */
  runs: { machine: string; app: string }[];
  aliases: TailnetAlias[];
  /** Per-target problems that did not stop the whole source (one Proxmox host down). Any of these makes the source partial. */
  errors: string[];
}

export function emptyResult(source: SourceName): SourceResult {
  return { source, machines: [], networks: [], ports: [], groups: [], routes: [], policies: [], apps: [], entryPoints: [], reaches: [], deviceUplinks: [], servedBy: [], runs: [], aliases: [], errors: [] };
}

// ── The graph plan ───────────────────────────────────────────────────────

/** What a node or relationship property may hold: Neo4j stores primitives and homogeneous lists only. */
export type Prop = string | number | boolean | string[] | number[] | null | undefined;

export type NodeLabel = "Machine" | "Interface" | "Network" | "Device" | "Port" | "Group" | "Route" | "App" | "EntryPoint" | "Policy";

export type RelType = "HAS_INTERFACE" | "ON" | "HOSTED_ON" | "UPLINK" | "ASSOCIATED" | "MEMBER_OF" | "ADVERTISES" | "ROUTES_TO" | "RUNS" | "SERVED_BY" | "REACHES";

export interface PlanNode {
  /** The label the node is MERGEd on. A Device is MERGEd as a Machine and also labelled Device. */
  label: Exclude<NodeLabel, "Device">;
  /** Extra labels (`Device`). */
  extraLabels?: "Device"[];
  key: string;
  source: SourceName;
  props: Record<string, Prop>;
  firstSeen?: string;
  lastSeen?: string;
}

export interface PlanRel {
  type: RelType;
  from: { label: NodeLabel; key: string };
  to: { label: NodeLabel; key: string };
  source: SourceName;
  /** Distinguishes parallel edges of one type between the same pair (REACHES via two policies). */
  mergeKey: string;
  props: Record<string, Prop>;
}

export interface GraphPlan {
  nodes: PlanNode[];
  rels: PlanRel[];
}
