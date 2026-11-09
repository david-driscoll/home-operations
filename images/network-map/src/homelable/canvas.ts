/**
 * One design's canvas as the sync builds it, and the `/canvas/save` body it
 * becomes (Homelable 3.6.0 `CanvasSaveRequest`: `NodeSave` / `EdgeSave` in
 * backend/app/schemas/canvas.py).
 *
 * The save is a FULL replace of one design: nodes and edges it does not list
 * are deleted, the rest are upserted by id. So the builder dedupes by key,
 * drops edges whose ends it never drew, and orders zones before the nodes
 * nested in them (`parent_id` is a foreign key).
 *
 * Two Homelable behaviours the payload works around:
 *
 *   - Device facts (ip, mac, status, check method, properties, label, type)
 *     live on an inventory row SHARED by every design, matched by ip, then
 *     mac. A node that sends `device_id: null` is re-matched on each save,
 *     and one with neither ip nor mac mints a new row every time. So the
 *     save carries the `device_id` each node already has (read from the
 *     canvas first, ./sync.ts), and the projections keep label and type a
 *     function of the Machine alone, so two designs sharing a row agree.
 *   - Zones (`groupRect`) are canvas furniture with no inventory row; their
 *     text goes in `description`.
 */
import type { Drift } from "./graph.ts";
import { homelableId } from "./ids.ts";
import { gridPositions, type Point, packShelves, type Size, zoneColumns, zoneSize } from "./layout.ts";

export const DESIGN_NAMES = ["UniFi", "Tailscale", "NetBird", "Apps"] as const;
export type DesignName = (typeof DESIGN_NAMES)[number];

/** Homelable 3.6.0's node types the projections use (frontend/src/types NodeType). */
export type NodeType =
  | "isp"
  | "router"
  | "firewall"
  | "switch"
  | "server"
  | "proxmox"
  | "vm"
  | "lxc"
  | "nas"
  | "ap"
  | "camera"
  | "printer"
  | "computer"
  | "laptop"
  | "mobile"
  | "docker_host"
  | "docker_container"
  | "generic"
  | "groupRect";
export type EdgeType = "ethernet" | "wifi" | "iot" | "vlan" | "virtual" | "cluster" | "fibre";
export type NodeStatus = "online" | "offline" | "pending" | "unknown";

export interface NodeProperty {
  key: string;
  value: string;
  icon: string | null;
  visible: boolean;
}

/** `NodeSave`, minus the fields the sync never sets (Homelable's defaults apply). */
export interface NodeSave {
  id: string;
  type: NodeType;
  label: string;
  device_id: string | null;
  hostname: string | null;
  ip: string | null;
  mac: string | null;
  os: string | null;
  status: NodeStatus;
  check_method: "ping" | null;
  check_target: string | null;
  description: string | null;
  parent_id: string | null;
  container_mode: boolean;
  custom_colors: Record<string, string | number | boolean> | null;
  properties: NodeProperty[];
  width: number | null;
  height: number | null;
  pos_x: number;
  pos_y: number;
}

export interface EdgeSave {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label: string | null;
  custom_color: string | null;
  line_style: "solid" | "dashed" | "dotted" | null;
  marker_end: "none" | "arrow";
}

export interface CanvasSaveRequest {
  design_id: string;
  viewport: Record<string, unknown>;
  custom_style: Record<string, unknown> | null;
  nodes: NodeSave[];
  edges: EdgeSave[];
}

/** What a projection says about one node. Everything optional falls back to "not set". */
export interface NodeSpec {
  type: NodeType;
  label: string;
  hostname?: string;
  ip?: string;
  mac?: string;
  os?: string;
  status?: NodeStatus;
  /** Infrastructure only (schema.md): Homelable pings this address. Everything else takes its status from the source APIs. */
  ping?: string;
  description?: string;
  properties?: Record<string, string | string[] | number | boolean | undefined>;
  drift?: Drift;
  color?: string;
}

export interface EdgeSpec {
  type: EdgeType;
  label?: string;
  color?: string;
  line?: "solid" | "dashed" | "dotted";
  arrow?: boolean;
}

export interface CanvasNode extends NodeSpec {
  key: string;
  id: string;
  parentKey?: string;
  position: Point;
  size?: Size;
}

export interface CanvasEdge extends EdgeSpec {
  key: string;
  id: string;
  sourceKey: string;
  targetKey: string;
}

export interface Canvas {
  design: DesignName;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** Drift colours (GLOSSARY.md "Drift"): amber for observed-but-undeclared, red for declared-but-unobserved. */
export const DRIFT_COLORS: Record<Drift, string> = { undeclared: "#f59e0b", unobserved: "#ef4444" };
export const DRIFT_TEXT: Record<Drift, string> = { undeclared: "observed, not declared", unobserved: "declared, not observed" };
/** An unapproved route or a disabled thing: drawn, but greyed. */
export const MUTED_COLOR = "#94a3b8";

/** A zone: a group rectangle and the nodes inside it, laid out as a grid. */
export interface ZoneSpec {
  key: string;
  label: string;
  description?: string;
  drift?: Drift;
  members: { key: string; spec: NodeSpec }[];
  columns?: number;
}

export interface CanvasBuilder {
  readonly design: DesignName;
  has(key: string): boolean;
  node(key: string, spec: NodeSpec, position: Point, parentKey?: string): CanvasNode;
  edge(sourceKey: string, targetKey: string, spec: EdgeSpec, discriminator?: string): void;
  /** Lays the zones out on shelves from `origin`; returns the height used. */
  zones(zones: ZoneSpec[], origin: Point, maxWidth?: number): number;
  build(): Canvas;
}

export function canvasBuilder(design: DesignName): CanvasBuilder {
  const nodes = new Map<string, CanvasNode>();
  const edges = new Map<string, CanvasEdge>();
  const builder: CanvasBuilder = {
    design,
    has: key => nodes.has(key),
    node(key, spec, position, parentKey) {
      const existing = nodes.get(key);
      if (existing) return existing;
      const node: CanvasNode = { ...spec, key, id: homelableId(design, key), parentKey, position };
      nodes.set(key, node);
      return node;
    },
    edge(sourceKey, targetKey, spec, discriminator = "") {
      const key = `edge:${spec.type}:${sourceKey}>${targetKey}${discriminator ? `:${discriminator}` : ""}`;
      if (sourceKey === targetKey || edges.has(key)) return;
      edges.set(key, { ...spec, key, id: homelableId(design, key), sourceKey, targetKey });
    },
    zones(zones, origin, maxWidth) {
      const columns = zones.map(z => z.columns ?? zoneColumns(z.members.length));
      const sizes = zones.map((z, i) => zoneSize(z.members.length, columns[i]));
      const { positions, height } = packShelves(sizes, origin, maxWidth);
      zones.forEach((zone, i) => {
        const z = builder.node(zone.key, { type: "groupRect", label: zone.label, description: zone.description, drift: zone.drift }, positions[i]);
        z.size = sizes[i];
        const cells = gridPositions(zone.members.length, columns[i]);
        zone.members.forEach((m, j) => builder.node(m.key, m.spec, cells[j], zone.key));
      });
      return height;
    },
    build() {
      const all = [...nodes.values()];
      // Parents first: a child's parent_id must already exist when it is upserted.
      const ordered = [...all.filter(n => !n.parentKey), ...all.filter(n => n.parentKey)];
      return { design, nodes: ordered, edges: [...edges.values()].filter(e => nodes.has(e.sourceKey) && nodes.has(e.targetKey)) };
    },
  };
  return builder;
}

/**
 * The ownership marker on every node the sync draws, and so on the inventory
 * row behind it (properties are a device fact, replaced by each save). The
 * clean-up in ./sync.ts deletes only rows carrying exactly this key and value.
 */
export const OWNER_PROPERTY = { key: "managed-by", value: "network-map" } as const;

/** Whether an inventory row carries the sync's ownership marker. */
export const isOwnedRow = (properties: readonly { key?: unknown; value?: unknown }[] | null | undefined): boolean => (properties ?? []).some(p => p?.key === OWNER_PROPERTY.key && p?.value === OWNER_PROPERTY.value);

/** A spec's properties as Homelable's list, in key order, with drift first. */
export function nodeProperties(spec: NodeSpec): NodeProperty[] {
  const out: NodeProperty[] = [];
  if (spec.drift) out.push({ key: "drift", value: DRIFT_TEXT[spec.drift], icon: null, visible: true });
  for (const [key, raw] of Object.entries(spec.properties ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (raw === undefined || raw === "" || key === OWNER_PROPERTY.key || (Array.isArray(raw) && raw.length === 0)) continue;
    out.push({ key, value: Array.isArray(raw) ? raw.join(", ") : String(raw), icon: null, visible: false });
  }
  // The sync owns this node and the inventory row it lands on: hand edits are
  // replaced within the hour, and the clean-up deletes such a row once no
  // design draws it. Always last.
  out.push({ key: OWNER_PROPERTY.key, value: OWNER_PROPERTY.value, icon: null, visible: false });
  return out;
}

function customColors(node: CanvasNode): NodeSave["custom_colors"] {
  const colors: Record<string, string | number | boolean> = {};
  const border = node.drift ? DRIFT_COLORS[node.drift] : node.color;
  if (border) colors.border = border;
  if (node.type === "groupRect") {
    if (node.size) {
      colors.width = node.size.width;
      colors.height = node.size.height;
    }
    if (node.drift) colors.border_style = "dashed";
    colors.label_position = "inside";
  }
  return Object.keys(colors).length > 0 ? colors : null;
}

export interface ExistingCanvas {
  /** Node id -> its inventory row, from the design's current canvas. */
  deviceIds: Map<string, string>;
  viewport?: Record<string, unknown>;
  customStyle?: Record<string, unknown> | null;
}

export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.5 };

/** The `/canvas/save` body for one design. Keeps the viewport and style someone last left it at. */
export function savePayload(canvas: Canvas, designId: string, existing: ExistingCanvas = { deviceIds: new Map() }): CanvasSaveRequest {
  const idOf = new Map(canvas.nodes.map(n => [n.key, n.id]));
  const viewport = existing.viewport && Object.keys(existing.viewport).length > 0 ? existing.viewport : DEFAULT_VIEWPORT;
  return {
    design_id: designId,
    viewport,
    custom_style: existing.customStyle ?? null,
    nodes: canvas.nodes.map(n => {
      const furniture = n.type === "groupRect";
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        device_id: furniture ? null : (existing.deviceIds.get(n.id) ?? null),
        hostname: n.hostname ?? null,
        ip: n.ip ?? null,
        mac: n.mac ?? null,
        os: n.os ?? null,
        status: n.status ?? "unknown",
        check_method: n.ping ? "ping" : null,
        check_target: n.ping ?? null,
        description: furniture ? [n.description, n.drift && `drift: ${DRIFT_TEXT[n.drift]}`].filter(Boolean).join(" · ") || null : null,
        parent_id: n.parentKey ? (idOf.get(n.parentKey) ?? null) : null,
        container_mode: false,
        custom_colors: customColors(n),
        properties: furniture ? [] : nodeProperties(n),
        width: n.size?.width ?? null,
        height: n.size?.height ?? null,
        pos_x: n.position.x,
        pos_y: n.position.y,
      };
    }),
    edges: canvas.edges.map(e => ({
      id: e.id,
      source: idOf.get(e.sourceKey) as string,
      target: idOf.get(e.targetKey) as string,
      type: e.type,
      label: e.label ?? null,
      custom_color: e.color ?? null,
      line_style: e.line ?? null,
      marker_end: e.arrow ? "arrow" : "none",
    })),
  };
}
